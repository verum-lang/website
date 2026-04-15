---
sidebar_position: 5
title: Write a parser from scratch
description: Combinator-style parsing with `&Text` slices and refinement-typed results.
---

# Write a parser from scratch

**Time: 45 minutes. Prerequisites: [Language tour](/docs/getting-started/tour),
[Patterns](/docs/language/patterns).**

We'll build a parser for a tiny expression language:

```
expr   = term { ('+' | '-') term }
term   = factor { ('*' | '/') factor }
factor = number | '(' expr ')'
number = integer | float
```

Along the way we'll:

- Represent the parser as a function type `fn(&Text, Int) -> Maybe<(T, Int)>`.
- Build combinators (`map`, `alt`, `seq`, `many`, `opt`).
- Use refinement types on the cursor so "position inside input" is
  always sound.
- Add comprehensive tests and a small REPL.

## 1. The types

`src/parser/types.vr`:

```verum
/// A parser consumes a slice starting at `pos` and either returns
/// `Some((value, new_pos))` or `None` (no match at this position).
pub type Parser<T> = fn(input: &Text, pos: Int) -> Maybe<(T, Int)>;

/// Our AST.
pub type Expr is
    | Num(Float)
    | Add  { left: Heap<Expr>, right: Heap<Expr> }
    | Sub  { left: Heap<Expr>, right: Heap<Expr> }
    | Mul  { left: Heap<Expr>, right: Heap<Expr> }
    | Div  { left: Heap<Expr>, right: Heap<Expr> };

/// Parse errors carry position + message.
pub type ParseError is { pos: Int, expected: Text };
```

## 2. Atomic combinators

`src/parser/atoms.vr`:

```verum
use .super.types.*;

/// Match a single character exactly.
pub fn char(c: Char) -> Parser<Char> {
    |input, pos| {
        if pos < input.len() && input.chars().nth(pos).unwrap() == c {
            Maybe.Some((c, pos + 1))
        } else {
            Maybe.None
        }
    }
}

/// Match any character satisfying the predicate.
pub fn satisfy(pred: fn(Char) -> Bool) -> Parser<Char> {
    |input, pos| {
        if pos < input.len() {
            let c = input.chars().nth(pos).unwrap();
            if pred(c) { Maybe.Some((c, pos + 1)) } else { Maybe.None }
        } else { Maybe.None }
    }
}

/// Match a whitespace run (possibly empty).
pub fn whitespace() -> Parser<()> {
    |input, pos| {
        let mut p = pos;
        while p < input.len() && input.chars().nth(p).unwrap().is_whitespace() {
            p += 1;
        }
        Maybe.Some(((), p))
    }
}

/// Match a specific keyword (non-empty exact match).
pub fn keyword(k: &Text) -> Parser<Text> {
    let k = k.to_string();
    move |input, pos| {
        let end = pos + k.len();
        if end <= input.len() && &input[pos..end] == &k {
            Maybe.Some((k.clone(), end))
        } else {
            Maybe.None
        }
    }
}
```

### Number parser

```verum
pub fn number() -> Parser<Float> {
    |input, pos| {
        let start = pos;
        let mut p = pos;

        // Optional sign
        if p < input.len() {
            let c = input.chars().nth(p).unwrap();
            if c == '-' || c == '+' { p += 1; }
        }

        // Digits before decimal point
        let int_start = p;
        while p < input.len() && input.chars().nth(p).unwrap().is_ascii_digit() {
            p += 1;
        }
        if p == int_start { return Maybe.None; }

        // Optional decimal point + more digits
        if p < input.len() && input.chars().nth(p).unwrap() == '.' {
            p += 1;
            while p < input.len() && input.chars().nth(p).unwrap().is_ascii_digit() {
                p += 1;
            }
        }

        let text = &input[start..p];
        text.parse_float().ok().map(|f| (f, p))
    }
}
```

## 3. Combinator combinators

`src/parser/combinators.vr`:

```verum
use .super.types.*;

/// Transform the parsed value.
pub fn map<A, B>(p: Parser<A>, f: fn(A) -> B) -> Parser<B> {
    move |input, pos| p(input, pos).map(|(v, p)| (f(v), p))
}

/// Try `a`; if it fails, try `b` at the same position.
pub fn alt<T>(a: Parser<T>, b: Parser<T>) -> Parser<T> {
    move |input, pos| match a(input, pos) {
        Maybe.Some(r) => Maybe.Some(r),
        Maybe.None    => b(input, pos),
    }
}

/// Sequence: run `a`, then `b` at its end.
pub fn seq<A, B>(a: Parser<A>, b: Parser<B>) -> Parser<(A, B)> {
    move |input, pos| {
        let (va, p1) = a(input, pos)?;
        let (vb, p2) = b(input, p1)?;
        Maybe.Some(((va, vb), p2))
    }
}

/// Sequence, keeping only the left value.
pub fn left<A, B>(a: Parser<A>, b: Parser<B>) -> Parser<A> {
    map(seq(a, b), |(av, _)| av)
}

/// Sequence, keeping only the right value.
pub fn right<A, B>(a: Parser<A>, b: Parser<B>) -> Parser<B> {
    map(seq(a, b), |(_, bv)| bv)
}

/// Zero-or-more.
pub fn many<T>(p: Parser<T>) -> Parser<List<T>> {
    move |input, mut pos| {
        let mut out = list![];
        loop {
            match p(input, pos) {
                Maybe.Some((v, new_pos)) => {
                    out.push(v);
                    pos = new_pos;
                }
                Maybe.None => break,
            }
        }
        Maybe.Some((out, pos))
    }
}

/// One-or-more.
pub fn many1<T>(p: Parser<T>) -> Parser<List<T>> {
    move |input, pos| {
        let (first, p1) = p(input, pos)?;
        let (rest, p2) = many(p)(input, p1)?;
        let mut out = list![first];
        out.extend(rest);
        Maybe.Some((out, p2))
    }
}

/// Optional.
pub fn opt<T>(p: Parser<T>) -> Parser<Maybe<T>> {
    move |input, pos| match p(input, pos) {
        Maybe.Some((v, new_pos)) => Maybe.Some((Maybe.Some(v), new_pos)),
        Maybe.None               => Maybe.Some((Maybe.None,    pos)),
    }
}

/// Surround with token, discard surroundings.
pub fn between<A, B, T>(open: Parser<A>, p: Parser<T>, close: Parser<B>) -> Parser<T> {
    right(open, left(p, close))
}

/// Parse `p` separated by `sep`, at least once.
pub fn sep_by1<T, S>(p: Parser<T>, sep: Parser<S>) -> Parser<List<T>> {
    move |input, pos| {
        let (first, p1) = p(input, pos)?;
        let rest_parser = many(right(sep, p));
        let (rest, p2) = rest_parser(input, p1)?;
        let mut out = list![first];
        out.extend(rest);
        Maybe.Some((out, p2))
    }
}
```

## 4. The grammar

`src/parser/grammar.vr`:

```verum
use .super.types.*;
use .super.atoms.*;
use .super.combinators.*;

/// Expression: term ((+|-) term)*
pub fn expr() -> Parser<Expr> {
    let add_op = map(right(whitespace(), char('+')), |_| "add");
    let sub_op = map(right(whitespace(), char('-')), |_| "sub");
    let op     = alt(add_op, sub_op);

    move |input, pos| {
        let (first, mut p) = term()(input, pos)?;
        let mut acc = first;
        loop {
            let ws = whitespace()(input, p).unwrap();
            p = ws.1;
            match op(input, p) {
                Maybe.Some((which, np)) => {
                    let (rhs, rp) = term()(input, np)?;
                    acc = match which.as_str() {
                        "add" => Expr.Add { left: Heap::new(acc), right: Heap::new(rhs) },
                        "sub" => Expr.Sub { left: Heap::new(acc), right: Heap::new(rhs) },
                        _     => unreachable(),
                    };
                    p = rp;
                }
                Maybe.None => break,
            }
        }
        Maybe.Some((acc, p))
    }
}

/// Term: factor ((*|/) factor)*
pub fn term() -> Parser<Expr> {
    move |input, pos| {
        let (first, mut p) = factor()(input, pos)?;
        let mut acc = first;
        loop {
            let (_, ws_p) = whitespace()(input, p).unwrap();
            let mul_op = char('*');
            let div_op = char('/');
            match alt(map(mul_op, |_| "mul"), map(div_op, |_| "div"))(input, ws_p) {
                Maybe.Some((which, np)) => {
                    let (rhs, rp) = factor()(input, np)?;
                    acc = match which.as_str() {
                        "mul" => Expr.Mul { left: Heap::new(acc), right: Heap::new(rhs) },
                        "div" => Expr.Div { left: Heap::new(acc), right: Heap::new(rhs) },
                        _     => unreachable(),
                    };
                    p = rp;
                }
                Maybe.None => break,
            }
        }
        Maybe.Some((acc, p))
    }
}

/// Factor: number | '(' expr ')'
pub fn factor() -> Parser<Expr> {
    move |input, pos| {
        let (_, p1) = whitespace()(input, pos).unwrap();
        if p1 < input.len() && input.chars().nth(p1).unwrap() == '(' {
            let (e, p2) = right(char('('), left(expr(), right(whitespace(), char(')'))))(input, p1)?;
            Maybe.Some((e, p2))
        } else {
            map(number(), |n| Expr.Num(n))(input, p1)
        }
    }
}

/// Top-level: parse a full input; return error with position on failure.
pub fn parse(input: &Text) -> Result<Expr, ParseError> {
    match expr()(input, 0) {
        Maybe.Some((e, p)) => {
            // Consume trailing whitespace
            let (_, end) = whitespace()(input, p).unwrap();
            if end == input.len() {
                Result.Ok(e)
            } else {
                Result.Err(ParseError { pos: end, expected: "end of input".to_string() })
            }
        }
        Maybe.None => Result.Err(ParseError { pos: 0, expected: "expression".to_string() }),
    }
}
```

## 5. An evaluator for the AST

`src/parser/eval.vr`:

```verum
use .super.types.Expr;

pub fn eval(e: &Expr) -> Float {
    match e {
        Expr.Num(n) => *n,
        Expr.Add { left, right } => eval(left) + eval(right),
        Expr.Sub { left, right } => eval(left) - eval(right),
        Expr.Mul { left, right } => eval(left) * eval(right),
        Expr.Div { left, right } => eval(left) / eval(right),
    }
}
```

## 6. REPL in `src/main.vr`

```verum
use .self.parser.*;

fn main() using [IO] {
    let stdin = stdin();
    loop {
        print(&"> ");
        let line = stdin.read_line().unwrap_or("".to_string());
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed == "quit" { break; }

        match parse(&trimmed.to_string()) {
            Result.Ok(e)  => println(&f"{eval(&e)}"),
            Result.Err(err) => eprintln(&f"error at pos {err.pos}: expected {err.expected}"),
        }
    }
}
```

## 7. Tests

```verum
@cfg(test)
module tests {
    use .super.parser.*;

    fn p(s: &'static str) -> Float { eval(&parse(&s.to_string()).unwrap()) }

    @test fn numbers() {
        assert_eq(p("42"), 42.0);
        assert_eq(p("3.14"), 3.14);
        assert_eq(p("-7"), -7.0);
    }

    @test fn precedence() {
        assert_eq(p("2 + 3 * 4"), 14.0);
        assert_eq(p("(2 + 3) * 4"), 20.0);
        assert_eq(p("10 - 2 - 3"), 5.0);       // left-associative
    }

    @test fn whitespace_tolerance() {
        assert_eq(p("  1  +  2  *  3  "), 7.0);
    }

    @test fn parens() {
        assert_eq(p("(((42)))"), 42.0);
    }

    @test fn rejects_unbalanced() {
        assert(parse(&"(1 + 2".to_string()).is_err());
        assert(parse(&"1 + 2)".to_string()).is_err());
    }

    @test(property)
    fn round_trip(n: Float) {
        // Parse a rendered float; expect it back.
        let s = n.to_text();
        let parsed = parse(&s).unwrap();
        match parsed {
            Expr.Num(got) => {
                // Equal to within float rounding.
                assert((got - n).abs() < 0.0001);
            }
            _ => unreachable(),
        }
    }
}
```

## 8. Run it

```bash
$ verum test
   test tests::numbers                 ... ok
   test tests::precedence               ... ok
   test tests::whitespace_tolerance     ... ok
   test tests::parens                   ... ok
   test tests::rejects_unbalanced       ... ok
   test tests::round_trip               ... ok (100 cases)
   all 6 tests passed

$ verum run
> 2 + 3 * (4 - 1)
11
> 100 / 4 + 1
26
> quit
```

## Design notes

### Why closures, not a trait?

We defined `Parser<T>` as a function type (`fn(&Text, Int) -> Maybe<(T, Int)>`).
This gives us:
- Zero overhead — each combinator is just a closure.
- Composable — return types are plain functions, nothing to
  wrap in a `Box<dyn Parser>`.
- No type-level gymnastics — combinators compose via regular
  generic functions.

### Why not track `pos` with refinements?

You could refine `pos: Int { self <= input.len() }` — the solver
proves that indices stay in bounds, and `input[pos]` becomes
safe without runtime checks. For pedagogy we skipped this; for
production parsers it's worthwhile.

### Why `Heap<Expr>` in recursive variants?

Sum types are tagged unions; a variant that contains another
`Expr` directly would be infinitely sized. `Heap<Expr>` is the
indirection that breaks the recursion — exactly one heap
allocation per AST node.

### Error messages

Real parsers accumulate error context (expected sets, farthest
error position, pretty-printed source with a caret). This starter
version is enough for a REPL; a `combine`-style
error-tracking monad is the next step.

## What you learned

- **Parser combinators**: first-class functions + generics + closures.
- **Recursive AST shape**: sum types + `Heap<T>` indirection.
- **Pattern-based interpreter**: `match` over `Expr` variants.
- **Property testing**: round-trip invariants.

## Next

- **[Verified data structure tutorial](/docs/tutorials/verified-data-structure)** —
  annotate this parser with invariants (e.g. `AST size ≤ input length`).
- Extend the grammar with variables, `let`, functions — you'll want
  a `ParserCtx` to thread state. That's the gateway to a real compiler.

## See also

- **[Patterns](/docs/language/patterns)** — the matching used in
  `eval` and error handling.
- **[base → Maybe](/docs/stdlib/base#maybet--optional-value)** —
  the `?` operator shines in combinator parsing.

---
sidebar_position: 12
title: Pattern Matching
description: Build a tiny expression-language interpreter to see every pattern form in action.
---

# Tutorial: Pattern Matching

Verum's pattern system is one of its most expressive features. This
tutorial walks through **building a tiny Scheme-like interpreter**
— a lexer, parser, and evaluator — so every pattern form appears in
context, not as a standalone example.

**Time: 30 minutes.**

**Prerequisites:** [Hello, World](/docs/getting-started/hello-world).

## Step 0 — The language we'll interpret

```
(+ 1 2 3)                         ; 6
(if (< x 0) "neg" "pos")          ; "neg" if x < 0 else "pos"
(let ((x 5) (y 10)) (* x y))      ; 50
(lambda (n) (* n n))              ; a function
```

A tiny s-expression language with integers, strings, symbols, lists,
and lambdas.

## Step 1 — The token type (or-patterns, variant patterns)

```verum
type Token is
    | LParen
    | RParen
    | IntTok(Int)
    | StrTok(Text)
    | SymTok(Text);

fn display_token(t: &Token) -> Text {
    match t {
        Token.LParen     => "(".to_text(),
        Token.RParen     => ")".to_text(),
        Token.IntTok(n)  => f"{n}",
        Token.StrTok(s)  => f"\"{s}\"",
        Token.SymTok(s)  => s.clone(),
    }
}
```

**Variant patterns** destructure sum types. `Token.IntTok(n)` matches
the `IntTok` variant and binds its integer payload to `n`.

## Step 2 — The lexer (range patterns, guards)

```verum
fn lex(input: &Text) -> List<Token> {
    let mut tokens = List.new();
    let mut chars = input.chars().peekable();

    while let Maybe.Some(c) = chars.next() {
        match c {
            // Range pattern — any whitespace:
            ' ' | '\t' | '\n' => continue,

            '('  => tokens.push(Token.LParen),
            ')'  => tokens.push(Token.RParen),

            // Guard — numeric start:
            c if c.is_digit() => {
                let mut num_text = c.to_text();
                while let Maybe.Some(&d) = chars.peek() {
                    if d.is_digit() { num_text.push(d); chars.next(); }
                    else { break; }
                }
                tokens.push(Token.IntTok(num_text.parse_int().unwrap()));
            }

            '"' => {
                let mut s = Text.new();
                while let Maybe.Some(d) = chars.next() {
                    if d == '"' { break; }
                    s.push(d);
                }
                tokens.push(Token.StrTok(s));
            }

            // Default case — a symbol:
            _ => {
                let mut s = c.to_text();
                while let Maybe.Some(&d) = chars.peek() {
                    if d.is_whitespace() || d == '(' || d == ')' { break; }
                    s.push(d); chars.next();
                }
                tokens.push(Token.SymTok(s));
            }
        }
    }
    tokens
}
```

**Or-patterns** (`' ' | '\t' | '\n'`) match any of several literals.
**Guards** (`c if c.is_digit()`) test a predicate on the already-
bound variable. **Wildcard** (`_`) matches anything.

## Step 3 — The AST (recursive variant)

```verum
type Expr is
    | IntLit(Int)
    | StrLit(Text)
    | Symbol(Text)
    | List(List<Heap<Expr>>)                // recursive via Heap
    | Lambda { params: List<Text>, body: Heap<Expr> };
```

`List<Heap<Expr>>` is recursive; `Heap<T>` breaks the cycle for the
size calculation.

## Step 4 — The parser (slice patterns, nested patterns)

```verum
fn parse(tokens: &mut TokenCursor) -> Maybe<Expr> {
    match tokens.next()? {
        Token.LParen    => parse_list(tokens),
        Token.IntTok(n) => Maybe.Some(Expr.IntLit(n)),
        Token.StrTok(s) => Maybe.Some(Expr.StrLit(s)),
        Token.SymTok(s) => Maybe.Some(Expr.Symbol(s)),
        Token.RParen    => Maybe.None,       // unexpected
    }
}

fn parse_list(tokens: &mut TokenCursor) -> Maybe<Expr> {
    let mut items = List.new();
    while let Maybe.Some(t) = tokens.peek() {
        if *t == Token.RParen { tokens.next(); break; }
        items.push(Heap.new(parse(tokens)?));
    }
    Maybe.Some(Expr.List(items))
}
```

**`match tokens.next()?`** — `?` propagates `Maybe.None`.

## Step 5 — The evaluator (record patterns, `@` binding)

```verum
fn eval(expr: &Expr, env: &mut Env) -> Value {
    match expr {
        Expr.IntLit(n)    => Value.Int(*n),
        Expr.StrLit(s)    => Value.Str(s.clone()),
        Expr.Symbol(name) => env.lookup(name).unwrap(),

        // Slice pattern — the first element chooses the form:
        Expr.List(items) => match items.as_slice() {
            [] => Value.Nil,

            // Special form: (+ a b c ...)
            [op, rest @ ..] if op.as_symbol() == "+" => {
                rest.iter()
                    .map(|e| eval(&*e, env).as_int())
                    .sum::<Int>()
                    |> Value.Int
            }

            // Special form: (if cond then else)
            [op, cond, t, f] if op.as_symbol() == "if" => {
                if eval(cond, env).is_truthy() { eval(t, env) }
                else                           { eval(f, env) }
            }

            // Special form: (let ((x 1) (y 2)) body)
            [op, bindings, body] if op.as_symbol() == "let" => {
                eval_let(bindings, body, env)
            }

            // Function call:
            [func, args @ ..] => eval_call(func, args, env),
        }

        // Record pattern — match on Lambda fields:
        Expr.Lambda { params, body } => Value.Function {
            params: params.clone(),
            body: body.clone(),
            captured_env: env.snapshot(),
        },
    }
}
```

**Slice patterns**: `[op, rest @ ..]` binds the first element to `op`
and the rest as a slice named `rest`. **`rest @ ..`** is the `@`-
binding form — it gives the otherwise-anonymous `..` rest a name.

**Record patterns**: `Expr.Lambda { params, body }` destructures the
record variant's fields.

## Step 6 — The `is` operator and type-test patterns

Verum's `is` operator is a compact way to test a pattern without a
full `match`:

```verum
fn is_special_form(e: &Expr) -> Bool {
    e is Expr.List(items) && items.len() > 0 && {
        if let Expr.Symbol(name) = &*items[0] {
            matches!(name.as_str(), "if" | "let" | "lambda" | "+")
        } else { false }
    }
}
```

And type-test patterns:

```verum
fn describe(v: &Value) -> Text {
    match v {
        v is Int         => f"int {v}",       // v narrowed to &Int
        v is Text        => f"str {v:?}",
        v is List<Value> => f"list of {v.len()}",
        _                => "unknown",
    }
}
```

## Step 7 — `if let` and `while let`

For single-variant tests:

```verum
// Destructure if a match:
if let Expr.Symbol(name) = &first_item {
    print(f"got symbol: {name}");
}

// Loop while a match:
while let Maybe.Some(tok) = tokens.next() {
    process(tok);
}

// Chain with && for multi-binding checks:
if let Expr.Symbol(op) = &head
   && let Expr.IntLit(n) = &arg
   && op == "double"
{
    return Value.Int(n * 2);
}
```

## Step 8 — `let else` for refutable bindings

When a pattern **must** match or the function cannot proceed:

```verum
fn eval_if(items: &[Heap<Expr>], env: &mut Env) -> Value {
    let [_, cond, t, f] = items else {
        panic("malformed if");
    };
    // Below, we know we have exactly 4 elements, bound as cond/t/f.
    if eval(cond, env).is_truthy() { eval(t, env) } else { eval(f, env) }
}
```

`let else` requires the `else` block to **diverge** (return, panic,
continue, break).

## Step 9 — Active patterns

User-defined patterns:

```verum
pattern Even(n: Int) -> Bool = n % 2 == 0;
pattern Even_Positive(n: Int) -> Bool = n > 0 && n % 2 == 0;

fn describe(v: Value) -> Text {
    match v {
        Value.Int(Even_Positive()) => "positive even",
        Value.Int(Even())          => "even",
        Value.Int(_)               => "odd",
        _                          => "non-integer",
    }
}
```

See [language/active-patterns](/docs/language/active-patterns) for
the full active-pattern story.

## Step 10 — Exhaustiveness

The compiler checks that every match is exhaustive. Remove an arm:

```verum
fn description(t: &Token) -> Text {
    match t {
        Token.LParen     => "left paren".to_text(),
        Token.RParen     => "right paren".to_text(),
        Token.IntTok(n)  => f"int {n}",
        Token.StrTok(s)  => f"str {s:?}",
        // missing Token.SymTok
    }
}
```

```bash
$ verum check
error[V2001]: non-exhaustive patterns
  --> src/main.vr:3:11
   |
 3 |     match t {
   |           ^ pattern `Token.SymTok(_)` not covered
   |
help: add an arm for `Token.SymTok`, or use `_ =>` to catch remaining variants.
```

## What you built

A tiny interpreter that exercises every pattern form:

- **Variant patterns**: `Token.IntTok(n)`.
- **Or-patterns**: `' ' | '\t' | '\n'`.
- **Range patterns**: literal range matches.
- **Guards**: `c if c.is_digit()`.
- **Wildcards**: `_`.
- **Slice patterns**: `[head, tail @ ..]`.
- **Record patterns**: `Expr.Lambda { params, body }`.
- **`@` binding**: `rest @ ..`.
- **Type-test patterns**: `v is Int`.
- **`if let` / `while let` / `let else`**.
- **If-let chains**: `if let A = x && let B = y && …`.
- **Active patterns**: `Even()`, `Even_Positive()`.

## Where to go next

- **[language/patterns](/docs/language/patterns)** — the normative
  pattern grammar.
- **[language/active-patterns](/docs/language/active-patterns)** —
  user-defined pattern matchers.
- **[language/destructuring](/docs/language/destructuring)** —
  destructuring in `let`, assignment, parameters.
- **[tutorials/parser](/docs/tutorials/parser)** — bigger combinator
  parser (the natural next step).

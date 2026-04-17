---
sidebar_position: 3
title: Language Tour
---

# Language Tour

Ten minutes. Nine features. No fluff.

## 1. Types and functions

```verum
type Vec2 is { x: Float, y: Float };

fn dot(a: Vec2, b: Vec2) -> Float {
    a.x * b.x + a.y * b.y
}
```

- `type T is { ... }` declares a record.
- Function bodies are expressions; the last expression is returned.
- No trailing semicolon on the return expression.

## 2. Sum types

```verum
type Tree<T> is
    | Leaf
    | Node { value: T, left: Heap<Tree<T>>, right: Heap<Tree<T>> };

fn depth<T>(t: &Tree<T>) -> Int {
    match t {
        Tree.Leaf => 0,
        Tree.Node { left, right, .. } => 1 + max(depth(left), depth(right)),
    }
}
```

- `type T is A | B | ...` declares a sum.
- `Heap<T>` is an owned heap allocation. `Tree<T>` is self-referential
  and therefore indirect.
- `match` on a sum type with wildcard field binding `..`.

## 3. Generics and protocols (traits)

```verum
type Eq is protocol {
    fn eq(&self, other: &Self) -> Bool;
    fn ne(&self, other: &Self) -> Bool { !self.eq(other) }
};

implement<T: Eq> Eq for List<T> {
    fn eq(&self, other: &List<T>) -> Bool {
        self.len() == other.len() &&
        self.iter().zip(other.iter()).all(|(a, b)| a.eq(b))
    }
}
```

- `type P is protocol { ... }` is an interface.
- `implement<T: Bound> P for X { ... }` provides the implementation.
- `&Self` is the receiver type; no `self:` noise.

## 4. Refinement types

```verum
type Positive<T: Numeric>  is T { self > T.zero() };
type NonEmpty<T>           is List<T> { self.len() > 0 };
type Percentage            is Float { 0.0 <= self && self <= 100.0 };

fn first_or<T: Copy>(xs: &NonEmpty<T>) -> T {
    xs[0]   // index is safe: NonEmpty guarantees len() > 0
}
```

Refinement predicates are part of the type. They are checked at the
boundaries where values flow from unconstrained to refined, and erased
at runtime when the proof succeeds.

## 5. Three-tier references

```verum
fn managed(x: &T)         { /* ~15 ns CBGR check */ }
fn proven (x: &checked T) { /* 0 ns — compiler verified */ }
fn escape (x: &unsafe T)  { /* 0 ns — you swear it's OK */ }
```

Start with `&T`. Profile. When escape analysis proves a reference
cannot dangle, promote it to `&checked T`. Use `&unsafe T` only when
you have an obligation the compiler cannot verify and you are willing
to discharge it by inspection.

## 6. Explicit contexts

```verum
fn handle(req: Request) -> Response
    using [Database, Logger, Clock, RateLimiter]
{
    let now = Clock.now();
    Logger.info(f"request at {now}: {req.path}");
    RateLimiter.check(req.client_ip)?;
    let user = Database.load_user(req.auth)?;
    build_response(user, req)
}
```

No globals. No `@Autowired`. Contexts are declared in the signature,
propagated through the call graph, and erased when statically resolved.

## 7. Async + structured concurrency

```verum
async fn fetch_all(ids: &List<Id>) -> List<Data>
    using [Http, Logger]
{
    nursery {
        let handles = ids.iter()
            .map(|id| spawn fetch_one(*id))
            .collect();
        handles.iter().map(|h| h.await).collect()
    }
}
```

- `async fn` and `.await`.
- `nursery { ... }` is a structured-concurrency scope: all spawned
  tasks are joined or cancelled before `nursery` returns.
- Contexts automatically flow across `spawn`.

## 8. Verification

```verum
@verify(formal)
fn binary_search(xs: &List<Int>, key: Int) -> Maybe<Int>
    where ensures result is Some(i) => xs[i] == key
{
    let (mut lo, mut hi) = (0, xs.len());
    while lo < hi
        invariant 0 <= lo && hi <= xs.len()
        decreases hi - lo
    {
        let mid = lo + (hi - lo) / 2;
        match xs[mid].cmp(&key) {
            Ordering.Less    => lo = mid + 1,
            Ordering.Greater => hi = mid,
            Ordering.Equal   => return Some(mid),
        }
    }
    None
}
```

- `where ensures ...` is a postcondition.
- `invariant` and `decreases` make the loop discharge automatically.
- `@verify(formal)` requests SMT-level verification.

## 9. Metaprogramming

```verum
@derive(Eq, Ord, Hash, Debug, Clone)
type Version is { major: Int, minor: Int, patch: Int };

meta fn repeat(n: Int, body: quote) -> quote {
    quote { for _ in 0..${n} { ${body} } }
}

fn warmup() using [IO] {
    @repeat(3, { print("warming"); })
}
```

- `@derive(...)` generates instances with a visible, deterministic
  expansion.
- `meta fn` runs at compile time; `quote { ... }` builds ASTs
  hygienically.

## Where to next

Every feature above has a dedicated chapter:

- **Types**: [/docs/language/types](/docs/language/types)
- **Refinement types**: [/docs/language/refinement-types](/docs/language/refinement-types)
- **References & memory**: [/docs/language/memory-model](/docs/language/memory-model)
- **Context system**: [/docs/language/context-system](/docs/language/context-system)
- **Async**: [/docs/language/async-concurrency](/docs/language/async-concurrency)
- **Verification**: [/docs/verification/gradual-verification](/docs/verification/gradual-verification)
- **Metaprogramming**: [/docs/language/meta/overview](/docs/language/meta/overview)

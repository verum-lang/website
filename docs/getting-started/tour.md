---
sidebar_position: 3
title: Language Tour
---

# Language Tour

Twelve minutes. Twelve features. No fluff. Every snippet below
compiles under the current `verum check`.

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
type Percentage is Float { 0.0 <= self && self <= 100.0 };
type UserId     is (Int) { self > 0 };

fn average(x: Percentage, y: Percentage) -> Percentage {
    (x + y) / 2.0     // SMT discharges the refinement on the result
}
```

Refinement predicates are part of the type. They are checked at the
boundaries where values flow from unconstrained to refined, and erased
at runtime when the proof succeeds. The SMT capability router
(`verum_smt.BackendSwitcher`) picks the backend — the SMT backend, or a
portfolio — based on the theory mix of the predicate.

## 5. Three-tier references

```verum
fn managed(x: &T)         { /* ~0.93 ns CBGR check (measured) */ }
fn proven (x: &checked T) { /* 0 ns — compiler verified */ }
fn escape (x: &unsafe T)  { /* 0 ns — you swear it's OK */ }
```

Start with `&T`. Profile. When escape analysis proves a reference
cannot dangle, promote it to `&checked T`. Use `&unsafe T` only when
you have an obligation the compiler cannot verify and you are willing
to discharge it by inspection. The CBGR check lives in `verum_cbgr`
and measures ~0.93 ns today against a 15 ns design target.

## 6. Explicit contexts

```verum
public context Database { fn load(auth: Int) -> Int; }
public context Logger { fn info(msg: &Text); }
public context Clock { fn now() -> Int; }
public context RateLimiter { fn check(ip: &Text); }

public type Request is { path: Text, client_ip: Text, auth: Int };
public type Response is { body: Text };

fn build_response(user: Int, req: Request) -> Response {
    Response { body: f"{user}: {req.path}" }
}

fn handle(req: Request) -> Response
    using [Database, Logger, Clock, RateLimiter]
{
    let now = Clock.now();
    Logger.info(&f"request at {now}: {req.path}");
    RateLimiter.check(&req.client_ip);
    let user = Database.load(req.auth);
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

## 9. Dependent types and cubical HoTT

```verum
/// Dependent pair: a length-indexed list.
type Vec is n: Int, data: [Int; n];

/// Dependent function: return type depends on the argument's value.
fn replicate(n: Int { self >= 0 }, x: Int) -> [Int; n] {
    [x; n]
}

/// Path type from cubical HoTT — propositional equality is a type.
mount core.math.hott.{ Path, refl, I };

fn same_value<T>(x: T) -> Path<T>(x, x) {
    refl(x)
}
```

Σ-types (`n: Int, data: [Int; n]`), Π-types (`[Int; n]` where `n` is
a value), and Path types (`Path<T>(x, y)` — the type of paths from
`x` to `y`) coexist with refinement types and the rest of the surface
language. The kernel's HoTT layer (`Transp`, `HComp`, `Glue`) is
wired to its reduction rules in `verum_smt.cubical_tactic`.

## 10. Framework axioms

```verum
mount core.math.frameworks.lurie_htt.{ Site, sheafification_is_infinity_topos };

/// A theorem that invokes Lurie HTT 6.2.2.7 as a trusted postulate.
/// The dependency surfaces automatically in `verum audit --framework-axioms`.
theorem sheaf_topos_on_bures<C: Site>(c: C) -> Bool
    requires c.is_presentable()
{
    proof by {
        apply sheafification_is_infinity_topos;
    }
}
```

`@framework(identifier, "citation")` marks axioms whose justification
comes from external mathematics (Lurie HTT, Schreiber DCCT, Connes
reconstruction, Petz classification, Arnold–Mather catastrophe,
Baez–Dolan coherence). Six stdlib packages ship 36 citation-tagged
axioms. Run `verum audit --framework-axioms` to enumerate the
trusted boundary of any proof corpus — no hidden postulates.

## 11. Metaprogramming

```verum
@derive(Eq, Ord, Hash, Debug, Clone)
type Version is { major: Int, minor: Int, patch: Int };

meta fn repeat(n: Int, body: quote) -> quote {
    quote { for _ in 0..${n} { ${body} } }
}

fn warmup() {
    @repeat(3, { print("warming"); })
}
```

- `@derive(...)` generates instances with a visible, deterministic
  expansion.
- `meta fn` runs at compile time; `quote { ... }` builds ASTs
  hygienically.

## 12. The trusted kernel

All of the above — tactics, SMT discharge, cubical reductions,
framework axioms, derive-generated code — eventually produces a
proof term. That proof term is re-checked by `verum_kernel`, the
LCF-style kernel that is the **sole** trusted checker in Verum's
stack. It targets under 5 000 lines of Rust at completion; today it
is 1 180 lines with 30 unit tests pinning every typing rule.

```bash
$ verum audit --framework-axioms    # enumerate the trusted boundary
$ cargo test -p verum_kernel        # re-run the TCB test suite
```

A bug anywhere outside the kernel manifests as "refused a valid
program" or "certificate replay failed", never as "false theorem
accepted". See **[Architecture → trusted kernel](/docs/architecture/trusted-kernel)**.

## Where to next

Every feature above has a dedicated chapter:

- **Types**: [/docs/language/types](/docs/language/types)
- **Refinement types**: [/docs/language/refinement-types](/docs/language/refinement-types)
- **Dependent types**: [/docs/language/dependent-types](/docs/language/dependent-types)
- **References & memory**: [/docs/language/memory-model](/docs/language/memory-model)
- **Context system**: [/docs/language/context-system](/docs/language/context-system)
- **Async**: [/docs/language/async-concurrency](/docs/language/async-concurrency)
- **Gradual verification** (9 strategies, 2-layer dispatch): [/docs/verification/gradual-verification](/docs/verification/gradual-verification)
- **Cubical & HoTT**: [/docs/verification/cubical-hott](/docs/verification/cubical-hott)
- **Framework axioms** (trusted boundary): [/docs/verification/framework-axioms](/docs/verification/framework-axioms)
- **Trusted kernel** (LCF-style TCB): [/docs/architecture/trusted-kernel](/docs/architecture/trusted-kernel)
- **Metaprogramming**: [/docs/language/meta/overview](/docs/language/meta/overview)

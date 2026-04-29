---
sidebar_position: 1
title: Design Principles
description: The six principles that shape every decision in Verum.
---

# Design Principles

Languages are shaped more by what their designers refuse to do than by
what they embrace. Verum's six principles are stated as constraints —
each one draws a line and each one has a concrete consequence you can
see in the grammar, the type system, or the runtime.

The six:

1. Semantic honesty over operational familiarity.
2. Verification is a spectrum, not a binary.
3. No hidden state, no hidden effects.
4. Zero-cost is the default; you pay for what you ask for.
5. No magic.
6. Radical expressiveness where it earns its keep.

Each principle below is stated, motivated, and then followed by the
language-level consequences and at least one anti-pattern the
principle rules out.

---

## 1. Semantic honesty over operational familiarity

A type's name describes what it **means**, not how it is laid out.

| Verum    | What it is           | *Not* called | Why                                                    |
|----------|----------------------|--------------|--------------------------------------------------------|
| `List`   | ordered collection   | `Vec`        | The backing might be a ring buffer, a skiplist, or a rope. |
| `Text`   | UTF-8 string         | `String`     | The encoding is UTF-8, but the concept is "text".     |
| `Map`    | key–value mapping    | `HashMap`    | Implementation may be Swiss-table, B-tree, or perfect hash. |
| `Set`    | unordered collection | `HashSet`    | Same — the name is the concept, not the index.         |
| `Heap`   | owned allocation     | `Box`        | "Box" describes storage; "Heap" describes placement.   |
| `Shared` | atomic reference-counted | `Arc`    | "Atomic reference-counted" is an implementation.       |
| `Maybe`  | optional value       | `Option`     | Option is a kind; Maybe is the specific one-of-two.    |

**Consequence in the type system**: The standard library presents
*protocols* (`List<T>: Sequence + RandomAccess + MutableSequence`), and
the concrete layout (`list_impl.PackedBuffer`, `list_impl.Rope`, …)
lives behind the protocol. A programmer never writes
`PackedBuffer<Int>` directly — they write `List<Int>` and let PGO
pick.

**Anti-pattern ruled out**: a call site that depends on the bit-level
layout of a standard-library type. If `List<Int>` is a Swiss-table in
debug and a ring buffer in release, user code that assumed either is
wrong — and the language refuses to let the assumption be written.

**Where to see this**: every type in
[`stdlib/collections`](/docs/stdlib/collections),
[`stdlib/base`](/docs/stdlib/base), and
[`stdlib/text`](/docs/stdlib/text).

---

## 2. Verification is a spectrum, not a binary

A program is not "verified" or "unverified." It occupies a point on
Verum's **nine-strategy ladder**, chosen per function via `@verify(…)`:

```
runtime → static → formal (= proof)
         ↓
         fast / thorough (= reliable) / certified / synthesize
```

The semantics of each strategy, per the grammar:

| Strategy       | What it does                                                                                        | Typical cost            |
|----------------|------------------------------------------------------------------------------------------------------|-------------------------|
| `runtime`      | Runtime assertion check only — no formal verification.                                              | 1 ns (if not elided)    |
| `static`       | Compile-time type and dataflow checks; no formal proof.                                             | build time              |
| `formal`       | Formal verification with the default strategy. **Recommended**.                                      | 50-500 ms / goal        |
| `proof`        | Alias of `formal`, emphasising proof extraction.                                                     | as `formal`             |
| `fast`         | Optimise for fast verification; may sacrifice completeness on hard goals.                            | 10-100 ms / goal        |
| `thorough`     | Maximum completeness; race multiple strategies in parallel.                                          | 500 ms-10 s / goal      |
| `reliable`     | Alias of `thorough`, emphasising reliability.                                                         | as `thorough`           |
| `certified`    | Independently cross-verify the proof. Required for security-critical verification and for exporting proofs. | 1-30 s / goal           |
| `synthesize`   | Generate a term satisfying the specification instead of checking it.                                  | bounded by search depth |

**Consequence in the compiler**: The `@verify(…)` attribute routes the
goal through a *capability router* that picks between the SMT backend, and
the in-house solver based on goal shape. You choose intent
(`formal`), not backend (`Z3`). See
[verification/smt-routing](/docs/verification/smt-routing).

**Anti-pattern ruled out**: "we verified this module," which is
meaningless without a strategy. Verum's reviews explicitly reference
the strategy each function used.

**Where to see this**: [verification/gradual-verification](/docs/verification/gradual-verification).

---

## 3. No hidden state, no hidden effects

Every function's signature tells the truth about what it needs.

```verum
fn process(order: Order)
    -> Result<Invoice, Error>
    using [Database, Logger, Clock]
```

- No global loggers.
- No ambient runtimes.
- No thread-local singletons pretending not to exist.
- No `static mut` counters.
- No implicit allocator.
- No hidden exception channel.

A function that touches the database says `Database`. A function that
reads the clock says `Clock`. A function that throws typed errors
says `throws(E)`. A function that awaits says `async`.

**Consequence at the boundary**: refactoring is mechanical.
Replacing `Database` with `MemoryStore` in tests is a one-line edit
at a `provide` statement. In "ambient singleton" languages, the same
refactor requires tracing every call site and every library that
*might* have captured the live singleton.

**Consequence for verification**: a pure function is a function that
declares `using [!IO, !State<_>, !Random]` (or has an empty using
clause), and the compiler can prove purity *mechanically* — the
absence of an effect is as checkable as the presence of one.

**Anti-pattern ruled out**: capturing state via `static mut`,
thread-local slots that mutate, or exception mechanisms that escape
the signature. All of these are compile errors in Verum.

**Where to see this**: [language/context-system](/docs/language/context-system),
[language/capability-types](/docs/language/capability-types),
[`stdlib/context`](/docs/stdlib/context).

---

## 4. Zero-cost is the default; you pay for what you ask for

Every safety feature has three modes:

- **Free**: compiler proved the check; no code is emitted.
- **Cheap**: runtime check under 20 ns when it cannot be eliminated.
- **Explicit**: you opted into a stronger runtime check for a reason.

The clearest example is the **three-tier reference system**:

| Tier | Syntax          | Runtime cost                                 | Invariant provided by     |
|------|-----------------|----------------------------------------------|---------------------------|
| 0    | `&T`            | ~0.93 ns measured (≤ 15 ns design target)    | CBGR generational counter |
| 1    | `&checked T`    | 0 ns                                         | Compiler escape analysis  |
| 2    | `&unsafe T`     | 0 ns                                         | You, with `// SAFETY: …`   |

Tier 0 is the default — it works for arbitrary lifetimes without the
user reasoning about them. Tier 1 is what tier 0 **compiles to** when
the compiler can prove the generation counter is redundant
(≈ 40% of real-world dereferences). Tier 2 is the escape hatch: your
C-API wrapper, your GPU buffer, your off-heap arena.

**Consequence at the call site**: a CBGR-checked dereference is
**not** something you always pay for — it's something you pay for
until the compiler proves you don't have to. A program's *hot path*
often has zero CBGR cost after optimisation.

**Anti-pattern ruled out**: hiding the cost. Verum refuses to
pretend tier 0 is free. The 15 ns is documented, benchmarked, and
visible in profiles. When it matters, switch to tier 1 or tier 2
with an audit trail — never silently.

**Where to see this**: [language/references](/docs/language/references),
[language/cbgr](/docs/language/cbgr).

---

## 5. No magic

- **No `println!` macro**: `print` is a built-in function.
- **No `!` suffix anywhere**: user macros use `@` prefix.
- **No hidden `Box` insertion**: `Heap(x)` is explicit.
- **No implicit `clone()`**: every copy is written.
- **No compiler-blessed `derive` that synthesises surprising instances**:
  derive expansions are visible (`verum expand --derive`) and
  deterministic.
- **No "blanket impl" that picks itself by accident**: coherence is
  explicit; conflicting impls are compile errors.
- **No ambient generics**: `fn foo<T>(x: T)` captures `T` once, not
  inferred from the call site's nearby scope.
- **No string coercion**: a `Text` is not a `&Path` until you convert.
- **No unwrap of `Maybe.None` that panics silently**: `.unwrap()`
  panics loudly with a location; the preferred forms are `?` and
  pattern matching.

**Consequence for readers**: reading a line of Verum, you can predict
what it will do. The behaviour is on the page, not in the compiler's
heart.

**Consequence for tooling**: an LSP jump-to-definition always lands
where the feature is defined — not on a `lang_item` or
`compiler_builtin` black box.

**Anti-pattern ruled out**: languages where a `+` between two strings
*sometimes* allocates, where a `for` loop sometimes parallelises, or
where `derive(Clone)` sometimes inserts locks. Verum rejects every
such feature.

---

## 6. Radical expressiveness where it earns its keep

Verum ships:

- Dependent types (Σ, Π, path types).
- Cubical HoTT — paths, `transport`, `hcomp`.
- Higher-inductive types (`= a..b` endpoints on variants).
- Higher-rank polymorphism, existentials, GATs.
- Linear / affine types.
- Session types (via protocols).
- Coinductive definitions (`cofix`) and bisimulation tactics.
- Universe polymorphism with explicit `Level`.
- Two-level type theory for staged semantics.
- Refinement reflection + SMT routing.

**But every one of these is opt-in.** A CRUD service never sees
`Path<A>(a, b)`. The type system has layers — layer 2 is enough for
correctness at the API boundary; layer 6 is only for the kernel or
the prover. A program pays for what it uses: exit tier 2 and the
language is a clean strict-ML with ownership; exit tier 6 and it is
ML with refinements.

**Consequence for learners**: the five-minute tutorial does not
surface path types. The 30-minute tutorial does not surface
universe polymorphism. The language admits being learned by someone
who never opens `verification/cubical-hott` once.

**Anti-pattern ruled out**: a "simple" language that pretends to
have no depth. Verum acknowledges that some problems need
dependent types and provides them; most problems don't and the
language stays out of the way.

**Where to see this**: the entire
[Language reference](/docs/language/overview) is tiered —
**Types**, **Refinement Types**, **Dependent Types**, **Proof DSL**
lie along the principle-6 axis.

---

## How the principles compose

The principles interact more than they stack:

- Principle 1 (semantic honesty) gives the stdlib room to re-choose
  implementations under pressure. PGO flips `Map` from Swiss-table to
  B-tree based on observed access patterns; principle 4 (zero-cost)
  means the choice is observed in a profile, not paid for in the
  source.
- Principle 3 (no hidden state) makes principle 2 (verification)
  tractable — a pure function has no environment to model, so formal
  proofs terminate.
- Principle 5 (no magic) makes principle 6 (radical expressiveness)
  safe — when dependent types *are* pulled in, the programmer can
  see exactly where and why.

The six are not orthogonal. They are the minimum set of constraints
such that any combination of features you enable still follows them
all.

---

## Where to go next

- **[Semantic Honesty](/docs/philosophy/semantic-honesty)** — the
  naming story in detail.
- **[Gradual Verification](/docs/philosophy/gradual-verification)** —
  the spectrum of strategies.
- **[Comparisons](/docs/philosophy/comparisons)** — how these six
  principles look against Rust, OCaml, and Idris.

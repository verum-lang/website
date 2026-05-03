---
sidebar_position: 10
title: "Separation logic"
description: "Heap-aware spatial reasoning for stateful Verum programs. Six canonical heap-predicate variants, Hoare triples, heap capabilities, and the kernel ↔ verifier alignment."
slug: /verification/separation-logic
---

# Separation logic

**Separation logic** (Reynolds 2002, O'Hearn 2007) is the proof
discipline for reasoning about *stateful* Verum programs —
mutating heap, concurrent threads, IO-bearing operations. Where
[refinement-reflection](./refinement-reflection.md) handles
verification of pure-value functions, separation logic extends
the surface to triples `{ pre } command { post }` over heap
shapes.

This page documents the actual implementation: the
`HeapPredicate` variant (kernel-side and Verum-side mirrors),
the `HoareTriple` carrier, the heap-`Capability` enum, and how
separation goals plug into the unified verification dispatcher.

## 1. The heap-predicate variant — six canonical arms

Both the kernel side (`verum_kernel::separation_logic::HeapPredicate`)
and the Verum-side mirror (`core/logic/separation.vr`) carry the
same six arms:

```verum
public type HeapPredicate is
    | Emp
    | PointsTo { addr: Text, value: Text }
    | Sep { lhs: Heap<HeapPredicate>, rhs: Heap<HeapPredicate> }
    | And { lhs: Heap<HeapPredicate>, rhs: Heap<HeapPredicate> }
    | Pure { prop: Text }
    | Named { name: Text, args: Text };
```

The reading:

| Variant | Reading | When to use |
|---------|---------|-------------|
| `Emp` | `emp` — the heap is empty | identity for `Sep`; baseline state |
| `PointsTo { addr, value }` | `addr ↦ value` — singleton heap | precise pointer state |
| `Sep { lhs, rhs }` | `lhs ∗ rhs` — separating conjunction; heap splits into disjoint parts | the discipline's namesake — local reasoning under the frame rule |
| `And { lhs, rhs }` | `lhs ∧ rhs` — ordinary heap-stable conjunction; same heap | combining heap-stable predicates |
| `Pure { prop }` | `pure(P)` — heap-irrelevant proposition | lifting a `Bool` proposition into the heap-predicate language |
| `Named { name, args }` | user-defined heap predicate | inductive heap shapes (lists, trees) named in the axiom registry |

The six arms cover the standard small-step Reynolds vocabulary
plus *named* predicates for inductive heap shapes. They are
*sufficient* for the verification surface — extensions like
magic wand (`P -* Q`), existentials (`∃x. P(x)`), or specialised
shapes (linked-list segments, contiguous blocks) are expressed
as `Named { ... }` predicates whose definitions live in the
axiom registry.

## 2. Smart constructors

The Verum-side surface exposes smart constructors for each arm:

```verum
public fn emp() -> HeapPredicate { HeapPredicate.Emp }

public fn points_to(addr: Text, value: Text) -> HeapPredicate {
    HeapPredicate.PointsTo { addr, value }
}

public fn sep_conj(lhs: HeapPredicate, rhs: HeapPredicate) -> HeapPredicate {
    HeapPredicate.Sep { lhs: Heap(lhs), rhs: Heap(rhs) }
}

public fn heap_and(lhs: HeapPredicate, rhs: HeapPredicate) -> HeapPredicate {
    HeapPredicate.And { lhs: Heap(lhs), rhs: Heap(rhs) }
}

public fn pure(prop: Text) -> HeapPredicate {
    HeapPredicate.Pure { prop }
}

public fn named(name: Text, args: Text) -> HeapPredicate {
    HeapPredicate.Named { name, args }
}
```

A function contract that uses separation logic looks like:

```verum
@verify(formal)
public fn swap(p: &mut Cell, q: &mut Cell)
    requires sep_conj(points_to("p", "old_p"), points_to("q", "old_q"))
    where ensures sep_conj(points_to("p", "old_q"), points_to("q", "old_p"))
{
    let tmp = *p;
    *p = *q;
    *q = tmp;
}
```

## 3. Classification predicates

Three predicates classify a `HeapPredicate` for the verification
dispatcher:

```verum
public fn is_emp(p: HeapPredicate) -> Bool { ... }
public fn is_pure(p: HeapPredicate) -> Bool { ... }
public fn is_separating_conjunction(p: HeapPredicate) -> Bool { ... }
```

- **`is_emp`** — recognises the empty-heap predicate. Used to
  normalise `Sep(Emp, P) → P`.
- **`is_pure`** — recognises heap-irrelevant predicates. Pure
  predicates can be discharged by the pure kernel without
  invoking the separation-logic dispatcher.
- **`is_separating_conjunction`** — recognises `Sep(...)` outermost.
  Used by the frame-rule recogniser: a triple whose precondition
  has shape `Sep(P, R)` admits the frame rule with frame `R`.

## 4. Hoare triples — `{ pre } command { post }`

A `HoareTriple` carries a precondition, a command (an opaque text
identifier in the kernel — typically a function name), and a
postcondition:

```verum
public type HoareTriple is {
    pre:     HeapPredicate,
    command: Text,
    post:    HeapPredicate,
};

public fn hoare(pre: HeapPredicate, command: Text, post: HeapPredicate) -> HoareTriple {
    HoareTriple { pre, command, post }
}
```

The triple is the *verification goal* for stateful operations.
The verification dispatcher consumes triples through the same
pattern as ordinary `VerificationGoal`s, allowing the unified
verify-ladder strategies (`@verify(formal)`, `@verify(certified)`)
to handle both pure and stateful proofs.

## 5. Heap capabilities — distinct from architectural capabilities

A subtle but load-bearing distinction: the `Capability` type in
`core/logic/separation.vr` is **not** the same as the
[architectural Capability](../architecture-types/primitives/capability.md).
The two share a name but live at different layers:

```verum
// core/logic/separation.vr — heap capability
public type Capability is
    | None     // command doesn't touch the heap
    | Read     // read-only access
    | Write    // read + write (linear; aliased writes forbidden)
    | Own;     // full ownership (allocation / deallocation)
```

The heap capability classifies the *kind of access* a command
needs to a heap region. The architectural capability (in
`core.architecture.types`) classifies the *kind of permission* a
cog declares. They cooperate but do not unify:

| Heap capability | Architectural correlate |
|-----------------|------------------------|
| `Read` | `Capability.Read(ResourceTag.Memory(name))` |
| `Write` | `Capability.Write(ResourceTag.Memory(name))` |
| `Own` | `Capability.Write(ResourceTag.Memory(name))` + ownership marker |
| `None` | (no architectural capability needed) |

The architectural capability flows into the cog's `Shape.exposes`
list; the heap capability flows into the verification triple's
soundness check. Both must agree on the resource being accessed.

The classification predicates `Capability::allows_read()` /
`allows_write()` are used by the soundness invariant: a Hoare-
triple obligation can only mutate regions whose heap capability
is `Write` or `Own`.

## 6. The kernel ↔ verifier alignment

The kernel-side `HeapPredicate` (in
`verum_kernel::separation_logic`) carries `Term` payloads —
kernel proof-term values. The Verum-side `HeapPredicate` (in
`core/logic/separation.vr`) carries `Text` payloads — surface
text representations.

The alignment is structural — same six arms, same algebraic
laws, same classification semantics — but operates on different
payload types. The translation between them happens at the
verification dispatcher boundary:

- User-written contracts produce Verum-side `HeapPredicate`
  values via the smart constructors.
- The verification phase translates these into kernel-side
  `HeapPredicate` (with `Text` payloads lifted to `Term` payloads
  via the elaborator).
- The kernel re-checks the produced separation goal.
- The verdict travels back as a structural agreement: did the
  kernel admit the triple under its frame rule?

The alignment is enforced by the corpus-side `core/verify/separation_soundness/separation_logic_alignment.vr`,
which defines a `BridgeFidelity` classifier: every translation
is labelled `Faithful` (round-trip preserves meaning) or
`Approximating` (some surface detail lost in the translation).

## 7. The frame rule — the discipline's payoff

The classical Reynolds frame rule:

```text
   { P } c { Q }
   ─────────────────
   { P ∗ R } c { Q ∗ R }
```

reads: *if `c` transforms a heap satisfying `P` into one
satisfying `Q`, and `c`'s footprint is disjoint from `R`, then
adding `R` to both sides preserves the triple.* This is the
discipline's namesake — *separation* — and the load-bearing
property that makes local reasoning sound.

Verum's verifier recognises the frame rule via `is_separating_conjunction`:
a triple whose precondition has shape `Sep(P, R)` may be
strengthened to a triple proving only `Sep(P', R)` with the body
operating on `P` (and not touching `R`). The `R` portion is
*framed out* of the verification obligation, reducing proof
work to the function's actual footprint.

## 8. Worked example — list reverse

A linked-list reverse with separation contract:

```verum
@arch_module(
    lifecycle: Lifecycle.Theorem("v1.0"),
    exposes:   [Capability.Write(ResourceTag.Memory("list_*"))],
)
module algos.list_reverse;

mount core.logic.separation.{sep_conj, points_to, named};

@verify(certified)
public fn reverse<T>(list: &mut LinkedList<T>)
    requires named("lseg", f"{list.head}, null")
    where ensures named("lseg", f"{old(list.tail)}, null")
{
    let mut prev = null;
    let mut curr = list.head;
    while curr != null {
        let next = curr.next;
        curr.next = prev;
        prev = curr;
        curr = next;
    }
    list.head = prev;
}
```

The contract pins three claims:

1. **Architectural** (cog level) — the cog has the right to
   mutate `list_*` memory regions.
2. **Heap-capability** (function level) — the function needs
   `Write` access to the list nodes.
3. **Separation** (contract level) — the heap before contains a
   linked-list segment from `list.head` to `null`; after, a
   segment from `old(list.tail)` to `null`.

The verifier discharges (3) by encoding the contract into the
kernel's `HoareTriple` form, checking the frame rule applies
(no other heap regions are mentioned), and dispatching the
soundness check through `K-SMT-Replay` if the body's
verification reduces to an SMT obligation.

## 9. Capability vs property vs separation — the orthogonality

Three superficially-related concepts that the verifier and ATS-V
keep distinct:

| Axis | Tracks | Where checked | Cost |
|------|--------|---------------|------|
| **Architectural capability** | What the cog *may* do | compile-time architectural | 0 ns |
| **Property** | What the function *body* does | compile-time function-type | 0 ns |
| **Separation** | What the heap *shape* is | verification-time | per query |
| **Heap capability** | What kind of heap access the *command* needs | verification-time | structural check |

A function may simultaneously:

- Be in a cog declaring `Capability.Write(ResourceTag.Memory("buffer_X"))`.
- Carry property `{Mutates}`.
- Carry heap capability `Write`.
- Carry separation contract `requires points_to("buffer_X.head", "value")`.

Each axis catches a different bug class. See
[Three orthogonal axes](../architecture-types/orthogonality.md)
for the full discussion.

## 10. Limitations

The current separation-logic surface is a *minimal viable kernel*.
Known gaps relative to the literature:

- **Magic wand `P -* Q`** is not a first-class `HeapPredicate`
  arm; it is expressed as a `Named { name: "wand", args: ... }`
  predicate whose definition lives in the axiom registry.
- **Existential / universal quantification** (`∃x. P(x)`,
  `∀x. P(x)`) over heap shapes is similarly expressed via
  `Named` rather than as first-class arms.
- **Higher-order predicates** (predicates parameterised over
  predicates) are limited to what `Named` can express.

Each limitation is *intentional* — the six-arm minimal kernel is
load-bearing for soundness. Extensions go through the axiom
registry, which keeps every higher-level predicate's semantics
explicit and audit-checkable.

## 11. Cross-references

- [Trusted kernel](./trusted-kernel.md) — the kernel-side
  primitives.
- [Refinement reflection](./refinement-reflection.md) — the
  pure-value verifier complementing separation logic.
- [Three-kernel architecture](./two-kernel-architecture.md) — the
  differential check that protects the kernel-side
  `HeapPredicate` implementation.
- [Three orthogonal axes](../architecture-types/orthogonality.md)
  — capability vs property vs separation.
- [Type properties](../language/type-properties.md) — the
  function-level effect tracker.
- [Architectural Capability primitive](../architecture-types/primitives/capability.md)
  — the cog-level permission, distinct from heap capability.

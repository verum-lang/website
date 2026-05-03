---
sidebar_position: 2
title: "CVE — three axes (C / V / E)"
description: "Constructive / Verifiable / Executable: the three independent dimensions whose combinations produce the CVE seven-symbol taxonomy."
slug: /architecture-types/cve/three-axes
---

# CVE — three axes (C / V / E)

The Constructive / Verifiable / Executable frame stands or falls
on the **independence** of its three axes. If any one axis were
derivable from another, the framework would collapse to a
two-dimensional grid; the seven canonical statuses would
correspondingly collapse to four. The independence is therefore
not aesthetic — it is the structural property that makes the
framework load-bearing.

This page documents each axis precisely, gives examples across
the full present/partial/absent range, and demonstrates the
independence by exhibiting artefacts at every meaningful
combination.

## 1. Axis 1 — Constructive (C)

A claim is **constructive** when there is a procedure that produces
a witness — a value, a proof term, a computational object — the
language can manipulate as a first-class entity.

### 1.1 Range of constructiveness

| Mode | Meaning | Verum surface |
|------|---------|---------------|
| **Present** | Constructor realised; witness computable. | `fn id<T>(x: T) -> T { x }` — the polymorphic identity is a constructor. |
| **Partial** | Constructor formulated; witness type exists but no inhabitant exhibited. | `type Halts(p: Program);` (no constructor) |
| **Absent** | No constructor, even partial; the claim is purely descriptive. | "This problem is hard." |

### 1.2 Why constructiveness matters

A theorem proved by classical reductio without exhibiting a witness
is *true* but *not constructive*. In a verification context, the
distinction has real consequences:

- A constructive proof of `∃ x. P(x)` lets the program *use* the
  witness — extract it, ship it, run it.
- A non-constructive proof tells the program the witness exists
  but offers no way to obtain it.

Verum's `verum extract` + program-extraction pipeline relies on
constructiveness. A `[T]` Theorem with classical-only proof
content extracts to the meta-theory but not to runnable code.

### 1.3 Constructiveness vs proof relevance

Constructiveness is *not* the same as the propositions-as-types
discipline of proof-relevance. A propositionally-relevant proof
may still be classical (using LEM internally); a constructive
proof may be propositionally-irrelevant (built in `Prop` rather
than `Set`/`Type`).

Verum carries both distinctions independently:

- Constructiveness lives on the C axis.
- Proof relevance lives in the universe-level discipline (`Type
  vs Prop`).

The two axes interact at extraction time: constructive +
relevant proofs extract cleanly; non-constructive + irrelevant
proofs do not extract at all. Refer to
[verification → program extraction](../../verification/program-extraction.md)
for the full extraction matrix.

## 2. Axis 2 — Verifiable (V)

A claim is **verifiable** when there is an effective procedure — a
type checker, a kernel, an SMT replay, a decision procedure —
that, given a candidate witness, decides whether it satisfies the
claim.

### 2.1 Range of verifiability

| Mode | Meaning | Verum surface |
|------|---------|---------------|
| **Present** | Algorithmic check, bounded time. | `Int { self > 0 }` — the SMT backend decides instances. |
| **Conditional** | Effective only under stated assumptions. | "Halting on terminating inputs" — conditional check. |
| **External** | Check delegated to a trusted external base. | `[P]` Postulate citing a published theorem. |
| **Absent** | No check, even partial. | A claim asserted without procedure. |

### 2.2 Verifiability is the audit substrate

Verifiability matters because the *audit* of a claim depends on
re-running the verifier. A claim that is constructive but not
verifiable is *useful* (the witness exists) but *unauditable* —
no third party can confirm it without re-deriving the witness.

This is why Verum's `[T]` Theorem status requires both C and V:
the theorem must be constructively provable *and* the proof must
be re-checkable by a procedure — typically the trusted kernel
following an SMT cert replay.

### 2.3 The verifier hierarchy

Verum's verification ladder (nine semantic strategies, see
[verification → gradual-verification](../../verification/gradual-verification.md))
is precisely a hierarchy of V:

- `runtime` — verifiability is "the assertion runs at runtime";
  weakest V.
- `static` — dataflow-level checks; type-level only.
- `fast` — bounded SMT.
- `formal` — portfolio SMT; the typical V for shipped code.
- `proof` — kernel-checked tactic proof.
- `thorough` / `reliable` / `certified` / `synthesize` —
  progressively stronger V.

A claim's *strongest V* is the strongest strategy that admits it.
Verum aggressively reports the strongest V for each artefact —
a claim that admits `formal` is recorded as such, not silently
demoted to `runtime`.

## 3. Axis 3 — Executable (E)

A claim is **executable** when the constructor reduces to runnable
machine code — bytecode, native, GPU kernel — without losing the
property the claim asserts.

### 3.1 Range of executability

| Mode | Meaning | Verum surface |
|------|---------|---------------|
| **Present** | Constructor extracts to a binary running at native (or near-native) speed. | A `@verify(formal)` function with `@extract(rust)`. |
| **Trivial** | Executability is not at issue; the claim is a definition or boundary. | `type X is …;` declaration. |
| **Absent** | Constructor exists in the meta-theory but does not reduce to runnable code. | Many classical-mathematics theorems whose proofs use AC. |

### 3.2 Executability lands verification

Executability is what makes verification *land in production*. A
proof certificate that does not reduce to executable code lives
forever in the proof corpus but never affects the running
program. Verum aggressively prefers C-and-V-and-E-positive
proofs because those are the ones that ship.

This is also why Verum's [program-extraction
pipeline](../../verification/program-extraction.md) is a
first-class subsystem rather than a side feature: the extraction
*is* the E axis made operational.

### 3.3 Executability vs efficiency

Executability is binary (does the program run? yes/no). Efficiency
is orthogonal — a slow program is still E-positive. Verum tracks
performance as a separate concern via the
[verification → performance](../../verification/performance.md)
gates.

## 4. Demonstrating the independence

The three axes' independence is demonstrable by exhibiting
artefacts at every interesting combination.

| C | V | E | Glyph | Real-world example |
|---|---|---|-------|--------------------|
| ✓ | ✓ | ✓ | `[T]` Theorem | A `@verify(certified)` function with extraction. |
| ✓ | trivial | ✓ | `[D]` Definition | `type DatabaseUrl is Text { … };`. |
| cond. | cond. | cond. | `[C]` Conditional | A kernel result that holds only on POSIX hosts. |
| ✓ | external | ✓ | `[P]` Postulate | Joux 2009 lower bound, cited but not internalised. |
| partial | absent | absent | `[H]` Hypothesis | An unproven design idea with a `@plan(...)` attribute. |
| absent | absent | absent | `[I]` Interpretation | Pure prose stub awaiting realisation. |
| ✓ | ✓ | absent | (rare) | Pencil-and-paper proof exposed in the corpus without extraction. |
| absent | ✓ | ✓ | (rare) | A computable check with no witness — e.g., a runtime assertion. |
| ✓ | absent | ✓ | (rare) | Code that runs but has no spec — typical "TODO: prove later". |

The "rare" rows are real but uncommon. The seven canonical
glyphs cover the *common* productive combinations; rare
combinations exist in the wild but typically migrate to one of
the canonical seven within the project's lifetime.

The simple test of independence: *exhibit two artefacts that
agree on two axes and disagree on the third.* All three axes
admit this, so all three are independent.

## 5. Cross-references

- [CVE overview](./overview.md) — the universal frame.
- [Seven configurations](./seven-configurations.md) — the
  truth-table semantics.
- [Seven canonical symbols](./seven-symbols.md) — the glyph
  reference.
- [Seven layers](./seven-layers.md) — the layered application.
- [Articulation hygiene](./articulation-hygiene.md) — CVE-L6
  self-application.
- [Lifecycle primitive](../primitives/lifecycle.md) — the ATS-V
  primitive that carries the seven glyphs.

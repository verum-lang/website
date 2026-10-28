---
sidebar_position: 10
title: "Separation logic"
description: "Exact heap ownership, supported separation assertions, and the boundary between SMT entailment and program verification."
slug: /verification/separation-logic
---

# Separation logic

Separation logic describes what a program owns in memory. A points-to
assertion owns one cell; separating conjunction combines assertions over
disjoint cells. This makes local reasoning possible: an operation can preserve
an unrelated region without describing every cell in that region.

Verum's SMT separation encoder checks implications between heap assertions.
It does not, by itself, verify execution of a function body or produce a
kernel-checked proof. This distinction matters when choosing the evidence
needed for a memory-safety claim.

## Heap assertions

The entailment backend is `verum_smt::separation_logic::SepLogicEncoder`.
It represents a partial heap using a value array and a Boolean allocation
map, both indexed by 64-bit addresses. Values are 64-bit words. Only
allocated cells belong to the heap.

The notation below describes logic, not executable Verum syntax.

| Assertion | Meaning |
|-----------|---------|
| `emp` | The owned domain is empty. |
| `x ↦ v` | The owned domain contains exactly `x`, whose value is `v`. |
| `P ∗ Q` | The entire owned domain splits into two disjoint parts satisfying `P` and `Q`. |
| `P ∧ Q`, `P ∨ Q` | Ordinary conjunction or disjunction on the same heap. |
| `pure(b)` | A Boolean proposition independent of heap ownership. It does not require an empty heap. |
| `∃x. P`, `∀x. P` | Quantification over word values, with lexical binding and shadowing. |
| `P −∗ Q` | Every disjoint extension satisfying `P` makes the combined heap satisfy `Q`. |
| Named predicate | An opaque relation of its name, all arguments and the owned heap. It cannot inspect unowned values. |

For example, `x ↦ a ∗ y ↦ b` requires distinct addresses and owns exactly
two cells. It does not entail `x ↦ a`: that conclusion would discard the
second owned cell. By contrast, `P ∗ emp` and `emp ∗ P` have the same
meaning as `P`. The partition witnesses are local to each assertion,
including assertions in the conclusion.

Repeated free variables retain their identity throughout an obligation.
Bound variables hide an outer variable only within their quantifier's body.
Named predicates have no implicit definition: assuming one predicate does
not establish a different name, different arguments or a particular shape.

## Scalar expressions and unsupported layouts

The encoder accepts Boolean logic, word equality and signed comparisons,
and word addition, subtraction, multiplication and negation. Arithmetic is
modulo the 64-bit word size. Integer literals must fit the signed 64-bit
range and be unsuffixed or explicitly `i64`. Other widths, unsigned suffixes,
unit suffixes, arbitrary calls and unsupported expression forms produce an
encoding error. A variable cannot be both a Boolean and a word in the same
obligation. These are the encoder's semantics, not a translation guarantee
for arbitrary source types or checked arithmetic.

The empty list-segment base case requires equal endpoints and an empty
heap. Nonempty list segments, trees, blocks and array segments lack an exact
layout/domain definition in this encoder and are rejected. Increasing an
unfolding budget does not supply that missing definition. Reaching a work
limit never replaces an unfinished assertion with `true`.

## Results and evidence

`verify_entailment` asks whether the antecedent and the negated conclusion
can both hold:

| Result | Interpretation |
|--------|----------------|
| `Valid` | The solver found the encoded counterexample condition unsatisfiable. |
| `Invalid` | The solver found a counterexample to the encoded implication. |
| `Unknown` | The solver could not decide, including timeout or incomplete theory support. |
| Encoding error | The assertion uses semantics the encoder cannot represent. |

The AST dispatcher in `verum_smt::separation_recognizer` maps encoding
errors to `Unknown`. A solver result is evidence about the encoded
assertions. Kernel certification additionally requires a proof of the same
proposition that the kernel checks.

## Source integration and local reasoning

The compiler's theorem path invokes the separation dispatcher. Its current
recognizer matches constructor spellings rather than resolved declaration
identities. A constructor-shaped call therefore does not establish that the
corresponding standard-library declaration owns its meaning. The theorem
path also has not established a complete separation-specific chain from
source declarations and program execution to replayable kernel evidence.
Do not interpret its success as a certified heap-manipulating function.

The `HeapPredicate` and `HoareTriple` carriers in `core/logic/separation.vr`
and `verum_kernel::separation_logic` describe assertions and triples. Their
existence does not establish lossless elaboration of text payloads, body
verification, or proof replay. Opaque text is not an executable heap model.

The frame rule preserves an unrelated heap region when an operation cannot
modify it. Applying that rule to real programs requires complete ownership
footprints and the operation's actual memory accesses. The existing
footprint helpers do not yet establish this for arbitrary layouts or named
predicates. General automatic framing and array-region proofs should not be
assumed from the core entailment support described here.

For ordinary program contracts, start with [Contracts](./contracts.md).
For proof evidence and its trust boundary, see [Trusted kernel](./trusted-kernel.md).

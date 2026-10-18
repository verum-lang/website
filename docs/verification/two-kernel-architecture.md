---
sidebar_position: 8
title: Differential Kernel Verification
description: Direct and NbE proof checking, a manifest-backed policy wrapper, and the scope of cross-implementation verification.
slug: /verification/two-kernel-architecture
---

# Differential Kernel Verification

Verum's registry runs multiple verification mechanisms over the same
certificate. The direct checker and the NbE checker use different
algorithms. The `kernel_v0` slot wraps the direct checker with additional
manifest and metatheory-policy checks. This distinction determines which
kinds of shared defects a comparison can expose.

## 1. Why multiple kernels?

Independent implementations can disagree because of a substitution,
conversion, typing or universe-handling defect. Comparing them on valid
and invalid certificates makes such disagreements reproducible.
Agreement does not rule out a shared specification error, shared helper
bug or an unexercised case.

The unit of comparison is a certificate in the supported fragment, not
every feature represented by the broader `verum_kernel` crate. A result
must identify the participating implementations and whether their checks
completed under the selected limits.

## 2. The trusted-base kernel — Algorithm A

`verum_kernel::proof_checker` checks a de Bruijn `Term` language with
dependent functions, dependent pairs, universe-level expressions and
identity types with the implemented transport eliminator. It performs
explicit shifting/substitution and conversion checking.

A closed `Certificate` contains the term and its claimed type.
`Certificate::verify` checks the claimed type and the term in the empty
context. Arbitrary SMT, refinement, cubical and framework-axiom nodes are
not part of this language. See the [rule reference](./trusted-kernel.md).

## 3. The NbE kernel — Algorithm B

`verum_kernel::proof_checker_nbe` checks the same term language using
Normalisation by Evaluation. Terms evaluate to values and closures;
quotation reconstructs normal forms for comparison.

The evaluation and binder-handling algorithms differ from the direct
checker. The implementations share syntax, level representations and
error types, including level helpers. Therefore a defect in shared
universe normalization can affect both. “Different algorithm” is a useful
engineering property, not a claim of complete implementation independence.

## 4. The kernel_v0 manifest verifier — Algorithm C

`KernelV0Kernel::verify` performs these operations:

1. Calls `Certificate::verify`, the direct checker.
2. Checks the bootstrap manifest's discharge-status policy.
3. Checks declared metatheory requirements against a configured ceiling.
4. Checks the corresponding strict-intrinsic dispatch results.

This wrapper can detect manifest or policy drift. It cannot independently
refute a wrong term verdict already shared with its first step. Nor does
it compile and run the Verum-language bootstrap corpus as a separate
proof checker. The label “Algorithm C” names a registry slot, not a third
independent implementation of conversion.

The authority is visible in
[`kernel_registry.rs`](https://github.com/verum-lang/verum/blob/main/crates/verum_kernel/src/kernel_registry.rs).

## 5. The differential gate

Run from a Verum checkout with the intended binary selected:

```bash
verum audit --differential-kernel --format json
```

The audit uses the canonical battery from
`verum_kernel::canonical_battery`. The registry reports unanimous
acceptance, unanimous rejection or disagreement with participating
checkers' diagnostics. The battery includes expected rejection cases:
accepting every input is a defect, not a successful audit.

`verum check-proof file.vproof` uses the direct checker. It does not
implicitly run the whole registry. Consumers requiring multiple checks
must invoke their selected comparison profile and retain its result.

An error from one checker can reflect unsupported input, a resource limit
or a policy restriction. Investigate the concrete outcome before asserting
that another checker accepted an invalid theorem. A malformed certificate
and a false mathematical proposition are also different claims.

## 6. Mutation-fuzz layer

```bash
verum audit --differential-kernel-fuzz --format json
```

The mutation audit explores changes to seed certificates and retains
counterexamples to agreement. Coverage depends on the seed corpus,
mutation operations and budget. A minimized disagreement is useful
regression evidence; absence of disagreement is not exhaustive verification
of the calculus or its implementations.

For the cross-language comparison:

```bash
verum audit --differential-lean-checker --format json
```

This runs an executable Verum reference checker authored in Lean. It is
different from proving the checker sound in Lean, and different again from
exporting each Verum proof as a derivation in Lean's own type theory.
See [the Lean comparison protocol](../architecture/differential-lean-checker.md).

## 7. Liveness pin — the audit's own check

A deliberately always-accept checker is a useful test double: it must
disagree on rejecting controls. This checks that the harness compares
actual outcomes. Positive controls additionally prevent a broken
always-reject implementation from appearing successful.

Keep these controls separate from the production authority. A test double
may exercise the audit; it must never contribute a vote that authorizes
a theorem.

## 8. Why this matters in practice

For a theory-management system, a comparison receipt identifies an artifact,
the mechanisms that checked it, their results and any disagreement. It
supports precise regression reports and rechecking after a checker update.
The [Noesis profile](./knowledge-systems.md) keeps this evidence separate
from foundation assumptions and translation claims.

This technique has precedents. Lean's own documentation describes
independent checker implementations; Verum's contribution must be judged
by its implemented coverage and useful integration, rather than a claim
that other systems lack independent checking.
[Lean's kernel documentation](https://lean-lang.org/doc/reference/latest/Elaboration-and-Compilation/).

## 9. The trust delegation

Each accepted certificate remains conditional on the selected checker's
correctness, the decoder and execution environment. Comparing algorithms
reduces exposure to some implementation mistakes. It does not remove shared
code, compiler or hardware dependencies, and does not prove correspondence
between the formal statement and the intended external claim.

Manifest entries and framework citations document additional assumptions;
they cannot substitute for a missing derivation. Keep proof checking,
assumption inventories and compilation-preservation evidence distinct.

## 10. Self-hosting contract

A self-hosted checker would need an executable implementation in Verum,
a pinned bootstrap/compiler path, and comparison tests over the same
certificate language. Its own compilation and metatheory would still
require an explicit trust argument. The existing manifest wrapper does
not establish those properties by reading Verum-authored declarations.

## 11. Cross-references

- [Proof-term rules](./trusted-kernel.md)
- [Kernel trust boundaries](../architecture/trusted-kernel.md)
- [In-process differential protocol](../architecture/three-kernel-differential.md)
- [External-prover replay](../architecture/external-prover-verification.md)
- [Knowledge-system verification profile](./knowledge-systems.md)

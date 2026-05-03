---
sidebar_position: 8
title: "Three-kernel architecture"
description: "Verum ships three independent kernel implementations with continuous differential testing — a structural defence against kernel-implementation bugs that single-kernel systems cannot match."
slug: /verification/two-kernel-architecture
---

# Three-kernel architecture

Verum's trusted base ships **three independent kernel
implementations**, all of which check every certificate in the
proof corpus, with a **differential testing** layer that fails
the audit the moment any pair disagrees. This is a structural
property distinguishing Verum from Coq, Lean, HOL Light,
Isabelle, and every other production proof assistant — all of
which run a single kernel.

This page explains why the multi-kernel architecture matters,
how it is implemented, and how to read the differential-test
verdicts.

## 1. Why multiple kernels?

A proof assistant's *trusted computing base* is the code whose
correctness must be assumed for soundness to follow. In a
single-kernel system, the entire trust depends on:

1. The mathematical correctness of the inference rules.
2. The faithfulness of the implementation to those rules.

Mistakes in (1) — bugs in the *theory* — are caught by careful
peer review of the rule list. Mistakes in (2) — bugs in the
*implementation* — are far harder to catch. A subtly wrong
substitution function, an off-by-one in universe levels, a
mishandled binder under capture-avoiding rename — these errors
are *invisible* to peer review of the rules and *invisible* to
test suites that only exercise the kernel's positive path
(theorems that should accept). They surface only when:

- A maliciously crafted input exposes the bug.
- A *different* implementation of the same rules happens to
  agree where the buggy implementation accepts (false positive)
  or rejects (false negative).

Verum's multi-kernel architecture addresses (2) directly. Every
certificate is checked by **three implementations following
orthogonal algorithmic specifications**:

- The **trusted-base kernel** (Algorithm A) — an LCF-style
  implementation performing direct rule-matching with explicit
  substitution.
- The **NbE kernel** (Algorithm B) — a normalisation-by-evaluation
  implementation that compiles terms into a semantic value
  representation and checks via β-reduction in the value world.
- The **kernel_v0 manifest verifier** (Algorithm C) — a
  manifest-driven bootstrap kernel that anchors structural
  type-checking, audit-cleanness of every kernel rule's
  discharge status, the meta-soundness footprint, and per-rule
  strict-intrinsic dispatch.

If all three accept, the certificate is sound *with respect to
three independent algorithmic implementations*. If any pair
disagrees, exactly one of them has a bug, and the bug is
reproducible.

## 2. The trusted-base kernel — Algorithm A

The trusted-base kernel lives in `verum_kernel::proof_checker`
and implements roughly thirty inference rules covering Π / Σ /
Path / Refine / Quotient / Inductive / SMT-replay / Framework-axiom
/ Universe-ascent. The implementation is **direct**:

- Terms are explicit syntax trees.
- Substitution is α-renaming with capture avoidance.
- Conversion checks reduce both sides to weak head normal form
  via direct one-step β.
- Universe checks compare De Bruijn levels.

The implementation is intentionally *boring*: every rule maps to
roughly one Rust function, every function is ≤ 100 lines, every
substitution and binder operation is hand-written. The full
kernel is targeting a small enough footprint that an external
auditor can read it end to end.

This is the *authoritative* implementation. The discharge
manifest, the rule list, the framework-axiom roster, and the
audit reports all reference this kernel as the reference
specification.

## 3. The NbE kernel — Algorithm B

The NbE kernel lives in `verum_kernel::proof_checker_nbe` and
implements the *same* fragment via a *different* algorithmic
shape:

- Terms are evaluated into a semantic `Value` type (`VPi`,
  `VLam`, `VSigma`, `VPair`, neutral applications).
- Closures capture the environment of free variables at the
  point of binder traversal.
- β-reduction happens in the value world: `apply_value(VLam(c),
  arg)` extends the closure's environment and evaluates the
  body.
- Conversion is checked by `quote(value, level)`: re-reads the
  value back into a normal-form term, using level-to-De-Bruijn
  conversion.

The two syntactic-vs-semantic kernels share *no code* beyond the
syntax-tree definitions. Every algorithmic decision — binder
traversal, β-reduction order, universe-level handling — is
independently implemented.

## 4. The kernel_v0 manifest verifier — Algorithm C

The third slot, `verum_kernel::kernel_registry::KernelV0Kernel`,
takes a structurally orthogonal stance. Rather than re-deriving
each rule from term syntax, it verifies four meta-anchors that
together pin down the kernel's discharge surface:

1. **Structural type-check.** The certificate must pass
   `Certificate::verify`, which is the same anchor every kernel
   shares.
2. **Manifest audit-cleanness.** Every rule in the
   `kernel_v0_manifest` must carry an audit-clean
   `DischargeStatus` (Discharged or DischargedByFramework).
   An admit or unattested rule fails the slot.
3. **Meta-soundness ceiling.** The
   `kernel_meta_soundness_holds` predicate must hold — i.e. the
   kernel's reflective footprint stays within ZFC + 2 inaccessibles
   and every kernel rule is cited by the meta-soundness theorem.
4. **Per-rule strict-intrinsic dispatch.** For each
   `KernelRuleId`, the matching `kernel_<tag>_strict` intrinsic
   must dispatch to a positive `Decision { holds: true }`.

Because Algorithm C does not re-implement substitution or
β-reduction, it cannot drift in the same direction as Algorithms
A or B. A bug in any of those algorithms surfaces as a structural
disagreement; a bug in the manifest's discharge status, the
meta-soundness footprint, or the strict intrinsics surfaces as a
slot-C-only failure. The orthogonality is the point.

This slot also closes the bootstrap loop: kernel_v0 verifies the
manifest that every other kernel cites, and the manifest is
itself a Verum-side artefact authored in `core/verify/kernel_v0/`.
Algorithm C is the place where the Verum-self-hosted material
becomes load-bearing in the differential gate.

## 5. The differential gate

`verum audit --differential-kernel` runs every kernel rule's
canonical certificate through *all three* kernels and reports
per-rule agreement.

```text
$ verum audit --differential-kernel

  rule              proof_checker  proof_checker_nbe  kernel_v0    agreement
  K-Pi-Form         accept         accept             accept       Unanimous   ✓
  K-Pi-Intro        accept         accept             accept       Unanimous   ✓
  K-Sigma-Form      accept         accept             accept       Unanimous   ✓
  K-Path-Form       accept         accept             accept       Unanimous   ✓
  K-Refine          accept         accept             accept       Unanimous   ✓
  K-Universe        accept         accept             accept       Unanimous   ✓
  K-Quotient        accept         accept             accept       Unanimous   ✓
  K-SMT-Replay      accept         accept             accept       Unanimous   ✓
  K-Framework-Axiom accept         accept             accept       Unanimous   ✓
  K-NormalForm      accept         accept             accept       Unanimous   ✓

  10 / 10 Unanimous
  0 disagreements
  duration: 0.5s
  verdict: load-bearing
```

The four possible outcomes per rule:

- **Unanimous accept** — all kernels admit. ✓ — load-bearing.
- **Unanimous reject** — all kernels reject. ✓ — intentional
  negative. Used by liveness-pin synthetic kernels.
- **Disagreement** — at least one kernel diverges. ✗ — *fails
  the audit immediately*. This is a kernel-implementation bug
  (or a manifest/meta-soundness drift in slot C).
- **NotYetSelfHosting** — observability only. The Verum-source
  self-hosted parser-blocker has been resolved; this status is
  retained for transitional Verum-side artefacts that have yet
  to land their differential entrypoint.

A `Disagreement` is the most severe verdict in the entire audit
infrastructure. It indicates that one of the three reference
implementations has a soundness bug, and *which* one is
empirically distinguishable: re-run the certificate, inspect
which kernel's verdict matches the rule specification, and
identify the bug.

## 6. Mutation-fuzz layer

A static differential test on canonical certificates is good but
not sufficient — bugs typically hide in non-canonical inputs. The
**mutation-fuzz layer** (`verum audit --differential-kernel-fuzz`)
sits atop the differential gate and runs an 11-variant mutation
grammar:

| Mutation | What it does |
|----------|--------------|
| Universe lift +1 / +2 / +3 | bumps universe levels |
| Term replace | substitutes a subterm with a random closed term |
| Type replace | substitutes a type with a random type |
| Free-var inject | introduces a fresh free variable |
| App-to-non-fn | applies a non-function in function position |
| Lambda wrap | wraps a term in `λx. _` |
| Term swap | swaps two random subterms |
| Type swap | swaps two random types |
| Pi binder rewrite | renames a Π-bound variable |
| Lam binder rewrite | renames a λ-bound variable |

Each mutant is run through *every* registered kernel. The
property invariant: every mutant produces unanimous agreement
across all kernels. *Any* disagreement is a kernel bug.

The campaign is bounded (default 500 iterations) and uses a
deterministic xorshift64* seed, so disagreements are reproducible
across runs. Auditors who suspect a kernel bug re-run with the
same seed and inspect the failing mutant.

## 7. Liveness pin — the audit's own check

The mutation-fuzz layer can silently degrade if the kernels are
too lenient. Verum's liveness pin: a **synthetic always-accept
kernel** is registered alongside the real three. The synthetic
kernel admits *every* certificate without checking. The audit's
property invariant is that the synthetic kernel will *disagree*
with the real kernels on certificates the real kernels reject.

If `verum audit --differential-kernel-fuzz` ever reports zero
disagreements *while the synthetic is registered*, the audit
infrastructure itself has a bug — the gate is not noticing the
synthetic accepting things it should not. The pin makes the
gate *non-vacuous* by construction.

This is the discipline that distinguishes a load-bearing audit
from an observational one: the audit checks itself.

## 8. Why this matters in practice

A few concrete attack surfaces the multi-kernel architecture
defends against:

- **A subtle bug in capture-avoiding substitution.** Suppose the
  trusted-base kernel mishandles substitution under a binder in
  a way that lets a free variable become bound. The bug would be
  invisible in a single-kernel system; in Verum, the NbE kernel
  performs substitution implicitly via closure environment
  extension and would not exhibit the same bug. The two would
  disagree on the offending certificate.

- **An off-by-one in universe-level checking.** A direct
  implementation that compares `lvl1 < lvl2` where the
  specification requires `lvl1 ≤ lvl2` would silently admit a
  program that should be rejected. The NbE kernel's
  level-to-De-Bruijn quote function would not exhibit the same
  off-by-one. The two would disagree.

- **A buggy reduction strategy.** A direct implementation that
  performs call-by-name reduction where the specification
  requires call-by-value (or vice versa) would diverge from the
  NbE kernel's lazy/eager closure semantics. The two would
  disagree.

- **A drifted manifest discharge.** Suppose a kernel rule's
  discharge status quietly degrades from `Discharged` to
  `AdmittedWithIou` without being re-attested. Algorithms A and
  B keep accepting the certificate (the runtime rules are
  unchanged), but Algorithm C's manifest audit-cleanness anchor
  rejects it — the slot-C-only disagreement surfaces the drift.

These are not hypothetical bugs; they are the kinds of mistakes
that have shipped in production proof assistants historically.
The multi-kernel architecture catches them at audit time.

## 9. The trust delegation

Verum does not claim that all three kernels are bug-free. It
claims:

> If all three kernels accept a certificate, the certificate is
> sound with respect to three independent algorithmic
> implementations of the rules. A bug present in all three
> implementations would have to be a bug *in the rule
> specification itself* — the kind of bug peer review of the
> rule list catches.

The multi-kernel architecture is *not* a substitute for careful
specification and peer review of the rule list. It is a
*structural defence* against implementation drift. The two
layers combine: the rule specification is reviewed; the
implementations are differentially fuzzed.

## 10. Self-hosting roadmap

The third slot landing closes the original parser-blocker on
the Verum-self-hosted bootstrap path:

- `core/verify/kernel_v0/` carries Verum-source descriptions of
  every kernel rule, with manifest entries listing each rule's
  required meta-theory.
- The `verum audit --kernel-v0-roster` gate verifies the
  manifest matches the filesystem.
- `KernelV0Kernel` (Algorithm C) registers as the third
  differential slot and consumes the manifest as load-bearing
  evidence.

Future work continues to push more of the kernel surface into
Verum-source: re-implementing Algorithms A or B in `.vr` and
adding them as additional differential slots. The registry
infrastructure is unbounded; it accepts any number of
`KernelChecker` impls and aggregates a unanimous-or-disagreement
verdict.

## 11. Cross-references

- [Trusted kernel](./trusted-kernel.md) — the LCF-style
  trusted-base specification.
- [kernel_v0 roster](./kernel-v0.md) — the Verum-source bootstrap
  manifest that Algorithm C consumes.
- [Soundness gates](./soundness-gates.md) — the predicate-level
  formalisation of the differential gate's verdict.
- [Audit protocol](../architecture-types/audit-protocol.md) —
  how to run the differential gate as part of the bundle.
- [Reflection tower](./reflection-tower.md) — the
  ordinal-indexed meta-soundness layer atop the kernels.
- [Framework axioms](./framework-axioms.md) — the citation
  inventory the kernels share.

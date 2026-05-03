---
sidebar_position: 8
title: "Two-kernel architecture"
description: "Verum is the first production proof assistant to ship two algorithmic kernels with continuous differential testing — a defence against kernel-implementation bugs that single-kernel systems cannot match."
slug: /verification/two-kernel-architecture
---

# Two-kernel architecture

Verum's trusted base ships **two independent kernel
implementations**, both of which check every theorem in the proof
corpus, with a **differential testing** layer that fails the audit
the moment they disagree. This is a structural property
distinguishing Verum from Coq, Lean, HOL Light, Isabelle, and
every other production proof assistant — all of which run a
single kernel.

This page explains why the two-kernel architecture matters, how
it is implemented, and how to read the differential-test
verdicts.

## 1. Why two kernels?

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

Verum's two-kernel architecture addresses (2) directly. Every
certificate is checked by **two implementations following
different algorithmic specifications**:

- The **trusted-base kernel** — an LCF-style implementation
  performing direct rule-matching with explicit substitution.
- The **NbE kernel** — a normalisation-by-evaluation
  implementation that compiles terms into a semantic value
  representation and checks via β-reduction in the value world.

If both accept, the certificate is sound *with respect to both
implementations*. If they disagree, exactly one of them has a
bug, and the bug is reproducible.

## 2. The trusted-base kernel

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
kernel is targeting < 5 KLOC, small enough that an external
auditor can read it end to end.

This is the *authoritative* implementation. The discharge
manifest, the rule list, the framework-axiom roster, and the
audit reports all reference this kernel as the reference
specification.

## 3. The NbE kernel

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

The two kernels share *no code* beyond the syntax-tree
definitions. Every algorithmic decision — binder traversal,
β-reduction order, universe-level handling — is independently
implemented.

## 4. The differential gate

`verum audit --differential-kernel` runs every kernel rule's
canonical certificate through *both* kernels and reports per-rule
agreement.

```text
$ verum audit --differential-kernel

  rule              base-verdict   nbe-verdict   agreement
  K-Pi-Form         accept         accept        BothAccept   ✓
  K-Pi-Intro        accept         accept        BothAccept   ✓
  K-Sigma-Form      accept         accept        BothAccept   ✓
  K-Path-Form       accept         accept        BothAccept   ✓
  K-Refine          accept         accept        BothAccept   ✓
  K-Universe        accept         accept        BothAccept   ✓
  K-Quotient        accept         accept        BothAccept   ✓
  K-SMT-Replay      accept         accept        BothAccept   ✓
  K-Framework-Axiom accept         accept        BothAccept   ✓
  K-NormalForm      accept         accept        BothAccept   ✓

  10 / 10 BothAccept
  0 disagreements
  duration: 0.4s
  verdict: load-bearing
```

The four possible outcomes per rule:

- **BothAccept** — both kernels admit. ✓ — load-bearing.
- **BothReject** — both kernels reject. ✓ — intentional negative.
  Used by liveness-pin synthetic kernels.
- **Disagreement** — exactly one accepts. ✗ — *fails the audit
  immediately*. This is a kernel-implementation bug.
- **NotYetSelfHosting** — observability only. The Verum-side
  self-hosted kernel slot has no certificate available yet
  (transitional during bootstrap).

A `Disagreement` is the most severe verdict in the entire audit
infrastructure. It indicates that one of the two reference
implementations has a soundness bug, and *which* one is
empirically distinguishable: re-run the certificate, inspect
which kernel's verdict matches the rule specification, and
identify the bug.

## 5. Mutation-fuzz layer

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
between kernels. *Any* disagreement is a kernel bug.

The campaign is bounded (default 500 iterations) and uses a
deterministic xorshift64* seed, so disagreements are reproducible
across runs. Auditors who suspect a kernel bug re-run with the
same seed and inspect the failing mutant.

## 6. Liveness pin — the audit's own check

The mutation-fuzz layer can silently degrade if the kernels are
too lenient. Verum's liveness pin: a **synthetic always-accept
kernel** is registered alongside the real two. The synthetic
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

## 7. Why this matters in practice

A few concrete attack surfaces the two-kernel architecture
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

These are not hypothetical bugs; they are the kinds of
mistakes that have shipped in production proof assistants
historically. The two-kernel architecture catches them at audit
time.

## 8. The trust delegation

Verum does not claim that *both* kernels are bug-free. It claims:

> If both kernels accept a certificate, the certificate is sound
> with respect to two independent algorithmic implementations of
> the rules. A bug present in *both* implementations would have
> to be a bug *in the rule specification itself* — the kind of
> bug peer review of the rule list catches.

The two-kernel architecture is *not* a substitute for careful
specification and peer review of the rule list. It is a *
structural defence* against implementation drift. The two layers
combine: the rule specification is reviewed; the implementations
are differentially fuzzed.

## 9. Self-hosting roadmap

The differential-kernel gate currently runs *Rust-vs-Rust* — both
kernels are Rust implementations. A future step is **self-hosting
the kernel in Verum**: re-implementing the kernel in `.vr` source
and adding it as a third differential slot.

The current state of self-hosting:

- `core/verify/kernel_v0/` carries Verum-source descriptions of
  every kernel rule, with manifest entries listing each rule's
  required meta-theory.
- The `verum audit --kernel-v0-roster` gate verifies the manifest
  matches the filesystem.
- The `verum audit --differential-kernel` gate registers a
  Verum-self-hosted slot, currently reporting
  `NotYetSelfHosting` until the parser-blocker is resolved.

When self-hosting lands, the differential gate will lift from
two-kernel to three-kernel — one Rust implementation, one Verum
implementation, and the Rust NbE implementation. The audit
verdict will continue to be load-bearing only when all three
agree.

## 10. Cross-references

- [Trusted kernel](./trusted-kernel.md) — the LCF-style
  trusted-base specification.
- [Soundness gates](./soundness-gates.md) — the predicate-level
  formalisation of the differential gate's verdict.
- [Audit protocol](../architecture-types/audit-protocol.md) —
  how to run the differential gate as part of the bundle.
- [Reflection tower](./reflection-tower.md) — the
  ordinal-indexed meta-soundness layer atop the kernels.
- [Framework axioms](./framework-axioms.md) — the citation
  inventory the kernels share.

---
sidebar_position: 12
title: Three-Kernel Differential
description: "N-way agreement gate over the canonical 24-cert battery: Slot A (proof_checker bidirectional + WHNF), Slot B (proof_checker_nbe Normalisation by Evaluation), Slot C (kernel_v0 manifest-driven verifier).  Three structurally-distinct algorithms in Rust must agree cert-by-cert; disagreement fails the audit."
---

# Three-Kernel Differential

> Status: load-bearing CI gate.  The 24-cert canonical battery is
> run through three structurally-distinct in-process kernels on
> every release; pairwise verdict disagreement fails the audit.

## 1. Why this gate exists

The kernel-soundness pipeline checks **theorem statement
well-formedness** across three foundations
([Lean / Coq / Isabelle](./external-prover-verification.md)).
The differential Lean-checker gate checks **runtime kernel verdicts
against an independent Lean re-implementation
cross-language**
([differential-lean-checker](./differential-lean-checker.md)).

Neither of those checks the question:

> *Are the multiple Rust-side kernel implementations consistent
> with each other?*

The trusted base ([`proof_checker.rs`](./trusted-kernel.md)) does
bidirectional type-checking with explicit substitution + WHNF.
But Verum ships **two more** in-process kernels:

* **`proof_checker_nbe.rs`** — Normalisation by Evaluation.
  Closure-based semantic evaluation + level-indexed quote.
  Different algorithm; same input/output relation.
* **`kernel_v0` manifest verifier** — anchors on the trusted base's
  structural verdict, then performs **orthogonal** meta-soundness
  checks: every `kernel_v0` rule must be audit-clean, the
  meta-soundness footprint must fit `ZFC + 2 strongly-inaccessibles`,
  every per-rule strict-intrinsic must dispatch positively through
  the canonical registry.

Three independent algorithms checking the same canonical battery
catch a different bug class than three foundations checking the
same theorem statements.  A wrong de Bruijn shift in Slot A
agrees with itself; differential-checking against Slot B (which
uses closures, not de Bruijn substitution) catches it.

See [§4](#4-bug-class-this-gate-is-designed-to-catch) for the
representative bug class this design surfaces.

## 2. The three kernels

| Slot | Path | Algorithm |
|------|------|-----------|
| **A** | `crates/verum_kernel/src/proof_checker.rs` | Bidirectional type-checking with explicit substitution + WHNF.  ~1067 LOC.  The trusted base. |
| **B** | `crates/verum_kernel/src/proof_checker_nbe.rs` | Normalisation by Evaluation with closures + level-indexed quote.  ~720 LOC.  Structurally distinct from Slot A. |
| **C** | `crates/verum_kernel/src/kernel_registry.rs::KernelV0Kernel` | Manifest-driven meta-soundness verifier.  Anchors on Slot A's structural verdict, then walks the kernel-v0 rule registry asserting audit-cleanness + meta-soundness footprint + strict-intrinsic dispatch. |

The default `KernelRegistry` registers all three.  Adding a fourth
slot (e.g., a future HOAS-based checker) is one line.

## 3. The canonical battery

A single 24-cert library
(`crates/verum_kernel/src/canonical_battery.rs::canonical_battery`)
is the source of truth for **every** kernel-differential audit.
Both this gate and `--differential-lean-checker` consume it; the
former runs it through Slot A / B / C, the latter through the Rust
kernel + the Lean ReferenceChecker exe.  One battery, two
gates, complementary coverage.

The battery covers:

| Section | Cert IDs | Kernel rules exercised |
|---------|----------|------------------------|
| Universe formation | `univ-0-in-1`, `univ-5-in-6`, `univ-mismatch` | T-Univ + universe-tower-top boundary |
| Variable lookup | `var0-empty-ctx-fails` | T-Var (negative) |
| Identity | `id-at-univ0`, `id-at-univ0-wrong-claim`, `id-at-univ3`, `id-arrow` | T-Lam-Intro + T-Var |
| Polymorphic identity | `poly-id-shape`, `nested-lam-correct` | T-Lam-Intro + T-Var (depth 2) |
| Pi formation | `pi-univ-univ`, `pi-takes-max`, `high-pi`, `nested-pi` | T-Pi-Form |
| Application | `app-domain-mismatch`, `app-non-function`, `nested-app-domain-mismatch` | T-App-Elim |
| Universe-overflow boundary | `defect-2-univ-max-overflows`, `defect-2-univ-max-minus-one-ok` | `Universe(u32::MAX)` rejection + tower-top escape hatch |
| Claimed-type validation | `defect-4-claimed-is-value` | `claimed_type` must itself be a type |
| Const function | `const-fn` | T-Lam-Intro depth 2 |
| Deep binder | `deep-var` | T-Var depth 3 |
| η-redex | `eta-via-id-application` | T-Conv via η |
| Type mismatch | `id-claimed-as-universe` | T-Conv (negative) |

Total: 24 certs.  Adding a new entry pins a regression for every
kernel — the cert flows through Slot A / B / C and through the
Lean ReferenceChecker automatically.

## 4. Bug class this gate is designed to catch

The differential pattern catches algorithmic bugs visible only when
two structurally-different kernels disagree on the same input.
A representative case the gate caught at first run: the NbE kernel
(Slot B) accepted `Universe(u32::MAX) : Universe(0)` because its
`Term::Universe(n)` arm used naive `n + 1` arithmetic, wrapping to
0 in release builds — while the bidirectional kernel (Slot A)
correctly rejected with `UniverseOverflow`.

The fix in NbE mirrors the bidirectional kernel's overflow check
verbatim (`checked_add(1)` returning a structured error on
overflow), and the boundary case is now pinned in
`canonical_battery::tests::nbe_kernel_matches_expected_verdicts`.

A bug that would have shipped in the NbE algorithm's release build was
caught at the first run of the differential gate against the
canonical battery.

## 5. Running locally

```bash
# Default — runs all three kernels, prints per-cert verdict matrix.
verum audit --differential-kernel

# JSON output for machine consumption.  Report written to
# target/audit-reports/differential-kernel.json.
verum audit --differential-kernel --format json
```

No external dependencies — all three kernels are in-process Rust.
Runs in ~5ms on the canonical battery.

## 6. Wiring in CI

Part of `verum audit --bundle` (the umbrella audit).

```yaml
- name: Three-kernel differential
  run: verum audit --differential-kernel
```

CI failure mode: the report enumerates each disagreeing cert with
which kernels accepted vs rejected.  Debug investigation:

1. Read the cert's `term` and `claimed_type` from the kernel-side
   battery (`canonical_battery::canonical_battery`).
2. Step the disagreeing kernels independently.  Each kernel has
   its own `verify` entry point; mark the failing reduction step.
3. The kernel that produces the *wrong* verdict per the typing
   rules (`docs/research/proof-tree-formalization.md`) is the bug.

## 7. Maintenance

When **adding a cert** to the canonical battery:

1. Append a `CanonicalCert::build(id, term, claimed_type)` to
   `canonical_battery::canonical_battery()`.
2. Add the cert's ID to `expected_verdict()`.
3. Run `verum audit --differential-kernel` and
   `verum audit --differential-lean-checker`.  Both gates must
   reach unanimous agreement before merge.

When **finding a kernel disagreement**:

1. Audit the report to see *which* slot disagrees.
2. Cross-reference Slot A's verdict against the typing rules —
   Slot A is the trusted base, so it should be right unless the
   typing rules themselves changed.
3. Fix the misbehaving slot.  Document the defect in the audit
   ledger (`docs/architecture/verum-kernel-audit.md`).
4. Confirm the disagreement flips to unanimous.

## 8. Cross-references

- [Trusted Kernel](./trusted-kernel.md) — Slot A.
- [Differential Lean Checker](./differential-lean-checker.md) —
  the cross-language complement (Rust kernel ↔ Lean
  ReferenceChecker over the same canonical battery).
- [External-Prover Verification](./external-prover-verification.md)
  — the meta-theory shape gate (theorem statements typecheck across
  three foundations).
- [`verum audit` CLI surface](../tooling/cli.md#kernel-soundness-band-12-gates)
  — full audit-flag table.

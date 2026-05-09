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

> *Are the multiple in-process kernel implementations consistent
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

| Slot | Algorithm |
|------|-----------|
| **A** | Bidirectional type-checking with explicit substitution + WHNF (`proof_checker.rs`).  The trusted base. |
| **B** | Normalisation by Evaluation with closures + level-indexed quote (`proof_checker_nbe.rs`).  Structurally distinct from Slot A. |
| **C** | Manifest-driven meta-soundness verifier (`kernel_v0`).  Anchors on Slot A's structural verdict, then walks the bootstrap rule registry asserting audit-cleanness + meta-soundness footprint + strict-intrinsic dispatch. |

The default `KernelRegistry` registers all three.  Adding a fourth
slot (e.g., a future HOAS-based checker) is one line.

## 3. The canonical battery

A single 24-cert library — the canonical-battery registry — is
the source of truth for **every** kernel-differential audit.
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
Two representative cases the gate caught:

1. **Universe overflow at the tower top.** The NbE kernel (Slot B)
   accepted `Universe(u32::MAX) : Universe(0)` because its
   `Term::Universe(n)` arm used naive `n + 1` arithmetic, wrapping
   to 0 in release builds — while the bidirectional kernel (Slot A)
   correctly rejected. Both kernels now route through
   `Level::checked_succ`, returning `None` (→ `UniverseOverflow`)
   when the concrete carrier hits `u32::MAX`. Symbolic carriers
   (`Var`/`Succ`/`Max`) are unbounded so overflow is impossible by
   construction.

2. **App on a non-function head.** The NbE kernel accepted
   `App(Universe(MAX-1), x) ≡ Universe(MAX-1)` because
   `apply_value`'s fallback silently dropped the application. Slot A
   rejected via `NotAFunction`; Slot B's silent collapse gave a
   false accept. Fixed by introducing `Neutral::NStuck(Box<Value>)`:
   non-function heads wrap as `NApp(NStuck(f), x)` so `def_eq` sees
   the application structurally and never equates `App(stuck, x)`
   with bare `stuck`. The same gate now wraps `Fst`/`Snd` and
   `J(_, _, scrutinee)` on non-canonical scrutinees.

In both cases the bug would have shipped silently in NbE's release
build. The differential gate caught them at the first run against
the canonical battery; both edge cases are now pinned regression
tests + property-fuzz invariants.

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
   battery (the canonical-battery registry).
2. Step the disagreeing kernels independently.  Each kernel has
   its own `verify` entry point; mark the failing reduction step.
3. The kernel that produces the *wrong* verdict per the typing
   rules (`docs/research/proof-tree-formalization.md`) is the bug.

## 7. Maintenance

When **adding a cert** to the canonical battery:

1. Append a `CanonicalCert::accept(id, term, claimed_type)` (or
   `::reject(...)`) to the canonical-battery registry.  Each
   cert carries its expected outcome via the
   `expected_outcome: bool` field, so there is no parallel
   verdict-table to keep in sync.
2. Run `verum audit --differential-kernel` and
   `verum audit --differential-lean-checker`.  Both gates must
   reach unanimous agreement, AND the per-kernel sanity tests
   must agree with `cert.expected_outcome`, before merge.

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
  the cross-language complement (trusted-base kernel ↔ Lean
  ReferenceChecker over the same canonical battery).
- [External-Prover Verification](./external-prover-verification.md)
  — the meta-theory shape gate (theorem statements typecheck across
  three foundations).
- [`verum audit` CLI surface](../tooling/cli.md#kernel-soundness-band-12-gates)
  — full audit-flag table.

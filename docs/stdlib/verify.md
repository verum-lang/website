---
sidebar_position: 32
title: verify
description: First-class verification API for user code — embed compiler-internal verification into Verum programs as ergonomic types + macros + queries.
status: regression-only
---

import StdlibStatus from '@site/src/components/StdlibStatus';

# `core.verify` — Verification embedding API

<StdlibStatus status="regression-only" />

`core.verify` is the user-facing entry point for embedding
verification into Verum programs. It is the stdlib complement to
the compiler's internal verification pipeline (SMT dispatch, proof
extraction, kernel replay, certificate export).

## Design philosophy

The compiler owns the verification pipeline; this module exposes a
narrow, ergonomic API on top so user code can:

1. **Invoke verification at value level** — `assert_verified!(x > 0)`
   checks at compile-time under `@verify(proof)` semantics.
2. **Carry verification-status witnesses in types** — `Verified<T>` /
   `Proven<P>` annotations encode "this value has been proved to
   satisfy P".
3. **Query the current verification level / strategy** — library
   code that should behave differently at proof-level vs runtime-
   level can branch on it.
4. **Attach verification directives at value-position** —
   `@verify(strategy)` / `@trigger(pattern)` / attributes
   composable from user code.

## Layout

| File | What's in it |
|---|---|
| `mod.vr` | re-exports + user-facing surface |
| `level.vr` | `VerificationLevel` enum + level-aware predicates |
| `attempt.vr` | `attempt_verify` / `VerificationOutcome` + retry helpers |
| `certificate.vr` | proof certificates (`Certificate`, `SerializedCertificate`) |
| `coherence.vr` | implementation-coherence checks (overlap, orphan rule) |
| `kernel_v0/` | trusted kernel — minimal proof-checker (read-only at user side) |
| `kernel_soundness/` | meta-theorem registry — soundness proofs of the kernel rules themselves |
| `codegen_soundness/` | meta-theorem registry — soundness proofs of codegen passes |
| `separation_soundness/` | meta-theorem registry — separation-logic soundness |
| `kernel_self_soundness/` | meta-theorem registry — kernel's self-soundness |
| `proof_term_examples/` | corpus of canonical proof terms |

## Verification levels

```verum
// Twelve levels on one ordinal ladder, not four. There is no `Off`:
// `Runtime` (ν = 0) is the floor, and it still checks — dynamically.
public type VerificationLevel is
    | Runtime          // ν = 0     — dynamic check
    | Static           // ν = 1     — dataflow / CBGR / const fold
    | Fast             // ν = 2     — bounded single-solver SMT
    | Formal           // ν = ω     — full SMT portfolio
    | Proof            // ν = ω+1   — tactic proof + kernel re-check
    | Thorough         // ν = ω·2   — formal + invariant obligations
    | Reliable         // ν = ω·2+1 — thorough + cross-solver agreement
    | Certified        // ν = ω·2+2 — reliable + certificate export
    | CoherentStatic   // ν = ω·2+3 — α-cert + symbolic ε-claim
    | CoherentRuntime  // ν = ω·2+4 — α-cert + runtime ε-monitor
    | Coherent         // ν = ω·2+5 — α/ε bidirectional check
    | Synthesize;      // ν ≤ ω·3+1 — inverse search across 𝔐
```

`Refinement` and `Termination` are not levels — refinement checking
happens from `Static` upward, and termination obligations arrive with
`Thorough`.

The level is set at the manifest layer (`[verification].level = "proof"`).
There is no `current_level()` to read it back from user code; what
`core.verify.level` offers instead is a set of predicates over a level
value a library is HANDED:

```verum
public fn parse_level(annotation: Text) -> Maybe<VerificationLevel>;
public fn to_annotation(level: VerificationLevel) -> Text;
public fn requires_smt(level: VerificationLevel) -> Bool;
public fn allows_runtime_fallback(level: VerificationLevel) -> Bool;
public fn emits_certificate(level: VerificationLevel) -> Bool;
public fn requires_coherence_checker(level: VerificationLevel) -> Bool;
public fn is_stricter_than(a: VerificationLevel, b: VerificationLevel) -> Bool;
public fn nu_omega_coeff(level: VerificationLevel) -> Int;   // the ordinal,
public fn nu_finite_offset(level: VerificationLevel) -> Int; // as ω·c + k
public fn nu_render(level: VerificationLevel) -> Text;
```

A library that wants to emit dynamic checks below `Proof` and elide
them at or above it asks `allows_runtime_fallback(level)` or
`is_stricter_than(level, VerificationLevel.Proof)`, rather than
comparing level values by hand — the ladder is ordinal, and `Coherent`
sits above `Certified` above `Reliable`, which a naive comparison would
get wrong.

## Type-level witnesses

### `Verified<T, P>`

```verum
public type Verified<T, P: Predicate<T>> is { value: T };

public fn verified_value<T, P: Predicate<T>>(v: &Verified<T, P>) -> &T;
public fn try_verify<T, P: Predicate<T>>(v: T) -> Maybe<Verified<T, P>>;
```

`Verified<Int, IsPositive>` encodes "an `Int` proven `> 0`". The
witness is constructed via `try_verify`, which dispatches to the
SMT backend under `@verify(proof)`. Programs that consume
`Verified<...>` arguments can SKIP redundant runtime checks because
the type witnesses the property.

### `Proven<P: Proposition>`

```verum
public type Proven<P: Proposition> is { };

public fn proof_term<P: Proposition>(p: &Proven<P>) -> ProofTerm;
public fn replay<P: Proposition>(p: &Proven<P>) -> Result<(), KernelError>;
```

`Proven<P>` is a phantom witness that `P` has a proof. The underlying
proof term is stored in the certificate cache; `proof_term` recovers
it for further composition; `replay` re-checks it against the
trusted kernel without retraversing the SMT solver.

## Verification attempt API

```verum
// What the PROVER found:
type ProofAttempt is
    | Proven
    | Failed(Text)
    | Unattempted;

// What the COMPILER should do about it. Not generic, and not a report
// of the proof — it is the decision.
type VerificationOutcome is
    | ElideCheck                    // proved; drop the run-time check
    | EmitRuntimeCheck              // not proved; keep the check
    | FallbackWithWarning(Text)     // not proved; keep it, and say so
    | HardFail(Text);               // not proved, and the level forbids that

fn evaluate_attempt(level: VerificationLevel, attempt: ProofAttempt)
    -> VerificationOutcome;

fn requires_runtime_check(outcome: VerificationOutcome) -> Bool;
fn is_hard_failure(outcome: VerificationOutcome) -> Bool;
fn is_warning(outcome: VerificationOutcome) -> Bool;
```

There is no `attempt_verify`, `VerifyStrategy` or `Counterexample`, and
no timeout or deadline in this API. The split is the point: a
`ProofAttempt` says what the prover found, and `evaluate_attempt` turns
that plus the active level into the compiler's decision. The same
`Failed` attempt is a warning at a lax level and a `HardFail` at a
strict one, which is exactly what library code wanting
verify-or-fall-back needs to branch on.

## Coherence

```verum
public fn check_overlap(impl_a: ImplId, impl_b: ImplId)
    -> Result<(), CoherenceError>;
public fn check_orphan(impl_id: ImplId) -> Result<(), CoherenceError>;
```

These mirror the compiler's coherence enforcement and are exposed
for tooling (lint rules, IDE integration) that needs to consult
the same registries.

## Certificate cache

```verum
public type Certificate is {
    proposition: Proposition,
    proof_term:  ProofTerm,
    strategy:    VerifyStrategy,
    metadata:    CertificateMetadata,
};

public fn save_certificate(c: &Certificate, path: &Text)
    -> Result<(), CertificateError>;
public fn load_certificate(path: &Text)
    -> Result<Certificate, CertificateError>;
```

Certificates are content-addressed by their proof term's hash and
serialised for archival / cross-machine replay. `load_certificate +
Proven::replay` is the canonical way to re-verify a proof at
deployment time without re-running the SMT solver.

## Status

| File | Status | Notes |
|---|---|---|
| `mod.vr` | **undocumented** | re-exports — no conformance suite yet |
| `level.vr` | **regression-only** | level-aware predicates — [core-tests/verify/level](https://github.com/verum-lang/verum/tree/main/core-tests/verify/level) |
| `attempt.vr` | **undocumented** | `attempt_verify` stable; retry helpers TBD — no conformance suite yet |
| `certificate.vr` | **undocumented** | full save/load + content-addressing — no conformance suite yet |
| `coherence.vr` | **unverified** | overlap + orphan check — [core-tests/verify/coherence](https://github.com/verum-lang/verum/tree/main/core-tests/verify/coherence) |
| `kernel_v0/` | **unverified** | minimal proof-checker (read-only API to user side) — [core-tests/verify/kernel_v0](https://github.com/verum-lang/verum/tree/main/core-tests/verify/kernel_v0) |
| `kernel_soundness/` | **unverified** | meta-theorem registry (all soundness proofs registered) — [core-tests/verify/kernel_soundness](https://github.com/verum-lang/verum/tree/main/core-tests/verify/kernel_soundness) |
| `codegen_soundness/` | **undocumented** | meta-theorem registry — no conformance suite yet |
| `separation_soundness/` | **undocumented** | meta-theorem registry — no conformance suite yet |
| `kernel_self_soundness/` | **undocumented** | self-soundness proofs — no conformance suite yet |
| `proof_term_examples/` | **undocumented** | canonical corpus — no conformance suite yet |

## Compiler-side reference

`core.verify` exposes ergonomic types + macros over the compiler's
verification pipeline. The pipeline itself is implemented in:

  * `crates/verum_smt/` — SMT solver dispatch (Z3 backend)
  * `crates/verum_kernel/` — minimal trusted kernel for proof replay
  * `crates/verum_verification/` — VC generation, kernel orchestration
  * `crates/verum_compiler/src/phases/verification_phase.rs` — pipeline integration

See `docs/verification/` for the spec; `core.verify` is the
runtime/library-visible projection of that pipeline.

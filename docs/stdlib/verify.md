---
sidebar_position: 32
title: verify
description: First-class verification API for user code — embed compiler-internal verification into Verum programs as ergonomic types + macros + queries.
---

# `core.verify` — Verification embedding API

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
   `@verify(strategy)` / `@trigger(pattern)` / `@logic` attributes
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
public type VerificationLevel is
      Off                       // no verification; ignore @verify attributes
    | Refinement                // refinement-type checks (predicates on Int / Float / etc.)
    | Termination              // refinement + termination proofs
    | Proof;                    // full SMT + kernel-replay proof obligations
```

The level is set at the manifest layer (`[verification].level = "proof"`)
and observable from user code via `current_level()`. Libraries that
should behave differently at proof level vs runtime level branch on
this; for example, a library may emit dynamic checks at `Refinement`
level and elide them at `Proof` level (the proof obligation has
discharged the run-time check).

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
public type VerificationOutcome<T> is
      Verified(T)                                          // proof succeeded
    | Timeout { elapsed_ms: Int, partial: Maybe<Text> }    // SMT timeout
    | Unknown(Text)                                        // SMT couldn't decide
    | Failed { counterexample: Maybe<Counterexample> };    // refuted with model

public fn attempt_verify<T, P: Predicate<T>>(
    value:       T,
    strategy:    VerifyStrategy,
    deadline_ms: Int,
) -> VerificationOutcome<Verified<T, P>>;
```

Useful for library code that wants to verify-or-fallback rather
than fail compilation: try the proof under a strategy; on
`Timeout` or `Unknown`, fall back to runtime checks.

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
| `mod.vr` | **stable** | re-exports |
| `level.vr` | **stable** | level-aware predicates |
| `attempt.vr` | **partial** | `attempt_verify` stable; retry helpers TBD |
| `certificate.vr` | **stable** | full save/load + content-addressing |
| `coherence.vr` | **stable** | overlap + orphan check |
| `kernel_v0/` | **stable** | minimal proof-checker (read-only API to user side) |
| `kernel_soundness/` | **stable** | meta-theorem registry (all soundness proofs registered) |
| `codegen_soundness/` | **stable** | meta-theorem registry |
| `separation_soundness/` | **stable** | meta-theorem registry |
| `kernel_self_soundness/` | **stable** | self-soundness proofs |
| `proof_term_examples/` | **stable** | canonical corpus |

## Compiler-side reference

`core.verify` exposes ergonomic types + macros over the compiler's
verification pipeline. The pipeline itself is implemented in:

  * `crates/verum_smt/` — SMT solver dispatch (Z3 backend)
  * `crates/verum_kernel/` — minimal trusted kernel for proof replay
  * `crates/verum_verification/` — VC generation, kernel orchestration
  * `crates/verum_compiler/src/phases/verification_phase.rs` — pipeline integration

See `docs/verification/` for the spec; `core.verify` is the
runtime/library-visible projection of that pipeline.

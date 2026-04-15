---
sidebar_position: 2
title: proof
---

# `core::proof` — Proof-carrying code

Support types for `@verify(certified)` and proof-carrying bytecode.

## Reflection protocol

```verum
type Reflect is protocol {
    type Reflected;
    fn reflect(&self) -> Self.Reflected;
};
```

Types implementing `Reflect` expose a machine-readable version of
themselves to `@logic` functions and the SMT solver.

## Proof-carrying code

```verum
type ProofCertificate is {
    obligation: SmtObligation,
    proof:      ProofTerm,
    verifier:   Text,        // "z3", "cvc5", "portfolio", "manual"
    checked_at: SystemTime,
};

fn embed_certificate(module: &mut Module, cert: ProofCertificate);
fn verify_certificate(cert: &ProofCertificate) -> Result<(), VerifyError>;
```

VBC modules compiled with `@verify(certified)` embed certificates
alongside the bytecode. A loader can verify them offline via
`verify_certificate` — without running the full compiler.

## Contracts

The older `contracts_old.vr` module defines the contract machinery
(`requires`, `ensures`, `invariant`, `decreases`) at the AST level.
Modern user-facing surfaces live in the language proper; this module
provides the implementation hooks.

## See also

- **[Verification → proofs](/docs/verification/proofs)** — the proof
  DSL.
- **[Verification → refinement reflection](/docs/verification/refinement-reflection)**
  — `@logic` functions.
- **[Architecture → SMT integration](/docs/architecture/smt-integration)**
  — how proof terms are validated.

---
sidebar_position: 12
title: Refinement-typed networking — V1–V10
description: How the warp TLS 1.3 + QUIC + X.509 stack discharges ten verification obligations through Z3.
---

# Refinement-typed networking — V1–V10

The pure-Verum TLS 1.3 + QUIC + X.509 stack (codename **warp**) ships
with **ten** verification obligations the spec at
`internal/specs/tls-quic.md §9` requires to hold. Each one is
refinement-typed at the call site, so Z3 discharges them at compile
time — they are not runtime asserts, not unit tests.

This page maps each obligation to its theorem file, the type that
carries the contract, and the proof tactic Z3 uses.

## Discharge matrix

| Theorem | Subject | File | Proof time |
|:------:|---------|------|:----------:|
| V1 | TLS 1.3 `derive_secret` label-distinctness | [`v1_derive_secret_theorem.vr`](https://github.com/oldman/verum/blob/main/vcs/specs/L2-standard/net/tls13/v1_derive_secret_theorem.vr) | ~2.4 s |
| V2 | KeyUpdate generation monotonicity | [`v2_key_update_theorem.vr`](https://github.com/oldman/verum/blob/main/vcs/specs/L2-standard/net/tls13/v2_key_update_theorem.vr) | ~2.7 s |
| V3 | `AckRanges.insert` invariant preservation | [`v3_ackranges_theorem.vr`](https://github.com/oldman/verum/blob/main/vcs/specs/L2-standard/net/quic/v3_ackranges_theorem.vr) | ~3.1 s |
| V4 | Per-PN-space `next_pn > largest_acked` | [`v4_pn_monotonic_theorem.vr`](https://github.com/oldman/verum/blob/main/vcs/specs/L2-standard/net/quic/v4_pn_monotonic_theorem.vr) | ~1.8 s |
| V5 | NewReno `cwnd ≥ MIN_WINDOW` | [`v5_newreno_window_theorem.vr`](https://github.com/oldman/verum/blob/main/vcs/specs/L2-standard/net/quic/v5_newreno_window_theorem.vr) | ~2.2 s |
| V6 | Active CID count ≤ limit | [`v6_cid_cap_theorem.vr`](https://github.com/oldman/verum/blob/main/vcs/specs/L2-standard/net/quic/v6_cid_cap_theorem.vr) | ~1.9 s |
| V7 | Path amplification ≤ 3× received bytes | [`v7_anti_amp_theorem.vr`](https://github.com/oldman/verum/blob/main/vcs/specs/L2-standard/net/quic/v7_anti_amp_theorem.vr) | ~2.0 s |
| V8 | AEAD `seq` strict monotonic | [`v8_aead_seq_theorem.vr`](https://github.com/oldman/verum/blob/main/vcs/specs/L2-standard/net/tls13/v8_aead_seq_theorem.vr) | ~1.6 s |
| V9 | Transport-params bounds | [`v9_transport_params_theorem.vr`](https://github.com/oldman/verum/blob/main/vcs/specs/L2-standard/net/quic/v9_transport_params_theorem.vr) | ~2.5 s |
| V10 | X.509 chain validation | [`v10_chain_validation_theorem.vr`](https://github.com/oldman/verum/blob/main/vcs/specs/L2-standard/security/x509/v10_chain_validation_theorem.vr) | ~3.4 s |

## How a theorem is discharged

Take **V3** — the ACK-ranges invariant — as the canonical pattern.

The `AckRanges` type carries its invariant in a refinement:

```verum
public type AckRange is { smallest: UInt64, largest: UInt64 }
    where smallest <= largest;

public type AckRanges is List<AckRange>
    where @forall i in 0..self.len()-1 =>
        self[i].smallest > self[i+1].largest + 1;     // strictly desc, gap ≥ 2
```

`AckRanges.insert(pn)` carries a postcondition:

```verum
implement AckRanges {
    public fn insert(&mut self, pn: UInt64) -> Result<(), AckError>
        ensures @forall i in 0..self.len()-1 =>
            self[i].smallest > self[i+1].largest + 1;
}
```

`v3_ackranges_theorem.vr` declares the obligation:

```verum
@verify(z3)
theorem v3_insert_preserves_invariant
    (ranges: AckRanges, pn: UInt64) -> Bool
{
    let mut copy = ranges.clone();
    match copy.insert(pn) {
        Ok(_) => well_formed(&copy),
        Err(_) => true,
    }
}
```

`well_formed` is the same `@forall` predicate the type carries. Z3
takes the AST of `insert` (which lives in `core/net/quic/ack_ranges.vr`),
encodes it via `verum_smt::z3_backend`, and emits the verification
condition over `(ranges, pn)`. The compiler routes through the
`refinement_reflection` strategy from
[`verification/smt-routing`](/docs/verification/smt-routing) and
returns `unsat` (the negation of the postcondition is unsatisfiable),
which is the proof of validity.

## V7 in detail — anti-amplification

`Path` tracks `bytes_sent` and `bytes_received` and gates outbound
emission:

```verum
public type Path is {
    state:           PathState,
    bytes_sent:      UInt64,
    bytes_received:  UInt64,
    // ...
};

implement Path {
    public fn can_send(&self, requested: UInt64) -> Result<(), PathError>
        ensures match state {
            PathState.Validated => true,
            _ => self.bytes_sent + requested <= 3 * self.bytes_received,
        };
}
```

V7 says: while the path is unvalidated, no `can_send` can return
`Ok(_)` if it would push `bytes_sent` above the 3× ceiling. Z3
discharges this by proving the implication: `requested ≤
3*bytes_received - bytes_sent` (the only branch that returns Ok).

Runtime companion: `path_anti_amp.vr` exercises the same property
through dozens of insert sequences for double-reading-by-eye
defence-in-depth.

## V10 — X.509 chain

The most structural of the ten. `VerifiedChain` carries:

```verum
public type VerifiedChain is List<Certificate>
    where self.len() > 0
       && @forall i in 0..self.len()-2 =>
              self[i+1].public_key.verify(
                  self[i].tbs_signed,
                  self[i].signature,
                  self[i].signature_alg)
       && (self[self.len()-1] in trust_store);
```

Three sub-conditions: nonempty, every adjacent edge signature-valid,
anchor in the trust store. `chain.validate(chain, &trust)` is the
constructive function whose return type is the refined `VerifiedChain`
— so calling it and unwrapping is the proof artifact.

## Dependencies

Each verification call routes through Z3 over QF_AUFLIA modulo
the language's typed-AST encoding. Background:

- [Verification pipeline](/docs/architecture/verification-pipeline)
- [SMT routing](/docs/verification/smt-routing) — when to use Z3 vs
  refinement reflection vs the fallback abstract interpreter.
- [Counterexamples](/docs/verification/counterexamples) — how to
  read an `unsat` failure when one of these theorems fails to
  discharge after a code change.

## Reproducing locally

```bash
$ cd vcs
$ make test-l2-net
[…]
v1_derive_secret_theorem.vr      verify-pass   (2412 ms)
v2_key_update_theorem.vr         verify-pass   (2737 ms)
v3_ackranges_theorem.vr          verify-pass   (3104 ms)
v4_pn_monotonic_theorem.vr       verify-pass   (1851 ms)
v5_newreno_window_theorem.vr     verify-pass   (2189 ms)
v6_cid_cap_theorem.vr            verify-pass   (1923 ms)
v7_anti_amp_theorem.vr           verify-pass   (2037 ms)
v8_aead_seq_theorem.vr           verify-pass   (1647 ms)
v9_transport_params_theorem.vr   verify-pass   (2519 ms)
v10_chain_validation_theorem.vr  verify-pass   (3389 ms)
```

If any of the ten flips to `verify-fail` after a change to its
underlying module, the change is rejected at compile time — same
discipline as a type error. The CI gate has been green continuously
since the warp Phase 8 closeout.

## See also

- [`internal/specs/tls-quic.md`](https://github.com/oldman/verum/blob/main/internal/specs/tls-quic.md)
  §9 — the normative specification of all ten obligations.
- [QUIC reference](/docs/stdlib/net/quic/) — module structure each
  theorem applies to.
- [TLS 1.3 reference](/docs/stdlib/net/tls/) — handshake side.

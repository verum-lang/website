---
sidebar_position: 9
title: zk — Halo2 + STARK zero-knowledge
description: Halo2 + KZG10 (Plonk-style over BLS12-381) and STARK + FRI (PQ-secure, transparent setup). Two complementary zero-knowledge proof systems sharing a circuit-DSL design.
---

# `core.security.zk` — zero-knowledge proof systems

Two zero-knowledge proof systems ship side-by-side, complementary
in their guarantees:

| System | Setup | PQ-secure | Proof size | Verifier time | Best for |
|---|---|:---:|---|---|---|
| **Halo2 + KZG10** | universal SRS (one ceremony, any circuit) | ✗ (BLS12-381 + DLog) | ~1–2 KB | ~3–5 ms | rollup proofs, recursive aggregation, short-life proofs |
| **STARK + FRI** | transparent (only choice of field + hash) | ✓ (collision-resistance only) | ~50–200 KB | ~5–15 ms | long-lived attestations, PQ-roadmap deployments |

Both systems share the **circuit-DSL design pattern**: the user
constructs an immutable description of the relation to prove
(`Circuit` for Halo2, `Air` for STARK), then invokes the prover
with witness inputs. Verifier-side artifacts (`VerifyingKey` /
`AirVk`) are content-addressed.

---

## When to choose which

### Choose Halo2 if

* You need **tiny proofs** on the wire (1–2 KB vs 50–200 KB).
* You need **recursive proof composition** — proving N proofs in
  a single succinct outer proof, used by rollup aggregators.
* Your trust model accepts a one-shot universal SRS ceremony.
* You need maximum verifier speed for high proof volume.

### Choose STARK if

* You need **post-quantum security** out of the box. STARK rests
  only on collision-resistance of the underlying hash; lattice and
  pairing assumptions don't apply.
* You need **transparent setup** — no ceremony, no toxic waste.
* You're optimising for prover throughput on commodity GPUs.
* Your verifier can absorb 50–200 KB per proof.

The two systems are not mutually exclusive — a hybrid deployment
uses Halo2 for hot rollup paths and STARK for long-lived archival
attestations.

---

## Halo2 — `core.security.zk.halo2`

Plonk-style proof system over BLS12-381 with KZG10 as the
polynomial commitment scheme. Used by Zcash Sapling/Orchard,
Penumbra, Filecoin EVM, and many recent rollup designs.

### Sub-modules

```
core/security/zk/halo2/
├── circuit.vr   — Circuit DSL: Column / ColumnType / Selector / Region / Cell
│                  / Constraint / Gate / Lookup / Permutation / Circuit +
│                  Configure / SynthesizeContext + generic helpers
├── prover.vr    — ProvingKey / Proof + precompute + prove + prove_with_aux
├── verifier.vr  — VerifyingKey + verify + verify_batch
└── srs.vr       — UniversalSrs + setup + setup_with_entropy + load + serialize
```

### Circuit DSL — what a Halo2 circuit really is

A "circuit" in Halo2 is *not* a Boolean or arithmetic circuit. It
is a **layout**: a fixed grid of N rows × M columns, where each
column is one of `Advice` (witness), `Instance` (public input),
`Fixed` (baked-in constant), or `Selector` (one-bit gate
activator). Gates are low-degree polynomial constraints over
`(column, row)` cells; lookups are Plonkish constraints that some
tuple of cells be a row of an enumerated table.

The user describes the layout once via `Circuit.configure`, then
fills in witness values via `Circuit.synthesize`.

### API surface

```verum
mount core.security.zk.halo2.{
    // Layout primitives
    Column, ColumnType, Selector, Region, Cell,
    // Constraints
    Constraint, Gate, Lookup, Permutation,
    // Circuit container
    Circuit, ConfigureContext, SynthesizeContext,
    // Generic constraint shapes
    range_constraint, set_membership_constraint, hash_preimage_constraint,
    // Prover / verifier
    Proof, ProvingKey, prove, prove_with_aux,
    VerifyingKey, verify, verify_batch,
    // SRS
    UniversalSrs, SrsParams, setup, setup_with_entropy,
    // Errors
    CircuitError, ProverError, VerifierError, SrsError,
};

// 1. Build circuit description.
let mut cfg = ConfigureContext.new();
let advice = cfg.alloc_advice("x".into());
let selector = cfg.alloc_selector("range_proof".into());
range_constraint(&mut cfg, "x ∈ [0, 2^16)".into(), selector, advice, 16)?;

// 2. Specialise against an SRS (one-time per circuit).
let (pk, vk) = precompute(&circuit, &srs)?;

// 3. Prove.
let proof = prove(&pk, &public_inputs, |ctx| {
    ctx.assign(Cell { column: advice, row_offset: 0 }, &x_bytes)?;
    ctx.enable(&selector, 0)?;
    Ok(())
})?;

// 4. Verify.
verify(&vk, &public_inputs, &proof, &srs)?;
```

### Generic constraint helpers

Three patterns reused across most circuits — pre-baked so authors
don't reinvent them:

| Helper | What it asserts |
|---|---|
| `range_constraint(cfg, name, selector, advice, bits)` | `0 ≤ x < 2^bits`. Implemented as Plonkish lookup against a 0..2^bits table. |
| `set_membership_constraint(cfg, name, selector, advice, table)` | `x ∈ {a₀, …, a_{k-1}}` against a Fixed-column table. |
| `hash_preimage_constraint(cfg, name, selector, inputs, output, hash_name)` | `out == H(in₀, …, in_k)` for a Plonk-friendly hash (Poseidon / Rescue / MiMC). |

### Universal SRS

Halo2 + KZG10 requires a one-shot universal trusted setup. A single
ceremony produces an SRS that any circuit up to its capacity (`2^k`
rows) can use. There is no per-circuit ceremony.

```verum
// Development / testnet only — single-machine ceremony has no
// distributed-trust guarantee.
let srs = setup(SrsParams.new(20, "synarc-testnet".into()))?;

// Production — multi-party computation. Each participant contributes
// signed entropy; transcript hash chained.
let srs = setup_with_entropy(params, contributions)?;
```

### Performance characteristics

* Prover runtime: O(N · log N) field ops + O(N) G1 mul, dominated
  by FFTs.
* Memory peak: ~`(num_columns × 2^k × 32 B) + (FFT scratch)`. A
  k=14 leaf circuit ≈ 3–4 MB; a k=20 circuit ≈ 150 MB.
* GPU MSMs deliver 5–30× speedup on `Tier.Gpu` when the
  `tier_gpu` runtime feature is enabled.

### Proof size + verifier time

| Use case | Circuit size (k) | Proving time | Verification gas | Wire size |
|---|---|---|---|---|
| Range proof (balance ≥ amount) | 14 (~16K) | ~100 ms (GPU) | 50,000 | ~1 KB |
| Set membership in 2²⁰ set | 16 (~64K) | ~500 ms (GPU) | 200,000 | ~1.5 KB |
| Cross-shard receipt proof | 17 (~128K) | ~1 s (GPU) | 350,000 | ~1.5 KB |
| Holon consciousness predicate | 17 | ~1 s (GPU) | 350,000 | ~1.5 KB |
| Cog execution attestation | 20 (~1M) | ~16 s (GPU) | 1,500,000 | ~2 KB |

---

## STARK + FRI — `core.security.zk.stark`

Reed-Solomon IOP with FRI low-degree-test. Post-quantum secure
under collision-resistance of the hash function. Transparent
setup. Used by StarkWare, RISC Zero, Plonky3, recursive zk-VM
designs.

### Sub-modules

```
core/security/zk/stark/
├── air.vr       — AIR DSL: Expr (poly over trace cells) /
│                  TransitionConstraint / BoundaryConstraint /
│                  TraceLayout / AirBuilder / FieldChoice / ProofParams
├── prover.vr    — Proof + prove
└── verifier.vr  — AirVk + verify + verify_batch
```

### AIR — Algebraic Intermediate Representation

In a STARK, the prover's claim is "there exists a *trace* (a
sequence of N rows of K field elements each) such that:

1. every row except the last satisfies the *transition constraint*
   against its successor;
2. some specific cells satisfy the *boundary constraints*."

The AIR is the *language* in which both kinds of constraint are
expressed: low-degree multivariate polynomials over the trace columns.

### Field choice

```verum
public type FieldChoice is
    | Goldilocks    // 𝔽_p, p = 2^64 − 2^32 + 1 — Plonky2 / RISC Zero
    | Mersenne31    // 𝔽_p, p = 2^31 − 1 — SIMD-friendly, M31 family
    | BabyBear      // 𝔽_p, p = 2^31 − 2^27 + 1 — NTT-friendly, Plonky3
    | Custom { modulus: List<Byte> };
```

### API surface

```verum
mount core.security.zk.stark.{
    Air, AirBuilder, TransitionConstraint, BoundaryConstraint,
    TraceLayout, FieldChoice, ProofParams,
    Proof, prove, AirVk, verify, verify_batch,
    AirError, ProverError, VerifierError,
};

// 1. Define the algebraic relation.
let mut b = AirBuilder.new(FieldChoice.Goldilocks, TraceLayout.new(1024, 8));
b.add_transition(TransitionConstraint { /* poly over current + next row */ });
b.add_boundary(BoundaryConstraint { column: 0, row: 0, value: input_bytes });
let air = b.with_public_input_arity(2).build()?;

// 2. Choose proof params.
let params = ProofParams.production();   // 128-bit soundness

// 3. Prove — trace is a row-major flat byte buffer.
let proof = prove(&air, &trace_bytes, &public_inputs, &params)?;

// 4. Verify.
let vk = AirVk.from_air(air);
verify(&vk, &proof, &public_inputs, &params)?;
```

### Proof params

`ProofParams.{fast, production}` are preset budgets for the soundness/
size trade-off:

* `fast()` — 100-bit soundness, fast prover. Suitable for testnet,
  dev environments, low-stakes proofs.
* `production()` — 128-bit soundness, slower prover, larger proofs.

Or supply explicit `(blowup_factor, num_queries, grinding_factor)`.

### Verifier characteristics

Verifier runtime is `O(polylog N)` — independent of trace length.
~5–15 ms for typical params on commodity CPUs. `verify_batch`
amortises FRI random-linear-combination across N proofs sharing a
single VK; ~1.5–2× faster than N independent verifies for N ≥ 4.

---

## Backend dispatch

Both systems route hot operations through `@intrinsic` so the
algorithmic core can be supplied by audited implementations
without changing the surface API:

* Halo2: `verum.crypto.halo2_*` — backend is `halo2_proofs` /
  `halo2-axiom` / equivalent. KZG10 over BLS12-381 inherits
  `verum.crypto.bls12_381_*` for pairing operations.
* STARK: `verum.crypto.stark_*` — backend is plonky3-style
  (Goldilocks NTT, FRI commitment, BLAKE3 Merkle).

When no backend feature flag is selected, the surface compiles
but proving / verifying raises `BackendNotReady`. There is no
pure-Verum reference path for these systems at v0.1 — algorithmic
ZK is too domain-specific to ship a fallback that's worth audit.

---

## Lifecycle status

Both systems ship at `Lifecycle.Conditional(...)`:

```verum
@arch_module(
    foundation: Foundation.ZfcTwoInacc,
    stratum: MsfsStratum.LFnd,
    lifecycle: Lifecycle.Conditional([
        "BLS12-381 + BLAKE3 stdlib lands (done)",
        "ZK prover backends bound at runtime layer",
    ]),
)
module core.security.zk;
```

The architectural contract is complete; algorithmic backends
slot in at runtime feature-flag time. Promotion to
`Lifecycle.Theorem` follows end-to-end soundness re-statement in
the Verum kernel via `@framework(halo2_2019, ...)` /
`@framework(stark_2018, ...)`.

---

## Related modules

* [`core.security.ecc.bls12_381`](/docs/stdlib/security/ecc#bls12-381--pairing-friendly-threshold-signatures)
  — pairing back-end for Halo2 + KZG10.
* [`core.security.hash.blake3`](/docs/stdlib/security/hash#blake3) —
  Merkle commitment back-end for STARK.

---

## References

### Halo2

* Bowe, Grigg, Hopwood, "[Halo: Recursive Proof Composition without a Trusted Setup](https://eprint.iacr.org/2019/1021)" (2019)
* [Halo2 Book](https://zcash.github.io/halo2/) — Zcash Foundation
* Kate, Zaverucha, Goldberg, "Constant-Size Commitments to Polynomials and Their Applications" (KZG10, 2010)
* Gabizon, Williamson, Ciobotaru, "[PLONK: Permutations over Lagrange-bases for Oecumenical Noninteractive arguments of Knowledge](https://eprint.iacr.org/2019/953)" (2019)

### STARK

* Ben-Sasson, Bentov, Horesh, Riabzev, "[Scalable, transparent and post-quantum secure computational integrity](https://eprint.iacr.org/2018/046)" (2018)
* Ben-Sasson, Bentov, Horesh, Riabzev, "[Fast Reed-Solomon Interactive Oracle Proofs of Proximity](https://eccc.weizmann.ac.il/report/2017/134/)" (FRI, 2018)
* StarkWare, "[Cairo — a Turing-complete STARK-friendly CPU architecture](https://eprint.iacr.org/2021/1063)" (2021)

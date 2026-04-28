---
title: Operational coherence (VVA-6 stdlib preview)
sidebar_position: 20
---

# Operational coherence (VVA-6 stdlib preview, M4.E)

VVA Part B's **VVA-6** chapter requires a kernel-rule that decides
α-cert ⟺ ε-cert correspondence (the AC/OC duality from MSFS §10 +
Diakrisis 18.T₁ / 18.T₂ / 18.T₃). The full kernel rule is preprint-
blocked at the kernel layer; **M4.E** ships the stdlib-side surface
that the kernel rule will dock into when it lands.

## Three-strategy verify ladder

The corresponding `@verify(...)` strategies are already landed on the
Rust side (`verum_ast::attr::VerificationMode`) and now mirrored in
the Verum stdlib (`core/verify/level.vr::VerificationLevel`):

| Strategy | ν | Behavior |
|---|:-:|---|
| `@verify(coherent_static)` | ω·2+3 | α-cert + symbolic ε-claim. Polynomial-time; CI budget ≤ 60 s |
| `@verify(coherent_runtime)` | ω·2+4 | α-cert + runtime ε-monitor. Trace-bounded; ≤ 5 min |
| `@verify(coherent)` | ω·2+5 | α/ε bidirectional check (strict). Single-exponential; ≤ 30 min |

Pre-M4.E the stdlib `VerificationLevel` had only the 9 base strategies;
the Coherent triple lived only on the Rust side, creating a
stdlib-vs-Rust drift. Post-M4.E both sides agree on 12 variants
(Runtime / Static / Fast / Formal / Proof / Thorough / Reliable /
Certified / **CoherentStatic / CoherentRuntime / Coherent** /
Synthesize).

The new predicate `requires_coherence_checker(level)` returns `true`
iff the level is one of the three Coherent variants — used by SMT
dispatch fork `verum_smt::coherence` to route to the operational-
coherence checker instead of the standard portfolio.

## `core/verify/coherence.vr` — stdlib surface

The module ships:

```verum
mount core.verify.coherence;

// Three-valued classifier for α-cert ⟺ ε-cert correspondence.
public type CoherenceVerdict is
    | Decidable
    | SemiDecidable { bound: Text }
    | Undecidable { reason: Text };

// Carrier protocol — bidirectional witness surface.
public type CoherenceCert is protocol {
    fn theorem_identifier(self) -> Text;
    fn articulation_witness(self) -> &Articulation;
    fn enactment_witness(self) -> &Enactment;
    fn is_round_trip_id(self) -> Bool;
    fn verdict(self) -> CoherenceVerdict;
};

// Pure decision function — runs at compile-time under
// @verify(coherent_static), at runtime under @verify(coherent_runtime),
// symbolically under @verify(coherent).
public pure fn verify_alpha_epsilon_correspondence(
    cert: &CoherenceCert,
) -> CoherenceVerdict;

// Boolean shortcut: production-ready iff Decidable + round-trip-id.
public pure fn cert_is_production_ready(cert: &CoherenceCert) -> Bool;
```

### `CoherenceVerdict` variants

* **`Decidable`** — finitely-axiomatised theorem; α/ε both terminate
  in single-exponential time per Diakrisis 18.T₂. This is the
  verdict the corpus `audit-reports/round-trip.json` expects for a
  "ready for production" row.
* **`SemiDecidable { bound }`** — semi-decision procedure exists but
  no uniform termination bound. Common case: framework axiomatisation
  spans an inaccessible cardinal (Lurie HTT, Schreiber DCCT).
  `bound` is a citation text describing the semi-decision-procedure
  shape.
* **`Undecidable { reason }`** — α-cert / ε-cert correspondence is
  undecidable in general. Common case: classifying-stack-aware MSFS
  theorems where the gauge-equivalence checker is co-RE.

### `CoherenceCert` accessors

| Accessor | Returns | What it certifies |
|---|---|---|
| `theorem_identifier()` | `Text` | Stable identifier for the certified theorem (used by audit walkers to cross-reference) |
| `articulation_witness()` | `&Articulation` | AC-side α-cert projection (framework + citation) |
| `enactment_witness()` | `&Enactment` | DC-side ε-cert projection (inferred α + ε) |
| `is_round_trip_id()` | `Bool` | `true` iff `α(ε(α)) ≃ α` AND `ε(α(ε)) ≃ ε` (Diakrisis 16.T₁₀ + 108.T) |
| `verdict()` | `CoherenceVerdict` | Three-valued decidability classification |

## Concrete reference instance

`IdentityCoherenceCert` is the drop-in instance for the trivially-
coherent identity case — theorems whose α-cert and ε-cert are
identical (e.g., theorems whose ε is the auto-induced `epsilon(α)`
per VVA §11.3, where `α(epsilon(α)) = α` is the Diakrisis 108.T
auto-induced round-trip):

```verum
public fn identity_coherence_cert(
    theorem_identifier: Text,
    articulation: Articulation,
    enactment: Enactment,
) -> IdentityCoherenceCert;
```

The instance always reports `is_round_trip_id() == true` and
`verdict() == Decidable` — auto-induced enactments are finitely-
axiomatised by Diakrisis 18.T₂.

## Architectural note — kernel rule docking

Pre-M4.E the corresponding `@verify(coherent)` markers in the MSFS /
Diakrisis corpus dispatched through `verum audit --coherent` which
reported `Status::Pending` for every row — the audit surface shipped
before the stdlib carrier did. Post-M4.E:

1. The carrier protocol is in place.
2. Concrete instances can be constructed by user code.
3. The audit walker can classify decidability properly when the
   kernel rule lands.

When VVA-6's full kernel rule lands (preprint dependency), the
`verify_alpha_epsilon_correspondence` pure function becomes a kernel-
rechecked judgement. Pre-rule it is the stdlib-shaped surface the
audit walker dispatches against; post-rule it remains the same
function but with kernel-recheck on every call site.

## `core/verify/level.vr` — extended VerificationLevel

The Verum stdlib `VerificationLevel` enum was widened from 9 to 12
variants in M4.E:

```verum
public type VerificationLevel is
    | Runtime          // ν = 0
    | Static           // ν = 1
    | Fast             // ν = 2
    | Formal           // ν = ω
    | Proof            // ν = ω+1
    | Thorough         // ν = ω·2
    | Reliable         // ν = ω·2+1
    | Certified        // ν = ω·2+2
    | CoherentStatic   // ν = ω·2+3  (NEW M4.E)
    | CoherentRuntime  // ν = ω·2+4  (NEW M4.E)
    | Coherent         // ν = ω·2+5  (NEW M4.E)
    | Synthesize;      // ν ≤ ω·3+1
```

All match-blocks in `level.vr` were re-exhausted (`parse_level`,
`to_annotation`, `nu_omega_coeff`, `nu_finite_offset`,
`emits_certificate`). New predicate `requires_coherence_checker`
returns `true` for the three Coherent variants:

```verum
public fn requires_coherence_checker(level: VerificationLevel) -> Bool {
    match level {
        VerificationLevel.CoherentStatic  => true,
        VerificationLevel.CoherentRuntime => true,
        VerificationLevel.Coherent        => true,
        _                                 => false,
    }
}
```

`emits_certificate` was also updated — `Coherent` now reports `true`
(it emits a `CoherenceCert`); `CoherentStatic` / `CoherentRuntime`
report `false` (SMT verdict / trace-bounded only).

## Related surfaces

* **[Gradual verification](./gradual-verification.md)** — full
  9-strategy ladder reference (now extended to 12 with Coherent
  variants).
* **[`verum audit --coherent`](./actic-dual)** — operational
  coherence audit walker (the consumer of `CoherenceCert`).
* **[AC/OC dual layer](./actic-dual)** — `core.action.*` Articulation
  / Enactment carriers underpinning the bidirectional witness.
* **[MSFS coordinate](./msfs-coord)** — `(Framework, ν, τ)` projection
  for theorems carrying Coherent verify levels.

---
sidebar_position: 4
title: "CVE — Seven canonical symbols"
description: "The seven-glyph taxonomy that classifies every Verum artefact: [T] [D] [C] [P] [H] [I] [✗]."
slug: /architecture-types/cve/seven-symbols
---

# CVE — Seven canonical symbols

Every Verum artefact carries exactly one of seven canonical CVE
statuses, surfaced as a single-character glyph. The glyphs are
load-bearing in audit reports, in the [`Lifecycle`](../primitives/lifecycle.md)
ATS-V primitive, and in the diagnostics emitted by the linter and
the LSP.

The seven cover *every* productive cell of the
[CVE truth table](./seven-configurations.md). Configurations not
shown in the table are not omitted — they are unreachable in
practice (a "verifiable but not constructive" claim is not stable).

## 1. The taxonomy at a glance

| Glyph | Variant name | C | V | E | One-line summary |
|-------|--------------|---|---|---|------------------|
| `[T]` | Theorem | ✓ | ✓ | ✓ | Full closure — proven, executable, the strongest claim. |
| `[D]` | Definition | ✓ | trivial | ✓ | Boundary set by fiat; nothing to prove. |
| `[C]` | Conditional | cond. | cond. | cond. | Proven under listed hypotheses. |
| `[P]` | Postulate | ✓ | external | ✓ | Accepted via external citation. |
| `[H]` | Hypothesis | partial | absent | absent | Speculative, with a maturation plan. |
| `[I]` | Interpretation | absent | absent | absent | Descriptive only; transitional status. |
| `[✗]` | Retracted | n/a | n/a | n/a | Withdrawn; record retained as negative example. |

A separate eighth status — `Obsolete` (rendered `[O]` in code) —
is the legacy ATS-V variant for "deprecated, scheduled for
removal". It is *less* strict than `[✗]` Retracted: the artefact
still functions but is expected to be replaced. New code should
prefer `[✗]` for deliberate withdrawals.

## 2. The Lifecycle poset

The seven symbols form a partial order under "rank". The
[`AP-009 LifecycleRegression`](../anti-patterns/classical.md#ap-009)
anti-pattern uses this order to reject citations that go from a
high-rank artefact to a strictly-lower-rank cited artefact.

```text
  rank 6  [T] Theorem ─────────────────────────────────────┐
                                                            │
  rank 5  [D] Definition ── [C] Conditional ── (peers)     │
                                                            │
  rank 4  [P] Postulate                                    │
                                                            │
  rank 3  Plan (ATS-V legacy — committed but not built)    │
                                                            │
  rank 2  [H] Hypothesis                                   │
                                                            │
  rank 1  [I] Interpretation                               │
                                                            │
  rank 0  [✗] Retracted ── [O] Obsolete ── (peers)         │
                                                            │
   ↑ a high-rank artefact MAY cite a high-rank artefact ───┘
   ↓ a high-rank artefact MUST NOT cite a low-rank artefact
```

The poset is not a total order — `[D]` and `[C]` are peers
(rank 5), and `[✗]` and `[O]` are peers (rank 0). The poset is
preserved across imports, mounts, and `composes_with` edges. A
`[T]` cog citing a `[H]` cog produces a compile-time
`LifecycleRegression` diagnostic with the citing cog's name, the
cited cog's name, and the rank difference.

## 3. Glyph-by-glyph specification

### 3.1 `[T]` Theorem — full CVE closure

**Variant:** `Lifecycle.Theorem(since)`

**CVE:** C ∧ V ∧ E — all three axes positive.

**Constructor:** explicit, computable, first-class.
**Check:** algorithmic, bounded, kernel-checkable.
**Executable:** extracts to runnable code with no runtime
verification fallback.

**When to use:** the artefact is fully proved, the proof is
re-checked by the trusted kernel, and the runtime behaviour
matches the specification. The strongest claim Verum can make.
A `Theorem` cog *may* be cited from any other lifecycle, may be
extracted to any target, and is the only lifecycle suitable for
"safety-critical" labelling.

**Worked example:**

```verum
@arch_module(lifecycle: Lifecycle.Theorem("v1.0"))
@verify(certified)
module my_app.crypto.aead;

public fn encrypt(key: Key32, nonce: Nonce, plaintext: &Bytes)
    -> Bytes
    where ensures (decrypt(key, nonce, result) == Some(plaintext))
{ … }
```

The `@verify(certified)` decoration discharges the
post-condition with both multiple SMT backends in agreement, exports a
proof certificate, and re-checks it through the kernel. The
`Lifecycle.Theorem("v1.0")` annotation pins this fact at the
architectural layer.

### 3.2 `[D]` Definition — boundary by fiat

**Variant:** `Lifecycle.Definition`

**CVE:** C ∧ trivial ∧ E — constructor present, check trivial
(definitions don't have content to verify), executable in the
trivial sense (definitions reduce to themselves).

**When to use:** the artefact establishes a *boundary* — a type
declaration, a capability ontology entry, a foundational
constant. There is no theorem to prove; the definition *is* the
content.

**Worked example:**

```verum
@arch_module(lifecycle: Lifecycle.Definition)
module my_app.config.types;

public type DatabaseUrl is Text { self.starts_with("postgres://") };
```

`DatabaseUrl` defines what it means to be a database URL in this
codebase. There is no theorem to prove about the definition
itself; downstream code that produces a `DatabaseUrl` must satisfy
the refinement, but the definition's CVE status is `[D]`.

### 3.3 `[C]` Conditional — proven under hypotheses

**Variant:** `Lifecycle.Conditional(conditions: List<Text>)`

**CVE:** C ∧ V ∧ E — *relative to the listed conditions*.
Outside the conditions, the artefact is undefined; inside, it
reads as a `[T]` Theorem.

**When to use:** the proof relies on assumptions that the
artefact does not itself discharge — typically capability
restrictions, environment invariants, or external soundness
claims. The conditions are listed verbatim so that downstream
auditors can verify them at the call site.

**Worked example:**

```verum
@arch_module(
    lifecycle: Lifecycle.Conditional([
        "host platform is POSIX-compliant",
        "fs.realpath returns a canonical path",
    ]),
)
@verify(formal)
module my_app.fs.canonical;

public fn canonicalise(path: &Text) -> Result<Text, Error>
    where ensures (result is Ok(c) => is_absolute(c) && no_dotdot(c))
{ … }
```

The function's correctness is conditional on `fs.realpath`
returning a canonical path — a property the surrounding OS owes
the program. Auditors verify the conditions externally; the
artefact itself is `[C]`.

### 3.4 `[P]` Postulate — accepted via citation

**Variant:** `Lifecycle.Postulate(citation: Text)`

**CVE:** C ∧ external ∧ E — constructor present, check
delegated to an external trusted base, executable.

**When to use:** the artefact is accepted *without* an internal
proof, on the strength of an external citation: a peer-reviewed
paper, a published proof corpus, a kernel discharge axiom. The
citation is mandatory and machine-readable.

**Worked example:**

```verum
@arch_module(
    lifecycle: Lifecycle.Postulate(
        "verum_internal · core/proof/kernel_bridge · K-Univ-Ascent"
    ),
)
@framework(verum_internal_meta, "K-Universe-Ascent (kernel rule)")
module my_app.universe.bridge;
```

The cog declares that its content rests on the kernel's
`K-Universe-Ascent` rule, which is itself accepted by the trusted
base. Audits enumerate every `[P]` and confirm the citation
exists in the framework-axiom inventory.

### 3.5 `[H]` Hypothesis — speculative with a plan

**Variant:** `Lifecycle.Hypothesis(confidence: ConfidenceLevel)`

**CVE:** C-partial ∧ V-absent ∧ E-absent — formulation may be
present, but no check and no executable form.

**When to use:** the artefact is a *bet* the team is making —
formulated, confidence-graded (`Low` / `Medium` / `High`), but
neither proved nor implemented. A `[H]` artefact MUST carry a
maturation plan; a hypothesis without a plan is a candidate for
[`AP-016 HypothesisWithoutMaturationPlan`](../anti-patterns/articulation.md#ap-016).

**Worked example:**

```verum
@arch_module(lifecycle: Lifecycle.Hypothesis(ConfidenceLevel.Medium))
@plan(target: "v0.5", milestones: ["spec drafted", "POC built", "verified"])
module my_app.experimental.zk_proof;
```

The cog is in active design. Production code MUST NOT cite it;
calling `[T]` from `[H]` is `AP-009 LifecycleRegression`.

### 3.6 `[I]` Interpretation — descriptive only

**Variant:** `Lifecycle.Interpretation(reason: Text)`

**CVE:** C-absent ∧ V-absent ∧ E-absent — none of the three axes
are present. The artefact exists *only* as descriptive prose.

**When to use:** *transitional* — the artefact has been written
down but has not yet been re-articulated in any of the higher
statuses. Mature corpora MUST contain zero `[I]` entries.
[`AP-017 InterpretationInMatureCorpus`](../anti-patterns/articulation.md#ap-017)
flags any `[I]` annotation on a cog declared in `strict: true`
mode; the diagnostic forces the author to either upgrade
(`[H]` with a plan, or `[C]` with conditions, or higher) or
remove the annotation.

**Why it exists at all:** during early architectural exploration,
some artefacts are written down before any of the C/V/E
machinery is realised. Naming the status `[I]` rather than
"todo" forces the team to either mature it explicitly or retract
it explicitly — there is no quiet path from `[I]` to "in
production".

### 3.7 `[✗]` Retracted — withdrawn

**Variant:** `Lifecycle.Retracted(reason: Text, replacement: Maybe<Text>)`

**CVE:** not applicable — the artefact has been withdrawn.

**When to use:** an artefact previously declared has been
refuted, deprecated, or replaced. The record is preserved as a
*negative example* in the audit chronicle, but no fresh code may
cite a `[✗]`.

A `[✗]` annotation MUST carry:

1. A `reason` — why was it retracted? (refuted, replaced, scope
   removed, etc.)
2. An optional `replacement` — the canonical name of the artefact
   that supersedes it, if any.

Citing a `[✗]` cog produces a compile-time error
([`AP-013 RetractedCitationUse`](../anti-patterns/articulation.md#ap-013)).

## 4. The legacy `Plan` and `Obsolete` variants

Two further `Lifecycle` variants exist for backward compatibility:

- **`Plan(target_completion: Text)`** — the ATS-V legacy
  variant for "committed but not yet implemented". Distinct from
  `[P]` Postulate. New code SHOULD prefer `[H]` Hypothesis with a
  `@plan(...)` attribute, or `[D]` Definition with stub
  implementations.
- **`Obsolete(reason: Text, replacement: Maybe<Text>)`** —
  the legacy variant for "deprecated, scheduled for removal".
  Distinct from `[✗]` Retracted: the artefact still functions but
  is expected to be replaced. Historical artefacts retain the
  variant; new deprecations should prefer `[✗]`.

The seven canonical glyphs are the *primary* taxonomy; the legacy
variants exist purely for migration and will be folded into the
seven over time.

## 5. Glyph rendering across surfaces

| Surface | Rendering of `[T]` Theorem |
|---------|-----------------------------|
| Source code (Verum) | `Lifecycle.Theorem("v1.0")` |
| Diagnostic message | `[T]` (single ASCII letter) |
| Audit JSON output | `"lifecycle_glyph": "T", "lifecycle_tag": "theorem"` |
| LSP hover | `[T] theorem · since v1.0` |
| Kernel rule cite | `K-Theorem(v1.0)` |
| Coq export | `Theorem … : … . Proof. … Qed.` |
| Lean export | `theorem …` |

Renderings are stable across versions. The glyph itself is a
load-bearing token — every catalog entry uses the canonical
single-letter ASCII form (`T` / `D` / `C` / `P` / `H` / `I` /
`O` / `✗`), so audit pipelines preserve the glyph verbatim.

## 6. Programmatic access to a cog's CVE glyph

Verum's `verum_kernel.arch::Lifecycle` exposes a `cve_glyph()`
method returning the canonical glyph as a static `&str`. Tooling
that consumes audit reports — IDEs, code-review bots, dashboards —
should use this method rather than re-deriving the glyph from the
variant tag.

```rust
let lifecycle = shape.lifecycle.clone();
println!("status: {} ({})", lifecycle.cve_glyph(), lifecycle.tag());
// status: T (theorem)
```

The Verum-side surface mirror is the
[`core.architecture.types.Lifecycle`](../primitives/lifecycle.md)
type; the `cve_glyph` accessor is exposed via the same
attribute contract.

## 7. Cross-references

- For the orthogonal axes that produce the seven configurations
  see [Three axes](./three-axes.md).
- For the truth-table semantics under each axis see
  [Seven configurations](./seven-configurations.md).
- For the layered application of the CVE frame across object /
  proof / method / foundation / shape / communication / frame
  see [Seven layers](./seven-layers.md).
- For the L6 register prohibitions on self-application see
  [Articulation hygiene](./articulation-hygiene.md).
- For the ATS-V `Lifecycle` primitive that carries these glyphs
  see [primitives/lifecycle](../primitives/lifecycle.md).
- For the anti-patterns that consume the lifecycle ordering see
  [`AP-009 LifecycleRegression`](../anti-patterns/classical.md#ap-009)
  and [`AP-013 RetractedCitationUse`](../anti-patterns/articulation.md#ap-013).

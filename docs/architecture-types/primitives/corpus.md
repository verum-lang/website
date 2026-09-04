---
sidebar_position: 10
title: "Corpus — cross-cog primitives"
description: "The corpus-side of ATS-V: CorpusInvariant variants, @arch_corpus / @framework declarations, transitive peer-walker (AP-019 / AP-024), bridge_corpus + bridge_tier framework citations. The architectural primitive that lives one level up from per-cog Shape."
slug: /architecture-types/primitives/corpus
---

# Corpus — cross-cog primitives

The eight per-cog primitives ([Capability](./capability.md),
[Boundary](./boundary.md), [Composition](./composition.md),
[Lifecycle](./lifecycle.md), [Foundation](./foundation.md),
[Tier](./tier.md), [Stratum](./stratum.md), [Shape](./shape.md))
describe a *single cog's* architectural intent.  Some
architectural defects are not per-cog: they only manifest when
two or more cogs compose.  The **corpus primitives** are the
machinery for those cross-cog checks.

This page completes the primitive catalog.  Where the per-cog
primitives answer "what does *this* cog look like?", the corpus
primitives answer "what does the *whole graph of cogs* look like
together?"

## 1. Why a separate primitive

Per-cog `@arch_module(...)` checks fire during the cog's own
compilation — capability discipline, lifecycle integrity, the
40-pattern catalog of single-cog defects.  But a cog cannot, by
itself, know things like:

- Whether its `composes_with` chain forms a cycle.
- Whether the foundation it claims is *consistent* with every
  cog it transitively reaches.
- Whether the privileges it `requires` are *producible* by some
  cog elsewhere in the corpus.
- Whether some cog three hops away regresses lifecycle below the
  rank this cog claims.

Each of these is an emergent property of the whole composition
graph.  ATS-V handles them with a separate annotation,
`@arch_corpus(...)`, attached at the cog-root `mod.vr` of the
top-level binary or library.  The Verum-side surface lives in
[`core.architecture.corpus`](https://github.com/verum-lang/verum/blob/main/core/architecture/corpus.vr);
the kernel-side implementation lives in
[`crates/verum_kernel/src/arch_corpus.rs`](https://github.com/verum-lang/verum/blob/main/crates/verum_kernel/src/arch_corpus.rs).

## 2. The four canonical corpus invariants

```verum
public type CorpusInvariant is
    | NoCircularDependencies
    | FoundationConsistency
    | NoLAbsClaim
    | CapabilityClosure;
```

The roster size is pinned at exactly **4**.  Adding a fifth
requires RFC ATS-V-008 + kernel-side enum bump + pin-test bump
(see [cross-side-pin](../cross-side-pin.md)).

### 2.1 `NoCircularDependencies`

The transitive closure of `composes_with` edges is a DAG.  This
is per-corpus rather than per-cog because cycle detection
requires the full graph: cog A's local declaration that it
composes with B carries no information about whether B (or B's
transitive closure) reaches A.

The kernel computes the SCCs of the composition graph and
reports a `CorpusViolation` for every SCC of size ≥ 2.  Each
violation lists the full cycle as `affected_cogs`.

**Note**: the per-cog defect AP-003 `DependencyCycle` fires when
a single cog's *direct* peers form a cycle (a → b → a, both
edges visible from a's declaration).  This corpus invariant
catches the multi-hop case (a → b → c → a) where no single cog's
declaration sees the full ring.

### 2.2 `FoundationConsistency`

For every pair of cogs `(A, B)` connected by a `composes_with`
edge:

- If `A.foundation == B.foundation`, the pair is consistent
  trivially.
- If `A.foundation ≠ B.foundation`, the pair must have an
  explicit `@framework(bridge_corpus, "A → B", ...)` declaration
  somewhere in the corpus that names a functor preserving the
  truth-values of refinement predicates.

Without the bridge, the corpus is *not* a coherent proof
universe — refinements valid in `A`'s foundation may evaluate
nonsensically in `B`'s.  The single-cog AP-005 `FoundationDrift`
catches direct edges; the corpus invariant catches the
transitive case via the peer-walker (§5).

### 2.3 `NoLAbsClaim`

No cog in the corpus may declare `stratum = LAbs`.  `LAbs` is
the absolute boundary of the Modular-Stratified Foundation
moduli space — a stratum reserved for the AFN-T α boundary
itself, never claimable by a productive cog.  Per-cog defect
AP-011 `AbsoluteBoundaryAttempt` catches the local declaration;
this corpus invariant is its sanity-net mirror at the corpus
gate, ensuring no future refactor can introduce one without
firing both alarms.

### 2.4 `CapabilityClosure`

For every cog `A` in the corpus, every entry of `A.requires`
must satisfy at least one of:

- Some other cog `B` exposes the matching capability
  (`B.exposes` contains it).
- The capability is registered as `transfers_privilege: true`
  in [`core.architecture.capability_ontology`](https://github.com/verum-lang/verum/blob/main/core/architecture/capability_ontology.vr)
  (the AT-1 closure registry — currently 7 canonical entries:
  `logger`, `metrics`, `tracing`, `config_read`, `config_admin`,
  `supervisor_spawn`, `kernel_intrinsic`).

Without closure, the corpus has *unmet requires* — a cog asks
for something nobody gives it, which means no execution will
actually satisfy `A`'s preconditions at runtime.  The per-cog
AT-1 closure check sees only A's own requires; the corpus
invariant verifies the cross-cog producer side.

## 3. The structured diagnostic types

```verum
public type CorpusViolation is {
    kind:           CorpusInvariant,
    summary:        Text,
    human_message:  Text,
    affected_cogs:  List<Text>,
};

public type CorpusReport is {
    total_cogs: Int,
    violations: List<CorpusViolation>,
};
```

`CorpusReport` is the aggregate outcome.  An empty `violations`
list means the corpus passed every invariant; the audit gate
treats `corpus_report_is_load_bearing(r) == true` as the green
light for a release-build promotion.

The single helper:

```verum
public fn corpus_report_is_load_bearing(r: CorpusReport) -> Bool {
    r.violations.len() == 0
}
```

is what `verum audit --gate` checks before allowing a
production deployment.

## 4. The annotation — `@arch_corpus(...)`

Where `@arch_module(...)` annotates a single cog,
`@arch_corpus(...)` annotates the *root* of a multi-cog binary
or library.  The annotation goes on the entrypoint `module ...;`
declaration at the top of the cog-root `mod.vr`:

```verum
@arch_corpus(
    bridge_tier:   [],                   // BridgeTier list — see §6
    bridge_corpus: ["app → external_oidc"],   // foundation bridges
    invariants:    [
        CorpusInvariant.NoCircularDependencies,
        CorpusInvariant.FoundationConsistency,
        CorpusInvariant.NoLAbsClaim,
        CorpusInvariant.CapabilityClosure,
    ],
)
module my_app.root;
```

When omitted, the kernel applies the full canonical roster of 4
invariants to every cog in the corpus — this is the
recommended default.  Listing the invariants explicitly only
makes sense when the corpus deliberately *opts out* of one
(e.g. an early-exploration corpus that hasn't yet converged on
foundation consistency); the audit-bundle records the opt-out
and surfaces it as an explicit warning.

## 5. Transitive peer-walker (AP-019 / AP-024)

Two of the 40 anti-patterns require **multi-hop** corpus
analysis — they fire only when a chain of length ≥ 2 reaches a
cog that violates the predicate, not on direct peers (those are
covered by single-hop AP-005 / AP-009).

| Anti-pattern | Predicate (depth ≥ 2) | Resolver |
|---|---|---|
| AP-019 `FoundationDowngrade` | `self.foundation > terminal.foundation` along the chain | `resolve_transitive_foundation_downgrades` |
| AP-024 `TransitiveLifecycleRegression` | `self.lifecycle.rank > terminal.lifecycle.rank` along the chain | `resolve_transitive_lifecycle_regressions` |

The shared graph-theoretic primitive lives in
[`crates/verum_kernel/src/arch_transitive.rs`](https://github.com/verum-lang/verum/blob/main/crates/verum_kernel/src/arch_transitive.rs)
as a depth-first walker:

The walker exposes a single `for_each_transitive_peer` entry
point. Inputs:

| Parameter | Role |
|-----------|------|
| `registry`| The full cog registry, keyed by name. |
| `start`   | The starting cog. |
| `visit`   | A callback invoked once per reachable peer. |

The walker uses a fixed maximum transitive depth of `32`,
matching the audit-corpus depth bound documented elsewhere in
this section.

The walker emits `PeerVisit { path, shape }` for every reachable
cog at depth `≥ 1`, with `path` recording the full chain.
Per-AP resolvers consume the visit stream and apply their own
predicate, filtering by `path.len() ≥ 3` (= depth ≥ 2 between
start and terminal, since path includes both endpoints).

### 5.1 Why a shared walker

Pre-walker, each transitive AP would have re-implemented DFS
with its own cycle-prevention and depth bound.  That created
three problems:

- **Quadratic cost** — N transitive APs walk the same graph N
  times.
- **Drift risk** — different walkers might disagree about cycle
  semantics or depth limits.
- **Soundness gaps** — re-implementations might miss edge cases
  the canonical walker handles.

Shipping the primitive once means every future transitive AP
(e.g. AP-018 `CompositionPathDeception`, planned, depth ≥ 2)
composes against `for_each_transitive_peer` rather than rolling
its own.

### 5.2 Cycle prevention

`composes_with` graphs SHOULD be acyclic (AP-003 enforces
direct cycles, the corpus invariant `NoCircularDependencies`
enforces transitive cycles).  But the walker still defends
against cycles in the case where AP-003 hasn't yet fired or the
registry is mid-population.  Each visited cog name is added to a
`BTreeSet<&str>`; revisiting short-circuits.

### 5.3 Depth bound

`MAX_TRANSITIVE_DEPTH = 32` — a cog graph 32 hops deep is either
pathological or in mid-load.  The bound prevents stack-overflow
on adversarial input; legitimate corpora have depth `≪ 32`
(typical: depth 4-8 for medium libraries, depth 1-3 for
applications).  When the walker truncates at the depth bound,
the truncation is reported in the visit stream so callers can
flag it (typically as a warning).

## 6. Cross-foundation bridges — `@framework(...)`

When a corpus genuinely needs to mix foundations (e.g. an
application written against `Foundation.ZfcTwoInacc` that
delegates a cryptographic primitive to a cog written against
`Foundation.Cic`), the bridge is declared via the
`@framework(...)` attribute.  Three flavours:

```verum
@framework(bridge_corpus, "ZfcTwoInacc → Cic via Curry-Howard")
@framework(bridge_tier,   "Aot → Interp via thin-wrapper FFI")
@framework(ats_v,         "<descriptive citation for AT-discharge>")
```

| Flavour | Discharges | Notes |
|---|---|---|
| `bridge_corpus` | `FoundationConsistency` for the named edge | Names the functor; the kernel does not check the functor's correctness — it only checks that the citation exists |
| `bridge_tier`   | Cross-tier composition (Aot ↔ Interp ↔ Gpu) | Distinct from Foundation bridge — same foundation, different runtime |
| `ats_v`         | The cog's own AT-N kernel-discharge axiom | Opaque text — auditor reads it |

The kernel records the citation but does not verify the bridge
mathematically — that responsibility lives with the auditor (or
with a dedicated proof artefact in
[`verification/external/`](https://github.com/verum-lang/verum/blob/main/verification/external/)).
The annotation is a *commitment marker*: the corpus author has
committed to a specific bridge, and the audit-bundle records
which bridges were declared and which functors discharge them.

## 7. Per-cog discipline that closes the corpus

Several per-cog ATS-V annotations are load-bearing for corpus
checks even though they declare per-cog facts:

| Per-cog declaration | Corpus closure that consumes it |
|---|---|
| `composes_with: [...]` | `NoCircularDependencies` graph edge |
| `foundation: F` | `FoundationConsistency` per-pair check |
| `stratum: S` | `NoLAbsClaim` filter (must reject `LAbs`) |
| `requires: [...]` / `exposes: [...]` | `CapabilityClosure` producer/consumer pairing |
| `lifecycle: L` | AP-024 transitive-regression chain analysis |

This is the "leverage" of ATS-V: every per-cog claim feeds
directly into a corpus-level invariant.  No cog needs to know
about the corpus — the corpus checker derives everything from
the per-cog `Shape` registry.

## 8. Composition with @arch_module

A cog that participates in a multi-cog corpus declares per-cog
intent via `@arch_module(...)`; the corpus root declares
cross-cog discipline via `@arch_corpus(...)`.  The two compose
*by aggregation*, not by inheritance:

```verum
// per-cog (every cog in the corpus has one)
@arch_module(
    foundation: Foundation.ZfcTwoInacc,
    stratum:    MsfsStratum.LCls,
    lifecycle:  Lifecycle.Theorem("v0.1"),
    exposes:    [Capability.Read(ResourceTag.Database("postgres"))],
    requires:   [],
)
module my_app.persistence.users;

// corpus-root (exactly one per binary/library)
@arch_corpus(
    invariants: [
        CorpusInvariant.NoCircularDependencies,
        CorpusInvariant.FoundationConsistency,
        CorpusInvariant.NoLAbsClaim,
        CorpusInvariant.CapabilityClosure,
    ],
)
module my_app.root;
```

When the kernel runs `arch_phase_one_with(...)`, it walks every
`@arch_module(...)` to build a per-cog `Shape`, then runs the
corpus invariants over the full registry.  A failure in either
phase produces a structured `ArchitecturalDefect` with stable
RFC code (per-cog: `ATS-V-AP-NNN`; corpus: `ATS-V-CORPUS-<name>`).

## 9. Audit-bundle integration

Both per-cog and per-corpus checks feed into the `verum audit
--bundle` aggregator.  The bundle JSON includes:

- Per-cog: every `ArchitecturalDefect` produced by AP-001..AP-040
- Per-corpus: every `CorpusViolation` from the four canonical
  invariants
- Roster summaries: lifecycle distribution, AP frequency,
  framework citation graph
- Discharge proofs: every `kernel_arch_*` axiom's verdict per
  cog and overall

The corpus-level part of the bundle is what the audit gate
inspects when promoting a release.  An empty
`CorpusReport.violations` is the load-bearing predicate — see
the §3 helper.

## 10. Self-application — the corpus types itself

The cog `core.architecture.corpus` *itself* declares
`@arch_module(foundation: ZfcTwoInacc, stratum: LFnd,
lifecycle: Theorem("v0.1"))`.  The corpus that includes the
corpus checker is checked by the corpus checker.  This is the
[self-application](../self-application.md) discipline: ATS-V
types its own implementation by the same machinery it offers
user code.  The four canonical invariants apply to
`core.architecture.corpus` as much as to any user cog:

- **NoCircularDependencies** — `core.architecture.corpus` does
  not compose with anything that transitively re-imports it.
- **FoundationConsistency** — every transitive peer of
  `core.architecture.corpus` is `ZfcTwoInacc`.
- **NoLAbsClaim** — `core.architecture.corpus` declares
  `LFnd`, not `LAbs`.
- **CapabilityClosure** — `core.architecture.corpus` requires
  no privilege beyond the standard kernel-discharge intrinsic.

This closure is what makes the corpus-side of ATS-V trustable:
the verifier's verifier is the same as the verifier.

## 11. Cross-reference

- [Anti-pattern catalog overview](../anti-patterns/overview.md)
- [Capability ontology — AT-1 closure](../primitives/capability.md)
- [Cross-side pin tests](../cross-side-pin.md)
- [Operationalisation surface](../operationalisation.md)
- [Self-application](../self-application.md)
- [Adversarial threat modelling](../red-team.md)

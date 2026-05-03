---
sidebar_position: 3
title: "Boundary / lifecycle / capability ontology (AP-011 .. AP-026)"
description: "The middle sixteen ATS-V anti-patterns: stratum admissibility, boundary invariants, wire encoding, authentication, capability flavours, lifecycle transitivity, declaration drift, foundation-content alignment."
slug: /architecture-types/anti-patterns/articulation
---

# Boundary / lifecycle / capability ontology (AP-011 .. AP-026)

Band 2 covers the architectural defects that touch the
**capability ontology** (linear / affine / relevant / unrestricted
flavours), **boundary discipline** (wire encoding, authentication,
invariants), and **lifecycle / foundation transitivity**
(transitive citation chains, declaration vs body drift,
foundation-content mismatch).

Patterns in this band fire either at **arch-check** (per-cog
predicates that touch only `Shape` plus the
[`DiagnosticContext`](../../reference/glossary)) or at
**post-arch** (transitive predicates that walk the cog graph).

This page paraphrases each entry's predicate from
the canonical anti-pattern catalog and its per-pattern predicates. For the
catalog's overall structure see
[Anti-pattern overview](./overview.md).

---

## AP-011 — AbsoluteBoundaryAttempt {#ap-011}

**Severity:** error · **Phase:** arch-check · **Stable since:** v0.2

**Predicate.** `Shape.stratum ≠ MsfsStratum::LAbs`. A cog
declaring `stratum: LAbs` violates AFN-T α (MSFS Theorem 5.1):
the absolute foundation stratum is uniformly empty by
construction.

**Why it matters.** `LAbs` is the MSFS hierarchy's "outside-the-
hierarchy" marker; an algorithm that *claims* membership in
`LAbs` claims something AFN-T α refutes. The check protects the
[reflection tower](../../verification/reflection-tower) from
silent stratum corruption.

**Remediation.** Change the stratum to one of
`{LFnd, LCls, LClsTop}` per the cog's actual position in the
moduli space.

---

## AP-012 — InvariantViolation {#ap-012}

**Severity:** error · **Phase:** post-arch · **Stable since:** v0.2

**Predicate.** `forall b : Boundary.
forall i ∈ b.invariants. preserves(traffic(b), i)`. Every
declared `BoundaryInvariant` (`AllOrNothing`,
`DeterministicSerialisation`, `AuthenticatedFirst`,
`BackpressureHonoured`, `Custom { name }`) must be preserved by
the boundary's actual traffic.

**Why it matters.** Boundary invariants are the contract two
sides pin. A boundary that *declares* `AllOrNothing` but admits
partial-state traffic has unsound transactional semantics —
downstream consumers rely on the contract being honoured.

**Remediation.** Either remove the invariant from the boundary
declaration (admit the relaxed contract), or restructure the
traffic to honour it (typically by wrapping in a coordinator or
two-phase commit).

---

## AP-013 — DanglingMessageType {#ap-013}

**Severity:** warning · **Phase:** arch-check · **Stable since:** v0.2

**Predicate.** `forall m : MessageType ∈ boundary.messages.
exists e : WireEncoding ∈ boundary.wire_encoding. e.supports(m)`.
Every message-type carried across a boundary must have a
configured wire encoding.

**Why it matters.** A message-type without an encoding is
unimplementable: at runtime, the boundary cannot serialise the
message, and the auditor cannot inspect what crosses.

**Remediation.** Set
`@arch_module(boundary: { wire_encoding: ProtoBuf { schema_path: "..." } })`
or one of the other four canonical encodings (`VerumNative`,
`Json`, `MsgPack`, `RawBytes` — note `RawBytes` is itself an
anti-pattern unless explicitly justified).

---

## AP-014 — UnauthenticatedCrossing {#ap-014}

**Severity:** error · **Phase:** arch-check · **Stable since:** v0.2

**Predicate.** `boundary.physical_layer = Network ⇒
BoundaryInvariant::AuthenticatedFirst ∈ boundary.invariants`.
Every `Network` boundary must declare the
`AuthenticatedFirst` invariant.

**Why it matters.** Network traffic without authenticated-first
is the canonical anti-pattern from a security-architecture
perspective: it admits unauthenticated commands and is the root
cause of most breach categories. The check makes the contract
visible at the architectural layer.

**Remediation.** Add `BoundaryInvariant::AuthenticatedFirst` to
the boundary's invariants and wire the corresponding
authentication mechanism (TLS client cert, OAuth2 bearer token,
mTLS, etc.).

---

## AP-015 — DeterministicViolation {#ap-015}

**Severity:** error · **Phase:** arch-check · **Stable since:** v0.2

**Predicate.** `Shape.tag = "dst_test" ⇒ ∀ deps. deterministic(deps)`.
A deterministic-simulation-test (DST) cog must not depend on
non-deterministic primitives (system time, random, network
ordering, file-system enumeration order).

**Why it matters.** DST tests are reproducibility-critical: their
verdict must be a function of the seed alone. A test that uses
`Time::now()` or `Random::default()` produces flaky results that
the audit chronicle cannot trust.

**Remediation.** Inject the non-determinism source as a
[context](../../language/context-system) (`using [Clock, Rng]`)
and wire a deterministic implementation in the test harness.

---

## AP-016 — CapabilityDuplication {#ap-016}

**Severity:** error · **Phase:** arch-check · **Stable since:** v0.2

**Predicate.** `forall c : Linear ∈ Shape.requires.
multiplicity(c, Shape.exposes ∪ uses(cog)) ≤ 1`. A linear
capability may be used at most once.

**Why it matters.** Linearity is multiplicity-1; using a linear
capability twice violates the substructural-logic discipline that
backs Verum's safety story.

**Remediation.** Either consume the capability exactly once, or
weaken its `@quantity(1)` to `@quantity(omega)` if duplication
is acceptable for that capability.

---

## AP-017 — OrphanCapability {#ap-017}

**Severity:** warning · **Phase:** arch-check · **Stable since:** v0.2

**Predicate.** `forall c : Relevant ∈ Shape.requires.
exercised(c, body(cog))`. A relevant capability declared in
`requires` must actually be exercised somewhere in the cog
body.

**Why it matters.** Relevant capabilities (substructural
multiplicity ≥ 1) are *required to be used*. An orphan
relevant capability is either an over-declared surface
(remove it) or a missing implementation (fix the body). Either
way, the architecture lies about what the cog does.

**Remediation.** Either remove the capability from `requires`
or add the missing usage in the body.

---

## AP-018 — MissingHandoff {#ap-018}

**Severity:** error · **Phase:** post-arch · **Stable since:** v0.2

**Predicate.** `forall composition c. c.passes_capability ⇒
c.target ∈ Shape.composes_with`. A cog that hands off a
capability to another cog must list that cog in
`composes_with`.

**Why it matters.** Capability handoff is composition with
side-effects: the receiving cog now holds something the
auditor cannot trace from the source cog's `composes_with`
list. The check ensures every handoff is architecturally
visible.

**Remediation.** Add the receiving cog's identifier to the
sending cog's `composes_with` list.

---

## AP-019 — FoundationDowngrade {#ap-019}

**Severity:** error · **Phase:** post-arch · **Stable since:** v0.2

**Predicate.** `forall (A → B) ∈ proof_chain.
A.foundation.strength ≥ B.foundation.strength ∨
exists bridge(A, B)`. A proof chain must not silently downgrade
the foundation between steps without an explicit
functor-bridge.

**Why it matters.** Foundation strength is monotone under proof
composition: a Cubical proof can be imported into a HoTT
context, but the reverse needs a bridge that proves the
preservation contract. Silent downgrade hides the fact that the
proof is no longer load-bearing in the upstream foundation.

**Remediation.** Add a functor-bridge cited via
`@framework(bridge_corpus, ...)`, or align the proof chain to
work in the weaker foundation throughout.

---

## AP-020 — TimeBoundLeakage {#ap-020}

**Severity:** warning · **Phase:** arch-check · **Stable since:** v0.2

**Predicate.** `forall c : TimeBound ∈ Shape.requires.
exercised_within(c.until, c)`. A time-bound capability must be
exercised before its declared expiry.

**Why it matters.** A time-bound capability whose deadline can
elapse before exercise is dead code at the architecture level —
it consumes auditing budget without protecting any boundary.

**Remediation.** Either tighten the issuing scope so the
capability is exercised before expiry, or extend the expiry
policy so it covers the actual usage window.

---

## AP-021 — PersistenceMismatch {#ap-021}

**Severity:** warning · **Phase:** arch-check · **Stable since:** v0.2

**Predicate.** `forall c : Persist ∈ Shape.requires.
durable(operations_under(c))`. A `Persist` capability must
guard operations that actually have durable semantics.

**Why it matters.** Declaring `Persist { medium: Disk { path } }`
for an operation that only writes to a buffer is a category
error: the audit chronicle records "persisted" but the
operation evaporates on process exit.

**Remediation.** Either move the operation to a durable medium
(actual disk write, database commit, distributed-log append)
or downgrade the capability to a non-persistent flavour.

---

## AP-022 — CapabilityLaundering {#ap-022}

**Severity:** error · **Phase:** post-arch · **Stable since:** v0.2

**Predicate.** `forall (A → B → C) ∈ capability_chain.
A.privilege ≤ C.privilege ⇒ visible_handoff(A, B) ∧ visible_handoff(B, C)`.
Multi-hop privilege escalation must trace through visible
boundaries at every step.

**Why it matters.** Capability laundering is the architectural
analogue of privilege escalation in a security context: the
final cog ends up with elevated privilege the auditor cannot
attribute to a specific source. Every hop must declare what it
hands off, so the chronicle reconstructs the full chain.

**Remediation.** Make every privilege-elevating handoff explicit
in the sending cog's `composes_with` list and the receiving
cog's `requires` list.

---

## AP-023 — FoundationForgery {#ap-023}

**Severity:** error · **Phase:** post-arch · **Stable since:** v0.2

**Predicate.** `Shape.foundation.consistent_with(cited_axioms)`.
A cog declaring `foundation: Hott` must not cite
`@framework(corpus, ...)` axioms from a foundation Hott cannot
interpret.

**Why it matters.** Foundation forgery is one of the most subtle
architectural defects: the auditor reading the Shape sees
"this cog uses HoTT" but the body relies on axioms that need
ZFC + extra inaccessibles. The audit verdict would be
load-bearing-on-paper but not in fact.

**Remediation.** Either align the cited corpus to the declared
foundation, or change the declared foundation to one that
admits all cited axioms.

---

## AP-024 — TransitiveLifecycleRegression {#ap-024}

**Severity:** error · **Phase:** post-arch · **Stable since:** v0.2

**Predicate.** `forall path = (A_1 → ... → A_n) ∈ citation_chain.
∀ i. A_i.lifecycle.rank() ≥ A_{i+1}.lifecycle.rank()`. The
direct-citation regression rule (AP-009) lifted to transitive
chains.

**Why it matters.** A theorem `[Т]` may legitimately cite a
postulate `[П]`, which legitimately cites another theorem
`[Т]`, but if the chain ever passes through a hypothesis `[Г]`,
the original theorem inherits the hypothesis's strength even
though no single citation regresses. Transitive walking
surfaces this.

**Remediation.** Mature every link in the chain to at least the
citing artefact's rank, or insert an explicit downgrade marker
that breaks the transitive claim.

---

## AP-025 — DeclarationDrift {#ap-025}

**Severity:** error · **Phase:** arch-check · **Stable since:** v0.2

**Predicate.** `Shape == infer_shape(body(cog))`. The declared
`@arch_module(...)` shape must match the inferred shape from
the cog body.

**Why it matters.** Declaration drift is the catch-all
architectural defect: anything the body does that the
declaration doesn't capture (and vice-versa) is a lie at the
architecture level. Auditors reading attributes must be reading
truth.

**Remediation.** Either update the declaration to match the
body (the audit's preferred fix) or remove the body content
the declaration doesn't admit.

---

## AP-026 — FoundationContentMismatch {#ap-026}

**Severity:** warning · **Phase:** arch-check · **Stable since:** v0.2

**Predicate.** `forall construct ∈ body(cog).
construct.foundation ⊆ Shape.foundation.admitted_constructs()`.
The cog's body must not invoke language constructs that belong
to a different foundation than the declared one.

**Why it matters.** Cubical-only constructs (`Path`, `hcomp`,
`transp`) inside a ZFC-foundation cog mean either the cog is
mis-declared or the construct is being used informally. Either
way, the auditor's foundation-strength reasoning is wrong.

**Remediation.** Either change `Shape.foundation` to one that
admits the construct, or rewrite the body to avoid the
foreign-foundation construct.

---

## See also

- [Anti-pattern catalog overview](./overview.md) — the indexing
  page with the full 32-entry table.
- [Capability / composition core (AP-001..AP-010)](./classical.md)
- [Modal-temporal anti-patterns (AP-027..AP-032)](./mtac.md)
- [Reflection tower](../../verification/reflection-tower) — for
  the AP-011 `LAbs` claim's MSFS Theorem 5.1 backing.
- [Three-tier reference model](../../language/memory-model) — for
  AP-016 `CapabilityDuplication`'s linearity discipline.

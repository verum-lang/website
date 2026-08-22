---
sidebar_position: 90
title: "ATS-V-2 — Inference-First (accepted design)"
description: "The accepted successor design: computed Shapes, pinned intent, a two-direction judgment, and physical enforcement — with the first pieces already shipping."
---

# ATS-V-2 — Inference-First

ATS-V-1, documented across this section, is a *declarative* system:
the author writes `@arch_module(...)`, the compiler audits the claim.
Its own history shows the failure mode that direction invites — an
annotation layer that is not continuously enforced accumulates
confident falsehood (see the update note in the
[Architecture-as-Types blog post](/blog/architecture-as-types)).

ATS-V-2 is the accepted successor design (August 2026, forged in an
adversarial two-session design duel). The direction of truth
inverts, and the first pieces are **already shipping**.

## The two-layer law

1. **Inferred Shape** — the compiler *computes* every module's
   capability surface from its body. Inference is row-based:
   per-function summaries solved over the call graph (SCC fixpoint),
   so capabilities propagate *transitively* — a helper's `Network`
   reaches the module surface through its callers, and mounted
   callees resolve across module boundaries. Higher-order code stays
   polymorphic through **capability rows**: a combinator like `map`
   is transparent (its surface is exactly its argument's), so the
   corpus never collapses to "may do anything". There is deliberately
   *no* "any capability" element: the widest expressible surface is
   an explicit list, and every widening is legible in a diff.
2. **Pinned Shape** — the annotation now *pins intent* rather than
   inventing the record. The judgment runs in **both directions**:
   code exceeding its pin is a *capability escalation*; a pinned
   right nothing exercises is a *dead right* (feeding a rights-rot
   discipline where cold-path rights stay alive only with executed
   drills).

Provenance is part of every fact: an atom is `computed` when the
inference derived it, or carries a *citation* (an extern pin, a
protocol's declared bound) — one evidence discipline from the proof
kernel to the architecture.

## Bounded seams

* **Protocols declare `@max_shape(...)`** — the upper bound of their
  implementations. A call through a protocol-typed parameter
  contributes the bound as a cited fact and keeps the caller's
  summary closed. Erasure does not launder: storing into a
  protocol-typed slot is judged by the same bound.
* **Extern/FFI** is never inferred across the horizon: it carries a
  mandatory pin, cited, on the author's authority.

## Physical enforcement (design, landing next)

Declared surfaces compile into enforcement: process-level syscall
filters derived from the Shape (Verum owns its entire syscall
surface, which makes this uniquely cheap), with an honestly-scoped
boundary — filters only narrow, so *widening rights is a process
rebirth, never a mutation of a standing filter*. Cross-domain value
flow is checked statically: a payload carrying rights the destination
domain does not allow is a compile-time diagnostic ("this right dies
at the boundary"), not a runtime surprise kill.

## What ships today

* `verum arch query --at FILE [--json]` — the inferred surface, the
  pin, and the two-direction judgment, with per-atom provenance and
  per-function summaries. The JSON schema is append-only: it is the
  machine contract for coding agents (ask → patch → diff).
* Transitive, cross-module inference in the compiler phase feeding
  the same AP-001 machinery this section documents.
* Protocol `@max_shape` declarations, parsed and enforced at seams.

The full formal treatment (row algebra, generalisation rule,
domain-flow law, fixpoint) lives in the language repository's design
documents; this page tracks what is user-visible.

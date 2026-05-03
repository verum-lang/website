---
sidebar_position: 12
title: "Architectural adjunctions"
description: "Four canonical adjunctions the analyzer recognises in design moves: Inline ⊣ Extract, Specialise ⊣ Generalise, Decompose ⊣ Compose, Strengthen ⊣ Weaken."
slug: /architecture-types/adjunctions
---

# Architectural adjunctions

An **adjunction** in the architectural sense is a pair of design
moves that are *inverses up to a preservation/gain manifest*. The
ATS-V adjunction analyzer recognises four canonical pairs in the
project's design graph and reports each instance with the
invariants it conserves and the obligations it lifts.

The analyzer is part of the audit pipeline (`verum audit
--adjunctions`) and produces a structured report listing every
recognised pair, the cogs involved, and the preservation/gain
manifest. Adjunctions are *recoverable counterfactuals* — they
identify design moves that the project could undo or redo
without breaking the load-bearing audit verdict.

## 1. The four canonical adjunctions

| Left adjoint | Right adjoint | What the move expresses |
|--------------|---------------|------------------------|
| **Inline** | **Extract** | Inline a function vs extract a method to its own module |
| **Specialise** | **Generalise** | Make a generic interface concrete vs lift a concrete one to generic |
| **Decompose** | **Compose** | Split a cog into sub-cogs vs merge sub-cogs into one |
| **Strengthen** | **Weaken** | Tighten a precondition vs relax it |

Each pair satisfies the adjunction property: the left adjoint
followed by the right adjoint returns to a Shape *equivalent
modulo preservation/gain*. The "modulo" piece — what is preserved,
what is gained, what is lost — is the analyzer's output.

## 2. The preservation/gain manifest

For each recognised adjunction instance, the analyzer reports:

- **Preserved invariants** — the architectural invariants that
  hold equally on both sides of the adjunction.
- **Lifted obligations** — proof obligations that one side
  carries but the other does not.
- **Acquired obligations** — new proof obligations introduced by
  the move.
- **Net delta** — the difference between lifted and acquired.

A "free" adjunction (no net delta) is the strongest classification
— the move is reversible without changing the project's verdict.
A "lossy" adjunction (positive net delta in either direction)
identifies a move that changes the project's load-bearing
surface.

## 3. Inline ⊣ Extract

The Inline / Extract adjunction is the most familiar:

- **Inline** (left adjoint) — fold a function's body into its
  call site. Removes one layer of indirection; the function
  ceases to be a separate compilation unit.
- **Extract** (right adjoint) — promote a code fragment to a
  standalone function in its own cog. Adds one layer of
  indirection; introduces a new compilation unit.

The adjunction property: *inline followed by extract* returns the
function to its original shape, modulo any free variables
captured during the inline that need re-binding in the extract.

**Preserved invariants**: behaviour, return type, capability set
(inline does not introduce new capabilities; extract does not
remove them).

**Acquired/lifted obligations**: extract acquires `composes_with`
edges and a Lifecycle declaration; inline lifts those.

**Worked example**:

```verum
// BEFORE — extracted
@arch_module(lifecycle: Lifecycle.Definition)
module my_app.format.user;

public fn format_user(u: &User) -> Text {
    f"User({u.id}, {u.email})"
}

// AFTER — inlined into the single call site
fn render_dashboard(users: &List<User>) -> Text {
    users.iter()
         .map(|u| f"User({u.id}, {u.email})")     // <-- inlined
         .collect::<Text>()
         .join("\n")
}
```

The analyzer recognises the move and reports:

```
adjunction: Inline ⊣ Extract
  left  (inline):  my_app.dashboard
  right (extract): my_app.format.user

  preserved: [behaviour, return_type, capabilities]
  lifted:   [composes_with("my_app.format.user"),
             lifecycle("my_app.format.user", Definition)]
  acquired: []
  net delta: -2 (move reduces audit surface)
```

## 4. Specialise ⊣ Generalise

The Specialise / Generalise adjunction:

- **Specialise** (left) — instantiate a generic at a specific
  concrete type, producing a non-generic specialised cog.
- **Generalise** (right) — abstract over a concrete type
  parameter, producing a generic cog.

The adjunction property: *generalise followed by specialise* at
the original concrete type returns to a behaviour-equivalent cog,
modulo the generic version's additional dispatch overhead at
runtime.

**Preserved invariants**: behaviour at the specialised type,
capability set, refinement-type predicates that don't depend on
the type parameter.

**Acquired obligations** (in the generalise direction): the
generic cog acquires obligations to satisfy the type parameter
under all instantiations the project might exercise.

## 5. Decompose ⊣ Compose

The Decompose / Compose adjunction:

- **Decompose** (left) — split a cog into smaller sub-cogs along
  a natural seam (boundary, capability, lifecycle).
- **Compose** (right) — merge sub-cogs back into one.

The adjunction property: *decompose followed by compose* using
the same seam returns to an equivalent cog, modulo the
intermediate cogs' independent annotations.

**Preserved invariants**: aggregate behaviour, aggregate
capability set, aggregate boundary invariants.

**Acquired obligations** (in the decompose direction): each
sub-cog acquires its own `Shape` annotation and its own
Lifecycle.

**Lifted obligations** (in the compose direction): the merged
cog's Shape becomes a single annotation; the intermediate
`composes_with` edges disappear.

## 6. Strengthen ⊣ Weaken

The Strengthen / Weaken adjunction operates on contracts:

- **Strengthen** (left) — tighten a precondition or weaken a
  postcondition.
- **Weaken** (right) — relax a precondition or strengthen a
  postcondition.

The adjunction property is more subtle here: the move is sound
in only one direction at a time. Strengthening the precondition
is sound (the function carries less responsibility); weakening
the postcondition is sound (the function promises less). The
inverse moves are *unsound* unless an additional proof discharge
is provided.

The analyzer therefore reports Strengthen ⊣ Weaken instances
*with directionality* — the move is recognisable, but the report
flags whether the move was sound in the direction taken.

## 7. The audit gate output

`verum audit --adjunctions` produces a structured report:

```json
{
  "schema_version": 1,
  "verum_version": "0.x.y",
  "instances": [
    {
      "adjunction": "Inline ⊣ Extract",
      "left_cog":  "my_app.dashboard",
      "right_cog": "my_app.format.user",
      "preservation": {
        "preserved": ["behaviour", "return_type", "capabilities"],
        "lifted":    ["composes_with", "lifecycle_definition"],
        "acquired":  [],
        "net_delta": -2
      }
    },
    ...
  ],
  "summary": {
    "total_instances":     4,
    "free_adjunctions":    2,
    "lossy_adjunctions":   1,
    "directional_only":    1
  }
}
```

The gate's verdict is `recognised` if the analyzer found
adjunctions matching the canonical patterns; the verdict does
not pass/fail the audit on its own (most projects have multiple
recognisable adjunctions). The gate's *liveness pin* is a
synthetic Shape pair designed to *fail* recognition; the
analyzer reports the synthetic as `unrecognisable`, confirming
the recogniser is non-vacuous.

## 8. Adjunction chains

Real codebases contain adjunction *chains* — sequences of
related moves. A typical chain:

```
A   ─Decompose→   {A1, A2}   ─Inline→   B
                   ↑                    ↑
                   ─Compose─            ─Extract─
                       ↑                    ↑
                   {A1, A2}                A
```

The analyzer recognises chains and reports them as a single
`adjunction_chain` entry with the per-step preservation/gain
aggregated across the chain.

## 9. Why this matters

Architectural evolution is rarely a single move; it is a sequence
of related moves over the project's lifetime. The adjunction
analyzer makes each move *first-class* — every Inline/Extract,
Specialise/Generalise, Decompose/Compose, Strengthen/Weaken pair
is recognisable, with its preservation/gain documented.

Two consequences:

1. **Refactoring becomes auditable.** A team that runs
   `--adjunctions` before and after a refactor sees the exact
   architectural delta. A refactor that "should be free" but
   produces a positive net delta is a refactor that introduced
   architectural debt.
2. **Design exploration becomes systematic.** Faced with "should
   I extract this method or inline it?", the team runs the
   analyzer on both candidates and compares preservation
   manifests. The decision is no longer aesthetic.

## 10. Cross-references

- [Counterfactual reasoning](./counterfactual.md) — the
  underlying machinery for non-destructive evaluation.
- [MTAC](./mtac.md) — the modal-temporal vocabulary
  `Counterfactually(P)` shares with the counterfactual engine.
- [Audit protocol](./audit-protocol.md) — the `--adjunctions`
  gate runner.
- [Anti-pattern overview](./anti-patterns/overview.md) — the
  catalog the adjunction analyzer cooperates with.

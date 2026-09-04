---
sidebar_position: 34
title: Language Laws
description: Well-formedness rules that make whole defect classes inexpressible — constructor visibility horizon and boolean-equality clarity.
---

# Language Laws

Verum's design philosophy is that the most valuable guarantees are the
ones the language makes **inexpressible to violate** — not caught by a
linter, not repaired by the compiler, but simply not part of the
language. This page documents the *language laws*: well-formedness
rules layered on top of the grammar. Precedence and parsing are never
changed by a law — a law only rejects programs whose meaning would be
silently surprising.

Laws roll out in three stages: **warn** (the default — violations
compile with a diagnostic), **strict** (`--language-laws=strict` or
`VERUM_LANGUAGE_LAWS=strict` — violations are errors), and eventually
strict-by-default with a documented legacy escape hatch.

## Law 1 — Constructor visibility horizon

A bare (unqualified) variant constructor is legal only when its owning
sum type is in the file's *mount horizon*:

* the type is **declared in the same file**, or
* the type is **named by an explicit `mount`** of the file (directly,
  or via a braced list — mounting a variant name brings its owning
  type into the horizon), or
* the type is one of the three **prelude carriers**: `Maybe`,
  `Result`, `Ordering` — whose constructors (`Some`, `None`, `Ok`,
  `Err`, `Less`, `Equal`, `Greater`) are bare everywhere.

Outside the horizon, write the constructor qualified: `Type.Variant`.
Glob mounts (`mount m.*`) import types and functions but do **not**
extend the bare-constructor horizon.

```verum
mount core.database.sqlite.native.hooks_api.op.{UpdateOp, UoInsert};

fn ok() -> UpdateOp {
    UoInsert                    // in horizon: mounted explicitly
}

fn also_ok() -> core.database.sqlite.native.hooks_api.op.UpdateOp {
    UpdateOp.UoInsert           // qualified: always legal
}

fn rejected() -> SomeOtherEnum {
    StrayCase                   // E430: bare constructor outside its
                                // type's mount horizon — write
                                // `SomeOtherEnum.StrayCase` or mount it
}
```

### Why

Two different library modules may legitimately reuse variant
spellings (`UoInsert` as an update-hook op *and* as an audit event; a
dozen types spelling a variant `IoError`). Without a horizon rule,
resolving a bare constructor requires global tiebreak heuristics —
and any heuristic sometimes picks the wrong owner *silently*,
constructing a value of the wrong type or with the wrong tag. The
horizon makes the owner a **local, deterministic fact of the file**:
either exactly one mounted type declares the name, or the program
says so explicitly.

Diagnostics: `E430` (outside horizon, with a did-you-mean listing
candidate owners) and `E431` (two horizon types declare the same
constructor — qualify to disambiguate).

:::warning `E431` does not exist yet
Measured 2026-09-03: `E431` is in no registry entry and at no emit site,
while `E430` and `E432` — named in the same place in that registry —
are both present.

The situation it describes is not diagnosed at all, and resolves
silently by source order:

```verum
public type A is Pending | Done;
public type B is Pending | Failed;

let x = Pending;      // compiles clean; binds to B, the LAST declarer
```

Passing that `x` to a function taking `A` is refused; taking `B` is
accepted. Swap the two declarations and the answer swaps with them.

Until the diagnostic lands, qualify the constructor — `A.Pending` — when
more than one type in the horizon declares the name. The rule this page
states is the intended one; the compiler does not yet enforce it.
:::

## Law 2 — Boolean-equality clarity

Inside a bare `&&` / `||` chain, an `==` or `!=` whose **both operands
are `Bool`** must be parenthesized when its sibling conjunct is also a
boolean atom:

```verum
fn law(a: Bool) -> Bool
    ensures (a && a) == a       // explicit: fine
{
    a
}

fn vacuous(a: Bool) -> Bool
    ensures a && a == a         // E432: parses as `a && (a == a)`,
                                // which is just `a` — with Bool
                                // operands BOTH readings type-check,
                                // so the mis-parse is silent
{
    a
}
```

Ordinary comparisons are untouched — `x == a || x == b` and
`n >= 0 && flag == true` remain exactly as they are.

### Why

`==` binds tighter than `&&` in Verum, as in most languages, and that
is not changing — a precedence change would silently re-parse
existing programs, the one migration hazard worse than any error.
The problem is narrower: when the operands are boolean, *both*
readings type-check, so nothing tells you the program means something
other than what it says. In `requires`/`ensures` clauses this is the
worst possible failure mode — a mis-stated boolean law can become a
tautology and *prove vacuously*. The law converts that silent
divergence into `E432`, which prints the actual parse next to both
bracketed readings.

## Interaction with verification

Both laws exist first for the proof surface. A vacuous `ensures` is
worse than a failing one; a constructor bound to the wrong owner
makes an obligation about the wrong type. Under
`@verify(thorough)` and the deterministic profile, the strict mode of
these laws is implied.

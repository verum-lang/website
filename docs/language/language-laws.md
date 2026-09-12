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
compile with a diagnostic), **strict** (`VERUM_LANGUAGE_LAWS=strict` —
violations are errors), and eventually strict-by-default with a
documented legacy escape hatch. `VERUM_LANGUAGE_LAWS=legacy` silences
them entirely.

:::caution The mode is an environment variable only
There is no `--language-laws` flag. `verum check --language-laws=strict`
exits with `error: unexpected argument '--language-laws' found`; the
variable is read once per process, so set it on the command:

```bash
VERUM_LANGUAGE_LAWS=strict verum check my_file.vr
```
:::

**Warn means the program still compiles, and the questionable
resolution still happens.** That is the point of the stage, and it is
worth seeing before reading the laws below. This file declares nothing
and mentions a constructor that belongs to a stdlib type it never
mounts:

```verum
fn main() {
    let x = AdjointReversible;
    print("built");
}
```

```
$ verum check probe.vr
warning<E430>: bare constructor 'AdjointReversible' resolves outside
               this file's mount horizon to 'Reversibility'

$ VERUM_LANGUAGE_LAWS=strict verum check probe.vr
error<E100>: unbound variable: AdjointReversible
error: compilation failed with 1 error
```

Note what strict mode does and does not do (measured 2026-09-11): it
withdraws the out-of-horizon resolution, so the name has nothing left
to bind to and the refusal arrives as an ordinary **unbound variable**.
It does not arrive as `E430`, and it carries none of the law's
"qualify it or mount it" help. Reach for the warning text when you need
to know *why* a name went unbound under strict.

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

fn flagged() -> SomeOtherEnum {
    StrayCase                   // E430: bare constructor outside its
                                // type's mount horizon — write
                                // `SomeOtherEnum.StrayCase` or mount it.
                                // A WARNING at the default stage: this
                                // function compiles, and `StrayCase`
                                // binds to whatever owner resolution
                                // picked. An error only under
                                // `VERUM_LANGUAGE_LAWS=strict`.
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

## Law 3 — Irrefutable binding

Three positions bind exactly once against exactly one value, so a
pattern used in any of them must match every time: a **function
parameter** (matched against whatever the caller passes), a plain
**`let`**, and a **comprehension's `let` clause** (bound once per row).

```verum
let n = 5;
let 7 = n;                       // E429: a literal matches one value of many
let 1..=9 = n;                   // E429: a range, same objection
let 1 | 2 = n;                   // E429: an alternative can fail

set{ y for x in xs let 7 = x }   // E429: the clause binds once per row
```

The refutable case has its own production — `let … else { … }` — and a
comprehension filters with an `if` clause *before* it binds:

```verum
let Maybe.Some(x) = v else { return; };

set{ pair.1
     for email in addresses
     if email.split_once(&"@") is Maybe.Some(_)
     let pair = email.split_once(&"@").unwrap() }
```

### Why

A pattern that does not match binds nothing, and nothing says so. The
parameter case was measured first: `fn handle(Event.Keypress(code):
Event)` called with `Event.Click(999)` returned a raw variant handle
from a function declared to return `Int` — not a panic, not the payload,
a wrong value of the wrong type. The comprehension case is worse,
because its lowering is an unconditional bind with no match test: the
binding holds an unchecked payload slot and the first field read on it
dereferences null.

Unlike Laws 1 and 2 this one is not staged — E429 is an error in all
three positions, with no warn mode, because there is no reading under
which the program was meant to work.

:::caution The variant half is not enforced yet
`let Maybe.Some(x) = v;` without an `else` is still accepted and still
binds an unchecked payload. Deciding refutability for a variant needs
the resolved type — `let UserId(n) = id;` on a single-variant newtype
always matches and must stay legal — while the check that raises E429
reads the pattern's syntax. Measured 2026-09-12: the tree carries no
qualified `let Type.Variant(…)` without an `else` at all, and the four
places that destructure one already use `let … else`. Write it that way
whenever the type has more than one variant.
:::

## Interaction with verification

Laws 1 and 2 exist first for the proof surface. A vacuous `ensures` is
worse than a failing one; a constructor bound to the wrong owner
makes an obligation about the wrong type. Under
`@verify(thorough)` and the deterministic profile, the strict mode of
these laws is implied. Law 3 needs no staging — a binding that did not
happen cannot carry a proof obligation about its own value.

---
sidebar_position: 6
title: Your First Hour
description: A guided sixty minutes — from install to a verified function, through the Playground's tours and lenses.
---

# Your First Hour with Verum

One sitting, sixty minutes, no prior Verum. Each block ends with
something you *did*, not something you read.

## Minutes 0–5 · Install and open the Playground

Install ([full instructions](/docs/getting-started/installation)),
then:

```bash
$ verum play
```

The empty launch opens the **gallery**. Pick **First steps** — the
tour is [`docs/by-example`](https://github.com/verum-lang/verum/tree/main/docs/by-example)
chapters 01–04, loaded as a notebook: explanation cells you read,
code cells you run. Press `F5` on a code cell to run it; `?` shows
every key.

## Minutes 5–25 · The First steps tour

Four chapters, each a runnable cell:

1. **hello-world** — `fn main`, `print`, and the fact that a Verum
   program is one honest entry point.
2. **types** — `type Point is { x: Float, y: Float }`; records and
   sum types in one keyword. Verum is not Rust: no `struct`, no
   `enum`, no `!` macros anywhere.
3. **pattern-match** — `match` over sum types, and the `is` operator.
4. **result-error** — errors as values; `Result` without exceptions.

Edit any cell and re-run it. Nothing is hidden between cells: the
session is a growing module, and re-running from the top always
reproduces itself.

## Minutes 25–40 · Your first file

Leave the Playground (`q`), make a file:

```verum
// speed.vr
fn braking_distance_m(v: Int{>= 0}) -> Int{>= 0} {
    (v * v) / 200
}

fn main() {
    print(f"at 100 km/h: {braking_distance_m(100)} m");
}
```

```bash
$ verum run speed.vr
at 100 km/h: 50 m
```

`Int{>= 0}` is a **refinement type** — a fact the compiler carries,
and the SMT solver checks, at every call site and every return path.
Change the call to `braking_distance_m(-5)` and read the diagnostic:
the error names the violated refinement, not a page of solver
output.

## Minutes 40–50 · See what the machine sees

Back in the Playground (`verum play speed.vr`), press `Tab` to walk
the lenses:

- **Arch** — the capability surface of your code: what it reads,
  writes, and reaches. Your `speed.vr` is pure — the surface is
  empty, and that emptiness is a *verified claim*, not an absence of
  information.
- **VBC** — the bytecode your cells compile to, disassembled from the
  exact artifact the interpreter runs.
- **Tiers** — press `t`: the interpreter and the native AOT build
  both run your program, and the Playground judges their outputs
  identical, bit for bit. Two execution tiers, one semantics — this
  is the identity the toolchain holds itself to.
- **Journal** — every question you asked this session, each stamped
  with the content address of the module it was about.

## Minutes 50–60 · One verified function

```verum
// absdiff.vr
@verify(formal)
fn abs_diff(a: Int, b: Int) -> Int
    ensures result >= 0
{
    if a >= b { a - b } else { b - a }
}

fn main() {
    print(f"{abs_diff(3, 10)}");
}
```

```bash
$ verum verify absdiff.vr
         --> Verifying absdiff.vr

Verification Report:
============================================================
  ✓ abs_diff: Proved in 0.02s
  ✓ main: Proved in 0.00s

Summary: 2 proved, 0 failed, 0 timeout, 0 skipped
    Finished Verification complete
```

The `ensures` clause is not a comment — the SMT solver *proves* it
for every `a` and `b`. Now break the else branch: change `b - a` to
`a - b` and verify again:

```
  ✗ abs_diff: Failed in 0.01s
      Counterexample:
        a = 0
        b = 1
        result = (- 1)
```

The failure is not a shrug — it is a concrete input pair that
falsifies your promise.

That is the whole loop: write, run, look through a lens, prove.

## Where to next

- The remaining gallery tours: **Collections & functions**,
  **Abstraction**, **Researcher** — same format, deeper water.
- [The language tour](/docs/getting-started/tour) — the written
  version, wider coverage.
- [Gradual verification](/docs/verification/gradual-verification) —
  from plain tests to full formal proofs, one attribute at a time.
- [The Playground reference](/docs/tooling/playbook) — books,
  bit-for-bit replay, frozen reports.

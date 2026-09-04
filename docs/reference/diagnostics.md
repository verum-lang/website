---
title: Diagnostic codes
description: The diagnostic codes you are most likely to meet, what they mean, and what usually causes them.
---

# Diagnostic codes

Every compiler diagnostic carries a stable code:

```
error<E400>: Type mismatch: expected 'Int', found 'List<Int>'
  --> src/main.vr:5:18
   │
 5 │     let y: Int = xs;
   │                  ^^
```

This page covers the codes you are most likely to meet, not all of them —
the compiler's own registry holds considerably more, and `verum explain
<code>` prints the description for any code, listed here or not.

Codes are grouped by category, and the number range tells you which phase
rejected the program. That is often enough to know where to look: an `E1xx`
means the compiler could not find a name, so the problem is a `mount` or a
spelling; an `E4xx` means it found everything and the types disagree.

| Range | Category | Phase |
|-------|----------|-------|
| `E0xx` | Parse | Lexing and parsing |
| `E1xx` | Name resolution | Binding names to declarations |
| `E2xx` | Module | `mount` resolution and visibility |
| `E3xx` | Memory | CBGR: moves, borrows, lifetimes |
| `E4xx` | Type | Inference, unification, protocols |
| `E5xx` | Verification | Contracts, refinements, SMT |
| `E6xx` | Context | The `using [...]` dependency system |
| `E7xx` | Async | Futures, tasks, cancellation |
| `E8xx` | FFI | Foreign boundary and ABI |
| `E9xx` | Internal | Compiler bugs — please report |

## Parse — `E0xx`

| Code | Meaning |
|------|---------|
| `E001` | unexpected token |
| `E002` | unterminated string literal |
| `E003` | invalid escape sequence |
| `E004` | missing closing delimiter |
| `E005` | expected expression |
| `E006` | invalid integer literal |
| `E007` | invalid float literal |

A parse error worth calling out separately, because it reads oddly the
first time: putting a record literal directly in a `match` scrutinee makes
the parser take the literal's `{` as the match body.

```verum
match Shape.Rect { w: 3, h: 4 } { ... }   // E087 / E018
let s = Shape.Rect { w: 3, h: 4 };        // bind first
match s { ... }
```

## Name resolution — `E1xx`

| Code | Meaning |
|------|---------|
| `E100` | undefined variable |
| `E101` | undefined type |
| `E102` | undefined function |
| `E103` | field not found on type |
| `E104` | duplicate definition |
| `E105` | ambiguous name |

`E102` also covers calling a function with too few arguments — the message
names the arity:

```
error<E102>: Function requires at least 5 arguments, got 4 (calling `verify_pss_prehashed`)
```

`E103` is the one to read carefully when a field name *looks* right. It
means the type has no such field — usually a rename the call site never
followed (`pre_release` vs `prerelease`, `peer_addr` vs `peer`).

## Module — `E2xx`

| Code | Meaning | Emitted? |
|------|---------|----------|
| `E200` | import not found | **no** — see below |
| `E201` | circular import | yes |
| `E202` | private item imported | **no** |
| `E203` | module not found | **no** — see below |

:::warning Three of these four never fire
Measured 2026-09-04: only `E201` has an emit site. `E200`, `E202` and
`E203` are registry entries that nothing produces, and the conditions
they name are reported by the **type** codes instead:

```verum
mount core.zzz.nothing;                      // error<E402>: module `core.zzz` not found
mount core.collections.list.{NoSuchSymbol};  // error<E401>: cannot find `NoSuchSymbol` in module …
```

So a reader who meets "module not found" and looks up `E203` finds a
code the compiler will never show them, while the one they did see —
`E402` — is filed under Type below, described as "module not found;
also `Send` not implemented, and …". One code, several jobs.

`E202` fires for nothing because import privacy is not enforced at all:
the five-level visibility table in
[language/modules](/docs/language/modules) is documentation of an
intent, not of a check.
:::

## Memory — `E3xx`

| Code | Meaning |
|------|---------|
| `E310` | use after move |
| `E311` | double move |
| `E312` | lifetime error |
| `E313` | dangling reference |
| `E314` | borrow conflict |

See [CBGR](../language/cbgr.md) for the three-tier reference model these
diagnostics enforce.

## Type — `E4xx`

Four of these carry more than one meaning. The table gives the registry's
own wording, because the second meaning is usually the one you will meet:

| Code | Meaning |
|------|---------|
| `E400` | type mismatch |
| `E401` | a name is not found in the module named; also an invalid assignment or cast |
| `E402` | **module not found**; also `Send` not implemented, and mixed `Int`/`Float` arithmetic |
| `E403` | infinite (self-referential) type; also `Sync` not implemented, and undefined function |
| `E404` | inferred type is not fully determined — annotate it; also a missing protocol implementation, and an unknown field or method |
| `E405` | protocol method not implemented |
| `E406` | type inference failure |
| `E407` | recursive type without indirection |
| `E408` | dependent value-argument arity mismatch |

A code with three meanings cannot be looked up the way this page is
meant to be used — you read the message, not the number. The overload
is why `E200`/`E203` above are dead: their conditions were folded into
`E401`/`E402` and the module namespace was left standing.

`E400` is the most common diagnostic in the language, and its message always
names both sides. Three shapes are worth recognising:

**A container is not its element.**

```verum
let mut xs: List<Int> = List.new();
let y: Int = xs;
// error<E400>: Type mismatch: expected 'Int', found 'List<Int>'
```

Indexing yields the element — `let y: Int = xs[0];` — and `xs.len()` yields
a count. A collection never stands in for an integer. See
[Coercion markers](../language/coercion-markers.md) for which types may
stand in for which, and why containers are excluded.

**A sum type is not its payload.**

```verum
let m: Maybe<Int> = xs.first();
let z: Int = m;
// error<E400>: Type mismatch: expected 'Int', found 'None(Unit) | Some(Int)'
```

Unwrap it deliberately — `match`, `unwrap_or`, `?` — so the absent case has
an answer.

**A `Maybe` wrapped twice.**

```verum
fn head(xs: &List<Int>) -> Maybe<Int> {
    Maybe.Some(xs.first())   // xs.first() is ALREADY Maybe<Int>
}
// error<E400>: Type mismatch: expected 'Int', found 'Maybe<Int>'
```

The fix is to return `xs.first()` directly.

`E407` means a type contains itself with no indirection — a value of it
would need infinite size. Insert `Heap<T>`, which puts the recursive
occurrence behind an allocation:

```verum
type Tree is Leaf(Int) | Node { left: Heap<Tree>, right: Heap<Tree> };

let t = Tree.Node { left: Heap(Tree.Leaf(1)), right: Heap(Tree.Leaf(2)) };
match t {
    Leaf(v)             => print(v),
    Node { left, right } => print(0),
}
```

Note that a recursive *walk* over such a tree needs the `Heap` opened
before the child is passed on — passing `left` where a `&Tree` is expected
is an `E400`, not an `E407`.

## Verification — `E5xx`

| Code | Meaning |
|------|---------|
| `E500` | contract violated |
| `E501` | SMT solver timeout |
| `E502` | refinement predicate false |
| `E503` | precondition not satisfied |
| `E504` | postcondition not established |

`E501` is not a rejection of your program — it says the solver ran out of
budget. Narrowing a refinement or splitting a lemma usually resolves it. See
[Refinement types](../language/refinement-types.md).

## Context — `E6xx`

| Code | Meaning |
|------|---------|
| `E600` | context not provided |
| `E601` | context conflict |
| `E602` | context cycle |

`E600` means a function declared `using [Database]` was called from a scope
with no `provide` for it. See [Context system](../language/context-system.md).

## Async — `E7xx`, FFI — `E8xx`, Internal — `E9xx`

:::warning None of these nine has an emit site
Measured 2026-09-04: every code below is a registry entry that no part
of the compiler produces. Three whole categories are reserved rather
than live.

| Code | Meaning | Emitted? |
|------|---------|----------|
| `E700` | future cancelled unexpectedly | no |
| `E701` | async boundary violation | no |
| `E702` | task join error | no |
| `E800` | unsafe FFI violation | no |
| `E801` | ABI mismatch | no |
| `E802` | null pointer dereference in FFI | no |
| `E900` | internal compiler error | no |
| `E901` | compiler assertion failed | no |
| `E902` | unexpected compiler state | no |

They are listed because the registry has them and `verum --explain`
will answer for them — not because a program can provoke one. An async
misuse or an FFI mistake surfaces today as an ordinary `E4xx` type
error, and an internal failure as a panic with a backtrace rather than
a coded diagnostic.

`make check-doc-error-codes` holds this at fourteen cited-but-unemitted
codes, so the list cannot quietly grow.
:::

An `E9xx`, if one ever appears, is a compiler bug and never a problem
with your program. Report it with the smallest input that reproduces it.

## Reading a diagnostic

Three habits pay off:

1. **Read both type names in an `E400`, not just the first.** The message
   prints `expected` (what the context demands) then `found` (what the
   expression produced). Which of the two is wrong is your judgement, and
   the answer is not always "the expression".
2. **Trust the caret over the line.** Context lines are shown for
   orientation; the `^^^^` marks the sub-expression that failed.
3. **An `E1xx` before an `E4xx` usually explains it.** A name the compiler
   could not resolve degrades everything downstream of it. Fix the first
   diagnostic and re-run before reading the rest.

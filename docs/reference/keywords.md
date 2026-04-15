---
sidebar_position: 2
title: Keywords
---

# Keywords

Verum distinguishes **reserved** keywords (which cannot ever be used
as identifiers) from **contextual** keywords (which are keywords only
where the grammar expects them).

## Reserved — 3

These may never be used as identifiers:

| Keyword | Use |
|---------|-----|
| `let` | variable binding |
| `fn` | function definition |
| `is` | type definition separator / type test |

## Contextual — ~60

Keywords where the grammar expects them; ordinary identifiers
elsewhere. Grouped by purpose.

### Visibility

```
pub   public   internal   protected
```

### Declaration

```
type   module   mount   implement   context   protocol   extends
const  static   meta    ffi         extern
```

### Control flow

```
if   else   match   return   for   while   loop   break   continue
```

### Async / concurrency

```
async   await   spawn   defer   errdefer   try
yield   throws  select  nursery recover    finally
```

### Modifiers

```
mut   const   unsafe   pure   affine   linear
```

### Paths / self

```
self   super   crate
```

### Contracts / verification

```
where   requires   ensures   invariant   decreases   result
```

### Proof DSL

```
theorem   lemma   axiom   corollary   proof
calc      have    show    suffices    obtain
by        qed     induction            cases     contradiction
forall    exists
```

### Type system

```
some         (* existential types *)
dyn          (* dynamic dispatch *)
unknown      (* top type *)
```

### Runtime types

```
stream   tensor
```

### Bottom type

```
!            (* the never type, written as an operator but reserves its form *)
```

## `default` — pseudo-keyword

`default` is a contextual keyword only inside `implement` blocks
(default method bodies). Elsewhere it is an ordinary identifier — so
`let default = 42;` is legal.

## `in`

Used in:
- `for pattern in iter { ... }`
- `provide X = v in { ... }`

Not reserved.

## Why so few reserved?

Only the three most essential tokens (`let`, `fn`, `is`) are fully
reserved. Everything else can be an identifier in a context where
the grammar does not expect it. This is a deliberate stylistic choice
— keywords scale with the language's vocabulary, but the author's
naming latitude should not.

## Grammar reference

The authoritative keyword list lives in the `keyword` production of
[`grammar/verum.ebnf`](https://github.com/verum-lang/verum/blob/main/grammar/verum.ebnf).

## See also

- **[Syntax](/docs/language/syntax)** — how keywords appear in context.
- **[Grammar](/docs/reference/grammar-ebnf)** — the full grammar.

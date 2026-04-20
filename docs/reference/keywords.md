---
sidebar_position: 2
title: Keywords
description: Every reserved and contextual keyword in Verum, grouped by purpose.
---

# Keywords

Verum distinguishes **reserved** keywords — which cannot ever be used
as identifiers — from **contextual** keywords, which are keywords
only where the grammar expects them and ordinary identifiers
elsewhere.

## Reserved — only 3

These may **never** appear as identifiers:

| Keyword | Use                                                           |
|---------|---------------------------------------------------------------|
| `let`   | Variable binding (`let x = ...`).                             |
| `fn`    | Function definition (`fn foo() { ... }`).                     |
| `is`    | Type-definition separator (`type T is …`); pattern test.      |

The parser recognises these three tokens unconditionally.

```verum
let let = 42;               // SYNTAX ERROR — `let` is reserved
let fn_pointer = foo;       // SYNTAX ERROR — `fn` is reserved
let is_valid = true;        // SYNTAX ERROR — `is` is reserved
```

## Contextual — approximately 60

Contextual keywords take the keyword role only when the grammar
expects them. In any other position they are ordinary identifiers.

For example, `async` is a keyword only immediately before `fn` or at
the start of a block expression:

```verum
async fn fetch() { ... }        // keyword
let async = 42;                 // identifier — legal
print(async);                   // identifier — legal
```

Below is the full contextual keyword list, grouped by purpose. The
canonical enumeration lives in the [grammar reference](/docs/reference/grammar-ebnf).

### Visibility

```
pub    public    internal    protected    private
```

Used at the start of items. `private` is explicit (matching the
absence of any visibility).

### Declarations

```
type    module    mount    implement    context    protocol    extends
const   static    meta     ffi          extern     pattern
```

Each introduces a top-level or contained item; see the corresponding
item production in the grammar.

### Control flow

```
if    else    match    return    for    while    loop    break    continue    in
```

`in` appears in `for p in iter`, `provide X = v in { ... }`, and
quantifier bindings (`forall x in S. P`).

### Async and structured concurrency

```
async    await    spawn       defer    errdefer    try
yield    throws   select      nursery  recover     finally
biased   on_cancel
```

- `biased` — marker on `select` for prioritised branch order.
- `on_cancel` — handler attached to a `nursery` block.

### Function modifiers

```
pure    mut    const    unsafe    move    ref    default    cofix
```

- `cofix` — coinductive fixpoint; see
  [language/copatterns](/docs/language/copatterns).
- `default` is contextual: a method marked `default` inside `implement`
  is overridable by specialisations. Elsewhere — including as a
  variable name — it's an ordinary identifier.

### Metaprogramming

```
meta    quote    lift    stage
```

- `quote { ... }` — quasi-quotation.
- `lift(expr)` — cross-stage lift.
- `stage` — appears only in `$(stage N){ expr }` and `quote(N){ ... }`.

### Paths and self

```
self    super    crate    Self
```

- `self` — the current instance (lowercase), or the current module
  inside paths.
- `Self` — the implementing type (uppercase), inside protocols and impl
  blocks.
- `super` — the parent module.
- `crate` — the cog's root module.

### Contracts and verification

```
where    requires    ensures    invariant    decreases    result
```

- `requires` — precondition.
- `ensures` — postcondition; `result` refers to the return value.
- `invariant` / `decreases` — loop contracts.

### Proof DSL

```
theorem    lemma       axiom        corollary    proof
calc       have        show         suffices     obtain
by         qed         induction    cases        contradiction
forall     exists      tactic       from
```

See [language/proof-dsl](/docs/language/proof-dsl) and
[reference/tactics](/docs/reference/tactics).

### Type system

```
some                  (* existential: some T: Protocol                          *)
dyn                   (* dynamic dispatch: dyn Protocol                         *)
unknown               (* top type — the dual of `!`                             *)
universe              (* universe polymorphism: universe u                       *)
Type                  (* kind / type-of-types: Type, Type(0), Type(u)           *)
Prop                  (* universe of proof-irrelevant propositions              *)
Level                 (* universe level kind: u: Level                           *)
max                   (* level arithmetic: max(u, v)                             *)
imax                  (* impredicative max for Π into Prop                       *)
Pi                    (* explicit dependent function type: Pi (x: A) . B        *)
view                  (* pattern-level view operator                             *)
affine                (* affine type modifier: type affine Foo is …             *)
linear                (* linear type modifier: type linear Foo is …             *)
stream                (* stream literal / pattern prefix                         *)
tensor                (* tensor literal + type prefix: tensor<3, 4> Float32      *)
checked               (* &checked reference, capability-ref modifier             *)
with                  (* capability type: T with [Read, Write]                   *)
gen                   (* generator expression prefix                             *)
set                   (* set comprehension prefix                                *)
typeof                (* runtime type of an expression                           *)
```

See the following language pages for semantics:

- [`affine` / `linear`](/docs/language/linearity) — resource-kind types.
- [`Prop` / `Type(n)` / `universe` / `Level` / `max` / `imax`](/docs/language/universes) — universe hierarchy.
- [`Pi`](/docs/language/dependent-types#the-three-surface-forms-of-π) — explicit dependent-function syntax.
- [`tensor`](/docs/language/tensor-types) — shape-typed tensor types and literals.
- [row polymorphism](/docs/language/row-polymorphism) — extensible records with `| r`.

### Values

```
true    false    null
```

- `null` — the `Maybe.None` of raw pointer types; use `Maybe.None`
  in safe code.

### The bottom type

```
!       (* never type — used in type position: `fn diverge() -> !` *)
```

`!` is a token in both expression (negation / bitwise-not) and type
position (never). The parser distinguishes by context.

## Pseudo-keywords

### `default`

Contextual keyword inside `implement` blocks:

```verum
implement Display for T {
    default fn fmt(&self) -> Text { ... }       // `default` is a keyword here
}

let default = 42;                               // `default` is an identifier here
```

### `self` / `Self`

Lowercase `self` is a value parameter; `Self` is the implementing
type.

```verum
implement Foo for Bar {
    fn method(&self) -> Self { ... }           // Self = Bar
}
```

### `in`, `as`

Both contextual. `in` appears in patterns/quantifiers/`provide`;
`as` appears in casts, aliases, and mount renames.

```verum
let as = 5;                    // `as` as identifier — legal
for x in 0..10 { ... }         // `in` as keyword
let y = 3.0 as Int;            // `as` as cast operator
```

## Why so few reserved?

Only the three most essential tokens (`let`, `fn`, `is`) are fully
reserved. Everything else can be an identifier in a context where
the grammar does not expect it. This is a deliberate choice:
**keywords scale with the language's vocabulary, but the author's
naming latitude should not.**

You can name a variable `async`, `impl`, `move`, or `pattern` with no
quoting and no escape syntax — the compiler disambiguates by
position.

## Operators that look like keywords

These tokens are **not** keywords — they are operators with spellings
that resemble keywords:

| Token            | Kind                                       |
|------------------|--------------------------------------------|
| `is`             | Reserved keyword; pattern test operator.   |
| `as`             | Contextual keyword; type cast operator.    |
| `.await`         | Postfix operator (dot + keyword).          |
| `in`             | Contextual keyword; not an operator.       |

## Grammar reference

The authoritative keyword list is the `keyword` production in the
[grammar reference](/docs/reference/grammar-ebnf):

```ebnf
keyword = reserved_keyword | primary_keyword | control_flow
        | async_keywords | modifiers | ffi_keywords
        | module_keywords | additional_keywords | proof_keywords ;
```

Plus the `token` production for keyword-like literals (`true`,
`false`, `null`) and the `type` production for type-system keywords
(`Self`, `Type`, `Level`, `unknown`).

## See also

- **[Syntax](/docs/language/syntax)** — how keywords appear in
  context.
- **[Operators](/docs/reference/operators)** — operator-like tokens.
- **[Grammar](/docs/reference/grammar-ebnf)** — the full grammar.

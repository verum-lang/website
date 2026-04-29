---
sidebar_position: 22
title: Cubical / HoTT catalogue
---

# `verum cubical` — Cubical type theory + HoTT primitive catalogue

Verum is foundation-neutral: classical logic, cubical type theory,
and HoTT all coexist under per-corpus toggles.  This page covers
the **typed primitive inventory** for the cubical / HoTT layer —
the building blocks that the kernel checks and that proofs cite
when they need path induction, transport, glue, or univalence.

## Mental model

Cubical type theory replaces propositional equality with **typed
paths**.  A path between `x` and `y` in `A` is a typed object of
type `Path A x y`.  Functions act on paths functorially (`ap`),
paths can be inverted (`sym`) and composed (`trans`), and a
universal eliminator (`J` / path induction) lets you reduce
arbitrary motives over paths to the reflexive case.

On top of paths, the cubical layer adds:

- **Transport** (`transp` / `coe` / `subst`) — move terms across a
  line of types.  Fundamental computational primitive.
- **Composition** (`hcomp` / `comp`) — fill in the cube; the
  Kan-fibrancy structure that makes paths well-behaved
  computationally.
- **Glue** (`Glue` / `unglue`) — paste partial types along a face.
  This is the primitive that makes **univalence constructive**.
- **Univalence** (`ua : Equiv A B → Path U A B`) — equivalent types
  are equal (in `U`).  Constructively derivable from `Glue`.

Verum ships these as a single typed catalogue; the IDE / docs / CI
all consume the same data.

## Subcommand reference

```bash
verum cubical primitives [--category <C>] [--output plain|json|markdown]
verum cubical explain    <name>           [--output plain|json|markdown]
verum cubical rules                       [--output plain|json|markdown]
verum cubical face       <formula>        [--output plain|json|markdown]
```

### `primitives`

List every catalogue entry with a one-line semantics summary.
`--category` filters by conceptual group; valid values are
`identity`, `path_ops`, `induction`, `transport`, `composition`,
`glue`, `universe`.

```bash
$ verum cubical primitives
Cubical primitive catalogue (17):

  Name           Category       Semantics
  ──────────────  ──────────────  ──────────────────────────────
  path           identity       Typed equality.  ...
  refl           identity       Reflexivity.  ...
  sym            path_ops       Path symmetry; reverse direction.
  trans          path_ops       Path transitivity / composition.
  ap             path_ops       Functorial action on paths.
  apd            path_ops       Dependent functorial action.
  j_rule         induction      Path induction.  Eliminator for `Path`.
  transp         transport      Transport along a line of types.
  coe            transport      Coerce a term across a path of types.
  subst          transport      Substitute along a path.
  hcomp          composition    Homogeneous composition (CCHM).
  comp           composition    Heterogeneous composition.
  glue           glue           Glue at face — univalence-enabling.
  unglue         glue           Destructor for glue terms.
  equiv          universe       Type of typed equivalences.
  univalence     universe       Equivalence → path on the universe.
  path_over      identity       Heterogeneous path over a base path.
```

### `explain`

Full structured doc for a single primitive: signature, semantics,
canonical example, the computation rules it participates in, and a
stable doc anchor.

```bash
$ verum cubical explain hcomp
hcomp — composition category
────────────────────────────────────────

Signature : hcomp {A: U} {φ: 𝔽} (u: I → Partial φ A) (a: A[φ ↦ u i0]) : A
Semantics : Homogeneous composition.  CCHM primitive that drives Kan-fibrancy: glue partial compositions across the cube to a fresh face.

Example:
    hcomp (λ i [(j = 0) → p i, (j = 1) → q i]) (refl A x i)

Computation rules:
  • hcomp-id-when-empty-system
      hcomp {φ = ⊥} u a ↪ a
  • hcomp-id-when-φ-equals-1
      hcomp {φ = ⊤} u a ↪ u i1 1=1

Doc anchor: #cubical-hcomp
```

Aliases: `transport` → `transp`, `ua` → `univalence`, `J` /
`path_induction` → `j_rule`, `coercion` → `coe`, etc.  Unknown
names produce a non-zero exit.

### `rules`

The full computation-rule inventory — every reduction rule the
catalogue documents.  V0 ships **30 canonical rules** covering
identity (path-refl, path-J), path operations (sym-refl,
trans-assoc, ap-trans, apd-refl), transport (transp-fill,
coe-uncurry, subst-refl), composition (hcomp-id-when-empty-system,
comp-collapses-to-hcomp), glue (glue-on-true-face, unglue-glue),
equivalence (equiv-id, equiv-trans, equiv-sym), and univalence
(ua-id, ua-trans, ua-sym, ua-unique).

```bash
$ verum cubical rules --output markdown
# Cubical computation rules

| Name | LHS ↪ RHS | Rationale |
|---|---|---|
| `path-refl` | `refl A x` ↪ `λ i → x` | Reflexivity is the constant path … |
| `path-J` | `J A C base p` ↪ `case p of refl ⇒ base x` | Path induction reduces … |
…
```

### `face`

Parse + validate a CCHM face formula — the boundary conditions
that drive `hcomp` / `comp` / `Glue`.

```bash
$ verum cubical face "i = 0 ∧ (j = 1 ∨ k = 0)"
Face formula
  input         : i = 0 ∧ (j = 1 ∨ k = 0)
  canonical     : (i = 0 ∧ (j = 1 ∨ k = 0))
  free vars     : i, j, k
```

The parser accepts the canonical Unicode grammar (`∧` / `∨` /
`⊤` / `⊥`) and ASCII alternatives (`/\` / `\/` / `top` / `bot` /
`and` / `or`).  Precedence: `∧` binds tighter than `∨`; parens
override.  Constants: `0` / `1` / `⊤` / `⊥` / `top` / `bot`.

JSON output ships the parsed AST + canonical rendering + free
variables — useful for IDE integrations that need to inspect the
cube boundary structure programmatically.

## The 17 canonical primitives

### Identity (3)

- **`path`** — typed equality.  `Path A x y` is the type of paths
  from `x` to `y` in `A`.
- **`path_over`** — heterogeneous path over a base path.  Used in
  dependent functoriality.
- **`refl`** — reflexivity.  `refl A x : Path A x x`.

### Path operations (4)

- **`sym`** — path symmetry.  Involutive: `sym (sym p) ≡ p`.
- **`trans`** — path concatenation.  Associative; left + right
  identity is `refl`.
- **`ap`** — functorial action on paths.
- **`apd`** — dependent functorial action.

### Induction (1)

- **`j_rule`** (aliases: `j`, `path_induction`) — the J-rule.
  Path induction; reduces the eliminator on `refl` to the base
  case.

### Transport (3)

- **`transp`** (alias: `transport`) — transport along a line of
  types.  HoTT primitive.
- **`coe`** (alias: `coercion`) — coerce across a path.  Definable
  as `transp`.
- **`subst`** — substitute along a path.

### Composition (2)

- **`hcomp`** — homogeneous composition.  CCHM primitive that
  drives Kan-fibrancy.
- **`comp`** — heterogeneous composition.  Generalisation of
  `hcomp` over a varying line of types.

### Glue (2)

- **`glue`** — glue partial types along a face.  The
  univalence-enabling primitive.
- **`unglue`** — destructor for glue terms.

### Universe (2)

- **`equiv`** — type of typed equivalences.
- **`univalence`** (alias: `ua`) — `Equiv A B → Path U A B`.
  Constructively derivable from `Glue`.  `ua-unique` enforces
  uniqueness up to canonical path.

## V0 vs V1+

V0 ships:

- Production-grade typed catalogue (17 primitives × 5 categories).
- Production-grade face-formula parser / validator (Unicode +
  ASCII grammar, precedence + parens, free-variable tracking,
  canonical round-trip).
- 30 named computation rules with `lhs ↪ rhs` + rationale +
  participating primitives.
- All four CLI subcommands, every output format.

V1+ adds:

- Actual kernel-side reduction rules (currently the catalogue
  names them; the reductions live in the kernel).
- Higher inductive types (HITs) checked via the strict-positivity
  infrastructure.
- A constructive-derivability proof of `univalence` from `Glue`
  (today the primitive is admitted; the proof itself is V1).
- Per-primitive type-checking integration into `verum verify`.

The trait surface is unchanged across V0 → V1, so CLI / docs / CI
scripts continue to work identically as the kernel-side fills in.

## CI usage

Pin the catalogue's shape so any future commit that adds /
removes a primitive without updating downstream consumers fails:

```bash
verum cubical primitives --output json | jq '.count' | grep -q '^17$'
verum cubical rules      --output json | jq '.count' | grep -q '^30$'
```

## Cross-references

- **[Tactic catalogue](/docs/tooling/tactic-catalogue)** — the
  combinator surface that drives proof bodies; cubical primitives
  are the kernel-level operations the tactics manipulate.
- **[Verification → cubical-hott](/docs/verification/cubical-hott)**
  — the verification-side integration: how cubical primitives
  participate in `@verify(formal)`.
- **[Auto-paper generator](/docs/tooling/auto-paper)** — every
  primitive's `doc_anchor` is consumed for stable cross-format
  hyperlinks in rendered papers.
- **[Tactic catalogue](/docs/tooling/tactic-catalogue)** — the
  surface where you'd cite `transp`, `J`, `glue`, etc. in a
  proof body.

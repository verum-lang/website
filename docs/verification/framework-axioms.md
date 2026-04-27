---
sidebar_position: 7
title: Framework Axioms
description: Postulating external mathematical results as trusted axioms with explicit attribution, and enumerating the resulting trusted boundary via `verum audit --framework-axioms`.
---

# Framework Axioms

> Some theorems come from the rest of mathematics. Verum lets you
> postulate them as axioms while keeping the trusted boundary
> **absolutely explicit** — every external result a proof relies on
> appears by name and citation in `verum audit --framework-axioms`,
> and every exported `.verum-cert` carries the same dependency list.

## Why framework axioms exist

Not every theorem can, or should, be re-proved from first principles.

- **HTT 6.2.2.7** (Lurie's *Higher Topos Theory*) states that the
  ∞-category of sheaves on a small ∞-site is an ∞-topos. No
  mechanised proof of HTT exists in any proof assistant today.
- **Connes 2008 axiom (vii)** (the first-order condition in
  Connes–Chamseddine's spectral-triple reconstruction theorem) is a
  well-known 7-axiom package; nobody has mechanised the surrounding
  reconstruction proof either.
- **Petz 1996** classifies monotone metrics on matrix spaces — again
  known but not mechanised.

Refusing to proceed until every such result is re-proved from bare
type theory would make formalisation of non-toy physics/maths
infeasible. Pretending the results are local to the proof would make
the trusted boundary invisible to external reviewers.

Verum's resolution is a typed attribute: **declare the dependency
explicitly, at the axiom, with a citation you can look up.**

## Declaring a framework axiom

The syntax is an ordinary attribute on an `axiom` (or any theorem /
lemma / corollary you want to mark as depending transitively on an
external result):

```verum
@framework(lurie_htt, "HTT 6.2.2.7")
axiom sheafification_is_topos<C: Site>(c: C) -> Bool
    requires c.is_presentable()
    ensures  c.sheafification().is_infinity_topos();

@framework(connes_reconstruction, "Connes 2008 axiom (vii)")
axiom first_order_condition<A>(spectral_triple: A) -> Bool
    ensures spectral_triple.first_order_holds();

@framework(petz_classification, "Petz 1996 monotone metrics")
axiom petz_monotone<N: Nat>(rho: DensityMatrix<N>) -> Bool
    ensures rho.is_monotone_under_cptp();
```

Two arguments, always in this order:

1. A **framework identifier** — short, machine-readable, `snake_case`.
   Convention: match the file under `core/math/frameworks/<name>.vr`
   where the framework's full axiom package lives. The stdlib ships
   six canonical packages today; the right-hand column says how many
   axioms ship in each:

   | Identifier              | Source                                                    | Stdlib file                                      | Axioms |
   |-------------------------|-----------------------------------------------------------|--------------------------------------------------|-------:|
   | `lurie_htt`             | Lurie, *Higher Topos Theory* (2009)                       | `core/math/frameworks/lurie_htt.vr`              | 7      |
   | `schreiber_dcct`        | Schreiber, *Differential Cohomology in a Cohesive ∞-Topos* (arXiv:1310.7930) | `core/math/frameworks/schreiber_dcct.vr`        | 5      |
   | `connes_reconstruction` | Connes (2008) + Connes 2013 Theorem 1.1                   | `core/math/frameworks/connes_reconstruction.vr`  | 8      |
   | `petz_classification`   | Petz, *Monotone metrics on matrix spaces* (1996)          | `core/math/frameworks/petz_classification.vr`    | 4      |
   | `arnold_catastrophe`    | Arnold (1972) + Arnold–Mather (1974) codim ≤ 4            | `core/math/frameworks/arnold_catastrophe.vr`     | 8      |
   | `baez_dolan`            | GPS (1995), Baez–Dolan (1995), Lurie (2009)               | `core/math/frameworks/baez_dolan.vr`             | 4      |

   **36 axioms across 6 frameworks** ship in the stdlib today; adding
   a new framework is a matter of dropping a new file into
   `core/math/frameworks/` and citing it from proofs. The audit CLI
   discovers them automatically.

   Each stdlib file follows a common shape:

   - a carrier protocol (e.g. `Site`, `InfinityTopos`, `SpectralTriple`,
     `OperatorMonotoneFunction`, `FunctionGerm`, `Tricategory`) that
     witnesses the minimal algebraic data the axioms talk about;
   - one `@framework(name, "citation")` axiom per named theorem in the
     source work;
   - `requires` / `ensures` clauses carrying the precondition and the
     conclusion of each theorem so downstream `apply`-based proofs can
     actually consume them.

2. A **citation** — a free-form string literal. Be specific enough
   that an auditor can find the exact result: section number, theorem
   number, axiom name, page reference. Every stdlib-shipped axiom
   follows the pattern `"<short-ref> (<short-description>)"`, e.g.
   `"HTT 6.2.2.7"`, `"DCCT §3.9 (cohesive hexagon)"`, `"Connes 2008
   axiom (vii) — Poincaré duality"`.

The attribute is grammar-legal via the generic attribute production
`identifier , [ '(' , attribute_args , ')' ]` (see the
[Grammar reference — Visibility and attributes](../reference/grammar-ebnf.md#22-visibility-and-attributes)),
and typed by `verum_ast::attr::FrameworkAttr`. A malformed
`@framework(...)` (wrong arg count, non-string citation) is a
reportable user error, not a silent acceptance.

## Enumerating the trusted boundary

Before accepting a proof corpus for publication / audit / downstream
use, every reviewer wants to see the exact set of external results
it depends on. Verum emits that set on demand:

```bash
$ verum audit --framework-axioms

Framework-axiom trusted boundary
────────────────────────────────────────
  Parsed 42 .vr file(s), skipped 0 unparseable file(s).
  Found 12 marker(s) across 4 framework(s):

  ▸ connes_reconstruction (1 marker)
    · axiom first_order_condition  —  Connes 2008 axiom (vii)  (src/physics.vr)
  ▸ lurie_htt (5 markers)
    · axiom sheafification_is_topos  —  HTT 6.2.2.7      (src/category.vr)
    · axiom presentable_localization —  HTT 5.5.4.15     (src/category.vr)
    · axiom adjoint_functor_thm      —  HTT 5.5.2.9      (src/category.vr)
    · axiom kan_extension_universal  —  HTT 4.3.3.7      (src/category.vr)
    · axiom accessible_inf_cat       —  HTT 5.4.2        (src/category.vr)
  ▸ petz_classification (2 markers)
    · axiom petz_monotone           —  Petz 1996 monotone metrics (src/quantum.vr)
    · axiom uhlmann_fidelity        —  Petz–Uhlmann 1986          (src/quantum.vr)
  ▸ schreiber_dcct (4 markers)
    · axiom cohesive_hexagon         —  DCCT §3.9         (src/cohesive.vr)
    · axiom super_cohesion           —  DCCT §3.10        (src/cohesive.vr)
    · axiom rheonomy_modality        —  DCCT §3.12        (src/cohesive.vr)
    · axiom differential_cohesion    —  DCCT §4.1         (src/cohesive.vr)
```

- The tool walks every `.vr` file under the project root, skipping
  `target/`, hidden directories, `node_modules/`.
- Markers on `axiom`, `theorem`, `lemma`, and `corollary` declarations
  are all collected.
- Both `Item.attributes` and `{Theorem,Axiom}Decl.attributes` are
  walked, so attribute placement (outside the keyword vs inside the
  decl) does not affect visibility.
- Malformed `@framework(...)` attributes make the command exit
  non-zero, so CI can gate on "no hidden axioms":

  ```bash
  $ verum audit --framework-axioms
  ...
  ⚠  1 malformed @framework(...) marker(s) found:
    · src/bad.vr on missing_second_arg  —  expected @framework(<ident>, "<citation>")

  Error: 1 malformed @framework(...) attribute(s) — expected
    @framework(<ident>, "<citation>")
  $ echo $?
  1
  ```

## Certificate export

When you export a proof to `.verum-cert` for independent checking
(`verum export --to {coq, lean, isabelle, dedukti, metamath}`), the
framework-axiom dependency list is carried along in the certificate
envelope. External tooling consuming the certificate must either:

- supply the cited framework axioms in the target system (a Coq
  importer can re-emit them as `Axiom ...`), or
- reject the certificate as "depends on axiom set X that the local
  environment does not admit".

Either way the dependency is surfaced, not silent.

## Stratified theorem tags

For corpora that distinguish *rigorous* from
*framework-conditional* from *stratified* theorems, the
workflow is:

1. A rigorous-core theorem has no `@framework` on itself and depends
   only on axioms marked `@framework`. The proof is as strong as the
   cited results.
2. A framework-conditional theorem carries its own `@framework`
   marker, so consumers see immediately that it is conditional on X.
3. A stratified theorem lists every relevant marker and the audit
   output makes the stratification a simple `grep`.

The convention: every theorem's trusted base is visible to any
reviewer in seconds, and provenance never leaks.

## Interaction with the trusted kernel

`@framework` axioms are registered in the kernel's `AxiomRegistry`
with their `FrameworkId { framework, citation }` attribution. The
kernel's LCF-style checker (see
**[Architecture → trusted kernel](/docs/architecture/verification-pipeline#trusted-kernel)**)
treats them as black-box postulates: a use of `sheafification_is_topos`
elaborates to a `CoreTerm::Axiom { name, ty, framework }` node, and
the kernel accepts it only if the axiom name is in the registry and
its declared type matches.

This is the explicit counterpart to the implicit trust most proof
assistants carry: axioms are **not** in the library by default; you
have to register them, and every registration is enumerable.

## Worked example — bridging two proof systems

```verum
// File: src/categorical/grothendieck.vr
mount core.math.frameworks.lurie_htt;

/// A Grothendieck site in the HTT sense.
public type Site is protocol {
    fn is_presentable(self) -> Bool;
    fn sheafification(self) -> SheafInfinityTopos;
};

/// The HTT 6.2.2.7 axiom — the headline result.
@framework(lurie_htt, "HTT 6.2.2.7")
axiom htt_6_2_2_7<C: Site>(c: C)
    requires c.is_presentable()
    ensures  c.sheafification().is_infinity_topos();

/// A theorem that consumes the axiom. Not itself marked with
/// @framework — it is rigorous in Verum *modulo* the registered
/// axiom, and the transitive dependency is visible to
/// `verum audit --framework-axioms`.
theorem bures_topology_is_topos(c: BuresSite) -> Bool
    requires c.is_presentable()
    ensures  c.sheafification().is_infinity_topos()
{
    proof by {
        apply htt_6_2_2_7;
    }
}
```

`verum audit --framework-axioms` on this file prints:

```
  ▸ lurie_htt (1 marker)
    · axiom htt_6_2_2_7  —  HTT 6.2.2.7  (src/categorical/grothendieck.vr)
```

— exactly the trusted-boundary information an external reviewer needs
before accepting `bures_topology_is_topos` as a valid result.

## See also

- **[Gradual verification](/docs/verification/gradual-verification#framework-axioms--making-trusted-boundaries-visible)**
  — the section that introduces the attribute in the context of the
  9-strategy spectrum.
- **[Architecture → trusted kernel](/docs/architecture/verification-pipeline#trusted-kernel)**
  — how `AxiomRegistry::register` plugs into the LCF check loop.
- **[Contracts](/docs/verification/contracts)** — `requires` /
  `ensures` syntax used by axiom declarations.
- **[Proofs](/docs/verification/proofs)** — applying axioms inside
  tactic scripts via `apply`.

---
title: OWL 2 reasoning — classification, consistency, subsumption
description: A small Pizza-style ontology in Verum. Classify the hierarchy, check consistency, query subsumption — all from the same source the trusted kernel re-checks.
---

# OWL 2 reasoning — Pizza ontology end-to-end

This recipe shows the full OWL 2 stack against a small concrete
ontology — Verum's analogue of the Manchester Pizza Ontology that
Protégé / Pellet / HermiT users know from training material. The
ontology fits in one file, runs through `verum audit
--owl2-classify` to produce a class hierarchy, and is consumed by
`@verify(formal)` for downstream reasoning.

For the underlying framework see
**[Verification → OWL 2 integration](/docs/verification/owl2)**;
for the full attribute family see
**[stdlib → theory interop](/docs/stdlib/theory-interop)**.

## 1. The ontology

```verum
mount core.math.frameworks.owl2_fs.*;

// =================================================================
// Class hierarchy
// =================================================================

@owl2_class
public type Food is { name: Text };

@owl2_class
@owl2_subclass_of(Food)
public type Pizza is { base: Text, toppings: List<Text> };

@owl2_class
@owl2_subclass_of(Pizza)
public type VegetarianPizza is { base: Text, toppings: List<Text> };

@owl2_class
@owl2_subclass_of(Pizza)
public type CheesyPizza is { base: Text, toppings: List<Text> };

@owl2_class
@owl2_subclass_of(VegetarianPizza)
@owl2_subclass_of(CheesyPizza)
public type Margherita is { base: Text, toppings: List<Text> };

// =================================================================
// Disjointness
// =================================================================

@owl2_class
@owl2_subclass_of(Pizza)
@owl2_disjoint_with([VegetarianPizza])
public type MeatPizza is { base: Text, toppings: List<Text> };

// =================================================================
// Properties
// =================================================================

@owl2_property(domain = Pizza, range = Topping,
               characteristic = [InverseFunctional])
public fn has_topping(p: Pizza, t: Topping) -> Bool { ... }

@owl2_class
public type Topping is { name: Text };

@owl2_class
@owl2_subclass_of(Topping)
public type VegetarianTopping is { name: Text };

@owl2_class
@owl2_subclass_of(Topping)
@owl2_disjoint_with([VegetarianTopping])
public type MeatTopping is { name: Text };

// =================================================================
// Identification key
// =================================================================

@owl2_class
@owl2_has_key(name)
public type NamedThing is { name: Text };
```

## 2. Run the classifier

```bash
$ verum audit --owl2-classify
        --> Computing OWL 2 classification hierarchy

  ▸ Classes (with full ancestor closure)
    · Food
    · Pizza            ⊑ Food
    · VegetarianPizza  ⊑ Pizza, Food
    · CheesyPizza      ⊑ Pizza, Food
    · Margherita       ⊑ VegetarianPizza, CheesyPizza, Pizza, Food
    · MeatPizza        ⊑ Pizza, Food
    · Topping
    · VegetarianTopping ⊑ Topping
    · MeatTopping      ⊑ Topping
    · NamedThing       (key: [name])

  ▸ Disjointness pairs
    · MeatPizza        ⊥ VegetarianPizza
    · MeatTopping      ⊥ VegetarianTopping

  ▸ Object properties
    · has_topping  Pizza → Topping  [InverseFunctional]

  10 classes  ·  1 property  ·  2 disjointness pairs
  graph audit: load-bearing
```

`Margherita`'s ancestor closure includes `VegetarianPizza` *and*
`CheesyPizza` because both were declared as direct parents — the
classifier walks the transitive closure deterministically (BTreeSet
ordering for CI-friendly diffs).

## 3. Consistency check

A consistency violation surfaces at compile time. If we add:

```verum
@owl2_class
@owl2_subclass_of(MeatPizza)
@owl2_subclass_of(VegetarianPizza)
public type Paradox is { ... };
```

…the audit reports:

```text
error[ATS-V-AP-023]: framework-axiom collision
  --> Paradox.vr:1
   |
   | Paradox is declared as subclass of both MeatPizza and
   | VegetarianPizza, which are explicitly Disjoint.
   | The class extension would be empty under any model that
   | satisfies the disjointness assertion, contradicting the
   | implicit non-emptiness of any declared class.
   |
help: drop one of the parent declarations or remove the
      DisjointClasses assertion if both pizza kinds are
      meant to overlap.
```

The violation is caught by [`AP-023
FrameworkAxiomCollision`](/docs/architecture-types/anti-patterns/coherence#ap-023);
no runtime check is generated.

## 4. Subsumption query

```verum
@verify(formal)
public fn is_vegetarian(p: Pizza) -> Bool
    where ensures (result == true => p is VegetarianPizza)
{
    p is VegetarianPizza
}
```

The `@verify(formal)` discharge consults the OWL 2 framework
axioms (the `subClassOf` / `disjointClasses` Z3 encoding) plus
Verum's value-level type checker. The post-condition `result ==
true => p is VegetarianPizza` is admitted by the SMT backend
because `VegetarianPizza ⊏ Pizza` is in the framework axiom
package — the proof is two lines of class-hierarchy lookup.

## 5. count_o on a finite domain

When the universe is small and explicit, `count_o` runs at
verification time:

```verum
mount core.math.frameworks.owl2_fs.count;

let pizzas: List<Pizza> = [margherita, four_cheese, pepperoni];

let veg_count: Int = count_o(pizzas, |p| p is VegetarianPizza);
// → 2 (margherita + four_cheese)
```

The witness (`pizzas`) is required at the call site — OWL 2
Direct Semantics is open-world per W3C §5.6, so Verum does not
implicitly close the universe to perform cardinality reasoning.
For unbounded queries `count_o_unbounded` returns
`Maybe.None` with `E_OWL2_UNBOUNDED_COUNT` as the diagnostic.

## 6. Round-trip with Protégé / HermiT / Pellet

The same source exports to OWL 2 Functional-Style Syntax:

```bash
$ verum export --to owl2-fs pizza.vr
exported → pizza.ofn
```

The emitted `pizza.ofn` is consumable by Protégé, HermiT, Pellet,
ELK, FaCT++, Konclude — every reasoner that speaks OWL 2 FS.
Importing back is symmetric:

```bash
$ verum import --from owl2-fs pizza.ofn
imported → pizza.vr
```

Round-trip identity is verified at audit time via
`verum audit --round-trip --by-lineage owl2_fs`. A faithful
round-trip is the soundness premise for cross-tool inference
agreement; the audit chronicle records the verdict per ontology.

## 7. Cross-references

- **[Verification → OWL 2 integration](/docs/verification/owl2)** —
  the full framework-axiom package + DS2HOL-1 translation.
- **[Verification → framework axioms](/docs/verification/framework-axioms)**
  — the 11-package / 71-axiom inventory `owl2_fs` participates in.
- **[stdlib → theory interop](/docs/stdlib/theory-interop)** —
  the `bridges/owl2_to_htt.vr` cross-framework translation.
- **[ATS-V → AP-023 FrameworkAxiomCollision](/docs/architecture-types/anti-patterns/coherence#ap-023)**
  — the consistency violation this recipe demonstrates.
- **[Cookbook → CLI tool](/docs/cookbook/cli-tool)** — wrapping a
  Verum app in a CLI binary.

---
sidebar_position: 2
title: proof
description: Proof-carrying code bundles and refinement reflection — every public type.
---

# `core.proof` — Proof infrastructure

Runtime support for `@verify(certified)` and proof-carrying bytecode.
Two public files; one legacy.

| File | What's in it |
|---|---|
| `pcc.vr` | `GoalHash`, `ProofCertificate`, `ProofBundle`, `BundleMetadata`, `BundleCert`, bundle ops |
| `reflection.vr` | `ReflectedFunction`, `ReflectabilityVerdict`, reflection SMT-LIB rendering |
| `contracts_old.vr` | legacy contract machinery (internal; replaced by Hoare logic in `verum_verification`) |

---

## Proof-Carrying Code — `pcc.vr`

The Necula-style proof bundle: a VBC module can carry certificates
for the SMT goals its compilation discharged, so downstream consumers
can re-verify the proofs without invoking the whole compiler.

### `GoalHash`

```verum
type GoalHash is { digest: Text };         // SHA-256 of the SMT-LIB goal

fn goal_hash(digest: Text) -> GoalHash
```

### `ProofCertificate`

```verum
type ProofCertificate is {
    goal_text: Text,                     // rendered SMT-LIB goal
    solver: Text,                        // "z3" | "cvc5" | "portfolio" | "manual"
    proof_object: Text,                  // solver-native proof term (base64)
    duration_ms: Int { >= 0 },
    timestamp: Text,                     // ISO-8601
};

fn proof_certificate(
    goal_text: Text,
    solver: Text,
    proof_object: Text,
    duration_ms: Int { >= 0 },
    timestamp: Text,
) -> ProofCertificate
```

### `BundleMetadata`

```verum
type BundleMetadata is {
    compiler_version: Text,
    source_path: Text,
    certificate_count: Int { >= 0 },
    total_duration_ms: Int { >= 0 },
};
```

### `ProofBundle`

```verum
type BundleCert is { hash: GoalHash, cert: ProofCertificate };

type ProofBundle is {
    certificates: List<BundleCert>,
    metadata: BundleMetadata,
};

// v0.1 surface (authoritative — see core/proof/pcc.vr)
public fn empty_bundle(compiler_version: Text, source_path: Text) -> ProofBundle;
public fn bundle_add(b: ProofBundle, h: GoalHash, c: ProofCertificate) -> ProofBundle;
public fn bundle_lookup(b: ProofBundle, digest: Text) -> Maybe<ProofCertificate>;
```

Running statistics are available on the bundle itself via
`b.metadata.certificate_count` and `b.metadata.total_duration_ms`
— the constructor `empty_bundle` seeds them and `bundle_add`
increments them on every insertion, so callers don't need a
separate accessor. Merge semantics (combining two bundles) are
deferred to a future release — today callers fold
`bundle_add` over the second bundle's `certificates` list.

### Example

```verum
let mut bundle = empty_bundle("verum-0.32", "src/main.vr");

let cert = proof_certificate(
    "(assert (not (forall ((x Int)) (=> (> x 0) (> (+ x 1) 0)))))",
    "z3",
    BASE64_PROOF_BLOB,
    duration_ms = 3,
    timestamp = "2026-04-15T20:30:00Z",
);
bundle = bundle_add(bundle, goal_hash("g/binary_search/postcond#1"), cert);

match bundle_lookup(bundle.clone(), "g/binary_search/postcond#1") {
    Some(c) => print(f"verified by {c.solver} in {c.duration_ms} ms"),
    None    => print("no certificate found"),
}
```

### Embedding into VBC

`verum_vbc` serialises a `ProofBundle` into the VBC archive's
`proof_certificates` section when `@verify(certified)` is in effect.
A consumer can:

- **trust** the certificate and skip verification;
- **re-verify** offline by feeding `cert.goal_text` + `cert.proof_object`
  back into the named `solver`;
- **reject** if the bundle is missing or invalid.

---

## Refinement reflection — `reflection.vr`

Lets user-defined `@logic` functions appear as axioms in the SMT
solver. The **soundness gate** enforces that only pure + total +
closed functions are reflectable — the rest are rejected by the
compiler.

### `ReflectedFunction`

```verum
type ReflectedFunction is {
    name: Text,
    parameters: List<Text>,
    body_smtlib: Text,
    return_sort: Text,
    parameter_sorts: List<Text>,
};

fn reflected_fn(
    name: Text,
    parameters: List<Text>,
    body_smtlib: Text,
    return_sort: Text,
    parameter_sorts: List<Text>,
) -> ReflectedFunction
```

### `ReflectabilityVerdict`

```verum
type ReflectabilityVerdict is
    | Reflectable
    | NotReflectable { reason: Text };

fn is_reflectable(
    name: Text,
    is_pure: Bool,
    is_total: Bool,
    is_closed: Bool,
) -> ReflectabilityVerdict
```

A function is reflectable iff all three conditions hold. Typical
failure reasons: calls to IO, non-structural recursion without a
decreases measure, free variables captured from environment.

### SMT-LIB rendering

```verum
public fn to_smtlib_decl(f: ReflectedFunction) -> Text;
public fn to_smtlib_axiom(f: ReflectedFunction) -> Text;
```

- `to_smtlib_decl` emits `(declare-fun NAME (S₁ … Sₙ) S)` — an
  uninterpreted function declaration.
- `to_smtlib_axiom` emits `(assert (forall ((x₁ S₁) … (xₙ Sₙ))
  (= (NAME x₁ … xₙ) BODY)))` — or `(assert (= (NAME) BODY))` for
  nullary functions. A universally-quantified equation rather than
  a recursive definition, so the solver stays in first-order
  fragments without needing `define-fun-rec` support.

### Example

```verum
@logic
fn is_sorted(xs: &List<Int>) -> Bool {
    forall i in 0..xs.len() - 1. xs[i] <= xs[i + 1]
}

// Compiler generates equivalent ReflectedFunction:
let r = reflected_fn(
    "is_sorted",
    list!["xs"],
    "(forall ((i Int)) (=> (and (>= i 0) (< i (- (List.len xs) 1))) (<= (List.get xs i) (List.get xs (+ i 1)))))",
    "Bool",
    list!["(List Int)"],
);

// The axiom form is what the solver sees:
let ax = to_smtlib_axiom(r);
```

Now `Sorted<Int> is List<Int> { is_sorted(self) }` is a usable
refinement, with `is_sorted` as a named predicate the SMT solver can
unfold on demand.

---

## Cross-references

- **[Verification → refinement reflection](/docs/verification/refinement-reflection)** — user surface.
- **[Verification → proofs](/docs/verification/proofs)** — theorem / lemma DSL producing these certificates.
- **[Architecture → SMT integration](/docs/architecture/smt-integration)** — how the solver consumes these types.
- **[Architecture → VBC bytecode](/docs/architecture/vbc-bytecode)** — the `proof_certificates` section of a VBC archive.

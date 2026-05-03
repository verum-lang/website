---
sidebar_position: 9
title: Proof Export
---

# Proof Export

> A Verum certificate is not a terminal artifact. It can be
> exported to Coq, Lean, Dedukti, or Metamath for cross-tool
> verification, long-term archival, and participation in the
> broader proof assistant ecosystem. This page specifies the
> certificate envelope, the export targets, and the round-trip
> guarantee each target offers.

Proof export turns a "Verum says this theorem is proved" claim
into *"here is the proof; check it yourself"* — a social, not
just technical, transition. When the exported proof re-verifies
in Lean, the chain of trust extends from Verum's 2 000-LOC kernel
through Lean's ~2 500-LOC kernel, providing independent
cross-validation.

:::note
Statement-level export ships for all four targets —
Lean / Coq / Dedukti / Metamath — via
`verum export --to <format>` or the
`verum export-proofs --to <format>` alias. Each target
emits the theorem's signature and framework attribution
as an admitted-proof scaffold; the target's own tactics
close the proof on the re-check side. A weekly
cross-tool re-check matrix exercises every target
against its reference verifier.

Full proof-term export — each step of the kernel witness
re-serialised in the target's native proof-step grammar
— is the natural extension, gated on rule-specific
conclusion types in the kernel's proof-tree replay
(see [Trusted kernel §5.2](./trusted-kernel.md)).
:::

---

## 1. What gets exported

Everything the kernel admits has a **`CoreTerm`** representation
(§3 of [Trusted kernel](./trusted-kernel.md)). Export is a
*printer* from `CoreTerm` values to target-language source.
Three granularities:

1. **Theorem skeleton.** The theorem's signature (name,
   parameters, proposition) and stated framework dependencies.
   Re-checking in the target reduces to proving the same goal
   with the target's own tactics.
2. **Proof term.** The full `CoreTerm` tree, with every step
   replayed in the target. Target re-checks by invoking its own
   kernel.
3. **SMT certificate.** The underlying SMT-LIB obligation plus
   the solver's own proof-tree (the SMT backend `(proof …)`, the SMT backend ALETHE),
   with the target invoking a solver-agnostic proof-checker
   (dkcheck, smtlib2proof, etc.).

The exporter picks the highest granularity the target supports.
Lean imports theorems and proof terms; Dedukti imports SMT proof
trees; Metamath imports theorem skeletons and framework axioms.

---

## 2. The certificate envelope

Every exported proof ships inside a **certificate envelope** —
a JSON structure that carries the proof plus all metadata
needed for re-checking:

```json
{
  "schema_version":     1,
  "verum_version":      "0.1.0",
  "kernel_version":     1,
  "obligation_hash":    "4f3a…",          // blake3 of the SMT obligation
  "source_span": {
    "file": "core/math/arith.vr",
    "line": 42, "col": 5,
    "end_line": 44, "end_col": 10
  },
  "theorem_name":       "safe_div_bounds",
  "proposition":        "forall a b: Int. b != 0 -> result == a / b",
  "framework_deps": [
    { "framework": "smt-backend", "rule": "smt_unsat", "citation": "obligation_4f3a…" },
    { "framework": "lurie_htt", "citation": "HTT §6.2.3" }
  ],
  "solver": {
    "backend": "smt-backend",
    "version": "4.12.2",
    "flags":   ["--timeout=60s", "--proofs=true"],
    "duration_ms": 43
  },
  "proof_term":         "…base64-encoded CoreTerm…",
  "proof_term_format":  "verum_core_term_v1",
  "smt_certificate":    { /* optional — if smt_unsat route used */ },
  "exporter_metadata": {
    "exported_at":   "2026-04-24T11:30:00Z",
    "exported_by":   "verum export-proofs --to lean",
    "signed_hash":   "…blake3 of envelope excluding this field…"
  }
}
```

### 2.1 Schema-versioning policy

`schema_version = 1` is stable across all 0.x Verum releases.
Schema-breaking changes bump the version; readers negotiate with
the `schema_version` field. The envelope format lives in the
`verum_core::certificate` module so consumers can depend on it
independently of the compiler.

### 2.2 Integrity

The `exporter_metadata.signed_hash` is a blake3 hash over the
envelope with the `signed_hash` field blanked — it protects
against in-transit tampering of the metadata (the `proof_term`
itself is content-addressed by `obligation_hash`, so tampering
with the proof requires re-solving the problem).

For offline audit, the `obligation_hash` is a separately
computed blake3 of the canonicalised SMT-LIB obligation (what
the compiler asked the solver to solve). Any divergence between
envelope and regenerated obligation is a mismatch and the
envelope is rejected by the importer.

### 2.3 Framework dependency cone

`framework_deps` lists every `@framework`-tagged axiom in the
proof's transitive cone. For the importer, these are hypotheses
that must be re-declared (or trusted verbatim) in the target
system. Running

```bash
verum audit --framework-axioms --cone <module>
```

produces exactly this list.

---

## 3. Export targets

### 3.1 Lean 4

**Granularity:** proof term (full).
**Re-check path:** Lean's own kernel.
**Coverage:** statement-level emission ships; full proof-term emission is gated on kernel-side rule-specific conclusion types.

Export to `.lean` translates `CoreTerm` to Lean's `Expr`
structure directly:

| Verum `CoreTerm`              | Lean                              |
|-------------------------------|-----------------------------------|
| `Var(i)`                      | `Expr.bvar i`                     |
| `Lam { name, ty, body }`      | `Expr.lam name ty body BinderInfo.default` |
| `App { func, arg }`           | `Expr.app func arg`               |
| `Pi { name, ty, body }`       | `Expr.forallE name ty body .default` |
| `Inductive { path, args }`    | `Expr.const path [levels]` applied to args |
| `Ctor { ind, name, args }`    | `Expr.const "${ind}.${name}" …`    |
| `Eq { ty, lhs, rhs }`         | `@Eq ty lhs rhs`                   |
| `Refl { ty, term }`           | `@rfl ty term`                     |
| `SmtProof { cert, claim }`    | `axiom smt_cert_<hash> : …`        |
| `Axiom { name, ty, framework }` | `axiom <name> : <ty>`            |

Framework axioms are emitted as Lean `axiom` declarations; users
can `import Mathlib.X` and `#check` to verify the theorem
re-derives under their preferred framework formalization.

### 3.2 Coq

**Granularity:** proof term.
**Re-check path:** Coq's kernel.
**Coverage:** statement-level emission ships; full proof-term emission is gated on kernel-side rule-specific conclusion types.

Export to `.v` uses the same `CoreTerm` → `Expr` mapping adapted
for Coq's Gallina syntax. The main differences from Lean:

- Cumulative universes are handled via `Type_i` annotations.
- Cubical primitives (HoTT layer) require the `HoTT` plugin; a
  fallback path proves the axiom `ua` opaquely.
- `@framework` axioms become `Axiom <name> : <ty>.`

### 3.3 Dedukti

**Granularity:** SMT certificate (for `smt_unsat` traces).
**Re-check path:** `dkcheck` rewrite system.
**Coverage:** statement-level emission ships; full proof-term emission is gated on kernel-side rule-specific conclusion types.

Dedukti is a shallow logical framework — it is the best target
for exporting SMT proofs because the `.dk` format is
explicitly designed as an interchange for automated theorem
provers. Each multiple SMT backends proof rule has a Dedukti signature; the
exporter re-plays the proof tree as applications of those
signatures.

### 3.4 Metamath

**Granularity:** theorem skeleton + framework axioms.
**Re-check path:** community `.mm` database.
**Coverage:** statement-level emission ships; full proof-term emission is gated on kernel-side rule-specific conclusion types.

Metamath is optimized for foundational certainty: its proofs are
low-level, long, and completely explicit. Full proof-term export
to Metamath is impractical for SMT-discharged theorems (would
produce megabyte-size proofs for trivial obligations), so the
exporter emits only the theorem statement plus framework
dependencies. Useful for capture into the community
`set.mm` database with a note that the underlying SMT proof
lives in the certificate archive.

---

## 4. Round-trip guarantees

Not all targets offer the same trust guarantee on import. The
table below compares:

| Target   | Proof checked by   | TCB delta                                         | Preserves framework deps? |
|----------|--------------------|---------------------------------------------------|---------------------------|
| Lean 4   | Lean kernel (~2 500 LOC) | Independent kernel; disagreement is a bug to file | Yes (as Lean `axiom`)     |
| Coq      | Coq kernel (~15 000 LOC) | Independent kernel; HoTT layer imports plugin   | Yes (as Coq `Axiom`)      |
| Dedukti  | `dkcheck` (~3 000 LOC) | Shallowest TCB; explicit rewrite rules           | Dependencies must be in scope |
| Metamath | Metamath checker (~300 LOC) | Smallest kernel of any target                | Framework axioms emitted as Metamath `$a` statements |

Pick Lean for the widest community of re-users, Coq for
formalization-heavy contexts, Dedukti for SMT-heavy batches,
and Metamath for smallest-TCB archival.

---

## 5. CLI

```bash
verum export-proofs target/proofs/ --to lean --out target/lean/
verum export-proofs target/proofs/ --to coq --out target/coq/
verum export-proofs target/proofs/ --to dedukti --out target/dk/
verum export-proofs target/proofs/ --to metamath --out target/mm/
```

Additional flags:

| Flag                    | Effect                                                      |
|-------------------------|-------------------------------------------------------------|
| `--selective FILE`      | Export only the proofs listed in FILE (one per line).        |
| `--include-framework`   | Emit framework axioms as target-language axioms (default on). |
| `--bundle`              | Pack all exported proofs into a tarball.                     |
| `--verify-after`        | After export, invoke target's kernel to re-check.            |
| `--on-mismatch {error,warn,ignore}` | What happens if re-check disagrees.              |

---

## 6. Round-trip test suite

The exporter is tested with a round-trip harness: for each of
`core/math/hott.vr`, representative external proof corpora,
and a sample of refinement obligations:

1. Verify with `--strategy certified`.
2. Export to each target.
3. Invoke target's kernel (Lean: `lean file.lean`; Coq:
   `coqc file.v`; Dedukti: `dkcheck file.dk`; Metamath:
   `metamath -c file.mm`).
4. Record pass / fail / unknown per target.

CI publishes a weekly "interop matrix" showing which targets
re-check which parts of the corpus. Deterioration of the matrix
is treated as a regression.

---

## 7. Limitations

1. **Cubical proofs** (HoTT layer) require a HoTT-aware target.
   Lean supports HoTT via `Mathlib.Cubical`; Coq requires the
   `HoTT` plugin; Dedukti and Metamath do not handle HoTT and
   will emit the theorem as an opaque axiom with the framework
   tag `hott:native`.

2. **SMT proof-tree fidelity.** the SMT backend's `(proof …)` format is
   under-specified and changes between releases. the backend's ALETHE
   is more stable. For the Certified strategy we prefer the SMT backend
   proofs when both agree, falling back to the SMT backend only when the SMT backend
   cannot solve. This preference is configurable via
   `--smt-proof-preference {auto}`.

3. **Framework axiom drift.** If a framework's formalization in
   the target (e.g., Mathlib's version of Lurie HTT) changes,
   re-verification may fail even though the Verum proof is
   still sound. The envelope carries the framework ID but not
   a specific version; consumers must pin their version.

4. **Proof size.** Large refinement proofs can produce megabyte-
   size Lean files. The exporter emits a warning when a single
   proof exceeds 1 MB. Bundle mode (`--bundle`) compresses the
   output with zstd for transport.

---

## 8. Why export matters

> Q: If the kernel already proved it, why export?
> A: Because *your* trust should not depend on *our* kernel.

Three scenarios where export is the right answer:

1. **Cross-tool verification**: your project uses Coq for
   downstream proofs; Verum is just one source of lemmas among
   many. Export lets you combine them in Coq's environment.
2. **Regulatory archival**: a medical-device proof must be
   auditable by a third-party reviewer whose tooling is
   Metamath. Emit the proof once, deposit the archive, hand the
   reviewer the smallest-kernel target.
3. **Supply-chain audit**: a library claims its invariants are
   proved. Run `verum export-proofs --verify-after --to lean`
   on every release; publish the re-check log. Consumers see
   "Verum + Lean both accept this proof" — a concrete
   cross-validation.

Verification in Verum is a means, not an end. Export is how
you put the result to use outside Verum.

---

## 9. See also

- [Trusted kernel](./trusted-kernel.md) — source of the
  `CoreTerm` trees that are exported.
- [Framework axioms](./framework-axioms.md) — dependency
  cone that travels with each proof.
- [CLI workflow](./cli-workflow.md) §3 — `--export-proofs`
  flag.
- [Counterexamples](./counterexamples.md) — what you get when
  a proof fails instead of succeeds.

---
sidebar_position: 20
title: SMT certificate replay
---

# `verum cert-replay` — Multi-backend SMT certificate cross-validation

Verum joins the small group of proof assistants (alongside Coq's
SMTCoq and Lean's lean-smt) where SMT solvers are **external to
the trusted computing base**.  When an SMT solver claims `unsat`,
Verum doesn't trust the verdict — instead the solver emits a
**certificate** that the kernel re-checks independently.

`verum cert-replay` is the multi-backend cross-validation surface
for that contract.

## Mental model

When the SMT backend proves `forall x. x >= 0 -> x + 1 >= 1`, it doesn't just
return `unsat`.  It produces a **proof certificate** — a structured
record of the inference steps used to reach the conclusion.  Verum
ingests this cert and:

1. **Kernel-only structural check** (always runs).  Validates the
   cert's integrity hash matches its body, the format is
   recognised, the theory is one of the supported SMT-LIB logics,
   and the body / conclusion are non-empty.
2. **Per-backend replay** (optional).  Hands the cert to one or
   more replay backends (the SMT backend, veriT, OpenSMT, MathSAT) and
   collects each verdict.
3. **Multi-backend consensus** (`@verify(certified)` semantics).
   The cert is committed to the proof corpus only when **every
   available backend** agrees.  A single rejection breaks
   consensus.

The kernel-only check is the **trust anchor**: even if every
external solver claims a tampered cert is valid, the kernel
catches the integrity-hash mismatch first.

## Subcommand reference

```bash
verum cert-replay replay      --backend <B> [--cert FILE | --format F --theory T --conclusion C --body B]
                              [--output plain|json|markdown]

verum cert-replay cross-check [--backend <B>]… [--cert FILE | --format F …]
                              [--require-consensus] [--output ...]

verum cert-replay formats     [--output ...]
verum cert-replay backends    [--output ...]
```

### `replay`

Replay one cert through one backend.  The kernel-only check is
**always** invoked first as the structural baseline.

```bash
$ verum cert-replay replay \
    --backend kernel_only \
    --format alethe \
    --theory QF_LIA \
    --conclusion "(>= x 0)" \
    --body "(step 1 ...) (qed)"
Certificate replay
  format       : alethe
  theory       : QF_LIA
  conclusion   : (>= x 0)
  body_hash    : <blake3 hex>

Kernel-only check (always runs):
  ✓ accepted (0ms)
    detail: structural OK: format=alethe, theory=QF_LIA, hash matches
```

When the backend is something other than `kernel_only`, the output
includes a separate "Backend `<name>` replay:" section with that
backend's verdict.

You can also load a cert from a JSON file:

```bash
verum cert-replay replay --backend smt-backend --cert proofs/foo.cert.json
```

### `cross-check`

Run the cert through every requested backend (defaults to all
five external backends + the kernel-only baseline) and emit the
consensus.

```bash
$ verum cert-replay cross-check \
    --backend smt-backend --backend verit \
    --format smt_native --theory QF_LIA \
    --conclusion "(>= x 0)" --body "(step 1 ...) (qed)" \
    --output markdown
# Cross-backend cert verdict

- **format** — `smt_native`
- **conclusion** — `(>= x 0)`

| Backend | Verdict |
|---|---|
| `kernel_only` | ✓ accepted (0ms) — structural OK |
| `backend-a` | ✓ accepted (0ms) — mock backend accepted the cert |
| `backend-b` | ✓ accepted (0ms) — mock backend accepted the cert |
| `verit` | ✓ accepted (0ms) — mock verit accepted the cert |

**Consensus:** ✓ achieved (4 accepted / 0 rejected / 0 missing)
```

`--require-consensus` makes any rejection (or kernel-only failure)
produce a non-zero exit — the CI gate for `@verify(certified)`.

### `formats` / `backends`

List supported certificate formats / replay backends.  Useful for
discovery in CI scripts:

```bash
$ verum cert-replay backends --output markdown
# Supported replay backends

| Backend | Intrinsic |
|---|---|
| `kernel_only` | true |
| `smt-backend` | false |
| `smt-backend` | false |
| `verit` | false |
| `open_smt` | false |
| `mathsat` | false |
```

`is_intrinsic = true` means the backend is always available
(doesn't need an external tool on PATH).  Only `kernel_only`
satisfies this.

## Certificate formats

The six supported formats:

| Format | Description |
|---|---|
| `verum_canonical` | Verum's backend-independent canonical format.  Every production backend lowers to this; the kernel re-checker decomposes it into elementary kernel-rule applications. |
| `smt_native` | the backend's native `(proof ...)` format. |
| `alethe` | the backend's ALETHE format — more stable across releases than the backend's native; recommended export target. |
| `lfsc_pattern` | LFSC pattern format (CVC4 / the SMT backend legacy). |
| `open_smt` | OpenSMT2 native proof format. |
| `mathsat` | MathSAT5 native proof format. |

Aliases: `canonical` → `verum_canonical`, `smt` → `smt_native`,
`alethe` / `smt` → `alethe`, `lfsc` → `lfsc_pattern`,
`opensmt` / `opensmt2` → `open_smt`, `mathsat5` → `mathsat`.

## Replay backends

The six replay backends:

- **`kernel_only`** — Verum's intrinsic structural check.  Always
  available.  Validates: integrity hash, recognised format,
  supported SMT-LIB theory, non-empty body / conclusion.  This is
  the trust anchor.
- **`smt-backend` / `verit` / `open_smt` / `mathsat`** — external
  solvers.  V0 ships stubs that return `ToolMissing`; V1+ wires
  production runners that invoke the actual tools.  The trait
  surface is unchanged, so CLI / docs / CI scripts continue to
  work identically.

## Cert JSON schema

Both `--cert FILE` (replay / cross-check) and the JSON output of
`replay --output json` use the same schema:

```json
{
  "format": "alethe",
  "theory": "QF_LIA",
  "conclusion": "(>= x 0) -> (>= (+ x 1) 1)",
  "body": "(step 1 ...) (step 2 ...) (qed ...)",
  "body_hash": "<blake3 hex of body>",
  "source_solver": "smt-backend-4.13.0"
}
```

`body_hash` is the blake3 of `body` — recomputing it after edits
is the user's responsibility.  The kernel-only check rejects any
cert whose stored hash doesn't match the recomputed hash.  This
makes tampering observable.

## The trust contract

The defining invariant: **the kernel verdict is authoritative**.
No matter what external solvers claim, no matter what the cert
file says, the only way for a cert to be committed to the corpus
is for the kernel-only structural check to accept it.

Concretely:

- A buggy solver emitting an inconsistent cert → kernel rejects on
  hash mismatch / unknown theory / empty body.
- A malicious "cert" handed in by an attacker → kernel rejects
  before any external backend is consulted.
- A network failure or solver crash during cross-check → that
  backend produces `ToolMissing` (counts as NotRun); the kernel
  + every other available backend's verdicts decide the
  consensus.

In every failure mode, **the kernel is the source of truth**.

## V0 vs V1 production runners

V0 ships:

- Full kernel-only structural check (production-grade).
- Mock external runners returning `ToolMissing` by default for
  the `engine_for(backend)` factory.

V1+ swaps in production runners that:

- Invoke the configured backends (e.g. `backend-a -in` / `backend-b --proof-format=alethe`) / `verit
  --proof=-` / etc.
- Parse the per-tool output back to `ReplayVerdict::Accepted`
  with elapsed time and version detail.
- Map per-tool error patterns to `ReplayVerdict::Rejected` with
  structured reasons.

The trait surface is unchanged, so every CI workflow that
consumes `verum cert-replay cross-check --output json` today auto-
upgrades to real numbers when V1 lands.

## CI usage

The standard `@verify(certified)` workflow:

```bash
# For every theorem with @verify(certified):
verum cert-replay cross-check \
    --cert target/.verum_cache/certs/${THEOREM}.cert.json \
    --require-consensus
```

Any kernel rejection or backend disagreement produces a non-zero
exit, failing the build.  The cert files come from the
verification pipeline's `Certified`-strategy export path; future
work threads them through automatically.

## Cross-references

- **[Verification → CLI workflow](/docs/verification/cli-workflow)**
  — the strategy ladder including `Certified`.
- **[Verification → proof export](/docs/verification/proof-export)**
  — orthogonal export pipeline (statement-only certificates for
  Coq / Lean / Dedukti / Metamath).
- **[Tactic catalogue](/docs/tooling/tactic-catalogue)** — the
  combinator surface that drives the proof body the cert
  certifies.
- **[Continuous benchmarking](/docs/tooling/benchmarking)** —
  `cross_format_exports` measures how many independent kernels
  re-check a Verum proof.
- **[Auto-paper generator](/docs/tooling/auto-paper)** — every
  rendered theorem can carry the closure hash + cert verdict for
  the reproducibility envelope.

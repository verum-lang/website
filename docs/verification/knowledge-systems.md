---
sidebar_position: 5
title: Knowledge-System Verification Profile
description: A reproducible proof-term profile and an explicit integration contract for Noesis and other systems that manage theories, assumptions and verification evidence.
---

# Knowledge-System Verification Profile

A knowledge system needs more than a Boolean “verified” field. It must
retain what was checked, under which assumptions, by which mechanism,
and whether that check completed. This page defines a narrow, reproducible
Verum profile and the interface requirements for using it in Noesis.
The portable native checker and the scoped source elaborator are available.
Noesis integrates them through bounded workers; stored success flags never
replace replay of the exact artifact.

## The minimal proof-term profile

The input is a closed `.vproof` JSON certificate containing `term` and
`claimed_type`. The authority is
`verum_proof::proof_checker::Certificate::verify` (re-exported by
`verum_kernel`), exposed by
`verum check-proof`. Its calculus includes dependent functions, dependent
pairs and the implemented identity-type fragment. It has no arbitrary
axiom or solver-witness constructor.

At the proof-term level, supported assumptions can be explicit Π binders
in a conditional theorem. An unsupported foundation or construction requires
a different declared checker profile; a foundation tag cannot extend the
inference rules of this one.

### Exact Verum source profile

`verum_source_proof` uses the production FastParser and an explicit logical
interpretation, `verum-source-pi-id/1`. It retains an ordered, typed binder
context with stable identities before lowering to native de Bruijn terms.
Types, values, explicit premises and universe names remain distinct. The
closed statement includes **all** parameters: accepting `Π(h : P). P`
does not establish `P` without `h`.

The transport is a strict JSON envelope containing `profile`, `source` (actual
Verum UTF-8 text), and `declaration` (the selected top-level declaration).
This is a source carrier, not a second theorem language. A small example:

```verum
public theorem composition(a: Type, b: Type, c: Type,
    f: fn(a) -> b, g: fn(b) -> c, x: a): c proof = g(f(x));
```

In this **logical profile**, function types denote total dependent functions.
This does not certify termination or contracts of arbitrary executable functions.
The supported fragment includes explicit types/universes, dependent function
families, application, equality/identity types and supported proof constructors.
Unknown names are rejected; imports and unrelated top-level axioms are not
silently admitted to the selected theorem's context. Library imports, effects,
recursive definitions and unsupported syntax need their own checked extensions.

Build the standalone host worker without LLVM:

```sh
VERUM_NO_AUTO_PRECOMPILE=1 cargo build -p verum_source_proof --bin verum-source-replay
```

The repository's configured Rust toolchain is required. A trusted host runs
`verum-source-replay --worker` with a source envelope on stdin, through the
shared `verum_proof::process::run_worker` supervisor. Worker execution has
input/output, wall time, CPU, stack and memory limits. Direct use of the worker
is a low-level interface; the host supervisor supplies the wall-time bound.

A successful report contains the complete source SHA-256, declaration byte span
and digest, the elaborator identity, ordered telescope, scoped conclusion,
universe correspondence and native judgment. The elaborator identity covers
the parser and translation implementation; the native checker has a separate
identity. Both substitution and normalization-by-evaluation replay must agree.
Source hashing identifies the input; it does not prove the translation correct.
Independent statement/term oracles and adversarial scope tests exercise that
additional boundary.

Noesis admits this carrier as `application/vnd.verum.source+json`. Only trusted
startup configuration selects `--verum-source-checker /absolute/path`; corpus
content and remote requests cannot choose a program. The engine checks source
and span identities, reconstructs the full statement from the telescope, checks
its equality to the certificate's claimed type, and repeats native replay using
its own installed checker. An elaborator/native disagreement is inconclusive.

Exact Source dependencies preserve paper quotations and revisions. They **do
not** certify the semantic equivalence of prose and formalization. Archive
restoration preserves those bytes and links, and verification is run again.
A report for one revision cannot certify a changed proof or a future revision
through a historical snapshot.

### Source-to-goal boundary

A source declaration and a correctly typed kernel term are different inputs.
The older compiler/tactic bridge is a different API from the scoped source
profile above. Its admission limits remain:

| Entry point | Accepted input or explicit refusal |
|---|---|
| `from_theorem_decl` | Parameter-free, premise-free theorem/lemma propositions in the supported proposition vocabulary; generic parameters, value parameters and `requires` clauses return `UnsupportedExpression` |
| `elaborate_theorem` | Uses the same goal conversion and requires a supported proof body; unsupported goal translation produces no certificate |
| `from_fn_decl` | Source function-contract conversion returns `UnsupportedExpression`; signature, result, body relation and connective semantics are not supplied by this bridge |
| `from_refined_type` | Source refinement conversion returns `UnsupportedExpression`; its actual base type and binder are not replaced by `Universe(0)` |
| `VerificationGoal` / `from_refinement` | Explicit formal goal construction remains available; `from_refinement` requires a caller-supplied kernel `Term` for the base type and a supported predicate/context |

The low-level APIs require correctly scoped formal inputs. They do not
establish a translation of an arbitrary source declaration, and constructing
a goal does not prove it. Compiler-facing runtime and SMT contract checking
are separate routes with their own evidence and trust boundaries.

Boolean literal propositions are outside the source translator's supported
encoding. The CLI reports unsupported elaboration as `Skipped`; a run in
which every theorem is skipped fails unless `--allow-empty` is requested.
An admission profile must not use that override to claim proof coverage.

Free proposition atoms may be generalized as opaque formal parameters;
this is distinct from translating a declared source parameter's type.
Noesis must bind the exact formal `claimed_type` to its intended statement.
A producer's “verified” label does not establish that correspondence. The
[external proof exporter](./proof-export.md) refuses proof targets until it can
preserve the exact typed source statement.

The source boundary is implemented in
[`verification_goal.rs`](https://github.com/verum-lang/verum/blob/main/crates/verum_kernel/src/verification_goal.rs)
and [`tactic_elaborator.rs`](https://github.com/verum-lang/verum/blob/main/crates/verum_kernel/src/tactic_elaborator.rs).

`Certificate.metadata` is not inspected for logical acceptance. A theorem
name, source path, foundation label or claimed resource count placed there
must not grant authority to a consumer.

## Reproduce acceptance and rejection

From a Verum language checkout, select the binary explicitly:

```bash
VERUM_BIN="$(command -v verum)"
"$VERUM_BIN" --version
shasum -a 256 "$VERUM_BIN"
"$VERUM_BIN" check-proof \
  core/verify/proof_term_examples/identity_at_universe_0.vproof
"$VERUM_BIN" check-proof \
  core/verify/proof_term_examples/adversarial/reject_free_variable.vproof
```

The identity certificate should be accepted. The free-variable certificate
should be rejected with an unbound-variable diagnostic. An installation,
parsing or process failure is not the expected negative result. When a
newly built checker is under evaluation, set `VERUM_BIN` to that exact
binary; a globally installed executable need not contain source changes.

For the checked-in certificate collection and comparison mechanisms:

```bash
"$VERUM_BIN" audit --proof-term-library --format json
"$VERUM_BIN" audit --differential-kernel --format json
"$VERUM_BIN" audit --differential-lean-checker --format json
```

These are distinct checks. The library audit exercises the retained
certificates. The in-process comparison includes direct and NbE algorithms
and a manifest-backed wrapper around the direct algorithm. The Lean
comparison executes Verum's reference checker written in Lean; it does
not prove every Verum theorem in Lean's own object logic.
Missing foreign tools, skipped inputs and checker disagreements must remain
visible in the report. Noesis should require its selected checks to complete
before publishing an acceptance receipt.

For source and test ownership, see
[`check_proof.rs`](https://github.com/verum-lang/verum/blob/main/crates/verum_cli/src/commands/check_proof.rs),
[`proof_checker.rs`](https://github.com/verum-lang/verum/blob/main/crates/verum_kernel/src/proof_checker.rs)
and the [canonical examples](https://github.com/verum-lang/verum/tree/main/core/verify/proof_term_examples).

## Evidence that Noesis must retain

The following is a consumer contract, separate from the current `.vproof`
wire format. It can be implemented without depending on SYNARC.

| Record | Required meaning |
|---|---|
| Statement | Exact formal statement, its encoding, and a stable link to the human-readable claim |
| Environment | Assumptions, definitions, imports and their content identities; the selected logical foundation |
| Artifact | Exact certificate bytes and a content hash; provenance of the producer |
| Checker profile | Executable identity, checker/calculus version, decoding policy and invocation |
| Resource policy | Declared limits, observed usage where available, timeout or exhaustion outcome |
| Result | Accepted by this profile, rejected certificate, or incomplete/unavailable check, with diagnostics |
| Translation | Source/target statements and the evidence that their intended meanings correspond |

A rejected certificate does not prove the negation of its claimed theorem.
An incomplete check proves neither the theorem nor its negation. A successful
check proves the formal judgment under the profile's assumptions; it does
not verify a natural-language gloss or an empirical claim about the world.

Every dependency change creates a new verification context. Results may be
reused only when the full statement, environment and policy identities still
match, or a checked transport establishes the required preservation. An
identical theorem title or citation string is insufficient. Preserve the
old receipt for its old context instead of silently rewriting its meaning.

## Foundations and translations

`foundation_profile::FoundationDistribution` classifies declared framework
citations, reports unresolved names and checks a finite collection of
known incompatibilities. In particular, the UIP/univalence conflict must
be interpreted at the same type/universe scope: UIP for a restricted family
of sets is different from asserting UIP for all types in a univalent
universe. A category label alone cannot settle that distinction.

Noesis should keep theory environments separate and make interpretations
explicit. For a translation `T` from theory `A` to theory `B`, proof
preservation requires a justified map from each admitted source derivation
`A ⊢ p : P` to a target derivation `B ⊢ T(p) : T(P)`, with translated
assumptions recorded. Faithfulness, conservativity and equivalence are
stronger properties and need their own arguments. A target file that
introduces `T(P)` as an axiom has recorded an assumption, not transported
its source proof.

[Proof export](./proof-export.md) and
[external-prover replay](../architecture/external-prover-verification.md)
must therefore be classified by the artifact they actually check:
statement scaffolds, formal derivations and conditional metatheory
exports have different evidential force.

## Resource discipline

A proof service accepts untrusted artifacts. Limits should cover decoding,
term size and depth, conversion, allocations and the outer process. A fuel
counter on one reduction routine does not bound the entire verification
transaction or its peak RAM. Use process isolation and external resource
limits where the selected checker does not provide those guarantees.

The intended contract is monotone in evidence: exhausting a budget grants
no new logical authority. A service may retry with a larger budget while
retaining the statement and environment. Its receipt must distinguish a
bounded attempt from a completed rejection and must not turn a truncated
normal form into an asserted normal form.

## What this architecture makes possible

Verum's useful direction is a common, inspectable interface between
executable code, proof terms and theory dependencies. For Noesis, that
supports several concrete capabilities:

- **Assumption-aware knowledge reuse:** preserve which results remain
  available when a foundation, definition or imported theorem changes.
- **Checked cross-theory work:** separate translations of vocabulary from
  proof-preserving interpretations and retain the obligations of each bridge.
- **Multiple proof producers:** humans, tactics, solvers and cognitive agents
  can propose artifacts through the same admission interface. Their identity
  does not alter the proof requirement.
- **Bounded, revisable verification:** keep unfinished work actionable,
  reproducible and distinct from established claims.

These are architectural requirements with testable interfaces. Completion
means an actual adapter preserves these distinctions through import, checking,
storage and retrieval. The profile does not presume a general consistency
decider, a universal foundation or automatic proof translation.

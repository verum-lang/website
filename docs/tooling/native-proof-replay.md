---
sidebar_position: 21
title: Native proof replay
---

# Native proof replay

`verum_proof` is the portable implementation of Verum's native term checker. The compiler kernel re-exports this implementation, so embedded integrations and compiler consumers use the same rules. The package does not require the compiler, LLVM or an SMT solver.

## Exact judgment

The `verum-native/1` profile admits a closed judgment `term : statement`. Its terms support dependent functions, dependent pairs, universes and identity types with elimination. Variables use de Bruijn indices. Named universe variables are formal parameters; no arbitrary term axioms are imported from metadata.

A judgment contains an independently supplied `statement` and a `certificate` with `term`, `claimed_type` and inert `metadata`. The statement must exactly match the decoded claimed type. Both the substitution checker and the normalization-by-evaluation checker must accept. Checking includes well-formedness of the claimed type, not just comparison with the inferred type.

This complete example proves that every type in the first universe has an identity function:

```json
{
  "profile": "verum-native/1",
  "statement": {"Pi": [{"Universe": 0}, {"Pi": [{"Var": 0}, {"Var": 1}]}]},
  "certificate": {
    "term": {"Lam": [{"Universe": 0}, {"Lam": [{"Var": 0}, {"Var": 0}]}]},
    "claimed_type": {"Pi": [{"Universe": 0}, {"Pi": [{"Var": 0}, {"Var": 1}]}]},
    "metadata": {}
  }
}
```

Store it as `identity.json`, then run from the Verum source tree:

```sh
cargo run -p verum_proof --features process --bin verum-proof < identity.json
```

The process emits one JSON report. A successful report has `accepted: true`, `diagnostic: null`, the logical profile and an identity derived from the exact checking sources. Failure exits nonzero. The checker identity supports reproducibility; it is not a digital signature or a proof of the checker's soundness.

## Function extensionality

The separate `verum-native-funext/1` profile adds dependent function
extensionality. A `FunExt` term supplies `function_type`, `lhs`, `rhs` and
`pointwise`. For a function type Π(x : A). B(x), the checker requires both
functions to have that type and a proof of Id(B(x), lhs(x), rhs(x)) for every x.
It then produces Id(Π(x : A). B(x), lhs, rhs). Arbitrary domains and dependent
codomain families are supported; testing finitely many inputs cannot supply this
premise.

The verifier must explicitly select the foundation, and the judgment must name
that exact profile:

```sh
cargo run -p verum_proof --features process --bin verum-proof -- \
  --foundation function-extensionality < extensional-judgment.json
```

Embedded callers select `Foundation::FunctionExtensionality` through
`process::replay_with_foundation`. The default replay and certificate APIs remain
intensional. Metadata and a submitted profile name cannot enable the additional
principle on their own. A successful report records the selected profile.

Extensionality proofs stay opaque: they do not reduce to reflexivity, even for
identical endpoints. The rule adds neither equality reflection nor proof
irrelevance. Both native algorithms and the independent Lean checker validate
the dependent premise. The direct Lean formulation uses `funext`, whose
foundation audit reports `Quot.sound`. This is an explicit foundational
assumption, not a project-specific axiom or a proof of the entire checker's
soundness. Source elaboration under `verum-source-pi-id/1` remains intensional;
this native capability does not add a source `funext` tactic.

## Reversible observations and readouts

The replay battery `verification/certificates/check_adaptive_observation.py`
checks universal laws for adding an XOR observation while retaining its source,
recovering the original state by applying the lift twice, and transporting a
readout through a proved refinement. Partial readouts preserve the complete
Option value, including absence. A separated-fibre theorem proves why an
observation that merges distinct targets cannot reconstruct them both.

These proofs quantify over arbitrary types and functions with independent
universe levels. The function-valued lift laws use the explicit extensional
foundation; the other laws remain intensional. Controls reject erasing the
source, reconstructing arbitrary bits through a constant readout, and omitting
required evidence. The matching Lean source is
`VerumExternalReplay/AdaptiveObservation.lean`. Neither replay establishes a
translation of runtime code, a finite physical register, execution cost or
statistical-risk guarantees.

## Program translation and resource budgets

`verification/certificates/check_resource_transfer.py` checks exact translations
between partial program semantics. Program, input and output embeddings have
independent types. Composition preserves semantic absence and successful
results; reflecting a particular successful value requires an injective output
embedding. Semantic absence is distinct from operational suspension.

A monotone budget map transports an explicit cost bound. Scalar budget maps
compose only when both contracts use the same accumulated cost semantics,
including the claimed translation, search, library acquisition and execution
charges. A shrinking map cannot justify discarding work already paid.

The separate paid-work model carries a pair `(A, B)`: acquisition work already
paid and remaining execution budget. Successive steps with overheads `a`, `b`
and execution maps `f`, `g` produce `(A + a + b, g(f(B)))`. Paid work never
decreases, and execution within the final budget gives a lifetime bound of
`A + a + b + g(f(B))`. This additive accounting does not describe peak memory;
each resource dimension needs its own composition law.

Both native checkers and independent Lean replay check the terms. The matching
source is `VerumExternalReplay/ResourceTransfer.lean`. Pointwise loss transport
requires compatible losses on exact terminal outcomes. A fixed aggregation of
those losses is preserved under the explicit function-extensionality foundation.
These contracts do not establish runtime cost measurements, optimal search,
probabilistic approximation or statistical validity. Corruption controls reject
erased overhead, discarded paid work and substitution of success for absence.

## Bounding information from a finite binary partition

`VerumExternalReplay/BinaryPartitionKT.lean` models fixed binary
Krichevsky–Trofimov prediction with exact rational probabilities. For any finite
partition of observations, it proves that the conditional likelihood divided
by the parent likelihood is at most the binomial coefficient `C(n, k)`, where
`n` counts all observations and `k` counts positive outcomes. Separating the
outcomes into pure cells attains the bound. The model also proves the prediction
recurrence and positivity of the parent probability.

Positive outcomes alone do not bound the information gain. Four positive and
four negative observations split into pure cells give a likelihood ratio of
70; mixing the same counts into two balanced cells gives 18/35. Naming costs
remain part of the comparison: multiplying a price factor of 20 by eight names
raises it above 70. Exact counterexamples and semantic refusal controls check
these distinctions without floating-point logarithms.

These are finite mathematical model proofs checked by Lean. They do not prove
an anytime statistical guarantee, correspondence with a native scorer, or
successful acquisition from a runtime trace whose actual counts have not been
exported. Native execution and portable Verum proof terms have separate evidence
requirements.

## Constructing numbers without literals

`verification/certificates/check_numeral_programs.py` checks partial iteration:
zero iterations preserve the initial result, another iteration applies the
partial successor, and an undefined result remains undefined. Induction proves
that zero followed by successors expresses every mathematical natural number.
Both native checkers and independent Lean replay check this structural core.

`VerumExternalReplay/NumeralPrograms.lean` connects the result to the existing
intrinsically typed register programs and their composition theorem. The closed
program has no inputs and its literal type is empty. A separate bounded
interpretation returns a number exactly when it fits the declared range;
successor at the maximum is undefined. For an unsigned 64-bit range this means
overflow refuses, rather than wrapping to zero or producing an unbounded value.
The typed-program connection and bounded arithmetic are Lean theorems, not
additional native primitives or a proof that a runtime enumerator emits every
such program within finite time or memory. `VerumExternalReplay/CheckedNumerals.lean`
connects the observer VM model's checked successor to that bounded interpretation,
including overflow classification, arity and type errors. The extended runtime
export decoder admits this instruction explicitly; the legacy decoder retains
its original vocabulary. Runtime correspondence still requires frozen native
code and execution evidence.

## Physical histories and scheduling

`verification/certificates/check_physical_transducers.py` checks universal laws
for a state machine whose physical observations update state and whose service
events leave it unchanged. Erasing service events preserves the complete final
state. Two histories with the same ordered physical observations, started from
the same state, therefore produce the same result. Observation payloads can
retain source identities and physical event identifiers; neither order nor
payload identity is discarded.

The terms quantify over arbitrary state, observation and service types at
independent universe levels. Both native checkers and independent Lean replay
validate the inductive proofs. Controls reject changing state during service,
erasing an observation and exchanging observations. The matching source is
`VerumExternalReplay/PhysicalTransducers.lean`. Service stuttering is part of
this mathematical model: applying the theorem to a runtime requires separate
evidence for its actual transitions, including capacity, overflow and refusal
behavior. It does not certify a calibration algorithm or statistical guarantee.

## Reserving evidence before computation

A deferred computation must retain the declaration that determined its evidence
budget. `verification/certificates/check_predeclared_evidence.py` checks model
laws for increasing, injective reservation indices, unchanged reservations at
completion, and refusal without refunding an index. The declaration is an
immutable value: it can contain the source, origin, calibration end, signature,
family address and criterion. Completing computations in a different order does
not assign them new reservation indices.

Ordered buffers retain their reservation and exact row sequence. Appending
batches composes by concatenation; pausing leaves the prefix unchanged, and
transfer retains that prefix. A separate validation buffer starts empty at a
supplied selection boundary. These structural laws have portable proof terms
checked by both native checkers and independent Lean replay.

`VerumExternalReplay/PredeclaredEvidence.lean` also proves exact admission and
risk-accounting laws. Its source-bound transition rejects foreign sources,
non-increasing row ordinals and exhausted capacity. Calibration records the last
consumed row, so trial rows must have strictly greater ordinals. Selection records
the next physical ordinal: validation admits that ordinal and later ones, while
retaining the same source, ordering and capacity checks. The rational allocation
`1 / ((j + 1) * (j + 2))` has total finite-prefix mass at most one, including
prefixes with skipped reservations. These arithmetic and admission extensions
are Lean proofs; they are not additional arithmetic primitives in the native
term checker.

`verification/external/lean/check_predeclared_export.py` checks frozen declaration
and selection snapshots against these laws. It compares declaration identity,
native paid ordinals, retained source and origin, ordered sample prefixes,
capacity, cached versus independently derived inputs, and validation admission.
For a refused preselection row it checks that ordinary source, order and capacity
guards would admit it, while the selection frontier refuses it and preserves the
buffer. The first fresh row must pass the same guards with the frontier enforced. A missing signature remains
missing; matching null fields cannot establish a signature. The report lists
unverified obligations, including refusal diagnostic text, cross-epoch
replacement sources, criterion semantics and exact grammar cardinality.

Applying the model to a program requires exported witnesses for the actual
frozen declaration, row provenance, resource refusals and selection boundary.
The model alone does not establish single consumption of a runtime resource,
statistical independence, or that validation began after physical selection.

## Untrusted inputs and limits

Use the process adapter for untrusted artifacts. It starts a fresh child before parsing terms, clears inherited environment variables and reaps the child on completion, error or timeout. The parent validates the worker report and checks its logical profile and checker identity.

The admission policy limits input to 1 MiB, term and universe nodes to 65,536 and logical structural depth to 128. An iterative JSON envelope check bounds physical nesting before decoding; the logical bounds are checked separately. The worker has a five-second wall deadline, a three-second CPU limit, a bounded stack and output size, and a 512 MiB memory termination threshold. Unix systems supporting address-space limits also enforce that limit. macOS uses sampled resident-memory monitoring: the threshold may be exceeded between samples and is not an instantaneous allocation guarantee. Deployments requiring a hard aggregate memory boundary must additionally constrain the worker service at the OS/container level. Unsupported process-limit configurations do not silently fall back to unbounded replay.

A process timeout, exhausted budget, crash or unavailable worker means **inconclusive**. It does not mean the theorem is false. Structural limits alone do not bound normalization cost; untrusted input must not be sent directly to the in-process replay function.

## Scope of the evidence

Acceptance concerns exactly the formal judgment supplied. It does not certify that a prose theorem was translated correctly, that a runtime program implements a mathematical model, or that external citations and graph edges are valid premises. Source elaboration and imported theories require separate contracts and evidence.

A knowledge system should bind replay results to the exact source artifact, revision and checker. Changed bytes require another replay. Imported JSON claiming successful verification must never be trusted in place of running the checker. Dependency currency and proof validity are separate properties: a proof of one exact statement does not justify an edited one.

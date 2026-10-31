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

The process emits one JSON report. A successful report has `outcome: "accepted"`, `accepted: true`, `diagnostic: null`, the logical profile and an identity derived from the exact checking sources. Reports also record the selected admission limits and, for isolated replay, the requested process policy and installed OS ceilings. Failure exits nonzero. The checker identity supports reproducibility; it is not a digital signature or a proof of the checker's soundness.

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

## Action-conditioned observational factors

The Lean replay module [ActionQuotient](https://github.com/verum-lang/verum/blob/main/verification/external/lean/VerumExternalReplay/ActionQuotient.lean)
checks a projection from concrete states to abstract states. Its `Factor`
contract preserves the result of every action and every query, including
semantic undefinedness. These one-step laws preserve behavior under every
finite action sequence. Concrete states may be infinite: a universally proved
counter projection can still have a finite abstract state space.

`check_sound` requires complete coverage of concrete states, actions and queries.
A successful check over sampled rows does not supply that coverage. For an
infinite domain, the contract needs a universal proof or a justified restriction
to a closed invariant. Checker exhaustion and resource suspension remain
inconclusive; they cannot stand for semantic undefinedness.

A finite state space does not imply an autonomous finite clock. A one-state
transducer can echo an unbounded external age. `Separating` additionally requires
distinct abstract states to have distinguishable future behavior; it identifies
behavioral classes in the projection's image, without proving reachability of
all abstract states. Clock divisibility needs a commuting phase action and a
proved closed world clock. Relating its period to a unit-group order requires a
separate group and implementation-correspondence argument.

These are Lean model proofs. They do not certify an arbitrary executable,
a learned representation, acquisition within a budget or correspondence to an
external world. They are not additional source-proof tactics or an automatic
Rust-to-Verum verification pass.

## Reusing execution evidence

The Lean module [ReadEvidence](https://github.com/verum-lang/verum/blob/main/verification/external/lean/VerumExternalReplay/ReadEvidence.lean)
proves full-report agreement for the existing finite primitive/call execution
model. With identical code, primitive semantics, limits and initial usage,
inputs need agree only on the model's conservative input footprint. That
footprint includes every instruction's input operands, including eager calls
and instructions whose results are unused. Missing inputs remain distinct
from present values. The theorem preserves stops, all retained registers,
usage and diagnostics, rather than only the selected output.

The model uses its specified bounded meter and does not cover native branch
or fold instructions. A runtime trace that records the entire input environment
needs stronger agreement than this footprint provides. Native reuse also
requires immutable semantic ownership, recipient-specific interface and
lifecycle checks, and successful root selection. Reusing historical execution
evidence does not count as executing the program again: an adapter must account
for actual shared execution and recipient admission work separately. These
proofs do not install a runtime cache or certify an arbitrary foreign adapter.

## Exact count-bank continuation

The Lean module [CountBank](https://github.com/verum-lang/verum/blob/main/verification/external/lean/VerumExternalReplay/CountBank.lean)
proves that appending accepted rows agrees with adding their labeled count
banks. It connects those banks to the existing categorical scorer, so scoring
merged counts agrees with scoring the concatenated rows. A complete cell census
may change order; labels, multiplicities and the declared alphabet must remain
exact. Distinct-cell support combines by set union, not by adding cardinalities.

Final ratios are insufficient for continuation: two prefixes with the same
score can score differently after the same next observation. The model includes
counterexamples for lost cell identities, duplicate evidence and independently
reset predictors. Its successful-step correspondence theorem accepts any storage
representation that proves the lookup-update law.

[CountBankOwnership](https://github.com/verum-lang/verum/blob/main/verification/external/lean/VerumExternalReplay/CountBankOwnership.lean)
adds a checked join for summaries of physical observation intervals. Both
summaries must have the same owner, identifying an immutable input ledger and
compatible partition/classifier revision. Every interval must be disjoint,
including intervals already present within either input. Two branches containing
the same nonempty prefix are refused; equal values at different physical
positions still contribute separately. Checked splits reject cuts outside the
original interval, and joining valid prefix/delta banks recovers the unsplit bank.

The accepted-join theorem preserves exact counts and physical observation
multiplicity when the input summaries correspond to that ledger and classifier.
The join retains the supplied interval order; count-table equivalence does not
authorize reordering physical events or treating replay as original execution.
A foreign adapter must establish the actual owner identity, input correspondence,
finite-counter overflow handling, allocation and refusal precedence, and evidence
lifetime. Pending execution state remains a separate obligation. These are Lean
replay laws, not additional Verum source-proof tactics or a runtime cache.

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

## Shared allocation ownership

`VerumExternalReplay/ResourceLedger.lean` is an external Lean model of shared
allocation accounting. A slot denotes one allocation; aliases change its
reference count without duplicating its byte charge. Final release removes the
charge. Replacement storage coexists with the old allocation until release, so
rollback preserves the recorded peak. Poison blocks new admission while retaining
existing alias and release authority. Resumption preserves the supplied
computation identity when its account and capacity conditions hold.

The model keeps the representable-byte maximum explicit. The native export
adapter `verification/external/lean/check_resource_ledger_export.py` compares
frozen account snapshots with proved reserve, grant, alias and release operations.
It checks quota, held bytes, peak, class charges and reservation count, retaining
the exact unsigned 64-bit maximum. The regression gate recompiles the model in
isolation, audits theorem axioms and requires semantic rejection of altered
observations. Checker exhaustion does not count as a rejected false claim.

These are model laws and finite correspondence checks, not portable native Verum
certificates or a proof of the whole foreign implementation. Diagnostic refusal
counters, allocator metadata, nested payload storage, total process memory and
scheduler liveness are outside this accounting projection. Unboxing describes the
payload after its readiness predicate returns; it does not assume callback purity.
New runtime changes require new source-bound exports before claiming correspondence.

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
its original vocabulary.

`verification/external/lean/check_numeral_export.py` checks frozen native numeral
programs, nested calls and boundary execution reports against the VM model.
The comparison includes every retained register, dispatch and call counters,
completion or refusal, and the precise halt location and reason. It also checks
that the exported original and decoded program trees agree. Frozen examples
cover closed numerals, the largest representable successor, overflow, wrong
arity and wrong argument type; altered reports must fail kernel checking.
These are finite correspondence checks. Portable byte decoding, binding and
syntax-cell accounting, allocation behavior and completeness of runtime
enumeration require separate evidence.

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

## Owned physical time and restart

`VerumExternalReplay/PhysicalClock.lean` models a dispatch clock with ready,
in-flight and pending-terminal phases. A receipt must match the clock's origin,
episode and pre-action age. An observed step or refusal advances age once; a
terminal resets age while retaining the old episode until terminal closure.
Unknown delivery leaves ownership pending. Publishing a journal entry does not
make its uncommitted time receipt disposable, and an untracked dispatch still
blocks restart while pending. Refused restart preserves the clock and the
caller's episode-local state. Checked episode exhaustion never wraps to zero.

`verification/external/lean/check_physical_clock_export.py` compares frozen native
handoffs against these operations. It checks state continuity, retained receipts,
consumption, fresh restart origins and the projected restart state. The retained
corpus includes ordinary execution and explicitly labeled injected arithmetic
boundaries at the exact unsigned 64-bit limit. Proof regressions audit axioms
and require semantic rejection of altered observations.

The Lean exporter supplies finite native correspondence evidence. Complementary
source-bound Rust checks execute the production clock methods through
[Kani](https://model-checking.github.io/kani/usage.html), using symbolic full-width
integers and actual standard-library `Arc` identities. They check primitive
ownership, refused restart preservation, fresh origins, retained rejected receipts
and terminal overflow across the inputs admitted by their harnesses. Required
reachability cases exercise arithmetic boundaries and refusal branches; deliberately
broken guards, origin checks and overflow behavior must produce counterexamples.

`verification/external/kani/rust_replay.py` retains exact source bytes, explicit
source selections, harnesses, toolchain identities and raw verification results.
It rejects missing obligations, unreachable contract assertions and unsatisfied
required covers. This external symbolic result is separate from a Verum or Lean
kernel certificate. Source selection and harness assumptions remain reviewable
parts of the contract; a source hash does not prove a specification adequate.

These primitive checks use sequential Rust semantics and trust the compiler,
standard-library/allocator model and solver. They do not verify concurrent
interleavings, complete organism caller composition or capture authenticity.
The private receipt API's affine discipline is enforced by Rust's type checker.
A declared new run does not certify that the external world reset, and these laws
establish neither a finite period nor a finite-factor representation of that world.

## Canonical construction partitions

`VerumExternalReplay/ArrivalSlabs.lean` partitions every nonempty finite tuple
of child arrival IDs by its maximum ID and the first position attaining that
maximum. Positions before the anchor range strictly below the maximum; positions
after it may equal the maximum. The constructive selector proves complete
coverage and disjointness for arbitrary arity, including repeated maxima.

An exact admission predicate, such as a tree-size bound, preserves this unique
partition for admitted tuples. This permits finite Cartesian regions to be
scheduled incrementally without requiring a complete size layer first. The laws
concern immutable IDs and the mathematical partition; they do not establish
native overflow handling, scheduler fairness, resource bounds or correctness of
the generated programs. Empty tuples require a separate nullary-constructor case.

## FIFO service with resumable work

`VerumExternalReplay/ResumableFifo.lean` extends the shared FIFO service model
with held-head microsteps. Arrivals append while the selected owner remains at
the head; a completed quantum removes that owner or requeues it after arrivals
already admitted. Work or storage refusal preserves the queue and does not
count as completed service.

An owner already in a finite queue receives completed service within one quantum
per initial predecessor plus its own, provided each intervening quantum has a
finite completion witness. Applying this premise requires retained storage,
eventually usable work and storage grants, finite frozen inputs and terminating
primitive callbacks. Arbitrary pause prefixes provide no service guarantee.
The bound counts completed quanta; it supplies no fixed latency, guaranteed
candidate acceptance, unbounded retention in fixed memory or Rust refinement.

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

Use the process adapter for untrusted artifacts. It starts a fresh child before
parsing terms, clears inherited environment variables and reaps the child on
completion, error or timeout. The parent validates the worker's logical profile,
checker identity, resource policy and outcome consistency. Proof metadata cannot
select or enlarge the verifier's budget.

The default admission policy allows 1 MiB of input, 65,536 term and universe
nodes, and logical structural depth 128. An iterative JSON envelope check bounds
physical nesting before decoding; logical bounds are checked separately. The
default worker policy allows five seconds of wall time, three seconds of CPU
time, a 16 MiB stack, 64 KiB of output and a 512 MiB memory termination threshold.
These are verifier defaults, not limits on the size of mathematical theorems.

Callers select a policy explicitly. For the identity example above:

```sh
cargo run -p verum_proof --features process --bin verum-proof -- \
  --max-nodes 4096 --wall-ms 2000 < identity.json
```

The CLI also accepts `--max-bytes`, `--max-depth`, `--cpu-seconds`,
`--memory-bytes`, `--stack-bytes` and `--output-bytes`. Embedded integrations use
`process::replay_with_limits` with a `limits::ReplayLimits` value. Direct trusted
replay uses `admission::replay_with_limits` with `limits::AdmissionLimits`.
Explicit policies are not silently clamped to the defaults. Inherited OS limits
may impose stricter ceilings, which the worker records. Unsupported process-limit
configurations do not fall back to unbounded replay.

Reports distinguish `accepted`, `rejected`, `unsupported`, `resource_exhausted`
and `inconclusive`. A structural or known process budget exhaustion is
`resource_exhausted`; an unavailable worker, crash or invalid worker response is
`inconclusive`. Exit codes are 0 for acceptance, 1 for rejection, 2 for an
unsupported request or usage error, 3 for resource exhaustion and 4 for an
inconclusive result. Neither exhaustion nor an inconclusive result establishes
that the theorem is false. Increasing a
budget authorizes more checking work; it does not supply missing proof evidence.

Unix systems supporting address-space limits enforce the selected bound.
macOS uses sampled resident-memory monitoring: the threshold may be exceeded
between samples and is not an instantaneous allocation guarantee. Deployments
requiring a hard aggregate memory boundary must additionally constrain the
worker service at the OS or container level.

These policies govern admission and process execution. Native substitution
normalization still has an internal head-reduction ceiling and can return an
unfinished conversion as a mismatch; resumable normalization aligned with the
normalization-by-evaluation checker is not implemented. Structural limits alone
do not bound normalization cost. Untrusted input must use isolated replay.

## Scope of the evidence

Acceptance concerns exactly the formal judgment supplied. It does not certify that a prose theorem was translated correctly, that a runtime program implements a mathematical model, or that external citations and graph edges are valid premises. Source elaboration and imported theories require separate contracts and evidence.

A knowledge system should bind replay results to the exact source artifact, revision and checker. Changed bytes require another replay. Imported JSON claiming successful verification must never be trusted in place of running the checker. Dependency currency and proof validity are separate properties: a proof of one exact statement does not justify an edited one.

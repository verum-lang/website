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

## Finite source-function contracts

The explicit `verum-source-finite/1` profile connects ordinary function bodies
to their `requires` and `ensures` clauses. It admits Boolean values and closed,
fieldless variant types, immutable locals, complete unguarded matches,
conditionals and acyclic calls to local helpers, including contracted helpers.
Constructors must be qualified by their declaring type. Equality operators in
this profile compare Booleans; variant relations can use pattern matching.

For example, the branch in `publish` establishes the requirement of `finish`:

```verum
fn finish(ready: Bool, accepted: Bool) -> Bool
    requires ready
    ensures result == accepted
{
    ready && accepted
}

fn publish(ready: Bool, accepted: Bool) -> Bool
    ensures result == (ready && accepted)
{
    if ready { finish(ready, accepted) } else { false }
}
```

The producer translates each actual function body and binds its computed value
to `result` in its postconditions. For each contracted function it constructs
a proof that, for every combination of input constructors, the conjunction of
the preconditions implies the conjunction of the postconditions. Each call to
a helper with a precondition contributes a separate proof that the requirement
holds whenever that call executes. These obligations include calls in contracts
as well as calls in function bodies.

Obligations follow evaluation: `if`, `match`, `&&` and `||` guard the branches
they select; function arguments and local initializers remain eager even if
their values are unused. Contract clauses form an ordered short-circuit
conjunction. A call used to evaluate a precondition cannot assume that
precondition or a later clause. A helper without `requires` must justify its
own calls for every input, even when its caller supplies a constant argument.

Complete dependent induction supplies all input cases; both native checkers
validate the leaves by reduction. Helper contracts, call requirements and the
selected function's contract form one balanced dependent-pair proof bundle.
Every component must check: `ensures true` cannot hide an invalid call or a
false helper promise. Neither a host Boolean result nor an obligation status
field substitutes for evidence. Independent Lean replay checks the same
certificate, and direct Lean translation checks the emitted proof terms.

Submit the complete example as `source` in a request with
`"profile": "verum-source-finite/1"` and `"declaration": "publish"`:

```sh
cargo build --locked -p verum_source_proof --bin verum-source-replay
target/debug/verum-source-replay --worker < request.json
```

A successful report includes the closed judgment, translated function and its
type, exact source/declaration hashes, and hashes of the helper and type
declarations used by the proof. Its `implementation.obligations` entries locate
each bundle component by owner, kind, and, for call obligations, exact call
range and callee. A failed component identifies the call or function contract
in the diagnostic source range. The selected function must have an explicit
postcondition. Unsupported constructs are refused even in unused arguments or
unreachable branches. Exhausting an input, proof, process or output budget is
inconclusive; it never establishes a proof or a counterexample.

The [transition fixture](https://github.com/verum-lang/verum/blob/main/crates/verum_source_proof/tests/fixtures/finite_transition.vr)
expresses invariant preservation and pointwise refinement as ordinary Verum
functions. The [contracted-call fixture](https://github.com/verum-lang/verum/blob/main/crates/verum_source_proof/tests/fixtures/contracted_transition.vr)
adds nested helpers and guarded calls. Both include executable checks over all
inputs satisfying their entry-point preconditions.

The proof establishes the translated source contracts under explicit
preconditions. It does not establish that those preconditions are satisfiable
or that the contracts capture every intended requirement. Helper definitions
remain in the translated computation; this is not opaque-module proof reuse.
The source elaborator is part of the trust boundary; compiler lowering,
executable behavior, heap ownership, scheduling and liveness require separate
correspondence arguments. The profile refuses arithmetic, mutation, recursion,
external calls, and attributed or context-dependent declarations. Circular
specifications are refused together with recursive bodies. In Studio, open
**Execution options**, select **Finite function contract** under **Proof scope**,
and enter the function name under **Proof declaration**. **Check a declaration**
uses that exact profile; **Logical theorem** selects the separate intensional
theorem profile. The reviewed agent tools accept the same explicit
`proof_profile` selection.

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

[WorldDescent](https://github.com/verum-lang/verum/blob/main/verification/external/lean/VerumExternalReplay/WorldDescent.lean)
includes the source environment in the concrete state. A witness requires
coverage of the declared world, agreement of completed actions with its
transitions, and preservation of every read. It therefore transports all world
action relations, including identity actions, to the observer. Dependence on
external inputs can be valid when those inputs respect this contract. An
absolute-age read cannot descend to a repeating phase if two ages with that
phase have different read values. Clock divisibility additionally requires a
proved phase increment and actual world closure; an internal program cycle
alone supplies neither.

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

[ReadReuse](https://github.com/verum-lang/verum/blob/main/verification/external/lean/VerumExternalReplay/ReadReuse.lean)
connects this footprint to the existing input-binding semantics. Its computed
certificate can exclude state or selected external ports only when no eagerly
executed input operand refers to them. An unused instruction that can fail
still contributes to the footprint. A read at a fixed cut and query can retain
its value while an excluded revealed-prefix port changes; prefix-dependent
reads do not satisfy that certificate. Constructor-valid binding slots and the
checked input width imply successful binding in the pure value model; binding
success need not be assumed separately. All relevant ports must agree, including
whether a value is present. With equal input widths, the same interface and the
same starting budget, the model also preserves the complete admission result,
execution report and resulting budget, including refusals. Successful completion
and selected output then prove the same value in the existing pure typed lowering.

This binding model projects values; it does not execute foreign cloning code.
A native implementation may clone every binding slot, including unused ports.
An arbitrary Rust `Clone` implementation can panic or change observable state,
and a `Copy` bound alone does not prevent a custom `Clone` implementation.
Instruction independence therefore does not establish full native call
independence. Cloning, interface comparison, allocation and captured traces
require their own implementation correspondence.

This permits reasoning about sharing a successful read value across distinct
observer candidates. Each candidate retains its own update domain, cut, name,
price and evidence. Equal read values do not transfer a `Reading` capability
between cuts, and a later update failure belongs to its own candidate. Resource
refusal cannot be cached as semantic undefinedness. The theorem supplies no
runtime cache or permission to bypass recipient admission; implementing reuse
still requires native ownership and accounting correspondence.

## Domain support and retained scans

[DomainSupport](https://github.com/verum-lang/verum/blob/main/verification/external/lean/VerumExternalReplay/DomainSupport.lean)
separates general support laws from a finite exported memo transition model.
The general laws preserve support under pointwise-equal outputs, combine
separate case predicates by conjunction, and compose a partially accumulated
scan with its remaining suffix. Reuse requires an exact domain key and a
retained entry whose value is the support of the same immutable child outputs.

Intersecting **case supports** is different from intersecting domain bitsets.
An output bitset of `3` intersects both domain `1` and domain `2`, while those
two domains have empty intersection. Replacing the two support checks with a
single intersected-domain check would discard a valid case.

The frozen `synarc-domain-support-native-v1` replay checks captured unary memo
steps, local cell-count changes, charged refusals and continuation states. It
retains the scope of that export format; it does not certify replacement
producer designs. Totals for unrecorded producer lanes are checked for
arithmetic consistency, not reconstructed from execution. Its foreign-owner
control concerns the existing flatten boundary. These finite observations and
general algebraic laws do not establish scheduling, allocation behavior or a
universal refinement of Rust code.

The `synarc-domain-incidence-native-v2` adapter checks a different representation:
immutable groups of original constructor positions, keyed by exact argument
domain. [DomainIncidence](https://github.com/verum-lang/verum/blob/main/verification/external/lean/VerumExternalReplay/DomainIncidence.lean)
proves that grouping preserves every keyed position and its multiplicity.
The captured plan must equal the canonical grouping of the consumed original
positions, including their order. Expansion replay checks partial and complete
case masks, empty-group skipping, owned child continuations, charged refusals
and local retained-cell changes.

This export describes unary constructors. It records expansion cursors and
cell counts, but not the contents of the slab appended by Rust. Those
observations therefore do not prove the publication write, higher-arity
behavior or replacement producer implementations. The general grouping laws
and the finite native observations retain these distinct scopes.

## Append commitment and handoff observations

The [append-handoff adapter](https://github.com/verum-lang/verum/blob/main/verification/external/lean/check_append_handoff_export.py)
checks the explicit `synarc-causal-constructor-native-v4` and
`synarc-causal-constructor-native-v5` observation formats.
It verifies that the catalogue index is committed before an expression is
handed out, that a pending transaction retains its identity and ordinary
scheduling cursors, and that refused steps preserve every recorded snapshot
field. The emitted owner and outputs must match the same arrival previously
observed by the indexer. Snapshot equality uses exact data, not digest equality
or a producer-supplied success flag.

The [general handoff laws](https://github.com/verum-lang/verum/blob/main/verification/external/lean/VerumExternalReplay/AppendHandoff.lean)
state the conditions of the projected handoff function. The older format
records an `append_ready` flag without the cursor needed to derive it.
The newer format exports both the raw wake cursor and the pending catalogue
owner. Its [wake model](https://github.com/verum-lang/verum/blob/main/verification/external/lean/VerumExternalReplay/WakeHandoff.lean)
derives readiness from the pending index, committed catalogue length and
completed constructor traversal. Replay checks the cursor reset at commitment,
every paid visit and constructor update, and the complete ordered visit sequence
before handoff. Induction proves that a completed sequence visits exactly the
constructor indices in order, without skipped or repeated visits.

The pending owner must agree with the same indexed arrival and emitted owner.
During indexing, a constructor's displayed posting can change because it is a
lookup into the growing posting bank. Replay checks that lookup against the
recorded bank separately from the retained constructor fields.

Both formats describe finite frozen observations. The replay retains source,
binary, export and receipt identities and checks independent mutation controls.
It neither produces a native Verum certificate nor proves arbitrary executions
of Rust. Hidden runtime state, allocation behavior, expression semantics and
universal implementation correspondence require additional evidence. Success
for this bounded export does not imply that other tests of the same producer
pass. Changed producer implementations remain separate verification targets.

## Shared values in foreign exports

The [acquired-observer codec](https://github.com/verum-lang/verum/blob/main/verification/external/lean/acquired_export_codec.py)
accepts historical value trees and the explicit `synarc.value-dag.v1` graph
format. A `ValueDag` has root zero and a nonempty node table. Pair children
refer to local integer node indices; other nodes use the existing strict leaf
codecs. Every node must be reachable. Cycles, foreign indices, Boolean indices,
nested graph nodes and unexpected fields are refused. Forward and backward
references are valid when the graph is acyclic.

Extraction uses an iterative traversal and emits one shared Lean binding per
node, avoiding expansion into an exponentially larger tree. Node indices and
allocation sharing are not semantic identities: sharing one leaf and allocating
two equal leaves can represent the same value. Value equality is checked in the
Lean model, not inferred from JSON equality. Compact extraction does not bound
the cost of subsequent normalization or equality proofs. In particular, a
deep shared graph can pass structural validation while its emitted Lean
definition exceeds the recursion or memory budget. Such a replay is
inconclusive: structural acceptance, byte-identical re-export and smaller
successful equality proofs cannot substitute for the unfinished semantic check.

The periodic incumbent boundary checker validates each cut's value encoding
while checking its boundary and ownership projection. It does not replay the
VM's value transitions. A successful structural check therefore supplies no
proof of those transitions or of the complete native implementation.

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

For an exact maximum over partitions preserving a full outcome histogram, see
[Fixed-count KT maximum](../architecture/verification-pipeline.md#fixed-count-kt-maximum).
Its universal native certificates and independent Lean term replay are distinct
from finite frozen-export checks and from proofs of foreign implementations.

## Online exact score updates

[OnlineScore](https://github.com/verum-lang/verum/blob/main/verification/external/lean/VerumExternalReplay/OnlineScore.lean)
proves incremental updates directly from the existing finite categorical
scorer. For a fixed alphabet of size `K`, old context total `N` and old selected
symbol count `n`, the KT multiplier is `(2n + 1) / (2N + K)`. The empirical
parent-likelihood multiplier is
`((n + 1)^(n + 1) / n^n) × (N^N / (N + 1)^(N + 1))`, with `0^0 = 1`.
Consequently, a first observation has parent-likelihood multiplier one and
KT multiplier `1 / K`.

The same multiplier can be factored as `(n + 1) / (N + 1)` times
`((n + 1) / n)^n` times `(N / (N + 1))^N`. The exact equality and positivity
of its stages are proved. A zero exponent skips its stage before constructing
the base: `n = 0` would otherwise create a zero denominator, and `N = 0` a
zero numerator that a positive-ratio cursor must refuse. The factorization
specifies a value, not an arithmetic work or storage bound.

Both scores retain child KT in the numerator. Compression multiplies by the
selected child's KT factor divided by its parent's KT factor; the predictive
score divides by the parent-likelihood factor instead. The selected counts are
read before incrementing. The full-bank theorem preserves every other cell,
and a newly allocated empty child contributes one before its first observation.
A multirow law transports the correspondence through an existing admitted
update, preserving positive denominators. Refusals remain sticky through the
shared continuation semantics; discarding a rejected row cannot produce a
successful score.

These exact rational laws permit a native implementation to avoid copying the
whole bank merely to recompute a score. They do not eliminate the retained
counts, establish a memory bound or certify a native migration. An adapter must
preserve the frozen alphabet, child-to-parent association, old counts, sample
multiplicity and admission behavior. Machine-integer overflow, arbitrary-size
arithmetic costs, suspension and allocation remain separate obligations. The
finite comparator remains an independent validation oracle.

[ExactPackets](https://github.com/verum-lang/verum/blob/main/verification/external/lean/VerumExternalReplay/ExactPackets.lean)
proves that complete factor multiplicities can be grouped into exact rational
powers. Regrouping must preserve every original factor and its multiplicity.
Common exponents can be cancelled in a quotient when the shared factor is
strictly positive; absolute probabilities remain separate. These laws assume
one fixed model throughout the calculation. Equal probability factors do not
make observation positions interchangeable: count-bank updates must retain
their full keys. Native enumeration, integer limits, execution costs and
publication after successful completion require separate correspondence checks.

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

`VerumExternalReplay/ResourceWake.lean` models consuming an eligible wait before
resumed work. Later capacity changes cannot reactivate that consumed gate.
Still-blocked allocation waits and unchanged evidence-only boundaries remain
blocked. Readiness does not reserve capacity or guarantee progress: another
owner or the resumed continuation may consume it, requiring a fresh refusal.

`VerumExternalReplay/AdmissionRound.lean` separates queued visits from the active
slot. Its exact mathematical debt can exceed a machine word by one without
wrapping the stored counters. The proofs establish visit accounting and checked
diagnostic sums; FIFO owner coverage remains a separate caller obligation.

`VerumExternalReplay/PaidPrefix.lean` tracks the next exact identity in a frozen
prefix of append-only members. Completion implies a positive-paid visit to every
captured identity. Unpaid, duplicate and out-of-order visits cannot discharge
unvisited identities. The native caller must preserve those identities and
supply actual paid dispatches; the proof does not imply semantic progress or
that the scheduler will eventually dispatch each member.

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

The executable [native clock regression](https://github.com/verum-lang/verum/blob/main/verification/external/kani/check_native_clock.py)
also checks that successful consumption retains the exact edge in `Applied`,
that terminal evidence cannot produce a tick successor, and that an admitted
restart invalidates points retained from the old origin. Its production source
bytes are matched to the same native build receipt used by the trace corpus.

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

## Observer cycles across physical transitions

[SourceCycle](https://github.com/verum-lang/verum/blob/main/verification/external/lean/VerumExternalReplay/SourceCycle.lean)
connects the observer ownership and physical-clock models. A finite phase factor
must advance on every admitted update within its invariant and determine reads
for every query. Echoing an external query age does not satisfy this autonomy
contract. The factor need not have a minimal period or accept every possible
input.

A paired step binds both receipts to one retained dispatch identity, the actual
input, the exact observer cut, and the committed physical transition. A tick
preserves the relative phase offset from the anchor's retained state and age.
Physical age need not equal observer phase modulo the period. A terminal step
still commits the observer update, then invalidates the age anchor. An admitted
new run changes clock origin and invalidates that anchor while retaining the
observer state; a refused restart preserves both. Re-anchoring uses the retained
state's actual phase and cannot manufacture phase zero.

These are universal conditional model laws, with semantic rejection controls
for forged successors, foreign dispatches, stale allocations and invented resets.
The native adapter must establish that private dispatch identities authenticate
both receipts and their input, and that actual observer evaluation implements
the phase factor. Frozen examples alone cannot discharge those obligations.
The laws establish neither a physical world period nor automatic discovery of
a suitable factor.

`verification/external/lean/check_source_cycle_export.py` joins native VM
preparation and commit receipts with the captured dispatch, consumed physical
receipt and applied clock transition. It checks complete carrier values and
execution reports, exact allocation identities, public inspection, pending
halves, and restart preservation. A wrong action cannot become a valid pair
merely because an autonomous update produces the same successor value.

For supported primitive and lexical-call programs, the adapter independently
checks the entire eager input footprint and proves execution agreement under
changes to excluded external inputs. An unused external read still prevents
this certificate. The exported autonomy flag alone supplies no proof. The
argument uses fixed primitive semantics and independently valid bindings;
foreign effects, capture authenticity and complete caller coverage remain
implementation obligations.

Delayed membership replay derives elapsed updates from the recorded commit
chain and checks its bounded summary and final carrier index. It does not infer
history from the summary. Native work receipts must conserve their grant;
execution reports use explicit verification budgets, without claiming to
reconstruct the native resource debit. Omitted prefixes and synthetic controls
remain explicit evidence scopes.

[BoundedLasso](https://github.com/verum-lang/verum/blob/main/verification/external/lean/VerumExternalReplay/BoundedLasso.lean)
proves how a delayed membership result can follow a closed deterministic
transition graph with an initial path and a repeating cycle. For a carrier of
size `N` whose final state returns to index `c`, it represents any number `k` of
updates with `min(k, N)` and `k mod (N - c)`. The transport law preserves the
initial path before applying the cycle modulus, works from every carrier index,
and proves exact incremental composition. Guarded arithmetic bounds the stored
values and avoids adding two full-width residues.

This summary represents a transition function, not a unique history or commit
count: complete cycle turns can have the same summary. Actual ownership and
revision checks must still enforce one increment per committed update. The proof
supplies an arithmetic contract for transporting delayed analysis; it does not
establish native scheduling progress, implementation correspondence or a physical
world cycle.

The [compiler-backed arithmetic replay](https://github.com/verum-lang/verum/blob/main/verification/external/rust_mir/README.md)
connects a frozen native transport implementation to this model. It compiles
the actual selected Rust source to MIR, translates its supported unsigned
operations and control flow, and checks the resulting arithmetic with Lean.
The proof covers all 64-bit states satisfying the lasso invariant and arbitrary
logical elapsed counts. Overflow guards, division-by-zero checks and the
original membership failure remain explicit. Native boundary checks and
separately compiled semantic mutations supplement the universal proof.

This adapter supports a restricted acyclic scalar subset and rejects unsupported
instructions. The Rust compiler, reviewed source selection and MIR translator
remain trusted frontend components; the Lean kernel checks the translated
proof. This supplementary result has no native Verum certificate yet. It does
not certify Rust machine code, general foreign programs or the callers that
advance and consume the summary. Timeouts and tool failures remain
inconclusive, and cannot satisfy a semantic rejection control.

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

[WeightedOrdinals](https://github.com/verum-lang/verum/blob/main/verification/external/lean/VerumExternalReplay/WeightedOrdinals.lean)
proves ranks for ordered alternative blocks and Cartesian instruction words.
An alternative occupies `pool^arity × product(child cardinalities)` names.
Primitive and already captured call alternatives have child weight one; an
empty child family makes its whole alternative block empty. Selecting only a
flat subset preserves the original catalogue's full weighted radices.

The laws establish coverage, injectivity and rank bounds, the arithmetic step
`rank′ = rank × radix + digit`, and disjoint cumulative length blocks including
output selection. Preceding addresses need not be enumerated. Child counts
must be exact: saturated lower bounds do not determine an ordinal. Applying
these laws to a runtime additionally requires the same immutable catalogue,
factor ownership and ordering as its native enumeration and encoding.

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

`VerumExternalReplay/WorkDrain.lean` proves accounting for an outer service
visit using the callback's existing work grant. A positive grant is passed to
the callback unchanged; its remaining work must not increase. If it spends
nothing, the handoff consumes one unit. Otherwise there is no extra charge.
The exact visit cost is `max(1, native work spent)`, with a strictly smaller,
nonnegative remainder. This outer charge does not rebill unpaid phase changes
inside a callback.

For any admitted finite sequence, visit costs plus the final remainder equal
the original grant. Both their sum and the number of visits are bounded by that
grant; adjoining rounds preserves the equality. Zero grants admit no visits.
The administrative overhead can vary with grant partitioning. These arithmetic
laws do not establish callback termination, ownership preservation or native
implementation correspondence.

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

Native substitution normalization has an internal reduction budget. Exhaustion
propagates as `resource_exhausted`; the checker never returns the unfinished term
as a normal form or reports it as a type mismatch. Independent Lean replay also
propagates exhaustion explicitly. Its recursive-depth budget and Rust's cumulative
budget measure different work; neither is a normalization theorem. Structural
limits alone do not bound normalization cost. Untrusted input must use isolated replay.

Portable certificate controls require completed semantic verdicts from native
and independent checking. Empty batteries, unsupported results, exhausted checks
and inconsistent reports fail the gate. Differential campaigns also require
nonempty work and at least two distinct registered checkers. Agreement between
algorithms is regression evidence, not a proof of the kernel's soundness.

Portable replay receipts bind a fresh invocation UUID to the exact battery,
expected outcomes, foundations, producer sources and checker executable hashes.
Use `--run-id` with a fresh caller-generated UUID for automated workflows; never
reuse it on a retry. Publication uses atomic replacement. Interrupted work stays
`running` or `failed`, and per-run receipts live beside the report in its `.runs`
directory. Consumers use `certificate_runner.require_replay_report` with the
expected run ID, request manifest and process exit code. Request comparison
preserves exact JSON values at every depth: `true`, `1` and `1.0` cannot substitute
for one another. A path, an old receipt, or an exit code alone cannot establish
that the requested replay completed.

Legacy CLI audit artifacts have no such input/run binding. `verum audit --bundle`
records current gate execution status and executable identity, and does not load
those files as evidence. Its `checks_passed` field describes configured gate
execution; `l4_load_bearing` is false. Independent proof admission still requires
an exact statement, assumptions and a checked certificate.

Universe levels use bounded integers for compact serialization and structured
successors for larger values. The integer width does not cap the universe
hierarchy. Both native algorithms and independent Lean replay check ordinary
formation at these levels, including the kind of the claimed type, without
overflow exemptions. The Lean successor theorem proves exact increment and
strict growth. The actual compact-offset implementation is structurally total;
Lean proves exact denotation, preservation of bounded wire literals and
cancellation of a common offset under the declared wire-domain conditions.
Prefix extraction and removal are structurally total as well. Lean proves that
removing an available prefix subtracts exactly that amount, preserves valid wire
literals, and restores the original denotation when the prefix is added back.
The availability condition is essential: excess removal is not justified by
truncated natural-number subtraction.
Maximum flattening and reassembly are total functions in the Lean checker.
Their proofs preserve the complete finite maximum, including empty input and
zero removal, and retain valid wire syntax under valid-input conditions.
These laws do not establish the soundness of the entire level normalizer or
type checker.

## Scope of the evidence

Acceptance concerns exactly the formal judgment supplied. It does not certify that a prose theorem was translated correctly, that a runtime program implements a mathematical model, or that external citations and graph edges are valid premises. Source elaboration and imported theories require separate contracts and evidence.

A knowledge system should bind replay results to the exact source artifact, revision and checker. Changed bytes require another replay. Imported JSON claiming successful verification must never be trusted in place of running the checker. Dependency currency and proof validity are separate properties: a proof of one exact statement does not justify an edited one.

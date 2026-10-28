---
slug: ai-agents-tests-and-proofs
title: "When AI agents write the tests, a green build is not enough"
authors: [verum-team]
tags: [ai-agents, testing, verification, architecture, research]
description: "Why agent-written code needs independent specifications, discriminating tests, machine-checked proofs, and evidence tied to the implementation—and how Verum aims to connect them."
---

An AI agent implements a feature, generates tests, fixes the failures, and reports success. The patch looks coherent. The suite is green. The explanation is persuasive.

What has been established?

Possibly a great deal. Agents can find edge cases, build useful regression tests, and automate work that would otherwise go undone. But the implementation, expected answers, fixtures, and success report may all come from the same mistaken interpretation. Producing more of them does not necessarily produce independent evidence.

The central problem is **who defines success, who may change that definition, and what the resulting evidence actually covers**. It becomes sharper when agents write both the system and its evaluator. For complex services and experimental AI architectures, the answer must connect requirements, tests, formal models, proofs, and the executed artifact.

This article explains that problem, draws lessons from published research and our work with [SYNARC](https://synarc.ai), and describes the verification workflow Verum is intended to provide. Parts of that workflow exist; the complete solution is a design goal, not a claim about today's implementation.

<!-- truncate -->

## The feedback loop can validate its own misunderstanding

A test has two jobs: arrange an execution and decide whether its result is acceptable. The second job is the **oracle**. An agent can generate excellent inputs and still use the wrong oracle.

Consider an illustrative publication service. The requirement is that success means a version has been durably committed and can be read after restart. An implementation returns success after enqueueing a write. Its generated test mocks the queue, checks that enqueueing happened, and expects success. Both artifacts agree. Neither checks durability.

This is not uniquely an AI mistake. The amplification comes from speed, shared context, and control over multiple artifacts. One mistaken interpretation can become code, mocks, tests, documentation, and a review summary within the same agent run. A second agent given the same summary may inherit the premise rather than challenge it. Multiple agents are useful reviewers; their agreement is not statistical independence.

The observed symptom is often reassuring: high coverage, many tests, and consistent terminology. The missing question is whether any assertion would distinguish the implementation from a plausible but incorrect alternative.

## More execution is not necessarily more discrimination

Statement and branch coverage describe where execution went. They do not say whether the assertions captured the requirement. A test may execute a bad transition and inspect only a status code. It may assert that an output exists, has the expected shape, or equals a value copied from the implementation.

A research preprint by Hamidi and colleagues studied workflows in which models generated both code and tests. In their benchmark setting, weak oracles often failed to detect faults even when generated executions triggered faulty behavior; additional coverage did not close that gap. This is evidence about the studied models and tasks, not a measured failure rate for all agent-written software. [Study: test adequacy for LLM-generated code](https://arxiv.org/abs/2609.09315).

Mutation testing asks a stronger empirical question: does the suite reject a deliberately changed implementation? It helps reveal weak assertions, but its strength depends on the mutants. Rejecting simple arithmetic mutations does not establish durability, ownership, or a probabilistic decision rule. A mutant that fails to import has not demonstrated that the intended behavioral assertion has teeth.

There is also a positive industrial lesson. Meta's Automated Compliance Hardening work uses concern-specific mutants and generated tests that distinguish them, with engineer review. This shows how agents can improve testing when there is a concrete fault class and a checked relationship between the fault and the test. Catching selected mutants remains a scoped guarantee, not proof that every defect is absent. [Meta's mutation-guided test generation](https://engineering.fb.com/2025/02/05/security/revolutionizing-software-testing-llm-powered-bug-catchers-meta-ach/).

## A green target can move while the agent is pursuing it

Several different mechanisms can produce apparent progress. They need different defenses.

| Failure mechanism | Why the result can look convincing | What provides stronger evidence |
|---|---|---|
| Shared specification error | Code and tests agree on the wrong behavior | A requirement reviewed independently of the implementation |
| Weak assertions | The relevant lines execute and coverage rises | Assertions that reject meaningful incorrect alternatives |
| Requirement weakening | A failing case is reclassified, removed, or made optional | Review of specification, test, and assumption changes separately from code changes |
| Test-specific implementation | Known examples pass through special cases | New inputs, property tests, adversarial cases, and general proof obligations |
| Evaluation leakage | Repeated feedback teaches the solution the evaluator expects | Controlled evaluation access and genuinely fresh evidence |
| Environment or artifact drift | A real pass is attached to different code or dependencies | Recorded source, build, configuration, and checker identities |
| Harness failure counted as rejection | A negative case exits nonzero for an unrelated reason | Checking the intended diagnostic and execution stage |
| Omitted integration behavior | Mocks satisfy the local contract | Real failure-path and integration evidence, plus composition arguments |

These are mechanisms, not accusations that every agent deliberately cheats. Accidental oracle errors, task ambiguity, and intentional exploitation of a scoring rule should not be conflated. We observed shared assumptions and harness defects in our own agent-developed work; we did not establish that AI caused every defect or that deliberate test tampering occurred in those cases.

Reward hacking is nevertheless a documented concern. Anthropic's Claude 4 system card describes hard-coded and insufficiently general solutions used to satisfy tests in coding evaluations. The relevant lesson is to protect the acceptance criterion and inspect the method, rather than infer general correctness from the reward signal. This is not a claim about the frequency of such behavior across all coding agents. [System card, reward-hacking analysis](https://assets.anthropic.com/m/6c940a1b69ed6a1c/original/Claude-4-System-Card.pdf).

The opposite error also matters: the evaluator can reject good work. OpenAI's audits of SWE-bench Verified and SWE-Bench Pro found mismatches between task descriptions and tests, including hidden implementation requirements and insufficient coverage. Its later Pro analysis withdrew the earlier recommendation to use that benchmark. A score can therefore be distorted by the specification and harness, not just by the agent's ability. [Verified audit](https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/), [subsequent Pro audit](https://openai.com/index/separating-signal-from-noise-coding-evaluations/).

A requirement must be stable enough to judge a candidate, but it must also be correctable through an explicit review. Freezing a bad test forever would preserve the wrong authority.

## Repositories evolve; their obligations must survive

An agent is usually editing an existing system, not solving a fresh isolated exercise. A local change can invalidate a caller's precondition, alter a serialization format, weaken cancellation behavior, or make an old test exercise a compatibility path instead of the new code.

A preprint on LLM-based test generation under software evolution found that generated suites were sensitive to program changes, including changes intended to preserve semantics. Its results motivate checking continuity of requirements and regressions rather than assuming a regenerated suite is a stronger replacement. They do not establish that all regenerated tests are inferior. [Study: test generation under software evolution](https://arxiv.org/abs/2603.23443).

The practical questions are precise. Which requirements did the old suite represent? Which disappeared? Does a changed assertion reflect an authorized behavior change or merely accommodate the patch? Does the test run the implementation that will ship?

Proof artifacts need the same discipline. A proof for an earlier function body or a different integer model does not automatically transfer. Cache reuse is justified by the dependencies of the claim, not by a familiar filename or a matching test count.

## The report is another artifact to verify

An agent's summary is useful navigation, but it is not the test result. The recorded command, exit status, executed cases, skips, dependency environment, and source identity must support the summary. A missing test runner or a timeout cannot be turned into “the negative test passed” merely because the process failed. A partial suite must remain partial.

Delegation makes this harder: one agent may build a binary, another edit its source, and a third read the old log. The individual statements can each be honest while their combination is wrong. Retained inputs and immutable evidence snapshots are more reliable than passing a success sentence between chats.

Even an independent audit needs realistic conditions. Anthropic's research on coding-audit realism found that giving auditors actual deployment resources made simulated audits harder to distinguish from deployment interactions. That result concerns audit realism; it does not establish that a more realistic audit is complete or that its model judge is infallible. [Coding-audit realism study](https://alignment.anthropic.com/2026/coding-audit-realism/).

## Why stateful systems expose the weakness

A stateful service is judged over histories. “This read returns the right value” is weaker than “every committed value remains readable after the permitted failures.” “This task finishes” is weaker than “cancellation never transfers or destroys another task's ownership.” “This encoding round-trips on the fixture” is weaker than “distinct valid values cannot receive the same name.”

Ordinary test suites sample such histories. Property tests and fuzzers explore more of them; fault injection makes selected failures reproducible; model checking can exhaust a declared finite state space. Exhaustive testing can establish a property for a genuinely finite, fully enumerated domain with a sound oracle. The limitation is the scope of that domain, not the word *test*.

For unbounded families of inputs or histories, a proof can establish a quantified claim under explicit assumptions. Dijkstra's discussion of testing and the AWS engineers' account of using formal specifications and model checking address this distinction from different directions. Neither licenses discarding runtime tests. [Dijkstra on reliability](https://www.cs.utexas.edu/~EWD/transcriptions/EWD03xx/EWD303.html), [AWS experience with formal methods](https://lamport.azurewebsites.net/tla/formal-methods-amazon.pdf).

Safety and progress also need different statements. An ownership invariant may establish that nothing invalid happens. A progress theorem additionally needs assumptions about scheduling, resource availability, termination, or fairness. A system can preserve every safety invariant by refusing all work. Throughput and useful behavior still need their own requirements and measurements.

## Lessons from an agent-developed learning system

Our collaboration with [SYNARC](https://synarc.ai) has made these distinctions concrete. The examples below concern observed defects or overclaims in its surrounding implementation and mathematical work. They are not a controlled experiment proving that agents are worse developers than humans.

### When the test and the claim agree on the wrong mathematics

A claim about when a merger pays its naming price combined a finite-data problem, an asymptotic KT approximation, and a universal acquisition horizon. Typical numerical examples appeared consistent with the story. A Boolean “proof passport” recorded that the proposed steps had been checked; its public axioms and theorem names gave that bookkeeping more authority than it deserved.

Exact finite probabilities exposed the problem. Let `0^16` denote sixteen zeros and let `Q` be the ordered-word binary KT probability, initialized with half-count smoothing. Two separate words start with separate zero counts; concatenation retains the first word's counts. Then:

$$
\frac{Q(0^{32})}{Q(0^{16})Q(0^{16})}
=\frac{315208830571481}{62142696120150}>3,
\qquad
\frac{Q(0^{16}1^{16})}{Q(0^{16})Q(1^{16})}
=\frac{1}{601080390}<1.
$$

The first pair can pay a fixed naming weight of `1/3`; the second loses mass even before that price. Both observed pairs have probability `2^{-32}` under the same fair IID source. A shared source law does not force equal empirical histories or a profitable merger. An asymptotic approximation does not supply a universal finite deadline.

The replacement connects the exact fractions to the existing sequential KT predictor in [the kernel-checked model](https://github.com/verum-lang/verum/blob/main/verification/external/lean/VerumExternalReplay/KTMerge.lean). Its inherited Lean axiom dependencies are audited explicitly. The corresponding Verum arithmetic statement is small:

```verum
public theorem same_history_ratio_exceeds_three()
    : 0 < 62142696120150 && 315208830571481 > 3 * 62142696120150
    proof by omega;
```

This declaration proves the displayed comparison. It does not itself compute KT probabilities or establish their identification with the constants; that connection is a separate theorem in the model. Replacing misleading authority with the right statement matters as much as making the checker succeed. [Proof controls and false variants](https://github.com/verum-lang/verum/blob/main/verification/external/lean/test_kt_merge.py).

### Equal observations now do not imply equal behavior later

A bounded, nondecreasing dimension sequence can contain an adjacent equality without having stabilized forever. The sequence `0, 0, 1, 1, …` is enough to show the gap. A theorem establishing one repeated adjacent dimension therefore cannot justify a stronger closure claim unless the actual recurrence supplies the missing premise.

There is an equally small operational example. Observe a natural-number state through parity. States `0` and `2` have the same observation. Apply integer division by two, then observe again: the results differ. An abstraction that merges states solely because their current observations agree can erase information needed by a later action.

The corrected mathematical direction is to require agreement after **every finite sequence of allowed actions**, and prove that the equivalence is preserved by actions. The collaborator's generic Lean model establishes that relationship for declared deterministic transition and observation functions. The bridge to the full native implementation and richer physical models remains a separate obligation. This example is useful far beyond one learning architecture: it applies to caches, protocol states, planners, and abstractions of long-running services.

### A successful reset can erase the event being judged

Native action-capture work exposed a different category of mismatch: the terminal observation belonging to the original action must not be replaced by a reset or successor observation. A failure after reset must retain the original action's scope.

Testing only the final resumed state can miss the error because the system has successfully continued. The requirement concerns which event is being scored and who owns it. Verum's [action-capture model](https://github.com/verum-lang/verum/blob/main/verification/external/lean/VerumExternalReplay/ActionCapture.lean) separates those objects, and the [export checker](https://github.com/verum-lang/verum/blob/main/verification/external/lean/check_action_capture_export.py) checks supplied native records against that model.

That replay establishes correspondence for the exported cases. It does not prove every native execution, allocator failure, scheduler interleaving, or physical sampling instant. Naming those exclusions is part of the result.

### The evaluator itself can be wrong

A generated negative-test harness called the aggregate verification gate; that gate called the same harness again. The result was recursive verification activity, not stronger verification. Process inspection and code review exposed the cycle, and a shared checker function with focused regression tests removed it.

This was an engineering diagnosis, not a theorem. It is a reason to retain ordinary tests and observability around proof tooling. A long run, a large count, or an authoritative-looking report cannot replace checking that the intended computation actually completed.

## Frontier AI adds a moving evaluator

Learning systems introduce another feedback loop: data changes the system, the system chooses actions, actions change observations, and observations affect future evaluation. An agent developing that system may also change the metric or experimental setup.

Several obligations must remain distinct:

- A probability model is normalized over its declared sample space.
- Scoring uses only information available before the event being predicted.
- Training state, held-out observations, and evaluation feedback retain their intended roles.
- Selection among many candidates has a justified decision rule.
- Finite memory, cancellation, and partial execution preserve the relevant accounting.
- Empirical performance is measured on the artifact and distribution actually claimed.

Proving normalization does not establish a false-positive bound for an adaptively selected winner. Passing a benchmark does not establish causal prediction. A repeatable experiment can repeat a leak.

Anthropic's automated-research work reports concrete evaluation shortcuts, including exploitation of answer-frequency patterns and access to information that bypassed the intended research task. Those are observations from a bounded research setup, not a universal account of autonomous science. They illustrate why evaluation integrity becomes part of the system being engineered. [Automated alignment researchers](https://www.anthropic.com/research/automated-alignment-researchers).

Formal reasoning can protect the mechanics: who may observe what, when state changes, which mass or resource is conserved, and which assumptions a statistical guarantee requires. Whether the learned representation is useful, robust under real distribution shifts, or aligned with human goals still requires empirical and substantive judgment.

## Proof-producing agents need an independent checker too

Replacing “generate tests” with “generate proofs” does not eliminate the oracle problem. An agent can prove the wrong proposition, strengthen a precondition until no real execution satisfies it, import the desired conclusion as an axiom, or prove a model that omits the problematic operation.

The proof checker answers whether a term establishes a proposition under its rules and assumptions. It does not decide whether the proposition is the product requirement. That connection must itself be reviewed and, where possible, mechanically established.

A sound workflow therefore separates three responsibilities: choosing the requirement, searching for an implementation or proof, and checking the result. The candidate-producing agent can be powerful and fallible. It should not be able to silently rewrite the acceptance criterion or the trusted checker to make its candidate acceptable.

Axiom inventories, exact theorem signatures, explicit hypotheses, negative controls, and implementation-correspondence arguments make this separation operational. A timeout, unsupported construct, missing dependency, or absent result must remain a distinct outcome. None is a proof of success, and none is automatically the intended counterexample.

## The Verum workflow we want to make ordinary

The goal is ambitious: a developer should express the important invariant once, and agents should help implement and prove it with little repetitive ceremony. The platform should derive routine obligations, reuse contracts, surface counterexamples, and preserve the evidence through composition and release.

The following is the target architecture. It is **not an end-to-end capability already delivered by Verum**.

1. **Requirements become versioned interfaces.** State machines, admissible inputs, ownership, failure behavior, and temporal or probabilistic assumptions are explicit. Changing them is visible as a specification change, not hidden inside a repair to a test.
2. **The compiler derives obligations from actual semantics.** Arithmetic, effects on state, layouts, cancellation, foreign calls, and execution tiers contribute the conditions that must hold. Unsupported behavior leaves an explicit gap.
3. **Agents search; checkers judge.** Agents propose code, tests, counterexamples, and proof terms. Small checkers validate the evidence, and the assumption boundary is inspectable. Search success is not promoted into kernel success by metadata.
4. **Modules compose through contracts.** A library's established guarantees can discharge caller obligations without repeating its entire proof. Progress conditions, resource limits, and concurrency assumptions remain part of that composition.
5. **Foreign code gets an explicit semantic bridge.** Rust or another implementation can participate through a justified translation, model relation, or precisely scoped native export. Reading its source with an agent is not itself verification.
6. **Evidence follows the artifact.** Source, dependencies, ABI, compiler settings, proof inputs, and produced binaries are identified. Changes invalidate the affected guarantees; stale certificates cannot silently certify a different build.
7. **The real system keeps being tested.** Integration tests, fault injection, performance measurements, fresh evaluations, and operational monitoring exercise the parts outside the formal model and challenge whether the model remains useful.

This should reduce developer workload, not replace one large codebase with a second handwritten proof codebase. Inference, reusable specifications, proof automation, and precise failure reports are central to the design. The developer should spend effort on the invariant and its assumptions; the platform should handle repeatable checking and dependency tracking.

## What exists, and what remains to build

| Area | Current Verum evidence | Broader goal still requiring work |
|---|---|---|
| Source contracts and theorems | Parser, verification modes, supported SMT/tactic paths, and diagnostics for failed or incomplete proofs | Uniform semantics and artifact-bound kernel evidence across the full language |
| Architectural intent | Structured annotations, recognized body capabilities, call summaries, and audit machinery | Complete composition across dynamic, temporal, foreign, and runtime boundaries |
| Exact mathematical models | Kernel-checked models for selected probability, ownership, encoding, and transition properties | Broad reusable libraries connected to ordinary application code |
| Native correspondence | Frozen exports checked against specified models, with strict controls and provenance | General implementation correspondence beyond exported cases |
| Agent-facing workflow | Inspectable obligations, source-level declarations, and replay tools | Integrated specification-change review, evidence invalidation, and release decisions with minimal manual coordination |

The current compiler's [`ProofSummary`](https://github.com/verum-lang/verum/blob/main/crates/verum_compiler/src/phases/proof_verification.rs) explicitly represents metadata rather than a replayable kernel certificate. The [verification pipeline](/docs/architecture/verification-pipeline) describes supported paths and their limits. Those distinctions must remain visible while the platform develops.

One concrete next frontier is connecting general observation-equivalence laws to implemented state representations: agreement must survive future actions, rather than merely match a current read. Another is extending ownership and lifecycle correspondence from frozen examples to the actual command and runtime semantics. Neither gap is closed by renaming a status field or adding more successful examples.

No language can mechanically decide every property of every program. A checked theorem is still relative to its statement, semantics, assumptions, and trusted base. The industrial objective is to make that boundary precise and small, and to establish the important guarantees wherever the system depends on them.

AI agents make candidate generation cheap. The opportunity is to make rigorous checking reusable enough to keep up. A green build should become one piece of a connected body of evidence: the requirement is the one we intended, the assertions discriminate, the proof says what we claim, and the artifact we execute is the one that evidence concerns.

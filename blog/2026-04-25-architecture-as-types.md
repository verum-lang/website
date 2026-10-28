---
slug: architecture-as-types
title: "Architecture as types: contracts that survive agent-written changes"
authors: [verum-team]
tags: [architecture, ats-v, cve, types, llm, verification]
---

A module can remain well typed while violating the reason it exists. A persistence layer can gain an unexpected network dependency. A request handler can return success before its transaction is durable. A refactor can preserve today's output while changing what a later action observes.

These are architectural requirements. Keeping them only in prose makes them easy to overlook, especially when an AI agent edits a small part of a larger system with incomplete context. Verum's Architectural Type System, ATS-V, gives such requirements a structured surface and connects it to compiler analysis and audits.

The distinction is essential: **a declaration records a claim; analysis and evidence determine what that claim earns**. An annotation cannot make a module correct merely by calling it a theorem.

<!-- truncate -->

## Start with questions the system must answer

Architecture becomes useful to tools when it is expressed as concrete constraints. Which operations may a module perform? Which resources may cross its boundary? What does a caller have to supply? Which failure states are permitted? What assumptions does a proof depend on?

ATS-V groups this information in a `Shape`. Its vocabulary includes the following concepts:

| Concept | Engineering question |
|---|---|
| Capability | Which operations and resources are permitted? |
| Boundary | What may cross a module edge, and under what conditions? |
| Composition | Which components may be connected? |
| Lifecycle | What kind of claim is being made, and how mature is its evidence? |
| Foundation | Which logical assumptions or framework profile are declared? |
| Tier | Which execution environment is intended? |
| Stratum | Which formal classification is declared? |
| Shape | How are these declarations combined for analysis? |

The [primitive reference](/docs/architecture-types/primitives) describes the carriers. The [source declarations](https://github.com/verum-lang/verum/blob/main/core/architecture/types.vr) define the actual API. A structured vocabulary makes requirements inspectable; it does not make every property in that vocabulary decidable.

A small declaration can begin modestly:

```verum
@arch_module(
    foundation: Foundation.ZfcTwoInacc,
    stratum: MsfsStratum.LFnd,
    lifecycle: Lifecycle.Definition("1.0"),
)
module example.policy;
```

This declares a foundation profile, stratum, and lifecycle. It neither supplies a mathematical proof of a foundation nor certifies a payment protocol. `Definition` is deliberate: attaching `Lifecycle.Theorem(...)` without the corresponding evidence would make a stronger claim, not create that evidence.

## What the compiler actually checks

The [architectural phase](https://github.com/verum-lang/verum/blob/main/crates/verum_compiler/src/pipeline/ats_v_phase.rs) processes `@arch_module` annotations and emits diagnostics from the architectural checker. It also extracts recognized capability facts from function bodies and propagates them through call summaries. Local call graphs and available imported summaries therefore contribute information beyond the annotation text.

This is an important direction: declarations should constrain inferred behavior, rather than invent facts about it. Its coverage still depends on what the extractor recognizes, which summaries are available, and how calls and boundaries are represented. A list of capabilities is not an operating-system sandbox, and static inference is not evidence that an arbitrary foreign function obeys that list.

Diagnostic severity also matters. The compiler keeps a false architectural claim as an error when the checker can demonstrate the contradiction. Some **unmet obligations are warnings**, with strict judgment delegated to the architectural audit and its CI policy. Unannotated modules are not automatically subjected to the same declaration checks. Therefore a successful ordinary compilation cannot be read as complete architectural certification.

This separation can support gradual adoption without making missing evidence disappear. A team must decide which obligations block release and require the corresponding checks. A warning that no one consumes is an open obligation, even when the application builds.

## Three axes, three different obligations

Capabilities, function properties, and context providers are easy to confuse because all can appear near a function declaration. They answer different questions:

| Axis | Question | Example of a missing guarantee |
|---|---|---|
| Architectural capability | Is this operation permitted here? | Permission to write does not establish atomicity |
| Function property | What kind of computation does the body perform? | Being pure does not establish that a formula is correct |
| Context dependency | Which provider must be supplied? | Receiving a database provider does not establish authorization |

The [orthogonality reference](/docs/architecture-types/orthogonality) explains the distinction. A robust design uses the axes together and adds the contracts they do not express.

Consider durable publication. Declaring access to a database and object store does not show that a published version is readable after a crash. The design needs states for preparation, durable installation, commit, and read visibility. It must specify who owns provisional data, which transitions may be retried, and what happens if cancellation arrives between steps.

That state machine supplies obligations that a capability declaration alone cannot express. Tests can exercise crashes at selected boundaries; a transition proof can establish an invariant across all modeled transitions; a native correspondence check can establish which implemented operations realize them. Each answers a different part of the publication requirement.

## Lifecycle labels must follow evidence

ATS-V's lifecycle vocabulary distinguishes definitions, hypotheses, conditional results, postulates, interpretations, theorems, and retracted claims. The associated Constructive / Verifiable / Executable classification helps organize the evidence expected at different levels.

These labels are useful only when their interpretation is explicit. A postulate extends the assumption boundary. A conditional theorem retains its hypotheses. A definition introduces an object. An executable witness demonstrates a case. None becomes a universal mathematical theorem through a metadata change.

A concrete failure mode is a record of Boolean flags such as “capital lemma checked” and “threshold checked.” Proving that the conjunction of those flags implies one of the flags is logically valid. It says nothing about whether the named capital lemma or threshold is true. The proof has certified the record's Boolean structure, while a reader may mistakenly credit the underlying mathematics.

The remedy is to connect the actual mathematical objects and propositions to the evidence. The [finite KT example](/blog/ai-agents-tests-and-proofs#when-the-test-and-the-claim-agree-on-the-wrong-mathematics) shows why this matters in an agent-developed corpus. Lifecycle metadata should expose that distinction, not obscure it.

## Architectural analysis has a model boundary

ATS-V includes analyses for architectural defects and additional machinery for temporal, counterfactual, and refactoring relationships. These are useful ways to ask precise questions about a declared model.

A temporal record can represent an observer, event, or ordering. It does not establish that a production event occurred at the recorded physical time. A counterfactual evaluator can compare modeled alternatives. It does not execute every alternative deployment. An analyzer can recognize a refactoring pattern and its declared preservation obligations. Recognizing the pattern is not a proof that arbitrary source code preserves all observable behavior.

This boundary is particularly important for AI agents. An agent can produce plausible metadata for all these concepts. The important result is the evidence obtained from the checked model and its connection to the implementation, not the volume of annotations generated.

For stateful systems, preservation often has a temporal form: equivalent states must remain equivalent after every permitted action. Equal output at the current instant is weaker. Such requirements belong in transition semantics and proof obligations, alongside the architectural declarations that make them discoverable.

## Audit reports are structured evidence, not a blanket verdict

Commands such as `verum audit --bundle` collect results from configured gates. A consumer should inspect which gates ran, what they checked, which artifacts they used, and which results were missing, unavailable, or conditional. A Boolean summary cannot expand the scope of the underlying checks.

A useful audit record connects:

1. The declared requirement and its formal statement.
2. Assumptions, supported semantics, and unresolved obligations.
3. Source, dependency, configuration, and artifact identities.
4. The checker, its result, and any replayable proof.
5. Implementation correspondence and runtime evidence where required.

This is a review discipline, not a promise that every current audit export already supplies that entire chain. The [audit protocol](/docs/architecture-types/audit-protocol) and [verification pipeline](/docs/architecture/verification-pipeline) describe individual facilities. Release policy must be based on their actual scope.

A signature can preserve the provenance of a report without making its claims true. Repeating the same check can confirm reproducibility without adding an independent specification. Running several agents can improve review while leaving a shared assumption untouched. Independence comes from the evidence and method, not merely the number of participants.

## The direction: less annotation, stronger correspondence

The desired developer experience is to state architectural intent at a meaningful boundary and have the platform derive the routine obligations. Call-graph summaries should compose; reusable contracts should avoid repeated boilerplate; changes should invalidate only the evidence they affect; diagnostics should show a counterexample or the exact missing premise.

For an agent-written change, the review should make it easy to see whether the agent changed the implementation, weakened the requirement, added an assumption, or bypassed a check. Those are different operations and must remain distinguishable even when all produce syntactically valid code.

Verum has pieces of this workflow: structured architectural declarations, body analysis, contract and theorem checking, explicit proof metadata, and scoped external replay. Complete inference across arbitrary language and foreign-code boundaries, comprehensive temporal correspondence, and an automatic artifact-bound proof chain remain broader goals.

Architecture as types succeeds when a requirement remains enforceable through an ordinary refactor, a generated patch, a compiler transformation, and a release. Diagrams, design discussion, tests, and operational judgment still matter. The language's contribution is to make more of their conclusions precise, reusable, and difficult to silently discard.

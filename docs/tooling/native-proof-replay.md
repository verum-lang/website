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

## Untrusted inputs and limits

Use the process adapter for untrusted artifacts. It starts a fresh child before parsing terms, clears inherited environment variables and reaps the child on completion, error or timeout. The parent validates the worker report and checks its logical profile and checker identity.

The admission policy limits input to 1 MiB, term and universe nodes to 4096 and structural depth to 64. JSON decoding also retains its recursion limit. The worker has a five-second wall deadline, a three-second CPU limit, a bounded stack and output size, and a 512 MiB memory termination threshold. Unix systems supporting address-space limits also enforce that limit. macOS uses sampled resident-memory monitoring: the threshold may be exceeded between samples and is not an instantaneous allocation guarantee. Deployments requiring a hard aggregate memory boundary must additionally constrain the worker service at the OS/container level. Unsupported process-limit configurations do not silently fall back to unbounded replay.

A process timeout, exhausted budget, crash or unavailable worker means **inconclusive**. It does not mean the theorem is false. Structural limits alone do not bound normalization cost; untrusted input must not be sent directly to the in-process replay function.

## Scope of the evidence

Acceptance concerns exactly the formal judgment supplied. It does not certify that a prose theorem was translated correctly, that a runtime program implements a mathematical model, or that external citations and graph edges are valid premises. Source elaboration and imported theories require separate contracts and evidence.

A knowledge system should bind replay results to the exact source artifact, revision and checker. Changed bytes require another replay. Imported JSON claiming successful verification must never be trusted in place of running the checker. Dependency currency and proof validity are separate properties: a proof of one exact statement does not justify an edited one.

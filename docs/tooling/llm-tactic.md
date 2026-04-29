---
sidebar_position: 17
title: LLM tactic protocol
---

# `verum llm-tactic` — LCF-style fail-closed LLM proof proposer

Verum is the first proof assistant where LLM assistance is
guaranteed sound *by construction*.  An LLM may propose tactic
sequences for any goal, but the proposal is **always re-checked by
the kernel** before being committed.  If the kernel rejects any
step, the proposal is discarded and the audit trail records the
rejection.

The LLM never short-circuits the kernel.  This is the LCF
principle, generalised: every term is kernel-checked regardless of
who / what proposed it.

## Mental model

The protocol has four pieces:

1. **Goal summary** — a typed projection of the focused proof
   state (theorem name + proposition + hypotheses + lemmas in
   scope + recent tactic history + framework axioms in scope).
2. **LLM adapter** — proposes a tactic sequence for the goal.
   Returns the model id + a hash of the prompt + a hash of the
   completion + the parsed tactic sequence.
3. **Kernel checker** — re-checks every proposed step against the
   goal.  Fail-closed: any step the checker can't *prove* is sound
   is rejected.
4. **Audit trail** — append-only event log keyed by model id +
   prompt hash + completion hash so every proof is reproducible
   from the log.

`verum llm-tactic propose` orchestrates one round of the protocol
end-to-end.

## Subcommand reference

```bash
verum llm-tactic propose --theorem <T> --goal <G> \
                         [--lemma name:::signature]… \
                         [--hyp name:type]… \
                         [--history step]… \
                         [--model <ID>] \
                         [--hint <TEXT>] \
                         [--persist] [--audit <PATH>] \
                         [--format plain|json]

verum llm-tactic audit-trail [--audit <PATH>] [--format plain|json]

verum llm-tactic models [--format plain|json]
```

### `propose`

Run one round: ask the configured adapter for a tactic sequence;
re-check every step with the kernel; emit the verdict.

```bash
$ verum llm-tactic propose \
    --theorem succ_pos_thm \
    --goal "succ(x) > 0" \
    --lemma "succ_pos:::forall x. x > 0 -> succ(x) > 0" \
    --hint "intro
apply succ_pos
auto"
Theorem      : succ_pos_thm
Goal         : succ(x) > 0
Model        : mock
Prompt hash  : 3ac10fee5b9d4a3a699af43b61366a8119d7906ae1adc36d454807b1031794fd

Verdict      : ACCEPTED (3 step(s) kernel-checked)
```

A garbage proposal:

```bash
$ verum llm-tactic propose --theorem t --goal P \
    --hint "completely_invalid_step"
Verdict      : REJECTED
  failed at step #1
  reason : unrecognised tactic shape 'completely_invalid_step' …
```

(Kernel rejection produces non-zero exit; CI catches this
automatically.)

### `audit-trail`

Read every recorded event from disk:

```bash
$ verum llm-tactic audit-trail --format json
{
  "schema_version": 1,
  "path": "target/.verum_cache/llm-proofs.jsonl",
  "count": 4,
  "events": [
    { "kind": "LlmInvoked", "model_id": "mock", "theorem": "thm_0",
      "prompt_hash": "...", "completion_hash": "...",
      "tactic_count": 2, "elapsed_ms": 0, "timestamp": 1714478400 },
    { "kind": "KernelAccepted", "model_id": "mock", "theorem": "thm_0",
      ..., "steps_checked": 2, "timestamp": 1714478400 },
    ...
  ]
}
```

Every event carries the **model_id + prompt_hash +
completion_hash** so the proof is reproducible: re-running the
adapter with the same prompt should produce the same completion,
which the kernel re-checks identically.

### `models`

Lists available adapters:

```bash
$ verum llm-tactic models
Available LLM tactic adapters (V0):

  mock
    Deterministic mock adapter — returns a canned tactic sequence.
    Used for tests + golden-CI shape pinning.
  echo
    Echo adapter — emits the user-supplied --hint text as the tactic
    sequence.  Useful when you have a pre-computed sequence and want
    the LCF-style kernel re-check loop without an actual model in the
    loop.

Production cloud / on-device adapters plug in via the same trait
without CLI changes.
```

## The four event kinds

Every protocol round produces 1–2 audit events:

| Event | When |
|---|---|
| `LlmInvoked` | The adapter was queried and returned a proposal (regardless of kernel outcome). |
| `KernelAccepted` | The kernel re-checked every step successfully. |
| `KernelRejected` | The kernel rejected at least one step (carries `failed_step_index` + `reason`). |
| `ProtocolError` | The adapter itself errored (transport / config / refusal). |

Successful rounds emit `LlmInvoked` + `KernelAccepted`.  Rejected
rounds emit `LlmInvoked` + `KernelRejected`.  Adapter failures emit
just `ProtocolError`.

## Validation contract

| Rule | Error |
|---|---|
| `--theorem` empty | `--theorem must be non-empty` |
| `--goal` empty | `--goal must be non-empty` |
| `--format` not `plain`/`json` | `--format must be 'plain' or 'json'` |
| `--lemma` malformed (no `:::`) | `--lemma must be 'name:::signature'` |
| `--hyp` malformed (no `:`) | `--hyp must be 'name:type'` |
| Kernel rejected the proposal | non-zero exit, `kernel rejected the LLM proposal` |

## Persistence

By default the audit trail stays in memory for the duration of one
`propose` call.  Pass `--persist` to flush events to disk:

```bash
verum llm-tactic propose --theorem foo --goal P \
    --persist --audit target/.verum_cache/llm-proofs.jsonl
```

Without `--audit`, the default path is
`target/.verum_cache/llm-proofs.jsonl` (relative to the project's
manifest directory).

## The fail-closed contract

The protocol's defining invariant: **the kernel verdict is
authoritative**.  No matter what the LLM proposes, no matter what
the audit trail says, the only way to commit a tactic sequence to
your proof body is for the kernel to accept every step.

This means:

- A buggy LLM (hallucinating tactics that don't exist) always
  produces `KernelRejected` events.  The proof body is unchanged.
- A malicious adapter (trying to inject `apply axiom_of_choice` to
  prove `False`) cannot succeed unless `axiom_of_choice` is already
  a legitimate framework citation in scope — at which point the
  user is responsible for that trust.
- A network failure (cloud LLM unreachable) produces a
  `ProtocolError` event.  The proof body is unchanged; the user
  can retry or switch adapters.

In every failure mode, **the kernel is the source of truth**.

## Local vs. cloud

V0 ships two reference adapters (`mock` for tests, `echo` for
hand-fed sequences).  Production adapters land via the same trait
surface:

- **Local on-device** — `llama.cpp`-style integration, fully
  offline.  Suitable for sensitive proofs that can't leave the
  user's machine.
- **Cloud** — opt-in HTTP adapter with API-key configuration via
  `verum.toml [llm]`.  Audit trail captures the model id +
  hash-of-prompt + hash-of-completion so the proof remains
  reproducible without sharing the prompt itself.

Either adapter goes through the **same** kernel re-check, so you
get the same soundness guarantee whether the proof was proposed by
GPT-4o, a 7B-parameter local Llama, or a hand-fed hint.

## CI usage

Pin the audit-trail event-count for a regression-test corpus so a
future LLM regression surfaces immediately:

```bash
# After running `verum verify` on the corpus with LLM-tactic enabled:
EXPECTED_ACCEPTS=42
ACCEPTS=$(verum llm-tactic audit-trail --format json \
          | jq '[.events[] | select(.kind == "KernelAccepted")] | length')
[ "$ACCEPTS" -eq "$EXPECTED_ACCEPTS" ] || exit 1
```

The audit trail is also the baseline for **proof-history
auditing**: a reviewer can run `verum llm-tactic audit-trail` to
see exactly which steps were proposed by which model, enabling
informed trust decisions about LLM-assisted proofs in the corpus.

## Cross-references

- **[Tactic catalogue](/docs/tooling/tactic-catalogue)** — the
  combinator surface every proposed tactic must respect.
- **[Proof drafting](/docs/tooling/proof-drafting)** — non-LLM
  ranked-suggestion path; useful for IDE hover panels where you
  don't want a model in the loop.
- **[Proof repair](/docs/tooling/proof-repair)** — when the kernel
  rejects, ask the repair engine for ranked structured fixes.
- **[Verification → counterexamples](/docs/verification/counterexamples)**
  — when SMT returns SAT on a kernel-rejected step, the model is
  the failure detail.

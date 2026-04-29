---
sidebar_position: 1001
title: Changelog
description: Per-release notes and migration guidance.
slug: /changelog
---

# Changelog

Format: Keep a Changelog.
Version scheme: semver.

Prior release numbers (0.01.0 → 0.32.0) tracked internal phase
milestones during the pre-1.0 implementation; they are retained below
as historical record. The first public version is **0.1.0**.

## [Unreleased]

### Added — `verum proof-repl` live proof REPL with stepwise feedback (#75) (2026-04-29)

Non-interactive batch driver for the proof-REPL state machine.
Apply tactics, navigate with `undo` / `redo`, request hints, and
emit the proof tree as Graphviz DOT — all from the shell, with
full kernel-grade feedback on every step.

Two subcommands:

- `verum proof-repl batch --theorem T --goal G [--lemma ...]
  [--commands FILE] [--cmd LINE]… [--format plain|json]` — run a
  command script.
- `verum proof-repl tree --theorem T --goal G [--lemma ...]
  [--apply STEP]…` — apply a sequence of tactics and emit the
  resulting proof-tree DOT.

Command-script syntax: one command per line; `apply <tactic>` (or
bare `<tactic>` for ergonomics), `undo` / `redo` / `status` /
`show-goals` / `show-context` / `visualise` / `hint [N]`; `#` and
blank lines are skipped.

Every command produces a typed response carrying the snapshot of
the new state plus the kernel verdict.  Rejected steps do NOT
mutate the state — the LCF fail-closed contract carries through.
Non-zero exit on any kernel rejection (CI-friendly).

Interactive TUI is a future extension; the protocol shape ships
today so IDE / CI / shell consumers can integrate against the
stable JSON schema.

Full guide:
**[Tooling → Proof REPL](/docs/tooling/proof-repl)**.

### Fixed — `InterpreterConfig.timeout_ms` wall-clock budget (2026-04-29)

Closes the inert-defense pattern around the documented VBC
interpreter wall-clock budget. The field was declared,
defaulted to 0 (no timeout), and never read — adversarial
bytecode could spin past the configured budget regardless of
caller intent.

Wire at the entry of `dispatch_loop_table_with_entry_depth`:
when the field is non-zero, capture the deadline as
`Instant::now() + Duration::from_millis(timeout_ms)`. Sample
every 256 instructions (matching the existing cancel-flag
cadence) to bound the cost of `Instant::now()` calls; on
breach surface as `InstructionLimitExceeded` with `limit = 0`.
Reusing the existing error variant keeps caller-side triage
uniform across both budgets.

### Fixed — `CompilerConfig.{debug_info, optimization_level}` forwarded to VBC codegen (2026-04-29)

Two `CompilerConfig` fields had documented defaults but no
code path forwarded them to VBC codegen. `compile()` always
called `VbcCodegen::new()` which used the codegen's own
defaults (`debug_info: false`, `optimization_level: 0`)
regardless of caller intent.

Wire by constructing a `CodegenConfig` template with the
forwarded values and using `VbcCodegen::with_config(...)`
per-module.

### Added — `verum llm-tactic` LCF-style fail-closed LLM tactic protocol (#77) (2026-04-29)

Verum is now the first proof assistant where LLM assistance is
guaranteed sound *by construction*. An LLM may propose tactic
sequences for any goal, but the proposal is **always re-checked by
the kernel** before being committed.  If the kernel rejects any
step, the proposal is discarded and the audit trail records the
rejection.

Three subcommands:

- `verum llm-tactic propose --theorem <T> --goal <G> [--lemma ...]
  [--hyp ...] [--history ...] [--model <ID>] [--hint <TEXT>]
  [--persist] [--audit <PATH>] [--format plain|json]` — run one
  protocol round.
- `verum llm-tactic audit-trail [--audit <PATH>] [--format ...]`
  — read every recorded event.
- `verum llm-tactic models [--format ...]` — list available
  adapters.

Every audit-trail event carries the `model_id` + blake3 prompt
hash + blake3 completion hash, so the proof is reproducible from
the log alone.  Four event kinds: `LlmInvoked`, `KernelAccepted`,
`KernelRejected` (with `failed_step_index` + `reason`),
`ProtocolError`.

V0 ships two reference adapters: `mock` (deterministic, for tests)
and `echo` (emits a user-supplied `--hint` verbatim, useful when
you have a pre-computed sequence and want the kernel re-check loop
without an actual model in the loop).  Production cloud /
on-device adapters plug in via the same trait surface without CLI
changes.

The fail-closed contract: regardless of what the LLM hallucinates,
the kernel verdict is authoritative.  No proof body is ever
modified without the kernel accepting every step.

Full guide:
**[Tooling → LLM tactic protocol](/docs/tooling/llm-tactic)**.

### Fixed — `CommonPipelineConfig.smt_timeout_ms` reaches contract phase (2026-04-29)

Closes the inert-defense pattern around the documented
session-level SMT budget. `run_common_pipeline` invoked
`ContractVerificationPhase::new()` which fell back to the
phase's own 30 000 ms default regardless of caller intent —
setting `smt_timeout_ms = 5000` in the manifest had no effect
on Z3.

Wire by constructing a `VerificationConfig` with the forwarded
timeout and using `with_config(...)` instead of `new()`. Phase
defaults for the other fields (counterexamples, protocols,
etc.) are preserved.

### Fixed — `SemanticCacheConfig.enable_cross_project` gates the persistent fallback (2026-04-29)

`enable_cross_project` (default `false`) was documented as
"Whether to enable cross-project sharing" but no code path
consulted it. The three `get_*_with_fallback` methods (types,
functions, verification results) always consulted the
persistent store when one was attached. Callers wanting strict
per-project caching had no way to opt out.

Wire as an early return at the entry of each fallback method:
when disabled, skip the persistent store entirely so the cache
behaves as a pure per-process LRU.

### Fixed — `ContextConfig` 5-field wiring on `Context::solver` (2026-04-29)

Closes the inert-defense pattern around five
`ContextConfig` fields that had documented defaults but no
code path consulted them in `Context::solver()`. Only
`timeout` was forwarded to fresh solver instances; the
other knobs (model generation, unsat-core extraction,
proof generation, memory limit, random seed) were inert at
this construction site.

Wire all five:

- `unsat_core` / `model` / `proof` → Solver Params keys
  (folded into a single `Params` value alongside the
  timeout — required because `Solver::set_params` is
  destructive).
- `memory_max_size` and `smt.random_seed` → global Z3
  params via `set_global_param` (these keys must be set
  at process scope; Solver/Config scopes silently ignore
  them per the verifier's empirical scope-discipline
  audit).

### Fixed — `PortfolioConfig.enabled` is now a kill-switch (2026-04-29)

Closes the inert-defense pattern around the portfolio toggle.
`BackendChoice::Portfolio` unconditionally invoked
`solve_portfolio`, so a caller that set `enabled = false`
while leaving `BackendChoice::Portfolio` in place still
spawned the multi-thread Z3 + CVC5 race.

Wire as a kill-switch at the entry of `solve_portfolio`: when
disabled, fall back to `solve_auto` (single-backend
heuristic-driven routing).

### Fixed — `ProofGenerationConfig.enable_unsat_cores` reaches Z3 (2026-04-29)

`apply_to_z3_config` only forwarded `enable_proofs`. Wired
`unsat_core` Config-level Z3 param too so every solver
constructed via `ProofGenerationConfig::with_config`
inherits the policy without per-query re-application.

### Fixed — `PatternConfig.enable_multi_patterns` + `track_effectiveness` wired (2026-04-29)

Two `PatternConfig` fields had documented defaults but no
code path consulted them in
`PatternGenerator::generate_patterns`:

- `enable_multi_patterns` (default true): when enabled and
  ≥2 simple patterns are generated, fold them into a single
  multi-pattern via `try_create_multi_pattern`.
  Multi-patterns are more selective (Z3 instantiates only
  when ALL terms appear together), reducing matching work
  for quantifiers with multiple triggers.
- `track_effectiveness` (default true): when disabled, skip
  `stats.record_pattern_generation` so callers in hot-path /
  latency-sensitive contexts don't pay the atomic-counter
  cost.

### Added — Solver-tuning docs + complete config-knob matrix (2026-04-29)

A new operator's manual at
[Verification → Solver Tuning](/docs/verification/solver-tuning)
covers every configurable knob in the verification stack
exhaustively: 12 config structs (`RefinementConfig`,
`QEConfig`, `InterpolationConfig`, `StaticVerificationConfig`,
`Z3Config`, `Cvc5Config`, `SubsumptionConfig`,
`BisimulationConfig`, `SepLogicConfig`, `UnsatCoreConfig`,
`ParallelConfig`, `OptimizerConfig`, `CacheConfig`),
~80 individual fields, defaults, effects, parameter-scope
discipline (Global vs Config vs Solver — empirically verified
per Z3 key), copy-paste recipes for latency-sensitive / CI /
deep-debugging / research workflows, and a "destructive
`Solver::set_params`" gotcha section. The
[architecture/smt-integration](/docs/architecture/smt-integration#configuration-knobs)
page gained a parallel "Configuration knobs" section
(complete matrix of fields + wiring scope) plus a "Solver
parameter scope discipline" section that documents which
of the three Z3 scopes honours each key, based on empirical
audit results. The
[verum.toml reference](/docs/reference/verum-toml) gained a
new `[verify.solver]` schema with sub-tables for every
backend / phase / cache config, plus a recap diagram of how
manifest values reach Z3/CVC5 solver params through the
five-layer chain. Closes the user's "documentation must be
predельно полной и не требовала от разработчиков искать
дополнительные ресурсы" requirement.

### Added — `verum foreign-import` foreign-system theorem import (#85) (2026-04-29)

Inverse of `verum export`: reads a Coq / Lean4 / Mizar / Isabelle
source file and emits a Verum `.vr` skeleton with one
`@axiom`-bodied declaration per imported theorem, attributed back
to the source via `@framework(<system>, "<source>:<line>")`.

```bash
verum foreign-import --from <coq|lean4|mizar|isabelle> <FILE> \
                     [--out <PATH>] [--format skeleton|json|summary]
```

Per-system V0 statement-level extractors recognise the canonical
keywords: Coq's `Theorem` / `Lemma` / `Corollary` / `Axiom` /
`Definition`, Lean4's `theorem` / `lemma` / `axiom` / `def`,
Mizar's `theorem` / `definition`, Isabelle's `theorem` / `lemma` /
`axiomatization`.  Comments are stripped before extraction.

Three output formats: `skeleton` (default — a copy-paste-able
`.vr` source), `json` (structured payload for tooling pipelines),
`summary` (human-readable count + name list).

Bidirectional reproducibility: a theorem proved in Verum can be
exported to Lean; a theorem proved in Lean can be imported to Verum
and (re-)proved by Verum's kernel.  Disagreement at any step is a
bug somewhere in the chain.

Full guide:
**[Tooling → Foreign-system import](/docs/tooling/foreign-import)**.

### Added — `verum doc-render` auto-paper generator (#84) (2026-04-29)

A Verum corpus IS a formal proof AND a paper draft. Pre-this-tool a
project had to maintain `paper.tex` alongside the `.vr` corpus —
two sources of truth, manual sync risk. `verum doc-render` makes
the corpus the single source of truth: walks every public
`@theorem` / `@lemma` / `@corollary` / `@axiom` declaration,
projects each into a typed `DocItem`, and emits Markdown / LaTeX /
HTML directly from the parsed AST + docstrings.

Three subcommands:

- `verum doc-render render [--format md|latex|html] [--out PATH] [--public]`
- `verum doc-render graph [--format dot|json] [--public]`
- `verum doc-render check-refs [--format plain|json] [--public]`

Reproducibility envelope: every rendered statement carries an
optional closure hash (from the closure-cache) so readers can
re-verify via `verum cache-closure decide`.

Future per-format adapters (LaTeX-with-proof-tree-collapse,
HTML-with-MathJax, Markdown-with-Mermaid-graphs) plug in without
changing the user-facing CLI.

Full guide:
**[Tooling → Auto-paper generator](/docs/tooling/auto-paper)**.

### Added — closure-cache wired into `verum verify` pipeline (#88) (2026-04-29)

The closure-cache is now wired into the theorem-proof pipeline.
Theorem proofs whose closure hash + Ok-verdict are already cached
are skipped without invoking the SMT/kernel re-check.

CLI flags:

- `verum verify --closure-cache` — opt in.
- `verum verify --closure-cache-root <PATH>` — override default
  `<input.parent>/target/.verum_cache/closure-hashes/`.

Verify run summary now includes a cache-hit-ratio line:

```
Closure cache: 138 hit(s), 4 miss(es), 97.2% hit-ratio
```

The `[verify]` block in `verum.toml` accepts the same knobs:

```toml
[verify]
closure_cache_enabled = true
closure_cache_root = "/nfs/verum-cache/main"
```

CLI flags always override the manifest. Persist failures don't
poison the verdict — a cache write error is reported but the
freshly-computed verdict is still returned authoritatively.

### Added — closure-hash incremental verification cache (#79) (2026-04-29)

Per-theorem `(fingerprint → verdict)` cache enabling skip-mode
verification. The closure fingerprint is a blake3 hash over
(kernel_version + theorem signature + proof body +
sorted+deduped `@framework` citations).  Kernel-version drift
invalidates ALL caches unconditionally — the trust boundary has
shifted.

Cache decisions are typed: a recheck always cites a specific
cause (`no_cache_entry` / `fingerprint_mismatch` /
`kernel_version_changed` / `previous_verdict_failed`).  No silent
fall-through.

Inspector / control surface: `verum cache-closure
{stat,list,get,clear,decide}` — five subcommands giving IDE / CI
programmatic access.

Disk format: one JSON file per theorem under
`target/.verum_cache/closure-hashes/`.

Full guide:
**[Tooling → Incremental cache](/docs/tooling/incremental-cache)**.

### Added — industrial-grade tactic combinator catalogue (#76) (2026-04-29)

Single source of truth for Verum's 15 canonical tactic combinators
(`skip` / `fail` / `seq` / `orelse` / `repeat` / `repeat_n` / `try`
/ `solve` / `first_of` / `all_goals` / `index_focus` /
`named_focus` / `per_goal_split` / `have` / `apply_with`) and their
12 algebraic laws.

CLI surface:

- `verum tactic list [--category C] [--format plain|json]`
- `verum tactic explain <name> [--format plain|json]`
- `verum tactic laws [--format plain|json]`

Every catalogue entry carries a stable `doc_anchor` consumed by the
auto-paper generator. Five categories (identity / composition /
control / focus / forward) used for output grouping.

Stdlib extension: `core.proof.tactics.combinators` gains `solve`,
`case_focus`, `per_goal_split`; new `core.proof.tactics.forward`
ships `have` / `apply_with` for Lean / SSReflect-style forward
chaining.

Composite catalogues (cubical / stochastic / domain-specific) plug
in alongside the default catalogue without forking.

Full guide:
**[Tooling → Tactic catalogue](/docs/tooling/tactic-catalogue)**.

### Added — `verum proof-repair` structured repair-suggestions CLI (#87) (2026-04-29)

Surfaces ranked drop-in code-snippet repairs for nine typed
failure kinds (refine-depth / positivity / universe /
fwax-not-prop / adjunction / type-mismatch / unbound-name /
apply-mismatch / tactic-open).

```bash
verum proof-repair --kind <K> [--field key=value]…
                   [--max <N>] [--format plain|json]
```

Plain output renders headline + ranked suggestions with rationale +
applicability + doc-link; JSON output suitable for IDE
code-action emission.

Full guide:
**[Tooling → Proof repair](/docs/tooling/proof-repair)**.

### Added — `verum proof-draft` ranked tactic-suggestion CLI (#73) (2026-04-29)

Given a theorem name + focused goal + available lemmas, emits
ranked next-step tactic suggestions.

```bash
verum proof-draft --theorem <T> --goal <G>
                  [--lemma name:::signature[:::lineage]]…
                  [--max <N>] [--format plain|json]
```

Drives IDE / REPL hover panels and IDE completion of obligation
next-steps. Full guide:
**[Tooling → Proof drafting](/docs/tooling/proof-drafting)**.

### Added — `verum verify --ladder` 13-strategy ladder dispatcher (#86) (2026-04-29)

Per-theorem `@verify(strategy)` annotations route through the
typed 13-strategy dispatcher; emits per-theorem verdicts (Closed /
Open / DispatchPending / Timeout) plus a totals summary.

```bash
verum verify --ladder [--ladder-format plain|json]
```

DispatchPending is advisory (today's reference implementation ships
end-to-end backends for 2 of 13 strategies — Runtime + Static);
Open / Timeout produce non-zero exit.  The dispatcher enforces
strict ν-monotonicity along the ladder backbone — implementing a
stricter strategy without implementing every coarser one is caught
at audit time.

Full surface in
**[Verification → CLI workflow → Ladder](/docs/verification/cli-workflow)**.

### Fixed — CLI strip / static-link flags reach the linker (2026-04-29)

Closes three inert-defense patterns at the CLI → linker boundary.
`CompilerOptions.strip_symbols`, `strip_debug`, and `static_link`
were exposed via builders + landed in the parsed options struct
but were NEVER propagated to the `LinkingConfig` that the linker
phase actually consumes. Setting `--strip-symbols`, `--strip-debug`,
or `--static-link` on the CLI had zero observable effect on the
linked binary — the linker silently used whatever the manifest
had configured.

Wired via new `apply_cli_link_overrides` free function called
immediately after the manifest-loaded `LinkingConfig` is
constructed (mirrors the existing `--lto` precedence at the same
site).

The merge is **additive** by design: a CLI flag can opt INTO a
stricter stance (strip more, link statically) but cannot turn off
a stance the manifest already enabled. This is load-bearing — the
manifest is the per-project default and the CLI is per-invocation;
allowing the CLI to flip a stance OFF would let `verum build`
accidentally undo a signed manifest's strip / static-link policy.

### Fixed — `ReplConfig.verbose` + `timeout_seconds` are load-bearing (2026-04-29)

Closes two inert-defense patterns at the JIT-REPL session boundary.
Both fields were documented but no code path consulted them;
toggling either had zero observable effect.

`verbose` (default `false`) — wired in `ReplSession::eval` to emit
a structured tracing event on entry naming the session id, eval
number, and input byte count. Default-off keeps the production
hot path free of tracing overhead.

`timeout_seconds` (default `0` = no timeout) — wired at the start
of `eval`: when nonzero and `created_at.elapsed()` exceeds the
configured budget, `eval` rejects with a typed
`MlirError::ReplError` whose message names the field, the
configured budget, and the actual elapsed time so callers can
attribute the failure correctly. The "0 = no timeout" sentinel
preserves the existing unbounded behaviour for default sessions.

### Fixed — Enterprise `AccessControl.require_signature` enforces policy (2026-04-29)

Closes the inert-defense pattern around the enterprise signature-
verification gate. The field was documented as "Require signature
verification", parsed from `enterprise.toml`, and asserted in
default-construction tests, but no code path consulted it.
Enterprises that set the flag in their config would still install
unsigned cogs because `EnterpriseClient::is_cog_allowed` only
checked the allow / deny lists.

Wired via two new methods on `EnterpriseClient`:

- `requires_signature() -> bool` — public read accessor surfacing
  the configured stance so install / publish flows can branch on
  the policy without re-reading `EnterpriseConfig` internals.
- `is_cog_allowed_with_signature(cog_name, has_valid_signature) ->
  bool` — combined check that runs the existing name-only check
  first and then enforces the signature requirement when the
  policy demands it.

The signature gate is ADDITIVE: it doesn't bypass the deny list,
and an unsigned cog that fails the name-only check is still
rejected without consulting signature state. The pre-existing
`is_cog_allowed(&str)` continues to work for callers that don't
have signature info yet — they call `requires_signature()` to
decide whether to look up signature state before proceeding.

### Fixed — `ProofGenerationConfig.minimize_unsat_cores` + `extraction_timeout_ms` reach the Z3 Solver (2026-04-29)

Closes two inert-defense patterns at the proof-extraction boundary.
Both fields were documented Z3 controls but no code path forwarded
them to the Solver — toggling either had zero observable effect on
extraction behaviour.

`minimize_unsat_cores` is the `smt.core.minimize` Z3 param —
Solver-level (not Config-level) so it can't ride on the existing
`apply_to_z3_config` path. When true, the solver runs additional
minimization on the unsat core before returning it, producing
tighter explanations at extra solver cost.

`extraction_timeout_ms` is the `timeout` Z3 param. The "0 = no
timeout" semantic is preserved by OMITTING the param entirely when
the field is zero — Z3 interprets `timeout=0` as "fire immediately"
on some param paths, which would defeat the documented unbounded
behaviour. Saturating clamp via `min(u32::MAX as u64) as u32`
prevents silent overflow on hostile / pathological config (~49
days of milliseconds, well past anything Z3 would honour).

Wired via new `apply_to_z3_solver(&Solver)` method, parallel to
the existing `apply_to_z3_config(&mut Config)`. Callers running
proof-extraction work invoke this on the Solver they're about to
query so the per-call resource budget actually reaches the solver.

### Fixed — `ValueTrackingConfig` is fully load-bearing (2026-04-29)

Closes four inert-defense patterns at once — the entire
`ValueTrackingConfig` struct in `verum_cbgr::value_tracking` was
documentation-only. `ValuePropagator::new` ignored it; the
`track_concrete_values` consumer ran with hard-coded behaviour;
setting any field had zero observable effect.

`ValuePropagator` now owns the config (new `with_config(config)`
constructor + `config()` accessor) and threads three independent
per-domain gates through every transfer function:

- `enable_constant_propagation` — gates concrete-value writes in
  `propagate_constant`, the constant fast-path inside
  `propagate_binop`, and the merge-into-concrete path in
  `propagate_phi`.
- `enable_range_analysis` — gates the range-refinement branch in
  `propagate_binop`.
- `enable_symbolic_execution` — gates symbolic-mirror writes in
  `propagate_constant`, `propagate_binop`, and `propagate_phi`.

Independence is load-bearing: callers can opt out of any single
domain (e.g. disable symbolic execution to halve memory traffic
when only constant folding is needed) without losing the others.

`max_iterations` flows through `track_concrete_values_with_config`
(new entry-point) to cap the worklist walk on pathological CFGs;
the existing `track_concrete_values()` keeps working unchanged via
delegation to the configured form with `ValueTrackingConfig::default()`.

### Fixed — `MonoPhaseConfig.use_stdlib` + `num_threads` are load-bearing (2026-04-29)

Closes two inert-defense patterns at the monomorphization-phase
boundary.

`use_stdlib` (default `true`) — documented as gating the stdlib
precompiled-specialization lookup, but `MonomorphizationPhase::execute`
always installed the stdlib resolver if one was provided via
`with_core`. Setting `use_stdlib = false` had no observable effect.
Wired at the resolver-installation site: false now skips the
`with_core` call even when a stdlib module is present, letting
embedders measure the precompiled-cache hit cost or force every
specialization through the user pipeline (useful for differential
testing of the specializer against the cache).

`num_threads` (default `0 = auto`) — documented as the parallel
specialization worker count, but the parallel path always used
rayon's global default pool. Now a bespoke
`rayon::ThreadPoolBuilder` is constructed when nonzero and the
parallel iterator runs inside `pool.install(...)` so worker spawns
honour the configured count. Zero preserves the global-pool path.
The bespoke pool is the right knob for CI workers that limit
cross-build interference, measurement runs that want fixed worker
counts, and embedders that share rayon with other systems.

A new `MonoPhaseError::ParallelExecution(String)` variant carries
the rayon error message + configured worker count for triage when
`ThreadPoolBuilder` construction fails.

### Fixed — `CodegenConfig.validate` runs the structural validator (2026-04-29)

Closes the inert-defense pattern around the codegen-time VBC
validator gate. The field defaulted to `true` and exposed
`with_validation()` builder, but no code path consulted it — so
the documented "validate the freshly-built module before returning"
contract was a no-op. A codegen regression that produced malformed
VBC would slip through here unchecked, surfacing far later as an
interpreter panic or serializer error far from the codegen site.

`finalize_module` now invokes `validate::validate_module(&module)`
(strict mode) after `build_module()`. Validator failures surface as
`CodegenError::internal` carrying the module name and the underlying
diagnostic text. Default-on means every codegen pipeline now gets the
structural-invariant safety net for free; the gate honours an opt-out
(`config.validate = false`) for callers that have already validated
upstream and want the zero-cost hot path back.

### Fixed — `CrashReporterConfig.app_name` flows into every report surface (2026-04-29)

Closes the inert-defense pattern around the documented embedder-
rebrand vector. The field was documented as "Human-readable
application name" and the diagnostics docs explicitly promised that
"Downstream tools that embed the compiler should install with an
`app_name` ... appropriate to them so their crash surfaces point users
at the right bug tracker." But no code read the field — embedders
that set `app_name = "myapp"` would still see "Verum crash report" in
the .log header, "verum:" on stderr, and "the Verum compiler" in the
closing prose, leaving the docs claim a lie.

The configured `app_name` now flows into five user-facing surfaces:

- `=== {app_name_titlecased} crash report ===` log header (first
  letter title-cased automatically — `myapp` → `Myapp`).
- `Build: {app_name} {ver} (...)` line of the human report (verbatim
  casing — matches `verum --version` style).
- `app_name` field in the JSON envelope's `environment` block
  (additive, schema_version stays at 1).
- `{app_name}: internal compiler error...` stderr prefix.
- `run \`{app_name} diagnose bundle\`` hint shown after a crash.

Single config override now rebrands the whole reporter without
touching any rendering code.

### Added — `ExpansionConfig.debug_bindings` records the macro-expansion trace (2026-04-29)

Closes the inert-defense pattern around the macro-expander binding
tracker. The field was documented as "Whether to track all bindings
for debugging" with default `false`, but no code path consulted it —
the documented hook for tracing macro expansion was a no-op.

When set, the expander records six choke-point events
chronologically: `EnterQuote` / `Binding(BindingKind)` / `Reference` /
`Splice` / `Lift` / `ExitQuote`. Each event carries the binding kind
(when applicable), the identifier name, the source span, and the
quote nesting depth at the time of the event. Two public accessors
expose the trace: `debug_bindings_log() -> &List<DebugBindingEvent>`
(borrow) and `take_debug_bindings_log() -> List<DebugBindingEvent>`
(zero-clone drain). Default-off means production callers pay zero
allocation; opt-in tooling (LSP-side macro inspectors, custom
expansion harnesses, integration tests) gets a full reconstruction
of the macro-expansion timeline.

### Fixed — `ShapeConfig.max_rank` enforces the rank ceiling on every verify_* path (2026-04-29)

Closes the inert-defense pattern around the per-tensor rank ceiling.
The field was documented as the rank limit but never read by the
verifier — an analyzer initialised with `max_rank = 4` would happily
verify a rank-100 reshape, defeating the purpose of bounding the
static-analysis budget.

A new `check_rank_bound` helper now runs at the entry of every
public `verify_*` operation: matmul (both operands), elementwise
(both), broadcast (both + result rank check), reduction, transpose,
reshape (input + new_shape), and concat (every input). On overrun the
operation surfaces `ShapeError::InvalidOperation` with the
`"rank ≤ max_rank (N)"` requirement string and `"rank K"` actual,
naming the offending operation. The check is `O(1)` so tightening
the cap costs nothing at verification time.

### Fixed — `ReplConfig.max_display_size` actually truncates eval output (2026-04-29)

Closes the inert-defense pattern around the REPL output budget.
The field defaulted to 4096 but no code path consulted it — a
pathological eval (1 GB tensor stringification, loop-debugged
trace) would blow up REPL stdout regardless of caller intent.

`EvalResult::display` now truncates value text to the configured
number of *characters* (Unicode-safe via `chars().take(N)`, not
byte slicing) with a `…(truncated, N total chars)` trailer.
Char-boundary safety is load-bearing: naive byte slicing on
mixed-CJK / emoji values would panic on a multi-byte boundary.

### Fixed — `OptimizerConfig.incremental` gates push/pop scope (2026-04-29)

Closes the inert-defense pattern around the incremental-solving
toggle on `Z3Optimizer`. The flag was documented as "Enable
incremental solving" with default `true`, but `push` / `pop`
always manipulated the underlying solver scope regardless of
configuration — toggling the flag had zero observable effect.

Both methods now consult `self.config.incremental`: when the
flag is off, scope manipulation is a no-op so callers that
build the optimizer in non-incremental mode can't accidentally
rely on push/pop semantics that aren't active. The pair stays
balanced because both sides are gated identically.

A new `is_incremental()` accessor lets callers branch on the
policy without re-reading the config struct.

### Fixed — `UnsatCoreConfig.timeout_ms` reaches Z3 (2026-04-29)

Closes the inert-defense pattern around the documented 10 s
core-extraction timeout. The field was set on the config
struct but no code path forwarded it to Z3 — hostile or
pathological assertion sets could spin unbounded during core
minimization.

`create_tracked_solver` now folds the timeout into the same
`Params` value that already sets `unsat_core = true`. Both
options must arrive together because `Solver::set_params`
replaces the entire param set; two separate calls would erase
the first one. Saturates at `u32::MAX` since `Params::set_u32`
is the exposed type.

### Fixed — `ParallelConfig.enable_sharing` gates lemma exchange (2026-04-29)

Closes the inert-defense pattern around the result-sharing
toggle on the parallel SMT solver. The flag was documented as
"Enable result sharing between workers" with default `true`,
but only the more specific `enable_lemma_exchange` flag gated
the actual exchange machinery. Setting `enable_sharing = false`
had no observable effect.

Wire as the broader gate: lemma exchange is ONE form of
sharing, so disabling `enable_sharing` must also disable the
exchange channel and thread regardless of
`enable_lemma_exchange`. Both flags must be true for sharing
to be active.

Callers that disable sharing for memory or determinism reasons
(e.g. reproducible workers, no cross-talk) now get the
documented behaviour instead of silent lemma exchange.

### Fixed — `ProverConfig.verbose` emits structured tactic traces (2026-04-29)

Closes the inert-defense pattern around the verbose-output
toggle on the interactive prover. The field was documented
as "Verbose output" with a default of `false`, but no code
path consulted it — flipping the flag had no observable
effect.

`InteractiveProver::step` now emits a `tracing::info!` line
for every tactic application when `verbose = true`, naming
the tactic and the goal index out of the open-goal stack.
Useful for debugging stuck proofs interactively.

### Fixed — `JitConfig.max_cache_size` actually bounds the JIT function cache (2026-04-29)

Closes the inert-defense pattern around the documented JIT
function cache size limit. The field was set to `1024` by
default and surfaced via the builder API, but
`JitEngine::get_function`'s insert path didn't consult it —
the cache could grow without bound across long-running
JIT sessions.

The insert path now evicts the oldest entry (by
`compiled_at`) when the cache would exceed the configured
cap. The bound is a soft cap (DashMap's per-shard locking
means the size check + insert is not strictly atomic), but
long-running sessions stay well below the documented ceiling
instead of growing unboundedly.

A guard against `max_cache_size = 0` keeps the cache fully
disabled rather than evicting on every insert, matching the
"no caching" semantic callers would expect from setting the
cap to zero.

### Fixed — `HotReloadConfig` 3-field wiring: enable_migration + max_replacement_time_us + atomic_replacement (2026-04-29)

Closes three inert-defense patterns on `HotReloadConfig`. The
fields had documented defaults but no code path consulted
them:

- **`enable_migration`** (default `true`) — `register_migration`
  now rejects when disabled with a typed `HotCodeError` whose
  diagnostic names the flag. Callers can detect the policy and
  fall back to a different upgrade strategy.
- **`max_replacement_time_us`** (default 1 000 000 µs = 1 s) —
  the `replace` path now compares the elapsed replacement time
  against the configured ceiling. A breach surfaces as a
  `tracing::warn!` so callers can react (e.g. by calling
  `rollback`); the replacement itself isn't undone since the
  new code is already live and rolling back mid-call is its
  own hazard.
- **`atomic_replacement`** (default `true`) — gates the global
  cross-function replacement lock. Atomic mode (the default)
  serialises every replacement so concurrent callers always
  observe a consistent function pointer; non-atomic mode trades
  that guarantee for less head-of-line blocking when many
  independent functions reload in parallel. The per-function
  RwLock still serialises mutators of the same hot-fn, so
  non-atomic mode is safe for *distinct* function names — only
  cross-function ordering is relaxed.

Five new pin tests cover (a) the documented defaults, (b) the
register-when-enabled success path, (c) the
register-when-disabled rejection path with diagnostic-name
assertion, and (d) construction round-trips for each flag.

### Fixed — `VerificationConfig.mode` reaches the unannotated-function branch (2026-04-29)

Closes the inert-defense pattern around the phase-level
`VerifyMode` knob on the contract-verification phase. The
field was documented as the default verification strategy for
unannotated functions, but no code path consulted it: setting
`config.mode = Runtime` would still run SMT for every function
that lacked an explicit `@verify(...)` attribute.

The unannotated-function branch in `verify_function_contract`
now consults `self.config.mode`:

- `Runtime` — skip SMT entirely (mirror of `@verify(runtime)`),
  record `functions_skipped_smt` for the report.
- `Proof` / `Auto` — proceed with the SMT path (existing
  behaviour).

Two pin tests cover (a) the documented default of `Auto` and
(b) the round-trip of every variant through the phase config.

### Fixed — `Cvc5Config` 3-field wiring: preprocessing, quantifier_mode, verbosity (2026-04-29)

Closes three inert-defense patterns on `Cvc5Config`. The
fields had documented defaults but no code path forwarded
them to the underlying CVC5 solver:

- **`preprocessing`** (default `true`) — now sets CVC5's
  `preprocess-only` option (false → run full pipeline,
  true → stop after preprocessing).
- **`quantifier_mode`** (default `Auto`) — `Auto` leaves
  CVC5's heuristic in place; the four named modes
  (`None`, `EMatching`, `CEGQI`, `MBQI`) pin a single
  strategy via the `quant-mode` option.
- **`verbosity`** (default `0`, range 0-5) — sets CVC5's
  `verbosity` option directly. Saturates at 5 for higher
  inputs.

Four pin tests cover the documented defaults plus the
exhaustive enum / extreme-value round-trips.

### Fixed — `SepLogicConfig.enable_frame_inference` gates `infer_frame` (2026-04-29)

Closes the inert-defense pattern around the documented frame-
inference toggle on `SepLogicConfig`. The flag had no readers;
`SepLogicEncoder::infer_frame` always ran the full algorithm
regardless. Callers that only need entailment validity (without
the residual-frame computation) couldn't opt out for the
~30% reduction in encoder work on large heaps.

`infer_frame` now returns a typed `FrameInferenceResult::failure`
up front when the flag is `false`, with a diagnostic that names
the flag so callers can opt back in explicitly.

Four new pin tests cover (a) the documented default, (b) the
runs-when-enabled path, (c) the skipped-when-disabled path with
diagnostic-name assertion, and (d) the full default config
round-trip.

### Fixed — `TacticConfig.allow_admits` gates the `admit` / `sorry` tactics (2026-04-29)

Closes the inert-defense pattern around the `allow_admits`
flag (default `true`) on `TacticConfig`. The flag was
documented as "Allow admit/sorry tactics" but no code path
consulted it: even a verification run that explicitly opted
out (`allow_admits = false`) would still accept admitted
goals as proven.

The `apply_admit` and `apply_sorry` tactic handlers now
reject up front when the flag is `false`, with a typed error
that names the flag for diagnostic clarity. State is left
untouched so the goal stays open.

A public `set_config` / `config()` setter pair was added on
`TacticEvaluator` so callers (and tests) can change the
policy after construction without rebuilding the evaluator
state.

Six new pin tests cover the documented default, the
default-config no-fire path for both tactics, the gate-fires
path under `allow_admits = false`, and the setter round-trip.

This is the configuration that production / CI pipelines
should run under: an admitted goal is a hole, not a proof.

### Fixed — `StaticVerificationConfig.memory_limit_mb` reaches Z3 (2026-04-29)

Closes the inert-defense pattern around the documented 4 GB
memory ceiling on `StaticVerificationConfig`. The field had no
readers; setting `memory_limit_mb = Some(64)` had identical
effect to `Some(1_000_000)` because Z3 was never told.

The verifier's `verify_with_timeout` path now forwards the
value via `z3::set_global_param("memory_max_size", ...)` before
opening a fresh Z3 context. Empirically this is the correct
scope: setting `memory_max_size` on the per-solver `Params` or
on the `Config` causes Z3 to silently mis-route queries (the
key is unknown at those scopes), but at the global-param scope
the limit takes effect.

`None` means "no caller-imposed limit" — Z3 uses its native
default. Subsequent calls overwrite the global value, so the
most-recent verifier configuration wins.

Five new pin tests cover the documented default, the `None`
opt-out, the boundary-value extremes, and the construction
contract.

### Fixed — `InterpolationConfig` projection bounds reach the MBI engine (2026-04-29)

Closes the inert-defense pattern around two
`InterpolationConfig` fields that had documented defaults but
no readers:

- **`max_projection_vars` (default 100)** — model-based
  interpolation projects the input formula onto shared
  variables via Z3's quantifier-elimination tactic. The cost
  is exponential in the number of eliminated variables for
  some theories. The field now gates `project_onto_shared`:
  if the elimination set exceeds the budget, the engine
  returns a typed error before invoking the QE tactic.
- **`quantifier_elimination` (default `true`)** — when set to
  `false`, `project_onto_shared` skips the QE step and returns
  the original formula. Interpolation correctness is preserved
  on the McMillan-style `A ⇒ I` half but the precision of the
  `I ∧ B ⇒ ⊥` half degrades; callers that prefer this trade-off
  for solver tractability can now opt out.

Five new pin tests cover (a) the documented defaults, (b) the
extreme-budget construction paths, and (c) the QE-disabled
construction path.

### Fixed — `ValidationConfig.check_well_founded` rejects vacuous induction (2026-04-29)

Closes the inert-defense pattern around the `check_well_founded`
flag (default `true`) on `ValidationConfig`. The field was
documented as "Check that induction is well-founded" but no
code path consulted it, so the documented soundness contract
was a no-op.

The `validate_induction` path now rejects vacuous induction up
front: if substituting the induction variable with a probe
value leaves the property template structurally unchanged, the
variable is unused and the IH `P(n)` is syntactically identical
to the step obligation `P(n+1)` — the IH discharges the step
trivially regardless of whether `P` actually holds. The
emitted `InductionError` names the unused variable.

When the flag is `false`, the gate is bypassed and the legacy
induction logic runs unchanged (useful for callers that need
the older permissive behaviour for non-Nat-induction
experiments).

Three new pin tests exercise (a) the rejection path under the
default config, (b) the bypass path under the flag, and (c) the
default value itself.

### Fixed — `QEConfig.simplify_level` controls the simplification tactic chain (2026-04-29)

Closes the inert-defense pattern around the documented `0-3`
simplification level on `QEConfig`. The
`QuantifierEliminator::new` constructor previously hardcoded
`Tactic::new("simplify")` regardless of the configured
`simplify_level`, so the field had no effect on actual
simplification behaviour.

The level now maps to escalating Z3 tactic chains:

- **`0`** → `skip` (identity tactic — no rewriting; chosen
  because composing with `and_then` later still works
  uniformly).
- **`1`** → `simplify` only.
- **`2`** (default) → `simplify` chained with
  `propagate-values`.
- **`3` and above** → `simplify` + `propagate-values` +
  `ctx-simplify` (context-sensitive, more expensive).

Implemented via a private `build_simplify_tactic(u8)` helper
called by `with_config`; `new()` delegates to `with_config`
with the default config so both code paths honour the level.

Five new pin tests cover constructor success at each level
plus the saturate-to-max behaviour for out-of-range values.

### Fixed — `RefinementConfig.timeout_ms` now reaches the Z3 solver (2026-04-29)

Closes the inert-defense pattern around the public
`RefinementConfig.timeout_ms` knob (default 100 ms per spec).
Previously the value was held by `SubsumptionChecker` at
construction and never updated; the documented per-query
timeout had no effect on the underlying Z3 solver.

The wiring is now end-to-end:

- `SmtBackend` gains a `set_timeout_ms(&mut self, ms: u64)`
  trait method with a no-op default so legacy backends compile
  unchanged.
- `RefinementChecker::check_with_smt` and
  `verify_refinement_with_assumptions` call
  `backend.set_timeout_ms(self.config.timeout_ms)` before every
  query.
- `RefinementZ3Backend::set_timeout_ms` overrides the trait
  method and forwards to its inner
  `SubsumptionChecker::set_smt_timeout_ms`.
- `SubsumptionChecker::check_smt` configures the Z3 solver's
  `timeout` parameter via `Params::set_u32` on every fresh
  solver instance, mirroring the existing pattern in
  `QESolver::fresh_solver` and friends.

The documented "100 ms default per spec" now actually constrains
solver work; Z3 returns `Unknown` cleanly on timeout instead of
running unbounded against the host's wall clock. Five new pin
tests cover trait-default no-op, override observability, and
end-to-end timeout propagation through the bare checker.

### Fixed — function-descriptor + constant + source-map memory-amp bounds (2026-04-29)

Final pass of the descriptor-level memory-amp campaign — closes
the last remaining unbounded varint-driven `Vec` / `SmallVec`
allocations in the VBC deserializer:

- **Function descriptors** — `type_params_count` (≤ 64),
  `params_count` (≤ 256), `ctx_count` (≤ 32).
- **`Constant::Array`** — element count bounded at
  `MAX_CONSTANT_ARRAY_LEN = 1 048 576`.
- **Specialization entries** — `type_args_count` bounded at
  `MAX_SPECIALIZATION_TYPE_ARGS = 64` (matches the generic-fn
  type-param cap).
- **Source map** — `files_count` bounded at
  `MAX_SOURCE_MAP_FILES = 65 536`; `entries_count` bounded at
  `MAX_SOURCE_MAP_ENTRIES = 4 194 304` (4 M, comfortably above
  any real-module instruction-line count).

Every count consumed by `Vec::with_capacity` in the deserializer
is now bounded — a hostile `.vbc` artifact has zero paths to
reach `with_capacity(usize::MAX)` anywhere in the trust boundary.

### Fixed — inner-descriptor memory-amp bounds (2026-04-29)

Continues the descriptor-level memory-amp campaign at the
descriptor-recursion layer.  The outer descriptor counts
(type_params / fields / variants / protocols / methods) were
bounded earlier; these are the counts the same descriptors
recurse through:

- **`MAX_BOUNDS_PER_TYPE_PARAM = 64`** — protocol bounds on a
  type parameter (`fn f<T: P + Q>`).
- **`MAX_FIELDS_PER_VARIANT = 1 024`** — per-variant struct
  fields (`Some { a, b, c }`).
- **`MAX_TYPE_REF_INSTANTIATION_ARGS = 64`** — generic
  instantiation arity (`List<Int, String, …>`).
- **`MAX_FN_TYPE_REF_PARAMS = 256`** — function-type signature
  parameter count.
- **`MAX_FN_TYPE_REF_CONTEXTS = 32`** — function-type context
  list (`using [Logger, Database, …]`).

These were the last unbounded varint-driven `Vec` / `SmallVec`
allocations in the VBC deserializer trust boundary.  A hostile
descriptor recursion can no longer reach
`with_capacity(usize::MAX)` through any of these paths.

### Fixed — descriptor-level memory-amp + parse_bytecode underflow (2026-04-29)

Closes the third memory-amplification class in VBC module
deserialization, this time at the per-descriptor layer (inside
type / function descriptors, not at the module-table level
above).

Type / function / specialization descriptors carry varint-encoded
counts (`type_params_count`, `fields_count`, `variants_count`,
`protocols_count`, `methods_count`, …) that drive
`SmallVec::with_capacity` / `Vec::with_capacity` allocations.
Post the varint-canonicality fix below the largest accepted
varint is `u64::MAX`, which casts to `usize::MAX` on 64-bit —
most Rust allocators abort on `with_capacity(usize::MAX)`.  Tight
new bounds (per real-world descriptor surface):

- `MAX_TYPE_PARAMS_PER_DESCRIPTOR   = 64`     (matches the
  `ast_to_type` recursion cap that already gates the front-end)
- `MAX_FIELDS_PER_DESCRIPTOR        = 4 096`
- `MAX_VARIANTS_PER_DESCRIPTOR      = 4 096`
- `MAX_PROTOCOLS_PER_DESCRIPTOR     = 256`
- `MAX_METHODS_PER_PROTOCOL_IMPL    = 4 096`
- `MAX_DECOMPRESSED_BYTECODE_BYTES  = 1 GB`

The decompressed-size bound also closes a previously-trusted
allocation in the bytecode-section reader: a hostile compressed
section claiming `uncompressed_size = u32::MAX` would have made
the decompressor `Vec::with_capacity` ~4 GB before reading a
byte from the compressed stream.

Plus a real arithmetic-underflow fix: `parse_bytecode`'s
None-compression branch computed `section_size as usize - 1`
to subtract the algorithm byte.  For `section_size == 0` this
underflowed silently in release builds (wrapping to
`usize::MAX`).  The reader now rejects zero-size sections at
entry; subtraction afterwards is safe by precondition.  The
bytecode-section reader's offset arithmetic also moved to
`usize::checked_add` for portable overflow defense.

### Fixed — module-table memory-amp defense in VBC deserializer (2026-04-29)

Companion fix to the archive memory-amplification bounds below.
The per-module deserializer (`verum_vbc::deserialize`) had the
same class of bug: four header fields — `type_table_count`,
`function_table_count`, `constant_pool_count`, and
`specialization_table_count` — are u32 attacker-controlled
values, each used to drive a `Vec::with_capacity(count as usize)`
allocation **before** the deserializer reads a single entry.  A
64-byte hostile module header could request 500 GB-2 TB of
allocations across the four tables before the file is even
consulted past its header.

Four architectural upper bounds enforced before any allocation:

- `MAX_TYPE_TABLE_ENTRIES        = 1 048 576`
- `MAX_FUNCTION_TABLE_ENTRIES    = 1 048 576`
- `MAX_CONSTANT_POOL_ENTRIES     = 1 048 576`
- `MAX_SPECIALIZATION_TABLE_ENTRIES = 1 048 576`

Real-world Verum modules carry at most a few thousand entries
in any of these tables; 1 M is comfortably above any plausible
module while staying far below the wraparound cliff.  A new
typed `TableTooLarge { field, count, max }` error variant names
the offending field for immediate triage.

Closing the memory-amp class at the per-module boundary too
means a hostile module loaded directly (not via an archive) can
no longer amplify memory either.

### Fixed — memory-amplification defense in VBC archive deserializer (2026-04-29)

`read_archive` in `verum_vbc::archive` previously trusted four
attacker-controlled size fields from the archive header for
allocation: `module_count` (u32), `name_len` (u32 per index
entry), `dep_count` (u32 per entry), and `data_size` (u64 per
module).  A 32-byte hostile archive header could request
terabytes of allocations before the deserializer discovered the
file was too short — a memory-amplification denial-of-service.

Four architectural upper bounds are now enforced before any
allocation:

- `MAX_MODULES_PER_ARCHIVE = 65 536`
- `MAX_MODULE_NAME_BYTES   = 16 KB`
- `MAX_DEPS_PER_MODULE     = 4 096`
- `MAX_MODULE_DATA_BYTES   = 1 GB`

Each rejection error message names the offending field so triage
is immediate.  These bounds reflect "no real-world Verum archive
shipped through `cog publish` ever approaches this" — any input
that exceeds them is rejected as malformed before any allocation.

### Fixed — usize-overflow path in length-prefixed decoders (2026-04-29)

`decode_string` and `decode_bytes` in the VBC encoding layer used
unchecked `*offset + len` arithmetic for the bounds check.  With a
hostile varint length near `usize::MAX` and `*offset > 0`, the
addition wraps in release builds and the wrapped value passes the
`> data.len()` check, opening a path to read from the wrong
region.  Both decoders now use `usize::checked_add` and surface
overflow as `Eof`.  Companion fix to the byte[9]-canonicality
defense below — together they close the two known integer-class
defenses at the bytecode-decoder layer.

### Fixed — varint canonicality at the bytecode trust boundary (2026-04-29)

Tightens the `decode_varint` / `read_varint` decoders in
`verum_vbc::encoding` to reject adversarial 10-byte encodings whose
final byte sets bits 1..6.  At shift = 63 only bit 0 of byte[9] is
representable in `u64`; the previous decoders silently dropped the
upper bits via the platform's shift-out-of-range semantics, so 64
distinct invalid inputs collapsed onto `u64::MAX`.  Both decoder
surfaces now return `VarIntOverflow` for any such encoding.  The
legitimate boundary `u64::MAX` (byte[9] == 0x01) is still accepted.
Mirrors the protobuf `read_varint` Google-reference behaviour
already enforced in `core/protobuf/wire.vr`.

### Fixed — hostile-size allocation in interpreter dispatch (2026-04-29)

VBC interpreter dispatch handlers (`CbgrAlloc` in
`ffi_extended.rs`; `GpuAlloc`, `MallocManaged`, `GpuMemAlloc`,
`Free` in `gpu.rs`) used to either panic via `.unwrap()` on a
chained `Layout::from_size_align` fallback, or silently downgrade
to a 1-byte layout via `unwrap_or(Layout::new::<u8>())` while the
caller still believed they got `size` bytes (heap overflow on the
first write past byte 0; UB on the matching dealloc since
`std::alloc::dealloc` with a wrong layout is undefined behaviour).
Allocation paths now return a null pointer on layout failure
(standard malloc-fail contract); the deallocation path leaks on
layout failure rather than dealloc with a wrong layout.

### Added — UTF-8-safe text primitives in `verum_common` (2026-04-29)

`verum_common::text_utf8` consolidates six ad-hoc UTF-8 routines
into one canonical module: `clamp_to_char_boundary`, `safe_prefix`,
`truncate_chars`, `find_word_bounds`, `char_before_satisfies`,
`char_at_satisfies`.  All zero-allocation, stdlib-only
(`is_char_boundary` / `char_indices`), `O(prefix-length)`.  LSP
(`completion`, `rename`, `quick_fixes`, `diagnostics`,
`document::word_at_position`, `script::incremental`) and VBC
(`disassemble`) now delegate to the shared module — eliminates the
byte-vs-char-index bug class that had produced 13 panic / silent-
corruption sites across 8 distinct files.

### Added — VBC module-load trust boundary (2026-04-28)

A two-tier loader API with explicit trust contracts replaces the
implicit "everything is trusted" assumption that previously gated
production module loads. Closes round-1 §3.1 (hand-crafted bytecode
violating type-table invariants), round-2 §3.1 (assign to read-only
register), and round-2 §3.2 (mismatched arity calls) of the
red-team review.

**New strict entry points** in `crates/verum_vbc`:

- `deserialize::deserialize_module_validated(data)` — structural
  decode → content-hash verification → dependency-hash verification
  → per-instruction bytecode validation.
- `archive::VbcArchive::load_module_validated(name)` — same, applied
  to archive entries (handles decompression).
- `interpreter::Interpreter::try_new_validated(module)` — runs the
  validator over a pre-loaded `Arc<VbcModule>` before construction.

The lenient `deserialize_module` / `load_module` / `try_new` entry
points are preserved for in-process-emitted bytecode where the
validator's `O(N)` walk is wasted work.

**What the validator catches at load time** (instead of execution
time / silent corruption):

- Out-of-range `FunctionId` / `ConstId` / `StringId` / `TypeId`
  cross-references.
- Register references past the function's declared `register_count`.
- Branch offsets falling outside the function's bytecode region OR
  landing mid-instruction in another instruction's operand stream
  (Jmp / JmpIf / JmpNot / JmpCmp / Switch / TryBegin).
- **Call-arity mismatches**: every `Call` / `TailCall` / `CallG`
  has `args.count` checked against the target function's declared
  `params.len()`.
- Decoder failures mid-stream.
- **Content-hash tampering**: blake3 over `data[HEADER_SIZE..]`
  recomputed and matched against the header's `content_hash`.
- **Dependency-hash tampering**: the cog-distribution dependency
  graph's u64 fingerprint.

A new `InterpreterError::ValidationFailed { module_name, reason }`
variant carries forensic detail. The aggregate
`VbcError::MultipleErrors(Vec<VbcError>)` now renders with a
header line followed by indented numbered per-error entries,
exposing the full defect list to the user instead of a count-only
summary.

See **[VBC Bytecode → Module-load trust boundary](/docs/architecture/vbc-bytecode#module-load-trust-boundary)**.

### Added — `Opcode::Extended` general-purpose extension byte (2026-04-28)

Reserved opcode `0x1F` (formerly the unused `IntArith1F` slot) is
now `Opcode::Extended`. Wire format `[0x1F] [sub_op:u8]
[operands...]`. Foundation for #146 Phase 3 (`MakeVariantTyped`);
sub-op `0x00` is reserved as a forward-compat anchor that decoders
must accept and skip without breaking older interpreters.

### Added — extraction lowerers + `@extract(realize=)` directive (2026-04-27)

**`verum extract` AST-lowerer expansion**:

- Match expressions, MethodCall, Field access, Closures (no contexts /
  no async / no move), Pipeline (`|>`), Tuples + TupleIndex, Index,
  and NullCoalesce now flow through the OCaml / Lean / Coq
  partial-coverage lowerers. Each construct is emitted in idiomatic
  per-target syntax with graceful `None` fallback when a sub-shape
  exits the lowerer's vocabulary.

**`@extract(realize="<fn_name>")` directive**:

- Short-circuits the body-synthesis path. The verified surface
  signature is preserved; the emitted body is a thin wrapper that
  delegates to the named native function. Extends `@extract`,
  `@extract_witness`, and `@extract_contract` with the same
  `realize=` keyword. Lets a verified specification bind to a
  hand-written / runtime-intrinsic primitive (crypto stub,
  intrinsic wrapper, foreign syscall) without losing proof-checked
  types at the boundary.

See **[Verification → Program extraction](/docs/verification/program-extraction)**.

### Added — linter production hardening + stdlib algebra surfaces (2026-04-26)

**Linter (`verum lint`)** — promoted to 100 % production-ready.

- Lex-mask: every text-scan rule now consults a per-byte
  classification (Code / LineComment / BlockComment / String /
  RawString) so substrings inside string literals or comments no
  longer fire `deprecated-syntax`, `todo-in-code`,
  `unbounded-channel`, etc. Multi-byte UTF-8 (em-dash, CJK, math
  symbols) handled correctly — earlier the masked-view builder
  produced invalid UTF-8 on multi-byte chars in comments.
- Unified parse: per-file phase hands its parsed `Module` to the
  cross-file phase via `lint_one_with_cache → CorpusFile`,
  eliminating the second parse per file. Cache-hit entries are
  re-parsed in a single batched pass.
- `parse-error` meta-rule: parser failures surface as a structured
  diagnostic (Error / Safety) so users see when AST passes were
  skipped. Always on; cannot be suppressed.
- Structured `--fix`: `apply_fix_edits(content, &[FixEdit])` is the
  canonical edit applier (LSP-style 1-indexed ranges,
  reverse-order application, overlap detection).
  `synthesize_fix_edits_for(issue, content)` covers all 9 fixable
  rules; on-disk `--fix` and JSON `fix.edits` consumers produce
  byte-identical output. Old per-rule line-rewrite helpers
  retired.
- Streaming JSON: `--format json` (without `--baseline` / `--fix`)
  flushes each file's diagnostics as soon as that file's per-file
  phase completes — time-to-first-byte drops from corpus-latency
  to single-file-latency. Order is non-deterministic;
  schema-stable identity is `(rule, file, line, column)`.
- New CLI flags: `--watch` / `--watch-clear`, `--threads`,
  `--no-cache` / `--clean-cache`, `--baseline FILE` /
  `--write-baseline` / `--no-baseline`, `--max-warnings N`,
  `--new-only-since GIT_REF`, `--list-groups`.

Tests: 47 → 173+ lint tests across 19 test files.

**Stdlib algebra surfaces** — modules that previously shipped
only data-type definitions now ship the full algebra promised
by their doc-strings.

- `core.eval.cbpv` — `cbpv_occurs_free`, capture-avoiding
  `cbpv_substitute`, `CbpvStep` outcome type, `cbpv_step` (β /
  force-thunk / sequence-bind with congruences),
  `cbpv_normalise(t, gas)` to fixed point, `cbpv_alpha_eq`.
- `core.control.continuation` — `CcStep`, `cc_step`
  (β / reset-value / shift-capture), `cc_normalise(t, gas)`,
  `cc_alpha_eq`.
- `core.logic.linear` — `lin_to_nnf` (de Morgan + involutivity),
  `lin_negate`, `lin_is_nnf`, `lin_eq`, `lin_size`,
  `lin_atom_count`.
- `core.logic.kripke` — `valid_in_frame`,
  `semantically_equivalent`, frame-property predicates
  `is_serial` / `is_reflexive` / `is_transitive` / `is_symmetric`
  / `is_euclidean` (modal axioms D / T / 4 / B / 5), `is_s5`.
- `core.types.poly_kinds` — full Robinson `kind_unify` +
  `kind_apply` + `kind_compose`, plus `is_concrete`,
  `kind_arity`, `apply_args`, `free_vars`.
- `core.types.qtt` — `mul_quantity` (multiplicative scaling under
  λ-binders), `is_sub` (subquantity lattice
  `Zero ≤ One ≤ AtMost(n) ≤ Many`), `top_quantity` /
  `bottom_quantity`, `quantity_eq`.
- `core.meta.tactic` — recursive `meta_normalise` (bottom-up
  β-cancel + seq-elim), `meta_is_normal`, `seq_eliminate`.

**Intrinsic safety contracts** —
`core/intrinsics/arithmetic.vr` div / rem / neg / abs / mul /
wrapping_div / wrapping_rem now document panic conditions
(`b == 0`, `T::MIN / -1`, `T::MIN` for neg / abs, IEEE 754 float
behaviour) per the convention set by
`core/intrinsics/memory.vr`.

### Added — wide stdlib primitive expansion (2026-04-22/23)

A large batch of reusable user-level primitives shipped across
`encoding` / `security` / `collections` / `base` / `time` /
`metrics` / `async` / `net`. Every addition carries a
typecheck-verified VCS test under `vcs/specs/L2-standard/`.

**Encoding** — `base32` (RFC 4648 §6), `base58` + `base58check`
(Bitcoin), `cbor` (RFC 8949 with canonical map sort + f16/f32/f64
widening), `msgpack`, `jcs` (RFC 8785 UTF-16 code-unit sort), `pem`
(RFC 7468 label-agnostic), `json_pointer` (RFC 6901).

**Security** — `hpke` (RFC 9180 Mode Base, DHKEM-X25519 +
ChaCha20-Poly1305), `jwt` (RFC 7519/7515 with `alg:none` rejected +
algorithm-confusion blocked), `cose` (RFC 9052 Sign1 + Mac0), `otp`
(HOTP/TOTP RFC 4226/6238), `password_hash` + `pbkdf2` (PHC modular
format, 100k-iteration floor), `merkle` (RFC 6962, CVE-2012-2459-safe
odd-leaf promotion), `token` (CSPRNG session/CSRF/OTP),
`server_identity` (RFC 6125), `hash/crc32c`, `hash/xxhash` (XXH64),
`hash/murmur3` (32 + 128-bit Cassandra-compatible).

**Collections** — `lru`, `ttl_cache`, `bloom`, `hyperloglog`,
`count_min`, `reservoir` (Vitter Algorithm R), `consistent_hash`
(Ketama-compatible).

**Base** — `snowflake`, `nanoid`, `semver`, `glob`
(`fnmatch(FNM_PATHNAME|FNM_LEADING_DIR)` semantics).

**Time** — `rfc3339` (ISO 8601 w/ Howard Hinnant date math),
`cron` (POSIX 5-field with Vixie OR-semantics).

**Metrics** — `ewma` (fixed-α + Dropwizard time-decaying +
`RateMeter` with 1/5/15-minute windows).

**Async** — `semaphore` (cooperative task limiter, RAII permit),
`backoff` (exponential / decorrelated / Fibonacci with jitter).

**Net** — `content_negotiation` (Accept / Accept-Encoding /
Accept-Language q-factor selection), `http_range` (RFC 9110 §14),
`link_header` (RFC 8288), `proxy/rate_limit` (TokenBucket +
LeakyBucket + SlidingWindow under one `RateLimiter` protocol).

**QUIC / TLS (warp stack)** — `stateless_reset` (RFC 9000 §10.3),
`cid_pool` + `CidIssuer`, `key_update` (RFC 9001 §6 + §6.6),
`address_token` (§8.1.3), `pacer` (RFC 9002 §7.7), `stats` +
`stats_prometheus`, `batch_io` (GSO/GRO/sendmmsg); TLS 1.3
`sni_resolver` (RFC 6066), `zero_rtt_antireplay` (RFC 8446 §8
with `ReplayGuard` protocol), `resume_verify`, `client_session_from_nst`,
`ticket_issuer`. HTTP/3: `h3/priority` (RFC 9218).

### Fixed — `Heap<dyn P>.method()` / `Shared<dyn P>.method()` dispatch

Smart-pointer receivers carrying a dyn-protocol payload now resolve
protocol methods through the auto-deref cascade end-to-end.

Previously `h.start_span(...)` on `h: Heap<dyn Tracer>` failed with
_"no method named `start_span` found for type `&dyn Tracer`"_ — the
cascade correctly unwrapped `Heap<dyn P>` to `&dyn P` (DynProtocol is
unsized and must live behind a reference), but the early DynProtocol
resolution branch ran **before** the cascade, so cascade-derived
`&dyn P` receivers were never matched.

The fix adds a **post-cascade** DynProtocol resolution that peels one
reference layer and serves the method from
`protocol_checker.get_method_type(bound, method)`. Combined with the
cascade, the full chain `Heap<dyn P> → &dyn P → peel → dyn P →
protocol method` now succeeds. `type_or_dyn_has_method` also peels one
reference layer so the cascade's halt condition agrees with the
resolver. No hardcoded smart-pointer list — the stdlib's
`Deref::Target` associated-type declarations drive the cascade, and
the DynProtocol's own `bounds` drive the resolution.

Regression test:
`vcs/specs/L1-core/types/dynamic/heap_dyn_dispatch.vr` covers
`Heap<dyn P>`, `Shared<dyn P>`, and direct `&dyn P` receivers.

See **[Architecture — Smart-pointer receivers calling protocol methods](/docs/architecture/module-system#smart-pointer-receivers-calling-protocol-methods)**.

### Fixed — impl-level type parameter positional alignment

`implement<I: Iterator, B, F: fn(I.Item) -> B> Iterator for MappedIter<I, F>`
no longer poisons `B` when `.next()` is invoked. The previous
declaration-order scheme.vars (`[I, B, F]`) combined with
`bind_limit = 2` (matching `for_type = MappedIter<I, F>`'s two slots)
bound `B` to the closure type, surfacing as
`Maybe<fn(Int) -> Int>` instead of `Maybe<Int>` at `.next()` call
sites — with misleading "expected Int, found fn(Int) -> Int" errors.

The fix partitions impl-level TypeVars by whether they appear in
`for_type.free_vars()` and reorders them as three blocks:

1. Impl vars **in** `for_type`, in declaration order (positional
   binding slots, `impl_var_count = block size`);
2. Impl vars **outside** `for_type` (left free, inferred from bounds
   or unification at the call site);
3. Method-level TypeVars.

Now `bind_limit = impl_var_count` aligns perfectly with
`receiver.args.len()`. Applied in both the inherent and protocol
branches of `register_impl_block_inner`.

Regression test:
`vcs/specs/L2-standard/iterator/impl_param_reorder.vr` — the
`once_with(|| 5).map(|x| x*10).next()` reproducer.

See **[Architecture — Positional-alignment reordering](/docs/architecture/module-system#positional-alignment-reordering)**.

### Added — reference-grade tactic DSL

Industrial-grade extensions to the proof-engine surface. The tactic
language now matches the expressive power expected of a modern proof
assistant (Coq/Lean tier), while remaining a natural extension of
ordinary Verum syntax.

- **Block-form combinators.** `first { t₁; t₂; t₃ }` — the block form
  specified in grammar §2.19.7 — now parses alongside the list form
  `first [t₁, t₂, t₃]`. `repeat`, `try`/`try … else`, `all_goals`, and
  `focus` already accepted block bodies; `first` now does too. Enables
  `ring_law`, `field_law`, `category_law` and the full `core/math/tactics.vr`
  strategy library (previously 284 parse errors, now 0).
- **Generic tactics.** `tactic category_law<C>() { … }` declares a
  polymorphic tactic; call sites pass explicit type arguments:
  `category_law<F.Source>()`. An optional `where` clause supports
  protocol bounds.
- **Typed parameters with defaults.** Tactic parameters accept both the
  classical kinds (`Expr`, `Type`, `Tactic`, `Hypothesis`, `Int`) and
  two new forms: `Prop` (first-class propositions) and arbitrary type
  expressions (`Float`, `List<T>`, `Maybe<Proof>`, …). Default values
  are declared with `= expr`, e.g. `oracle(goal: Prop, confidence: Float = 0.9)`.
- **Structured tactic bodies.** Tactics can bind local state, branch on
  values, and fail with diagnostics:
  - `let x: T = expr;` — monadic let-binding inside the tactic body;
  - `match scrutinee { P => tactic, … }` — pattern-directed branching;
  - `if cond { t₁ } else { t₂ }` — conditional tactic execution;
  - `fail("reason")` — explicit failure feeding into enclosing
    `try`/`first` combinators.
- **Reserved-keyword tactic names.** Users can declare tactics named
  after built-ins (`tactic assumption() { … }`, `tactic contradiction() { … }`,
  `tactic ring() { … }`, etc.) — the declaration shadows the built-in
  within its module.

The parser, AST, visitor, proof-checker, tactic evaluator, and quote
backend were updated end-to-end. New anchors in
`vcs/specs/L1-core/proof/tactics/` lock the grammar. The stdlib
parse-success count moved from 2/10 → 6/10 math modules
(`cubical`, `day_convolution`, `infinity_topos`,
`kan_extension`, `tactics`, `theory_interop.core` all parse
cleanly now).

See **[Proof DSL — `tactic` declarations](/docs/language/proof-dsl#tactic--custom-proof-strategies)**
and **[reference/tactics — User-defined tactics](/docs/reference/tactics#user-defined-tactics)**.

### Added — crash reporter and `verum diagnose`

- New `verum_error::crash` module installs a process-wide crash
  reporter at `verum` startup. It captures every panic and every
  fatal signal (`SIGSEGV`, `SIGBUS`, `SIGILL`, `SIGFPE`, `SIGABRT` on
  Unix via `sigaction` + `sigaltstack`; `SetUnhandledExceptionFilter`
  on Windows) into a paired `.log` (human) + `.json` (schema v1)
  report under `~/.verum/crashes/`. Reports include the exact
  command and cwd, a filtered environment with secret-looking keys
  redacted, the build identity (`verum` version, git SHA, profile,
  target, `rustc --version`), the thread name, a Rust backtrace, and
  a breadcrumb trail.
- New `verum_error::breadcrumb` module — a thread-local RAII trail
  mirrored to a cross-thread snapshot so the signal handler can
  include the last-known phase even when the offending thread's
  TLS is unreachable. The compilation pipeline emits breadcrumbs at
  `stdlib_loading`, `project_modules`, `load_source`, `parse`,
  `type_check`, `verify`, `cbgr_analysis`, `ffi_validation`,
  `rayon_fence`, `generate_native`, `codegen.vbc_to_llvm`, and
  `interpret`.
- New `verum diagnose` subcommand family:
  - `list [--limit N]` — index of recent reports with one-line
    summaries (kind, message, build, last known phase);
  - `show [REPORT] [--json] [--scrub-paths]` — full report to
    stdout, optionally path-scrubbed for external sharing;
  - `bundle [-o OUT] [--recent N] [--scrub-paths]` — `.tar.gz`
    suitable for attaching to an issue; a README inside the archive
    explains where to upload it;
  - `submit [--repo owner/name] [--recent N] [--dry-run]` — opens a
    new GitHub issue via `gh` CLI with the latest report summary
    pre-filled (paths scrubbed);
  - `env [--json]` — print the captured build/host snapshot;
  - `clean [--yes]` — wipe the report directory.
- New `[profile.release-debug-tables]` in the workspace
  `Cargo.toml` — inherits from `release` but keeps
  `debug = "line-tables-only"` + `split-debuginfo = "packed"` so
  crash-report backtraces resolve to `file:line`. The main binary
  size is unchanged; line tables live in an external `.dSYM` /
  `.dwp` bundle.

### Fixed — non-deterministic SIGSEGV in AOT codegen

Release builds on arm64 macOS SIGSEGV'd in ~60–70 % of
`verum build ./examples/cbgr_demo.vr` invocations, always on the
main thread, always inside LLVM pass-constructor initialisation
(`TargetLibraryInfoWrapperPass`, `CFIFixup`, `CallBase`,
`MachineDominatorTreeWrapperPass`, `GCModuleInfo` — all under
`__cxa_guard_acquire → __os_semaphore_wait`). Diagnosed via the
new crash reporter: 14/14 reports pointed at
`compiler.phase.generate_native` at 307–350 ms into the phase.

Two surgical fixes:

1. **Eager native-target init** — `verum_cli::main` now calls
   `Target::initialize_native` as its first line, before the
   stdlib parse can spawn rayon workers or the verifier can touch
   Z3. The IR-level pass registry is fully populated on the main
   thread while no other thread is alive, releasing the cxa guards
   before the fault window.
2. **Real rayon fence before LLVM** —
   `rayon::yield_now()` in `phase_generate_native` is replaced with
   `rayon::broadcast(|_| ())`, which dispatches a no-op task to
   every worker and **waits for completion**. Parked workers wake,
   run, and re-park before LLVM touches its remaining cxa guards,
   eliminating the wake-path vs lazy-init race.

100-run stress test: 0 / 100 crashes after the fix. Guarded by
`tier1_repeated_aot_build_is_stable` in
`crates/verum_cli/tests/tier_parity_e2e.rs`.

### Fixed — duplicate "Running" line in single-file run

`verum run file.vr` printed `Running <file> (interpreter)` twice —
once from `main.rs` and once from the single-file tier dispatcher.
The dispatcher's duplicate line is gone.

### Docs

- New **[Tooling → Crash diagnostics](/docs/tooling/diagnostics)** page
  covering the crash reporter, breadcrumbs, report layout, the
  `verum diagnose` commands, signal-safety caveats, and the
  `release-debug-tables` profile.
- **[Reference → CLI commands](/docs/reference/cli-commands)** now
  documents the `verum diagnose` family.
- **[Guides → Troubleshooting](/docs/guides/troubleshooting)** has a
  new "Compiler crashes" section that walks the
  *list → show → bundle → submit* flow.

## [0.1.0] — 2026-04-17 — runtime foundations, first public version

### Fixed — VBC + AOT byte-slice semantics

- `Text.as_bytes()` and `slice_from_raw_parts(ptr, len)` now produce
  proper slice values in both tiers. The VBC lowering previously
  emitted `Pack` (a heap tuple) for slices, so `.len()` returned 2
  (the tuple arity), `bytes[i]` returned an 8-byte NaN-boxed `Value`
  instead of a byte, and every CBGR slice op silently fell through
  its `is_fat_ref()` guard. New `CbgrSubOpcode::RefSliceRaw` (0x0A)
  builds a `FatRef` directly from (ptr, len) with `elem_size=1`.
  New `TextSubOpcode::AsBytes` (0x34) materialises a byte-slice
  `FatRef` from either the NaN-boxed small-string representation or
  the heap-allocated `[header][len:u64][bytes…]` layout; the codegen
  intercepts `.as_bytes()` on `Text` receivers and routes through
  this op so `self.ptr` via `GetF` (which reads the wrong offset
  for both representations) is never called at runtime.
- Matching AOT/LLVM handlers lower `TextExtended::AsBytes` (reads
  the pointer via `verum_text_get_ptr`, reads `len` from field 1 of
  the flat `{ptr, len, cap}` struct) and `CbgrSubOpcode::RefSliceRaw`
  into the standard 40-byte Pack-object slice layout, so the AOT
  `Len` / `GetE` / `IterNew` handlers already in place pick up the
  fix without further change.
- `CbgrSubOpcode::SliceGet`, `SliceGetUnchecked`, and
  `SliceSubslice` now honour `fat_ref.reserved` as the element
  stride (1/2/4/8 for raw integer arrays, 0 for NaN-boxed Values).
  Previously they hard-coded `sizeof(Value)` and walked 8 bytes per
  index, so indexing or subslicing a byte slice produced garbage.

### Fixed — variant-tag consistency

- `Maybe<T>` is declared `None | Some(T)`, so `register_type_constructors`
  assigns `None=0, Some=1` positionally. The hard-coded fallback
  table in `codegen/mod.rs` had `Some=0, None=1` — the stdlib-
  constants pass ran first and `register_function` overwrote by
  arity, so `None` ended up tagged as `1` while pattern matching
  (which derives tags from declaration order) expected `0`. Every
  `None` value silently matched `Some(x) =>` arms and bound `x` to
  uninitialised payload memory. Tags are now consistent across all
  three sites (`register_stdlib_constants`, builtin registration
  around `compile_program`, `register_type_constructors`) and the
  runtime helpers (`make_maybe_int`, `make_some_value`,
  `make_none_value`).
- Bare `None` identifiers were lowered through the `__const_` path
  to `LoadI 0` instead of `MakeVariant tag=0`. Zero-arity variant
  constructors now route through `MakeVariant` before the constant
  path.
- `TextExtended::AsBytes` handler auto-derefs both CBGR register
  references and `ThinRef` before inspecting the Text layout, so
  `s.as_bytes()` inside a function taking `s: &Text` no longer
  returns an empty slice.

### Fixed — slice method dispatch

- `implement<T> [T]` blocks register under the `Slice.*` prefix
  (because `extract_impl_type_name_from_type` maps
  `TypeKind::Slice(_)` to `"Slice"`), but the method-dispatch
  codegen was formatting `[Byte].method` as the lookup key (using
  `extract_type_name_from_ast`). The two halves of the pipeline
  disagreed; method names now get normalised so `[…].method` →
  `Slice.method` before interning.
- `core.collections.slice` was present in the AOT-retention list
  but not in the primary `ALWAYS_INCLUDE` that controls which
  stdlib modules get compiled into the VBC module at all. Added,
  so the normalised `Slice.*` lookups actually have bodies to find.
- Intercept `[T].slice(start, end)` at codegen and emit
  `CbgrSubOpcode::SliceSubslice` directly, bypassing the compiled
  stdlib body (which panics inside `Value::as_i64` when it receives
  a `FatRef` receiver via `CallM`).
- `extract_type_name` now handles `TypeKind::Slice(T) → "[T]"`
  instead of returning `None`, so method-chain inference carries
  slice-ness through calls like `s.as_bytes()` and downstream
  `.slice()` / `.get()` / `.is_empty()` dispatch can route
  correctly.

### Fixed — stdlib parsing and Text layout

- `Text.parse_int` / `Text.parse_float` route through the pure-Verum
  `parse_int_radix(10)` path instead of the legacy `text_parse_int` /
  `text_parse_float` intrinsics, whose runtime declarations returned
  `Maybe<T>` while the stdlib wrappers were typed as
  `Result<T, ParseError>`. Because `Maybe::Some(n)` has tag 1 and
  `Result::Err(e)` also has tag 1, every successful parse was read
  back as `Err(n)` — `"42".parse_int()` returned `Err`. The new
  implementation parses bytes directly with explicit error messages
  (`empty string`, `no digits`, `invalid character`, `digit out of
  range`, `trailing characters`, `missing exponent digits`).
- `Text` values have two coexisting runtime layouts under the same
  `TypeId::TEXT`:
  * static / intrinsic-built heap strings: `[header][len:u64][bytes…]`
  * stdlib builder `Text {ptr, len, cap}`: three NaN-boxed `Value`
    fields produced by `Text.new()` + `push_byte`.
  Both the `Len` opcode handler and the `TextExtended::AsBytes`
  lowering were decoding only the first case. For a fresh
  `Text.new()`, `.len()` read the null-pointer bit pattern as a u64
  and reported `9221120237041090560`; `.as_bytes()` produced a
  FatRef into random memory. Both now disambiguate by object size +
  field tags and report correct values for builder Text.

### Impact

Pure-Verum byte-level stdlib code (JSON, base64, URL, UUID, hex
decoders; regex engines; TLS framing; binary protocols) can now
parse numeric tokens and traverse bytes end-to-end in the VBC
interpreter and AOT builds. Prior to these fixes every such module
typechecked cleanly but crashed or silently corrupted data at run
time; the VCS `typecheck-pass` suites did not surface it because
they never executed the code.

Concrete known-working cases:

- `"42".parse_int()` → `Ok(42)`, `"-7".parse_int()` → `Ok(-7)`,
  `"abc".parse_int()` → `Err("digit out of range")`.
- `"hello".as_bytes().slice(1, 4)` → 3-byte slice at `"ell"`.
- `JSON.parse("42")`, `JSON.parse("true")`, `JSON.parse("\"hi\"")`,
  `JSON.parse("[1, 2, 3]")`, `JSON.parse("{}")` all return `Ok`.

### Fixed — byte-sized writes via `memset`

The generic `ptr_write<T>` intrinsic lowered to `DerefMut`, which
writes 8 bytes of a NaN-boxed `Value` regardless of `T`. Writing a
`Byte` this way corrupted seven bytes past the target. All byte-
granularity writes in the stdlib are now expressed as
`memset(ptr, byte, 1)` with an explicit 1-byte length:

- `Text.push_byte` — core of every Text builder path.
- `Text.from_utf8_unchecked` — null terminator after memcpy.
- `Text.grow()` — null-terminator maintenance when capacity expands.
- `Text.make_ascii_lowercase` / `make_ascii_uppercase` — in-place flips.

Also reconciled `core/encoding/json.vr` with the new
`Text.parse_int` / `parse_float` signatures (`Result<T, ParseError>`
after the parse-int fix). The JSON number parser was still pattern-
matching `Some(i) / None`; because `Result::Ok` and `Maybe::None`
share tag 0, every successful integer parse silently routed to the
"integer out of range" fallback. Now uses `Ok / Err` arms directly.

Known-working after this layer of fixes: `Text.new(); t.push_byte(b);`
round-trips; `t.as_bytes()` yields the written bytes.

### Fixed — Text equality + hashing for builder layout

The interpreter's `resolve_string_value`, `extract_string`,
`value_hash`, and `heap_string_content_eq` all previously decoded
only the heap-string Text layout (`[len:u64][bytes…]`). For a
builder `Text {Value(ptr), Value(len), Value(cap)}` they read the
NaN-boxed `ptr` field as a u64 length, returned garbage strings
(breaking `==`) and looped over an out-of-bounds byte count
(crashing `Map.insert`). All four helpers now disambiguate by
object size + field tags, matching the pattern used by
`handle_array_len` / `TextExtended::AsBytes`. A shared
`text_value_bytes_and_len` helper now owns the extraction.

Concrete effect:

- `built("a") == built("a")` → `true` (was `false`)
- `built("a") == "a"` and reverse → `true` (was `false`)
- `Map<Text, Int>.insert(built_key, 1)` → no crash
- `JSON.parse("{\"a\":1}")` → `Ok` (was SIGBUS)

### Fixed — `Map.iter()` + for-loop tuple destructuring + `to_text`

- `map.iter()` / `set.iter()` at the interpreter level now return
  the receiver unchanged. `IterNew` already recognises
  `TypeId::MAP` / `TypeId::SET` and builds the right
  `ITER_TYPE_MAP` iterator, so wrapping the map in a second iterator
  object (the first attempt) only confused `IterNew` into treating
  it as a list.
- `IterNext` for `ITER_TYPE_MAP` now yields `(key, value)` 2-tuples
  (heap-allocated `TypeId::TUPLE` objects) matching the shape the
  codegen destructures for `for (k, v) in …`. The same change
  applied to the method-level iterator dispatch `next` arm as a
  defensive layer.
- `is_custom_iterator_type` now recognises the stdlib iterator
  wrappers (`MapIter`, `MapKeys`, `MapValues`, `SetIter`, `ListIter`,
  …) as "builtin-like", so `for (k, v) in m.iter()` goes through the
  `IterNew` / `IterNext` path rather than dispatching to the
  uncompiled `MapIter.has_next` / `.next` stdlib methods.
- `dispatch_primitive_method` now accepts `to_text` as an alias for
  `to_string` — `Text` (not `String`) is Verum's native string type
  and the stdlib uses `.to_text()` throughout (e.g. JSON's
  `i.to_text()` for integer serialization).

Known-working: `for (k, v) in m.iter() { … }` iterates every entry
and destructures the tuple correctly; JSON stringify advances
through the object-write path without runtime errors. Serialization
still has a shallower bug (the integer value's bytes aren't being
appended to the output buffer), but the infrastructure — iteration,
method dispatch, primitive-to-text conversion — is in place.

### Fixed — `(0..N).collect()` infers from let-binding context

`let v: List<Int> = (0..10).collect();` errored with
"Type mismatch: expected 'List<Int>', found 'Int'". An earlier
path inside `infer_method_call_inner_impl` returned the *element*
type for `.collect()` on adapter-like receivers — `Range<Int>`
ended up as `Int`, which then couldn't unify with the let-binding's
`List<Int>` annotation.

Short-circuit the entire dispatch chain when the method is a
0-argument `collect()`: return a fresh type variable. Bidirectional
`check_expr` then unifies the var with whatever the let-binding
annotation supplies. With no annotation the call site is genuinely
ambiguous (which it should be); add an explicit `: T` if needed.

Removes 3 L0 `reference_system/performance` failures
(`cache_effects.vr`, `memory_overhead.vr`, `reference_locality.vr`).

### Fixed — `stabilize_ref_source` was over-eager and broke CBGR safety

Follow-up to the `&temp` ref-source stabilization: the original
deny-list ("not a named local") was too permissive and promoted
`&*heap_val` into `&fresh_copy_of_heap_val`. The freshly allocated
stable slot has no link back to the CBGR-tracked allocation, so a
subsequent `drop(heap_val); *r` returned the snapshot instead of
panicking with "CBGR use-after-free detected". Six L0 specs that
exercise the panic path silently regressed (exited 0 instead of
panicking).

Switched to an allow-list: only stabilize for the shapes that
actually produce recyclable temps — `Index`, `Field`, `TupleIndex`,
`Binary`, `Call`, `MethodCall`. `Deref` is *not* in the list, so
`&*heap_val` keeps its Tier 0 ref-to-source-slot semantics and the
generation/epoch checks fire as designed.

L0 lexer/parser/types/builtin-syntax/memory-safety/mmio/modules/
reference_system: **577/587 = 98.3%** (10 remaining failures are
all stdlib-API gaps — `Register.modify` missing and
`Epoch.current()` recursion).

### Fixed — `&temp` references survive past the next `alloc_temp`

Taking a reference to a temporary value (`&arr[i]`, `&(a + b)`,
`&f()`, …) emitted a Tier 0 CBGR ref encoding the inner register's
absolute index. The interpreter's `Deref` then read back through
that index — but the temp pool would happily recycle the slot the
moment the next `alloc_temp` ran. The deref then read whatever
happened to land in the slot (an f-string text fragment, a
print-format intermediate, …):

  let arr = [1, 2, 3, 4, 5];
  let r: &Int = &arr[2];
  print(f"*r = {*r}");      // → "*r = " (nothing — wrong)
  assert_eq(*r, 3);          // → fails

`compile_unary` now stabilizes the source via
`stabilize_ref_source`: when the inner expression isn't a named
local, allocate a fresh, never-recycled register, copy the value
into it, and reference *that*. One extra `Mov` per `&temp` (the
common Tier 0 case is already paying the 15 ns generation check),
and the silent slot-collision class of bugs is closed at codegen
time. Applies to all six tier/mutability variants
(`Ref`/`RefMut`/`RefChecked`/`RefCheckedMut`/`RefUnsafe`/
`RefUnsafeMut`). Mutable element refs (`&mut arr[i]`) still don't
write back to the array storage — that needs a separate
"element write-through" opcode (tracked).

### Cleared — remaining clippy warnings

Eight stylistic lints across `verum_vbc`, `verum_smt`,
`verum_types`, `verum_mlir`. None affect behavior:

- `verum_vbc`: drop the `1 *` and `+ 0` no-ops in the CbgrAlloc
  Ok-wrap, redundant `as *mut u8` casts on already-`*mut u8`
  pointers, collapse a nested `if {…}` inside a `matches!`-guarded
  layout-property branch, replace `is_some + unwrap` with
  `let Maybe::Some(ref body) = …`.
- `verum_smt`: drop the redundant outer `..Default::default()` in
  `SmtConfig::debugging`.
- `verum_types`: invert the `Layer` PartialOrd/Ord pair so `cmp`
  is the canonical implementation; replace `min(64).max(1)` with
  `clamp(1, 64)` in `BitVec::new`.
- `verum_mlir`: add a `Default` impl for `LlvmContextRef`.

`cargo clippy --workspace --bins --lib` is now clean (no warnings
outside upstream crates that build C/C++ via the system `ar`).

### Fixed — `.method()` doesn't fall through to a free fn

`nums.map(|n| n * 2)` panicked at runtime with "method 'Map.resize'
not found on value". Two compounding bugs:

1. `compile_method_call`'s static-receiver branch treated bare-Path
   receivers as type names *even when the segment was a local
   variable*. A regression from the `Foo<T>.method(...)` static
   dispatch unification — the local `nums` got lifted into a
   would-be `nums.map` static lookup.
2. The interpreter's `handle_call_method` resolved the resulting
   bare `"map"` string by suffix-scanning the entire registered
   function table, and `core/collections/map.vr`'s top-level
   `pub fn map<K,V>(pairs)` happened to register before `List.map`.
   The dispatcher picked it, ran into `Map.with_capacity` →
   `self.resize(cap)`, and the private `Map.resize` is not in the
   function table.

Codegen now suppresses the static-receiver intercept for local
variables; the dispatcher restricts unqualified-suffix matches to
candidates that contain a `.` (i.e., methods, not free fns). After
the fix L0 lexer + parser + types + builtin-syntax runs at
**323/323 = 100%** (was 322/323). `closure_runtime.vr` —
`xs.map(...)`, `.filter(...)`, `.fold(...)`, captured environments,
nested closures, higher-order functions — passes end-to-end.

### Fixed — AOT `.await` on a direct async-fn call no longer SIGSEGVs

`verum run --aot` (and the resulting `verum build` binary) crashed on
the first `.await` of a plain async-fn call:

  async fn add(a: Int, b: Int) -> Int { a + b }
  fn main() { let r = add(1, 2).await; print(f"{r}"); }

Async fns in the current implementation are not compiled to suspend
/resume state machines — `add(1, 2)` runs the body inline and returns
the value (3). The interpreter's `Await` handler tolerated that (it
pattern-matches on a sentinel-encoded task ID and falls through to
pass-through). The AOT lowering, however, called
`verum_pool_await(handle_i64)`, which `int_to_ptr`'d the small int
and dereferenced it as a 16-byte pool handle struct.

Fix: `compile_await` no longer emits `Instruction::Await` when the
inner expression is anything other than `ExprKind::Spawn`. The result
of the async-fn call is the awaited value; no runtime poll is needed.
`spawn { … }.await` keeps the threaded path. Removes the "AOT Async
— No Polling Executor" entry from `KNOWN_ISSUES.md`.

### Added — REPL VBC-backed evaluation

`verum repl` now actually evaluates each prompt instead of stopping at
parse + typecheck. Each input is classified and routed:

- `let NAME [: TYPE] = EXPR` → desugars to `static NAME: TYPE = EXPR;`
  (with type annotation) or `const NAME = EXPR;` (without). The
  declaration is appended to a session source buffer that persists
  across prompts.
- Top-level items (`fn`, `type`, `protocol`, `implement`, `static`,
  `const`) → appended to the session source after a compile-only
  validation.
- Bare expressions → wrapped in `fn __repl_main_<N>() { print(f"{...}"); }`,
  the session source plus the wrapper is compiled to VBC, and the
  wrapper is executed via `verum_vbc::interpreter::Interpreter`. The
  captured stdout is printed as the result.

`:source` shows the accumulated buffer, `:reset` clears it. Removes
the "REPL — Parse-Only" entry from `KNOWN_ISSUES.md`.

### Fixed — `Shared<T>::new` lowering (closes the last KNOWN_ISSUES item)

`Shared<Int>.new(42)` (and any `Foo<TypeArgs>.method(...)` call on a
generic type) blew up at codegen with two latent bugs in
`crates/verum_vbc/src/codegen/expressions.rs`:

1. Field access on an `ExprKind::TypeExpr` had no layout-property
   handler. `SharedInner<T>.size` and `SharedInner<T>.alignment` fell
   through to a generic field load that returned `i64::MAX` (the
   debug-formatted Type string interpreted as an integer). The stdlib
   then asked the allocator for ~9 EB and panicked with "Out of
   memory". Add `try_resolve_type_layout_property` (TypeExpr) and
   `layout_property_for_named` (bare-Path generic params and user
   structs). In VBC's NaN-boxed model, every record slot is exactly
   one 8-byte `Value`, so the answer is `field_count * 8` for size,
   8 for alignment, and the type arguments are layout-irrelevant.
2. Method dispatch on a `TypeExpr` receiver fell through
   `try_flatten_module_path` (which only knows `Path` nodes) and
   compiled the receiver as a runtime value — emitting `LOAD_K
   String("Type { kind: Generic { …")` followed by `SetF` against
   garbage intern indices like `r1.306`. Extract a
   `static_receiver_type` helper that returns the type name for both
   bare-Path and TypeExpr forms, then unify the Heap/Shared/List/Map
   /Set intercepts and the qualified-function lookup so they consume
   it from a single source.

End-to-end: `Shared<Int>.new(42)`, `Shared<Bool>.new(true)`,
`Shared<Text>.new("hello")`, `Heap<Int>.new(7)` all run cleanly in
the interpreter. The `Shared<T>` entry is now removed from
`KNOWN_ISSUES.md` — only AOT async, REPL evaluation, and the
by-design GPU/FFI/vmap interpreter fallbacks remain.

### Fixed — AOT slice-op fat-ref loads route through `as_ptr`

`SliceGet` (0x06), `SliceGetUnchecked` (0x07), `SliceSubslice` (0x08),
and `SliceSplitAt` (0x09) in `verum_codegen/src/llvm/instruction.rs`
unconditionally called `.into_pointer_value()` on the register value
— panicking with "Found IntValue … expected PointerValue variant"
whenever the register held a NaN-boxed i64 encoding of the pointer
(exactly how the stdlib slice path stores the fat ref after a
`Pack`). Route all four sites through the existing `as_ptr(ctx,
val, name)` helper, which already handles PointerValue, IntValue
(via int_to_ptr), and StructValue cases.

This was the primary L0 AOT blocker — `make test-l0` previously
SIGABRT'ed at spec ~400 inside `vtest-diff-aot`. After this fix,
`examples/showcase.vr` builds and runs cleanly, and L0 proceeds
through ~2000+ specs before the residual LLVM stability work.

### Fixed — interpreter runs `__tls_init_*` ctors before `main`

The VBC codegen emits a `__tls_init_<NAME>` synthetic function for
every `@thread_local static` and registers it in
`module.global_ctors`. The AOT path consumes these via
`@llvm.global_ctors`, but the interpreter was skipping
`module.global_ctors` wholesale (to avoid declared-only FFI library
initializers crashing on macOS). Skipping the TLS subset of those
ctors left `@thread_local static` slots uninitialised; `TlsGet`
fell back to `Value::default()`, which is not the declared initial
value. A `Maybe<LocalHeap>` stored as `None` then read back as
untagged zero, misfired the Some/None pattern-match, and the CBGR
allocator bootstrap crashed on the first `Shared::new(...)` with
"Expected int, got None" at `value.rs:892`.

Fix: selectively run only ctors whose function name starts with
`__tls_init_`. FFI library initializers keep their existing skip.
`CompilationPipeline::phase_interpret` calls the new
`interpreter.run_global_ctors()` before `execute_function(main)`.
Verified: `@thread_local static mut COUNTER: Int = 42;` now reads
back as `42` inside the interpreter (was raw zero / panic before).

### Added — CLI `verify --solver={z3|cvc5|portfolio|auto|capability}`

The `--solver` flag on `verum verify` was defined with default
`"z3"` but the value was only used for display — the verification
path hard-coded Z3. Plumb the selection through to `CompilerOptions`
and log it from `VerifyCommand` so the runtime path can route
accordingly, and reject typos loudly instead of silently defaulting.

- `CompilerOptions` gains `smt_solver: BackendChoice` (default
  `BackendChoice::Z3` to preserve historical behaviour).
- `verum_cli::commands::verify::SolverChoice` enum + `parse` so
  validation remains available even when the `verification` feature
  is disabled (that feature gates the `verum_smt` dependency and the
  real `BackendChoice`).
- Unknown values like `--solver=foo` now error with
  `"Accepted values: z3, cvc5, auto, portfolio, capability"`.
- `VerifyCommand::run` emits an info-level log naming the selected
  backend and timeout.

Actual backend routing (CVC5 / portfolio / capability-router) is a
follow-up; the `cvc5` feature ships in stub mode and transparently
delegates to Z3 inside `SmtBackendSwitcher`, so `--solver=cvc5`
produces Z3-equivalent answers in the default build.

### Added — LSP choice-snippet completion for attribute enum values

`@inline(<TAB>` previously inserted the generic placeholder
"identifier" at position `$1`, because `ArgSpec::Required(ArgType
::Ident)` has no notion of the specific allowed identifiers. The
LSP completion layer now hard-codes the set of known choice-valued
attributes and emits an LSP choice snippet so editors offer the
allowed values inline:

- `@inline` → `always | never | hint | release`
- `@repr` → `C | packed | transparent | cache_optimal`
- `@optimize` → `none | size | speed | balanced`
- `@device` → `cpu | gpu`

### Chore — zero rustc warnings in `cargo build --workspace`

Eliminated 25 `dead_code` warnings that accumulated across
`verum_smt::cvc5_backend` (stub-mode `Cvc5Backend` / `Cvc5Sort` /
`Cvc5Model` / `Cvc5Result` + `CVC5_KIND_*` constants kept for API
parity with the `cvc5-ffi` build), `verum_vbc::codegen::
get_current_ffi_platform` (reserved for FFI signature generation),
and `verum_vbc::interpreter::kernel::MIN_GPU_SIZE` (CPU-vs-GPU
kernel-selection threshold). Each site is annotated with a narrow
`#[allow(dead_code)]` and a comment explaining when the code
becomes live.

The `unit` CI job now runs `RUSTFLAGS="-D warnings" cargo build
--workspace --locked` as a blocking gate, so any regression
reintroduces a failing build.

### Infrastructure — CI restored + production-readiness docs

- `.github/workflows/ci.yml` blocks on: unit tests
  (Ubuntu + macOS-14 aarch64), VCS L0 (2963 specs, 100%) + L1 (499
  specs, 100%), Tier 0 vs Tier 3 differential (204+ specs).
  `rustfmt --check` and `clippy -D warnings` run advisory pending
  the one-shot reformat / manual clippy polish pass.
- `.github/workflows/nightly.yml` runs the full VCS sweep with
  cross-tier differential, 60-minute fuzzer across all targets,
  and benchmark comparison vs baseline.
- `KNOWN_ISSUES.md` rewritten to reflect the current state — stale
  entries about `@thread_local`, byte-writes, and Text equality
  removed. Subsequently the `Shared<T>` allocator crash was traced
  and fixed (see "Fixed — `Shared<T>::new` lowering" below); the
  remaining items are AOT async executor, REPL evaluation, and
  by-design GPU/FFI/vmap interpreter fallbacks.
- New `CONTRIBUTING.md` with pre-PR verification commands that
  mirror the CI gate (`RUSTFLAGS="-D warnings" cargo build`,
  `cargo test --workspace --lib --bins`, `make test-l0 test-l1`).
- `vcs/baselines/l0-baseline.md` documents the current 98.4% L0
  compile-time pass rate and the reproduction path for the residual
  full-L0 AOT SIGSEGV.

## [0.32.0] — 2026-04-15 — phase D complete

### Major

- **Cubical normaliser with computational univalence** landed. Eight
  reduction rules in `cubical.rs`; bridge into `unify.rs` for
  `Type.Eq`. Computational `transport(ua(e), x) ≡ e.to(x)`.
- **VBC cubical codegen**. New `CubicalExtended` opcode (0xDE) with
  17 sub-opcodes covering `PathRefl`, `PathLambda`, `Transport`,
  `Hcomp`, `Ua`, `Glue`, and friends. Proof erasure in release
  mode — cubical ops compile to identity / passthrough.
- **Proof-carrying bytecode**. VBC archives embed certificates via
  `verum_smt::proof_carrying_code`. Consumers can re-verify
  offline without running the full compiler.
- **Capability-based SMT router**. Obligations classified by theory
  use; Z3 handles LIA/bitvector/array; CVC5 handles strings /
  nonlinear / SyGuS / FMF. Portfolio mode cross-validates.
- **θ+ unified execution environment**. Memory + capabilities +
  recovery + concurrency form a single per-task context with
  spawn/await propagation.
- **Incremental compilation fingerprinting**. Function / type /
  dependency / config hashes; `target/.verum-cache/` per-project.
  Typical 10–15× incremental-edit speedup.

### Added

- `@verify(thorough)` and `@verify(certified)` — dual-solver
  execution.
- `@verify(certified)` — requires proof term; machine-checked.
- `is_reflectable()` gate for `@logic` functions (pure + total +
  closed).
- `Tensor<T, const S: Shape>` static shapes with shape-polymorphic
  operations; shape errors at compile time.
- `math.agent` — LLM-adjacent primitives (tokeniser, KV cache,
  speculative decoding, ReAct, guardrails, RAG).
- `theory_interop` — theory registry for formally-represented
  theories; Yoneda loading, Kan-extension-based translation,
  descent coherence.
- Terminal UI framework (`core::term`) — 7 layers from raw termios
  to Elm-architecture apps.
- 800+ runtime intrinsics documented in `core::intrinsics`.
- Contract literals (`contract#"..."`) with compile-time SMT
  verification.

### Changed

- CBGR dereference optimised to **11.8–14.5 ns** (measured on M3
  Max). Target < 15 ns — achieved.
- Stdlib collections: Swiss-table-backed `Map<K,V>` replaces
  open-addressing implementation.
- VBC opcode count reached 200+ (was ~150).
- Default SMT timeout raised from 2 s to 5 s for better portfolio
  convergence.
- Parser: switched to `verum_fast_parser` (recursive descent with
  lossless green tree) as default; `verum_parser` retained for
  backward compatibility.
- `@extern("C")` blocks now accept `calling_convention = "..."` for
  non-default ABIs.

### Fixed

- Generation wraparound race condition — epoch counter now advances
  cooperatively per-thread; hazard pointers protect in-flight reads
  during free.
- CVC5 1.3.3 integration — brings bug fixes to string operations.
- Refinement narrowing across control flow: `if x > 0 { ... }`
  correctly strengthens `x: Int` to `Int { self > 0 }` inside the
  branch.
- Proof cache invalidation triggers solver upgrade — previously
  cached results were trusted across solver versions, leading to
  stale verdicts.

### Deprecated

- `r#"..."#` Rust-style raw string — use `"""..."""` (triple-quote)
  for multiline raw text.
- `size_of<T>()` / `align_of<T>()` intrinsics — prefer type
  properties `T.size`, `T.alignment`.

### Tooling

- **LSP**: refinement-type diagnostics with counter-examples; CBGR
  reference-tier hints (`&T` / `&checked T` / `&unsafe T` shown
  inline); quick-fixes for auto-import, protocol method
  generation, `@verify` annotation.
- **Playbook TUI**: session replay; context binding; inline
  verification diagnostics.
- **CLI**: `verum analyze --escape | refinements | smt |
  capabilities`; `verum smt-stats`; `verum expand-macros`;
  `verum target install <triple>`.
- **Package registry**: `verum publish`, `verum search`,
  `registry.verum-lang.org`; content-addressed storage with
  IPFS support.

### Benchmarks

Measured on Apple M3 Max, Verum 0.32 release build:

| Operation | Cycles | ns |
|---|---|---|
| `&checked T` deref | 2 | 0.5 |
| `&T` CBGR check | 55 | 13.8 |
| `Shared.clone` (incr. strong) | 11 | 2.7 |
| `Map.insert` (single) | ~200 | ~50 |
| context-stack push | 32 | 8 |
| `current_env()` read | 8 | 2 |

### Verification statistics

Project-wide on the stdlib + conformance suite:

| Theory mix | Obligations | Median (ms) | p95 |
|---|---:|---:|---:|
| LIA only | 2,100 | 8 | 35 |
| LIA + bitvector | 940 | 14 | 60 |
| LIA + string | 110 | 45 | 180 |
| Nonlinear (NIA) | 42 | 320 | 1,800 |
| Cubical / path | 18 | 120 | 400 |

Cache hit rate: **68%** average on incremental builds.

### Migration notes

**From v0.31**:

- `r#"..."#` raw strings → `"""..."""`. Automated by `verum fmt`.
- `@verify(formal)` semantics unchanged. Portfolio / certified are
  new, opt-in.
- New type properties `T.size` / `T.alignment` are source-
  compatible; `size_of<T>()` still works but emits a deprecation
  warning.

**From v0.30 and earlier**: cubical types weren't available. No
migration needed for existing code; new `Path<A>(a,b)` type and
friends are additive.

### Contributors

43 contributors over the v0.32 cycle. Session 22 was the biggest —
CBGR optimisation to 11.8–14.5 ns shipped in that session.

---

## [0.31.0] — 2026-02-28 — cubical foundations

### Added

- Cubical type theory in `verum_types`: `Path<A>(a, b)`, interval
  endpoints `i0` / `i1`, `hcomp`, `transport`, `ua`.
- Higher-inductive type syntax: `type S1 is Base | Loop() = Base..Base`.
- `cofix fn` coinductive fixpoint; productivity analysis via
  `check_productivity`.

### Changed

- `verum_types::infer` 2.66 M LOC after cubical integration.

### Fixed

- Infinite loops in inference when HKT parameter unified against
  itself.

---

## [0.30.0] — 2025-12-15 — dual-solver portfolio

### Added

- CVC5 backend (`cvc5-sys` 1.3.2).
- Capability-based router in `verum_smt::capability_router`.
- `@verify(thorough)` attribute.

### Changed

- SMT obligation format standardised on SMT-LIB 2.6 across both
  solvers.

---

## [0.25.0] — 2025-10-07 — dependent types

### Added

- Σ-types via `type T is n: Int, data: [Int; n]`.
- Π-types (implicit — dependent return types over parameters).
- Higher-kinded type parameters: `F<_>`.
- `@verify(formal)` integration with dependent obligations.

---

## [0.20.0] — 2025-07-22 — refinement-type SMT

### Added

- Three refinement syntaxes: inline on type, on parameter, on field.
- Z3 integration via `verum_smt::z3_backend`.
- `@logic fn` reflection.
- `where requires` / `where ensures` / loop `invariant` / `decreases`.

---

## [0.15.0] — 2025-04-09 — VBC-first

### Added

- VBC bytecode with 150+ opcodes.
- VBC interpreter; `verum run` default.
- LLVM AOT backend via `verum_codegen`; `verum build --release`.

### Changed

- Compiler pipeline reorganised around VBC as the single IR.

---

## [0.10.0] — 2025-01-19 — three-tier references

### Added

- `&T`, `&checked T`, `&unsafe T` reference tiers.
- CBGR — capability-based generational references.
- Escape analysis; promotion to `&checked T`.

---

## [0.05.0] — 2024-10-12 — type system skeleton

### Added

- Bidirectional type inference.
- Protocol system (`type X is protocol { ... }`).
- `implement P for T` blocks.
- Semantic-honest types: `List<T>`, `Text`, `Map<K,V>`, etc.

---

## [0.01.0] — 2024-07-05 — initial public tag

### Added

- Lexer (via logos).
- EBNF grammar v0.1 (~800 lines).
- Parser shell; can tokenise `.vr` files.
- Executable compiles `main()` with `print("hello, world!")`.

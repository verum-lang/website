---
sidebar_position: 14
title: Lint engine
---

# Lint engine architecture

`verum lint` ships **two cooperating engines** in the same binary,
both invoked from `commands::lint::lint_file`:

1. **Text-scan engine** — fast, line-based, cheap. Catches the
   "rust-ism" class (`Box::new`, `Vec`, `String`, …) and any rule
   whose evidence is a regex shape. Implemented inline in
   `lint` module.
2. **AST engine** — parses the file via `verum_lexer` +
   `verum_parser`, walks the resulting `Module` with the production
   `verum_ast::Visitor` trait. Used by every rule that needs
   structural knowledge: refinement predicates, attribute lists,
   `using [...]` clauses, mount paths, type signatures. Implemented
   in `lint_engine` module.

The engines are orthogonal — text-scan rules have no AST, AST rules
have no string view. Each runs independently per file and merges
diagnostics into a single `Vec<LintIssue>` filtered by
`LintConfig::effective_level`.

## Why two engines

Text-scan is good at:

- pattern matching against a regex (`\.unwrap\(\)`),
- speed (no parsing — single pass, line-based),
- working on files that don't yet parse (mid-edit IDE state).

AST is good at:

- attribute introspection (is `@verify` present? is `@hot` present?),
- type-shape inspection (`TypeKind::Refined { predicate, .. }`),
- knowing the *binding scope* of a name (used vs unused imports,
  shadow detection, `it` resolution in refinement predicates),
- false-positive immunity (a `TODO` in a string literal is *not* a
  TODO comment in the AST).

A unified engine that did both at full power would either rebuild a
parser-tolerant text scanner (clippy's choice — and clippy lives
inside rustc) or lose text-scan's resilience. Verum's two-engine
split keeps each at its best.

## The lint-pass interface

Every AST rule is one *pass*. A pass is a small unit that exposes
five facts about itself plus a single entry point that runs it:

| Item            | Role |
|-----------------|------|
| `name`          | Stable identifier referenced by `[lint]` config. |
| `description`   | One-line user-facing summary shown by `verum lint --explain`. |
| `default_level` | The severity the pass emits when the user has not overridden it. |
| `category`      | Bucket used by presets (`naming`, `architecture`, `refinement-policy`, `cbgr-budget`, `capability`, `style`, …). |
| `check(ctx)`    | Runs the pass against a per-file context and returns its raw findings. |

The set of passes is a **static registry**: the engine ships
every available pass at compile time and there is no plugin
loader. Adding a rule means appending one entry to the registry
and one descriptor to the rule table — no build-script and no
registration macro.

Passes are typically stateless — per-call state lives inside a
fresh visitor that the pass constructs inside `check`. The
visitor is the production AST visitor exported by `verum_ast`;
the lint engine does not maintain a parallel walker. New passes
override only the visit methods relevant to their concern; every
other node walks itself by default.

## The lint context

Each pass receives a per-file context with three fields:

| Field    | Role |
|----------|------|
| `file`   | The path being checked, used for diagnostic location. |
| `source` | The original source text, used by passes that need byte-level lookups. |
| `module` | The already-parsed AST. |

Passes always see the **already-parsed** module — file I/O and
parsing happen once per file, not once per pass. Adding new
passes is essentially free.

## Span → (line, column)

Verum spans are byte ranges. Lint diagnostics need `(line,
column)` for editors, so the engine ships a helper that walks
the source once per call (linear in the file size). For typical
lint cardinality — tens of issues per file — this cost is
negligible.

## Engine integration

`lint_file` runs the two engines in sequence:

1. **Read** the file once.
2. **Text-scan rules** run on the raw text, using a lightweight
   line-based descriptor produced by a single source pass. This
   stage is parse-tolerant and always fires.
3. **AST passes** run only if the file parses cleanly. The
   parsed module is shared with every pass through the lint
   context.
4. **Aggregate** the resulting issue list and return it to the
   caller.

If parsing fails, the AST passes simply do not fire — text-scan
findings are still reported. This gives the linter the same
robustness an IDE expects from a half-typed file.

## Severity resolution

Both engines emit issues at each rule's *default* level.
Filtering happens **after** collection: for every raw issue, the
effective level is computed by walking the precedence stack and
either emitting the issue at the resolved level or dropping it
when the rule is configured off.

The precedence stack is documented in
[lint configuration → precedence stack](/docs/reference/lint-configuration#precedence-stack):
`severity_map` → preset → disabled / denied / allowed /
warned → default.

## Lessons borrowed

| Source | What we took |
|--------|--------------|
| **rustc / clippy** (LateLintPass) | The "pass walks AST" idiom and the visitor-default-walks pattern. We diverge by having no MIR equivalent — every pass is single-stage AST. |
| **scalafix** (rule discovery) | Static-registry model over a plugin loader. Adding a rule = appending to the slice; no build-script, no registration macro. |
| **biome / oxc** (JS/TS) | Result aggregation — passes emit raw, engine filters by severity downstream. Consistent with our `LintLevel::Off` short-circuit. |
| **golangci-lint** | The notion of *running multiple linters with shared file state*. Our two-engine split echoes this; each pass shares the parsed `Module` rather than reparsing per-rule. |

## Adding a new rule

1. Add a struct with one `LintPass` impl in
   `lint_engine` module.
2. Add a `LintRule { name, level, description, category }` entry in
   the `LINT_RULES` const in `lint.rs` so `--list-rules`,
   `--explain`, and `--validate-config` see it.
3. Add the struct to the `PASSES` slice in `lint_engine::passes()`.
4. Document it under [lint rules → category](/docs/reference/lint-rules).

That's it — no other files touched. The CLI, JSON / GitHub Actions
formatters, severity-map / preset / `--validate-config` plumbing
all light up automatically.

## User-authored AST rules

Built-in passes are not the only way to add structural lints —
`[[lint.custom]]` accepts a `[lint.custom.ast_match]` block that
describes an AST shape declaratively. The `CustomAstRulesPass` reads
each user rule from the loaded `LintConfig` and runs a tiny `Visitor`
against the parsed module per file.

Why a single pass for *all* user AST rules instead of one pass per
rule:

- The user rule names live in `LintConfig`, not the static `PASSES`
  registry — they're discovered at runtime, not compile-time.
- Each user rule's matcher is one of four fixed shapes — there's no
  user-supplied logic, just data. So one pass + one match on
  `spec.kind` covers all of them.
- One visitor per file, all rules folded in, keeps the AST walked
  exactly once regardless of how many user rules are defined.

User AST rules support exactly four `kind` values, each
matching one well-defined AST shape:

| `kind`         | Matches against |
|----------------|-----------------|
| `method_call`  | Method-call expressions (`receiver.name(args)`). |
| `call`         | Function-call expressions. |
| `attribute`    | Attributes attached to module-level items. |
| `unsafe_block` | `unsafe { ... }` expression blocks. |

User rules are data, not code: the matcher is one of the four
shapes above and the engine dispatches purely on the `kind`
field. Each user rule's diagnostic is tagged with the rule's
configured `name`, picked up automatically by every downstream
formatter.

User rules participate in every downstream feature for free:
`[lint.severity]`, per-file overrides, `@allow(...)` attributes,
`--severity` filtering, `--format sarif|tap|json|github-actions`.

## Performance contract

The linter has three distinct cost models, each pinned by tests so
a future regression breaks CI rather than slipping past review:

| Scenario | Target | Where it's verified |
|----------|--------|---------------------|
| One ~1 KLOC file, every rule on | < 5 ms | criterion bench `lint_single_file` |
| 100-file cold scan, 8 threads | < 500 ms | criterion bench `lint_repo_parallel` + integration test caps wall clock at 2 s |
| 100-file warm-cache scan, 8 threads | < 50 ms | criterion bench `lint_cache_hit` + integration test caps wall clock at 1 s |
| Parallel runner vs sequential at 200 files | within ±50 % | `lint_perf_contract::parallel_speedup_is_at_least_1_5x` (catastrophic-regression floor) |

Run the benches with:

```bash
cargo bench -p verum_cli --bench lint_throughput
cargo bench -p verum_cli --bench lint_throughput -- --save-baseline main
cargo bench -p verum_cli --bench lint_throughput -- --baseline main
```

The integration tests run as part of `cargo test -p verum_cli` and
have wall-clock caps deliberately ~3× the criterion targets so they
don't flake on slow runners while still catching the case where
someone reintroduces O(n²) behaviour.

## See also

- **[Reference → Lint rules](/docs/reference/lint-rules)** — every rule the linter currently checks.
- **[Reference → Lint configuration](/docs/reference/lint-configuration)** — the `[lint]` schema.
- `lint_engine` module — the AST-engine source.
- `lint` module — text-scan engine + `LintConfig` + presets.

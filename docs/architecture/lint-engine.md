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

## The `LintPass` trait

Every AST rule is one struct implementing one trait:

```rust
pub trait LintPass: Sync {
    fn name(&self) -> &'static str;
    fn description(&self) -> &'static str;
    fn default_level(&self) -> LintLevel;
    fn category(&self) -> LintCategory;
    fn check(&self, ctx: &LintCtx<'_>) -> Vec<LintIssue>;
}
```

The static registry — every pass available, no plugin loader:

```rust
pub fn passes() -> &'static [&'static dyn LintPass] {
    static PASSES: &[&(dyn LintPass + Sync + 'static)] = &[
        &RedundantRefinementPass,
        &EmptyRefinementBoundPass,
        // … plus the rest: naming, architecture, refinement-policy,
        // CBGR-budget, capability, style ceilings, custom AST rules.
    ];
    /* widening transmute */
}
```

A pass typically has zero state — it's a unit struct. Per-call state
lives in a fresh `Visitor` instance constructed inside `check`:

```rust
struct V<'s, 'p> {
    source: &'s str,
    file: &'p Path,
    issues: Vec<LintIssue>,
}
impl<'s, 'p> Visitor for V<'s, 'p> {
    fn visit_type(&mut self, ty: &Type) {
        if let TypeKind::Refined { predicate, .. } = &ty.kind {
            // emit issues into self.issues
        }
        verum_ast::visitor::walk_type(self, ty);   // recurse
    }
}
```

The walker is the production `verum_ast::Visitor` — no parallel
walker is built or maintained inside the lint code. New passes
override only the `visit_*` methods relevant to their concern; every
other node walks itself by default.

## `LintCtx`

Per-file context every pass receives:

```rust
pub struct LintCtx<'a> {
    pub file: &'a Path,
    pub source: &'a str,
    pub module: &'a Module,
}
```

Passes receive the **already-parsed** `Module` — file IO and parse
happen once per file in `lint_file`, not per pass. Adding new passes
is essentially free.

## Span → (line, column)

Verum spans are byte ranges (`Span { start: u32, end: u32 }`); lint
diagnostics need `(line, column)` for editors. The helper:

```rust
pub fn span_to_line_col(source: &str, byte_offset: u32) -> (usize, usize)
```

…walks the source once per call (O(n)). For typical lint cardinality
(tens of issues per file) this is negligible.

## Engine integration in `lint_file`

```rust
fn lint_file(path: &Path) -> Result<List<LintIssue>> {
    let content = fs::read_to_string(path)?;
    let mut issues = List::new();

    // 1. text-scan rules (always run, parse-tolerant)
    let info = FileInfo::parse(&content);
    check_unchecked_refinement(path, &info, &mut issues);
    /* ...the other 19 text-scan rules... */

    // 2. AST passes (only when the file parses cleanly)
    if let Ok(module) = parser.parse_module(lexer, fid) {
        let ctx = lint_engine::LintCtx { file: path, source: &content, module: &module };
        for issue in lint_engine::run(&ctx) {
            issues.push(issue);
        }
    }
    Ok(issues)
}
```

Parse failures fall through silently — text-scan rules still report,
AST passes simply don't fire. This is the same robustness clippy's
late-pass system gets via rustc's recovery, but with a smaller
surface to maintain.

## Severity resolution

Both engines emit at each rule's default level. Filtering happens
*after* collection:

```rust
let cfg = load_full_lint_config();
for issue in raw_issues {
    if let Some(lvl) = cfg.effective_level(issue.rule, issue.level) {
        emit(issue with lvl);
    }
}
```

`effective_level` walks the precedence stack documented in
[lint configuration → precedence stack](/docs/reference/lint-configuration#precedence-stack):
severity_map → preset → disabled / denied / allowed / warned →
default.

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

The four supported `kind` values
(`method_call | call | attribute | unsafe_block`) match the same AST
shapes that built-in passes use, via:

```rust
match self.spec.kind.as_str() {
    "method_call" => match expr.kind { ExprKind::MethodCall { .. } => … },
    "call"        => match expr.kind { ExprKind::Call { .. }       => … },
    "attribute"   => /* iterate Module.items, inspect item attrs */,
    "unsafe_block"=> match expr.kind { ExprKind::Unsafe(_)         => … },
    _ => {}
}
```

The user-rule `name` field becomes the diagnostic's static `rule`
field via a tiny `Box::leak` — bounded by the number of distinct
user-rule names defined in the lifetime of one `verum lint` process,
which is small (handfuls, not thousands).

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

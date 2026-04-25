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
   `crates/verum_cli/src/commands/lint.rs`.
2. **AST engine** — parses the file via `verum_lexer` +
   `verum_parser`, walks the resulting `Module` with the production
   `verum_ast::Visitor` trait. Used by every rule that needs
   structural knowledge: refinement predicates, attribute lists,
   `using [...]` clauses, mount paths, type signatures. Implemented
   in `crates/verum_cli/src/commands/lint_engine.rs`.

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
        // future passes — naming, architecture, refinement-policy, …
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
   `crates/verum_cli/src/commands/lint_engine.rs`.
2. Add a `LintRule { name, level, description, category }` entry in
   the `LINT_RULES` const in `lint.rs` so `--list-rules`,
   `--explain`, and `--validate-config` see it.
3. Add the struct to the `PASSES` slice in `lint_engine::passes()`.
4. Document it under [lint rules → category](/docs/reference/lint-rules).

That's it — no other files touched. The CLI, JSON / GitHub Actions
formatters, severity-map / preset / `--validate-config` plumbing
all light up automatically.

## See also

- **[Reference → Lint rules](/docs/reference/lint-rules)** — every rule shipped today.
- **[Reference → Lint configuration](/docs/reference/lint-configuration)** — the `[lint]` schema.
- `crates/verum_cli/src/commands/lint_engine.rs` — code for the AST engine + the two starter passes.
- `crates/verum_cli/src/commands/lint.rs` — text-scan engine + `LintConfig` + presets.
- `docs/testing/lint-configuration-design.md` (in-tree) — full design doc and roadmap.

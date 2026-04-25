---
sidebar_position: 11
title: Lint configuration
---

# `[lint]` configuration

`verum lint` reads its policy from the `[lint]` block in `verum.toml`,
or — when you'd rather keep the manifest clean — from a dedicated
`.verum/lint.toml`. The schema mirrors the rest of the manifest
(`[verify]`, `[linker]`, `[codegen]`), so picking it up feels familiar
the moment you've configured anything else in Verum.

What sets it apart from the linters you've used before is that the
rules are **language-aware** in ways a generic AST visitor cannot be:

- **Refinement-aware** — rules can read predicate shapes
  (`Int{ x > 0 }`) and react to redundant or missing constraints.
- **Capability-aware** — `@cap` declarations participate in
  rule decisions (e.g. *"`unsafe { … }` is fine here, but only if
  the function declares `@cap(unsafe, …)`"*).
- **Context-aware** — the `using [Database, Logger]` clause is a
  first-class rule input.
- **CBGR-tier-aware** — managed `&` (~15 ns) vs `&checked` (0 ns)
  vs `&unsafe` shows up in the diagnostics, with budget rules
  enforcing per-module cost ceilings.

The reference below covers everything `verum lint` accepts today.

## Quick start

The defaults are sane — a project with no `[lint]` block uses the
`recommended` preset. To customise:

```toml
# verum.toml
[lint]
extends = "recommended"           # or "minimal" | "strict" | "relaxed"

# tweak severity per rule
[lint.severity]
todo-in-code        = "off"
deprecated-syntax   = "error"

# rule-specific knobs
[lint.rules.large-copy]
size-threshold-bytes = 256
exempt-types         = ["UserId", "Hash"]

# per-file overrides
[lint.per_file_overrides]
"tests/**" = { allow = ["unused-result", "todo-in-code"] }
```

That's it. The remaining sections show every available knob.

## Top-level `[lint]`

```toml
[lint]
extends  = "recommended"          # base preset (§ Presets)
disabled = []                     # rules to silence (synonym: severity = "off")
denied   = ["deprecated-syntax"]  # rules forced to error severity
allowed  = []                     # rules silenced ("allow" lint-class verbs)
warned   = []                     # rules forced to warn

include  = ["src/**/*.vr", "tests/**/*.vr"]
exclude  = ["target/**", "vendor/**", "**/*.generated.vr"]
```

| Key | Type | Default | Meaning |
|-----|------|---------|---------|
| `extends` | string | `"recommended"` | Built-in preset to inherit from. See [§ Presets](#presets). |
| `disabled` | list of strings | `[]` | Rules to disable entirely. Same effect as `severity.<rule> = "off"`. |
| `denied` | list of strings | `[]` | Force severity to `error`. |
| `warned` | list of strings | `[]` | Force severity to `warn`. |
| `allowed` | list of strings | `[]` | Silence (synonym for `disabled`; libtest convention). |
| `include` | list of glob | `["src/**/*.vr", "tests/**/*.vr", "benches/**/*.vr"]` | Files the linter walks. |
| `exclude` | list of glob | `["target/**", "vendor/**"]` | Subtracted from `include`. |

## Per-rule severity

Override the default level of a rule without disabling it:

```toml
[lint.severity]
unused-import      = "warn"
deprecated-syntax  = "error"
cbgr-hotspot       = "info"
todo-in-code       = "off"        # equivalent to disabled = ["todo-in-code"]
```

Accepted values: `error | warn | info | hint | off`.

The rule-name list is validated at load time — typos surface as
`error: unknown lint rule 'unbounded-cahnnel' — did you mean 'unbounded-channel'?`.

## Per-rule configuration

Rules with parameters live under `[lint.rules.<rule_name>]`:

```toml
[lint.rules.cbgr-hotspot]
loop-iteration-threshold = 1000
hot-deref-threshold      = 50
exempt-fn-attribute      = "@hot"

[lint.rules.large-copy]
size-threshold-bytes = 256
exempt-types         = ["UserId", "Hash", "Span"]

[lint.rules.max-fn-lines]
soft-limit          = 80
hard-limit          = 200
exempt-fn-attribute = "@long_fn_ok"

[lint.rules.max-cognitive-complexity]
threshold           = 15
exempt-fn-attribute = "@complex_ok"

[lint.rules.todo-in-code]
exempt-tags         = ["TODO(release)"]
require-issue-link  = true              # require TODO(#1234) form

[lint.rules.unbounded-channel]
exempt-modules      = ["test.fixtures", "core.runtime.*"]

[lint.rules.shadow-binding]
allow-shadow-of-loop-var = true
allow-mut-shadow         = false

[lint.rules.unused-import]
report-glob-imports      = true         # `mount foo.*` matching nothing

[lint.rules.missing-error-context]
required-fns        = ["?", "Result.context"]

[lint.rules.public-api-must-have-doc]
require-since-tag    = false
require-example-block = false
```

Each rule documents its options under `verum lint --explain
<rule>`. Unknown keys inside a known rule's section are errors.

## Per-file overrides

Glob (or substring) match against the relative path:

```toml
[lint.per_file_overrides]
"tests/**"          = { allow = ["unused-result", "todo-in-code"] }
"core/intrinsics/*" = { allow = ["deprecated-syntax"], deny = ["unsafe-ref-in-public"] }
"benches/**"        = { allow = ["redundant-clone"] }
```

Each override accepts the same keys as the top-level: `allow`,
`deny`, `warn`, `disable`, `include` (replaces parent), `exclude`.

## Profiles

Named profiles are selected via `verum lint --profile <name>` (or
the `VERUM_LINT_PROFILE` env var). Profiles inherit by default and
can override any top-level key:

```toml
[lint.profiles.ci]
extends                  = "strict"
auto_fix                 = "off"
treat_warnings_as_errors = true
output.format            = "sarif"

[lint.profiles.dev]
extends                  = "recommended"
auto_fix                 = "safe-only"

[lint.profiles.legacy]
extends                  = "relaxed"
include                  = ["src/legacy/**/*.vr"]
public_must_have_doc     = false
```

This mirrors `[verify.profiles.<name>]`.

## Architecture / layering

Layering and ban lists turn module-import constraints into
mechanically-enforced rules:

```toml
[lint.architecture]
strict_layering = true                 # error on any banned import
report_metrics  = true                 # surface fan-in / fan-out hints

[lint.architecture.layers]
core    = { allow_imports = ["core", "std"] }
domain  = { allow_imports = ["core", "std", "domain"] }
adapter = { allow_imports = ["core", "std", "domain", "adapter"] }
ui      = { allow_imports = ["core", "std", "domain", "adapter", "ui"] }

[lint.architecture.bans]
# direction-aware: "X cannot import from Y"
"app.ui"      = ["app.persistence", "app.network"]
"core.crypto" = ["core.testing"]
```

Resolution: every `mount X.Y.Z` is matched against the rules of the
importing file's layer plus any explicit ban. Violations surface as
`architecture-violation` lint hits.

## Naming conventions

```toml
[lint.naming]
fn        = "snake_case"
type      = "PascalCase"
const     = "SCREAMING_SNAKE_CASE"
variant   = "PascalCase"
field     = "snake_case"
module    = "snake_case"
generic   = "PascalCase"

[lint.naming.exempt]
fn   = ["__init", "drop_impl"]
type = ["I32", "F64"]                  # FFI types match foreign convention
```

Recognised values: `snake_case`, `kebab-case`, `PascalCase`,
`camelCase`, `SCREAMING_SNAKE_CASE`, `lowercase`, `UPPERCASE`.
Unrecognised values are config-load errors.

## Verum-unique policy blocks

These blocks are the linter's killer feature — no other language has
them because no other language exposes refinement types, a context
system, capabilities, and a tiered memory model at the type level.

### `[lint.refinement_policy]`

```toml
[lint.refinement_policy]
public_api_must_refine_int        = true   # public fns: Int → Int{ … }
public_api_must_refine_text       = false
require_verify_on_refined_fn      = true   # refined params imply @verify
disallow_redundant_refinements    = true   # `Int{ true }` etc.
disallow_post_hoc_refinement      = false
```

### `[lint.capability_policy]`

```toml
[lint.capability_policy]
require_cap_for_unsafe   = true            # `unsafe { … }` ⇒ @cap declaration
require_cap_for_ffi      = true
require_cap_for_io       = false
unauthorised_cap_use     = "error"
allowed_caps             = ["fs.read", "fs.write", "net.outbound"]
```

### `[lint.context_policy]`

```toml
[lint.context_policy]
allow_io_in_pure_modules = false

[lint.context_policy.modules]
"core.*"        = { forbid = ["Database", "Logger", "Clock"] }
"core.math.*"   = { forbid_all = true }
"app.handlers"  = { allow = ["Database", "Logger", "Tracing", "Auth"] }
```

The keys `forbid`, `allow`, `forbid_all` mirror VPN-style explicit
lists. Resolution follows manifest-section glob precedence (more-
specific path wins).

### `[lint.cbgr_budgets]`

```toml
[lint.cbgr_budgets]
default_check_ns = 15

[lint.cbgr_budgets.modules]
"app.handlers.*" = { max_check_ns = 30 }
"core.runtime.*" = { max_check_ns = 0 }    # 0 ⇒ &checked / &unsafe required
```

Read by `cbgr-hotspot`. When profiler data is available
(`target/profile/last.json`), the lint compares the measured cost to
the budget; otherwise falls back to a static estimate.

### `[lint.verification_policy]`

```toml
[lint.verification_policy]
public_must_have_verify       = true       # public fn ⇒ @verify(...) required
default_strategy_for_lint     = "fast"     # what mode the auto-suggest uses
```

## Documentation policy

```toml
[lint.documentation]
public_must_have_doc      = true
public_must_have_example  = false          # heavy lift — opt in
example_must_compile      = true           # /// @example blocks must `verum check`
```

## Style policy beyond naming

```toml
[lint.style]
max_line_length             = 100
max_fn_lines                = 80
max_fn_params               = 5
max_match_arms              = 12
max_cognitive_complexity    = 15
trailing_whitespace         = "error"
```

## Severity / output / fix policy

```toml
[lint.policy]
auto_fix                  = "safe-only"    # off | safe-only | all | manual
max_issues_per_file       = 50
treat_warnings_as_errors  = false
sort_issues_by            = "severity"     # severity | path | rule
group_by                  = "rule"         # rule | file | layer
emit_disabled_summary     = true
error_on_unknown_rule     = true           # typo guard

[lint.output]
format     = "pretty"        # pretty | json | sarif | github-actions | tap
colour     = "auto"
file       = ""              # "" = stdout
```

`auto_fix` levels:

- `off` — never apply, just suggest in the output.
- `safe-only` (default) — apply rules that are formally
  proven not to change semantics (whitespace, redundant clone, glob-
  to-explicit imports).
- `all` — apply every rule that has a `suggestion` field. May reformat
  for readability; review the diff.
- `manual` — emit a unified diff to `target/lint/fixes.diff` for the
  user to apply.

## In-source attributes

Override for one item without touching `verum.toml`:

```verum
@allow(unused-import, reason = "needed by derive macro")
mount stdlib.derive.*;

@deny(todo-in-code)
public fn ship_critical() { … }

@warn(deprecated-syntax)
fn experiment() { … }
```

`reason = "..."` is required when `require_allow_reason = true`
(default in `strict` preset). The reason ends up in `--format json`
output so reviewers see *why* a lint was silenced.

Attribute scope:

- on a fn → covers the function body
- on a `type` → covers the type and any `implement` blocks attached
  to it
- on a `module` declaration → covers every item in the file

## Custom rules

Two flavours: **regex** rules (text-scan — fast, fuzzy, useful for
catching string conventions like TODO formats) and **AST-pattern**
rules (AST-aware, strictly more precise — they walk the parsed
module so they cannot fire on substrings inside string literals or
comments). A rule provides exactly one of `pattern` or
`[lint.custom.ast_match]`.

### Regex rules

```toml
[[lint.custom]]
name        = "no-todo-without-issue"
pattern     = "\\bTODO(?!\\(#\\d+\\))"
message     = "TODO must reference an issue: TODO(#1234)"
level       = "error"
paths       = ["src/**"]
exclude     = ["src/legacy/**"]
suggestion  = "TODO(#XXXX)"   # auto-fix replacement (optional)
```

### AST-pattern rules

```toml
# 1. Method-call match: any `.method(...)` invocation.
[[lint.custom]]
name        = "no-unwrap-in-prod"
description = "use `?` or `expect(\"why\")` instead of unwrap()"
severity    = "error"
paths       = ["src/**"]
[lint.custom.ast_match]
kind   = "method_call"
method = "unwrap"

# 2. Free-call match: dotted path callee.
[[lint.custom]]
name        = "no-direct-panic"
description = "panics belong behind a refinement-checked precondition"
severity    = "warn"
[lint.custom.ast_match]
kind = "call"
path = "panic"

# 3. Attribute match: any item with this @attribute.
[[lint.custom]]
name        = "no-deprecated"
description = "@deprecated items must be removed before release"
severity    = "warn"
[lint.custom.ast_match]
kind = "attribute"
name = "deprecated"

# 4. Unsafe-block match: any `unsafe { ... }` block.
[[lint.custom]]
name        = "no-unsafe-blocks-in-app"
description = "unsafe is reserved for the runtime / FFI bridges"
severity    = "error"
paths       = ["src/app/**"]
[lint.custom.ast_match]
kind = "unsafe_block"
```

The four `kind` values exhaustively cover the AST shapes most teams
need — method calls, free calls, attribute checks, and `unsafe`
blocks. Each rule walks the parsed module via `verum_ast::Visitor`
and emits diagnostics under its `name`, so the same `[lint.severity]`,
per-file overrides, `@allow(...)` attributes, and `--severity` filter
that built-in rules use applies uniformly to user rules.

| Field | Required | Meaning |
|-------|----------|---------|
| `name` | yes | rule name (kebab-case, no built-in conflicts) |
| `pattern` | one of pattern / ast_match | PCRE-flavoured regex |
| `ast_match.kind` | one of pattern / ast_match | `method_call \| call \| attribute \| unsafe_block` |
| `ast_match.method` | for `method_call` | the method name (e.g. `"unwrap"`); empty matches any method |
| `ast_match.path` | for `call` | dotted callee path (e.g. `"core.unsafe.from_raw"`); empty matches any free call |
| `ast_match.name` | for `attribute` | attribute name without `@` (e.g. `"deprecated"`) |
| `message` / `description` | yes | what to display |
| `level` / `severity` | no | `error \| warn \| info \| hint`; default `warn` |
| `paths` | no | glob includes |
| `exclude` | no | glob excludes |
| `suggestion` | no | replacement text for `--fix` (regex rules only) |

## Presets

Built-in `extends` values. Each preset fills the severity map from
the table below; explicit `[lint.severity]` entries always win over
preset choices, so `extends = "strict"` and
`severity.deprecated-syntax = "warn"` keep strict everywhere except
that single rule.

| Preset | Behaviour |
|--------|-----------|
| `minimal` | Only `Error`-level rules survive at error; everything else is `Off`. Useful when porting legacy code into Verum without a flood of warnings. |
| `recommended` *(default)* | Each rule keeps its built-in level. Status quo behaviour when no preset is set. |
| `strict` | Every error stays an error; **Safety** and **Verification** warnings are *promoted to errors*; everything else keeps its level. CI-grade. |
| `relaxed` | Errors stay errors; warnings → info; info → hint. Useful as an IDE-only "suggestion mode" without breaking the build. |

The full mapping for the 22 built-in rules:

| Rule | category | default | minimal | recommended | strict | relaxed |
|------|---------|---------|---------|------------|--------|---------|
| `missing-context-decl` | safety | error | error | error | error | error |
| `deprecated-syntax` | style | error | error | error | error | error |
| `mutable-capture-in-spawn` | safety | error | error | error | error | error |
| `empty-refinement-bound` | verification | error | error | error | error | error |
| `unchecked-refinement` | verification | warn | off | warn | error | info |
| `unused-import` | style | warn | off | warn | warn | info |
| `unnecessary-heap` | performance | warn | off | warn | warn | info |
| `missing-error-context` | safety | warn | off | warn | error | info |
| `large-copy` | performance | warn | off | warn | warn | info |
| `unused-result` | safety | warn | off | warn | error | info |
| `missing-cleanup` | safety | warn | off | warn | error | info |
| `unbounded-channel` | performance | warn | off | warn | warn | info |
| `missing-timeout` | safety | warn | off | warn | error | info |
| `redundant-clone` | performance | warn | off | warn | warn | info |
| `empty-match-arm` | style | warn | off | warn | warn | info |
| `todo-in-code` | style | warn | off | warn | warn | info |
| `unsafe-ref-in-public` | safety | warn | off | warn | error | info |
| `cbgr-hotspot` | performance | info | off | info | info | hint |
| `single-variant-match` | style | hint | off | hint | hint | hint |
| `missing-type-annotation` | style | hint | off | hint | hint | hint |
| `redundant-refinement` | verification | hint | off | hint | hint | hint |
| `shadow-binding` | style | info | off | info | info | hint |

Implementation: see `LintPreset::level_for` in
`crates/verum_cli/src/commands/lint.rs`.

## Precedence stack

When the linter resolves the effective severity for `(rule, file,
item)`, it walks this list top-down — the highest matching rule
wins:

1. **CLI flag** — `-D rule`, `-W rule`, `-A rule`, `-F rule`.
2. **In-source attribute** — `@allow`, `@deny`, `@warn` on the item
   or any enclosing scope.
3. **Active profile** — selected via `--profile <name>`.
4. **Per-file override** — `[lint.per_file_overrides]`.
5. **Per-rule severity** — `[lint.severity]`.
6. **Allow / deny / warn / disable lists** — top-level `[lint]`.
7. **Extends preset** — `recommended` / `strict` / etc.
8. **Built-in default** — the rule's intrinsic level.

Empty / unset entries fall through. Explicit `off` stops the cascade
at that layer.

## CLI surface

Beyond the existing `--fix` and `--deny-warnings`:

```bash
verum lint --profile ci                  # active profile
verum lint --explain unused-import       # docs + examples for a rule
verum lint --list-rules                  # every known rule + category
verum lint --validate-config             # config-only validation, exits 0/non-0
verum lint --since origin/main           # only files changed vs ref
verum lint --severity error              # report at this level or higher
verum lint --format sarif > x.sarif      # machine-readable
verum lint --format github-actions       # ::warning file=…::msg annotations
```

`-D`, `-W`, `-A`, `-F` from `verum build` continue to work as
single-rule overrides.

## Validation

Config errors must be helpful. The loader validates, in order:

1. **Schema** — every key recognised; unknown keys emit
   `error: unknown lint config key 'auto_ix' — did you mean 'auto_fix'?`.
2. **Rule-name** — every referenced rule must be a known rule. Typos
   include suggestions.
3. **Threshold ranges** — negative or out-of-range values rejected.
4. **Profile cycles** — `extends` cycles between profiles caught with
   a cycle trace.
5. **Layer references** — bans referencing undeclared layers warn.

`verum lint --validate-config` runs only the validator. Exit code is
0 / non-zero — usable in pre-commit hooks and CI.

## Sample configs

### A small library — minimum ceremony

```toml
[lint]
extends = "recommended"

[lint.per_file_overrides]
"tests/**" = { allow = ["unused-result"] }
```

### A production application — strict

```toml
[lint]
extends = "strict"

[lint.severity]
cbgr-hotspot = "error"           # hot paths must be tier-promoted

[lint.refinement_policy]
public_api_must_refine_int   = true
require_verify_on_refined_fn = true

[lint.capability_policy]
require_cap_for_unsafe = true
require_cap_for_ffi    = true

[lint.context_policy.modules]
"core.*"      = { forbid = ["Database", "Logger", "Clock"] }
"core.math.*" = { forbid_all = true }

[lint.architecture]
strict_layering = true
[lint.architecture.layers]
core    = { allow_imports = ["core", "std"] }
domain  = { allow_imports = ["core", "std", "domain"] }
adapter = { allow_imports = ["core", "std", "domain", "adapter"] }

[lint.documentation]
public_must_have_doc     = true
public_must_have_example = false

[lint.profiles.ci]
treat_warnings_as_errors = true
output.format            = "sarif"
auto_fix                 = "off"
```

### A research codebase — IDE-only suggestions

```toml
[lint]
extends = "relaxed"

[lint.severity]
todo-in-code = "off"

[lint.per_file_overrides]
"experiments/**" = { allow = ["redundant-clone", "shadow-binding"] }
```

## See also

- **[Reference → CLI commands → verum lint](/docs/reference/cli-commands#verum-lint)** — every flag.
- **[Reference → verum.toml](/docs/reference/verum-toml)** — full manifest schema.
- **[Reference → Attribute registry](/docs/reference/attribute-registry)** — `@allow` / `@deny` / `@warn`.
- **[Tooling → CLI](/docs/tooling/cli)** — the quick reference.

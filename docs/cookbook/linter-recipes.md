---
sidebar_position: 36
title: Linter recipes
---

# Linter recipes

Copy-paste-ready snippets for getting `verum lint` into the
day-to-day developer flow. For the `[lint]` schema see
**[Reference → Lint configuration](/docs/reference/lint-configuration)**;
for individual rule semantics see
**[Reference → Lint rules](/docs/reference/lint-rules)**.

## Local "what's broken right now"

```bash
verum lint                        # 20-rule sweep, default severity
verum lint --format json | jq .   # NDJSON for ad-hoc analysis
verum lint --explain todo-in-code # one rule's full doc
verum lint --list-rules           # everything available
```

## Pre-commit hook

The fast path — one command, no copy-paste:

```bash
verum hooks install
```

That writes `.git/hooks/pre-commit` running
`verum lint --since HEAD --severity error` and `verum fmt --check`.
The script carries a header marker so `verum hooks uninstall` only
removes hooks we wrote — a hand-authored hook is never silently
clobbered.

```bash
verum hooks status      # is the hook installed? is it ours?
verum hooks install --force   # overwrite an existing hook
verum hooks uninstall   # remove (only if we own it)
```

When you need a custom hook (extra checks, project-specific
gates), here's the manual recipe:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Exit 0 fast if no .vr files changed
if ! git diff --cached --name-only | grep -q '\.vr$'; then
    exit 0
fi

# 1. Schema validation — fail fast on bad verum.toml
verum lint --validate-config

# 2. Run the linter at error severity only — warnings / info don't
#    block commits, but they do show up in the editor.
verum lint --severity error

# 3. Optional: warning budget for gradual cleanup
verum lint --severity warn --max-warnings 50
```

Save as `.git/hooks/pre-commit` and `chmod +x` it.

## Pin a project to "strict" mode

`verum.toml`:

```toml
[lint]
extends = "strict"

# Allow a small set of carve-outs for known patterns.
[lint.severity]
todo-in-code = "warn"        # don't fail CI on TODOs

[lint.per_file_overrides]
"tests/**"   = { allow = ["unused-result", "todo-in-code"] }
"benches/**" = { allow = ["redundant-clone"] }
```

`extends = "strict"` promotes every Safety / Verification warning to
an error. The override carves out `tests/` and `benches/` so test-only
patterns don't break the build.

## CI gate (GitHub Actions)

```yaml
- name: Verify lint config
  run: verum lint --validate-config

- name: Run linter (annotations on PR)
  run: verum lint --format github-actions

- name: SARIF for code-scanning
  if: github.event_name == 'pull_request'
  run: verum lint --format sarif > target/lint.sarif
- uses: github/codeql-action/upload-sarif@v3
  if: github.event_name == 'pull_request'
  with: { sarif_file: target/lint.sarif }
```

`--format github-actions` emits `::error file=…,line=N::msg`
annotations that show up *inline on the PR diff* in the GitHub UI —
no extra reporter step needed.

## CI gate (GitLab)

```yaml
lint:
  script:
    - verum lint --validate-config
    - verum lint --format json > lint.json
  artifacts:
    when: always
    reports:
      codequality: lint.json
```

## Migrating a legacy codebase

Step 1 — start from `minimal` so only hard errors surface:

```toml
[lint]
extends = "minimal"
```

Step 2 — flip rules on one at a time:

```toml
[lint]
extends = "minimal"

[lint.severity]
unused-import         = "warn"        # add when ready to fix imports
deprecated-syntax     = "error"       # was already error in minimal
empty-refinement-bound = "error"      # AST-driven, zero false positives
```

Step 3 — once the codebase is clean, switch to `recommended`:

```toml
[lint]
extends = "recommended"
```

## Auto-fix the easy wins

```bash
verum lint --fix                  # apply every fixable rule's suggestion
verum lint --fix && git diff      # review the result
```

Today the biggest beneficiary is `deprecated-syntax`:

- `Box::new(x)` → `Heap(x)`
- `Vec<T>` → `List<T>`
- `String` → `Text`
- `::` → `.`

## Suppressing one issue

Use `@allow / @deny / @warn` in source for the call-site case — when
the suppression belongs *with* the code it explains, not in a config
file far away:

```verum
@allow("unused-import", reason = "needed by derive macro to see it")
mount stdlib.derive.*;

@deny("todo-in-code")
public fn release_critical_path() { /* … */ }

@warn("deprecated-syntax")
fn experimental_path() { /* … */ }
```

The first arg is a **string literal** (rule names use kebab-case
which can't parse as a Verum identifier). Suppression scope is the
item's source span; most-specific (smallest) match wins on overlap;
in-source attributes always beat `[lint.severity]` and CLI flags.
See **[Reference → Attribute registry → Lint suppression](/docs/reference/attribute-registry#lint-suppression--promotion)**.

You can also suppress at the rule level via config:

```toml
[lint.severity]
unused-import = "off"       # globally
```

…or per-file, when the noise is concentrated in a known set of
paths (legacy modules, generated glue, integration tests):

```toml
[lint.per_file_overrides]
"src/legacy/**"  = { allow = ["unused-import", "deprecated-syntax"] }
"tests/**"       = { allow = ["unused-result", "todo-in-code"] }
"src/codegen/glue.vr" = { allow = ["unused-import"] }
```

Glob patterns understand `**`, `**/`, `/**`, `*` (single segment),
and a generic substring `*`. When several patterns match the same
file, the most specific (longest) one wins.

## Catching refinement-type traps

Two AST-driven rules find bugs no other linter sees:

```verum
type Always is Int{ true };                  // hint: redundant-refinement
type Empty  is Int{ it > 100 && it < 50 };   // ERROR: empty-refinement-bound
//                                              bound `101..=49` is empty
```

`Empty` is unconstructable — every call site that thought it had a
value of `Empty` is dead code. Catching this at lint time is much
cheaper than at runtime.

## Author a project-local AST rule

Want to forbid `.unwrap()` in production code without writing a Rust
pass? `[lint.custom.ast_match]` describes the AST shape declaratively:

```toml
# verum.toml
[[lint.custom]]
name        = "no-unwrap-in-prod"
description = "use `?` or `expect(\"why\")` instead of unwrap()"
severity    = "error"
paths       = ["src/**"]
exclude     = ["src/legacy/**"]
[lint.custom.ast_match]
kind   = "method_call"
method = "unwrap"
```

Other shapes available out of the box:

```toml
# Forbid every direct `panic(...)` call.
[[lint.custom]]
name        = "no-direct-panic"
severity    = "warn"
description = "panics belong behind a refinement-checked precondition"
[lint.custom.ast_match]
kind = "call"
path = "panic"

# Surface every `@deprecated` item — useful before a release cut.
[[lint.custom]]
name        = "no-deprecated"
severity    = "warn"
description = "@deprecated items must be removed before release"
[lint.custom.ast_match]
kind = "attribute"
name = "deprecated"

# Forbid every `unsafe { ... }` block in the application layer.
[[lint.custom]]
name        = "no-unsafe-blocks-in-app"
severity    = "error"
description = "unsafe is reserved for the runtime / FFI bridges"
paths       = ["src/app/**"]
[lint.custom.ast_match]
kind = "unsafe_block"
```

AST-pattern rules are strictly more precise than regex rules — they
walk the parsed module via `verum_ast::Visitor`, so they will not
fire on text inside string literals or comments. They participate
in `[lint.severity]`, per-file overrides, and `@allow(...)` exactly
like built-in rules.

## Reading lint output programmatically

```bash
verum lint --format json \
  | jq -c 'select(.event == "lint" and .level == "error")' \
  | jq -s '. | length'   # count of errors
```

The schema is stable across releases — see the
[lint configuration § output formats](/docs/reference/lint-configuration#severity--output--fix-policy)
section.

## See also

- **[Reference → Lint configuration](/docs/reference/lint-configuration)** — full schema.
- **[Reference → Lint rules](/docs/reference/lint-rules)** — every rule + example.
- **[Architecture → Lint engine](/docs/architecture/lint-engine)** — internals (text-scan + AST).
- **[Tooling → CLI](/docs/tooling/cli)** — `verum lint` quick reference.

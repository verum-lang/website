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

`.git/hooks/pre-commit`:

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
```

`chmod +x .git/hooks/pre-commit` and you're done.

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

`@allow / @deny / @warn` in source (Phase B.2 — coming):

```verum
@allow(unused-import, reason = "needed by derive macro to see it")
mount stdlib.derive.*;
```

Until then, suppress at the rule level via config:

```toml
[lint.severity]
unused-import = "off"       # globally
```

…or per-file:

```toml
[lint.per_file_overrides]
"src/legacy/derive_macro_glue.vr" = { allow = ["unused-import"] }
```

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

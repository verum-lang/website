---
sidebar_position: 4
title: Troubleshooting
description: Common errors and how to resolve them.
---

# Troubleshooting

Short recipes for common failures. For a specific error code, run
`verum explain V####`.

## Build errors

### `[V3402] refinement violated at call site`

The SMT solver rejected a refinement. Read the counter-example:

```
error[V3402]: refinement violated at call site
   |
 7 |     divide(10, input);
   |            ^^^^^^^^^^
   = obligation: input != 0
   = counter-example: input = 0
```

Fix: narrow the value before the call — `if input != 0 { divide(10, input) }` —
or change the parameter's type.

### `[V5201]: cannot prove reference is safe for &checked T`

Escape analysis failed to promote a `&T` to `&checked T`. Either:
1. Drop the `checked` — accept the 15 ns; *or*
2. Restructure the call so the reference's target is provably local.

### `[V4101]: non-exhaustive patterns`

Add the missing arms. The compiler prints what's missing:

```
note: pattern `Err(ConnectionError::Timeout { .. })` not covered
```

### `[V1001]: `mount` target not found`

Mistyped path, or the dep isn't declared in `Verum.toml`. Run
`verum check` — it validates imports before compiling.

### `error: linking with `cc` failed`

Your platform is missing a linker. On Debian/Ubuntu:
`apt install build-essential`; on Arch: `pacman -S base-devel`; on
macOS: `xcode-select --install`.

## SMT issues

### "The solver timed out"

Default timeout is 5 s per obligation. Causes:
- Unbounded quantifier: `forall x: Int. P(x)` → bound it — `forall x in 0..n. P(x)`.
- Heavy nonlinearity: escalate to `@verify(thorough)` — races Z3
  with CVC5 (whose CAD engine is better at nonlinear arithmetic).
- Cached stale result: `verum clean` and retry.

Increase per-project: `Verum.toml [verify] solver_timeout_ms = 30_000`.

### "Solvers disagreed on obligation"

A portfolio run found the SMT backend disagreeing. Very rare — usually a
solver bug. Report with the SMT-LIB query (`verum verify --emit-smtlib`)
so the Verum team can file it upstream.

### "I can see my obligation is true, but the solver can't"

Three levers:
1. **Add a `@logic` helper** that names the key predicate. The solver
   can reuse the fragment rather than re-deriving it.
2. **Supply a hint via `have`** inside a proof block:
   `have h: x < y by auto;`.
3. **Upgrade to `@verify(certified)`** and write the proof manually.

### "Cannot reflect `@logic fn` — NotReflectable"

The function violated the soundness gate (pure + total + closed).
Check:
- Pure: no IO, no mutation, no context.
- Total: covers every input. Use a `decreases` measure on recursion.
- Closed: no captured free variables from the environment.

See [refinement reflection → limitations](/docs/verification/refinement-reflection).

## Runtime issues

### "UseAfterFreeError"

CBGR caught a dangling reference. The error carries:
- The pointer address.
- The expected vs actual generation + epoch.
- A stack trace at creation and at attempted deref.

Almost always means a `&unsafe T` was held past the lifetime of its
target, or a reference was stored in a static / global and outlived
the allocation. Review the `&unsafe` block's SAFETY comment; make
sure the claimed invariant actually holds.

### "stack overflow"

Deep recursion. Either:
- Rewrite as iteration.
- Increase stack size: `Verum.toml [runtime] stack_size = 4_194_304`.
- Use a trampoline / CPS for mutually-recursive call chains.

### "attempt to panic during panic"

A destructor (`fn drop`) panicked while the process was already
unwinding. Make `drop` infallible: swallow or log errors inside it,
don't propagate.

### "nursery task panicked"

```
NurseryError::Panic { task_name, info }
```

With `on_error: cancel_all`, siblings are cancelled; the nursery
returns the error. Catch with `recover { NurseryError::Panic(_) => ... }`
if the panic is recoverable; otherwise let it propagate.

## Performance issues

### "My hot loop is slow"

Run `verum analyze --escape`:

```
function          total   tier0   tier1   tier2   promoted
tight_loop           48      45       3       0     3/48 (6.3%)
```

A low promotion rate means most `&T` references are doing runtime
checks. Options:
1. Refactor so references don't escape — iteration over a local
   array, for example.
2. Ask for `&checked T` explicitly; the compiler will tell you
   exactly why it can't prove safety.
3. For proven-hot inner loops, `&unsafe T` with a `SAFETY` justifying
   block.

### "Build is slow"

```bash
verum build --timings
```

shows per-phase time. Usual culprits:
- Phase 3a contracts or Phase 4 refinement verification on a large
  file with many `@verify(formal)` functions: scope down what needs SMT,
  or raise `[verify] solver_timeout_ms` only for the functions that
  need it via `[verify.modules.*]`.
- Phase 7 (AOT: VBC → LLVM) on a big crate: increase `codegen_units`
  in `[profile.release]` (more parallelism, slightly less inlining).

### "Release binary too large"

```toml
[profile.release]
optimize = "aggressive"
lto      = "full"
strip    = true
panic    = "abort"
```

Dump the VBC with `verum build --emit-vbc` and inspect
`target/release/*.vbc.txt` for oversized functions
(macro-expansion gone wide is a common cause).

## Toolchain issues

### "verum: command not found" after install

The installer puts the binary at `~/.verum/bin`. Add to `PATH`:

```bash
echo 'export PATH="$HOME/.verum/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### "verum.toml not found"

You're running `verum build` from outside a project directory. Either
`cd` into one, or `--manifest-path path/to/Verum.toml`.

### "LSP not responding"

In your editor, check the log: `VerumLSPLog` command in VS Code, or
`:LspLog` in neovim. Usual causes:
- Wrong `verum` binary on PATH; check `verum --version`.
- Workspace without `Verum.toml`; LSP needs a project root.
- Huge project on first open; initial indexing can take tens of
  seconds.

### "`@verify(certified)` needs a proof term but I didn't supply one"

```
error[V6301]: @verify(certified) requires an explicit proof
   = help: write `proof by <tactic>` or a structured proof block
```

Add one — start with `by auto`, refine from there. See
[verification → proofs](/docs/verification/proofs).

## Packaging issues

### "Cannot publish — checksum mismatch"

Someone else already published this `name@version`. Bump the version
in `Verum.toml` and re-run `verum publish`.

### "Dependency version conflict"

```
error: conflicting versions
   serde = "1.4"  (required by cog-a)
   serde = "2.0"  (required by cog-b)
```

Upgrade cog-a to use serde 2.0 (if available), or pin cog-b to a
serde-1.4-compatible version in `[overrides]`.

## Getting more help

- `verum explain V####` — detailed explanation of an error code.
- [Glossary](/docs/reference/glossary) — every term defined.
- [FAQ](/docs/guides/faq) — common conceptual questions.
- GitHub discussions on the project repository
- IRC / Matrix: #verum on libera.chat

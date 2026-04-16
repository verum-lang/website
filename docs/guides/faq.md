---
sidebar_position: 1
title: FAQ
description: Answers to questions you asked before you installed.
---

# Frequently Asked Questions

## Language

### What is the current stability?

The documented feature set is implemented and tested: refinement
types, dependent types, cubical HoTT, Z3 + CVC5 verification, VBC
interpreter, LLVM AOT — all ship in a single `verum` binary.
1 506 of 1 507 conformance checks pass (99.93 %). Rough edges
remain around newer features (cubical normalisation, MLIR GPU).
Expect early-adopter friction.

### How fast is it?

LLVM-AOT builds run at **0.85–1.0× of equivalent C**. The
[CBGR reference model](/docs/language/cbgr) adds ~15 ns to
non-promoted dereferences — invisible in most code; measurable in
tight loops (where escape analysis typically eliminates it anyway).

### Can I use it for embedded / bare-metal work?

Yes. `Verum.toml` supports `runtime = "embedded"` (stack allocator,
no heap) and `runtime = "no_runtime"` (kernel / bootloader). Direct
syscalls on Linux, libSystem on macOS, kernel32 on Windows — no libc
dependency.

### Does it have garbage collection?

No. CBGR is the memory model: unique ownership (`Heap<T>`),
atomically ref-counted sharing (`Shared<T>`), and borrowed references
(`&T`) that carry a generation counter checked on deref (~15 ns). No
GC pauses.

### What about async?

First-class: `async fn`, `.await`, work-stealing executor, async
channels / mutexes / rwlocks, structured concurrency via `nursery`,
`select` as a keyword expression. See
[async](/docs/stdlib/async).

### Does it work on Windows / macOS / Linux?

All three, plus WASM, embedded, and no-runtime. iOS and Android are
on the roadmap.

---

## Verification

### Is this a theorem prover?

It is *capable of* theorem-prover-level proofs (see
[proofs](/docs/verification/proofs)), but you don't have to use that.
Most code uses [refinement types](/docs/language/refinement-types) +
`@verify(formal)`, which feels like "very strong type checking," not
"theorem proving."

### Do I have to prove everything?

No. Verification is a [spectrum](/docs/philosophy/gradual-verification).
Default is `@verify(static)` — dataflow, CBGR, and refinement
checking without SMT. You opt into `@verify(formal)` or stronger only
where it matters.

### Which SMT solver does it use?

Both Z3 and CVC5, selected per-obligation by capability routing. Z3
handles LIA/bitvectors/arrays; CVC5 handles strings, nonlinear
arithmetic, SyGuS, and finite-model-finding. `@verify(thorough)`
cross-validates. See [SMT routing](/docs/verification/smt-routing).

### What happens when the solver times out?

Default 5 s per obligation. On timeout, the fallback retries with a
different solver. Configurable in `Verum.toml [verify]` via
`solver_timeout_ms` and per-module `[verify.modules."my.module"]`
overrides.

### Can I check proofs of an external library without re-verifying?

Yes — proof-carrying code. A VBC archive embeds `ProofCertificate`s
for its obligations; a consumer verifies the bundle offline without
running the full compiler. See
[proof → PCC](/docs/stdlib/proof#proof-carrying-code--pccvr).

---

## Types

### Do refinement types really have zero runtime cost?

Yes. Every refinement is erased after typechecking. The value is just
an `Int` (or whatever the base type is) at runtime.

### Can I use them for domain modelling?

That's the primary use:

```verum
type Port     is Int  { 1 <= self && self <= 65535 };
type Email    is Text { self.matches(rx#"^[^@\s]+@[^@\s]+\.[^@\s]+$") };
type NonEmpty is List { self.len() > 0 };
```

See [refinement patterns](/docs/cookbook/refinements).

### What's the difference between `List<T>` and `Vec<T>`?

There's no `Vec`. [Semantic honesty](/docs/philosophy/semantic-honesty):
types describe meaning, not layout. `List<T>` is the ordered-
collection meaning. Today's default implementation is a contiguous
growable buffer; tomorrow's might be different — without source
changes.

### Can I still do unsafe low-level stuff?

Yes: `&unsafe T`, `*const T`, `*mut T`, `*volatile T`, `unsafe fn`,
`extern "C"` blocks. Used for FFI, memory-mapped I/O, allocator
implementations, and primitives inside `core::mem`.

---

## Tooling

### IDE support?

Full LSP 3.17. VS Code extension (`verum-lang.verum`), Neovim config,
Emacs `lsp-mode` config in [Installation](/docs/getting-started/installation).
Features: real-time diagnostics with counter-examples, completion,
inlay type hints, CBGR reference-tier hints, refinement hints, quick
fixes.

### Debugger?

`verum dap` implements the Debug Adapter Protocol. Works with any
DAP-compatible front-end (VS Code, nvim-dap, IntelliJ).

### Package registry?

`verum publish` / `verum search` target `registry.verum-lang.org`.
Self-hosting and private registries are supported. Dependency
specifiers accept registry, git, local path, and content-addressed
(IPFS).

### Can I write one binary that calls out to C?

Yes. `extern "C"` block with a boundary contract (preconditions,
memory effects, thread safety, ownership transfer, error protocol).
See [FFI](/docs/language/ffi).

### Where's `cargo add`?

`verum add <dep>`. Full toolchain commands: see
[CLI reference](/docs/reference/cli-commands).

---

## Learning

### Where do I start?

1. [Installation](/docs/getting-started/installation) (`curl ... | sh`).
2. [Hello, World](/docs/getting-started/hello-world) (5 minutes).
3. [Language tour](/docs/getting-started/tour) (10 minutes).
4. Pick a [cookbook recipe](/docs/cookbook) that looks like your task.
5. Read [philosophy](/docs/philosophy/principles) when you want to
   understand *why*.

### I know Rust / TypeScript / Go. Where's the quick-reference table?

- [From Rust](/docs/migrating/from-rust)
- [From TypeScript](/docs/migrating/from-typescript)
- [From Go](/docs/migrating/from-go)

### What's the recommended study order for the advanced features?

1. **Refinement types** — used everywhere; start there.
2. **Context system** — `using [...]` replaces globals.
3. **Structured concurrency** — `nursery`, `select`.
4. **Three-tier references** — CBGR is invisible at first; when
   performance matters, promote to `&checked T`.
5. **`@verify(formal)`** — annotate one critical function; see what the
   solver tells you.
6. **Dependent types / cubical** — reach for these when you have a
   concrete reason.

---

## Design

### Why no `null`?

Because nullable-by-default leads to billion-dollar mistakes.
`Maybe<T>` makes absence an explicit case that the compiler forces
you to handle.

### Why three reference tiers?

Because one tier either costs 15 ns always (too expensive for hot
loops) or zero always (too unsafe for default). Escape analysis
automatically promotes `&T` to `&checked T` when provably safe; you
keep the ergonomics, the compiler does the work.

### Why `@` not `!` for macros?

Because `!` in Rust is Verum's logical NOT, and there are no macro
arguments to pass positionally; the `@` prefix is consistent with
other compile-time constructs (`@derive`, `@cfg`, `@verify`, and
user-defined macros `@sql_query`).

### Why name the package manager `cog`?

Because "package" is overloaded, "crate" is taken, and a **cog** is
a thing that meshes with others to drive larger machinery. The
metaphor earned its keep.

### Why Latin?

*Verum* means "truth." The language is built around making program
truths mechanically checkable. And it's the shortest distinctive
name we could find.

---

## See also

- **[Troubleshooting](/docs/guides/troubleshooting)** — when things
  go wrong.
- **[Best practices](/docs/guides/best-practices)** — how experienced
  users structure code.
- **[Philosophy](/docs/philosophy/principles)** — the design rationale.

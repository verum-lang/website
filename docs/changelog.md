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

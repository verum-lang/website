---
sidebar_position: 99
title: VBC defect-class catalogue
description: Recurring VBC codegen defect patterns surfaced by the stdlib conformance suite, plus the established source-side fix disciplines for each.
status: regression-only
status_detail: Living document. Each entry is an active defect class with a source-side workaround pattern. Multi-day VBC codegen fixes track at the verum_vbc layer; until those land, the workarounds keep the stdlib conformance suite green.
---

# VBC Defect-Class Catalogue

A living catalogue of recurring VBC codegen defect patterns that
surface as the stdlib conformance suite (`core-tests/`) is exercised
end-to-end. Each entry documents the **stable trigger** (the source-
side pattern that causes the defect), the **manifestation** (the
runtime symptom), and the **established fix discipline** (a source-
side workaround that closes the surface without waiting on the
underlying VBC codegen fix).

The catalogue is the single source of truth for "if you see this
symptom, look for this pattern, and apply this discipline" — both
for contributors writing new stdlib code and for the conformance
suite itself when it identifies new failure modes.

## 1. `extend_from_slice` intrinsic-chain SIGSEGV

| Field | Value |
|---|---|
| Defect class id | **EXTSLICE-1** |
| Stable trigger | `out.extend_from_slice(&src[start..end])` inside a stdlib helper function reachable from a user test module. |
| Manifestation | `verum: internal compiler error — fatal signal SIGSEGV (11)` inside `llvm::SmallVectorBase<unsigned long long>::grow_pod` during the precompile cascade for the stdlib module. |
| Probe | Call the helper from a user `@test`. SIGSEGV at compile time. |
| Fix discipline | Replace with byte-by-byte `out.push(src[i])` walk: `let mut __i = start; while __i < end { out.push(src[__i]); __i = __i + 1; }`. |
| Examples | net/cidr.slice_text (commit `be64f4e1e`), net/http_range.slice_range, net/http_cache.slice_vec, net/content_negotiation.trim_ws, net/link_header.slice_text, net/uri_template literal collection, encoding/cbor encode + decode, encoding/jcs push_bytes, encoding/msgpack push_all. |

## 2. `b"literal"` byte-string-literal SIGSEGV

| Field | Value |
|---|---|
| Defect class id | **BSTRLIT-1** |
| Stable trigger | `push_bytes(&mut out, b"literal")` or `out.extend_from_slice(b"literal")` to emit a fixed ASCII prefix. |
| Manifestation | Same LLVM SmallVector SIGSEGV as EXTSLICE-1. |
| Probe | Call the function that emits the prefix from a user test. |
| Fix discipline | Inline the literal byte-by-byte: `out.push(':' as Byte); out.push(':' as Byte); ...`. For 4-8 byte prefixes the cost is negligible vs the dispatch overhead. |
| Examples | ipv6_canonical.format_v4_mapped (`b"::ffff:"` → 7 individual pushes; commit `8233fad28`), http_range.encode_unsatisfiable (`b"bytes */"`), http_range.encode_content_range (`b"bytes "`), link_header.format_link_header (`b", "` + `b"; "`). |

## 3. Closure-via-`?`-chain on `Result` / `Maybe`

| Field | Value |
|---|---|
| Defect class id | **CLOSURE-RESULT-1** |
| Stable trigger | `parse_int(bytes).ok_or_else(|| StdlibError.Malformed(...))?` or `Other.parse(text).map_err(|e| MyError.Wrap(e))?` — closure inside a `?`-chained `Result`/`Maybe` conversion. |
| Manifestation | LLVM SmallVector SIGSEGV at the closure-desugaring + `?`-operator surface. |
| Probe | Same — call the wrapping function from a user test. |
| Fix discipline | Replace closure with explicit `match`: `match parse_int(bytes) { Maybe.Some(v) => v, Maybe.None => return Err(StdlibError.Malformed(...)) }`. |
| Examples | cidr.parse prefix_len lookup (commit `f649312c6`), ipv6_canonical.parse Ipv6Addr.parse wrap (same commit). |

## 4. Qualified `Result.Ok(`/`Result.Err(` match arms

| Field | Value |
|---|---|
| Defect class id | **QUALRESULT-1** |
| Stable trigger | `match r { Result.Ok(v) => ..., Result.Err(e) => assert(e.kind == X) }` — qualified arm form. The destructured binding goes through a wrong type path, corrupting subsequent field reads on the matched value. |
| Manifestation | Field-access on the bound variable returns corrupted data (e.g. `e.kind == X` returns `false` even when `e.kind is X` returns `true`). Originally surfaced as URL-8 (test_parse_empty_rejects). |
| Probe | Write the same test with bare `Ok(...)/Err(...)` arms — passes. With qualified `Result.Ok(...)/Result.Err(...)` — fails. |
| Fix discipline | Use bare `Ok(...)` / `Err(...)` match arms. `Result` is special-cased by the type checker; it isn't at risk of bare-variant first-wins collision. Bulk sweep landed across 82 stdlib test files in commit `74c074176` (718 sites). |
| Examples | URL-8 close (commit `8cf21a8be`); stdlib-wide sweep (commit `74c074176`). |

## 5. Transitive `&mut self` propagation through nested method calls

| Field | Value |
|---|---|
| Defect class id | **TRANSIENTMUT-1** |
| Stable trigger | `fn outer(&mut self, ...) { ... self.inner_method(...); }` where `inner_method` mutates `self.field`. The mutation is performed but doesn't persist after `outer` returns — VBC codegen loses the propagation. |
| Manifestation | `add_text` returns `Ok(())` but `set.len()` remains 0; subsequent reads on the supposedly-mutated field see the pre-call state. |
| Probe | Call `outer` then check the field; compare with the in-place equivalent that doesn't nest the call. |
| Fix discipline | Inline the inner mutation directly in `outer`: `self.field.push(c)` instead of `self.inner_method(c)`. |
| Examples | CidrSet.add_text (commit `92480c76b`) — replaced `self.add(c)` with `self.blocks.push(c)`. |

## 6. Chained `.wrapping_add(...)` on primitive types

| Field | Value |
|---|---|
| Defect class id | **CHAINMETHOD-1** |
| Stable trigger | `a.wrapping_add(b).wrapping_add(c).wrapping_add(d)` on `UInt32` (or analogous primitive). The chained dispatch misidentifies the receiver type as a generic iterator type (`SkipWhileIter`), producing "method not found" panic + dispatch retry loop. |
| Manifestation | `runtime: Panic { message: "method 'UInt32.wrapping_add' not found on receiver of runtime kind SkipWhileIter" }` OR `runtime: StackOverflow { depth: 16384, max_depth: 16384 }` (when the retry loop fires). |
| Probe | Call any function containing the chain (e.g. SHA-1/SHA-256/SHA-512 compress block from `Sha1.finalize()`). |
| Fix discipline | Break the chain into sequential `let`-bindings, one per `.wrapping_add` call: `let t1 = rotl32(a, 5); let t2 = t1.wrapping_add(f); let t3 = t2.wrapping_add(e); ...`. Each call now has a single-type receiver context. |
| Examples | Sha1.compress_block (commit `92a85244b`), Sha256.compress_block (commit `400dccb78`), Sha512.compress_block (commit `400dccb78`). |
| Residual | Workaround is partial — applied broadly but WS-6 (websocket accept_key) still stack-overflows post-rebuild; the actual dispatch defect is in a different code path within Sha1 (candidate: `[0; 64]` array initialization producing SkipWhileIter, or hot-loop array indexing). Multi-day VBC codegen investigation required for the underlying defect. |

## 7. `for x in slice` lowering SIGSEGV (CLOSED 2026-05-14)

| Field | Value |
|---|---|
| Defect class id | **SLICEITER-1** |
| Status | **CLOSED** at compiler layer 2026-05-14 (commit `7cbd0585d`). Discipline pinned for stdlib contributors. |
| Stable trigger | `for x in slice` where `slice` is a bare `&[T]` slice value (NOT `slice.iter()`). The `for x in &[T]` lowering tripped an LLVM `SmallVectorBase::grow_pod` SIGSEGV at codegen time. |
| Manifestation | LLVM SmallVector SIGSEGV during precompile cascade — same surface as EXTSLICE-1 but rooted in IR-emission for slice-iter lowering rather than List.extend_from_slice intrinsic dispatch. |
| Probe | `grep -rn "for [a-z_]+ in [a-z_]+\.as_bytes()\|for [a-z_]+ in bytes\b" core/` MUST return zero broken patterns at every commit. |
| Fix discipline | Use indexed-while: `let n = slice.len(); let mut i: Int = 0; while i < n { let x = slice[i]; ... ; i = i + 1; }`. Routing through `for x in slice.iter()` is also safe because it goes through the custom-iterator path (has_next/next CallM). |
| Examples | `Hasher.write` + `Formatter.write_bytes` migrated to indexed-while pattern (commit `7cbd0585d`) — closed the `Text.rfind` family transitively. |

## 8. Deferred-init `let x: T;` assigned in branch arms (CLOSED 2026-05-29)

| Field | Value |
|---|---|
| Defect class id | **DEFERRED-INIT-1** |
| Status | **CLOSED** at compiler layer 2026-05-29. |
| Stable trigger | A binding declared without an initializer (`let x: T;`) and then assigned in **more than one** mutually-exclusive control-flow arm (both legs of an `if`/`else`, or several `match` arms). |
| Manifestation | The function is lenient-compiled to a panic-stub; at runtime: `runtime: Panic { message: "[lenient] <fn> compiled to panic-stub: cannot assign to immutable variable: <name>" }`. |
| Root cause | VBC codegen tracked definite-assignment with a single flat `is_initialized` flag that was not branch-scoped. The first arm's assignment flipped it `true`; the sibling arm's assignment then tripped the immutable-reassignment guard. |
| Fix | Added a `declared_uninit` flag to `RegisterInfo` (`crates/verum_vbc/src/codegen/registers.rs`), set at the deferred-init declaration in `compile_let` (`statements.rs`). The guard in `expressions.rs` now reads `!is_mutable && is_initialized && !declared_uninit`, exempting deferred-init bindings while still rejecting reassignment of a normal `let x = v;` immutable. |
| Examples | `core/net/http2/hpack.vr::HpackDecoder.decode_literal` (`let name: Text;` / `let start: Int;`); also unblocks `core/database/mysql/wkb_decoder.vr` (3 sites). Pinned by `core-tests/net/http2/hpack/{unit_test,regression_test}.vr`. |

## 9. Small-string `Text.as_bytes()` across a call boundary SIGSEGV (OPEN)

| Field | Value |
|---|---|
| Defect class id | **TEXT-SMALLSTR-ASBYTES-1** |
| Status | **OPEN** — tracked. Encode-path tests gated as `@ignore` "ENCODE-1". |
| Stable trigger | `Text.as_bytes()` on a **small** (NaN-box-inline, ≤ 6 byte) Text, where the resulting `&[Byte]` is passed as an argument to another function. |
| Manifestation | `verum: internal compiler error — fatal signal SIGSEGV (11)`. |
| Probe | `let f = HeaderField.new("x","y"); encode_string(f.name.as_bytes(), false, &mut out);` — SIGSEGV. The heap-backed analogue `encode_string(list.as_slice(), …)` is fine. |
| Root cause (hypothesis) | `Text.as_bytes()` on an inline small string returns a slice into ephemeral value storage with no backing heap buffer; the slice dangles once it escapes the current frame. |
| Sibling | `let t: Text = "xy".into(); t.as_bytes()` mis-dispatches to `USize.as_bytes` (receiver-type tracking drift through `.into()`-bound bindings). |
| Fix surface | VBC codegen/runtime for `Text.as_bytes()` must materialise a heap-backed byte view (or copy) for small-string Texts before the slice escapes the frame. |
| Examples | `core/net/http2/hpack.vr::HpackEncoder.encode_one`; characterised in `core-tests/net/http2/hpack/audit.md §3.3`. |

## 10. Bare-variant first-wins collision for archive-loaded payload ADTs (OPEN)

| Field | Value |
|---|---|
| Defect class id | **BAREVAR-ADT-1** |
| Status | **OPEN** — tracked (compiler task #17/#39). Source-side qualified-form discipline keeps the suite green. |
| Stable trigger | A payload-carrying user ADT defined in `core/` writes its **constructors or match-arm patterns in bare form** (`NotFound { .. }`, `Other { .. }`) inside its own `impl` / `Eq` / `Display` / `Debug`, AND the variant name is **not globally unique** across the stdlib. |
| Manifestation | When the ADT is loaded from the precompiled core archive, the bare variant name resolves **first-wins** to the *first* sibling-module variant registered under that name. The match arm then never fires on a real value of the intended type → `Eq.eq` falls to `_ => false`, `match` falls to `_`, `from_*` constructors return a mis-tagged value. Payload-free (unit) variants are unaffected. |
| Probe | `let a = T.Pay { x: 1 }; let b = T.Pay { x: 1 }; assert(a == b);` for an archive-resident `T` with a colliding variant name → fails. Same construction+match **in the same fresh-compiled file** passes (proves it is archive-load-specific). |
| Fix discipline | Qualify **every** constructor and match-arm pattern to `T.<Variant>` form in the ADT's own impls. (`Result`/`Maybe`/`Ordering` are type-checker-special-cased and exempt — see QUALRESULT-1.) Because the stdlib is embedded in the `verum` binary at `cargo build` time (`crates/verum_compiler/build.rs`), a `cargo build --release --bin verum` rebuild is required for the source edit to take effect. |
| Deep fix | Type-directed resolution of bare variant names when the enclosing expression's type is known, so the bare form binds to the correct ADT. Multi-day VBC codegen work. |
| Examples | `core/context/error.vr::ContextError` Eq (prior), `core/sys/windows/io.vr::WindowsIoDriverError`, `core/sys/windows/tls.vr::WindowsTlsError`, `core/sys/windows/thread.vr::WindowsThreadError` (this branch, 2026-05-29). |

## 11. Silent over-wide integer-literal truncation (OPEN)

| Field | Value |
|---|---|
| Defect class id | **INTLIT-OVERFLOW-1** |
| Status | **OPEN** — tracked. No silent-corruption guard yet; surfaces as wrong test values rather than a diagnostic. |
| Stable trigger | An integer literal whose magnitude exceeds its declared/suffixed type — e.g. an 18-hex-digit `0x5645525545_4D5F_5443_u64` (72 bits) assigned to a `UInt64`. |
| Manifestation | **No diagnostic.** The literal is parsed to `i128` (`verum_fast_parser/src/expr.rs:3304`, via `i128::from_str_radix(..).unwrap_or(0)`) and then **silently narrowed mod 2⁶⁴** to the runtime value. The 72-bit literal above becomes `4995148692846498883` (its low 64 bits) with no error. Literals exceeding `i128` silently become `0` (the `unwrap_or(0)`). |
| Probe | `let b: UInt64 = 0x5645525545_4D5F_5443_u64; print(f"{b}")` → prints the wrapped value, not an error. |
| Root cause | The lexer correctly stores the raw digits (`IntegerLiteral::as_u64` returns `None` on overflow), but lowering neither (a) range-checks the literal against its suffix/inferred type nor (b) rejects values exceeding `i128`. |
| Fix surface | Range-validate suffixed integer literals at parse/type-check time and emit a diagnostic (`E`-class) on overflow, mirroring Rust/Swift. Contained but touches the literal→type-check path; needs a stdlib-wide validation pass (some constants rely on two's-complement forms like `0xFFFFFFF6_u32` which *do* fit their suffix and must keep compiling). |
| Examples | `core-tests/sys/windows/tls/unit_test.vr:47` + `core-tests/sys/windows/mod/unit_test.vr:130` asserted `TCB_MAGIC` against an 18-hex-digit typo'd literal; both tests were silently *failing* (the wrong literal wrapped to a value ≠ the real 16-digit `TCB_MAGIC`). Fixed the test typo; the language defect remains. |

## Cross-reference

| Defect | Audit references | Close commits |
|---|---|---|
| INTLIT-OVERFLOW-1 (OPEN) | `core-tests/sys/windows/tls/audit.md` | — (test typo fixed; language guard pending) |
| BAREVAR-ADT-1 (OPEN) | `core-tests/sys/windows/io/audit.md §A` | source qualified-form fix (this branch) |
| DEFERRED-INIT-1 (CLOSED 2026-05-29) | `core-tests/net/http2/hpack/audit.md §3.4` | (this branch) |
| DEFERRED-INIT-1 (CLOSED 2026-05-29) | `core-tests/net/http2/hpack/audit.md §3.4` | (this branch) |
| TEXT-SMALLSTR-ASBYTES-1 (OPEN) | `core-tests/net/http2/hpack/audit.md §3.3` | — |
| EXTSLICE-1 | `core-tests/net/cidr/audit.md §3.1`, `core-tests/net/http_range/audit.md §3.1`, `core-tests/encoding/base58/audit.md §A`, `core-tests/encoding/msgpack/audit.md §C`, `core-tests/encoding/value/audit.md §C` | `be64f4e1e`, `a60025262`, `b30e71f92`, `abf1033b1`, `ab9ec931b`, `41882e63b` |
| BSTRLIT-1 | `core-tests/net/ipv6_canonical/audit.md §3.1` | `8233fad28`, `abf1033b1` |
| CLOSURE-RESULT-1 | `core-tests/net/cidr/audit.md §3.1`, `core-tests/net/ipv6_canonical/audit.md §3.1` | `f649312c6` |
| QUALRESULT-1 | `core-tests/net/url/audit.md §3.4` | `8cf21a8be`, `74c074176` |
| TRANSIENTMUT-1 | `core-tests/net/cidr/audit.md §3.4` | `92480c76b` |
| CHAINMETHOD-1 | `core-tests/net/websocket/audit.md §3.6` | `92a85244b`, `400dccb78` (partial) |
| SLICEITER-1 (CLOSED 2026-05-14) | `core-tests/text/text/audit.md §A` | `8650a56ba`, `7cbd0585d` |

## See also

- [`core-tests/INVENTORY.md`](https://github.com/verum-lang/verum/tree/main/core-tests/INVENTORY.md) — full conformance suite inventory + per-round session markers.
- [`net.md` status table](/docs/stdlib/net) — current per-submodule status with CLOSED markers.
- [`status-convention.md`](/docs/stdlib/status-convention) — how to interpret the status keywords.

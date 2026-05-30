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

## 9. `Text.as_bytes()` slice passed across a call boundary SIGSEGV (CLOSED 2026-05-30)

| Field | Value |
|---|---|
| Defect class id | **TEXT-SMALLSTR-ASBYTES-1** (ENCODE-1) |
| Status | **CLOSED** at the stdlib layer 2026-05-30. The original "small-string slice dangles" framing was a **misdiagnosis** — corrected below. |
| Stable trigger | A `&[Byte]` produced by `Text.as_bytes()` passed as a function argument and then **iterated** by the callee via `slice.iter()` — canonically `encode_string(field.name.as_bytes(), false, &mut out)` → `out.extend_from_slice(input)`. |
| Manifestation | `verum: internal compiler error — fatal signal SIGSEGV (11)` at runtime under `--interp`. |
| Root cause (corrected) | NOT a dangling small-string slice. `Text.as_bytes()`'s FatRef is valid — `.len()` and index `[i]` read correct bytes for **both** small (NaN-box-inline) and heap Text (the `AsBytes` handler already heap-copies small strings). The crash is `List.extend_from_slice`'s `for item in slice.iter()`: a `SliceIter` stores the parameter slice in a struct field and yields elements via `&self.slice[front]`, and that stored-slice element-**reference** derivation is wrong for a FatRef whose provenance is not a List backing array. `slice.get(i)` (also `&self[idx]`) shares the flaw; only **index-by-value** (`slice[i]`) is provenance-safe. |
| Fix | Rewrote `core/collections/list.vr::extend_from_slice` from `for item in slice.iter() { push(item.clone()) }` to an index loop `while i < n { push(slice[i].clone()) }` — provenance-agnostic, clone-preserving, same defensive rationale as the `.get(i)` routing in `slice.vr` §B.2. |
| Validation | `--interp`: `encode_string(field.name.as_bytes(), false, …)` round-trips with correct content (small + heap); full `HpackEncoder.encode`→`decode` **raw** round-trip (single + multi) green; hpack suite 51/51. Un-ignores `core-tests/net/http2/hpack/unit_test.vr §7`. |
| Residual | (1) The deeper `SliceIter` element-reference derivation for non-List FatRef provenances is unfixed — any `for x in <as_bytes-slice>.iter()` still trips it. (2) The `HpackEncoder` Huffman default (`huffman_enabled: true`) round-trip mismatches — separate defect **HPACK-HUFFMAN-1**. |
| Examples | `core/collections/list.vr::extend_from_slice` (fix site), `core/net/http2/hpack.vr::HpackEncoder.encode_one` (trigger); characterised in `core-tests/net/http2/hpack/audit.md §3.3`. |

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

## 12. Single-field-newtype method-return / arithmetic-return unboxing (OPEN)

| Field | Value |
|---|---|
| Defect class id | **NEWTYPE-UNBOX-1** |
| Status | **OPEN** — tracked. Source-side working idiom keeps the suite green. |
| Stable trigger | A value of a single-field newtype (`type NtStatus is (Int32)`, `type WindowsDuration is (UInt64)`) produced by a **method/operator body** (e.g. `IoStatusBlock.status()` returning `NtStatus(...)`, or `d1.add(d2)` returning a `WindowsDuration`), then immediately consumed by a chained method (`.is_success()`, `.as_millis()`). |
| Manifestation | The newtype value (unboxed to its inner `Int`) reaches a `CallM` that dispatches by `(method_id, receiver runtime-kind)` with no type hint. When the method name is **ambiguous across the loaded import closure** (e.g. 8 distinct `.is_success` impls — `OSError`/`NtStatus`/`StatusCode`/…), codegen cannot statically resolve `<NewType>.<method>`, falls to `CallM`, and the runtime fails on the `Int` receiver: `NtStatus.is_success not found on receiver of runtime kind Int`. A Map/match-bound newtype value also corrupts control flow (the test "exits" with the raw inner value). Direct newtype values (e.g. `STATUS_*` consts, single-candidate closures) dispatch fine. |
| **Closure-dependence (important)** | The defect is **import-closure-sensitive**: in a *small* test closure with a single `.method` candidate, codegen resolves the call directly and it **passes**; in the *full* stdlib closure (many same-named methods) it fails. An isolated probe therefore UNDER-counts candidates and can give a misleading PASS — always confirm under the full conformance closure (`verum test --filter wx_`), not a 1–3-test isolation. |
| Probe | Under the full closure: `IoStatusBlock.new().status().is_success()` panics; a Map-retrieved `WindowsDuration` used via `.as_nanos()`/`.add()` corrupts. (`d1.add(d2).as_millis()` and `STATUS_SUCCESS.is_success()` pass — single-candidate / intercepted paths.) |
| Fix discipline | Read the inner field directly (`.0` / `as_nanos`) and avoid loop-accumulating Map-retrieved newtypes via the operator method. Where unavoidable, the call site loses nothing by being `@ignore`-pinned until the codegen fix lands. |
| Deep fix | Type-directed direct-call emission in `compile_method_call` (consult `infer_expr_type_name(receiver)` when `static_receiver_type` is None and the inferred type's method exists) + single-field-newtype boxing parity. See task #3 plan. |
| Examples | `core-tests/sys/windows/ntdll` (IoStatusBlock.status().is_success, full closure), `core-tests/sys/windows/time` (Map-retrieved WindowsDuration sum); same class as the core `Duration` unboxing defect (2026-05-27). |

## 13. Inline `&`-payload-variant arg clobbers `&mut self` field writeback (OPEN)

| Field | Value |
|---|---|
| Defect class id | **MUTSELF-MATCH-1** |
| Status | **OPEN** at the codegen layer — tracked. **Source-side fix discipline keeps the suite green:** bind payload-bearing variant args to a local before passing to a `&mut self` method (`let e = E.X { … }; fsm.step(&e)`). With this discipline the full multi-step FSM suite is GREEN; only two explicit inline-event probes stay `@ignore`'d to pin the defect. |
| Fix discipline | `let e = StreamEvent.X { … }; fsm.step(&e)` — bind first, never pass an inline `&E.X { … }` payload variant to a `&mut self` method. Inline **unit** variants (`&E.SendRstStream`) are safe; only **payload-bearing** inline variants trip it. |
| Stable trigger | A `&mut self` method (`fn step(&mut self, event: &E)`) called with an **inline-constructed payload-bearing variant** argument (`fsm.step(&E.SendHeaders { end_stream: false })`), where the method later writes a field (`self.state = next`). |
| Manifestation | The method computes and **returns** the correct value, but the trailing `self.<field> = …` writeback **does not persist** to the caller — the object never advances across calls. Tests that check the *return value* pass; tests that read the object's field after the call fail. |
| Probe | `let mut fsm = StreamFsm.new(1); let _ = fsm.step(&StreamEvent.SendHeaders { end_stream: false }); assert_eq(fsm.state(), StreamState.Open);` — fails (state still `Idle`). The **parameter-passed** event variant (`fn helper(setup: &E) { fsm.step(setup); … }`) persists correctly, isolating the trigger to the inline `&`-constructed payload-variant argument aliasing the `&mut self` receiver storage. |
| Not the cause | A stdlib reformulation binding `let cur = self.state;` before `match (cur, event)` did **not** fix it — the defect is at the call site (inline `&`-arg vs `&mut self`), not the match shape. Unit (payload-free) variant args and direct field-write methods (`Http2DynamicTable.insert`) persist fine. |
| Fix surface | VBC codegen: an inline `&`-constructed argument must be materialised in storage that does not alias / clobber the `&mut self` receiver, so the post-call field writeback survives. |
| Examples | `core/net/http2/stream.vr::StreamFsm.step`; characterised in `core-tests/net/http2/stream/audit.md §3.1`. |

## 14. `<` between two no-suffix-declared `Float` consts mis-compares (CLOSED 2026-05-30)

| Field | Value |
|---|---|
| Defect class id | **FLOATCONST-CMP-1** |
| Status | **CLOSED** at the codegen layer 2026-05-30 (commit `e0ac5220a`). `infer_expr_type_kind` now resolves a cross-module Float const's type via its const-FunctionInfo `return_type_name`, so ordered compares select `CmpF`. |
| Stable trigger | An **ordered** comparison (`<` / `>`) between two `public const`s of type `Float` declared **without** a `_f64` literal suffix (`public const X: Float = 0.7;`). |
| Manifestation | The ordered compare returns the wrong result (`0.7 < 0.85` → `false`), even though `assert_eq(X, 0.7_f64)` and `assert_eq(Y, 0.85_f64)` both pass and `Y < 1.0_f64` (const-vs-literal) passes. The value compares **equal** via `EqF` but **mis-orders** via `LtF`/`CmpF`. |
| Probe | `assert(CUBIC_BETA < CUBIC_FAST_CONV_FACTOR)` (0.7 < 0.85) fails; `assert(CUBIC_FAST_CONV_FACTOR < 1.0_f64)` passes; `_f64`-suffixed consts (`core/net/quic/recovery/cc/bbr.vr`) compare fine const-vs-const. |
| Fix surface | VBC codegen for a no-suffix `Float`-typed `public const` must store the canonical f64 NaN-box so `LtF`/`CmpF` reads it identically to `EqF`. |
| Fix discipline | Declare `Float` consts with the `_f64` suffix: `public const X: Float = 0.7_f64;`. |
| Examples | `core/net/quic/recovery/cc/cubic.vr` (CUBIC_C/BETA/FAST_CONV); characterised in `core-tests/net/quic/recovery/cc/cubic/audit.md §3.1`. |

## 15. Cross-module record field-index shift (CLASS-9 / D2b, CLOSED 2026-05-30)

| Field | Value |
|---|---|
| Defect class id | **CROSS-MODULE-FIELDSHIFT-1** (CLASS-9 / D2b) |
| Status | **CLOSED** at the compiler layer 2026-05-30 (commit `64607bb8e`). |
| Stable trigger | A record type declared in one stdlib module is constructed or read (`self.<field>` in an instance-method body, or a field write in a `.new()` / `.null_pointer()` static constructor) from a body compiled in a **different** module — i.e. the accessing module did not itself declare the type, so it has no local `TypeDescriptor` for it. |
| Manifestation | `self.<field>` reads and constructor field writes land on **wrong slot offsets** (e.g. reading `self.type_name` returns slot 2 = `expected_epoch`). Downstream this surfaces as wrong field values, `Eq` mismatches, and — when a mis-read slot is interpreted as a pointer and dereferenced — SIGSEGV. The long-standing CLASS-9 / field-shift family. |
| Root cause | `resolve_field_index` resolves a locally-declared type via its string-authoritative `TypeDescriptor`, then falls back to the positional `type_field_layouts` map, then to a non-positional **global-intern** fallback. For a record declared in another (earlier-compiled) module the accessing codegen had neither a local descriptor nor a `type_field_layouts` entry, so it hit the global-intern fallback and wrote non-positional indices. |
| Fix | A **TypeId-free** type-layout registry threaded through the stdlib bootstrap (`verum_compiler/src/pipeline/stdlib_bootstrap.rs` + `pipeline.rs`): each module exports its record field layouts (type-name → declared-field-names, declaration order) into a global registry; every subsequently-compiled module imports them (additive, first-wins) via `import_type_layouts` (`verum_vbc/src/codegen/mod.rs`). `resolve_field_index`'s positional `type_field_layouts` path now resolves cross-module record fields instead of the global-intern fallback. |
| Why it is safe | **Descriptor-first** — a module's own `TypeDescriptor` still resolves locally-declared types first, so an imported layout can never shadow a local declaration. **TypeId-free** — the registry carries pure name→field-name lists and cannot perturb TypeId allocation or descriptor tables; this is precisely why it succeeds where the reverted `type_name_to_id` backfill (`ab8e707f4` → `585728904`) regressed `UseAfterFreeError` record-literal field writes. Payload-less sum types never enter the registry, so variant dispatch is structurally unaffected. |
| Validation | `--interp`, 83 GREEN, 0 regressions: `UseAfterFreeError` 13/13 (`.message()` body field reads + `.new()` / `.null_pointer()` cross-module constructors + record-literal canary), epoch D1 2/2, `RevocationError` 19/19, `thin_ref` 10/10, `epoch_cache` 5/5, `http2/error` 29/29, hpack `HeaderField` 5/5. Full `core/*.vr` re-precompile clean. Un-ignores the D2/CLASS-9 pins in `core-tests/mem/{mod,thin_ref,epoch}`. |
| Examples | `core/mem/mod.vr::UseAfterFreeError.message`, `core/mem/thin_ref.vr::UseAfterFreeError.new` / `.null_pointer`; pinned by `core-tests/mem/{mod,thin_ref,epoch}/unit_test.vr`. |

## Cross-reference

| Defect | Audit references | Close commits |
|---|---|---|
| NEWTYPE-UNBOX-1 (OPEN) | `core-tests/sys/windows/ntdll/audit.md §B`, `core-tests/sys/windows/time/audit.md` | — (working idiom in tests; codegen fix pending) |
| INTLIT-OVERFLOW-1 (OPEN) | `core-tests/sys/windows/tls/audit.md` | — (test typo fixed; language guard pending) |
| BAREVAR-ADT-1 (OPEN) | `core-tests/sys/windows/io/audit.md §A` | source qualified-form fix (this branch) |
| CROSS-MODULE-FIELDSHIFT-1 / CLASS-9 (CLOSED 2026-05-30) | `core-tests/mem/{mod,thin_ref,epoch}/unit_test.vr` | `64607bb8e` |
| DEFERRED-INIT-1 (CLOSED 2026-05-29) | `core-tests/net/http2/hpack/audit.md §3.4` | (this branch) |
| TEXT-SMALLSTR-ASBYTES-1 / ENCODE-1 (CLOSED 2026-05-30) | `core-tests/net/http2/hpack/audit.md §3.3` | `core/collections/list.vr::extend_from_slice` index-loop rewrite |
| ENCSTR-LOOP-1 (CLOSED 2026-05-30) | `core-tests/net/http2/hpack/audit.md §3.5` | string-codec loop SIGABRT gone (EXTSLICE byte-copy + this branch) |
| HPACK-HUFFMAN-1 (OPEN) | `core-tests/net/http2/hpack/audit.md §3.3` | — (raw path green; Huffman codec round-trip mismatch) |
| MUTSELF-MATCH-1 (OPEN) | `core-tests/net/http2/stream/audit.md §3.1` | — |
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

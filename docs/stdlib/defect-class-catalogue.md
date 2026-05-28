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

## Cross-reference

| Defect | Audit references | Close commits |
|---|---|---|
| EXTSLICE-1 | `core-tests/net/cidr/audit.md §3.1`, `core-tests/net/http_range/audit.md §3.1`, etc. | `be64f4e1e`, `a60025262`, `b30e71f92`, `abf1033b1`, `ab9ec931b` |
| BSTRLIT-1 | `core-tests/net/ipv6_canonical/audit.md §3.1` | `8233fad28`, `abf1033b1` |
| CLOSURE-RESULT-1 | `core-tests/net/cidr/audit.md §3.1`, `core-tests/net/ipv6_canonical/audit.md §3.1` | `f649312c6` |
| QUALRESULT-1 | `core-tests/net/url/audit.md §3.4` | `8cf21a8be`, `74c074176` |
| TRANSIENTMUT-1 | `core-tests/net/cidr/audit.md §3.4` | `92480c76b` |
| CHAINMETHOD-1 | `core-tests/net/websocket/audit.md §3.6` | `92a85244b`, `400dccb78` (partial) |

## See also

- [`core-tests/INVENTORY.md`](https://github.com/verum-lang/verum/tree/main/core-tests/INVENTORY.md) — full conformance suite inventory + per-round session markers.
- [`net.md` status table](/docs/stdlib/net) — current per-submodule status with CLOSED markers.
- [`status-convention.md`](/docs/stdlib/status-convention) — how to interpret the status keywords.

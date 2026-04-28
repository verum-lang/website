---
sidebar_position: 3
title: VBC Bytecode
---

# VBC — Verum Bytecode

VBC is Verum's unified intermediate representation. Every program
lowers to VBC; from there, the interpreter runs it directly (Tier 0)
or the AOT backend lowers it to LLVM IR (Tier 1). The same module
format also carries GPU kernels lowered through MLIR to PTX / HSACO /
SPIR-V / Metal.

## Design goals

1. **Single IR** — VBC is both the bytecode and the lowering target;
   there is no separate MIR in the main pipeline.
2. **Typed** — every value and register has a type the verifier can
   check.
3. **CBGR-aware** — generation / epoch / capability checks are
   explicit opcodes (`Ref`, `Deref`, `ChkRef`, `RefChecked`,
   `RefUnsafe`, `DropRef`), so tier decisions survive all the way to
   the backend.
4. **Cubical-aware** — path types and transports have opcodes that
   the codegen erases to identity in release builds.
5. **Portable** — serialisable for distribution (`.cog` archives
   carry VBC + metadata + optional proof certificates).

## Opcode map

The VBC instruction set comprises roughly 350 primary opcodes
plus several extended opcode tables for arithmetic, tensor
operations, cubical primitives, and CBGR tier lowering.

| Range          | Family                      | Representative opcodes |
|----------------|-----------------------------|------------------------|
| 0x00 – 0x0F    | Load / move / convert       | `Mov`, `LoadK`, `LoadI`, `LoadF`, `LoadTrue`, `LoadSmallI`, `Nop`, `CvtIF`, `CvtFI`, `CvtIC` |
| 0x10 – 0x1F    | Integer arithmetic          | `AddI`, `SubI`, `MulI`, `DivI`, `ModI`, `NegI`, `AbsI`, `PowI`, `Inc`, `Dec`, `CvtToI` |
| 0x20 – 0x2F    | Float arithmetic & extended | `AddF`, `SubF`, `MulF`, `DivF`, `NegF`, `PowF`, `MathExtended` (0x29), `SimdExtended` (0x2A), `CharExtended` (0x2B) |
| 0x30 – 0x3F    | Bitwise + generic arith     | `Band`, `Bor`, `Bxor`, `Bnot`, `Shl`, `Shr`, `Ushr`, `AddG`, `SubG`, `MulG`, `DivG` |
| 0x40 – 0x4F    | Compare                     | `EqI`/`NeI`/`Lt`/`Le`/`Gt`/`Ge` (int + float), `EqG`, `CmpG`, `EqRef`, `CmpExtended` (0x4F) |
| 0x50 – 0x5F    | Control flow                | `Jmp`, `JmpIf`, `JmpNot`, `JmpEq`/`Ne`/`Lt`/`Le`/`Gt`/`Ge`, `Ret`, `RetV`, `Call`, `TailCall`, `CallM`, `CallClosure`, `CallR` |
| 0x60 – 0x6F    | Objects / collections       | `New`, `NewG`, `GetF`, `SetF`, `GetE`, `SetE`, `Len`, `NewArray`, `NewList`, `ListPush`, `ListPop`, `NewMap`, `MapGet`, `MapSet`, `MapContains`, `Clone` |
| **0x70 – 0x77**| **CBGR references**         | **`Ref`, `RefMut`, `Deref`, `DerefMut`, `ChkRef`, `RefChecked`, `RefUnsafe`, `DropRef`** |
| 0x78 – 0x7F    | CBGR / text extensions      | `CbgrExtended` (0x78), `TextExtended` (0x79) |
| 0x80 – 0x8F    | Generic dispatch            | `CallG`, `CallV`, `CallC`, `SizeOfG`, `AlignOfG`, `Instantiate`, `MakeVariant`, `SetVariantData`, `GetVariantData`, `GetTag`, `NewClosure`, `GetVariantDataRef`, `TypeOf` |
| 0x90 – 0x9F    | Pattern matching & logic    | `IsVar`, `AsVar`, `Unpack`, `Pack`, `Switch`, `MatchGuard`, `And`, `Or`, `Xor`, `Not` |
| 0xA0 – 0xAF    | Async / structured concurrency | `Spawn`, `Await`, `Yield`, `Select`, `Join`, `FutureReady`, `FutureGet`, `AsyncNext`, `NurseryInit`/`Spawn`/`Await`/`Cancel`/`Config`/`Error` |
| 0xB0 – 0xBF    | Context / capability / meta | `CtxGet`, `CtxProvide`, `CtxEnd`, `PushContext`, `PopContext`, `Attenuate`, `HasCapability`, `RequireCapability`, `MetaEval`, `MetaQuote`, `MetaSplice`, `MetaReflect`, `FfiExtended` (0xBC), `ArithExtended` (0xBD), `LogExtended` (0xBE), `MemExtended` (0xBF) |
| 0xC0 – 0xCF    | Iteration / text / set      | `IterNew`, `IterNext`, `GenCreate`, `GenNext`, `GenHasNext`, `ToString`, `Concat`, `NewSet`, `SetInsert`, `SetContains`, `SetRemove`, `CharToStr`, `NewRange`, `NewDeque`, `Push`, `Pop` |
| 0xD0 – 0xDF    | Exceptions / contracts / cubical / channels | `Throw`, `TryBegin`, `TryEnd`, `GetException`, `Spec`, `Guard`, `Assert`, `Panic`, `Unreachable`, `DebugPrint`, `Requires`, `Ensures`, `Invariant`, `NewChannel`, **`CubicalExtended` (0xDE)**, `DebugDF` (0xDF) |
| 0xE0 – 0xEF    | Syscalls / atomics / autodiff | `SyscallLinux`, `Mmap`, `Munmap`, `AtomicLoad`, `AtomicStore`, `AtomicCas`, `AtomicFence`, `IoSubmit`, `IoPoll`, `TlsGet`, `TlsSet`, `GradBegin`, `GradEnd`, `GradCheckpoint`, `GradAccumulate`, `GradStop` |
| 0xF0 – 0xFF    | Tensor / GPU / ML           | `TensorNew`, `TensorBinop`, `TensorUnop`, `TensorMatmul`, `TensorReduce`, `TensorReshape`, `TensorTranspose`, `TensorSlice`, `GpuExtended` (0xF8), `GpuSync`, `GpuMemcpy`, `GpuAlloc`, `TensorExtended` (0xFC), `MlExtended` (0xFD), `TensorFull` (0xFE), `TensorFromSlice` (0xFF) |

### Extended opcode tables

Several primary opcodes are prefixes into second-byte tables:

- **`CubicalExtended` (0xDE)** — path / interval / univalence.
  `PathRefl`, `PathLambda`, `PathApp`, `PathSym`, `PathTrans`,
  `PathAp`, `Transport`, `Hcomp`, `IntervalMeet`, `IntervalJoin`,
  `IntervalRev`, `Ua`, `UaInv`, `EquivFwd`, `EquivBwd`.
- **`SimdExtended` (0x2A)** — 73 SIMD ops including `VecSplat`,
  `VecLoad`, `VecAdd`, `VecFma`, `VecShuffle`, `VecReduce`, gather /
  scatter.
- **`TensorExtended` (0xFC)** — attention, softmax, layernorm,
  batchnorm, einsum, conv, the flash-attention intrinsic.
- **`GpuExtended` (0xF8)** — kernel launch, sync, memcpy, stream
  management, device allocation.
- **`MathExtended` (0x29)**, **`LogExtended` (0xBE)**,
  **`FfiExtended` (0xBC)**, **`MemExtended` (0xBF)**, **`ArithExtended`
  (0xBD)**, **`CharExtended` (0x2B)**, **`TextExtended` (0x79)**,
  **`CmpExtended` (0x4F)**, **`MlExtended` (0xFD)** — per-family
  extensions.
- **`Extended` (0x1F)** — general-purpose extension byte for
  first-class instructions that don't fit any family namespace.
  Wire format `[0x1F] [sub_op:u8] [operands...]`. Sub-op `0x00`
  is reserved as a forward-compat anchor; encoders must not emit
  it, decoders accept it as a no-op so future extensions land
  cleanly without breaking older interpreters. Carved out of the
  reserved `IntArith1F` slot during the #167 opcode-space audit.

### Slice opcodes (`CbgrExtended` 0x00–0x0A)

Slices in VBC are `FatRef` values that carry `(ptr, len, elem_size)`
metadata in the reserved field (`0 = NaN-boxed Value`, `1/2/4/8 =
raw integer stride`). The corresponding sub-ops:

| Sub-op             | Code  | Format                                   | Notes |
|--------------------|-------|------------------------------------------|-------|
| `RefSlice`         | 0x00  | `dst, src, start, len`                   | Sub-ref from an array/list; infers stride from the source ObjectHeader. |
| `RefInterior`      | 0x01  | `dst, base, field_offset:u32`            | Struct interior ref. |
| `RefArrayElement`  | 0x02  | `dst, base, index`                       | Array element ref. |
| `RefTrait`         | 0x03  | `dst, src, vtable_id:u32`                | Trait-object fat pointer. |
| `Unslice`          | 0x04  | `dst, slice_ref`                         | Extract the raw pointer. |
| `SliceLen`         | 0x05  | `dst, slice_ref`                         | Reads `metadata` from the FatRef. |
| `SliceGet`         | 0x06  | `dst, slice_ref, index`                  | Stride-aware (respects `reserved`). |
| `SliceGetUnchecked`| 0x07  | `dst, slice_ref, index`                  | Same, no bounds check. |
| `SliceSubslice`    | 0x08  | `dst, src, start, end`                   | Stride-aware subslicing. |
| `SliceSplitAt`     | 0x09  | `dst1, dst2, src, mid`                   | Two FatRefs `[0..mid)` / `[mid..len)`. |
| `RefSliceRaw`      | 0x0A  | `dst, ptr, len`                          | Build a FatRef from a raw pointer (no ObjectHeader inference); used for `slice_from_raw_parts`, byte buffers, and the middle of heap strings. |

`TextSubOpcode::AsBytes` (`0x34`, under `TextExtended` 0x79) is the
dispatch target for `text.as_bytes()` regardless of whether the
value is a NaN-boxed small string or a heap-allocated Text. It
materialises a byte-slice FatRef with `elem_size=1`, copying the six
inline bytes of a small string into a fresh heap buffer so the
returned reference has a stable address.

Adding up primary + extended tables: just over **350 opcodes**.

## Module format

A VBC module is a self-describing archive:

```
header:
  magic:        "VBC\0"
  version:      (major, minor, patch)
  flags:        bitfield
type_table:     list of interned types
const_table:    list of interned constants
function_table: list of function definitions
  each function:
    name, signature, local types, bytecode, debug info
proof_certificates:  optional — for @verify(certified)
metadata:            module-level attributes
```

Modules compress with LZ4. Deserialisation is zero-copy where
possible (mmap + fixup).

## Module-load trust boundary

Loading a `.vbc` module crosses a trust boundary: the bytes might
have come from this process's own compiler (trusted) or from disk,
network, or a shared cog archive (untrusted).  The runtime exposes
**two load tiers** so each call site declares its trust assumption
explicitly.

### Lenient load (trusted source)

The lenient tier does structural decode + the V-LLSI
"interpretable?" flag check, nothing else.  Use it when the
bytecode comes from the compiler that's running right now — for
example, after `verum run` builds a program in-process and hands
the freshly-emitted bytecode straight to the interpreter.  Running
the validator on bytecode whose provenance is already trusted would
just be wasted work.

### Validated load (untrusted source)

The validated tier runs four passes before the module is allowed to
execute:

1. **Structural decode** — same as the lenient tier.
2. **Content-hash verification.**  The header carries a blake3
   fingerprint over the bytes after the header.  At load time the
   runtime recomputes the fingerprint and rejects any mismatch.
   This catches single-bit tampering on the disk artifact —
   somebody edited a `.vbc` file in place and forgot to re-stamp
   the hash.  The check runs **before decompression**, since the
   hash is over the raw on-wire bytes.  For a compressed module
   that's the compressed payload, exactly what the serializer
   hashed, so tampering is caught without paying the
   decompression cost first.
3. **Dependency-hash verification.**  An independent fingerprint
   of the cog-distribution dependency graph (a blake3 over the
   concatenated dependency hashes).  Lets a build cache,
   reproducibility checker, or cog resolver compare two modules'
   dep trees in `O(8)` without walking the full dependency table.
4. **Per-instruction bytecode validation.**  Walks every
   function's bytecode and rejects:
   - Out-of-range function references in `Call` / `TailCall` /
     `CallG` / `NewClosure`.
   - **Call-arity mismatches** — every call site's argument count
     must match the target's declared parameter count.
   - Register references past the function's declared register
     file size.
   - Branch offsets (`Jmp` / `JmpIf` / `JmpNot` / `JmpCmp` /
     `Switch` / `TryBegin`) that fall outside the function's
     bytecode region, OR that land mid-instruction in another
     instruction's operand stream.
   - Out-of-range constant-pool, string-table, or type-table
     references.
   - Decoder failures mid-stream (a function's bytecode-byte
     count too small for the encoded instruction sequence).

When the validator finds multiple defects, the diagnostic is
rendered as a numbered list — full forensic detail rather than a
count-only summary.

Use the validated tier whenever bytecode comes from anywhere other
than the compiler in this process: archives loaded from disk,
modules pulled from a cog registry, files passed on the command
line, network-loaded bytecode, IPC-shared modules.  The cost is
`O(N)` in total bytes (hash) + `O(M)` in instruction count, paid
once at load — the runtime hot path stays gate-free.

### Why the architecture matters

The same architectural anti-pattern lived in three places: the
bytecode validator, the content hash, and the dependency hash.
Each was a security-critical defense implemented as a public field
or function with **zero production callers** — inert until the
load-time wiring acted on it.  The lesson: a public field carrying
a security-critical value with no code path that ACTS on the value
is a TODO regardless of how the field is named or documented.

### Implementation surface (Rust)

For compiler / runtime hackers: the trust boundary is exposed as
two parallel constructor families on the `verum_vbc` crate
(lenient → validated): `deserialize_module` / `deserialize_module_validated`,
`VbcArchive::load_module` / `load_module_validated`, and
`Interpreter::try_new` / `try_new_validated`.  Validation failure
surfaces as `InterpreterError::ValidationFailed { module_name,
reason }`; the `reason` carries the rendered defect list.

## Interpreter

The bytecode interpreter (`verum_vbc::interpreter`) dispatches via a
table split across **37 handler files** in
`interpreter/dispatch_table/handlers/`, grouped by family:

- `cbgr.rs` + `cbgr_helpers.rs` — Ref / Deref / tier checks.
- `cubical.rs` — 0xDE sub-ops (erased at AOT codegen; implemented for
  REPL / interpreter).
- `tensor.rs` + `tensor_extended.rs` — tensor opcodes (0xF0–0xF7,
  0xFC, 0xFE, 0xFF).
- `method_dispatch.rs` — protocol method resolution.
- `async_nursery.rs` — 0xA0–0xAF structured concurrency.
- `context.rs` — 0xB0–0xB7 capability / context stack.
- `meta.rs` — 0xB8–0xBB reflection / quoting.
- `gpu.rs` — 0xF8–0xFB GPU dispatch (in the interpreter, these go to
  a CPU simulator).
- …and 29 more per-family handlers for arithmetic, control flow,
  collections, strings, iterators, autodiff, exceptions, etc.

Execution state lives in `interpreter::state` — a register file, a
stack, the CBGR heap, and the context stack.

## AOT lowering

`verum_codegen::llvm::vbc_lowering` walks VBC and emits equivalent
LLVM IR. Tier-aware CBGR lowering selects between
`CbgrValidated`, `DirectLoad`, and `UncheckedLoad` strategies based
on the reference's opcode (`Ref` vs `RefChecked` vs `RefUnsafe`).
Cubical opcodes lower to identity / passthrough (proof erasure).

## GPU lowering

`@device(GPU)` functions route through `verum_codegen::mlir` instead
of LLVM — `TensorMatmul`, `TensorExtended::Attention`, etc. lower to
`verum.tensor` → `linalg` → `gpu` dialect → PTX / HSACO / SPIR-V /
Metal. See **[codegen → MLIR backend](/docs/architecture/codegen#mlir-backend)**.

## Proof-carrying code

When `@verify(certified)` is set, VBC includes proof certificates:

```
certificate:
  obligation:   SMT obligation hash
  proof_term:   serialised proof (size varies)
  verifier:     "z3" | "cvc5" | "portfolio" | "manual"
  signed_by:    build identity
```

Downstream consumers can trust the certificate and skip verification,
re-check the proof offline, or re-verify with a fresh solver run.

## Inspection

Generate a human-readable VBC dump as part of a build:

```bash
verum build --emit-vbc
```

The dump lands in `target/{debug,release}/<name>.vbc.txt` alongside
the usual artefacts. For per-phase breakdown, add `--timings`.

## See also

- **[Compilation pipeline](/docs/architecture/compilation-pipeline)**
  — VBC is emitted in Phase 5.
- **[Codegen](/docs/architecture/codegen)** — VBC → LLVM / MLIR.
- **[Runtime tiers](/docs/architecture/runtime-tiers)** — Tier 0
  interpretation vs Tier 1 AOT.
- **[CBGR internals](/docs/architecture/cbgr-internals#vbc-tier-opcodes)**
  — the 0x70–0x77 opcodes in detail.

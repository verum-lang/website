---
sidebar_position: 3
title: VBC Bytecode
---

# VBC — Verum Bytecode

VBC is Verum's unified intermediate representation. Every program
lowers to VBC; from there, the interpreter runs it directly (debug)
or the AOT backend lowers it to LLVM IR (release).

## Design goals

1. **Single IR**: no separate bytecode and MIR — VBC is both.
2. **Typed**: every value, every register, has a type the verifier can
   check.
3. **CBGR-aware**: generation checks are explicit opcodes, eliminable
   by analysis.
4. **Cubical-aware**: path types and transports have opcodes that the
   codegen erases to identity.
5. **Portable**: serialisable for distribution (`.cog` archives carry
   VBC + metadata).

## Opcode families

| Range | Family | Examples |
|-------|--------|----------|
| 0x00-0x0F | Control | `Nop`, `Halt`, `Trap`, `Call`, `Return`, `Br`, `CBr` |
| 0x10-0x2F | Arithmetic | `IAdd`, `IMul`, `FDiv`, `IRem`, `ICmp`, `FCmp` |
| 0x30-0x4F | Memory | `Load`, `Store`, `Alloca`, `HeapAlloc`, `HeapFree` |
| 0x50-0x6F | CBGR | `DerefChecked`, `DerefUnchecked`, `Promote`, `Revoke` |
| 0x70-0x8F | Collections | `ListPush`, `ListPop`, `MapGet`, `MapInsert` |
| 0x90-0x9F | Tensor | `TensorNew`, `MatMul`, `Reduce`, `Reshape` |
| 0xA0-0xAF | SIMD | `VecSplat`, `VecAdd`, `VecShuffle`, `VecReduce` |
| 0xB0-0xBF | Atomic | `ALoad`, `AStore`, `ACmpxchg`, `Fence` |
| 0xC0-0xCF | FFI | `CCall`, `CallbackEntry`, `CallbackReturn` |
| 0xD0-0xDE | Async | `Await`, `Spawn`, `Yield`, `Cancel` |
| **0xDE** | **Cubical** | **`CubicalExtended`** — 17 sub-ops: `PathRefl`, `PathLambda`, `Transport`, `Hcomp`, `Ua`, `Glue`, ... |
| 0xE0-0xEF | GPU | `KernelLaunch`, `DeviceSync`, `BufferCopy` |
| 0xF0-0xFF | Meta | compile-time-only (stripped at codegen) |

200+ opcodes total. See `crates/verum_vbc/src/instruction.rs` for the
complete enumeration.

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
proof_certificates: optional — for @verify(certified)
metadata:       module-level attributes
```

Modules compress with LZ4. Deserialisation is zero-copy where possible
(mmap + fixup).

## Interpreter

The bytecode interpreter (`verum_vbc::interpreter`) dispatches via a
table of 39 handler files organised by opcode family:

- `cubical.rs` — cubical opcodes (erased by codegen; implemented for
  REPL / debug).
- `cbgr.rs` — CBGR check implementations (68 KB LOC).
- `method_dispatch.rs` — protocol method resolution (300 KB).
- `tensor_extended.rs` — tensor operations (168 KB).
- `ffi_extended.rs` — FFI bridging.
- ... and more.

Execution state lives in `interpreter::state` — a register file + heap
+ context stack.

## AOT lowering

`verum_codegen::llvm::vbc_lowering` walks the VBC and emits equivalent
LLVM IR. CBGR opcodes become conditional branches; the LLVM optimiser
collapses adjacent checks and hoists them out of loops.

Cubical opcodes lower to identity / passthrough (proof erasure).

## Proof carrying code

When `@verify(certified)` is set, VBC includes proof certificates:

```
certificate:
  obligation:   SMT obligation hash
  proof_term:   serialised proof (size varies)
  verifier:     "z3" | "cvc5" | "portfolio" | "manual"
  signed_by:    build identity
```

Downstream consumers can:
- trust the certificate and skip verification;
- re-check the proof offline;
- re-verify with a fresh solver run.

## Tooling

```bash
$ verum disasm target/debug/myprog.vbc
$ verum vbc-stats target/debug/myprog.vbc
$ verum bytecode-diff old.vbc new.vbc
```

## See also

- **[Compilation pipeline](/docs/architecture/compilation-pipeline)**
  — when VBC is emitted.
- **[Codegen](/docs/architecture/codegen)** — VBC → LLVM.
- **[Runtime tiers](/docs/architecture/runtime-tiers)** — interpreter
  vs AOT.

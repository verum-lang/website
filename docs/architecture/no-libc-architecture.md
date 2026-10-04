---
sidebar_position: 15
title: "No-libc — load-bearing architectural invariant"
description: "Verum's no-libc runtime contract, current implementation gaps, platform boundaries, and artifact verification."
slug: /architecture/no-libc-architecture
---

# No-libc architecture

**Status (2026-10-04): architectural requirement; implementation and release
packaging do not yet satisfy it across all execution paths.**

Verum's no-libc contract covers the **VBC interpreter** (Tier 0),
**AOT-compiled programs** (Tier 1), and the `verum` CLI that hosts the
interpreter. Emitted libraries and object files must obey the same runtime
boundary. Calling libc from Rust inside the interpreter is a violation of
this contract, just as emitting a libc call in a user program is.

Building the compiler currently requires a Rust/C++/LLVM host toolchain.
Those build prerequisites are distinct from the dependencies of a shipped
executable. They do not exempt the shipped CLI or interpreter from the
contract. A single-file download, static LLVM linkage, or a successful
`--version` check does not establish no-libc conformance.

## 1. Per-platform replacement strategy

| Target | Required runtime boundary |
|--------|---------------------------|
| Linux | Direct kernel syscalls: `syscall` on x86_64, `svc #0` on aarch64; no glibc or musl. |
| macOS | Apple's supported `libSystem.B.dylib` ABI, including its OS and threading entry points. |
| Windows | `kernel32.dll` + `ntdll.dll`; no MSVC CRT or UCRT. |
| FreeBSD | Direct kernel syscalls. |
| Embedded | Bare-metal facilities; no OS runtime. |

macOS uses the supported system-library ABI rather than relying on an
unstable direct-syscall interface. Windows uses the declared DLL boundary.
GPU frameworks and application-requested foreign libraries introduce
additional dependencies that must be disclosed and audited separately.
WASM-WASI programs use their host's WASI imports; that is a separate runtime
boundary, not a claim of a standalone native executable.

## 2. Why this matters

The contract makes OS access and runtime dependencies explicit. On Linux,
meeting it removes a dependency on the distribution's libc version; kernel
features and target architecture still constrain compatibility. It also
makes the runtime implementation available for inspection. Neither this
design nor the absence of a linked library proves security or performance
for a particular program.

## 3. What this rules out

These are requirements for a conforming runtime, not a description of every
current implementation path:

- File, network, time and process operations must use the target's boundary
  above. Linux libc wrappers such as `open`, `socket`, `clock_gettime` and
  `__errno_location` must not replace direct syscalls.
- Allocation must use Verum's allocator and OS mapping primitives, rather
  than `malloc`, `calloc`, `realloc` or `free` from a C runtime.
- Byte and string operations must use internal implementations or suitable
  LLVM intrinsics. LLVM may lower an intrinsic to a library call, so the
  final object and link still need inspection.
- Number formatting and parsing must use internal implementations rather
  than `printf`, `snprintf`, `strtol` or `strtod` from libc.
- Threading must follow the platform boundary. Linux must not depend on
  `pthread`; macOS's pthread entry points are part of the allowed libSystem
  boundary. Windows uses its OS APIs.
- Error handling must follow the target ABI: for example, Linux syscall
  results carry negative errno values; macOS may use libSystem's `__error`.

## 4. The target-triple discipline

Per-platform decisions in generated code — syscall numbers, structure
layouts, errno entry points and calling conventions — must read the
**target** triple. Host `#[cfg(target_os = "...")]` decisions cannot stand
in for the requested target.

`crates/verum_codegen/src/llvm/target_triple.rs` supplies the canonical
Linux / Darwin / Windows and architecture predicates. Link configuration,
entry points and target libraries must agree with that same target.

## 5. Verification procedure

Audit the exact CLI download and the exact generated program separately.
Record their target, build configuration and checksum. For example:

```bash
# Linux: inspect without executing the binary.
readelf -l ./verum          # program interpreter, if present
readelf -d ./verum          # NEEDED shared libraries, if present
readelf --version-info ./verum
nm -u ./verum               # undefined symbols; also inspect emitted objects

# Repeat for the program produced by verum build.
readelf -l ./program
readelf -d ./program

# macOS: imported libraries and frameworks.
otool -L ./verum
otool -L ./program

# Windows: imported DLLs.
dumpbin /imports verum.exe
dumpbin /imports program.exe
```

A Linux no-libc audit must reject glibc/musl and unintended runtime
libraries. A **fully static ELF** claim additionally requires checking that
there is no program interpreter and no dynamic-library dependency; static
linking alone does not exclude a statically linked libc. Inspect symbols
and the link inputs as well. On macOS and Windows, compare imports with
the allowed platform boundary and any explicitly requested feature libraries.

The existing `scripts/ci/check_no_libc_link.sh` builds and inspects a
**generated AOT smoke program** on Linux and macOS. It rejects known
forbidden dependency patterns; other dependencies currently produce
warnings. It skips unsupported hosts. This is not an audit of every CLI
release asset, every runtime feature, or Windows imports.

## 6. Migration status (2026-05-04)

The original migration report recorded internal allocation, I/O, byte
operations and number-conversion helpers. That was scoped implementation
evidence, not proof that the entire interpreter, compiler distribution or
all AOT programs were libc-free. The historical
[formatting report](/docs/changelog#added--aot-no-libc-f64--strtol-formatting-trio-complete-2026-05-04)
is retained with its date; it does not establish complete Float formatting
semantics or ordinary native print coverage.

### Cross-compilation correctness (2026-07-28 — not 2026-05-04)

The historical cross-compilation check recorded a different issue from
the earlier runtime-helper work: the LLVM module triple had not been set
from `--target` in both lowering paths. Reading `module.get_triple()` then
returned the host triple even though codegen consulted the intended API.
The correction was checked on the same Linux object with `nm -u`, reducing
its undefined libc symbols from ten to zero. This dated object-level
measurement is retained; it is not a fresh audit of all emitted programs
or release assets.

### Open punch-list

**Source audit: 2026-10-04.** These are observed gaps, not approved exceptions
to the architecture:

| Surface | Current limitation |
|---------|--------------------|
| Shipped CLI | `.github/workflows/build-verum.yml` builds the Rust CLI for GNU Linux and MSVC Windows targets, then smoke-tests `--version` and packages it. There is no per-asset dependency audit in that workflow. Rust, LLVM and other host dependencies can remain in the shipped binary. See [installation](../getting-started/installation.md#what-the-verum-binary-itself-links-against). |
| Interpreter networking | `crates/verum_vbc/src/interpreter/dispatch_table/handlers/net_runtime.rs` uses `std::net` and libc socket operations. These are runtime calls, not merely compiler build dependencies. |
| Interpreter FFI | `crates/verum_vbc/src/ffi/platform/linux.rs` uses libc dynamic loading and mapping functions. Generic FFI and native DNS paths need auditing separately from direct-syscall intrinsics. |
| Terminal support | `core/term/raw/termios.vr` declares `@ffi("libc")` for terminal/I/O operations; `core/term/event/source.vr` also declares libc `poll`. |
| Native Float output | Ordinary Float `print` still reaches `printf` in `crates/verum_codegen/src/llvm/instruction.rs`. This is not confined to an optional debug mode. Internal float-to-text conversion also has documented range and precision limits. |
| Linker fallback | `NoLibcConfig::nostdlib_cc_driver_enabled` in `crates/verum_codegen/src/link.rs` defaults to disabled. The compiler-driver fallback can therefore add default runtime libraries. A no-libc configuration existing in source is not evidence that every final link uses it. |

Linux exception lowering now uses LLVM SJLJ intrinsics; Darwin uses
libSystem's `_setjmp` / `longjmp`. This removes the old claim that the Linux
body necessarily calls libc, but the resulting artifact still needs its
own link and execution checks.

A passing smoke program establishes only that program's measured boundary.
None of these remaining paths can be excluded merely because another path
uses direct syscalls. Complete no-libc conformance remains unfinished.

## 7. Owner and mechanism

Codegen, interpreter/runtime and release maintainers share responsibility
for the boundary. Reviews of new runtime extern declarations must identify
the target ABI, distinguish allowed OS entry points from libc/CRT calls,
and include the relevant artifact checks. Current violations must stay
visible until their implementation and packaging paths are repaired.

## 8. Cross-references

- [Installation and shipped binary dependencies](../getting-started/installation.md#what-the-verum-binary-itself-links-against)
- [Changelog → AOT no-libc f64 / strtol formatting trio](/docs/changelog#added--aot-no-libc-f64--strtol-formatting-trio-complete-2026-05-04)
- [Architecture → Compilation pipeline](./compilation-pipeline.md)
- [Architecture → Codegen](./codegen.md)
- [Architecture → Runtime tiers](./runtime-tiers.md)
- [Verification → Codegen attestation](../verification/codegen-attestation.md)

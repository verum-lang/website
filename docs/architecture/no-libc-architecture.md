---
sidebar_position: 15
title: "No-libc — load-bearing architectural invariant"
description: "Strict no-libc for generated AOT programs, portable host CLI requirements, current gaps, and artifact verification."
slug: /architecture/no-libc-architecture
---

# No-libc architecture

**Status: strict no-libc is an architectural requirement for
generated AOT programs; native implementation gaps remain. The host CLI
has a separate OS compatibility and packaging requirement.**

Verum-generated **AOT programs** (Tier 1), including their emitted runtime,
libraries and object files, must obey the no-libc boundary below. On macOS,
Apple's supported libSystem ABI is the documented platform boundary.

The **`verum` CLI and VBC interpreter** (Tier 0) may use libc and other
baseline system libraries. They must run on a clean installation of each
documented supported target OS, without requiring separately installed
third-party libraries. This means defining and testing an OS baseline,
not assuming that every library on the build machine exists on users'
systems. Homebrew OpenSSL paths are a packaging defect; libc use by the
host tool is not an AOT no-libc violation.

Building the compiler additionally requires the documented Rust/C++/LLVM
host toolchain. Build prerequisites, CLI deployment dependencies and
generated-program dependencies are three separate checks. A single-file
download or successful `--version` on the build host proves none of them
for a clean target machine.

Interpreter handlers and AOT lowerings must implement the same language
and platform-operation contracts. Permission to use libc in Tier 0 does
not permit host libc calls to leak into generated AOT code.

## 1. Per-platform replacement strategy

| AOT target | Required generated-runtime boundary |
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

The AOT contract makes OS access and runtime dependencies explicit. On Linux,
meeting it removes a dependency on the distribution's libc version; kernel
features and target architecture still constrain compatibility. It also
makes the runtime implementation available for inspection. Neither this
design nor the absence of a linked library proves security or performance
for a particular program.

## 3. What this rules out

These are requirements for a conforming generated AOT runtime, not a
description of every current implementation path or a ban on host CLI libc:

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

Audit the exact CLI download and the exact generated program against
**different criteria**. Record their target, build configuration and
checksum. For example:

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

For a **generated Linux AOT program**, reject glibc/musl and unintended
runtime libraries. A **fully static ELF** claim additionally requires
checking that there is no program interpreter and no dynamic-library
dependency; static linking alone does not exclude a statically linked
libc. Inspect symbols and the link inputs as well. For generated macOS and
Windows programs, compare imports with the AOT platform boundary and any
explicitly requested feature libraries.

For the **host CLI**, compare imports and symbol versions with a clean
supported OS installation, then run compatibility tests on that baseline.
Linux glibc symbol requirements are compatibility constraints, not a CLI
no-libc violation. OpenSSL, C++ runtime libraries and Windows CRT components
must not be assumed present on every installation; verify availability on
the stated baseline and package or remove dependencies that are absent.
The no-libc AOT smoke check does not replace this clean-host test.

`scripts/ci/check_no_libc_link.sh` builds a
**generated AOT smoke program** in a unique temporary workspace, or inspects
an existing executable with `--artifact PATH`. The inspector selects ELF,
Mach-O or PE from the artifact, independently of the host. Unknown imports,
missing tools, inspection failures, malformed output and unsupported formats
produce a non-success result. Linux controls allow no dynamic runtime or
userspace loader; macOS controls allow exactly libSystem; Windows controls
allow kernel32/ntdll and also inspect delayed imports. Explicit application
FFI or capability libraries need a separate audit.

Regression tests cover dependency decisions and smoke isolation. Checks of
real ELF, PE and Mach-O host CLI artifacts rejected their dependencies under
the AOT policy; generated Darwin controls passed. Dependency inspection does
not execute the artifact. These
checks do not establish static libc absence, complete runtime coverage or
Linux/Windows execution. Host CLI compatibility remains a separate release
requirement.

## 6. Implementation and remaining checks

Ordinary integer and Float print now use
owned formatting and a common target-aware writer. Focused generated-code
checks cover mixed-output order, tiny and large finite f64 values, signed
zero, partial writes and the target imports. These checks cover source
lowering, LLVM/JIT execution and emitted objects; complete CLI execution
and target-system acceptance remain separate.

The following still require generated AOT acceptance:

| Surface | Current limitation |
|---------|--------------------|
| Terminal support | `core/term/raw/termios.vr` declares `@ffi("libc")` for terminal/I/O operations; `core/term/event/source.vr` also declares libc `poll`. AOT lowering must respect the target boundary: direct syscalls on Linux, allowed libSystem entry points on macOS. |
| Numeric formatting | Default f64 print and float-to-text use the shared owned formatter. Explicit precision, source-only conversion and remaining presentation modes need separate semantic checks. A successful formatting check does not certify all output or linker paths. |
| Linker fallback | `NoLibcConfig::nostdlib_cc_driver_enabled` in `crates/verum_codegen/src/link.rs` defaults to disabled. The compiler-driver fallback can therefore add default runtime libraries to generated programs. A no-libc configuration existing in source is not evidence that every final link uses it. |

The host surfaces below have a **separate portability requirement**, not
a blanket no-libc ban:

| Host surface | What must be checked |
|--------------|----------------------|
| Shipped CLI | The build workflow smoke-tests `--version` and checks the packaged executable for external Git/OpenSSL dependencies. That check does not certify Linux symbol versions, Windows runtime availability or execution on a clean OS. [Installation](../getting-started/installation.md#what-the-verum-binary-itself-links-against) links the artifact inspection evidence and explains the required compatibility checks. |
| Interpreter networking | `crates/verum_vbc/src/interpreter/dispatch_table/handlers/net_runtime.rs` uses `std::net` and libc socket operations. These are permitted host implementation choices, subject to the supported OS baseline and API parity with AOT. |
| Interpreter FFI | `crates/verum_vbc/src/ffi/platform/linux.rs` uses libc dynamic loading and mapping functions. Its host dependencies and explicitly requested foreign libraries need their own deployment checks; they must not become implicit AOT runtime dependencies. |

Linux exception lowering now uses LLVM SJLJ intrinsics; Darwin uses
libSystem's `_setjmp` / `longjmp`. This removes the old claim that the Linux
body necessarily calls libc, but the resulting artifact still needs its
own link and execution checks.

A passing AOT smoke program establishes only that program's measured
boundary. Other emitted paths still need inspection and execution checks.
Complete AOT no-libc conformance remains unfinished; CLI portability is
validated separately.

## 7. Owner and mechanism

Codegen and runtime maintainers own the strict generated AOT boundary.
Interpreter maintainers must preserve language and platform-operation
semantics across tiers. Release maintainers own CLI compatibility with a
clean supported OS baseline. Reviews must state which artifact is affected
and apply its corresponding checks; AOT violations and host packaging
defects must remain visible without conflating the two requirements.

## 8. Cross-references

- [Installation and shipped binary dependencies](../getting-started/installation.md#what-the-verum-binary-itself-links-against)
- [Architecture → Compilation pipeline](./compilation-pipeline.md)
- [Architecture → Codegen](./codegen.md)
- [Architecture → Runtime tiers](./runtime-tiers.md)
- [Verification → Codegen attestation](../verification/codegen-attestation.md)

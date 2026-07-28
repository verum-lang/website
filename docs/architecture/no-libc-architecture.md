---
sidebar_position: 15
title: "No-libc — load-bearing architectural invariant"
description: "Verum's interpreter and AOT-compiled binaries must not link libc. Per-platform replacement strategy, verification procedure, and the migration punch-list."
slug: /architecture/no-libc-architecture
---

# No-libc architecture

**Status:** load-bearing architectural invariant.

Verum's two production execution paths — the **VBC interpreter**
(Tier 0) and **AOT-compiled binaries** (Tier 1) — MUST NOT link
libc.  This rule applies to every artefact a user runs: the
script-mode interpreter (`verum run`), the executable produced
by `verum build`, and any shared library or object file emitted
by the codegen pipeline.

The rule's scope is the *produced binary*.  The Verum
compiler itself (Rust code) is not in scope — Rust's standard
library uses libc by design and that is acceptable for the
build host.

## 1. Per-platform replacement strategy

| Target  | Replacement for libc                                                              |
|---------|-----------------------------------------------------------------------------------|
| Linux   | Direct syscalls (`syscall` instruction on x86_64, `svc #0` on aarch64).           |
| macOS   | `libSystem.B.dylib` only (Apple's required system boundary; not "libc" in the glibc / musl sense — Apple prohibits direct syscalls and `libSystem` is the minimum acceptable boundary). |
| Windows | `kernel32.dll` + `ntdll.dll` only (no MSVC CRT, no UCRT).                          |
| FreeBSD | Direct syscalls (`int 0x80` / `syscall`).                                         |
| Embedded| Bare-metal, no OS dependencies at all.                                            |

The macOS and embedded paths are **exceptions by necessity** —
Apple's ABI requires `libSystem`, and embedded targets have no
OS to ask.  Every other path must reach kernel facilities
directly.

## 2. Why this matters

- **Reproducibility.** A binary that links libc inherits libc's
  versioning (glibc 2.31 vs 2.35), security posture, and ABI
  churn.  Eliminating libc means a Verum binary built today
  runs on any kernel from the lifetime of the Verum-supported
  syscall set — forever, no `GLIBC_2.34: not found` errors at
  runtime.
- **Security.** libc is a large attack surface.  Verum's own
  runtime is auditable in isolation; libc is not.  Removing it
  reduces the attack surface to the kernel ABI.
- **Performance.** Direct syscalls skip the libc-side wrapper
  (typically 5–15 ns per call), the errno thread-local
  indirection, and call-site glue.
- **First-principles design integrity.** Verum claims to be a
  from-first-principles language.  A binary that depends on libc
  is not — every libc call drags in C's invariants and bug
  catalogue.  The no-libc rule keeps the claim load-bearing.

## 3. What this rules out

The pattern is mechanical: every place a libc symbol would
appear, the codegen emits a Verum-internal wrapper that routes
to direct syscalls (Linux / FreeBSD), `libSystem` (macOS), or
`kernel32` / `ntdll` (Windows).

- **No libc file I/O declarations** — `open`, `read`, `write`,
  `close`, `unlink`, `lseek`, `access` etc. in emitted LLVM IR
  or in `core/sys/<plat>/*.vr`.  Each goes through the
  platform-specific direct-syscall intrinsic.
- **No libc allocator** — `malloc` / `free` / `calloc` /
  `realloc`.  The allocator lives in `core/mem/allocator.vr`
  and uses `mmap` / `VirtualAlloc` directly via
  `verum_os_alloc`.
- **No errno-via-libc** — `__error` / `__errno_location` /
  `_errno`.  Errno is per-platform syscall convention: Linux
  returns `-errno` directly from the syscall instruction;
  Windows uses `GetLastError`; macOS uses `__error` (acceptable
  via libSystem).  Codegen emits the appropriate primitive
  based on the **target** triple, never host
  `#[cfg(target_os = "...")]`.
- **No libc time / pid / random helpers** — `nanosleep`,
  `clock_gettime`, `getpid`, `getrandom`, `getentropy`, `gettid`.
  Direct syscalls.
- **No libc string / byte intrinsics** — `memcpy`, `memset`,
  `memcmp`, `strlen`, `strcmp`.  These ALL have LLVM intrinsic
  forms (`llvm.memcpy.p0.i64`, `llvm.memset.p0.i64`, …) which
  are *not* libc; LLVM's `MemCpyOptPass` and the relevant
  backends lower them to inline asm or equivalent native
  sequences.  Use `verum_codegen::llvm::ffi::FfiLowering`
  (`lower_memset`, `lower_memcpy`, …) which always emits the
  intrinsic form.
- **No libc number formatting / parsing** — `snprintf("%d")`,
  `snprintf("%g")`, `strtol`, `strtod`.  Verum ships its own
  IR helpers: `verum_internal_i64_to_decimal`,
  `verum_internal_f64_to_decimal`, `verum_internal_strtol`,
  and a pure-IR `strtod` replacement.
- **No libc socket family** — `socket` / `bind` / `listen` /
  `accept` / `connect`.  TCP / UDP go through the v2 intrinsic
  family (`__tcp_listen_v2_raw`, `__tcp_accept_raw`, …) which
  themselves dispatch to direct syscalls (Linux) or libSystem
  (macOS).
- **No `pthread_*` declarations** other than macOS's
  `pthread_threadid_np`, which IS in libSystem and acceptable.
  Threading routes to Linux `clone3` / Windows `CreateThread` /
  macOS pthread (libSystem path).

## 4. The target-triple discipline

Every per-platform decision in the codegen — syscall numbers,
sockaddr layout, errno-fn name, socket-option constants,
exception-handling primitives — reads
`module.get_triple()`, the **target** triple.  Host
`#[cfg(target_os = "...")]` is forbidden in codegen because it
miscompiles cross builds: a Linux host producing a macOS binary
cannot use the host's libc convention.

The canonical inspection API lives in
`crates/verum_codegen/src/llvm/target_triple.rs` and exposes
boolean predicates over the target's OS family (Linux / Darwin /
Windows) and architecture (`aarch64` / `x86_64`). Every codegen
decision that branches on platform reads through this surface.
Host-side `cfg(target_os = ...)` directives are not accepted in
codegen; cross-builds rely on the target triple alone.

## 5. Verification procedure

Every release artefact must pass the per-platform link audit:

```bash
# Linux: only the dynamic linker should appear.
ldd target/release/<binary>
#   linux-vdso.so.1 (...)
#   /lib64/ld-linux-x86-64.so.2 (...)
# No libc.so.6, libgcc, libpthread.

# macOS: only libSystem.
otool -L target/release/<binary>
#   /usr/lib/libSystem.B.dylib

# Windows: only kernel32 + ntdll.
dumpbin /imports <binary>.exe
#   kernel32.dll, ntdll.dll
```

A CI gate runs this check on every release artefact.  Any other
linked library fails the gate.

## 6. Migration status (2026-05-04)

The migration is **substantially complete**.

### Already libc-free

- Linux direct syscalls for `clock_gettime` (monotonic +
  realtime), `nanosleep`, `getpid`, `gettid` — emitted by
  `runtime.rs::emit_verum_time_*` and `emit_verum_sys_*`.
- TCP listener / accept / send / recv / close — `__tcp_listen_v2_raw`
  family in `verum_vbc::intrinsics`.
- Cryptographic zeroise — `lower_secure_zero` emits volatile
  `llvm.memset` intrinsic, not libc memset.
- Allocator — `verum_os_alloc` / `verum_os_free` route through
  `mmap` / `munmap` (Unix) and `VirtualAlloc` /
  `VirtualFree` (Windows).
- File I/O — `open` / `close` / `read` / `write` / `unlink` /
  `lseek` / `access` all libc-free.
- String / byte intrinsics — `memcpy` / `memset` / `strlen` /
  `strcmp` / `puts` route through internal-linkage wrappers
  over LLVM intrinsics or open-coded IR.
- Number formatting / parsing — `verum_internal_i64_to_decimal`,
  `verum_internal_f64_to_decimal`, `verum_internal_strtol`, and
  pure-IR `strtod` replacement (see [Changelog 2026-05-04 — AOT
  no-libc f64 / strtol formatting trio](/docs/changelog#added--aot-no-libc-f64--strtol-formatting-trio-complete-2026-05-04)).
- Cross-compilation correctness — every per-platform decision
  reads `module.get_triple()`, never host
  `#[cfg(target_os = "...")]`. **True as of 2026-07-28, not before.**
  This line was wrong from 2026-05-04 until then: the LLVM *module's
  own* triple was never actually set from `--target` in either
  lowering path (AOT or JIT), so `module.get_triple()` silently
  returned the **host** triple on every cross build no matter what
  `--target` said — codegen was reading the triple correctly, the
  triple itself was wrong. A Linux cross build from a non-Linux host
  emitted Darwin/libSystem-shaped declarations instead of raw
  syscalls: a live no-libc violation, not a hypothetical one. Fixed
  and verified via `nm -u` (10 undefined libc symbols → 0 on the same
  Linux object, before/after).

### Open punch-list

| Surface                              | Notes |
|--------------------------------------|-------|
| `freeaddrinfo` / `getaddrinfo` (DNS) | Replacement strategy: Verum-native UDP DNS resolver against `/etc/resolv.conf`.  Standalone task. **Deferred.** |
| `verum_vbc::ffi::*` (libffi paths)   | Replace libffi with `__sys_*_raw` intrinsics under `verum_vbc/src/ffi/platform/{linux,darwin}.rs`.  **Deferred.** |
| `setjmp` / `longjmp` (exception unwinding, Linux body only) | Cross-compile fix landed; Linux body needs `llvm.eh.sjlj.setjmp`. **Open.** |
| `printf` in `Debug` opcode helper    | Internal-only debug helper; route through `verum_internal_puts` + Verum's number-to-text helpers. **Open — debug only.** |
| No-libc *linking* config vs. `--target` | The LLVM module triple is now correct (previous row), but the separate no-libc **linking** configuration is not yet unconditionally coupled to `--target` in every build path — a cross build can still pick up host linker flags / entry-point handling in some configurations. **Open, in progress.** |

The deferred items are large standalone tasks — they don't
block the no-libc claim for the canonical hot paths but must
close before V1.0. The cross-compilation row above is a reminder
that a row marked done here describes a point-in-time
verification, not a permanent guarantee — check the
[changelog](/docs/changelog) if the exact date matters to you.

## 7. Owner and mechanism

- **Owner.** codegen (`verum_codegen`) and runtime
  (`verum_vbc`) maintainers.
- **Mechanism.** Every PR that adds an `extern "C"`
  declaration in IR emission code or in an `@intrinsic`
  dispatch path must justify the symbol against this document.
  Reviewers reject unless the symbol is in the macOS-libSystem
  allow-list (acceptable per Apple ABI) or the
  embedded-bare-metal allow-list.

## 8. Cross-references

- [Changelog → AOT no-libc f64 / strtol formatting trio](/docs/changelog#added--aot-no-libc-f64--strtol-formatting-trio-complete-2026-05-04)
- [Architecture → Compilation pipeline](./compilation-pipeline.md)
- [Architecture → Codegen](./codegen.md)
- [Architecture → Runtime tiers](./runtime-tiers.md)
- [Verification → Codegen attestation](../verification/codegen-attestation.md)

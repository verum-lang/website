---
sidebar_position: 3
title: sys
description: V-LLSI kernel bootstrap — direct syscalls, I/O engine, platform abstractions.
---

# `core.sys` — V-LLSI kernel bootstrap

`sys` is the lowest-level module, the one and only FFI boundary. All
higher-level stdlib modules (`io`, `net`, `async`, `mem`) sit on top.

**V-LLSI** = Verum Low-Level System Interface. No libc dependency:

- **Linux**: direct `syscall` instructions via `syscall6`.
- **macOS**: Apple's stable ABI via `libSystem.B.dylib` (Mach + Darwin).
- **Windows**: `kernel32.dll` + `ntdll.dll`.
- **Embedded** / **no_runtime**: stack allocator, no syscalls, stubs for async.

Most user code never imports `sys` directly. This page is for runtime
authors, driver writers, and kernel engineers.

| Area | Files |
|---|---|
| Common types | `common.vr` |
| Raw syscall bindings | `core/intrinsics/runtime/os.vr` (post-migration canonical home; `core/sys/raw.vr` no longer exists). |
| Wrapped operations | `file_ops.vr`, `time_ops.vr`, `net_ops.vr`, `process_ops.vr`, `context_ops.vr` (each mounts the raw intrinsics from `core.intrinsics.runtime.os.{...}`). |
| I/O abstraction | `io_engine.vr` |
| Initialization | `init.vr` |
| Signals | `signal.vr` |
| Hardware control | `bitfield.vr`, `mmio.vr`, `interrupt.vr` |
| Byte-range file locking | `locking/mod.vr` (`LockHandle` affine RAII) |
| Crash-safe persistence | `durability.vr` (`full_fsync`, `sync_directory`) |
| Alternative runtimes | `embedded.vr`, `no_runtime.vr` |
| Linux (`@cfg(target_os="linux")`) | `syscall.vr`, `arch.vr`, `errno.vr`, `auxv.vr`, `io.vr`, `mem.vr`, `thread.vr`, `time.vr`, `tls.vr`, `bpf/` (eBPF map+program loader). Supports both x86_64 and aarch64 — architecture-specific syscall numbers live in `arch.vr` and are re-exported by `syscall.vr`; x86_64-only legacy syscalls (`open`, `stat`, `mkdir`, …) are gated behind `@cfg(target_arch="x86_64")`, with the portable `*at` variants (`openat`, `newfstatat`, `mkdirat`, …) available on both. |
| macOS (`@cfg(target_os="macos")`) | `libsystem.vr`, `mach.vr`, `io.vr`, `errno.vr`, `thread.vr`, `time.vr`, `tls.vr` |
| Windows (`@cfg(target_os="windows")`) | `kernel32.vr`, `ntdll.vr`, `io.vr`, `errno.vr`, `thread.vr`, `time.vr`, `tls.vr`, `ntstatus.vr`, `winsock2.vr` |

---

## Common types

```verum
type OSError is { code: Int, message: Text };
type FileDesc is (Int);                // type-safe file descriptor wrapper
type IOVec is { base: *mut Byte, len: Int };
type PageSize is Int;

type MemProt is bitflags {
    None   = 0x0,
    Read   = 0x1,
    Write  = 0x2,
    Exec   = 0x4,
};

type MapFlags is bitflags {
    Shared  = 0x01,
    Private = 0x02,
    Anon    = 0x20,
    Fixed   = 0x10,
    Stack   = 0x20000,
    HugeTlb = 0x40000,
};

type MemoryOrdering is Relaxed | Acquire | Release | AcqRel | SeqCst;
```

### Constants

```verum
const PAGE_SIZE: Int = 4096;                 // or 16384 on aarch64
const PAGE_SHIFT: Int = 12;
const MAX_CONTEXT_SLOTS: Int = 32;
const CONTEXT_STACK_DEPTH: Int = 256;
```

---

## Cross-platform file & random helpers — `sys.common`

Platform-agnostic syscall wrappers that dispatch to `sys.linux` /
`sys.darwin` / `sys.windows` under a single signature.  These are
the shape that pure-Verum stdlib modules (`core.database.sqlite`,
`core.security.aead`, `core.io.file`) actually call.

```verum
// File I/O — all positional, do not perturb fd offset
fn pread(fd: FileDesc, buf: &mut [Byte], offset: Int) -> Result<Int, OSError>
fn pwrite(fd: FileDesc, buf: &[Byte], offset: Int) -> Result<Int, OSError>

// File metadata
fn file_size(fd: FileDesc) -> Result<Int, OSError>
fn truncate(fd: FileDesc, length: Int) -> Result<(), OSError>
fn access(path: &[Byte], mode: Int) -> Result<Bool, OSError>   // F_OK / R_OK / W_OK / X_OK

// Durability
fn full_fsync(fd: FileDesc) -> Result<(), OSError>            // F_FULLFSYNC on macOS, fdatasync on Linux
fn sync_directory(path: &[Byte]) -> Result<(), OSError>

// Byte-range advisory file locks (POSIX fcntl / Win LockFileEx)
fn try_lock_region(fd: FileDesc, kind: FcntlLockKind, start: Int, len: Int) -> Result<(), OSError>
fn unlock_region(fd: FileDesc, start: Int, len: Int) -> Result<(), OSError>

// Cryptographic randomness — getrandom / SecRandomCopyBytes / BCryptGenRandom
fn random_bytes(buf: &mut [Byte]) -> Result<(), OSError>
```

All wrappers carry `IntrinsicHint.RequiresPermission`; capability
checking is the caller's responsibility (typically via
`sys.permissions`).  Errors are **typed `OSError`** with raw errno
plus localised message.

## Page alignment

```verum
fn page_align_up(x: Int) -> Int
fn page_align_down(x: Int) -> Int
fn is_page_aligned(x: Int) -> Bool
```

---

## OS memory

Direct mmap / VirtualAlloc (bypassing CBGR):

```verum
unsafe fn os_alloc(size: Int) -> Int                           // returns virtual addr
unsafe fn os_free(addr: Int, size: Int)
unsafe fn os_alloc_aligned(size: Int, align: Int) -> Int
unsafe fn os_alloc_huge(size: Int, huge_page_size: Int) -> Int
unsafe fn os_protect(addr: Int, size: Int, prot: MemProt)
unsafe fn os_advise(addr: Int, size: Int, advice: MemAdvice)   // madvise
```

```verum
type MemAdvice is
    | Normal | Random | Sequential
    | WillNeed | DontNeed
    | Free | Remove | DontFork
    | HugePage | NoHugePage;
```

These back the segment allocator in `mem`.

---

## Threads

```verum
fn get_thread_id() -> Int                          // OS-native TID
fn thread_self() -> ThreadHandle
fn thread_yield()                                   // sched_yield / Sleep(0)
fn thread_spawn(entry: fn(*mut Byte), arg: *mut Byte, stack_size: Int) -> Result<ThreadHandle, OSError>
fn thread_join(handle: ThreadHandle) -> Result<(), OSError>
fn thread_detach(handle: ThreadHandle) -> Result<(), OSError>
fn num_online_cpus() -> Int
```

### TLS (thread-local storage)

```verum
unsafe fn tls_get_base() -> *mut Byte              // TCB base
unsafe fn tls_slot_get(slot: Int) -> Maybe<Int>
unsafe fn tls_slot_set(slot: Int, value: Int)
unsafe fn tls_slot_clear(slot: Int)
unsafe fn tls_slot_has(slot: Int) -> Bool

unsafe fn tls_frame_push() -> Result<(), ContextError>
unsafe fn tls_frame_pop() -> Result<(), ContextError>

unsafe fn tls_read_ptr<T>(slot: Int) -> *const T
unsafe fn tls_write_ptr<T>(slot: Int, value: *const T)
unsafe fn tls_read_i32(slot: Int) -> Int32
unsafe fn tls_write_i32(slot: Int, value: Int32)
unsafe fn tls_read_usize(slot: Int) -> USize
unsafe fn tls_write_usize(slot: Int, value: USize)
```

---

## Context system (V-LLSI storage)

The dynamic `using` / `provide` system stores its stack in TLS slots.

```verum
type ContextError is
    | StackOverflow
    | StackUnderflow
    | SlotOccupied
    | SlotEmpty
    | InvalidSlot;

fn ctx_get(slot: Int) -> Maybe<Int>
fn ctx_get_mut(slot: Int) -> Maybe<&mut Int>
fn ctx_set(slot: Int, value: Int)
fn ctx_has(slot: Int) -> Bool
fn ctx_clear(slot: Int)
fn ctx_push_frame() -> Result<(), ContextError>
fn ctx_pop_frame() -> Result<(), ContextError>
```

User code interacts with this via `provide` / `using` — see
[Language → context system](/docs/language/context-system).

### `core.sys.context_ops` — raw V-LLSI TLS + DI surface

The thin wrappers in `core.sys.context_ops` sit one layer below the
typed `ctx_*` API above. They take a raw `Int`-keyed slot or type_id
and pass it straight through to the underlying interpreter / AOT
intrinsic. Use this surface only from runtime-implementation code;
user code should reach for the typed `ctx_*` family instead.

```verum
public let TLS_SLOT_COUNT: Int = 256;                  // V-LLSI per-thread arena ceiling

public fn tls_get(slot: Int) -> Int                    // read TLS slot
public fn tls_set(slot: Int, value: Int)               // write TLS slot

public fn context_provide(type_id: Int, value: Int)    // push DI value
public fn context_get(type_id: Int) -> Int             // most-recent provide for type_id
public fn context_end(type_id: Int)                    // pop the most-recent provide

public fn defer_register(cleanup_fn: fn(Int) -> Int, arg: Int)
public fn defer_execute()                              // pop top (Tier-1 invokes callback)
public fn defer_depth() -> Int
public fn defer_run_to(depth: Int)                     // truncate stack to depth
```

#### Tier-0 vs Tier-1 contract

| Operation | Tier 0 (interpreter) | Tier 1 (AOT) |
|---|---|---|
| `tls_set` / `tls_get` | round-trip via `state.context_stack` | round-trip via per-thread TCB |
| `context_provide` / `context_get` / `context_end` | round-trip via `state.context_stack` | round-trip via per-thread TCB |
| `defer_register` / `defer_run_to` / `defer_depth` | maintains `(fn_id, arg)` stack — depth tracking accurate | maintains stack + cleanup-callback dispatch |
| `defer_execute` (callback invocation) | **not invoked** — interpreter cannot synthesise indirect `fn(Int) -> Int` dispatch | invoked via call-frame machinery |

The interpreter wiring closed in this branch — pre-fix every raw
intrinsic above returned constant 0/nil, leaving the V-LLSI context
arena entirely inert under Tier 0. See
`core-tests/sys/context_ops/audit.md` for the conformance report.

---

## Value types — `sys.io_engine`

Refinement-typed value types used by the I/O engine protocol below.

```verum
public type Port is UInt16
public type BoundPort is Port where |p| p > 0

public type EngineDuration is (UInt64)            // always non-negative
public type NonZeroDuration is EngineDuration where |d| d.0 > 0

public type TimeSpec is { tv_sec: Int64, tv_nsec: Int64 }

public type Fd is (Int32)
public type ValidFd is Fd where |fd| fd.0 >= 0
```

### `EngineDuration` constructors and accessors

| Constructor | Returns |
|---|---|
| `EngineDuration.from_nanos(n: UInt64)` | `EngineDuration` |
| `EngineDuration.from_micros(n: UInt64)` | `n * 1_000` ns |
| `EngineDuration.from_millis(n: UInt64)` | `n * 1_000_000` ns |
| `EngineDuration.from_secs(n: UInt64)` | `n * 1_000_000_000` ns |
| `EngineDuration.ZERO` | `0` ns |
| `EngineDuration.MAX` | `UInt64.MAX` ns (≈ 584 years) |
| `MAX_PRACTICAL_DURATION` | `365 * 86400 * 1_000_000_000` (1 year cap) |

| Accessor | Returns |
|---|---|
| `d.as_nanos()` | `d.0` (identity) |
| `d.as_millis()` | `d.0 / 1_000_000` |
| `d.as_secs()` | `d.0 / 1_000_000_000` |
| `d.is_zero()` | `d.0 == 0` |
| `d.saturating_add(other)` | caps at `EngineDuration.MAX` |
| `d.saturating_sub(other)` | floors at `EngineDuration.ZERO` |
| `d.to_timespec()` | POSIX `timespec` projection |

### `Fd` predicates

| Method | Semantics |
|---|---|
| `Fd.INVALID` | sentinel `Fd(-1)` |
| `f.as_raw()` | `Int32` accessor |
| `f.is_valid()` | `f.0 >= 0` |
| `f.try_as_valid()` | `Maybe<ValidFd>` |
| `f.as_valid()` | `ValidFd` (panics on invalid) |

### Standard descriptors

```verum
public const STDIN_FD: ValidFd = Fd(0) as ValidFd
public const STDOUT_FD: ValidFd = Fd(1) as ValidFd
public const STDERR_FD: ValidFd = Fd(2) as ValidFd
```

---

## I/O engine

```verum
type IOEngine is protocol {
    fn submit(&self, op: CompletionOp) -> Result<SubmissionId, IoError>;
    fn poll(&self, timeout: Maybe<Duration>) -> List<CompletionResult>;
    fn shutdown(&self);
}

type CompletionOp is
    | Read  { fd: FileDesc, buf: *mut Byte, len: Int, offset: Int }
    | Write { fd: FileDesc, buf: *const Byte, len: Int, offset: Int }
    | Accept { fd: FileDesc, addr: *mut Byte, addrlen: *mut Int }
    | Connect { fd: FileDesc, addr: *const Byte, addrlen: Int }
    | Send { fd: FileDesc, buf: *const Byte, len: Int, flags: Int }
    | Recv { fd: FileDesc, buf: *mut Byte, len: Int, flags: Int }
    | Timeout { duration: Duration }
    | Close { fd: FileDesc };

type CompletionResult is {
    submission_id: SubmissionId,
    result: Int,                    // negative = errno
    flags: Int,
};

fn create_io_engine(config: IoEngineConfig) -> Result<Heap<IOEngine>, IoError>
```

Platform picks:

- **Linux**: `IoUringDriver` (fallback: `EpollDriver`)
- **macOS**: `KqueueDriver`
- **Windows**: `IocpDriver`

---

## Filesystem watcher — `sys.fs_watch`

Native, event-driven filesystem monitoring on top of the per-platform
kernel facility:

| Platform | Backend |
|---|---|
| macOS | kqueue `EVFILT_VNODE` |
| Linux | inotify (`inotify_init1` + `inotify_add_watch` direct syscalls) |
| Windows | `ReadDirectoryChangesW` (overlapped + WaitForMultipleObjects) |

Sub-millisecond latency, kernel-driven; no polling overhead.

```verum
public type FsEventKind is
    | Created
    | Modified
    | Deleted
    | Renamed
    | AttribChanged;

public type FsEvent is {
    path: Text,
    kind: FsEventKind,
}

@must_consume
public type FsWatcher is { inner: FsWatcherImpl }

implement FsWatcher {
    public fn new() -> Result<FsWatcher, Text>
    // .watch(path) — add a target to the watcher
    // .recv()      — block for the next FsEvent
    // .recv_with_timeout(d) — bounded wait
}
```

---

## Byte-range file locks — `sys.locking`

High-level, typed wrapper around the per-platform fcntl /
`LockFileEx` primitives in `sys.common`. The user-facing surface
expresses the lifecycle through an affine `LockHandle` that consumes
its receiver on `.unlock()` — releasing without explicit unlock is
also safe (handled by `Drop`).

```verum
public type FileLockKind is Shared | Exclusive

public type LockRegion is {
    start: Int,
    length: Int,    // -1 = "from start to EOF"
}

public type LockError is
    | Conflict(owner_pid: Maybe<Int>)
    | IoError(err: OSError)
```

The 5-state SQLite locking protocol (SHARED / RESERVED / PENDING /
EXCLUSIVE) is built on top of these primitives in
`core.database.sqlite.native.l0_vfs.locking`.  Advisory-only on
POSIX; mandatory on Windows; NFS not supported.

---

## Crash-safe persistence — `sys.durability`

Intent-named re-export surface over the durability primitives in
`sys.common`. Callers prefer `mount core.sys.durability.{full_fsync,
sync_directory}` over reaching into the catch-all common namespace,
so the intent is visible at the import site.

```verum
public mount core.sys.common.full_fsync
public mount core.sys.common.data_only_fsync
public mount core.sys.common.sync_directory
public mount core.sys.common.pread
public mount core.sys.common.pwrite
```

Per-platform backends:

| Platform | `full_fsync` | `sync_directory` |
|---|---|---|
| Linux | `fsync(fd)` direct syscall | `fsync(dirfd)` |
| macOS | `fcntl(fd, F_FULLFSYNC)` (stronger than `fsync`) | `fsync(dirfd)` |
| Windows | `FlushFileBuffers(handle)` | no-op (NTFS journals dir updates) |

---

## Initialization

```verum
fn verum_init(cfg: InitConfig) -> Result<(), InitError>
fn verum_shutdown()
fn is_initialized() -> Bool

fn init_thread() -> Result<(), InitError>
fn cleanup_thread()

type InitError is
    | AlreadyInitialized
    | InvalidConfig(Text)
    | PlatformError(OSError);

type PanicInfo is {
    message: Text,
    location: SourceLocation,
    thread_id: Int,
};
fn panic_impl(info: &PanicInfo) -> !
fn set_panic_handler(h: fn(&PanicInfo) -> !)
```

---

## Time operations — `sys.time_ops`

`core.sys.time_ops` is the syscall-level layer that
[`core.time`](/docs/stdlib/time) sits on top of. Two record types and a
small free-function surface route into three @intrinsic-decorated raw
functions (`__time_monotonic_nanos_raw`, `__time_sleep_nanos_raw`,
`__time_now_ms_raw`) whose runtime is implemented in
`crates/verum_vbc/src/interpreter/dispatch_table/handlers/calls.rs:1492-1514`
(interpreter / Tier 0) and `crates/verum_codegen/src/llvm/platform_ir.rs:15605-15732`
(AOT / Tier 1).

```verum
type SysTimeOpsInstant is { nanos: Int };
type SysTimeOpsDuration is { nanos: Int };
```

### `SysTimeOpsInstant`

| Method | Returns | Semantics |
|---|---|---|
| `SysTimeOpsInstant.now()` | `SysTimeOpsInstant` | Monotonic clock read — non-negative, non-decreasing across sequential calls. POSIX `clock_gettime(CLOCK_MONOTONIC)` / equivalent. |
| `t.elapsed()` | `SysTimeOpsDuration` | `now() - t.nanos`, expressed as Duration. |
| `t.duration_since(earlier)` | `SysTimeOpsDuration` | `t.nanos - earlier.nanos`. |

### `SysTimeOpsDuration`

| Constructor | Returns |
|---|---|
| `SysTimeOpsDuration.from_nanos(n: Int)` | `SysTimeOpsDuration` |
| `SysTimeOpsDuration.from_micros(n: Int)` | `n * 1_000` ns |
| `SysTimeOpsDuration.from_millis(n: Int)` | `n * 1_000_000` ns |
| `SysTimeOpsDuration.from_secs(n: Int)` | `n * 1_000_000_000` ns |
| `SysTimeOpsDuration.zero()` | `0` ns |

| Accessor | Returns |
|---|---|
| `d.as_nanos()` | `d.nanos` (identity) |
| `d.as_micros()` | `d.nanos / 1_000` (integer truncation toward zero) |
| `d.as_millis()` | `d.nanos / 1_000_000` |
| `d.as_secs()` | `d.nanos / 1_000_000_000` |

The accessor chain forms a refinement: `d.as_secs() <= d.as_millis() / 1000 <= d.as_micros() / 1000 <= d.as_nanos() / 1000`.

### Free functions

```verum
public fn sleep(d: SysTimeOpsDuration)   // sleep for d.nanos
public fn sleep_ms(ms: Int)              // sleep for ms milliseconds
public fn sleep_secs(s: Int)             // sleep for s seconds
public fn wall_clock_ms() -> Int         // milliseconds since Unix epoch (wall clock)
```

### Conformance & open defects

See [the module-status table below](#module-status) for the current
green-test count and the gating defects. Arithmetic API surface
(`SysTimeOpsDuration.from_*` / `as_*` / `zero`) is stable in both
interpreter and AOT. Every clock-touching API (`SysTimeOpsInstant.now`,
`sleep_*`, `wall_clock_ms`) is currently gated by **task #5** —
the intrinsic-mount propagation defect surfaced by this module's
suite, audited in `core-tests/sys/time_ops/audit.md`.

---

## File operations — `sys.file_ops`

Thin Verum-side shim over the canonical POSIX file syscalls. The
`OpenMode` newtype packs the canonical `O_*` flag bit-patterns so
callers don't have to import platform-specific constants directly.

```verum
public type OpenMode is { flags: Int };

implement OpenMode {
    public fn read() -> OpenMode        // O_RDONLY = 0
    public fn write() -> OpenMode       // O_WRONLY | O_CREAT | O_TRUNC = 0x301
    public fn read_write() -> OpenMode  // O_RDWR = 2
    public fn append() -> OpenMode      // O_WRONLY | O_CREAT | O_APPEND = 0x409
    public fn create() -> OpenMode      // O_WRONLY | O_CREAT | O_EXCL = 0x241
}

public fn read_file(path: Text) -> Maybe<Text>           // None on ENOENT
public fn write_file(path: Text, content: Text) -> Bool  // true on success
public fn append_file(path: Text, content: Text) -> Bool
public fn delete_file(path: Text) -> Bool                // false on missing
public fn file_exists(path: Text) -> Bool
public fn file_size(path: Text) -> Int                   // -1 sentinel
```

The error contract is intentionally lossy at this layer — the caller
gets a `Maybe` or `Bool` and is expected to consult `errno` separately
if structured error propagation is required. `core.io.fs` is the
higher-level shape that funnels through `Result<T, OSError>`.

---

## Process operations — `sys.process_ops`

```verum
public type ProcessExitStatus is { code: Int };
implement ProcessExitStatus {
    public fn success(&self) -> Bool   // code == 0
    public fn code(&self) -> Int
}

public type Child is { pid: Int, stdout_fd: Int, stderr_fd: Int };
implement Child {
    public fn wait(&self) -> ProcessExitStatus
    public fn read_stdout(&self) -> Text  // "" when stdout_fd < 0
}

public fn spawn(program: Text, args: List<Text>) -> Maybe<Child>
public fn run(program: Text, args: List<Text>) -> ProcessExitStatus
public fn args() -> List<Text>
public fn arg_count() -> Int
public fn arg_unchecked(index: Int) -> Text
```

The `arg_unchecked(i)` form is the canonical path for `core.cli.*`'s
argv parser — user code should reach for `core.base.env.arg(i) -> Maybe<Text>`
which performs the bounds check internally.

---

## Raw TCP / UDP — `sys.net_ops`

FFI-only fallback socket types. The user-facing rich API lives in
[`core.net.tcp` / `core.net.udp`](/docs/stdlib/net) — `RawTcpStream`,
`RawTcpListener`, `RawUdpSocket` here are the raw shapes user code
should NOT reach for unless explicitly working around the IoEngine
async boundary (e.g. in low-level test harnesses).

```verum
public type RawTcpStream is { fd: Int };
implement RawTcpStream {
    public fn connect(host: Text, port: Int) -> Maybe<RawTcpStream>
    public fn send(&self, data: Text) -> Int
    public fn recv(&self, max_len: Int) -> Text
    public fn close(&self)
    public fn raw_fd(&self) -> Int
}

public type RawTcpListener is { fd: Int };
implement RawTcpListener {
    public fn bind(port: Int) -> Maybe<RawTcpListener>
    public fn accept(&self) -> Maybe<RawTcpStream>
    public fn close(&self)
    public fn raw_fd(&self) -> Int
}

public type RawUdpSocket is { fd: Int };
implement RawUdpSocket {
    public fn bind(port: Int) -> Maybe<RawUdpSocket>
    public fn send_to(&self, data: Text, host: Text, port: Int) -> Int
    public fn recv(&self, max_len: Int) -> Text
    public fn close(&self)
}
```

The `Raw*` name prefix is mandatory (#75) — pre-rename the bare
`TcpStream` / `TcpListener` / `UdpSocket` names silently shadowed
the rich `core.net.*` API and broke `addr.port()` method lookup.

---

## Module status

Each `core.sys.*` module carries an explicit conformance status so you
know what you can rely on today versus what is still in flight. The
status is the truth-table over the module's API surface as exercised
by `core-tests/sys/<module>/` under both `verum test --interp` (Tier 0
VBC interpreter) and `verum test --aot` (Tier 2 LLVM AOT).

| Status | Meaning |
|---|---|
| **stable** | Every public method conformance-tested. Algebraic laws pinned by exhaustive or large-domain property tests. Cross-stdlib integration verified. Interpreter and AOT agree on every test. Safe to depend on in production. |
| **partial** | Subset of the public API is conformance-tested. The rest is exercised in `regression_test.vr` via `@ignore`d (or workaround-style) tests pinning the specific defects that block coverage. The non-ignored API surface is safe; everything else is documented per-module under "Open defects". |
| **regression-only** | Module is gated by upstream stdlib / language-level defects. Public-API tests do not pass yet — only `@ignore`d regressions exist to lock the bug shapes. Avoid in production until promoted. |
| **undocumented** | Documentation in this reference is authoritative, but the module has not yet been routed through the `core-tests/` conformance suite. The current page is a best-effort snapshot of the source; it may drift from runtime behaviour. |

| Module | Status | Conformance suite |
|---|---|---|
| `common.vr`        | **partial** | [core-tests/sys/common](https://github.com/verum-lang/verum/tree/main/core-tests/sys/common) — 70+ type-level tests green: PAGE_SIZE / page_align_* / OSError / FileDesc / IOVec / MemProt / MapFlags / SysContextError / FcntlLockKind / ACCESS_* / SEEK_SET / F_*LCK / MAX_CONTEXT_SLOTS / CONTEXT_STACK_DEPTH. Mount re-export defect (`mount core.sys.{PAGE_SIZE}` resolving to wrong sibling) closed by parent-prefix scan in `process_import_tree`. **Two fundamental fixes landed 2026-05-16** (commits `0b17c7579` + `c8e39850c`): (a) sized-integer `==/!=` (Int8/Int16/Int32/Int64/UInt8..UInt128/USize/ISize/Byte) on cross-module-const operands no longer infinite-recurses through method dispatch — `compile_binary`'s `is_primitive` extended to consult `is_numeric_type` registry + `extract_expr_type_name(Path)` propagates const declared types; (b) `EqG protocol_id=0` (blanket-impl `<T: Eq>` Eq dispatch like `Maybe<OSError>.eq`) now reads runtime `ObjectHeader.type_id` and dispatches through `<TypeName>.eq` instead of falling through to structural `deep_value_eq` (`OSError.eq` compares only `code`, so structural pre-fix returned false for two same-code different-message records). FileDesc.STDIN/INVALID const-method access deferred (typechecker `__newtype_inner_X` gap for archive-loaded transparent-wrapper records). FFI-adjacent surface (os_alloc / pread / pwrite / fsync / try_lock_region / file_size / access / random_bytes / init_process_args) deferred to per-platform integration. |
| `cabi.vr`          | **complete** | [core-tests/sys/cabi](https://github.com/verum-lang/verum/tree/main/core-tests/sys/cabi) — 22 unit + 9 property + 5 regression all green. Every alias (CInt / CUInt / CLong / CULong / CSize / CSSize / COff / CMode / CPid / CUid / CGid / CClockId / CSockLen / CFd) round-trips through tuple-newtype construction; CFD_STDIN / CFD_STDOUT / CFD_STDERR sentinel triple pinned. Transparent-wrapper newtype constructor registration fix in `archive_ctx_loader.rs` Pass 5 closed every CFD_* / direct-CFd-construction test. |
| `bitfield.vr`      | **regression-only** | [core-tests/sys/bitfield](https://github.com/verum-lang/verum/tree/main/core-tests/sys/bitfield) — 56 unit + 3 pinned regressions (gated by cross-module free-fn dispatch defect) |
| `mmio.vr`          | **partial** | [core-tests/sys/mmio](https://github.com/verum-lang/verum/tree/main/core-tests/sys/mmio) — 8/8 BarrierKind + compiler_barrier/dmb green. MemoryFlags const access + MemoryRegion methods consuming MemoryFlags const gated by typechecker `__newtype_inner_X` gap (same as FileDesc.STDIN). MmioRegister<T, MODE> generic + VerifiedRegister ghost-state deferred — require runtime MMIO fixture. |
| `interrupt.vr`     | **regression-only** | [core-tests/sys/interrupt](https://github.com/verum-lang/verum/tree/main/core-tests/sys/interrupt) — Kernel-mode surface (CriticalSection / InterruptCell\<T\> / disable_interrupts / context_switch); the in-process `verum test` harness can only pin the user-side type-shape (CriticalSection.is_active returns Bool, InterruptCell\<T\>.new construction). Full surface exercised by VCS specs under `L0-critical/` and the embedded runtime integration suite. |
| `time_ops.vr`      | **partial** | [core-tests/sys/time_ops](https://github.com/verum-lang/verum/tree/main/core-tests/sys/time_ops) — Arithmetic API (`SysTimeOpsDuration.from_*/as_*/zero`) GREEN in both `--interp` and `--aot`. Clock API (`SysTimeOpsInstant.now/elapsed/duration_since`) GREEN post-fix. **Task #5 CLOSED in commit `51ecc3bc9`** — fundamental architectural fix: replaced the hardcoded dependency-graph HashMap in `core_compiler.rs` with `augment_dependencies_from_mounts` — a regex-based mount scan that auto-derives the implied module dep edges from every stdlib `.vr` file's `mount <path>` declarations. A `FOUNDATION_DEPS_TO_FORCE` const force-orders `core.intrinsics` + `core.intrinsics.runtime` before their 20+ consumers (sys/base/mem/async/io/text/runtime/net/sync subdirs). The fix transitively closes the panic-stub class across the entire stdlib — every `@intrinsic`-decorated raw-syscall declaration is now reliably visible to its consumers' mount-resolution path at codegen time. 2 residual defects: §C `Child.read_stdout` silent-empty data-loss (separate stub-body class); §D `wall_clock_ms()` returns < post-2000 ms (runtime SystemTime dispatch — exposed by §A close, distinct defect). |
| `file_ops.vr`      | **partial** | [core-tests/sys/file_ops](https://github.com/verum-lang/verum/tree/main/core-tests/sys/file_ops) — OpenMode bit-patterns (read=0 / write=0x301 / append=0x409 / create=0x241 / read_write=2) + error-sentinel paths (missing path → None / -1 / false) pinned end-to-end. **Task #FUNDAMENTAL-SYS-RAW CLOSED in this branch** — replaced stale `mount super.raw.*` (pointed at deleted `core/sys/raw.vr` post-migration) with canonical `mount core.intrinsics.runtime.os.{__file_*_raw}`. Pre-fix every `__file_*_raw` call silently compiled to a lenient panic-stub. Happy-path round-trip (write→read of same content) deferred to integration suite with tmpdir fixture. |
| `net_ops.vr`       | **partial** | [core-tests/sys/net_ops](https://github.com/verum-lang/verum/tree/main/core-tests/sys/net_ops) — Raw\* canonical-name (RawTcpStream / RawTcpListener / RawUdpSocket; #75 shadow-break) + fd round-trip + connect→None on unroutable-port sweep pinned. **Task #FUNDAMENTAL-SYS-RAW CLOSED** — same architectural fix as file_ops. Live socket round-trip deferred (needs fixture pair). |
| `process_ops.vr`   | **partial** | [core-tests/sys/process_ops](https://github.com/verum-lang/verum/tree/main/core-tests/sys/process_ops) — ProcessExitStatus.success ↔ code==0 + Child invalid-fd short-circuit + args/arg_count coherence pinned. **Task #FUNDAMENTAL-SYS-RAW CLOSED** — same architectural fix. spawn / run happy path deferred (needs CI-portable fixture). |
| `process_native.vr`| undocumented | — |
| `context_ops.vr`   | **partial** | [core-tests/sys/context_ops](https://github.com/verum-lang/verum/tree/main/core-tests/sys/context_ops) — TLS_SLOT_COUNT=256 + tls_set/get round-trip + context_provide/get/end DI scope + defer_depth tracking pinned end-to-end. **Two fundamental fixes landed in this branch**: (a) **Task #FUNDAMENTAL-SYS-RAW** — replaced stale `mount super.raw.*` with canonical `mount core.intrinsics.runtime.os.{__ctx_*_raw, __defer_*_raw}`; (b) **Task #FUNDAMENTAL-CTX-INTRINSICS** — wired interpreter `__ctx_get_raw` / `__ctx_provide_raw` / `__ctx_end_raw` / `__defer_*_raw` to the real `state.context_stack` + new `state.defer_stack` (pre-fix every TLS/DI/defer raw intrinsic returned constant 0/nil; the interpreter's existing ContextStack opcode-level wiring at 0xB0/0xB1/0xB2 was correct but the raw-function dispatch arm was completely inert). `defer_execute` callback invocation deferred to Tier-1 (interpreter can't synthesise indirect `fn(Int)->Int` dispatch). |
| `signal.vr`        | **regression-only** | [core-tests/sys/signal](https://github.com/verum-lang/verum/tree/main/core-tests/sys/signal) — 14/52 green. Pre-existing stdlib defects in Signal: variant-tag drift on @cfg-aware match arms, `atomic_load`/`atomic_store` intrinsic registration missing for SignalFlag. Architectural — drift is in stdlib Signal implementation, not test infrastructure. |
| `fs_watch.vr`      | **partial** | [core-tests/sys/fs_watch](https://github.com/verum-lang/verum/tree/main/core-tests/sys/fs_watch) — FsEventKind 5-variant (Created/Modified/Deleted/Renamed/AttribChanged) + Clone impl + FsEvent record round-trip pinned. FsWatcher.new() / .watch() / event-stream surface deferred (needs per-platform fixture). |
| `io_engine.vr`     | **partial** | [core-tests/sys/io_engine](https://github.com/verum-lang/verum/tree/main/core-tests/sys/io_engine) — EngineDuration ring algebra (from/as scaling, saturating add/sub, identity laws) + Fd partition (valid ↔ raw >= 0) + Fd.INVALID = -1 + TimeSpec record pinned end-to-end. IOEngine protocol round-trip + CompletionOp 18-variant + Port/BoundPort refinement validation + RawSocketAddr V4/V6 deferred. |
| `init.vr`          | **partial** | [core-tests/sys/init](https://github.com/verum-lang/verum/tree/main/core-tests/sys/init) — InitError 6-variant (TlsFailed/ContextFailed/AllocatorFailed/PanicHandlerFailed/AlreadyInitialized/NotInitialized) + Eq laws (reflexivity / symmetry / payload-aware) + .message contents pinned. `verum_init` / `verum_shutdown` / `panic_impl` deferred (bootstrap-time + termination-time; out of scope for in-process tests). |
| `durability.vr`    | **partial** | [core-tests/sys/durability](https://github.com/verum-lang/verum/tree/main/core-tests/sys/durability) — Intent-named re-exports (`full_fsync` / `data_only_fsync` / `sync_directory` / `pread` / `pwrite`) resolve via the `public mount core.sys.common.X` chain. Error-funnel (`Result<(), OSError>` on invalid fd) pinned across full_fsync + data_only_fsync with the invalid-fd sweep. Happy-path round-trip + pread/pwrite/sync_directory CBGR-byte-slice deferred. |
| `locking/mod.vr`   | **partial** | [core-tests/sys/locking](https://github.com/verum-lang/verum/tree/main/core-tests/sys/locking) — FileLockKind Shared/Exclusive (#160 rename from `LockKind` to avoid SQLite VFS shadow) + LockRegion start/length with -1 EOF sentinel + LockError Conflict(Maybe\<Int\>)/IoError(OSError) variant payload shapes pinned. try_lock / unlock live round-trip deferred (needs fd fixture). |
| `embedded.vr`      | undocumented | — |
| `no_runtime.vr`    | undocumented | — |

---

## Bitfields and MMIO

### `core.sys.bitfield` — bit-manipulation primitives

> **Status: regression-only**.
>
> The 8 free functions plus `field_mask` and `USIZE_BITS` are landed in
> `core/sys/bitfield.vr` and route through `core/sys/mod.vr`'s
> `bitfield.{...}` re-export. Implementation is `pure`,
> `@inline(always)`, branchless except at the documented
> `width == 0` / `width >= USIZE_BITS` boundaries — under
> monomorphisation each call collapses to one or two CPU instructions
> and is eligible for constant folding when the arguments are
> compile-time constants.
>
> The conformance suite is currently `regression-only` because the
> cross-module free-function dispatch defect (see
> [core-tests/sys/bitfield/audit.md §3.2](https://github.com/verum-lang/verum/tree/main/core-tests/sys/bitfield/audit.md#32-cross-module-free-function-dispatch-silently-returns-unitnil))
> short-circuits every assertion to `()` at `--interp` runtime. The
> implementation itself has no known correctness gaps; the suite turns
> green at runtime the moment the dispatch defect closes.

#### Canonical API surface

All operations work over `USize` — the platform-native bitfield word
that pairs with the `BitfieldElement` protocol's
`to_bits / from_bits` lingua franca. On any 64-bit target the LLVM
lowering is bit-identical to `UInt64`; on 32-bit embedded targets
`USize` narrows to 32 bits and the operations follow.

```verum
mount core.sys.bitfield;

// --- Bit-width constant ----------------------------------------
public const USIZE_BITS: USize = USize.bits;

// --- Single-bit operations -------------------------------------
public pure fn test_bit(value: USize, n: USize) -> Bool;
public pure fn set_bit(value: USize, n: USize) -> USize;
public pure fn clear_bit(value: USize, n: USize) -> USize;
public pure fn toggle_bit(value: USize, n: USize) -> USize;

// --- Mask operations -------------------------------------------
public pure fn set_bits(value: USize, mask: USize) -> USize;
public pure fn clear_bits(value: USize, mask: USize) -> USize;

// --- Field operations ------------------------------------------
public pure fn field_mask(offset: USize, width: USize) -> USize;
public pure fn extract_bits(value: USize, offset: USize, width: USize) -> USize;
public pure fn insert_bits(value: USize, bits: USize, offset: USize, width: USize) -> USize;
```

#### Boundary table

Let `N = USIZE_BITS`. Every field operation lifts the boundary cases
out of the hot path so the call is total over `0..=N` regardless of
host-instruction-set quirks.

| `width` | `extract_bits(v, o, w)` | `insert_bits(v, b, o, w)` | `field_mask(o, w)` |
|---|---|---|---|
| `0` | `0` | `value` (no field, no change) | `0` |
| `1..N-1` | `(v >> o) & ((1 << w) - 1)` | `(v & !field) \| ((b & low_mask) << o)` | `((1 << w) - 1) << o` |
| `N` (full) | `value` (full read-through) | `bits` (full overwrite) | `!0` (all ones) |

The `width >= USIZE_BITS` lift exists because LLVM defines `shl ?, N`
as poison when `N >= bit_width`; on x86_64 the silicon further masks
the shift count to `N-1`, producing `1 << 0 = 1` instead of "all
ones". Without the lift the hot-path expression would yield UB at the
boundary; with it, every call is defined.

#### Algebraic laws

Every operation carries an algebraic contract:

| Operation | Law |
|---|---|
| `set_bit / clear_bit / set_bits / clear_bits` | **Idempotent**: applying twice with the same mask/index is the same as applying once. |
| `toggle_bit` | **Self-inverse**: `toggle_bit(toggle_bit(v, n), n) == v`. |
| `extract_bits ∘ insert_bits` | **Round-trip**: `extract_bits(insert_bits(v, b, o, w), o, w) == b & field_mask(0, w)` for any `o + w ≤ USIZE_BITS`. |
| `field_mask` | **Disjoint-union**: `field_mask(o, w) \| field_mask(o + w, k) == field_mask(o, w + k)` when `o + w + k ≤ USIZE_BITS`. |
| `insert_bits` | **Adjacent-field independence**: leaves every bit outside `[o, o + w)` unchanged. |
| `test_bit` ↔ `extract_bits` | `test_bit(v, n) == (extract_bits(v, n, 1) == 1)` for every `n < USIZE_BITS`. |
| `set_bit` ↔ `set_bits` | `set_bit(v, n) == set_bits(v, 1 << n)` (single-bit form is the mask form specialised to a unit mask). Same for `clear_bit` ↔ `clear_bits`. |

#### Caller contracts (NOT runtime-enforced)

```
n < USIZE_BITS                  for *_bit operations
offset + width <= USIZE_BITS    for *_bits / extract / insert
width <= USIZE_BITS             for field_mask / extract / insert
```

Violating these silently yields the LLVM-poison value of the
underlying shift; downstream computations remain defined-but-garbage.
Bitfield-codegen call sites prove these invariants from the
surrounding `@bits(N)` annotations, so the runtime checks would be
pure overhead.

#### Example — packed sensor sample

```verum
mount core.sys.bitfield;

// 16-bit packed sample: 4-bit channel | 12-bit value
fn pack_sample(channel: USize, value: USize) -> USize {
    let raw = bitfield.insert_bits(0 as USize, channel, 0 as USize, 4 as USize);
    bitfield.insert_bits(raw, value, 4 as USize, 12 as USize)
}

fn unpack_sample(raw: USize) -> (USize, USize) {
    let channel = bitfield.extract_bits(raw, 0 as USize, 4 as USize);
    let value   = bitfield.extract_bits(raw, 4 as USize, 12 as USize);
    (channel, value)
}
```

#### `BitfieldElement` and `Bitfield` protocols

The protocols underlie compiler-generated `@bitfield` types (see
`@bitfield` attribute below):

```verum
public type BitfieldElement is protocol {
    const BIT_WIDTH: USize;
    fn from_bits(bits: USize) -> Self;
    fn to_bits(self) -> USize;
};

implement BitfieldElement for Bool   { const BIT_WIDTH: USize = 1;  ... }
implement BitfieldElement for UInt8  { const BIT_WIDTH: USize = 8;  ... }
implement BitfieldElement for UInt16 { const BIT_WIDTH: USize = 16; ... }
implement BitfieldElement for UInt32 { const BIT_WIDTH: USize = 32; ... }
implement BitfieldElement for UInt64 { const BIT_WIDTH: USize = 64; ... }

public type Bitfield is protocol {
    const SIZE_BYTES: USize;
    const SIZE_BITS:  USize;
    fn zero() -> Self;
    fn as_bytes(&self)        -> &[UInt8];
    fn as_bytes_mut(&mut self) -> &mut [UInt8];
};
```

The compiler auto-derives `Bitfield` for any type annotated with
`@bitfield`. Bitfield fields have one absolute restriction: their
address cannot be taken (`&field` is forbidden). Total bits must
align to byte boundaries (or use explicit `@padding`).

#### `@bitfield` attribute and derived types

```verum
@repr(C)
@bitfield
@endian(little)
public type TcpFlags is {
    @bits(1) fin: Bool,
    @bits(1) syn: Bool,
    @bits(1) rst: Bool,
    @bits(1) psh: Bool,
    @bits(1) ack: Bool,
    @bits(1) urg: Bool,
    @bits(2) reserved: UInt8,
};

let flags = TcpFlags { fin: true, syn: true, ..TcpFlags.zero() };
assert(flags.fin);
assert(flags.syn);
```

Compile-time verification helpers (used by `@bitfield` lowering):

```verum
@const public fn verify_byte_alignment<TOTAL_BITS: meta USize>() -> Bool
    where TOTAL_BITS % 8 == 0;

@const public fn verify_field_width<FIELD_BITS: meta USize, TYPE_BITS: meta USize>() -> Bool
    where FIELD_BITS <= TYPE_BITS;

@const public fn verify_enum_fits<MAX_VARIANT: meta USize, BITS: meta USize>() -> Bool
    where MAX_VARIANT < (1 << BITS);
```

#### Open defects

The conformance suite under `core-tests/sys/bitfield/` pins three
language-level defects that block the suite from turning green at
runtime; each has its own task on the language-implementation track.

| # | Defect | Status |
|---|---|---|
| 1 | Cross-module free-function dispatch silently returns `Unit/nil` at `--interp` runtime — affects every `mount X.{free_fn}` and `module.fn(args)` call site (workspace-wide; `core.base.glob.matches` exhibits the same shape). | tracked, in progress |
| 2 | `mount X.{public_const}` does not register the name in the codegen's global symbol table; cross-module imports of `public const` items report `UndefinedVariable("CONST_NAME")` at codegen. Workaround: `mount X; X.CONST`. | tracked |
| 3 | Parallel UInt64 implementations in `core.math.bits` previously caused codegen to dispatch to the wrong implementation under monomorphisation. **Eliminated** by collapsing to the single canonical home (`core.sys.bitfield`); pinned in `regression_test.vr` to prevent re-introduction. | closed |

These defects are NOT specific to `core.sys.bitfield` — they are
foundational language-level gaps that cascade into every module that
exercises cross-module free-function calls. Closing any of them
unlocks coverage in many downstream modules at once.

### MMIO — memory-mapped I/O

```verum
type AccessMode is Volatile | Sync | Relaxed;

type Register<T, const ADDR: UInt64> is { mode: AccessMode };
type MemoryRegion is { base: *mut Byte, length: Int, cacheable: Bool };

fn volatile_load<T>(addr: UInt64) -> T
fn volatile_store<T>(addr: UInt64, value: T)
fn barrier(order: MemoryOrdering)
fn dmb()                                        // data memory barrier (arm64)
fn dsb()                                        // data sync barrier
fn isb()                                        // instruction sync barrier
```

### Interrupts

```verum
type ExceptionFrame is { ... };                 // CPU context at exception
type CriticalSection is { ... };

fn disable_interrupts() -> CriticalSection       // RAII guard
fn enable_interrupts()
cs.release()                                     // re-enables on drop
```

---

## Byte-range file locking — `sys.locking`

Advisory byte-range locking, typed and capability-safe. Wraps
`fcntl(F_OFD_SETLK)` on Linux, `fcntl(F_SETLK)` on macOS, and
`LockFileEx` on Windows. Used by [`core.database`](/docs/stdlib/database)
to implement SQLite's 5-state locking protocol.

```verum
mount core.sys.locking.{LockRegion, LockKind, LockHandle, try_lock, unlock};

public type LockKind is Shared | Exclusive;     // no Unlock variant — unlock consumes
public type LockRegion is { start: Int, length: Int };  // length == -1 ⇒ to EOF
public type LockError is
      Conflict(owner_pid: Maybe<Int>)           // EAGAIN / EWOULDBLOCK
    | IoError(OSError);

public type affine LockHandle is { /* ... */ }; // RAII; must be consumed
```

### Core surface

```verum
public fn try_lock(fd: FileDesc, region: LockRegion, kind: LockKind)
    -> Result<LockHandle, LockError>;

public fn unlock(handle: LockHandle) -> Result<(), LockError>;

// Convenience for single-byte locks (SQLite PENDING_BYTE / RESERVED_BYTE)
public fn try_lock_byte_exclusive(fd: FileDesc, offset: Int)
    -> Result<LockHandle, LockError>;
public fn try_lock_byte_shared(fd: FileDesc, offset: Int)
    -> Result<LockHandle, LockError>;
```

The **affine** annotation on `LockHandle` is the safety surface: the
handle may be moved but not copied, and dropping without calling
`unlock` is a compile error. The lock cannot leak on the underlying
fd.

Advisory on POSIX, mandatory on Windows. NFS is not supported —
`try_lock` on an NFS fd surfaces as `IoError(OSError)` rather than
silently returning "success".

## Crash-safe persistence — `sys.durability`

Named re-exports of the durability primitives inside `sys.common`.
The dedicated module lets callers declare their intent at the import
site:

```verum
mount core.sys.durability.{full_fsync, sync_directory};
```

| Function | Behaviour |
|----------|-----------|
| `full_fsync(fd)` | Linux: `fsync(fd)`. macOS: `fcntl(fd, F_FULLFSYNC)`. Windows: `FlushFileBuffers(handle)`. Returns only after the data is on stable storage — not just in the OS page cache. |
| `sync_directory(path)` | Open directory read-only, `fsync` it, close. Required on POSIX after `rename`/`unlink`/`creat` for the name change to survive power loss. No-op on Windows (NTFS journals directory updates synchronously). |

Used by [`core.database`](/docs/stdlib/database) between WAL frame
flush and checkpoint; by [`core.io.atomic_write`](/docs/stdlib/io)
for the rename-after-write pattern; by file-backed caches anywhere.
The `F_FULLFSYNC` distinction matters on macOS — ordinary `fsync()`
on Darwin does **not** flush the disk's write cache.

---

## Permission gating (`#12` / P3.2)

Every raw-syscall intrinsic (`syscall0..=syscall6`,
`IntrinsicCategory.Syscall`) is registered with the
`IntrinsicHint.RequiresPermission` marker. Codegen consults
the marker to insert a
`__permission_check(scope, target) -> Result<(), PermissionDenied>`
gate before the intrinsic body so deny-listed contexts
(sandboxed scripts, capability-attenuated subroutines) get a
typed refusal instead of silent OS-resource access.

The marker is enforced at the intrinsic-registry level by two
pin checks:

- Every `Syscall`-category intrinsic carries the hint; new ones
  added without it fail loudly at registry-build time.
- `Time`, `Platform`, and `Logging` intrinsics that happen to carry
  `IoEffect` MUST NOT carry `RequiresPermission`. Gating those
  would force every `print()` and `monotonic_nanos()` through
  the permission router for no security benefit (no caller-
  controlled resource targets).

The codegen-side check insertion (with per-(scope, target)
caching for ≤2 ns warm overhead) is the follow-up phase.

## Platform-specific modules

### Linux (`@cfg(target_os = "linux")`)

```verum
mount sys.linux;

// Direct syscalls (gated — all 7 carry IntrinsicHint.RequiresPermission)
unsafe fn syscall_raw(num: Int, a0..a5: Int) -> Int
unsafe fn syscall6(num: Int, a0..a5: Int) -> Int

// Common wrappers
unsafe fn read(fd: Int, buf: *mut Byte, count: Int) -> Int
unsafe fn write(fd: Int, buf: *const Byte, count: Int) -> Int
unsafe fn close(fd: Int) -> Int
unsafe fn mmap(addr: *mut Byte, len: Int, prot: Int, flags: Int, fd: Int, offset: Int) -> *mut Byte
unsafe fn munmap(addr: *mut Byte, len: Int) -> Int
unsafe fn mprotect(addr: *mut Byte, len: Int, prot: Int) -> Int

// Processes
fn getpid() -> Int           fn gettid() -> Int
fn exit(code: Int) -> !      fn exit_group(code: Int) -> !

// Synchronisation
unsafe fn futex_wait(uaddr: *mut Int32, expected: Int32, timeout: *const Timespec) -> Int
unsafe fn futex_wake(uaddr: *mut Int32, n: Int) -> Int

// Time
fn clock_gettime(clk_id: Int) -> Timespec
type Timespec is { tv_sec: Int64, tv_nsec: Int64 };

// I/O drivers
type IoUringDriver is { ... };
type EpollDriver   is { ... };

// Sync primitives (futex-based)
type Thread  is { ... };
type Mutex   is { ... };
type Condvar is { ... };
type SpinLock is { ... };
```

### macOS (`@cfg(target_os = "macos")`)

```verum
mount sys.darwin;

// libSystem.B FFI
@extern("C") fn malloc(size: Int) -> *mut Byte
@extern("C") fn free(ptr: *mut Byte)
@extern("C") fn read(fd: Int, buf: *mut Byte, n: Int) -> Int

// Mach
type mach_port_t = UInt32;
fn mach_task_self() -> mach_port_t
fn mach_vm_allocate(task, addr, size, flags) -> KernReturn
fn mach_vm_deallocate(task, addr, size) -> KernReturn
```

### Windows (`@cfg(target_os = "windows")`)

```verum
mount sys.windows;

// kernel32
@extern("C") fn VirtualAlloc(lp: *mut Byte, size: Int, type: UInt32, protect: UInt32) -> *mut Byte
@extern("C") fn VirtualFree(lp: *mut Byte, size: Int, type: UInt32) -> Int32
@extern("C") fn ReadFile(h: Handle, buf: *mut Byte, count: UInt32, read: *mut UInt32, overlapped: *mut Overlapped) -> Int32
@extern("C") fn CreateFileW(...)

// ntdll
@extern("stdcall") fn NtCreateFile(...) -> NtStatus

// I/O driver
type IocpDriver is { ... };
```

---

## Alternative runtimes

### Embedded (`@cfg(runtime = "embedded")`)

```verum
mount sys.embedded;

// Stack allocator (no heap)
fn stack_alloc(size: Int, align: Int) -> Maybe<*mut Byte>
fn stack_reset()                                // reset to mark

// Async stubs (sync shim)
// async {...}.await   compiles to blocking execution
```

### `no_runtime` (`@cfg(runtime = "no_runtime")`)

```verum
mount sys.no_runtime;

// All heap operations return None / error
// Async compiled away
// Used for kernel startup, bootloaders
```

---

## Cross-references

- **[mem](/docs/stdlib/mem)** — `os_alloc` feeds the segment allocator.
- **[io](/docs/stdlib/io)** — file operations call through `sys.file_ops`.
- **[net](/docs/stdlib/net)** — TCP/UDP uses `sys.net_ops` and the IO engine.
- **[async](/docs/stdlib/async)** — executor uses the IO engine for readiness.
- **[intrinsics → runtime](/docs/stdlib/intrinsics)** — low-level time, TLS, syscall intrinsics.

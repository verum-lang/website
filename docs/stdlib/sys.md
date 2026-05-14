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
| Raw syscall bindings | `raw.vr` |
| Wrapped operations | `file_ops.vr`, `time_ops.vr`, `net_ops.vr`, `process_ops.vr`, `context_ops.vr` |
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
| `common.vr`        | **partial** | [core-tests/sys/common](https://github.com/verum-lang/verum/tree/main/core-tests/sys/common) — 50+ type-level tests green: PAGE_SIZE / page_align_* / OSError / FileDesc / IOVec / MemProt / MapFlags / SysContextError / FcntlLockKind / ACCESS_* / SEEK_SET / F_*LCK / MAX_CONTEXT_SLOTS / CONTEXT_STACK_DEPTH. Mount re-export defect (`mount core.sys.{PAGE_SIZE}` resolving to wrong sibling) closed by parent-prefix scan in `process_import_tree`. FileDesc.STDIN/INVALID const-method access deferred (typechecker __newtype_inner_X gap for archive-loaded transparent-wrapper records). FFI-adjacent surface (os_alloc / pread / pwrite / fsync / try_lock_region / file_size / access / random_bytes / init_process_args) deferred to per-platform integration. |
| `cabi.vr`          | **complete** | [core-tests/sys/cabi](https://github.com/verum-lang/verum/tree/main/core-tests/sys/cabi) — 22 unit + 9 property + 5 regression all green. Every alias (CInt / CUInt / CLong / CULong / CSize / CSSize / COff / CMode / CPid / CUid / CGid / CClockId / CSockLen / CFd) round-trips through tuple-newtype construction; CFD_STDIN / CFD_STDOUT / CFD_STDERR sentinel triple pinned. Transparent-wrapper newtype constructor registration fix in `archive_ctx_loader.rs` Pass 5 closed every CFD_* / direct-CFd-construction test. |
| `bitfield.vr`      | **regression-only** | [core-tests/sys/bitfield](https://github.com/verum-lang/verum/tree/main/core-tests/sys/bitfield) — 56 unit + 3 pinned regressions (gated by cross-module free-fn dispatch defect) |
| `mmio.vr`          | **partial** | [core-tests/sys/mmio](https://github.com/verum-lang/verum/tree/main/core-tests/sys/mmio) — 8/8 BarrierKind + compiler_barrier/dmb green. MemoryFlags const access + MemoryRegion methods consuming MemoryFlags const gated by typechecker `__newtype_inner_X` gap (same as FileDesc.STDIN). MmioRegister<T, MODE> generic + VerifiedRegister ghost-state deferred — require runtime MMIO fixture. |
| `interrupt.vr`     | undocumented | — |
| `time_ops.vr`      | undocumented | — |
| `file_ops.vr`      | undocumented | — |
| `net_ops.vr`       | undocumented | — |
| `process_ops.vr`   | undocumented | — |
| `process_native.vr`| undocumented | — |
| `context_ops.vr`   | undocumented | — |
| `signal.vr`        | **regression-only** | [core-tests/sys/signal](https://github.com/verum-lang/verum/tree/main/core-tests/sys/signal) — 14/52 green. Pre-existing stdlib defects in Signal: variant-tag drift on @cfg-aware match arms, `atomic_load`/`atomic_store` intrinsic registration missing for SignalFlag. Architectural — drift is in stdlib Signal implementation, not test infrastructure. |
| `fs_watch.vr`      | undocumented | — |
| `io_engine.vr`     | undocumented | — |
| `init.vr`          | undocumented | — |
| `durability.vr`    | undocumented | — |
| `locking/mod.vr`   | undocumented | — |
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

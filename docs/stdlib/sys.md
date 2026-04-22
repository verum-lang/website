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
| Hardware control | `bitfield.vr`, `mmio.vr`, `interrupt.vr` |
| Alternative runtimes | `embedded.vr`, `no_runtime.vr` |
| Linux (`@cfg(target_os="linux")`) | `syscall.vr`, `errno.vr`, `io.vr`, `mem.vr`, `thread.vr`, `time.vr`, `tls.vr` |
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

fn create_io_engine(config: IoEngineConfig) -> Result<Box<dyn IOEngine>, IoError>
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

## Bitfields and MMIO

### `Bitfield`

```verum
type BitfieldElement is protocol {
    fn extract(raw: UInt64, mask: UInt64, shift: Int) -> Self;
    fn insert(raw: UInt64, value: Self, mask: UInt64, shift: Int) -> UInt64;
}

type Bitfield<const W: Int> is { raw: UInt64, mask: UInt64 };

fn extract_bits<T: BitfieldElement>(raw: UInt64, mask: UInt64, shift: Int) -> T
fn insert_bits<T: BitfieldElement>(raw: UInt64, value: T, mask: UInt64, shift: Int) -> UInt64
```

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

## Platform-specific modules

### Linux (`@cfg(target_os = "linux")`)

```verum
mount sys.linux;

// Direct syscalls
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
- **[io](/docs/stdlib/io)** — file operations call through `sys::file_ops`.
- **[net](/docs/stdlib/net)** — TCP/UDP uses `sys::net_ops` and the IO engine.
- **[async](/docs/stdlib/async)** — executor uses the IO engine for readiness.
- **[intrinsics → runtime](/docs/stdlib/intrinsics)** — low-level time, TLS, syscall intrinsics.

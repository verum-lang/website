---
sidebar_position: 3
title: sys
---

# `core::sys` — V-LLSI kernel bootstrap

`sys` is the lowest-level module — the bridge between Verum and the
operating system kernel. Most user code never imports it; instead, it
uses higher-level wrappers in `io`, `net`, `async`, etc.

## V-LLSI — Verum Low-Level System Interface

Zero FFI to C libraries. Verum's syscall layer uses:

- **Linux**: direct `syscall` instruction via `syscall6` intrinsic.
- **macOS**: `libSystem.B.dylib` (Apple's stable ABI).
- **Windows**: `kernel32.dll` / `ntdll.dll`.
- **Embedded**: no allocator, no syscalls, stack-only.

## Common types

```verum
type FileDesc   is (Int);          // wraps int fd
type IOVec      is { base: *mut Byte, len: Int };
type OSError    is { code: Int, message: Text };

type PageSize   is Int;
type MemProt    is bitflags { Read, Write, Exec };
type MapFlags   is bitflags { Shared, Private, Anon, Fixed };
type MemoryOrdering is Relaxed | Acquire | Release | AcqRel | SeqCst;
```

## Page alignment

```verum
fn page_align_up(x: Int) -> Int;
fn page_align_down(x: Int) -> Int;
fn is_page_aligned(x: Int) -> Bool;
```

## OS memory

```verum
unsafe fn os_alloc(layout: Layout) -> *mut Byte;
unsafe fn os_free(ptr: *mut Byte, layout: Layout);
```

Direct mmap / VirtualAlloc. Used by `mem::cbgr_alloc` for its backing
store.

## I/O engine

```verum
type IOEngine;          // unified interface
// Linux:   io_uring
// macOS:   kqueue
// Windows: IOCP

let eng: IOEngine = create_io_engine(config)?;
eng.submit(CompletionOp.Read { fd, buf, offset });
for done in eng.poll(timeout) { ... }
```

Used by the async runtime for non-blocking I/O.

## Context system primitives

```verum
const MAX_CONTEXT_SLOTS:   Int = 32;
const CONTEXT_STACK_DEPTH: Int = 256;

fn ctx_get<T>(slot: Int) -> Maybe<&T>;
fn ctx_set<T>(slot: Int, value: T);
fn ctx_push_frame();
fn ctx_pop_frame();
```

The runtime implementation of `using [...]` / `provide`.

## Initialisation / shutdown

```verum
fn verum_init(cfg: InitConfig) -> Result<(), InitError>;
fn verum_shutdown();
fn is_initialized() -> Bool;

fn init_thread();
fn cleanup_thread();

type PanicInfo is { message: Text, location: SourceLocation };
fn set_panic_handler(h: fn(PanicInfo));
```

## Platform-specific

```verum
@cfg(target_os = "linux")
mount sys.linux;

@cfg(target_os = "macos")
mount sys.darwin;

@cfg(target_os = "windows")
mount sys.windows;

@cfg(runtime = "embedded")
mount sys.embedded;
```

## Hardware

```verum
type Bitfield<const W: Int>;    // bit-accurate field layout
type MMIO<const ADDR: Int>;     // memory-mapped I/O
type Interrupt;                 // interrupt handling
```

Used primarily by embedded and driver code.

## See also

- **[mem](/docs/stdlib/mem)** — allocator built on `sys::os_alloc`.
- **[async](/docs/stdlib/async)** — executor built on `sys::IOEngine`.
- **[Architecture → runtime tiers](/docs/architecture/runtime-tiers)** —
  how the runtime composes over `sys`.

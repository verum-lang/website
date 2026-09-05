---
title: Calling into a C library
description: 'extern "C" blocks, boundary contracts, type marshalling.'
---

# Calling into a C library

Verum speaks C. No bindgen, no auto-generated wrappers — you write
the boundary contract once, the compiler enforces it.

### The boundary

Given a C library `libfoo.so` exposing:

```c
int  foo_init(void);
int  foo_compute(const double *xs, int len, double *out);
void foo_shutdown(void);
```

A Verum wrapper:

`src/foo_bindings.vr`:

```verum
@ffi("libfoo.so")
extern "C" {
    fn foo_init() -> Int;
    fn foo_compute(xs: *const Float, len: Int, out: *mut Float) -> Int;
    fn foo_shutdown();
}

ffi FooC {
    @extern("libfoo.so")
    fn compute(xs: &[Float]) -> Result<Float, Error>;

    requires       xs.len() > 0;
    memory_effects = Reads(xs) + Allocates;
    thread_safe    = true;
    errors_via     = ReturnCode(result < 0);
    @ownership(borrow)

    @extern("libfoo.so")
    fn init() -> Result<(), Error>;
    @extern("libfoo.so")
    fn shutdown();
}
```

The `ffi FooC { ... }` block is the **typed** wrapper; the
`extern "C"` block is the raw binding. Each entry point names the
library it comes from with `@extern`, and the contract clauses that
follow a function belong to it: `requires` / `ensures`,
`memory_effects`, `thread_safe`, `errors_via` and `@ownership`
(`grammar/verum.ebnf`, *2.7 FFI Boundary Declarations*).

The clauses attach to the function above them, so a block that opens
with a clause and no function does not parse. Their values are checked:
`thread_safe = 42` is rejected as "expected 'true' or 'false'", and
`memory_effects = Zzz` as "expected memory effect". Combine effects with
`+`, not a comma.

### Simpler form for small libraries

```verum
@ffi("libfoo.so")
extern "C" {
    fn foo_init() -> Int;
    fn foo_shutdown();
    fn foo_compute(xs: *const Float, len: Int, out: *mut Float) -> Int;
}

pub fn foo_init_safe() -> Result<(), Error> {
    let rc = unsafe { foo_init() };
    if rc == 0 { Result.Ok(()) }
    else { Result.Err(Error.new(&f"foo_init failed: {rc}")) }
}

pub fn foo_compute_safe(xs: &[Float]) -> Result<Float, Error> {
    let mut out = 0.0;
    let rc = unsafe {
        foo_compute(
            xs.as_ptr() as *const Float,
            xs.len() as Int,
            &mut out as *mut Float,
        )
    };
    match rc {
        0 => Result.Ok(out),
        n => Result.Err(Error.new(&f"foo_compute: {n}")),
    }
}
```

### Type marshalling

| C type | Verum counterpart |
|---|---|
| `int`, `int32_t` | `Int32` |
| `long`, `int64_t` | `Int64` |
| `unsigned`, `uint32_t` | `UInt32` |
| `size_t` | `USize` |
| `float` | `Float32` |
| `double` | `Float` (or `Float64`) |
| `bool` / `_Bool` | `Bool` |
| `char *` (C string) | `*const Byte` + explicit length; convert to `Text` via `Text.from_utf8` |
| `const T *` (array) | `*const T` + separate length |
| `T *` (out-param) | `*mut T` |
| `void *` | `*const Byte` or opaque type |
| `struct Foo { ... }` | `@repr(C) type Foo is { ... };` |
| `enum Foo { A = 0, B = 1 }` | `@repr(C) @repr(i32) type Foo is | A = 0 | B = 1;` |

### Strings

C strings are null-terminated. To pass:

There is no `to_c_string` helper — the standard library builds the
buffer by hand, and `core/sys/fs_watch.vr` is the model:

```verum
fn nul_terminate(t: &Text) -> List<Byte> {
    let mut out = List.with_capacity(t.len() + 1);
    for b in t.clone().into_bytes().iter() { out.push(*b); }
    out.push(0);
    out
}

let c_string = nul_terminate(&"hello");
unsafe { c_fn(c_string.as_ptr()); }
```

To receive:

```verum
unsafe {
    let ptr = c_fn_returning_string();
    // You must know the length: C gives you a pointer, not a slice.
    // `strlen` if the library does not tell you, then decode.
    // core.intrinsics.memory.slice_from_raw_parts
    let bytes = slice_from_raw_parts(ptr as &Byte, len);
    let text  = Text.from_utf8(bytes)?;
    // ptr is borrowed; if C owns it, do not free.
}
```

### Structs — `@repr(C)`

```verum
@repr(C)
type CPoint is {
    x: Float64,
    y: Float64,
};

@ffi("libgeom.so")
extern "C" {
    fn distance(a: *const CPoint, b: *const CPoint) -> Float64;
}

let a = CPoint { x: 0.0, y: 0.0 };
let b = CPoint { x: 3.0, y: 4.0 };
let d = unsafe { distance(&a, &b) };     // 5.0
```

`@repr(C)` guarantees:
- Field order = declaration order.
- Padding matches C ABI.
- No tag bits for `Copy` types.

For transparent newtypes over primitives, `@repr(transparent)`.

### Callbacks

Passing a Verum function as a callback requires `extern "C"`:

```verum
@extern("C")
fn on_tick(ctx: *mut Void, ms: Int64) {
    let state = unsafe { &mut *(ctx as *mut TimerState) };
    state.ticks += 1;
}

@ffi("libtimer.so")
extern "C" {
    fn register_callback(ctx: *mut Void, cb: extern "C" fn(*mut Void, Int64));
}

let mut state = TimerState { ticks: 0 };
unsafe { register_callback(&mut state as *mut TimerState as *mut Void, on_tick); }
```

### Linking

`verum.toml`:

```toml
[ffi.foo]
kind = "dynamic"             # dynamic | static | system
path = "libs/libfoo.so"      # relative to project
cflags = ["-DVERSION=3"]
```

Or `[ffi.foo] kind = "system"` for libraries installed system-wide.

### Opaque handles

C APIs that hand out opaque pointers:

```verum
@repr(transparent)
type FooHandle is (*mut Void);

@ffi("libfoo.so")
extern "C" {
    fn foo_new() -> FooHandle;
    fn foo_free(h: FooHandle);
    fn foo_use(h: FooHandle, x: Int) -> Int;
}

pub type Foo is { h: FooHandle };

implement Foo {
    pub fn new() -> Foo { Foo { h: unsafe { foo_new() } } }
    pub fn use_(&self, x: Int) -> Int { unsafe { foo_use(self.h, x) } }
}

implement Drop for Foo {
    fn drop(&mut self) { unsafe { foo_free(self.h); } }
}
```

### Pitfalls

- **Don't panic across the FFI boundary.** Wrap `extern "C" fn`
  bodies in `try { ... } recover { _ => sentinel_error_code }`.
- **Don't store references inside C code**. C doesn't know about CBGR;
  any Verum reference you pass becomes effectively `&unsafe T` on
  the C side.
- **Null pointers**: always check. Use `ptr.is_null()` before dereferencing.
- **Sizes**: `Int` in Verum defaults to 64-bit; C `int` is 32-bit.
  Use `Int32` explicitly in signatures.
- **Alignment and packing**: `@repr(packed)` if the C struct is
  packed; otherwise assume standard alignment.

### See also

- **[Language → FFI](/docs/language/ffi)** — full boundary-contract
  grammar.
- **[intrinsics → memory](/docs/stdlib/intrinsics#memory)** — raw
  pointer operations.
- **[sys](/docs/stdlib/sys)** — the V-LLSI syscall layer (a larger
  FFI example).

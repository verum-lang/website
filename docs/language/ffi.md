---
sidebar_position: 19
title: FFI
---

# Foreign Function Interface

Verum speaks C. Every FFI boundary uses the C ABI — not C++, not
Rust's `extern "Rust"`, not a higher-level binding that hides
marshalling. This is **semantic honesty** applied to interop: the
boundary is a system-level contract, and Verum refuses to pretend
otherwise.

## `extern "C"` blocks

```verum
extern "C" {
    fn malloc(size: Int) -> *unsafe mut Byte;
    fn free(ptr: *unsafe mut Byte);
    fn printf(fmt: *const Byte, ...) -> Int;
}
```

Declares C functions available to Verum. These declarations do not
generate code — they describe the foreign symbol's signature.

## Calling convention

```verum
@extern("C", calling_convention = "stdcall")
fn win_api_call(x: Int) -> Int;
```

Calling conventions: `C`, `stdcall`, `fastcall`, `aapcs`, `swiftcall`,
and `naked` (for assembly interop).

## Exposing Verum to C

```verum
@extern("C")
pub fn verum_add(a: Int, b: Int) -> Int {
    a + b
}
```

An `@extern("C") pub fn` is emitted with C linkage. Its name must be
a valid C identifier.

## Boundary contracts

Every FFI boundary must declare a boundary contract — not just types,
but guarantees:

```verum
ffi MyLib {
    @extern("C")
    fn my_lib_process(
        input: *const Byte,
        len:   Int,
        out:   *mut Byte,
    ) -> Int;

    requires      len >= 0 && len <= 1024;
    requires      out != null;
    ensures       result >= 0 => bytes_written_up_to(out, result);
    memory_effects = Reads(input), Writes(out);
    thread_safe   = true;
    errors_via    = ReturnCode(result < 0);
    @ownership(transfer_to = "caller", borrow = [input])
}
```

The contract components:

- **`requires`** — preconditions the caller must guarantee.
- **`ensures`** — postconditions the library promises.
- **`memory_effects`** — what the call reads, writes, allocates.
  Options: `Pure`, `Reads(path)`, `Writes(path)`, `Allocates`.
- **`thread_safe`** — whether the call is safe to invoke concurrently.
- **`errors_via`** — how errors are reported:
  - `None` — infallible.
  - `Errno` — thread-local `errno`.
  - `ReturnCode(pattern)` — sentinel return value.
  - `Exception` — C++ exception (for `extern "C++"`).
- **`@ownership(...)`** — who owns allocations, what is borrowed, what
  is transferred.

These contracts become SMT obligations at every call site.

## Raw pointers

```verum
*const T            // immutable raw pointer
*mut T              // mutable raw pointer
*volatile T         // volatile read
*volatile mut T     // volatile write
```

- Dereferencing is `unsafe`.
- `null` is a legal value; `ptr.is_null()` checks.
- No CBGR protection — these are pure addresses.

## Layout

Types that cross the FFI boundary must have a stable layout. Use
`@repr(C)`:

```verum
@repr(C)
type CStruct is {
    id:      Int32,
    name:    *const Byte,   // null-terminated UTF-8
    padding: [UInt8; 4],
};
```

`@repr(transparent)` for newtype wrappers:

```verum
@repr(transparent)
type Handle is (*unsafe mut Byte);
```

## String interop

C strings are `*const Byte` (null-terminated). Convert:

```verum
let c: *const Byte = ...;
let text: Text     = unsafe { Text::from_c_str(c) };
```

UTF-8 validation happens during conversion. Raw non-null-terminated
byte sequences use `&unsafe [Byte]`.

## Callbacks

Passing Verum functions to C requires they be plain (no closures, no
contexts, no panics that cross the boundary):

```verum
@extern("C")
fn my_callback(ctx: *mut Void, data: *const Byte) -> Int {
    // plain code, no `using`, no `async`, no `Heap` allocations that
    // escape.
}

// Elsewhere:
unsafe {
    c_lib::register(my_callback as *const Void);
}
```

Panics that cross the FFI boundary are **undefined behaviour**. Wrap
the body in `try { ... } recover { _ => 1 /* error sentinel */ }` if
you need to suppress them.

## Build-system integration

`Verum.toml`:

```toml
[dependencies]
openssl = { ffi = "system", libraries = ["ssl", "crypto"] }

[build]
link-search = ["/usr/local/lib"]
c-flags = ["-DOPENSSL_VERSION=3"]
```

Or use a build script for complex setups. See **[Build system](/docs/tooling/build-system)**.

## What Verum does not do

- **No bindgen**: Verum does not auto-generate FFI bindings from C
  headers. Binding a C library is a deliberate act of contract authoring.
- **No `extern "C++"`**: C++ with its ABI zoo is out of scope. Wrap
  C++ in a C shim.
- **No auto-marshalling**: `Text` does not silently become `char*`.
  You write the conversion.

## Worked example — a minimal `libsodium` binding

```verum
ffi Sodium {
    @extern("C")
    fn sodium_init() -> Int;

    @extern("C")
    fn randombytes_buf(buf: *mut Byte, size: Int);

    @extern("C")
    fn crypto_secretbox_easy(
        ciphertext: *mut Byte,
        message:    *const Byte,
        message_len: Int,
        nonce:      *const Byte,
        key:        *const Byte,
    ) -> Int;

    requires      message_len >= 0;
    memory_effects = Reads(message, nonce, key), Writes(ciphertext);
    thread_safe   = true;
    errors_via    = ReturnCode(result != 0);
    @ownership(borrow = [message, nonce, key, ciphertext])
}

const KEY_BYTES:    Int = 32;
const NONCE_BYTES:  Int = 24;
const MAC_BYTES:    Int = 16;

pub fn seal(message: &[Byte], key: &[Byte; 32]) -> List<Byte> {
    assert(Sodium::sodium_init() >= 0);

    let mut nonce = [0u8; NONCE_BYTES];
    unsafe {
        Sodium::randombytes_buf(nonce.as_mut_ptr(), NONCE_BYTES);
    }

    let mut out = List::with_capacity(message.len() + MAC_BYTES);
    out.resize(message.len() + MAC_BYTES, 0);
    let rc = unsafe {
        Sodium::crypto_secretbox_easy(
            out.as_mut_ptr(), message.as_ptr(), message.len(),
            nonce.as_ptr(), key.as_ptr(),
        )
    };
    assert(rc == 0);

    let mut framed = List::from(nonce);
    framed.extend(out);
    framed
}
```

Every unsafe block is narrowly scoped, the boundary contract pins down
what the library reads and writes, and SMT discharges the `requires`
at each call site. See **[Cookbook → FFI](/docs/cookbook/ffi)** for a
full walkthrough including error translation.

## See also

- **[Cookbook → FFI](/docs/cookbook/ffi)** — end-to-end walkthrough
  with `build.vr` and header generation.
- **[Language → attributes](/docs/language/attributes)** — `@extern`,
  `@repr`.
- **[Stdlib → sys](/docs/stdlib/sys)** — the V-LLSI kernel bootstrap
  layer, which uses the same FFI machinery.
- **[Architecture → codegen](/docs/architecture/codegen)** — how the
  LLVM backend emits FFI trampolines.

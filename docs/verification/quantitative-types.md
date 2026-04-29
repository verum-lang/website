---
sidebar_position: 22
title: Quantitative Types (Atkey QTT)
---

# Quantitative Types — Atkey QTT in Verum

> Every binder in Verum can declare a **quantity** `q ∈ {0, 1, ω}`
> controlling how many times its body may use the bound variable.
> The three levels — *erased* (0), *linear* (1), *unrestricted* (ω) —
> give one type system that subsumes phantom indices, capability
> tracking, file-handle linearity, and zero-cost ghost state.

This page is normative for the verification spec It is the comprehensive
developer reference: every legal surface form, every reject path,
every interaction with the rest of the type system, every tradeoff
the implementation makes.

---

## 1. The three quantities

Atkey 2018 / McBride 2016 Quantitative Type Theory partitions
binders into three **resource classes**:

| Quantity | Surface | Use count | Runtime presence | Use case |
|---|:-:|:-:|:-:|---|
| `Zero` | `@quantity(0)` | exactly 0 | erased | phantom indices, ghost state, spec-only parameters |
| `One` | `@quantity(1)` | exactly 1 | runtime-present | file handles, mutexes, capabilities, transactions |
| `Many` | `@quantity(omega)` | any (≥0) | runtime-present | standard functional-programming default |

Verum's kernel default is `Many` — without an explicit quantity
annotation a binder is unrestricted, so all existing code keeps
working. Quantity is *opt-in*; users who don't need linearity pay
zero ergonomic tax.

---

## 2. Surface forms

### 2.1 `@quantity(...)` typed attribute

The canonical form is the `@quantity(...)` attribute, attached
before a parameter:

```verum
public fn consume_handle(@quantity(1) handle: FileHandle) -> Result<Bytes>;
public fn fixed_width(@quantity(0) width: Int, value: Int) -> Vec<Int>;
public fn read_freely(@quantity(omega) x: Int) -> Int;
```

Three surface shapes accepted by the `@quantity` attribute parser:

| Form | Example | Lowering |
|---|---|---|
| Integer literal | `@quantity(0)` / `@quantity(1)` | `Quantity.Zero` / `Quantity.One` |
| Path identifier | `@quantity(omega)`, `@quantity(linear)`, `@quantity(erased)` | parsed via `Quantity.parse` |
| String literal | `@quantity("omega")` | parsed via `Quantity.parse` |

Aliases recognised by `Quantity.parse`:

| Spelling | Resolves to |
|---|---|
| `0`, `Zero`, `zero`, `erased` | `Quantity.Zero` |
| `1`, `One`, `one`, `linear` | `Quantity.One` |
| `omega`, `ω`, `Many`, `many`, `unrestricted` | `Quantity.Many` |

Unknown spellings (`@quantity(2)`, `@quantity(affine)`,
`@quantity(infinity)`) are **rejected** at parse time — silent
acceptance of a typo would be a soundness hole.

### 2.2 Reject paths

| Input | Outcome |
|---|---|
| `@quantity(2)` | rejected — `2` not in `{0, 1, omega}` |
| `@quantity(affine)` | rejected — `affine` is a *type-level* modifier (see §6) but not a binder quantity in Atkey QTT |
| `@quantity` (no args) | rejected — missing required argument |
| `@quantity(0, 1)` | rejected — exactly one argument required |
| `@inline(0)` | inert — `from_attribute` returns `None` because the attribute name is not `quantity` |

Every rejection path above is covered by parser-test fixtures in the
compiler's attribute-handling test suite, so adding a new alias
(or accepting a new shape) requires both a code change and a
companion test.

---

## 3. Worked examples

### 3.1 File-handle linearity (q=1)

```verum
@quantity(1)
public fn consume_file(@quantity(1) f: FileHandle) -> Bytes {
    let bytes = read_all(f);   // f used exactly once — VALID
    bytes
}

// REJECTED by V2 enforcement:
public fn double_use(@quantity(1) f: FileHandle) -> (Bytes, Bytes) {
    let a = read_all(f.clone());
    let b = read_all(f);          // E_LINEAR_DOUBLE_USE — f used twice
    (a, b)
}

// REJECTED by V2 enforcement:
public fn never_use(@quantity(1) f: FileHandle) -> Int {
    42                            // E_LINEAR_NEVER_USED — f never referenced
}
```

### 3.2 Phantom width (q=0)

```verum
public fn fixed_width<@quantity(0) Width: Int>(buf: [Byte; Width]) -> Hash {
    // Width is a compile-time index — used in the type, never at runtime.
    // Erased entirely from the generated code.
    sha256_of(buf)
}

// REJECTED by V2 enforcement:
public fn leak_width<@quantity(0) Width: Int>(buf: [Byte; Width]) -> Int {
    Width                          // E_ERASED_AT_RUNTIME — Width has q=0
                                   // and cannot appear in a value-level
                                   // (computational) position.
}
```

### 3.3 Default (q=ω)

```verum
// Unrestricted — equivalent to no annotation at all.
public fn add_self(@quantity(omega) x: Int) -> Int { x + x }

// Default (no annotation) is also q=ω. Existing functions stay legal:
public fn id<T>(x: T) -> T { x }    // x has implicit q=ω
```

### 3.4 Mixed quantities

```verum
public fn protocol_step(
    @quantity(0) state_invariant: Int,        // erased
    @quantity(1) capability:      Capability, // linear
    @quantity(omega) message:     Message,    // unrestricted
) -> NewState {
    consume(capability);                       // linear: used once
    log(message);                              // ω: any count
    log(message);                              // (still legal)
    next(message)                              // (and again)
}
```

---

## 4. Today's enforcement

Today the discipline is **advisory at the binder level and
enforced at the surface level**:

- The full grammar from §3 — bare `@0` / `@1` / `@ω`, the
  `@quantity(...)` long form, and every legal-vs-illegal placement —
  is parsed by the front-end, validated, and surfaced through
  diagnostics on illegal forms.
- The annotation is preserved through to the IR, so quantitative
  information is available to downstream consumers (kernel, codegen)
  even when the body-level linearity walk does not yet run.
- `verum check src/` accepts every legal `@quantity(...)` annotation
  on parameter positions and rejects illegal placements.

The body-level *use-count* diagnostics (`E_LINEAR_DOUBLE_USE`,
`E_LINEAR_NEVER_USED`, `E_ERASED_AT_RUNTIME`) are computed by a
linearity-tracking pass that walks the function body after type
checking. The walk follows McBride 2016 §3 — counting syntactic
occurrences of each bound variable, summing along structural rules,
and demanding that pattern matches consume the linear binder
*exactly once along every path*. The pass is staged behind the
surface discipline so that programs annotated with `@quantity(...)`
remain valid through the rollout.

---

## 5. Interaction with other type-system features

### 5.1 Refinement subtypes

Quantity composes with refinement subtypes orthogonally — the
quantity tracks *use count* while the refinement tracks *value
predicate*. Both can decorate the same binder:

```verum
public fn read_bounded(@quantity(1) buf: Vec<Byte>{len(it) <= 4096}) -> Bytes;
```

The kernel's K-Refine rule (§7.3) and the linearity-tracking pass
(§4.2 above) operate on the same AST node without interaction.

### 5.2 Refinement of the linear capability

A `q=1` capability with a refinement narrows the use site even
further:

```verum
public fn debit_account(
    @quantity(1) tx: Transaction{state == Open},
    amount: Int,
) -> Transaction{state == Closed};
```

The linear discipline ensures the transaction is consumed *exactly
once* (no double-spend); the refinement ensures the state is `Open`
on entry and `Closed` on exit. Verum's combination delivers what
F\* / Liquid Haskell each do separately.

### 5.3 CBGR memory safety

Quantitative types complement CBGR (§15.1) at a different layer:
CBGR enforces *temporal* memory safety (no use-after-free); quantity
enforces *resource* discipline (use exactly once). A function can
take both a CBGR reference and a linear value:

```verum
public fn write_through(
    @quantity(1) handle: FileHandle,
    &checked buf: [u8],
) -> Result<()>;
```

### 5.4 Effect / context system

Quantity is **independent** of the `using [...]` context system.
A linear binder can come from a context-bound function call:

```verum
public fn dispense(@quantity(1) cap: SerialCap) -> Bytes
    using [Logger]
{
    log("dispensing");
    consume(cap)
}
```

The runtime context graph is entirely separate from the binder-
linearity graph.

---

## 6. Difference from `affine` / `linear` type-level modifiers

Verum has *two* linearity-related surfaces, easy to confuse:

| Surface | Layer | Granularity | What it tracks |
|---|---|---|---|
| `affine type Foo { ... }` (or `linear`) | type declaration | per-type | the values of type Foo are at-most-once / exactly-once consumable |
| `fn f(@quantity(1) x: T)` | per-binder | per-parameter | this specific binding of `x` is exactly-once |

The type-level modifier (`affine type Foo` or `linear type Foo`)
constrains the *type's destruction contract* — every value of an
affine type carries the same "at most once" rule across its
lifetime.

The binder-level quantity (`@quantity(N)` per this page) constrains
*this specific use site* — different parameters of the same
function can have different quantities even if their types are
identical.

The two surfaces are **orthogonal** — a function can take an affine-
typed argument with `q=ω` (the function uses the value freely; the
*caller* still has to satisfy the at-most-once-globally rule) or a
non-affine type with `q=1` (this specific occurrence in this
function is linear; other call sites of values of that type are not
constrained).

---

## 7. CLI workflow

```bash
verum check src/                     # parses + validates every @quantity(...)
verum verify --strategy formal src/  # body-level linearity diagnostics
verum audit --epsilon                # @enact (Actic) is independent of quantity
```

`verum audit --kernel-rules` enumerates the kernel rules currently in
force; the linearity rule (`K-Quant`) joins that list once the body-
level pass enables it for a module.

---

## 8. Reading list

- Atkey, R. 2018. *Syntax and Semantics of Quantitative Type Theory.*
  LICS 2018. — the QTT calculus Verum's surface follows.
- McBride, C. 2016. *I Got Plenty o' Nuttin'.* — the operational
  treatment of `q ∈ {0, 1, ω}` plus pattern-binding rules used by
  V2 enforcement.
- Atkey & Krishnaswami 2015. *Combining Linearity and Dependency.*
  — interaction with dependent types.
- Mai, Y. 2017. *On Strict Linearity.* — the linearity discipline
  (q=1 strictly, no relaxation to affine) Verum adopts by default.

---

## 9. Further Verum reading

- [Trusted kernel](trusted-kernel.md) — the kernel-level invariant
  layer that V2 quantity-checking will integrate with.
- [Refinement reflection](refinement-reflection.md) — refinement
  subtypes pair orthogonally with quantity.
- [CBGR](../language/cbgr.md) — runtime memory safety; complements
  quantity at a different layer.
- the verification spec
  — the normative source for this page.

---
sidebar_position: 14
title: Program extraction
description: Curry-Howard lifting of constructive proofs into runnable code (Verum / OCaml / Lean / Coq), with native-binding wrappers via realize=.
---

# Program extraction

`verum extract` walks every `@extract` / `@extract_witness` /
`@extract_contract` marker in your project and emits the
**computational content** of each marked declaration as runnable
target-language code. It is the operational complement of `verum
export` (which emits *proof certificates* for re-checking by an
external prover); together the two cover the full Verum-to-elsewhere
surface.

## 1. Theoretical underpinning — the Curry-Howard correspondence

Type theory's foundational identification of *proofs* with
*programs* is what makes extraction make sense:

```text
                  Logic side                   Computational side
      ----------------------------       ------------------------------
      Proposition         A              Type                      A
      Proof of A          a : A          Term of type A            a : A
      Implication         A → B          Function type             A → B
      Conjunction         A ∧ B          Product type              A × B
      Disjunction         A ∨ B          Sum type                  A + B
      Universal quant.    ∀ x:A. P(x)    Dependent function   Π x:A. P(x)
      Existential quant.  ∃ x:A. P(x)    Dependent pair       Σ x:A. P(x)
      Negation            ¬A             Function to ⊥          A → Empty
      Equality (HoTT)     a = b          Path type             Path<A>(a,b)
      Refinement          {x:A | P(x)}   Sigma over Bool       Σ x:A. P(x)
```

A proof of `∀x. ∃y. P(x, y)` is therefore a function that, given any
`x`, produces both a `y` and evidence that `P(x, y)` holds. The
*computational content* is the function `λ x → y` itself; everything
else is the verifier's evidence.

`verum extract` discards the evidence (`@extract` / `@extract_witness`)
or preserves it as a runtime contract (`@extract_contract`), then
emits the function in the target you choose.

### Why this matters in practice

- Code that ships to production was *already proved correct* in
  Verum's verifier. Extraction is not a separate proof step —
  it's the projection of the verified term onto a runnable
  surface.
- The extracted code does not depend on Verum at runtime; you
  can ship it to any environment that compiles OCaml / Lean / Coq
  or that runs Verum directly.
- Bug surface shrinks to *the lowerer*, the *target compiler*,
  and the *runtime* — none of which are in the proof TCB.

## 2. The three extraction modes

| Marker | What gets emitted | Typical use |
|--------|-------------------|-------------|
| `@extract` | full function body or proof term | concrete algorithms with verified pre/postconditions |
| `@extract_witness` | only the existential witness | constructive existence proofs (decision procedures) |
| `@extract_contract` | function body + runtime contract from refinement | code crossing FFI / less-typed boundaries |

Each marker accepts:

- An optional positional **target**: `verum` (default), `ocaml`,
  `lean`, or `coq`.
- An optional **`realize="<fn_name>"`** keyword that delegates to a
  hand-written native function instead of synthesising the body.

A single declaration can carry multiple `@extract` markers; each
emits a separate file in its target's directory.

### 2.1 `@extract` — full body extraction

Use when the function or theorem has a meaningful
computational content you want as runnable code:

```verum
@extract
public fn factorial(n: Int { :: n >= 0 }) -> Int { :: result >= 1 } {
    if n == 0 { 1 } else { n * factorial(n - 1) }
}
```

After `verum extract` the `extracted/factorial.vr` re-validates
through `verum check`; switch the target to `lean` and you get a
Lean 4 file that re-checks under `lake`.

### 2.2 `@extract_witness` — witness-only extraction

Use when the *existence* of a value is the proof, and only the
value itself is needed downstream. The proof obligations are
discharged at the Verum verification ladder, not re-emitted in
the target file.

```verum
@extract_witness(coq)
public theorem isqrt(n: Int { :: n >= 0 }) -> Int
    where (Int { result :: result * result <= n &&
                            (result + 1) * (result + 1) > n })
{
    proof by induction(n) ...
}
```

The Coq output is a single `Definition` returning the integer
square root; the `where`-clause obligations stay in the Verum
proof corpus.

### 2.3 `@extract_contract` — contract-preserving extraction

Use when the refinement is load-bearing at runtime — typically at
an FFI boundary or in a setting where the consumer can't run the
verifier:

```verum
@extract_contract(ocaml)
public fn safe_divide(
    a: Int,
    b: Int { :: b != 0 }
) -> Int { a / b }
```

The OCaml output guards the body with an assertion that fires on
contract violation. In an `@extract` (no `_contract`) emission the
refinement would be erased; the `_contract` form keeps the safety
net.

## 3. Targets and per-target conventions

| Target | Extension | Comment | Block syntax | Module shape |
|--------|-----------|---------|--------------|--------------|
| `verum` | `.vr` | `//` | `{ … }` | re-check with `verum check` |
| `ocaml` | `.ml` | `(* … *)` | `let x () = …` | `dune build` / OCaml 5.x |
| `lean` | `.lean` | `--` / `/-- … -/` | `def x : Unit := …` | `lake build` / Lean 4 |
| `coq` | `.v` | `(* … *)` | `Definition x := … .` | `coqc` / Coq 8.x |

Output paths default to `<project>/extracted/<decl-name>.<ext>`;
override with `--output <dir>`.

### 3.1 Coverage matrix

The OCaml / Lean / Coq lowerers are *partial-coverage by design* —
they translate the pure-functional core idiomatically and bail to
a metadata-comment scaffold for shapes outside their vocabulary.
The `verum` target is structural (signature + body verbatim) and
covers everything `verum check` accepts.

| Construct | Verum | OCaml | Lean 4 | Coq |
|-----------|:-----:|:-----:|:------:|:---:|
| Literals (Int, Bool, Char, Text, Float) | ✓ | ✓ | ✓ | ✓ |
| Variables / paths | ✓ | ✓ (mangled) | ✓ | ✓ |
| Binary ops (+ − * / %) | ✓ | ✓ | ✓ | ✓ (mod) |
| Comparison (== != < ≤ > ≥) | ✓ | ✓ | ✓ | ✓ (`=?`,`<?`) |
| Bitwise (&, \|, ^, <<, >>) | ✓ | `land` / `lor` / etc. | `&&&` / `\|\|\|` | ✗ (prefix-only) |
| Logical && / \|\| | ✓ | ✓ | ✓ | `andb` / `orb` |
| Concatenation `++` | ✓ | `@` | `++` | `++` |
| Unary `-` / `!` | ✓ | ✓ | ✓ | `negb` |
| `let x = e in body` | ✓ | ✓ | `let x := e; body` | `let x := e in body` |
| `if-then-else` | ✓ | ✓ | ✓ | ✓ |
| Function calls | ✓ | ✓ | ✓ | ✓ |
| Method calls `recv.m(args)` | ✓ | `(m recv args)` | `(recv.m args)` | `(m recv args)` |
| Field access `recv.field` | ✓ | `recv.field` | `recv.field` | `(field recv)` |
| Pipeline `\|>` | ✓ | ✓ (native) | ✓ (native) | `(f x)` (rewrite) |
| Tuples `(a, b)` | ✓ | ✓ | ✓ | ✓ |
| TupleIndex `t.0` / `t.1` | ✓ | `fst`/`snd` | `t.fst`/`t.snd` | `fst`/`snd` |
| Index `arr[i]` | ✓ | `Array.get` | `arr[i]!` | ✗ (default needed) |
| NullCoalesce `a ?? b` | ✓ | match-on-Option | match-on-`some` | match-on-`Some` |
| Match expressions | ✓ | ✓ | ✓ | ✓ |
| Closures `\|x, y\| e` | ✓ | `fun x y -> e` | `fun x y => e` | `fun x y => e` |
| Match arm guards | ✓ | ✗ | ✗ | ✗ |
| Closures with `async` / `move` / context | ✓ | ✗ | ✗ | ✗ |
| Generic methods with `<T>` | ✓ | ✗ | ✗ | ✗ |
| `for` / `while` / `loop` | ✓ | ✗ | ✗ | ✗ |
| Mutation, async, await | ✓ | ✗ | ✗ | ✗ |
| Record patterns / slice / range | ✓ | ✗ | ✗ | ✗ |

When a sub-shape is unsupported the lowerer returns `None` and
the emitter falls back to a metadata comment containing the
original Verum source for hand-translation:

```ocaml
(* @extracted body (Verum source — lowering pending):
public fn run(state: &mut State) {
    state.tick();
    if state.done() { return; }
    run(state)
}
*)
let run () = (* body pending *) ()
```

This keeps the file structurally well-formed (compiles as a stub)
without silently emitting wrong code.

### 3.2 Identifier mangling

OCaml has stricter identifier rules than Verum:

- Verum identifiers are alphanumeric + underscore — already valid
  in OCaml.
- Verum names beginning with a digit are prefixed with `_`
  (e.g. `1foo` → `_1foo`).
- Non-alphanumeric characters in user-defined names map to `_`
  (e.g. `plus.comm` → `plus_comm`).
- Leading-uppercase names are preserved (OCaml accepts them as
  variant constructors).

Lean and Coq don't require mangling for the identifiers Verum's
lexer admits.

### 3.3 String escaping

Each target's quote and escape conventions are honoured:

| Target | `"` | `\` | newline | non-ASCII |
|--------|-----|-----|---------|-----------|
| OCaml  | `\"` | `\\` | `\n` | passthrough (UTF-8) |
| Lean   | `\"` | `\\` | `\n` | passthrough (UTF-8) |
| Coq    | `""` | passthrough | passthrough | passthrough |

## 4. The `realize="<fn_name>"` directive

`realize=` short-circuits the body-synthesis path: instead of
lowering the proof term, the emitter generates a thin wrapper that
delegates to the named native function. The verified surface
signature is preserved; the body becomes a single delegation call.

This is the canonical pattern for binding a verified specification
to a runtime intrinsic, foreign syscall wrapper, or hand-written
SIMD/assembly primitive — without losing the proof-checked types
at the boundary.

### 4.1 When to use it

- The proof captures the *contract* of a primitive that already
  exists in another runtime (libc, OpenSSL, a hardware intrinsic).
- The Verum body is a placeholder or pseudocode that is not the
  intended runtime path.
- You want the verifier to enforce a refinement at the call site
  but the actual computation must hit a hand-tuned implementation.

### 4.2 Per-target wrapper shapes

| Target | Wrapper |
|--------|---------|
| Verum  | `@extracted public fn name(...) { native_fn() }` |
| OCaml  | `let name () = native_fn ()` |
| Lean   | `def name : Unit := native_fn ()` |
| Coq    | `Definition name := native_fn tt.` |

### 4.3 Worked example — X25519 binding

```verum
// `core/security/ecc/x25519.vr` ships a verified surface for
// X25519 scalar multiplication. The actual point arithmetic
// is provided by the runtime intrinsic `verum.x25519.scalar_mult`,
// which the runtime selects per target (fiat-crypto by default,
// hardware-AES variants on supported CPUs).

@extract(realize = "verum_runtime_x25519_scalar_mult")
public fn x25519_scalar_mult(
    scalar: [Byte; 32],
    u:      [Byte; 32]
) -> [Byte; 32] {
    // Body is a placeholder — the realize binding takes over
    // at extract time. The verifier still type-checks the
    // surface, so callers get the proof-checked signature
    // without paying for the in-Verum reference port.
    ...
}
```

After `verum extract` the OCaml output is:

```ocaml
(* Extracted by `verum extract` (no body — signature-only scaffold) *)
(* Source declaration: x25519_scalar_mult :: src/main.vr            *)
(* Extraction kind:    @extract(verum)                              *)
(* Realize binding: delegates to native `verum_runtime_x25519_scalar_mult`. *)
(* @extracted (realize) *)
let x25519_scalar_mult () = verum_runtime_x25519_scalar_mult ()
```

You can combine an explicit target with `realize=`:

```verum
@extract(coq, realize = "ext_decode")
public fn decode(input: List<Byte>) -> Result<Frame, Error> { ... }
```

### 4.4 Multiple targets, one binding

Stack `@extract` markers to fan a single realize binding across
target families:

```verum
@extract(ocaml, realize = "verum_runtime_blake3")
@extract(lean,  realize = "Verum.Runtime.blake3")
@extract(coq,   realize = "blake3_extern")
public fn blake3(input: List<Byte>) -> [Byte; 32] { ... }
```

## 5. CLI workflow

```text
verum extract [<file.vr>] [--output <dir>]
```

| Argument | Meaning |
|----------|---------|
| (no args) | walk every `.vr` under the manifest dir |
| `<file.vr>` | scan only the named file |
| `--output <dir>` | write into `<dir>/` (default `extracted/`) |

Exit codes:

- `0` — ran to completion (even if no markers were found; you'll
  get an `info: no @extract markers found` message in that case).
- non-zero — IO error, parse error, or a hard CLI argument error.

The CLI is incremental-friendly: re-running on an unchanged source
re-emits byte-identical output (deterministic ordering for both
the file walk and the emitted scaffold). Wire it into your build
graph as a normal `make`-style dependency.

## 6. Audit trail and trusted boundary

Every emitted file carries a header that names:

1. The extraction kind (`@extract` / `@extract_witness` /
   `@extract_contract`).
2. The target.
3. The source `.vr` file the declaration came from.
4. Whether a `realize=` binding is in effect, and the bound
   native function's name.
5. Whether body lowering succeeded or fell back to the
   metadata-comment scaffold.

These five lines are stable, machine-readable, and meant to be
grep-able by downstream auditors:

```text
$ grep -r "Realize binding:" extracted/
extracted/x25519_scalar_mult.ml: (* Realize binding: delegates to native `verum_runtime_x25519_scalar_mult`. *)
extracted/blake3.lean:           -- Realize binding: delegates to native `Verum.Runtime.blake3`.
```

Realize bindings are part of the trusted boundary — the verifier
proved the *surface*, not the native implementation. Track them
explicitly in your supply-chain audit.

## 7. Comparison — extract vs. export

| Axis | `verum extract` | `verum export` |
|------|-----------------|----------------|
| Output | runnable code | proof certificates |
| Default target | Verum (re-checkable) | none (must pass `--to`) |
| Targets | verum / ocaml / lean / coq | dedukti / coq / lean / agda / metamath / owl2-fs |
| Per-decl driver | `@extract*` typed attrs | walks all axiom / theorem / lemma / corollary |
| Output dir | `extracted/` | `certificates/<format>/` |
| Re-checks in target | yes (Verum), partially (others) | yes — re-check is the point |
| `realize=` support | yes | no |

Use `extract` when you want **runnable code**, use `export` when
you want **a re-checkable proof artefact**.

## 8. Common patterns and recipes

### 8.1 Multi-prover proof-corpus deployment

Ship the same verified definition into a multi-prover proof
corpus by stacking `@extract` markers:

```verum
@extract(verum)
@extract(coq)
@extract(lean)
public theorem div_uniqueness(
    a: Int,
    b: Int { :: b != 0 }
) -> Int { a / b }
```

CI pipeline:

```bash
verum extract --output build/extracted
coqc build/extracted/div_uniqueness.v
lake build build/extracted/div_uniqueness.lean
verum check build/extracted/div_uniqueness.vr
```

### 8.2 Refinement-preserving FFI export

When the consumer can't run the verifier, use
`@extract_contract` so the refinement becomes a runtime check:

```verum
@extract_contract(ocaml)
public fn rope_index(
    r: Rope,
    i: Int { :: 0 <= i && i < r.len() }
) -> Char { r.char_at(i) }
```

The OCaml file asserts the bound at runtime — callers from a
less-typed setting get a clean panic instead of UB.

### 8.3 Verified spec, hand-tuned implementation

Pin a verified surface to a hand-tuned routine without losing the
proof-checked signature:

```verum
@extract(realize = "blake3_simd")
public fn blake3(input: List<Byte>) -> [Byte; 32] {
    // The Verum body proves the post-condition; the realize
    // binding routes runtime calls to the SIMD primitive.
    ...
}
```

### 8.4 Selective extraction

Walk only one file:

```bash
verum extract src/crypto/spec.vr --output build/crypto-extracted
```

Useful for tight inner CI loops where the full project walk is
overkill.

## 9. Common pitfalls

- **Lowerer fallback is not failure.** A metadata-comment scaffold
  in OCaml/Lean/Coq output means the construct exited the
  partial-coverage subset; the verified Verum source is preserved
  in the comment. Either hand-translate or stick with the Verum
  target.
- **`realize=` skips body lowering entirely.** If you set
  `realize="..."` then the body is replaced with the delegation
  wrapper unconditionally — the lowerer is never consulted. Use
  this when you explicitly *want* the binding.
- **Target syntax is per-target idiomatic, not literal Verum.**
  `Eq` lowers to `=` in OCaml, `==` in Lean (Decidable runtime
  equality), `=?` in Coq (mathcomp Bool equality). Read the
  coverage table in §3.1 before relying on a specific surface.
- **Mangled identifiers.** OCaml output mangles `plus.comm` to
  `plus_comm`. If you reference the extracted name from external
  Coq/Lean, use the mangled form.
- **Match guards are bailed on.** A `match` arm with a `when`
  guard returns `None` from the lowerer (graceful fallback).
  Restructure as nested `if` inside the body for the partial
  lowerer to handle it.

## 10. See also

- **[Reference → Attribute registry](/docs/reference/attribute-registry#program-extraction)** — full attribute table.
- **[Reference → CLI commands](/docs/reference/cli-commands#verum-extract-file---output-dir)** — flag reference.
- **[Verification → Proof export](/docs/verification/proof-export)** — exporting *proof certificates* (rather than program content).
- **[Verification → CLI workflow](/docs/verification/cli-workflow)** — full verification CLI surface.
- **[Language → attributes](/docs/language/attributes)** — usage-level guide to attributes.

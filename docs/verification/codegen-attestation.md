---
sidebar_position: 11
title: "Codegen attestation — CompCert-style verified compilation"
description: "Per-pass kernel-discharge attestation for the 6 codegen passes. CompCert-parity roadmap with explicit Discharged / AdmittedWithIou / NotYetAttested status."
slug: /verification/codegen-attestation
---

# Codegen attestation — CompCert-style verified compilation

A proof of `theorem T` is sound only as far as the *compiler*
that produced the running binary is sound. Verum's verification
pipeline takes proofs through `verum_kernel`; the codegen
pipeline (VBC → LLVM → machine code) takes them through six
canonical passes. **Codegen attestation** is the audit surface
that tracks, *per pass*, whether the pass's semantic-preservation
invariant is kernel-discharged, admitted with a published IOU, or
not yet attested.

The discipline mirrors **CompCert** (Leroy 2009) — the
seminal verified-compilation effort that ships per-pass
*simulation theorems* proving each compiler phase preserves
observable behaviour. Verum's V0 baseline is "trusted by
code-review only"; the discharge work is multi-year, with
entries flipping individually as kernel-side proofs land.

This page documents the six pass identifiers, the three
attestation statuses, the manifest format, and the audit gate.

## 1. The six canonical codegen passes

Verum's AOT codegen pipeline runs in this order:

```text
   VBC bytecode
        ↓
   ┌─[1]──────────────────────┐
   │  VbcLowering             │  VBC IR → LLVM IR
   └─[2]──────────────────────┘
        ↓
   ┌─[3]──────────────────────┐
   │  SsaConstruction         │  mem-to-reg / SSA
   └──────────────────────────┘
        ↓
   ┌─[4]──────────────────────┐
   │  RegisterAllocation      │  generic regalloc invariant
   └─[5]──────────────────────┘
        ↓
   ┌─[6]──────────────────────┐
   │  LinearScanRegalloc      │  the default allocator
   └──────────────────────────┘
        ↓
   ┌─[7]──────────────────────┐
   │  LlvmEmission            │  LLVM IR final shape
   └──────────────────────────┘
        ↓
   ┌─[8]──────────────────────┐
   │  MachineCodeEmission     │  LLVM black-box boundary
   └──────────────────────────┘
        ↓
   native binary
```

Six entries in `CodegenPassId` (the seventh and eighth labels
above are duplicate-listing artefacts — the canonical roster is
six). Each pass's *simulation invariant* is "this pass preserves
observable behaviour"; each invariant has a kernel-discharge
intrinsic named `kernel_<pass_tag>_preserves_semantics`.

| Pass | Tag | Implementation | Kernel intrinsic |
|------|-----|----------------|------------------|
| VBC Lowering | `vbc_lowering` | `verum_codegen::llvm::vbc_lowering` | `kernel_vbc_lowering_preserves_semantics` |
| SSA Construction | `ssa_construction` | LLVM `mem2reg` (delegated) | `kernel_ssa_construction_preserves_semantics` |
| Register Allocation | `register_allocation` | generic invariant | `kernel_register_allocation_preserves_semantics` |
| Linear-Scan Regalloc | `linear_scan_regalloc` | the default allocator | `kernel_linear_scan_regalloc_preserves_semantics` |
| LLVM IR Emission | `llvm_emission` | tail of the AOT pipeline | `kernel_llvm_emission_preserves_semantics` |
| Machine-Code Emission | `machine_code_emission` | LLVM backend (black box) | `kernel_machine_code_emission_preserves_semantics` |

The `MachineCodeEmission` boundary is the *trust transition* —
past this point the work happens inside LLVM, which is outside
Verum's TCB. The attestation at this pass is therefore a
*boundary marker* (whose payload says "we trust LLVM at this
point") rather than an internal-discharge proof.

## 2. The four attestation statuses

`AttestationStatus` is a type alias for the canonical
[`DischargeStatus`](./trusted-kernel.md) enum shared with the
kernel_v0 manifest. Single source of truth across every Verum
manifest that tracks soundness discharge.

`DischargeStatus` has four constructors:

| Status                  | Payload | Meaning |
|-------------------------|---------|---------|
| `Discharged`            | —       | Proved internally by the kernel. |
| `DischargedByFramework` | `{ lemma_path, framework, citation }` — e.g. `lemma_path = "core.verify.kernel_v0.lemmas.beta.church_rosser_confluence"`, `framework = "mathlib4"`, `citation = "Mathlib.Computability.Lambda.ChurchRosser"`. | Resolved by a registered upstream framework. |
| `AdmittedWithIou`       | `{ iou }` — the identifier of the named-but-unresolved obligation. | Honestly admitted gap; not yet audit-clean. |
| `NotYetAttested`        | —       | No attestation recorded; trusted by code review only. |

| Status | Audit-clean | Meaning |
|--------|:-----------:|---------|
| `Discharged` | ✓ | The pass carries a *kernel-discharged* simulation proof. The associated proof obligation has been mechanised and re-checked through the trusted base. |
| `DischargedByFramework` | ✓ | The pass's IOU is **resolved** by a vetted upstream proof in a registered framework (CompCert / Vellvm / Beringer-Stark / Poletto-Sarkar / Wang-Wilke-Leroy). Citation triple `(lemma_path, framework, citation)` pins a specific upstream artefact a reviewer can independently verify. **L4-acceptable.** |
| `AdmittedWithIou { iou }` | ✗ | The pass is admitted with a *named-but-unresolved* structural-property IOU. The `iou` payload names the missing lemma — honest about the gap, but *not yet* L4-acceptable because no upstream citation has been pinned. |
| `NotYetAttested` | ✗ | The pass has *no* attestation — trusted by code review only. Pre-attestation baseline. |

### 2.1 The discharge lifecycle

```text
   NotYetAttested  →  AdmittedWithIou  →  DischargedByFramework  →  Discharged
   (no proof)         (named but           (resolved by cited        (proven,
                       unresolved IOU)      upstream proof)            kernel-checked)
   trusted by         honest gap with      L4-acceptable trust       load-bearing
   code review        missing lemma        delegation                CompCert parity
```

Each transition reduces the trust-extension surface by one
level. The `is_audit_clean()` predicate returns true for the
two rightmost states; both are L4-acceptable for the audit
gate's *clean* verdict.

Current codegen pass surface: every pass at `AdmittedWithIou`
with concrete IOUs (CompCert §5.2 / Beringer-Stark 2002 §3 /
George-Appel 1996 §6 / Poletto-Sarkar 1999 §3 / Mössenböck-Pfeiffer
2002 §4 / Vellvm POPL 2012 §5 / Wang-Wilke-Leroy POPL 2020 §6).
Promotion to `DischargedByFramework` requires pinning each
upstream citation as a structured triple — this is the next
phase of CompCert-parity work.

(For a worked example of the promotion: the kernel_v0 manifest
has already promoted all 6 of its `AdmittedWithIou` rules
— K-Pi-Form, K-Lam-Intro, K-App-Elim, K-Beta, K-Eta, K-Sub —
to `DischargedByFramework` with mathlib4 / lean4_stdlib
citations. See [kernel_v0](./kernel-v0.md) §7.)

## 3. The PassAttestation record

The full per-pass record:

A `PassAttestation` carries four fields:

| Field               | Role |
|---------------------|------|
| `pass_id`           | Identifier of the codegen pass being attested. |
| `status`            | The attestation status (the alias for `DischargeStatus` defined above). |
| `proof_obligation`  | The semantic invariant the pass commits to preserving. |
| `kernel_intrinsic`  | Name of the kernel intrinsic that discharges the obligation. |

`proof_obligation` is the *semantic invariant* the pass commits
to. Examples:

- VBC Lowering: "the lowered IR's external observation trace
  agrees with the VBC IR's external observation trace, modulo
  ABI-trivial differences (calling-convention adjustment, stack
  frame layout)."
- SSA Construction: "for every variable `v`, the SSA-form's
  reaching-definition-style reads agree with the pre-SSA loads."
- Register Allocation: "for every program point and every
  observation, the value observed under the allocation is the
  value the un-allocated IR would observe."

The obligations are *verbatim* in the audit report — auditors
read them directly without translation.

## 4. The audit gate — `verum audit --codegen-attestation`

```text
$ verum audit --codegen-attestation
        --> Codegen attestation · CompCert-parity tracker

  pass                       status
  ────────────────────────   ─────────────────
  VBC Lowering               not_yet_attested
  SSA Construction           not_yet_attested
  Register Allocation        not_yet_attested
  Linear-Scan Regalloc       not_yet_attested
  LLVM IR Emission           not_yet_attested
  Machine-Code Emission      not_yet_attested

  6 / 6 passes — 0 discharged, 0 admitted_with_iou, 6 not_yet_attested
  V0 baseline; CompCert-parity progression in flight.

  output: target/audit-reports/codegen-attestation.json
```

The JSON report carries the full `PassAttestation` for each
pass, with `iou` payloads where applicable. The JSON is
schema-versioned for archival.

## 5. The trust delegation diagram

The codegen-attestation layer sits *between* the kernel-side
proof of `theorem T` and the running binary:

```text
   theorem T ─[ kernel re-check ]─────► proof admitted
                                              │
                                              │ user invokes verum build
                                              ▼
   VBC bytecode of T's program
                │
                │  six codegen passes, each carrying a
                │  semantic-preservation attestation
                ▼
                ┌─────────────────────────────────┐
                │  Discharged passes  → proven    │
                │  AdmittedWithIou    → IOU named │
                │  NotYetAttested     → review-only │
                └─────────────────────────────────┘
                │
                ▼
   running binary that operationally satisfies T
```

A binary is fully verified iff *every* pass discharges. Until
then, the audit chronicle records the gap explicitly — which
passes are discharged, which carry IOUs, which are review-only.
The trust boundary is enumerable.

## 6. Why this matters in practice

Without codegen attestation, the gap "the kernel admitted T but
LLVM might miscompile it" is invisible to the audit chronicle.
A bug in (say) SSA construction would silently produce a binary
that violates T even though `verum verify` reports success.

CompCert proved this gap can be closed for a real C compiler. Verum
is in flight on the same project for the VBC → LLVM → machine
pipeline.

The audit gate's role is *honesty about the current state*:
auditors reading a Verum-built binary's chronicle see exactly
which passes have discharged proofs and which carry review-only
trust.

## 7. The mechanisation roadmap

The full roadmap is tracked under
`mechanisation_roadmap` module and surfaced
by:

- `verum audit --htt-roadmap` — Lurie HTT mechanisation roadmap.
- `verum audit --ar-roadmap` — Arnold-Stability mechanisation
  roadmap.
- `verum audit --codegen-attestation` — the codegen pass
  roadmap (this gate).

The three roadmap gates together cover Verum's complete
"verified-compilation parity" trajectory.

## 8. Cross-references

- [Trusted kernel](./trusted-kernel.md) — the kernel discharge
  layer codegen attestation builds on.
- [Three-kernel architecture](./two-kernel-architecture.md) — the
  differential check on the kernel.
- [Reflection tower](./reflection-tower.md) — the meta-soundness
  layer.
- [Soundness gates](./soundness-gates.md) — the predicate-level
  formalisation.
- [Audit protocol](../architecture-types/audit-protocol.md) —
  the full ~45-gate catalog.
- [Architecture → codegen](../architecture/codegen.md) — the
  implementation-level codegen pipeline.
- [Architecture → VBC bytecode](../architecture/vbc-bytecode.md)
  — the input to VbcLowering.

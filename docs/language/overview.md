---
sidebar_position: 1
title: Language Overview
---

# Language Reference — Overview

This section specifies the Verum language. It is the normative
description of syntax and semantics. Where this section and the
grammar file ([`grammar/verum.ebnf`](/docs/reference/grammar-ebnf))
disagree, the grammar wins — but they should not disagree.

## Organisation

- **[Syntax](/docs/language/syntax)** — the lexical and syntactic
  shape of the language.
- **Type system**:
  - **[Types](/docs/language/types)** — the core type forms.
  - **[Refinement types](/docs/language/refinement-types)** — predicate subtyping.
  - **[Dependent types](/docs/language/dependent-types)** — Σ, Π, paths.
  - **[Protocols](/docs/language/protocols)** — interfaces, GATs, specialisation.
  - **[Generics](/docs/language/generics)** — type parameters and bounds.
- **Code**:
  - **[Functions](/docs/language/functions)** — definitions, modifiers, effects.
  - **[Patterns](/docs/language/patterns)** — match, destructuring, active patterns.
- **Memory**:
  - **[Memory model](/docs/language/memory-model)** — the ownership story.
  - **[References](/docs/language/references)** — `&T`, `&checked T`, `&unsafe T`.
  - **[CBGR](/docs/language/cbgr)** — capability-based generational references.
- **Organisation**:
  - **[Modules](/docs/language/modules)** — `mount`, visibility, coherence.
- **Computation**:
  - **[Context system](/docs/language/context-system)** — typed DI.
  - **[Async and concurrency](/docs/language/async-concurrency)** — `async`, `nursery`, `select`.
  - **[Error handling](/docs/language/error-handling)** — `Result`, `throws`, recovery.
  - **[Metaprogramming](/docs/language/metaprogramming)** — `meta fn`, `quote`, macros.
- **Boundaries**:
  - **[Attributes](/docs/language/attributes)** — `@` annotations.
  - **[FFI](/docs/language/ffi)** — `extern "C"` and C ABI.

## Core vocabulary

| Term | Meaning |
|------|---------|
| **Item** | A top-level declaration: function, type, implement block, const, module, etc. |
| **Refinement** | A predicate attached to a type that must hold for every value of that type. |
| **Protocol** | An interface — a set of method and associated-type signatures an implementation provides. |
| **Context** | A typed capability injected into a function via `using [...]`. |
| **Cog** | A package — a distributable unit of Verum code with a `Verum.toml` manifest. |
| **Tier** | A level in the three-tier reference model: `&T` (tier 0), `&checked T` (tier 1), `&unsafe T` (tier 2). |
| **CBGR** | Capability-Based Generational References — the default memory-safety mechanism. |
| **VBC** | Verum ByteCode — the language's unified IR. |

## Reading conventions

Throughout the reference:

- `verum` fenced blocks are illustrative — some may elide context clauses
  or refinements for clarity. Complete examples are marked `// complete`.
- Grammar snippets (in EBNF) come from `grammar/verum.ebnf` verbatim.
- `→` indicates compilation/evaluation.
- `⊢` indicates a type-checking judgement.

Let's begin with **[Syntax](/docs/language/syntax)**.

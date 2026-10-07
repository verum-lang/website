---
sidebar_position: 1
title: Introduction
description: Explore the Verum language platform — language, execution, libraries, tools and verification — and choose a starting point.
slug: /intro
---

# The Verum language platform

**Verum brings a systems language, execution engine, standard library,
developer tools and verification infrastructure into one platform.** Its
central design question is how to make types, memory, dependencies,
contracts and architecture cooperate throughout a program's life.

You can start with ordinary functions, records and pattern matching.
Refinements express constraints on values; contexts name dependencies;
contracts and proofs let you state and check stronger properties. The
platform's ambition is to connect these layers closely enough that a
claim about a system can be traced to both its implementation and its
validation.

## Choose a starting point

| Your goal | Start here | Continue with |
|-----------|------------|---------------|
| Run a program | [Installation](/docs/getting-started/installation) | [Your first hour](/docs/getting-started/first-hour) |
| Learn the syntax | [Language tour](/docs/getting-started/tour) | [Language reference](/docs/language/overview) |
| Build an application | [Project structure](/docs/getting-started/project-structure) | [Standard library](/docs/stdlib/overview) |
| Add correctness checks | [Refinement types](/docs/language/refinement-types) | [Contracts](/docs/verification/contracts) |
| Understand execution | [Runtime tiers](/docs/architecture/runtime-tiers) | [Compilation pipeline](/docs/architecture/compilation-pipeline) |
| Investigate a diagnostic | [Diagnostics](/docs/reference/diagnostics) | [CLI reference](/docs/reference/cli-commands) |

## How the layers fit together

### Language and data

Records, sum types and exhaustive matching model your domain. Protocols
and generics express reusable behaviour. `List`, `Map`, `Set` and `Text`
provide a common collection vocabulary, while `Result` and `Maybe`
represent fallible operations and optional values.

Start with [types](/docs/language/types), then explore
[protocols](/docs/language/protocols) and
[generics](/docs/language/generics). Qualified type names identify the
module that owns a declaration; two records with identical fields can
still be different types.

### Execution and memory

The compiler lowers source to Verum bytecode. The interpreter executes
that bytecode directly, while LLVM AOT compiles it to a native program.
Use explicit modes when comparing behaviour:

```bash
verum run --tier interpret events.vr
verum run --tier aot events.vr
```

The modes share a language and intermediate representation, but their
implementation coverage must be evaluated for the workload you use.
The [runtime guide](/docs/architecture/runtime-tiers) explains mode
selection and limitations.

Reference qualifiers describe access and checking policy. They are
separate from execution mode and from ownership or resource cleanup.
Read the [reference guide](/docs/language/references) before relying on a
reference qualifier to express a lifetime guarantee.

### Dependencies, concurrency and libraries

A function's `using [...]` clause names the contexts it needs. This makes
dependencies such as logging and clocks part of its interface. See the
[context system](/docs/language/context-system).

Async APIs also have execution contracts. In the current implementation,
calling an async function starts its body eagerly; do not assume that
passing an already computed result to a timeout or cancellation wrapper
makes the original operation interruptible. The
[async guide](/docs/language/async-concurrency) explains operation boundaries.

The [standard library](/docs/stdlib/overview) spans foundational
collections, I/O, concurrency and application modules. Use each module's
reference and documented status to assess its API and supported paths.

### Contracts, proofs and architecture

Refinements put predicates on types. Contracts express requirements and
postconditions. Verification settings determine whether an obligation is
checked during execution, discharged statically or accompanied by a
certificate. Runtime checks have a runtime cost; proof guarantees depend
on the property, supported constructs and stated assumptions.

Read [contracts](/docs/verification/contracts) for application-level
properties, [proofs](/docs/verification/proofs) for explicit proof work,
and the [trusted kernel](/docs/architecture/trusted-kernel) for the
checking boundary. Verification of a property does not by itself certify
the compiler, libraries or deployment environment.

[Architecture as types](/docs/architecture-types) extends the same idea
to capabilities, dependencies and boundary invariants. Architectural
claims and their lifecycle status make the intended structure inspectable.

### Tools and the development loop

The CLI brings compilation and execution together with commands for
formatting, testing and analysis. Editor integration uses the language
server. Start with [CLI tooling](/docs/tooling/cli),
[editor support](/docs/tooling/lsp), or the
[command reference](/docs/reference/cli-commands).

## Current implementation

**Known limitations:** interpreter and native AOT
coverage are not interchangeable. Native resource destruction and some
combinations of imported generic and callable types still have open
correctness gaps. An API's presence, a successful type check, or a passing
interpreter run does not establish that the same program is ready for a
native deployment. Consult the [execution guide](/docs/architecture/runtime-tiers)
and [references](/docs/language/references) for the affected contracts.

For a concrete evaluation, record the toolchain version, target,
execution mode and settings; exercise the program's success and failure
paths in that configuration. Check observable output and resource
behaviour as well as the process exit status. Keep those checks with the
application so that changes to the toolchain can be evaluated against the
same requirements.

Industrial reliability is the platform's engineering goal. Readiness is
a property of a supported configuration and a validated workload, with
explicit limits and evidence behind the guarantees you depend on.

---
sidebar_position: 1
title: context
---

# `core::context` — Context system primitives

The implementation side of the [language-level context system](/docs/language/context-system).

## `Scope`

```verum
type Scope is
    | Singleton   // one instance per program
    | Request     // one instance per request / task tree
    | Transient;  // new instance each injection
```

Used with `@injectable(Scope.Singleton)` to declare static DI scope.

## `ContextError`

```verum
type ContextError is
    | NotProvided(Text)       // context was requested but not provided
    | WrongType(Text, Text)   // context exists but wrong type
    | StackOverflow;          // context stack exceeded MAX depth
```

## Providers

```verum
type Provider<T> is protocol {
    fn provide(&self) -> T;
};

type ScopedProvider<T> is { scope: Scope, builder: fn() -> T };
type LazyProvider<T>   is { inner: OnceCell<T>, builder: fn() -> T };

fn get_context<T>() -> Maybe<&T>;
fn has_context<T>() -> Bool;
```

## `Layer` — stacked providers

```verum
type Layer;

let app_layer = Layer::new()
    .with_singleton::<Logger>(ConsoleLogger::new())
    .with_request::<Database>(|| connect())
    .with_transient::<RequestId>(|| RequestId::random());

app_layer.run(async_main()).await;
```

Layers let you wire all contexts for a program in one place.

## Propagation

Context stacks are per-task (per `ExecutionEnv`). The runtime:

- clones the stack on `spawn`;
- preserves it across `.await`;
- snapshots it when a generator suspends.

Channels do **not** propagate — they are data pipes.

## `provide` statement

The `provide Name = value in { ... }` form introduces a context in a
block. Outside the block, the context is no longer available.

```verum
provide Clock = FakeClock::fixed(fixed_time) in {
    test_scenario().await;
};
// Clock is gone here.
```

## Negative contexts (`!IO`)

A function declaring `using [!IO]` _may not_ access `IO` — any call
into an `IO`-requiring function from that scope is a compile error.
The runtime does not enforce this dynamically; it is a static guarantee.

## See also

- **[Language → context system](/docs/language/context-system)**
- **[runtime](/docs/stdlib/runtime)** — `ExecutionEnv`, supervision.
- **[sys](/docs/stdlib/sys)** — the underlying `ctx_` primitives.

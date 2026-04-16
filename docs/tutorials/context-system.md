---
sidebar_position: 9
title: Context System (DI)
---

# Tutorial: Context System

Verum's context system is a compile-time dependency injection framework.
Functions declare what they need with `using [...]`; callers provide
values with `provide`.

## Basic usage

```verum
// Declare a context type with methods
type Logger is {
    prefix: Text,
};

implement Logger {
    fn info(&self, msg: Text) {
        print(f"[{self.prefix}] {msg}");
    }

    fn error(&self, msg: Text) {
        print(f"[{self.prefix} ERROR] {msg}");
    }
}

// Function that needs a Logger
fn process_data(data: List<Int>) using [Logger] {
    Logger.info(f"Processing {data.len()} items");
    // ... process ...
    Logger.info("Done");
}

// Provide the context at the call site
fn main() {
    let logger = Logger { prefix: "APP" };
    provide Logger = logger in {
        process_data([1, 2, 3]);
    }
}
```

## Why contexts?

- **No hidden state**: dependencies are explicit in the function signature.
- **Testability**: swap implementations without changing code.
- **Compile-time checking**: missing `provide` is caught before runtime.
- **Zero runtime cost**: ~5–30 ns per context lookup (stack scan).

## Configuration

```toml
[context]
enabled = true                     # enable/disable the system entirely
unresolved_policy = "error"        # error | warn | allow
negative_constraints = true        # allow !using [Foo]
propagation_depth = 32             # max nesting depth
```

Disable for a single build:

```bash
verum build -Z context.enabled=false
```

## See also

- **[Context system design](/docs/architecture/overview)**
- **[`[context]` config](/docs/reference/verum-toml#context)**

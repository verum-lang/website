---
sidebar_position: 11
title: configuration
description: Universal configuration subsystem — parse / serialise / validate / convert / merge / interpolate across formats (TOML / YAML / JSON / INI / env).
---

# `core.configuration` — Universal configuration subsystem

A unified surface for parsing, serialising, validating, converting,
merging, and interpolating configuration in any supported format.

## Architecture summary

```
┌──────────────────────────────────────────────────────────┐
│ Layer 4 — this module: Configuration<T>::load*           │
├──────────────────────────────────────────────────────────┤
│ Layer 3 — schema, path, merge, env, convert              │
├──────────────────────────────────────────────────────────┤
│ Layer 2 — format protocol + registry, error              │
├──────────────────────────────────────────────────────────┤
│ Layer 1 — format adapters (toml, yaml, ini, ...)         │
├──────────────────────────────────────────────────────────┤
│ Layer 0 — value (ConfigValue ADT — categorical hub)      │
└──────────────────────────────────────────────────────────┘
```

**Categorical position**: this module is the **slice category**
over `ConfigValue` whose objects are typed records `T` and whose
morphisms are refinement-preserving load/save adapters. The
`Configuration<T>` type is the universal closure: any `T` admitting
`@derive(ConfigSchema)` is automatically loadable + saveable across
every registered format with the same call-site shape.

## Layout

| File | What's in it |
|---|---|
| `mod.vr` | re-exports + `Configuration<T>::load*` user API |
| `value.vr` | `ConfigValue` ADT — categorical hub for all formats |
| `format.vr` | `Format` protocol + format registry |
| `convert.vr` | `ConfigValue ↔ Verum types` conversion |
| `error.vr` | `ConfigError` taxonomy |
| `toml.vr` | TOML adapter (Cargo / pyproject / etc. ergonomics) |

## ConfigValue — the categorical hub

```verum
public type ConfigValue is
      Null
    | Bool(Bool)
    | Integer(Int)
    | Float(Float)
    | TextValue(Text)
    | Array(List<ConfigValue>)
    | Table(Map<Text, ConfigValue>)
    | DateTime(DateTime);
```

Every supported format (TOML, YAML, JSON, INI, env, …) parses
into `ConfigValue` and serialises from `ConfigValue`. Cross-format
conversion is then free composition: parse one format to
`ConfigValue`, serialise back to another.

## Format protocol

```verum
public type Format is protocol {
    fn name(&self) -> Text;                                  // "toml", "yaml", ...
    fn extensions(&self) -> List<Text>;                      // ["toml"]
    fn parse(&self, source: &Text)
        -> Result<ConfigValue, ConfigError>;
    fn serialise(&self, value: &ConfigValue, opts: &SerialiseOptions)
        -> Result<Text, ConfigError>;
};
```

Adapters implement this protocol; the registry resolves by
`name` or `extension`.

## Typed `Configuration<T>`

```verum
public type Configuration<T> is { value: T };

public fn load_str<T: ConfigSchema>(
    source: &Text,
    format: &Text,
) -> Result<Configuration<T>, ConfigError>;

public fn load_file<T: ConfigSchema>(
    path: &Text,
) -> Result<Configuration<T>, ConfigError>;  // format inferred from extension

public fn save_str<T: ConfigSchema>(
    config: &Configuration<T>,
    format: &Text,
) -> Result<Text, ConfigError>;

public fn save_file<T: ConfigSchema>(
    config: &Configuration<T>,
    path: &Text,
) -> Result<(), ConfigError>;
```

`@derive(ConfigSchema)` on any record type generates the
`ConfigValue ↔ T` conversion. Refinement types are preserved
across the round-trip: `port: Int { > 0 && < 65536 }` rejects
out-of-range values at load time with a structured
`ConfigError::RefinementFailed` carrying the field path and the
violated predicate.

## Error taxonomy

```verum
public type ConfigError is
      FormatNotRegistered(Text)
    | ParseError { format: Text, line: Int, column: Int, message: Text }
    | UnknownField { path: Text }
    | MissingField { path: Text, expected_type: Text }
    | TypeMismatch { path: Text, expected: Text, found: Text }
    | RefinementFailed { path: Text, predicate: Text, value: Text }
    | InterpolationError(Text)
    | Io(Text)
    | Backend(Text);
```

Every error variant carries the path through the config tree
(`"server.tls.cert_path"`) so the user can pinpoint the offending
field without grep.

## Merge + interpolation

```verum
public fn merge(base: ConfigValue, overlay: ConfigValue) -> ConfigValue;
public fn interpolate(value: &mut ConfigValue, env: &Map<Text, Text>)
    -> Result<(), ConfigError>;
```

Merge is deep-recursive: `Table` keys union recursively, `Array`
overlays replace, scalars overlay-wins. Interpolation expands
`${ENV_VAR}` / `${ENV_VAR:-default}` syntax against the supplied
env map.

## Status

| File | Status |
|---|---|
| `mod.vr` | **stable** — full load/save surface |
| `value.vr` | **stable** — 8-variant ADT |
| `format.vr` | **stable** — protocol + registry |
| `convert.vr` | **stable** — ConfigValue ↔ T (incl. refinement preservation) |
| `error.vr` | **stable** — full taxonomy |
| `toml.vr` | **stable** — parse/serialise round-trip |

YAML / JSON / INI / env-var adapters are tracked as future work.
The `Format` protocol's open-registry design means landing a new
adapter is purely additive — zero upstream code change.

## Composition example

```verum
// Load TOML, save same data as YAML — zero glue code.
let cfg: Configuration<MyConfig> = configuration::load_file("config.toml")?;
let yaml: Text = configuration::save_str(&cfg, "yaml")?;

// Layered config: defaults overlaid by user file overlaid by env.
let defaults = configuration::load_str::<MyConfig>(DEFAULTS_TOML, "toml")?.value;
let user     = configuration::load_file::<MyConfig>("user.toml")?.value;
let env_overlay = configuration::from_env::<MyConfig>(&std::env::vars())?;
let final_value = my_config_merge(defaults, my_config_merge(user, env_overlay));
```

The categorical foundation (slice over `ConfigValue`) ensures
these compositions are associative + identity-preserving — the
result of merging defaults+user+env is independent of grouping.

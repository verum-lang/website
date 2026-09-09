---
sidebar_position: 11
title: configuration
description: Universal configuration subsystem — parse / serialise / validate / convert / merge / interpolate across formats (TOML / YAML / JSON / INI / env).
status: regression-only
---

import StdlibStatus from '@site/src/components/StdlibStatus';

# `core.configuration` — Universal configuration subsystem

<StdlibStatus status="regression-only" />

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
// Every variant is `Config`-prefixed, and there are fourteen: the four
// TOML date/time shapes are distinct arms, and bytes, durations and a
// tagged wrapper are part of the model.
public type ConfigValue is
      ConfigNull
    | ConfigBool(Bool)
    | ConfigInt(Int)
    | ConfigFloat(Float)
    | ConfigString(Text)
    | ConfigBytes(List<Byte>)
    | ConfigOffsetDateTime(Rfc3339Time)
    | ConfigLocalDateTime(Rfc3339Time)
    | ConfigLocalDate(Rfc3339Time)
    | ConfigLocalTime(Rfc3339Time)
    | ConfigDuration(Duration)
    | ConfigArray(List<ConfigValue>)
    | ConfigTable(Map<Text, ConfigValue>)
    | ConfigTagged(Text, Heap<ConfigValue>);
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
out-of-range values at load time with a structured `ConfigError`
whose `kind` is `ConfigErrorKind.RefinementViolation`, carrying the
field path in `path` and the human-readable reason in `message`.

## Error taxonomy

`ConfigError` is a RECORD carrying one `ConfigErrorKind`, not a sum of
payload-bearing variants. The position fields are always present, so
every error can point at the source whether or not it has a semantic
path:

```verum
public type ConfigError is {
    format_id:   FormatId,
    kind:        ConfigErrorKind,
    line:        Int,          // 1-indexed
    column:      Int,          // 1-indexed, byte-counted (sources are UTF-8)
    byte_offset: Int,          // 0-indexed
    message:     Text,
    path:        Maybe<Text>,  // set for SEMANTIC errors only
};
```

The category is the `kind`, and there are 32 of them, grouped by the
phase that raises them:

| Group | Kinds |
|---|---|
| Syntactic | `UnexpectedEof` `UnexpectedChar` `InvalidEscape` `InvalidNumber` `InvalidUnicode` `InvalidDateTime` `InvalidDuration` `InvalidIndent` `InvalidEncoding` `TrailingGarbage` |
| Structural | `EmptyKey` `DuplicateKey` `KeyAfterValue` `RedefineSuperTable` `TypeMismatchInArray` `UnclosedBlock` |
| Limits | `DepthLimit` `StringTooLong` `TableTooLarge` `ArrayTooLarge` `TotalSizeExceeded` |
| Typed loader | `SchemaViolation` `RefinementViolation` `UnknownField` `ValueOutOfRange` |
| References | `InvalidReference` `CircularReference` |
| Conversion | `LossyConversion` `UnsupportedFeature` |
| I/O | `IoFileNotFound` `IoPermissionDenied` `IoOther` |

`path` is `Maybe<Text>` and is populated for SEMANTIC errors — the
typed-loader and reference groups. A syntax error has a line and a
column but no path through the config tree, because the tree did not
parse. The previous version of this page claimed "every error variant
carries the path"; that was true of the invented taxonomy and is not
true of the shipped one, and code written to `.path.unwrap()` on a
parse failure would have panicked.

Transcribed from `core/configuration/error.vr`.

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

The functions named in earlier drafts of this page
(`load_file`/`save_str`/`load_str`/`from_env`) do not exist under any
spelling — confirmed by searching `core/configuration/` directly. The
real top-level surface is `load_text` / `dump_text` (`mod.vr`), which
take **text you've already read**, not a path, plus a `FormatId`
(`format_id_toml()`, `format_id_yaml()`, … — one constructor function
per format, `core/configuration/error.vr`):

```verum
mount core.configuration.{load_text, dump_text};
mount core.configuration.error.{format_id_toml, format_id_yaml};
mount core.io.fs;

// Load TOML, save the same data as YAML.
let toml_text = fs.read_to_string(&path)?;
let cfg  = load_text(&toml_text, &format_id_toml())?;
let yaml = dump_text(&cfg, &format_id_yaml())?;
```

For bulk environment enumeration: unlike the JSON case on
[cookbook → shell scripting](../cookbook/shell-scripting.md), this one
**does** exist — `core.base.env.vars()` returns an iterator of every
`(Text, Text)` pair in the process environment:

```verum
mount core.base.env.{vars};

for (key, value) in vars() {
    // fold into your own overlay however your merge strategy wants it
}
```

There is no ready-made `configuration.from_env::<T>()` bridge from
that iterator into a typed overlay, and no `Configuration<T>::load*`
convenience wrapping path + parse + merge into one call the way
earlier drafts implied — assembling "defaults overlaid by user file
overlaid by env" from these primitives is real work your own code
does, not a one-liner this module provides today.

The categorical foundation (slice over `ConfigValue`) ensures
these compositions are associative + identity-preserving — the
result of merging defaults+user+env is independent of grouping.

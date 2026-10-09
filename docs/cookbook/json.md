---
title: Parse and validate JSON
description: Parse runtime text into JsonValue, validate application fields, and build JSON output.
---

# Parse and validate JSON

`core.encoding.json` parses runtime text into `JsonValue`, an explicit tree
of nulls, booleans, numbers, strings, arrays and objects. Decode that tree
into your application records by checking the fields you need.

`parse` and `parse_strict` are not generic deserializers. Neither accepts a
type parameter or returns your record because of a type annotation. The
`Serialize` and `Deserialize` protocols describe a separate serialization
interface; deriving them does not turn `json.parse(&text)` into a record
conversion.

## Parse a document

Use `parse_strict` when the input contract requires a document size limit
and refusal of repeated object keys:

```verum
mount core.encoding.json.{JsonError, parse_strict, stringify};

fn compact_json(source: &Text) -> Result<Text, JsonError> {
    let value = parse_strict(source, 64 * 1024)?;
    Result.Ok(stringify(&value))
}
```

The bound counts the complete UTF-8 source in bytes, including whitespace
and escape sequences. The parser rejects an oversized document before
constructing JSON strings and containers. This does not bound allocations
made by the input layer before it supplies the `Text`.

Duplicate detection compares decoded keys within each object. For example,
`{"name": 1, "\u006eame": 2}` is rejected; the same key in two sibling objects
is allowed. Nested objects are checked too. Both full-document entry points
reject trailing content, comments and trailing commas.

The compatibility entry point `parse(source: &Text)` has no caller-supplied
document byte bound and keeps the last value for a repeated key. `decode`
uses that same behavior. All these entry points retain the implementation's
nesting, string and collection limits.

For byte input, handle `Text.from_utf8(bytes)` before parsing if invalid
UTF-8 must be refused. `decode_bytes` instead uses a lossy conversion and
the compatibility parser.

## Decode a typed record explicitly

The following decoder requires `host` to be a string and `port` to be an
integer from 1 through 65535. It keeps syntax errors separate from schema
errors. Additional object fields are ignored by this example; add an
allowed-key check if your input contract forbids them.

```verum
mount core.encoding.json.{JsonError, parse_strict};

type ServerConfig is {
    host: Text,
    port: Int,
};

type ConfigError is Syntax(JsonError) | Schema(Text);

fn parse_config(source: &Text) -> Result<ServerConfig, ConfigError> {
    let value = match parse_strict(source, 64 * 1024) {
        Result.Ok(value) => value,
        Result.Err(error) => return Result.Err(ConfigError.Syntax(error)),
    };
    let fields = match value.as_object() {
        Maybe.Some(fields) => fields,
        Maybe.None => return Result.Err(ConfigError.Schema("expected an object")),
    };
    let host = match fields.get(&"host") {
        Maybe.Some(item) => match item.as_string() {
            Maybe.Some(text) => text,
            Maybe.None => return Result.Err(ConfigError.Schema("host must be a string")),
        },
        Maybe.None => return Result.Err(ConfigError.Schema("host is required")),
    };
    let port = match fields.get(&"port") {
        Maybe.Some(item) => match item.as_int() {
            Maybe.Some(number) => number,
            Maybe.None => return Result.Err(ConfigError.Schema("port must be an integer")),
        },
        Maybe.None => return Result.Err(ConfigError.Schema("port is required")),
    };
    if port < 1 || port > 65535 {
        return Result.Err(ConfigError.Schema("port must be between 1 and 65535"));
    }
    Result.Ok(ServerConfig { host: host, port: port })
}
```

For example, `{"host":"localhost","port":8080}` has the expected shape.
`{"host":"localhost","port":"8080"}` fails the integer check, and a missing
`port` produces a different schema error. The range check belongs to
`parse_config`; the JSON parser does not know the application's port rules.

Choose defaults, renamed keys, nested records and unknown-field behavior in
your decoder. A successful JSON parse alone establishes none of those policies.

## Read dynamic values

Keep the value as `JsonValue` when its shape is determined at runtime.
Accessors return `Maybe`, allowing missing or wrong-kind values to be handled
explicitly:

| Accessor | Result |
|---|---|
| `as_bool()` | `Maybe<Bool>` |
| `as_int()` | `Maybe<Int>`; only the integer variant |
| `as_float()` | `Maybe<Float>`; also converts the integer variant |
| `as_string()` | `Maybe<Text>`; clones the string payload |
| `as_array()` | `Maybe<&List<JsonValue>>` |
| `as_object()` | `Maybe<&Map<Text, JsonValue>>` |

`core.base.data.parse_json(input: Text)` is a separate parser returning
`Result<Data, DataError>`. `Data` and `JsonValue` have different variants and
accessors. The JSON parser does not supply a `Data.try_into<User>()` record
conversion; use the explicit decoding approach above or a separately
implemented deserializer.

## Build JSON output

Construct a `JsonValue` and pass it to `stringify` or `stringify_pretty`.
Continuing with `ServerConfig` above:

```verum
mount core.collections.Map;
mount core.encoding.json.{JsonValue, json_int, json_string, json_object, stringify};

fn config_json(config: &ServerConfig) -> Text {
    let mut fields: Map<Text, JsonValue> = Map.new();
    fields.insert("host", json_string(config.host.clone()));
    fields.insert("port", json_int(config.port));
    let value = json_object(fields);
    stringify(&value)
}
```

The builders `json_null`, `json_bool`, `json_int`, `json_float`, `json_string`,
`json_array` and `json_object` wrap the corresponding value variants.
`json_number` is another name for the floating-point builder.

Both serializers return a complete `Text`. Pretty printing uses fixed
two-space indentation; there is no writer-sink or formatting-options
parameter. Write the returned text through your chosen I/O API.

## Handle parser errors

`JsonError` is a record. Read its `line`, `column` and `message` fields for a
diagnostic, or match `kind` for a particular policy. Positions are one-based,
and columns count source bytes.

```verum
mount core.encoding.json.parse_strict;

fn inspect_json(source: &Text) {
    match parse_strict(source, 64 * 1024) {
        Result.Ok(_) => print("valid JSON document"),
        Result.Err(error) =>
            eprint(f"bad JSON at {error.line}:{error.column}: {error.message}"),
    }
}
```

The strict parser adds these error kinds to the shared syntax and limit errors:

| Kind | Meaning |
|---|---|
| `DuplicateKey` | A decoded object key repeats within the same object |
| `DocumentTooLarge` | Source byte length exceeds `max_bytes` |
| `InvalidLimit` | `max_bytes` is negative |

An empty document still fails parsing. A zero byte bound permits no nonempty
JSON document. Schema errors such as a missing application field are handled
by the decoder, as `ConfigError.Schema` is above; they are not `JsonErrorKind`
variants.

## Process JSON Lines

Parsing constructs a whole value tree. There is no JSON event parser or
streaming serializer in this module. For JSON Lines, frame and bound each
complete line in your input layer, then parse one line at a time:

```verum
mount core.encoding.json.{JsonValue, JsonError, parse_strict};

fn parse_line(line: &Text) -> Result<JsonValue, JsonError> {
    parse_strict(line, 16 * 1024)
}
```

Handle blank lines according to your file format. Each accepted line yields a
`JsonValue`; apply your record decoder afterward. Parsing one line at a time
bounds the document passed to the parser, but an input reader also needs its
own line-length bound.

`parse_value` accepts a leading value followed by more input. Its result has
no consumed-byte count or cursor, so it does not supply incremental stream
framing.

## Representation details

- **Memory:** parsed strings own `Text` storage; arrays and objects own
  `List` and `Map` storage. Do not assume zero-allocation parsing.
- **Numbers:** `JsonInt` stores `Int`; decimal/exponent forms use `JsonFloat`.
  An integer token outside the `Int` range falls back to floating point,
  which can lose precision. Validate exact numeric requirements explicitly.
- **Floating-point output:** JSON has no `NaN` or infinity values. Validate
  finiteness before serialization; `stringify` returns `Text` without an
  error result for such values.
- **Object order:** serialization follows map iteration order and does not
  sort keys. Do not use ordinary `stringify` output as canonical JSON for
  signatures.

These runtime APIs are defined in
[`core/encoding/json.vr`](https://github.com/verum-lang/verum/blob/main/core/encoding/json.vr).
[Tagged literals](/docs/language/tagged-literals) use a separate compiler
path; their validation does not run when a runtime `Text` is parsed.

## See also

- [Encoding reference](/docs/stdlib/encoding) — JSON values, entry points and
  other data formats.
- [Base library](/docs/stdlib/base) — the separate `Data`, `Serialize` and
  `Deserialize` interfaces.
- [Text helpers](/docs/stdlib/text) — text and UTF-8 conversion.

---
title: Parse JSON into typed records
description: Validate JSON at compile time, deserialise into typed records, handle dynamic shape.
---

# Parse JSON

Verum has three layers of JSON support:

1. **`json#"..."` tagged literals** — validated at compile time,
   produce `JsonValue` or (with type annotation) a deserialised
   record.
2. **`@derive(Serialize, Deserialize)`** on record types — typed
   round-tripping with refinement enforcement.
3. **`core.base.data.Data`** — dynamic JSON-like value for when
   the schema is unknown.

This page covers all three.

## 1. Tagged literal — compile-time validated

```verum
let config = json#"""
    {
        "host": "localhost",
        "port": 8080,
        "tls":  { "enabled": true, "cert": "cert.pem" }
    }
""";                                       // -> JsonValue, validated at compile
```

The compiler parses the content with JSON5-relaxed rules (unquoted
keys, trailing commas, single-quote strings). A malformed literal is
a **compile error** with a counterexample pointing into the content.

### Inferring a specific type

When the target type implements `Deserialize`, the literal coerces:

```verum
let cfg: ServerConfig = json#"""
    { "host": "localhost", "port": 8080, "tls": { "enabled": true, "cert": "cert.pem" } }
""";
```

Compile-time deserialization validates every field against
`ServerConfig`'s refinements — no runtime check needed.

### Interpolation

```verum
let body = json#"""
    {
        "id":    ${user.id},
        "name":  "${user.name}",
        "email": "${user.email}"
    }
""";
```

`${user.id}` splices a value-position expression. The JSON
validator knows the position:

- In value position, `${user.id}` is an `Int`, `Float`, `Bool`,
  `Text`, or a nested `JsonValue`.
- In key position, `${user.key_name}` must be `Text`.
- Escaping is automatic — `${user.name}` with `name = "a\"b"`
  produces `"a\"b"` in the output, correctly escaped.

See [language/tagged-literals](/docs/language/tagged-literals).

## 2. Typed deserialization via `@derive`

Declare your schema as a Verum type, annotate, parse.

```verum
@derive(Deserialize, Serialize, Debug)
type TlsConfig is {
    enabled: Bool,
    cert:    Text,
};

@derive(Deserialize, Serialize, Debug)
type ServerConfig is {
    host: Text,
    port: Int { 1 <= self && self <= 65535 },
    tls:  TlsConfig,
};
```

Parse a string:

```verum
fn load_config(path: &Path) -> Result<ServerConfig, Error>
    using [FileSystem]
{
    let text = fs.read_to_string(path)?;
    let cfg: ServerConfig = json.parse(&text)?;
    Result.Ok(cfg)
}
```

The refinement `port: Int { 1 <= self && self <= 65535 }` is enforced
where the value becomes a `ServerConfig` — that is, in the
**deserialisation** step, not in `parse`, which only ever produces a
`JsonValue`. A port out of range is a `SerdeError`
(`core/base/serde.vr`); there is no `RefinementViolation` variant.

### Renaming

```verum
@derive(Deserialize)
type User is {
    @serialize(rename = "userId")
    user_id: Int,

    @serialize(rename_all = "snake_case", with_case = "camelCase")
    first_name: Text,   // maps both "first_name" (snake) and "firstName" (camel)
};
```

### Defaults

```verum
@derive(Deserialize)
type Settings is {
    retries:     Int = 3,                        // if absent, use 3
    delay_ms:    Int = 100,
    max_connections: Int = @const(CPU_COUNT * 4),
};
```

### Flattening

```verum
@derive(Deserialize)
type Outer is {
    id: Int,
    @serialize(flatten)
    inner: Inner,        // `Inner`'s fields appear at the outer level in JSON
};
```

### Union types (tagged / untagged)

```verum
@derive(Deserialize)
@serialize(tag = "kind")
type Event is
    | Click { x: Int, y: Int }
    | Keypress { code: Int };
// { "kind": "Click", "x": 10, "y": 20 }
// { "kind": "Keypress", "code": 65 }
```

Without `tag = "..."`, `Event` is serialised untagged — use the
[`#[serde(untagged)]` analog](/docs/stdlib/base) for Verum.

## 3. Dynamic JSON — `Data`

When the schema is unknown at compile time, parse into
`core.base.data.Data`:

```verum
let raw: Data = json.parse_to_data(&text)?;

match raw.get("user").and_then(|u| u.get("name")) {
    Maybe.Some(Data.Text(name)) => print(f"name = {name}"),
    _ => eprint("no name"),
}
```

### Path-based access

```verum
fn read_contact(raw: Data) -> Result<(), JsonError> {
    if let Maybe.Some(email) = raw.path("user.contact.email")? {
        // email is Data — use .as_text(), .as_int(), etc.
    }

    // With JSONPath:
    for name in raw.jpath(jpath#"$.users[*].name") {
        print(name);
    }
    Ok(())
}
```

### Type narrowing

```verum
let value: Data = json.parse_to_data(&text)?;

match value {
    Data.Null           => print("null"),
    Data.Bool(b)        => print(f"bool: {b}"),
    Data.Int(n)         => print(f"int: {n}"),
    Data.Float(f)       => print(f"float: {f}"),
    Data.Text(s)        => print(f"str: {s}"),
    Data.Array(xs)      => print(f"array of {xs.len()}"),
    Data.Object(m)      => print(f"object with {m.len()} keys"),
}
```

### Converting from `Data` to a typed record

```verum
let user: User = value.try_into<User>()?;
// Same validation as json.parse, but against the already-parsed Data.
```

## 4. Serializing out

```verum
@derive(Serialize)
type Reply is { status: Int, message: Text };

let reply = Reply { status: 200, message: "ok".to_text() };

let text: Text        = json.to_text(&reply)?;
let pretty: Text      = json.to_text_pretty(&reply)?;
let bytes: List<Byte> = json.to_bytes(&reply)?;

// Stream to a writer:
let mut f = File.create("out.json")?;
json.to_writer(&reply, &mut f)?;
```

`to_text_pretty` emits two-space indent; use `json.to_text_pretty_with(&reply, options)`
for custom indent / array/object formatting.

## 5. Handling errors

:::caution The error surface here was wrong
This section described a `DataError` sum with `MissingField` and
`RefinementViolation` arms, and a `json.parse<T>` taking a type
parameter. None of those exist — measured against
`core/encoding/json.vr` and `core/base/data.vr`. Two DIFFERENT error
types were being conflated, which is worth stating because the
distinction is the useful part.
:::

`json.parse(source: &Text) -> Result<JsonValue, JsonError>` — it takes no
type parameter and it always yields a `JsonValue`. `JsonError` is a
**record**, not a sum, so you read its fields rather than matching arms:

```verum
mount core.encoding.json.{parse, JsonError, JsonErrorKind};

match parse(&input) {
    Result.Ok(value) => process(value),
    Result.Err(e) =>
        eprint(f"bad JSON at {e.line}:{e.column}: {e.message}"),
}
```

`e.kind` is a `JsonErrorKind` when you need to branch on the reason —
`UnexpectedEof`, `UnexpectedChar`, `InvalidEscape`, `InvalidNumber`,
`InvalidUnicode`, `DepthLimit`, `StringTooLong`, `ArrayTooLarge`,
`ObjectTooLarge` or `TrailingGarbage`. Note what is NOT in that list:
there is no arm for a missing field or a violated refinement, because
`parse` produces a `JsonValue` and never consults your record type.

Those belong to the **deserialisation** layer instead
(`core/base/serde.vr`), whose error type is `SerdeError`, built with
`SerdeError.missing_field(name)`, `SerdeError.unknown_field(name)` and
`SerdeError.unexpected_type(expected, found)`. So the two questions have
two answers: *is this text JSON at all* is `JsonError`, and *does this
JSON fit my record* is `SerdeError`.

`DataError` (`core/base/data.vr`) is a third thing again — the error type
of the dynamic `Data` value in §3, with `TypeMismatch { expected, actual }`,
`KeyNotFound { key }`, `IndexOutOfBounds { index, length }`,
`ParseError { message }` and `InvalidCast { from, to }`.

## 6. Streaming parse (large files)

:::caution There is no event parser
`core/encoding/json.vr` exports four types — `JsonValue`, `JsonMap`,
`JsonError`, `JsonErrorKind` — and no `StreamParser`, no `JsonEvent`.
Parsing is whole-document: it builds a `JsonValue`.

So a file that does not fit in memory cannot be parsed as one document
today. What works is splitting the input before parsing, which is why
the JSON Lines form below is not a lesser alternative here — it is the
one that runs.
:::

For JSON Lines (one object per line):

```verum
let reader = BufReader.new(File.open(path)?);
for line in reader.lines() {
    let obj: LogEntry = json.parse(&line?)?;
    process(obj);
}
```

## Pitfalls

### Number precision

JSON has one numeric type; Verum keeps two. `Data` (§3) carries
`Data.Int(Int)` and `Data.Float(Float)` as separate variants — there is
no `Data.Number` — and `JsonValue` does the same with `JsonInt` and
`JsonFloat`. A number like `9007199254740993` may already have been
rounded to a `Float` by a producer that has only one numeric type;
`Data.Int` preserves precision up to 64-bit, but it cannot recover
what JavaScript rounded before you saw it.

For financial data, deserialize into refined integers or
`BigDecimal`, not `Float`.

### Field order

JSON objects are **unordered**. Verum's serializer emits fields in
declaration order; don't depend on a specific order in downstream
systems.

### Comment handling

`json#` accepts JSON5 comments (`//`, `/* */`) but **strict** JSON
rejects them. If you ship the raw bytes produced by `json.to_text`
to a strict consumer, you're fine — Verum emits strict by default.

### Type-annotated literals are compile-checked

```verum
let user: User = json#"""{ "age": "not a number" }""";
// ERROR: type "not a number" is not Int at field "age"
```

The type annotation turns the validator on at compile time —
malformed literals don't make it to runtime.

## See also

- **[Tagged Literals](/docs/language/tagged-literals)** — `json#`,
  `yaml#`, `toml#`, `xml#`, and friends.
- **[`stdlib/base`](/docs/stdlib/base)** — `Data`, `Serialize`,
  `Deserialize`, `Serializer`.
- **[`stdlib/text`](/docs/stdlib/text)** — `Text` helpers.
- **[cookbook/validation](/docs/cookbook/validation)** — refinements
  on deserialised input.

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
3. **`core.base.data::Data`** — dynamic JSON-like value for when
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
    let text = fs::read_to_string(path)?;
    let cfg: ServerConfig = json::parse(&text)?;
    Result.Ok(cfg)
}
```

The refinement `port: Int { 1 <= self && self <= 65535 }` is checked
**during parsing**. A port out of range fails with
`DataError.RefinementViolation { field: "port", value: 80000 }`.

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
`core.base.data::Data`:

```verum
let raw: Data = json::parse_to_data(&text)?;

match raw.get("user").and_then(|u| u.get("name")) {
    Maybe.Some(Data.Text(name)) => print(f"name = {name}"),
    _ => eprint("no name"),
}
```

### Path-based access

```verum
if let Maybe.Some(email) = raw.path("user.contact.email")? {
    // email is Data — use .as_text(), .as_int(), etc.
}

// With JSONPath:
for match in raw.jpath(jpath#"$.users[*].name") {
    print(match);
}
```

### Type narrowing

```verum
let value: Data = json::parse_to_data(&text)?;

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
let user: User = value.try_into::<User>()?;
// Same validation as json::parse, but against the already-parsed Data.
```

## 4. Serializing out

```verum
@derive(Serialize)
type Reply is { status: Int, message: Text };

let reply = Reply { status: 200, message: "ok".to_text() };

let text: Text        = json::to_text(&reply)?;
let pretty: Text      = json::to_text_pretty(&reply)?;
let bytes: List<Byte> = json::to_bytes(&reply)?;

// Stream to a writer:
let mut f = File.create("out.json")?;
json::to_writer(&reply, &mut f)?;
```

`to_text_pretty` emits two-space indent; use `json::to_text_pretty_with(&reply, options)`
for custom indent / array/object formatting.

## 5. Handling errors

`json::parse` returns `Result<T, DataError>`:

```verum
match json::parse::<ServerConfig>(&input) {
    Result.Ok(cfg) => process(cfg),

    Result.Err(DataError.ParseError { msg, line, col }) =>
        eprint(f"bad JSON at {line}:{col}: {msg}"),

    Result.Err(DataError.TypeMismatch { expected, got, path }) =>
        eprint(f"type mismatch at {path}: expected {expected}, got {got}"),

    Result.Err(DataError.MissingField { name, at_path }) =>
        eprint(f"missing field {name} at {at_path}"),

    Result.Err(DataError.RefinementViolation { field, value, predicate }) =>
        eprint(f"field {field} = {value} violates {predicate}"),

    Result.Err(e) =>
        eprint(f"json error: {e:?}"),
}
```

## 6. Streaming parse (large files)

For a file that doesn't fit in memory:

```verum
let mut reader = BufReader.new(File.open(path)?);
let mut parser = json::StreamParser.new(&mut reader);

while let Maybe.Some(event) = parser.next().await? {
    match event {
        JsonEvent.ObjectStart => { ... }
        JsonEvent.KeyValue(key, value) => process(key, value),
        JsonEvent.ObjectEnd => { ... }
        JsonEvent.ArrayStart => { ... }
        _ => { }
    }
}
```

For JSON Lines (one object per line):

```verum
let reader = BufReader.new(File.open(path)?);
for line in reader.lines() {
    let obj: LogEntry = json::parse(&line?)?;
    process(obj);
}
```

## Pitfalls

### Number precision

JSON has one numeric type; Verum's `Data.Number` stores both `Int`
and `Float` separately. A number like `9007199254740993` may be
represented as `Float` in a round-trip through some libraries —
`Data.Int` preserves precision up to 64-bit, but a JSON document
coming from JavaScript may already have been rounded.

For financial data, deserialize into refined integers or
`BigDecimal`, not `Float`.

### Field order

JSON objects are **unordered**. Verum's serializer emits fields in
declaration order; don't depend on a specific order in downstream
systems.

### Comment handling

`json#` accepts JSON5 comments (`//`, `/* */`) but **strict** JSON
rejects them. If you ship the raw bytes produced by `json::to_text`
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

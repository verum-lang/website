---
title: Parse JSON into typed records
description: Validate JSON at compile time; deserialise into typed structs.
---

# Parse JSON

### Compile-time-validated JSON literal

```verum
let config = json#"""{
    "host": "localhost",
    "port": 8080,
    "tls":  { "enabled": true, "cert": "cert.pem" }
}""";                                            // -> JsonValue, validated at compile time
```

### Typed deserialisation

```verum
@derive(Deserialize, Debug)
type TlsConfig is {
    enabled: Bool,
    cert: Text,
}

@derive(Deserialize, Debug)
type ServerConfig is {
    host: Text,
    port: Int { 1 <= self && self <= 65535 },   // refinement checked on deserialise
    tls: TlsConfig,
}

fn load_config(path: &Path) -> Result<ServerConfig, Error> using [IO] {
    let text = fs::read_to_string(path)?;
    let cfg: ServerConfig = json::parse(&text)?;
    Result.Ok(cfg)
}
```

### Dynamic access when the shape is unknown

```verum
let raw = parse_json(&text)?;        // -> Data

match raw.get("user").and_then(|u| u.get("name")) {
    Maybe.Some(Data.Text(name)) => print(&f"name = {name}"),
    _ => eprintln(&"no name"),
}

// Or via dot-path:
if let Maybe.Some(email) = raw.path("user.contact.email")? {
    ...
}
```

### Serialise

```verum
@derive(Serialize)
type Reply is { status: Int, message: Text }

let text: Text = json::to_string(&Reply { status: 200, message: "ok".to_string() })?;
let pretty: Text = json::to_string_pretty(&reply)?;
```

### Interpolated JSON with automatic escaping

```verum
let body = json#"""{
    "id":   ${user.id},
    "name": "${user.name}",
    "meta": ${user.meta_json}
}""";
// Expressions are typed: id -> Int, name -> Text (properly JSON-escaped),
// meta -> JsonValue (spliced raw).
```

### Handling malformed input

```verum
match json::parse(&input) {
    Result.Ok(data) => process(data),
    Result.Err(DataError.ParseError(msg)) => eprintln(&f"bad JSON: {msg}"),
    Result.Err(DataError.TypeMismatch)     => eprintln(&"wrong shape"),
    Result.Err(e)                          => eprintln(&f"json error: {e:?}"),
}
```

### Pitfalls

- **Numbers**: `Data.Number(Float)` loses precision for Int64. If
  you need exact integers, use a typed `@derive(Deserialize)` record
  or parse into `Data.String` and convert yourself.
- **Field order**: JSON objects are unordered; serialisation emits
  declaration order. Don't depend on a specific order.

### See also

- **[base → Data](/docs/stdlib/base)** — dynamic JSON type.
- **[base → Serialize/Deserialize](/docs/stdlib/base#serialisation--serialize--deserialize)** — derive-able traits.
- **[text → tagged literals](/docs/stdlib/text)** — `json#`, interpolated forms.

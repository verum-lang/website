---
sidebar_position: 25
title: Tagged Literals
description: Compile-time validated literals — sql#, json#, rx#, url#, d#, and more.
---

# Tagged Literals

Verum's tagged literals are the bridge between a string of bytes and a
strongly typed, compile-time validated value. The grammar allows any
identifier as a tag; about forty tags are recognised by the compiler out
of the box and produce real types (`SqlQuery`, `Regex`, `Url`, …) rather
than `Text`.

The spelling is always the same:

```verum
tag#"content"          // single-line — escapes processed
tag#"""content"""      // raw, multi-line — no escapes
```

The compiler invokes the tag's validator at parse time. A malformed
`sql#"..."` is a compile error with a line and column pointing into the
literal, not a runtime panic.

## Why tagged literals?

A plain `Text` tells the compiler nothing about the shape of the bytes
it carries. Tagged literals attach a **grammar** and a **result type**:

| You write                              | You get            | Validated by                   |
|----------------------------------------|--------------------|--------------------------------|
| `json#"{\"k\": 1}"`                    | `JsonValue`        | JSON5-relaxed parser           |
| `sql#"SELECT * FROM u WHERE id = 1"`   | `SqlQuery`         | SQL grammar                    |
| `rx#"\\d{3}-\\d{4}"`                   | `Regex`            | regex compiler                 |
| `url#"https://example.com/path"`       | `Url`              | URL parser (RFC 3986)          |
| `d#"2026-04-17T12:00:00Z"`             | `DateTime`         | ISO-8601 parser                |
| `ip#"2001:db8::1"`                     | `IpAddress`        | IPv4/IPv6 parser               |
| `ver#"1.2.3-rc.4"`                     | `SemVer`           | semantic versioning parser     |

The important property: a malformed value **cannot exist** in a Verum
program. Validators run before any code is generated.

## The full tag registry

The grammar groups tags by category. Every category listed below is
accepted by the compiler; custom tags fall back to user-defined macros.

### Data interchange

```verum
json#"..."     → JsonValue       // JSON5-relaxed: unquoted keys, trailing commas, // comments
json5#"..."    → Json5Value      // same validator; distinct alias for intent
yaml#"..."     → YamlValue
toml#"..."     → TomlValue
xml#"..."      → XmlNode
html#"..."     → HtmlFragment    // lenient: accepts HTML5 fragments
csv#"..."      → CsvTable
```

`json#` implements a **relaxed** grammar — close to JSON5:

```verum
let cfg = json#"""
    {
        name: "verum",       // unquoted keys
        features: [
            "refinement",
            "dependent",     // trailing comma ok
        ],
        /* block comments ok */
        quoted_ok: 'single quotes too',
    }
""";
```

For strict JSON, the `json#` literal still validates — it accepts a
superset. If you need strict mode, refine the result:
`json#"..." : StrictJson`.

### Query languages

```verum
sql#"..."      → SqlQuery        // SQL-92 with common extensions
gql#"..."      → GraphQLDoc      // alias: graphql#
cypher#"..."   → CypherQuery     // Neo4j Cypher
sparql#"..."   → SparqlQuery
```

SQL literals participate in *structured query typing*: the compiler
infers the parameter types and the result row shape from the query's
bind variables.

```verum
let q = sql#"SELECT id, email FROM users WHERE age >= $1";
// q : SqlQuery<Params=(Int,), Row={id: Int, email: Text}>
```

### Pattern matching

```verum
rx#"..."       → Regex           // alias: re#, regex#
glob#"..."     → GlobPattern     // shell-style globbing
xpath#"..."    → XPathExpr
jpath#"..."    → JsonPathExpr    // JSONPath
```

Regex literals are validated and compiled at compile time. Their
public API is [`text/regex`](/docs/stdlib/text).

### Identifiers

```verum
url#"..."      → Url             // RFC 3986
uri#"..."      → Uri             // generic URI (superset of URL)
email#"..."    → EmailAddress    // RFC 5321 local+domain
path#"..."     → Path            // file-system path, platform-aware
mime#"..."     → MimeType        // RFC 6838
uuid#"..."     → Uuid            // RFC 4122 (v1–v8)
urn#"..."      → Urn
```

### Temporal

```verum
d#"2026-04-17"                → Date
d#"2026-04-17T12:00:00Z"      → DateTime
d#"12:00:00"                  → Time
dur#"2h30m"                   → Duration
tz#"Europe/Warsaw"            → TimeZone
```

Aliases: `date#`, `time#`, `datetime#`. The compiler disambiguates
`d#"..."` by inspecting the content — no explicit kind is needed.

### Networking

```verum
ip#"192.168.1.1"              → IpAddress    // v4 or v6
ip#"2001:db8::1"              → IpAddress
cidr#"10.0.0.0/8"             → CidrBlock
mac#"aa:bb:cc:dd:ee:ff"       → MacAddress
host#"api.example.com"        → HostName
```

### Versioning, encoding

```verum
ver#"1.2.3"                   → SemVer        // alias: semver#
b64#"SGVsbG8="                → Bytes         // base64-validated
hex#"deadbeef"                → Bytes
pct#"Hello%20World"           → Text          // percent-encoded → Text
```

### Structured

```verum
mat#"1 2; 3 4"                → Matrix        // row-major matrix
vec#"1, 2, 3"                 → Vector
interval#"[0, 1)"             → Interval
ratio#"3/4"                   → Ratio
tensor#"..."                  → Tensor
```

### Code / script

```verum
sh#"..."                      → ShellCmd
css#"..."                     → CssDoc
lua#"..."                     → LuaScript
asm#"..."                     → AsmBlock
contract#"..."                → Contract      // formal spec
```

### Scientific

```verum
chem#"H2O"                    → ChemFormula
music#"C major"               → MusicExpr
geo#"POINT(-74.006 40.7128)"  → GeoShape      // WKT
```

## Interpolation: `${expr}` inside tagged literals

Tagged literals support expression interpolation with **capture-safe**
substitution. The escape is always `${expr}` — a single `$` is literal.

```verum
let table = "users";
let id    = 42;

let q = sql#"""
    SELECT *
    FROM ${table}
    WHERE id = ${id}
""";
```

The generated SQL is **parameterised** — string concatenation does not
happen. `${table}` is interpreted by the SQL validator as an identifier
position; `${id}` is inferred as a parameter. This is how tagged
literals neutralise injection: the validator, not the programmer,
decides where splices are safe.

For JSON:

```verum
let user = User { id: 42, email: "a@b" };

let payload = json#"""
    {
        "id":    ${user.id},
        "email": ${user.email},
        "admin": false
    }
""";
```

The JSON validator requires `${...}` splices at positions where a JSON
value is expected; splicing raw bytes into a key position is an error:

```verum
// Error: ${user.field_name} at a JSON key position
let bad = json#"{\"${user.field_name}\": 1}";
```

## Single vs. triple quotes

| Form                 | Escapes? | Multi-line? | Doubling rule for `"""` |
|----------------------|----------|-------------|-------------------------|
| `tag#"..."`          | yes      | no          | n/a                     |
| `tag#"""..."""`      | no       | yes         | `""""..."""" `          |

Triple-quoted content is **raw** — no `\n`, no `\t`. The only escape is
the quadruple-quote rule: `"""`-inside-content is written as `""""`.

```verum
let literal = rx#""""bar"""";   // regex that matches the string bar"""
```

Interpolation (`${expr}`) works in both single and triple forms.

## Custom tags

The tag registry is closed for the compiler's validators, but open for
user code. A user-defined macro (`meta fn foo`) whose name matches an
unknown tag intercepts the literal at parse time:

```verum
meta fn kdl(input: tt) -> meta TokenStream {
    // parse KDL at compile time, emit a KdlDoc
}

let doc = kdl#"""
    node "greeting" {
        say "hello"
    }
""";
```

Rules for custom tags:

1. The macro **must** be declared `meta fn` and return a `TokenStream`.
2. The macro name is the tag.
3. The body receives the literal's content as a `tt` (token tree — raw
   UTF-8 bytes wrapped).
4. Validation errors are reported via `@error(...)`; the compilation
   aborts with the macro's diagnostic.

## Tagged literals in the type system

A tagged literal's result type interacts with the full type system:

```verum
// Refined tagged literal:
let even: Int { self % 2 == 0 } = 42;

// A regex with refined length (compile-time):
let short_id: Regex { self.pattern_len() <= 16 } = rx#"[A-Z]{4}";

// Tagged literals as const context:
const ROUTE: Url = url#"https://verum-lang.org/docs";
```

Refinements on the result are checked after validation.

## Interaction with `@verify`

Tagged literals are particularly valuable for SMT-verified code:

```verum
@verify(formal)
fn route(req: Request) -> Response
    where ensures result.status != 400
{
    match req.path {
        p if p.matches(rx#"/api/v1/users/\d+") => user_handler(req),
        _ => Response.not_found(),
    }
}
```

The regex is compiled once at verification time. The SMT engine
reasons about the pattern set, not over arbitrary strings.

## Grammar

From the [grammar reference](/docs/reference/grammar-ebnf):

```ebnf
tagged_literal        = format_tag , '#' , tagged_content ;
tagged_content        = plain_string | raw_multiline ;

tagged_interpolated   = format_tag , '#' , tagged_interpolated_content ;
tagged_interpolated_content
                      = raw_multiline_interpolated
                      | plain_string_interpolated ;

tagged_interpolation  = '${' , expression , '}' ;
```

## See also

- **[Syntax](/docs/language/syntax#tagged-literals)** — the lexical registry.
- **[Metaprogramming](/docs/language/metaprogramming)** — defining custom tags.
- **[`text/regex`](/docs/stdlib/text)** — the `Regex` API.
- **[Security](/docs/guides/security)** — tagged literals as a defence
  against injection.

---
title: Validate input with refinement types
description: Make validation part of the type — not a scattered bundle of if/else.
---

# Validate input with refinement types

Input validation is the typical place where programs accrete
`if some_check(x) { return Error; }` noise. Refinement types capture
the check in the type itself, once.

### The usual problem

```verum
// Scattered, easy to forget
fn register(email: Text, age: Int) -> Result<User, Error> {
    if !email.contains(&"@") { return Result.Err(...); }
    if age < 0 || age > 150  { return Result.Err(...); }
    // ... business logic mixed with validation
    ...
}
```

### Refinement version

```verum
type Email is Text { self.matches(rx#"^[^@\s]+@[^@\s]+\.[^@\s]+$") };
type Age   is Int  { 0 <= self && self <= 150 };

fn register(email: Email, age: Age) -> User { ... }
```

`register` can no longer receive invalid data. But somewhere at the
system boundary you convert raw input into refined values — that's
where validation lives, once.

### The parsing boundary

```verum
fn parse_email(raw: &Text) -> Result<Email, ValidationError> {
    if raw.matches(rx#"^[^@\s]+@[^@\s]+\.[^@\s]+$") {
        Result.Ok(raw.to_string())        // type check promotes to Email
    } else {
        Result.Err(ValidationError.InvalidEmail(raw.to_string()))
    }
}

fn parse_age(raw: &Text) -> Result<Age, ValidationError> {
    let n: Int = raw.parse()
        .map_err(|_| ValidationError.NotANumber(raw.to_string()))?;
    if n < 0 || n > 150 {
        Result.Err(ValidationError.AgeOutOfRange(n))
    } else {
        Result.Ok(n)
    }
}
```

At this point `Email` and `Age` are proven — downstream code trusts
them without re-checking.

### Composing validations — multiple errors at once

```verum
type ValidationError is
    | InvalidEmail(Text)
    | NotANumber(Text)
    | AgeOutOfRange(Int)
    | MissingField(Text);

fn parse_form(raw: &Data) -> Result<Registration, List<ValidationError>> {
    let mut errors = list![];
    let email = match raw.get(&"email").and_then(Data::as_text) {
        Maybe.Some(e) => parse_email(e).map_err(|err| { errors.push(err); }),
        Maybe.None    => { errors.push(ValidationError.MissingField("email".to_string())); Result.Err(()) }
    };
    let age = match raw.get(&"age").and_then(Data::as_text) {
        Maybe.Some(a) => parse_age(a).map_err(|err| { errors.push(err); }),
        Maybe.None    => { errors.push(ValidationError.MissingField("age".to_string())); Result.Err(()) }
    };

    if !errors.is_empty() { return Result.Err(errors); }
    Result.Ok(Registration {
        email: email.unwrap(),
        age:   age.unwrap(),
    })
}
```

### `@derive(Validate)` for records

```verum
@derive(Deserialize, Validate)
type Registration is {
    @validate(email) email: Text,
    @validate(min = 0, max = 150) age: Int,
    @validate(min_length = 1) name: Text,
    @validate(url) homepage: Maybe<Text>,
};
```

Deserialisation + validation happen in one pass when you call
`parse_json::<Registration>(&raw)`.

### Refinements that depend on other fields

```verum
type Event is {
    start: Instant,
    end:   Instant,
} where self.start < self.end;

// The record-level refinement is verified at construction.
```

### When validation is expensive

If `is_valid_checksum(&bytes)` is O(n), don't put it in a refinement
predicate — that forces re-verification at every conversion. Instead:

```verum
type Checksummed is Text;          // just a marker
fn checksum(raw: &Text) -> Result<Checksummed, ChecksumError> {
    if is_valid_checksum(raw.as_bytes()) { Result.Ok(raw.to_string()) }
    else { Result.Err(ChecksumError::Invalid) }
}
```

The type system tracks that we've validated, without re-running the
check.

### See also

- **[Refinement patterns](/docs/cookbook/refinements)** — common
  refinement idioms.
- **[Language → refinement types](/docs/language/refinement-types)** —
  syntax reference.
- **[Verification → refinement reflection](/docs/verification/refinement-reflection)**
  — when a predicate needs `@logic`.

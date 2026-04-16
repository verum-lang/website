---
sidebar_position: 31
title: Destructuring
description: Tuple, array, record, and nested destructuring in `let`, assignment, and parameters.
---

# Destructuring

Verum allows patterns on the left-hand side of `let` bindings,
assignments, compound assignments, and function parameters. This page
is the full grammar and semantic reference; for the pattern forms
themselves, see [Patterns](/docs/language/patterns).

The shared property: any place a binding name is valid, a structural
pattern is valid.

## Destructuring `let`

### Tuples

```verum
let (a, b) = (1, 2);
let (x, y, z) = get_xyz();

// Ignore components:
let (first, _, _, fourth) = four_tuple();

// Single-element tuple requires a trailing comma:
let (a,) = (5,);
```

### Arrays and slices

```verum
let [head, ..tail] = list;                  // head : T, tail : &[T]
let [first, second, ..] = list;             // drop the rest
let [.., last] = list;                      // take only the last
let [a, b, .., y, z] = list;                // prefix and suffix

// Exact size — fails to compile if the length is known and wrong:
let [x, y, z]: [Int; 3] = fixed_three();
```

`..` may appear **once** per pattern. `..tail` binds the remaining
slice; a bare `..` discards.

### Records

```verum
type Point is { x: Float, y: Float, z: Float };

let Point { x, y, z } = origin();            // bind same-named fields
let Point { x, y, .. } = origin();           // grab two, drop z
let Point { x: px, y: py, .. } = origin();   // rename while binding
```

Record destructuring requires the path to the type:

```verum
let Circle { center: Point { x, y, .. }, radius } = disc();
```

### Variants

Variant destructuring combines record and tuple forms:

```verum
type Event is
    | Click(pos: Point)
    | Keypress { code: Int, modifiers: Modifiers }
    | Tick;

let Event.Click(pos) = ev;                   // tuple variant
let Event.Keypress { code, modifiers } = ev; // record variant
let Event.Tick = ev;                         // unit variant
```

## Destructuring assignment

Existing bindings on the left can be **reassigned** with the same
patterns:

```verum
let mut a = 1;
let mut b = 2;

(a, b) = (b, a);                             // parallel swap

let mut xs = [0, 0, 0, 0];
[xs[0], xs[1]] = [42, 43];                   // array-position assignment
```

Record destructuring assignment:

```verum
let mut cfg = Config.default();
Config { timeout, .. } = load_override();    // update timeout field
```

### Compound assignment with destructuring

Compound operators apply component-wise:

```verum
let mut position = (0, 0);
(position.0, position.1) += (1, 2);          // → (1, 2)

let mut scores = [10, 20, 30];
[scores[0], scores[1], scores[2]] *= 2;      // → [20, 40, 60]
```

## `let else`

When a destructuring may fail — a refutable pattern — use `let else`
to force a diverging fallback:

```verum
let Some(user) = registry.find(id) else {
    return Response.not_found();
};

let [first, ..rest] = items else {
    panic("items must be non-empty");
};

// The `else` block must diverge (return, continue, break, panic, etc.)
```

After `let else`, the binding is in scope and of the **narrowed** type:
`user: User` (not `Maybe<User>`).

## If-let chains

Several refutable patterns can chain with `&&` in `if`/`while`:

```verum
if let Some(a) = ra
   && let Some(b) = rb
   && a + b > threshold
{
    process(a, b);
}
```

The bindings accumulate: `a` is in scope when evaluating `b`'s
pattern, and both are in scope in the body. An `else` branch sees
**none** of them.

`while let` works the same way:

```verum
while let Some(line) = reader.next_line()
      && !line.starts_with("# ")
{
    process(line);
}
```

## Destructuring in `for`

Loop variables use the full pattern grammar:

```verum
for (key, value) in map {
    print(f"{key}: {value}");
}

for User { id, email, .. } in users {
    notify(id, email);
}

for (i, item) in items.enumerate() {
    print(f"{i}: {item}");
}
```

## Destructuring in function parameters

A parameter's pattern is any pattern:

```verum
fn manhattan((x, y): (Int, Int)) -> Int {
    x.abs() + y.abs()
}

fn handle(Event.Keypress { code, .. }: &Event) {
    if code == 27 { exit_app(); }
}
```

Patterns on parameters must be **irrefutable** — they must always
match. A refutable pattern (e.g. a variant) in a parameter position
is a compile error. Use `match` inside the body instead when you
need a refutable shape.

## Rest and ignore

| Construct  | In tuples/arrays  | In records        |
|------------|-------------------|-------------------|
| `_`        | ignore one slot   | ignore one field  |
| `..`       | ignore middle     | ignore remaining  |
| `..name`   | bind rest as slice | — (not valid in records) |

```verum
let [_, _, x, ..] = items;             // ignore first two, bind third
let [a, _, b, _, c] = five_slot();     // skip even slots
let Point { x, .. } = pt;              // records use .. to skip
```

## Nested patterns

Patterns nest to arbitrary depth:

```verum
let Shape {
    kind: Kind.Rectangle {
        width,
        height: Height { millimetres, .. },
    },
    position: (x, y),
} = shape;
```

Destructuring, assignment, and `let else` all support nested forms.

## Attributes on patterns

Individual pattern bindings can carry attributes, for optimisation
hints or documentation:

```verum
fn process(@unused x: Int, @must_use result: &mut Out) { ... }

let @cold (fallback, recovery) = disaster_path();
```

## Grammar

```ebnf
destructuring_target = '(' , expression_list , ')'           (* tuple *)
                     | '[' , expression_list , ']'           (* array *)
                     | path , '{' , field_expr_list , '}'    (* record *)
                     | '(' , destructuring_target , ')' ;

destructuring_assign = destructuring_target , assign_op , assignment_expr ;
let_stmt        = 'let' , pattern , [ ':' , type_expr ] , [ '=' , expression ] , ';' ;
let_else_stmt   = 'let' , pattern , '=' , expression , 'else' , block_expr ;
```

## See also

- **[Patterns](/docs/language/patterns)** — pattern grammar and match arms.
- **[Active Patterns](/docs/language/active-patterns)** — user-defined
  pattern matchers.
- **[Syntax](/docs/language/syntax)** — expressions and statements.

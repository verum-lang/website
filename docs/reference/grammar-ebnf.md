---
sidebar_position: 1
title: Grammar (EBNF)
description: Verum's full lexical and syntactic grammar — the authoritative specification.
---

# Grammar — EBNF

This page is the authoritative specification of Verum's concrete
syntax. The full EBNF runs to a little under twenty-five hundred
lines (version **3.0**); every parser, IDE integration, and proof
tool in the project must conform to it.

:::info Status
Version 3.0 — Production-Ready · Formal Specification.
All parsers, IDE tooling, and proof tooling **must** conform to this
grammar.
:::

## Reading conventions

The grammar uses **ISO-style EBNF** with these meta-symbols:

| Notation | Meaning |
|---|---|
| `=` | rule definition |
| `,` | concatenation |
| `\|` | alternation |
| `[...]` | optional (zero or one) |
| `{...}` | repetition (zero or more) |
| `(...)` | grouping |
| `'literal'` or `"literal"` | terminal symbol |
| `..` | character range (e.g., `'a'..'z'`) |
| `(* ... *)` | comment in source |
| `epsilon` | empty production |

Rule names are **`snake_case`**. Terminals are quoted.

## Design principles encoded in the grammar

Every production reflects a deliberate language decision. Six pervade:

1. **Reserved keywords are exactly three** — `let`, `fn`, `is`. Everything
   else is contextual.
2. **Unified type definitions** — `type T is …` covers records, variants,
   protocols, sigma types, aliases, and existentials.
3. **Explicit context system** — `using [...]` is mandatory for effects.
4. **Three-tier references** — `&T`, `&checked T`, `&unsafe T`.
5. **No `!`-suffix macros** — every compile-time construct uses `@`.
6. **`is` operator replaces `matches!()`** — patterns are first-class
   in expressions.

---

## Layer 1 — Lexical Grammar

### 1.1 Whitespace and comments

```ebnf
whitespace      = ' ' | '\t' | '\r' | '\n' ;
line_comment    = '//' , { char_except_newline } , '\n' ;
block_comment   = '/*' , { char_except_star_slash } , '*/' ;
comment         = line_comment | block_comment ;
```

Block comments do **not** nest (intentional — keeps lexer trivial).
Doc comments are surface sugar (`///` → `@doc("…")`).

### 1.2 Identifiers

```ebnf
ident_start     = letter | '_' ;
ident_continue  = letter | digit | '_' ;
identifier      = ident_start , { ident_continue } ;
type_param_name = uppercase_letter , { ident_continue } ;
```

`letter` and `digit` admit Unicode (`unicode_letter`, `unicode_digit`)
in addition to ASCII — Verum source is fully Unicode-clean. Type
parameter names are conventionally upper-camel.

### 1.3 Keywords

#### Reserved (3)

```ebnf
reserved_keyword = 'let' | 'fn' | 'is' ;
```

These are *never* identifiers under any circumstance.

#### Contextual (~60)

Grouped as in the EBNF source:

| Group | Keywords |
|---|---|
| **Primary** | `type`, `where`, `using` |
| **Control flow** | `if`, `else`, `match`, `return`, `for`, `while`, `loop`, `break`, `continue` |
| **Async / concurrency** | `async`, `await`, `spawn`, `defer`, `errdefer`, `try`, `yield`, `throws`, `select`, `nursery` |
| **Modifiers** | `pub`, `mut`, `const`, `unsafe`, `pure` |
| **FFI** | `ffi` |
| **Module system** | `module`, `mount`, `implement`, `context`, `protocol`, `extends` |
| **Misc.** | `self`, `super`, `crate`, `static`, `meta`, `provide`, `finally`, `recover`, `invariant`, `decreases`, `stream`, `tensor`, `affine`, `linear`, `public`, `internal`, `protected`, `ensures`, `requires`, `result`, `some` |
| **Proof DSL** | `theorem`, `lemma`, `axiom`, `corollary`, `proof`, `calc`, `have`, `show`, `suffices`, `obtain`, `by`, `qed`, `induction`, `cases`, `contradiction`, `forall`, `exists` |
| **AST-alignment** | `ref`, `move`, `as`, `in`, `Self`, `private`, `checked`, `view`, `extern`, `cofix`, `dyn`, `biased` |

`default` is not in the grammar's keyword list — it is handled as
a contextual identifier in `impl_item` so that `fn default()` and
`T.default()` continue to parse.

### 1.4 Literals

#### 1.4.1 Numeric

```ebnf
decimal_lit     = dec_digit , { dec_digit | '_' } ;
hexadecimal_lit = '0x' , hex_digit , { hex_digit | '_' } ;
octal_lit       = '0o' , oct_digit , { oct_digit | '_' } ;
binary_lit      = '0b' , bin_digit , { bin_digit | '_' } ;

int_suffix      = 'i8' | 'i16' | 'i32' | 'i64' | 'i128' | 'isize'
                | 'u8' | 'u16' | 'u32' | 'u64' | 'u128' | 'usize' ;
float_suffix    = 'f32' | 'f64' ;

integer_lit     = ( decimal_lit | hexadecimal_lit | octal_lit | binary_lit )
                , [ int_suffix ] ;
float_lit       = decimal_lit , '.' , decimal_lit , [ exponent ] , [ float_suffix ] ;
exponent        = ( 'e' | 'E' ) , [ '+' | '-' ] , decimal_lit ;
```

Underscores allowed anywhere inside the digits (`1_000_000`); no
underscore required before a suffix (`42i32`).

#### 1.4.2 Text

Verum has **two text literal forms** (intentionally minimal):

```ebnf
plain_string    = '"' , { string_char | escape_seq } , '"' ;
raw_multiline   = '"""' , { any_char - '"""' | '""""' } , '"""' ;
string_lit      = plain_string | raw_multiline ;
byte_string_lit = 'b' , '"' , { byte_string_char | byte_escape_seq } , '"' ;
char_lit        = "'" , ( char | escape_seq ) , "'" ;
```

Triple-quote = **always raw, multiline-capable**. To embed `"""`
literally, use four quotes (`"""" ... """"`). The Rust-style `r#"…"#`
is **deliberately removed**.

```ebnf
escape_seq = '\' , ( 'n' | 'r' | 't' | '0' | 'a' | 'b' | 'f' | 'v'
                  | '\' | '"' | "'"
                  | 'x' , hex_digit , hex_digit
                  | 'u' , '{' , hex_sequence , '}' ) ;
```

#### 1.4.3 Format strings (interpolation)

```ebnf
interpolated_string = ( 'f' | 'fmt' ) , '"' , { string_char | interpolation } , '"' ;
interpolation       = '{' , expression , [ ':' , format_spec ] , '}' ;
```

Embedding arbitrary expressions: `f"x = {x}, y = {y + 1:.3}"`.

#### 1.4.4 Tagged literals

```ebnf
tagged_literal      = format_tag , '#' , tagged_content ;
tagged_content      = plain_string | raw_multiline ;

tagged_interpolated = format_tag , '#' , tagged_interpolated_content ;
tagged_interpolation = '${' , expression , '}' ;
```

The format tag enables **compile-time content validation** by category:

| Category | Tags |
|---|---|
| Data interchange | `json`, `json5`, `yaml`, `toml`, `xml`, `html`, `csv` |
| Query languages | `sql`, `gql`, `graphql`, `cypher`, `sparql` |
| Pattern matching | `rx`, `re`, `regex`, `glob`, `xpath`, `jpath` |
| Identifiers | `url`, `uri`, `email`, `path`, `mime`, `uuid`, `urn` |
| Temporal | `d`, `dur`, `tz`, `date`, `time`, `datetime` |
| Networking | `ip`, `cidr`, `mac`, `host` |
| Versioning / encoding | `ver`, `semver`, `b64`, `hex`, `pct` |
| Structured | `mat`, `vec`, `interval`, `ratio`, `tensor` |
| Code / DSL | `sh`, `css`, `lua`, `asm`, `contract` |
| Scientific | `chem`, `music`, `geo` |
| Custom | any `identifier` |

`json#"…"`, `sql#"""…"""`, `rx#"…"`, `url#"…"` — the parser dispatches
to the tag's validator and constructs the corresponding semantic type
(`JsonValue`, `SqlQuery`, `Regex`, `Url`, …) at compile time. Invalid
content is a **compile error**, not a runtime exception.

#### 1.4.5 Composite & context-adaptive literals

```ebnf
composite_literal = identifier , '#' , composite_body ;
composite_body    = composite_string | composite_paren | composite_bracket | composite_brace ;
                    (* identifier#"…" | #( … ) | #[ … ] | #{ … } *)

context_adaptive_lit = bare_token ;
bare_token       = identifier | hex_color_literal | at_literal | dollar_literal ;
hex_color_literal = '#' , hex_digit{6} , [ hex_digit{2} ] ;   (* #RRGGBB or #RRGGBBAA *)
at_literal       = '@' , identifier ;                          (* @tag *)
dollar_literal   = '$' , identifier ;                          (* $name *)
```

#### 1.4.6 Boolean

```ebnf
bool_lit = 'true' | 'false' ;
```

### 1.5 Operators

```ebnf
arith_op       = '+' | '-' | '*' | '/' | '%' | '**' ;
compare_op     = '==' | '!=' | '<' | '>' | '<=' | '>=' ;
logical_op     = '&&' | '||' | '!' ;
bitwise_op     = '&' | '|' | '^' | '<<' | '>>' | '~' ;
assign_op      = '=' | '+=' | '-=' | '*=' | '/=' | '%='
               | '&=' | '|=' | '^=' | '<<=' | '>>=' ;
range_op       = '..' | '..=' ;
pipe_op        = '|>' ;
arrow_op       = '->' | '=>' ;
optional_chain = '?.' ;
null_coalesce  = '??' ;
```

For full precedence, see [Operators](/docs/reference/operators).

### 1.6 Punctuation

```ebnf
punctuation = '(' | ')' | '[' | ']' | '{' | '}'
            | '<' | '>' | ',' | ';' | ':' | '.' | '@'
            | '?' | '&' | '|' | '%' | '!' | '#' | '_' ;
```

---

## Layer 2 — Syntactic Grammar

### 2.1 Programs and items

```ebnf
program      = { program_item } ;
program_item = item | statement ;

item = function_def
     | type_def
     | impl_block
     | extern_block
     | context_def
     | context_protocol_def
     | context_type_protocol_def
     | context_group_def
     | const_def
     | static_def
     | mount_stmt
     | module_def
     | meta_def
     | pattern_def
     | ffi_declaration
     | attribute_item ;
```

### 2.2 Visibility and attributes

```ebnf
visibility = 'public' | 'internal' | 'protected' | epsilon ;

attribute_item = '@' , attribute , item ;
attribute      = std_attribute
               | specialize_attribute
               | derive_attribute
               | verify_attribute
               | identifier , [ '(' , attribute_args , ')' ] ;

std_attribute        = 'std' , [ '(' , identifier , ')' ] ;
specialize_attribute = 'specialize' ;
derive_attribute     = 'derive' , '(' , identifier , { ',' , identifier } , ')' ;

verify_attribute = 'verify' , '(' ,
    ( 'runtime' | 'static' | 'formal' | 'proof'
    | 'fast' | 'thorough' | 'reliable'
    | 'certified' | 'synthesize' ) , ')' ;
```

`@verify` selects a **semantic strategy** rather than a particular
solver — the compiler chooses the SMT backend / portfolio per the router.
See [SMT routing](/docs/verification/smt-routing).

### 2.3 Modules and imports

```ebnf
mount_stmt   = 'mount' , mount_tree , [ 'as' , identifier ] , ';' ;
mount_tree   = mount_item , [ 'as' , identifier ]
             | path , '.' , '{' , mount_list , '}'
             | path , '.' , '*' ;
mount_list   = mount_tree , { ',' , mount_tree } ;

module_def   = visibility , 'module' , module_path , module_body ;
module_path  = identifier , { '.' , identifier } ;
module_body  = '{' , { program_item } , '}' | ';' ;

path         = [ '.' ] , path_segment , { '.' , path_segment } ;
path_segment = identifier | 'self' | 'super' | 'crate' ;
```

### 2.4 Type definitions — unified `is` syntax

```ebnf
type_def = visibility , 'type' , [ 'affine' ] , identifier , [ generics ]
         , [ meta_where_clause ]
         , 'is' , type_definition_body ;

type_definition_body =
      type_expr , [ type_refinement ] , ';'      (* alias / refinement *)
    | sigma_bindings , ';'                       (* dependent pair *)
    | '(' , type_list , ')' , ';'                (* newtype / tuple *)
    | '{' , field_list , '}' , [ type_refinement ] , ';'  (* record *)
    | variant_list , ';'                         (* sum type *)
    | protocol_def , ';' ;                       (* protocol *)
```

#### Records

```ebnf
field_list = [ field , { ',' , field } , [ ',' ] ] ;
field      = { attribute } , [ visibility ] , identifier , ':' , type_expr , [ field_default ] ;
field_default = '=' , expression ;
```

#### Variants (sum types)

```ebnf
variant_list   = [ '|' ] , variant , { '|' , variant } ;
variant        = { attribute } , identifier , [ variant_data ] , [ path_endpoints ] ;
variant_data   = '{' , field_list , '}' | '(' , type_list , ')' ;
path_endpoints = '=' , expression , '..' , expression ;   (* HIT path constructor *)
```

A variant ending in `= a..b` is a **higher-inductive type** path
constructor (cubical HoTT):

```verum
type S1 is Base | Loop() = Base..Base;
type Interval is Zero | One | Seg() = Zero..One;
```

#### Sigma (dependent pair) types

```ebnf
sigma_bindings = sigma_binding , { ',' , sigma_binding } ;
sigma_binding  = identifier , ':' , type_expr , [ 'where' , expression ] ;
```

```verum
type SizedVec is n: Int, data: [Int; n];
type Matrix   is rows: Int, cols: Int, data: [[Float; cols]; rows];
```

#### Protocols

```ebnf
protocol_def       = 'protocol' , protocol_body ;
protocol_body      = [ protocol_extension ] , [ generic_where_clause ] , '{' , protocol_items , '}' ;
protocol_extension = 'extends' , trait_path , { '+' , trait_path } ;
```

#### Refinements

```ebnf
type_refinement = inline_refinement | value_where_clause ;
inline_refinement = '{' , refinement_predicates , '}' ;
refinement_predicates = refinement_predicate , { ',' , refinement_predicate } ;
value_where_clause = 'where' , [ 'value' ] , refinement_expr ;
```

```verum
type Probability is Float { 0.0 <= self && self <= 1.0 };
type SortedList<T: Ord> is List<T> where self.is_sorted();
```

### 2.5 Functions

```ebnf
function_def = visibility , function_modifiers , fn_keyword , identifier
             , [ generics ] , '(' , param_list , ')'
             , [ throws_clause ]
             , [ '->' , type_expr , [ ensures_clause ] ]
             , [ context_clause ]
             , [ generic_where_clause ]
             , [ meta_where_clause ]
             , function_body ;

fn_keyword          = 'fn' , [ '*' ] ;             (* fn* = generator *)
function_modifiers  = [ 'pure' ] , [ meta_modifier ] , [ 'async' ] , [ 'cofix' ] , [ 'unsafe' ] | epsilon ;
meta_modifier       = 'meta' , [ '(' , stage_level , ')' ] ;
stage_level         = integer_lit ;

throws_clause       = 'throws' , '(' , error_type_list , ')' ;
error_type_list     = type_expr , { '|' , type_expr } ;

ensures_clause      = 'where' , ensures_item , { ',' , ensures_item } ;
ensures_item        = 'ensures' , expression ;

function_body       = copattern_body | block_expr | '=' , expression , ';' | ';' ;
copattern_body      = '{' , copattern_arm , { ',' , copattern_arm } , [ ',' ] , '}' ;
copattern_arm       = '.' , identifier , '=>' , expression ;
```

**Modifier order** is fixed and enforced by the grammar: `pure → meta(N) → async → cofix → unsafe`.

| Modifier | Effect |
|---|---|
| `pure` | compiler-verified no side effects |
| `meta`, `meta(N)` | compile-time execution; staged at level N |
| `async` | returns `Future<T>` |
| `cofix` | coinductive fixpoint; body must be `copattern_body` |
| `unsafe` | bypasses safety guarantees |

#### Parameters

```ebnf
param_list      = [ param , { ',' , param } , [ ',' ] ] ;
param           = param_pattern | self_param ;
param_pattern   = { attribute } , pattern , ':' , type_expr ;
self_param      = { attribute } , [ ref_modifier ] , 'self' ;
ref_modifier    = '&' , [ ref_kind ] , [ 'mut' ] ;
ref_kind        = 'checked' | 'unsafe' | epsilon ;
```

### 2.6 Generics

```ebnf
generics       = '<' , generic_params , '>' ;
generic_params = generic_param , { ',' , generic_param } ;
generic_param  = extended_generic_param ;

extended_generic_param =
      kind_annotated_param
    | extended_type_param
    | hk_type_param
    | meta_param
    | context_param
    | universe_param
    | level_param ;

extended_type_param  = identifier , [ hk_params ] , [ ':' , bounds ] ;
hk_params            = '<' , '_' , { ',' , '_' } , '>' ;       (* placeholder HKT *)

kind_annotated_param = identifier , ':' , kind_expr , [ '+' , bounds ] ;
kind_expr            = 'Type' , [ '->' , kind_expr ]
                     | '(' , kind_expr , ')' ;

context_param        = 'using' , identifier ;                  (* context polymorphism *)
universe_param       = 'universe' , identifier ;
level_param          = identifier , ':' , 'Level' ;
meta_param           = identifier , ':' , 'meta' , type_expr , [ refinement ] ;

bounds         = bound , { '+' , bound } ;
bound          = protocol_bound | associated_type_bound | negative_bound ;
negative_bound = '!' , protocol_path ;
```

#### Type-level features

```ebnf
type_function_def      = 'type' , identifier , '<' , type_function_params , '>' , '=' , type_expr , ';' ;
constrained_type_alias = 'type' , identifier , '<' , constrained_params , '>'
                       , '=' , type_expr , [ type_alias_where ] , ';' ;

existential_type       = 'some' , identifier , ':' , existential_bounds ;
existential_bounds     = existential_bound , { '+' , existential_bound } ;

(* 2.4.7: type-level literals and meta-arithmetic in type position *)
type_level_literal     = integer_lit | bool_lit | char_lit ;
extended_type_arg      = type_expr | expression | type_level_literal | meta_type_expr ;
```

### 2.7 Types

```ebnf
type_expr  = simple_type , [ type_refinement ] ;

simple_type = primitive_type
            | never_type             (* ! *)
            | unknown_type           (* unknown *)
            | path_type_expr         (* Path<A>(a, b) — cubical *)
            | path_type
            | tuple_type
            | record_type
            | array_type             (* [T; N] *)
            | slice_type             (* [T] *)
            | managed_reference_type (* &T, &mut T *)
            | checked_reference_type (* &checked T *)
            | unsafe_reference_type  (* &unsafe T *)
            | pointer_type           (* *const, *mut, *volatile *)
            | function_type
            | rank2_function_type
            | generic_type
            | genref_type            (* GenRef<T> *)
            | higher_kinded_type     (* F<_> *)
            | existential_type       (* some T: P *)
            | inferred_type          (* _ *)
            | dynamic_type           (* dyn P + Q *)
            | capability_type ;      (* T with [...] *)

primitive_type = 'Int' | 'Float' | 'Bool' | 'Char' | 'Text' | '()' | 'Interval' ;
never_type     = '!' ;
unknown_type   = 'unknown' ;
```

#### References (three tiers)

```ebnf
managed_reference_type  = '&' , [ 'mut' ] , type_expr ;            (* CBGR-checked *)
checked_reference_type  = '&' , 'checked' , [ 'mut' ] , type_expr ; (* zero-cost, proven *)
unsafe_reference_type   = '&' , 'unsafe' , [ 'mut' ] , type_expr ;  (* zero-cost, asserted *)

pointer_type = '*' , ( 'const' | 'mut' | 'volatile' , [ 'mut' ] ) , type_expr ;
```

#### Function types

```ebnf
function_type       = [ 'async' ] , 'fn' , '(' , type_list , ')' ,
                      [ '->' , type_expr ] , [ context_clause ] ;

(* Rank-2: function type quantifies its own type parameters *)
rank2_function_type = [ 'async' ] , 'fn' , generics , '(' , type_list , ')' ,
                      [ '->' , type_expr ] , [ context_clause ] , [ generic_where_clause ] ;
```

#### Cubical / dependent

```ebnf
path_type_expr     = 'Path' , type_args , '(' , expression , ',' , expression , ')' ;
interval_endpoint  = 'i0' | 'i1' ;
genref_type        = 'GenRef' , '<' , type_expr , '>' ;
higher_kinded_type = path , '<' , '_' , '>' ;
```

#### Capability-restricted types

```ebnf
capability_type = path_type , 'with' , capability_list ;
capability_list = '[' , capability_item , { ',' , capability_item } , ']' ;
capability_item = capability_name | capability_or_expr ;
capability_name = 'Read' | 'Write' | 'ReadWrite' | 'Admin' | 'Transaction'
                | 'Network' | 'FileSystem' | 'Query' | 'Execute'
                | 'Logging' | 'Metrics' | 'Config' | 'Cache' | 'Auth'
                | identifier ;
```

```verum
type Database.ReadOnly is Database with [Read];
fn analyse(db: Database with [Read]) -> Stats { ... }
```

Subtyping rule: `T with [A, B, C] <: T with [A, B]` when capabilities
are a superset.

### 2.8 Protocols and implementations

```ebnf
protocol_item     = protocol_function | protocol_type | protocol_const ;

protocol_function = visibility , function_modifiers , 'fn' , identifier , [ generics ]
                  , '(' , param_list , ')' , [ '->' , return_type_with_refinement ]
                  , [ context_clause ] , [ where_clause ] , [ default_impl ] ;

protocol_type     = 'type' , identifier , [ type_params ] , [ ':' , type_bounds ]
                  , [ where_clause ] , [ default_type ] , ';' ;

protocol_const    = 'const' , identifier , ':' , type_expr , ';' ;

(* Implementation block — supports specialization & default items *)
impl_block        = [ attribute ] , [ 'unsafe' ] , 'implement' , [ generics ] , impl_type
                  , [ where_clause ] , '{' , { impl_item } , '}' ;

impl_type         = type_expr , 'for' , type_expr     (* implement P for T *)
                  | type_expr ;                       (* implement T (inherent impl) *)

impl_item         = visibility , [ 'default' ] , ( function_def | type_alias | const_def ) ;
```

### 2.9 Contexts

#### Context definitions

```ebnf
context_def      = visibility , ( 'context' , [ 'async' ] | 'async' , 'context' )
                 , identifier , [ generics ] , '{' , { context_item } , '}' ;

context_item     = context_function | context_type | context_const ;
context_function = visibility , [ 'async' ] , 'fn' , identifier , [ generics ]
                 , '(' , param_list , ')' , [ '->' , type_expr ]
                 , [ context_clause ] , ';' ;
```

#### Dual-kind context protocols

```ebnf
(* Primary form *)
context_protocol_def      = visibility , 'context' , 'protocol' , identifier
                          , [ generics ] , protocol_body ;

(* Alternative (full symmetry with type defs) *)
context_type_protocol_def = visibility , 'context' , 'type' , identifier
                          , [ generics ] , [ meta_where_clause ]
                          , 'is' , 'protocol' , protocol_body , ';' ;
```

A context protocol can be used **both** as a type bound (`T: Logger`,
0 ns) and as an injectable context (`using [Logger]`, 5–30 ns).

#### Context clauses (the `using [...]` system — 5 forms)

```ebnf
context_clause      = 'using' , context_spec ;
context_spec        = single_context_spec | extended_context_list ;
single_context_spec = [ '!' ] , context_path , [ context_alias ] , [ context_condition ] ;

extended_context_list = '[' , extended_context_item , { ',' , extended_context_item } , ']' ;
extended_context_item = negative_context
                      | conditional_context
                      | transformed_context
                      | named_context
                      | simple_context ;

negative_context     = '!' , context_path ;                                 (* using [!IO] *)
conditional_context  = context_path , [ context_alias ] , 'if' , compile_time_condition ;
transformed_context  = context_path , context_transform , { context_transform } , [ context_alias ] ;
named_context        = identifier , ':' , context_path
                     | context_path , 'as' , identifier ;
simple_context       = context_path , [ context_alias ] ;

context_transform    = '.' , identifier , [ '(' , [ transform_args ] , ')' ] ;
context_alias        = 'as' , identifier ;
context_condition    = 'if' , compile_time_condition ;

compile_time_condition = config_condition       (* cfg.foo *)
                       | const_condition
                       | type_constraint_condition
                       | platform_condition
                       | boolean_condition ;
```

```verum
fn handler(req: Request) -> Response
    using [
        Database.transactional(),               // transformed
        Logger as primary,                      // aliased
        Analytics if cfg.analytics_enabled,     // conditional
        !Random,                                // negative — forbid Random
    ]
{ ... }
```

#### Context groups & provide

```ebnf
context_group_def = 'using' , identifier , '=' , context_list_def , ';' ;

provide_stmt      = 'provide' , context_path , [ 'as' , identifier ] , '='
                  , expression , ( ';' | 'in' , block_expr ) ;
```

```verum
using Pure = [!IO, !State<_>, !Random];
provide Database = db in { fetch_user(id) };
```

### 2.10 FFI

```ebnf
ffi_declaration = visibility , 'ffi' , identifier , [ 'extends' , identifier ]
                , '{' , ffi_items , '}' ;

ffi_item = ffi_function_decl
         | ffi_requires_clause
         | ffi_ensures_clause
         | ffi_memory_effects
         | ffi_thread_safety
         | ffi_error_protocol
         | ffi_ownership_spec ;

ffi_function_decl = '@extern' , '(' , string_lit , [ ',' , calling_convention_attr ] , ')' ,
                    'fn' , identifier , [ generics ] , '(' , param_list , ')' ,
                    [ '->' , type_expr ] , ';' ;

extern_block      = 'extern' , [ string_lit ] , '{' , { extern_fn_decl } , '}' ;

(* Boundary contracts *)
ffi_memory_effects = 'memory_effects' , '=' , memory_effect_spec , ';' ;
memory_effect_spec = 'Pure'
                   | 'Reads' , '(' , path , ')'
                   | 'Writes' , '(' , path , ')'
                   | 'Allocates'
                   | 'Deallocates' , '(' , path , ')'
                   | memory_effect_spec , '+' , memory_effect_spec ;

ffi_error_protocol = 'errors_via' , '=' , error_mechanism , ';' ;
error_mechanism    = 'None'
                   | 'Errno'
                   | 'ReturnCode' , '(' , pattern , ')'
                   | 'ReturnValue' , '(' , expression , ')' , [ 'with' , 'Errno' ]
                   | 'Exception' ;

ffi_ownership_spec = '@ownership' , '(' , ownership_mode , ')' ;
ownership_mode     = 'transfer_to' , '=' , string_lit
                   | 'transfer_from' , '=' , string_lit
                   | 'borrow'
                   | 'shared' ;
```

Every FFI boundary carries a **typed contract** — preconditions,
postconditions, memory-effect annotations, thread-safety, error
protocol, ownership transfer. See [FFI](/docs/language/ffi).

### 2.11 Expressions

The precedence ladder, top to bottom (loosest → tightest binding):

```ebnf
expression          = pipeline_expr ;

pipeline_expr       = assignment_expr , { '|>' , ( pipe_method_call | assignment_expr ) } ;
assignment_expr     = destructuring_assign | simple_assign ;

simple_assign       = null_coalesce_expr , [ assign_op , assignment_expr ] ;
null_coalesce_expr  = range_expr , { '??' , range_expr } ;
range_expr          = logical_or_expr , [ range_op , logical_or_expr ] ;
logical_or_expr     = logical_and_expr , { '||' , logical_and_expr } ;
logical_and_expr    = equality_expr , { '&&' , equality_expr } ;
equality_expr       = is_relational_expr , { ( '==' | '!=' ) , is_relational_expr } ;
is_relational_expr  = relational_expr , [ 'is' , [ 'not' ] , pattern ] ;
relational_expr     = bitwise_expr , { ( '<' | '>' | '<=' | '>=' ) , bitwise_expr } ;
bitwise_expr        = shift_expr , { ( '&' | '|' | '^' ) , shift_expr } ;
shift_expr          = additive_expr , { ( '<<' | '>>' ) , additive_expr } ;
additive_expr       = mult_expr , { ( '+' | '-' ) , mult_expr } ;
mult_expr           = power_expr , { ( '*' | '/' | '%' ) , power_expr } ;
power_expr          = unary_expr , [ '**' , power_expr ] ;       (* right-assoc *)

unary_expr          = unary_op , unary_expr | postfix_expr ;
unary_op            = '!' | '-' | '~'
                    | '&' | '&' , 'mut'
                    | '&' , 'checked' | '&' , 'checked' , 'mut'
                    | '&' , 'unsafe'  | '&' , 'unsafe'  , 'mut'
                    | '*' ;

postfix_expr        = primary_expr , { postfix_op } ;
postfix_op          = '.' , identifier , [ type_args ] , [ call_args ]
                    | '?.' , identifier , [ type_args ] , [ call_args ]
                    | '.' , integer_lit          (* tuple index *)
                    | '.' , 'await'
                    | '[' , expression , ']'
                    | [ type_args ] , call_args
                    | '?'                        (* propagation *)
                    | 'as' , type_expr ;
```

:::warning No chained comparisons
`a < b < c` parses as `(a < b) < c` (left-assoc) — a type error.
Use `a < b && b < c`. The grammar deliberately rejects Python-style
chains for predictability.
:::

#### Destructuring assignment

```ebnf
destructuring_assign = destructuring_target , assign_op , assignment_expr ;
destructuring_target = '(' , expression_list , ')'                   (* (a, b) = (b, a) *)
                     | '[' , expression_list , ']'                   (* [h, ..t] = list *)
                     | path , '{' , field_expr_list , '}'            (* Point { x, y } = pt *)
                     | '(' , destructuring_target , ')' ;
```

#### Primary expressions

```ebnf
primary_expr = literal_expr
             | path_expr
             | '(' , ')'                          (* unit *)
             | '(' , expression , ')'             (* parens *)
             | tuple_expr
             | array_expr
             | tensor_literal_expr
             | map_expr | set_expr
             | comprehension_expr | map_comprehension | set_comprehension | generator_expr
             | stream_expr
             | record_expr
             | block_expr
             | if_expr | match_expr | loop_expr
             | try_expr
             | closure_expr
             | meta_expr | meta_call | meta_function | quote_expr
             | async_expr | unsafe_expr
             | return_expr | throw_expr
             | break_expr | continue_expr
             | spawn_expr | yield_expr
             | select_expr | nursery_expr
             | forall_expr | exists_expr
             | typeof_expr ;
```

#### Control flow

```ebnf
if_expr        = 'if' , if_condition , block_expr
               , [ 'else' , ( if_expr | block_expr ) ] ;

(* if-let chains (RFC 2497 semantics) *)
if_condition   = let_condition , { '&&' , let_condition } ;
let_condition  = 'let' , pattern , '=' , expression | expression ;

match_expr     = [ expression , '.' ] , 'match' , [ expression ] , '{' , match_arms , '}' ;
match_arm      = { attribute } , pattern , [ guard ] , '=>' , expression ;
guard          = 'if' , expression | 'where' , expression ;

loop_expr      = infinite_loop | while_loop | for_loop | for_await_loop ;
while_loop     = 'while' , expression , { loop_annotation } , block_expr ;
for_loop       = 'for' , pattern , 'in' , expression , { loop_annotation } , block_expr ;
for_await_loop = 'for' , 'await' , pattern , 'in' , expression
               , { loop_annotation } , block_expr ;

loop_annotation = 'invariant' , expression | 'decreases' , expression ;
```

#### Closures

```ebnf
closure_expr   = [ 'async' ] , closure_params , [ '->' , type_expr ] , expression ;
closure_params = '|' , [ param_list_lambda ] , '|' ;
```

#### Async / structured concurrency

```ebnf
async_expr      = 'async' , block_expr ;
spawn_expr      = 'spawn' , [ 'using' , '[' , identifier_list , ']' ] , expression ;
yield_expr      = 'yield' , expression ;

select_expr     = 'select' , [ 'biased' ] , '{' , select_arms , '}' ;
select_arm      = { attribute } , pattern , '=' , await_expr , [ select_guard ] , '=>' , expression ;
await_expr      = expression , '.' , 'await' ;
select_else     = 'else' , '=>' , expression , [ ',' ] ;

nursery_expr    = 'nursery' , [ nursery_options ] , block_expr , [ nursery_handlers ] ;
nursery_options = '(' , nursery_option , { ',' , nursery_option } , ')' ;
nursery_option  = 'timeout' , ':' , expression
                | 'on_error' , ':' , ( 'cancel_all' | 'wait_all' | 'fail_fast' )
                | 'max_tasks' , ':' , expression ;
nursery_cancel  = 'on_cancel' , block_expr ;
nursery_recover = 'recover' , recover_body ;
```

#### Try / recover / finally

```ebnf
try_expr        = 'try' , block_expr , [ try_handlers ] ;
try_handlers    = try_recovery , [ try_finally ] | try_finally ;
try_recovery    = 'recover' , recover_body ;
recover_body    = '{' , match_arms , '}'                  (* match-arm form *)
                | closure_params , recover_closure_body ; (* closure form *)
try_finally     = 'finally' , block_expr ;
```

#### Stream literals & comprehensions

```ebnf
stream_expr     = stream_comprehension_expr | stream_literal_expr ;

comprehension_expr = '[' , expression , 'for' , pattern , 'in' , expression
                   , { comprehension_clause } , ']' ;
map_comprehension  = '{' , expression , ':' , expression , 'for' , pattern , 'in' , expression
                   , { comprehension_clause } , '}' ;
set_comprehension  = 'set' , '{' , expression , 'for' , pattern , 'in' , expression
                   , { comprehension_clause } , '}' ;
generator_expr     = 'gen'  , '{' , expression , 'for' , pattern , 'in' , expression
                   , { comprehension_clause } , '}' ;

comprehension_clause = 'for' , pattern , 'in' , expression
                     | 'let' , pattern , [ ':' , type_expr ] , '=' , expression
                     | 'if' , expression ;

stream_literal_expr  = 'stream' , '[' , stream_literal_body , ']' ;
stream_literal_body  = stream_range_body | stream_elements_body ;
```

#### Quote / staged metaprogramming

```ebnf
quote_expr        = 'quote' , [ '(' , stage_level , ')' ] , '{' , token_tree , '}' ;
quote_interpolation = splice_operator , ( identifier | '{' , expression , '}' ) ;
splice_operator     = '$' , { '$' } ;       (* one $ per stage level escaped *)
quote_repetition    = splice_operator , '[' , 'for' , pattern , 'in' , expression , '{' , token_tree , '}' , ']' ;
quote_stage_escape  = '$' , '(' , 'stage' , stage_level , ')' , '{' , expression , '}' ;
quote_lift          = 'lift' , '(' , expression , ')' ;
```

`$var` splices into the immediate enclosing quote (stage N−1);
`$$var` into the parent (N−2); `$$$var` into N−3; and so on.

#### Quantifiers (specifications & proofs)

```ebnf
forall_expr = 'forall' , quantifier_binding , { ',' , quantifier_binding } , '.' , expression ;
exists_expr = 'exists' , quantifier_binding , { ',' , quantifier_binding } , '.' , expression ;

quantifier_binding =
    pattern , [ ':' , type_expr ] , [ 'in' , expression ] , [ 'where' , expression ] ;
```

Three forms supported: type-based, collection-based, combined.

#### `typeof` and pattern test

```ebnf
typeof_expr        = 'typeof' , '(' , expression , ')' ;     (* runtime type info *)
is_relational_expr = relational_expr , [ 'is' , [ 'not' ] , pattern ] ;
```

### 2.12 Patterns

```ebnf
pattern         = or_pattern ;
or_pattern      = guarded_pattern , { '|' , guarded_pattern } ;
guarded_pattern = and_pattern , [ guard ] ;
and_pattern     = primary_pattern , { '&' , primary_pattern } ;
primary_pattern = simple_pattern | active_pattern ;

simple_pattern  = literal_pattern
                | type_test_pattern
                | identifier_pattern
                | wildcard_pattern
                | rest_pattern
                | tuple_pattern
                | array_pattern
                | slice_pattern
                | stream_pattern
                | record_pattern
                | variant_pattern
                | reference_pattern
                | range_pattern ;

type_test_pattern  = identifier , 'is' , type_expr ;
identifier_pattern = [ 'ref' ] , [ 'mut' ] , identifier , [ '@' , pattern ] ;
wildcard_pattern   = '_' ;
rest_pattern       = '..' ;
slice_pattern      = '[' , slice_pattern_elements , ']' ;
slice_pattern_elements = [ pattern , { ',' , pattern } , ',' ] , '..'
                       , [ ',' , pattern , { ',' , pattern } ] ;
stream_pattern     = 'stream' , '[' , stream_pattern_elements , ']' ;
record_pattern     = path , '{' , field_patterns , '}' ;
variant_pattern    = path , [ variant_pattern_data ] ;
variant_pattern_data = '(' , pattern_list , ')' | '{' , field_patterns , '}' ;
reference_pattern  = '&' , [ 'mut' ] , pattern ;
range_pattern      = literal_expr , range_op , [ literal_expr ]
                   | range_op , literal_expr ;
```

#### Active patterns (F#-style)

```ebnf
active_pattern        = identifier , active_pattern_tail ;
active_pattern_tail   = '(' , ')'                                   (* total, no params *)
                      | '(' , ')' , '(' , pattern_list_nonempty , ')'  (* partial, no params *)
                      | '(' , expression_list , ')' , '(' , [ pattern_list ] , ')' ; (* with params *)

pattern_def           = visibility , 'pattern' , identifier , [ pattern_type_params ]
                      , '(' , pattern_params , ')' , '->' , type_expr , '=' , expression , ';' ;
```

Total patterns return `Bool`; partial patterns return `Maybe<T>` for
extraction.

### 2.13 Statements

```ebnf
statement       = let_stmt
                | let_else_stmt
                | provide_stmt
                | item
                | defer_stmt
                | expression_stmt ;

let_stmt        = 'let' , pattern , [ ':' , type_expr ] , [ '=' , expression ] , ';' ;
let_else_stmt   = 'let' , pattern , '=' , expression , 'else' , block_expr ;
defer_stmt      = 'defer' , defer_body | 'errdefer' , defer_body ;
defer_body      = expression , ';' | block_expr ;
expression_stmt = expression , [ ';' ] ;
```

### 2.14 Constants and statics

```ebnf
const_def  = visibility , 'const'  , identifier , ':' , type_expr , '=' , const_expr , ';' ;
static_def = visibility , 'static' , [ 'mut' ] , identifier , ':' , type_expr , '=' , const_expr , ';' ;
```

### 2.15 Metaprogramming

```ebnf
meta_def        = visibility , 'meta' , identifier , meta_args , '{' , meta_rules , '}' ;
meta_args       = '(' , [ meta_params_meta ] , ')' ;
meta_param_def  = identifier , [ ':' , meta_fragment ] ;
meta_fragment   = 'expr' | 'stmt' | 'type' | 'pattern' | 'ident'
                | 'path' | 'tt' | 'item' | 'block' ;

meta_rules      = meta_rule , { '|' , meta_rule } ;
meta_rule       = pattern , '=>' , expression ;

(* Macro invocation — @ prefix only *)
meta_call       = '@' , path , meta_call_args ;
meta_call_args  = '(' , [ argument_list ] , ')'
                | '[' , token_tree , ']'
                | '{' , token_tree , '}' ;

(* Built-in compile-time functions *)
meta_function      = '@' , meta_function_name , [ '(' , [ argument_list ] , ')' ] ;
meta_function_name = 'const' | 'error' | 'warning' | 'stringify' | 'concat' | 'cfg'
                   | 'file' | 'line' | 'column' | 'module' | 'function'
                   | 'type_name' | 'type_fields' | 'field_access'
                   | 'type_of' | 'fields_of' | 'variants_of'
                   | 'is_struct' | 'is_enum' | 'is_tuple' | 'implements' ;
```

`@`-prefix parsing priority (resolved by the parser):
1. `@name item …` → **attribute_item**
2. `@name(args)` / `@name[…]` / `@name{…}` → **meta_call**
3. `@builtin` (where `builtin ∈ {const, cfg, file, …}`) → **meta_function**
4. bare `@name` → **at_literal**

### 2.16 Type properties (compile-time introspection)

```ebnf
type_property_expr = type_expr , '.' , type_property_name ;
type_property_name = 'size' | 'alignment' | 'stride'
                   | 'min'  | 'max'       | 'bits'
                   | 'name' | 'id' ;
```

```verum
const PTR_SIZE: Int = (&Int).size;            // 16 (ThinRef)
const FLOAT_ALIGN: Int = Float.alignment;     // 8
```

Replaces deprecated intrinsic functions (`size_of<T>()`, etc.).

### 2.17 Built-in functions (no `!` suffix)

```ebnf
builtin_call         = builtin_name , '(' , [ argument_list ] , ')' ;
builtin_io           = 'print' | 'eprint' ;
builtin_assertion    = 'assert' | 'assert_eq' | 'assert_ne' | 'debug_assert' ;
builtin_control_flow = 'panic' | 'unreachable' | 'unimplemented' | 'todo' ;
builtin_async        = 'join' | 'try_join' | 'join_all' | 'select_any' | 'ready' | 'pin' ;
builtin_name         = builtin_io | builtin_assertion | builtin_control_flow | builtin_async ;
```

These are **functions**, not macros. `print(f"x = {x}")` — never `print!()`.

### 2.18 Formal proofs and verification (Section 2.19 in the EBNF)

```ebnf
theorem_decl   = 'theorem'   , identifier , [ generic_params ] , '(' , [ param_list ] , ')'
               , [ '->' , type_expr ] , [ requires_clause ] , [ ensures_clause ] , proof_body ;
lemma_decl     = 'lemma'     , identifier , [ generic_params ] , '(' , [ param_list ] , ')'
               , [ '->' , type_expr ] , [ requires_clause ] , [ ensures_clause ] , proof_body ;
axiom_decl     = 'axiom'     , identifier , [ generic_params ] , '(' , [ param_list ] , ')'
               , [ '->' , type_expr ]
               , [ requires_clause ]
               , [ ensures_clause ]
               , [ where_clause ]
               , ';' ;
ensures_clause = 'ensures' , expression , { ',' , expression } ;
corollary_decl = 'corollary' , identifier , [ generic_params ] , '(' , [ param_list ] , ')'
               , [ '->' , type_expr ] , [ requires_clause ] , 'from' , identifier , proof_body ;
tactic_decl    = 'tactic'    , identifier , [ generic_params ]
               , '(' , [ tactic_param_list ] , ')'
               , [ where_clause ] , tactic_body ;

tactic_param_list = tactic_param , { ',' , tactic_param } ;
tactic_param      = identifier , ':' , tactic_param_type
                    , [ '=' , expression ] ;
tactic_param_type = 'Expr' | 'Type' | 'Tactic' | 'Hypothesis' | 'Int'
                  | 'Prop' | type_expr ;

tactic_body       = tactic_expr | '{' , { tactic_stmt } , '}' ;
tactic_stmt       = 'let'   , identifier , [ ':' , type_expr ] , '=' , expression , ';'
                  | 'if'    , expression , '{' , tactic_expr , '}'
                    , [ 'else' , ( 'if' , expression , '{' , tactic_expr , '}' , …
                                 | '{'  , tactic_expr , '}' ) ]
                  | 'match' , expression , '{' , match_arm , { ( ',' | ';' ) , match_arm } , [ ',' | ';' ] , '}'
                  | 'fail'  , '(' , expression , ')'
                  | tactic_expr , [ ';' ] ;

requires_clause = 'requires' , expression , { ',' , expression } ;

proof_body       = 'proof' , ( proof_by_tactic | proof_by_term | proof_structured ) ;
proof_by_tactic  = 'by' , tactic_expr ;
proof_by_term    = '=' , expression ;
proof_structured = '{' , { proof_step } , '}' ;

proof_step          = have_step | show_step | obtain_step | calc_chain | tactic_application ;
have_step           = 'have'   , identifier , ':' , expression , proof_justification ;
show_step           = 'show'   , expression , proof_justification ;
obtain_step         = 'obtain' , pattern , 'from' , expression ;
tactic_application  = tactic_expr , ';' ;
proof_justification = 'by' , ( tactic_expr | identifier ) ;

(* Tactic combinators (Phase D.1 + T1-O reference-grade DSL) *)
tactic_expr = tactic_name , [ type_args ] , [ '(' , [ argument_list ] , ')' ]
            | tactic_expr , ';' , tactic_expr
            | '(' , tactic_expr , ')'
            | 'try' , '{' , tactic_expr , '}' , [ 'else' , '{' , tactic_expr , '}' ]
            | 'repeat' , [ '(' , integer_lit , ')' ] , '{' , tactic_expr , '}'
            (* `first` supports BOTH the block form and the Lean-style list form *)
            | 'first' , '{' , tactic_expr , { ';' , tactic_expr } , '}'
            | 'first' , '[' , tactic_expr , { ',' , tactic_expr } , ']'
            | 'all_goals' , '{' , tactic_expr , '}'
            | 'focus' , '(' , integer_lit , ')' , '{' , tactic_expr , '}' ;

tactic_name = 'auto' | 'simp' | 'ring' | 'field' | 'omega' | 'blast' | 'smt'
            | 'trivial' | 'assumption' | 'contradiction' | 'induction' | 'cases'
            | 'rewrite' | 'unfold' | 'apply' | 'exact' | 'intro' | 'intros'
            | 'cubical' | 'category_simp' | 'category_law' | 'descent_check'
            | identifier ;

(* Calculational chains *)
calc_chain    = 'calc' , '{' , calc_step , { calc_step } , '}' ;
calc_step     = expression , calc_relation , '{' , proof_justification , '}' , expression ;
calc_relation = '==' | '<' | '<=' | '>' | '>=' | '!=' ;
```

```verum
theorem sum_first_n(n: Int { self >= 0 })
    -> sum(0..=n) == n * (n+1) / 2
{
    proof by induction n {
        case 0 => qed;
        case k + 1 => calc {
            sum(0..=k+1)
          == { by def sum }   sum(0..=k) + (k+1)
          == { by ih }        k*(k+1)/2 + (k+1)
          == { by ring }      (k+1)*(k+2)/2 ;
        };
    }
}
```

---

## Layer 3 — Error Recovery

The parser's recovery strategies are encoded in the grammar so tooling
behaves consistently across implementations.

```ebnf
error_recovery  = synchronize_on_semicolon
                | synchronize_on_brace
                | synchronize_on_keyword
                | insert_missing_delimiter
                | skip_invalid_tokens ;

synchronize_on_semicolon = { token - ';' } , ';' ;
synchronize_on_brace     = { token - '}' } , '}' ;
synchronize_on_keyword   = { token - keyword } , keyword ;

insert_missing_delimiter = insert_semicolon | insert_closing_brace | insert_closing_paren ;

unclosed_delimiter_error = '(' , { token - ')' } , end_of_file
                         | '[' , { token - ']' } , end_of_file
                         | '{' , { token - '}' } , end_of_file ;
```

Recovery points: `;`, `}`, `{`, `fn`, `type`, `implement`, `module`,
`mount`. The parser skips tokens until reaching one and resumes,
emitting one diagnostic per recovery (no cascades).

---

## Cross-references

| If you want to read about… | See |
|---|---|
| Friendly walkthrough of these productions | [Language → Syntax](/docs/language/syntax) |
| Type-system surface | [Language → Types](/docs/language/types), [Refinement types](/docs/language/refinement-types), [Dependent types](/docs/language/dependent-types) |
| Patterns in depth | [Language → Patterns](/docs/language/patterns) |
| Functions, contracts | [Language → Functions](/docs/language/functions) |
| References, CBGR | [Language → References](/docs/language/references), [CBGR](/docs/language/cbgr) |
| Context system semantics | [Language → Context system](/docs/language/context-system) |
| Async / nursery / select | [Language → Async](/docs/language/async-concurrency) |
| Macro / quote system | [Language → Metaprogramming](/docs/language/meta/overview) |
| FFI boundary contracts | [Language → FFI](/docs/language/ffi) |
| Proof DSL semantics | [Verification → Proofs](/docs/verification/proofs) |
| Operator precedence table | [Reference → Operators](/docs/reference/operators) |
| Full keyword index | [Reference → Keywords](/docs/reference/keywords) |
| Attribute semantics | [Reference → Attribute registry](/docs/reference/attribute-registry) |

## Tooling

```bash
verum grammar dump            # render railroad diagrams
verum grammar search <rule>   # locate a production
verum grammar validate FILE   # validate a .vr file against the grammar only
verum disasm --show-tokens    # tokeniser output for debugging
```

## Version

This page reflects grammar version **3.0** — 2,423 lines of EBNF.
Future revisions will be announced on the blog and cross-linked here.

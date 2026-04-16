/**
 * Prism syntax-highlighting definition for the Verum language.
 *
 * Registered as the `verum` language (with `vr` alias) via a Docusaurus
 * client module so that ```verum / ```vr fenced blocks colourise.
 *
 * Coverage:
 *   - 3 reserved keywords + ~60 contextual (full set per grammar/verum.ebnf)
 *   - All literal forms: numbers (with suffixes/separators), chars,
 *     plain & raw multiline strings, byte strings, format f"..." with
 *     ${...} interpolation, tagged literals (sql#"…", json#"…", rx#"…",
 *     url#"…", etc.) including their multiline raw forms.
 *   - Three-tier reference syntax: &T, &checked T, &unsafe T (+ mut)
 *   - @attributes (@derive, @verify, @repr, @cfg, etc.)
 *   - Refinement braces: { self.is_sorted() }
 *   - Generics, lifetimes, type parameters
 *   - Operators incl. is, as, ?, .await, |>, ??, ?., **, ..=
 *   - Comments (line + block, no nesting)
 *   - Macro / quote splices: $var, ${expr}, $$var, $(stage N){ ... }
 *   - Proof DSL keywords (theorem, lemma, axiom, calc, by, qed, etc.)
 */
declare const Prism: any;

export default function registerVerum(prismInstance: any) {
  const P = prismInstance ?? Prism;
  if (!P || P.languages.verum) return;

  // Reserved + contextual keyword sets, grouped for documentation.
  const RESERVED = ['let', 'fn', 'is'];
  const PRIMARY = ['type', 'where', 'using'];
  const CONTROL = [
    'if', 'else', 'match', 'return', 'for', 'while', 'loop',
    'break', 'continue', 'in',
  ];
  const ASYNC = [
    'async', 'await', 'spawn', 'defer', 'errdefer', 'try', 'throws',
    'yield', 'select', 'biased', 'nursery', 'recover', 'finally',
    'on_cancel',
  ];
  const MODIFIERS = ['pub', 'mut', 'const', 'unsafe', 'pure', 'static',
                     'meta', 'cofix', 'extern', 'move', 'ref', 'default'];
  const VISIBILITY = ['public', 'internal', 'protected', 'private'];
  const MODULE = ['module', 'mount', 'implement', 'context', 'protocol',
                  'extends', 'self', 'super', 'crate', 'as', 'provide',
                  'ffi'];
  const CONTRACTS = ['ensures', 'requires', 'invariant', 'decreases',
                     'result', 'some'];
  const PROOF = [
    'theorem', 'lemma', 'axiom', 'corollary', 'proof', 'calc',
    'have', 'show', 'suffices', 'obtain', 'by', 'qed',
    'induction', 'cases', 'contradiction', 'forall', 'exists',
    'tactic',
  ];
  const TYPES = ['affine', 'linear', 'stream', 'tensor', 'dyn',
                 'checked', 'view', 'Self', 'Type', 'Level', 'universe'];
  const VALUES = ['true', 'false', 'null'];

  const KEYWORD_RE = (xs: string[]) => new RegExp(`\\b(?:${xs.join('|')})\\b`);

  P.languages.verum = {
    // ---- Comments --------------------------------------------------------
    'comment': [
      { pattern: /\/\/.*/,    greedy: true },
      { pattern: /\/\*[\s\S]*?\*\//, greedy: true },
    ],

    // ---- Tagged literals: sql#"…", rx#"…", json#"""…""", url#"…", … -----
    'tagged-string': {
      pattern: /\b[a-z_][a-z0-9_]*#(?:"""[\s\S]*?"""|"(?:[^"\\]|\\.)*")/i,
      greedy: true,
      inside: {
        'tag': /^[a-z_][a-z0-9_]*(?=#)/i,
        'punctuation': /^#|"""|"/,
        'interpolation': {
          pattern: /\$\{[^}]+\}/,
          inside: {
            'punctuation': /^\$\{|\}$/,
            'rest': null as any, // back-reference set below
          },
        },
        'string': /[\s\S]+/,
      },
    },

    // ---- Format strings: f"…", fmt"…" with {…} interpolation ------------
    'format-string': {
      pattern: /\b(?:f|fmt)"(?:[^"\\]|\\.)*"/,
      greedy: true,
      inside: {
        'string-prefix': /^(?:f|fmt)/,
        'punctuation': /^"|"$/,
        'interpolation': {
          pattern: /\{[^{}]*\}/,
          inside: {
            'punctuation': /^\{|\}$/,
            'rest': null as any,
          },
        },
        'string': /[\s\S]+/,
      },
    },

    // ---- Byte strings: b"…" ---------------------------------------------
    'byte-string': {
      pattern: /\bb"(?:[^"\\]|\\.)*"/,
      greedy: true,
      alias: 'string',
    },

    // ---- Raw multi-line strings: """…""" --------------------------------
    'raw-string': {
      pattern: /"""[\s\S]*?"""/,
      greedy: true,
      alias: 'string',
    },

    // ---- Plain strings: "…" with escapes --------------------------------
    'string': {
      pattern: /"(?:[^"\\\n]|\\.)*"/,
      greedy: true,
    },

    // ---- Char literals: 'c', '\n', '\u{...}' ----------------------------
    'char': {
      pattern: /'(?:[^'\\]|\\(?:.|u\{[0-9a-fA-F]+\}|x[0-9a-fA-F]{2}))'/,
      greedy: true,
      alias: 'string',
    },

    // ---- Attributes: @derive(...), @verify(smt), @cfg(...) --------------
    'attribute': {
      pattern: /@[A-Za-z_][\w]*(?=\s*[\[({]|\s+(?:fn|type|impl|implement|module|context|let|const|static|pub|public|internal|@))/,
      alias: 'function',
    },
    // Macro invocation (e.g. @repeat(3, { ... }))
    'macro': {
      pattern: /@[A-Za-z_][\w]*/,
      alias: 'function',
    },

    // ---- Quote interpolation: $var, ${expr}, $$var, $$$var --------------
    'quote-interp': {
      pattern: /\$+[A-Za-z_]\w*|\$+\{[^}]+\}|\$\(stage\s+\d+\)\{[^}]+\}/,
      alias: 'variable',
    },

    // ---- Logical operators: &&, || (must precede `reference` so that
    // `self && self` tokenises as `self` `&&` `self`, not as a reference) --
    'logical-op': {
      pattern: /&&|\|\|/,
      alias: 'operator',
    },

    // ---- Three-tier reference syntax: &T, &checked T, &unsafe T ---------
    'reference': {
      pattern: /&\s*(?:checked|unsafe)?\s*(?:mut\s+)?(?=[A-Za-z_])/,
      alias: 'operator',
    },

    // ---- Type names (UpperCamel) ----------------------------------------
    'type-name': {
      pattern: /\b[A-Z][A-Za-z0-9_]*\b/,
      alias: 'class-name',
    },

    // ---- Function definition --------------------------------------------
    'function-definition': {
      pattern: /\bfn\s*\*?\s+[a-z_][\w]*/,
      inside: {
        'keyword': /^fn\s*\*?/,
        'function': /[a-z_][\w]*$/,
      },
    },

    // ---- Numbers (with separators + suffixes) ---------------------------
    'number': [
      // Hex / oct / bin
      /\b0x[0-9a-fA-F_]+(?:i8|i16|i32|i64|i128|isize|u8|u16|u32|u64|u128|usize)?\b/,
      /\b0o[0-7_]+(?:i8|i16|i32|i64|i128|isize|u8|u16|u32|u64|u128|usize)?\b/,
      /\b0b[01_]+(?:i8|i16|i32|i64|i128|isize|u8|u16|u32|u64|u128|usize)?\b/,
      // Float
      /\b\d[\d_]*\.\d[\d_]*(?:[eE][+-]?\d+)?(?:f32|f64)?\b/,
      /\b\d[\d_]*(?:[eE][+-]?\d+)(?:f32|f64)?\b/,
      // Decimal int
      /\b\d[\d_]*(?:i8|i16|i32|i64|i128|isize|u8|u16|u32|u64|u128|usize)?\b/,
    ],

    // ---- Keywords (grouped semantically) --------------------------------
    'keyword-reserved': { pattern: KEYWORD_RE(RESERVED), alias: 'keyword' },
    'keyword-async':    { pattern: KEYWORD_RE(ASYNC),    alias: 'keyword' },
    'keyword-proof':    { pattern: KEYWORD_RE(PROOF),    alias: 'keyword' },
    'keyword-contract': { pattern: KEYWORD_RE(CONTRACTS), alias: 'keyword' },
    'keyword-modifier': { pattern: KEYWORD_RE(MODIFIERS), alias: 'keyword' },
    'keyword-vis':      { pattern: KEYWORD_RE(VISIBILITY), alias: 'keyword' },
    'keyword-module':   { pattern: KEYWORD_RE(MODULE),   alias: 'keyword' },
    'keyword-control':  { pattern: KEYWORD_RE(CONTROL),  alias: 'keyword' },
    'keyword-primary':  { pattern: KEYWORD_RE(PRIMARY),  alias: 'keyword' },
    'keyword-types':    { pattern: KEYWORD_RE(TYPES),    alias: 'keyword' },
    'keyword-value':    { pattern: KEYWORD_RE(VALUES),   alias: 'boolean' },

    // ---- Operators ------------------------------------------------------
    // Precedence-rich Verum operators, including is/as/.await/|>/??/?./**/..=
    'operator': /\|\>|\?\?|\?\.|\.\.=|\.\.|<<=?|>>=?|==|!=|<=|>=|&&|\|\||->|=>|::|\*\*|\.\.\.|[+\-*/%&|^!~<>=]=?|@|\?/,

    // ---- Punctuation ----------------------------------------------------
    'punctuation': /[{}[\]();,:.]/,
  };

  // Resolve the back-references for nested expression highlighting
  // inside format-string / tagged-string interpolations.
  const fmt = P.languages.verum['format-string'];
  if (fmt && fmt.inside.interpolation) {
    fmt.inside.interpolation.inside.rest = P.languages.verum;
  }
  const tag = P.languages.verum['tagged-string'];
  if (tag && tag.inside.interpolation) {
    tag.inside.interpolation.inside.rest = P.languages.verum;
  }

  // Common alias.
  P.languages.vr = P.languages.verum;
}

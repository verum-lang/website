---
sidebar_position: 4
title: API reference — style
description: Color, Rgb, Hsl, Style, Modifier, Theme, ColorProfile.
---

# API reference — style & color

All types live in `core.term.style`. Guided treatment: [styling &
themes](../guides/styling-theming.md).

## `Color`

```verum
public type Color is
    | Reset
    | Black   | DarkGrey
    | Red     | DarkRed
    | Green   | DarkGreen
    | Yellow  | DarkYellow
    | Blue    | DarkBlue
    | Magenta | DarkMagenta
    | Cyan    | DarkCyan
    | White   | Grey
    | Ansi256(Int)              // 0..255
    | TrueColor(Rgb)
    | FromHsl(Hsl);             // converted to Rgb at render
```

The sixteen ANSI colours are **variants**, not a `Base16(Int)` index —
`Color.DarkRed` is a constructor, not a constant standing for an index.
There is no `Lab` arm either: `Lab` is a separate type reached through
`Rgb.to_lab()` for perceptual work, never a colour a terminal is asked
to render.

| | |
|---|---|
| `// Common constants` |  |
| `Color.Black  Color.DarkRed` |  |
| `Color.DarkGreen  Color.DarkYellow` |  |
| `Color.DarkBlue Color.DarkMagenta Color.DarkCyan  Color.Grey` |  |
| `Color.DarkGrey Color.Red` |  |
| `Color.Green` |  |
| `Color.Yellow` |  |
| `Color.Blue` |  |
| `Color.Magenta  Color.Cyan` |  |
| `Color.White` |  |

```verum
Rgb.new(r: UInt8, g: UInt8, b: UInt8) -> Rgb
Rgb.from_hex(hex: &Text) -> Maybe<Rgb>          // "#RRGGBB" or "RRGGBB"

Hsl.new(h: Float, s: Float, l: Float) -> Hsl    // h in [0,360], s/l in [0,1]
Hsl.to_rgb(&self) -> Rgb
Hsl.lighten(&self, f: Float) -> Hsl
Hsl.darken(&self, f: Float) -> Hsl
```

## `Style`

```verum
public type Style is {
    fg: Maybe<Color>,
    bg: Maybe<Color>,
    underline_color: Maybe<Color>,
    add_modifier: Modifier,
    sub_modifier: Modifier,
};

Style.DEFAULT                                 // all None / empty
Style.new() -> Style
    .fg(c: Color) -> Self
    .bg(c: Color) -> Self
    .underline_color(c: Color) -> Self
    .bold()       .italic()     .dim()
    .underlined() .reversed()   .crossed_out()
    .not_bold()   .not_italic() .not_underlined()   // the sub_modifier set
    .has_modifier(m: Modifier) -> Bool
    .patch(other: Style) -> Style             // merge; `other` wins
    .hyperlink(url: &Text) -> Self
```

## `Modifier`

```verum
public type Modifier is { bits: UInt16 };
```

| | |
|---|---|
| `Modifier.NONE` |  |
| `Modifier.BOLD` |  |
| `Modifier.DIM` |  |
| `Modifier.ITALIC` |  |
| `Modifier.UNDERLINED` |  |
| `Modifier.DOUBLE_UNDERLINED Modifier.CURLY_UNDERLINED` |  |
| `Modifier.SLOW_BLINK` |  |
| `Modifier.RAPID_BLINK` |  |
| `Modifier.REVERSED` |  |
| `Modifier.HIDDEN` |  |
| `Modifier.CROSSED_OUT` |  |
| `Modifier.OVERLINED` |  |
| `fn contains(&self, m: Modifier) -> Bool` |  |
| `fn union(&self, m: Modifier)` |  |
| `-> Modifier` |  |
| `fn intersect(&self, m: Modifier) -> Modifier` |  |
| `fn difference(&self, m: Modifier) -> Modifier` |  |


## `Theme`

```verum
// Every role is a full `Style`, not a `Color`: a role carries
// foreground, background, underline colour and modifiers together, so a
// theme can say "muted text is dim grey italic" in one field.
public type Theme is {
    // Surfaces
    surface: Style, surface_dim: Style, on_surface: Style,
    // Interactive
    primary: Style, on_primary: Style, secondary: Style, on_secondary: Style,
    // Semantic
    error: Style, warning: Style, success: Style, info: Style,
    // Borders
    border: Style, border_focused: Style, divider: Style,
    // Text emphasis
    text: Style, text_dim: Style, text_muted: Style, text_highlight: Style,
    // Selection
    selection: Style, cursor: Style,
};
```

There is no `surface_alt`, `muted` or `accent`. The nearest names are
`surface_dim`, `text_muted` and `primary`, and the `on_*` roles say what
to draw ON a coloured background — a pairing the three-name palette
could not express.

| | |
|---|---|
| `Theme.dark()  -> Theme` |  |
| `Theme.light() -> Theme` |  |


## `ColorProfile`

```verum
public type ColorProfile is NoColor | Base16 | Ansi256 | TrueColor;

public fn adapt_color(c: Color, profile: ColorProfile) -> Color;
```

`adapt_color` uses CIELAB perceptual distance to find the closest
representable color in the target profile — the right choice for 16-color
fallbacks on otherwise-truecolor inputs.

## Text builder DSL

The span type is **`TextSpan`** (`core/term/widget/paragraph.vr`). A bare
`Span` is a different type entirely — `core.meta`'s macro-hygiene span —
and writing it here is not a shorthand.

```verum
mount core.term.style.text_builder.*;

bold(t: Text) -> TextSpan
italic(t: Text) -> TextSpan
dim(t: Text) -> TextSpan
underlined(t: Text) -> TextSpan
crossed_out(t: Text) -> TextSpan
reversed(t: Text) -> TextSpan

fg(t: Text, c: Color) -> TextSpan       bg(t: Text, c: Color) -> TextSpan
red(t: Text) -> TextSpan    green(t: Text) -> TextSpan    blue(t: Text) -> TextSpan
yellow(t: Text) -> TextSpan cyan(t: Text) -> TextSpan     magenta(t: Text) -> TextSpan
white(t: Text) -> TextSpan  grey(t: Text) -> TextSpan
```

:::danger This layer does not run at Tier 0
Measured 2026-09-09. Two defects sit on top of each other:

* the module imported the span type under the name `Span`, which
  `core/term/widget/paragraph.vr` does not export, so every helper was
  typed as returning `core.meta`'s `MetaSpan` — `bold("hi").content` did
  not exist (T1268);
* correcting that import and re-baking makes the file type-check and
  then panic, because `TextSpan.styled(text, style)` called ACROSS a
  module boundary inside the bake is dispatched as a three-argument
  method on its first argument (T1277). The identical call from a user
  file, and from `paragraph.vr`'s own `Line.styled`, both work.

Until both land, build spans directly: `TextSpan.raw(text)` and
`TextSpan.styled(text, Style.new().bold())` are measured working.
:::

## Color utilities

```verum
mount core.term.style.color_utils.*;

fn hex(s: &Text) -> Color               // panic on parse error
fn hex_gradient(a: &Text, b: &Text, steps: Int) -> List<Rgb>
```

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
    | Base16(Int)              // 0..15 (standard ANSI)
    | Ansi256(Int)             // 0..255
    | Rgb(Rgb)                 // TrueColor
    | Hsl(Hsl)                 // converted to Rgb at render
    | Lab(Lab);                // CIELAB; used for perceptual computations

// Common constants
Color.Black  Color.DarkRed   Color.DarkGreen  Color.DarkYellow
Color.DarkBlue Color.DarkMagenta Color.DarkCyan  Color.Grey
Color.DarkGrey Color.Red    Color.Green       Color.Yellow
Color.Blue   Color.Magenta  Color.Cyan        Color.White
```

```verum
Rgb.new(r: UInt8, g: UInt8, b: UInt8) -> Rgb
Rgb.from_hex(s: &Text) -> Result<Rgb, Text>      // "#RRGGBB" or "RRGGBB"

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
    .add_modifier(m: Modifier) -> Self
    .remove_modifier(m: Modifier) -> Self
    .bold()       .italic()     .dim()
    .underlined() .reversed()   .crossed_out()
    .patch(other: Style) -> Style             // merge; `other` wins
    .hyperlink(url: &Text) -> Self
```

## `Modifier`

```verum
public type Modifier is { bits: UInt16 };

Modifier.NONE
Modifier.BOLD              Modifier.DIM
Modifier.ITALIC            Modifier.UNDERLINED
Modifier.DOUBLE_UNDERLINED Modifier.CURLY_UNDERLINED
Modifier.SLOW_BLINK        Modifier.RAPID_BLINK
Modifier.REVERSED          Modifier.HIDDEN
Modifier.CROSSED_OUT       Modifier.OVERLINED

    fn contains(&self, m: Modifier) -> Bool
    fn union(&self, m: Modifier)    -> Modifier
    fn intersect(&self, m: Modifier) -> Modifier
    fn difference(&self, m: Modifier) -> Modifier
```

## `Theme`

```verum
public type Theme is {
    surface:     Color,
    surface_alt: Color,
    primary:     Color,
    muted:       Color,
    accent:      Color,
    success:     Color,
    warning:     Color,
    error:       Color,
    border:      Color,
};

Theme.dark()  -> Theme
Theme.light() -> Theme
```

## `ColorProfile`

```verum
public type ColorProfile is NoColor | Base16 | Ansi256 | TrueColor;

public fn adapt_color(c: Color, profile: ColorProfile) -> Color;
```

`adapt_color` uses CIELAB perceptual distance to find the closest
representable color in the target profile — the right choice for 16-color
fallbacks on otherwise-truecolor inputs.

## Text builder DSL

```verum
mount core.term.style.text_builder.*;

bold(t: Text) -> Span
italic(t: Text) -> Span
dim(t: Text) -> Span
underlined(t: Text) -> Span
reversed(t: Text) -> Span

red(t: Text) -> Span    green(t: Text) -> Span    blue(t: Text) -> Span
yellow(t: Text) -> Span cyan(t: Text) -> Span     magenta(t: Text) -> Span
white(t: Text) -> Span
```

## Color utilities

```verum
mount core.term.style.color_utils.*;

fn hex(s: &Text) -> Color               // panic on parse error
fn hex_gradient(a: &Text, b: &Text, steps: Int) -> List<Rgb>
```

---
sidebar_position: 2
title: Styling &amp; themes
description: Colors, modifiers, themes, and perceptual downsampling for 16-color terminals.
---

# Styling & themes

Every visible pixel in a Verum TUI carries a `Style`:

```verum
public type Style is {
    fg: Maybe<Color>,
    bg: Maybe<Color>,
    underline_color: Maybe<Color>,
    add_modifier: Modifier,
    sub_modifier: Modifier,
};
```

`None` means "use the surrounding cell's style". This lets widgets inherit
gracefully and lets `Block` borders use one style while the inner area
uses another.

## Colors

```verum
public type Color is
    | Reset
    | Base16(Int)       // 16 ANSI, 0..15
    | Ansi256(Int)      // 256, 0..255
    | Rgb(Rgb)          // TrueColor
    | Hsl(Hsl)          // parsed to Rgb at render
    | Lab(Lab);         // for perceptual work
```

Convenience constants (`Color.Red`, `Color.DarkRed`, `Color.Cyan`, …) pick
the right base-16 index and are the usual starting point.

### Parsing hex

```verum
Color.Rgb(Rgb.from_hex("#1e90ff").unwrap())       // explicit
style.fg(hex("1e90ff"))                            // prelude shortcut
```

### Gradients

```verum
mount core.term.style.color_utils.hex_gradient;

let stops = hex_gradient("#0066ff", "#ff00aa", 8);   // List<Rgb>, 8 evenly spaced
```

## Modifiers

Bitset of terminal attributes:

```
BOLD            DIM            ITALIC
UNDERLINED      DOUBLE_UNDERLINED    CURLY_UNDERLINED
SLOW_BLINK      RAPID_BLINK
REVERSED        HIDDEN
CROSSED_OUT     OVERLINED
```

```verum
Style.new().bold().italic().fg(Color.Yellow)
Style.new().add_modifier(Modifier.BOLD.union(Modifier.UNDERLINED))
```

`add_modifier` specifies what to turn on, `sub_modifier` what to explicitly
turn off when merging with ambient style — useful when temporarily
unsetting bold inside an already-bold block.

## Perceptual downsampling

`TermCapabilities.color_profile` is detected once at startup. Anything you
ask for — even a 24-bit RGB — is lowered to that profile by `adapt_color`:

```mermaid
flowchart LR
    RGB[Rgb(31,144,255)] --> LAB[CIELAB L*a*b*]
    LAB --> N[Nearest palette match]
    N --> Out[Base16 / Ansi256 / passthrough]
```

The CIELAB step matters because RGB-Euclidean distance gets colour lookups
embarrassingly wrong on very dark or very saturated inputs (two visually
identical colours can be far apart in RGB; two different colours can be
close). CIELAB is designed to be approximately perceptually uniform.

Enforce an explicit profile for dev/testing:

```verum
mount core.term.style.profile.ColorProfile;
terminal.set_color_profile(ColorProfile.Base16);    // force 16-color on kitty
```

## Themes

A `Theme` assigns colors to semantic roles:

```verum
public type Theme is {
    surface: Color,         // window background
    surface_alt: Color,     // alternate rows, stripes
    primary: Color,         // main text
    muted: Color,           // secondary text
    accent: Color,          // highlights, focus
    success: Color,
    warning: Color,
    error: Color,
    border: Color,
};
```

Two built-ins: `Theme.dark()` and `Theme.light()`. A typical app flips
between them:

```verum
type Msg is ToggleTheme;

fn update(&mut self, msg: Msg) -> Command<Msg> {
    match msg {
        ToggleTheme => {
            self.theme = if self.theme == Theme.dark() { Theme.light() } else { Theme.dark() };
            Command.none()
        }
    }
}

fn view(&self, f: &mut Frame) {
    let t = &self.theme;
    Block.new()
        .title("Dashboard")
        .borders(Borders.ALL)
        .style(Style.new().fg(t.border).bg(t.surface))
        .render(f.size(), f.buffer);
}
```

For your own theme:

```verum
let corporate = Theme {
    surface: Color.Rgb(Rgb.new(18, 18, 24)),
    primary: Color.Rgb(Rgb.new(230, 230, 240)),
    accent:  hex("00b4d8"),
    ..Theme.dark()
};
```

## The text builder DSL

For inline styled runs, skip `Line.styled(...)` boilerplate:

```verum
mount core.term.style.text_builder.*;

let line = Line.new([
    bold("Status: "),
    green("online"),
    Span.raw(" ("),
    italic("3 peers"),
    Span.raw(")"),
]);
```

## Hyperlinks

```verum
style.hyperlink("https://verum-lang.org")
```

Uses OSC 8 under the hood. Terminals that don't support OSC 8 ignore it and
render the text untouched.

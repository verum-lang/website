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

### Parsing hex

```verum
// from_hex answers Maybe<Rgb>, so unwrap or match — it is not a Result.
Color.TrueColor(Rgb.from_hex(&"#1e90ff").unwrap())     // explicit
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

| the two spellings | |
|---|---|
| `Style.new().bold().italic().fg(Color.Yellow)` | the shorthand |
| `Style.new().bold().underlined()` | there is no other form: `add_modifier` is a FIELD of `Style`, not a method |

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

:::caution The profile cannot be forced

There is no `set_color_profile`. `Terminal` fixes
`color_profile: ColorProfile.TrueColor` when it is constructed
(`core/term/render/frame.vr:81`) and exposes a GETTER only —
`t.color_profile() -> ColorProfile` at :154. So a program can ask which
profile it is rendering under, and cannot choose one.

For dev/testing, degrade at the point of use: read
`t.color_profile()` and pick your own palette from it, or render
through a `Style` you build for the target depth. Forcing the terminal
into Base16 is not available today.

:::

## Themes

A `Theme` assigns colors to semantic roles:

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

Two built-ins: `Theme.dark()` and `Theme.light()`. A typical app flips
between them:

```verum
type Msg is ToggleTheme;

fn update(&mut self, msg: Msg) -> Command<Msg> {
    match msg {
        ToggleTheme => {
            self.theme = if self.theme == Theme.dark() { Theme.light() } else { Theme.dark() };
            none()
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
    surface: Color.TrueColor(Rgb.new(18, 18, 24)),
    primary: Color.TrueColor(Rgb.new(230, 230, 240)),
    accent:  hex("00b4d8"),
    ..Theme.dark()
};
```

## The text builder DSL

For inline styled runs, skip `Line.styled(...)` boilerplate:

The constructor is `Line.from(spans)` — there is no `Line.new` — and
the span type is `TextSpan`, not `Span`.

```verum
mount core.term.style.text_builder.*;
mount core.term.widget.paragraph.{Line, TextSpan};

let line = Line.from([
    bold("Status: "),
    green("online"),
    TextSpan.raw(" ("),
    italic("3 peers"),
    TextSpan.raw(")"),
]);
```

The `bold` / `green` / `italic` helpers do not run at Tier 0 today — see
the note under [Text builder DSL](/docs/stdlib/term/reference/api-style)
(T1268, T1277). `TextSpan.raw` and `TextSpan.styled` do.

## Hyperlinks

```verum
style.hyperlink("https://verum-lang.org")
```

Uses OSC 8 under the hood. Terminals that don't support OSC 8 ignore it and
render the text untouched.

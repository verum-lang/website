---
sidebar_position: 1
title: Widget catalogue
description: Every built-in widget at a glance, with a minimal example for each.
---

# Widget catalogue

`core::term::widget` ships twenty composable widgets. Each implements
`Widget` (stateless) or `StatefulWidget` (with an associated `State` type).
Every widget accepts a `Style` and an optional `Block` wrapper.

## Containers & framing

### `Block`
Border + title + padding, the universal framing widget.

```verum
Block.new()
    .title(" Logs ")
    .borders(Borders.ALL)
    .border_type(BorderType.Rounded)
    .style(Style.new().fg(Color.Cyan))
```

### `Split`
Two panes with an interactive divider (horizontal or vertical).

```verum
let (left, div, right) = Split.horizontal().ratio(0.3).layout(area, &state);
Split.horizontal().render_divider(div, buf, &state);
```

## Text

### `Paragraph`
Styled multi-line text with `NoWrap`, `CharWrap`, or `WordWrap`.

```verum
Paragraph.new()
    .text([Line.raw("First line"), Line.styled("Second", Style.new().bold())])
    .wrap(Wrap.Word)
    .alignment(Alignment.Center)
```

## Lists & tables

### `SelectableList`
Scrollable single-select list.

```verum
SelectableList.new(&items)
    .block(Block.new().title("Files"))
    .highlight_style(Style.new().reversed())
    .highlight_symbol(&"> ")
    .render_stateful(f, area, &mut state);
```

### `Table`
Structured rows with per-column `Constraint` widths.

```verum
Table.new(rows)
    .header(Row.new(["Name", "Value"]))
    .widths(&[Constraint.Percentage(40), Constraint.Percentage(60)])
    .highlight_spacing(HighlightSpacing.WhenSelected)
    .render_stateful(f, area, &mut state);
```

### `Tree<T>`
Nested items with expand/collapse, connectors, and path-based selection.

```verum
Tree.new(items)
    .highlight_style(Style.new().bg(Color.Blue).fg(Color.White))
    .highlight_symbol(&"> ")
    .render_stateful(f, area, &mut state);
```

## Input

### `TextInput`
Single-line editor with selection, undo/redo, clipboard, grapheme cursor,
Emacs bindings.

```verum
TextInput.new()
    .block(Block.new().title("Search"))
    .placeholder("type here…")
    .render_stateful(f, area, &mut state);
```

### `TextArea`
Multi-line editor with line-array storage, line numbers, tab expansion.

```verum
TextArea.new()
    .line_numbers(true)
    .wrap(WrapMode.NoWrap)
    .render_stateful(f, area, &mut state);
```

### `Dropdown<T>`
Select widget with optional incremental search.

```verum
Dropdown.new(items, |x| x.name.clone())
    .searchable(true)
    .max_visible(8)
    .render_stateful(f, area, &mut state);
```

### `Menu`
Vertical menu with submenus, shortcuts, disabled items, separators.

```verum
Menu.new([
    MenuItem.new("New").shortcut("Ctrl+N"),
    MenuItem.new("Open").shortcut("Ctrl+O"),
    MenuItem.separator(),
    MenuItem.new("Export").submenu([
        MenuItem.new("JSON"),
        MenuItem.new("CSV"),
    ]),
])
```

### `Dialog`
Modal window with buttons.

```verum
Dialog.new("Save changes?")
    .buttons([DialogButton.new("Save"), DialogButton.new("Discard"), DialogButton.new("Cancel")])
```

## Progress & feedback

### `Gauge`
Smooth progress bar (8 sub-cell levels ▏▎▍▌▋▊▉█).

```verum
Gauge.new().percent(state.progress).style(Style.new().fg(Color.Green))
```

### `Spinner`
Frame-based animation (`dots`, `line`, `moon`, `earth`, `arrows`, `blocks`).

```verum
Spinner.dots().label_text("Loading…").render_stateful(f, area, &mut state);
```

### `Notification`
Toast with level (`Info`, `Warning`, `Error`, `Success`).

```verum
Notification.success("Saved!").title("IO").width(40).render(area, buf);
```

### `Scrollbar`
Thin scroll indicator (vertical or horizontal).

```verum
Scrollbar.new(ScrollbarOrientation.VerticalRight)
    .render_stateful(f, area, &mut state);
```

## Charts

### `Sparkline`
Compact bar chart using 8-level Unicode blocks.

```verum
Sparkline.new(data).bar_style(Style.new().fg(Color.Yellow))
```

### `BarChart`
Grouped bars with per-bar labels and values, vertical or horizontal.

```verum
BarChart.new(groups).bar_width(4).group_gap(2).direction(Direction.Vertical)
```

### `Canvas`
Pixel canvas with Braille (2×4), half-block (1×2), or block (1×1) modes.

```verum
Canvas.new()
    .x_bounds(0.0, 100.0)
    .y_bounds(0.0, 100.0)
    .marker(Marker.Braille)
    .paint(Heap(LineShape.new(0.0, 0.0, 100.0, 100.0, Color.Red)))
```

## Navigation

### `Tabs`
Single-row tab bar with dividers.

```verum
Tabs.new(["Overview", "Metrics", "Logs"]).selected(1).divider(" | ")
```

---

Every widget is documented in depth under `reference/` with the full API
and at least one screenshot-style code example. Consult the individual
pages for caveats (wide-grapheme handling, edge cases in resize, etc.)
before shipping to production.

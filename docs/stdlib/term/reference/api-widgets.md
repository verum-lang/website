---
sidebar_position: 1
title: API reference — widgets
description: Full signature reference for every widget in `core.term::widget`.
---

# API reference — widgets

All widgets live in `core.term.widget`. Most are re-exported from
`core.term.widget.*` and also from `core.term.prelude.*`. This page is a
dense reference; for guided explanations see the [widget catalogue](../widgets/overview.md).

## Protocols

```verum
public type Widget is protocol {
    fn render(&self, area: Rect, buf: &mut Buffer);
};

public type StatefulWidget is protocol {
    type State;
    fn render(self, area: Rect, buf: &mut Buffer, state: &mut Self.State);
};

public type Styled is protocol {
    fn style(self, style: Style) -> Self;
};
```

## `Block`

```verum
Block.new() -> Block
    .title(text: Text) -> Self
    .title_alignment(a: Alignment) -> Self
    .borders(b: Borders) -> Self
    .border_type(t: BorderType) -> Self
    .border_style(s: Style) -> Self
    .style(s: Style) -> Self
    .padding(top: Int, right: Int, bottom: Int, left: Int) -> Self
    .inner(area: Rect) -> Rect
```

## `Paragraph`

```verum
Paragraph.new() -> Paragraph
    .text(lines: List<Line>) -> Self
    .wrap(w: Wrap) -> Self           // NoWrap | Char | Word
    .alignment(a: Alignment) -> Self
    .block(b: Block) -> Self
    .scroll(offset: Int) -> Self
```

## `SelectableList`

```verum
SelectableList.new(items: &List<Text>) -> Self
    .block(b: Block) -> Self
    .highlight_style(s: Style) -> Self
    .highlight_symbol(sym: &Text) -> Self
    .render_stateful(f, area, &mut ListState)

ListState.new() -> ListState
    .selected(idx: Maybe<Int>) -> Self
    fn select(&mut self, idx: Int)
    fn select_next(&mut self)
    fn select_previous(&mut self)
    fn unselect(&mut self)
    fn get_selected(&self) -> Maybe<Int>
```

## `Table`

```verum
Table.new(rows: List<Row>) -> Self
    .header(row: Row) -> Self
    .widths(cs: &List<Constraint>) -> Self
    .block(b: Block) -> Self
    .highlight_style(s: Style) -> Self
    .highlight_spacing(sp: HighlightSpacing) -> Self
    .column_spacing(n: Int) -> Self
```

## `TextInput`

```verum
TextInput.new() -> TextInput
    .block(b: Block) -> Self
    .placeholder(t: Text) -> Self
    .placeholder_style(s: Style) -> Self
    .cursor_style(s: Style) -> Self
    .selection_style(s: Style) -> Self
    .mask(ch: Char) -> Self           // for passwords

TextInputState.new() -> TextInputState
    .with_value(t: Text) -> Self
    .history_cap(n: Int) -> Self

    // selection
    fn has_selection(&self) -> Bool
    fn selection_range(&self) -> (Int, Int)
    fn selected_text(&self) -> Text
    fn select_all(&mut self)
    fn clear_selection(&mut self)

    // history
    fn undo(&mut self) -> Bool
    fn redo(&mut self) -> Bool

    // mutation
    fn insert_char(&mut self, ch: Char)
    fn insert_text(&mut self, t: &Text)
    fn delete_backward(&mut self)
    fn delete_forward(&mut self)
    fn delete_word_backward(&mut self)
    fn delete_word_forward(&mut self)
    fn kill_to_end(&mut self) -> Text
    fn kill_to_start(&mut self) -> Text
    fn delete_selection(&mut self) -> Text
    fn clear(&mut self)

    // movement (extend_selection: bool)
    fn move_left(&mut self, extend: Bool)
    fn move_right(&mut self, extend: Bool)
    fn move_word_left(&mut self, extend: Bool)
    fn move_word_right(&mut self, extend: Bool)
    fn move_home(&mut self, extend: Bool)
    fn move_end(&mut self, extend: Bool)

    // clipboard
    fn copy(&self) -> Text
    fn cut(&mut self) -> Text
    fn paste(&mut self, t: &Text)

    // default dispatcher with Emacs keybindings
    fn handle_key(&mut self, ke: KeyEvent) -> Bool
```

Default keybindings (via `handle_key`):

| Key | Action |
|---|---|
| Ctrl+A / Home | Line start |
| Ctrl+E / End | Line end |
| Ctrl+B / ← | Grapheme left |
| Ctrl+F / → | Grapheme right |
| Alt+B / Ctrl+← | Word left |
| Alt+F / Ctrl+→ | Word right |
| Ctrl+K | Kill to end |
| Ctrl+U | Kill to start |
| Ctrl+W / Ctrl+Backspace | Delete word backward |
| Alt+D / Ctrl+Delete | Delete word forward |
| Ctrl+H / Backspace | Delete backward |
| Ctrl+D / Delete | Delete forward |
| Ctrl+Z | Undo |
| Ctrl+Y | Redo |
| Shift+arrow | Extend selection |

## `TextArea`

```verum
TextArea.new() -> TextArea
    .block(b: Block) -> Self
    .cursor_style(s: Style) -> Self
    .selection_style(s: Style) -> Self
    .line_numbers(on: Bool) -> Self
    .line_number_style(s: Style) -> Self
    .wrap(w: WrapMode) -> Self        // NoWrap | CharWrap | WordWrap
    .tab_width(n: Int) -> Self

TextAreaState.new() -> TextAreaState
    .from_text(t: &Text) -> Self
    fn to_text(&self) -> Text
    fn has_selection(&self) -> Bool
    fn selection_range(&self) -> (Pos, Pos)
    fn undo(&mut self) -> Bool
    fn redo(&mut self) -> Bool
    fn insert_char(&mut self, ch: Char)
    fn insert_text(&mut self, t: &Text)
    fn insert_newline(&mut self)
    fn delete_backward(&mut self)
    fn delete_forward(&mut self)
    fn move_left / right / up / down / line_start / line_end / document_start / document_end
    fn copy(&self) -> Text
    fn cut(&mut self) -> Text
    fn paste(&mut self, t: &Text)
    fn handle_key(&mut self, ke: KeyEvent) -> Bool
```

## `Dropdown<T>`

```verum
Dropdown.new(items: List<T>, label_fn: fn(&T) -> Text) -> Dropdown<T>
    .placeholder(t: Text) -> Self
    .closed_block(b: Block) -> Self
    .open_block(b: Block) -> Self
    .highlight_style(s: Style) -> Self
    .chevron_style(s: Style) -> Self
    .placeholder_style(s: Style) -> Self
    .search_style(s: Style) -> Self
    .max_visible(n: Int) -> Self
    .searchable(on: Bool) -> Self

DropdownState.new() -> DropdownState
    .with_selected(idx: Int) -> Self
    fn toggle(&mut self)
    fn close(&mut self)
    fn open_it(&mut self)
    fn handle_key<T>(&mut self, d: &Dropdown<T>, ke: KeyEvent) -> Bool
```

## `Split`

```verum
Split.horizontal() -> Split
Split.vertical()   -> Split
    .divider_style(s: Style) -> Self
    .dragging_style(s: Style) -> Self
    .show_divider(on: Bool) -> Self
    .divider_width(n: Int) -> Self
    .min_first(n: Int) -> Self
    .min_second(n: Int) -> Self

    fn layout(&self, area: Rect, state: &SplitState) -> (Rect, Rect, Rect)
    fn render_divider(&self, area: Rect, buf: &mut Buffer, state: &SplitState)

SplitState.ratio(r: Float) -> SplitState
SplitState.fixed(n: Int)   -> SplitState
    fn resize(&mut self, delta, available, min_first, min_second)
    fn set_ratio(&mut self, r: Float)
    fn set_fixed(&mut self, n: Int)
    fn focus_next(&mut self)
    fn handle_resize_key(&mut self, split: &Split, area: Rect, ke: KeyEvent, step: Int) -> Bool
    fn handle_mouse(&mut self, split: &Split, area: Rect, me: MouseEvent) -> Bool
```

## Other widgets

The following widgets are documented inline in the [widget
catalogue](../widgets/overview.md); their API surface follows the same
`Builder` / `StatefulWidget` conventions:

`Gauge`, `Tabs`, `Scrollbar`, `Canvas`, `Sparkline`, `BarChart`, `Tree`,
`Menu`, `Dialog`, `Spinner`, `Notification`.

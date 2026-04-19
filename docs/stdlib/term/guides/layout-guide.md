---
sidebar_position: 3
title: Layout recipes
description: Common layout patterns solved with Constraint, Flex, and Grid.
---

# Layout recipes

Ten layouts you'll reach for again and again.

## Header / body / footer

```verum
let chunks = Layout.new()
    .direction(Direction.Vertical)
    .constraints([
        Constraint.Length(3),
        Constraint.Min(1),
        Constraint.Length(1),
    ])
    .split(frame.size());

let (header, body, footer) = (chunks[0], chunks[1], chunks[2]);
```

Shortcut: `header_body_footer(area, 3, 1)`.

## Sidebar + main

```verum
let chunks = Layout.new()
    .direction(Direction.Horizontal)
    .constraints([Constraint.Length(25), Constraint.Min(1)])
    .split(area);
```

Shortcut: `sidebar_main(area, 25)`. For a **resizable** sidebar use the
[`Split`](../widgets/overview.md) widget.

## Equal columns

```verum
let cols = Layout.new()
    .direction(Direction.Horizontal)
    .constraints([
        Constraint.Ratio(1, 4), Constraint.Ratio(1, 4),
        Constraint.Ratio(1, 4), Constraint.Ratio(1, 4),
    ])
    .split(area);
```

Shortcut: `equal_columns(area, 4)`.

## Centered box

```verum
let pop = centered(area, 60, 20);       // 60×20 window centred in area
```

Equivalent manual layout with `Flex`:

```verum
FlexLayout.row()
    .justify(JustifyContent.Center)
    .align_items(AlignItems.Center)
    .compute(area, &[FlexItem.new().fixed(60).align(AlignItems.Center)]);
```

## Toolbar with flexible middle

```verum
let items = [
    FlexItem.new().fixed(10),              // left buttons
    FlexItem.new().grow(1.0),              // middle — expands
    FlexItem.new().fixed(15),              // right status
];
let rects = FlexLayout.row().gap(1).compute(area, &items);
```

## Wrapping cards

```verum
FlexLayout.row()
    .wrap(FlexWrap.Wrap)
    .justify(JustifyContent.FlexStart)
    .align_content(AlignContent.FlexStart)
    .gap(1)
    .compute(area, &cards)
```

Cards wrap onto additional rows when the main axis overflows.

## Form with label column

```verum
let rows = GridLayout.new()
    .columns([GridTrack.Fixed(12), GridTrack.Fr(1)])
    .rows([GridTrack.Fixed(1), GridTrack.Fixed(1), GridTrack.Fixed(1)])
    .gap(1)
    .compute(area);

// rows[0] = [label_rect, input_rect]
```

## Dashboard (header + 2×2 cards)

```verum
let page = Layout.new()
    .direction(Direction.Vertical)
    .constraints([Constraint.Length(3), Constraint.Min(1)])
    .split(area);

let grid = GridLayout.new()
    .columns([GridTrack.Fr(1), GridTrack.Fr(1)])
    .rows([GridTrack.Fr(1), GridTrack.Fr(1)])
    .gap(1)
    .compute(page[1]);

// grid[0][0], grid[0][1], grid[1][0], grid[1][1] are the four cards
```

## Responsive three-column

```verum
match current_breakpoint(area.width) {
    Mobile | Tablet => {
        // Stack vertically
        Layout.new().direction(Direction.Vertical).constraints([
            Constraint.Min(1), Constraint.Min(1), Constraint.Min(1),
        ]).split(area)
    }
    _ => {
        // Side by side
        Layout.new().direction(Direction.Horizontal).constraints([
            Constraint.Ratio(1, 3), Constraint.Ratio(1, 3), Constraint.Ratio(1, 3),
        ]).split(area)
    }
}
```

## Resizable split panes

```verum
let split = Split.horizontal()
    .min_first(15)
    .min_second(20);
let (left, div, right) = split.layout(area, &self.split_state);
split.render_divider(div, f.buffer, &self.split_state);
self.sidebar.render(left, f.buffer);
self.main.render(right, f.buffer);

// In handle_event:
if let Event.Mouse(me) = event {
    self.split_state.handle_mouse(&split, area, me);
}
if let Event.Key(ke) = event {
    self.split_state.handle_resize_key(&split, area, ke, 2);
}
```

## Margins and padding

`Rect.inner(margin)` shrinks on all four sides:

```verum
let body = Block.new().borders(Borders.ALL).inner(frame.size());
let content = body.inner(Margin.new(1, 2));   // 1 row, 2 cols padding
```

`Block`'s borders already subtract one cell per side; extra padding goes on
top of that.

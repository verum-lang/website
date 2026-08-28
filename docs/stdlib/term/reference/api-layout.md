---
sidebar_position: 3
title: API reference — layout
description: Rect, Constraint, Flex, Grid, Responsive.
---

# API reference — layout

All types live in `core.term.layout`. See [the layout concept
page](../concepts/layout-system.md) for guided usage.

## `Rect`

```verum
public type Rect is { x: Int, y: Int, width: Int, height: Int };

Rect.new(x, y, w, h) -> Rect
    fn right(&self)  -> Int           // x + width
    fn bottom(&self) -> Int           // y + height
    fn inner(&self, m: Margin) -> Rect
    fn is_empty(&self) -> Bool
    fn contains(&self, x: Int, y: Int) -> Bool
```

## `Margin`

```verum
public type Margin is { top: Int, right: Int, bottom: Int, left: Int };

Margin.new(v: Int, h: Int) -> Margin             // vertical, horizontal
Margin.all(n: Int) -> Margin
Margin.custom(top, right, bottom, left) -> Margin
```

## `Constraint`

```verum
public type Constraint is
    | Length(Int)
    | Min(Int)
    | Max(Int)
    | Percentage(Int)
    | Ratio(Int, Int)
    | Fill(Int);

public type Direction is Horizontal | Vertical;

public type Flex is Start | Center | End | SpaceBetween | SpaceAround;

// From core/term/layout/constraint.vr. The type is `TermLayout`, not
// `Layout` — `Layout` is taken twice elsewhere in the stdlib
// (`core/math/tensor.vr` aliases it to `TensorLayout`, and
// `core/mem/allocator.vr` declares its own), and a bare `Layout` here
// resolves to one of those.
//
// Direction is chosen by the CONSTRUCTOR, so there is no
// `.direction(...)` builder.
public type TermLayout is {
    direction: Direction, constraints: List<LayoutConstraint>,
    margin: Margin, flex: Flex, spacing: Int,
};

TermLayout.horizontal() -> TermLayout
TermLayout.vertical()   -> TermLayout
    .constraints(cs: List<LayoutConstraint>) -> TermLayout
    .margin(m: Margin) -> TermLayout
    .flex(f: Flex) -> TermLayout
    .spacing(n: Int) -> TermLayout
    .split(&self, area: Rect) -> List<Rect>
```

## Flex layout

```verum
public type FlexLayout is {
    direction: FlexDirection,
    wrap: FlexWrap,
    justify_content: JustifyContent,
    align_items: AlignItems,
    align_content: AlignContent,
    gap: Int,
};

public type FlexDirection is Row | RowReverse | Column | ColumnReverse;
public type FlexWrap is NoWrap | Wrap | WrapReverse;

public type JustifyContent is
    | FlexStart | FlexEnd | Center
    | SpaceBetween | SpaceAround | SpaceEvenly;

public type AlignItems  is Stretch | FlexStart | FlexEnd | Center | Baseline;
public type AlignContent is FlexStart | FlexEnd | Center | Stretch | SpaceBetween | SpaceAround;

public type FlexBasis is Auto | Fixed(Int) | Percentage(Int);

public type FlexItem is {
    basis: FlexBasis,
    grow: Float,
    shrink: Float,
    min_size: Maybe<Int>,
    max_size: Maybe<Int>,
    align_self: Maybe<AlignItems>,
};

FlexLayout.row()
FlexLayout.column()
    .wrap(w)            .justify(j)         .align_items(a)
    .align_content(ac)  .gap(n)
    .compute(container: Rect, items: &List<FlexItem>) -> List<Rect>

FlexItem.new()
    .grow(f: Float)     .shrink(f: Float)   .fixed(n: Int)
    .percentage(p: Int) .min(n: Int)        .max(n: Int)
    .align(a: AlignItems)
```

## Grid layout

```verum
public type GridTrack is
    | Fixed(Int)
    | Fr(Float)
    | MinMax(Int, Int)
    | Auto;

public type GridLayout is { ... };

GridLayout.new(columns: List<GridTrack>, rows: List<GridTrack>)
    .gap(n: Int)                  // or .column_gap(n) / .row_gap(n)
    .compute(area: &Rect) -> List<List<Rect>>   // [row][column]
```

## Shortcuts

```verum
mount core.term.layout.shortcuts.*;

fn header_body_footer(area: Rect, header_h: Int, footer_h: Int) -> (Rect, Rect, Rect);
fn sidebar_main(area: Rect, sidebar_w: Int) -> (Rect, Rect);
fn centered(area: Rect, w: Int, h: Int) -> Rect;
fn equal_columns(area: Rect, n: Int) -> List<Rect>;
fn equal_rows(area: Rect, n: Int) -> List<Rect>;
```

## Responsive

```verum
public type Breakpoint is Mobile | Tablet | Desktop | Wide;

public fn current_breakpoint(width: Int) -> Breakpoint;
```

Thresholds: `Mobile < 80 ≤ Tablet < 120 ≤ Desktop < 180 ≤ Wide`.

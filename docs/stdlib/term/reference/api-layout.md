---
sidebar_position: 3
title: API reference — layout
description: Rect, LayoutConstraint, TermLayout, Flex, FlexLayout, GridLayout, Responsive.
---

# API reference — layout

All types live in `core.term.layout`. See [the layout concept
page](../concepts/layout-system.md) for guided usage.

## `Rect`

```verum
public type Rect is { x: Int, y: Int, width: Int, height: Int };

Rect.new(x, y, w, h) -> Rect
    fn area(&self)   -> Int           // width * height
    fn left(&self)   -> Int           fn top(&self)    -> Int
    fn right(&self)  -> Int           // x + width
    fn bottom(&self) -> Int           // y + height
    fn is_empty(&self) -> Bool
    fn contains(&self, x: Int, y: Int) -> Bool
    fn inner(&self, m: Margin) -> Rect
    fn intersection(&self, other: &Rect) -> Rect
    fn union(&self, other: &Rect) -> Rect
    fn centered(&self, width: Int, height: Int) -> Rect
    fn clamp_position(&self, x: Int, y: Int) -> (Int, Int)
    // Both split at ONE position and answer the PAIR:
    fn split_horizontal(&self, at: Int) -> (Rect, Rect)
    fn split_vertical(&self, at: Int)   -> (Rect, Rect)
```

## `Margin`

```verum
public type Margin is { top: Int, right: Int, bottom: Int, left: Int };

// There is no `Margin.new`, `.all` or `.custom`. Four constructors,
// and `symmetric` takes HORIZONTAL first.
Margin.uniform(n: Int) -> Margin
Margin.horizontal(n: Int) -> Margin
Margin.vertical(n: Int) -> Margin
Margin.symmetric(h: Int, v: Int) -> Margin
Margin.ZERO                                      // the const
    fn total_horizontal(&self) -> Int
    fn total_vertical(&self) -> Int
```

## `LayoutConstraint`

The type is `LayoutConstraint` — this page used `Constraint` in the
heading and `LayoutConstraint` in every signature below it. (`Constraint`
is a different type, in `core.database`.)

```verum
public type LayoutConstraint is
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
```

| | |
|---|---|
| `FlexLayout.row()` |  |
| `FlexLayout.column()` |  |
| `.wrap(w)` |  |
| `.justify(j)` |  |
| `.align_items(a)` |  |
| `.align_content(ac)  .gap(n)` |  |
| `.compute(container: Rect, items: &List<FlexItem>) -> List<Rect>` |  |
| `FlexItem.new()` |  |
| `.grow(f: Float)` |  |
| `.shrink(f: Float)` |  |
| `.fixed(n: Int)` |  |
| `.percentage(p: Int) .min(n: Int)` |  |
| `.max(n: Int)` |  |
| `.align(a: AlignItems)` |  |

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
fn sidebar_main(area: Rect, sidebar_width: Int) -> (Rect, Rect);
fn centered(area: Rect, width: Int, height: Int) -> Rect;
fn equal_columns(area: Rect, n: Int) -> List<Rect>;
fn equal_rows(area: Rect, n: Int) -> List<Rect>;
fn percentage_split(area: Rect, percentages: &List<Int>) -> List<Rect>;
fn percentage_rows(area: Rect, percentages: &List<Int>) -> List<Rect>;
```

## Responsive

`Breakpoint` is a RECORD carrying its own threshold and name, not a
four-variant sum. The four standard ones are module CONSTANTS, so a
project can define its own beside them.

```verum
public type Breakpoint is { min_width: Int, name: Text };

public const MOBILE:  Breakpoint = Breakpoint { min_width:   0, name: "mobile"  };
public const TABLET:  Breakpoint = Breakpoint { min_width:  80, name: "tablet"  };
public const DESKTOP: Breakpoint = Breakpoint { min_width: 120, name: "desktop" };
public const WIDE:    Breakpoint = Breakpoint { min_width: 160, name: "wide"    };

public fn current_breakpoint(width: Int) -> Breakpoint;
```

Thresholds: `mobile < 80 ≤ tablet < 120 ≤ desktop < 160 ≤ wide` — the
last boundary is 160, and `current_breakpoint` compares against
`min_width` from the widest down.

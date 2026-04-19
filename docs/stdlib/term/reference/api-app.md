---
sidebar_position: 2
title: API reference — app framework
description: Model / Command / Subscription / run / run_async.
---

# API reference — application framework

All symbols live in `core.term.app`; most are re-exported from
`core.term.prelude.*`.

## `Model` protocol

```verum
public type Model is protocol {
    type Msg;

    fn init(&self) -> Command<Self.Msg> { Command.none() }
    fn update(&mut self, msg: Self.Msg) -> Command<Self.Msg>;
    fn view(&self, frame: &mut Frame);
    fn handle_event(&self, event: Event) -> Maybe<Self.Msg> { None }
    fn subscriptions(&self) -> Subscription<Self.Msg> { Subscription.None }
    fn on_quit(&mut self) {}
};
```

## `Command<Msg>`

```verum
public type Command<Msg> is
    | Noop
    | Perform(fn() -> Msg)
    | Async(Heap<dyn Future<Output = Msg>>)
    | Batch(List<Command<Msg>>)
    | Sequence(List<Command<Msg>>)
    | Tick(Duration, fn() -> Msg)
    | Quit;

// builders
public fn none<Msg>() -> Command<Msg>
public fn perform<Msg>(f: fn() -> Msg) -> Command<Msg>
public fn task<Msg, F: Future<Output = Msg>>(fut: F) -> Command<Msg>
public fn batch<Msg>(cmds: List<Command<Msg>>) -> Command<Msg>
public fn sequence<Msg>(cmds: List<Command<Msg>>) -> Command<Msg>
public fn tick<Msg>(delay: Duration, f: fn() -> Msg) -> Command<Msg>
public fn quit<Msg>() -> Command<Msg>

// combinators
impl<Msg> Command<Msg> {
    fn is_noop(&self) -> Bool
    fn and(self, other: Command<Msg>) -> Command<Msg>    // fan-out; absorbs Noop
    fn then(self, other: Command<Msg>) -> Command<Msg>   // serial; flattens Sequence
}
```

## `Subscription<Msg>`

```verum
public type Subscription<Msg> is
    | None
    | Interval(Duration, fn() -> Msg)
    | Every(Duration, fn(Instant) -> Msg)
    | Once(Duration, fn() -> Msg)
    | StreamSub(Heap<dyn Stream<Item = Msg>>)
    | Batch(List<Subscription<Msg>>);

public fn none<Msg>() -> Subscription<Msg>
public fn interval<Msg>(period: Duration, f: fn() -> Msg) -> Subscription<Msg>
public fn every<Msg>(period: Duration, f: fn(Instant) -> Msg) -> Subscription<Msg>
public fn once<Msg>(delay: Duration, f: fn() -> Msg) -> Subscription<Msg>
public fn from_stream<Msg>(s: Heap<dyn Stream<Item = Msg>>) -> Subscription<Msg>
public fn batch<Msg>(subs: List<Subscription<Msg>>) -> Subscription<Msg>
```

## Entry points

```verum
/// Synchronous entry — blocks on the async runtime internally.
public fn run<M: Model>(model: M) -> IoResult<()>;

/// Async entry — integrates with user futures via select / join.
public async fn run_async<M: Model>(model: M) -> IoResult<()>;
```

## Prompts

```verum
public fn confirm(message: Text) -> IoResult<Bool>;
public fn select(message: Text, options: &List<Text>) -> IoResult<Maybe<Int>>;
public fn input(message: Text) -> IoResult<Text>;
public fn multi_select(message: Text, options: &List<Text>) -> IoResult<List<Int>>;
public fn password(message: Text) -> IoResult<Text>;
```

All prompts take over the terminal, render a single interactive view,
and restore on return. Suitable for CLI tools that need a quick choice.

## Accessibility

```verum
public type SemanticZone is
    | Prompt
    | CommandInput
    | CommandOutput
    | CommandEnd { exit_code: Int }
    | Region { role: Text, label: Text }
    | Live { politeness: Politeness };

public type Politeness is Off | Polite | Assertive;

public fn write_semantic_zone(writer: &mut (dyn EscapeWriter), zone: SemanticZone) -> IoResult<()>;
public fn mark_prompt_start(writer: &mut (dyn EscapeWriter))      -> IoResult<()>;
public fn mark_command_input(writer: &mut (dyn EscapeWriter))     -> IoResult<()>;
public fn mark_command_output(writer: &mut (dyn EscapeWriter))    -> IoResult<()>;
public fn mark_command_end(writer: &mut (dyn EscapeWriter), exit_code: Int) -> IoResult<()>;
```

These emit OSC 133 sequences; integrating shells (`iTerm`, `WezTerm`,
`Ghostty`, `Kitty`) use them for scrollback semantics and screen-reader
integration.

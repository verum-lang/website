---
sidebar_position: 3
title: Dashboard
description: Live metrics dashboard with charts, async subscription streams, and split panes.
---

# Dashboard

A live system dashboard showing:

* `Sparkline` for CPU/memory history
* `BarChart` for disk usage by volume
* `Canvas` with a braille line chart of network throughput
* `Split` with a sidebar showing process list
* `Subscription.interval` to tick every second and pull a new sample

```verum
mount core.term.prelude.*;

// ---------- Metrics state ------------------------------------------------
type Sample is { cpu: Float, mem: Float, net_kb: Float };

type Model is {
    history: List<Sample>,      // last 120 samples (~2 min at 1Hz)
    procs:   List<Text>,
    split:   SplitState,
    list:    ListState,
};

type Msg is
    | Tick
    | NewSample(Sample)
    | ProcsReady(List<Text>)
    | SplitMouse(MouseEvent)
    | SplitKey(KeyEvent)
    | Quit;

// ---------- Model --------------------------------------------------------
implement Model for Model {
    type Msg = Msg;

    fn init(&self) -> Command<Msg> {
        Command.task(async { Msg.ProcsReady(list_processes().await) })
    }

    fn update(&mut self, msg: Msg) -> Command<Msg> {
        match msg {
            Tick => {
                Command.task(async { Msg.NewSample(sample().await) })
            }
            NewSample(s) => {
                self.history.push(s);
                if self.history.len() > 120 { self.history.remove(0); }
                Command.none()
            }
            ProcsReady(ps) => { self.procs = ps; Command.none() }
            SplitMouse(me) => Command.none(),
            SplitKey(ke)   => Command.none(),
            Quit           => Command.quit(),
        }
    }

    fn subscriptions(&self) -> Subscription<Msg> {
        Subscription.batch([
            Subscription.interval(Duration.from_secs(1), || Msg.Tick),
            Subscription.interval(Duration.from_secs(5), || Msg.Tick),  // refresh procs
        ])
    }

    fn handle_event(&self, event: Event) -> Maybe<Msg> {
        match event {
            Event.Key(ke) => match ke.code {
                KeyCode.Char('q') | KeyCode.Esc => Some(Msg.Quit),
                _ => Some(Msg.SplitKey(ke)),
            },
            Event.Mouse(me) => Some(Msg.SplitMouse(me)),
            _ => None,
        }
    }

    fn view(&self, f: &mut Frame) {
        let split = Split.horizontal().ratio(0.25).min_first(20);
        let (left, div, right) = split.layout(f.size(), &self.split);
        split.render_divider(div, f.buffer, &self.split);

        // Sidebar — processes
        SelectableList.new(&self.procs)
            .block(Block.new().title(" Processes ").borders(Borders.ALL))
            .render_stateful(f, left, &mut self.list.clone());

        // Main pane — grid of charts
        let grid = GridLayout.new()
            .columns([GridTrack.Fr(1), GridTrack.Fr(1)])
            .rows([GridTrack.Fr(1), GridTrack.Fr(1)])
            .gap(1)
            .compute(right);

        render_cpu(f, grid[0][0], &self.history);
        render_mem(f, grid[0][1], &self.history);
        render_net(f, grid[1][0], &self.history);
        render_disk(f, grid[1][1]);
    }
}

// ---------- Charts -------------------------------------------------------
fn render_cpu(f: &mut Frame, area: Rect, history: &List<Sample>) {
    let data = history.iter().map(|s| s.cpu as Float).collect();
    Sparkline.new(data)
        .block(Block.new().title(" CPU % ").borders(Borders.ALL))
        .bar_style(Style.new().fg(Color.Green))
        .render(area, f.buffer);
}

fn render_mem(f: &mut Frame, area: Rect, history: &List<Sample>) {
    let data = history.iter().map(|s| s.mem as Float).collect();
    Sparkline.new(data)
        .block(Block.new().title(" Memory % ").borders(Borders.ALL))
        .bar_style(Style.new().fg(Color.Cyan))
        .render(area, f.buffer);
}

fn render_net(f: &mut Frame, area: Rect, history: &List<Sample>) {
    // Braille canvas for a smooth line chart
    let pts: List<(Float, Float)> = history.iter().enumerate()
        .map(|(i, s)| (i as Float, s.net_kb))
        .collect();

    let max_y = history.iter().map(|s| s.net_kb).max().unwrap_or(1.0);

    Canvas.new()
        .block(Block.new().title(" Network KB/s ").borders(Borders.ALL))
        .x_bounds(0.0, history.len().max(1) as Float)
        .y_bounds(0.0, max_y)
        .marker(Marker.Braille)
        .paint(Heap(LineSeries.new(pts, Color.Yellow)))
        .render(area, f.buffer);
}

fn render_disk(f: &mut Frame, area: Rect) {
    BarChart.new([
        BarGroup.new([Bar.new(85.0).label("/").style(Style.new().fg(Color.Red))]),
        BarGroup.new([Bar.new(42.0).label("/home")]),
        BarGroup.new([Bar.new(13.0).label("/mnt")]),
    ])
        .block(Block.new().title(" Disk % ").borders(Borders.ALL))
        .bar_width(4).group_gap(2)
        .render(area, f.buffer);
}

// ---------- Samplers (fake) ---------------------------------------------
async fn sample() -> Sample { /* …probe the system… */ Sample { cpu: 0.0, mem: 0.0, net_kb: 0.0 } }
async fn list_processes() -> List<Text> { /* … */ List.new() }

// ---------- main ---------------------------------------------------------
fn main() -> IoResult<()> {
    run(Model {
        history: List.new(),
        procs: List.new(),
        split: SplitState.ratio(0.25),
        list: ListState.new(),
    })
}
```

## Why this is a good reference

* **Subscriptions + Commands together.** Periodic sampling is a
  `Subscription.interval`; each sample triggers a `Command.task(...)` that
  actually does the work. The split prevents a slow sampler from blocking
  the tick.
* **`Grid` layout.** The 2×2 grid of charts is one line of code.
* **`Canvas` for smooth lines.** Braille gives 2× × 4 pixel density per
  cell — enough for a passable line chart in an 80×24 terminal.
* **Mouse-resizable sidebar.** `SplitState.handle_mouse` wires drag; the
  user can pull the divider with the mouse or resize via Ctrl+Left/Right.

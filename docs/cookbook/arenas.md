---
title: Arenas for parser trees
description: Bulk-allocate, bulk-free. Bypass per-object CBGR for request-scoped work.
---

# Arenas

An arena is a block of memory that allocates O(1), never frees
individual items, and invalidates every object at once on one call.

`GenerationalArena` does **not** implement `Drop`: the buffer is released
by an explicit `destroy()`, and `reset()` keeps the buffer while bumping
the generation. Neither happens by going out of scope.

**When to reach for an arena:**

- Parse trees inside a single parse.
- Game-loop objects inside a single frame.
- Request-scoped allocation inside a single HTTP request.
- Anything with a well-defined "batch lifetime."

---

## `GenerationalArena`

:::caution It is a byte arena, not a slotmap
`GenerationalArena` is **not generic**, and there is no `ArenaHandle<T>`,
`insert`, `get`, `get_mut` or `remove` — an earlier version of this page
described all of them. What ships is a bump allocator over a byte
buffer: it hands back an **address** (`Int`), and a single shared
generation counter invalidates every outstanding reference at once.
:::

```verum
mount core.mem.{GenerationalArena, ArenaConfig};

let mut arena = GenerationalArena.new(4096);       // capacity in BYTES

let addr = arena.alloc(64);                        // 0 when it cannot fit
let aligned = arena.alloc_aligned(64, 32);         // no auto-growth on this path

arena.used()        // bytes handed out         arena.capacity()
arena.remaining()   // capacity - used          arena.alloc_count()
arena.generation()  // the stamp for a ThinRef into this arena
arena.contains_ptr(addr)                           // is this address ours?
```

`alloc` grows the buffer when the config allows it; `alloc_aligned` does
not, because growing moves the base address and the new base need not
satisfy the alignment the caller asked for. Size an arena that needs
alignment up front:

```verum
let mut arena = GenerationalArena.with_config(ArenaConfig.fixed(1 << 20));
```

The generation is what makes a stale pointer *detectable* rather than
dangling. `arena.generation()` is the value to stamp into a `ThinRef`
built over arena memory, so that after a `reset()` the CBGR check on
that reference fails with `UseAfterFreeError` instead of reading
recycled bytes.

```verum
arena.reset();      // O(1): bumps the generation, rewinds `used` to 0
                    // the buffer itself is kept and reused
arena.destroy();    // returns the buffer to the allocator
```

---

## Context-scoped allocation

`GenerationalArena` does **not** implement `Allocator`, so it cannot be
`provide`d. The bump allocator that does is `MemStackAllocator` — the
four `Allocator` implementors are `GlobalAllocator`, `TieredAllocator`,
`SimpleAllocator` and `MemStackAllocator`.

```verum
mount core.mem.MemStackAllocator;

fn parse(source: &Text) -> Result<Ast, ParseError> {
    let mut bump = MemStackAllocator.init(1 << 20)?;      // 1 MiB
    let ast = provide Allocator = bump in {
        parse_body(source)             // every Heap.new inside bumps
    };
    bump.reset();                      // O(1) rewind for the next parse
    Result.Ok(ast)
}
```

Inside the `provide` block, every `Heap.new(...)` allocation routes
through the bump allocator. Outside the block, normal CBGR allocation
resumes. `bump.used()` and `bump.peak()` report how much of the
reservation the batch actually needed.

---

## Nested scopes — `snapshot` / `restore`

:::caution `new_region` does not exist
There is no `core.security.new_region` and no `Region<'_, T>`. The
closure-scoped form this section described was never implemented.
:::

The arena's scope is explicit rather than lexical, and nesting comes
from a saved bump position:

```verum
type ArenaSnapshot is { used: Int, alloc_count: Int, generation: Int };

let mut arena = GenerationalArena.new(64 * 1024);
let mark = arena.snapshot();

let root = parse_into_arena(source, &mut arena);
let stats = compute_statistics(root);

arena.restore(mark);      // everything allocated since `mark` is gone
```

`restore` returns `Bool`, and it returns **false** when the snapshot is
stale — that is, when a `reset()` intervened and bumped the generation.
Check it rather than discarding it: a false there means the rollback did
not happen and the bump pointer is wherever `reset` left it.

:::warning `restore` is weaker than `reset`
`restore` rolls the bump pointer back **without** bumping the
generation. References into the rolled-back span therefore become
address-invalid but stay generation-**valid**: the CBGR check passes and
reads bytes the arena has since handed to someone else. `reset()` is the
one that makes stale references detectable. Use `restore` only where you
can see that nothing kept a reference across the mark.
:::

---

## Pattern — parser with arena

Because the arena deals in bytes and addresses, a typed tree over it is
built the way any index-based tree is: nodes live in a `List`, and the
arena backs the batch lifetime rather than the individual nodes. The
node identity a parser passes around is an index, not an arena handle.

```verum
type NodeId is (Int);

type Node is
    | Num(Float)
    | Add { lhs: NodeId, rhs: NodeId }
    | Mul { lhs: NodeId, rhs: NodeId };

type ParseCtx is {
    nodes: List<Node>,
};

implement ParseCtx {
    fn alloc(&mut self, n: Node) -> NodeId {
        let id = NodeId(self.nodes.len());
        self.nodes.push(n);
        id
    }
    fn get(&self, id: NodeId) -> &Node {
        &self.nodes[id.0]
    }
}

fn parse_expr(ctx: &mut ParseCtx, tokens: &mut List<Token>) -> Result<NodeId, ParseError> {
    let lhs = parse_term(ctx, tokens)?;
    if peek(tokens) == Token.Plus {
        consume(tokens);
        let rhs = parse_expr(ctx, tokens)?;
        Result.Ok(ctx.alloc(Node.Add { lhs, rhs }))
    } else {
        Result.Ok(lhs)
    }
}
```

Wrapping that parse in `provide Allocator = bump` is what makes the
allocation profile arena-shaped: one reservation up front instead of one
CBGR allocation per `List` growth, and an O(1) rewind at the end.
`NodeId` stays `Copy`, so the tree carries no lifetimes either way.

---

## Performance

This page used to carry a table — `Heap<Node>` per node at 145 ms /
88 MB against `GenerationalArena` at 82 ms / 42 MB on an M3 Max, and
before that a `new_region` row too. Every row measured an API that does
not exist, so all of them are removed rather than corrected. No
replacement figure is quoted here until someone runs the comparison on
the arena that ships.

The shape of the argument survives the numbers: an arena beats
per-object heap allocation when the objects are small and the lifetime
is well-scoped, because it trades N allocations and N CBGR stamps for
one reservation and one generation bump.

---

## Pitfalls

- **Do not hold an address past a `reset()` or `destroy()`.** A
  reference stamped with the old generation fails the CBGR check on the
  next deref — that is the arena working, not a bug to route around.
- **`alloc` answers `0` on failure**, it does not return a `Result`.
  Check it. `alloc_aligned` additionally refuses rather than growing.
- **`restore` answers `false`** when a `reset()` has invalidated the
  snapshot. Do not discard that Bool.
- **Arenas are not thread-safe by default.** Use
  `Shared<Mutex<GenerationalArena>>` if multiple tasks allocate into the
  same arena.
- **Don't use an arena for data that outlives the batch.** Results
  that escape must be copied out to ordinary `Heap`/`Shared` storage
  before the arena ends.

---

## See also

- **[mem → arena](/docs/stdlib/mem#generationalarena)**
- **[mem → the allocator protocol](/docs/stdlib/mem#allocator-protocol)** —
  what `provide Allocator` actually requires.
- **[mem → capabilities](/docs/stdlib/mem#capabilities)** — the
  capability bits stamped alongside the generation.
- **[Performance](/docs/guides/performance)** — when to use arenas.

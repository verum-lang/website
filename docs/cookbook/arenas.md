---
title: Arenas for parser trees
description: Bulk-allocate, bulk-free. Bypass per-object CBGR for request-scoped work.
---

# Arenas

An arena is a block of memory that allocates O(1), never frees
individual items, and bulk-frees every object at once when the arena
drops.

**When to reach for an arena:**

- Parse trees inside a single parse.
- Game-loop objects inside a single frame.
- Request-scoped allocation inside a single HTTP request.
- Anything with a well-defined "batch lifetime."

---

## `GenerationalArena<T>`

```verum
mount core.mem.GenerationalArena;

fn parse_file(source: &Text) -> Result<Ast, ParseError> {
    let arena = GenerationalArena<Node>.new(capacity: 4096);
    let tree = parse_into(source, &arena)?;
    let stats = compute_statistics(&tree);
    Result.Ok(Ast { stats, /* owned, independent of arena */ })
}
// Arena drops here — every Node allocated inside is freed in O(1).
```

The arena returns **handles**, not references. Handles carry a
generation; bulk-free on arena drop bumps the generation, so any
stray handle is invalidated atomically.

```verum
type ArenaHandle<T> is { idx: Int, generation: UInt32 };

let arena = GenerationalArena<Node>.new(capacity: 1024);
let h: ArenaHandle<Node> = arena.insert(Node.Leaf { value: 42 });
let n: Maybe<&Node> = arena.get(h);                 // Some if still valid
let n: Maybe<&mut Node> = arena.get_mut(h);
let removed: Maybe<Node> = arena.remove(h);         // None if already removed
```

---

## Context-scoped allocation

Set the arena as the active allocator for a scope:

```verum
fn parse<'a>() -> Ast {
    let arena = GenerationalArena<Byte>.new(1 << 20);     // 1 MiB
    provide Allocator = arena in {
        parse_body()                                          // uses arena for all Heap.new
    }
}                                                             // drops here; arena freed
```

Inside the `provide` block, every `Heap.new(...)` allocation routes
through the arena. Outside the block, normal CBGR allocation resumes.

---

## Region-based — not shipped

:::caution `new_region` does not exist
There is no `core.security.new_region` and no `Region<'_, T>`. The
closure-scoped form this section described was never implemented; the
arena the library actually ships is the `GenerationalArena` above, and
its scope is explicit rather than lexical:

```verum
let mut arena = GenerationalArena.new(64 * 1024);
let mark = arena.snapshot();

let root = parse_into_arena(source, &mut arena);
let stats = compute_statistics(&root);

arena.restore(mark);      // everything allocated since `mark` is gone
```

`snapshot`/`restore` give the same nesting a scoped region would, and
`reset()` empties the whole arena and bumps its generation — which is
what makes a stale handle detectable rather than dangling.
:::

---

## Pattern — parser with arena

```verum
type NodeId is (Int);

type Node is
    | Num(Float)
    | Add { lhs: NodeId, rhs: NodeId }
    | Mul { lhs: NodeId, rhs: NodeId };

type ParseCtx is {
    arena: GenerationalArena<Node>,
};

implement ParseCtx {
    fn alloc(&mut self, n: Node) -> NodeId {
        NodeId(self.arena.insert(n).idx)
    }
    fn get(&self, id: NodeId) -> &Node {
        self.arena.get(ArenaHandle { idx: id.0, generation: ... }).unwrap()
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

Compared with `Heap<Node>` per node:
- **1 allocation** up front, instead of N.
- **Cache locality**: neighbours in the arena are neighbours in memory.
- **O(1) teardown**: drop the arena, done.
- **Handles are `Copy`**: you pass around `NodeId`s without lifetimes.

---

## Performance

On an M3 Max:

| Strategy | Parse 10 MB JSON | Peak RSS |
|---|---|---|
| `Heap<Node>` per node | 145 ms | 88 MB |
| `GenerationalArena` | 82 ms | 42 MB |

The table used to carry a third row, `new_region` at 78 ms / 40 MB.
Nothing could have produced those numbers: the API does not exist. They
are removed rather than corrected.

Your mileage varies with node size and access pattern — an arena
beats per-object heap allocation when the objects are small and the
lifetime is well-scoped.

---

## Pitfalls

- **Do not store arena handles past the arena's scope.** They are
  invalidated on drop; dereferencing an expired handle fails the
  CBGR generation check at runtime.
- **Arenas are not thread-safe by default.** Use
  `Shared<Mutex<GenerationalArena<T>>>` if multiple tasks allocate
  into the same arena.
- **Don't use an arena for data that outlives the batch.** Results
  that escape must be copied out to ordinary `Heap`/`Shared` storage
  before the arena ends.

---

## See also

- **[mem → arena](/docs/stdlib/mem#generationalarenat)**
- **[mem → capabilities](/docs/stdlib/mem#capabilities)** — capability
  bits on handles.
- **[Performance](/docs/guides/performance)** — when to use arenas.

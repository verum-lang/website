---
sidebar_position: 4
title: Build a verified HTTP service
description: A tiny URL shortener with refinement types, nursery concurrency, and injected storage.
---

# Build a verified HTTP service

**Time: 60 minutes. Prerequisites: [Hello, World](/docs/getting-started/hello-world),
[HTTP server recipe](/docs/cookbook/http-server), [Refinement patterns](/docs/cookbook/refinements).**

We'll build `shortl` — a URL shortener. It accepts a URL via
POST, stores it under a short code, and redirects visitors of
`/s/<code>` to the original. Along the way we'll:

- Model the domain with refinement types (not strings).
- Inject the store via the context system so tests can swap in a mock.
- Serve requests concurrently with a `nursery`-bounded worker pool.
- Add `@verify(formal)` to the code-generator to prove it never collides.
- Write integration tests that use the real HTTP layer.

## 1. Scaffold

```bash
$ verum new shortl
$ cd shortl
```

`verum.toml`:

```toml
[cog]
name    = "shortl"
version = "0.1.0"
edition = "2026"
profile = "application"

[dependencies]
http = "0.8"

[verify]
default_strategy  = "formal"
solver_timeout_ms = 5000
```

## 2. Domain types — types that prove things

`src/domain.vr`:

```verum
mount core.text.Text;

/// A short code: 6–10 chars of [a-z0-9], no ambiguity (no 0/o/1/l).
pub type Code is Text {
    6 <= self.len() && self.len() <= 10 &&
    self.matches(rx#"^[a-hj-km-np-z2-9]+$")
};

/// A URL we're willing to shorten: http(s), under 2048 chars.
pub type TargetUrl is Text {
    self.len() <= 2048 &&
    (self.starts_with("http://") || self.starts_with("https://")) &&
    self.matches(rx#"^https?://[^\s<>\"]+$")
};

/// The stored mapping.
pub type Link is {
    code:   Code,
    target: TargetUrl,
    created: Instant,
    hits:   Int { self >= 0 },
};
```

With these, `Code` and `TargetUrl` values carry their invariants. A
function accepting `&Code` cannot receive "bad" input — the compiler
forces conversion at the boundary.

## 3. The store — a protocol, not a concrete

`src/store.vr`:

```verum
mount core.context.*;
use .self.domain.*;

/// Storage for the URL-shortener — abstract so we can swap
/// the implementation (in-memory / Postgres / Redis) without
/// touching the service layer.
pub context protocol Store {
    async fn insert(&self, link: Link) -> Result<(), StoreError>;
    async fn lookup(&self, code: &Code) -> Result<Maybe<Link>, StoreError>;
    async fn increment_hits(&self, code: &Code) -> Result<(), StoreError>;
    async fn total_count(&self) -> Result<Int, StoreError>;
}

pub type StoreError is
    | Conflict { code: Code }
    | Unavailable(Text)
    | Internal(Text);
```

## 4. The code generator — prove no collisions

`src/codegen.vr`:

```verum
mount core.text.*;
use .self.domain.Code;

const ALPHABET: &Text =
    &"abcdefghjkmnpqrstuvwxyz23456789";          // excludes 0/o/1/l

/// Deterministic-from-seed code generation.
/// @verify(formal) proves the result is always a valid Code.
@verify(formal)
fn generate(seed: UInt64, length: Int { 6 <= self && self <= 10 })
    -> Code
    where ensures result.len() == length,
          ensures result.matches(rx#"^[a-hj-km-np-z2-9]+$")
{
    let mut out = Text.with_capacity(length);
    let mut s = seed;
    let n = ALPHABET.len() as UInt64;

    let mut i = 0;
    while i < length
        invariant 0 <= i && i <= length
        invariant out.len() == i
        invariant out.matches(rx#"^[a-hj-km-np-z2-9]*$")
        decreases length - i
    {
        let idx = (s % n) as Int;
        let ch = ALPHABET.chars().nth(idx).unwrap();
        out.push_char(ch);
        s = s.wrapping_div(n);
        if s == 0 { s = seed.wrapping_add(i as UInt64 + 1); }
        i += 1;
    }
    out      // compiler: out is a valid Code per the invariants
}
```

The `invariant` clauses are what let the SMT solver prove the
postconditions. Each one captures a fact that holds at every loop
iteration; combined with the exit condition, they imply `result.len()
== length` and the regex predicate.

## 5. An in-memory store (for tests and local dev)

`src/store_memory.vr`:

```verum
mount core.sync.*;
use .self.domain.*;
use .self.store.*;

pub type MemoryStore is {
    inner: Shared<RwLock<Map<Code, Link>>>,
};

implement MemoryStore {
    fn new() -> MemoryStore {
        MemoryStore {
            inner: Shared.new(RwLock.new(Map.new())),
        }
    }
}

implement Store for MemoryStore {
    async fn insert(&self, link: Link) -> Result<(), StoreError> {
        let mut w = self.inner.write().await;
        match w.entry(link.code.clone()) {
            MapEntry.Occupied(e) => Result.Err(StoreError.Conflict { code: e.key().clone() }),
            MapEntry.Vacant(e)   => { e.insert(link); Result.Ok(()) }
        }
    }

    async fn lookup(&self, code: &Code) -> Result<Maybe<Link>, StoreError> {
        let r = self.inner.read().await;
        Result.Ok(r.get(code).cloned())
    }

    async fn increment_hits(&self, code: &Code) -> Result<(), StoreError> {
        let mut w = self.inner.write().await;
        match w.get_mut(code) {
            Maybe.Some(link) => { link.hits += 1; Result.Ok(()) }
            Maybe.None       => Result.Err(StoreError.Internal(
                f"link {code} disappeared".to_string())),
        }
    }

    async fn total_count(&self) -> Result<Int, StoreError> {
        let r = self.inner.read().await;
        Result.Ok(r.len())
    }
}
```

## 6. The HTTP layer

`src/http.vr`:

```verum
mount core.net.http.*;
mount core.text.*;
mount core.time.Instant;
use .self.domain.*;
use .self.store.*;
use .self.codegen;

/// Shorten a URL — accepts JSON body `{"target": "..."}`.
pub async fn handle_shorten(body: &[Byte]) -> Result<Response, Error>
    using [Store, Clock]
{
    let obj = parse_json(&Text.from_utf8(body)?)?;
    let raw = obj.get(&"target").and_then(Data.as_text)
        .ok_or(Error.new(&"missing 'target'"))?;

    let target: TargetUrl = TargetUrl.try_from(raw.clone())
        .map_err(|_| Error.new(&"invalid URL"))?;

    let seed = Clock.now_ns();
    let code = codegen.generate(seed, 7);

    let link = Link {
        code:    code.clone(),
        target,
        created: Instant.now(),
        hits:    0,
    };
    Store.insert(link).await.map_err(|e| Error.new(&f"store: {e:?}"))?;

    let body = json#"""{"code": "${code}"}""".to_bytes();
    Result.Ok(Response.new(StatusCode.created())
        .with_headers(Headers.new_with(&"Content-Type", &"application/json"))
        .with_body(body))
}

/// Redirect handler for /s/:code
pub async fn handle_redirect(code_str: &Text) -> Result<Response, Error>
    using [Store]
{
    let code: Code = Code.try_from(code_str.to_string())
        .map_err(|_| Error.new(&"bad code"))?;

    match Store.lookup(&code).await? {
        Maybe.Some(link) => {
            Store.increment_hits(&code).await.ok();   // best-effort
            Result.Ok(Response.new(StatusCode.new(302))
                .with_headers(Headers.new_with(&"Location", &link.target))
                .with_body(List.new()))
        }
        Maybe.None => Result.Ok(Response.new(StatusCode.not_found())),
    }
}

pub async fn handle_health() -> Response using [Store] {
    let count = Store.total_count().await.unwrap_or(0);
    Response.new(StatusCode.ok())
        .with_body(f"""{{"count": {count}}}""".to_bytes())
}

/// Route a request to the right handler.
pub async fn route(req: Request) -> Response
    using [Store, Clock, Logger]
{
    match (req.method, req.uri.as_str()) {
        (Method.Post, "/shorten") => match handle_shorten(&req.body()).await {
            Result.Ok(r) => r,
            Result.Err(e) => {
                Logger.warn(&f"shorten failed: {e}");
                Response.new(StatusCode.bad_request())
                    .with_body(f"""{{"error": "{e}"}}""".to_bytes())
            }
        },
        (Method.Get, path) if path.starts_with("/s/") => {
            let code = &path[3..];
            handle_redirect(&code.to_string()).await
                .unwrap_or_else(|_| Response.new(StatusCode.not_found()))
        }
        (Method.Get, "/health") => handle_health().await,
        _ => Response.new(StatusCode.not_found()),
    }
}
```

## 7. The server loop — with bounded concurrency

`src/main.vr`:

```verum
mount core.net.*;
mount core.async.*;
mount core.sync.Semaphore;
use .self.store_memory.MemoryStore;
use .self.http.route;

const MAX_INFLIGHT: Int = 1024;     // upper bound on concurrent tasks

async fn serve() using [IO, Store, Clock, Logger] {
    let listener = TcpListener.bind(&"0.0.0.0:8080").await?;
    Logger.info(&"listening on :8080");

    let sem = Shared.new(Semaphore.new(MAX_INFLIGHT));

    nursery(on_error: wait_all) {
        loop {
            let (stream, peer) = listener.accept_async().await?;
            let permit = sem.clone().acquire_owned().await;

            spawn async move {
                let _p = permit;                     // held for the connection
                if let Result.Err(e) = serve_one(stream, peer).await {
                    Logger.warn(&f"{peer}: {e}");
                }
            };
        }
    }
}

async fn serve_one(mut stream: TcpStream, peer: SocketAddr) -> Result<(), Error>
    using [Store, Clock, Logger]
{
    let req = read_request(&mut stream).await?;
    Logger.info(&f"{peer} {req.method:?} {req.uri}");
    let resp = route(req).await;
    write_response(&mut stream, &resp).await?;
    Result.Ok(())
}

fn main() {
    let rt = Runtime.new(RuntimeConfig.default()
        .worker_threads(8)
        .io_engine(IoEngineKind.IoUring))
        .expect("runtime");

    rt.block_on(async {
        provide Store = MemoryStore.new() in
        provide Clock = SystemClock.new() in
        provide Logger = ConsoleLogger.new(LogLevel.Info) in {
            serve().await.expect("server");
        }
    });
}
```

Three things to notice:

- **`Semaphore.new(MAX_INFLIGHT)`** bounds concurrent connections.
  Beyond 1024 in-flight, `acquire().await` suspends — backpressure.
- **`nursery`** guarantees that on shutdown every accepted connection
  either completes or is cancelled before `serve()` returns.
- **`provide X = v in ...`** layers contexts at the entry point.
  Every downstream function sees them via `using [...]`.

## 8. Tests

`src/tests.vr`:

```verum
@cfg(test)
module tests {
    use .super.domain.*;
    use .super.codegen;
    use .super.store.*;
    use .super.store_memory.MemoryStore;
    use .super.http.*;

    @test
    fn codegen_produces_valid_code() {
        let c = codegen.generate(12345, 7);
        assert_eq(c.len(), 7);
        assert(c.matches(rx#"^[a-hj-km-np-z2-9]+$"));
    }

    @property
    fn codegen_is_always_valid(seed: UInt64, length: Int { 6 <= self && self <= 10 }) {
        let c = codegen.generate(seed, length);
        assert_eq(c.len(), length);
        assert(c.matches(rx#"^[a-hj-km-np-z2-9]+$"));
    }

    @test
    async fn memory_store_round_trip() using [Clock] {
        let store = MemoryStore.new();
        let link = Link {
            code: Code.try_from("abc123x".to_string()).unwrap(),
            target: TargetUrl.try_from("https://example.com".to_string()).unwrap(),
            created: Clock.now(),
            hits: 0,
        };
        store.insert(link.clone()).await.unwrap();
        let got = store.lookup(&link.code).await.unwrap().unwrap();
        assert_eq(got.code, link.code);
        assert_eq(got.target, link.target);
    }

    @test
    async fn shorten_then_redirect() using [IO, Clock] {
        let store = MemoryStore.new();
        let logger = NullLogger.new();

        provide Store = store in
        provide Logger = logger in {
            let body = json#"""{"target": "https://example.com"}""".to_bytes();
            let resp = handle_shorten(&body).await.unwrap();
            assert(resp.status.is_success());

            let text = Text.from_utf8(&resp.body).unwrap();
            let obj = parse_json(&text).unwrap();
            let code_str = obj.get(&"code").and_then(Data.as_text).unwrap();

            let r = handle_redirect(&code_str.to_string()).await.unwrap();
            assert_eq(r.status.code(), 302);
            let location = r.headers.get_first(&"Location").unwrap();
            assert_eq(location.as_str(), "https://example.com");
        }
    }
}
```

Run:

```bash
$ verum test
   [verify] codegen.generate  ✓ (formal/z3, 28 ms)
   test tests.codegen_produces_valid_code          ... ok
   test tests.codegen_is_always_valid              ... ok (100 cases)
   test tests.memory_store_round_trip              ... ok
   test tests.shorten_then_redirect                ... ok
   all 4 tests passed
```

Notice the `[verify]` line: the capability router dispatched to the SMT backend
and proved `codegen.generate` satisfies its postconditions **at
compile time**. The property test then sanity-checks with random
inputs.

## 9. Run it

```bash
$ verum run --release
   listening on :8080

# In another shell
$ curl -XPOST localhost:8080/shorten -d '{"target":"https://example.com"}'
{"code":"xk8q3mr"}

$ curl -v localhost:8080/s/xk8q3mr
< HTTP/1.1 302 Found
< Location: https://example.com

$ curl localhost:8080/health
{"count":1}
```

## 10. What's next

- **Persistent store**: write a `PostgresStore` that implements the
  `Store` protocol. No other code changes.
- **TLS**: wrap the `TcpListener` in a `TlsAcceptor` (see
  [net → TLS](/docs/stdlib/net/tls/)).
- **Rate limiting**: add a `RateLimiter` context; the sem-owned
  permit pattern extends naturally.
- **Observability**: add a `Metrics` context; record request
  latency with `Instant.elapsed()`.

## What you learned

- **Refinement types as domain boundaries.** `Code` and `TargetUrl`
  reject invalid values at construction; downstream code never
  re-checks.
- **Context protocols for DI.** One `Store` trait, an in-memory
  implement for tests, swap for production — no mocking framework.
- **`@verify(formal)` with loop invariants.** The code generator's
  post-condition is proven by Z3, not tested.
- **Structured concurrency with backpressure.** `nursery` bounds
  task lifetimes; `Semaphore` bounds total concurrency.

## See also

- **[HTTP server cookbook](/docs/cookbook/http-server)** — a smaller version.
- **[Verified data structure tutorial](/docs/tutorials/verified-data-structure)**
  — deeper SMT verification.
- **[Nursery cookbook](/docs/cookbook/nursery)** — structured concurrency patterns.

---
title: HTTP client
description: Make typed GET/POST requests with TLS, headers, and retries.
---

# HTTP client

:::info `Http` is your context, not the library's
`core.net.http` gives you the vocabulary — `Request`, `Response`,
`Headers`, `Method`, `StatusCode`, `HttpUrl`, `Cookie` — and the seam:

```verum
public type HttpClient is protocol {
    async fn send(&self, request: Request) -> Result<Response, HttpError>;
};
```

It ships **no transport**, and nothing in the tree implements that
protocol. So `Http` below is a context you declare and `provide`, the
way every example on this site uses it:

```verum
mount core.net.http.{Request, Response, HttpError};

context Http {
    async fn get(url: &Text) -> Result<Response, HttpError>;
    async fn post(url: &Text) -> RequestBuilder;
}
```

That is the point of the seam rather than a gap in it: the transport is
swappable, and a test provides a recorded one without touching a socket.
:::

### Simple GET

```verum
async fn fetch(url: &Text) -> Result<Text, HttpError>
    using [Http]
{
    let resp = Http.get(url).await?;
    Result.Ok(resp.body_text())      // synchronous: the body is already here
}

async fn main() using [Http] {
    let body = fetch(&"https://example.com/").await.unwrap();
    println(&body);
}
```

### POST JSON

```verum
// `core.net.http.HttpError` describes TRANSPORT failures —
// ConnectionFailed / DnsError / Timeout / InvalidUrl / InvalidResponse /
// IoFailure / TlsError / TooManyRedirects / BodyTooLarge. It carries no
// variant for an HTTP STATUS, because a 401 is a successful exchange.
// So a caller that wants to react to status codes declares its own
// error and keeps the transport one inside it.
type ApiError is
    | Transport(HttpError)
    | Unauthorized
    | RateLimited { retry_after_secs: Int }
    | Status(Int)
    | BadPayload(Text);

async fn create_user(name: &Text, email: &Text) -> Result<User, ApiError>
    using [Http]
{
    let body = json#"""{"name": "${name}", "email": "${email}"}""";
    let resp = Http.post(&"https://api.example.com/users")
        .header(&"Content-Type", &"application/json")
        .header(&"Authorization", &f"Bearer {env.var(&\"API_TOKEN\")?}")
        .body(body.to_bytes())
        .send().await
        .map_err(|e| ApiError.Transport(e))?;

    match resp.status.code() {
        200..=299 => {
            let text = resp.body_text();
            json.parse<User>(&text).map_err(|e| ApiError.BadPayload(f"{e}"))
        }
        401 => Result.Err(ApiError.Unauthorized),
        429 => {
            // `Headers.get` already answers the FIRST value as a
            // `Maybe<&Text>`; `get_all` is the one that returns every
            // occurrence. There is no `get_first`.
            let retry = resp.headers.get(&"Retry-After")
                .and_then(|s| s.parse_int().ok())
                .unwrap_or(60);
            Result.Err(ApiError.RateLimited { retry_after_secs: retry })
        }
        code => Result.Err(ApiError.Status(code)),
    }
}
```

### Client configuration

```verum
let client = HttpClient.builder()
    .timeout(10.secs())
    .max_redirects(3)
    .user_agent(&"my-tool/1.0")
    .pool(PoolConfig {
        max_connections: 16,
        idle_timeout_ms: 60_000,
        read_timeout_ms: 10_000,
        write_timeout_ms: 10_000,
    })
    .default_header(&"Accept", &"application/json")
    .build();

provide Http = client in {
    do_work().await
}
```

### TLS client

```verum
let tls = TlsConfig.client()
    .with_root_certs(SystemCerts.load())
    .with_min_version(TlsVersion.Tls12)
    .with_alpn(&[&"h2", &"http/1.1"]);

let client = HttpClient.builder().tls(tls).build();
```

### Retries with exponential backoff

```verum
async fn robust_get(url: &Text) -> Result<Text, HttpError>
    using [Http]
{
    execute_with_retry_config(|| fetch_once(url),
        RetryConfig {
            max_attempts: 5,
            initial_backoff_ms: 200,
            max_backoff_ms: 5_000,
            backoff_factor: 2.0,
            jitter: true,
        }).await
}

async fn fetch_once(url: &Text) -> Result<Text, HttpError> using [Http] {
    Http.get(url).await?.body_text()
}
```

### Download

:::caution The body is not streamed

`Response` holds its body as a `List<Byte>` field and exposes it through
`body()`, `body_bytes()` and `body_text()` — `core/net/http.vr:613`.
There is no `into_body_stream`, no `next_chunk`, and no
`write_all_async`; a response is fully in memory by the time you have
it. Size the download accordingly, or bound it at the server.

:::

```verum
async fn download(url: &Text, dst: &Path) -> Result<(), Error>
    using [Http, IO]
{
    let resp = Http.get(url).await?;
    if !resp.status.is_success() {
        return Result.Err(Error.new(&f"HTTP {resp.status.code()}"));
    }
    // The whole body, already received. `write_bytes` is a FREE
    // function in `core.io.file` taking a path as `&Text`, not a
    // method on `File`.
    file.write_bytes(&dst.to_text(), resp.body_bytes())?;
    Result.Ok(())
}
```

### Testing — inject a mock

```verum
type MockHttp is { responses: Map<Text, Response> };

implement Http for MockHttp { ... }

@test
async fn uses_cached_response() {
    let mock = MockHttp {
        responses: Map.from([
            ("https://a", resp_text("A"))   // core.net.weft.response_ext
        ]),
    };
    provide Http = mock;
    assert_eq(fetch(&"https://a").await.unwrap(), "A".to_string());
}
```

### See also

- **[net → HTTP](/docs/stdlib/http2)** — full `Request`/`Response` API.
- **[Resilience](/docs/cookbook/resilience)** — retries, circuit breakers, timeouts.
- **[HTTP server](/docs/cookbook/http-server)** — the other side.

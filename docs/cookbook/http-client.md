---
title: HTTP client
description: Make typed GET/POST requests with TLS, headers, and retries.
---

# HTTP client

### Simple GET

```verum
async fn fetch(url: &Text) -> Result<Text, HttpError>
    using [Http]
{
    let resp = Http.get(url).await?;
    resp.body_text().await
}

async fn main() using [IO, Http] {
    let body = fetch(&"https://example.com/").await.unwrap();
    println(&body);
}
```

### POST JSON

```verum
async fn create_user(name: &Text, email: &Text) -> Result<User, HttpError>
    using [Http]
{
    let body = json#"""{"name": "${name}", "email": "${email}"}""";
    let resp = Http.post(&"https://api.example.com/users")
        .header(&"Content-Type", &"application/json")
        .header(&"Authorization", &f"Bearer {env::var(&\"API_TOKEN\")?}")
        .body(body.to_bytes())
        .send().await?;

    match resp.status.code() {
        200..=299 => {
            let text = resp.body_text().await?;
            json::parse::<User>(&text).map_err(HttpError.from)
        }
        401 => Result.Err(HttpError.Unauthorized),
        429 => {
            let retry = resp.headers.get_first(&"Retry-After")
                .and_then(|s| s.parse_int().ok())
                .unwrap_or(60);
            Result.Err(HttpError::RateLimited { retry_after: retry.seconds() })
        }
        code => Result.Err(HttpError::Status(code)),
    }
}
```

### Client configuration

```verum
let client = HttpClient::builder()
    .timeout(10.seconds())
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
    .with_root_certs(SystemCerts::load())
    .with_min_version(TlsVersion.Tls12)
    .with_alpn(&[&"h2", &"http/1.1"]);

let client = HttpClient::builder().tls(tls).build();
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
    Http.get(url).await?.body_text().await
}
```

### Streaming download

```verum
async fn download(url: &Text, dst: &Path) -> Result<(), Error>
    using [Http, IO]
{
    let resp = Http.get(url).await?;
    if !resp.status.is_success() {
        return Result.Err(Error.new(&f"HTTP {resp.status.code()}"));
    }
    let mut writer = BufWriter.new(File.create(dst).await?);
    let mut body = resp.into_body_stream();
    while let Maybe.Some(chunk) = body.next_chunk().await? {
        writer.write_all_async(&chunk).await?;
    }
    writer.flush_async().await?;
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
        responses: map![
            "https://a" => Response.new(StatusCode::ok()).with_body(b"A".to_vec())
        ],
    };
    provide Http = mock;
    assert_eq(fetch(&"https://a").await.unwrap(), "A".to_string());
}
```

### See also

- **[net → HTTP](/docs/stdlib/net#http)** — full `Request`/`Response` API.
- **[Resilience](/docs/cookbook/resilience)** — retries, circuit breakers, timeouts.
- **[HTTP server](/docs/cookbook/http-server)** — the other side.

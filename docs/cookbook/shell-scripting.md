---
title: Shell scripting
description: Production-quality shell scripts with type-safe escape, structured concurrency, typed command DSLs and verification.
---

# Shell scripting

Verum's shell-scripting framework (`core/shell/`) replaces ad-hoc `bash`
or `zx`-style scripts with a fully typed, verifiable runtime that scales
from one-shot one-liners to long-running daemons. Everything that follows
assumes a single import:

```verum
mount core.shell.*;
```

This brings the executor (`run`, `sh`, `Executor`), structured concurrency
helpers (`background`, `parallel`, `nursery`), streaming (`stream_lines`),
typed command DSLs (`git`, `docker`, `kubectl`), built-ins (`cp`, `which`,
`mkdir_p`), interactive prompts (`input`, `confirm`, `password`), progress
indicators (`Progress`, `Spinner`), and the refinement-typed config helpers
into scope.

For the full API reference see
[stdlib → shell](../stdlib/shell.md).

## Tagged-literal dispatch with auto-escape

The fundamental primitive is the `sh#"..."` tagged literal. Every `${expr}`
inside the literal is automatically passed through the
`ShellEscape` protocol, so user data cannot break
out of its quoted form:

`sh#"..."` builds a `ShellCommand` value — auto-escaped, but not yet
run. Executing it is a separate, explicit step (`.run()` or
`.run_check()`, both `async`), same as every example below:

```verum
async fn greet(user_input: &Text) -> Result<(), ShellError> using [ShellContext] {
    sh#"echo ${user_input}".run_check().await?;     // safe — even if user_input is "'; rm -rf /"
    Result.Ok(())
}
```

When you genuinely want to splice unescaped shell text (rare, dangerous),
use `$unsafe{...}` inside an `unsafe` block:

```verum
async fn tail_service_errors() -> Result<(), ShellError> using [ShellContext] {
    let raw_pipeline: Text = "grep error | head -10".into();
    unsafe {
        sh#"journalctl -u myservice | $unsafe{raw_pipeline}".run_check().await?;
    }
    Result.Ok(())
}
```

## Quick recipes

### Run a command and capture output

```verum
async fn show_current_commit() -> Result<(), ShellError> using [ShellContext] {
    let result = sh#"git rev-parse --short HEAD".run_check().await?;
    let hash: Text = result.text();      // stdout, trimmed
    println(&f"current commit: {hash}");
    Result.Ok(())
}
```

### Pipe through several commands

`Text` has no `parse` method — conversion is a `from_str` protocol called
**on the target type**, not chained off the source string:

```verum
async fn feature_commit_count() -> Result<Int, ShellError> using [ShellContext] {
    let result = sh#"git log --oneline | grep feat: | wc -l".run_check().await?;
    let count: Int = Int.from_str(&result.text()).map_err(|e| ShellError.ParseError {
        command: "git log --oneline | grep feat: | wc -l".to_text(),
        format:  "int".to_text(),
        cause:   e.message,
    })?;
    Result.Ok(count)
}
```

### Parse JSON output into a typed value

There is no general "parse JSON text as type `T`" facility. The only
typed-JSON-to-value protocol in the stdlib (`JsonDeserialize<T>`) belongs
to Weft's HTTP request-body extractor — it's wired to `Content-Type`
checks and HTTP status codes, not available for arbitrary text. What's
available generally is `core.encoding.json.parse`, which returns an
untyped `JsonValue` tree you walk by hand:

```verum
mount core.encoding.json.{parse, JsonValue, JsonError};

type Pod is { name: Text, ready: Bool }

async fn pod_count() -> Result<Int, ShellError> using [ShellContext] {
    let result = sh#"kubectl get pods -o json".run_check().await?;
    let value  = parse(&result.text()).map_err(|e| ShellError.ParseError {
        command: "kubectl get pods -o json".to_text(),
        format:  "json".to_text(),
        cause:   f"{e}",
    })?;
    let count = match &value {
        JsonValue.JsonObject(fields) => match fields.get(&"items".to_text()) {
            Maybe.Some(JsonValue.JsonArray(items)) => items.len(),
            _ => 0,
        },
        _ => 0,
    };
    Result.Ok(count)
}
```

If your program needs full `Pod` records rather than a count, extend
the match arm above field-by-field (`JsonValue.JsonString` for `name`,
`JsonValue.JsonBool` for `ready`); there's no derive that does it for
you outside the Weft handler path today.

### Run commands in parallel

```verum
async fn ci() using [ShellContext] {
    nursery(on_error: fail_fast) {
        spawn sh#"cargo test".run_check();
        spawn sh#"cargo clippy -- -D warnings".run_check();
        spawn sh#"verum check core/".run_check();
    };
}
```

### Stream long-running output

```verum
async fn tail_logs() using [ShellContext] {
    async for line in stream_lines("journalctl -u myservice -f") {
        let line = line?;
        if line.contains("FATAL") { alert(&line).await; }
    }
}
```

For very fast producers, use the bounded variant with explicit overflow policy:

```verum
let mut stream = stream_lines_bounded(
    &"vmstat 1".into(),
    StreamConfig.lossy(buffer: 16),
).await?;
stream.for_each(|line| {
    update_metrics(line);
    true
}).await;
```

### Cancellation with grace period

```verum
let token = CancellationToken.with_timeout(d#"30s");
match sh_with_cancel(&"./long-task.sh".into(), &token, d#"5s").await {
    Ok(r)  => println(&r.text()),
    Err(ShellError.Cancelled { reason, .. }) => println(&f"stopped: {reason}"),
    Err(e) => die(&f"{e}", 1),
}
```

The executor sends `SIGTERM` first, waits up to `5s` for graceful exit,
then escalates to `SIGKILL` — matching standard Unix shutdown conventions.

### Retry with exponential backoff

```verum
let exec = Executor.new()
    .with_retry(RetryPolicy.simple(5))
    .with_timeout(d#"30s");
let result = exec.run_idempotent(&"./flaky-deploy.sh".into(), []).await?;
```

## Typed command DSLs

For frequently invoked tools, prefer the algebraic command types over
free-form `sh#`. Each DSL provides refinement-typed argument atoms and a
`render()` method.

### Git

```verum
let url = GitUrl.parse("https://github.com/user/repo.git".into())?;
git(GitCmd.Clone {
    url, dest: Some(PathBuf.from("/tmp/work")),
    depth: Some(1), branch: Some(GitBranch.parse("main".into())?),
    recurse_submodules: false,
}).await?;
```

Invalid URLs and refspecs are rejected at construction:

```verum
GitUrl.parse("'; rm -rf /".into())?;     // Err — refinement violated
```

### Docker

```verum
let image = DockerImage.parse("myorg/api:1.2.3".into())?;
docker(DockerCmd.Run {
    image, cmd: ["serve".into()],
    env: [("PORT".into(), "8080".into())],
    volumes: [VolumeMount.rw(PathBuf.from("/data"), PathBuf.from("/app/data"))],
    ports: [PortMapping.tcp(8080, 8080)],
    rm: true, detach: true, name: Some("api".into()),
}).await?;
```

### Kubectl

The kubectl DSL is parameterised over the resource kind, so semantically
incoherent calls don't typecheck:

```verum
let cmd: KubectlCmd<Pod> = KubectlCmd.Logs {
    pod: KubeName.parse("api-7d9f-xyz".into())?,
    namespace: Some(KubeNamespace.parse("default".into())?),
    container: None, follow: true, tail: Some(100), since: None,
};
kubectl(cmd).await?;

// KubectlCmd<ConfigMap> does NOT support .Logs — would be a type error.
```

## Built-ins (no spawning)

Pure-Verum implementations of common file operations. Faster than spawning
`cp`/`rm`/`which` per call, and identically portable across platforms:

```verum
mkdir_p(&PathBuf.from("/tmp/out").as_path())?;
write_str(&PathBuf.from("/tmp/out/data.json").as_path(), &payload)?;
let exists = command_exists(&"git".into());
let path   = which(&"git".into());
```

## Refinement-typed configurations

`core/shell/verify.vr` provides reusable refinement atoms. Constructors
return `Err` on invalid input, so a successfully built `DeployConfig` is a
proof that every field is valid:

```verum
let config = DeployConfig.parse(
    "myservice".into(),
    "1.2.3".into(),         // SemVer-validated
    "production".into(),    // DNS-1123 namespace
    "manifest.yaml".into(), // .yaml/.yml ending enforced
    300,                    // PortNumber 1..65535
)?;
```

## Interactive prompts

```verum
let name = input_required(&"Project name: ".into());
let template = select(&"Template:".into(), &[
    ("CLI App".into(), "cli"),
    ("Web Service".into(), "web"),
]);
if !confirm(&f"Create {name} ({template})?") { exit(0); }
let token = password(&"GitHub token: ".into());
```

## Progress indicators

```verum
async fn build_and_release() -> Result<(), ShellError> using [ShellContext] {
    let mut progress = Progress.new("Building".into(), 3);
    sh#"cargo build --release".run_check().await?;        progress.advance();
    sh#"docker build -t app:latest .".run_check().await?; progress.advance();
    sh#"docker push app:latest".run_check().await?;       progress.advance();
    progress.done("✓ released".into());
    Result.Ok(())
}
```

For unbounded operations:

```verum
let mut spinner = Spinner.new("Connecting".into());
spinner.start().await;
let conn = connect(&endpoint).await?;
spinner.stop("✓ connected".into()).await;
```

## Permissions (frontmatter)

Add an explicit allow-list at the top of any `.vr` script. The runtime
permission gate denies anything not declared:

```verum
#!/usr/bin/env verum
// !@permission(run: ["git", "kubectl"])
// !@permission(fs_read: ["/etc/kube/*"])
// !@permission(net: ["api.github.com:443"])

mount core.shell.*;

async fn main() -> Result<(), ShellError> using [ShellContext] {
    let ctx = bootstrap_from_file(&PathBuf.from("script.vr").as_path())?;
    provide ShellContext = ctx;
    sh#"git status".run_check().await?;     // OK — `git` is allow-listed
    sh#"curl ...".run_check().await?;       // PermissionDenied at runtime
    Result.Ok(())
}
```

## Testability — mock context

Unit-test scripts without spawning real processes:

```verum
@test
async fn deploy_runs_kubectl_in_order() {
    provide ShellContext = ShellContext.mock([
        MockResponse.success("kubectl apply".into(), "created".into()),
        MockResponse.success("kubectl rollout".into(), "rolled out".into()),
    ]);
    deploy_v2(&config).await?;
}
```

## See also

- [stdlib → shell](../stdlib/shell.md) — full API reference
- [`core/shell/`](https://github.com/verum-lang/verum/tree/main/core/shell) — implementation
- [`vcs/specs/L2-standard/shell/`](https://github.com/verum-lang/verum/tree/main/vcs/specs/L2-standard/shell) — type-check coverage

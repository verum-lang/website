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

For the design rationale and full API reference, see
[`internal/specs/shell-scripting.md`](https://github.com/verum-lang/verum/blob/main/internal/specs/shell-scripting.md).

## Tagged-literal dispatch with auto-escape

The fundamental primitive is the `sh#"..."` tagged literal. Every `${expr}`
inside the literal is automatically passed through the
`ShellEscape` protocol, so user data cannot break
out of its quoted form:

```verum
let user_input: Text = read_line()?;
sh#"echo ${user_input}"?;     // safe — even if user_input is "'; rm -rf /"
```

When you genuinely want to splice unescaped shell text (rare, dangerous),
use `$unsafe{...}` inside an `unsafe` block:

```verum
let raw_pipeline: Text = "grep error | head -10".into();
unsafe {
    sh#"journalctl -u myservice | $unsafe{raw_pipeline}"?;
}
```

## Quick recipes

### Run a command and capture output

```verum
let result = sh#"git rev-parse --short HEAD"?;
let hash: Text = result.text();      // stdout, trimmed
println(&f"current commit: {hash}");
```

### Pipe through several commands

```verum
let count: Int = sh#"git log --oneline | grep feat: | wc -l"?
    .text()
    .parse::<Int>()?;
```

### Parse JSON output into a typed value

```verum
type Pod is { name: Text, ready: Bool }
let pods: List<Pod> = sh#"kubectl get pods -o json"?
    .json::<KubeResponse>()?
    .items;
```

### Run commands in parallel

```verum
async fn ci() using [ShellContext] {
    nursery(on_error: FailFast) {
        spawn sh#"cargo test"?;
        spawn sh#"cargo clippy -- -D warnings"?;
        spawn sh#"verum check core/"?;
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
let mut progress = Progress.new("Building".into(), 3);
sh#"cargo build --release"?;       progress.advance();
sh#"docker build -t app:latest ."?; progress.advance();
sh#"docker push app:latest"?;       progress.advance();
progress.done("✓ released".into());
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

async fn main() using [ShellContext] {
    let ctx = bootstrap_from_file(&PathBuf.from("script.vr").as_path())?;
    provide ShellContext = ctx;
    sh#"git status"?;     // OK — `git` is allow-listed
    sh#"curl ..."?;       // PermissionDenied at runtime
}
```

## Testability — mock context

Unit-test scripts without spawning real processes:

```verum
#[test]
async fn deploy_runs_kubectl_in_order() {
    provide ShellContext = ShellContext.mock([
        MockResponse.success("kubectl apply".into(), "created".into()),
        MockResponse.success("kubectl rollout".into(), "rolled out".into()),
    ]);
    deploy_v2(&config).await?;
}
```

## See also

- [Spec](https://github.com/verum-lang/verum/blob/main/internal/specs/shell-scripting.md) — full API reference, design rationale
- [`core/shell/`](https://github.com/verum-lang/verum/tree/main/core/shell) — implementation
- [`vcs/specs/L2-standard/shell/`](https://github.com/verum-lang/verum/tree/main/vcs/specs/L2-standard/shell) — type-check coverage

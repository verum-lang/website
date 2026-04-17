---
sidebar_position: 1
title: Installation
description: Install Verum on Linux or macOS — download, verify, and set up your editor.
---

# Installation

Verum ships as a **single binary** — `verum` — that contains the
compiler, interpreter, LSP server, Playbook TUI, formatter, and test
runner. There is no separate runtime or toolchain directory: one
binary on your `$PATH` is the whole install.

> This page describes the install flow as it actually ships today.
> Several pieces still have rough edges (no Windows binary yet, no
> release-signature chain, no self-update command) — the doc is
> honest about what exists and what doesn't.

## Supported platforms

| Platform | Target triple | Status |
|----------|---------------|--------|
| Linux x86_64 (glibc) | `x86_64-unknown-linux-gnu` | Prebuilt binary |
| macOS Apple Silicon | `aarch64-apple-darwin` | Prebuilt binary |
| macOS Intel | `x86_64-apple-darwin` | Prebuilt binary |
| Linux aarch64 / musl | — | Build from source |
| Windows | — | Build from source (officially unsupported) |

The release workflow (`.github/workflows/release.yml`) currently
builds the three triples above. Everything else requires a source
build; see [Build from source](#build-from-source) below.

### What the `verum` binary itself links against

| Platform | Linked against |
|----------|----------------|
| Linux | `libc.so.6` (glibc ≥ 2.31 — Debian 11+ / Ubuntu 22.04+ / RHEL 9+) |
| macOS | `libSystem.B.dylib` (Apple's stable ABI) — macOS 12+ |

This is the toolchain binary you run to compile Verum programs. It
is today built as a Rust binary with the default `x86_64-unknown-linux-gnu`
target, so it uses the system glibc. A static-linked / musl variant
is a roadmap item (the `crt-static` build flag is documented in
`.cargo/config.toml` but not yet enabled in release CI). **Z3** is
statically linked into the binary. **LLVM/MLIR** are linked against
the system copy CI uses; release archives carry the needed object
files, so you do not install LLVM separately. **CVC5** is present as
a stub; features that name it degrade to Z3 via the capability
router — see [SMT routing](/docs/verification/smt-routing).

### What programs compiled by `verum build` link against

Programs you produce with `verum build` are **not** Rust binaries and
do **not** pull in libc / libm / pthread. The AOT linker
(`crates/verum_codegen/src/link.rs`) uses a per-platform
`-nostdlib`-based configuration and goes direct-to-kernel wherever
the platform allows:

| Target | Links against | Entry point |
|--------|--------------|-------------|
| Linux | *nothing* — direct syscalls via `syscall` x86_64 instruction | `_start` |
| macOS | `libSystem.B.dylib` only (Apple forbids direct syscalls from userland); Metal + Foundation frameworks for GPU programs | `main` |
| Windows | `ntdll.dll` + `kernel32.dll` only (`/NODEFAULTLIB`, no MSVCRT / UCRT) | `mainCRTStartup` |
| FreeBSD | *nothing* — direct syscalls | `_start` |
| Embedded / bare-metal | *nothing* (`-ffreestanding`) | `Reset_Handler` |
| WASM-WASI | WASI host imports | `_start` |

Concretely, the LLVM backend emits `syscall` as inline assembly —
`rax` for the syscall number, `rdi/rsi/rdx/r10/r8/r9` for args —
rather than calling any C wrapper
(`crates/verum_codegen/src/llvm/instruction.rs:3473-3519`). A minimal
Verum `fn main() { print("hi\n"); }` compiled with `verum build --release`
on Linux produces a fully-static ELF binary that runs without
glibc, without an interpreter, and without any runtime the user has
to ship alongside it.

## Download

Every tagged release publishes three archives to the
[GitHub Releases page](https://github.com/verum-lang/verum/releases):

| Archive | Contents |
|---------|----------|
| `verum-linux-x86_64.tar.gz` | glibc Linux binary |
| `verum-macos-aarch64.tar.gz` | Apple Silicon binary |
| `verum-macos-x86_64.tar.gz` | Intel macOS binary |

Alongside each archive a `*.tar.gz.sha256` file carries a SHA-256
checksum for integrity verification. There is no aggregate
`SHA256SUMS` file and no minisign signature chain today — verify the
per-archive checksum and use HTTPS to the GitHub release URL as your
trust anchor.

## Install

### Linux (x86_64)

```bash
curl -LO https://github.com/verum-lang/verum/releases/latest/download/verum-linux-x86_64.tar.gz
curl -LO https://github.com/verum-lang/verum/releases/latest/download/verum-linux-x86_64.tar.gz.sha256
shasum -a 256 -c verum-linux-x86_64.tar.gz.sha256
tar xzf verum-linux-x86_64.tar.gz
sudo install -Dm755 verum /usr/local/bin/verum
verum --version
```

### macOS (Apple Silicon)

```bash
curl -LO https://github.com/verum-lang/verum/releases/latest/download/verum-macos-aarch64.tar.gz
curl -LO https://github.com/verum-lang/verum/releases/latest/download/verum-macos-aarch64.tar.gz.sha256
shasum -a 256 -c verum-macos-aarch64.tar.gz.sha256
tar xzf verum-macos-aarch64.tar.gz
# Gatekeeper may quarantine the downloaded binary; clear the xattr:
xattr -d com.apple.quarantine verum 2>/dev/null || true
sudo install -m755 verum /usr/local/bin/verum
verum --version
```

### macOS (Intel)

Replace `aarch64` with `x86_64` in the URLs above; everything else
is identical.

### Updating

There is no `verum upgrade` command. To update:

1. Download the newer archive from GitHub Releases.
2. Verify the SHA-256.
3. Replace the binary in place (`sudo install -m755 verum
   /usr/local/bin/verum`).

Already-running processes keep the old binary's inode open and are
unaffected until they restart.

## Verify the install

```bash
$ verum --version
verum 0.32.0
```

For build/backend details, add `--verbose`:

```bash
$ verum --version --verbose
verum 0.32.0

Build information:
  Commit:       1fb9f71
  Build date:   2026-04-17
  Rust version: 1.82.0
  LLVM version: 21.1.0
  Host target:  x86_64-linux

Capabilities:
  AOT backend:    LLVM
  Interpreter:    VBC Tier 0
  GPU backend:    MLIR (optional)
  SMT solver:     Z3
  Verification:   refinement + dependent types
```

### Diagnose the verification stack

The nearest thing to a "doctor" command is **`verum smt-info`**:

```bash
verum smt-info
```

It reports SMT-solver availability, fallback routing, and the current
per-module timeout configuration. If refinement validation or
`@verify(formal)` obligations are misbehaving, start here.

## Shell completions

```bash
# bash
verum completions bash | sudo tee /etc/bash_completion.d/verum > /dev/null

# zsh — install once into any directory on $fpath
verum completions zsh > "${fpath[1]}/_verum"

# fish
verum completions fish > ~/.config/fish/completions/verum.fish

# PowerShell
verum completions powershell >> $PROFILE
```

`verum completions` accepts any of `bash`, `zsh`, `fish`,
`powershell`, `elvish`, `nushell` — the full set supported by
[`clap_complete::Shell`](https://docs.rs/clap_complete/).

## Cross-compiling Verum programs

The compiler accepts a `--target <triple>` flag on `verum build`
that passes the triple straight through to the LLVM code generator:

```bash
verum build --target aarch64-unknown-linux-gnu
verum build --target x86_64-apple-darwin --release
```

There is **no `verum target list`** / **no `verum target add`** /
**no `verum sdk install`** command today. What this means in
practice:

- The triple string is not validated by the CLI — you get errors
  from LLVM if you pass a triple the backend does not know about.
- Final linking requires platform tooling (`ld`, `lld`, or the
  platform's linker) and any SDK/sysroot that target needs. Those
  are not provided by `verum`; install them through your system
  package manager or the usual cross-compile setup.
- For embedded / WASM, set `[cross_compile]` and `[llvm]` in your
  `verum.toml` (see below) to pin the target CPU and features.

## Project manifest (`verum.toml`)

Projects use a `verum.toml` manifest (capitalised `Verum.toml` is
also accepted on case-sensitive filesystems). The top-level section
is `[cog]`, not `[verum]`:

```toml
[cog]
name = "my-project"
version = "0.1.0"
description = "Example project"

[language]
profile = "application"          # application | systems | research

[dependencies]
# example: http = "1.0"

[verify]
default_strategy = "static"      # runtime | static | formal | proof | fast | thorough | reliable | certified | synthesize
solver_timeout_ms = 5000

[llvm]
target_triple  = "x86_64-unknown-linux-gnu"  # optional — overrides host
target_cpu     = "native"
target_features = []

[build]
# build-time knobs
```

Other real sections: `[dev_dependencies]`, `[build_dependencies]`,
`[features]`, `[profile]`, `[workspace]`, `[lsp]`, `[registry]`,
`[optimization]`, `[lto]`, `[pgo]`, `[cross_compile]`, `[types]`,
`[runtime]`, `[codegen]`, `[meta]`, `[protocols]`, `[context]`,
`[safety]`, `[test]`, `[debug]`. Only the fields you override need
to be present; defaults are built in.

Pinning a specific `verum` version inside the manifest is not yet
implemented — pin the binary at the install layer instead.

## Build from source

For unsupported targets (aarch64 Linux, musl, Windows) or compiler
development, build from source.

**Requirements:**

| Tool | Version | Notes |
|------|---------|-------|
| Rust | 1.82+ (see `rust-toolchain.toml`) | Compiles the `verum_*` crates |
| LLVM | 21.x | System install — the bindings crate links against it |
| CMake | 3.21+ | Needed by the Z3 bundled build |
| C/C++ compiler | clang 15+ recommended | LLVM and Z3 native code |
| Git | 2.30+ | Submodule fetch |

```bash
git clone --recursive https://github.com/verum-lang/verum
cd verum
cargo build --release -p verum_cli --features verification
./target/release/verum --version
```

The Z3 build is bundled and will take several minutes the first
time. LLVM must already be installed on the build host (`brew
install llvm@21` on macOS; `apt install llvm-21-dev` on Debian /
Ubuntu, or equivalent). MLIR support comes from the same LLVM
install.

### Interpreter-only build

If you only need `verum run` / `verum check` / `verum test` and the
REPL — skipping native AOT builds — drop the LLVM-heavy backend:

```bash
cargo build --release -p verum_cli
```

without the `verification` feature for the fastest possible build.

## IDE integration

### VS Code

Install the **Verum Language Support** extension:

```
ext install verum-lang.verum
```

The extension auto-detects `verum` on `$PATH` and starts `verum lsp`
on any `.vr` file. See **[VS Code Extension](/docs/tooling/vscode-extension)**
for the full feature list, commands, configuration, and
troubleshooting.

### Neovim (nvim-lspconfig)

```lua
require('lspconfig').verum = {
  default_config = {
    cmd = { 'verum', 'lsp' },
    filetypes = { 'verum' },
    root_dir = require('lspconfig.util').root_pattern('verum.toml', 'Verum.toml'),
    settings = {
      verum = {
        verify = { strategy = 'static' },
        inlayHints = { refinements = true, contexts = true },
      },
    },
  },
}

vim.filetype.add({ extension = { vr = 'verum' } })
```

### Emacs (lsp-mode)

```elisp
(add-to-list 'lsp-language-id-configuration '(verum-mode . "verum"))
(lsp-register-client
 (make-lsp-client :new-connection (lsp-stdio-connection '("verum" "lsp"))
                  :major-modes '(verum-mode)
                  :server-id 'verum))
```

### Helix

```toml
# ~/.config/helix/languages.toml
[[language]]
name = "verum"
file-types = ["vr"]
language-servers = ["verum-lsp"]

[language-server.verum-lsp]
command = "verum"
args = ["lsp"]
```

## Uninstall

```bash
sudo rm /usr/local/bin/verum        # or wherever you installed it
rm -rf ~/.verum                      # SMT stats + signing key (if any)
```

`~/.verum/` is only used for per-user state (`state/smt-stats.json`,
`signing_key`, `enterprise.toml`); it is **not** a toolchain tree and
no binary lives there.

## Troubleshooting

### `verum: command not found`

The binary isn't on `$PATH`. Either reinstall to `/usr/local/bin`
(which is on the default `$PATH` on both Linux and macOS) or add the
directory you used:

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### Linux: `GLIBC_2.xx not found`

The prebuilt Linux archive targets glibc 2.31+. On older
distributions, [build from source](#build-from-source) against your
system glibc. A musl variant is not currently shipped.

### macOS: "cannot be opened because the developer cannot be verified"

Gatekeeper blocks the downloaded binary. Clear the quarantine
attribute:

```bash
xattr -d com.apple.quarantine /usr/local/bin/verum
```

### SMT verification times out

Raise the per-obligation timeout in your manifest:

```toml
[verify]
solver_timeout_ms = 10000
```

or on a single function:

```verum
@verify(formal, timeout_ms = 10000)
fn hard_to_prove() { ... }
```

### Corporate proxy blocks the download

`curl` respects `https_proxy` / `HTTPS_PROXY`:

```bash
https_proxy=http://proxy.corp:3128 \
  curl -LO https://github.com/verum-lang/verum/releases/latest/download/verum-linux-x86_64.tar.gz
```

## Next steps

- **[Hello, World](/docs/getting-started/hello-world)** — write and
  run your first program.
- **[Language Tour](/docs/getting-started/tour)** — the major
  features in context.
- **[Project Structure](/docs/getting-started/project-structure)** —
  `verum.toml`, modules, cog packages, workspace layout.
- **[CLI Reference](/docs/reference/cli-commands)** — every real
  subcommand and flag.

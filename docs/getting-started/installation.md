---
sidebar_position: 1
title: Installation
description: Install Verum on Linux or macOS — build from source today, prebuilt binaries when 0.1.0 is tagged.
---

# Installation

Verum ships as a **single binary** — `verum` — that contains the
compiler, interpreter, LSP server, Playbook TUI, formatter, and test
runner. There is no separate runtime or toolchain directory: one
binary on your `$PATH` is the whole install.

:::warning Pre-release status

**No tagged release exists yet.** The
[GitHub Releases page](https://github.com/verum-lang/verum/releases)
is empty and the prebuilt-archive URLs in older versions of this page
(`verum-linux-x86_64.tar.gz`, etc.) currently 404. Until `0.1.0` is
tagged, the only supported install path is **[Build from
source](#build-from-source)** below.

The release archives _will_ ship from
[`.github/workflows/release.yml`](https://github.com/verum-lang/verum/blob/main/.github/workflows/release.yml)
when a `v*` tag lands; the prebuilt-binary section further down is
kept as forward-looking reference for that flow.
:::

## Supported platforms

| Platform | Target triple | Status |
|----------|---------------|--------|
| Linux x86_64 (glibc) | `x86_64-unknown-linux-gnu` | Build from source today; prebuilt at first tag |
| macOS Apple Silicon | `aarch64-apple-darwin` | Build from source today; prebuilt at first tag |
| macOS Intel | `x86_64-apple-darwin` | Build from source today; prebuilt at first tag |
| Linux aarch64 / musl | — | Build from source |
| Windows | — | Build from source (officially unsupported) |

The release workflow currently builds the three triples above for
prebuilt archives. Everything else requires a source build.

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

## Build from source

This is the primary install path today. The Verum compiler is
written in Rust and uses unstable features that require the
**nightly** toolchain.

### 1. Install prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| **Rust nightly** | The exact channel pinned in [`rust-toolchain.toml`](https://github.com/verum-lang/verum/blob/main/rust-toolchain.toml) | Compiles the `verum_*` crates. The repo uses `#![feature(pattern)]` in `verum_common` and edition 2024 — both require nightly. |
| LLVM | 21.x | System install — the bindings crate links against it. |
| CMake | 3.21+ | Needed by the Z3 bundled build. |
| C/C++ compiler | clang 15+ recommended | LLVM and Z3 native code. |
| Git | 2.30+ | Submodule fetch (Z3 / CVC5 are submodules). |

#### Install rustup + nightly

If you don't already have `rustup`:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
```

Once `rustup` is installed, `cargo` will read
`rust-toolchain.toml` from the repo root and **download the
correct nightly channel automatically** the first time you build —
you don't need a manual `rustup default nightly`. The toolchain file
also pins the right components (`rustfmt`, `clippy`, `rust-src`,
`rust-analyzer`) so editor integration and lint commands work
without extra setup.

#### Install LLVM 21 + CMake + clang

**Ubuntu / Debian (22.04+):**

```bash
sudo apt update
sudo apt install -y \
    build-essential cmake git pkg-config \
    clang-15 lld-15 \
    llvm-21-dev libllvm21 \
    libpolly-21-dev libmlir-21-dev mlir-21-tools \
    zlib1g-dev libzstd-dev libxml2-dev libssl-dev

# Make llvm-config-21 the default the bindings crate looks for:
export LLVM_SYS_210_PREFIX=$(llvm-config-21 --prefix)
```

If your distro doesn't carry an `llvm-21-dev` package yet, use the
[official LLVM apt repository](https://apt.llvm.org/) — the
`llvm.sh` installer there handles the version-pinned packages.

**macOS (Homebrew):**

```bash
brew install llvm@21 cmake
export LLVM_SYS_210_PREFIX=$(brew --prefix llvm@21)
export PATH="$LLVM_SYS_210_PREFIX/bin:$PATH"
```

The `LLVM_SYS_210_PREFIX` environment variable points the
`llvm-sys` bindings crate at the version-21 install. Without it the
build will probe `/usr/lib/llvm-21` first and fall back to whatever
`llvm-config` returns — usually wrong.

### 2. Clone with submodules

The repository carries Z3 and a few other natives as Git
submodules. Clone with `--recursive` so they come along:

```bash
git clone --recursive https://github.com/verum-lang/verum
cd verum
```

If you already cloned without `--recursive`:

```bash
git submodule update --init --recursive
```

### 3. Build

Default build with the SMT verification stack (Z3 statically linked
in):

```bash
cargo build --release -p verum_cli --features verification
```

The Z3 build is bundled and will take **5–15 minutes** the first
time on a 4-core box; subsequent rebuilds reuse the cached object
files and finish in seconds. LLVM is linked against the system
install you set up above — `cargo build` does not download or build
LLVM itself.

The first build also touches every workspace crate; expect
**10–25 minutes** end-to-end on a fresh checkout. Increment builds
after that are sub-minute.

### 4. Verify

```bash
./target/release/verum --version
./target/release/verum info --all
```

You should see version `0.1.0` and the LLVM-linked-21.x line in the
`verum info --all` output.

### 5. Install on `$PATH`

```bash
sudo install -m755 ./target/release/verum /usr/local/bin/verum
verum --version
```

If you don't have `sudo` access, copy the binary somewhere on your
own `$PATH` instead — the binary is fully relocatable:

```bash
mkdir -p ~/.local/bin
install -m755 ./target/release/verum ~/.local/bin/verum
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc   # or ~/.zshrc
```

### Interpreter-only build (faster, no LLVM)

If you only need `verum run` / `verum check` / `verum test` and the
REPL — skipping native AOT builds — drop the LLVM-heavy backend by
omitting the `verification` feature:

```bash
cargo build --release -p verum_cli
```

This skips LLVM linkage entirely; the binary still runs Verum code
through the VBC interpreter, formats source, runs tests via the
interpreter tier, and serves LSP. It cannot produce native ELFs /
Mach-O / PE files.

## Prebuilt binaries (once `0.1.0` is tagged)

The instructions below describe the planned prebuilt-binary install
flow. **They will start working when the first `v*` tag is pushed
and the release workflow uploads archives to GitHub Releases.** Until
then the URLs return 404.

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
3. Replace the binary in place (`sudo install -m755 verum /usr/local/bin/verum`).

Already-running processes keep the old binary's inode open and are
unaffected until they restart.

## Verify the install

```bash
$ verum --version
verum 0.1.0
```

For full build, backend, and feature details, use `verum info --all`:

```bash
$ verum info --all
Verum Compiler Information
==================================================
Version: 0.1.0
Repository: https://github.com/verum-lang/verum

Features:
  ✓ Refinement types with SMT verification
  ✓ CBGR memory management (<15ns overhead)
  ✓ Bidirectional type checking
  ✓ Stream comprehensions
  ✓ Context system (DI)

LLVM Backend:
  Status: linked against LLVM 21.x

Components:
  Lexer:        verum_lexer v0.1.0
  Parser:       verum_parser + verum_fast_parser v0.1.0
  Type Checker: verum_types v0.1.0
  Kernel:       verum_kernel v0.1.0   (LCF-style trusted checker)
  SMT Solver:   Z3 + CVC5 (via verum_smt capability router)
  CBGR Runtime: verum_cbgr v0.1.0

Usage:
  Project commands: verum build, verum run, verum test
  Single file commands: verum run <file.vr>, verum check <file.vr>
  Verification: verum verify, verum audit --framework-axioms
  For help: verum --help
```

`verum info --features` and `verum info --llvm` narrow the output to
just one slice if you need it.

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

Projects use a `verum.toml` manifest (capitalised `verum.toml` is
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
    root_dir = require('lspconfig.util').root_pattern('verum.toml', 'verum.toml'),
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

### `404: Not Found` on the release archive URL

There is no tagged release yet. The `verum-linux-x86_64.tar.gz` /
`verum-macos-*.tar.gz` archives are produced by the
[release workflow](https://github.com/verum-lang/verum/blob/main/.github/workflows/release.yml)
when a `v*` Git tag is pushed; until that happens the URLs 404.
Use **[Build from source](#build-from-source)** instead.

### `error: failed to download \`rustc nightly-...\``

The repo's `rust-toolchain.toml` pins the nightly channel and
`rustup` will try to download it on first build. If the download
fails:

* Confirm `rustup` is installed (`rustup --version`).
* Confirm `rustup` can reach `https://static.rust-lang.org` (proxy
  / corporate firewall friction).
* Try a manual install: `rustup toolchain install nightly`.

### `error: failed to find native library 'LLVM-21'`

The `llvm-sys` bindings crate couldn't locate your LLVM 21 install.
Set `LLVM_SYS_210_PREFIX` to the LLVM install prefix:

```bash
# Linux (apt llvm-21 install)
export LLVM_SYS_210_PREFIX=/usr/lib/llvm-21

# macOS (Homebrew)
export LLVM_SYS_210_PREFIX=$(brew --prefix llvm@21)
```

`llvm-config-21 --prefix` prints the right value if `llvm-config-21`
is on your `$PATH`.

### Z3 build fails with `cmake: command not found`

The Z3 submodule builds via CMake. Install it via your package
manager (`apt install cmake` / `brew install cmake` /
`dnf install cmake`).

### Linux: `GLIBC_2.xx not found`

(Once prebuilt archives ship.) The Linux archive targets glibc
2.31+. On older distributions, [build from source](#build-from-source)
against your system glibc. A musl variant is not currently shipped.

### macOS: "cannot be opened because the developer cannot be verified"

(Once prebuilt archives ship.) Gatekeeper blocks the downloaded
binary. Clear the quarantine attribute:

```bash
xattr -d com.apple.quarantine /usr/local/bin/verum
```

### `verum: command not found`

The binary isn't on `$PATH`. Either reinstall to `/usr/local/bin`
(which is on the default `$PATH` on both Linux and macOS) or add the
directory you used:

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
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

The same applies to `cargo` / `rustup` — both honour the standard
`HTTPS_PROXY` environment variable for fetching crates and toolchains.

## Next steps

- **[Hello, World](/docs/getting-started/hello-world)** — write and
  run your first program.
- **[Language Tour](/docs/getting-started/tour)** — the major
  features in context.
- **[Project Structure](/docs/getting-started/project-structure)** —
  `verum.toml`, modules, cog packages, workspace layout.
- **[CLI Reference](/docs/reference/cli-commands)** — every real
  subcommand and flag.

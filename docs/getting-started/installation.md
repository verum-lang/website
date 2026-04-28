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

This is the toolchain binary you run to compile Verum programs.
End users running a prebuilt `verum` binary do not install any
extra toolchain — the binary is self-contained for the target
platform. **CVC5** is present as a stub; features that name it
degrade to Z3 via the capability router — see
[SMT routing](/docs/verification/smt-routing).

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
**nightly** toolchain. The build is fully self-contained: a single
`cargo build` clones, configures, and links every native dependency
the compiler needs.

### 1. Install prerequisites

The Verum build only needs a Rust toolchain and the standard
C/C++ build essentials — `cargo build` will pull in everything else
(including the LLVM source build) automatically the first time.

| Tool | Version | Notes |
|------|---------|-------|
| **Rust nightly** | The exact channel pinned in [`rust-toolchain.toml`](https://github.com/verum-lang/verum/blob/main/rust-toolchain.toml) | `cargo` reads the toolchain file and downloads the correct nightly automatically the first time you build. |
| **C++ compiler** | clang 12+, gcc 9+, or MSVC 2019+ | |
| **CMake** | 3.20+ | |
| **Ninja** | recommended (Make also works) | Significantly faster builds. |
| **Git** | 2.30+ | Used for submodule fetch and the auto-cloned native dependencies. |
| **Disk** | ~50 GB free | Most of this is transient build state; the final tree settles around ~3 GB. |
| **RAM** | 16 GB recommended | Peak link step needs ~12–14 GB. |

#### Per-platform install

**Ubuntu / Debian (22.04+):**

```bash
sudo apt update
sudo apt install -y \
    build-essential cmake ninja-build git pkg-config \
    libzstd-dev libxml2-dev libssl-dev curl
```

**Fedora / RHEL 9+:**

```bash
sudo dnf install -y \
    @development-tools cmake ninja-build git pkgconf-pkg-config \
    libzstd-devel libxml2-devel openssl-devel curl
```

**Arch Linux:**

```bash
sudo pacman -S --needed base-devel cmake ninja git pkgconf zstd libxml2 openssl curl
```

**macOS (Homebrew):**

```bash
xcode-select --install        # Apple's C/C++ toolchain
brew install cmake ninja git zstd
```

The Apple Command Line Tools provide `clang`, `make`, `ar`, etc.;
Homebrew supplies the rest. macOS ships `git` and `curl` already.

**Windows:**

Native MSVC builds are not supported by the in-repo native build
scripts. Use **WSL2** with one of the Linux recipes above (recommended)
or **MSYS2 / Git-Bash** with these packages:

```bash
pacman -S --needed mingw-w64-x86_64-gcc mingw-w64-x86_64-cmake \
    mingw-w64-x86_64-ninja git pkgconf zstd
```

If you want to avoid the in-tree LLVM build on Windows entirely,
point the build at a prebuilt LLVM tree via the `VERUM_LLVM_DIR`
environment variable (see [troubleshooting](#troubleshooting)).

#### Install rustup + nightly

If you don't already have `rustup`:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
```

Once `rustup` is installed, `cargo` reads `rust-toolchain.toml` from
the repo root and downloads the correct nightly channel
automatically the first time you build — no manual
`rustup default nightly` step is needed. The toolchain file also
pins the right components (`rustfmt`, `clippy`, `rust-src`,
`rust-analyzer`) so editor integration works without extra setup.

### 2. Clone with submodules

The repository carries Z3, CVC5, and a few other natives as Git
submodules. Clone with `--recursive` so they come along:

```bash
git clone --recursive https://github.com/verum-lang/verum
cd verum
```

If you already cloned without `--recursive`:

```bash
git submodule update --init --recursive
```

### 3. Build & install the Verum compiler

Pick either path — they produce the same binary, just differ in
whether `cargo` puts it on your `$PATH` for you.

**Option A — `cargo install` (recommended):** drops the binary
into `~/.cargo/bin` (which `rustup` already adds to your `$PATH`).

```bash
cargo install --path crates/verum_cli --force
```

`--force` overwrites a previous install with the freshly-built
binary; drop the flag if this is your first run.

**Option B — `cargo build` + manual install:** keeps the binary
under `target/release/` and lets you copy it where you want.

```bash
cargo build --release -p verum_cli
sudo install -m755 ./target/release/verum /usr/local/bin/verum

# Or, no-sudo variant:
mkdir -p ~/.local/bin
install -m755 ./target/release/verum ~/.local/bin/verum
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc   # or ~/.zshrc
```

Either path does the same end-to-end work the first time:

- bundled SMT solvers (Z3, CVC5) compile and link statically;
- the native LLVM dependency builds and installs in-tree
  automatically (~30–60 min on a 4-core box, fully silent except
  for cargo `warning:` lines);
- every workspace crate compiles with the full default feature
  set (`verification`, `parallel-compilation`, `incremental`,
  `profiling`, `distributed-cache`, `redis-cache`, `ipfs`).

Every user-visible capability is ON by default — there is no
`--features verification` opt-in to remember. Disable individual
features only if you have a specific reason to ship a
restricted binary (e.g. `--no-default-features --features
parallel-compilation` for a verification-free build).

Expect **10–25 minutes** for the Rust workspace itself, on top of
the one-time LLVM build. Incremental builds after that are
sub-minute.

### 4. Verify

```bash
verum --version
verum info --all
```

You should see version `0.1.0` and the LLVM-linked-21.x line in the
`verum info --all` output.

### Stripped builds (omit selected features)

The default build ships every user-visible capability. If you have
a specific reason to drop one (CI containers without SMT solvers,
embedded toolchains, etc.), pass `--no-default-features` and
re-enable the subset you actually need:

```bash
# Verification-free build — drops `verum verify` and refinement
# checking. `verum run` / `check` / `test` / REPL still work.
cargo build --release -p verum_cli \
    --no-default-features \
    --features parallel-compilation,incremental,profiling
```

LLVM is always linked in (the codegen backend is not behind a
feature flag); to skip the LLVM build entirely you currently need
to point at a prebuilt LLVM via `VERUM_LLVM_DIR` or wait for the
prebuilt-binary tags.

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

### Native build fails partway through

The first `cargo build` runs an in-tree LLVM build automatically.
If it fails it usually points at a missing prerequisite, not at a
Verum bug. Common failures and what to install:

* `cmake: command not found` — install CMake (3.20+) per the
  per-platform recipe in step 1.
* `ninja: command not found` — install Ninja (or use `gmake`
  / `make`; CMake will fall back).
* `c++: command not found` / `error: invalid C++ compiler` — install
  the platform's C++ toolchain (`build-essential` on Debian-likes,
  `xcode-select --install` on macOS, MSYS2's `mingw-w64-x86_64-gcc`
  on Windows).
* `No space left on device` — the LLVM build needs ~50 GB of
  transient disk; clean `target/` and `llvm/build/` and free space.
* The build dies during link with the OOM killer — set
  `CMAKE_BUILD_PARALLEL_LEVEL=2` (or lower) before `cargo build` to
  cap the parallel link step's memory.

If LLVM finished installing but the build still complains:

```bash
ls llvm/install/bin/llvm-config   # should exist
```

A missing `llvm-config` after the auto-build means the script
exited early. Inspect `llvm/build.log` for the reason and rerun
`cargo build` once you've fixed it; the build resumes from where
it stopped.

### Pointing the build at a prebuilt LLVM

If you already have a Verum-compatible LLVM 21 tree (matching
`llvm/llvm.toml`'s project / target / `MinSizeRel` configuration),
skip the auto-build by exporting `VERUM_LLVM_DIR`:

```bash
VERUM_LLVM_DIR=/path/to/your/llvm/install \
  cargo build --release -p verum_cli
```

The directory must contain `bin/llvm-config`; the build verifies
the major version on startup and refuses anything older than 21.

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

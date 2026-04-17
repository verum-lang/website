---
sidebar_position: 1
title: Installation
description: Install the Verum toolchain on Linux, macOS, or Windows — and set up your editor.
---

# Installation

Verum ships as a **single self-contained binary** — `verum` — that
bundles the compiler, interpreter, LSP server, Playbook TUI, package
manager (`cog`), formatter, and test runner. Everything the compiler
needs at runtime (native-codegen backend, SMT solvers, pre-compiled
standard library) is statically linked or packaged alongside the
binary; there are no external dynamic-library prerequisites for end
users.

## System requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| **Operating system** | Linux (glibc ≥ 2.31 or musl), macOS 12+, Windows 10 1809+ | Any recent version of each |
| **Architecture** | x86_64 or aarch64 | — |
| **Memory** | 2 GB free | 4 GB for large codebases; 8 GB for proof-heavy projects |
| **Disk** | 600 MB for the toolchain | 1 GB+ per project (per-project build cache) |

No `libc` pin, no `glibc`/`musl` distinction flag, no separate
runtime to install. On macOS the toolchain uses the system
`libSystem.B.dylib` (Apple's stable ABI) and nothing else; on Linux
glibc and musl builds are published separately; on Windows the MSVC
runtime is statically linked.

## Release artefacts

Release artefacts follow the **Rust target-triple** convention.
Every version publishes a uniform matrix:

| Platform | Target triple | Archive |
|----------|---------------|---------|
| Linux x86_64 (glibc) | `x86_64-unknown-linux-gnu`  | `verum-<version>-x86_64-unknown-linux-gnu.tar.xz` |
| Linux x86_64 (musl)  | `x86_64-unknown-linux-musl` | `verum-<version>-x86_64-unknown-linux-musl.tar.xz` |
| Linux aarch64        | `aarch64-unknown-linux-gnu` | `verum-<version>-aarch64-unknown-linux-gnu.tar.xz` |
| macOS Apple Silicon  | `aarch64-apple-darwin`      | `verum-<version>-aarch64-apple-darwin.tar.xz` |
| macOS Intel          | `x86_64-apple-darwin`       | `verum-<version>-x86_64-apple-darwin.tar.xz` |
| Windows x64          | `x86_64-pc-windows-msvc`    | `verum-<version>-x86_64-pc-windows-msvc.zip` |
| Windows ARM64        | `aarch64-pc-windows-msvc`   | `verum-<version>-aarch64-pc-windows-msvc.zip` |

Each release ships:

- The platform archive above.
- `SHA256SUMS` — SHA-256 of every archive in the release.
- `SHA256SUMS.sig` — minisign signature over `SHA256SUMS`, signed by
  the Verum release key (public key: [`verum-release.pub`](https://verum-lang.org/verum-release.pub)).
- `verum.prov.json` — SLSA v1 provenance metadata from the CI build.

### Archive layout

Every archive extracts to a single top-level directory,
`verum-<version>/`, with this layout:

```
verum-<version>/
├── bin/
│   └── verum[.exe]                 main toolchain binary (statically linked)
├── lib/
│   └── stdlib.vbc-cache/           pre-compiled core/ stdlib (VBC)
├── share/
│   ├── doc/LICENSE
│   ├── doc/RELEASE-NOTES.md
│   ├── completions/                bash, zsh, fish, pwsh completions
│   └── man/man1/                   manual pages (Linux/macOS)
└── VERSION                         plain-text version marker
```

`bin/verum` is self-contained: running it does not read any file in
`share/` or `lib/`. The `lib/stdlib.vbc-cache/` is copied to
`~/.verum/cache/stdlib/` on first launch to skip stdlib recompilation
on initial use; it is a cache, not a runtime dependency.

## One-line installer (recommended)

**Linux and macOS:**

```bash
curl -fsSL https://get.verum-lang.org | sh
```

**Windows (PowerShell):**

```powershell
irm https://get.verum-lang.org/win.ps1 | iex
```

The installer:

1. **Detects** the host OS and architecture from `uname -sm` (or
   `$PSVersionTable` on Windows) and picks the matching target
   triple.
2. **Resolves** the installation version — latest stable by
   default, or the value of the `VERUM_VERSION` environment
   variable if set.
3. **Downloads** three files from the release bucket:
   `verum-<version>-<triple>.<ext>`, `SHA256SUMS`,
   `SHA256SUMS.sig`.
4. **Verifies** the signature on `SHA256SUMS` against the bundled
   public key (the installer includes the public key as a
   base64-embedded literal), then verifies the archive's SHA-256.
5. **Extracts** into `~/.verum/toolchains/<version>/` (Windows:
   `%USERPROFILE%\.verum\toolchains\<version>\`).
6. **Atomically relinks** `~/.verum/active` → the new toolchain
   directory via a symlink (Linux/macOS) or a junction (Windows), so
   concurrent processes keep running against the old toolchain
   until they restart.
7. **Publishes shims** in `~/.verum/bin/` that exec the binary in
   the active toolchain, so `~/.verum/bin` is the only PATH entry
   the user ever needs.
8. **Updates the shell profile** — `~/.bashrc`, `~/.zshrc`,
   `~/.config/fish/config.fish`, or the user `Path` on Windows — to
   prepend `~/.verum/bin` once. Subsequent re-runs are idempotent.
9. **Handles macOS quarantine**: removes the
   `com.apple.quarantine` xattr from the extracted binary so
   Gatekeeper does not block first execution.

### Installer flags

All forms accept the same environment overrides:

```bash
VERUM_VERSION=0.32.0       \     # pin a specific release
VERUM_CHANNEL=nightly      \     # stable | beta | nightly
VERUM_INSTALL_DIR=/opt/verum \   # root dir (default: ~/.verum)
VERUM_NO_MODIFY_PATH=1     \     # do not edit shell profiles
VERUM_TRIPLE_OVERRIDE=…    \     # force a target triple (testing only)
curl -fsSL https://get.verum-lang.org | sh -s -- --yes
```

On PowerShell the same variables are read from the process
environment before `iex`. Batch-install scripts can set
`VERUM_NO_MODIFY_PATH=1` and manage PATH themselves.

### Non-interactive mode

Both installers run non-interactively when stdin is not a TTY (the
common case under `curl | sh`) and exit non-zero on any failed
step — no surprises in CI. A `--yes` / `-y` flag forces
non-interactive mode when stdin *is* a TTY.

## Install from pre-built binaries

Skip the installer if you prefer to manage the binary yourself:

```bash
# Linux x86_64 (glibc)
curl -LO https://github.com/verum-lang/verum/releases/latest/download/verum-x86_64-unknown-linux-gnu.tar.xz
tar xJf verum-x86_64-unknown-linux-gnu.tar.xz
sudo install -Dm755 verum-*/bin/verum /usr/local/bin/verum

# Linux aarch64
curl -LO https://github.com/verum-lang/verum/releases/latest/download/verum-aarch64-unknown-linux-gnu.tar.xz
tar xJf verum-aarch64-unknown-linux-gnu.tar.xz
sudo install -Dm755 verum-*/bin/verum /usr/local/bin/verum

# macOS Apple Silicon
curl -LO https://github.com/verum-lang/verum/releases/latest/download/verum-aarch64-apple-darwin.tar.xz
tar xJf verum-aarch64-apple-darwin.tar.xz
xattr -d com.apple.quarantine verum-*/bin/verum || true
sudo install -m755 verum-*/bin/verum /usr/local/bin/verum

# Windows (PowerShell)
iwr -Uri https://github.com/verum-lang/verum/releases/latest/download/verum-x86_64-pc-windows-msvc.zip -OutFile verum.zip
Expand-Archive verum.zip -DestinationPath $env:USERPROFILE\.verum
```

Always verify the archive against the release's `SHA256SUMS`:

```bash
curl -LO https://github.com/verum-lang/verum/releases/latest/download/SHA256SUMS
sha256sum --check --ignore-missing SHA256SUMS
```

## Package managers

```bash
# Homebrew (macOS, Linux)
brew install verum-lang/tap/verum

# Scoop (Windows)
scoop bucket add verum https://github.com/verum-lang/scoop-bucket
scoop install verum

# winget (Windows)
winget install verum-lang.verum

# Arch Linux (AUR)
yay -S verum-bin                  # pre-built binary
yay -S verum-git                  # bleeding edge from source

# Nix
nix profile install github:verum-lang/verum
```

Each package manager distributes the same target-triple-keyed
archives under its native packaging format, with the same signature
chain.

## Docker

```bash
docker pull ghcr.io/verum-lang/verum:latest
docker run --rm -v "$PWD":/work -w /work ghcr.io/verum-lang/verum:latest verum build
```

Tags: `latest`, `<version>`, `<version>-slim` (no LSP/DAP, smaller
attack surface for CI). Multi-arch manifest covers `linux/amd64`
and `linux/arm64`.

## Verify the installation

```bash
$ verum --version
verum 0.32.0 (phase-D, opus-stable)
  target:   x86_64-unknown-linux-gnu
  runtime:  full
  backends: llvm-21, mlir-21, smt (z3-4.15, cvc5-1.3)
```

`verum --version` reports the versions of the statically-linked
components for diagnostics, not as separate install prerequisites —
they are baked into the binary.

Run the diagnostic:

```bash
$ verum doctor
 ✓ toolchain binary        /home/you/.verum/bin/verum
 ✓ toolchain version       0.32.0
 ✓ active target           x86_64-unknown-linux-gnu
 ✓ stdlib cache            /home/you/.cache/verum/stdlib (338 modules)
 ✓ user cache dir          /home/you/.cache/verum
 ✓ PATH entry              ~/.verum/bin is on PATH
 ✓ project layout          [no project in current dir]
```

`verum doctor` catches install anomalies — stale stdlib cache, PATH
shadowing by another `verum` binary on PATH, or a toolchain
directory with missing files.

## Updating

```bash
verum upgrade                  # latest stable
verum upgrade --nightly        # nightly channel
verum upgrade --version 0.32.1 # specific version
verum upgrade --force          # re-download even if already latest
```

`verum upgrade` pulls the matching archive into
`~/.verum/toolchains/<new-version>/` and re-links the `active`
symlink atomically. The old toolchain stays on disk until
`verum upgrade --gc` (or explicit removal).

To pin a project to a specific toolchain:

```toml
# Verum.toml
[toolchain]
version = "0.32.0"
channel = "stable"
```

`verum` refuses to run if the currently active toolchain differs
from the pinned one — run `verum upgrade --version 0.32.0` or set
`[toolchain] override = true` to opt out.

## Build from source

Building Verum from source is only needed for compiler contributors
or for producing binaries for unsupported targets. End users should
use the pre-built binaries above.

**Build-from-source requirements** (differ from end-user
requirements):

| Dependency | Version | Purpose |
|------------|---------|---------|
| Rust | pinned in `rust-toolchain.toml` | compiling `verum_*` crates |
| CMake | 3.21+ | building LLVM from source |
| Python | 3.10+ | LLVM's build scripts |
| Ninja or GNU make | any recent | LLVM build driver |
| C / C++ compiler | clang 15+ recommended | LLVM / Z3 / CVC5 native code |
| Git | 2.30+ | submodule fetch |

```bash
git clone --recursive https://github.com/verum-lang/verum
cd verum
cargo build --release -p verum_cli
./target/release/verum --version
```

The build fetches and compiles LLVM 21.x, Z3, and CVC5 on first
run. Expect 20–40 minutes on a modern workstation. Subsequent
builds are incremental.

### Interpreter-only build

If you only need the VBC interpreter (no AOT native builds), drop
the LLVM and MLIR backends:

```bash
cargo build --release -p verum_cli --no-default-features --features interpreter-only
```

The resulting binary runs `verum run`, `verum check`, `verum test`,
the REPL, and the LSP. `verum build --release` produces VBC but no
native object files. Build time drops to under five minutes.

### Cross-compiling

```bash
rustup target add aarch64-unknown-linux-gnu
cargo build --release -p verum_cli --target aarch64-unknown-linux-gnu
```

See `scripts/build-release.sh` in the repo for the canonical cross
matrix CI uses.

## IDE integration

### VS Code

Install the **Verum** extension from the marketplace:

```
ext install verum-lang.verum
```

The extension auto-detects your `verum` binary and starts the LSP
server on any `.vr` file. Features:

- Inline refinement-type errors with counter-examples.
- Jump-to-definition, hover types, signature help.
- Inline playbook preview (click a function for its live call).
- Run tests directly from the gutter.
- Expand `@derive(...)` and other macros inline.

### Neovim (with nvim-lspconfig)

```lua
require('lspconfig').verum.setup{
  cmd = {'verum', 'lsp'},
  filetypes = {'verum'},
  root_dir = require('lspconfig.util').root_pattern('Verum.toml'),
  settings = {
    verum = {
      verify = { strategy = "static" },     -- or "formal" for background
      inlayHints = { refinements = true, contexts = true },
    },
  },
}
```

Add a filetype detection:

```lua
vim.filetype.add({ extension = { vr = 'verum' } })
```

### Emacs

```elisp
(use-package lsp-mode
  :config
  (add-to-list 'lsp-language-id-configuration '(verum-mode . "verum"))
  (lsp-register-client
   (make-lsp-client :new-connection (lsp-stdio-connection '("verum" "lsp"))
                    :major-modes '(verum-mode)
                    :server-id 'verum)))
```

### JetBrains IDEs

Install the **Verum** plugin from the marketplace (IDEA, CLion,
GoLand, RustRover — any platform that supports LSP).

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

## Shell completions

The archive ships completions in `share/completions/`; the installer
places them automatically on Linux and macOS. If you installed by
hand, wire them up:

```bash
verum completions bash > /etc/bash_completion.d/verum                 # bash
verum completions zsh  > "${fpath[1]}/_verum"                         # zsh
verum completions fish > ~/.config/fish/completions/verum.fish        # fish
verum completions pwsh > $PROFILE.CurrentUserAllHosts                 # PowerShell (append)
```

Restart your shell to pick up the completions.

## Uninstall

```bash
# Linux / macOS
rm -rf ~/.verum
# remove the PATH line from your shell profile (~/.zshrc, ~/.bashrc, ...)
```

```powershell
# Windows
Remove-Item -Recurse -Force "$env:USERPROFILE\.verum"
# and remove %USERPROFILE%\.verum\bin from your User Path
```

If you installed via package manager, use that manager's uninstall
command (`brew uninstall verum`, `scoop uninstall verum`, etc.).

## Troubleshooting

### `verum: command not found`

`~/.verum/bin` is not on your `PATH`. Either re-run the installer (it
is idempotent and re-adds the PATH entry) or add it by hand:

```bash
echo 'export PATH="$HOME/.verum/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

On Windows, re-run the PowerShell installer or add
`%USERPROFILE%\.verum\bin` to your user `Path` through System →
Environment Variables.

### `verum doctor` reports a corrupted binary

If `verum doctor` fails the toolchain-integrity check, the archive
was truncated or tampered with during download. Re-run the installer
with `VERUM_FORCE=1 curl -fsSL https://get.verum-lang.org | sh` to
redownload and re-verify signatures.

### SMT verification fails with "timeout"

Increase the per-obligation timeout:

```toml
[verify]
default_timeout_ms = 5000
```

Or on a single function:

```verum
@verify(formal, timeout_ms = 10000)
fn hard_to_prove() { ... }
```

### macOS: `verum` is blocked by Gatekeeper

The installer removes the quarantine xattr automatically. If you
extracted a release archive by hand, clear the xattr yourself:

```bash
xattr -d com.apple.quarantine /usr/local/bin/verum
```

### Binary won't run on older Linux: `GLIBC_2.xx not found`

Your distribution's glibc is older than the build target. Use the
musl archive instead — it's statically linked against musl libc and
runs on any Linux with a 4.x+ kernel:

```bash
curl -LO https://github.com/verum-lang/verum/releases/latest/download/verum-x86_64-unknown-linux-musl.tar.xz
```

### Corporate proxy blocks the installer

The installer respects `https_proxy` / `HTTPS_PROXY`; set it before
running:

```bash
https_proxy=http://proxy.corp:3128 curl -fsSL https://get.verum-lang.org | sh
```

Or skip the installer entirely and point the offline installer at a
pre-downloaded archive:

```bash
VERUM_ARCHIVE=/tmp/verum-0.32.0-x86_64-unknown-linux-gnu.tar.xz \
  sh ./get.sh
```

## Next steps

- **[Hello, World](/docs/getting-started/hello-world)** — write and
  run your first program.
- **[Language Tour](/docs/getting-started/tour)** — see the major
  features in context.
- **[Project Structure](/docs/getting-started/project-structure)** —
  `Verum.toml`, modules, cog packages, workspace layout.

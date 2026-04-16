---
sidebar_position: 1
title: Installation
description: Install the Verum toolchain on Linux, macOS, or Windows — and set up your editor.
---

# Installation

Verum ships as a single binary — `verum` — that bundles the compiler,
REPL, LSP server, Playbook TUI, package manager (`cog`), formatter,
and test runner.

## System requirements

- **OS**: Linux (x86_64, aarch64), macOS (arm64, x86_64), Windows
  (x86_64).
- **LLVM**: 21.x (bundled in official binaries; required when
  building AOT-compiled native binaries).
- **Z3**: 4.15+ (bundled).
- **CVC5**: 1.3.3+ (bundled).
- **Memory**: 2 GB for compilation of typical projects; 4 GB+ for
  stdlib builds. Large proof-heavy projects may require 8+ GB.
- **Disk**: 600 MB for the bundled toolchain; build artefacts add
  300-800 MB per project.

## One-line installer (recommended)

```bash
curl -fsSL https://get.verum-lang.org | sh
```

The script:

- Detects your platform.
- Downloads the matching release.
- Installs `verum` to `~/.verum/bin/`.
- Appends `~/.verum/bin` to your `PATH` in the appropriate shell
  profile (`~/.bashrc`, `~/.zshrc`, `~/.config/fish/config.fish`).

Restart your shell or `source` the profile to pick up the new PATH.

### Windows (PowerShell)

```powershell
irm https://get.verum-lang.org/win.ps1 | iex
```

Installs to `%USERPROFILE%\.verum\bin\` and updates your user
environment `Path`. Restart any open terminals.

## Install from pre-built binaries

Grab the archive for your platform from the
[releases page](https://github.com/verum-lang/verum/releases):

```bash
# Linux x86_64
curl -LO https://github.com/verum-lang/verum/releases/latest/download/verum-x86_64-linux.tar.gz
tar xzf verum-x86_64-linux.tar.gz
sudo mv verum /usr/local/bin/

# macOS arm64 (Apple Silicon)
curl -LO https://github.com/verum-lang/verum/releases/latest/download/verum-aarch64-darwin.tar.gz
tar xzf verum-aarch64-darwin.tar.gz
sudo mv verum /usr/local/bin/

# Linux aarch64
curl -LO https://github.com/verum-lang/verum/releases/latest/download/verum-aarch64-linux.tar.gz
tar xzf verum-aarch64-linux.tar.gz
sudo mv verum /usr/local/bin/
```

## Docker image

```bash
docker pull ghcr.io/verum-lang/verum:latest
docker run --rm -v "$PWD":/work -w /work ghcr.io/verum-lang/verum verum build
```

Tags: `latest`, `<version>`, `<version>-slim` (no LSP/REPL, smaller).

## Build from source

You need Rust 1.82+, CMake 3.21+, and Python 3.10+ (for the LLVM
build).

```bash
git clone https://github.com/verum-lang/verum
cd verum
cargo build --release -p verum_cli
./target/release/verum --version
```

The build fetches and compiles LLVM 21.x, Z3, and CVC5 on first run.
Expect 20-40 minutes depending on CPU. Subsequent builds are
incremental.

### Skip LLVM (faster dev build)

If you only need the interpreter and not AOT native builds:

```bash
cargo build --release -p verum_cli --no-default-features --features interpreter-only
```

This drops LLVM as a dependency; `verum run` still works, but
`verum build --release` won't produce a standalone binary.

## Verify the installation

```bash
$ verum --version
verum 0.32.0 (phase-D, opus-stable)
  llvm: 21.0.0
  z3:   4.15.2
  cvc5: 1.3.3
```

Run the diagnostic:

```bash
$ verum doctor
 ✓ toolchain binary     /usr/local/bin/verum
 ✓ LLVM 21.0.0
 ✓ Z3 4.15.2
 ✓ CVC5 1.3.3
 ✓ user cache dir       /home/you/.cache/verum
 ✓ project layout       [no project in current dir]
```

`verum doctor` catches common install issues — missing bundled
binaries, version mismatches, `PATH` shadowing.

## Updating

```bash
verum upgrade                  # update to latest stable
verum upgrade --nightly        # channel: nightly
verum upgrade --version 0.32.1 # specific version
```

`verum upgrade` pulls the matching binary from the release channel
into `~/.verum/bin/`.

To pin a project to a specific toolchain:

```toml
# Verum.toml
[toolchain]
version = "0.32.0"
channel = "stable"
```

`verum` will warn (and optionally refuse) if the currently active
toolchain differs.

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
GoLand, RustRover all work — any platform that supports LSP).

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

```bash
verum completions bash > /usr/local/etc/bash_completion.d/verum       # bash
verum completions zsh  > "${fpath[1]}/_verum"                          # zsh
verum completions fish > ~/.config/fish/completions/verum.fish         # fish
```

Restart your shell to pick up the completions.

## Uninstall

```bash
rm -rf ~/.verum
# remove `~/.verum/bin` from your shell profile
```

If installed via the pre-built binaries without the installer
script:

```bash
sudo rm /usr/local/bin/verum
```

## Troubleshooting

### `verum: command not found`

PATH not set. Add `~/.verum/bin` to your shell profile:

```bash
echo 'export PATH="$HOME/.verum/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### `error: failed to find Z3 library`

The bundled binary could not locate Z3. Run `verum doctor` — if it
reports Z3 as missing, the download was corrupted. Reinstall with
`verum upgrade --force`.

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

If you installed via tarball on macOS and Gatekeeper blocks the
binary:

```bash
xattr -d com.apple.quarantine /usr/local/bin/verum
```

Alternatively, use the installer script, which handles this for you.

### Windows: `verum build` fails with "LLVM not found"

The installer bundles LLVM 21.x in `%USERPROFILE%\.verum\lib`. If you
customised the install, ensure the environment variable
`LLVM_SYS_210_PREFIX` points at that directory.

## Next steps

- **[Hello, World](/docs/getting-started/hello-world)** — write and
  run your first program.
- **[Language Tour](/docs/getting-started/tour)** — see the major
  features in context.
- **[Project Structure](/docs/getting-started/project-structure)** —
  `Verum.toml`, modules, cog packages, workspace layout.

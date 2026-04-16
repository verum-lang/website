---
sidebar_position: 1
title: Installation
---

# Installation

Verum ships as a single binary — `verum` — that bundles the compiler,
REPL, LSP server, Playbook TUI, package manager (`cog`), and formatter.

## System requirements

- **OS**: Linux (x86_64, aarch64), macOS (arm64, x86_64), Windows (x86_64)
- **LLVM**: 21.x (bundled in official binaries)
- **Z3**: 4.15+ (bundled)
- **CVC5**: 1.3.3+ (bundled)
- **Memory**: 2 GB for compilation of typical projects; 4 GB+ for stdlib builds

## Install via the installer script

```bash
curl -fsSL https://get.verum-lang.org | sh
```

This installs `verum` to `~/.verum/bin` and adds it to your `PATH`.

## Install from pre-built binaries

Download the archive for your platform from the
releases page, extract,
and put the `verum` binary on your `PATH`:

```bash
# Linux x86_64
curl -LO https://github.com/verum-lang/verum/releases/latest/download/verum-x86_64-linux.tar.gz
tar xzf verum-x86_64-linux.tar.gz
sudo mv verum /usr/local/bin/

# macOS arm64 (Apple Silicon)
curl -LO https://github.com/verum-lang/verum/releases/latest/download/verum-aarch64-darwin.tar.gz
tar xzf verum-aarch64-darwin.tar.gz
sudo mv verum /usr/local/bin/
```

## Build from source

You need Rust 1.82+, CMake 3.21+, and Python 3.10+ (for the LLVM build).

```bash
git clone https://github.com/verum-lang/verum
cd verum
cargo build --release -p verum_cli
./target/release/verum --version
```

The build fetches and compiles LLVM 21.x, Z3, and CVC5 on first run.
Expect 20-40 minutes depending on CPU. Subsequent builds are incremental.

## Verify the installation

```bash
$ verum --version
verum 0.32.0 (phase-D, opus-stable)
  llvm: 21.0.0
  z3:   4.15.2
  cvc5: 1.3.3
```

## IDE integration

### VS Code

Install the **Verum** extension from the marketplace:

```
ext install verum-lang.verum
```

The extension auto-detects your `verum` binary and starts the LSP
server on any `.vr` file.

### Neovim

```lua
require('lspconfig').verum.setup{
  cmd = {'verum', 'lsp'},
  filetypes = {'verum'},
  root_dir = require('lspconfig.util').root_pattern('Verum.toml'),
}
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

## Uninstall

```bash
rm -rf ~/.verum
# remove ~/.verum/bin from your PATH in your shell profile
```

## Next steps

- **[Hello, World](/docs/getting-started/hello-world)** — write and run
  your first program.
- **[Language Tour](/docs/getting-started/tour)** — see the major
  features in context.

---
sidebar_position: 1
title: Installation
description: Install Verum — grab a daily prebuilt dev build for Linux, macOS, or Windows, or build from source.
---

# Installation

Verum ships as a **single binary** — `verum` — that contains the
compiler, interpreter, LSP server, Playbook TUI, formatter, and test
runner. Release archives package that executable. The current builds may
still require system or third-party shared libraries; see the
[dependency status](#what-the-verum-binary-itself-links-against) below.

There are two ways to get it:

- **[Dev builds](#dev-builds-rolling-release)** — prebuilt binaries for
  all six supported platforms, rebuilt automatically **every day** and
  published to a rolling `dev` release. This is the fastest way to try
  Verum; no toolchain, no compile.
- **[Build from source](#build-from-source)** — compile the toolchain
  yourself. Needed for platforms outside the prebuilt matrix, or when
  you want to hack on the compiler.

:::info Pre-release, but prebuilt daily

Verum has not tagged a versioned `0.1.0` release yet — the language is
still in active development. Instead, a continuous-integration job
publishes a **rolling `dev` release**: the full platform matrix is
rebuilt on a daily schedule and the single
[`dev`](https://github.com/verum-lang/verum/releases/tag/dev) tag is
force-moved to the freshly-built commit, so its assets always reflect
one recent `main` commit. These are bleeding-edge builds — expect rapid
change between days. See **[Dev builds](#dev-builds-rolling-release)**
below.

Versioned archives (`verum-v0.1.0-<triple>.tar.gz`) will ship from the
[release workflow](https://github.com/verum-lang/verum/blob/main/.github/workflows/release.yml)
when the first `v*` tag lands; the
[Versioned releases](#versioned-releases-once-tagged) section is kept
as forward-looking reference for that flow.
:::

## Supported platforms

The rolling `dev` release builds **six** target triples every day.
Five are non-experimental; Windows-on-ARM is built best-effort and may
occasionally be missing from a given day's assets.

| Platform | Target triple | Dev build |
|----------|---------------|-----------|
| Linux x86_64 | `x86_64-unknown-linux-gnu` | ✅ daily |
| Linux aarch64 | `aarch64-unknown-linux-gnu` | ✅ daily |
| macOS Apple Silicon | `aarch64-apple-darwin` | ✅ daily |
| macOS Intel | `x86_64-apple-darwin` | ✅ daily |
| Windows x64 | `x86_64-pc-windows-msvc` | ✅ daily |
| Windows ARM64 | `aarch64-pc-windows-msvc` | ⚠️ experimental |
| Linux musl / other | — | Build from source |

Anything outside this matrix requires a [source build](#build-from-source).

### What the `verum` binary itself links against

The **host `verum` CLI and its interpreter may use libc and baseline system
libraries**. The deployment requirement is that the downloaded tool run on
a clean installation of its documented supported target OS, without
separately installed third-party libraries. The strict no-libc contract
applies to [generated AOT programs](#what-programs-compiled-by-verum-build-link-against).

The reusable [binary build workflow](https://github.com/verum-lang/verum/blob/main/.github/workflows/build-verum.yml)
uses ordinary Rust GNU/Linux and MSVC/Windows host targets. It does not
establish a universal minimum glibc version or prove clean-system
portability. Dependencies must be checked on the exact asset:

| Platform | CLI compatibility check |
|----------|-------------------------|
| Linux | Compare the ELF interpreter, `NEEDED` libraries and symbol versions (`readelf -l`, `readelf -d`, `readelf --version-info`) with the supported distribution baseline. |
| macOS | Check `otool -L` imports and the deployment target. System libraries may be used; external Homebrew paths must not be required on a clean installation. |
| Windows | Check PE imports (`dumpbin /imports`) against the supported Windows baseline. CRT use is allowed for the CLI, but availability of each imported runtime component must be verified. |

**Release inspection (2026-10-04):** the rolling assets published that day
were inspected without executing them. Their imports were:

| Inspected assets | Observed imports |
|------------------|------------------|
| Linux x86_64 and aarch64 | Dynamic loader, `libc.so.6`, `libm.so.6`, `libgcc_s.so.1`, `libstdc++.so.6`, `libssl.so.3`, `libcrypto.so.3`; versioned glibc imports include `GLIBC_2.39`. |
| macOS Intel and Apple Silicon | libSystem plus libc++, system frameworks and Homebrew OpenSSL paths (`/usr/local/opt/openssl@3/…` on Intel, `/opt/homebrew/opt/openssl@3/…` on Apple Silicon). |
| Windows x64 and ARM64 | UCRT `api-ms-win-crt-*` imports, `MSVCP140.dll` and `VCRUNTIME140.dll`, in addition to OS DLLs; x64 also imports `VCRUNTIME140_1.dll`. |

The [recorded artifact inspection](https://github.com/verum-lang/verum/blob/main/docs/architecture/no-libc-dev-artifacts-2026-10-04.json)
contains asset identities and dependency details. These observations are
not a clean-system compatibility certification:

- The Linux `GLIBC_2.39` imports set a libc symbol-version requirement for
  those assets. They constrain the compatible OS baseline; they do not
  violate the CLI contract. `libssl.so.3`, `libcrypto.so.3` and
  `libstdc++.so.6` must not be assumed present on every clean Linux system.
- Absolute Homebrew OpenSSL imports are a macOS packaging defect because
  Homebrew libraries are not part of a clean macOS installation.
- Windows UCRT and MSVC runtime availability must be checked against the
  supported target baseline. Their presence in CLI imports is not itself
  forbidden, but requiring a separate redistributable install would fail
  the clean-system deployment requirement.

Recheck later rolling assets rather than assuming they have the same
imports. A single packaged executable does not prove clean-system
portability. Source builds still require the host tools listed
[below](#build-from-source); those build tools are not an end-user runtime
requirement. The [architecture page](/docs/architecture/no-libc-architecture)
separates CLI compatibility checks from strict generated AOT checks.

The SMT backend is bundled in-binary and routed via capability profiles
([SMT routing](/docs/verification/smt-routing)); no separate solver install
is required for default workflows. External provers — Lean 4 and Coq /
Rocq — are needed only for the
[external-prover replay](/docs/architecture/external-prover-verification)
gate (`verum audit --external-prover-replay`).

### What programs compiled by `verum build` link against

Generated AOT programs must obey these strict runtime boundaries:

| Target | Required runtime boundary | Entry point |
|--------|---------------------------|-------------|
| Linux | Direct kernel syscalls, no libc | `_start` |
| macOS | `libSystem.B.dylib`; explicitly used GPU frameworks add dependencies | `main` |
| Windows | `ntdll.dll` + `kernel32.dll`, no MSVC CRT / UCRT | `mainCRTStartup` |
| FreeBSD | Direct kernel syscalls, no libc | `_start` |
| Embedded / bare-metal | No OS runtime | `Reset_Handler` |
| WASM-WASI | WASI host imports | `_start` |

`NoLibcConfig` describes the native linker configuration, but some current
compiler-driver links still use default libraries, and runtime paths such
as ordinary Float output still emit libc calls. Consequently, selecting
AOT or `--static-link` does not prove no-libc conformance. Audit the actual
output using the [verification procedure](/docs/architecture/no-libc-architecture#5-verification-procedure).
A static ELF claim requires inspecting the produced ELF, not extrapolating
from a target triple or a successful compilation.

## Dev builds (rolling release)

The fastest way to run Verum today: download a prebuilt binary from the
rolling [`dev`](https://github.com/verum-lang/verum/releases/tag/dev)
release. You do not need to compile LLVM or Verum to use a downloaded
asset, but its [shared-library requirements](#what-the-verum-binary-itself-links-against)
still apply.

**How the `dev` release works.** A GitHub Actions job rebuilds the full
six-triple platform matrix **once a day (06:00 UTC)** — and on demand
after an important fix — then force-moves the single `dev` tag to the
built commit and replaces every asset. The release therefore always
holds exactly one recent `main` commit's binaries, refreshed daily. No
new release objects pile up while the language is pre-`0.1.0`.

:::caution These are development snapshots
The `dev` binaries track the tip of `main` and can change behaviour day
to day. They are ideal for trying the language and following its
progress, but pin a source build if you need a stable reference point
for a project. There is no backward-compatibility guarantee between dev
builds yet.
:::

Every run publishes, per triple, a `verum-dev-<triple>.tar.gz` (Linux /
macOS) or `verum-dev-<triple>.zip` (Windows) archive plus a matching
`.sha256`. The binary inside is the `verum` toolchain
described [above](#what-the-verum-binary-itself-links-against).

### Linux (x86_64)

```bash
curl -LO https://github.com/verum-lang/verum/releases/download/dev/verum-dev-x86_64-unknown-linux-gnu.tar.gz
curl -LO https://github.com/verum-lang/verum/releases/download/dev/verum-dev-x86_64-unknown-linux-gnu.tar.gz.sha256
shasum -a 256 -c verum-dev-x86_64-unknown-linux-gnu.tar.gz.sha256
tar xzf verum-dev-x86_64-unknown-linux-gnu.tar.gz
sudo install -Dm755 verum /usr/local/bin/verum
verum --version
```

For Linux ARM64, swap `x86_64-unknown-linux-gnu` →
`aarch64-unknown-linux-gnu` in every URL.

### macOS (Apple Silicon)

```bash
curl -LO https://github.com/verum-lang/verum/releases/download/dev/verum-dev-aarch64-apple-darwin.tar.gz
curl -LO https://github.com/verum-lang/verum/releases/download/dev/verum-dev-aarch64-apple-darwin.tar.gz.sha256
shasum -a 256 -c verum-dev-aarch64-apple-darwin.tar.gz.sha256
tar xzf verum-dev-aarch64-apple-darwin.tar.gz
# Gatekeeper quarantines downloaded binaries; clear the xattr:
xattr -d com.apple.quarantine verum 2>/dev/null || true
sudo install -m755 verum /usr/local/bin/verum
verum --version
```

For Intel macOS, swap `aarch64-apple-darwin` → `x86_64-apple-darwin`.

### Windows (x64)

Download `verum-dev-x86_64-pc-windows-msvc.zip` and its `.sha256` from
the [`dev` release](https://github.com/verum-lang/verum/releases/tag/dev),
verify, and put `verum.exe` on your `PATH`:

```powershell
$base = "https://github.com/verum-lang/verum/releases/download/dev"
$asset = "verum-dev-x86_64-pc-windows-msvc.zip"
Invoke-WebRequest "$base/$asset" -OutFile $asset
Invoke-WebRequest "$base/$asset.sha256" -OutFile "$asset.sha256"
# Verify (compare the two hashes):
(Get-FileHash $asset -Algorithm SHA256).Hash.ToLower()
Get-Content "$asset.sha256"
Expand-Archive $asset -DestinationPath $env:USERPROFILE\verum
# Add $env:USERPROFILE\verum to your PATH, then:
verum --version
```

Windows-on-ARM (`aarch64-pc-windows-msvc`) is built best-effort and may
be absent on some days — fall back to a source build (via WSL2) if the
asset is missing.

### Staying current

There is no `verum upgrade` command. To move to the latest dev build,
re-download the archive for your platform and replace the binary in
place — the `dev` URLs above always resolve to the newest daily build.
Already-running processes keep their old inode open until they restart.

## Build from source

This path compiles the toolchain yourself. Use it for platforms outside
the [prebuilt matrix](#supported-platforms), for a stable pinned
reference, or to hack on the compiler. The Verum compiler is
written in the host language and uses unstable features that require the
**nightly** toolchain. After installing the host prerequisites below,
`cargo build` manages the compiler build and LLVM preparation. This build
automation does not imply that the resulting executable has no shared-library
dependencies.

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

The repository carries bundled SMT-solver sources and a few other
natives as Git submodules. Clone with `--recursive` so they come along:

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

- bundled SMT solvers compile and link statically;
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
the one-time LLVM build. Later builds reuse unchanged dependencies.
Changes to the compiler or standard library can rebuild the embedded standard-library archive, so
an incremental build can still take substantial time.

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

## Versioned releases (once tagged)

When the first `v*` tag is pushed, the
[release workflow](https://github.com/verum-lang/verum/blob/main/.github/workflows/release.yml)
will publish a normal (non-pre-release) GitHub release with generated
notes and one archive per triple, using the same six-platform matrix
and packaging as the dev builds — only the version string in the name
changes:

```
verum-<tag>-<triple>.tar.gz      # Linux / macOS, e.g. verum-v0.1.0-x86_64-unknown-linux-gnu.tar.gz
verum-<tag>-<triple>.zip         # Windows
```

Each archive ships a matching `.sha256`, and the release additionally
carries a combined `SHA256SUMS` file. Installation is identical to the
[dev-build steps](#dev-builds-rolling-release) above — substitute the
versioned URL (`.../releases/download/<tag>/verum-<tag>-<triple>...`)
for the `dev` URL. Until that first tag lands, use a dev build or a
source build; the versioned URLs 404.

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
  SMT Solver:   solver-adapter pool (via verum_smt capability router)
  CBGR Runtime: verum_cbgr v0.1.0

Usage:
  Project commands: verum build, verum run, verum test
  Single file commands: verum run <file.vr>, verum check <file.vr>
  Verification: verum verify, verum audit --framework-axioms
  For help: verum --help
```

`verum info --features` and `verum info --llvm` narrow the output to
just one slice if you need it.

### Check installation health

```bash
verum doctor
```

This checks the compiler version, user directory, caches, content store,
permission grammar, and the project lockfile when present. Use
`verum doctor --json` for a machine-readable report. See
[CLI health and diagnostics](/docs/tooling/cli#health--diagnostics-verum-doctor).

### Diagnose the verification stack

Use **`verum smt-info`** for solver diagnostics:

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
`powershell`, and `elvish`. Run `verum completions --help` to check
the choices supported by your installed binary.

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
    root_dir = require('lspconfig.util').root_pattern('Verum.toml', 'verum.toml'),
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

Remove the compiler using the method you used to install it:

```bash
# Installed with cargo install:
cargo uninstall verum_cli

# Copied into /usr/local/bin:
sudo rm /usr/local/bin/verum
```

The user directory `~/.verum/` remains after removing the compiler.
It can contain settings, signing keys, verification statistics, caches
(including compiled script executables), and optional standard-library
source SDKs installed with `verum stdlib install`. Keep any settings or
keys you need before deleting that directory. Project source files live
in their own directories.

## Troubleshooting

### `404: Not Found` on the release archive URL

If a **versioned** URL (`.../releases/download/v0.1.0/...`) 404s, there
is no such tag yet — no `v*` release has been cut. Use a
**[dev build](#dev-builds-rolling-release)** or a
**[source build](#build-from-source)** instead.

If a **dev** URL (`.../releases/download/dev/verum-dev-<triple>...`)
404s, check that the triple in the filename exactly matches your
platform (e.g. `x86_64-unknown-linux-gnu`, not `linux-x86_64`) — the
asset names use full LLVM target triples. The experimental
`aarch64-pc-windows-msvc` asset can also be genuinely absent on a day
its build leg failed; fall back to a source build.

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

This error identifies a dependency of the downloaded host executable.
Inspect that exact asset with `readelf --version-info` and `readelf -d`;
there is no established universal glibc minimum for all rolling builds.
Use a compatible host build or [build from source](#build-from-source)
with your system toolchain. The current release matrix has GNU/Linux
triples, not a separate musl asset. A host CLI libc dependency is permitted;
its symbol versions must match the advertised OS baseline. This is separate
from the [strict no-libc requirement for generated AOT programs](/docs/architecture/no-libc-architecture).

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
  curl -LO https://github.com/verum-lang/verum/releases/download/dev/verum-dev-x86_64-unknown-linux-gnu.tar.gz
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

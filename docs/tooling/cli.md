---
sidebar_position: 1
title: CLI
---

# `verum` — Command-line interface

Verum's command suite — 33+ subcommands organised by concern.

## Project lifecycle

```bash
verum new <name>              # create a new project
verum init                    # initialise an existing directory
verum add <dep> [--version X] # add a dependency
verum remove <dep>             # remove a dependency
verum update                   # update dependencies
```

## Build, run, test

```bash
verum build [--release] [--target TARGET]
verum run [--release] [-- args...]
verum check                   # type-check only
verum test [--filter REGEX]
verum bench [--filter REGEX]
verum watch                   # recompile on file changes
```

## Verification & analysis

```bash
verum verify [--level smt|portfolio|certified]
verum analyze [--report cbgr|refinements|capabilities|smt]
verum audit                   # security audit against advisory db
verum lint
verum fmt [--check]
```

## Docs & search

```bash
verum doc [--open]            # generate + serve docs
verum doc --search "Iterator"
verum api --signature "fn map"
verum explain E0042           # explain an error code
```

## Interactive

```bash
verum repl                    # interactive REPL
verum playbook                # launch Playbook TUI
verum file <path.vr>          # file-mode REPL
```

## Packaging

```bash
verum publish                 # publish to the registry
verum search <query>          # search the registry
verum tree                    # dependency tree
verum deps                    # dependency analysis
```

## Workspace

```bash
verum workspace list
verum workspace build
verum workspace test
```

## Services

```bash
verum lsp                     # language server (stdin/stdout)
verum dap                     # debug adapter protocol
```

## Utilities

```bash
verum clean                   # clean target/
verum version
verum config get <key>
verum config set <key> <value>
verum cog-manager install <cog>
verum proof-cache stats
verum proof-cache clear
```

## Global flags

```
--verbose, -v          # print more
--quiet, -q            # print less
--offline              # don't touch the network
--frozen               # error on lockfile mismatch
--locked               # use lockfile exactly
--manifest-path PATH   # override Verum.toml location
--target TARGET        # cross-compile
--features FEATURES    # comma-separated feature flags
--no-default-features
--all-features
```

## Environment variables

```
VERUM_HOME=~/.verum               # toolchain root
VERUM_LOG=debug                   # log level
VERUM_SMT_TELEMETRY=1             # emit SMT routing telemetry
VERUM_PROFILE=release             # default profile
VERUM_TARGET_DIR=target           # output directory
```

## Configuration files

- **`Verum.toml`** — project manifest (see [verum.toml](/docs/reference/verum-toml)).
- **`.verum/config.toml`** — user-level config.
- **`target/.verum-cache/`** — build cache.

## See also

- **[Build system](/docs/tooling/build-system)** — how build
  invocations work.
- **[Cog packages](/docs/tooling/cog-packages)** — dependencies,
  publishing.
- **[Reference → CLI commands](/docs/reference/cli-commands)** — full
  reference with all flags.

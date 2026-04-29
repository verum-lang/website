---
sidebar_position: 14
title: Incremental verification cache
---

# `verum cache-closure` — Per-theorem incremental verification cache

For corpora with hundreds of theorems (a typical research corpus
ranges from 30 to 1000+ theorems), full re-check on every save is
unacceptable.  Verum's **closure-hash incremental cache** stores
per-theorem `(fingerprint → verdict)` records on disk; when a
verify run sees a fingerprint match for an `Ok` verdict, it skips
the kernel / SMT re-check entirely.

## Mental model

Every theorem has a typed **closure fingerprint**:

```text
ClosureFingerprint = blake3(
    kernel_version       // pinned per Verum kernel release
    +  signature         // theorem signature payload
    +  body              // proof body payload
    +  citations         // sorted+deduped @framework citations
)
```

The fingerprint changes when:

- The theorem's signature changes (rename, add a `requires` clause,
  change a return type).
- The proof body changes (add a tactic, swap an `apply` target).
- The transitive `@framework("…","…")` citation set changes (sort
  + dedup applies before hashing — order is irrelevant).
- **The kernel version changes.** Any kernel-rule edit changes the
  pinned kernel version, which invalidates ALL caches
  unconditionally — the trust boundary has shifted.

Cache lookup returns a typed **decision**:

| Decision | Meaning |
|---|---|
| `Skip` | Fingerprint matches, cached verdict was Ok — skip the kernel re-check entirely. |
| `Recheck (no_cache_entry)` | First time we see this theorem. |
| `Recheck (fingerprint_mismatch)` | The theorem changed since the cache was written. |
| `Recheck (kernel_version_changed)` | Kernel version drift — entire cache invalidated. |
| `Recheck (previous_verdict_failed)` | Cached verdict was a failure; must re-confirm (kernel might have learned new rules). |

Every recheck is **traceable to a specific cause** — there is no
silent fall-through.  This is the core of the contract.

## Production wiring

The cache is wired into `verum verify`'s theorem-proof pipeline.
Two flags control it:

```bash
verum verify --closure-cache [--closure-cache-root <PATH>]
```

- `--closure-cache` — opt in to the cache.  Defaults to off.
- `--closure-cache-root <PATH>` — override the cache root.  Implies
  `--closure-cache`.  Standard CI use is to point this at a shared
  NFS path so multiple agents reuse cached verdicts.

When unset, the cache root defaults to:

```
<input.parent>/target/.verum_cache/closure-hashes/
```

— mirroring Verum's `target/` build-output layout.

The verify-run summary includes a cache-hit-ratio line:

```
Theorem verification: 142/142 verified, 0 failed, 0 axioms
                       (search: 142 attempts, 142 hits)
Closure cache: 138 hit(s), 4 miss(es), 97.2% hit-ratio
```

You can also configure the cache via the `[verify]` block in
`verum.toml`:

```toml
[verify]
closure_cache_enabled = true
closure_cache_root = "/nfs/verum-cache/main"
```

CLI flags always override the manifest.

## Subcommand reference

The `verum cache-closure` subcommand is the inspector / control
surface for the cache:

```bash
verum cache-closure stat   [--root <P>] [--format plain|json]
verum cache-closure list   [--root <P>] [--format plain|json]
verum cache-closure get    <theorem> [--root <P>] [--format plain|json]
verum cache-closure clear  [--root <P>] [--format plain|json]
verum cache-closure decide <theorem> --signature <s> --body <s> \
                           [--cite <c>]… [--kernel-version <v>] \
                           [--root <P>] [--format plain|json]
```

`--root` overrides the default cache location (same default as the
verify-side flag).  Every subcommand auto-creates the root
directory if missing.

### `stat`

Summary statistics:

```bash
$ verum cache-closure stat
Closure cache statistics
  root          : /path/to/project/target/.verum_cache/closure-hashes
  entries       : 142
  size_bytes    : 56814
  hits          : 0
  misses        : 0
  hit_ratio     : 0.0000
```

`hits` and `misses` are live counters managed by the in-process
cache instance; the stat subcommand reports the **on-disk** state
plus stored counters (which start at 0 for fresh handles — they're
intended for the verify pipeline's per-run telemetry).

### `list`

Every theorem name currently cached, one per line.

### `get <theorem>`

Print a single record (fingerprint + verdict).  Plain text:

```bash
$ verum cache-closure get thm.example
Theorem      : thm.example
Recorded at  : 1714478400
Fingerprint:
  kernel_version  : 2.6.0
  signature_hash  : 5e9c1c…
  body_hash       : a04c8d…
  citations_hash  : 21f4e3…
  closure_hash    : 7b2a90…
Verdict:
  status  : ok
  elapsed : 142ms
```

Returns non-zero on a missing theorem name.

### `clear`

Remove every entry.  Idempotent (clearing an empty cache exits
zero with `cleared: 0`).

### `decide <theorem> --signature <s> --body <s> --cite <c>… --kernel-version <v>`

Probe the cache: report Skip / Recheck for the given fingerprint
without invoking the kernel.  The signature / body / citations
payloads are hashed with blake3 to produce the fingerprint.  Any
stable serialisation of the elaborated theorem works (the verify
pipeline does this automatically); for ad-hoc usage from the CLI,
just hand in canonical strings.

`--kernel-version` defaults to the running kernel version.

```bash
$ verum cache-closure decide thm.example \
    --signature "forall x. x > 0 -> succ(x) > 0" \
    --body "apply succ_pos" \
    --cite "framework_msfs"
Theorem        : thm.example
Closure hash   : 7b2a90c4…
Kernel version : 2.6.0

Decision : skip   (cache hit)
  cached_at      : 1714478400
  cached_elapsed : 142ms
```

## Validation contract

| Rule | Error |
|---|---|
| `--format` not `plain`/`json` | `--format must be 'plain' or 'json'` |
| `decide --signature` empty | `--signature must be non-empty` |
| `decide --body` empty | `--body must be non-empty` |
| `get <theorem>` missing | `no cache entry for theorem 'X' (run \`verum cache-closure list\` to see what's cached)` |

`stat` / `list` / `clear` are infallible (return exit 0 even on an
empty cache root — they auto-create it).

## Storage layout

The cache ships one JSON file per theorem under the cache root:

```
target/.verum_cache/closure-hashes/
├── thm.example-7b2a90c4.json
├── thm.foo-bar-2c1f7e80.json
└── lemma.helper-9d8e2a4b.json
```

Filename = `<sanitized_name>-<short_blake3>.json`.  Names are
sanitised (alphanumeric / `.` / `-` / `_` preserved; everything
else replaced with `_`); a 32-bit blake3 suffix ensures distinct
names map to distinct files even when sanitised stems collide.

JSON file shape:

```json
{
  "theorem_name": "thm.example",
  "fingerprint": {
    "kernel_version": "2.6.0",
    "signature_hash": "5e9c1c…",
    "body_hash":      "a04c8d…",
    "citations_hash": "21f4e3…"
  },
  "verdict": { "Ok": { "elapsed_ms": 142 } },
  "recorded_at": 1714478400
}
```

Corrupt / unreadable files are silently treated as "no entry" —
parse failures degrade gracefully into a recheck rather than
poisoning the run.

## Distributed cache (CI)

For CI agents that share a cache, point `--closure-cache-root` at a
mounted NFS path (or sync via `rsync` / object storage):

```bash
# CI agent A, runs at 09:00:
verum verify --closure-cache --closure-cache-root /nfs/verum-cache/main

# CI agent B, runs at 09:05 against the same branch:
#   theorem 137 → SKIP (hit from agent A's run)
verum verify --closure-cache --closure-cache-root /nfs/verum-cache/main
```

The shared-root pattern works for any storage backend that supports
POSIX-style file locks (NFS, ZFS, EFS).  S3 / GCS-backed adapters
are a future addition and will work via the same flags without any
client-side changes.

## Cache invalidation policies

The cache invalidates entries automatically — there is no manual
"stale entry" detection step.  The four invalidation triggers:

1. **Kernel-version drift** — every entry whose stored
   `kernel_version` differs from the running kernel is treated as
   `Recheck`.  Kernel-rule edits bump the version, so users
   automatically re-verify on toolchain upgrade.
2. **Fingerprint mismatch** — any change to the theorem's
   signature, proof body, or citation set produces a new
   fingerprint.
3. **Previous failure** — a cached `Failed` verdict re-runs on
   every check.  This is intentional: the kernel may have learned
   new rules that close a previously-Open obligation; you don't
   want to keep believing the failure if the toolchain has moved
   forward.
4. **Manual `clear`** — `verum cache-closure clear` removes every
   entry; useful before benchmarking a fresh build.

## Cross-references

- **[Verification → CLI workflow](/docs/verification/cli-workflow)**
  — the `verum verify` command's full flag matrix, including the
  `--closure-cache` integration.
- **[Architecture → incremental compilation](/docs/architecture/incremental-compilation)**
  — broader incremental-compilation pipeline (build cache, VBC
  cache, proof cache).
- **[Auto-paper generator](/docs/tooling/auto-paper)** — every
  rendered theorem carries the same closure hash for the
  reproducibility envelope.

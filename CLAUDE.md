# Verum website — public documentation

This is the **public** documentation site (Docusaurus) for the
Verum language. Everything under `docs/` is reader-facing.

## CRITICAL: No internal-development artefacts in public docs

Public documentation must read as a stable language reference, not
as an engineering changelog. The following classes of content are
**banned** from `docs/`:

### Forbidden tokens

| Pattern | Why banned | What to write instead |
|---------|-----------|------------------------|
| `FV-N`, `Pre-FV-N`, `post-FV-N`, `FV-9 → FV-18`, etc. | Internal feature-versioning identifiers — meaningless to readers; rot as the project evolves. | Describe the current state directly (e.g. "the IOU registry is empty"). When historical context is genuinely useful, frame it without internal labels: "An earlier release shipped open IOU axioms; they have all been closed." |
| Internal commit hashes (`76dc0ae1c`, `c7e4cbb7f`, `faa604a68`, …) | Implementation-specific; expire on rebase. | Cite the file path + structural property (`crates/verum_kernel/src/proof_tree.rs::KernelRule`). |
| Internal task numbers (`#56`, `#88`, `#125`, …) | Tracker-specific; meaningless outside the team. | Describe the change content, not its ticket. |
| Source LOC counts (`~2.4K`, `633-LOC`, `5 000 lines of Rust`, …) | Drift on every commit; useless to language users. | Describe roles and audit budgets ("single-reviewer / single-session audit budget", "one Rust crate"). |
| Specific test counts (`1 341 lib tests`, `1 818 full suite`) | Drift on every commit. | "Extensive lib-test suite", "regression-pinned via `cargo test -p verum_kernel --lib`". |

### Why this discipline matters

The website ships as the public-facing surface. Readers — language
users, evaluators, future contributors — do **not** care about how
the team tracks work internally. They care about: how does the
language work, what is its current state, what are the
trade-offs. Internal artefacts dilute that signal and rot fast.

### Performance characteristics — keep

Performance budgets that describe **expected user-facing
behaviour** (e.g. "compiles at >50K LOC/s", "CBGR check < 15ns",
"50 KLOC project takes ~N seconds") are user-facing
characteristics, not internal source-size metrics. These stay.

## Anchor and link discipline

When linking between docs, anchors must match Docusaurus's
github-slugger semantics:

* Lowercase the heading.
* Strip non-`[\w\s\-]` characters (em-dash `—` removed; existing
  hyphens preserved).
* Replace **each whitespace character with a single hyphen** (so
  two spaces from a stripped em-dash → two hyphens).

Example: `## The IOU axiom registry — kernel-rule trust extension`
slugifies to `the-iou-axiom-registry--kernel-rule-trust-extension`
(double hyphen from the stripped em-dash + space).

The audit at `scripts/audit-doc-links.py` (or hand-rolled) walks
every `/docs/path#anchor` and `[link](./relative.md#anchor)`
reference and checks that the target exists. Run it before
shipping any doc-touching commit.

## See also

* `sidebars.ts` — `/docs/category/...` slugs are valid
  generated-index pages even though no `.md` file backs them.
* `docusaurus.config.ts` — site-level config.

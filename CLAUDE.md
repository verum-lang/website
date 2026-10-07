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

### Enforced

`scripts/check-no-internal-artefacts.py`, run by CI on every pull
request. **Baseline is zero**, not today's count: a ratchet at N makes
"no new artefacts" the standard when the standard is "none".

Two things it deliberately does NOT flag, each because flagging them
would make the gate red on a correct page:

* **A Rust source path.** The table above PRESCRIBES it as the
  replacement for a commit hash. The measure is whether a reader can
  get there — `arch.rs:1126` names a line that has already moved, a
  GitHub blob URL to the same file opens when clicked, and neither is
  the class this bans.
* **A performance characteristic.** "a 50 K-LOC project", "≥ 50 KLOC/s"
  and "all 6 tests passed" (a tutorial's own expected output) are kept
  by the section below. Only the unambiguous source-size spelling —
  "5 000 lines of Rust" — is matched.

A hex-looking token is only a hash if `git cat-file` resolves it in the
verum repository: `deadbeef` is a placeholder the reader is meant to
see, and `4028235e38` is the tail of `3.4028235e38` on a page about
numeric limits. Where that repository is not checked out, the gate
reports such tokens as unverified rather than failing on a question it
cannot answer.

Every class carries a must-match and a must-NOT-match example, checked
before any count is read (`--self-test`). Four of the five classes
report zero, and without that check "found nothing" and "the pattern
broke" would be the same output.

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

## Current reference documentation

Describe current language behavior, supported APIs and known limitations.
Do not add dates to headings, status badges, limitation labels or freshness
notes such as "as of", "measured" or "last updated". Do not publish a
roadmap or changelog under `docs/`; maintain history in Git and engineering
reports. Remove obsolete behavior when updating a page instead of adding
an editorial correction log.

A limitation needs its affected API/backend, observable behavior and a
reproduction or structural source reference when available. Verify a claim
before changing it; removing a date does not establish a new test result.
Preserve uncertainty and the scope of evidence. Keep artifact identities and
measurement dates in linked engineering reports rather than public status
labels. Dates that are API example data, standards identifiers or citation
details are valid content.

`scripts/check-doc-freshness-labels.py` enforces the date-label rule and runs
its own positive and negative controls. Run it with the link audit and the
strict production build before committing documentation changes.

## Markdown presentation contract

Documentation uses CommonMark, not MDX. Page conformance panels have one
source of truth: `status`, `status_detail` and `status_defects` frontmatter,
rendered by `plugins/remark-conformance.mjs`. Use plain Markdown text for
inline lifecycle, tier and test-coverage labels. Do not embed JavaScript
imports or JSX in page bodies. Literal code examples remain valid.

`npm run build` includes controls for metadata validation and checks the
rendered HTML for leaked component source and missing status panels. See
README.md for the authoring contract. Do not bypass this check by hiding
unrendered content or changing all documentation to MDX.

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

The audit at `scripts/check-doc-links.py` (or hand-rolled) walks
every `/docs/path#anchor` and `[link](./relative.md#anchor)`
reference and checks that the target exists. Run it before
shipping any doc-touching commit.

## See also

* `sidebars.ts` — `/docs/category/...` slugs are valid
  generated-index pages even though no `.md` file backs them.
* `docusaurus.config.ts` — site-level config.

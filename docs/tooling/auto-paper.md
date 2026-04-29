---
sidebar_position: 15
title: Auto-paper generator
---

# `verum doc-render` — Auto-paper documentation generator

A Verum corpus IS a formal proof AND a paper draft.  Pre-this-tool
a project had to maintain `paper.tex` alongside the `.vr` corpus —
two sources of truth, manual sync risk across the formal proof + the
human prose.  **`verum doc-render` makes the corpus the single
source of truth**: it walks every public `@theorem` / `@lemma` /
`@corollary` / `@axiom` declaration, projects it into a typed
record, and emits Markdown / LaTeX / HTML directly from your `.vr`
files.

## What you get

- **LaTeX** — paper draft compatible with arXiv / Zenodo
  templates.  Each declaration uses the canonical
  `theorem` / `lemma` / `corollary` / `axiom` environment with a
  cross-referenceable `\label`.  Axioms emit no `\begin{proof}`.
- **Markdown** — CommonMark-friendly web output with a top-of-page
  TOC, anchor IDs, numbered proof-step lists, and inline
  closure-hash callouts.
- **HTML** — semantic `<article class="verum-item verum-{kind}">`
  per declaration, with anchor IDs and a top-level navigation.
  Drop into a static-site generator.
- **DOT / JSON citation graph** — every theorem's transitive
  citation closure as a Graphviz digraph (or edge-list JSON).
- **Broken-cross-reference audit** — CI gate that fails non-zero on
  any dangling `apply X;` / `\ref{X}` target.

## Subcommand reference

```bash
verum doc-render render     [--format md|markdown|tex|latex|html] \
                            [--out <PATH>] [--public]
verum doc-render graph      [--format dot|json] [--public]
verum doc-render check-refs [--format plain|json] [--public]
```

Format aliases:

- `md` → `markdown`
- `tex` → `latex`

`--public` restricts the corpus to public-visibility declarations
only (the default emits everything reachable, including
project-internal lemmas).

`--out <PATH>` writes the rendered corpus to disk; without it the
output goes to stdout.

### `render`

Renders the entire corpus as a single document.  Markdown output
example:

````markdown
# Verum corpus — formal statements

Auto-generated from 142 declaration(s).  Each statement carries a
kernel-cert hash; readers can re-check via `verum cache-closure decide`.

## Table of contents

- [theorem — yoneda_full_faithful](#theorem-yoneda-full-faithful)
- [lemma — succ_pos_lemma](#lemma-succ-pos-lemma)
- ...

---

## <a id="theorem-yoneda-full-faithful"></a>Theorem `yoneda_full_faithful`

The Yoneda embedding `Y : C -> [C^op, Set]` is fully faithful.

**Signature:**

```verum
theorem yoneda_full_faithful(...)
```

**Statement (ensures):**

- `forall (X Y: C). hom(X, Y) ≃ Nat(Y(X), Y(Y))`

**Proof:**

1. `intro`
2. `apply yoneda_lemma`
3. `auto`

**Cites:** [`yoneda_lemma`](#ref:yoneda_lemma)

**Framework citations:**

- *lurie_htt*: HTT 6.2.2.7

**Closure hash:** `7b2a90c4…` (re-check with `verum cache-closure decide yoneda_full_faithful …`)

*Source:* `src/categories/yoneda.vr:42`
````

LaTeX output for the same item:

```latex
\begin{theorem}[yoneda\_full\_faithful]
\label{theorem:yoneda_full_faithful}
The Yoneda embedding ...

\(\text{forall (X Y: C). hom(X, Y) ≃ Nat(Y(X), Y(Y))}\)
\end{theorem}
\begin{proof}
\begin{enumerate}
\item \texttt{intro}
\item \texttt{apply yoneda\_lemma}
\item \texttt{auto}
\end{enumerate}
\end{proof}
\textbf{Framework citations:} \emph{lurie\_htt}: HTT 6.2.2.7
\textit{Closure hash:} \texttt{7b2a90c4...}
```

HTML output ships the corresponding `<article>` blocks with
anchor IDs matching the LaTeX `\label`s and Markdown anchors —
**stable cross-references work across all three formats**.

### `graph`

The citation graph: `citing → cited`.  Nodes are coloured by item
kind:

- theorem → light blue
- lemma → light green
- corollary → light yellow
- axiom → light grey

```bash
$ verum doc-render graph --format dot
digraph corpus_citations {
  rankdir=LR;
  node [shape=box, style=filled];
  "yoneda_full_faithful" [fillcolor=lightblue, label="yoneda_full_faithful (theorem)"];
  "yoneda_lemma" [fillcolor=lightgreen, label="yoneda_lemma (lemma)"];
  "yoneda_full_faithful" -> "yoneda_lemma";
}
```

Pipe to Graphviz to produce SVG / PNG:

```bash
verum doc-render graph --format dot | dot -Tsvg -ocitations.svg
```

JSON output is an edge list — useful for custom visualisation
tooling:

```json
{
  "schema_version": 1,
  "item_count": 142,
  "edges": [
    { "from": "yoneda_full_faithful", "to": "yoneda_lemma" },
    { "from": "yoneda_full_faithful", "to": "presheaf_completeness_lemma" }
  ]
}
```

### `check-refs`

Audits broken citations: every `apply X;` in a proof body whose
`X` doesn't resolve to another corpus item is a dangling
reference.  CI-friendly: non-zero exit on any broken citation.

```bash
$ verum doc-render check-refs
✗ Found 2 broken cross-reference(s):
  yoneda_full_faithful → presheaf_completeness_lemma
  msfs_theorem_10_4 → ac_oc_lemma
```

JSON output:

```json
{
  "schema_version": 1,
  "item_count": 142,
  "broken_count": 2,
  "broken": [
    { "citing_item": "yoneda_full_faithful",
      "broken_target": "presheaf_completeness_lemma" },
    { "citing_item": "msfs_theorem_10_4",
      "broken_target": "ac_oc_lemma" }
  ]
}
```

## Reproducibility envelope

Every rendered statement carries an optional **closure hash** —
the same hash the
[`cache-closure`](/docs/tooling/incremental-cache) cache uses.
Readers of the rendered paper can run:

```bash
verum cache-closure decide yoneda_full_faithful \
    --signature "<copied from paper>" \
    --body "<copied from paper>" \
    --cite framework_lurie_htt
```

…to confirm the statement they're reading is the statement that
was kernel-checked.  This eliminates the LaTeX / Verum
dual-source risk: there is no possible drift between the
rendered claim and the kernel artefact, because both come from
the same fingerprint.

## Citation extraction

The renderer extracts citations from proof bodies via name-shape
matching:

- Identifiers ending in `_lemma`, `_thm`, `_theorem`, `_axiom`.
- Identifiers starting with `lemma_`, `thm_`.

False negatives are acceptable (the citation graph under-counts
rather than over-counts).  False positives surface as broken refs
in the validator (non-resolving names).  This means the convention
of *naming your lemmas with a recognisable suffix or prefix* is
worth following — your proofs auto-document themselves.

## Visibility filtering

`--public` is the most common production option: it restricts
output to declarations marked `public`.  Project-internal lemmas
remain in the corpus (your IDE still sees them) but don't appear
in the published paper.

```verum
public theorem yoneda_full_faithful(...)
    ensures /* ... */
    proof by /* ... */;

// Internal helper, not exported to the paper draft.
lemma yoneda_internal_step(...)
    ensures /* ... */
    proof by /* ... */;
```

## Typical CI workflow

```bash
# Pre-merge gate: broken citations fail the build.
verum doc-render check-refs

# On release: regenerate paper artefacts.
verum doc-render render --format latex --out paper/sections/auto.tex --public
verum doc-render render --format html  --out site/theorems.html  --public
verum doc-render graph  --format dot   --public | dot -Tsvg -opaper/figs/citations.svg
```

The release workflow can be wired into the same job that runs
`verum verify --closure-cache` so every CI run produces a
re-checked paper draft.

## Cross-references

- **[Tactic catalogue](/docs/tooling/tactic-catalogue)** — every
  combinator carries a stable `doc_anchor`; the renderer uses
  these for cross-format-stable hyperlinks when proof steps are
  embedded.
- **[Incremental cache](/docs/tooling/incremental-cache)** — the
  closure-hash that powers the reproducibility envelope.
- **[Verification → proof corpora](/docs/verification/proof-corpora)**
  — corpus-level conventions (file layout, framework attribution,
  proof-honesty).
- **[Verification → proof export](/docs/verification/proof-export)**
  — orthogonal export pipeline (statement-only certificates for
  Coq / Lean / Dedukti / Metamath).

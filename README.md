# Verum Documentation Site

Official documentation for the [Verum programming language](https://github.com/verum-lang/verum),
built with [Docusaurus 3](https://docusaurus.io/).

## Development

```bash
nvm install        # Node version from .nvmrc
nvm use
npm ci             # install the committed dependency lockfile
npm start           # dev server at http://localhost:3000
npm run build       # production build to build/
npm run serve       # serve the production build
npm run typecheck   # TypeScript check
```

The primary build uses **Node.js 22.x**, selected by `.nvmrc` locally and
in CI. **Node.js 20.x** is also covered by a separate compatibility job. Node 24 has a known
`webpack.ProgressPlugin` incompatibility with Docusaurus 3.10. Use
`nvm use` in this directory or select Node 22 with your version manager
before building. The package engine range records these supported versions.

## Before committing

```bash
npm run typecheck
python3 scripts/check-no-internal-artefacts.py --verum-repo ../verum
python3 scripts/check-doc-freshness-labels.py
python3 scripts/check-doc-links.py
npm run build
```

Use the path to your language checkout for `--verum-repo`. The link script
is a quick check; the strict production build is the authority for routes,
anchors and Markdown compilation. After navigation or layout changes,
check the production preview at both mobile and desktop widths, including
both themes and the documentation sidebar.

## Conformance panels in Markdown

Docs use CommonMark (`markdown.format: 'md'`). Keep JavaScript imports and
JSX out of page bodies. The supported remark plugin reads one canonical
set of frontmatter fields and renders semantic HTML after the page title:

```yaml
status: partial
status_detail: Interpreter construction has coverage; native cleanup remains incomplete.
status_defects:
  - area: guard lifetime
    summary: Scope-exit cleanup requires separate native validation.
```

`status` accepts the inventory labels `complete`, `stable`, `partial`,
`regression-only`, `undocumented` and `unverified`. The renderer explicitly
displays `undocumented` as `unaudited`; no other coverage level is inferred
or promoted. Omit all three fields when no panel is appropriate.
`status_detail` is optional plain text. `status_defects` is an optional
array of objects containing only non-empty `area` and `summary` strings.
Details without a status, unknown statuses and malformed limitations fail
the build. Text is inserted as AST text nodes; metadata is never evaluated
as JavaScript, MDX or raw HTML.

Use ordinary Markdown table text for per-module lifecycle, execution-tier
and test-coverage labels. Keep their legend and audit links alongside the
values. Do not add a second source of status metadata or embed component
props that disagree with frontmatter.

`npm run build` runs conformance controls, compiles the site, then audits
every rendered documentation page with `scripts/check-rendered-docs.py`.
The Markdown plugin rejects component source in parsed prose before HTML
normalization. The HTML audit rejects leaked imports/JSX and verifies
that each status-bearing page renders exactly one corresponding panel.
Fenced and inline code examples are deliberately excluded from the leak
check. The audit uses Docusaurus's parsed frontmatter and resolved permalinks
to verify the panel label, title ordering and every detail/limitation string
in the generated HTML, including pages with custom slugs. The local renderer
is an explicit webpack build dependency, so changing its source invalidates
the persistent Markdown compilation cache.

## Structure

```
docs/
├── intro.md                # landing page
├── getting-started/        # installation, tour, hello world
├── philosophy/             # design principles
├── language/               # language reference
├── verification/           # SMT, proofs, HoTT
├── stdlib/                 # standard library
├── architecture/           # compiler internals
├── tooling/                # CLI, LSP, playbook
└── reference/              # grammar, keywords, attribute registry
src/
├── pages/index.tsx         # homepage
├── css/custom.css          # theme
blog/                       # release notes & essays
static/img/                 # logo, favicon, social card
```

## License

Documentation: CC-BY-4.0. Language: see
[verum-lang/verum](https://github.com/verum-lang/verum).

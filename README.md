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

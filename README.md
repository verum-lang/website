# Verum Documentation Site

Official documentation for the [Verum programming language](https://github.com/verum-lang/verum),
built with [Docusaurus 3](https://docusaurus.io/).

## Development

```bash
npm install
npm start           # dev server at http://localhost:3000
npm run build       # production build to build/
npm run serve       # serve the production build
npm run typecheck   # TypeScript check
```

Requires **Node.js 20.x or 22.x LTS**. Node 24 has a known
`webpack.ProgressPlugin` incompatibility with Docusaurus 3.10. Use
`nvm use 22` or `volta install node@22` before building.

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

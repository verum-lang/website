---
sidebar_position: 1
title: Contributing
description: How to propose changes, open issues, and submit pull requests.
---

# Contributing to Verum

Thanks for wanting to help. The Verum project has grown through
contributions of all sizes — documentation fixes, bug reports,
implementations of substantial features, research prototypes.

## Where to start

### Using Verum and found a bug

[Open an issue](https://github.com/verum-lang/verum/issues/new) with:
- `verum --version` output.
- Minimal reproducer (under 20 lines if possible).
- What you expected vs what happened.
- Build command, OS, CPU architecture.

Label templates at the repo root automate the rest.

### Want to suggest a feature

Small additions: open an issue describing the use case.

Anything touching the language surface, the type system, or the
stdlib ABI: **write an RFC** first. Template:
[`docs/rfcs/TEMPLATE.md`](https://github.com/verum-lang/verum/blob/main/docs/rfcs/TEMPLATE.md).

RFCs undergo a **two-week comment period** before merge. Big ones
(type-system changes, verification model) can take longer.

### Want to implement something

1. **Check the [roadmap](/docs/roadmap)** for current priorities.
2. **Claim it in an issue** before starting — prevents duplicate work.
3. **Draft PR early** — mark "WIP" in the title, push initial work,
   get feedback before polishing.
4. **Tests + documentation** mandatory for anything non-trivial.

## Development setup

```bash
git clone https://github.com/verum-lang/verum
cd verum
./scripts/bootstrap.sh           # installs Rust 1.82+, LLVM 21, Z3, CVC5
cargo build --release -p verum_cli
./target/release/verum --version
```

Bootstrap takes 20–40 minutes on first run (LLVM compilation
dominates).

### Working on the compiler

```bash
cargo build -p verum_compiler
cargo test -p verum_compiler
cargo bench -p verum_compiler --bench smt_obligations
```

Crate map:
- `verum_lexer`, `verum_fast_parser`, `verum_ast`, `verum_types`,
  `verum_cbgr`, `verum_smt`, `verum_vbc`, `verum_codegen`,
  `verum_verification`, `verum_compiler`, `verum_cli`, `verum_lsp`,
  `verum_interactive`.

See [Architecture → Crate map](/docs/architecture/crate-map) for
what each does.

### Working on the stdlib

```bash
cd core
# .vr files; edit in place
cd ..
cargo test -p verum_compiler --test stdlib
```

### Working on the docs site

Docs live in [`verum-lang/website`](https://github.com/verum-lang/website)
(separate repo). The site is a Docusaurus project:

```bash
cd website
npm ci
npm run start
```

See [README](https://github.com/verum-lang/website/blob/main/README.md).

## Code standards

### Rust (compiler code)

- **Formatting**: `cargo fmt` before committing. CI enforces.
- **Lints**: `cargo clippy --all-targets --all-features -- -D warnings`
  must pass.
- **Tests**: unit tests in-file with `#[cfg(test)]`; integration tests
  in `tests/`. Every new `pub fn` needs a rustdoc comment with an
  example.
- **Panic policy**: library crates **must not** panic on user input
  (propagate `Result`). Binary crates (`verum_cli`) may panic on
  unrecoverable system errors with a clear message.
- **Unsafe**: paired with a `// SAFETY:` comment justifying the
  invariant.

### Verum (stdlib + tests)

- **`verum fmt`** before committing.
- **`verum lint --strict`** must pass.
- **Refinement types** wherever the invariant is load-bearing.
- **`@verify(static)`** is the default; graduate to `@verify(formal)` for
  safety-critical functions.

### Commit messages

```
type(scope): <subject>

<body>

<footer>
```

Types: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`,
`chore`. Example:

```
feat(smt): add CVC5 SyGuS integration

Route synthesis obligations (@verify(synthesize)) to CVC5's
SyGuS engine. Z3 doesn't support SyGuS; the router now checks
the obligation kind at classification time.

Closes #1234.
```

### Pull-request flow

1. Fork the repo.
2. Create a branch: `feat/short-description` or `fix/short-description`.
3. Push early, mark as draft.
4. Address review feedback in additional commits; let reviewers
   see the progression.
5. When approved, the maintainer squashes + merges.

Do **not** force-push to PR branches during review — it loses the
discussion context. Additive commits are preferred; squash happens
at merge time.

### Review checklist

Before asking for review:

- [ ] `cargo fmt` clean.
- [ ] `cargo clippy -- -D warnings` clean.
- [ ] `cargo test --workspace` passes.
- [ ] Commit messages follow the format.
- [ ] New behaviour has tests.
- [ ] Public API changes documented (rustdoc or website docs).
- [ ] CHANGELOG entry for user-visible changes.

## Licensing

Verum is dual-licensed under **Apache-2.0 OR MIT**. Your
contributions are accepted under the same terms. By submitting a PR
you certify compliance with the [Developer Certificate of Origin](https://developercertificate.org/).

## Communication

- **GitHub**: issues and PRs.
- **Discussions**: for open-ended questions that aren't bug reports.
- **Matrix**: `#verum:matrix.org`.
- **Weekly office hours**: Thursday 18:00 UTC on Matrix.
- **Security**: `security@verum-lang.org` — PGP key in `SECURITY.md`.

## Backwards compatibility

### Before 1.0

Verum is pre-1.0. **Breaking changes happen.** We try to minimise
them and announce them in release notes; semver cannot be relied on
for the pre-1.0 period.

### After 1.0

Stable semver. `1.x` will not break `1.x-1` API contracts without a
deprecation path of at least one minor release.

## Core-team decision process

- **Lazy consensus** for non-contentious changes. Leave the PR open
  for 48 hours; no objections → merge.
- **Majority vote** among core maintainers for language / stdlib
  ABI changes.
- **RFC approval** required for anything that changes the grammar,
  type system, verification model, or VBC opcode set.

## Expectations

- **Respond to review**: within a week if the change is under
  active review.
- **Shepherd issues you open**: close issues promptly once resolved;
  update status if you've moved on.
- **Welcome newcomers**: every Verum engineer was once a first-time
  contributor.

## Recognition

Contributions are recorded in the release notes and the
[AUTHORS](https://github.com/verum-lang/verum/blob/main/AUTHORS)
file. Notable contributions — especially sustained effort on stdlib
modules or new verification backends — are acknowledged in release
blog posts.

## Related

- **[Code of conduct](/docs/community/code-of-conduct)** — standards
  we hold each other to.
- **[Roadmap](/docs/roadmap)** — what's coming next.
- **[Architecture → crate map](/docs/architecture/crate-map)** —
  what each crate does.

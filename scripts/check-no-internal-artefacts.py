#!/usr/bin/env python3
"""Gate: public docs must not carry internal-development artefacts.

`CLAUDE.md` bans five classes from `docs/` — internal feature-version
identifiers, commit hashes, tracker numbers, source-LOC counts and
specific test counts. The rule has been written down since the site
existed and nothing enforced it; a census on 2026-09-04 found 243
occurrences across 30 files, the worst page giving 373 of its 1407
lines to a chronological defect log.

BASELINE IS ZERO, DELIBERATELY. A ratchet at today's count legitimises
today's count: it makes "no new artefacts" the standard, when the
standard is "none". The pages were cleaned first and the gate landed
after, in that order, so zero is a fact rather than an aspiration.

--------------------------------------------------------------------
WHAT THIS GATE DOES **NOT** FLAG, and why each exclusion exists
--------------------------------------------------------------------

A gate that is red on a correct page gets an exception added, and the
exception is what weakens it. Three exclusions, each paid for:

1. A RUST SOURCE PATH IS NOT BANNED — it is the PRESCRIBED replacement
   for a commit hash. `CLAUDE.md`'s own table says: "Cite the file path
   + structural property (`crates/verum_kernel/src/proof_tree.rs::
   KernelRule`)". A first version of the census keyed on `crates/` and
   reported 69 violations that were the rule being FOLLOWED.

   The measure is not whether `crates/` appears but whether the reader
   can get there. `arch.rs:1126` names a line that has already moved;
   a GitHub blob URL to the same file opens when clicked. Neither is
   matched here, because a path is not the class this gate is about.

2. A HEX-LOOKING TOKEN IS NOT NECESSARILY A HASH — ask the repository.
   A `[0-9a-f]{7,40}` sweep over one half of the docs reported 72
   candidates; `git cat-file -e` resolved 21 and refused 20. Among the
   refused: `deadbeef` and `abc1234`, which are placeholders a reader
   is MEANT to see, and `4028235e38` — the tail of `3.4028235e38`, the
   maximum Float, on a page about numeric limits.

   So a candidate is a violation only if the verum repository can
   resolve it as an object. Without that repository the gate reports
   candidates as UNVERIFIED and does not fail on them, because failing
   on an unanswerable question is how a gate teaches people to ignore
   it.

3. `ed25519` IS SEVEN CHARACTERS OF `[0-9a-f]`. So are `ed448`,
   `x25519` and `c25519`. They are algorithm names, they appear in the
   cryptography pages, and they are indistinguishable from an
   abbreviated hash by shape alone. The `git cat-file` step happens to
   reject them too, but they are named here so the reason survives
   without the repository.

--------------------------------------------------------------------

USAGE
    check-no-internal-artefacts.py [--verum-repo DIR] [--report]

    --report   list every occurrence and exit 0 (for a cleanup pass)
    default    exit 1 if any occurrence is confirmed
"""

import re
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path

DOCS = Path(__file__).resolve().parent.parent / "docs"
DEFAULT_VERUM = Path(__file__).resolve().parent.parent.parent / "verum"

# Hex tokens that are names, not hashes. See exclusion 3.
HEX_NAMES = {"ed25519", "ed448", "x25519", "c25519", "deadbeef", "abc1234"}

CLASSES = {
    # A tracker number. `#N` bare is EXCLUDED: it is a markdown anchor
    # (`[§5](#5-bug-class…)`) and an assembly immediate (`mov w0, #0`)
    # at least as often as it is a ticket, and both are correct.
    "task number": re.compile(
        r"[Tt]asks?\s*#\d+|\bT0\d{3}\b|\(#\d{1,3}\)|#\d+\s*[-+]\s*#\d+"
    ),
    "FV identifier": re.compile(r"\b(?:Pre-|post-)?FV-\d+\b"),
    "test count": re.compile(
        r"\b\d[\d\s,]*\s+(?:lib tests|full suite)|\b\d+\s*/\s*\d+\s+(?:green|passing)"
    ),
    # NARROWER THAN THE RULE'S WORDING, AND DELIBERATELY SO.
    #
    # `CLAUDE.md` bans "source LOC counts (`~2.4K`, `633-LOC`, `5 000
    # lines of Rust`)" and, four paragraphs later, KEEPS performance
    # budgets that describe user-facing behaviour, giving "compiles at
    # >50K LOC/s" and "50 KLOC project takes ~N seconds" as examples.
    #
    # A pattern matching `LOC` at all reports twenty occurrences and
    # every one of them is the second kind:
    #
    #     "Typical responsiveness on a 50 K-LOC project"
    #     "One ~1 KLOC file, every rule on | < 5 ms"
    #     "| `kernel_loc` | 5,000 LOC | 200,000 LOC | …"
    #
    # `~2.4K` and `633-LOC` cannot be told from those by shape — only
    # by what the number is COUNTING, which is a question about the
    # sentence and not about the token. So this class matches only the
    # unambiguous spelling. A gate that fires on a correct page gets an
    # exception added, and the exception is what weakens it.
    "source LOC count": re.compile(r"\d[\d\s,]*\s*(?:K|k)?\s*lines of (?:Rust|code)"),
}

HASH_CANDIDATE = re.compile(r"`([0-9a-f]{7,40})`")


def resolves_as_object(token: str, repo: Path) -> bool:
    """Does the verum repository know this token as an object?"""
    try:
        r = subprocess.run(
            ["git", "cat-file", "-e", f"{token}^{{commit}}"],
            cwd=repo, capture_output=True, timeout=20,
        )
        return r.returncode == 0
    except (OSError, subprocess.SubprocessError):
        return False


# EVERY CLASS CARRIES BOTH POLES, and the gate refuses to run if any of
# them is wrong.
#
# The failure this prevents: a baseline of ZERO makes "the pattern found
# nothing" and "the pattern stopped working" the same output. Four of
# the five classes currently report zero, so four fifths of this gate
# would be indistinguishable from a typo.
#
# The NEGATIVE poles are the ones that cost measurement. Each is a real
# string from these docs that a coarser pattern flagged and the rule
# explicitly permits — recorded so the reason survives the next person
# who decides the pattern is "too narrow".
SELFTEST = [
    # (class, must-match, must-NOT-match, why the negative is legal)
    ("task number", "closed in task #47", "[§5](#5-bug-class-this-gate)",
     "a Docusaurus heading anchor; `#N` is an anchor far more often than a ticket"),
    ("task number", "pinned as T0148", "mov w0, #0; ret",
     "an assembly immediate in a code block"),
    ("FV identifier", "landed in FV-12", "IPv4-2 addressing",
     "not the FV- prefix"),
    ("test count", "1 341 lib tests pass", "all 6 tests passed",
     "a tutorial's own expected OUTPUT — the reader sees this when they "
     "run what the page told them to build; removing it breaks the page"),
    ("test count", "60/60 green under --interp", "1.5/2 of the way",
     "not a pass count"),
    ("source LOC count", "5 000 lines of Rust", "a 50 K-LOC project",
     "a performance characteristic, which CLAUDE.md keeps under its own "
     "heading: budgets describing user-facing behaviour stay"),
    ("source LOC count", "roughly 2.4K lines of code", "target >= 50 KLOC/s",
     "a rate, not a source size"),
]


def selftest() -> int:
    bad = 0
    for cls, positive, negative, why in SELFTEST:
        rx = CLASSES[cls]
        if not rx.search(positive):
            print(f"  SELFTEST FAIL [{cls}] must match: {positive!r}")
            bad += 1
        if rx.search(negative):
            print(f"  SELFTEST FAIL [{cls}] must NOT match: {negative!r}")
            print(f"                 ({why})")
            bad += 1
    return bad


def main(argv: list[str]) -> int:
    report = "--report" in argv
    if "--self-test" in argv:
        n = selftest()
        print("  self-test: OK" if not n else f"  self-test: {n} failure(s)")
        return 1 if n else 0
    if selftest():
        print("PROBE-FAILED: a class does not match its own example, or matches")
        print("its counter-example. Every count below would be meaningless.")
        return 2
    repo = DEFAULT_VERUM
    if "--verum-repo" in argv:
        repo = Path(argv[argv.index("--verum-repo") + 1])
    have_repo = (repo / ".git").exists()

    # CONTROL FIRST. If the repository is present, a known-good hash must
    # resolve and a known-bad one must not; otherwise every hash silently
    # reads as "not a hash" and the largest class goes quiet.
    if have_repo:
        head = subprocess.run(
            ["git", "rev-parse", "--short=10", "HEAD"],
            cwd=repo, capture_output=True, text=True,
        ).stdout.strip()
        if not head or not resolves_as_object(head, repo):
            print(f"PROBE-FAILED: HEAD ({head!r}) does not resolve in {repo}.")
            print("The hash check would report every hash as clean; refusing to run.")
            return 2
        if resolves_as_object("ed25519", repo):
            print("PROBE-FAILED: `ed25519` resolved as an object; the probe is not selective.")
            return 2

    found: Counter[str] = Counter()
    rows: list[tuple[str, int, str, str]] = []
    unverified = 0

    for f in sorted(DOCS.rglob("*.md")):
        rel = str(f.relative_to(DOCS))
        for i, line in enumerate(f.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            for name, rx in CLASSES.items():
                for m in rx.finditer(line):
                    found[name] += 1
                    rows.append((rel, i, name, m.group(0)))
            for m in HASH_CANDIDATE.finditer(line):
                tok = m.group(1)
                if tok in HEX_NAMES:
                    continue
                if not have_repo:
                    unverified += 1
                    continue
                if resolves_as_object(tok, repo):
                    found["commit hash"] += 1
                    rows.append((rel, i, "commit hash", tok))

    if report:
        for rel, i, name, tok in rows:
            print(f"  {rel}:{i}  {name}: {tok}")
        print()

    total = sum(found.values())
    for name, n in found.most_common():
        print(f"  {n:>5}  {name}")
    if not total:
        print("  none")
    if unverified:
        print(f"  {unverified:>5}  hex candidates UNVERIFIED (no verum repo at {repo})")
    print()

    if report:
        return 0
    if total:
        print(f"check-no-internal-artefacts: {total} internal artefact(s) in public docs.")
        print("Baseline is ZERO. See CLAUDE.md for what to write instead.")
        return 1
    # NAME WHAT WAS CHECKED. "OK (baseline 0)" is true and reads as a
    # statement about the docs rather than about this gate's five
    # classes. A peer measured 235 references of the form
    # `verum_x::y::Z` — no file path, so nothing here sees them — while
    # this printed a clean zero. The number was right; what a reader
    # took from it was not, and the repair belongs in the OUTPUT rather
    # than in the pattern, because the form is not one the rule bans.
    print("check-no-internal-artefacts: OK (baseline 0)")
    print("  checked: commit hashes (resolved against the verum repo),")
    print("           tracker numbers, FV identifiers, test counts, LOC counts.")
    print("  NOT checked: anything the five banned classes in CLAUDE.md do")
    print("           not name — a bare `verum_crate::module::Item`, for one,")
    print("           which is neither a hash nor the path form that replaces it.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

#!/usr/bin/env python3
"""Gate: a documented limitation must carry the date it was measured.

WHY THIS EXISTS, and it is not a hypothetical. On 2026-09-04 sixteen
`stdlib/` pages were rewritten to strip dated internal status tables.
The tables were stale; their LIMITATIONS were restated as clean
present-tense prose without being checked. Ten of them were false:

    async programs do not compile ahead of time   builds, runs, prints
    BTreeMap insert-then-get faults — "avoid"      returns 100
    `?` does not cross Maybe and Result            it does
    mount X.{CONST} does not register the name     PAGE_SIZE=4096
    …and six more

The old text carried dates and ticket numbers, so a reader could see it
was archaeology and discount it. The rewrite turned the same assertions
into undated prose in the register a reader trusts. **It made stale
claims harder to doubt while claiming to remove them.**

WHAT THIS CAN AND CANNOT CHECK. Nothing can verify prose. What it can
enforce is the convention that makes prose falsifiable: a limitation
states WHEN it was measured. A reader can then weigh it, and a
maintainer can re-measure the oldest ones first.

    **Known limitation:** …                       REFUSED
    **Known limitation, measured 2026-09-04:** …  accepted

The date is not decoration. It is the single field whose absence let
ten wrong sentences read as current.

A REPRODUCTION IS STRONGLY WANTED AND NOT REQUIRED. Some limitations
are about a build mode or a platform and have no two-line repro. The
gate reports which dated limitations lack a nearby ```verum block as a
COUNT, not a failure — visible pressure without a rule that would be
routed around.

USAGE
    check-limitations-are-dated.py [--report]
"""

import re
import sys
from collections import Counter
from pathlib import Path

DOCS = Path(__file__).resolve().parent.parent / "docs"

# `**Known limitation:**` / `**Known limitations:**`, optionally with a
# `, measured YYYY-MM-DD` before the closing `**`.
LIMITATION = re.compile(r"\*\*Known limitations?(?P<tail>[^*]*)\*\*")
DATED = re.compile(r"measured\s+\d{4}-\d{2}-\d{2}")

# Both poles, checked before any count is read. A gate whose pattern has
# quietly stopped matching reports the same clean zero as a clean tree,
# and this one is expected to sit at zero most of the time.
SELFTEST = [
    ("**Known limitation:** the thing", False, "undated — must be caught"),
    ("**Known limitations:** two things", False, "plural, undated"),
    ("**Known limitation, measured 2026-09-04:** the thing", True,
     "dated in the accepted form"),
    ("**Known behaviour:** not a limitation", None, "not this pattern at all"),
]


def selftest() -> int:
    bad = 0
    for text, want_ok, why in SELFTEST:
        m = LIMITATION.search(text)
        if want_ok is None:
            if m:
                print(f"  SELFTEST FAIL: matched a non-limitation: {text!r} ({why})")
                bad += 1
            continue
        if not m:
            print(f"  SELFTEST FAIL: did not match a limitation: {text!r} ({why})")
            bad += 1
            continue
        dated = bool(DATED.search(m.group("tail")))
        if dated != want_ok:
            print(f"  SELFTEST FAIL: dated={dated}, wanted {want_ok}: {text!r} ({why})")
            bad += 1
    return bad


def main(argv: list[str]) -> int:
    if selftest():
        print("PROBE-FAILED: the pattern does not agree with its own examples.")
        print("Every count below would be meaningless.")
        return 2

    undated: list[tuple[str, int, str]] = []
    dated = 0
    no_repro = 0
    for f in sorted(DOCS.rglob("*.md")):
        lines = f.read_text(encoding="utf-8", errors="replace").splitlines()
        for i, line in enumerate(lines):
            for m in LIMITATION.finditer(line):
                if DATED.search(m.group("tail")):
                    dated += 1
                    window = "\n".join(lines[i : i + 25])
                    if "```verum" not in window:
                        no_repro += 1
                else:
                    undated.append((str(f.relative_to(DOCS)), i + 1, line.strip()[:90]))

    if "--report" in argv:
        for rel, ln, text in undated:
            print(f"  {rel}:{ln}  {text}")
        print()

    print(f"  dated limitations   : {dated}")
    print(f"    of which with no nearby reproduction: {no_repro}")
    print(f"  UNDATED limitations : {len(undated)}")
    print()
    if undated:
        print("check-limitations-are-dated: a limitation without a measurement date")
        print("reads as current fact. Write `**Known limitation, measured")
        print("YYYY-MM-DD:**`, or delete it — an unverified limitation steers")
        print("readers away from working APIs.")
        return 1
    print("check-limitations-are-dated: OK (baseline 0)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

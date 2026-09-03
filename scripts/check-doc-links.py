#!/usr/bin/env python3
"""Internal-link and anchor check for the docs tree.

NOT the authority. `npm run build` is — the same strict build CI runs,
which fails on broken links, broken anchors and unparseable frontmatter,
and takes about three minutes. Run it before pushing.

This script answers a narrower question quickly while editing: "did I
just break a link?" Its value is speed, not correctness, and its history
is a warning about the difference. Three versions, three wrong answers,
and the build was right every time:

    links, v1     8 "broken"  -> FOUR WERE WORKING; the fix broke CI
    anchors, v1  42 "broken"  -> 0 real
    anchors, v2   9 "broken"  -> 0 real

Each error was a simplification of Docusaurus's model:

  * ROUTES COME FROM `slug:`, not the file path. 52 pages declare one;
    `docs/cookbook/overview.md` carries `slug: /cookbook`, so
    `/docs/cookbook` is the route and `/docs/cookbook/overview` is not.
  * ANCHORS use github-slugger, which does NOT collapse dash runs.
    "Layer 6 — Automatic differentiation" is
    `layer-6--automatic-differentiation` — two dashes where the em dash
    was.
  * AN EXPLICIT `{#id}` REPLACES the derived slug entirely.

The controls below run on every invocation before any result is printed.
They are what turned each wrong answer into a fixed script instead of a
batch of wrong edits.
"""

import pathlib
import re
import sys

DOCS = pathlib.Path(__file__).resolve().parents[1] / "docs"


def anchor_of(line: str):
    m = re.match(r"^#{1,6}\s+(.*)", line)
    if not m:
        return None
    h = m.group(1)
    explicit = re.search(r"\{#([A-Za-z0-9_-]+)\}\s*$", h)
    if explicit:
        return explicit.group(1)
    s = re.sub(r"`([^`]*)`", r"\1", h).strip().lower()
    s = re.sub(r"[^\w\s-]", "", s)
    return re.sub(r"\s", "-", s).strip("-")


def route_of(path: pathlib.Path, text: str) -> str:
    slug = None
    if text.startswith("---\n"):
        m = re.search(r"^slug:\s*(\S+)", text.split("---\n", 2)[1], re.M)
        if m:
            slug = m.group(1).strip()
    if slug:
        return ("/docs" + slug if slug.startswith("/") else "/docs/" + slug).rstrip("/")
    return ("/docs/" + str(path.relative_to(DOCS)).removesuffix(".md")).rstrip("/")


def self_test() -> None:
    cases = [
        ("## Layer 6 — Automatic differentiation", "layer-6--automatic-differentiation"),
        ("## Streams {#stream}", "stream"),
        ("## Simple Heading", "simple-heading"),
    ]
    for line, want in cases:
        got = anchor_of(line)
        if got != want:
            print(f"SELF-TEST FAIL: {line!r} -> {got!r}, want {want!r}", file=sys.stderr)
            sys.exit(2)
    print(f"[ok] self-test: {len(cases)} anchor case(s) hold")


def main() -> int:
    self_test()
    pages = {}
    for p in DOCS.rglob("*.md"):
        t = p.read_text(errors="replace")
        route = route_of(p, t)
        anchors, fence = set(), False
        for line in t.split("\n"):
            if line.lstrip().startswith("```"):
                fence = not fence
                continue
            if fence:
                continue
            a = anchor_of(line)
            if a:
                anchors.add(a)
        pages[route] = anchors
        if route.endswith("/index"):
            pages[route[:-6].rstrip("/")] = anchors

    if "/docs/language/protocols" not in pages:
        print("CONTROL FAIL: lost a page that declares no slug", file=sys.stderr)
        return 2
    if "/docs/tutorials" not in pages or "/docs/tutorials/overview" in pages:
        print("CONTROL FAIL: `slug:` not honoured", file=sys.stderr)
        return 2

    LINK = re.compile(r"\]\((/docs/[^)\s]+)\)")
    bad_target, bad_anchor, total = [], [], 0
    for p in sorted(DOCS.rglob("*.md")):
        for m in LINK.finditer(p.read_text(errors="replace")):
            total += 1
            target, _, anchor = m.group(1).partition("#")
            target = target.rstrip("/")
            if target not in pages:
                bad_target.append((str(p), m.group(1)))
            elif anchor and anchor not in pages[target]:
                bad_anchor.append((str(p), m.group(1)))

    if bad_target or bad_anchor:
        print(f"FAIL: {len(bad_target)} unresolvable target(s), "
              f"{len(bad_anchor)} missing anchor(s), of {total} link(s)")
        for f, l in bad_target + bad_anchor:
            print(f"  {f}\n      {l}")
        print("  Confirm with `npm run build` — it is the authority.")
        return 1

    print(f"[ok] doc-links: {total} internal link(s) across {len(pages)} route(s), "
          f"0 unresolvable, 0 missing anchors")
    return 0


if __name__ == "__main__":
    sys.exit(main())

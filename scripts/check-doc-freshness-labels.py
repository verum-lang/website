#!/usr/bin/env python3
"""Reject editorial date labels in the current public reference.

Dates in API data, citations and artifact URLs remain valid. This check
only enforces presentation; claim accuracy requires source/reproduction
review, with measurements and artifact identities kept in engineering reports.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATE = r"(?:20\d{2}-\d{2}(?:-\d{2})?|YYYY-MM-DD)"
HEADING = re.compile(rf"^#{{1,6}}\s+.*\b{DATE}\b")
LABEL = re.compile(
    rf"\b(?:re-)?(?:measured|checked|verified|updated|corrected|counted|"
    rf"sweep|status|as of|fixed)\b[^\n`/\[\]<>]{{0,48}}\b{DATE}\b", re.I
)
SWEEP = re.compile(r"\bsweepDate\s*=")


def findings(text: str) -> list[tuple[int, str]]:
    found = []
    fence = None
    previous = ""
    for number, line in enumerate(text.splitlines(), 1):
        opening = re.match(r"^\s*(`{3,}|~{3,})", line)
        if opening:
            token = opening[1]
            if fence is None:
                fence = token
            elif token[0] == fence[0] and len(token) >= len(fence):
                fence = None
            previous = ""
            continue
        # JSX status props are disallowed even in documentation examples.
        if SWEEP.search(line):
            found.append((number, "status badge date"))
        if fence is not None:
            continue
        if HEADING.search(line) or LABEL.search(line):
            found.append((number, "editorial date label"))
        elif previous and LABEL.search(previous + " " + line.lstrip("> ")):
            found.append((number, "wrapped editorial date label"))
        previous = line if line.strip() and not LABEL.search(line) else ""
    return found


def self_test() -> None:
    cases = [
        ("## Status (2026-10-07)", True),
        ("**Known limitation, measured 2026-10-07:** affected API", True),
        ("Measured\n2026-10-07 against the interpreter.", True),
        (":::note Updated 2026-10-07", True),
        ('<StdlibStatus sweepDate="2026-10-07" />', True),
        ("**Known limitation:** affected API and reproduction below.", False),
        ('Use d#"2026-10-07" as the input date.', False),
        ('```verum\n// Example data\nlet date = "2026-10-07";\n```', False),
        ("[Artifact report](https://example.org/audit-2026-10-07.json)", False),
        ("Published specification, 2020-01-09.", False),
        ("## Synchronized output (Mode 2026)", False),
    ]
    for text, rejected in cases:
        assert bool(findings(text)) == rejected, text


def main() -> int:
    self_test()
    errors = []
    for path in sorted((ROOT / "docs").rglob("*")):
        if path.suffix not in {".md", ".mdx"}:
            continue
        errors.extend(
            f"{path.relative_to(ROOT)}:{line}: {reason}"
            for line, reason in findings(path.read_text(encoding="utf-8"))
        )
    for error in errors:
        print(error)
    print(f"doc-freshness-labels: {len(errors)} violation(s); self-tests passed")
    return int(bool(errors))


if __name__ == "__main__":
    raise SystemExit(main())

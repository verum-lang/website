#!/usr/bin/env python3
"""Reject leaked component source in rendered docs; code examples remain literal."""
from html.parser import HTMLParser
from pathlib import Path
import json
import re
from urllib.parse import urlsplit
import sys

ROOT = Path(__file__).resolve().parents[1]
IDENT = r"[$A-Za-z_][$\w]*"
NAMED = r"\{[\w$\s,]*\}"
NAMESPACE = rf"\*\s+as\s+{IDENT}"
BINDING = rf"(?:{NAMED}|{NAMESPACE}|{IDENT}(?:\s*,\s*(?:{NAMED}|{NAMESPACE}))?)"
IMPORT = re.compile(rf"\b(?:import\s+{BINDING}|export\s+(?:{NAMED}|\*))\s+from\s+['\"][^'\"]+['\"]")
SIDE_EFFECT_IMPORT = re.compile(r"\bimport\s+[\"'][^\"']+[\"']\s*;?")
JSX_TEXT = re.compile(r"</?[A-Z][A-Za-z0-9_.]*(?:\s+[A-Za-z_:][\w:.-]*\s*=|\s*/>)")
COMPONENTS = {'stdlibstatus', 'modulestatus', 'lifecyclebadge', 'tierbadge', 'testcovbadge'}
VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}

class RenderedDoc(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.prose = []
        self.issues = []
        self.statuses = []
        self.panel_text = []
        self.canonical_path = None
        self.panel_depth = None
        self.tag_number = 0
        self.title_positions = []
        self.status_positions = []

    def handle_starttag(self, tag, attrs):
        self.tag_number += 1
        if tag == 'link' and dict(attrs).get('rel') == 'canonical':
            self.canonical_path = urlsplit(dict(attrs).get('href', '')).path
        in_doc = 'article' in self.stack or tag == 'article'
        excluded = any(t in self.stack for t in ('pre', 'code', 'script', 'style'))
        if in_doc and not excluded:
            if tag == 'h1':
                self.title_positions.append(self.tag_number)
            if tag in COMPONENTS or JSX_TEXT.search(self.get_starttag_text()):
                self.issues.append(f'raw component element: {self.get_starttag_text()}')
            value = dict(attrs).get('data-conformance-status')
            if value is not None:
                self.statuses.append(value)
                self.status_positions.append(self.tag_number)
                self.panel_text.append([])
                self.panel_depth = len(self.stack)
        if tag not in VOID:
            self.stack.append(tag)
        if tag in ('pre', 'code', 'p', 'div'):
            self.prose.append('\n')

    def handle_endtag(self, tag):
        if self.panel_depth is not None and tag == "aside" and len(self.stack) == self.panel_depth + 1:
            self.panel_depth = None
        if tag in self.stack:
            self.stack = self.stack[:len(self.stack) - 1 - self.stack[::-1].index(tag)]
        if tag in ('pre', 'code', 'p', 'div'):
            self.prose.append('\n')

    def handle_data(self, data):
        if 'article' in self.stack and not any(t in self.stack for t in ('pre', 'code', 'script', 'style')):
            self.prose.append(data)
            if self.panel_depth is not None:
                self.panel_text[-1].append(data)

    def finish(self):
        text = ''.join(self.prose)
        self.issues.extend(f'raw component source: {m.group(0)}' for m in IMPORT.finditer(text))
        self.issues.extend(f'raw component import: {m.group(0)}' for m in SIDE_EFFECT_IMPORT.finditer(text))
        self.issues.extend(f'raw JSX text: {m.group(0)}' for m in JSX_TEXT.finditer(text))
        return self.issues


def inspect(html):
    doc = RenderedDoc()
    doc.feed(html)
    doc.finish()
    return doc


def self_test():
    assert inspect("<article><p>import StdlibStatus from '@site/Status';</p></article>").issues
    assert inspect("<article>import './widget.css';</article>").issues
    assert inspect('<article><StdlibStatus status="partial" /></article>').issues
    assert inspect('<article>&lt;OtherStatus status="partial" /&gt;</article>').issues
    assert inspect('<article><OtherStatus status="partial" /></article>').issues
    literal = "import StdlibStatus from '@site/Status'; &lt;StdlibStatus status=\"partial\" /&gt;"
    assert not inspect(f'<article><pre><code>{literal}</code></pre></article>').issues
    assert not inspect(f'<article><code>{literal}</code><p>List&lt;T&gt;</p></article>').issues
    assert not inspect('<script>import Widget from "widget";</script><article>API</article>').issues
    panel = inspect('<link rel="canonical" href="https://example.org/base/docs/custom"><article><aside data-conformance-status="partial">Safe &lt;T&gt;</aside><p>Outside</p></article>')
    assert panel.statuses == ['partial']
    assert panel.canonical_path == '/base/docs/custom'
    assert panel.panel_text == [['Safe <T>']]


def main():
    self_test()
    build = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'build'
    files = sorted((build / 'docs').rglob('*.html'))
    if not files:
        print(f'FAIL: no rendered docs found in {build / "docs"}')
        return 1
    issues = []
    rendered = {}
    for file in files:
        doc = inspect(file.read_text())
        rendered[file] = doc
        issues.extend(f'{file.relative_to(build)}: {issue}' for issue in doc.issues)
    # Docusaurus has already parsed YAML and resolved slugs/base URLs. Reuse
    # that metadata rather than inventing another source parser or route model.
    metadata_files = sorted((ROOT / '.docusaurus/docusaurus-plugin-content-docs').rglob('*.json'))
    if not metadata_files:
        issues.append('No compiled documentation metadata found; run the production build first.')
    by_route = {doc.canonical_path: doc for doc in rendered.values() if doc.canonical_path}
    status_pages = 0
    for metadata_file in metadata_files:
        metadata = json.loads(metadata_file.read_text())
        frontmatter = metadata.get('frontMatter', {})
        if 'status' not in frontmatter or metadata.get('draft'):
            continue
        status_pages += 1
        status = frontmatter['status']
        expected = 'unaudited' if status == 'undocumented' else status
        route = urlsplit(metadata['permalink']).path
        doc = by_route.get(route)
        if not doc or doc.statuses != [expected]:
            issues.append(f'{route}: expected exactly one conformance status {expected!r}, got {doc.statuses if doc else "missing page"}')
            continue
        if not doc.title_positions or doc.status_positions[0] <= doc.title_positions[0]:
            issues.append(f'{route}: the conformance panel must follow the document title')
        visible = ' '.join(' '.join(doc.panel_text[0]).split())
        expected_text = [frontmatter.get('status_detail', '')]
        for defect in frontmatter.get('status_defects', []):
            expected_text.extend((defect['area'], defect['summary']))
        for value in expected_text:
            if ' '.join(value.split()) not in visible:
                issues.append(f'{route}: conformance content missing from the panel: {value}')
    for issue in issues:
        print(issue)
    print(f'rendered-docs: {len(files)} pages, {status_pages} status pages, {len(issues)} violation(s); self-tests passed')
    return bool(issues)

if __name__ == '__main__':
    sys.exit(main())

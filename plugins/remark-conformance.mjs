/** Render conformance frontmatter as ordinary Markdown AST, never MDX/HTML source. */
export const statuses = Object.freeze({
  complete: ['complete', 'All public APIs, algebraic laws and cross-module integration have conformance coverage on the interpreter and native AOT paths.'],
  stable: ['stable', 'The covered interpreter suite passes. Native parity and broader coverage require separate evidence.'],
  partial: ['partial', 'A subset of the API has conformance coverage. Consult the documented backend and API limitations.'],
  'regression-only': ['regression-only', 'Upstream defects block public API paths. Regression controls record the failing shapes and any working subset.'],
  undocumented: ['unaudited', 'No conformance assessment is published for this surface; consult the module documentation and tests.'],
  unverified: ['unverified', 'No conformance result is asserted for this surface. This is neither a passing nor a failing result.'],
});

const text = (value) => ({type: 'text', value});
const paragraph = (value) => ({type: 'paragraph', children: [text(value)]});
const element = (name, children, properties = {}) => ({
  type: 'blockquote',
  data: {hName: name, hProperties: properties},
  children,
});

export function conformanceNode(frontMatter) {
  const {status, status_detail: detail, status_defects: defects} = frontMatter;
  if ('conformance' in frontMatter) {
    throw new Error('Use canonical status/status_detail/status_defects frontmatter, not a separate conformance value.');
  }
  if (status === undefined) {
    if (detail !== undefined || defects !== undefined) {
      throw new Error('Conformance details require an explicit status.');
    }
    return null;
  }
  if (typeof status !== 'string' || !Object.hasOwn(statuses, status)) {
    throw new Error(`Unsupported conformance status: ${String(status)}`);
  }
  if (detail !== undefined && (typeof detail !== 'string' || !detail.trim())) {
    throw new Error('status_detail must be a non-empty string.');
  }
  if (defects !== undefined && (!Array.isArray(defects) || defects.some((defect) =>
    !defect || typeof defect !== 'object' || Array.isArray(defect) ||
    Object.keys(defect).some((key) => key !== 'area' && key !== 'summary') ||
    typeof defect.area !== 'string' || !defect.area.trim() ||
    typeof defect.summary !== 'string' || !defect.summary.trim()))) {
    throw new Error('status_defects must contain only non-empty area/summary strings.');
  }
  const [label, description] = statuses[status];
  const children = [
    element('div', [
      element('strong', [text(label)], {className: ['conformance-status__badge']}),
      paragraph(description),
    ], {className: ['conformance-status__header']}),
  ];
  if (detail) {
    children.push(...detail.split(/\n\s*\n/).map(paragraph));
  }
  if (defects?.length) {
    const row = (cells) => ({type: 'tableRow', children: cells.map((value) => ({
      type: 'tableCell', children: [text(value)],
    }))});
    children.push(element('details', [
      element('summary', [text('Known limitations')]),
      {type: 'table', align: [null, null], children: [
        row(['Area', 'Limitation']),
        ...defects.map(({area, summary}) => row([area, summary])),
      ]},
    ], {open: true, className: ['conformance-status__limitations']}));
  }
  return element('aside', children, {
    className: ['conformance-status'],
    'data-conformance-status': label,
    'aria-label': `Conformance status: ${label}`,
  });
}

// Inspect only parsed prose/HTML nodes; code and inlineCode stay literal.
// This is a rejection guard, not an evaluator or an alternative MDX parser.
function rejectComponentSource(node, file) {
  if (node.type === 'code' || node.type === 'inlineCode') return;
  if (node.type === 'text' || node.type === 'html') {
    const value = node.value ?? '';
    const component = /<\/?(?:StdlibStatus|ModuleStatus|LifecycleBadge|TierBadge|TestCovBadge)\b|<\/?[A-Z][A-Za-z0-9_.]*(?:\s+[A-Za-z_:][\w:.-]*\s*=|\s*\/>)/;
    const identifier = '[$A-Za-z_][$\\w]*';
    const named = '\\{[\\w$\\s,]*\\}';
    const namespace = `\\*\\s+as\\s+${identifier}`;
    const binding = `(?:${named}|${namespace}|${identifier}(?:\\s*,\\s*(?:${named}|${namespace}))?)`;
    const esm = new RegExp(`(?:^|\\n)\\s*(?:import\\s+${binding}|export\\s+(?:${named}|\\*))\\s+from\\s+['"]`);
    const sideEffectImport = /(?:^|\n)\s*import\s+['"][^'"]+['"]\s*;?/;
    const exportDeclaration = /(?:^|\n)\s*export\s+(?:default\s+[^;\n]+[;{]|(?:const|let|var|function|class)\s+[$A-Za-z_][$\w]*)/;
    if (component.test(value) || esm.test(value) || sideEffectImport.test(value) || exportDeclaration.test(value)) {
      file.fail('Component source is not supported in CommonMark prose. Use conformance frontmatter or a literal code example.', node);
    }
  }
  for (const child of node.children ?? []) rejectComponentSource(child, file);
}

export default function remarkConformance() {
  return (tree, file) => {
    rejectComponentSource(tree, file);
    let node;
    try {
      node = conformanceNode(file.data.frontMatter ?? {});
    } catch (error) {
      file.fail(error.message);
    }
    if (!node) return;
    // Docusaurus wraps its content title in a header before custom plugins.
    const isTitle = (child) => child.type === 'heading' && child.depth === 1;
    const title = tree.children.findIndex((child) => isTitle(child) ||
      (child.type === 'mdxJsxFlowElement' && child.name === 'header' && child.children.some(isTitle)));
    tree.children.splice(title + 1, 0, node);
  };
}

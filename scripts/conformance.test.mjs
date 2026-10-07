import assert from 'node:assert/strict';
import test from 'node:test';
import remarkConformance, {conformanceNode, statuses} from '../plugins/remark-conformance.mjs';

function values(node) {
  return [node.value ?? '', ...(node.children ?? []).map(values)].join('');
}

test('statuses keep their inventory meaning; undocumented has the explicit unaudited display label', () => {
  for (const [status, [label]] of Object.entries(statuses)) {
    assert.equal(conformanceNode({status}).data.hProperties['data-conformance-status'], label);
  }
  assert.equal(conformanceNode({}), null);
  for (const status of ['bogus', 'unaudited', '', null, {}, 'toString']) {
    assert.throws(() => conformanceNode({status}), /Unsupported/);
  }
});

test('malformed, conflicting or orphaned metadata fails instead of silently hiding limitations', () => {
  for (const metadata of [
    {status_detail: 'A known limitation'}, {status_defects: []},
    {status: 'partial', status_detail: []}, {status: 'partial', status_detail: ''},
    {status: 'partial', status_defects: 'not an array'},
    {status: 'partial', status_defects: [{area: 'io'}]},
    {status: 'partial', status_defects: [{area: 'io', summary: 'fails', typo: true}]},
    {status: 'partial', conformance: {status: 'complete'}},
  ]) assert.throws(() => conformanceNode(metadata));
});

test('details are literal text, including angle brackets and JavaScript-looking data', () => {
  const detail = '<script>alert(1)</script> & List<T> {import Thing from "unsafe";}';
  const node = conformanceNode({status: 'partial', status_detail: detail, status_defects: [
    {area: 'Cursor<T>', summary: 'Err { cause: "<danger>" } stays visible'},
    {area: 'Cursor<T>', summary: 'Repeated areas preserve distinct limitations'},
  ]});
  assert.ok(values(node).includes(detail));
  assert.ok(values(node).includes('Repeated areas preserve distinct limitations'));
  function visit(n) {
    assert.notEqual(n.type, 'html');
    assert.ok(!n.type.startsWith('mdx'));
    for (const child of n.children ?? []) visit(child);
  }
  visit(node);
  assert.equal(node.children.at(-1).data.hName, 'details');
  assert.equal(node.children.at(-1).data.hProperties.open, true);
});

test('insert exactly after the document title and preserve code examples literally', () => {
  const code = {type: 'code', lang: 'verum', value: 'fn read<T>(x: List<T>) { print("<Tag />"); }'};
  const title = {type: 'heading', depth: 1, children: [{type: 'text', value: 'API'}]};
  const tree = {type: 'root', children: [title, code]};
  remarkConformance()(tree, {data: {frontMatter: {status: 'partial'}}, fail: assert.fail});
  assert.equal(tree.children[0], title);
  assert.equal(tree.children[1].data.hName, 'aside');
  assert.equal(tree.children[2], code);
  const header = {type: 'mdxJsxFlowElement', name: 'header', attributes: [], children: [title]};
  const wrapped = {type: 'root', children: [header, code]};
  remarkConformance()(wrapped, {data: {frontMatter: {status: 'partial'}}, fail: assert.fail});
  assert.equal(wrapped.children[0], header);
  assert.equal(wrapped.children[1].data.hName, 'aside');
  assert.equal(wrapped.children[2], code);
  const syntheticTitle = {type: 'root', children: [code]};
  remarkConformance()(syntheticTitle, {data: {frontMatter: {status: 'undocumented'}}, fail: assert.fail});
  assert.equal(syntheticTitle.children[0].data.hName, 'aside');
  assert.equal(syntheticTitle.children[1], code);
});


test('component source is rejected before CommonMark lowercases HTML names, while examples remain literal', () => {
  for (const node of [
    {type: 'html', value: '<OtherStatus status="partial" />'},
    {type: 'html', value: '<StdlibStatus>'},
    {type: 'text', value: "import StdlibStatus from '@site/src/components/StdlibStatus';"},
    {type: 'text', value: "import './widget.css';"},
    {type: 'text', value: 'export default Widget;'},
    {type: 'text', value: "import Widget, * as helpers from './widget';"},
  ]) {
    assert.throws(() => remarkConformance()({type: 'root', children: [node]}, {
      data: {frontMatter: {}}, fail: (message) => {throw new Error(message);},
    }), /Component source/);
  }
  const examples = [
    {type: 'code', lang: 'mdx', value: "import Status from './Status';\n<Status value={1} />"},
    {type: 'inlineCode', value: '<OtherStatus status="partial" />'},
    {type: 'text', value: 'List<T> retains generic syntax.'},
    {type: 'text', value: 'export status per target prover.'},
    {type: 'text', value: 'import dependencies must preserve declaration ownership.'},
  ];
  const tree = {type: 'root', children: structuredClone(examples)};
  remarkConformance()(tree, {data: {frontMatter: {}}, fail: assert.fail});
  assert.deepEqual(tree.children, examples);
});

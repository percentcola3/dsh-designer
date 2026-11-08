import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import generateModule from '@babel/generator';
import { parse } from '@babel/parser';
import { normalizeFrameworkSource, sourceElement, replaceSourceElement, compileFrameworkProject } from './framework-compiler.js';

const hash = (s) => createHash('sha256').update(s).digest('hex');
const generate = generateModule.default || generateModule;
const normalize = (framework, code, filename = framework === 'vue' ? 'src/App.vue' : 'src/App.tsx') => normalizeFrameworkSource({ framework, code, path: filename });
const throwsCode = (fn, code) => assert.throws(fn, (error) => error.code === code);

test('React AST distinguishes source nodes from strings, comments and repeated runtime instances', () => {
  const code = '// <fake/>\nconst text = "<pretend/>";\nexport default () => <main id="business">{[1,2].map(n => <Card key={n}><span>{n}</span></Card>)}</main>';
  const result = normalize('react', code);
  assert.deepEqual(result.nodes.map((node) => [node.tag, node.native]), [['main', true], ['Card', false], ['span', true]]);
  assert.equal(new Set(result.nodes.map((node) => node.id)).size, 3);
  assert.match(result.code, /id="business"/);
  assert.match(result.code, /const text = "<pretend\/>"/);
  assert.equal(normalize('react', result.code).code, result.code);
  assert.equal(normalize('react', result.code).changed, false);
  const formatted = generate(parse(result.code, { sourceType: 'module', plugins: ['jsx', 'typescript'] })).code;
  assert.deepEqual(normalize('react', formatted).nodes.map((node) => node.id), result.nodes.map((node) => node.id));
});

test('Vue SFC AST marks template elements only and preserves v-for identity', () => {
  const code = '<script setup lang="ts">const text: string = "<fake/>"; const items = [1,2]</script>\n<template>\n<!-- <fake/> --><main><Card/><span v-for="n in items" :key="n">{{n}}</span></main>\n</template><style>main::before {content:"<fake/>"}</style>';
  const result = normalize('vue', code);
  assert.deepEqual(result.nodes.map((node) => [node.tag, node.native]), [['main', true], ['Card', false], ['span', true]]);
  assert.equal(result.nodes.filter((node) => node.tag === 'span').length, 1);
  assert.equal(normalize('vue', result.code).changed, false);
  const reformatted = result.code.replace('<main ', '<main\n ').replace('<span ', '<span\n ');
  assert.deepEqual(normalize('vue', reformatted).nodes.map((node) => node.id), result.nodes.map((node) => node.id));
});

test('both parsers reject duplicate and dynamic explicit source IDs', () => {
  for (const framework of ['react', 'vue']) {
    const wrap = (content) => framework === 'vue' ? `<template>${content}</template>` : `const x = <>${content}</>`;
    throwsCode(() => normalize(framework, wrap('<div data-dsh-source="same"/><p data-dsh-source="same"/>')), 'DUPLICATE_SOURCE_ID');
    throwsCode(() => normalize(framework, wrap('<div data-dsh-source="one" data-dsh-source="two"/>')), framework === 'vue' ? 'SOURCE_PARSE_ERROR' : 'DUPLICATE_SOURCE_ID');
    throwsCode(() => normalize(framework, wrap(framework === 'react' ? '<div data-dsh-source={value}/>' : '<div :data-dsh-source="value"/>')), 'DYNAMIC_SOURCE_ID');
  }
});

test('source locator records exact UTF16 and UTF8 positions and full-file revision', () => {
  const result = normalize('react', 'const emoji = "😀";\nconst el = <span>你好</span>;');
  const node = result.nodes[0];
  const selected = sourceElement({ framework: 'react', path: 'src/App.tsx', code: result.code, nodeId: node.id });
  assert.equal(selected.code, result.code.slice(node.start, node.end));
  assert.equal(node.line, 2);
  assert.equal(node.column, 12);
  assert.equal(node.sourceHash, hash(result.code));
  assert.equal(node.elementHash, hash(selected.code));
  assert.equal(Buffer.from(result.code).subarray(node.byteStart, node.byteEnd).toString(), selected.code);
  assert.ok(node.byteStart > node.start);
});

for (const framework of ['react', 'vue']) test(`${framework} replacement preserves only selected range, root ID, and surrounding bytes`, () => {
  const original = framework === 'react' ? '// outer unchanged\nconst x = <main><span>old</span><aside>same</aside></main>;\n// tail' : '<script setup>const untouched = 1</script>\n<template><main><span>old</span><aside>same</aside></main></template>\n<style>span {color:blue}</style>';
  const source = normalize(framework, original);
  const node = source.nodes.find((item) => item.tag === 'span');
  const options = { framework, path: node.path, code: source.code, nodeId: node.id, expectedHash: source.hash };
  const result = replaceSourceElement({ ...options, replacement: '<strong><em>new</em></strong>' });
  assert.equal(result.code.slice(0, node.start), source.code.slice(0, node.start));
  const newRoot = result.nodes.find((item) => item.id === node.id);
  assert.equal(newRoot.tag, 'strong');
  assert.equal(result.code.slice(newRoot.end), source.code.slice(node.end));
  assert.ok(result.nodes.find((item) => item.tag === 'em').id);
  assert.equal(sourceElement({ ...options }).code, source.code.slice(node.start, node.end));
  throwsCode(() => replaceSourceElement({ ...options, replacement: '<span data-dsh-source="changed"/>' }), 'ROOT_SOURCE_ID_CHANGED');
  throwsCode(() => replaceSourceElement({ ...options, replacement: '<span/>', expectedHash: 'stale' }), 'SOURCE_REVISION_CONFLICT');
  throwsCode(() => replaceSourceElement({ ...options, replacement: '<span/><p/>' }), framework === 'react' ? 'SOURCE_PARSE_ERROR' : 'INVALID_ELEMENT_REPLACEMENT');
  throwsCode(() => sourceElement({ ...options, nodeId: 'missing' }), 'SOURCE_ELEMENT_NOT_FOUND');
  const outsideId = source.nodes.find((item) => item.tag === 'aside').id;
  throwsCode(() => replaceSourceElement({ ...options, replacement: `<span><b data-dsh-source="${outsideId}"/></span>` }), 'DUPLICATE_SOURCE_ID');
});

// A small public DOM surface exercises the actual browser bundle without a browser,
// framework host globals, private React properties, or extra test dependencies.
function createDOM() {
  const tasks = [];
  let document;
  class Node {
    constructor(type, name, text = '') { this.nodeType = type; this.nodeName = name; this.tagName = type === 1 ? name.toUpperCase() : undefined; this.localName = name; this.childNodes = []; this.parentNode = null; this.ownerDocument = document; this.attributes = {}; this.nodeValue = text; this.style = {}; this.namespaceURI = 'http://www.w3.org/1999/xhtml'; }
    appendChild(node) { return this.insertBefore(node, null); }
    insertBefore(node, before) { node.parentNode?.removeChild(node); const at = before ? this.childNodes.indexOf(before) : this.childNodes.length; this.childNodes.splice(at, 0, node); node.parentNode = this; return node; }
    removeChild(node) { this.childNodes.splice(this.childNodes.indexOf(node), 1); node.parentNode = null; return node; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    setAttributeNS(ns, name, value) { this.setAttribute(name, value); }
    removeAttribute(name) { delete this.attributes[name]; }
    getAttribute(name) { return this.attributes[name] ?? null; }
    addEventListener() {}
    removeEventListener() {}
    get firstChild() { return this.childNodes[0] || null; }
    get nextSibling() { if (!this.parentNode) return null; return this.parentNode.childNodes[this.parentNode.childNodes.indexOf(this) + 1] || null; }
    get textContent() { return this.nodeType === 3 ? this.nodeValue : this.childNodes.map((n) => n.textContent).join(''); }
    set textContent(value) { this.childNodes.forEach((node) => { node.parentNode = null; }); this.childNodes = []; if (String(value)) this.appendChild(document.createTextNode(String(value))); }
  }
  class Element extends Node { constructor(name) { super(1, name); } }
  document = { nodeType: 9, addEventListener() {}, removeEventListener() {}, createElement: (name) => new Element(name), createElementNS: (_ns, name) => new Element(name), createTextNode: (text) => new Node(3, '#text', text), createComment: (text) => new Node(8, '#comment', text), querySelector: () => root, getElementById: () => root };
  const root = new Element('div');
  document.documentElement = new Element('html');
  document.body = new Element('body');
  document.activeElement = document.body;
  const window = { document, HTMLIFrameElement: class {}, HTMLElement: Element, Element, SVGElement: class {}, addEventListener() {} };
  document.defaultView = window;
  const context = { document, window, self: window, Element, HTMLElement: Element, SVGElement: window.SVGElement, navigator: { userAgent: 'test' }, console, performance: { now: () => 0 }, setTimeout: (fn) => tasks.push(fn), clearTimeout() {}, setImmediate: (fn) => tasks.push(fn), clearImmediate() {}, queueMicrotask: (fn) => tasks.push(fn) };
  return { root, context, flush() { let count = 0; while (tasks.length) { if (++count > 100) throw new Error('Render task did not settle'); tasks.shift()(); } } };
}

for (const framework of ['react', 'vue']) test(`${framework} complete inline bundle renders repeated instances with one source ID`, async () => {
  const filename = framework === 'react' ? 'src/App.tsx' : 'src/App.vue';
  const code = framework === 'react' ? 'import "./style.css"; export default function App() { return <main data-dsh-source="fixed-main" {...{ "data-dsh-source": "forged" }}>{[1,2].map(n => <span key={n}>{n}</span>)}</main> }' : '<script setup lang="ts">const items: number[] = [1,2]; const attrs = { "data-dsh-source": "forged" }</script><template><main data-dsh-source="fixed-main" v-bind="attrs"><span v-for="n in items" :key="n">{{n}}</span></main></template><style scoped>span {color:red}</style>';
  const result = await compileFrameworkProject({ framework, entry: filename, files: { [filename]: code, 'src/style.css': 'span {color:red}' } });
  assert.match(result.html, /^<!doctype html>/);
  assert.match(result.html, /color: red/);
  assert.ok(result.normalizedFiles[filename]);
  assert.equal(result.manifest.runtime, 'bundled');
  const scripts = [...result.html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  const dom = createDOM();
  vm.runInNewContext(scripts[0][1], dom.context, { timeout: 5000 });
  dom.flush();
  const main = dom.root.childNodes.find((node) => node.localName === 'main');
  assert.ok(main, 'bundle mounted the entry component');
  assert.equal(main.getAttribute('data-dsh-source'), 'fixed-main', 'business spread cannot override source identity');
  const spans = main.childNodes.filter((node) => node.localName === 'span');
  assert.equal(spans.length, 2);
  assert.equal(spans[0].textContent, '1');
  assert.equal(spans[1].textContent, '2');
  const sourceId = result.manifest.nodes.find((node) => node.tag === 'span').id;
  assert.equal(spans[0].getAttribute('data-dsh-source'), sourceId);
  assert.equal(spans[1].getAttribute('data-dsh-source'), sourceId);
  const second = await compileFrameworkProject({ framework, entry: filename, files: { [filename]: result.normalizedFiles[filename], 'src/style.css': 'span {color:red}' } });
  assert.deepEqual(second.normalizedFiles, {});
  assert.deepEqual(second.manifest.nodes.map((node) => node.id), result.manifest.nodes.map((node) => node.id));
});

test('normal entry modules execute without assuming a default component export', async () => {
  const result = await compileFrameworkProject({ framework: 'react', entry: 'main.jsx', files: { 'main.jsx': 'import React from "react"; import {createRoot} from "react-dom/client"; createRoot(document.getElementById("root")).render(<p>entry</p>);' } });
  const dom = createDOM();
  vm.runInNewContext(result.html.match(/<script>([\s\S]*?)<\/script>/)[1], dom.context);
  dom.flush();
  assert.equal(dom.root.textContent, 'entry');
});

test('virtual filesystem rejects escapes, unprovided files and arbitrary dependencies', async () => {
  for (const [dependency, expected] of [['./missing', 'FILE_NOT_PROVIDED'], ['../../outside.js', 'PROJECT_PATH_ESCAPE'], ['/tmp/secret.js', 'PROJECT_PATH_ESCAPE'], ['node:fs', 'FRAMEWORK_DEPENDENCY_NOT_ALLOWED'], ['https://example.com/module.js', 'FRAMEWORK_DEPENDENCY_NOT_ALLOWED'], ['lodash', 'FRAMEWORK_DEPENDENCY_NOT_ALLOWED']]) {
    await assert.rejects(compileFrameworkProject({ framework: 'react', entry: 'src/main.jsx', files: { 'src/main.jsx': `import ${JSON.stringify(dependency)};` } }), (error) => error.code === expected, dependency);
  }
  await assert.rejects(compileFrameworkProject({ framework: 'react', entry: 'App.jsx', files: { 'App.jsx': '<div data-dsh-source="shared"/>;', 'Other.jsx': '<p data-dsh-source="shared"/>;' } }), (error) => error.code === 'DUPLICATE_SOURCE_ID');
  await assert.rejects(compileFrameworkProject({ framework: 'react', entry: 'App.jsx', files: { '../App.jsx': '' } }), (error) => error.code === 'PROJECT_PATH_ESCAPE');
});

test('Vue style imports resolve from the SFC directory and preserve asset URLs', async () => {
  const result = await compileFrameworkProject({ framework: 'vue', entry: 'nested/App.vue', files: { 'nested/App.vue': '<template><main>CSS</main></template><style>@import "./theme.css"; main {background:url(./image.png)}</style>', 'nested/theme.css': 'main {color:purple}' } });
  assert.match(result.html, /color: purple/);
  assert.match(result.html, /nested\/image.png/);
});

test('TypeScript helpers and Vue imported props resolve only from virtual text', async () => {
  const react = await compileFrameworkProject({ framework: 'react', entry: 'App.tsx', files: { 'App.tsx': 'import {n} from "./helper"; export default () => <p>{n}</p>', 'helper.ts': 'export const n = <number>1;' } });
  assert.equal(react.manifest.nodes.length, 1);
  const vue = await compileFrameworkProject({ framework: 'vue', entry: 'src/App.vue', files: { 'src/App.vue': '<script setup lang="ts">import type {Props} from "./types"; defineProps<Props>();</script><template><p>{{title}}</p></template>', 'src/types.ts': 'export interface Props { title?: string }' } });
  assert.equal(vue.manifest.nodes.length, 1);
  throwsCode(() => sourceElement({ framework: 'react', path: 'App.jsx', code: '<p/>;' }), 'SOURCE_ELEMENT_NOT_FOUND');
  await assert.rejects(compileFrameworkProject({ framework: 'vue', entry: 'src/App.vue', files: { 'src/App.vue': '<script setup lang="ts">import type {Props} from "../../outside"; defineProps<Props>();</script><template><p/></template>' } }), (error) => error.code === 'PROJECT_PATH_ESCAPE');
});

test('unsupported Vue external sources fail explicitly', async () => {
  await assert.rejects(compileFrameworkProject({ framework: 'vue', entry: 'App.vue', files: { 'App.vue': '<template src="./template.html"></template>' } }), (error) => error.code === 'FILE_NOT_PROVIDED');
});

test('inline script terminators are escaped without a CDN or host runtime dependency', async () => {
  const result = await compileFrameworkProject({ framework: 'react', entry: 'main.js', files: { 'main.js': 'document.getElementById("root").textContent = "</script><script>bad</script>";' } });
  assert.equal((result.html.match(/<\/script>/g) || []).length, 1);
  const dom = createDOM();
  vm.runInNewContext(result.html.match(/<script>([\s\S]*?)<\/script>/)[1], dom.context);
  assert.equal(dom.root.textContent, '</script><script>bad</script>');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createFileTree, fileNavigationId, flattenFileTree, orderFileTree, reconcileFileViewState, reorderFileView, searchFileTree, visibleFileNodes} from './file-tree.js';

const fileNodes = tree => flattenFileTree(tree).filter(node => node.kind === 'file');
const paths = tree => fileNodes(tree).map(node => node.path);
const atPath = (tree, path, sourceId = '') => flattenFileTree(tree).find(node => node.path === path && node.sourceId === sourceId);

test('Git metadata stays hidden in local and nested source trees', () => {
  const tree = createFileTree([
    {path: '.git/config'}, {path: '.gitignore'}, {path: '.gitattributes'},
    {path: '.github/workflows/check.yml'}, {path: 'designs/web/index.html'},
    {name: 'src', type: 'directory', sourceId: 'external', children: [
      {name: '.git', type: 'directory', children: [{name: 'HEAD'}]},
      {name: '.gitmodules'}, {name: 'app.js'},
    ]},
  ]);
  assert.deepEqual(paths(tree), ['designs/web/index.html', 'src/app.js']);
});

test('canonical hierarchy is deterministic for flat actual entries and nested DTOs, preserving resource roles', () => {
  const flat = [
    {id: 'logo', path: 'assets/logo.svg', type: 'asset', entryType: 'file', readonly: true},
    {id: 'app', fileId: 'app', path: 'src/app.js', type: 'source', entryType: 'file'},
    {id: 'readme', path: 'README.md', type: 'markdown', entryType: 'file', children: []},
    // A directory can have a logical type supplied by describe/registration.
    {id: 'src-dir', path: 'src', type: 'file', entryType: 'directory'},
    {path: 'empty', type: 'directory'},
  ];
  const before = structuredClone(flat), tree = createFileTree(flat);
  assert.deepEqual(tree.map(node => [node.name, node.kind]), [['assets', 'directory'], ['empty', 'directory'], ['src', 'directory'], ['README.md', 'file']]);
  assert.deepEqual(paths(tree), ['assets/logo.svg', 'src/app.js', 'README.md']);
  assert.equal(atPath(tree, 'src').file.id, 'src-dir');
  assert.equal(atPath(tree, 'assets/logo.svg').file.type, 'asset');
  assert.equal(atPath(tree, 'assets/logo.svg').file.readonly, true);
  assert.deepEqual(createFileTree([...flat].reverse()), tree);
  assert.deepEqual(flat, before);
  const nested = createFileTree([{name: 'src', type: 'directory', children: [{id: 'app', name: 'app.js', type: 'source'}]}]);
  assert.equal(atPath(nested, 'src/app.js').id, atPath(tree, 'src/app.js').id);
  assert.deepEqual(paths(nested), ['src/app.js']);
  assert.equal(fileNodes(createFileTree([{id: 'plain', name: 'plain.txt', type: 'file', children: []}])).length, 1);
});

test('duplicate basenames show exact path and source scope; provenance never becomes source authority', () => {
  const entries = [
    {id: 'same', path: 'src/index.js', source: {id: 'origin', kind: 'copy'}, registered: true},
    {id: 'second', path: 'test/index.js'},
    {fileId: 'same', path: 'src/index.js', sourceId: 'registered-a', sourceName: 'Application A', readonly: true},
    {fileId: 'same', path: 'src/index.js', sourceId: 'registered-b', sourceName: 'Application B'},
  ];
  const tree = createFileTree(entries), leaves = fileNodes(tree);
  assert.equal(leaves.length, 4);
  assert.equal(new Set(leaves.map(node => node.id)).size, 4);
  assert.ok(leaves.every(node => node.duplicateName));
  assert.equal(atPath(tree, 'src/index.js').location, 'src/index.js');
  assert.equal(atPath(tree, 'src/index.js', 'registered-a').location, 'registered-a · src/index.js');
  assert.equal(atPath(tree, 'src/index.js').file.sourceId, undefined);
  assert.equal(atPath(tree, 'src/index.js').file.registered, true);
  assert.deepEqual(atPath(tree, 'src/index.js').file.source, entries[0].source);
  assert.equal(atPath(tree, 'src/index.js', 'registered-a').file.id, 'same');
  assert.equal(tree.find(node => node.sourceId === 'registered-a').name, 'Application A');
  assert.equal(reorderFileView(tree, {}, atPath(tree, 'src/index.js').id, atPath(tree, 'src/index.js', 'registered-a').id), null);
});

test('nested registered source children inherit only their exact source scope and readonly permission', () => {
  const files = [{name: 'src', type: 'directory', sourceId: 'external', readonly: true, children: [
    {id: 'a', name: 'a.js', readonly: false},
    {id: 'b', path: 'lib/b.js', sourceId: 'different', readonly: false},
  ]}];
  const before = structuredClone(files), tree = createFileTree(files);
  assert.equal(atPath(tree, 'src/a.js', 'external').file.readonly, true);
  assert.equal(atPath(tree, 'src/a.js', 'external').file.sourceId, 'external');
  assert.equal(atPath(tree, 'lib/b.js', 'different').file.readonly, false);
  assert.equal(atPath(tree, 'src/lib/b.js', 'different'), undefined);
  assert.deepEqual(files, before);
});

test('search retains only matching files and their ancestor chain; matching a folder reveals its actual subtree', () => {
  const tree = createFileTree([
    {id: 'a', path: 'src/deep/needle.ts'}, {id: 'b', path: 'src/deep/other.ts'},
    {id: 'c', path: 'docs/notes.md'}, {id: 'd', path: 'test/needle.ts'},
  ]);
  const searched = searchFileTree(tree, '  NEEDLE  ');
  assert.deepEqual(paths(searched), ['src/deep/needle.ts', 'test/needle.ts']);
  assert.deepEqual(flattenFileTree(searched).filter(node => node.kind === 'directory').map(node => node.path), ['src', 'src/deep', 'test']);
  assert.equal(atPath(searched, 'src/deep/needle.ts').file, atPath(tree, 'src/deep/needle.ts').file);
  assert.deepEqual(paths(searchFileTree(tree, 'src/deep')), ['src/deep/needle.ts', 'src/deep/other.ts']);
  assert.deepEqual(searchFileTree(tree, 'absent'), []);
  assert.equal(searchFileTree(tree, ''), tree);
  const dirs = flattenFileTree(searched).filter(node => node.kind !== 'file').map(node => node.id);
  assert.deepEqual(visibleFileNodes(searched, dirs).map(node => [node.path, node.level]), [['src', 1], ['src/deep', 2], ['src/deep/needle.ts', 3], ['test', 1], ['test/needle.ts', 2]]);
  assert.deepEqual(visibleFileNodes(tree, []).map(node => node.path), ['docs', 'src', 'test']);
});

test('view-state restoration prunes missing IDs, preserves valid custom order and honors collapsed empty arrays', () => {
  const files = [{id: 'a', path: 'src/a.js'}, {id: 'b', path: 'src/b.js'}, {id: 'gone', path: 'old/gone.js'}];
  const oldTree = createFileTree(files), a = fileNavigationId(files[0]), b = fileNavigationId(files[1]);
  const src = atPath(oldTree, 'src').id, oldDir = atPath(oldTree, 'old').id, gone = fileNavigationId(files[2]);
  const previous = {expanded: [src, oldDir, src, a, 'missing'], order: [b, gone, a, b, oldDir, 'missing'], marker: {preserve: true}};
  const tree = createFileTree([...files.slice(0, 2), {id: 'c', path: 'src/c.js'}]);
  const state = reconcileFileViewState(tree, previous);
  assert.deepEqual(state.expanded, [src]);
  assert.deepEqual(state.order, [b, a]);
  assert.deepEqual(state.marker, {preserve: true});
  assert.deepEqual(paths(orderFileTree(tree, state)), ['src/b.js', 'src/a.js', 'src/c.js']);
  assert.deepEqual(previous.order, [b, gone, a, b, oldDir, 'missing']);
  assert.deepEqual(reconcileFileViewState(tree, {expanded: [], order: []}).expanded, []);
  assert.deepEqual(reconcileFileViewState([], state), {expanded: [], order: [], marker: {preserve: true}});
  assert.deepEqual(reconcileFileViewState(tree).expanded, [src]);
});

test('stable file identity retains ordering after rename; same-path replacement cannot inherit it', () => {
  const initial = createFileTree([{id: 'stable', path: 'src/old.js'}, {id: 'other', path: 'src/other.js'}]);
  const stable = atPath(initial, 'src/old.js').id, other = atPath(initial, 'src/other.js').id;
  const changed = createFileTree([{id: 'stable', path: 'src/renamed.js'}, {id: 'new-resource', path: 'src/old.js'}, {id: 'other', path: 'src/other.js'}]);
  const state = reconcileFileViewState(changed, {order: [stable, other], expanded: []});
  assert.equal(atPath(changed, 'src/renamed.js').id, stable);
  assert.notEqual(atPath(changed, 'src/old.js').id, stable);
  assert.deepEqual(paths(orderFileTree(changed, state)), ['src/renamed.js', 'src/other.js', 'src/old.js']);
  // Path fallback is scoped; separators inside IDs cannot collide with scope keys.
  assert.notEqual(fileNavigationId({path: 'a.js'}), fileNavigationId({path: 'a.js', sourceId: 'source'}));
  assert.notEqual(fileNavigationId({id: 'b:c', sourceId: 'a'}), fileNavigationId({id: 'c', sourceId: 'a:b'}));
  assert.notEqual(fileNavigationId({id: 'a.js', path: 'elsewhere.js'}), fileNavigationId({path: 'a.js'}));
  assert.equal(fileNavigationId({id: 'incidental', fileId: 'canonical', path: 'old.js'}), fileNavigationId({id: 'canonical', path: 'renamed.js'}));
});

test('drag sorting affects sibling view arrays only, preserves DTOs and rejects cross-group moves', () => {
  const files = [{id: 'a', path: 'one/a.js'}, {id: 'b', path: 'one/b.js'}, {id: 'c', path: 'one/c.js'}, {id: 'x', path: 'two/x.js'}, {id: 'y', path: 'two/y.js'}];
  const tree = createFileTree(files), before = structuredClone(tree);
  const [a, b, c, x, y] = files.map(fileNavigationId);
  const state = {expanded: [], order: [y, x]};
  const next = reorderFileView(tree, state, c, a);
  assert.deepEqual(paths(orderFileTree(tree, next)), ['one/c.js', 'one/a.js', 'one/b.js', 'two/y.js', 'two/x.js']);
  const after = reorderFileView(tree, next, a, b, true);
  assert.deepEqual(paths(orderFileTree(tree, after)), ['one/c.js', 'one/b.js', 'one/a.js', 'two/y.js', 'two/x.js']);
  assert.deepEqual(tree, before);
  assert.deepEqual(state, {expanded: [], order: [y, x]});
  assert.equal(reorderFileView(tree, state, a, x), null);
  assert.equal(reorderFileView(tree, state, a, a), null);
  assert.equal(reorderFileView(tree, state, a, 'missing'), null);
  assert.equal(reorderFileView(tree, state, atPath(tree, 'one').id, a), null);
  assert.deepEqual(paths(orderFileTree(tree, reorderFileView(tree, state, atPath(tree, 'two').id, atPath(tree, 'one').id))), ['two/y.js', 'two/x.js', 'one/a.js', 'one/b.js', 'one/c.js']);
});

test('removed records and repeated stable IDs never invent resources or restore a different source', () => {
  const files = [{id: 'a', path: 'src/a.js'}, {id: 'gone', path: 'src/gone.js', removedAt: 'now'}, {id: 'deleted', path: 'src/deleted.js', deletedAt: 'now'}];
  const tree = createFileTree([...files, files[0], null]);
  assert.deepEqual(paths(tree), ['src/a.js']);
  const local = fileNavigationId(files[0]);
  const external = createFileTree([{...files[0], sourceId: 'registered'}]);
  assert.deepEqual(reconcileFileViewState(external, {expanded: [], order: [local]}).order, []);
  assert.deepEqual(createFileTree(), []);
});

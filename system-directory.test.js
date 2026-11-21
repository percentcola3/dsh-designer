import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {systemDirectoryFiles} from './system-directory.js';

test('legacy specifications adapt to files without mutating fixed versions or duplicating logical paths', () => {
  const old = {guidelines: '# Existing rules', tokens: {color: 'red'}, resources: [{id: 'r-image', logicalPath: 'assets/image.png'}]};
  const before = structuredClone(old), files = systemDirectoryFiles(old);
  assert.deepEqual(old, before);
  assert.equal(files.find(file => file.logicalPath === 'rule.md').content, old.guidelines);
  assert.deepEqual(JSON.parse(files.find(file => file.logicalPath === 'tokens.json').content), old.tokens);
  assert.equal(systemDirectoryFiles({resources: files}).length, files.length);
  assert.deepEqual(systemDirectoryFiles({guidelines: '# Minimal'}).map(file => file.logicalPath), ['rule.md']);
});

test('Ant Design template contains pinned verified source output and component example scopes', async () => {
  const root = new URL('./templates/antd/', import.meta.url);
  const provenance = JSON.parse(await readFile(new URL('provenance.json', root)));
  assert.equal(provenance.antd, '6.7.0');
  assert.equal(provenance.extractor, '2.1.0');
  for (const [path, hash] of Object.entries(provenance.outputs)) assert.equal(createHash('sha256').update(await readFile(new URL(path, root))).digest('hex'), hash, path);
  const tokens = JSON.parse(await readFile(new URL('tokens.json', root)));
  assert.equal(tokens.colorPrimary, '#1677ff');
  assert.equal(tokens.controlHeight, 32);
  assert.equal(Object.keys(tokens).length, provenance.tokenCount);
  const css = await readFile(new URL('css/antd.css', root), 'utf8');
  const example = await readFile(new URL('examples/components.html', root), 'utf8');
  assert.match(css, /\.dsh-antd\.ant-btn/);
  assert.match(example, /class="[^"]*dsh-antd/);
  assert.match(example, /\.\.\/css\/tokens.css/);
  assert.match(await readFile(new URL('css/tokens.css', root), 'utf8'), /--ant-color-primary:#1677ff/);
});

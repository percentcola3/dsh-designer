import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID, createHash} from 'node:crypto';
import * as native from './vendor/zg-core.js';
import {lexicalAvailable, lexicalChunks, indexLexical, searchLexical} from './knowledge-lexical-engine.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function state(root) {
  const result = {};
  async function walk(directory) { const info = await fs.stat(directory, {bigint: true}); result[(path.relative(root, directory) || '.') + '/'] = {directory: true, mtimeNs: String(info.mtimeNs), mode: String(info.mode)}; for (const item of await fs.readdir(directory, {withFileTypes: true})) { const target = path.join(directory, item.name); if (item.isDirectory()) await walk(target); else { const stat = await fs.stat(target, {bigint: true}); result[path.relative(root, target)] = {sha256: sha(await fs.readFile(target)), mtimeNs: String(stat.mtimeNs), mode: String(stat.mode)}; } } }
  await walk(root); return result;
}

test('text passages preserve exact source lines, bounded lengths and distinct native document IDs', () => {
  const text = ['# Authentication', ...Array.from({length: 140}, (_, i) => `Line ${i}: token refresh.`), 'x'.repeat(17000), '用户登录认证'].join('\n');
  const edge = lexicalChunks('a'.repeat(4000) + '\n' + 'b'.repeat(4000), 'edge.txt'); assert.equal(edge.length, 2); assert.ok(edge.every(chunk => chunk.text.length <= 8000));
  const chunks = lexicalChunks(text, 'documents/d-code/src/auth.js.txt'), lines = text.split('\n');
  assert.ok(chunks.length > 5); assert.equal(new Set(chunks.map(chunk => chunk.id)).size, chunks.length);
  for (const chunk of chunks) { assert.ok(chunk.startLine > 0 && chunk.endLine <= lines.length); assert.ok(chunk.text.length <= 8000); assert.ok(lines.slice(chunk.startLine - 1, chunk.endLine).join('\n').includes(chunk.text)); }
});

test('official scalar FTS indexes without model capabilities and direct read-only query leaves every file unchanged', async () => {
  const root = fileURLToPath(new URL('./.build/lexical-' + randomUUID(), import.meta.url)); await fs.mkdir(root, {recursive: true});
  const core = Object.fromEntries(['ZVecCollectionSchema', 'ZVecCreateAndOpen', 'ZVecOpen', 'ZVecInitialize', 'ZVecDataType', 'ZVecIndexType', 'ZVecLogLevel'].map(key => [key, native[key]]));
  assert.equal(lexicalAvailable(core), true); assert.equal(core.createEmbeddingModel, undefined);
  const indexPath = path.join(root, 'fts'), progress = [], files = [{corpusPath: 'documents/d-guide/guide.md.txt', text: '# Authentication\nRefresh the session token after login.\n用户登录认证需要令牌。'}, {corpusPath: 'documents/d-style/colors.md.txt', text: '# Colors\nEmerald and orange palettes.'}];
  const oldFetch = globalThis.fetch; globalThis.fetch = () => { throw new Error('No network or model download is allowed'); };
  try {
    const indexed = await indexLexical(core, {indexPath, files, emit: value => progress.push(value)}); assert.equal(indexed.filesIndexed, 2); assert.equal(indexed.filesFailed, 0); assert.ok(indexed.entities >= 2);
    const before = await state(root);
    const opened = native.ZVecOpen(indexPath, {readOnly: true}); assert.deepEqual(opened.schema.vectors(), []); opened.closeSync();
    for (const query of ['authentication', '登录']) {
      const hits = searchLexical(core, {indexPath, query, limit: 10}); assert.ok(hits.length > 0); assert.equal(hits[0].corpusPath, files[0].corpusPath); assert.ok(hits[0].score > 0);
    }
    assert.deepEqual(searchLexical(core, {indexPath, query: 'completelymissingterm', limit: 10}), []);
    assert.deepEqual(searchLexical(core, {indexPath, query: '*{}()', limit: 10}), []);
    assert.deepEqual(await state(root), before, 'original bytes/SHA256/mtimeNs/mode stay identical without chmod or timestamp restoration');
    assert.equal(progress.at(-1).filesIndexed, 2); await assert.rejects(fs.stat(path.join(root, '.workbench')), {code: 'ENOENT'});
  } finally { globalThis.fetch = oldFetch; }
});

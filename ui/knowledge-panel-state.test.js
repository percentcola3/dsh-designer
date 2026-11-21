import test from 'node:test';
import assert from 'node:assert/strict';
import { buildKnowledgeTree, knowledgeTreeEntries, knowledgePreviewTab, knowledgeLinkedDocument, knowledgeIndexState, knowledgeIndexProgress, knowledgeImportRunning, knowledgeImportState, knowledgeImportName, knowledgeDraftDirty, knowledgeViewTicket, knowledgeResponseCurrent, knowledgeUploadPath, uploadKnowledgeFiles, importKnowledgeFiles, loadKnowledgeTextPreview, isKnowledgeText } from './knowledge-panel-state.js';

test('directory trees retain paths, sort folders first, and keep duplicate originals distinct', () => {
  const documents = [{ id: 'readme', name: 'README.md', relativePath: 'README.md' }, { id: 'two', relativePath: 'src/order2.ts' }, { id: 'ten', relativePath: 'src/order10.ts' }, { id: 'duplicate', relativePath: 'src/order2.ts' }, { id: 'api', relativePath: 'src/api/index.ts' }, { id: 'proto', relativePath: '__proto__/file.txt' }];
  const tree = buildKnowledgeTree(documents);
  assert.equal(tree.at(-1).name, 'README.md');
  const src = tree.find(node => node.path === 'src'); assert.equal(src.type, 'folder'); assert.equal(src.children[0].path, 'src/api');
  assert.deepEqual(src.children.filter(node => node.type === 'file').map(node => node.document.id), ['two', 'duplicate', 'ten']);
  assert.equal(tree.find(node => node.path === '__proto__').children[0].document.id, 'proto');
  assert.equal(documents.length, 6);
});

test('native file tree entries retain duplicate originals with unique identities and their original display names', () => {
  const entries = knowledgeTreeEntries(buildKnowledgeTree([
    {id: 'd-one', name: 'guide.md', relativePath: 'docs/guide.md'},
    {id: 'd-two', name: 'guide.md', relativePath: 'docs/guide.md'},
  ]));
  assert.equal(entries[0].meta.kind, 'directory');
  assert.equal(new Set(entries.map(entry => entry.path)).size, 3);
  assert.deepEqual(entries.slice(1).map(entry => entry.meta.documentId), ['d-one', 'd-two']);
  assert.ok(entries.slice(1).every(entry => entry.name === 'guide.md'));
});

test('knowledge previews classify original bytes, keep readonly and expose PDF image and download URLs', () => {
  const original = {originalUrl: '/original', downloadUrl: '/original?download=true'};
  for (const name of ['report.pdf', 'photo.png', 'movie.mp4', 'sound.mp3']) {
    const tab = knowledgePreviewTab(original, {id: name, name});
    assert.equal(tab.binary, false);
    assert.equal(tab.previewUrl, '/original');
    assert.equal(tab.downloadUrl, original.downloadUrl);
    assert.equal(tab.readonly, true);
  }
  for (const name of ['report.docx', 'report.doc', 'slides.pptx', 'data.xlsx', 'archive.zip']) {
    assert.equal(knowledgePreviewTab(original, {id: name, name}).type, 'binary');
  }
  const markdown = knowledgePreviewTab({...original, content: '# Guide', truncated: true}, {id: 'd-md', name: 'guide.md', mimeType: 'application/octet-stream'});
  assert.equal(markdown.binary, false);
  assert.equal(markdown.content, '# Guide');
  assert.equal(markdown.truncated, true);
  assert.equal(markdown.mimeType, 'text/plain');
  assert.equal(isKnowledgeText({name: 'icon.svg'}), true);
});

test('relative Markdown images resolve only to a unique original in the current knowledge library', () => {
  const document = {name: 'guide.md', relativePath: 'docs/guide.md'};
  const image = {id: 'd-image', relativePath: 'assets/图.png'};
  assert.equal(knowledgeLinkedDocument(document, '../assets/%E5%9B%BE.png', [image]), image);
  assert.throws(() => knowledgeLinkedDocument(document, 'https://other.test/image.png', [image]), /当前知识库/);
  assert.throws(() => knowledgeLinkedDocument(document, '../missing.png', [image]), /不存在/);
  assert.throws(() => knowledgeLinkedDocument(document, '../assets/图.png', [image, {...image, id: 'duplicate'}]), /不唯一/);
});

test('file name filtering preserves ancestor folders and rejects invalid stored paths', () => {
  const tree = buildKnowledgeTree([{ id: 'one', relativePath: 'Business/Orders/submit.ts' }, { id: 'two', relativePath: 'Business/Users/read.ts' }], 'ORDERS');
  assert.equal(tree.length, 1); assert.equal(tree[0].children[0].path, 'Business/Orders'); assert.equal(tree[0].children[0].children[0].document.id, 'one');
  assert.deepEqual(buildKnowledgeTree([{ id: 'one', relativePath: 'src/a.ts' }], 'missing'), []);
  assert.throws(() => buildKnowledgeTree([{ id: 'one', relativePath: '../escape.ts' }]));
});

test('short indexing status follows actual readiness and version instead of assuming import completion is searchable', () => {
  assert.equal(knowledgeIndexState({}).ready, false);
  assert.equal(knowledgeIndexState({ index: { state: 'indexing' } }).label, '正在整理');
  assert.equal(knowledgeIndexState({ contentRevision: 3, index: { state: 'ready', sourceVersion: 3 } }).label, '可搜索');
  const stale = knowledgeIndexState({ contentRevision: 4, index: { state: 'ready', sourceVersion: 3 } }); assert.equal(stale.state, 'stale'); assert.equal(stale.ready, false);
  assert.equal(knowledgeIndexState({ index: { state: 'ready' } }).ready, false);
  assert.equal(knowledgeIndexState({ contentRevision: 1, index: { state: 'invented' } }).ready, false);
  assert.equal(knowledgeIndexState({ index: { state: 'failed', error: { message: 'Worker unavailable' } } }).error, 'Worker unavailable');
  assert.equal(knowledgeIndexState({ index: { state: 'failed', error: { code: 'INDEX_CANCELLED' } } }).label, '已取消');
  assert.equal(knowledgeImportState({ status: 'completed' }), '导入完成'); assert.equal(knowledgeImportRunning({ status: 'completed' }), false); assert.equal(knowledgeImportRunning({ status: 'fetching' }), true); assert.equal(knowledgeImportRunning({ status: 'cancelling' }), true);
});

test('progress and import names use actual source information', () => {
  assert.equal(knowledgeIndexProgress({ completed: 2, total: 8 }), '2/8'); assert.equal(knowledgeIndexProgress({ filesIndexed: 2, filesTotal: 8 }), '2/8');
  assert.equal(knowledgeIndexProgress({ phase: 'cancelling' }), '正在取消…'); assert.equal(knowledgeIndexProgress({ percent: 50 }), '');
  assert.equal(knowledgeImportName([{ name: 'a.ts', webkitRelativePath: 'Business/src/a.ts' }]), 'Business');
  assert.equal(knowledgeImportName([], 'git@example.test:team/business.git'), 'business');
});

test('drafts stay dirty and old library responses cannot overwrite a different view or request', () => {
  const original = { name: 'Business' }; assert.equal(knowledgeDraftDirty({ original, draft: { ...original } }), false); assert.equal(knowledgeDraftDirty({ original, draft: { name: 'Edited' } }), true); assert.equal(knowledgeDraftDirty({ type: 'preview' }), false);
  const view = { knowledgeId: 'a', sequence: 1 }, ticket = knowledgeViewTicket(view, 8); assert.equal(knowledgeResponseCurrent(ticket, view, 8), true);
  assert.equal(knowledgeResponseCurrent(ticket, { knowledgeId: 'b', sequence: 2 }, 8), false); assert.equal(knowledgeResponseCurrent(ticket, { knowledgeId: 'a', sequence: 3 }, 8), false); assert.equal(knowledgeResponseCurrent(ticket, view, 9), false);
});

test('mixed code directory uploads never send private bytes and advance CAS only for business files', async () => {
  const files = [{ name: 'orders.ts', webkitRelativePath: 'repo/src/orders.ts', content: 'business code' }, { name: 'config', webkitRelativePath: 'repo/.git/config', content: 'PRIVATE' }, { name: 'README.md', webkitRelativePath: 'repo/README.md', content: 'Business' }, { name: 'index.js', webkitRelativePath: 'repo/node_modules/dependency/index.js', content: 'DEPENDENCY' }, { name: '.env', webkitRelativePath: 'repo/.env', content: 'PRIVATE' }, { name: 'payments.ts', webkitRelativePath: 'repo/src/payments.ts', content: 'business code' }];
  let revision = 7; const uploaded = [], progress = [];
  const result = await uploadKnowledgeFiles({ files, knowledge: { id: 'k-business', revision }, upload: async (file, options) => { assert.equal(options.expectedRevision, revision); assert.ok(!['PRIVATE', 'DEPENDENCY'].includes(file.content)); uploaded.push({ path: options.relativePath, revision }); revision++; return { knowledge: { id: 'k-business', revision } }; }, onProgress: value => progress.push(value) });
  assert.deepEqual(uploaded.map(file => file.path), ['repo/src/orders.ts', 'repo/README.md', 'repo/src/payments.ts']); assert.deepEqual(uploaded.map(file => file.revision), [7, 8, 9]);
  assert.deepEqual(result.saved, uploaded.map(file => file.path)); assert.deepEqual(result.skipped, ['repo/.git/config', 'repo/node_modules/dependency/index.js', 'repo/.env']);
  assert.deepEqual(progress.map(value => [value.saved.length, value.total, value.skipped.length]), [[1, 3, 3], [2, 3, 3], [3, 3, 3]]);
});

test('browser import batches close exactly once and trigger automatic indexing only after all original uploads', async () => {
  const calls = [], knowledge = { id: 'k-business', revision: 10 };
  const api = async (action, args) => { calls.push({ action, args }); if (action === 'knowledge.import.begin') return { knowledge: { ...knowledge, revision: 11 }, batchId: 'batch-one' }; assert.equal(action, 'knowledge.import.complete'); return { knowledge: { ...knowledge, revision: 14, index: { state: 'indexing' } }, importedCount: 2, failedCount: 0 }; };
  const result = await importKnowledgeFiles({ knowledge, files: [{ name: 'a.ts' }, { name: '.env' }, { name: 'b.ts' }], api, upload: async (_file, args) => { calls.push({ action: 'upload', args }); return { knowledge: { ...knowledge, revision: args.expectedRevision + 1 } }; } });
  assert.deepEqual(calls.map(call => call.action), ['knowledge.import.begin', 'upload', 'upload', 'knowledge.import.complete']);
  assert.deepEqual(calls.filter(call => call.action === 'upload').map(call => [call.args.expectedRevision, call.args.batchId]), [[11, 'batch-one'], [12, 'batch-one']]);
  assert.equal(calls.at(-1).args.expectedRevision, 13); assert.deepEqual(calls.at(-1).args.failures, []); assert.equal(result.knowledge.index.state, 'indexing'); assert.deepEqual(result.skipped, ['.env']);
});

test('batch partial failures remain visible, retain the last successful CAS revision and permit later safe files', async () => {
  const knowledge = { id: 'k-business', revision: 1 }, revisions = []; let completed;
  const result = await importKnowledgeFiles({ knowledge, files: [{ name: 'a.ts' }, { name: 'large.ts' }, { name: 'b.ts' }], api: async (action, args) => { if (action === 'knowledge.import.begin') return { knowledge: { ...knowledge, revision: 2 }, batchId: 'batch' }; completed = args; return { knowledge: { ...knowledge, revision: 5 }, importedCount: 2, failedCount: 1 }; }, upload: async (file, args) => { revisions.push(args.expectedRevision); if (file.name === 'large.ts') throw Object.assign(new Error('File too large'), { code: 'UPLOAD_TOO_LARGE' }); return { knowledge: { ...knowledge, revision: args.expectedRevision + 1 } }; } });
  assert.deepEqual(revisions, [2, 3, 3]); assert.equal(completed.expectedRevision, 4); assert.equal(completed.cancelled, undefined); assert.equal(completed.failures[0].path, 'large.ts'); assert.equal(result.failures.length, 1); assert.deepEqual(result.saved, ['a.ts', 'b.ts']);
});

test('CAS errors stop the remaining batch and explicitly cancel completion without masking the failure', async () => {
  let uploads = 0, completed;
  await assert.rejects(importKnowledgeFiles({ knowledge: { id: 'k-business', revision: 1 }, files: [{ name: 'a.ts' }, { name: 'b.ts' }, { name: 'c.ts' }], api: async (action, args) => { if (action === 'knowledge.import.begin') return { knowledge: { id: 'k-business', revision: 2 }, batchId: 'batch' }; if (action === 'knowledge.get') return { knowledge: { id: 'k-business', revision: 4, lastImport: { id: 'batch', state: 'importing' } } }; completed = args; return { knowledge: { id: 'k-business', revision: 5 } }; }, upload: async (_file, args) => { if (++uploads === 2) throw Object.assign(new Error('changed'), { code: 'VERSION_CONFLICT' }); return { knowledge: { id: 'k-business', revision: args.expectedRevision + 1 } }; } }), error => { assert.equal(error.code, 'VERSION_CONFLICT'); assert.deepEqual(error.saved, ['a.ts']); return true; });
  assert.equal(uploads, 2); assert.equal(completed.cancelled, true); assert.equal(completed.expectedRevision, 4);
});

test('all-private selections make no batch or upload calls and invalid paths fail before writing', async () => {
  let calls = 0; const knowledge = { id: 'k-business', revision: 4 };
  const result = await importKnowledgeFiles({ knowledge, files: [{ name: '.env' }, { name: 'server.key' }], api: async () => { calls++; }, upload: async () => { calls++; } });
  assert.equal(calls, 0); assert.equal(result.knowledge, knowledge); assert.deepEqual(result.saved, []); assert.equal(result.skipped.length, 2);
  await assert.rejects(uploadKnowledgeFiles({ files: [{ name: 'a' }, { name: 'secret', webkitRelativePath: 'repo/.git/../secret' }], knowledge, upload: async () => { calls++; } }), error => error.code === 'KNOWLEDGE_INVALID_UPLOAD_PATH'); assert.equal(calls, 0);
  for (const path of ['../secret', '/absolute', 'C:/file', 'a\\b', 'a//b', 'a\nb']) assert.throws(() => knowledgeUploadPath({ name: 'file', webkitRelativePath: path }));
});

test('original previews are bounded literal text and PDF, Office or images are never fetched as text', async () => {
  let cancelled = false; const chunks = [new TextEncoder().encode('<script>'), new TextEncoder().encode('never execute</script>')];
  const fetcher = async () => ({ ok: true, body: { getReader: () => ({ read: async () => chunks.length ? { value: chunks.shift(), done: false } : { done: true }, cancel: async () => { cancelled = true; } }) } });
  const result = await loadKnowledgeTextPreview({ originalUrl: '/original' }, { name: 'example.html', mimeType: 'application/octet-stream' }, fetcher, 12); assert.equal(result.content, '<script>neve'); assert.equal(result.truncated, true); assert.equal(cancelled, true);
  assert.equal(isKnowledgeText({ name: 'core.ts', mimeType: 'application/octet-stream' }), true);
  for (const [name, mimeType] of [['image.png', 'image/png'], ['manual.pdf', 'application/pdf'], ['report.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']]) { let fetched = false; const value = { originalUrl: '/original' }; assert.equal(await loadKnowledgeTextPreview(value, { name, mimeType }, () => { fetched = true; }), value); assert.equal(fetched, false); }
});

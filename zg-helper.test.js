import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {randomUUID, randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {runZgHelper} from './zg-helper.js';
import {zgDigest} from './zg-runtime.js';
const libraryRoot = fileURLToPath(new URL('./.build/zg-test-library-' + process.pid + '-' + randomUUID(), import.meta.url));
const modelLibraryRoot = path.join(libraryRoot, 'explicit-model-tests');
const modelTests = process.env.DSH_MODEL_TESTS === '1';
const modelSkip = modelTests ? false : 'Set DSH_MODEL_TESTS=1 to prepare the real 16M model and run vector/semantic integration tests; may download the pinned model.';
let nativeInitialization, modelInitialization;
const identity = {knowledgeId: 'k-zg-real-' + process.pid, sourceVersion: 1};
const files = [
  {documentId: 'd-auth', path: 'guide.md', text: '# Authentication\n\nThe designer login verifies user credentials and refreshes the session token.\nUse a login form with password reset.\n'},
  {documentId: 'd-colors', path: 'guide.md', text: '# Color palette\n\nThe brand uses orange, violet and emerald swatches for accessible charts.\n'},
  {documentId: 'd-code', path: 'tokens.js', text: 'export function refreshSessionToken(user) {\n  return user.authenticationToken;\n}\n'},
];
async function snapshot(root) {
  const result = {};
  async function walk(current) { for (const entry of await fs.readdir(current, {withFileTypes: true})) { const target = path.join(current, entry.name), stat = await fs.lstat(target, {bigint: true}); if (entry.isDirectory()) await walk(target); else result[path.relative(root, target)] = {hash: zgDigest(await fs.readFile(target)), bytes: Number(stat.size), mtimeNs: String(stat.mtimeNs), mode: String(stat.mode)}; } }
  await walk(root); return result;
}
async function initialized() {
  // Model-free native FTS remains in the default suite and needs no network/cache.
  return nativeInitialization ||= (async()=>{
    await fs.mkdir(libraryRoot, {recursive: true});
    const status = await runZgHelper({operation: 'status', libraryRoot}); assert.equal(status.available, true);
    const indexed = await runZgHelper({operation: 'index', libraryRoot, ...identity, mode: 'bm25', files}, {signal: AbortSignal.timeout(30000)});
    assert.equal(indexed.backend, 'zvec-fts'); assert.equal(indexed.vectorEmbedding, false);
    return indexed;
  })();
}
async function initializedModel() {
  if(!modelTests)throw new Error('Real model preparation requires explicit DSH_MODEL_TESTS=1');
  return modelInitialization ||= (async()=>{
    await fs.mkdir(modelLibraryRoot, {recursive: true});
    const status = await runZgHelper({operation: 'status', libraryRoot:modelLibraryRoot}); assert.equal(status.available, true);
    await runZgHelper({operation: 'prepare', libraryRoot:modelLibraryRoot}, {signal: AbortSignal.timeout(120000)});
    return runZgHelper({operation: 'index', libraryRoot:modelLibraryRoot, ...identity, mode: 'hybrid', files}, {signal: AbortSignal.timeout(120000)});
  })();
}
function childRequest(input, args = [], nativeProfile) {
  return new Promise((resolve, reject) => {
    const command = nativeProfile ? '/usr/bin/sandbox-exec' : process.execPath;
    const argv = [...(nativeProfile ? ['-p', nativeProfile, process.execPath] : []), ...args, fileURLToPath(new URL('./zg-helper.js', import.meta.url))];
    const child = spawn(command, argv, {env: {...process.env, PATH: ''}, stdio: ['pipe', 'pipe', 'pipe']});
    const out = [], err = []; child.stdout.on('data', bytes => out.push(bytes)); child.stderr.on('data', bytes => err.push(bytes)); child.once('error', reject);
    child.once('close', exitCode => { const lines = Buffer.concat(out).toString().trim().split('\n').filter(Boolean); let receipt; try { receipt = JSON.parse(lines.at(-1)); } catch { reject(new Error('Invalid helper receipt: ' + Buffer.concat(err).toString().slice(0, 500))); return; } resolve({exitCode, receipt, stderr: Buffer.concat(err).toString()}); }); child.stdin.end(JSON.stringify(input));
  });
}

test('official zg indexes real text with static local 16M model and retrieves BM25/semantic/hybrid', {timeout: 180000, skip:modelSkip}, async () => {
  const libraryRoot=modelLibraryRoot;
  const indexed = await initializedModel();
  assert.equal(indexed.engine, 'zg'); assert.equal(indexed.state, 'ready'); assert.ok(indexed.entities > 0); assert.equal(indexed.indexedFiles, 3);
  const indexRoot = path.join(libraryRoot, 'knowledge', identity.knowledgeId, 'indexes');
  const before = await snapshot(indexRoot);
  for (const [mode, query] of [['bm25', 'authentication'], ['semantic', 'login user session authentication'], ['hybrid', 'refresh authentication token']]) {
    const found = await runZgHelper({operation: 'search', libraryRoot, ...identity, mode, query, limit: 10});
    assert.equal(found.engine, 'zg'); assert.equal(found.sourceVersion, 1); assert.equal(found.readonly, true); assert.ok(found.results.length > 0, mode);
    assert.ok(found.results.some(hit => ['d-auth', 'd-code'].includes(hit.documentId)), mode);
    for (const hit of found.results) { assert.ok(hit.startLine >= 1); assert.ok(hit.endLine >= hit.startLine); assert.ok(files.some(file => file.documentId === hit.documentId && file.path === hit.path)); }
  }
  const after = await snapshot(indexRoot);
  assert.deepEqual(Object.keys(after).filter(file => JSON.stringify(after[file]) !== JSON.stringify(before[file])), [], 'all index hashes and mtimes remain unchanged across query modes');
});

test('readonly Node permission query uses official native FTS index without lock, model or download writes', {timeout: 30000}, async () => {
  await initialized();
  const before = await snapshot(path.join(libraryRoot, 'knowledge', identity.knowledgeId, 'indexes'));
  const result = await childRequest({operation: 'search', libraryRoot, ...identity, mode: 'bm25', query: 'authentication', limit: 10}, ['--permission', '--allow-fs-read=*', '--allow-addons']);
  assert.equal(result.exitCode, 0, result.stderr); assert.equal(result.receipt.ok, true, JSON.stringify(result.receipt)); assert.ok(result.receipt.result.results.length > 0);
  assert.deepEqual(await snapshot(path.join(libraryRoot, 'knowledge', identity.knowledgeId, 'indexes')), before);
});

test('vector-index scratch denial fails closed instead of widening read-only policy', {timeout:180000,skip:modelSkip}, async () => {
  await initializedModel();
  const libraryRoot=modelLibraryRoot;
  const result = await childRequest({operation: 'search', libraryRoot, ...identity, mode: 'bm25', query: 'authentication'}, ['--permission', '--allow-fs-read=*', '--allow-addons']);
  assert.equal(result.receipt.ok, false); assert.equal(result.receipt.error.code, 'ZG_READONLY_SCRATCH_UNAVAILABLE');
  const status = await childRequest({operation: 'status', libraryRoot}, ['--permission', '--allow-fs-read=*', '--allow-addons']);
  assert.equal(status.receipt.result.queryReadonlyScratch, true); assert.equal(status.receipt.result.queryRequiresScratch, false); assert.equal(status.receipt.result.queryIsolation, 'read-only-index');
  assert.equal(status.receipt.result.indexRequiresModel, false); assert.equal(status.receipt.result.readonlyScratchError, undefined);
  assert.doesNotMatch(JSON.stringify(status.receipt.result), /\/var\/|\/private\/|\/Users\/|\/tmp\//);
});

async function machineCache(root=libraryRoot) {
  const cacheId = randomUUID(), directory = path.join(root, 'projects', 'p-cache', '.workbench', 'zg-query-cache', cacheId), token = randomBytes(32).toString('hex');
  await fs.mkdir(directory, {recursive: true, mode: 0o700});
  await fs.writeFile(path.join(directory, 'owner.json'), JSON.stringify({kind: 'dsh-zg-workspace-cache', cacheId, token, libraryHash: zgDigest(root)}), {flag: 'wx', mode: 0o600});
  return {kind: 'workspace-cache', directory, token};
}

test('official native query writes only to an existing-grant machine cache and preserves original files', async () => {
  await initialized();
  const before = await snapshot(path.join(libraryRoot, 'knowledge', identity.knowledgeId, 'indexes'));
  const scratch = await machineCache();
  const result = await childRequest({operation: 'search', libraryRoot, ...identity, mode: 'bm25', query: 'authentication', scratch}, ['--permission', '--allow-fs-read=*', '--allow-addons', '--allow-fs-write=' + scratch.directory]);
  assert.equal(result.exitCode, 0, JSON.stringify(result.receipt)); assert.equal(result.receipt.result.queryIsolation, 'workspace-cache'); assert.equal(result.receipt.result.nativeQueryMode, 'workspace-write'); assert.ok(result.receipt.result.results.length > 0);
  assert.deepEqual(await snapshot(path.join(libraryRoot, 'knowledge', identity.knowledgeId, 'indexes')), before);
  await assert.rejects(fs.stat(scratch.directory), {code: 'ENOENT'});
  const probe = await machineCache(); const status = await runZgHelper({operation: 'status', libraryRoot, scratch: probe});
  assert.equal(status.queryReadonlyScratch, true); assert.equal(status.queryIsolation, 'workspace-cache'); assert.equal(status.nativeQueryMode, 'workspace-write');
  await assert.rejects(fs.stat(probe.directory), {code: 'ENOENT'});
});

test('native health fixture is constant and readonly probe neither changes nor deletes its cache', async () => {
  const scratch = await machineCache();
  const built = await runZgHelper({operation: 'probe.build', libraryRoot, scratch, files: [{path: '/outside', text: 'untrusted'}], query: 'untrusted'});
  assert.equal(built.built, true); assert.equal(built.vectorEmbedding, false);
  const before = await snapshot(scratch.directory);
  const queried = await childRequest({operation: 'probe.query', libraryRoot, scratch, files: [], query: 'untrusted'}, ['--permission', '--allow-fs-read=*', '--allow-addons']);
  assert.equal(queried.exitCode, 0, JSON.stringify(queried.receipt)); assert.equal(queried.receipt.result.queried, true); assert.equal(queried.receipt.result.nativeQueryMode, 'read-only');
  assert.deepEqual(await snapshot(scratch.directory), before);
  await runZgHelper({operation: 'cleanup', libraryRoot, scratch}); await assert.rejects(fs.stat(scratch.directory), {code: 'ENOENT'});
});

test('machine cache forgery and unexpected ownership cannot delete original data', async () => {
  await initialized();
  const scratch = await machineCache(), marker = await fs.readFile(path.join(scratch.directory, 'owner.json'));
  await assert.rejects(runZgHelper({operation: 'cleanup', libraryRoot, scratch: {...scratch, token: '0'.repeat(64)}}), {code: 'ZG_UNSAFE_QUERY_CACHE'});
  assert.deepEqual(await fs.readFile(path.join(scratch.directory, 'owner.json')), marker);
  await assert.rejects(runZgHelper({operation: 'search', libraryRoot, ...identity, query: 'authentication', scratch: {...scratch, directory: libraryRoot}}), {code: 'ZG_UNSAFE_QUERY_CACHE'});
  await runZgHelper({operation: 'cleanup', libraryRoot, scratch});
  await assert.rejects(fs.stat(scratch.directory), {code: 'ENOENT'});
});

test('real semantic helper cancellation cleans private native-temp and machine-cache snapshots and workers', {timeout: 180000, skip:modelSkip}, async () => {
  await initializedModel();
  const libraryRoot=modelLibraryRoot;
  for (const scratch of [undefined, await machineCache(libraryRoot)]) {
    const child = spawn(process.execPath, [fileURLToPath(new URL('./zg-helper.js', import.meta.url))], {env: {...process.env, PATH: ''}, stdio: ['pipe', 'pipe', 'pipe']});
    let output = '', cancelled = false; child.stderr.resume();
    child.stdout.on('data', bytes => { output += bytes.toString(); if (!cancelled && output.includes('querying')) { cancelled = true; child.kill('SIGTERM'); } });
    const closed = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({code, signal})); });
    child.stdin.end(JSON.stringify({operation: 'search', libraryRoot, ...identity, mode: 'semantic', query: 'authentication login', limit: 10, scratch}));
    const result = await closed; assert.equal(cancelled, true); assert.ok(result.code === 143 || result.signal === 'SIGTERM');
    const temporary = await fs.realpath(os.tmpdir()); assert.deepEqual((await fs.readdir(temporary)).filter(name => name.startsWith(`dsh-zg-query-${child.pid}-`)), []);
    if (scratch) await assert.rejects(fs.stat(scratch.directory), {code: 'ENOENT'});
  }
});

test('immutable index versions reject replacement; future source versions are not searched', async () => {
  await initialized();
  await assert.rejects(runZgHelper({operation: 'index', libraryRoot, ...identity, files: [{...files[0], text: 'Changed same source version'}]}), {code: 'ZG_VERSION_CONFLICT'});
  await assert.rejects(runZgHelper({operation: 'search', libraryRoot, ...identity, sourceVersion: 2, mode: 'bm25', query: 'authentication'}), {code: 'ZG_INDEX_NOT_READY'});
  const again = await runZgHelper({operation: 'index', libraryRoot, ...identity, files}); assert.equal(again.state, 'ready');
});

test('runtime status on a new library is accurate without creating the library', async () => {
  const missing = path.join(libraryRoot, 'not-created-' + process.pid);
  const status = await runZgHelper({operation: 'status', libraryRoot: missing});
  assert.equal(status.available, true); assert.equal(status.model.state, 'missing'); assert.equal(status.queryReadonlyScratch, true);
  await assert.rejects(fs.stat(missing), {code: 'ENOENT'});
});

test('missing model cannot trigger implicit prepare and unsafe file paths never reach official SDK', async () => {
  const root = path.join(libraryRoot, 'no-model'); await fs.mkdir(root, {recursive: true});
  await assert.rejects(runZgHelper({operation: 'index', libraryRoot: root, knowledgeId: 'k-new', sourceVersion: 1, mode: 'hybrid', files}), {code: 'ZG_MODEL_NOT_READY'});
  assert.equal((await runZgHelper({operation: 'status', libraryRoot: root})).model.state, 'missing');
  for (const bad of ['../outside.md', '.env', '.git/config', '/absolute.md']) await assert.rejects(runZgHelper({operation: 'index', libraryRoot, knowledgeId: 'k-new', sourceVersion: 1, files: [{path: bad, text: 'Sensitive content'}]}), {code: 'ZG_UNSAFE_PATH'});
});

test('native macOS sandbox protects original index writes during official queries', {timeout: 30000}, async t => {
  if (process.platform !== 'darwin') { t.skip('macOS native policy fixture'); return; }
  await initialized();
  const indexRoot = path.join(libraryRoot, 'knowledge', identity.knowledgeId, 'indexes');
  const before = await snapshot(indexRoot);
  const profile = `(version 1)(allow default)(deny file-write* (subpath ${JSON.stringify(indexRoot)}))`;
  let result;
  try { result = await childRequest({operation: 'search', libraryRoot, ...identity, mode: 'bm25', query: 'authentication', limit: 10}, [], profile); }
  catch (error) { if (error.message.includes('sandbox_apply: Operation not permitted')) { t.skip('Current harness disallows nested sandbox-exec; verify through native ctx.shell after installation'); return; } throw error; }
  assert.equal(result.exitCode, 0, result.stderr + JSON.stringify(result.receipt));
  assert.equal(result.receipt.ok, true); assert.ok(result.receipt.result.results.length > 0);
  assert.deepEqual(await snapshot(indexRoot), before);
});

test('default indexing and read-only FTS need no model cache, downloads or scratch writes', async () => {
  const root = path.join(libraryRoot, 'no-model-fts-' + randomUUID()); await fs.mkdir(root, {recursive: true});
  const identity = {knowledgeId: 'k-default', sourceVersion: 1};
  const ready = await runZgHelper({operation: 'index', libraryRoot: root, ...identity, files});
  assert.equal(ready.mode, 'bm25'); assert.equal(ready.backend, 'zvec-fts'); assert.deepEqual(ready.modes, ['bm25']); assert.equal(ready.vectorEmbedding, false); assert.equal(ready.indexRequiresModel, false);
  const before = await snapshot(root);
  const result = await childRequest({operation: 'search', libraryRoot: root, ...identity, query: 'authentication'}, ['--permission', '--allow-fs-read=*', '--allow-addons']);
  assert.equal(result.exitCode, 0, JSON.stringify(result.receipt)); assert.equal(result.receipt.result.backend, 'zvec-fts'); assert.equal(result.receipt.result.queryIsolation, 'read-only-index'); assert.ok(result.receipt.result.results.length > 0);
  for (const mode of ['semantic', 'hybrid']) await assert.rejects(runZgHelper({operation: 'search', libraryRoot: root, ...identity, query: 'authentication', mode}), {code: 'ZG_MODE_UNAVAILABLE'});
  assert.deepEqual(await snapshot(root), before, 'all source, manifest and native storage SHA/mtimeNs/mode remain unchanged');
  await assert.rejects(fs.stat(path.join(root, '.workbench')), {code: 'ENOENT'});
  const status = await runZgHelper({operation: 'status', libraryRoot: root}); assert.equal(status.model.state, 'missing'); assert.equal(status.model.required, false); assert.equal(status.available, true); assert.equal(status.indexRequiresModel, false);
});

test('projection symlinks and content changes invalidate cached hits instead of reading another file', async () => {
  await initialized();
  const pointer = JSON.parse(await fs.readFile(path.join(libraryRoot, 'knowledge', identity.knowledgeId, 'indexes', 'v-1.json'), 'utf8'));
  const corpus = path.join(libraryRoot, 'knowledge', identity.knowledgeId, 'indexes', pointer.indexId, 'corpus');
  const target = path.join(corpus, 'documents', 'd-colors', 'guide.md.txt'), original = await fs.readFile(target);
  await fs.writeFile(target, 'Tampered projection');
  await assert.rejects(runZgHelper({operation: 'search', libraryRoot, ...identity, query: 'orange'}), {code: 'ZG_SOURCE_CHANGED'});
  await fs.writeFile(target, original);
  const external = path.join(libraryRoot, 'not-admitted.md'); await fs.writeFile(external, 'Sensitive non-admitted data');
  // Verify this exact controlled projection path before replacing it for the attack fixture.
  assert.ok(path.resolve(target).startsWith(path.resolve(corpus) + path.sep)); await fs.unlink(target); await fs.symlink(external, target);
  await assert.rejects(runZgHelper({operation: 'search', libraryRoot, ...identity, query: 'Sensitive'}), {code: 'ZG_UNSAFE_PATH'});
  assert.ok(path.resolve(target).startsWith(path.resolve(corpus) + path.sep)); await fs.unlink(target); await fs.writeFile(target, original);
});

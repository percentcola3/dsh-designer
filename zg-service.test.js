import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {randomUUID} from 'node:crypto';
import {ZgService, ZG_HELPER_COMMAND} from './zg-service.js';
const root = '/workspace/DesignerLibrary', policy = {mode: 'workspace-write', workspaceRoot: '/workspace'};
const user = {user: true, policy};
const payload = {knowledgeId: 'k-test', sourceVersion: 1, query: 'auth', mode: 'bm25', limit: 10};
function fixture({run, alias = false} = {}) {
  const calls = [], handles = [], writes = [];
  const provider = {async resolve(value) { return {path: alias && String(value).includes('/indexes') ? '/outside/aliased-index' : path.resolve(value)}; }, processPath: target => target.path, contains: (base, target) => target.path === base.path || target.path.startsWith(base.path + '/'), async stat() { return {type: 'directory'}; }, async writeText(target, content, intent, signal, policy) { signal?.throwIfAborted(); writes.push({target, content: JSON.parse(content), intent, policy}); return {version: '1'}; }};
  const shell = {resolve(spec) { calls.push(spec); return spec; }, async execute(spec) {
    if (run) { const handle = await run(spec); handles.push(handle); return handle; }
    const request = JSON.parse(spec.stdin), result = request.operation === 'status' ? {engine: 'zg', available: true, model: {state: 'ready'}} : {engine: 'zg', sourceVersion: 1, results: [], readonly: true};
    const handle = {result: async () => ({exitCode: 0, stdout: {text: JSON.stringify({ok: true, result})}, stderr: {text: ''}})}; handles.push(handle); return handle;
  }};
  return {service: new ZgService({ctx: {fs: provider, shell}, store: {root, projectPhysicalRoot: async projectId => root + '/projects/' + projectId}, policy: () => policy}, {platform: 'linux', environment: {}}), calls, handles, writes};
}

test('managed query has a fixed command, JSON stdin and a narrowed read-only policy', async () => {
  const {service, calls} = fixture(); const query = "authentication'; touch /tmp/NEVER; $(id)";
  await service.search({...payload, query, libraryRoot: '/attacker', autoUpdate: true}, {policy});
  const spec = calls[0], input = JSON.parse(spec.stdin);
  assert.equal(spec.command, ZG_HELPER_COMMAND); assert.equal(spec.command.includes(query), false);
  assert.equal(input.query, query); assert.equal(input.libraryRoot, root); assert.equal(input.autoUpdate, undefined);
  assert.deepEqual(spec.sandboxPolicy, {mode: 'read-only', workspaceRoot: root + '/knowledge/k-test/indexes', additionalWritableRoots: []});
  assert.equal(spec.onExpiry, 'kill'); assert.equal(spec.timeoutMs, 30000);
});

test('existing native write grants authorize only one exclusive machine-cache directory', async () => {
  const {service, calls, writes} = fixture();
  const projectRoot = root + '/projects/p-one', task = {id: 'task-one', projectId: 'p-one', scope: 'design'}, candidate = {mode: 'workspace-write', workspaceRoot: projectRoot};
  await service.search({...payload, scratch: {directory: '/outside/fake'}}, {agent: {id: 'agent'}, task, policy: {...candidate, mode: 'read-only'}, nativePolicy: policy, queryNativeScope: {taskId: task.id, projectId: task.projectId, scope: task.scope, nativePolicy: candidate, projectRoot}});
  assert.equal(writes.length, 1); assert.equal(writes[0].intent.kind, 'createIfAbsent');
  const request = JSON.parse(calls[0].stdin), directory = request.scratch.directory;
  assert.ok(directory.startsWith(projectRoot + '/.workbench/zg-query-cache/')); assert.notEqual(directory, '/outside/fake');
  assert.equal(calls[0].sandboxPolicy.mode, 'workspace-write'); assert.equal(calls[0].sandboxPolicy.workspaceRoot, directory); assert.deepEqual(calls[0].sandboxPolicy.additionalWritableRoots, []);
  assert.equal(writes[0].policy.workspaceRoot, directory); assert.ok(!path.relative(directory, root + '/knowledge/k-test').startsWith('knowledge'));
  assert.match(request.scratch.token, /^[a-f0-9]{64}$/);
});

test('read tasks, revoked native grants, missing proof and mismatched project never receive cache writes', async () => {
  const projectRoot = root + '/projects/p-one', task = {id: 'task-one', projectId: 'p-one', scope: 'design'}, candidate = {mode: 'workspace-write', workspaceRoot: projectRoot};
  const valid = {agent: {id: 'agent'}, task, policy: {...candidate, mode: 'read-only'}, nativePolicy: policy, queryNativeScope: {taskId: task.id, projectId: task.projectId, scope: task.scope, nativePolicy: candidate, projectRoot}};
  const cases = [
    {...valid, nativePolicy: {...policy, mode: 'read-only'}},
    {...valid, queryNativeScope: undefined},
    {...valid, queryNativeScope: {...valid.queryNativeScope, nativePolicy: {...candidate, mode: 'read-only'}}},
    {...valid, task: {...task, scope: 'read'}, queryNativeScope: {...valid.queryNativeScope, scope: 'read'}},
    {...valid, queryNativeScope: {...valid.queryNativeScope, taskId: 'forged'}},
    {...valid, queryNativeScope: {...valid.queryNativeScope, projectRoot: root + '/projects/p-other'}},
    {...valid, nativePolicy: {...policy, workspaceRoot: '/outside'}},
    {user: false, policy, nativePolicy: policy}
  ];
  for (const env of cases) { const {service, calls, writes} = fixture(); await service.search(payload, env); assert.equal(writes.length, 0); assert.equal(calls[0].sandboxPolicy.mode, 'read-only'); assert.equal(JSON.parse(calls[0].stdin).scratch, undefined); }
});

test('owner UI and metadata-only status use explicit live grants without inheriting owner defaults', async () => {
  for (const [operation, env] of [['search', {...user, policy: {...policy, mode: 'read-only'}, nativePolicy: policy}], ['status', {user: false, policy: {...policy, mode: 'read-only'}, nativePolicy: policy}]]) {
    const {service, calls, writes} = fixture(); await (operation === 'search' ? service.search(payload, env) : service.runtimeStatus(env));
    assert.equal(writes.length, 1); assert.equal(calls[0].sandboxPolicy.mode, 'workspace-write');
  }
  const {service, calls, writes} = fixture(); await service.search(payload, {user: true, policy: {...policy, mode: 'read-only'}});
  assert.equal(writes.length, 0); assert.equal(calls[0].sandboxPolicy.mode, 'read-only');
});

test('native health check uses separate fixed build and full readonly shells within the same existing cache grant', async () => {
  const {service, calls, writes} = fixture({run: async (spec, request = JSON.parse(spec.stdin)) => ({result: async () => ({exitCode: 0, sandbox: {mode: spec.sandboxPolicy.mode, enforcement: 'full', denied: false}, stdout: {text: JSON.stringify({ok: true, result: request.operation === 'probe.build' ? {built: true} : request.operation === 'probe.query' ? {queried: true, readonly: true} : {cleaned: true}})}})})});
  const result = await service.nativeReadonlyProbe({...user, nativePolicy: policy});
  assert.equal(result.available, true); assert.equal(result.readOnlyEnforced, true); assert.equal(result.cleanupSucceeded, true);
  assert.deepEqual(calls.map(spec => JSON.parse(spec.stdin).operation), ['probe.build', 'probe.query', 'cleanup']);
  assert.equal(writes.length, 1); const directory = calls[0].sandboxPolicy.workspaceRoot;
  assert.deepEqual(calls.map(spec => spec.sandboxPolicy.mode), ['workspace-write', 'read-only', 'workspace-write']);
  for (const spec of calls) { assert.equal(spec.command, ZG_HELPER_COMMAND); assert.equal(spec.sandboxPolicy.workspaceRoot, directory); assert.deepEqual(spec.sandboxPolicy.additionalWritableRoots, []); const request = JSON.parse(spec.stdin); assert.equal(request.files, undefined); assert.equal(request.query, undefined); }
  assert.doesNotMatch(JSON.stringify(result), /\/workspace\/|probe\.txt|authentication|[a-f0-9]{64}/i);
});

test('native health check never creates a fixture without an explicit existing write grant', async () => {
  for (const env of [{...user}, {...user, nativePolicy: {...policy, mode: 'read-only'}}]) { const {service, calls, writes} = fixture(); const result = await service.nativeReadonlyProbe(env); assert.equal(result.ran, false); assert.equal(result.available, false); assert.equal(calls.length, 0); assert.equal(writes.length, 0); }
  const {service} = fixture({run: async (spec, request = JSON.parse(spec.stdin)) => ({result: async () => ({exitCode: 0, sandbox: {mode: spec.sandboxPolicy.mode, enforcement: 'partial'}, stdout: {text: JSON.stringify({ok: true, result: request.operation === 'probe.build' ? {built: true} : {queried: true, readonly: true}})}})})});
  const partial = await service.nativeReadonlyProbe({...user, nativePolicy: policy}); assert.equal(partial.querySucceeded, true); assert.equal(partial.readOnlyEnforced, false); assert.equal(partial.available, false);
});

test('model preparation and corpus indexing are owner-only and honor read-only policy', async () => {
  const {service, calls} = fixture();
  const input = {...payload, files: [{documentId: 'd-one', path: 'guide.md', text: '# Guide\nauth'}]};
  for (const env of [{policy}, {user: true, agent: {id: 'model'}, policy}]) {
    await assert.rejects(service.index(input, env), {code: 'USER_ONLY'});
    await assert.rejects(service.setup({}, env), {code: 'USER_ONLY'});
  }
  await assert.rejects(service.setup({}, {...user, policy: {...policy, mode: 'read-only'}}), {code: 'FS_SANDBOX_DENIED'});
  await assert.rejects(service.index(input, {...user, policy: {...policy, mode: 'read-only'}}), {code: 'FS_SANDBOX_DENIED'});
  assert.equal(calls.length, 0);
  await service.index(input, user); const spec = calls[0], data = JSON.parse(spec.stdin);
  assert.equal(spec.sandboxPolicy.workspaceRoot, root + '/knowledge/k-test/indexes'); assert.equal(spec.sandboxPolicy.mode, 'workspace-write');
  assert.equal(data.files[0].documentId, 'd-one'); assert.equal(data.files[0].corpusPath, 'documents/d-one/guide.md.txt');
});

test('canonical aliasing and payload validation fail before creating a helper', async () => {
  const aliased = fixture({alias: true}); await assert.rejects(aliased.service.search(payload, {policy}), {code: 'ZG_UNSAFE_PATH'}); assert.equal(aliased.calls.length, 0);
  const {service, calls} = fixture();
  for (const bad of [{...payload, knowledgeId: '../outside'}, {...payload, sourceVersion: 0}, {...payload, limit: 100}, {...payload, mode: 'remote'}, {...payload, query: ''}]) await assert.rejects(service.search(bad, {policy}));
  assert.equal(calls.length, 0);
});

test('setup status polls sanitized progress and cancel actually kills and awaits managed helper', async () => {
  const stopped = Promise.withResolvers(); let killed = false;
  const {service} = fixture({run: async spec => {
    const request = JSON.parse(spec.stdin);
    if (request.operation === 'status') return {result: async () => ({exitCode: 0, stdout: {text: JSON.stringify({ok: true, result: {available: true, model: {state: 'missing'}}})}})};
    const events = new EventEmitter();
    return {events, observed: {stdout: {readFrom() { return {text: JSON.stringify({type: 'progress', progress: {stage: 'downloading', downloadedBytes: 8192, detail: 'sensitive filesystem path'}}) + '\n', nextOffset: 1}; }}}, kill() { killed = true; stopped.resolve({exitCode: 1, aborted: true}); }, result: () => stopped.promise};
  }});
  const started = await service.setup({}, user); assert.equal(started.state, 'running');
  const status = await service.runtimeStatus(user); assert.equal(status.model.state, 'preparing'); assert.equal(status.setup.progress.downloadedBytes, 8192); assert.equal(status.setup.progress.detail, undefined);
  assert.equal((await service.setup({}, user)).jobId, started.jobId);
  const cancelled = await service.cancel({jobId: started.jobId}, user); assert.equal(cancelled.state, 'cancelled'); assert.equal(killed, true); assert.equal(service.pending.size, 0);
  await assert.rejects(service.cancel({jobId: 'forged'}, user), {code: 'ZG_JOB_NOT_FOUND'});
});

test('helper failures are bounded and never expose arbitrary native diagnostics', async () => {
  for (const [receipt, expected] of [[{exitCode: 1, stdout: {text: ''}, stderr: {text: 'sensitive original query secret'}}, 'ZG_PROCESS_FAILED'], [{exitCode: 0, stdout: {text: 'x', truncated: true}}, 'ZG_OUTPUT_LIMIT'], [{exitCode: 1, timedOut: true}, 'ZG_TIMEOUT'], [{exitCode: 1, sandbox: {denied: true}}, 'FS_SANDBOX_DENIED']]) {
    const {service} = fixture({run: async () => ({result: async () => receipt})});
    await assert.rejects(service.search(payload, {policy}), error => { assert.equal(error.code, expected); assert.doesNotMatch(error.message, /sensitive|secret|original query/); return true; });
  }
});

test('dispose aborts outstanding helpers and waits for their process receipts', async () => {
  const stopping = Promise.withResolvers(), started = Promise.withResolvers(); let killed = false;
  const {service} = fixture({run: async () => { started.resolve(); return {kill() { killed = true; stopping.resolve({exitCode: 1, aborted: true}); }, result: () => stopping.promise}; }});
  const query = service.search(payload, {policy}); const rejected = assert.rejects(query, {code: 'ZG_ABORTED'});
  await started.promise; await service.dispose(); await rejected; assert.equal(killed, true); assert.equal(service.pending.size, 0);
});

test('production ZgService indexes and searches official FTS without a model or preparation', {timeout: 30000}, async () => {
  const libraryRoot = fileURLToPath(new URL('./.build/zg-service-no-model-' + randomUUID(), import.meta.url)); await fs.mkdir(libraryRoot, {recursive: true});
  const requests = [];
  const provider = {async resolve(value) { return {path: path.resolve(value)}; }, processPath: value => value.path, contains: (base, target) => target.path === base.path || target.path.startsWith(base.path + '/'), async stat(target) { try { const stat = await fs.stat(target.path); return {type: stat.isDirectory() ? 'directory' : 'file'}; } catch { return null; } }, async writeText(target, content, intent) { assert.equal(intent.kind, 'createIfAbsent'); await fs.mkdir(path.dirname(target.path), {recursive: true, mode: 0o700}); await fs.writeFile(target.path, content, {flag: 'wx', mode: 0o600}); return {version: '1'}; }};
  const shell = {resolve(spec) { requests.push(spec); return spec; }, async execute(spec) {
    const result = new Promise((resolve, reject) => {
      const child = spawn('/bin/sh', ['-c', spec.command], {cwd: spec.workdir, env: {...process.env, PATH: ''}, stdio: ['pipe', 'pipe', 'pipe']}); const out = [], err = [];
      const abort = () => child.kill('SIGKILL'); spec.signal?.addEventListener('abort', abort, {once: true});
      child.stdout.on('data', value => out.push(value)); child.stderr.on('data', value => err.push(value)); child.once('error', reject);
      child.once('close', exitCode => { spec.signal?.removeEventListener('abort', abort); resolve({exitCode, aborted: !!spec.signal?.aborted, stdout: {text: Buffer.concat(out).toString()}, stderr: {text: Buffer.concat(err).toString()}}); }); child.stdin.end(spec.stdin);
    }); return {result: () => result};
  }};
  const local = {user: true, policy: {mode: 'workspace-write', workspaceRoot: libraryRoot}};
  const service = new ZgService({ctx: {fs: provider, shell}, store: {root: libraryRoot}, policy: () => local.policy});
  const state = await service.runtimeStatus(local); assert.equal(state.available, true); assert.equal(state.model.state, 'missing'); assert.equal(state.indexRequiresModel, false); assert.equal(state.defaultMode, 'bm25');
  const identity = {knowledgeId: 'k-zg-service-' + process.pid, sourceVersion: 1};
  const indexed = await service.index({...identity, files: [{documentId: 'd-shell', path: 'guide.md', text: '# Owner knowledge\nAuthentication tokens expire after logout.\n'}]}, local);
  assert.equal(indexed.mode, 'bm25'); assert.equal(indexed.backend, 'zvec-fts'); assert.equal(indexed.vectorEmbedding, false);
  await assert.rejects(fs.stat(path.join(libraryRoot, '.workbench', 'zg-runtime')), {code: 'ENOENT'});
  const found = await service.search({...identity, query: 'authentication', mode: 'bm25'}, local);
  assert.equal(found.engine, 'zg'); assert.equal(found.sourceVersion, 1); assert.ok(found.results.length > 0); assert.equal(found.results[0].documentId, 'd-shell');
  assert.equal(requests.at(-1).sandboxPolicy.mode, 'read-only');
  const original = path.join(libraryRoot, 'knowledge', identity.knowledgeId), tree = async () => {
    const entries = {};
    async function walk(directory) { for (const item of await fs.readdir(directory, {withFileTypes: true})) { const file = path.join(directory, item.name); if (item.isDirectory()) await walk(file); else { const stat = await fs.stat(file, {bigint: true}); entries[path.relative(original, file)] = {bytes: (await fs.readFile(file)).toString('base64'), mtimeNs: String(stat.mtimeNs), mode: String(stat.mode)}; } } }
    await walk(original); return entries;
  };
  const before = await tree();
  const cached = await service.search({...identity, query: 'authentication', mode: 'bm25'}, {...local, policy: {...local.policy, mode: 'read-only'}, nativePolicy: local.policy});
  assert.equal(cached.queryIsolation, 'workspace-cache'); assert.equal(cached.nativeQueryMode, 'workspace-write'); assert.ok(cached.results.length > 0);
  const cacheSpec = requests.at(-1); assert.equal(cacheSpec.sandboxPolicy.mode, 'workspace-write'); assert.deepEqual(cacheSpec.sandboxPolicy.additionalWritableRoots, []);
  assert.ok(cacheSpec.sandboxPolicy.workspaceRoot.startsWith(libraryRoot + '/.workbench/zg-query-cache/'));
  assert.deepEqual(await tree(), before); await assert.rejects(fs.stat(cacheSpec.sandboxPolicy.workspaceRoot), {code: 'ENOENT'});
  const capability = await service.runtimeStatus({...local, nativePolicy: local.policy}); assert.equal(capability.queryIsolation, 'workspace-cache'); assert.equal(capability.queryReadonlyScratch, true);
  await service.dispose();
});

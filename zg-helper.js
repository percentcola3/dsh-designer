// Native FS and the official SDK run ONLY in this fixed, managed-shell helper.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {ZG_MODEL, ZG_MODEL_REPO, ZG_MODEL_REVISION, ZG_SDK_VERSION, ZG_MAX_INPUT, ZG_MODES, ZgError, zgFail, zgDigest, zgIdentity, zgFiles, zgMode, zgRelativePath, zgProgress} from './zg-runtime.js';
import {LEXICAL_BACKEND, lexicalAvailable, indexLexical, searchLexical} from './knowledge-lexical-engine.js';
const fsp = fs.promises;
const VENDOR = new URL('./vendor/zg-core.js', import.meta.url);
const MAX_TREE = 20000;
const MODEL_MAX = 40 * 1024 * 1024;
function within(root, target) { return target === root || target.startsWith(root + path.sep); }
async function canonical(target, {missing = false} = {}) {
  const absolute = path.resolve(target); let cursor = path.parse(absolute).root;
  for (const part of absolute.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part); let stat;
    try { stat = await fsp.lstat(cursor); } catch (error) { if (missing && error.code === 'ENOENT') continue; throw error; }
    if (stat.isSymbolicLink()) zgFail('ZG_UNSAFE_PATH', 'Knowledge runtime cannot follow symbolic links');
  }
  return absolute;
}
async function treeNoLinks(root) {
  let count = 0;
  async function walk(target) {
    const stat = await fsp.lstat(target); if (stat.isSymbolicLink() || !stat.isFile() && !stat.isDirectory()) zgFail('ZG_UNSAFE_PATH', 'Index contains an unsafe filesystem entry');
    if (++count > MAX_TREE) zgFail('ZG_TOO_LARGE', 'Knowledge index contains too many filesystem entries');
    if (stat.isDirectory()) for (const entry of await fsp.readdir(target)) await walk(path.join(target, entry));
  }
  await walk(root);
}
const liveScratch = new Map();
const SCRATCH_ERRNOS = new Set(['EPERM', 'EACCES', 'EROFS', 'ENOENT', 'ENOTDIR', 'ELOOP', 'ENOSPC', 'EMFILE', 'ENFILE', 'EINVAL', 'ERR_ACCESS_DENIED', 'FS_SANDBOX_DENIED']);
function scratchDiagnostics(error, stage) {
  const temporary = os.tmpdir().replaceAll('\\', '/');
  const tempRootKind = /^(?:\/private)?\/var\/folders(?:\/|$)/.test(temporary) ? 'macos-user-temp' : /^(?:\/private)?\/tmp(?:\/|$)/.test(temporary) ? 'system-temp' : process.platform === 'win32' ? 'windows-temp' : 'os-temp';
  return {tempRootKind, readonlyScratchStage: stage, readonlyScratchErrno: SCRATCH_ERRNOS.has(error?.code) ? error.code : error?.code === 'ZG_UNSAFE_PATH' ? 'ALIAS_IDENTITY_CHANGED' : 'UNKNOWN'};
}
async function makeScratch() {
  let stage = 'resolve-temp';
  try {
    const base = await fsp.realpath(os.tmpdir());
    stage = 'create-directory'; const directory = await fsp.mkdtemp(path.join(base, `dsh-zg-query-${process.pid}-`));
    stage = 'protect-directory'; await fsp.chmod(directory, 0o700);
    stage = 'identify-directory'; const stat = await fsp.lstat(directory);
    const receipt = {directory, base, ino: stat.ino, dev: stat.dev}; liveScratch.set(directory, receipt);
    stage = 'write-marker'; await fsp.writeFile(path.join(directory, 'owner.json'), JSON.stringify({kind: 'dsh-zg-query', pid: process.pid, ino: stat.ino, dev: stat.dev}), {flag: 'wx', mode: 0o600});
    return receipt;
  } catch (error) { zgFail('ZG_READONLY_SCRATCH_UNAVAILABLE', 'The read-only native policy does not permit isolated temporary query storage', scratchDiagnostics(error, stage)); }
}
async function workspaceScratch(root, scratch, {protect = true, track = true} = {}) {
  if (scratch?.kind !== 'workspace-cache' || typeof scratch.directory !== 'string' || !path.isAbsolute(scratch.directory) || !/^[a-f0-9-]{36}$/.test(path.basename(scratch.directory)) || path.basename(path.dirname(scratch.directory)) !== 'zg-query-cache' || path.basename(path.dirname(path.dirname(scratch.directory))) !== '.workbench' || typeof scratch.token !== 'string' || !/^[a-f0-9]{64}$/.test(scratch.token)) zgFail('ZG_UNSAFE_QUERY_CACHE', 'Query cache must be an exclusively Host-created machine directory');
  const directory = await canonical(scratch.directory);
  if (directory !== scratch.directory || within(directory, root) || within(path.join(root, 'knowledge'), directory) || within(path.join(root, '.workbench', 'zg-runtime'), directory)) zgFail('ZG_UNSAFE_QUERY_CACHE', 'Query cache overlaps original knowledge storage');
  const stat = await fsp.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || process.getuid && stat.uid !== process.getuid()) zgFail('ZG_UNSAFE_QUERY_CACHE', 'Query cache ownership differs from its Host marker');
  const owner = await boundedJson(path.join(directory, 'owner.json'), 2000);
  if (owner.kind !== 'dsh-zg-workspace-cache' || owner.token !== scratch.token || owner.cacheId !== path.basename(directory) || owner.libraryHash !== zgDigest(root)) zgFail('ZG_UNSAFE_QUERY_CACHE', 'Query cache owner marker differs from its frozen request');
  if (protect) {
    const entries = await fsp.readdir(directory);
    if (entries.length !== 1 || entries[0] !== 'owner.json') zgFail('ZG_UNSAFE_QUERY_CACHE', 'A new query cache must contain only its exclusive Host marker');
    await fsp.chmod(directory, 0o700);
  }
  const receipt = {kind: 'workspace-cache', directory, base: path.dirname(directory), ino: stat.ino, dev: stat.dev, token: scratch.token};
  if (track) liveScratch.set(directory, receipt); return receipt;
}
async function removeScratch(receipt) {
  const {directory, base, ino, dev} = receipt;
  const stat = await fsp.lstat(directory);
  const named = receipt.kind === 'workspace-cache' ? /^[a-f0-9-]{36}$/.test(path.basename(directory)) && path.basename(base) === 'zg-query-cache' && path.basename(path.dirname(base)) === '.workbench' : /^dsh-zg-query-[0-9]+-[A-Za-z0-9]+$/.test(path.basename(directory));
  if (path.dirname(directory) !== base || !named || stat.isSymbolicLink() || stat.ino !== ino || stat.dev !== dev || await fsp.realpath(directory) !== directory) zgFail('ZG_UNSAFE_PATH', 'Temporary query directory identity changed before cleanup');
  if (receipt.kind === 'workspace-cache') { const owner = await boundedJson(path.join(directory, 'owner.json'), 2000); if (owner.token !== receipt.token) zgFail('ZG_UNSAFE_QUERY_CACHE', 'Query cache ownership changed before cleanup'); }
  await fsp.rm(directory, {recursive: true, force: true}); liveScratch.delete(directory);
}
function cleanupScratchSync() {
  for (const receipt of liveScratch.values()) {
    try {
      const stat = fs.lstatSync(receipt.directory);
      if (stat.isSymbolicLink() || stat.ino !== receipt.ino || stat.dev !== receipt.dev || path.dirname(receipt.directory) !== receipt.base || fs.realpathSync(receipt.directory) !== receipt.directory) continue;
      if (receipt.kind === 'workspace-cache') { const marker = path.join(receipt.directory, 'owner.json'), info = fs.lstatSync(marker); if (!info.isFile() || info.isSymbolicLink() || info.size > 2000 || JSON.parse(fs.readFileSync(marker, 'utf8')).token !== receipt.token) continue; }
      fs.rmSync(receipt.directory, {recursive: true, force: true});
    } catch {}
  }
}
process.once('exit', cleanupScratchSync);
async function staleScratchCleanup() {
  const base = await fsp.realpath(os.tmpdir());
  for (const name of (await fsp.readdir(base)).filter(name => /^dsh-zg-query-[0-9]+-[A-Za-z0-9]+$/.test(name)).slice(0, 100)) {
    const directory = path.join(base, name), stat = await fsp.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || process.getuid && stat.uid !== process.getuid()) continue;
    const pid = Number(name.split('-')[3]);
    try { process.kill(pid, 0); continue; } catch (error) { if (error.code !== 'ESRCH') continue; }
    try {
      const owner = await boundedJson(path.join(directory, 'owner.json'), 1000);
      if (owner.kind === 'dsh-zg-query' && owner.pid === pid && owner.ino === stat.ino && owner.dev === stat.dev) await removeScratch({directory, base, ino: stat.ino, dev: stat.dev});
    } catch {} // Never remove unrecognized or identity-changed temporary data.
  }
}
async function readonlyScratchProbe(root, scratch) {
  let receipt, result; const cached = scratch?.kind === 'workspace-cache';
  const failed = (error, stage) => ({queryReadonlyScratch: false, queryCacheAvailable: false, queryIsolation: 'unavailable', readonlyScratchError: 'ZG_READONLY_SCRATCH_UNAVAILABLE', ...(error.code === 'ZG_READONLY_SCRATCH_UNAVAILABLE' ? error.details : scratchDiagnostics(error, stage)), ...(cached ? {tempRootKind: 'workspace-cache'} : {})});
  try {
    receipt = cached ? await workspaceScratch(root, scratch) : await makeScratch();
    await fsp.writeFile(path.join(receipt.directory, 'probe'), 'zg', {flag: 'wx', mode: 0o600});
    result = {queryReadonlyScratch: true, queryCacheAvailable: cached, queryIsolation: cached ? 'workspace-cache' : 'native-temp', nativeQueryMode: cached ? 'workspace-write' : 'read-only', ...(!cached ? {nativeTempAvailable: true} : {})};
  }
  catch (error) { result = failed(error, 'write-probe'); }
  finally { if (receipt) { try { await removeScratch(receipt); } catch (error) { result = failed(error, 'cleanup'); } } }
  return result;
}
async function snapshotIndex(home, receipt) {
  const destination = path.join(receipt.directory, 'index'); await fsp.mkdir(destination, {mode: 0o700});
  let entries = 0, bytes = 0;
  async function copy(source, target) {
    const stat = await fsp.lstat(source); if (stat.isSymbolicLink() || !stat.isDirectory() && !stat.isFile()) zgFail('ZG_UNSAFE_PATH', 'Temporary query source contains an unsafe entry');
    if (++entries > MAX_TREE || (bytes += stat.isFile() ? stat.size : 0) > 512 * 1024 * 1024) zgFail('ZG_TOO_LARGE', 'Temporary query snapshot exceeds its bounded storage budget');
    if (stat.isDirectory()) { await fsp.mkdir(target, {recursive: true, mode: 0o700}); for (const name of await fsp.readdir(source)) await copy(path.join(source, name), path.join(target, name)); }
    else { await fsp.copyFile(source, target, fs.constants.COPYFILE_FICLONE); await fsp.chmod(target, 0o600); }
  }
  await copy(home, destination); return destination;
}
async function boundedJson(target, max = 4 * 1024 * 1024) {
  await canonical(target); const stat = await fsp.stat(target);
  if (!stat.isFile() || stat.size > max) zgFail('ZG_INVALID_INDEX', 'Knowledge runtime manifest exceeds its limit');
  return JSON.parse(await fsp.readFile(target, 'utf8'));
}
async function writeJsonNew(target, value) { await canonical(target, {missing: true}); await fsp.writeFile(target, JSON.stringify(value, null, 2), {flag: 'wx', mode: 0o600}); }
function locations(root) {
  const runtime = path.join(root, '.workbench', 'zg-runtime'), cache = path.join(runtime, 'models');
  const model = path.join(cache, 'model2vec', ZG_MODEL_REPO.replaceAll('/', '--'), ZG_MODEL_REVISION);
  return {runtime, cache, artifacts: [path.join(model, 'model.safetensors'), path.join(model, 'tokenizer', 'tokenizer.json'), path.join(model, 'tokenizer', 'tokenizer_config.json')], ready: path.join(runtime, 'model-ready.json')};
}
async function sdk() {
  try { return await import(VENDOR.href); } catch { zgFail('ZG_UNAVAILABLE', 'The bundled zg native runtime is unavailable on this platform'); }
}
async function modelReady(places) {
  try {
    const receipt = await boundedJson(places.ready, 10000);
    if (receipt.model !== ZG_MODEL || receipt.revision !== ZG_MODEL_REVISION || !Array.isArray(receipt.artifacts) || receipt.artifacts.length !== places.artifacts.length) return false;
    for (let i = 0; i < places.artifacts.length; i++) {
      const target = places.artifacts[i]; await canonical(target); const stat = await fsp.stat(target);
      if (!stat.isFile() || stat.size <= 0 || stat.size > MODEL_MAX || stat.size !== receipt.artifacts[i].bytes || zgDigest(await fsp.readFile(target)) !== receipt.artifacts[i].sha256) return false;
    }
    return true;
  } catch { return false; }
}
function network(allowDownload, signal) {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
    const allowed = ['model.safetensors', 'tokenizer.json'].map(file => `https://huggingface.co/${ZG_MODEL_REPO}/resolve/${ZG_MODEL_REVISION}/${file}`);
    if (!allowDownload || !allowed.includes(url) || init.method && init.method !== 'GET' || init.body) zgFail('ZG_NETWORK_DISABLED', 'Knowledge indexing and queries never send documents to remote services');
    const response = await original(input, {...init, signal});
    if (Number(response.headers.get('content-length')) > MODEL_MAX) { await response.body?.cancel(); zgFail('ZG_TOO_LARGE', 'Local model download exceeded its size limit'); }
    let bytes = 0;
    const body = response.body?.pipeThrough(new TransformStream({transform(chunk, controller) { bytes += chunk.byteLength; if (bytes > MODEL_MAX) throw new ZgError('ZG_TOO_LARGE', 'Local model download exceeded its size limit'); controller.enqueue(chunk); }}));
    return new Response(body, {status: response.status, statusText: response.statusText, headers: response.headers});
  };
  return () => { globalThis.fetch = original; };
}
async function localModel(core, places) { return core.createEmbeddingModel(ZG_MODEL, {modelCacheDir: places.cache, device: 'cpu'}); }
async function prepare(root, signal, emit) {
  const places = locations(root); await canonical(places.runtime, {missing: true});
  if (await modelReady(places)) return {model: ZG_MODEL, state: 'ready', downloaded: false};
  await fsp.mkdir(places.runtime, {recursive: true, mode: 0o700});
  const core = await sdk(), restore = network(true, signal), model = await localModel(core, places);
  try {
    const result = await model.embed([{kind: 'text', text: 'Designer local embedding readiness'}], {purpose: 'query', signal, onProgress: progress => emit(zgProgress(progress))});
    if (result.vectors?.length !== 1 || result.vectors[0].length !== 256 || !result.vectors[0].every(Number.isFinite)) zgFail('ZG_MODEL_INVALID', 'The official local embedding model failed its readiness check');
    const artifacts = [];
    for (const target of places.artifacts) { await canonical(target); const bytes = await fsp.readFile(target); if (!bytes.length || bytes.length > MODEL_MAX) zgFail('ZG_MODEL_INVALID', 'Local embedding artifacts are incomplete'); artifacts.push({bytes: bytes.length, sha256: zgDigest(bytes)}); }
    const receipt = {model: ZG_MODEL, revision: ZG_MODEL_REVISION, sdkVersion: ZG_SDK_VERSION, artifacts};
    // A failed prior preparation has no trusted ready receipt. Replace only this fixed file.
    await canonical(places.ready, {missing: true}); await fsp.writeFile(places.ready, JSON.stringify(receipt), {mode: 0o600});
    return {model: ZG_MODEL, state: 'ready', downloaded: true};
  } finally { restore(); await model.dispose(); }
}
async function readIndex(root, input) {
  const {knowledgeId, sourceVersion} = zgIdentity(input);
  const indexes = path.join(root, 'knowledge', knowledgeId, 'indexes');
  let pointer;
  try { pointer = await boundedJson(path.join(indexes, `v-${sourceVersion}.json`), 20000); }
  catch (error) { if (error.code === 'ENOENT') zgFail('ZG_INDEX_NOT_READY', 'Explicitly index this frozen knowledge version before searching'); throw error; }
  if (pointer.knowledgeId !== knowledgeId || pointer.sourceVersion !== sourceVersion || typeof pointer.indexId !== 'string' || !/^zg-[a-f0-9]{24}-[a-f0-9-]{36}$/.test(pointer.indexId)) zgFail('ZG_INVALID_INDEX', 'Knowledge index identity does not match this source version');
  const directory = path.join(indexes, pointer.indexId), corpus = path.join(directory, 'corpus');
  await canonical(directory); const manifest = await boundedJson(path.join(directory, 'manifest.json'));
  if (manifest.schemaVersion !== 1 || manifest.knowledgeId !== knowledgeId || manifest.sourceVersion !== sourceVersion || manifest.indexId !== pointer.indexId || manifest.digest !== pointer.digest || (manifest.backend === LEXICAL_BACKEND ? manifest.model !== null : manifest.model !== ZG_MODEL || manifest.backend && manifest.backend !== 'zvec-grep') || !Array.isArray(manifest.files) || manifest.files.length > 2000 || zgDigest(JSON.stringify(manifest.files)) !== manifest.digest || !manifest.indexId.startsWith('zg-' + manifest.digest.slice(0, 24) + '-')) zgFail('ZG_INVALID_INDEX', 'Knowledge index manifest is invalid or stale');
  const byPath = new Map();
  for (const file of manifest.files) {
    zgRelativePath(file.path); zgRelativePath(file.corpusPath);
    const expected = (file.documentId ? `documents/${file.documentId}/${file.path}` : `documents/${file.path}`) + '.txt';
    if (file.corpusPath !== expected || file.documentId !== null && !/^d-[A-Za-z0-9-]{1,80}$/.test(file.documentId) || byPath.has(file.corpusPath)) zgFail('ZG_INVALID_INDEX', 'Knowledge source mapping is invalid');
    const target = path.join(corpus, file.corpusPath); await canonical(target);
    if (!within(corpus, target)) zgFail('ZG_UNSAFE_PATH', 'Knowledge hit leaves the controlled corpus');
    const bytes = await fsp.readFile(target); if (bytes.length !== file.bytes || zgDigest(bytes) !== file.sha256) zgFail('ZG_SOURCE_CHANGED', 'Knowledge projection changed after indexing');
    byPath.set(file.corpusPath, file);
  }
  await treeNoLinks(directory);
  return {directory, corpus, manifest, byPath, pointer};
}
async function buildIndex(root, input, signal, emit) {
  const identity = zgIdentity(input), files = zgFiles(input.files), mode = zgMode(input.mode), lexical = mode === 'bm25', places = locations(root);
  if (!lexical && !await modelReady(places)) zgFail('ZG_MODEL_NOT_READY', 'A prepared embedding model is required only for an optional vector index');
  const metadata = files.map(({bytesBase64, ...file}) => file), digest = zgDigest(JSON.stringify(metadata));
  try { const existing = await readIndex(root, input); if (existing.manifest.digest !== digest) zgFail('ZG_VERSION_CONFLICT', 'This source version already refers to a different immutable corpus'); if (!lexical && existing.manifest.backend === LEXICAL_BACKEND) zgFail('ZG_MODE_UNAVAILABLE', 'This immutable source version has a full-text index without vectors'); return indexReceipt(existing.manifest); }
  catch (error) { if (error.code !== 'ZG_INDEX_NOT_READY') throw error; }
  const indexes = path.join(root, 'knowledge', identity.knowledgeId, 'indexes');
  await canonical(indexes, {missing: true}); await fsp.mkdir(indexes, {recursive: true, mode: 0o700});
  const indexId = 'zg-' + digest.slice(0, 24) + '-' + randomUUID(), directory = path.join(indexes, indexId), corpus = path.join(directory, 'corpus');
  await fsp.mkdir(corpus, {recursive: true, mode: 0o700});
  for (const file of files) { signal?.throwIfAborted(); const target = path.join(corpus, file.corpusPath); await canonical(target, {missing: true}); await fsp.mkdir(path.dirname(target), {recursive: true, mode: 0o700}); await fsp.writeFile(target, Buffer.from(file.bytesBase64, 'base64'), {flag: 'wx', mode: 0o600}); }
  const core = await sdk(), restore = network(false, signal); let result, model, engine;
  try {
    if (lexical) {
      const native = await indexLexical(core, {indexPath: path.join(directory, 'fts'), files: files.map(file => ({corpusPath: file.corpusPath, text: Buffer.from(file.bytesBase64, 'base64').toString('utf8')})), signal, emit});
      result = {filesFailed: native.filesFailed, entitiesCreated: native.entities, filesAdded: native.filesIndexed, filesModified: 0, filesUnchanged: 0};
    } else {
      model = await localModel(core, places);
      engine = await core.createZvecGrep({root: corpus, home: places.runtime, embedding: ZG_MODEL, embeddingModel: model, embeddingModelOwnership: 'borrowed', modelCacheDir: places.cache, apiKey: '', device: 'cpu'});
      result = await engine.index({root: corpus, rootPaths: [corpus], includePaths: files.map(file => file.corpusPath), maxFileSizeBytes: 1024 * 1024, follow: false, noIgnore: true, embeddingConcurrency: 1, signal, onProgress: value => emit(zgProgress(value))});
    }
  } finally { try { await engine?.close(); } finally { try { await model?.dispose(); } finally { restore(); } } }
  signal?.throwIfAborted();
  if (result.filesFailed || !result.entitiesCreated || result.filesAdded + result.filesModified + result.filesUnchanged !== files.length) zgFail('ZG_INDEX_FAILED', 'The official index did not include every supplied text projection');
  const manifest = {schemaVersion: 1, ...identity, indexId, digest, backend: lexical ? LEXICAL_BACKEND : 'zvec-grep', model: lexical ? null : ZG_MODEL, sdkVersion: ZG_SDK_VERSION, files: metadata, indexedFiles: result.filesAdded + result.filesModified + result.filesUnchanged, entities: result.entitiesCreated};
  await writeJsonNew(path.join(directory, 'manifest.json'), manifest);
  // Immutable source-version pointer: concurrent writers cannot replace a ready version.
  await writeJsonNew(path.join(indexes, `v-${identity.sourceVersion}.json`), {...identity, indexId, digest});
  return indexReceipt(manifest);
}
function indexReceipt(manifest) { const lexical = manifest.backend === LEXICAL_BACKEND; return {engine: 'zg', backend: lexical ? LEXICAL_BACKEND : 'zvec-grep', knowledgeId: manifest.knowledgeId, sourceVersion: manifest.sourceVersion, indexId: manifest.indexId, state: 'ready', indexedFiles: manifest.indexedFiles, entities: manifest.entities, mode: lexical ? 'bm25' : 'hybrid', modes: lexical ? ['bm25'] : ZG_MODES, vectorEmbedding: !lexical, indexRequiresModel: !lexical}; }
async function searchFullText(root, input, state, core, signal, emit) {
  if (zgMode(input.mode) !== 'bm25') zgFail('ZG_MODE_UNAVAILABLE', 'This full-text index has no vector embeddings; use ordinary text search');
  let scratch; const restore = network(false, signal);
  try {
    let indexPath = path.join(state.directory, 'fts');
    await canonical(indexPath);
    if (input.scratch?.kind === 'workspace-cache') { scratch = await workspaceScratch(root, input.scratch); indexPath = await snapshotIndex(indexPath, scratch); }
    emit({phase: 'querying'}); signal?.throwIfAborted();
    const found = searchLexical(core, {indexPath, query: input.query, limit: input.limit ?? 10, signal}), results = [];
    for (const hit of found) {
      if (typeof hit.corpusPath !== 'string' || !state.byPath.has(hit.corpusPath)) zgFail('ZG_UNSAFE_HIT', 'Full-text search returned a resource outside the admitted corpus');
      const source = state.byPath.get(hit.corpusPath), absolute = path.join(state.corpus, source.corpusPath); await canonical(absolute);
      const actualBytes = await fsp.readFile(absolute); if (zgDigest(actualBytes) !== source.sha256) zgFail('ZG_SOURCE_CHANGED', 'Knowledge projection changed during its query');
      const lines = actualBytes.toString('utf8').split(/\r?\n/), {startLine, endLine} = hit;
      if (!Number.isSafeInteger(startLine) || !Number.isSafeInteger(endLine) || startLine < 1 || endLine < startLine || endLine > lines.length) zgFail('ZG_UNSAFE_HIT', 'Full-text search returned an invalid source range');
      results.push({documentId: source.documentId, path: source.path, startLine, endLine, snippet: lines.slice(startLine - 1, endLine).join('\n').slice(0, 6000), score: Number.isFinite(hit.score) ? hit.score : 0, matchedBy: ['fts']});
    }
    return {engine: 'zg', backend: LEXICAL_BACKEND, ...zgIdentity(input), indexId: state.manifest.indexId, mode: 'bm25', modes: ['bm25'], vectorEmbedding: false, results, readonly: true, queryIsolation: scratch ? 'workspace-cache' : 'read-only-index', nativeQueryMode: scratch ? 'workspace-write' : 'read-only'};
  } finally { restore(); if (scratch) await removeScratch(scratch); }
}
async function search(root, input, signal, emit) {
  const mode = zgMode(input.mode), identity = zgIdentity(input), limit = input.limit ?? 10;
  if (typeof input.query !== 'string' || !input.query.trim() || input.query.length > 4000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 50) zgFail('ZG_INVALID_INPUT', 'Supply a nonempty query and result limit between 1 and 50');
  const state = await readIndex(root, input), places = locations(root), core = await sdk();
  if (state.manifest.backend === LEXICAL_BACKEND) return searchFullText(root, input, state, core, signal, emit);
  if (mode !== 'bm25' && !await modelReady(places)) zgFail('ZG_MODEL_NOT_READY', 'The prepared local embedding model is required for semantic queries');
  const restore = network(false, signal), model = mode === 'bm25' ? undefined : await localModel(core, places);
  let workspace, scratch;
  try {
    const home = path.join(state.corpus, '.zvec-grep');
    const manifest = core.readWorkspaceManifest(home);
    if (!manifest || manifest.path !== home || manifest.rootPaths.length !== 1 || manifest.rootPaths[0].absolutePath !== state.corpus || manifest.rootPaths[0].follow === true || manifest.embedding?.provider !== 'local' || manifest.embedding.model !== 'potion-code-16m-v2' || manifest.embedding.dimension !== 256 || manifest.embeddingRuntime.endpoint || manifest.embeddingRuntime.apiKey) zgFail('ZG_INVALID_INDEX', 'Official index metadata leaves its fixed local corpus or model');
    // Even native Zvec readOnly opens Proxima O_RDWR. Give that official code an
    // isolated temporary clone; the admitted library and source corpus stay read-only.
    if (input.scratch?.kind !== 'workspace-cache') await staleScratchCleanup().catch(() => {});
    scratch = input.scratch?.kind === 'workspace-cache' ? await workspaceScratch(root, input.scratch) : await makeScratch();
    const snapshotHome = await snapshotIndex(home, scratch);
    emit({phase: 'querying'}); signal?.throwIfAborted();
    workspace = new core.WorkspaceIndex({...manifest, path: snapshotHome}, {mode: 'read', embeddingModel: model});
    const routes = [...(mode !== 'semantic' ? [{mode: 'fts', query: input.query}] : []), ...(mode !== 'bm25' ? [{mode: 'vector', query: input.query}] : [])];
    signal?.throwIfAborted(); const found = await workspace.searchPlan({routes, limit}); signal?.throwIfAborted();
    const results = [];
    for (const hit of found.hits) {
      const absolute = path.resolve(hit.file.absolutePath), relative = path.relative(state.corpus, absolute).split(path.sep).join('/');
      if (!within(state.corpus, absolute) || !state.byPath.has(relative)) zgFail('ZG_UNSAFE_HIT', 'The official search returned a resource outside its admitted corpus');
      await canonical(absolute); const source = state.byPath.get(relative);
      const evidence = hit.evidence?.find(item => !item.isEntity && item.content?.kind === 'text') ?? hit.entity;
      if (evidence.content?.kind !== 'text' || evidence.range?.kind !== 'text') continue;
      const actualBytes = await fsp.readFile(absolute);
      if (zgDigest(actualBytes) !== source.sha256) zgFail('ZG_SOURCE_CHANGED', 'Knowledge projection changed during its query');
      const lines = actualBytes.toString('utf8').split(/\r?\n/), startLine = evidence.range.startLine, endLine = evidence.range.endLine;
      if (!Number.isSafeInteger(startLine) || !Number.isSafeInteger(endLine) || startLine < 1 || endLine < startLine || endLine > lines.length) zgFail('ZG_UNSAFE_HIT', 'The official search returned an invalid source range');
      results.push({documentId: source.documentId, path: source.path, startLine, endLine, snippet: lines.slice(startLine - 1, endLine).join('\n').slice(0, 6000), score: Number.isFinite(hit.score) ? hit.score : 0, matchedBy: hit.matchedBy});
    }
    return {engine: 'zg', backend: 'zvec-grep', ...identity, indexId: state.manifest.indexId, mode, modes: ZG_MODES, vectorEmbedding: mode !== 'bm25', results, readonly: true, queryIsolation: scratch.kind === 'workspace-cache' ? 'workspace-cache' : 'native-temp', nativeQueryMode: scratch.kind === 'workspace-cache' ? 'workspace-write' : 'read-only'};
  } finally { try { workspace?.close(); } finally { try { await model?.dispose(); } finally { restore(); if (scratch) await removeScratch(scratch); } } }
}
async function nativeProbe(input, signal) {
  const root = path.resolve(input.libraryRoot), build = input.operation === 'probe.build';
  // The actual library string binds the Host marker only. Probe data is always
  // fixed, synthetic and confined to the already-authorized UUID cache.
  const receipt = await workspaceScratch(root, input.scratch, {protect: build, track: false}), fixture = path.join(receipt.directory, 'probe-library');
  const identity = {knowledgeId: 'k-native-probe', sourceVersion: 1};
  try {
    if (build) {
      await fsp.mkdir(fixture, {mode: 0o700});
      await buildIndex(fixture, {...identity, mode: 'bm25', files: [{documentId: 'd-native-probe', path: 'probe.txt', text: 'Authentication uses a session token.\nThis is a constant local full-text health check.\n'}]}, signal, () => {});
      return {built: true, backend: LEXICAL_BACKEND, vectorEmbedding: false};
    }
    await canonical(fixture);
    // Deliberately omit scratch: neither marker validation nor this query can
    // chmod, create a directory, collect stale cache files, or clean on exit.
    const result = await search(fixture, {...identity, mode: 'bm25', query: 'authentication', limit: 1}, signal, () => {});
    return {queried: result.queryIsolation === 'read-only-index' && result.results.some(hit => hit.documentId === 'd-native-probe' && /authentication/i.test(hit.snippet)), readonly: result.readonly === true, nativeQueryMode: result.nativeQueryMode};
  } catch (error) {
    if (signal?.aborted) throw error;
    return {built: false, queried: false, errno: SCRATCH_ERRNOS.has(error?.code) ? error.code : 'UNKNOWN'};
  }
}
export async function runZgHelper(input, {signal, onProgress = () => {}} = {}) {
  if (!input || typeof input !== 'object' || !['status', 'prepare', 'index', 'search', 'cleanup', 'probe.build', 'probe.query'].includes(input.operation) || typeof input.libraryRoot !== 'string' || !path.isAbsolute(input.libraryRoot)) zgFail('ZG_INVALID_INPUT', 'Invalid managed zg helper request');
  if (['probe.build', 'probe.query'].includes(input.operation)) { signal?.throwIfAborted(); return nativeProbe(input, signal); }
  const root = await canonical(input.libraryRoot, {missing: input.operation === 'status' || input.operation === 'cleanup'});
  let exists = true; try { if (await fsp.realpath(root) !== root) zgFail('ZG_UNSAFE_PATH', 'Knowledge library canonical identity changed'); } catch (error) { if (['status', 'cleanup'].includes(input.operation) && error.code === 'ENOENT') exists = false; else throw error; }
  signal?.throwIfAborted();
  if (input.operation === 'cleanup') {
    try { const receipt = await workspaceScratch(root, input.scratch, {protect: false}); await removeScratch(receipt); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      let exists = true; try { await fsp.lstat(input.scratch?.directory); } catch (missing) { if (missing.code === 'ENOENT') exists = false; else throw missing; }
      if (exists) zgFail('ZG_UNSAFE_QUERY_CACHE', 'Query cache owner marker disappeared before cleanup');
    }
    return {cleaned: true};
  }
  if (input.operation === 'status') {
    let available = true; try { available = lexicalAvailable(await sdk()); } catch { available = false; }
    const prepared = exists && await modelReady(locations(root));
    const isolation = input.scratch?.kind === 'workspace-cache' ? await readonlyScratchProbe(root, input.scratch) : {queryReadonlyScratch: available, queryCacheAvailable: false, queryIsolation: available ? 'read-only-index' : 'unavailable', nativeQueryMode: 'read-only'};
    return {engine: 'zg', backend: LEXICAL_BACKEND, sdkVersion: ZG_SDK_VERSION, available, model: {id: ZG_MODEL, state: prepared ? 'ready' : 'missing', local: true, required: false}, modes: ['bm25'], optionalVectorModes: prepared ? ['semantic', 'hybrid'] : [], indexRequiresModel: false, vectorEmbedding: false, defaultMode: 'bm25', queryReadonly: true, queryRequiresScratch: false, ...isolation};
  }
  if (input.operation === 'prepare') return prepare(root, signal, onProgress);
  if (input.operation === 'index') return buildIndex(root, input, signal, onProgress);
  return search(root, input, signal, onProgress);
}
async function main() {
  const chunks = []; let size = 0;
  for await (const chunk of process.stdin) { size += chunk.length; if (size > ZG_MAX_INPUT) zgFail('ZG_TOO_LARGE', 'Knowledge helper input exceeded its size limit'); chunks.push(chunk); }
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const controller = new AbortController();
  const terminate = () => { controller.abort(); cleanupScratchSync(); process.exit(143); };
  process.once('SIGTERM', terminate); process.once('SIGINT', terminate);
  let result;
  try { result = await runZgHelper(input, {signal: controller.signal, onProgress: progress => process.stdout.write(JSON.stringify({type: 'progress', progress}) + '\n')}); }
  finally { process.off('SIGTERM', terminate); process.off('SIGINT', terminate); }
  process.stdout.write(JSON.stringify({ok: true, result}) + '\n');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    const known = {
      'ZVEC_GREP.ENGINE.MODELS.MODEL2VEC_DOWNLOAD_FAILED': ['ZG_DOWNLOAD_FAILED', 'Local model download failed; check the network or system proxy and explicitly retry preparation'],
      'ZVEC_GREP.ENGINE.CONFIG.INVALID': ['ZG_GLOBAL_CONFIG_INVALID', 'Existing zg global configuration is invalid; correct it before preparing or indexing'],
      'ZVEC_GREP.ENGINE.STORAGE.ZVEC_OPEN_FAILED': ['ZG_INDEX_OPEN_FAILED', 'The official local index storage could not be opened']
    }[error?.code];
    const code = known?.[0] || (typeof error?.code === 'string' && /^ZG_[A-Z_]+$/.test(error.code) ? error.code : error?.name === 'AbortError' ? 'ZG_ABORTED' : 'ZG_FAILED');
    process.stdout.write(JSON.stringify({ok: false, error: {code, message: known?.[1] || (error instanceof ZgError ? error.message : 'The official local zg operation failed')}}) + '\n'); process.exitCode = 1;
  });
}

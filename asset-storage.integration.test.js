import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import * as nativeFS from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { DesignerStore } from './store.js';
import { buildAssetBundle, writeAssetFiles } from './asset-archive.js';

// Native-local integration smoke only. These adapters do not exercise the actual
// DSH composed Fs provider, approval layer, or OS sandbox enforcement.
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function within(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
function fsError(code, message) { return Object.assign(new Error(message), { code }); }
function scopedPath(root, candidate) {
  assert.ok(path.isAbsolute(candidate), 'native test paths must be absolute');
  assert.ok(within(root, candidate), 'native test operation must stay in its own temporary directory');
  return candidate;
}
async function canonicalPath(candidate) {
  try { return await nativeFS.realpath(candidate); }
  catch (error) { if (error.code !== 'ENOENT') throw error; const parent = path.dirname(candidate); if (parent === candidate) throw error; return path.join(await canonicalPath(parent), path.basename(candidate)); }
}

class NativeLocalFsAdapter {
  constructor(root, expectedPolicy) { this.root = root; this.expectedPolicy = expectedPolicy; this.writes = []; }
  checked(target) { return scopedPath(this.root, target.displayPath); }
  async resolve(value, { cwd = this.root, signal } = {}) {
    signal?.throwIfAborted();
    const selected = scopedPath(this.root, path.resolve(cwd, value));
    const absolute = scopedPath(this.root, await canonicalPath(selected));
    return { targetKey:`opaque-native-smoke:${absolute}`, displayPath:absolute };
  }
  processPath(target) { return this.checked(target); }
  contains(parent, child) { return within(this.checked(parent), this.checked(child)); }
  async stat(target, signal) {
    signal?.throwIfAborted(); const absolute = this.checked(target);
    let stat; try { stat = await nativeFS.stat(absolute, { bigint:true }); } catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
    const type = stat.isFile() ? 'file' : stat.isDirectory() ? 'directory' : 'other';
    const contentHash = type === 'file' ? sha(await nativeFS.readFile(absolute)) : '';
    return { type, size:Number(stat.size), version:`${stat.dev}:${stat.ino}:${stat.mtimeNs}:${stat.size}:${contentHash}` };
  }
  async readText(target, signal) { signal?.throwIfAborted(); return new TextDecoder('utf-8', { fatal:true }).decode(await nativeFS.readFile(this.checked(target))); }
  async readBytes(target, signal, maxBytes) {
    const info = await this.stat(target, signal);
    if (!info || info.type !== 'file') throw fsError('FS_NOT_FOUND', 'Missing regular test file');
    if (info.size > maxBytes) throw fsError('FS_TOO_LARGE', 'Test read exceeds the byte bound');
    const bytes = await nativeFS.readFile(this.checked(target));
    if (bytes.length > maxBytes) throw fsError('FS_TOO_LARGE', 'Test file grew past the byte bound');
    return bytes;
  }
  async writeText(target, content, expected, signal, policy) {
    signal?.throwIfAborted(); const absolute = this.checked(target);
    assert.equal(policy, this.expectedPolicy, 'the exact current call policy object reaches text publication');
    if (policy.mode === 'read-only' || policy.mode === 'workspace-write' && !within(policy.workspaceRoot, absolute)) throw fsError('FS_SANDBOX_DENIED', 'Native smoke text policy refused the target');
    const before = await this.stat(target, signal);
    if (expected?.kind === 'createIfAbsent' && before) throw fsError('FS_ALREADY_EXISTS', 'Test document already exists');
    if (expected?.kind === 'replaceIfVersion' && before?.version !== expected.version) throw fsError('FS_STALE_VERSION', 'Test document changed');
    const beforeText = before ? await this.readText(target, signal) : null;
    await nativeFS.mkdir(scopedPath(this.root, path.dirname(absolute)), { recursive:true });
    const staged = scopedPath(this.root, `${absolute}.native-smoke-stage-${randomUUID()}`);
    await nativeFS.writeFile(staged, content, { encoding:'utf8', flag:'wx', mode:0o600 });
    try {
      signal?.throwIfAborted();
      if (expected?.kind === 'createIfAbsent') await nativeFS.link(scopedPath(this.root, staged), scopedPath(this.root, absolute));
      else {
        if (expected?.kind === 'replaceIfVersion' && (await this.stat(target, signal))?.version !== expected.version) throw fsError('FS_STALE_VERSION', 'Test document changed before publication');
        await nativeFS.rename(scopedPath(this.root, staged), scopedPath(this.root, absolute));
      }
    } finally {
      // This exact staging file was created above inside the isolated test root.
      const checked = scopedPath(this.root, path.resolve(staged));
      assert.equal(path.dirname(checked), path.dirname(absolute));
      assert.ok(path.basename(checked).startsWith(`${path.basename(absolute)}.native-smoke-stage-`));
      await nativeFS.unlink(checked).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
    this.writes.push({ absolute, expected, policy });
    return { operation:before ? 'update' : 'create', version:(await this.stat(target, signal)).version, before:beforeText, after:content };
  }
}

function nativeLocalShellAdapter(root, expectedPolicy) {
  const requests = [];
  return {
    requests,
    resolve(request) {
      assert.equal(request.sandboxPolicy, expectedPolicy, 'binary publication receives the exact current call policy object');
      scopedPath(root, request.workdir);
      requests.push(request);
      return { timeoutMs:30000, onExpiry:'kill', stdoutMaxBytes:512000, ...request };
    },
    async execute(spec) {
      assert.ok(requests.some(request => request.command === spec.command && request.stdin === spec.stdin), 'execute receives a spec produced by resolve');
      if (spec.sandboxPolicy.mode === 'read-only') throw fsError('FS_SANDBOX_DENIED', 'Native smoke shell policy is read-only');
      scopedPath(root, spec.workdir);
      spec.signal?.throwIfAborted();
      const child = spawn('bash', ['-c', spec.command], { cwd:spec.workdir, stdio:['pipe','pipe','pipe'] });
      let stdout = '', stderr = '', stdoutBytes = 0, truncated = false, timedOut = false, aborted = false;
      const result = new Promise((resolve, reject) => {
        const onAbort = () => { aborted = true; child.kill('SIGKILL'); };
        spec.signal?.addEventListener('abort', onAbort, { once:true });
        const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, spec.timeoutMs);
        child.stdout.on('data', bytes => { stdoutBytes += bytes.length; if (stdoutBytes > spec.stdoutMaxBytes) truncated = true; else stdout += bytes.toString('utf8'); });
        child.stderr.on('data', bytes => { stderr = (stderr + bytes.toString('utf8')).slice(0, spec.stdoutMaxBytes); });
        child.once('error', reject);
        child.once('close', (exitCode, signal) => {
          clearTimeout(timer); spec.signal?.removeEventListener('abort', onAbort);
          resolve({ exitCode, signal, timedOut, aborted, timeoutMs:spec.timeoutMs, stdout:{ text:stdout, truncated }, stderr:{ text:stderr, truncated:false } });
        });
        child.stdin.once('error', error => { if (error.code !== 'EPIPE') reject(error); });
        // The fixed command is separate from stdin. Paths and binary base64 never
        // become shell code, including the deliberately awkward library name.
        child.stdin.end(spec.stdin);
      });
      return { result:() => result };
    }
  };
}

test('native-local binary writer persists an archive and DesignerStore imports readable HTML', { timeout:30000 }, async t => {
  const workspace = await nativeFS.realpath(process.cwd());
  const directoryName = `.asset-storage-smoke-${randomUUID()}`;
  const selected = path.resolve(workspace, directoryName);
  assert.equal(path.dirname(selected), workspace);
  assert.match(directoryName, /^\.asset-storage-smoke-[a-f0-9-]{36}$/);
  await nativeFS.mkdir(selected, { mode:0o700 });
  const temporaryRoot = await nativeFS.realpath(selected);
  assert.equal(temporaryRoot, selected);
  try {
    const policy = { mode:'workspace-write', workspaceRoot:temporaryRoot, sessionId:`native-local-smoke-${randomUUID()}` };
    const fs = new NativeLocalFsAdapter(temporaryRoot, policy);
    const shell = nativeLocalShellAdapter(temporaryRoot, policy);
    const store = new DesignerStore({ fs, workspaceRoot:temporaryRoot, root:"Library with spaces ' $() fixtures", policy:() => policy });
    const project = await store.projectCreate({ name:'Isolated native storage smoke', platform:'web' }, undefined, policy);
    const importId = `i-${randomUUID()}`;
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7o0AAAAASUVORK5CYII=', 'base64');
    // Pipeline fixture: binary font header/bytes, not a renderer-valid font claim.
    const font = Buffer.concat([Buffer.from('wOF2'), Buffer.from([0,255,128,1,13,10,0,127,254])]);
    const rootCSS = '@import "nested/fonts.css" screen;body{background:url(../images/pixel.png)}';
    const fontCSS = '@font-face{font-family:Smoke;src:url("../../fonts/smoke.woff2") format("woff2")}';
    const asset = (url, mimeType, bytes, category) => ({ url, mimeType, bytesBase64:Buffer.from(bytes).toString('base64'), category });
    const bundle = buildAssetBundle({
      importId,
      source:{ kind:'website', url:'https://smoke.invalid/page', title:'Native binary pipeline', width:1440, height:900 },
      html:'<!doctype html><html><head><link rel="stylesheet" href="https://smoke.invalid/css/root.css"></head><body style="font-family:Smoke"><img src="https://smoke.invalid/images/pixel.png"></body></html>',
      resources:[
        asset('https://smoke.invalid/css/root.css', 'text/css', rootCSS, 'stylesheet'),
        asset('https://smoke.invalid/css/nested/fonts.css', 'text/css', fontCSS, 'stylesheet'),
        asset('https://smoke.invalid/fonts/smoke.woff2', 'font/woff2', font, 'font'),
        asset('https://smoke.invalid/images/pixel.png', 'image/png', png, 'image')
      ],
      preview:{ bytesBase64:png.toString('base64'), mimeType:'image/png' },
      context:{ nodes:[{ name:'Smoke frame', type:'FRAME' }] }
    });
    assert.equal(bundle.record.integrity, 'complete');
    const saved = await writeAssetFiles({ store, fs, shell, projectId:project.id, files:bundle.files, policy });
    assert.equal(saved.written.length, bundle.files.length);
    const projectRoot = fs.processPath(await store.target(`projects/${project.id}`));
    for (const file of bundle.files) {
      const actual = await nativeFS.readFile(scopedPath(temporaryRoot, path.join(projectRoot, file.path)));
      assert.deepEqual(actual, Buffer.from(file.bytesBase64, 'base64'));
      assert.equal(sha(actual), file.sha256);
    }
    const fontEntry = bundle.manifest.resources.find(entry => entry.category === 'fonts');
    const pngEntry = bundle.manifest.resources.find(entry => entry.category === 'images');
    assert.deepEqual(await nativeFS.readFile(path.join(projectRoot, fontEntry.path)), font);
    assert.deepEqual(await nativeFS.readFile(path.join(projectRoot, pngEntry.path)), png);
    assert.equal(fontEntry.byteLength, font.length);
    assert.ok(font.includes(0) && font.includes(255), 'font fixture exercises bytes that are not UTF-8 text');
    for (const stylesheet of bundle.manifest.resources.filter(entry => entry.category === 'styles')) {
      const bytes = await nativeFS.readFile(path.join(projectRoot, stylesheet.path));
      assert.equal(sha(bytes), stylesheet.sha256);
      assert.equal(bytes.length, stylesheet.byteLength);
      assert.ok(path.basename(stylesheet.path).startsWith(`${sha(bytes)}-`));
      assert.doesNotMatch(bytes.toString(), /https:\/\/smoke\.invalid/);
      const references = [...bytes.toString().matchAll(/url\("([^"]+)"\)/g)].map(match => match[1]);
      for (const reference of references) assert.ok((await nativeFS.stat(path.resolve(projectRoot, path.dirname(stylesheet.path), reference))).isFile());
    }
    const committed = await store.importCommit({ projectId:project.id, expectedRevision:project.revision, record:bundle.record, html:bundle.html }, undefined, policy);
    const artboard = await store.artboardGet(project.id, committed.artboard.id);
    assert.equal(artboard.html, bundle.html);
    assert.ok(artboard.html.includes(`src="../${pngEntry.path}"`));
    const recovered = await store.importGet(project.id, importId);
    assert.deepEqual(recovered.manifest, bundle.manifest);
    assert.equal(recovered.record.artboardId, committed.artboard.id);
    const htmlPath = path.join(projectRoot, committed.artboard.htmlPath);
    assert.equal(await nativeFS.readFile(scopedPath(temporaryRoot, htmlPath), 'utf8'), bundle.html);
    assert.equal(sha(await nativeFS.readFile(htmlPath)), committed.artboard.contentHash);
    const persistedProjectPath = scopedPath(temporaryRoot, path.join(projectRoot, 'project.json'));
    const projectBeforeConflict = await nativeFS.readFile(persistedProjectPath);
    assert.doesNotMatch(projectBeforeConflict.toString(), /bytesBase64/);

    const binaryFiles = bundle.files.filter(file => file.mimeType !== 'application/json');
    const repeated = await writeAssetFiles({ store, fs, shell, projectId:project.id, files:binaryFiles, policy });
    assert.equal(repeated.written.length, binaryFiles.length);
    assert.deepEqual(await nativeFS.readFile(path.join(projectRoot, fontEntry.path)), font);
    const conflictPath = scopedPath(temporaryRoot, path.join(projectRoot, fontEntry.path));
    const conflicting = Buffer.from(font); conflicting[conflicting.length - 1] ^= 255;
    await nativeFS.writeFile(conflictPath, conflicting);
    await assert.rejects(writeAssetFiles({ store, fs, shell, projectId:project.id, files:binaryFiles, policy }), error => error.code === 'ASSET_WRITE_FAILED' && /ASSET_CONFLICT/.test(error.message));
    assert.deepEqual(await nativeFS.readFile(conflictPath), conflicting, 'the actual child does not overwrite conflicting existing bytes');
    assert.deepEqual(await nativeFS.readFile(persistedProjectPath), projectBeforeConflict);
    assert.ok(shell.requests.every(request => request.sandboxPolicy === policy));
    assert.equal(new Set(shell.requests.map(request => request.command)).size, 1, 'every real bash execution uses the same fixed command');
    assert.ok(shell.requests.every(request => !request.command.includes(projectRoot) && !request.command.includes(font.toString('base64'))));
    t.diagnostic(`Native-local smoke: ${bundle.manifest.resources.length} resources + PNG preview + JSON/HTML; real bash/Node binary publication; final SHA-256, same-byte CAS and conflict refusal verified. This does not test the actual DSH composed sandbox.`);
  } finally {
    // Only this UUID directory can be removed. Validate the actual canonical
    // target, parent, basename, and symlink type immediately before recursive rm.
    const resolved = await nativeFS.realpath(selected);
    assert.equal(resolved, temporaryRoot);
    assert.equal(resolved, path.resolve(workspace, directoryName));
    assert.equal(path.dirname(resolved), workspace);
    assert.equal(path.basename(resolved), directoryName);
    assert.match(path.basename(resolved), /^\.asset-storage-smoke-[a-f0-9-]{36}$/);
    assert.ok(!(await nativeFS.lstat(selected)).isSymbolicLink());
    await nativeFS.rm(resolved, { recursive:true, force:true });
    await assert.rejects(nativeFS.stat(selected), { code:'ENOENT' });
  }
});

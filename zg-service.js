import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID, randomBytes} from 'node:crypto';
import {policyAllowsTarget} from './store.js';
import {ZG_MODEL, ZG_MAX_INPUT, ZG_MAX_OUTPUT, ZgError, zgFail, zgDigest, zgIdentity, zgMode, zgFiles, zgProgress, zgSystemProxy} from './zg-runtime.js';
const HELPER = fileURLToPath(new URL('./zg-helper.js', import.meta.url));
const quote = value => "'" + String(value).replace(/'/g, "'\\''") + "'";
const PROXY_FLAG = process.allowedNodeEnvironmentFlags.has('--use-env-proxy') ? ' --use-env-proxy' : '';
export const ZG_HELPER_COMMAND = `ELECTRON_RUN_AS_NODE=1 exec ${quote(process.execPath)}${PROXY_FLAG} ${quote(HELPER)}`;
const ownerOnly = env => { if (env.user !== true || env.agent) zgFail('USER_ONLY', 'Only the owner user can prepare models or index knowledge'); };
const publicError = error => ({code: /^ZG_[A-Z_]+$/.test(error?.code) ? error.code : 'ZG_FAILED', message: error instanceof ZgError ? error.message : 'Local zg operation failed'});

/** Host boundary: only composed FS and managed ctx.shell, never native FS or SDK. */
export class ZgService {
  constructor(owner, {platform = process.platform, environment = process.env} = {}) { this.owner = owner; this.ctx = owner.ctx; this.platform = platform; this.environment = environment; this.pending = new Set(); this.indexing = new Set(); this.setupJob = null; this.disposed = false; }
  policy(env) { const policy = env.policy || this.owner.policy?.() || this.owner.store.policy?.(); if (!policy) zgFail('POLICY_REQUIRED', 'Knowledge runtime requires the current native file policy'); return policy; }
  async root(env, {allowMissing = false} = {}) {
    const fs = this.ctx.fs, requested = path.resolve(this.owner.store.root), target = await fs.resolve(requested, {signal: env.signal}), info = await fs.stat(target, env.signal);
    if (fs.processPath(target) !== requested || info && info.type !== 'directory' || !info && !allowMissing) zgFail('ZG_UNSAFE_PATH', 'Knowledge library canonical identity changed or is unavailable');
    let workdir = requested;
    while (!await fs.stat(await fs.resolve(workdir, {signal: env.signal}), env.signal)) { const parent = path.dirname(workdir); if (parent === workdir) zgFail('ZG_UNSAFE_PATH', 'Knowledge workspace is unavailable'); workdir = parent; }
    return {target, physical: requested, workdir, missing: !info};
  }
  async queryCache(operation, env, libraryRoot) {
    if (!['search', 'status'].includes(operation)) return null;
    const writable = value => value && ['workspace-write', 'danger-full-access'].includes(value.mode);
    const live = env.nativePolicy; if (!writable(live)) return null;
    const proof = env.queryNativeScope;
    let candidate, base;
    if (env.agent) {
      const task = env.task;
      if (!proof || !task || proof.taskId !== task.id || proof.projectId !== task.projectId || proof.scope !== task.scope || !['selection', 'page', 'design', 'project'].includes(task.scope)) return null;
    } else if (env.user !== true && operation !== 'status') return null;
    if (proof) {
      if (!['selection', 'page', 'design', 'project'].includes(proof.scope) || !writable(proof.nativePolicy) || typeof proof.projectRoot !== 'string' || !path.isAbsolute(proof.projectRoot) || typeof proof.projectId !== 'string') return null;
      candidate = proof.nativePolicy; base = proof.projectRoot;
      const projectPhysicalRoot = this.owner.projectPhysicalRoot ? await this.owner.projectPhysicalRoot(proof.projectId, env.signal) : this.owner.store.projectPhysicalRoot ? await this.owner.store.projectPhysicalRoot(proof.projectId, env.signal) : null;
      if (!projectPhysicalRoot || path.resolve(projectPhysicalRoot) !== base) return null;
    } else { if (env.agent) return null; candidate = live; base = candidate.workspaceRoot; }
    if (typeof base !== 'string' || !path.isAbsolute(base)) return null;
    const fs = this.ctx.fs, root = await fs.resolve(base, {signal: env.signal});
    if (fs.processPath(root) !== base || (await fs.stat(root, env.signal))?.type !== 'directory') zgFail('ZG_UNSAFE_QUERY_CACHE', 'Query cache project canonical identity changed');
    const cacheId = randomUUID(), directory = path.join(base, '.workbench', 'zg-query-cache', cacheId), target = await fs.resolve(directory, {signal: env.signal});
    if (!fs.contains(root, target) || fs.processPath(target) !== directory) zgFail('ZG_UNSAFE_QUERY_CACHE', 'Query cache path aliases another directory');
    if (!await policyAllowsTarget(fs, live, target, env.signal) || !await policyAllowsTarget(fs, candidate, target, env.signal)) return null;
    const knowledge = await fs.resolve(path.join(libraryRoot, 'knowledge'), {signal: env.signal}), runtime = await fs.resolve(path.join(libraryRoot, '.workbench', 'zg-runtime'), {signal: env.signal}), library = await fs.resolve(libraryRoot, {signal: env.signal});
    if (fs.contains(target, library) || fs.contains(knowledge, target) || fs.contains(runtime, target)) zgFail('ZG_UNSAFE_QUERY_CACHE', 'Query cache overlaps original knowledge storage');
    const token = randomBytes(32).toString('hex'), marker = await fs.resolve(path.join(directory, 'owner.json'), {signal: env.signal});
    if (fs.processPath(marker) !== path.join(directory, 'owner.json') || !fs.contains(target, marker)) zgFail('ZG_UNSAFE_QUERY_CACHE', 'Query cache marker aliases another resource');
    const policy = {...live, ...candidate, mode: 'workspace-write', workspaceRoot: directory, additionalWritableRoots: []};
    await fs.stat(marker, env.signal);
    await fs.writeText(marker, JSON.stringify({kind: 'dsh-zg-workspace-cache', cacheId, token, libraryHash: zgDigest(libraryRoot)}), {kind: 'createIfAbsent'}, env.signal, policy);
    const canonical = await fs.resolve(directory, {signal: env.signal});
    if (fs.processPath(canonical) !== directory) zgFail('ZG_UNSAFE_QUERY_CACHE', 'Query cache identity changed after creation');
    return {scratch: {kind: 'workspace-cache', directory, token}, policy, libraryRoot};
  }
  async cleanupQueryCache(cache) {
    const fs = this.ctx.fs, target = await fs.resolve(cache.scratch.directory);
    if (fs.processPath(target) !== cache.scratch.directory) zgFail('ZG_UNSAFE_QUERY_CACHE', 'Query cache identity changed before cleanup');
    if (!await fs.stat(target)) return;
    const shell = this.ctx.shell, request = {operation: 'cleanup', libraryRoot: cache.libraryRoot, scratch: cache.scratch};
    const spec = shell.resolve({command: ZG_HELPER_COMMAND, stdin: JSON.stringify(request), workdir: path.dirname(path.dirname(cache.scratch.directory)), sandboxPolicy: cache.policy, timeoutMs: 5000, onExpiry: 'kill', stdoutMaxBytes: 16000, stderrMaxBytes: 8192});
    const result = await(await shell.execute(spec)).result();
    if (result.exitCode !== 0 || result.sandbox?.denied || result.timedOut) zgFail('ZG_QUERY_CACHE_CLEANUP_FAILED', 'The private query cache could not be cleaned safely');
  }
  async preparationCommand(shell, policy, physical, signal) {
    if (this.environment.HTTPS_PROXY || this.environment.https_proxy || this.environment.HTTP_PROXY || this.environment.http_proxy) {
      if (!PROXY_FLAG) zgFail('ZG_PROXY_UNSUPPORTED', 'This Node runtime cannot use the configured model-download proxy');
      return ZG_HELPER_COMMAND;
    }
    if (this.platform !== 'darwin') return ZG_HELPER_COMMAND;
    const handle = await shell.execute(shell.resolve({command: '/usr/sbin/scutil --proxy', stdin: '', workdir: physical, signal, sandboxPolicy: {...policy, mode: 'read-only', additionalWritableRoots: []}, timeoutMs: 2000, onExpiry: 'kill', stdoutMaxBytes: 8192, stderrMaxBytes: 8192}));
    const result = await handle.result();
    if (signal.aborted) zgFail('ZG_ABORTED', 'Knowledge preparation was cancelled');
    if (result.sandbox?.denied) zgFail('FS_SANDBOX_DENIED', 'The native policy refused system proxy inspection');
    if (result.exitCode !== 0 || result.timedOut || result.stdout?.truncated) return ZG_HELPER_COMMAND;
    const proxy = zgSystemProxy(result.stdout?.text || '');
    if (Object.keys(proxy).length && !PROXY_FLAG) zgFail('ZG_PROXY_UNSUPPORTED', 'This Node runtime cannot use the configured system proxy');
    return Object.entries(proxy).map(([key, value]) => key + '=' + quote(value)).join(' ') + (Object.keys(proxy).length ? ' ' : '') + ZG_HELPER_COMMAND;
  }
  readProgress(call) {
    const observed = call.handle?.observed?.stdout;
    if (!observed?.readFrom) return;
    try {
      const result = observed.readFrom(call.offset || 0); call.offset = result.nextOffset;
      const text = (call.fragment || '') + result.text;
      if (text.length > ZG_MAX_OUTPUT) zgFail('ZG_OUTPUT_LIMIT', 'Knowledge helper output exceeded its limit');
      const lines = text.split('\n'); call.fragment = lines.pop();
      for (const line of lines) {
        let value; try { value = JSON.parse(line); } catch { continue; }
        if (value.type === 'progress') { call.progress = zgProgress(value.progress); call.onProgress?.(call.progress); }
      }
    } catch (error) { if (error instanceof ZgError) { call.controller.abort(); call.handle?.kill?.(); } }
  }
  async run(operation, input, env = {}, call = {}) {
    if (this.disposed) zgFail('ZG_DISPOSED', 'Knowledge runtime was disposed');
    const policy = this.policy(env), {target, physical, workdir} = await this.root(env, {allowMissing: operation === 'status'}), fs = this.ctx.fs, shell = this.ctx.shell;
    const writing = operation === 'index' || operation === 'prepare';
    if (!shell?.resolve || !shell?.execute) zgFail('ZG_UNAVAILABLE', 'Local knowledge requires the managed Node runtime');
    if (writing) {
      ownerOnly(env);
      if (!await policyAllowsTarget(fs, policy, target, env.signal)) zgFail('FS_SANDBOX_DENIED', 'The native policy does not allow writing this knowledge library');
    }
    const specific = operation === 'prepare' ? path.join(physical, '.workbench', 'zg-runtime') : operation === 'index' || operation === 'search' ? path.join(physical, 'knowledge', zgIdentity(input).knowledgeId, 'indexes') : physical;
    const narrow = await fs.resolve(specific, {signal: env.signal});
    if (!fs.contains(target, narrow) || fs.processPath(narrow) !== specific) zgFail('ZG_UNSAFE_PATH', 'Knowledge runtime path aliases another directory');
    const request = {operation, libraryRoot: physical};
    for (const key of ['knowledgeId', 'sourceVersion', 'mode', 'query', 'limit', 'files']) if (input?.[key] !== undefined) request[key] = input[key];
    call.controller ||= new AbortController(); call.onProgress = env.onProgress;
    const signal = env.signal ? AbortSignal.any([env.signal, call.controller.signal]) : call.controller.signal;
    signal.throwIfAborted();
    const abort = () => { call.handle?.kill?.(); };
    signal.addEventListener('abort', abort, {once: true}); call.done = new Promise(resolve => { call.resolveDone = resolve; }); this.pending.add(call);
    let cache, denied = false;
    try {
      cache = await this.queryCache(operation, {...env, signal}, physical);
      if (cache) request.scratch = cache.scratch;
      const stdin = JSON.stringify(request); if (Buffer.byteLength(stdin) > ZG_MAX_INPUT) zgFail('ZG_TOO_LARGE', 'Knowledge projection payload exceeded its limit');
      // Existing native grants may authorize one isolated machine cache. That
      // process is workspace-write only within this fresh UUID directory; the
      // original KB and all other project resources remain outside every write root.
      const sandboxPolicy = cache?.policy || {...policy, mode: writing ? 'workspace-write' : 'read-only', workspaceRoot: specific, additionalWritableRoots: []};
      const command = operation === 'prepare' ? await this.preparationCommand(shell, sandboxPolicy, workdir, signal) : ZG_HELPER_COMMAND;
      const spec = shell.resolve({command, stdin, workdir, signal, sandboxPolicy, timeoutMs: operation === 'prepare' ? 300000 : operation === 'index' ? 120000 : 30000, onExpiry: 'kill', stdoutMaxBytes: ZG_MAX_OUTPUT, stderrMaxBytes: 65536});
      call.handle = await shell.execute(spec); if (signal.aborted) call.handle.kill?.();
      const notify = () => this.readProgress(call); call.handle.events?.on?.('stdout', notify);
      let result;
      try { result = await call.handle.result(); } finally { call.handle.events?.off?.('stdout', notify); }
      this.readProgress(call);
      if (signal.aborted || result.aborted) zgFail('ZG_ABORTED', 'Knowledge operation was cancelled');
      if (result.sandbox?.denied) { denied = true; zgFail('FS_SANDBOX_DENIED', 'The native sandbox refused the knowledge operation'); }
      if (result.timedOut) zgFail('ZG_TIMEOUT', 'Knowledge operation exceeded its bounded time');
      if (result.stdout?.truncated || Buffer.byteLength(result.stdout?.text || '') > ZG_MAX_OUTPUT) zgFail('ZG_OUTPUT_LIMIT', 'Knowledge helper output exceeded its limit');
      let receipt;
      for (const line of (result.stdout?.text || '').split('\n').filter(Boolean)) {
        let item; try { item = JSON.parse(line); } catch { zgFail('ZG_PROCESS_FAILED', 'Knowledge helper returned an invalid receipt'); }
        if (item.type === 'progress') { call.progress = zgProgress(item.progress); env.onProgress?.(call.progress); }
        else if (typeof item.ok === 'boolean' && !receipt) receipt = item;
        else zgFail('ZG_PROCESS_FAILED', 'Knowledge helper returned an invalid receipt');
      }
      if (!receipt) zgFail('ZG_PROCESS_FAILED', 'Knowledge helper returned no result');
      if (!receipt.ok) zgFail(/^ZG_[A-Z_]+$/.test(receipt.error?.code) ? receipt.error.code : 'ZG_FAILED', typeof receipt.error?.message === 'string' ? receipt.error.message.slice(0, 500) : 'Local knowledge operation failed');
      if (result.exitCode !== 0) zgFail('ZG_PROCESS_FAILED', 'Knowledge helper failed after returning its receipt');
      return receipt.result;
    } catch (error) { if (signal.aborted && error.code !== 'ZG_ABORTED') zgFail('ZG_ABORTED', 'Knowledge operation was cancelled'); throw error; }
    finally {
      try { if (cache && !denied) await this.cleanupQueryCache(cache); }
      finally { signal.removeEventListener('abort', abort); this.pending.delete(call); call.resolveDone?.(); }
    }
  }
  async nativeReadonlyProbe(env = {}) {
    const errno = error => ['EPERM', 'EACCES', 'EROFS', 'ENOENT', 'ERR_ACCESS_DENIED', 'FS_SANDBOX_DENIED', 'SANDBOX_UNAVAILABLE', 'ETIMEDOUT'].includes(error?.code) ? error.code : 'UNKNOWN';
    if (this.disposed) zgFail('ZG_DISPOSED', 'Knowledge runtime is disposed');
    const controller = new AbortController(), done = Promise.withResolvers(), call = {controller, done: done.promise, resolveDone: done.resolve};
    const abort = () => { controller.abort(); call.handle?.kill?.(); }; env.signal?.addEventListener('abort', abort, {once: true}); if (env.signal?.aborted) abort();
    this.pending.add(call); let cache;
    const result = {ran: false, available: false, buildSucceeded: false, querySucceeded: false, readOnlyEnforced: false, cleanupSucceeded: true, buildPolicy: 'workspace-write', queryPolicy: 'read-only'};
    try {
      const scope = {...env, signal: controller.signal}, root = await this.root(scope, {allowMissing: true});
      cache = await this.queryCache('status', scope, root.physical);
      if (!cache) return {...result, reason: 'no-existing-cache-write-grant'};
      result.ran = true;
      const execute = async (operation, policy) => {
        const shell = this.ctx.shell, spec = shell.resolve({command: ZG_HELPER_COMMAND, stdin: JSON.stringify({operation, libraryRoot: root.physical, scratch: cache.scratch}), workdir: cache.scratch.directory, signal: controller.signal, sandboxPolicy: policy, timeoutMs: 15000, onExpiry: 'kill', stdoutMaxBytes: 16000, stderrMaxBytes: 8192});
        call.handle = await shell.execute(spec); const receipt = await call.handle.result();
        if (controller.signal.aborted) zgFail('ZG_ABORTED', 'Knowledge native health check was cancelled');
        let body; try { const text = receipt.stdout?.text || ''; if (receipt.stdout?.truncated || Buffer.byteLength(text) > 16000) throw new Error(); body = JSON.parse(text.trim().split('\n').filter(Boolean).at(-1)); } catch { body = null; }
        return {receipt, body, ok: receipt.exitCode === 0 && !receipt.timedOut && !receipt.sandbox?.denied && !receipt.sandbox?.runnerFailed && body?.ok === true};
      };
      const built = await execute('probe.build', cache.policy); result.buildSucceeded = built.ok && built.body.result?.built === true;
      if (!result.buildSucceeded) result.errno = built.receipt.timedOut ? 'ETIMEDOUT' : errno({code: built.body?.result?.errno || built.body?.error?.code});
      else {
        const readOnly = {...cache.policy, mode: 'read-only', additionalWritableRoots: []};
        const queried = await execute('probe.query', readOnly);
        result.querySucceeded = queried.ok && queried.body.result?.queried === true && queried.body.result?.readonly === true;
        result.readOnlyEnforced = queried.receipt.sandbox?.mode === 'read-only' && queried.receipt.sandbox?.enforcement === 'full' && !queried.receipt.sandbox?.runnerFailed;
        result.available = result.querySucceeded && result.readOnlyEnforced;
        if (!result.querySucceeded) result.errno = queried.receipt.timedOut ? 'ETIMEDOUT' : errno({code: queried.body?.result?.errno || queried.body?.error?.code});
      }
    } catch (error) { if (controller.signal.aborted) zgFail('ZG_ABORTED', 'Knowledge native health check was cancelled'); result.errno = errno(error); }
    finally {
      try { if (cache) await this.cleanupQueryCache(cache); }
      catch (error) { result.cleanupSucceeded = false; result.available = false; result.errno = errno(error); }
      finally { env.signal?.removeEventListener('abort', abort); this.pending.delete(call); call.resolveDone(); }
    }
    return result;
  }
  async runtimeStatus(env = {}) {
    if (this.setupJob) this.readProgress(this.setupJob);
    const status = await this.run('status', {}, env);
    const job = this.setupJob; if (job) this.readProgress(job);
    if (job?.state === 'running') status.model.state = 'preparing';
    else if (job?.state === 'failed' && status.model.state !== 'ready') status.model.state = 'failed';
    return {...status, setup: job ? this.jobReceipt(job) : null};
  }
  status(env) { return this.runtimeStatus(env); }
  jobReceipt(job) { return {jobId: job.jobId, state: job.state, ...(job.progress ? {progress: job.progress} : {}), ...(job.error ? {error: job.error} : {})}; }
  async setup(input = {}, env = {}) {
    ownerOnly(env); const policy = this.policy(env), root = await this.root(env, {allowMissing: true});
    if (!await policyAllowsTarget(this.ctx.fs, policy, root.target, env.signal)) zgFail('FS_SANDBOX_DENIED', 'The native policy does not allow preparing a model in this library');
    if (root.missing) {
      const marker = await this.ctx.fs.resolve(path.join(root.physical, '.workbench', 'zg-runtime', 'initialized'), {signal: env.signal});
      if (!this.ctx.fs.contains(root.target, marker)) zgFail('ZG_UNSAFE_PATH', 'Knowledge initialization left its root');
      await this.ctx.fs.stat(marker, env.signal);
      await this.ctx.fs.writeText(marker, 'zg runtime\n', {kind: 'createIfAbsent'}, env.signal, policy);
    }
    if (input.model !== undefined && input.model !== ZG_MODEL) zgFail('ZG_INVALID_INPUT', 'Only the bundled local potion-code-16m-v2 model is supported');
    if (this.setupJob?.state === 'running') return this.jobReceipt(this.setupJob);
    const job = {jobId: 'zg-setup-' + randomUUID(), state: 'running', controller: new AbortController()}; this.setupJob = job;
    job.finished = this.run('prepare', {}, env, job).then(() => { job.state = 'completed'; }, error => { job.state = job.controller.signal.aborted || error.code === 'ZG_ABORTED' ? 'cancelled' : 'failed'; if (job.state === 'failed') job.error = publicError(error); });
    return this.jobReceipt(job);
  }
  async cancel({jobId} = {}, env = {}) {
    ownerOnly(env); const job = this.setupJob;
    if (!job || job.jobId !== jobId) zgFail('ZG_JOB_NOT_FOUND', 'Knowledge preparation job was not found');
    if (job.state === 'running') { job.controller.abort(); job.handle?.kill?.(); await job.finished; }
    return this.jobReceipt(job);
  }
  async index(input, env = {}) {
    ownerOnly(env); const identity = zgIdentity(input), mode = zgMode(input.mode), files = zgFiles(input.files);
    if (this.indexing.has(identity.knowledgeId)) zgFail('ZG_BUSY', 'An index build is already running for this knowledge library');
    this.indexing.add(identity.knowledgeId);
    try { return await this.run('index', {...identity, mode, files}, env); } finally { this.indexing.delete(identity.knowledgeId); }
  }
  async search(input, env = {}) {
    const identity = zgIdentity(input), mode = zgMode(input.mode), limit = input.limit ?? 10;
    if (typeof input.query !== 'string' || !input.query.trim() || input.query.length > 4000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 50) zgFail('ZG_INVALID_INPUT', 'Supply a nonempty knowledge query and limit between 1 and 50');
    return this.run('search', {...identity, mode, query: input.query, limit}, env);
  }
  async dispose() { this.disposed = true; const calls = [...this.pending]; for (const call of calls) { call.controller.abort(); call.handle?.kill?.(); } await Promise.allSettled(calls.map(call => call.done)); await this.setupJob?.finished; }
}

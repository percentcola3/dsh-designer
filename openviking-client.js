// Official HTTP transport only: no filesystem, credentials storage, polling or mutation retries.
// Protocol: https://docs.openviking.ai/en/api/{02-resources,03-filesystem,06-retrieval,12-content,17-tasks}
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export class OpenVikingError extends Error {
  constructor(code, message, statusCode) {
    super(message); this.name = 'OpenVikingError'; this.code = `OPENVIKING_${code}`;
    if (statusCode !== undefined) { this.statusCode = statusCode; this.details = {status: statusCode}; }
  }
}
const fail = (code, message, status) => { throw new OpenVikingError(code, message, status); };
const invalid = () => fail('INVALID_ARGUMENT', 'Invalid OpenViking request parameters');
const nonempty = (value, max = 8192) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;

export function normalizeOpenVikingConfig(input = {}) {
  if (!object(input)) fail('INVALID_CONFIG', 'Invalid OpenViking connection configuration');
  const endpoint = input.endpoint ?? 'http://localhost:1933';
  let url;
  try { if (typeof endpoint !== 'string' || /[\x00-\x20\x7f\\]/.test(endpoint)) throw new Error(); url = new URL(endpoint); }
  catch { fail('INVALID_CONFIG', 'Use an absolute HTTP or HTTPS OpenViking endpoint'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || /[?#]/.test(endpoint)) {
    fail('INVALID_CONFIG', 'OpenViking endpoint must use HTTP or HTTPS without credentials, query or fragment');
  }
  const apiKey = input.apiKey ?? '';
  if (typeof apiKey !== 'string' || apiKey.length > 16000 || /[^\x21-\x7e]/.test(apiKey)) fail('INVALID_CONFIG', 'Invalid OpenViking API key');
  const timeoutMs = input.timeoutMs ?? 30000;
  if (!integer(timeoutMs, 1, 300000)) fail('INVALID_CONFIG', 'OpenViking timeout must be between 1 and 300000 milliseconds');
  return {endpoint: url.href.replace(/\/+$/, ''), apiKey, timeoutMs};
}

// Do not normalize away traversal, aliases or encoded separators. Scope checks fail closed.
function uriSegments(uri) {
  if (!nonempty(uri) || !uri.startsWith('viking://') || /[\\?#]/.test(uri)) return null;
  const value = uri.slice(9).replace(/\/$/, '');
  const segments = value.split('/');
  if (!segments.length || segments.some(segment => !segment)) return null;
  for (const segment of segments) {
    let decoded = segment;
    for (let count = 0; count < 4; count++) {
      if (decoded === '.' || decoded === '..' || /[\/\\?#\x00-\x1f\x7f]/.test(decoded)) return null;
      if (!decoded.includes('%')) break;
      let next; try { next = decodeURIComponent(decoded); } catch { return null; }
      if (next === decoded || count === 3) return null;
      decoded = next;
    }
  }
  return segments;
}
export function uriWithinRoot(uri, root) {
  const target = uriSegments(uri), base = uriSegments(root);
  return !!(target && base && base.length <= target.length && base.every((segment, index) => segment === target[index]));
}
function validUri(uri) { if (!uriSegments(uri)) invalid(); return uri; }
function safeCancel(body) { try { void body?.cancel().catch(() => {}); } catch {} }
function requireObject(value) { if (!object(value)) fail('PROTOCOL_ERROR', 'OpenViking returned an invalid result'); return value; }

/** Uses X-API-Key (USER/ADMIN keys for tenant data in api_key mode).
 * A timeout/abort ends this HTTP call only; a submitted remote mutation may still run.
 * All methods return the official result, except list which preserves pagination.
 */
export class OpenVikingClient {
  #config; #fetch;
  constructor({fetchImpl = globalThis.fetch, ...config} = {}) {
    this.#config = normalizeOpenVikingConfig(config); this.#fetch = fetchImpl;
    if (typeof fetchImpl !== 'function') fail('INVALID_CONFIG', 'The standard Fetch API is required');
  }
  async #request(route, {signal, method = 'GET', json, form, query, health = false} = {}) {
    if (signal !== undefined && !(signal instanceof AbortSignal)) invalid();
    if (signal?.aborted) fail('ABORTED', 'OpenViking request was cancelled');
    const controller = new AbortController();
    let rejectStop, timer, response;
    const stopped = new Promise((_, reject) => { rejectStop = reject; });
    const stop = (code, message) => {
      const error = new OpenVikingError(code, message);
      controller.abort(); safeCancel(response?.body); rejectStop(error);
    };
    const onAbort = () => stop('ABORTED', 'OpenViking request was cancelled');
    signal?.addEventListener('abort', onAbort, {once: true});
    timer = setTimeout(() => stop('TIMEOUT', 'OpenViking request timed out; submitted processing may still continue'), this.#config.timeoutMs);
    const operation = (async () => {
      const url = new URL(this.#config.endpoint + '/' + route);
      for (const [key, value] of Object.entries(query || {})) url.searchParams.set(key, String(value));
      const headers = {Accept: 'application/json'};
      if (this.#config.apiKey) headers['X-API-Key'] = this.#config.apiKey;
      if (json !== undefined) headers['Content-Type'] = 'application/json';
      response = await this.#fetch(url, {method, headers, redirect: 'manual', signal: controller.signal, ...(json !== undefined ? {body: JSON.stringify(json)} : form ? {body: form} : {})});
      if (controller.signal.aborted) { safeCancel(response.body); return; }
      if (response.status >= 300 && response.status < 400) { safeCancel(response.body); fail('REDIRECT_BLOCKED', 'OpenViking redirected; configure its final trusted endpoint', response.status); }
      if (!response.ok) {
        safeCancel(response.body);
        const message = response.status === 401 ? 'OpenViking authentication failed; verify the API key' : response.status === 403 ? 'OpenViking denied access; tenant data requires an authorized USER or ADMIN key' : `OpenViking returned HTTP ${response.status}`;
        fail('HTTP_ERROR', message, response.status);
      }
      if (!/\bapplication\/(?:[\w.+-]+\+)?json\b/i.test(response.headers.get('content-type') || '')) {
        safeCancel(response.body); fail('PROTOCOL_ERROR', 'OpenViking did not return JSON');
      }
      const declaredSize = Number(response.headers.get('content-length'));
      if (declaredSize > MAX_RESPONSE_BYTES) { safeCancel(response.body); fail('RESPONSE_TOO_LARGE', 'OpenViking response exceeds the 2 MiB limit'); }
      const reader = response.body?.getReader();
      if (!reader) fail('PROTOCOL_ERROR', 'OpenViking returned an empty response');
      let text = '', size = 0; const decoder = new TextDecoder('utf-8', {fatal: true});
      try {
        while (true) {
          const {done, value} = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_RESPONSE_BYTES) fail('RESPONSE_TOO_LARGE', 'OpenViking response exceeds the 2 MiB limit');
          text += decoder.decode(value, {stream: true});
        }
        text += decoder.decode();
      } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
      let envelope; try { envelope = JSON.parse(text); } catch { fail('PROTOCOL_ERROR', 'OpenViking returned malformed JSON'); }
      if (!object(envelope) || envelope.status !== 'ok') fail('PROTOCOL_ERROR', 'OpenViking returned an unsuccessful or invalid envelope');
      if (health) {
        if (typeof envelope.healthy !== 'boolean' || !nonempty(envelope.version, 256)) fail('PROTOCOL_ERROR', 'OpenViking returned an invalid health response');
        return envelope;
      }
      if (!Object.hasOwn(envelope, 'result')) fail('PROTOCOL_ERROR', 'OpenViking response is missing its result');
      return envelope;
    })();
    try { return await Promise.race([operation, stopped]); }
    catch (error) {
      if (error instanceof OpenVikingError) throw error;
      // Never attach causes, response bodies, URLs, headers or external exception text.
      fail('CONNECTION_FAILED', 'OpenViking connection failed');
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
  }
  async probe({signal} = {}) { return this.#request('health', {signal, health: true}); }
  async upload({bytes, name, mimeType = 'application/octet-stream', signal} = {}) {
    if (!(bytes instanceof Uint8Array || bytes instanceof ArrayBuffer || bytes instanceof Blob) || !nonempty(name, 255) || /[\/\\]/.test(name) || !nonempty(mimeType, 200)) invalid();
    const form = new FormData(); form.append('file', new Blob([bytes], {type: mimeType}), name);
    const result = requireObject((await this.#request('api/v1/resources/temp_upload', {method: 'POST', form, signal})).result);
    if (!nonempty(result.temp_file_id)) fail('PROTOCOL_ERROR', 'OpenViking upload did not return a temporary file ID');
    return result;
  }
  async addResource({tempFileId, to, sourceName, signal} = {}) {
    if (!nonempty(tempFileId) || (sourceName !== undefined && !nonempty(sourceName, 255))) invalid();
    const json = {temp_file_id: tempFileId, to: validUri(to), wait: false, ...(sourceName !== undefined ? {source_name: sourceName} : {})};
    const result = requireObject((await this.#request('api/v1/resources', {method: 'POST', json, signal})).result);
    if (!nonempty(result.status) || !nonempty(result.task_id)) fail('PROTOCOL_ERROR', 'OpenViking import did not return its submission status and task ID');
    // status=success/accepted is submission, never proof of completed indexing.
    return result;
  }
  async task({taskId, signal} = {}) {
    if (!nonempty(taskId, 256) || !/^[A-Za-z0-9_-]+$/.test(taskId)) invalid();
    const result = (await this.#request('api/v1/tasks/' + encodeURIComponent(taskId), {signal})).result;
    if (result === null) return null;
    requireObject(result);
    if (!nonempty(result.status, 256)) fail('PROTOCOL_ERROR', 'OpenViking task did not return its actual status');
    return this.#redactTask(result);
  }
  #redactTask(value) {
    // Preserve remote status/stage/errors, removing any echoed configured credential.
    if (typeof value === 'string') {
      for (const key of new Set([this.#config.apiKey, encodeURIComponent(this.#config.apiKey)])) if (key) value = value.split(key).join('[redacted]');
      return value;
    }
    if (Array.isArray(value)) return value.map(item => this.#redactTask(item));
    if (object(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [this.#redactTask(key), this.#redactTask(item)]));
    return value;
  }
  async find({query, targetUri, limit = 10, signal} = {}) {
    if (!nonempty(query, 32000) || !integer(limit, 1, 1000)) invalid();
    const json = {query, target_uri: validUri(targetUri), context_type: 'resource', limit, read_content: false};
    const result = requireObject((await this.#request('api/v1/search/find', {method: 'POST', json, signal})).result);
    if (!Array.isArray(result.resources)) fail('PROTOCOL_ERROR', 'OpenViking search returned an invalid resource result');
    return result;
  }
  async list({uri, offset = 0, limit = 100, signal} = {}) {
    if (!integer(offset, 0, Number.MAX_SAFE_INTEGER) || !integer(limit, 1, 1000)) invalid();
    const envelope = await this.#request('api/v1/fs/ls', {signal, query: {uri: validUri(uri), output: 'original', offset, limit}});
    if (!Array.isArray(envelope.result) || (envelope.has_more !== undefined && typeof envelope.has_more !== 'boolean')) fail('PROTOCOL_ERROR', 'OpenViking directory listing is invalid');
    // Older servers omit has_more; a full page may have a following page.
    return {result: envelope.result, hasMore: envelope.has_more ?? envelope.result.length >= limit, offset, limit};
  }
  /** content: offset is a zero-based line index, limit is a line count.
   * abstract/overview: official endpoints have no pagination and return the full bounded text.
   */
  async read({uri, offset = 0, limit = 200, level = 'content', signal} = {}) {
    if (!['content', 'abstract', 'overview'].includes(level) || !integer(offset, 0, Number.MAX_SAFE_INTEGER) || !integer(limit, 1, 10000)) invalid();
    const query = {uri: validUri(uri), ...(level === 'content' ? {offset, limit} : {})};
    const result = (await this.#request('api/v1/content/' + (level === 'content' ? 'read' : level), {signal, query})).result;
    if (typeof result !== 'string') fail('PROTOCOL_ERROR', 'OpenViking content response is not text');
    return result;
  }
}

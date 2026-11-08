import {createHash, timingSafeEqual} from 'node:crypto';
import {isIP} from 'node:net';
import ssh2 from 'ssh2';
const {Client} = ssh2;
const VIRTUAL_URL = 'https://dsh-ssh.invalid/repository';
const MAX_BYTES = 128 * 1024 * 1024;
const MAX_ADVERTISEMENT = 4 * 1024 * 1024;

export class SshTransportError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = 'SshTransportError'; this.code = code; this.details = details; }
}
const fail = (code, message, details) => { throw new SshTransportError(code, message, details); };
const invalid = () => fail('SSH_INVALID_INPUT', 'Invalid SSH remote or connection parameters');
const controls = /[\x00-\x1f\x7f]/;
const validUser = value => typeof value === 'string' && /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(value);
const validPort = value => Number.isInteger(value) && value > 0 && value <= 65535;
const validFingerprint = value => typeof value === 'string' && /^SHA256:[A-Za-z0-9+/]{43}$/.test(value);
export const sshFingerprint = key => 'SHA256:' + createHash('sha256').update(key).digest('base64').replace(/=+$/, '');
function hostName(value) {
  if (typeof value !== 'string' || !value || value.length > 253 || controls.test(value) || /[\s/@?#%\\]/.test(value)) invalid();
  // URL validates IPv6 as well as ordinary host syntax; strip brackets for ssh2's socket.
  let parsed; try { parsed = new URL('ssh://' + value); } catch { invalid(); }
  if (parsed.port || parsed.username || parsed.password || parsed.pathname || !parsed.hostname) invalid();
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!isIP(hostname) && (hostname.replace(/\.$/, '').split('.').some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)))) invalid();
  return hostname;
}
function repoPath(value) {
  if (typeof value !== 'string' || !value || value.length > 4096 || controls.test(value) || /[\\?#]/.test(value) || value.startsWith('-') || value.split('/').some(part => part === '..' || part === '.')) invalid();
  return value;
}
export function parseSshRemote(remoteUrl) {
  if (typeof remoteUrl !== 'string' || !remoteUrl || remoteUrl.length > 8192 || controls.test(remoteUrl) || remoteUrl.trim() !== remoteUrl) invalid();
  if (remoteUrl.startsWith('ssh://')) {
    // Validate before URL canonicalization can erase literal or encoded dot segments.
    const rawPath = /^ssh:\/\/[^/]+(\/.*)$/.exec(remoteUrl)?.[1];
    try { repoPath(decodeURIComponent(rawPath || '')); } catch { invalid(); }
    let url; try { url = new URL(remoteUrl); } catch { invalid(); }
    if (url.protocol !== 'ssh:' || url.password || url.search || url.hash || /[?#]/.test(remoteUrl)) invalid();
    let username, pathname; try { username = decodeURIComponent(url.username || 'git'); pathname = decodeURIComponent(url.pathname); } catch { invalid(); }
    if (!validUser(username) || !url.pathname || url.pathname === '/') invalid();
    const host = hostName(url.hostname), port = Number(url.port || 22), path = repoPath(pathname);
    if (!validPort(port)) invalid();
    return {host, port, username, path};
  }
  const match = /^(?:([A-Za-z0-9_][A-Za-z0-9_.-]{0,127})@)?(\[[0-9A-Fa-f:]+\]|[A-Za-z0-9][A-Za-z0-9.-]*):(.+)$/.exec(remoteUrl);
  if (!match || remoteUrl.includes('://')) invalid();
  return {host: hostName(match[2]), port: 22, username: match[1] || 'git', path: repoPath(match[3])};
}
export function parseGitRemote(remoteUrl) {
  if (typeof remoteUrl === 'string' && /^https?:\/\//.test(remoteUrl)) {
    let url; try { url = new URL(remoteUrl); } catch { invalid(); }
    if (controls.test(remoteUrl) || /[\\?#\s]/.test(remoteUrl) || url.username || url.password || !url.hostname) invalid();
    return {type: url.protocol.slice(0, -1), url: url.href, host: url.hostname, port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)), path: url.pathname};
  }
  const parsed = parseSshRemote(remoteUrl); return {type: 'ssh', url: remoteUrl, ...parsed};
}
export function quoteSshRepoPath(path) { return "'" + repoPath(path).replace(/'/g, "'\\''") + "'"; }
function connectionConfig(input, {requireTrust = true} = {}) {
  if (!input || typeof input !== 'object') invalid();
  const host = hostName(input.host?.includes(':') && !input.host.startsWith('[') ? '[' + input.host + ']' : input.host);
  const port = input.port ?? 22, username = input.username ?? 'git';
  if (!validPort(port) || !validUser(username)) invalid();
  const trustedFingerprint = input.trustedFingerprint ?? input.hostFingerprint;
  if (requireTrust && !validFingerprint(trustedFingerprint)) fail('SSH_HOST_UNTRUSTED', 'Inspect and explicitly trust the SSH host fingerprint before connecting');
  if (requireTrust && (typeof input.privateKey !== 'string' || !input.privateKey || input.privateKey.length > 1024 * 1024 || (input.passphrase !== undefined && (typeof input.passphrase !== 'string' || input.passphrase.length > 16000)))) invalid();
  return {host, port, username, privateKey: input.privateKey, passphrase: input.passphrase, trustedFingerprint};
}
function options({signal, timeoutMs = 30000, maxResponseBytes = MAX_BYTES} = {}) {
  if (signal !== undefined && !(signal instanceof AbortSignal) || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000 || !Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 4 || maxResponseBytes > MAX_BYTES) invalid();
  return {signal, timeoutMs, maxResponseBytes};
}

// Own every socket and channel until completion. No errors from ssh2 or remote stderr escape.
async function runSsh(config, opts, work, scan = false) {
  const {signal, timeoutMs} = options(opts);
  if (signal?.aborted) fail('SSH_ABORTED', 'SSH operation was cancelled');
  return new Promise((resolve, reject) => {
    const client = new Client(); const channels = new Set(); let settled = false, observed;
    const finish = (error, result) => {
      if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      for (const stream of channels) { try { stream.destroy(); } catch {} }
      try { client.destroy(); } catch {}
      if (error) reject(error instanceof SshTransportError ? error : new SshTransportError('SSH_CONNECTION_FAILED', 'SSH connection failed'));
      else resolve(result);
    };
    const abort = () => finish(new SshTransportError('SSH_ABORTED', 'SSH operation was cancelled'));
    const timer = setTimeout(() => finish(new SshTransportError('SSH_TIMEOUT', 'SSH operation timed out; a submitted push may still have completed remotely')), timeoutMs);
    signal?.addEventListener('abort', abort, {once: true});
    const manage = stream => {
      if (settled) { stream.destroy(); fail('SSH_ABORTED', 'SSH operation was cancelled'); }
      channels.add(stream); stream.on('error', () => finish(new SshTransportError('SSH_CONNECTION_FAILED', 'SSH channel failed')));
      let stderrBytes = 0;
      stream.stderr.on('data', bytes => { stderrBytes += bytes.length; if (stderrBytes > 65536) finish(new SshTransportError('SSH_TOO_LARGE', 'SSH remote diagnostic output exceeded its limit')); });
      return stream;
    };
    client.on('error', error => {
      if (scan && observed) return finish(null, observed);
      finish(observed && observed !== config.trustedFingerprint && !scan ? new SshTransportError('SSH_HOST_CHANGED', 'SSH host key changed; inspect and explicitly confirm the new fingerprint', {fingerprint: observed, expectedFingerprint: config.trustedFingerprint}) : new SshTransportError(error?.level === 'client-authentication' ? 'SSH_AUTH_FAILED' : 'SSH_CONNECTION_FAILED', error?.level === 'client-authentication' ? 'SSH key authentication failed; verify the public key is registered on the server' : 'SSH connection failed'));
    });
    client.on('close', () => { if (!settled) finish(scan && observed ? null : new SshTransportError('SSH_CONNECTION_FAILED', 'SSH connection closed before the operation completed'), observed); });
    client.once('ready', () => { Promise.resolve().then(() => work(client, manage, () => !settled)).then(result => finish(null, result), error => finish(error)); });
    try {
      client.connect({host: config.host, port: config.port, username: config.username, readyTimeout: timeoutMs,
        ...(scan ? {authHandler: () => false} : {privateKey: config.privateKey, passphrase: config.passphrase, authHandler: ['publickey']}),
        hostVerifier: key => {
          observed = sshFingerprint(key);
          if (scan) { queueMicrotask(() => finish(null, observed)); return false; }
          if (!validFingerprint(config.trustedFingerprint)) return false;
          return timingSafeEqual(Buffer.from(observed), Buffer.from(config.trustedFingerprint));
        }
      });
    } catch { finish(new SshTransportError('SSH_INVALID_KEY', 'SSH private key or connection configuration is invalid')); }
  });
}
export async function inspectSshHost(connection, opts = {}) {
  const config = connectionConfig(connection, {requireTrust: false});
  const fingerprint = await runSsh(config, opts, () => undefined, true);
  return {host: config.host, port: config.port, fingerprint};
}
export async function testSshConnection(connection, opts = {}) {
  const config = connectionConfig(connection);
  return runSsh(config, opts, () => ({authenticated: true}));
}
function packet(text) { const bytes = Buffer.from(text); return Buffer.concat([Buffer.from((bytes.length + 4).toString(16).padStart(4, '0')), bytes]); }
function readAdvertisement(stream, limit) {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0), offset = 0;
    const clean = () => { stream.off('data', data); stream.off('end', end); stream.off('close', end); stream.off('error', error); };
    const error = () => { clean(); reject(new SshTransportError('SSH_CONNECTION_FAILED', 'SSH advertisement could not be read')); };
    const end = () => { clean(); reject(new SshTransportError('SSH_PROTOCOL_ERROR', 'SSH remote ended before its Git advertisement flush')); };
    const data = chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length > limit) { clean(); reject(new SshTransportError('SSH_TOO_LARGE', 'Git advertisement exceeded its size limit')); return; }
      while (buffer.length - offset >= 4) {
        const header = buffer.toString('ascii', offset, offset + 4);
        if (!/^[0-9a-fA-F]{4}$/.test(header)) { clean(); reject(new SshTransportError('SSH_PROTOCOL_ERROR', 'SSH remote sent an invalid Git packet header')); return; }
        const length = parseInt(header, 16);
        if (length === 0) {
          stream.pause(); clean();
          const after = offset + 4;
          if (buffer.length > after) stream.unshift(buffer.subarray(after));
          resolve(buffer.subarray(0, after)); return;
        }
        if (length < 4 || length > 65520) { clean(); reject(new SshTransportError('SSH_PROTOCOL_ERROR', 'SSH remote sent an unsupported Git packet')); return; }
        if (buffer.length - offset < length) return;
        if (buffer.toString('ascii', offset + 4, offset + 8) === 'ERR ') { clean(); reject(new SshTransportError('SSH_REMOTE_ERROR', 'SSH remote rejected the Git request')); return; }
        offset += length;
      }
    };
    stream.on('data', data); stream.once('end', end); stream.once('close', end); stream.once('error', error); stream.resume();
  });
}
async function writeBody(stream, body, limit, active) {
  const source = body instanceof Uint8Array ? [body] : body;
  if (!source || !(source[Symbol.asyncIterator] || source[Symbol.iterator])) fail('SSH_INVALID_INPUT', 'Git request body must contain byte chunks');
  let size = 0;
  for await (const chunk of source) {
    if (!active() || stream.destroyed) fail('SSH_ABORTED', 'SSH operation was cancelled');
    if (!(chunk instanceof Uint8Array)) fail('SSH_INVALID_INPUT', 'Git request body must contain byte chunks');
    size += chunk.byteLength; if (size > limit) fail('SSH_TOO_LARGE', 'Git request exceeded its size limit');
    if (!stream.write(chunk)) await new Promise((resolve, reject) => {
      const clean = () => { stream.off('drain', done); stream.off('close', closed); stream.off('error', closed); };
      const done = () => { clean(); resolve(); };
      const closed = () => { clean(); reject(new SshTransportError('SSH_CONNECTION_FAILED', 'SSH channel closed while sending Git request')); };
      stream.once('drain', done); stream.once('close', closed); stream.once('error', closed);
    });
  }
  if (!active()) fail('SSH_ABORTED', 'SSH operation was cancelled');
  stream.end();
}
function readResponse(stream, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let total = 0, ended = false, exitCode;
    const clean = () => { stream.off('data', data); stream.off('end', end); stream.off('close', close); stream.off('error', error); stream.off('exit', exit); };
    const error = () => { clean(); reject(new SshTransportError('SSH_CONNECTION_FAILED', 'SSH response could not be read')); };
    const exit = code => { exitCode = code; };
    const end = () => { ended = true; };
    const data = chunk => {
      total += chunk.length;
      if (total > limit) { clean(); reject(new SshTransportError('SSH_TOO_LARGE', 'Git response exceeded its size limit')); return; }
      chunks.push(chunk);
    };
    const close = () => {
      clean();
      if (exitCode !== undefined && exitCode !== 0 || !ended) { reject(new SshTransportError('SSH_REMOTE_ERROR', 'SSH remote Git command failed', {exitCode: Number.isSafeInteger(exitCode) ? exitCode : null})); return; }
      const bytes = Buffer.concat(chunks, total);
      if (bytes.length >= 8 && /^[0-9a-fA-F]{4}$/.test(bytes.toString('ascii', 0, 4)) && bytes.toString('ascii', 4, 8) === 'ERR ') { reject(new SshTransportError('SSH_REMOTE_ERROR', 'SSH remote rejected the Git request')); return; }
      resolve(bytes);
    };
    stream.on('data', data); stream.on('end', end); stream.on('close', close); stream.on('error', error); stream.on('exit', exit); stream.resume();
  });
}
export function createSshHttpClient({remoteUrl, credentials, signal, timeoutMs = 30000, maxResponseBytes = MAX_BYTES} = {}) {
  const remote = parseSshRemote(remoteUrl), connection = connectionConfig(credentials), limits = options({signal, timeoutMs, maxResponseBytes});
  if (remote.host !== connection.host || remote.port !== connection.port || remote.username !== connection.username) fail('SSH_PROFILE_MISMATCH', 'SSH profile host, port and username must match the Git remote');
  return {virtualUrl: VIRTUAL_URL, request: async ({url, method = 'GET', body, signal: requestSignal} = {}) => {
    let parsed; try { parsed = new URL(url); } catch { invalid(); }
    if (requestSignal !== undefined && !(requestSignal instanceof AbortSignal)) invalid();
    const combined = requestSignal && signal ? AbortSignal.any([requestSignal, signal]) : requestSignal || signal;
    options({...limits, signal: combined});
    const route = parsed.pathname.slice('/repository'.length);
    const service = method === 'GET' && route === '/info/refs' && parsed.searchParams.size === 1 ? parsed.searchParams.get('service') : method === 'POST' && !parsed.search ? route.slice(1) : null;
    if (parsed.origin !== new URL(VIRTUAL_URL).origin || !parsed.pathname.startsWith('/repository/') || parsed.username || parsed.password || parsed.hash || !['git-upload-pack', 'git-receive-pack'].includes(service) || method === 'POST' && route !== '/' + service) invalid();
    const bytes = await runSsh(connection, {...limits, signal: combined}, async (client, manage, active) => {
      const stream = await new Promise((resolve, reject) => client.exec(service + ' ' + quoteSshRepoPath(remote.path), {allowHalfOpen: true}, (error, channel) => {
        if (error) { reject(new SshTransportError('SSH_REMOTE_ERROR', 'SSH remote refused the Git command')); return; }
        try { resolve(manage(channel)); } catch (failure) { reject(failure); }
      }));
      const advert = await readAdvertisement(stream, Math.min(MAX_ADVERTISEMENT, maxResponseBytes));
      if (method === 'GET') {
        const result = Buffer.concat([packet('# service=' + service + '\n'), Buffer.from('0000'), advert]);
        if (result.length > maxResponseBytes) fail('SSH_TOO_LARGE', 'Git advertisement exceeded its size limit');
        return result;
      }
      const response = readResponse(stream, maxResponseBytes);
      // Register response readers before sending; remote output can arrive while writing.
      const sent = writeBody(stream, body, maxResponseBytes, active);
      const [result] = await Promise.all([response, sent]); return result;
    });
    return {url, method, statusCode: 200, statusMessage: 'OK', headers: {'content-type': 'application/x-' + service + (method === 'GET' ? '-advertisement' : '-result')}, body: [bytes]};
  }};
}
export function createSSHTransport(input) { const client = createSshHttpClient(input); return {url: client.virtualUrl, http: {request: client.request}}; }

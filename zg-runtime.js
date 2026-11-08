// Shared, pure protocol validation. Native SDK/filesystem are loaded only by zg-helper.
import {createHash} from 'node:crypto';
export const ZG_SDK_VERSION = '0.2.1';
export const ZG_MODEL = 'local/potion-code-16m-v2';
export const ZG_MODEL_REPO = 'minishlab/potion-code-16M-v2';
export const ZG_MODEL_REVISION = 'e9d2a44ca6a05ac6685f3b23709ea57eb7352d5b';
export const ZG_MAX_INPUT = 96 * 1024 * 1024;
export const ZG_MAX_OUTPUT = 2 * 1024 * 1024;
export const ZG_MAX_FILE = 1024 * 1024;
export const ZG_MAX_CORPUS = 64 * 1024 * 1024;
export const ZG_MODES = ['bm25', 'semantic', 'hybrid'];
export class ZgError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = 'ZgError'; this.code = code; this.details = details; }
}
export const zgFail = (code, message, details) => { throw new ZgError(code, message, details); };
export const zgDigest = value => createHash('sha256').update(value).digest('hex');
export function zgIdentity(input) {
  if (typeof input?.knowledgeId !== 'string' || !/^k-[A-Za-z0-9-]{1,80}$/.test(input.knowledgeId) || !Number.isSafeInteger(input.sourceVersion) || input.sourceVersion < 1) zgFail('ZG_INVALID_INPUT', 'Supply a knowledge ID and positive frozen source version');
  return {knowledgeId: input.knowledgeId, sourceVersion: input.sourceVersion};
}
export function zgRelativePath(value) {
  if (typeof value !== 'string' || !value || value.length > 2000 || /[\\\x00-\x1f\x7f]/.test(value) || value.startsWith('/') || /^[A-Za-z]:/.test(value) || value.split('/').some(part => !part || part === '.' || part === '..' || /^(?:\.git|\.ssh|\.workbench|\.zvec-grep|node_modules|credentials|secrets?|\.env)(?:$|[.-])/i.test(part))) zgFail('ZG_UNSAFE_PATH', 'Knowledge projection must use a safe relative document path');
  return value;
}
export function zgMode(value = 'bm25') { if (!ZG_MODES.includes(value)) zgFail('ZG_INVALID_INPUT', 'Choose bm25, semantic or hybrid'); return value; }
export function zgFiles(files) {
  if (!Array.isArray(files) || !files.length || files.length > 2000) zgFail('ZG_INVALID_INPUT', 'Supply between 1 and 2000 text projection files');
  let total = 0; const seen = new Set();
  return files.map(file => {
    const path = zgRelativePath(file.path), documentId = file.documentId ?? null;
    if (documentId !== null && (typeof documentId !== 'string' || !/^d-[A-Za-z0-9-]{1,80}$/.test(documentId))) zgFail('ZG_INVALID_INPUT', 'Invalid source document identifier');
    let bytes;
    if (typeof file.text === 'string') bytes = Buffer.from(file.text);
    else if (file.bytes instanceof Uint8Array) bytes = Buffer.from(file.bytes);
    else if (typeof file.bytesBase64 === 'string') { bytes = Buffer.from(file.bytesBase64, 'base64'); if (bytes.toString('base64') !== file.bytesBase64) zgFail('ZG_INVALID_INPUT', 'Invalid projection bytes'); }
    else zgFail('ZG_INVALID_INPUT', 'Supply UTF-8 text or bytes for each projection');
    total += bytes.length;
    if (!bytes.length || bytes.length > ZG_MAX_FILE || total > ZG_MAX_CORPUS) zgFail('ZG_TOO_LARGE', 'Text projections are limited to 1 MiB each and 64 MiB per index');
    try { const text = new TextDecoder('utf-8', {fatal: true}).decode(bytes); if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text)) throw new Error(); } catch { zgFail('ZG_INVALID_INPUT', 'Knowledge indexes accept real UTF-8 text projections only'); }
    // UTF-8 projections use a guaranteed supported scanner suffix; citations retain
    // the original source path separately, including code/config extensions.
    const corpusPath = (documentId ? `documents/${documentId}/${path}` : `documents/${path}`) + '.txt';
    if (seen.has(corpusPath)) zgFail('ZG_INVALID_INPUT', 'Duplicate document projection path'); seen.add(corpusPath);
    return {path, documentId, corpusPath, sha256: zgDigest(bytes), bytes: bytes.length, bytesBase64: bytes.toString('base64')};
  });
}
export function zgSystemProxy(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 8192) return {};
  const result = {};
  for (const [prefix, variable] of [['HTTP', 'HTTP_PROXY'], ['HTTPS', 'HTTPS_PROXY']]) {
    const field = name => new RegExp('^\\s*' + prefix + name + '\\s*:\\s*([^\\r\\n]+)\\s*$', 'm').exec(text)?.[1]?.trim();
    const enabled = field('Enable'), host = field('Proxy'), port = Number(field('Port'));
    if (enabled !== '1' || !host || !/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9.-]{0,251}[a-zA-Z0-9])?|\[[0-9a-fA-F:]+\])$/.test(host) || !Number.isInteger(port) || port < 1 || port > 65535) continue;
    result[variable] = `http://${host}:${port}`;
  }
  return result;
}
export function zgProgress(value) {
  const result = {};
  for (const key of ['phase', 'stage']) if (typeof value?.[key] === 'string' && /^[a-z_]{1,40}$/.test(value[key])) result[key] = value[key];
  for (const key of ['filesTotal', 'filesIndexed', 'filesFailed', 'downloadedBytes', 'totalBytes']) if (Number.isFinite(value?.[key]) && value[key] >= 0) result[key] = value[key];
  if (value?.embedding) result.embedding = zgProgress(value.embedding);
  return result;
}

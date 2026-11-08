import test from 'node:test';
import assert from 'node:assert/strict';
import {zgFiles, zgIdentity, zgMode, zgProgress, zgRelativePath, zgSystemProxy} from './zg-runtime.js';
test('projection paths are document isolated and UTF-8 bytes are verified', () => {
  const files = zgFiles([{documentId: 'd-a', path: 'guide.md', text: 'first'}, {documentId: 'd-b', path: 'guide.md', bytes: Buffer.from('second')}]);
  assert.notEqual(files[0].corpusPath, files[1].corpusPath); assert.equal(files[0].path, files[1].path);
  assert.throws(() => zgFiles([{path: 'file.txt', bytes: Buffer.from([0xff, 0x80])}]), {code: 'ZG_INVALID_INPUT'});
  assert.throws(() => zgFiles([{path: 'file.txt', text: 'a'}, {path: 'file.txt', text: 'b'}]), {code: 'ZG_INVALID_INPUT'});
  assert.throws(() => zgFiles([{path: 'file.txt', bytesBase64: 'not valid base64'}]), {code: 'ZG_INVALID_INPUT'});
});
test('knowledge identity, private paths and budgets fail closed', () => {
  for (const value of ['../outside', '.env.local', '.git/config', 'node_modules/code.js', 'a/../b', '/root', 'a\\b', 'credentials/token']) assert.throws(() => zgRelativePath(value), {code: 'ZG_UNSAFE_PATH'});
  assert.throws(() => zgIdentity({knowledgeId: 'k-one', sourceVersion: 0}), {code: 'ZG_INVALID_INPUT'});
  assert.throws(() => zgMode('remote'), {code: 'ZG_INVALID_INPUT'});
  assert.throws(() => zgFiles([{path: 'large.txt', text: 'a'.repeat(1024 * 1024 + 1)}]), {code: 'ZG_TOO_LARGE'});
});
test('system proxy parser accepts only enabled hosts and numeric ports without shell syntax', () => {
  assert.deepEqual(zgSystemProxy('HTTPEnable : 1\nHTTPProxy : localhost\nHTTPPort : 1234\nHTTPSEnable : 1\nHTTPSProxy : 127.0.0.1\nHTTPSPort : 4321'), {HTTP_PROXY: 'http://localhost:1234', HTTPS_PROXY: 'http://127.0.0.1:4321'});
  for (const host of ["127.0.0.1';touch /tmp/injection", 'user:secret@host', 'host/path', 'a b']) assert.deepEqual(zgSystemProxy(`HTTPSEnable : 1\nHTTPSProxy : ${host}\nHTTPSPort : 4321`), {});
  assert.deepEqual(zgSystemProxy('HTTPSEnable : 0\nHTTPSProxy : localhost\nHTTPSPort : 1234'), {});
  assert.deepEqual(zgSystemProxy('HTTPSEnable : 1\nHTTPSProxy : localhost\nHTTPSPort : 999999'), {});
});
test('progress contains bounded counters and phases without native paths or messages', () => {
  assert.deepEqual(zgProgress({phase: 'indexing', filesTotal: 3, detail: '/private/secret', embedding: {stage: 'downloading', downloadedBytes: 1, message: 'sensitive diagnostic'}}), {phase: 'indexing', filesTotal: 3, embedding: {stage: 'downloading', downloadedBytes: 1}});
});

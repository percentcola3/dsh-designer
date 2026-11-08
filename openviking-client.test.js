import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import test from 'node:test';
import {OpenVikingClient, normalizeOpenVikingConfig, uriWithinRoot} from './openviking-client.js';

// Real HTTP fixtures exercise Node's fetch, multipart encoding, streaming and cancellation.
// They verify transport interoperability, not a live embedding/semantic service.
async function fixture(t, handle) {
  const requests = [];
  const server = http.createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const receipt = {method: request.method, url: new URL(request.url, 'http://fixture'), headers: request.headers, bytes: Buffer.concat(chunks)};
    requests.push(receipt);
    try { await handle(receipt, response); }
    catch { response.destroy(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return {endpoint: `http://127.0.0.1:${server.address().port}`, requests};
}
const json = (response, value, status = 200) => { response.writeHead(status, {'content-type': 'application/json'}); response.end(JSON.stringify(value)); };
const ok = (response, result, extra = {}) => json(response, {status: 'ok', result, ...extra});
const code = expected => error => { assert.equal(error.code, `OPENVIKING_${expected}`); return true; };
const root = 'viking://resources/dsh-knowledge/k-1';

test('configuration preserves trusted path prefixes, private HTTP and default endpoint', () => {
  assert.deepEqual(normalizeOpenVikingConfig(), {endpoint: 'http://localhost:1933', apiKey: '', timeoutMs: 30000});
  assert.equal(normalizeOpenVikingConfig({endpoint: 'http://10.0.0.2:1933/gateway/ov///'}).endpoint, 'http://10.0.0.2:1933/gateway/ov');
  assert.equal(normalizeOpenVikingConfig({endpoint: 'https://example.com/ov'}).endpoint, 'https://example.com/ov');
  for (const endpoint of ['file:///tmp/a', 'http://secret@example.com', 'https://example.com?a=secret', 'https://example.com#secret', 'https://example.com?', 'http://example.com\\other', 'http://example.com\n', 'relative']) {
    assert.throws(() => normalizeOpenVikingConfig({endpoint}), code('INVALID_CONFIG'));
  }
  for (const apiKey of ['secret\r\nX-Header: stolen', 'secret\u0000', 1]) assert.throws(() => normalizeOpenVikingConfig({apiKey}), code('INVALID_CONFIG'));
  for (const timeoutMs of [0, -1, NaN, Infinity, 300001, '5000']) assert.throws(() => normalizeOpenVikingConfig({timeoutMs}), code('INVALID_CONFIG'));
});

test('URI containment respects segment boundaries and rejects ambiguous traversal', () => {
  for (const uri of [root, root + '/', root + '/doc/a.md', root + '/设计说明.md', root + '/hello%20world.md']) assert.equal(uriWithinRoot(uri, root + '/'), true, uri);
  for (const uri of [root + '-other/a', 'viking://resources/other/a', root + '/../other', root + '/%2e%2e/a', root + '/%252e%252e/a', root + '/a%2fb', root + '/a%255cb', root + '//a', root + '/a?raw=true', root + '/a#x', root + '/a\u0000', 'https://example.com']) assert.equal(uriWithinRoot(uri, root), false, uri);
  assert.equal(uriWithinRoot(root, root + '/doc'), false);
  assert.equal(uriWithinRoot(root, 'viking://resources/../dsh-knowledge'), false);
  assert.equal(uriWithinRoot(null, root), false);
});

test('probe uses prefixed /health with X-API-Key and verifies the official health shape', async t => {
  const {endpoint, requests} = await fixture(t, (_, response) => json(response, {status: 'ok', healthy: true, version: '0.1.1', auth_mode: 'api_key', role: 'USER'}));
  const client = new OpenVikingClient({endpoint: endpoint + '/gateway/ov/', apiKey: 'secret-key'});
  const result = await client.probe();
  assert.equal(result.healthy, true); assert.equal(result.auth_mode, 'api_key');
  assert.equal(requests[0].url.pathname, '/gateway/ov/health');
  assert.equal(requests[0].headers['x-api-key'], 'secret-key');
  assert.equal(requests[0].headers.authorization, undefined);
});

test('anonymous development health sends no key; healthy false remains false', async t => {
  const {endpoint, requests} = await fixture(t, (_, response) => json(response, {status: 'ok', healthy: false, version: '0.1.1'}));
  assert.equal((await new OpenVikingClient({endpoint}).probe()).healthy, false);
  assert.equal(requests[0].headers['x-api-key'], undefined);
});

test('upload uses actual multipart file bytes and import returns submission without inventing readiness', async t => {
  const bytes = Buffer.from([0, 1, 2, 255, 13, 10, 65]);
  const {endpoint, requests} = await fixture(t, (request, response) => {
    if (request.url.pathname.endsWith('/temp_upload')) ok(response, {temp_file_id: 'upload_abc.md'});
    else ok(response, {status: 'success', root_uri: root + '/d-1', task_id: 'task-123'});
  });
  const client = new OpenVikingClient({endpoint});
  const uploaded = await client.upload({bytes, name: 'guide.md', mimeType: 'text/markdown'});
  assert.equal(uploaded.temp_file_id, 'upload_abc.md');
  const upload = requests[0];
  assert.equal(upload.method, 'POST'); assert.equal(upload.url.pathname, '/api/v1/resources/temp_upload');
  assert.match(upload.headers['content-type'], /^multipart\/form-data; boundary=/);
  assert.match(upload.bytes.toString('utf8'), /name="file"; filename="guide.md"/);
  assert.match(upload.bytes.toString('utf8'), /Content-Type: text\/markdown/i);
  assert.notEqual(upload.bytes.indexOf(bytes), -1);
  const result = await client.addResource({tempFileId: uploaded.temp_file_id, to: root + '/d-1', sourceName: 'guide.md'});
  assert.deepEqual(JSON.parse(requests[1].bytes), {temp_file_id: 'upload_abc.md', to: root + '/d-1', wait: false, source_name: 'guide.md'});
  assert.equal(result.status, 'success'); assert.equal(result.task_id, 'task-123'); assert.equal(result.ready, undefined);
  assert.equal(requests.length, 2);
});

test('task returns each actual remote lifecycle status, stage and sanitized error', async t => {
  let state = 'pending';
  const {endpoint, requests} = await fixture(t, (_, response) => ok(response, {task_id: 'task-123', status: state, stage: state === 'running' ? 'processing_queue' : null, error: state === 'failed' ? 'Provider rejected secret-key' : null}));
  const client = new OpenVikingClient({endpoint, apiKey: 'secret-key'});
  for (state of ['pending', 'running', 'cancelling', 'completed', 'failed', 'cancelled']) {
    const result = await client.task({taskId: 'task-123'});
    assert.equal(result.status, state);
    assert.equal(result.stage, state === 'running' ? 'processing_queue' : null);
    if (state === 'failed') assert.equal(result.error, 'Provider rejected [redacted]');
  }
  assert.equal(requests[0].url.pathname, '/api/v1/tasks/task-123');
});

test('find scopes retrieval to resource URI without reading whole matched files', async t => {
  const resources = [{uri: root + '/d-1/guide.md', context_type: 'resource', level: 2, score: 2.3, abstract: 'Guide'}];
  const {endpoint, requests} = await fixture(t, (_, response) => ok(response, {resources, memories: [], skills: [], total: 1}));
  const result = await new OpenVikingClient({endpoint}).find({query: 'design tokens', targetUri: root, limit: 7});
  assert.deepEqual(result.resources, resources);
  assert.equal(requests[0].url.pathname, '/api/v1/search/find');
  assert.deepEqual(JSON.parse(requests[0].bytes), {query: 'design tokens', target_uri: root, context_type: 'resource', limit: 7, read_content: false});
});

test('directory listing preserves official pagination and original structured entries', async t => {
  const entries = [{name: 'guide.md', isDir: false, uri: root + '/guide.md'}];
  const {endpoint, requests} = await fixture(t, (_, response) => ok(response, entries, {has_more: true}));
  const result = await new OpenVikingClient({endpoint}).list({uri: root, offset: 20, limit: 10});
  assert.deepEqual(result, {result: entries, hasMore: true, offset: 20, limit: 10});
  assert.equal(requests[0].url.pathname, '/api/v1/fs/ls');
  assert.deepEqual(Object.fromEntries(requests[0].url.searchParams), {uri: root, output: 'original', offset: '20', limit: '10'});
});

test('content read sends line pagination; abstract/overview send only official URI parameter', async t => {
  const {endpoint, requests} = await fixture(t, (_, response) => ok(response, '第一行\nsecond line'));
  const client = new OpenVikingClient({endpoint});
  assert.equal(await client.read({uri: root + '/guide.md', offset: 2, limit: 3}), '第一行\nsecond line');
  assert.deepEqual(Object.fromEntries(requests[0].url.searchParams), {uri: root + '/guide.md', offset: '2', limit: '3'});
  assert.equal(requests[0].url.pathname, '/api/v1/content/read');
  for (const level of ['abstract', 'overview']) {
    await client.read({uri: root, level, offset: 2, limit: 3});
    assert.equal(requests.at(-1).url.pathname, '/api/v1/content/' + level);
    assert.deepEqual(Object.fromEntries(requests.at(-1).url.searchParams), {uri: root});
  }
});

test('401/403 errors are actionable and never expose remote body or key', async t => {
  let status = 401;
  const {endpoint} = await fixture(t, (_, response) => json(response, {status: 'error', error: {message: 'secret-key private/path local stack'}}, status));
  const client = new OpenVikingClient({endpoint, apiKey: 'secret-key'});
  for (status of [401, 403, 500]) await assert.rejects(client.find({query: 'private query', targetUri: root}), error => {
    assert.equal(error.code, 'OPENVIKING_HTTP_ERROR'); assert.equal(error.statusCode, status);
    assert.equal(error.details.status, status);
    assert.doesNotMatch(JSON.stringify(error) + error.stack, /secret-key|private\/path|private query/);
    if (status === 401) assert.match(error.message, /authentication/);
    if (status === 403) assert.match(error.message, /USER or ADMIN/);
    return true;
  });
});

test('redirect is blocked before sending key or replaying mutation to another server', async t => {
  const destination = await fixture(t, (_, response) => ok(response, {}));
  const source = await fixture(t, (_, response) => { response.writeHead(307, {location: destination.endpoint + '/steal'}); response.end('secret-key'); });
  const client = new OpenVikingClient({endpoint: source.endpoint, apiKey: 'secret-key'});
  await assert.rejects(client.addResource({tempFileId: 'upload_id', to: root + '/d-1'}), code('REDIRECT_BLOCKED'));
  assert.equal(source.requests.length, 1); assert.equal(destination.requests.length, 0);
});

test('HTTP mutation errors never trigger automatic retry', async t => {
  const {endpoint, requests} = await fixture(t, (_, response) => json(response, {status: 'error'}, 503));
  const client = new OpenVikingClient({endpoint});
  await assert.rejects(client.upload({bytes: Buffer.from('guide'), name: 'guide.md'}), code('HTTP_ERROR'));
  await assert.rejects(client.addResource({tempFileId: 'upload_id', to: root + '/d-1'}), code('HTTP_ERROR'));
  assert.equal(requests.length, 2);
});

test('timeout covers response headers and mutation body without retrying', async t => {
  let stream = false;
  const {endpoint, requests} = await fixture(t, (_, response) => {
    if (stream) { response.writeHead(200, {'content-type': 'application/json'}); response.write('{"status":"ok","result":'); }
  });
  const client = new OpenVikingClient({endpoint, timeoutMs: 60});
  await assert.rejects(client.probe(), code('TIMEOUT'));
  stream = true;
  await assert.rejects(client.addResource({tempFileId: 'upload_id', to: root + '/d-1'}), code('TIMEOUT'));
  assert.equal(requests.length, 2);
});

test('caller cancellation covers stalled response body and discards the abort reason', async t => {
  const bodyStarted = Promise.withResolvers();
  const {endpoint, requests} = await fixture(t, (_, response) => {
    response.writeHead(200, {'content-type': 'application/json'}); response.write('{"status":"ok","result":'); bodyStarted.resolve();
  });
  const controller = new AbortController();
  const result = new OpenVikingClient({endpoint}).read({uri: root + '/guide.md', signal: controller.signal});
  const rejected = assert.rejects(result, error => { code('ABORTED')(error); assert.doesNotMatch(error.message, /secret/); return true; });
  await bodyStarted.promise; controller.abort(new Error('secret-key'));
  await rejected; assert.equal(requests.length, 1);
  await assert.rejects(new OpenVikingClient({endpoint}).probe({signal: controller.signal}), code('ABORTED'));
  assert.equal(requests.length, 1);
});

test('timeout remains bounded when an injected fetch implementation ignores abort', async () => {
  const client = new OpenVikingClient({fetchImpl: () => new Promise(() => {}), timeoutMs: 10});
  await assert.rejects(client.probe(), code('TIMEOUT'));
});

test('connection exceptions discard injected external exception details', async () => {
  const client = new OpenVikingClient({apiKey: 'secret-key', fetchImpl: async () => { throw new Error('secret-key https://private.example/query'); }});
  await assert.rejects(client.probe(), error => {
    code('CONNECTION_FAILED')(error); assert.doesNotMatch(error.stack + JSON.stringify(error), /secret-key|private.example/); assert.equal(error.cause, undefined); return true;
  });
});

test('unrelated 200 pages, malformed envelopes and invalid result shapes are rejected', async t => {
  let reply;
  const {endpoint} = await fixture(t, (_, response) => reply(response));
  const client = new OpenVikingClient({endpoint});
  for (const body of ['<html>login</html>', '{"status":"ok"}', '{"status":"ok","healthy":true}', '{"status":"error","error":"secret"}', 'malformed']) {
    reply = response => { response.writeHead(200, {'content-type': body.startsWith('<') ? 'text/html' : 'application/json'}); response.end(body); };
    await assert.rejects(client.probe(), code('PROTOCOL_ERROR'));
  }
  for (const result of [{}, 'text', []]) {
    reply = response => ok(response, result);
    await assert.rejects(client.upload({bytes: Buffer.from('a'), name: 'a.md'}), code('PROTOCOL_ERROR'));
  }
  reply = response => ok(response, {status: 'success'});
  await assert.rejects(client.addResource({tempFileId: 'id', to: root + '/d-1'}), code('PROTOCOL_ERROR'));
  reply = response => ok(response, {stage: 'queued'});
  await assert.rejects(client.task({taskId: 'task-123'}), code('PROTOCOL_ERROR'));
  reply = response => ok(response, null);
  assert.equal(await client.task({taskId: 'task-123'}), null);
});

test('response body cap applies with and without a declared content length', async t => {
  let declared = true;
  const {endpoint} = await fixture(t, (_, response) => {
    response.writeHead(200, {'content-type': 'application/json', ...(declared ? {'content-length': String(3 * 1024 * 1024)} : {})});
    response.end(JSON.stringify({status: 'ok', result: 'a'.repeat(2 * 1024 * 1024)}));
  });
  const client = new OpenVikingClient({endpoint});
  await assert.rejects(client.read({uri: root + '/large.md'}), code('RESPONSE_TOO_LARGE'));
  declared = false;
  await assert.rejects(client.read({uri: root + '/large.md'}), code('RESPONSE_TOO_LARGE'));
});

test('invalid request arguments fail before any HTTP traffic', async t => {
  const {endpoint, requests} = await fixture(t, (_, response) => ok(response, {}));
  const client = new OpenVikingClient({endpoint});
  for (const invoke of [
    () => client.find({query: 'q', targetUri: root + '/../escape'}),
    () => client.find({query: 'q', targetUri: root, limit: -1}),
    () => client.list({uri: root, offset: -1}),
    () => client.read({uri: root, limit: 10001}),
    () => client.read({uri: root, level: 'raw'}),
    () => client.upload({bytes: 'text', name: 'a.md'}),
    () => client.upload({bytes: Buffer.from('a'), name: '../a.md'}),
    () => client.task({taskId: '../admin'}),
    () => client.addResource({tempFileId: 'id', to: 'file:///local'}),
    () => client.probe({signal: {aborted: false}}),
  ]) await assert.rejects(invoke(), code('INVALID_ARGUMENT'));
  assert.equal(requests.length, 0);
});

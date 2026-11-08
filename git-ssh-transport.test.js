import assert from 'node:assert/strict';
import test from 'node:test';
import {once} from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn, spawnSync} from 'node:child_process';
import git from 'isomorphic-git';
import ssh2 from 'ssh2';
import {createSSHTransport, createSshHttpClient, inspectSshHost, parseGitRemote, parseSshRemote, quoteSshRepoPath, sshFingerprint, testSshConnection} from './git-ssh-transport.js';
const {Server, utils} = ssh2;
const hostKey = utils.generateKeyPairSync('ed25519'), userKey = utils.generateKeyPairSync('ed25519'), otherKey = utils.generateKeyPairSync('ed25519');
const parsed = value => { const key = utils.parseKey(value); return Array.isArray(key) ? key[0] : key; };
const fingerprint = key => sshFingerprint(parsed(key).getPublicSSH());
const pkt = text => { const bytes = Buffer.from(text); return Buffer.concat([Buffer.from((bytes.length + 4).toString(16).padStart(4, '0')), bytes]); };
const advertisement = Buffer.concat([pkt('1'.repeat(40) + ' HEAD\0multi_ack side-band-64k\n'), Buffer.from('0000')]);
const code = expected => error => { assert.equal(error.code, expected, error.stack); return true; };
async function fixture(t, {handler, key = hostKey, rejectAuthentication = false} = {}) {
  const commands = [], auth = [], clients = new Set(), activeChannels = new Set();
  const allowed = parsed(userKey.public);
  const server = new Server({hostKeys: [key.private]}, client => {
    clients.add(client); client.on('error', () => {}); client.on('close', () => clients.delete(client));
    client.on('authentication', ctx => {
      auth.push(ctx.method);
      if (!rejectAuthentication && ctx.method === 'publickey' && ctx.username === 'git' && Buffer.from(ctx.key.data).equals(allowed.getPublicSSH()) && (!ctx.signature || allowed.verify(ctx.blob, ctx.signature, ctx.hashAlgo))) ctx.accept(); else ctx.reject();
    });
    client.on('ready', () => client.on('session', accept => {
      const session = accept();
      session.on('exec', (accept, _, info) => {
        commands.push(info.command); const channel = accept(); activeChannels.add(channel); channel.on('error', () => {}); channel.on('close', () => activeChannels.delete(channel));
        if (handler) handler(channel, info.command); else channel.write(advertisement);
      });
    }));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { for (const client of clients) client.end(); await new Promise(resolve => server.close(resolve)); });
  const port = server.address().port;
  return {remoteUrl: `ssh://git@127.0.0.1:${port}/org/repo.git`, credentials: {host: '127.0.0.1', port, username: 'git', privateKey: userKey.private, hostFingerprint: fingerprint(key.public)}, commands, auth, activeChannels};
}
async function bytes(response) { const chunks = []; for await (const chunk of response.body) chunks.push(Buffer.from(chunk)); return Buffer.concat(chunks); }
function finish(channel, value, exit = 0) { channel.exit(exit); channel.end(value, () => channel.close()); }

test('strict SSH/scp parser and remote command quoting never invoke a local shell', () => {
  assert.deepEqual(parseSshRemote('git@example.com:org/repo.git'), {host: 'example.com', port: 22, username: 'git', path: 'org/repo.git'});
  assert.deepEqual(parseSshRemote('ssh://git@Example.com:2222/var/git/a%20repo.git'), {host: 'example.com', port: 2222, username: 'git', path: '/var/git/a repo.git'});
  assert.deepEqual(parseSshRemote('ssh://git@[::1]:2222/var/repo'), {host: '::1', port: 2222, username: 'git', path: '/var/repo'});
  assert.equal(parseGitRemote('https://example.com/org/repo.git').type, 'https');
  assert.equal(parseGitRemote('git@example.com:org/repo.git').type, 'ssh');
  assert.equal(quoteSshRepoPath("org/user's;$(touch HACK)`a`.git"), "'org/user'\\''s;$(touch HACK)`a`.git'");
  for (const remote of ['file:///a', 'https://example.com/a', 'ssh://git:secret@example.com/a', 'ssh://git@example.com/a?x=1', 'ssh://git@example.com/a#x', 'ssh://git@example.com/a/../outside', 'ssh://git@example.com/a/%2e%2e/outside', 'ssh://git@bad;host/repo', 'git@host:-oProxyCommand=bad', 'git@host:../outside', 'git@host:repo\nexec bad', 'git@host:repo\\bad', ' ssh://git@host/repo', 'host:']) assert.throws(() => parseSshRemote(remote), code('SSH_INVALID_INPUT'));
  for (const remote of ['https://token@example.com/repo', 'http://example.com/repo?token=secret', 'http://example.com/repo#x', 'http://example.com/repo\n']) assert.throws(() => parseGitRemote(remote), code('SSH_INVALID_INPUT'));
});

test('host inspection reports SHA256 fingerprint before any user authentication', async t => {
  const server = await fixture(t);
  const result = await inspectSshHost(server.credentials);
  assert.deepEqual(result, {host: '127.0.0.1', port: server.credentials.port, fingerprint: server.credentials.hostFingerprint});
  assert.equal(server.auth.length, 0);
  const credentials = {...server.credentials}; delete credentials.hostFingerprint;
  assert.throws(() => createSshHttpClient({remoteUrl: server.remoteUrl, credentials}), code('SSH_HOST_UNTRUSTED'));
});

test('host key mismatch refuses authentication with actionable nonsecret fingerprint', async t => {
  const server = await fixture(t);
  const credentials = {...server.credentials, hostFingerprint: fingerprint(otherKey.public)};
  await assert.rejects(testSshConnection(credentials), error => { code('SSH_HOST_CHANGED')(error); assert.equal(error.details.fingerprint, server.credentials.hostFingerprint); assert.equal(error.details.expectedFingerprint, credentials.hostFingerprint); return true; });
  assert.equal(server.auth.length, 0);
});

test('trusted authentication uses only the supplied in-memory private key', async t => {
  const server = await fixture(t);
  assert.deepEqual(await testSshConnection(server.credentials), {authenticated: true});
  assert.ok(server.auth.includes('publickey')); assert.ok(!server.auth.includes('password'));
  assert.equal(server.commands.length, 0);
});

test('GET SSH advertisement becomes a smart HTTP advertisement, closing its channel', async t => {
  const server = await fixture(t, {handler(channel) { for (let i = 0; i < advertisement.length; i += 3) channel.write(advertisement.subarray(i, i + 3)); }});
  const transport = createSshHttpClient({remoteUrl: server.remoteUrl, credentials: server.credentials});
  const response = await transport.request({url: transport.virtualUrl + '/info/refs?service=git-upload-pack', method: 'GET'});
  assert.equal(response.statusCode, 200); assert.equal(response.headers['content-type'], 'application/x-git-upload-pack-advertisement');
  assert.deepEqual(await bytes(response), Buffer.concat([pkt('# service=git-upload-pack\n'), Buffer.from('0000'), advertisement]));
  assert.deepEqual(server.commands, ["git-upload-pack '/org/repo.git'"]);
});

test('POST upload-pack consumes SSH advertisement then forwards exact Git byte stream', async t => {
  const requestBytes = Buffer.concat([pkt('want ' + '1'.repeat(40) + '\n'), Buffer.from('0000'), pkt('done\n')]);
  const responseBytes = Buffer.concat([pkt('NAK\n'), Buffer.from([80, 65, 67, 75, 0, 255, 12])]); let received;
  const server = await fixture(t, {handler(channel) {
    channel.write(advertisement); const chunks = []; channel.on('data', chunk => chunks.push(chunk)); channel.on('end', () => { received = Buffer.concat(chunks); finish(channel, responseBytes); });
  }});
  const transport = createSshHttpClient({remoteUrl: server.remoteUrl, credentials: server.credentials});
  async function* body() { yield requestBytes.subarray(0, 9); yield requestBytes.subarray(9); }
  const response = await transport.request({url: transport.virtualUrl + '/git-upload-pack', method: 'POST', body: body()});
  assert.deepEqual(received, requestBytes); assert.deepEqual(await bytes(response), responseBytes);
  assert.equal(response.headers['content-type'], 'application/x-git-upload-pack-result');
});

test('receive-pack bridge sends exact bytes to only the strictly quoted configured repository', async t => {
  const requestBytes = Buffer.concat([pkt('old new refs/heads/main\0report-status\n'), Buffer.from('0000PACK\x00\xff')]); let received;
  const responseBytes = Buffer.concat([pkt('unpack ok\n'), pkt('ok refs/heads/main\n'), Buffer.from('0000')]);
  const server = await fixture(t, {handler(channel) { channel.write(advertisement); const chunks = []; channel.on('data', chunk => chunks.push(chunk)); channel.on('end', () => { received = Buffer.concat(chunks); finish(channel, responseBytes); }); }});
  const remoteUrl = server.remoteUrl.replace('/org/repo.git', "/org/a's;$(id).git");
  const transport = createSSHTransport({remoteUrl, credentials: {...server.credentials, trustedFingerprint: server.credentials.hostFingerprint}});
  const advertised = await transport.http.request({url: transport.url + '/info/refs?service=git-receive-pack'});
  assert.match((await bytes(advertised)).toString(), /service=git-receive-pack/);
  const response = await transport.http.request({url: transport.url + '/git-receive-pack', method: 'POST', body: [requestBytes]});
  assert.deepEqual(received, requestBytes); assert.deepEqual(await bytes(response), responseBytes);
  assert.equal(server.commands[0], "git-receive-pack '/org/a'\\''s;$(id).git'");
  assert.equal(server.commands.length, 2);
});

test('virtual HTTP routes cannot redirect credentials or choose arbitrary commands', async t => {
  const server = await fixture(t); const transport = createSshHttpClient({remoteUrl: server.remoteUrl, credentials: server.credentials});
  for (const url of ['https://attacker.invalid/repository/git-upload-pack', transport.virtualUrl + '/info/refs?service=exec', transport.virtualUrl + '/info/refs?service=git-upload-pack&extra=1', transport.virtualUrl + '/evil', transport.virtualUrl + '/git-upload-pack?x=1']) await assert.rejects(transport.request({url, method: url.includes('info/refs') ? 'GET' : 'POST', body: []}), code('SSH_INVALID_INPUT'));
  assert.equal(server.commands.length, 0); assert.equal(server.auth.length, 0);
  assert.throws(() => createSshHttpClient({remoteUrl: server.remoteUrl, credentials: {...server.credentials, port: server.credentials.port + 1}}), code('SSH_PROFILE_MISMATCH'));
});

test('malformed/ERR/missing flush advertisements fail with fixed sanitized errors', async t => {
  let output = Buffer.from('zzzzsecret-private-key');
  const server = await fixture(t, {handler(channel) { finish(channel, output); }});
  const transport = createSshHttpClient({remoteUrl: server.remoteUrl, credentials: server.credentials});
  for (const [buffer, expected] of [[output, 'SSH_PROTOCOL_ERROR'], [pkt('ERR private-key-secret\n'), 'SSH_REMOTE_ERROR'], [pkt('incomplete refs'), 'SSH_PROTOCOL_ERROR']]) {
    output = buffer;
    await assert.rejects(transport.request({url: transport.virtualUrl + '/info/refs?service=git-upload-pack'}), error => { code(expected)(error); assert.doesNotMatch(error.stack, /private-key-secret|secret-private-key/); return true; });
  }
});

test('authentication failure discards ssh2 diagnostics and private key text', async t => {
  const server = await fixture(t, {rejectAuthentication: true});
  await assert.rejects(testSshConnection(server.credentials), error => { code('SSH_AUTH_FAILED')(error); assert.doesNotMatch(error.stack + JSON.stringify(error), /BEGIN OPENSSH PRIVATE KEY|All configured authentication methods|passphrase/); return true; });
});

test('timeouts and aborts destroy stalled SSH channels without replaying commands', async t => {
  let streamBody = false;
  const started = Promise.withResolvers();
  const server = await fixture(t, {handler(channel) { if (streamBody) { channel.write(advertisement); channel.on('data', () => started.resolve()); } }});
  let transport = createSshHttpClient({remoteUrl: server.remoteUrl, credentials: server.credentials, timeoutMs: 100});
  await assert.rejects(transport.request({url: transport.virtualUrl + '/info/refs?service=git-upload-pack'}), code('SSH_TIMEOUT'));
  // A busy runner may time out during authentication, before the first exec.
  const timedOutCommands = server.commands.length;
  assert.ok(timedOutCommands <= 1, 'a timeout must never replay its command');
  streamBody = true; const abort = new AbortController();
  transport = createSshHttpClient({remoteUrl: server.remoteUrl, credentials: server.credentials, timeoutMs: 2000, signal: abort.signal});
  const pending = transport.request({url: transport.virtualUrl + '/git-receive-pack', method: 'POST', body: [Buffer.from('request')]});
  const rejected = assert.rejects(pending, error => { code('SSH_ABORTED')(error); assert.doesNotMatch(error.message, /secret/); return true; });
  await started.promise; abort.abort(new Error('secret')); await rejected;
  assert.equal(server.commands.length, timedOutCommands + 1);
  await assert.rejects(transport.request({url: transport.virtualUrl + '/info/refs?service=git-upload-pack'}), code('SSH_ABORTED'));
  assert.equal(server.commands.length, timedOutCommands + 1);
});

test('advertisement, request body and response are bounded', async t => {
  let mode = 'advert';
  const server = await fixture(t, {handler(channel) {
    channel.write(advertisement);
    if (mode === 'response') { channel.on('data', () => {}); channel.on('end', () => finish(channel, Buffer.alloc(4000))); }
  }});
  const small = createSshHttpClient({remoteUrl: server.remoteUrl, credentials: server.credentials, maxResponseBytes: 20});
  await assert.rejects(small.request({url: small.virtualUrl + '/info/refs?service=git-upload-pack'}), code('SSH_TOO_LARGE'));
  const transport = createSshHttpClient({remoteUrl: server.remoteUrl, credentials: server.credentials, maxResponseBytes: 1000});
  mode = 'request';
  await assert.rejects(transport.request({url: transport.virtualUrl + '/git-receive-pack', method: 'POST', body: [Buffer.alloc(1001)]}), code('SSH_TOO_LARGE'));
  mode = 'response';
  await assert.rejects(transport.request({url: transport.virtualUrl + '/git-receive-pack', method: 'POST', body: [Buffer.from('a')]}), code('SSH_TOO_LARGE'));
});

test('remote nonzero exit and ERR response never return fake HTTP success', async t => {
  let errPacket = false;
  const server = await fixture(t, {handler(channel) {
    channel.write(advertisement); channel.on('data', () => {}); channel.on('end', () => { channel.stderr.write('secret-key remote sensitive diagnostic'); finish(channel, errPacket ? pkt('ERR secret-key\n') : Buffer.from('failure'), errPacket ? 0 : 1); });
  }});
  const transport = createSshHttpClient({remoteUrl: server.remoteUrl, credentials: server.credentials});
  for (errPacket of [false, true]) await assert.rejects(transport.request({url: transport.virtualUrl + '/git-upload-pack', method: 'POST', body: [Buffer.from('a')]}), error => { code('SSH_REMOTE_ERROR')(error); assert.doesNotMatch(error.stack + JSON.stringify(error), /secret-key|sensitive diagnostic/); return true; });
});

test('isomorphic-git pushes and fetches real object packs over the SSH bridge', async t => {
  // System Git exists ONLY on this simulated remote server. Production client/transport
  // never spawns a process; all client objects and pack generation use isomorphic-git.
  const gitExecutable = '/usr/bin/git';
  if (spawnSync(gitExecutable, ['--version'], {stdio: 'ignore'}).status !== 0) { t.skip('fixture-only remote Git executable is unavailable'); return; }
  const temporary = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dsh-ssh-pack-'));
  t.after(async () => {
    const resolved = path.resolve(temporary), prefix = path.join(os.tmpdir(), 'dsh-ssh-pack-');
    assert.ok(resolved.startsWith(prefix) && resolved !== path.resolve(os.tmpdir()));
    await fs.promises.rm(resolved, {recursive: true, force: true});
  });
  const bare = path.join(temporary, 'remote.git'), first = path.join(temporary, 'first'), second = path.join(temporary, 'second');
  await git.init({fs, dir: bare, bare: true, defaultBranch: 'main'});
  await git.init({fs, dir: first, defaultBranch: 'main'});
  await fs.promises.writeFile(path.join(first, 'design.html'), '<main>真实 SSH Git pack\n</main>');
  await git.add({fs, dir: first, filepath: 'design.html'});
  const oid = await git.commit({fs, dir: first, message: 'Initial design', author: {name: 'Fixture', email: 'fixture@example.com'}});
  const processes = new Set();
  const server = await fixture(t, {handler(channel, command) {
    const service = command.startsWith('git-upload-pack ') ? 'upload-pack' : command.startsWith('git-receive-pack ') ? 'receive-pack' : null;
    assert.ok(service); assert.equal(command, 'git-' + service + ' ' + quoteSshRepoPath('/org/repo.git'));
    const child = spawn(gitExecutable, [service, bare], {env: {...process.env, PATH: '', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0'}, stdio: ['pipe', 'pipe', 'pipe']});
    processes.add(child); child.stdin.on('error', () => {}); child.stdout.on('error', () => {}); child.stderr.on('error', () => {});
    child.stdout.pipe(channel, {end: false}); child.stderr.pipe(channel.stderr, {end: false}); channel.pipe(child.stdin);
    child.on('error', () => finish(channel, Buffer.alloc(0), 1));
    child.on('close', exitCode => { processes.delete(child); if (!channel.destroyed) finish(channel, Buffer.alloc(0), exitCode ?? 1); });
    channel.on('close', () => { if (processes.has(child)) child.kill(); });
  }});
  t.after(() => { for (const child of processes) child.kill(); });
  const transport = createSSHTransport({remoteUrl: server.remoteUrl, credentials: server.credentials});
  const pushed = await git.push({fs, dir: first, url: transport.url, http: transport.http, ref: 'main', remoteRef: 'main', force: false});
  assert.equal(pushed.ok, true);
  assert.equal(await git.resolveRef({fs, gitdir: bare, ref: 'refs/heads/main'}), oid);
  await git.init({fs, dir: second, defaultBranch: 'main'});
  await git.addRemote({fs, dir: second, remote: 'origin', url: transport.url});
  const fetched = await git.fetch({fs, dir: second, url: transport.url, http: transport.http, ref: 'main', singleBranch: true, tags: false});
  assert.equal(fetched.fetchHead, oid);
  const blob = await git.readBlob({fs, dir: second, oid, filepath: 'design.html'});
  assert.equal(Buffer.from(blob.blob).toString('utf8'), '<main>真实 SSH Git pack\n</main>');
  assert.ok(server.commands.some(command => command.startsWith('git-receive-pack ')));
  assert.ok(server.commands.some(command => command.startsWith('git-upload-pack ')));
});

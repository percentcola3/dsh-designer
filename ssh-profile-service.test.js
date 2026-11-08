import assert from 'node:assert/strict';
import test from 'node:test';
import {once} from 'node:events';
import ssh2 from 'ssh2';
import {SshProfileService} from './ssh-profile-service.js';
import {sshFingerprint} from './git-ssh-transport.js';
const {Server, utils} = ssh2;
const hostKey = utils.generateKeyPairSync('ed25519'), nextHostKey = utils.generateKeyPairSync('ed25519'), userKey = utils.generateKeyPairSync('ed25519');
const parse = input => { const value = utils.parseKey(input); return Array.isArray(value) ? value[0] : value; };
const fp = publicKey => sshFingerprint(parse(publicKey).getPublicSSH());
const code = expected => error => { assert.equal(error.code, expected, error.stack); return true; };
const env = {user: true};
function service(options = {}) {
  const records = new Map(), writes = [], locks = new Map();
  const credentials = {
    async readRecord(key) { return structuredClone(records.get(key)); },
    async modifyRecord(key, update) {
      const previous = locks.get(key) || Promise.resolve();
      const result = previous.catch(() => {}).then(async () => { const value = await update(structuredClone(records.get(key))); records.set(key, structuredClone(value)); writes.push(key); });
      locks.set(key, result); return result;
    }
  };
  return {instance: new SshProfileService({ctx: {credentials}, store: {root: '/workspace/DesignerLibrary'}}, options), records, writes};
}
async function serverFixture(t, {key = hostKey, acceptedPublicKey = userKey.public} = {}) {
  const clients = new Set(), auth = [], commands = [], allowed = parse(acceptedPublicKey);
  const server = new Server({hostKeys: [key.private]}, client => {
    clients.add(client); client.on('error', () => {}); client.on('close', () => clients.delete(client));
    client.on('authentication', ctx => {
      auth.push(ctx.method);
      if (ctx.method === 'publickey' && ctx.username === 'git' && Buffer.from(ctx.key.data).equals(allowed.getPublicSSH()) && (!ctx.signature || allowed.verify(ctx.blob, ctx.signature, ctx.hashAlgo))) ctx.accept(); else ctx.reject();
    });
    client.on('ready', () => client.on('session', (_, reject) => { commands.push('session'); reject(); }));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { for (const client of clients) client.end(); await new Promise(resolve => server.close(resolve)); });
  return {host: '127.0.0.1', port: server.address().port, auth, commands, server};
}
async function imported(instance, connection = {host: 'example.com', port: 22}, extras = {}) {
  return (await instance.execute({action: 'ssh.profile.import', name: 'Designer Git', username: 'git', ...connection, privateKey: userKey.private, ...extras}, env)).profile;
}

test('all SSH profile actions are owner-user-only, including list/get', async () => {
  const {instance, writes} = service();
  for (const action of ['list', 'get', 'generate', 'import', 'remove', 'inspectHost', 'trustHost', 'test']) {
    await assert.rejects(instance.execute({action: 'ssh.profile.' + action}, {}), code('USER_ONLY'));
    await assert.rejects(instance.execute({action: 'ssh.profile.' + action}, {user: true, agent: {id: 'agent'}}), code('USER_ONLY'));
  }
  assert.equal(writes.length, 0);
});

test('import persists secrets only in native credential records and exposes derived public key', async () => {
  const {instance, records, writes} = service();
  const encrypted = utils.generateKeyPairSync('ed25519', {passphrase: 'private-passphrase', cipher: 'aes256-ctr'});
  const profile = await imported(instance, undefined, {privateKey: encrypted.private, passphrase: 'private-passphrase'});
  assert.equal(profile.revision, 1); assert.equal(profile.name, 'Designer Git'); assert.equal(profile.host, 'example.com');
  assert.equal(profile.trustedHost, null); assert.equal(profile.hasPrivateKey, true);
  assert.equal(profile.publicKey, parse(encrypted.public).type + ' ' + parse(encrypted.public).getPublicSSH().toString('base64'));
  assert.equal(profile.fingerprint, fp(encrypted.public));
  assert.equal(profile.privateKey, undefined); assert.equal(profile.passphrase, undefined);
  const get = await instance.execute({action: 'ssh.profile.get', profileId: profile.id}, env);
  const list = await instance.execute({action: 'ssh.profile.list'}, env);
  assert.doesNotMatch(JSON.stringify([profile, get, list]), /BEGIN OPENSSH PRIVATE KEY|private-passphrase|privateKey|passphrase/);
  const stored = records.get(writes[0]); assert.equal(stored.kind, 'grant');
  assert.equal(stored.payload.profiles[0].privateKey, encrypted.private); assert.equal(stored.payload.profiles[0].passphrase, 'private-passphrase');
  await assert.rejects(instance.resolveProfile(profile.id), code('SSH_HOST_UNTRUSTED'));
});

test('built-in ed25519 generation works without local ssh-keygen and supports encryption', async () => {
  const {instance, records} = service();
  const result = await instance.execute({action: 'ssh.profile.generate', name: 'Generated', host: 'example.com', username: 'git', passphrase: 'generated-secret-passphrase'}, env);
  assert.match(result.profile.publicKey, /^ssh-ed25519 /);
  assert.match(result.profile.fingerprint, /^SHA256:[A-Za-z0-9+/]{43}$/);
  assert.doesNotMatch(JSON.stringify(result), /generated-secret-passphrase|BEGIN OPENSSH PRIVATE KEY/);
  const stored = [...records.values()][0].payload.profiles[0];
  assert.equal(parse(stored.privateKey) instanceof Error, true);
  assert.ok(!(utils.parseKey(stored.privateKey, 'generated-secret-passphrase') instanceof Error));
});

test('host inspection and explicit trust use single-use fingerprint-bound CAS challenge', async t => {
  const server = await serverFixture(t), {instance} = service(); const profile = await imported(instance, server);
  const inspection = await instance.execute({action: 'ssh.profile.inspectHost', profileId: profile.id}, env);
  assert.equal(inspection.host.fingerprint, fp(hostKey.public)); assert.equal(inspection.host.trusted, false); assert.equal(inspection.host.changed, false);
  assert.equal(server.auth.length, 0); assert.equal(inspection.profile.trustedHost, null);
  await assert.rejects(instance.execute({action: 'ssh.profile.test', profileId: profile.id}, env), code('SSH_HOST_UNTRUSTED'));
  for (const change of [{fingerprint: fp(nextHostKey.public)}, {challenge: 'forged'}, {fingerprint: 'SHA256:' + '中'.repeat(43)}]) await assert.rejects(instance.execute({action: 'ssh.profile.trustHost', profileId: profile.id, expectedRevision: 1, challenge: inspection.challenge, fingerprint: inspection.host.fingerprint, ...change}, env), code('SSH_TRUST_REQUIRED'));
  await assert.rejects(instance.execute({action: 'ssh.profile.trustHost', profileId: profile.id, expectedRevision: 0, challenge: inspection.challenge, fingerprint: inspection.host.fingerprint}, env), code('VERSION_CONFLICT'));
  const trusted = await instance.execute({action: 'ssh.profile.trustHost', profileId: profile.id, expectedRevision: 1, challenge: inspection.challenge, fingerprint: inspection.host.fingerprint}, env);
  assert.equal(trusted.profile.revision, 2);
  assert.deepEqual(trusted.profile.trustedHost, {host: server.host, port: server.port, fingerprint: fp(hostKey.public)});
  assert.equal(trusted.profile.hostFingerprint, fp(hostKey.public));
  await assert.rejects(instance.execute({action: 'ssh.profile.trustHost', profileId: profile.id, expectedRevision: 2, challenge: inspection.challenge, fingerprint: inspection.host.fingerprint}, env), code('SSH_TRUST_REQUIRED'));
  const credentials = await instance.resolveProfile(profile.id);
  assert.equal(credentials.privateKey, userKey.private); assert.equal(credentials.hostFingerprint, fp(hostKey.public));
  const result = await instance.execute({action: 'ssh.profile.test', profileId: profile.id}, env);
  assert.equal(result.authenticated, true); assert.equal(result.profile.id, profile.id);
  assert.ok(server.auth.includes('publickey')); assert.equal(server.commands.length, 0);
  assert.doesNotMatch(JSON.stringify(result), /BEGIN OPENSSH PRIVATE KEY/);
});

test('host replacement fails closed until new fingerprint is inspected and explicitly trusted', async t => {
  // Native registry stores the trust pin. Change the pin to an old host to model rotation.
  const server = await serverFixture(t, {key: nextHostKey}), {instance, records} = service(); const profile = await imported(instance, server);
  const record = [...records.values()][0]; record.payload.profiles[0].trustedHost = {host: server.host, port: server.port, fingerprint: fp(hostKey.public)};
  await assert.rejects(instance.execute({action: 'ssh.profile.test', profileId: profile.id}, env), error => { code('SSH_HOST_CHANGED')(error); assert.equal(error.details.fingerprint, fp(nextHostKey.public)); return true; });
  assert.equal(server.auth.length, 0);
  const inspection = await instance.execute({action: 'ssh.profile.inspectHost', profileId: profile.id}, env);
  assert.equal(inspection.host.changed, true); assert.equal(inspection.host.trusted, false); assert.equal(inspection.profile.hostFingerprint, fp(hostKey.public));
  await instance.execute({action: 'ssh.profile.trustHost', profileId: profile.id, expectedRevision: 1, challenge: inspection.challenge, fingerprint: inspection.host.fingerprint}, env);
  assert.equal((await instance.execute({action: 'ssh.profile.test', profileId: profile.id}, env)).authenticated, true);
});

test('expired and cross-profile host challenges never grant trust', async t => {
  const server = await serverFixture(t), {instance} = service({challengeTtlMs: -1}); const profile = await imported(instance, server);
  const inspection = await instance.execute({action: 'ssh.profile.inspectHost', profileId: profile.id}, env);
  await assert.rejects(instance.execute({action: 'ssh.profile.trustHost', profileId: profile.id, expectedRevision: 1, challenge: inspection.challenge, fingerprint: inspection.host.fingerprint}, env), code('SSH_TRUST_REQUIRED'));
  instance.challengeTtlMs = 300000;
  const next = await instance.execute({action: 'ssh.profile.inspectHost', profileId: profile.id}, env);
  const other = await imported(instance, server);
  await assert.rejects(instance.execute({action: 'ssh.profile.trustHost', profileId: other.id, expectedRevision: 1, challenge: next.challenge, fingerprint: next.host.fingerprint}, env), code('SSH_TRUST_REQUIRED'));
});

test('stale profile inspection cannot override newer trust and remove is CAS protected', async t => {
  const server = await serverFixture(t), {instance} = service(); const profile = await imported(instance, server);
  const first = await instance.execute({action: 'ssh.profile.inspectHost', profileId: profile.id}, env);
  const second = await instance.execute({action: 'ssh.profile.inspectHost', profileId: profile.id}, env);
  await instance.execute({action: 'ssh.profile.trustHost', profileId: profile.id, expectedRevision: 1, challenge: first.challenge, fingerprint: first.host.fingerprint}, env);
  await assert.rejects(instance.execute({action: 'ssh.profile.trustHost', profileId: profile.id, expectedRevision: 2, challenge: second.challenge, fingerprint: second.host.fingerprint}, env), code('SSH_TRUST_REQUIRED'));
  await assert.rejects(instance.execute({action: 'ssh.profile.remove', profileId: profile.id, expectedRevision: 1}, env), code('VERSION_CONFLICT'));
  assert.deepEqual(await instance.execute({action: 'ssh.profile.remove', profileId: profile.id, expectedRevision: 2}, env), {removed: true, profileId: profile.id});
  assert.deepEqual(await instance.execute({action: 'ssh.profile.list'}, env), {profiles: []});
  await assert.rejects(instance.resolveProfile(profile.id), code('SSH_PROFILE_NOT_FOUND'));
});

test('invalid key, passphrase and host inputs fail without credential writes or secret messages', async () => {
  const {instance, writes} = service();
  for (const change of [{privateKey: 'secret-invalid-private-key'}, {privateKey: userKey.public}, {host: 'example.com/path'}, {host: 'git@example.com'}, {port: 0}, {username: 'git;exec bad'}, {name: '\nsecret'}]) {
    await assert.rejects(imported(instance, undefined, change), error => { assert.match(error.code, /^SSH_INVALID_/); assert.doesNotMatch(error.stack, /secret-invalid-private-key|git;exec bad/); return true; });
  }
  assert.equal(writes.length, 0);
  const encrypted = utils.generateKeyPairSync('ed25519', {passphrase: 'secret-passphrase', cipher: 'aes256-ctr'});
  await assert.rejects(imported(instance, undefined, {privateKey: encrypted.private, passphrase: 'wrong-secret-passphrase'}), code('SSH_INVALID_KEY'));
  assert.equal(writes.length, 0);
});

test('aborted actions do not persist secrets and dispose invalidates unconsumed host challenges', async t => {
  const server = await serverFixture(t), {instance, writes} = service();
  const controller = new AbortController(); controller.abort(new Error('secret'));
  await assert.rejects(instance.execute({action: 'ssh.profile.import', name: 'A', host: 'example.com', privateKey: userKey.private}, {user: true, signal: controller.signal}), code('SSH_ABORTED'));
  assert.equal(writes.length, 0);
  const profile = await imported(instance, server);
  const inspection = await instance.execute({action: 'ssh.profile.inspectHost', profileId: profile.id}, env);
  instance.dispose();
  await assert.rejects(instance.execute({action: 'ssh.profile.trustHost', profileId: profile.id, expectedRevision: 1, challenge: inspection.challenge, fingerprint: inspection.host.fingerprint}, env), code('SSH_TRUST_REQUIRED'));
});

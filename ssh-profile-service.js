import {createHash, randomBytes, randomUUID, timingSafeEqual} from 'node:crypto';
import ssh2 from 'ssh2';
import {SshTransportError, inspectSshHost, sshFingerprint, testSshConnection, parseSshRemote} from './git-ssh-transport.js';
const {utils} = ssh2;
const now = () => new Date().toISOString();
const fail = (code, message, details) => { throw new SshTransportError(code, message, details); };
const userOnly = env => { if (env.user !== true || env.agent) fail('USER_ONLY', 'SSH profiles and host trust are configured by the owner user'); };
const identifier = id => { if (typeof id !== 'string' || !/^ssh-[a-zA-Z0-9-]{1,80}$/.test(id)) fail('SSH_INVALID_INPUT', 'Invalid SSH profile identifier'); return id; };
function checkSignal(signal) { if (signal?.aborted) fail('SSH_ABORTED', 'SSH operation was cancelled'); }
function expected(input, profile) { if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision !== profile.revision) fail('VERSION_CONFLICT', 'SSH profile changed; reload before saving', {currentRevision: profile.revision}); }
function keyMaterial(privateKey, passphrase) {
  if (typeof privateKey !== 'string' || !privateKey || privateKey.length > 1024 * 1024 || passphrase !== undefined && (typeof passphrase !== 'string' || passphrase.length > 16000)) fail('SSH_INVALID_KEY', 'Supply a supported SSH private key and its passphrase if encrypted');
  let key; try { const parsed = utils.parseKey(privateKey, passphrase); key = Array.isArray(parsed) ? parsed.length === 1 ? parsed[0] : null : parsed; }
  catch { fail('SSH_INVALID_KEY', 'SSH private key could not be parsed or decrypted'); }
  if (!key || key instanceof Error || !key.isPrivateKey?.()) fail('SSH_INVALID_KEY', 'SSH private key could not be parsed or decrypted');
  const publicBytes = key.getPublicSSH();
  return {privateKey, ...(passphrase ? {passphrase} : {}), publicKey: key.type + ' ' + publicBytes.toString('base64'), fingerprint: sshFingerprint(publicBytes)};
}
function hostFields(input) {
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 200 || /[\x00-\x1f\x7f]/.test(input.name)) fail('SSH_INVALID_INPUT', 'Supply an SSH profile name of at most 200 characters');
  const host = input.host, port = input.port ?? 22, username = input.username ?? 'git';
  if (typeof host !== 'string' || !host || typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535 || typeof username !== 'string') fail('SSH_INVALID_INPUT', 'Supply a valid SSH host, port and username');
  const formatted = host.includes(':') && !host.startsWith('[') ? '[' + host + ']' : host;
  const parsed = parseSshRemote('ssh://' + username + '@' + formatted + ':' + port + '/repository');
  // URL parsing must not silently reinterpret a user-entered host or username.
  if (/[\s/@?#%\\]/.test(host) || parsed.username !== username) fail('SSH_INVALID_INPUT', 'Supply a hostname or IP address without URL syntax');
  return {name: input.name.trim(), host: parsed.host, port: parsed.port, username: parsed.username};
}

/** Owner-only profile management. Secrets live only in native ctx.credentials records.
 * resolveProfile is an internal Host API for the managed Git helper, never a model/UI action.
 */
export class SshProfileService {
  constructor(owner, {timeoutMs = 15000, challengeTtlMs = 5 * 60 * 1000} = {}) {
    this.owner = owner; this.ctx = owner.ctx; this.timeoutMs = timeoutMs; this.challengeTtlMs = challengeTtlMs; this.challenges = new Map();
    this.key = 'dsh-designer:ssh-profiles:' + createHash('sha256').update(String(owner.store?.root || this.ctx.workspaceRoot || 'default')).digest('hex');
  }
  async registry() {
    const record = await this.ctx.credentials.readRecord(this.key);
    const payload = record?.kind === 'grant' ? record.payload : undefined;
    if (payload === undefined || payload === null) return {schemaVersion: 1, profiles: []};
    if (payload.schemaVersion !== 1 || !Array.isArray(payload.profiles) || payload.profiles.length > 100) fail('SSH_INVALID_PROFILE', 'SSH profile storage is invalid');
    return structuredClone(payload);
  }
  profile(registry, id) { const profile = registry.profiles.find(item => item.id === identifier(id)); if (!profile) fail('SSH_PROFILE_NOT_FOUND', 'SSH profile was not found'); return profile; }
  publicProfile(profile) {
    return {id: profile.id, revision: profile.revision, name: profile.name, host: profile.host, port: profile.port, username: profile.username, publicKey: profile.publicKey, fingerprint: profile.fingerprint, hasPrivateKey: true, trustedHost: profile.trustedHost ? {...profile.trustedHost} : null, hostFingerprint: profile.trustedHost?.fingerprint || null, createdAt: profile.createdAt, updatedAt: profile.updatedAt};
  }
  async modify(fn, signal) {
    checkSignal(signal); let result;
    await this.ctx.credentials.modifyRecord(this.key, async record => {
      const previous = record?.kind === 'grant' ? record.payload : null;
      const registry = previous ? structuredClone(previous) : {schemaVersion: 1, profiles: []};
      if (registry.schemaVersion !== 1 || !Array.isArray(registry.profiles) || registry.profiles.length > 100) fail('SSH_INVALID_PROFILE', 'SSH profile storage is invalid');
      result = await fn(registry); checkSignal(signal);
      return {kind: 'grant', payload: registry};
    });
    return result;
  }
  async create(input, env, generate) {
    const fields = hostFields(input); checkSignal(env.signal);
    let material;
    if (generate) {
      if (input.passphrase !== undefined && (typeof input.passphrase !== 'string' || input.passphrase.length > 16000)) fail('SSH_INVALID_KEY', 'Invalid SSH passphrase');
      const keys = await new Promise((resolve, reject) => {
        try { utils.generateKeyPair('ed25519', {comment: 'Designer', ...(input.passphrase ? {passphrase: input.passphrase, cipher: 'aes256-ctr'} : {})}, (error, keys) => error ? reject(new SshTransportError('SSH_KEY_GENERATION_FAILED', 'Could not generate the SSH key')) : resolve(keys)); }
        catch { reject(new SshTransportError('SSH_KEY_GENERATION_FAILED', 'Could not generate the SSH key')); }
      });
      checkSignal(env.signal); material = keyMaterial(keys.private, input.passphrase);
    } else material = keyMaterial(input.privateKey, input.passphrase);
    const stamp = now(), profile = {...fields, ...material, id: 'ssh-' + randomUUID(), revision: 1, trustedHost: null, createdAt: stamp, updatedAt: stamp};
    return this.modify(registry => {
      if (registry.profiles.length >= 100) fail('SSH_TOO_MANY_PROFILES', 'At most 100 SSH profiles can be stored');
      registry.profiles.push(profile); return {profile: this.publicProfile(profile)};
    }, env.signal);
  }
  async resolveProfile(profileId, {signal} = {}) {
    checkSignal(signal); const profile = this.profile(await this.registry(), profileId);
    if (!profile.trustedHost || profile.trustedHost.host !== profile.host || profile.trustedHost.port !== profile.port) fail('SSH_HOST_UNTRUSTED', 'Inspect and explicitly trust the SSH host fingerprint before connecting');
    return {host: profile.host, port: profile.port, username: profile.username, privateKey: profile.privateKey, ...(profile.passphrase ? {passphrase: profile.passphrase} : {}), trustedFingerprint: profile.trustedHost.fingerprint, hostFingerprint: profile.trustedHost.fingerprint};
  }
  pruneChallenges() { for (const [token, item] of this.challenges) if (Date.now() > item.expiresAt) this.challenges.delete(token); while (this.challenges.size >= 100) this.challenges.delete(this.challenges.keys().next().value); }
  async inspectHost(input, env) {
    const profile = this.profile(await this.registry(), input.profileId);
    const host = await inspectSshHost(profile, {timeoutMs: this.timeoutMs, signal: env.signal});
    // Refuse a key removed/replaced during the network operation.
    const current = this.profile(await this.registry(), profile.id);
    if (current.revision !== profile.revision) fail('VERSION_CONFLICT', 'SSH profile changed during host inspection', {currentRevision: current.revision});
    this.pruneChallenges();
    const challenge = randomBytes(32).toString('base64url');
    this.challenges.set(challenge, {profileId: profile.id, revision: profile.revision, fingerprint: host.fingerprint, host: profile.host, port: profile.port, expiresAt: Date.now() + this.challengeTtlMs});
    const trusted = profile.trustedHost?.fingerprint === host.fingerprint;
    return {profile: this.publicProfile(profile), host: {...host, trusted, changed: !!profile.trustedHost && !trusted}, challenge};
  }
  async trustHost(input, env) {
    const candidate = typeof input.challenge === 'string' ? this.challenges.get(input.challenge) : null;
    if (!candidate || candidate.expiresAt < Date.now() || candidate.profileId !== input.profileId || typeof input.fingerprint !== 'string' || !/^SHA256:[A-Za-z0-9+/]{43}$/.test(input.fingerprint) || input.fingerprint.length !== candidate.fingerprint.length || !timingSafeEqual(Buffer.from(input.fingerprint), Buffer.from(candidate.fingerprint))) fail('SSH_TRUST_REQUIRED', 'Inspect the host and explicitly confirm its current fingerprint before trusting');
    const result = await this.modify(registry => {
      const profile = this.profile(registry, input.profileId); expected(input, profile);
      if (profile.revision !== candidate.revision || profile.host !== candidate.host || profile.port !== candidate.port) fail('SSH_TRUST_REQUIRED', 'SSH profile changed; inspect the host again');
      profile.trustedHost = {host: profile.host, port: profile.port, fingerprint: candidate.fingerprint}; profile.revision++; profile.updatedAt = now();
      return {profile: this.publicProfile(profile)};
    }, env.signal);
    this.challenges.delete(input.challenge); return result;
  }
  async execute(input, env = {}) {
    userOnly(env); checkSignal(env.signal);
    switch (input.action) {
      case 'ssh.profile.list': return {profiles: (await this.registry()).profiles.map(profile => this.publicProfile(profile))};
      case 'ssh.profile.get': return {profile: this.publicProfile(this.profile(await this.registry(), input.profileId))};
      case 'ssh.profile.generate': return this.create(input, env, true);
      case 'ssh.profile.import': return this.create(input, env, false);
      case 'ssh.profile.remove': return this.modify(registry => { const profile = this.profile(registry, input.profileId); expected(input, profile); registry.profiles = registry.profiles.filter(item => item.id !== profile.id); for (const [token, challenge] of this.challenges) if (challenge.profileId === profile.id) this.challenges.delete(token); return {removed: true, profileId: profile.id}; }, env.signal);
      case 'ssh.profile.inspectHost': return this.inspectHost(input, env);
      case 'ssh.profile.trustHost': return this.trustHost(input, env);
      case 'ssh.profile.test': {
        const profile = this.profile(await this.registry(), input.profileId), credentials = await this.resolveProfile(profile.id, env);
        await testSshConnection(credentials, {timeoutMs: this.timeoutMs, signal: env.signal});
        const current = this.profile(await this.registry(), profile.id); if (current.revision !== profile.revision) fail('VERSION_CONFLICT', 'SSH profile changed during connection test');
        return {profile: this.publicProfile(current), authenticated: true};
      }
      default: fail('UNKNOWN_ACTION', 'Unknown SSH profile action');
    }
  }
  dispose() { this.challenges.clear(); }
}
export const SSHProfileService = SshProfileService;

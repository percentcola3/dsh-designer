import test from 'node:test';
import assert from 'node:assert/strict';
import { projectSyncDraft, projectSyncDirty, projectSyncInput, projectSyncConnectionInput, projectSyncTicket, projectSyncResponseCurrent, projectSyncStatus, projectSyncRecovery, projectSyncBranchNames, projectSyncImportConfirmation, projectSyncImportInput, sshProfileDraft, sshProfileInput, sshHostTrustInput } from './project-sync-state.js';

const binding = { repositoryUrl: 'https://example.test/team/repo.git', branch: 'main', projectPath: 'designer-projects/p-one', author: { name: 'Designer', email: 'designer@example.test' }, authProfileId: 'ssh-one', autoCheck: true, hasHttpsToken: true, httpsToken: 'must-not-hydrate' };

test('new project binding defaults to its isolated directory and never enables automatic detection', () => {
  const draft = projectSyncDraft(null, 'p-new');
  assert.equal(draft.projectPath, 'designer-projects/p-new'); assert.equal(draft.autoCheck, false); assert.equal(draft.branch, 'main');
  const hydrated = projectSyncDraft(binding, 'p-one');
  assert.equal(hydrated.httpsToken, ''); assert.equal(hydrated.clearHttpsToken, false); assert.equal(hydrated.autoCheck, true);
  assert.equal(projectSyncDirty(hydrated, projectSyncDraft(binding)), false);
  assert.equal(projectSyncDirty({ ...hydrated, projectPath: 'designer-projects/other' }, hydrated), true);
});

test('saving preserves repository directory, author and authentication while blank token retains existing secret', () => {
  const draft = projectSyncDraft(binding);
  assert.deepEqual(projectSyncInput(draft), { repositoryUrl: binding.repositoryUrl, branch: 'main', projectPath: binding.projectPath, author: binding.author, authProfileId: 'ssh-one', autoCheck: true });
  assert.equal(projectSyncInput({ ...draft, httpsToken: 'replacement' }).httpsToken, 'replacement');
  const cleared = projectSyncInput({ ...draft, clearHttpsToken: true, httpsToken: 'stale' });
  assert.equal(cleared.clearHttpsToken, true); assert.ok(!('httpsToken' in cleared));
});

test('invalid repository directories cannot escape the per-project subtree', () => {
  const draft = projectSyncDraft(binding);
  for (const path of ['', '/', '../outside', 'designer/../../outside', 'C:/repo', 'a\\b', 'a//b', './project']) assert.throws(() => projectSyncInput({ ...draft, projectPath: path }));
  assert.equal(projectSyncInput({ ...draft, projectPath: ' app/design ' }).projectPath, 'app/design');
});

test('testing a connection does not require author details or send unrelated automatic settings', () => {
  const value = projectSyncConnectionInput({ ...projectSyncDraft(binding), authorName: '', authorEmail: '' });
  assert.equal(value.repositoryUrl, binding.repositoryUrl); assert.ok(!('author' in value)); assert.ok(!('autoCheck' in value));
  assert.throws(() => projectSyncInput({ ...projectSyncDraft(binding), authorName: '' }));
});

test('slow responses from another project, an earlier visit, or an earlier request are rejected', () => {
  const owner = { projectId: 'p-one', epoch: 1 }, ticket = projectSyncTicket(owner.projectId, owner.epoch, 4);
  assert.equal(projectSyncResponseCurrent(ticket, owner, 4), true);
  assert.equal(projectSyncResponseCurrent(ticket, { projectId: 'p-two', epoch: 2 }, 4), false);
  assert.equal(projectSyncResponseCurrent(ticket, { projectId: 'p-one', epoch: 3 }, 4), false);
  assert.equal(projectSyncResponseCurrent(ticket, owner, 5), false);
});

test('unknown remote counts remain unknown and divergence or conflicts prevent safe-forward operations', () => {
  const unknown = projectSyncStatus({ changes: [] }); assert.equal(unknown.ahead, null); assert.equal(unknown.behind, null);
  const changed = projectSyncStatus({ dirty: false, changes: [{ path: 'design.json', status: 'modified' }], ahead: 2, behind: 1 });
  assert.equal(changed.dirty, true); assert.equal(changed.diverged, true); assert.equal(changed.blocked, true);
  assert.equal(projectSyncStatus({ ahead: 0, behind: 1 }).blocked, false);
  assert.equal(projectSyncStatus({ conflicts: ['design.json'] }).blocked, true);
  assert.equal(projectSyncStatus({ ahead: -1, behind: 1.5 }).ahead, null);
});

test('first remote import allows requesting a dirty pull, while initialized dirty projects stay blocked', () => {
  assert.equal(projectSyncStatus({ dirty: true, initialImportPending: true }).pullAllowed, true);
  assert.equal(projectSyncStatus({ dirty: true, initialImportPending: false }).pullAllowed, false);
  assert.equal(projectSyncStatus({ dirty: true }).pullAllowed, false);
  assert.equal(projectSyncStatus({ dirty: true, initialImportPending: 'true' }).pullAllowed, false);
  assert.equal(projectSyncStatus({ dirty: true, initialImportPending: true, conflicts: ['file'] }).pullAllowed, false);
  assert.equal(projectSyncStatus({ dirty: true, initialImportPending: true, ahead: 1, behind: 1 }).pullAllowed, false);
});

test('remote import confirmation preserves the exact action payload and only admits explicit pull or sync confirmation', () => {
  const owner = { projectId: 'p-one', epoch: 5 }, args = { projectId: 'p-one', expectedRevision: 12, message: 'original message' };
  const error = { code: 'SYNC_INITIAL_IMPORT_CONFIRMATION_REQUIRED', details: { repositoryUrl: binding.repositoryUrl, branch: binding.branch, projectPath: binding.projectPath } };
  const pending = projectSyncImportConfirmation('sync', args, error, owner);
  assert.equal(pending.action, 'sync'); assert.deepEqual(pending.args, args);
  args.message = 'edited after request';
  assert.deepEqual(projectSyncImportInput(pending, owner), { projectId: 'p-one', expectedRevision: 12, message: 'original message', allowInitialImport: true });
  assert.ok(!('allowInitialImport' in pending.args));
  assert.throws(() => projectSyncImportInput(pending, { projectId: 'p-two', epoch: 6 }));
  assert.throws(() => projectSyncImportInput(pending, { projectId: 'p-one', epoch: 6 }));
  assert.ok(projectSyncImportConfirmation('pull', args, error, owner));
  for (const action of ['commit', 'push']) assert.equal(projectSyncImportConfirmation(action, args, error, owner), null);
  assert.equal(projectSyncImportConfirmation('pull', args, { code: 'SYNC_REMOTE_PROJECT_EXISTS' }, owner), null);
  assert.equal(projectSyncImportConfirmation('sync', { ...args, allowInitialImport: true }, error, owner), null);
  assert.match(projectSyncRecovery({ code: 'SYNC_REMOTE_PROJECT_EXISTS' }), /先点击“拉取远端”/);
});

test('recovery messages preserve local work and never suggest forcing a diverged push', () => {
  assert.match(projectSyncRecovery({ code: 'SYNC_DIVERGED' }), /保留/);
  assert.match(projectSyncRecovery({ code: 'SYNC_DIRTY' }), /先提交/);
  assert.match(projectSyncRecovery({ code: 'SSH_HOST_CHANGED' }), /核对/);
  assert.match(projectSyncRecovery({ code: 'VERSION_CONFLICT' }), /草稿会保留/);
  assert.equal(projectSyncRecovery({ code: 'UNKNOWN' }), '');
});

test('SSH generation never forwards a stale import key, while imports explicitly require one', () => {
  const draft = { ...sshProfileDraft(), name: 'Work', host: 'example.test', privateKey: 'stale-key' };
  const generated = sshProfileInput(draft); assert.ok(!('privateKey' in generated)); assert.equal(generated.port, 22); assert.equal(generated.username, 'git'); assert.ok(!('passphrase' in generated));
  assert.equal(sshProfileInput({ ...draft, mode: 'import', privateKey: 'key-bytes', passphrase: 'secret' }).privateKey, 'key-bytes');
  assert.throws(() => sshProfileInput({ ...draft, mode: 'import', privateKey: '' }));
  assert.throws(() => sshProfileInput({ ...draft, port: '0' })); assert.throws(() => sshProfileInput({ ...draft, port: '65536' }));
});

test('trust requests bind exactly to the inspected host fingerprint, profile revision and challenge', () => {
  const inspection = { profile: { id: 'ssh-one', revision: 3 }, host: { fingerprint: 'SHA256:observed', host: 'example.test', port: 22 }, challenge: 'challenge-one' };
  assert.deepEqual(sshHostTrustInput(inspection), { profileId: 'ssh-one', expectedRevision: 3, challenge: 'challenge-one', fingerprint: 'SHA256:observed' });
  assert.throws(() => sshHostTrustInput({ ...inspection, challenge: '' })); assert.throws(() => sshHostTrustInput({ ...inspection, host: { fingerprint: '' } }));
});

test('branch discovery preserves distinct local and remote names without duplicate suggestions', () => {
  assert.deepEqual(projectSyncBranchNames({ branches: ['main', { name: 'draft' }], local: ['main'], remote: [{ name: 'cloud' }] }), ['main', 'draft', 'cloud']);
});

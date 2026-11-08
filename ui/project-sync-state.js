export function projectSyncDraft(binding, projectId = '') {
  return {
    repositoryUrl: binding?.repositoryUrl || '', branch: binding?.branch || 'main', projectPath: binding?.projectPath || (projectId ? `designer-projects/${projectId}` : ''),
    authorName: binding?.author?.name || '', authorEmail: binding?.author?.email || '',
    authProfileId: binding?.authProfileId || '', autoCheck: binding?.autoCheck === true,
    httpsToken: '', clearHttpsToken: false,
  };
}
export function projectSyncDirty(draft, original) { return JSON.stringify(draft) !== JSON.stringify(original); }
export function projectSyncConnectionInput(draft) {
  const repositoryUrl = draft.repositoryUrl.trim(), branch = draft.branch.trim();
  if (!repositoryUrl) throw new Error('请填写远端仓库地址。');
  if (!branch) throw new Error('请选择或填写分支名称。');
  const projectPath = draft.projectPath.trim();
  if (!projectPath || projectPath.startsWith('/') || /^[a-z]:/i.test(projectPath) || projectPath.includes('\\') || projectPath.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('请填写有效的仓库内相对目录，例如 designer-projects/project-id。');
  const value = { repositoryUrl, branch, projectPath, authProfileId: draft.authProfileId || null };
  if (draft.clearHttpsToken) value.clearHttpsToken = true;
  else if (draft.httpsToken) value.httpsToken = draft.httpsToken;
  return value;
}
export function projectSyncInput(draft) {
  const value = projectSyncConnectionInput(draft);
  if (!draft.authorName.trim() || !draft.authorEmail.trim()) throw new Error('请填写提交作者姓名和邮箱。');
  return { ...value, author: { name: draft.authorName.trim(), email: draft.authorEmail.trim() }, autoCheck: draft.autoCheck === true };
}
export function projectSyncTicket(projectId, epoch, requestId) { return { projectId, epoch, requestId }; }
export function projectSyncResponseCurrent(ticket, owner, requestId) { return ticket.projectId === owner.projectId && ticket.epoch === owner.epoch && ticket.requestId === requestId; }
export function projectSyncStatus(status) {
  const changes = Array.isArray(status?.changes) ? status.changes : [];
  const conflicts = Array.isArray(status?.conflicts) ? status.conflicts : [];
  const ahead = Number.isSafeInteger(status?.ahead) && status.ahead >= 0 ? status.ahead : null;
  const behind = Number.isSafeInteger(status?.behind) && status.behind >= 0 ? status.behind : null;
  const dirty = status?.dirty === true || changes.length > 0;
  const diverged = status?.diverged === true || ahead > 0 && behind > 0;
  const blocked = conflicts.length > 0 || diverged;
  const initialImportPending = status?.initialImportPending === true;
  return { changes, conflicts, ahead, behind, dirty, diverged, blocked, initialImportPending, pullAllowed: !blocked && (!dirty || initialImportPending) };
}
export function projectSyncImportConfirmation(action, args, error, owner) {
  if (error?.code !== 'SYNC_INITIAL_IMPORT_CONFIRMATION_REQUIRED' || !['pull', 'sync'].includes(action) || args.allowInitialImport === true) return null;
  return { action, args: { ...args }, owner: { projectId: owner.projectId, epoch: owner.epoch }, binding: { repositoryUrl: error.details?.repositoryUrl, branch: error.details?.branch, projectPath: error.details?.projectPath } };
}
export function projectSyncImportInput(pending, owner) {
  if (!pending || !['pull', 'sync'].includes(pending.action) || pending.owner.projectId !== owner.projectId || pending.owner.epoch !== owner.epoch || pending.args.projectId !== owner.projectId) throw new Error('项目已切换，请重新发起远端拉取。');
  return { ...pending.args, allowInitialImport: true };
}
export function projectSyncRecovery(error) {
  const code = error?.code || '';
  if (code === 'SYNC_REMOTE_PROJECT_EXISTS') return '仓库内已有项目。请先点击“拉取远端”，核对并确认导入，再提交或推送。';
  if (/DIVERGED/.test(code)) return '本地与远端历史已分叉。原有内容会保留；请处理分叉或改用独立分支，再重新检测。';
  if (/DIRTY/.test(code)) return '本地仍有未提交修改。先提交本地修改，再重新拉取；也可使用“提交并同步”。';
  if (/CONFLICT/.test(code) && !/VERSION|REVISION/.test(code)) return '存在冲突。请先处理冲突文件，再重新检测；当前本地资料会保留。';
  if (/HOST_UNTRUSTED|HOST_CHANGED/.test(code)) return '请在 SSH 配置中检查主机指纹，与服务提供方核对后显式信任，再重试连接。';
  if (/VERSION|REVISION|STALE/.test(code)) return '项目版本已变化。读取最新状态后重试；当前配置草稿会保留。';
  if (/AUTH|CREDENTIAL|TOKEN/.test(code)) return '请检查 HTTPS 凭据或 SSH 配置，测试通过后重试。';
  return '';
}
export function projectSyncBranchNames(value) {
  const names = [...(value?.branches || []), ...(value?.local || []), ...(value?.remote || [])];
  return [...new Set(names.map(item => typeof item === 'string' ? item : item?.name).filter(Boolean))];
}
export function sshProfileDraft() { return { mode: 'generate', name: '', host: '', port: '22', username: 'git', privateKey: '', passphrase: '' }; }
export function sshProfileInput(draft) {
  if (!draft.name.trim() || !draft.host.trim() || !draft.username.trim()) throw new Error('请填写 SSH 配置名称、主机和用户名。');
  const port = Number(draft.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SSH 端口应为 1–65535 的整数。');
  const value = { name: draft.name.trim(), host: draft.host.trim(), port, username: draft.username.trim() };
  if (draft.passphrase) value.passphrase = draft.passphrase;
  if (draft.mode === 'import') {
    if (!draft.privateKey.trim()) throw new Error('请填写要导入的 SSH 私钥。');
    value.privateKey = draft.privateKey;
  }
  return value;
}
export function sshHostTrustInput(inspection) {
  const { profile, host, challenge } = inspection || {};
  if (!profile?.id || !Number.isSafeInteger(profile.revision) || !host?.fingerprint || !challenge) throw new Error('请先重新检查 SSH 主机指纹。');
  return { profileId: profile.id, expectedRevision: profile.revision, challenge, fingerprint: host.fingerprint };
}

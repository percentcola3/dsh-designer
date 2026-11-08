import React from 'react';
import { Button, ErrorBox, Modal } from './common.jsx';
import styles from './project-sync-styles.js';
import { projectSyncDraft, projectSyncDirty, projectSyncInput, projectSyncConnectionInput, projectSyncTicket, projectSyncResponseCurrent, projectSyncStatus, projectSyncRecovery, projectSyncBranchNames, projectSyncImportConfirmation, projectSyncImportInput, sshProfileDraft, sshProfileInput, sshHostTrustInput } from './project-sync-state.js';

const changeLabel = value => ({ added: '新增', modified: '修改', deleted: '删除', untracked: '新增', conflicted: '冲突', A: '新增', M: '修改', D: '删除' }[value] || value || '变更');
const actionLabel = action => ({ commit: '提交本地修改', pull: '拉取远端', push: '推送已提交内容', sync: '提交并同步' }[action] || action);

export default function ProjectSyncPanel({ api, project, onChanged, onBeforeSync, registerGuard }) {
  const [data, setData] = React.useState(null), [busy, setBusy] = React.useState(false), [error, setError] = React.useState(null), [notice, setNotice] = React.useState('');
  const [draft, setDraft] = React.useState(() => projectSyncDraft(null, project?.id)), [original, setOriginal] = React.useState(() => projectSyncDraft(null, project?.id));
  const [modal, setModal] = React.useState(null), [decision, setDecision] = React.useState(false), [message, setMessage] = React.useState('');
  const [profiles, setProfiles] = React.useState([]), [sshDraft, setSshDraft] = React.useState(sshProfileDraft), [branches, setBranches] = React.useState([]), [probe, setProbe] = React.useState(null);
  const [inspection, setInspection] = React.useState(null), [publicProfile, setPublicProfile] = React.useState(null), [removeProfile, setRemoveProfile] = React.useState(null), [detected, setDetected] = React.useState(null);
  const owner = React.useRef({ projectId: project?.id, epoch: 0 }), requestId = React.useRef(0), lock = React.useRef(null), mounted = React.useRef(true), revision = React.useRef(project?.revision), live = React.useRef({});
  if (owner.current.projectId !== project?.id) { owner.current = { projectId: project?.id, epoch: owner.current.epoch + 1 }; requestId.current++; revision.current = project?.revision; }
  else if (Number.isSafeInteger(project?.revision) && project.revision > (revision.current || 0)) revision.current = project.revision;
  const operationAction = React.useRef('commit');
  const openOperation = action => { operationAction.current = action; setModal({ type: 'operation', action }); };
  const configDirty = projectSyncDirty(draft, original), sshDirty = projectSyncDirty(sshDraft, sshProfileDraft());
  live.current = { draft, original, modal, message, data, configDirty, sshDirty, sshDraft };
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; requestId.current++; lock.current = null; owner.current = { ...owner.current, epoch: owner.current.epoch + 1 }; }; }, []);
  const current = ticket => mounted.current && projectSyncResponseCurrent(ticket, owner.current, requestId.current);
  const run = async fn => {
    if (!owner.current.projectId || lock.current?.projectId === owner.current.projectId && lock.current?.epoch === owner.current.epoch) return;
    const ticket = projectSyncTicket(owner.current.projectId, owner.current.epoch, ++requestId.current);
    lock.current = ticket; setBusy(true); setError(null); setNotice('');
    try { return await fn(ticket); } catch (cause) { if (current(ticket)) setError(cause); }
    finally { if (lock.current === ticket) { lock.current = null; if (current(ticket)) setBusy(false); } }
  };
  const adopt = (value, ticket, { resetDraft = false } = {}) => {
    if (!current(ticket)) return;
    setData(previous => ({ ...previous, ...value }));
    const nextRevision = value.projectRevision ?? value.project?.revision;
    if (Number.isSafeInteger(nextRevision)) revision.current = nextRevision;
    if (value.detected) setDetected(value.detected);
    if (resetDraft) { const next = projectSyncDraft(value.binding, ticket.projectId); setDraft(next); setOriginal(next); }
  };
  const loadProfiles = async ticket => { const value = await api('ssh.profile.list', {}); if (current(ticket)) setProfiles(value.profiles || []); };
  const refresh = (fetch = false) => run(async ticket => {
    const value = await api('sync.status', { projectId: ticket.projectId, ...(fetch ? { fetch: true } : {}) });
    adopt(value, ticket, { resetDraft: !live.current.data && !live.current.configDirty });
  });
  React.useEffect(() => {
    setData(null); setModal(null); setDecision(false); setMessage(''); setProfiles([]); setInspection(null); setRemoveProfile(null); setPublicProfile(null); setDetected(null); setBranches([]); setProbe(null); setSshDraft(sshProfileDraft());
    const empty = projectSyncDraft(null, project?.id); setDraft(empty); setOriginal(empty);
    run(async ticket => { const value = await api('sync.get', { projectId: ticket.projectId }); adopt(value, ticket, { resetDraft: true }); const detection = await api('sync.detect', { projectId: ticket.projectId }); if (current(ticket)) setDetected(detection.detected || null); await loadProfiles(ticket); });
  }, [api, project?.id]);
  React.useEffect(() => {
    if (!data?.binding?.autoCheck) return;
    const timer = setInterval(() => {
      if (!document.hidden && !live.current.modal && !live.current.configDirty && !live.current.sshDirty) refresh(true);
    }, 60000);
    return () => clearInterval(timer);
  }, [api, project?.id, data?.binding?.autoCheck]);
  const saveBinding = () => run(async ticket => {
    if (live.current.sshDirty) throw new Error('SSH 配置仍有草稿，请先生成 / 导入，或清除 SSH 草稿。');
    const value = await api('sync.save', { projectId: ticket.projectId, expectedRevision: revision.current, ...projectSyncInput(live.current.draft) });
    adopt(value, ticket, { resetDraft: true });
    if (current(ticket)) { setModal(null); setDecision(false); setNotice('同步配置已保存。'); if (value.project) await onChanged?.(value.project, value); }
    if (current(ticket)) adopt(await api('sync.status', { projectId: ticket.projectId }), ticket);
  });
  const saveRef = React.useRef(saveBinding); saveRef.current = saveBinding;
  React.useEffect(() => registerGuard?.({
    manual: true, isDirty: () => live.current.configDirty || live.current.sshDirty || !!live.current.message.trim(),
    isBusy: () => lock.current?.projectId === owner.current.projectId && lock.current?.epoch === owner.current.epoch,
    inspect: () => setModal(live.current.message.trim() ? { type: 'operation', action: operationAction.current } : { type: 'config' }),
    save: () => saveRef.current(),
    discard: () => { setDraft(live.current.original); setSshDraft(sshProfileDraft()); setMessage(''); setModal(null); setDecision(false); },
  }), [registerGuard]);
  const update = (key, value) => { setDraft(previous => ({ ...previous, [key]: value })); setProbe(null); if (key === 'repositoryUrl' || key === 'authProfileId') setBranches([]); };
  const close = () => {
    if (busy) return;
    if (decision) { setDecision(false); return; }
    if (modal?.type === 'config' && (configDirty || sshDirty) || modal?.type === 'operation' && message.trim()) { setDecision(true); return; }
    if (modal?.type === 'initial-import') { setModal(modal.previousModal || null); return; }
    if (['trust', 'public', 'remove-profile'].includes(modal?.type)) setModal({ type: 'config' });
    else setModal(null);
  };
  const inspectLocal = () => run(async ticket => { const value = await api('sync.detect', { projectId: ticket.projectId }); adopt(value, ticket); if (current(ticket)) setDetected(value.detected || null); });
  const useDetected = () => {
    const remotes = detected?.remotes || [];
    const first = remotes.find(remote => remote.name === 'origin') || remotes[0];
    const repositoryUrl = typeof first === 'string' ? first : first?.url || first?.repositoryUrl || '';
    setDraft(previous => ({ ...previous, ...(repositoryUrl ? { repositoryUrl } : {}), ...(detected?.branch ? { branch: detected.branch } : {}) })); setProbe(null);
  };
  const testConnection = () => run(async ticket => {
    const value = await api('sync.test', { projectId: ticket.projectId, ...projectSyncConnectionInput(live.current.draft) });
    if (current(ticket)) { setProbe(value); setBranches(projectSyncBranchNames(value)); }
  });
  const listBranches = () => run(async ticket => {
    const value = await api('sync.branches', { projectId: ticket.projectId, ...projectSyncConnectionInput(live.current.draft) });
    if (current(ticket)) setBranches(projectSyncBranchNames(value));
  });
  const finishOperation = async (value, ticket, action) => {
    adopt(value, ticket);
    if (current(ticket)) { setMessage(''); setModal(null); setNotice(`${actionLabel(action)}已完成。`); if (value.project) await onChanged?.(value.project, value); }
  };
  const operate = action => run(async ticket => {
    if (await onBeforeSync?.(ticket.projectId, action) === false || !current(ticket)) return;
    const args = { projectId: ticket.projectId, expectedRevision: revision.current };
    if (action === 'commit' || action === 'sync') { if (!live.current.message.trim()) throw new Error('请填写提交说明。'); args.message = live.current.message.trim(); }
    let value;
    try { value = await api(`sync.${action}`, args); }
    catch (cause) {
      const pending = projectSyncImportConfirmation(action, args, cause, ticket);
      if (pending && current(ticket)) { setModal({ type: 'initial-import', pending, previousModal: live.current.modal }); return; }
      throw cause;
    }
    await finishOperation(value, ticket, action);
  });
  const confirmInitialImport = () => run(async ticket => {
    const pending = live.current.modal?.pending, args = projectSyncImportInput(pending, owner.current);
    const value = await api(`sync.${pending.action}`, args);
    await finishOperation(value, ticket, pending.action);
  });
  const unbind = () => run(async ticket => {
    const value = await api('sync.unbind', { projectId: ticket.projectId, expectedRevision: revision.current });
    adopt(value, ticket, { resetDraft: true });
    if (current(ticket)) { setModal(null); setNotice('已解除同步绑定，本地项目内容保留。'); if (value.project) await onChanged?.(value.project, value); }
  });
  const addSshProfile = () => run(async ticket => {
    const input = live.current.sshDraft;
    const value = await api(input.mode === 'import' ? 'ssh.profile.import' : 'ssh.profile.generate', sshProfileInput(input));
    if (!current(ticket)) return;
    setSshDraft(sshProfileDraft()); setDraft(previous => ({ ...previous, authProfileId: value.profile.id })); setPublicProfile(value.profile); setProbe(null);
    await loadProfiles(ticket);
    if (current(ticket)) { setModal({ type: 'public' }); setNotice('SSH 配置已保存，私钥不会回显。请把公钥添加到代码托管平台。'); }
  });
  const inspectHost = profile => run(async ticket => {
    const value = await api('ssh.profile.inspectHost', { profileId: profile.id });
    if (current(ticket)) { setInspection(value); setModal({ type: 'trust' }); }
  });
  const trustHost = () => run(async ticket => {
    const value = await api('ssh.profile.trustHost', sshHostTrustInput(inspection));
    await loadProfiles(ticket);
    if (current(ticket)) { setInspection(null); setModal({ type: 'config' }); setNotice(`已信任 ${value.profile.host} 的已核对主机指纹。`); }
  });
  const testSsh = profile => run(async ticket => {
    const value = await api('ssh.profile.test', { profileId: profile.id });
    if (current(ticket)) setNotice(value.authenticated === true ? `SSH 配置「${profile.name}」认证成功。` : 'SSH 服务未确认认证成功。');
  });
  const deleteSshProfile = () => run(async ticket => {
    const target = removeProfile;
    await api('ssh.profile.remove', { profileId: target.id, expectedRevision: target.revision });
    await loadProfiles(ticket);
    if (current(ticket)) { setRemoveProfile(null); setModal({ type: 'config' }); if (live.current.draft.authProfileId === target.id) setDraft(previous => ({ ...previous, authProfileId: '' })); setNotice('SSH 配置已移除。'); }
  });
  const showPublicKey = profile => run(async ticket => {
    const value = await api('ssh.profile.get', { profileId: profile.id });
    if (current(ticket)) { setPublicProfile(value.profile); setModal({ type: 'public' }); }
  });
  const copyPublicKey = () => run(async ticket => {
    if (!navigator.clipboard?.writeText) throw new Error('当前环境不能自动复制，请在公钥文本框中选择并复制。');
    await navigator.clipboard.writeText(publicProfile.publicKey);
    if (current(ticket)) setNotice('公钥已复制。');
  });
  const binding = data?.binding, status = projectSyncStatus(data?.status), capabilities = data?.capabilities;
  const recovery = projectSyncRecovery(error), branchListId = React.useId();
  const canOperate = !!binding && !!data?.status && !busy && !configDirty && !sshDirty;
  const canPull = canOperate && status.pullAllowed;
  const canPush = canOperate && !status.blocked && !(status.behind > 0);
  return <section className="wb-project-sync">
    <style>{styles}</style>
    <header className="wb-sync-heading"><div><h2>项目云同步</h2><p>为「{project?.name || '当前项目'}」绑定远端仓库与分支，保存并同步项目内容。</p></div><div className="wb-sync-actions">{capabilities?.builtin && <span className="wb-sync-badge" data-tone="success">内置 Git · 无需安装</span>}<Button disabled={busy || !data} onClick={() => setModal({ type: 'config' })}>{binding ? '同步设置' : '绑定仓库'}</Button></div></header>
    <ErrorBox error={error} onClose={() => setError(null)} />
    {recovery && <p className="wb-sync-note wb-sync-warning">{recovery}</p>}
    {error?.code === 'SYNC_REMOTE_PROJECT_EXISTS' && <div><Button disabled={!canPull} onClick={() => operate('pull')}>先拉取远端并检查导入</Button></div>}
    {notice && <p className="wb-sync-note" role="status">{notice}</p>}
    {busy && <p className="wb-sync-muted" role="status">正在处理，请稍候…</p>}
    {(configDirty || sshDirty) && !modal && <p className="wb-sync-note">有未保存的同步配置草稿。<Button disabled={busy} onClick={() => setModal({ type: 'config' })}>继续编辑</Button></p>}
    <div className="wb-sync-surface">
      <div className="wb-sync-repository"><div><strong>{binding ? binding.branch : data ? '尚未绑定远端仓库' : '正在读取同步状态…'}</strong>{binding && <><code>{binding.repositoryUrl}</code><code>仓库内目录：{binding.projectPath}</code></>}</div><div className="wb-sync-actions"><Button disabled={busy || !project?.id} onClick={() => refresh()}>刷新本地状态</Button><Button disabled={busy || !binding} onClick={() => refresh(true)}>检测远端</Button></div></div>
      {binding ? <><div className="wb-sync-metrics"><div><strong>{status.changes.length}</strong><span>本地变更</span></div><div><strong>{status.ahead ?? '—'}</strong><span>领先提交</span></div><div><strong>{status.behind ?? '—'}</strong><span>落后提交</span></div></div>
        <p className="wb-sync-muted">{data.status?.checkedAt ? `最近检测：${data.status.checkedAt}` : '尚未完成远端检测'} · {binding.autoCheck ? '每分钟自动检测远端状态' : '自动检测已关闭'}</p>
        {status.diverged && <p className="wb-sync-note wb-sync-warning">本地与远端历史已分叉。请处理分叉或使用独立分支后再同步；本地项目内容会保留。</p>}
        {status.conflicts.length > 0 && <p className="wb-sync-note wb-sync-warning">存在冲突：{status.conflicts.map(item => typeof item === 'string' ? item : item.path).join('、')}</p>}
        {data.status?.error && <p className="wb-sync-note wb-sync-warning">{data.status.error.message || String(data.status.error)}</p>}
        <div className="wb-sync-changes">{status.changes.map((change, index) => <div className="wb-sync-change" key={change.path || index}><code>{change.path || change.name}</code><span>{changeLabel(change.status || change.type)}</span></div>)}</div>
        {!status.dirty && data.status && <p className="wb-sync-muted">当前项目没有待提交的本地修改。</p>}
        <div className="wb-sync-actions"><Button disabled={!canOperate || !status.dirty || status.conflicts.length > 0} onClick={() => openOperation('commit')}>提交本地修改</Button><Button disabled={!canPull} onClick={() => operate('pull')}>拉取远端</Button><Button disabled={!canPush} onClick={() => operate('push')}>推送已提交内容</Button><Button primary disabled={!canOperate || status.blocked} onClick={() => openOperation('sync')}>提交并同步</Button></div>
        {status.initialImportPending ? <p className="wb-sync-muted">此绑定尚未初始化。若远端目录已有项目，可先拉取并确认导入；当前已保存版本会保留在历史中。</p> : status.dirty && <p className="wb-sync-muted">拉取前需要提交本地修改。推送只发送已提交内容；“提交并同步”会使用填写的说明提交，再拉取并推送。</p>}
      </> : data && <p className="wb-sync-muted">先绑定仓库和分支，或在同步设置中检测现有仓库。自动检测只更新状态；提交、拉取和推送由你明确操作。</p>}
    </div>
    {modal && <Modal title={modal.type === 'initial-import' ? '导入远端项目' : modal.type === 'config' ? '项目同步设置' : modal.type === 'operation' ? actionLabel(modal.action) : modal.type === 'trust' ? '核对 SSH 主机指纹' : modal.type === 'public' ? 'SSH 公钥' : modal.type === 'remove-profile' ? '移除 SSH 配置' : '解除同步绑定'} onClose={close} wide={modal.type === 'config'}>
      <ErrorBox error={error} />{recovery && <p className="wb-sync-note wb-sync-warning">{recovery}</p>}{error?.code === 'SYNC_REMOTE_PROJECT_EXISTS' && <p><Button disabled={!canPull} onClick={() => operate('pull')}>先拉取远端并检查导入</Button></p>}{notice && <p className="wb-sync-note" role="status">{notice}</p>}
      {decision && <div className="wb-sync-decision" role="alertdialog" aria-label="同步设置尚未保存"><strong>还有未保存的内容</strong><div className="wb-sync-actions"><Button disabled={busy} onClick={() => setDecision(false)}>继续编辑</Button><Button disabled={busy} onClick={() => { setDecision(false); setModal(null); }}>保留草稿并关闭</Button><Button disabled={busy} onClick={() => { if (modal.type === 'config') { setDraft(original); setSshDraft(sshProfileDraft()); } else setMessage(''); setDecision(false); setModal(null); }}>丢弃修改并关闭</Button>{modal.type === 'config' && <Button primary disabled={busy || sshDirty} onClick={saveBinding}>保存配置并关闭</Button>}</div></div>}
      <div inert={decision || busy ? true : undefined}>
        {modal.type === 'config' && <div className="wb-sync-form">
          <div className="wb-sync-actions"><Button disabled={busy} onClick={inspectLocal}>检测本地仓库</Button>{detected && <span className="wb-sync-muted">{detected.existingRepository ? `检测到现有仓库 · ${detected.branch || '未选分支'}` : '未检测到现有仓库'}</span>}{detected?.existingRepository && <Button disabled={busy} onClick={useDetected}>填入检测结果</Button>}</div>
          <label>远端仓库地址<input aria-label="远端仓库地址" autoComplete="off" placeholder="https://host/team/repo.git 或 git@host:team/repo.git" value={draft.repositoryUrl} onChange={event => update('repositoryUrl', event.target.value)} /></label>
          <div className="wb-sync-branches"><label>同步分支<input list={branchListId} value={draft.branch} placeholder="main" onChange={event => update('branch', event.target.value)} /><datalist id={branchListId}>{branches.map(branch => <option key={branch} value={branch} />)}</datalist></label><Button disabled={busy || !draft.repositoryUrl.trim()} onClick={listBranches}>读取分支</Button></div><p className="wb-sync-muted">可选择已有分支，或输入新的分支名称。</p>
          <label>仓库内目录<input value={draft.projectPath} placeholder={`designer-projects/${project?.id || 'project-id'}`} onChange={event => update('projectPath', event.target.value)} /></label><p className="wb-sync-note">同步只管理仓库内的此目录，保留同一分支的应用代码和其他项目。保存配置不会改变当前项目；选择已有目录后，需明确拉取才会导入内容。</p>
          <div className="wb-sync-form-grid"><label>提交作者姓名<input autoComplete="name" value={draft.authorName} onChange={event => update('authorName', event.target.value)} /></label><label>提交作者邮箱<input type="email" autoComplete="email" value={draft.authorEmail} onChange={event => update('authorEmail', event.target.value)} /></label></div>
          <label>SSH 配置<select value={draft.authProfileId} onChange={event => update('authProfileId', event.target.value)}><option value="">不使用 SSH 配置（HTTPS / 公开仓库）</option>{profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name} · {profile.username}@{profile.host}:{profile.port}</option>)}</select></label>
          <details className="wb-sync-ssh"><summary>HTTPS 凭据</summary><div className="wb-sync-form"><label>访问令牌<input type="password" autoComplete="new-password" disabled={draft.clearHttpsToken} placeholder={binding?.hasHttpsToken ? '已保存令牌，留空保留原值' : '可选：用于私有 HTTPS 仓库'} value={draft.httpsToken} onChange={event => update('httpsToken', event.target.value)} /></label><label className="wb-sync-check"><input type="checkbox" checked={draft.clearHttpsToken} onChange={event => setDraft(previous => ({ ...previous, clearHttpsToken: event.target.checked, httpsToken: '' }))} />清除已保存的 HTTPS 令牌</label><p className="wb-sync-muted">令牌仅用于连接认证，保存后不会回显。</p></div></details>
          <label className="wb-sync-check"><input type="checkbox" checked={draft.autoCheck} onChange={event => update('autoCheck', event.target.checked)} />自动检测远端状态（每分钟）</label><p className="wb-sync-note">自动检测只检查状态并获取远端信息，不会自动提交、拉取项目内容或推送。</p>
          <div className="wb-sync-actions"><Button disabled={busy || !draft.repositoryUrl.trim()} onClick={testConnection}>测试连接</Button>{probe && <span role="status" className="wb-sync-muted">{probe.reachable === true || probe.ok === true ? '连接测试通过' : probe.reachable === false || probe.ok === false ? '连接测试未通过' : '服务未确认连接成功'}</span>}</div>
          {error && <Button disabled={busy} onClick={() => refresh()}>读取最新状态，保留当前草稿</Button>}
          <details className="wb-sync-ssh"><summary>SSH 密钥与主机配置</summary><div className="wb-sync-form">
            <p className="wb-sync-muted">在插件中生成或导入密钥，并把公钥添加到代码托管平台。私钥不会回显，也不会写入系统 SSH 配置。</p>
            {profiles.map(profile => <article className="wb-sync-profile" key={profile.id}><div><strong>{profile.name}</strong><code>{profile.username}@{profile.host}:{profile.port}</code><code>主机指纹：{profile.hostFingerprint || profile.trustedHost?.fingerprint || '尚未信任'}</code></div><div className="wb-sync-actions"><Button onClick={() => showPublicKey(profile)}>公钥</Button><Button onClick={() => inspectHost(profile)}>检查主机</Button><Button onClick={() => testSsh(profile)}>测试认证</Button><Button onClick={() => { setRemoveProfile(profile); setModal({ type: 'remove-profile' }); }}>移除</Button></div></article>)}
            <label>添加 SSH 配置<select value={sshDraft.mode} onChange={event => setSshDraft(previous => ({ ...previous, mode: event.target.value, privateKey: '' }))}><option value="generate">生成新的 Ed25519 密钥</option><option value="import">导入已有私钥</option></select></label>
            <label>配置名称<input autoComplete="off" value={sshDraft.name} onChange={event => setSshDraft(previous => ({ ...previous, name: event.target.value }))} /></label>
            <div className="wb-sync-form-grid"><label>SSH 主机<input placeholder="github.com" value={sshDraft.host} onChange={event => setSshDraft(previous => ({ ...previous, host: event.target.value }))} /></label><label>端口<input type="number" min="1" max="65535" value={sshDraft.port} onChange={event => setSshDraft(previous => ({ ...previous, port: event.target.value }))} /></label></div>
            <label>SSH 用户名<input value={sshDraft.username} onChange={event => setSshDraft(previous => ({ ...previous, username: event.target.value }))} /></label>
            {sshDraft.mode === 'import' && <label>SSH 私钥<textarea rows={7} autoComplete="off" spellCheck={false} value={sshDraft.privateKey} onChange={event => setSshDraft(previous => ({ ...previous, privateKey: event.target.value }))} /></label>}
            <label>密钥口令<input type="password" autoComplete="new-password" placeholder="可选" value={sshDraft.passphrase} onChange={event => setSshDraft(previous => ({ ...previous, passphrase: event.target.value }))} /></label>
            <div className="wb-sync-actions"><Button disabled={busy} onClick={addSshProfile}>{sshDraft.mode === 'import' ? '导入 SSH 配置' : '生成 SSH 配置'}</Button><Button disabled={busy || !sshDirty} onClick={() => setSshDraft(sshProfileDraft())}>清除 SSH 草稿</Button></div>
          </div></details>
          <footer>{binding && <Button disabled={busy} onClick={() => setModal({ type: 'unbind' })}>解除绑定</Button>}<span className="wb-grow"/><Button disabled={busy} onClick={close}>关闭</Button><Button primary disabled={busy || !configDirty} onClick={saveBinding}>保存同步配置</Button></footer>
        </div>}
        {modal.type === 'initial-import' && <div className="wb-sync-form"><p className="wb-sync-note wb-sync-warning">选定仓库目录中已有远端项目。确认后将把它导入当前项目；当前已保存版本会保留在历史中，不会覆盖仓库内的其他目录。</p><div className="wb-sync-repository"><div><strong>{modal.pending.binding.branch || binding?.branch}</strong><code>{modal.pending.binding.repositoryUrl || binding?.repositoryUrl}</code><code>仓库内目录：{modal.pending.binding.projectPath || binding?.projectPath}</code></div></div>{modal.pending.action === 'sync' && <p className="wb-sync-muted">导入完成后，将继续此前请求的“提交并同步”操作，使用原提交说明。</p>}<footer><Button disabled={busy} onClick={close}>取消，保留当前项目</Button><Button primary disabled={busy} onClick={confirmInitialImport}>确认导入{modal.pending.action === 'sync' ? '并继续同步' : ''}</Button></footer></div>}
        {modal.type === 'operation' && <form className="wb-sync-form" onSubmit={event => { event.preventDefault(); operate(modal.action); }}><p className="wb-sync-note">{modal.action === 'sync' ? '按顺序提交当前项目、拉取可直接前进的远端提交并推送。若发生分叉，操作会停止并保留本地内容。' : '为当前项目创建本地提交。此操作不会推送到远端。'}</p><label>提交说明<textarea rows={3} required maxLength={2000} value={message} onChange={event => setMessage(event.target.value)} placeholder="说明这次修改的内容…" /></label><footer><Button onClick={close}>取消</Button><Button primary type="submit" disabled={!message.trim()}>{actionLabel(modal.action)}</Button></footer></form>}
        {modal.type === 'trust' && inspection && <div className="wb-sync-trust"><p className={`wb-sync-note ${inspection.host.changed ? 'wb-sync-warning' : ''}`}>{inspection.host.changed ? '主机指纹与已保存值不同。请向服务提供方核对当前指纹，再决定是否更新信任。' : '请向代码托管平台核对以下主机指纹。检查操作不会自动信任主机。'}</p><strong>{inspection.host.host}:{inspection.host.port}</strong><code>{inspection.host.fingerprint}</code>{inspection.profile.hostFingerprint && <p className="wb-sync-muted">之前的指纹：{inspection.profile.hostFingerprint}</p>}<div className="wb-sync-actions"><Button onClick={close}>返回设置</Button><Button primary onClick={trustHost}>已核对，信任此主机指纹</Button></div></div>}
        {modal.type === 'public' && publicProfile && <div className="wb-sync-form"><strong>{publicProfile.name}</strong>{publicProfile.fingerprint && <p className="wb-sync-muted">公钥指纹：{publicProfile.fingerprint}</p>}<p className="wb-sync-muted">把此公钥添加到代码托管平台的 SSH Keys。私钥不会显示。</p><textarea className="wb-sync-public-key" readOnly rows={5} aria-label="SSH 公钥" value={publicProfile.publicKey} /><div className="wb-sync-actions"><Button primary onClick={copyPublicKey}>复制公钥</Button><Button onClick={close}>返回设置</Button></div></div>}
        {modal.type === 'remove-profile' && removeProfile && <div className="wb-sync-form"><p className="wb-sync-note">移除「{removeProfile.name}」会删除插件中保存的此项 SSH 凭据。使用它的同步配置需要重新选择有效配置。</p><footer><Button onClick={close}>取消</Button><Button primary onClick={deleteSshProfile}>确认移除</Button></footer></div>}
        {modal.type === 'unbind' && <div className="wb-sync-form"><p className="wb-sync-note">解除当前项目与远端仓库的同步绑定。本地项目内容会保留。</p><footer><Button onClick={() => setModal({ type: 'config' })}>返回设置</Button><Button primary onClick={unbind}>确认解除绑定</Button></footer></div>}
      </div>
    </Modal>}
  </section>;
}

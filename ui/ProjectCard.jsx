import React from 'react';
import {Button, ErrorBox, FieldError, Modal} from './common.jsx';
import {Icon} from './brand.jsx';
import ProjectPreview from './ProjectPreview.jsx';
import projectCardStyles from './project-card-styles.js';

const ACTION_LABELS = {rename: '重命名', move: '移动分组', delete: '删除项目'};

// Identity, rather than render order, chooses a repeatable cover.
function coverTone(id) {
  let hash = 0;
  for (const char of String(id || '')) hash = (Math.imul(hash, 31) + char.codePointAt(0)) | 0;
  return (hash >>> 0) % 3;
}

export default function ProjectCard({project, api, groups = [], onOpenProject, onProjectAction, disabled = false}) {
  const card = React.useRef(null), moreButton = React.useRef(null), menu = React.useRef(null), field = React.useRef(null);
  const lock = React.useRef(false), mounted = React.useRef(true);
  const menuId = React.useId(), fieldId = React.useId();
  const [menuPosition, setMenuPosition] = React.useState(null);
  const [dialog, setDialog] = React.useState(null);
  const [name, setName] = React.useState(''), [groupId, setGroupId] = React.useState('');
  const [busy, setBusy] = React.useState(null), [error, setError] = React.useState(null), [feedback, setFeedback] = React.useState(null);
  const label = project.name || project.id;
  const unavailable = project.unavailable || project.deletedAt || project.archived || !project.id;
  const blockedError = React.useMemo(() => unavailable ? project.error || new Error('项目暂不可用，请刷新后重试。')
    : typeof onProjectAction !== 'function' ? new Error('项目操作暂不可用，请刷新后重试。') : null, [unavailable, project.error, onProjectAction]);
  const fieldError = error?.details?.field ? error : null;
  const actionDisabled = Boolean(busy || disabled || blockedError);
  const openDisabled = Boolean(busy || disabled || unavailable || typeof onOpenProject !== 'function');

  React.useEffect(() => {mounted.current = true; return () => {mounted.current = false;};}, []);
  React.useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 2400);
    return () => clearTimeout(timer);
  }, [feedback]);

  function closeMenu(restoreFocus = false) {
    setMenuPosition(null);
    if (restoreFocus) moreButton.current?.focus();
  }

  function showMenu(last = false) {
    if (actionDisabled || lock.current) return;
    const rect = moreButton.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(192, window.innerWidth - 16), height = 148;
    const top = rect.bottom + 6 + height <= window.innerHeight - 8
      ? rect.bottom + 6 : Math.max(8, rect.top - height - 6);
    setMenuPosition({left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)), top, width, last});
  }

  React.useEffect(() => {
    if (!menuPosition) return;
    const items = menu.current?.querySelectorAll('[role="menuitem"]');
    (menuPosition.last ? items?.[items.length - 1] : items?.[0])?.focus();
    function pointer(event) {
      if (!menu.current?.contains(event.target) && !moreButton.current?.contains(event.target)) closeMenu();
    }
    function key(event) {
      if (event.key === 'Escape') {event.preventDefault(); event.stopPropagation(); closeMenu(true);}
    }
    function reposition(event) {
      if (event?.target && menu.current?.contains(event.target)) return;
      closeMenu();
    }
    document.addEventListener('pointerdown', pointer, true);
    document.addEventListener('keydown', key, true);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('pointerdown', pointer, true);
      document.removeEventListener('keydown', key, true);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [menuPosition]);
  React.useEffect(() => {if (actionDisabled) setMenuPosition(null);}, [actionDisabled]);
  React.useEffect(() => {if (dialog) field.current?.focus();}, [dialog]);

  function begin(action) {
    if (actionDisabled || lock.current) return;
    // Modal restores focus to the trigger after it closes.
    closeMenu(true);
    setName(project.name || '');
    setGroupId(project.groupId || '');
    setError(null);
    setFeedback(null);
    setDialog(action);
  }

  function closeDialog() {
    if (lock.current) return;
    setDialog(null);
    setError(null);
  }

  async function run(action, values = {}) {
    if (lock.current) return;
    if (blockedError) {setError(blockedError); return;}
    lock.current = true;
    setBusy(action);
    setError(null);
    setFeedback(null);
    try {
      await onProjectAction(action, project, values);
      if (mounted.current) {
        setDialog(null);
        setFeedback({action, message: action === 'clone' ? '已复制' : action === 'delete' ? '已移入回收站' : '已保存'});
      }
    } catch (failure) {
      if (mounted.current) setError(failure || new Error('操作失败，请重试。'));
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(null);
    }
  }

  function submit(event) {
    event.preventDefault();
    if (actionDisabled || !dialog) return;
    if (dialog === 'rename') {
      if (!name.trim()) {setError(Object.assign(new Error('请输入项目名称。'), {details:{field:'name'}})); return;}
      return run('rename', {name: name.trim()});
    }
    if (dialog === 'move') {
      if (groupId && !groups.some(group => group.id === groupId)) {setError(Object.assign(new Error('该分组已不可用，请重新选择。'), {details:{field:'groupId'}})); return;}
      return run('move', {groupId: groupId || null});
    }
    return run('delete');
  }

  function menuKeyDown(event) {
    const items = [...menu.current.querySelectorAll('[role="menuitem"]')];
    const index = items.indexOf(document.activeElement);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      closeMenu(true);
    }
  }

  const fallback = <span className="wb-project-cover" data-tone={coverTone(project.id)} aria-hidden="true"/>;

  return <article ref={card} className="wb-project-card" data-project-id={project.id} aria-label={`项目 ${label}`} aria-busy={Boolean(busy)}>
    <style>{projectCardStyles}</style>
    <button type="button" className="wb-project-card-preview" data-project-open="preview" aria-label={`打开项目 ${label}`} disabled={openDisabled} onClick={() => onOpenProject?.(project.id)}>
      <span className="wb-project-card-preview-fill"><ProjectPreview project={project} api={api} fallback={fallback}/></span>
    </button>
    <div className="wb-project-card-actions">
      <button type="button" className="wb-project-card-name" data-project-open="name" title={label} disabled={openDisabled} onClick={() => onOpenProject?.(project.id)}>{label}</button>
      <div className="wb-project-card-tools">
        <button type="button" className="wb-project-card-tool" data-project-action="clone" aria-label={`复制项目 ${label}`} title={busy === 'clone' ? '正在复制…' : feedback?.action === 'clone' ? '已复制' : '复制项目'} disabled={actionDisabled || feedback?.action === 'clone'} onClick={() => run('clone')}>
          <Icon name={feedback?.action === 'clone' ? 'check' : 'copy'} size={16}/>
        </button>
        <button ref={moreButton} type="button" className="wb-project-card-tool" data-project-action="more" aria-label={`更多项目操作 ${label}`} title="更多操作" aria-haspopup="menu" aria-expanded={Boolean(menuPosition)} aria-controls={menuPosition ? menuId : undefined} disabled={actionDisabled}
          onClick={() => menuPosition ? closeMenu() : showMenu()}
          onKeyDown={event => {if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {event.preventDefault(); showMenu(event.key === 'ArrowUp');}}}>
          <Icon name="more" size={18}/>
        </button>
      </div>
    </div>
    <div className="wb-project-card-feedback" role="status" aria-live="polite">{busy ? (busy === 'clone' ? '正在复制…' : '正在保存…') : feedback?.message}</div>
    <ErrorBox error={fieldError ? null : error} onClose={()=>setError(null)} context={busy === 'clone' ? '复制项目' : '项目操作'}/>
    {blockedError && <p className="wb-muted" role="status">项目操作暂不可用，请刷新后重试。</p>}
    {menuPosition && <div ref={menu} id={menuId} className="wb-project-card-menu" data-project-menu={project.id} role="menu" aria-label={`${label}的更多操作`}
      style={{left: menuPosition.left, top: menuPosition.top, width: menuPosition.width}} onKeyDown={menuKeyDown} onBlur={event => {if (!event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== moreButton.current) closeMenu();}}>
      {['rename', 'move', 'delete'].map(action => <button key={action} type="button" role="menuitem" tabIndex={-1} data-project-action={action} className={action === 'delete' ? 'wb-project-card-danger' : ''} disabled={actionDisabled} onClick={() => begin(action)}>
        {action === 'move' && <Icon name="folder" size={15}/>}<span>{ACTION_LABELS[action]}</span>
      </button>)}
    </div>}
    {dialog && <div className="wb-project-card-dialog-host" data-project-dialog={project.id}>
      <Modal title={ACTION_LABELS[dialog]} onClose={closeDialog} className="wb-project-card-dialog">
        <form className="wb-project-card-form" aria-label={ACTION_LABELS[dialog]} onSubmit={submit} aria-busy={Boolean(busy)}>
          {dialog === 'rename' && <label htmlFor={fieldId}>项目名称<input ref={field} id={fieldId} autoComplete="off" value={name} required maxLength={160} disabled={actionDisabled} onChange={event => {setName(event.target.value); if(fieldError?.details.field === 'name')setError(null);}}/></label>}
          {dialog === 'move' && <label htmlFor={fieldId}>移至分组<select ref={field} id={fieldId} value={groupId} disabled={actionDisabled} onChange={event => {setGroupId(event.target.value); if(fieldError?.details.field === 'groupId')setError(null);}}>
            <option value="">未分组</option>{groupId && !groups.some(group => group.id === groupId) && <option value={groupId} disabled>原分组已不可用</option>}{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select></label>}
          {dialog === 'delete' && <p className="wb-project-card-delete-copy">将「{label}」移入回收站，可恢复。</p>}
          <FieldError error={fieldError} context={fieldError?.details.field === 'name' ? '项目名称' : '移至分组'}/>
          {blockedError && <p className="wb-muted" role="status">项目操作暂不可用，请刷新后重试。</p>}
          <footer><Button disabled={Boolean(busy)} onClick={closeDialog}>取消</Button><Button primary type="submit" data-project-confirm={dialog} className={dialog === 'delete' ? 'wb-project-card-delete' : ''} disabled={actionDisabled || (dialog === 'rename' && !name.trim())}>{busy ? '处理中…' : dialog === 'delete' ? '移入回收站' : '保存'}</Button></footer>
        </form>
      </Modal>
    </div>}
  </article>;
}

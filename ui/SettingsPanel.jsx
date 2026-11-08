import React from 'react';
import {Button,ErrorBox,Modal} from './common.jsx';
import {Icon} from './brand.jsx';
import ProjectSyncPanel from './ProjectSyncPanel.jsx';
import DiagnosticsPanel from './DiagnosticsPanel.jsx';

function DiagnosticsSettingsCard({api,projectId,onAskAI,onExit}){
  const [open,setOpen]=React.useState(false),contentId=React.useId();
  return <div><section className="wb-settings-card"><div className="wb-settings-icon"><Icon name="sparkles" size={21}/></div><div className="wb-settings-copy"><h2>诊断与优化</h2><p>{projectId?'检查当前项目，获取可执行的优化建议。':'检查工作空间，获取可执行的优化建议。'}</p></div><Button disabled={typeof api!=='function'} aria-expanded={open} aria-controls={contentId} onClick={()=>setOpen(value=>!value)}>{open?'收起诊断':'开始诊断'}</Button></section>{open&&<div id={contentId} style={{marginTop:12}}><DiagnosticsPanel api={api} projectId={projectId} onAskAI={onAskAI} heading={false}/>{onExit&&<div style={{marginTop:10}}><Button onClick={onExit}>返回 DSH 对话<Icon name="arrow-right" size={15}/></Button></div>}</div>}</div>;
}

export default function SettingsPanel({library,onPickDirectory,onExit,theme='light',onThemeChange,api,onAskAI}){
  return <section className="wb-settings-page">
    <header className="wb-page-heading"><div><span className="wb-page-eyebrow">工作空间</span><h1>设置</h1><p>让工作台按照你的习惯工作。</p></div></header>
    <section className="wb-settings-card"><div className="wb-settings-icon"><Icon name="folder" size={21}/></div><div className="wb-settings-copy"><h2>本地目录</h2><p>项目、设计和资源保存在所选目录中。</p><code className="wb-settings-path" title={library.root}>{library.root||'正在读取目录…'}</code></div><Button onClick={onPickDirectory}>更改目录<Icon name="folder-open" size={15}/></Button></section>
    <section className="wb-settings-card"><div className="wb-settings-icon"><Icon name={theme==='dark'?'moon':'sun'} size={21}/></div><div className="wb-settings-copy"><h2>外观</h2><p>在浅色与深色间切换，常规交互保持中性色。</p></div><div className="wb-appearance-options" role="group" aria-label="外观模式">{[['light','浅色','sun'],['dark','深色','moon']].map(([value,label,icon])=><button type="button" key={value} className="wb-appearance-option" aria-pressed={theme===value} disabled={!onThemeChange} onClick={()=>onThemeChange(value)}><Icon name={icon} size={15}/>{label}</button>)}</div></section>
    <DiagnosticsSettingsCard api={api} onAskAI={onAskAI} onExit={onExit}/>
    <section className="wb-settings-card"><div className="wb-settings-icon"><Icon name="sparkles" size={21}/></div><div className="wb-settings-copy"><h2>模型与账号</h2><p>模型、账号及连接继续使用 DSH 的真实设置。</p></div><Button onClick={onExit}>返回对话配置<Icon name="arrow-right" size={15}/></Button></section>
  </section>;
}
const editable=project=>({name:project?.name||'',description:project?.description||'',groupId:project?.groupId||''});
export function ProjectSettingsPanel({projectId,api,groups=[],onSaved,onOpenProject,onBeforeChange,onUnavailable,registerGuard,focusSync=false,onAskAI}){
  const [project,setProject]=React.useState(null),[draft,setDraft]=React.useState({name:'',description:'',groupId:''}),[busy,setBusy]=React.useState(false),[error,setError]=React.useState(null),[confirm,setConfirm]=React.useState(null),[saved,setSaved]=React.useState(false);
  const current=React.useRef(project),draftRef=React.useRef(draft),dirtyRef=React.useRef(false),saveRef=React.useRef(null),syncGuard=React.useRef(null),syncSection=React.useRef(null);
  const registerSyncGuard=React.useCallback(guard=>{syncGuard.current=guard;return()=>{if(syncGuard.current===guard)syncGuard.current=null;};},[projectId]);
  React.useEffect(()=>{if(focusSync&&project?.id)requestAnimationFrame(()=>syncSection.current?.scrollIntoView({block:'start'}));},[focusSync,project?.id]);
  current.current=project;draftRef.current=draft;
  const dirty=!!project&&JSON.stringify(draft)!==JSON.stringify(editable(project));dirtyRef.current=dirty;
  React.useEffect(()=>{let live=true;api('project.get',{projectId}).then(value=>{if(live){setProject(value.project);setDraft(editable(value.project));}}).catch(e=>live&&setError(e));return()=>{live=false;};},[projectId,api]);
  const save=async()=>{
    if(!current.current)throw new Error('项目尚未加载。');
    if(!draftRef.current.name.trim())throw new Error('请填写项目名称。');
    setBusy(true);setError(null);setSaved(false);
    try{
      const result=await api('project.update',{projectId,expectedRevision:current.current.revision,name:draftRef.current.name.trim(),description:draftRef.current.description,groupId:draftRef.current.groupId||null});
      const next=result.project||(await api('project.get',{projectId})).project;
      current.current=next;dirtyRef.current=false;setProject(next);setDraft(editable(next));setSaved(true);await onSaved?.(next);return true;
    }catch(e){setError(e);throw e;}finally{setBusy(false);}
  };
  saveRef.current=save;
  React.useEffect(()=>registerGuard?.({get manual(){return !!syncGuard.current?.isDirty?.();},inspect:()=>syncSection.current?.scrollIntoView({block:'start'}),isDirty:()=>dirtyRef.current||!!syncGuard.current?.isDirty?.(),save:()=>saveRef.current(),discard:()=>{dirtyRef.current=false;setDraft(editable(current.current));syncGuard.current?.discard?.();},isBusy:()=>busy||!!syncGuard.current?.isBusy?.()}),[registerGuard,busy]);
  const update=(key,value)=>{setDraft(d=>({...d,[key]:value}));setSaved(false);};
  const projectAction=async action=>{
    setBusy(true);setError(null);
    try{
      if(await onBeforeChange?.(projectId)===false)return;
      const latest=(await api('project.get',{projectId})).project;
      const result=await api(action,{projectId,expectedRevision:latest.revision,...action==='project.clone'?{name:(draft.name||latest.name)+' 副本'}:{}});
      if(action==='project.clone'){await onSaved?.(latest);await onOpenProject?.((result.project||result).id);}
      else{dirtyRef.current=false;await onUnavailable?.(projectId);}
      setConfirm(null);
    }catch(e){setError(e);}finally{setBusy(false);}
  };
  return <section className="wb-settings-page">
    <header className="wb-page-heading"><div><span className="wb-page-eyebrow">项目设置</span><h1>{project?.name||'正在加载项目…'}</h1><p>管理项目信息与归属，修改后保存生效。</p></div><Button disabled={!project||busy} onClick={()=>onOpenProject(projectId)}>打开项目<Icon name="arrow-right" size={15}/></Button></header>
    <ErrorBox error={error} onClose={()=>setError(null)}/>
    {error&&<Button disabled={busy} onClick={async()=>{setBusy(true);try{const latest=(await api('project.get',{projectId})).project;current.current=latest;setProject(latest);setError(null);}catch(e){setError(e);}finally{setBusy(false);}}}>读取最新信息，保留当前草稿</Button>}
    <form className="wb-settings-form" onSubmit={event=>{event.preventDefault();save().catch(()=>{});}}>
      <div className="wb-settings-form-body"><label>项目名称<input value={draft.name} maxLength={200} required disabled={!project||busy} onChange={e=>update('name',e.target.value)}/></label><label>描述<textarea rows={4} value={draft.description} disabled={!project||busy} onChange={e=>update('description',e.target.value)}/></label><label>所属分组<select value={draft.groupId} disabled={!project||busy} onChange={e=>update('groupId',e.target.value)}><option value="">未分组</option>{groups.map(group=><option key={group.id} value={group.id}>{group.name}</option>)}</select></label></div>
      <footer><span className="wb-muted">{dirty?'有未保存的更改':saved?'设置已保存':'项目内容和设计历史会保留'}</span><span className="wb-grow"/><Button disabled={!dirty||busy} onClick={()=>{setDraft(editable(project));setSaved(false);}}>还原更改</Button><Button primary type="submit" disabled={!project||!dirty||busy}>{busy?'正在保存…':'保存设置'}</Button></footer>
    </form>
    {project&&<DiagnosticsSettingsCard key={projectId} api={api} projectId={projectId} onAskAI={onAskAI}/>}
    {project&&<div ref={syncSection}><ProjectSyncPanel api={api} project={project} registerGuard={registerSyncGuard} onBeforeSync={onBeforeChange} onChanged={async next=>{const keepDraft=dirtyRef.current;current.current=next;setProject(next);if(!keepDraft)setDraft(editable(next));await onSaved?.(next);}}/></div>}
    <section className="wb-settings-card"><div className="wb-settings-icon"><Icon name="layers" size={21}/></div><div className="wb-settings-copy"><h2>复制项目</h2><p>创建独立副本，保留当前项目。</p></div><Button disabled={!project||busy} onClick={()=>projectAction('project.clone')}>创建副本</Button></section>
    <section className="wb-settings-card"><div className="wb-settings-icon"><Icon name="archive" size={21}/></div><div className="wb-settings-copy"><h2>整理项目</h2><p>归档或移入回收站后，仍可从项目列表恢复。</p></div><Button disabled={!project||busy} onClick={()=>setConfirm('project.archive')}>归档</Button><Button disabled={!project||busy} onClick={()=>setConfirm('project.delete')}>移入回收站</Button></section>
    {confirm&&<Modal title={confirm==='project.archive'?'归档项目':'移入回收站'} onClose={()=>!busy&&setConfirm(null)}><div className="wb-stack"><p>{confirm==='project.archive'?'项目将从活跃列表移至回收站，可随时恢复。':'项目文件和设计历史会保留，可以从回收站恢复。'}</p>{dirty&&<p className="wb-muted">当前未保存的设置不会写入项目。</p>}<div className="wb-row"><span className="wb-grow"/><Button disabled={busy} onClick={()=>setConfirm(null)}>取消</Button><Button primary disabled={busy} onClick={()=>projectAction(confirm)}>确认{confirm==='project.archive'?'归档':'移入回收站'}</Button></div></div></Modal>}
  </section>;
}

import React from 'react';
import {Button, ErrorBox, Modal} from './common.jsx';
import {createProjectWithOptions} from './home-project-options.js';
import {Icon} from './brand.jsx';
import ProjectCard from './ProjectCard.jsx';
import projectStyles from './project-manager-styles.js';

export default function ProjectManagerPanel({library, api, previewApi, onRefresh, group='all', onGroupChange, query='', onQueryChange, onOpenProject, onProjectAction, onManageGroup, registerGuard}) {
  const groups=library.groups||[], projects=(library.projects||[]).filter(p=>!p.deletedAt&&!p.archived);
  const selected=group==='ungrouped'||groups.some(g=>g.id===group)?group:'all';
  const term=query.trim().toLocaleLowerCase();
  const visible=projects.filter(p=>(selected==='all'||(selected==='ungrouped'?!p.groupId:p.groupId===selected))&&`${p.name||''} ${p.description||''}`.toLocaleLowerCase().includes(term));
  const [form,setForm]=React.useState(null),[name,setName]=React.useState(''),[projectGroup,setProjectGroup]=React.useState(''),[platform,setPlatform]=React.useState('web'),[artifactKind,setArtifactKind]=React.useState('html'),[busy,setBusy]=React.useState(false),[error,setError]=React.useState(null);
  const checkpoint=React.useRef(null),lock=React.useRef(false),nameInput=React.useRef(null),live=React.useRef({});
  live.current={busy,dirty:!!form&&(!!name.trim()||form==='project'&&(platform!=='web'||artifactKind!=='html')),discard:()=>{if(lock.current)return;setForm(null);setName('');setProjectGroup('');setPlatform('web');setArtifactKind('html');setError(null);checkpoint.current=null;}};
  React.useEffect(()=>registerGuard?.({manual:true,isDirty:()=>live.current.dirty,isBusy:()=>live.current.busy||lock.current,discard:()=>live.current.discard(),inspect:()=>requestAnimationFrame(()=>nameInput.current?.focus())}),[registerGuard]);
  React.useEffect(()=>{if(group!==selected)onGroupChange?.(selected);},[group,selected,onGroupChange]);
  React.useEffect(()=>{if(form)nameInput.current?.focus();},[form]);

  function begin(kind) {
    if(busy||lock.current)return;
    if(form===kind){nameInput.current?.focus();return;}
    if(form&&name.trim())return;
    checkpoint.current=null;setName('');setProjectGroup(groups.some(g=>g.id===selected)?selected:'');setPlatform('web');setArtifactKind('html');setError(null);setForm(kind);
  }
  async function submit(event) {
    event.preventDefault();
    if(!name.trim()||lock.current)return;
    lock.current=true;setBusy(true);setError(null);
    try {
      if(form==='project') {
        await createProjectWithOptions(api,{name:name.trim(),platform,artifactKind,groupId:projectGroup||null,start:{kind:'empty'}},{checkpoint:checkpoint.current,onCheckpoint:value=>{checkpoint.current=value;}});
        await onRefresh();onQueryChange?.('');onGroupChange?.(projectGroup||'all');
      } else {
        if(!checkpoint.current) {
          const result=await api('group.create',{name:name.trim()});
          checkpoint.current={groupId:result.group?.id||result.id,committed:true};
        }
        const state=await onRefresh();
        const id=checkpoint.current.groupId||state?.groups?.find(g=>g.name===name.trim())?.id;
        onQueryChange?.('');if(id)onGroupChange?.(id);
      }
      checkpoint.current=null;setForm(null);setName('');
    } catch(failure) {setError(failure);await onRefresh().catch(()=>{});}
    finally {lock.current=false;setBusy(false);}
  }
  const selectedGroup=groups.find(g=>g.id===selected);
  const filters=[{id:'all',name:'全部'},...(groups.length?[{id:'ungrouped',name:'未分组'},...groups]:[])];
  return <section className="wb-projects-page" aria-label="项目管理" aria-busy={busy}>
    <style>{projectStyles}</style>
    <header className="wb-manager-head wb-projects-head">
      <div className="wb-projects-search"><Icon name="search" size={16}/><input aria-label="搜索项目" placeholder="搜索项目…" value={query} onChange={e=>onQueryChange?.(e.target.value)}/>{query&&<button type="button" aria-label="清空搜索" onClick={()=>onQueryChange?.('')}><Icon name="x" size={14}/></button>}</div>
      <Button primary disabled={busy||!!form} aria-expanded={form==='project'} onClick={()=>begin('project')}><Icon name="plus" size={16}/>新建项目</Button>
    </header>
    <div className="wb-projects-groups" role="group" aria-label="项目分组">
      {filters.map(item=><button type="button" key={item.id} aria-pressed={selected===item.id} disabled={busy} onClick={()=>onGroupChange?.(item.id)}>{item.name}</button>)}
      <button type="button" className="wb-projects-add-group" disabled={busy||!!form} aria-expanded={form==='group'} onClick={()=>begin('group')}><Icon name="plus" size={14}/>新建分组</button>
      {selectedGroup&&<button type="button" className="wb-projects-group-settings" aria-label={`管理分组 ${selectedGroup.name}`} title="管理分组" disabled={busy} onClick={()=>onManageGroup?.(selectedGroup)}><Icon name="settings" size={15}/></button>}
    </div>
    {form==='project'&&<Modal title="新建项目" onClose={()=>live.current.discard()} className="wb-dialog-project"><form className="wb-form" aria-label="新建项目" onSubmit={submit}>
      <ErrorBox error={error} onClose={()=>setError(null)} context="创建项目"/>
      {checkpoint.current&&<p className="wb-muted">项目已创建，将使用原平台与产物类型继续初始化；重试不会重复创建项目。</p>}
      <label>项目名称<input ref={nameInput} aria-label="项目名称" placeholder="项目名称" value={name} maxLength={160} disabled={busy||!!checkpoint.current} required onChange={e=>setName(e.target.value)}/></label>
      <label>分组<select aria-label="新项目分组" value={projectGroup} disabled={busy||!!checkpoint.current} onChange={e=>setProjectGroup(e.target.value)}><option value="">未分组</option>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
      <label>平台<select aria-label="新项目平台" value={platform} disabled={busy||!!checkpoint.current} onChange={e=>setPlatform(e.target.value)}><option value="web">Web</option><option value="mobile">移动端</option></select></label>
      <label>产物类型<select aria-label="新项目产物类型" value={artifactKind} disabled={busy||!!checkpoint.current} onChange={e=>setArtifactKind(e.target.value)}><option value="html">HTML</option><option value="react">React</option><option value="vue">Vue</option></select></label>
      <p className="wb-muted">{artifactKind==='html'?'创建可在画布中编辑的 HTML 页面。':'创建可运行的源码页面，选中画布元素后由 AI 修改对应源码。'}</p>
      <footer><Button disabled={busy} onClick={()=>live.current.discard()}>取消</Button><Button primary type="submit" disabled={busy||!name.trim()}>{busy?'创建中…':checkpoint.current?'重试完成创建':'创建项目'}</Button></footer>
    </form></Modal>}
    {form==='group'&&<form className="wb-projects-create" aria-label="新建分组" onSubmit={submit}>
      <input ref={nameInput} aria-label="分组名称" placeholder="分组名称" value={name} maxLength={160} disabled={busy||!!checkpoint.current} required onChange={e=>setName(e.target.value)}/>
      <Button primary type="submit" disabled={busy||!name.trim()}>{busy?'创建中…':'创建'}</Button><Button disabled={busy} onClick={()=>live.current.discard()}>取消</Button>
    </form>}
    {form!=='project'&&<ErrorBox error={error} onClose={()=>setError(null)} context={form==='group'?'创建分组':'创建项目'}/>}
    {visible.length>0?<div className="wb-projects-grid">{visible.map(project=><ProjectCard key={project.id} project={project} api={previewApi||api} groups={groups} onOpenProject={onOpenProject} onProjectAction={onProjectAction} disabled={busy}/>)}</div>:<div className="wb-projects-empty" role="status"><Icon name={term?'search':'folder-open'} size={30}/><span>{term?'未找到项目':'暂无项目'}</span></div>}
  </section>;
}

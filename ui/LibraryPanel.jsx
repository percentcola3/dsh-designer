import React from "react";
import { Button, Modal, ErrorBox, FieldError, useDownload } from "./common.jsx";
import ResourceView from "./ResourceView.jsx";
import { uploadFile } from "./upload.js";
import { readSystemResource, isTextSystemResource, replaceSystemResource, systemResourceFileBody, inlineSystemResource } from "./system-resource.js";
import { systemVersionForm, parseSystemVersionDraft, systemVersionDraftKey, hasSystemVersionChanges, applySystemResourceDraft } from './system-version.js';
import {Icon} from './brand.jsx';
import galleryStyles from './resource-gallery-styles.js';
import ResourceCardCover from './ResourceCardCover.jsx';
import {skillFileDraft,skillFileDraftChanged,downloadedSkillFileDraft} from './skill-file-draft.js';

function LibraryPanel({ kind, api, library, onRefresh, registerGuard, onAddSkill }) {
  const downloadValue=useDownload();
  const [systems, setSystems] = React.useState(library.systems || []), [skills, setSkills] = React.useState([]), [projectId, setProjectId] = React.useState(""), [enabled, setEnabled] = React.useState([]), [project, setProject] = React.useState(null), [query, setQuery] = React.useState(""), [modal, setModal] = React.useState(null), [error, setError] = React.useState(null), [busy, setBusy] = React.useState(false), [decision, setDecision] = React.useState(null);
  const [hiddenSkills, setHiddenSkills] = React.useState([]), [showHidden, setShowHidden] = React.useState(false);
  const rootRef = React.useRef(null);
  const visibilityKey = `dsh-designer:hidden-skills:1:${encodeURIComponent(library.root || 'default')}`;
  React.useEffect(() => {
    try { const value = JSON.parse(localStorage.getItem(visibilityKey) || '[]'); setHiddenSkills(Array.isArray(value) ? value.filter(name => typeof name === 'string') : []); }
    catch { setHiddenSkills([]); }
    setShowHidden(false);
  }, [visibilityKey]);
  React.useEffect(() => {
    const outside = event => rootRef.current?.querySelectorAll('.wb-skill-card-menu[open]').forEach(menu => { if (!menu.contains(event.target)) menu.open = false; });
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);
  const toggleHidden = skill => {
    const next = hiddenSkills.includes(skill.name) ? hiddenSkills.filter(name => name !== skill.name) : [...hiddenSkills, skill.name];
    setHiddenSkills(next);
    try { localStorage.setItem(visibilityKey, JSON.stringify(next)); } catch { setSkillNotice('隐藏偏好暂时仅在本次工作台中保留。'); }
  };
  // Session memory only: never write draft bytes to the shared library or browser storage.
  const drafts = React.useRef(new Map()), lastKept = React.useRef(new Map()), skillDraft=React.useRef(null);
  const [skillNotice,setSkillNotice]=React.useState('');
  const liveForm=React.useRef({modal,busy});liveForm.current={modal,busy};
  React.useEffect(()=>registerGuard?.({
    manual:true,
    isDirty:()=>{const value=liveForm.current.modal;if(skillFileDraftChanged(skillDraft.current)||value?.type==='skill-add'&&skillFileDraftChanged(value))return true;if(drafts.current.size)return true;if(value?.type==='system')return hasSystemVersionChanges(value);if(value?.type==='resource')return hasSystemVersionChanges(value.previous)||(value.editing&&value.draftText!==value.originalText);return false;},
    isBusy:()=>liveForm.current.busy&&!!liveForm.current.modal,
    inspect:()=>{if(!liveForm.current.modal&&skillDraft.current)setModal({...skillDraft.current});else if(!liveForm.current.modal&&drafts.current.size){const kept=[...drafts.current.values()].at(-1);edit(kept.sourceSystem||kept);}},
    discard:()=>{drafts.current.clear();lastKept.current.clear();skillDraft.current=null;setModal(null);setDecision(null);}
  }),[registerGuard]);
  const work = async (fn) => {
    setBusy(true); setError(null);
    try { return await fn(); } catch (e) { setError(e); } finally { setBusy(false); }
  };
  const refreshEpoch=React.useRef(0),selectedProject=React.useRef(projectId);selectedProject.current=projectId;
  const refreshData = async () => {
    const epoch=++refreshEpoch.current,owner=projectId;
    const isCurrent=()=>epoch===refreshEpoch.current&&selectedProject.current===owner;
    if (kind === "systems") {
      const r = await api("system.list", {});if(isCurrent())setSystems(r.systems || []);
    } else {
      const [r,p]=await Promise.all([api('skills.list',owner?{projectId:owner}:{}),owner?api('project.get',{projectId:owner}):Promise.resolve(null)]);
      if(!isCurrent())return;
      setSkills(Array.isArray(r)?r:r.skills||[]);setProject(p?.project||null);setEnabled(p?.project?.skillNames||[]);
    }
  };
  const refresh = () => work(refreshData);
  React.useEffect(() => {setProject(null);setEnabled([]);refresh();return()=>{refreshEpoch.current++;};}, [kind, projectId]);
  const versionForm = (system, version) => {
    const form = systemVersionForm(system, version);
    const kept = drafts.current.get(systemVersionDraftKey(form));
    return kept ? systemVersionForm(system, version, kept) : form;
  };
  const edit = (system) => work(async () => {
    const s = system?.id ? await api("system.get", { systemId: system.id }) : { name: "", description: "", platforms: ["web", "mobile"], versions: [] };
    const kept = drafts.current.get(lastKept.current.get(s.id || 'new'));
    setModal(kept ? { ...kept, revision: s.revision, versions: s.versions, sourceSystem: s } : versionForm(s, s.versions?.at(-1) || s));
  });
  const fieldError = error?.code === 'INVALID_SYSTEM_JSON' && error.details?.field ? error : null;
  const fieldErrorFor = key => fieldError?.details.field === key ? fieldError : null;
  const update = (key, value) => { setModal((v) => ({ ...v, [key]: value })); setError(current => ['INVALID_SYSTEM_JSON','INVALID_SKILL_FILE'].includes(current?.code) && current.details?.field === key ? null : current); };
  const keepForm = (form) => {
    const key = systemVersionDraftKey(form);
    drafts.current.set(key, form); lastKept.current.set(form.id || 'new', key);
  };
  const forgetForm = (form) => {
    const key = systemVersionDraftKey(form); drafts.current.delete(key);
    if (lastKept.current.get(form.id || 'new') === key) lastKept.current.delete(form.id || 'new');
  };
  const persistForm = async (form) => {
    const content = parseSystemVersionDraft(form);
    const args = { name: form.name, description: form.description, platforms: form.platforms, ...content, guidelines: form.guidelines, resources: form.resources };
    let saved;
    if (form.id) saved = await api("system.save", { ...args, systemId: form.id, expectedRevision: form.revision });
    else {
      const blob = new Blob([JSON.stringify({ ...args, versions: [{ version: 1, ...content, guidelines: form.guidelines, resources: form.resources }] })], { type: "application/json" });
      saved = await uploadFile(api, blob, { purpose: "system-package", name: form.name + ".design-system.json", mediaType: "application/json" });
    }
    forgetForm(form);
    return saved;
  };
  const restoreDraft = form => work(async()=>{
    const source=form.id?await api('system.get',{systemId:form.id}):form.sourceSystem||form;
    setModal({...form,revision:source.revision,versions:source.versions,sourceSystem:source});
  });
  const afterSave = async () => { await refreshData(); await onRefresh(); };
  const save = (e) => {
    e.preventDefault();
    work(async () => { await persistForm(modal); setModal(null); await afterSave(); });
  };
  const leaveForm = (form, next) => {
    if (busy) return;
    if (!hasSystemVersionChanges(form)) { next(form); return; }
    setDecision({ title: "此版本表单有未保存修改", text: "资源替换与已应用文本只在表单中。保存新版本才会写入体系；保留草稿仅在此面板本次打开期间有效。", actions: [
      { label: "保存新版本后继续", run: () => work(async () => { const saved = await persistForm(form); setDecision(null); next(saved); await afterSave(); }) },
      { label: "保留草稿并继续", run: () => { keepForm(form); setDecision(null); next(form); } },
      { label: "丢弃修改并继续", run: () => { forgetForm(form); setDecision(null); next(form); } }
    ] });
  };
  const resourceParent = (value, mode) => {
    const path = value.tab.path, parent = value.previous;
    if (mode === 'apply') return applySystemResourceDraft(parent, value.resourceIndex, replaceSystemResource(parent.resources[value.resourceIndex], { content: value.draftText }));
    const resourceDrafts = { ...parent.resourceDrafts };
    if (mode === 'keep') resourceDrafts[path] = { content: value.draftText };
    else if (mode === 'discard') delete resourceDrafts[path];
    return { ...parent, resourceDrafts };
  };
  const leaveResource = () => {
    if (busy) return;
    if (!modal.editing || modal.draftText === modal.originalText && !modal.previous.resourceDrafts?.[modal.tab.path]) { setModal(modal.previous); return; }
    setDecision({ title: "资源文本草稿尚未应用", text: "应用仅更新版本表单，不会保存体系。返回后还需要点击“保存新版本”。", actions: [
      { label: "应用到版本表单并返回", run: () => { setModal(resourceParent(modal, 'apply')); setDecision(null); } },
      { label: "保留文本草稿并返回", run: () => { setModal(resourceParent(modal, 'keep')); setDecision(null); } },
      { label: "丢弃文本草稿并返回", run: () => { setModal(resourceParent(modal, 'discard')); setDecision(null); } }
    ] });
  };
  const downloadSkill = (form,close=false) => work(async()=>{
    const file=skillFileDraft(form);
    await downloadValue(file);
    skillDraft.current=null;
    setSkillNotice(`已发起 ${file.name} 下载，待安装。保存到 DSH 技能目录后，刷新即可使用。`);
    setDecision(null);
    setModal(close?null:downloadedSkillFileDraft(form));
  });
  const beginSkill = () => {
    if(typeof onAddSkill==='function')return work(async()=>{await onAddSkill({projectId:projectId||undefined});await refreshData();});
    setError(null);setDecision(null);setModal(skillDraft.current?{...skillDraft.current}:{type:'skill-add',name:'',description:'',instructions:''});
  };
  const closeSkillForm = form => {
    if(!skillFileDraftChanged(form)){skillDraft.current=null;setModal(null);return;}
    setDecision({title:'技能文件草稿尚未下载',text:'输入仅保留在当前面板，不会自动安装技能。',actions:[
      {label:'下载技能文件并关闭',run:()=>downloadSkill(form,true)},
      {label:'保留草稿并关闭',run:()=>{skillDraft.current={...form};setDecision(null);setModal(null);}},
      {label:'丢弃草稿并关闭',run:()=>{skillDraft.current=null;setDecision(null);setModal(null);}}
    ]});
  };
  const closeModal = () => {
    if (busy) return;
    if (decision) { setDecision(null); return; }
    if (modal.type === 'skill-add') closeSkillForm(modal);
    else if (modal.type === 'resource') leaveResource();
    else if (modal.type === 'system') leaveForm(modal, () => setModal(null));
    else setModal(null);
  };
  const openResource = (form, index) => work(async () => {
    const r = form.resources[index];
    const value = r.content !== undefined || r.bytesBase64 !== undefined ? inlineSystemResource(r) : await readSystemResource(api, { systemId: form.id, version: form.resourceVersion, resourceId: r.id });
    const path = r.logicalPath || r.path;
    setModal({ type: "resource", previous: form, resourceIndex: index, originalText: value.content ?? value.text ?? '', tab: { ...value, id: r.id || path, resourceId: r.id || path, name: r.name || path?.split('/').pop(), path, content: value.content ?? value.text ?? '', readonly: true, type: "system-resource" } });
  });
  const replaceResource = (form, index, file) => {
    if (!file) return;
    work(async () => {
      if (form.resourceDrafts?.[form.resources[index].logicalPath || form.resources[index].path]) throw Object.assign(new Error('此资源仍有保留文本草稿，请先应用或丢弃，再替换文件。'), { code: 'SYSTEM_RESOURCE_DRAFT_PENDING' });
      const body = await systemResourceFileBody(file);
      setModal(applySystemResourceDraft(form, index, replaceSystemResource(form.resources[index], body)));
    });
  };
  const importPackage = (file) => file && work(async () => {
    await uploadFile(api, file, { purpose: "system-package", name: file.name, mediaType: "application/json" });
    await refreshData(); await onRefresh(); setModal(null);
  });
  const skillOrigin = (skill,human=false) => {
    const source=typeof skill.source==='string'?skill.source:skill.source?.kind||skill.source?.type;
    const labels={'project-agents':'项目技能','project-dsh':'项目技能','user-agents':'本机技能','user-dsh':'本机技能',custom:'自定义',filesystem:'本地文件'};
    const values=[human&&Object.hasOwn(labels,source)?labels[source]:source,typeof skill.provider==='string'?skill.provider:skill.provider?.name||skill.provider?.id].filter(value=>typeof value==='string'&&value);
    return values.map(value=>human&&value.length>48?value.slice(0,45)+'…':value).join(' · ')||'宿主技能';
  };
  const openSkill = skill => work(async()=>setModal({type:'skill',...await api('skill.get',{name:skill.name,projectId:projectId||undefined}),name:skill.name,source:skill.source,provider:skill.provider}));
  const skillDisabledReason = !projectId?'从更多操作选择项目后启用':project?.id!==projectId?'项目仍在加载，请稍后再试':busy?'操作进行中，请稍候':'';
  const toggleSkill = (skill,checked) => work(async()=>{
    if(!projectId||project?.id!==projectId)throw new Error('请先选择已加载的项目。');
    const owner=projectId,names=checked?[...new Set([...enabled,skill.name])]:enabled.filter(name=>name!==skill.name);
    const result=await api('project.update',{projectId:owner,expectedRevision:project.revision,skillNames:names});
    if(selectedProject.current===owner){setEnabled(names);setProject(result.project||result);}
    await onRefresh();
  });
  const matching = item => `${item.name||''} ${item.description||''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  const visibleSystems=systems.filter(matching),visibleSkills=skills.filter(skill => matching(skill) && (showHidden ? hiddenSkills.includes(skill.name) : !hiddenSkills.includes(skill.name)));
  const decisionView = decision && <div className="wb-card wb-stack" role="alertdialog" aria-label={decision.title}><strong>{decision.title}</strong><p>{decision.text}</p><div className="wb-row">{decision.actions.map(action => <Button key={action.label} disabled={busy} onClick={action.run}>{action.label}</Button>)}<Button disabled={busy} onClick={() => setDecision(null)}>继续编辑 / 取消离开</Button></div></div>;
  return <section ref={rootRef} className="wb-resource-gallery" aria-label={kind==='systems'?'设计体系':'技能库'} aria-busy={busy}>
    <style>{galleryStyles}</style>
    <header className="wb-resource-toolbar">
      <div className="wb-resource-search"><Icon name="search" size={16}/><input placeholder={kind==='systems'?'搜索设计体系…':'搜索技能…'} aria-label={kind==='systems'?'搜索设计体系':'搜索技能'} value={query} onChange={event=>setQuery(event.target.value)}/>{query&&<Button className="wb-ghost wb-icon-button" aria-label="清空搜索" onClick={()=>setQuery('')}><Icon name="x" size={14}/></Button>}</div>
      <div className="wb-resource-actions">
        {kind==='systems'?<Button primary disabled={busy} onClick={()=>setModal({type:'system-add'})}><Icon name="plus" size={16}/>新增体系</Button>:<Button primary disabled={busy} title={typeof onAddSkill==='function'?'打开宿主技能新增入口':skillDraft.current?'继续技能文件草稿':'创建可下载的技能文件'} onClick={beginSkill}><Icon name="plus" size={16}/>新增技能</Button>}
        <Button className="wb-ghost wb-icon-button" disabled={busy} aria-label={kind==='systems'?'设计体系更多操作':'技能库更多操作'} title={kind==='skills'&&project?.id===projectId?`更多操作 · ${project.name}`:drafts.current.size?`更多操作 · ${drafts.current.size} 份保留草稿`:'更多操作'} onClick={()=>setModal({type:'library-tools'})}><Icon name="more" size={18}/></Button>
      </div>
    </header>
    <ErrorBox error={fieldError?null:error} onClose={()=>setError(null)} context={kind==='systems'?'设计体系操作':'技能配置'}/>
    {kind==='skills'&&skillNotice&&<p className="wb-muted" role="status">{skillNotice}</p>}
    <div className="wb-resource-grid">
      {kind==='systems'?visibleSystems.map(system=><article className="wb-resource-card" key={system.id}>
        <div className="wb-resource-card-header"><span className="wb-resource-icon" data-tone="violet"><Icon name="palette" size={20}/></span><h3 className="wb-resource-title">{system.name}</h3><Button className="wb-ghost wb-icon-button" disabled={busy} aria-label={`${system.name}的更多操作`} onClick={()=>setModal({type:'system-actions',system})}><Icon name="more" size={18}/></Button></div>
        <p className="wb-resource-description">{system.description||'可复用的设计规范与资源'}</p>
        <div className="wb-resource-meta"><span>{(system.platforms||[]).map(platform=>platform==='mobile'?'移动端':platform==='web'?'Web':platform).join(' / ')||'平台未指定'}</span><span>v{system.version||system.revision}</span>{lastKept.current.has(system.id)&&<span>有保留草稿</span>}</div>
        <footer className="wb-resource-footer"><Button className="wb-resource-open" disabled={busy} onClick={()=>edit(system)}>打开<Icon name="arrow-right" size={14}/></Button></footer>
      </article>):visibleSkills.map(skill=><article className="wb-project-card wb-skill-card" key={skill.name} aria-label={`技能 ${skill.name}`}>
        <button type="button" className="wb-project-card-preview" aria-label={`打开技能 ${skill.name}`} disabled={busy} onClick={()=>openSkill(skill)}><ResourceCardCover kind="skill" label="设计技能" icon="skill" title={skill.name} description={skill.description||'查看技能正文与使用说明'}/></button>
        <footer className="wb-gallery-card-meta wb-skill-card-actions"><label title={skillDisabledReason||'为所选项目启用此技能'}><input type="checkbox" aria-label={`为所选项目启用 ${skill.name}`} title={skillDisabledReason||undefined} disabled={Boolean(skillDisabledReason)} checked={project?.id===projectId&&enabled.includes(skill.name)} onChange={event=>toggleSkill(skill,event.target.checked)}/>启用</label><div className="wb-project-card-tools">
          <button type="button" className="wb-project-card-tool" aria-label={`${showHidden?'恢复显示':'隐藏'}技能 ${skill.name}`} title={showHidden?'恢复显示':'隐藏'} disabled={busy} onClick={()=>toggleHidden(skill)}><Icon name={showHidden?'eye':'eye-off'} size={16}/></button>
          <details className="wb-skill-card-menu" onKeyDown={event=>{if(event.key==='Escape'){event.currentTarget.open=false;event.currentTarget.querySelector('summary').focus();}}} onToggle={event=>{if(event.currentTarget.open)rootRef.current?.querySelectorAll('.wb-skill-card-menu[open]').forEach(menu=>{if(menu!==event.currentTarget)menu.open=false;});}}><summary className="wb-project-card-tool" aria-label={`${skill.name}的更多操作`} title="更多操作"><Icon name="more" size={18}/></summary><div className="wb-skill-card-menu-items"><button type="button" disabled={busy} onClick={event=>{event.currentTarget.closest('details').open=false;openSkill(skill);}}>查看技能正文</button><span title={skillOrigin(skill)}>{skillOrigin(skill,true)}</span></div></details>
        </div></footer>
      </article>)}
    </div>
    {(kind==='systems'?visibleSystems:visibleSkills).length===0&&<p className="wb-muted" role="status">{busy?'正在加载…':query.trim()?'没有匹配的结果':kind==='systems'?'暂无设计体系':showHidden?'暂无隐藏技能':'暂无可用技能'}</p>}
    {modal && <Modal title={modal.type==='skill-add'?'新增技能':modal.type==='system-add'?'新增设计体系':modal.type==='library-tools'?'更多操作':modal.type==='system-actions'?`${modal.system.name} · 更多操作`:modal.type === "resource" ? modal.tab.name : modal.type === "skill" ? modal.name : modal.id ? "编辑设计体系（保存为新版本）" : "新建设计体系"} onClose={closeModal} wide={['system','skill','resource'].includes(modal.type)}>
      {decisionView}
      <div inert={decision || busy ? true : undefined}>
      {modal.type==='skill-add'?<form className="wb-form" aria-label="新增技能文件" onSubmit={event=>{event.preventDefault();downloadSkill(modal);}}>
        <p className="wb-muted">保存到 DSH 技能目录后，刷新即可使用。</p>
        <FieldError error={error?.code==='INVALID_SKILL_FILE'?error:null}/>
        <label>技能名称<input aria-label="技能名称" required maxLength={64} pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="design-review" value={modal.name} onChange={event=>update('name',event.target.value)}/></label>
        <label>描述<textarea aria-label="技能描述" required rows={2} maxLength={4000} value={modal.description} onChange={event=>update('description',event.target.value)}/></label>
        <label>技能正文<textarea aria-label="技能正文" required rows={10} maxLength={200000} value={modal.instructions} onChange={event=>update('instructions',event.target.value)}/></label>
        {modal.downloadedValues&&!skillFileDraftChanged(modal)&&<p className="wb-muted" role="status">已发起下载，待安装。</p>}
        <footer><Button disabled={busy} onClick={closeModal}>关闭</Button><Button primary type="submit" disabled={busy}>下载技能文件</Button></footer>
      </form>:modal.type==='system-add'?<div className="wb-stack"><Button primary disabled={busy} onClick={()=>edit()}><Icon name="plus" size={16}/>创建空白体系</Button><label className="wb-button"><Icon name="file" size={16}/>导入体系包<input type="file" accept="application/json,.json" disabled={busy} hidden onChange={event=>{const file=event.target.files[0];event.target.value='';if(file)importPackage(file);}}/></label></div>:modal.type==='library-tools'?<div className="wb-stack">{kind==='skills'&&<label>配置项目技能<select aria-label="配置技能的项目" value={projectId} disabled={busy} onChange={event=>setProjectId(event.target.value)}><option value="">选择项目</option>{(library.projects||[]).filter(item=>!item.deletedAt&&!item.archived).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}{kind==='skills'&&<Button disabled={busy} onClick={()=>{setShowHidden(value=>!value);setModal(null);}}><Icon name={showHidden?'eye':'eye-off'} size={16}/>{showHidden?'返回可见技能':`查看隐藏技能（${hiddenSkills.length}）`}</Button>}<Button disabled={busy} onClick={()=>work(async()=>{await refreshData();setModal(null);})}><Icon name="refresh" size={16}/>刷新</Button>{kind==='systems'&&drafts.current.size>0&&<><p className="wb-muted">已保留 {drafts.current.size} 份未保存版本草稿，仅在本次工作台中保留。</p>{[...drafts.current.values()].map(form=><Button key={systemVersionDraftKey(form)} disabled={busy} onClick={()=>restoreDraft(form)}>{form.name||'未命名体系'} · v{form.editingVersion||'新版本'} · 继续编辑</Button>)}</>}</div>:modal.type==='system-actions'?<div className="wb-stack"><Button disabled={busy} onClick={()=>work(async()=>{const result=await api('system.export',{systemId:modal.system.id});await downloadValue({content:JSON.stringify(result.system,null,2),name:result.filename,mimeType:result.mimeType});setModal(null);})}>导出体系包</Button><Button disabled={busy} onClick={()=>work(async()=>{await api('system.copy',{systemId:modal.system.id,name:modal.system.name+' 副本'});await refreshData();await onRefresh();setModal(null);})}>复制体系</Button></div>:modal.type === "skill" ? <div className="wb-stack"><p className="wb-muted" title={skillOrigin(modal)}>{skillOrigin(modal,true)}</p><pre>{modal.content || modal.instructions || "没有可显示正文"}</pre></div> : modal.type === "resource" ? <div className="wb-stack">
        <p className="wb-muted">{modal.editing ? '正在编辑本地文本草稿。应用到版本表单后仍需保存新版本；旧版本资源保持不变。' : '固定版本资源只读。通过明确编辑或在版本表单替换文件，准备下一版本。'}</p>
        {!modal.editing && isTextSystemResource(modal.tab) && <Button onClick={() => setModal(current => ({ ...current, editing: true, draftText: current.previous.resourceDrafts?.[current.tab.path]?.content ?? current.originalText }))}>{modal.previous.resourceDrafts?.[modal.tab.path] ? '继续编辑保留的文本草稿' : '编辑文本草稿'}</Button>}
        {modal.editing ? <><label>文本草稿<textarea aria-label="体系资源文本草稿" rows={24} style={{ width: '100%', fontFamily: 'monospace' }} value={modal.draftText} onChange={event => update('draftText', event.target.value)} /></label><div className="wb-row"><Button primary onClick={() => setModal(resourceParent(modal, 'apply'))}>应用到版本表单（未保存）</Button><Button onClick={leaveResource}>返回版本表单…</Button></div></> : <><div style={{ height: "65vh", display: "flex" }}><ResourceView key={modal.tab.path} tab={modal.tab} api={api} onOpenFile={(file) => {
          const index = modal.previous.resources.findIndex(r => (r.logicalPath || r.path) === file.path);
          if (index < 0) { setError(new Error('此版本表单不包含链接目标：' + file.path)); return; }
          openResource(modal.previous, index);
        }} onUpdate={(patch) => setModal((v) => v?.type === 'resource' && v.tab.path === modal.tab.path ? ({ ...v, tab: { ...v.tab, ...patch, readonly: true } }) : v)} /></div><Button onClick={leaveResource}>返回版本表单</Button></>}
      </div> : <form className="wb-form" onSubmit={save}>
        <label>名称<input required value={modal.name} onChange={(e) => update("name", e.target.value)} /></label><label>描述<textarea value={modal.description || ""} onChange={(e) => update("description", e.target.value)} /></label>
        <div className="wb-row">{["web", "mobile"].map((p) => <label className="wb-row" key={p}><input type="checkbox" checked={modal.platforms.includes(p)} onChange={(e) => update("platforms", e.target.checked ? [...modal.platforms, p] : modal.platforms.filter((v) => v !== p))} />{p}</label>)}</div>
        <label>样式变量 JSON<textarea rows={7} value={modal.tokens} aria-invalid={!!fieldErrorFor('tokens')} aria-describedby={fieldErrorFor('tokens') ? 'system-tokens-error' : undefined} onChange={(e) => update("tokens", e.target.value)} style={{ fontFamily: "monospace" }} /><FieldError id="system-tokens-error" error={fieldErrorFor('tokens')} context="样式变量 JSON"/></label><label>文字规范<textarea rows={6} value={modal.guidelines} onChange={(e) => update("guidelines", e.target.value)} /></label>
        {modal.editingVersion && <p className="wb-muted">基于 v{modal.editingVersion} 的完整内容继续编辑，保存会创建新版本。</p>}
        {[['examples', '示例 JSON'], ['skeletons', '页面骨架 JSON'], ['variables', '扩展变量 JSON']].map(([key, label]) => <label key={key}>{label}<textarea rows={5} value={modal[key]} aria-invalid={!!fieldErrorFor(key)} aria-describedby={fieldErrorFor(key) ? `system-${key}-error` : undefined} onChange={event => update(key, event.target.value)} style={{ fontFamily: 'monospace' }} /><FieldError id={`system-${key}-error`} error={fieldErrorFor(key)} context={label}/></label>)}
        <label>添加示例 / 图片 / 骨架资源（尚未保存）<input type="file" multiple onChange={(e) => {
          const files = Array.from(e.target.files); e.target.value = '';
          if (!files.length) return;
          work(async () => {
            const resources = [...modal.resources];
            for (const file of files) {
              const path = 'resources/' + file.name;
              if (resources.some(r => (r.logicalPath || r.path) === path)) throw Object.assign(new Error('资源路径已存在，请使用该行的“替换文件”：' + path), { code: 'DUPLICATE_RESOURCE' });
              resources.push({ name: file.name, logicalPath: path, path, mimeType: file.type || 'application/octet-stream', ...await systemResourceFileBody(file) });
            }
            update('resources', resources);
          });
        }} /></label>
        <p className="wb-muted">替换文件保持原逻辑路径；应用文本与替换文件都只准备版本表单。点击“保存新版本”后才会生成新的不可变资源。</p>
        {modal.resources.map((r, i) => { const path = r.logicalPath || r.path; return <div className="wb-row" key={path || i}><span className="wb-grow">{path || r.name}{r.content !== undefined || r.bytesBase64 !== undefined ? ' · 待保存资源' : ''}{modal.resourceDrafts?.[path] ? ' · 有未应用文本草稿' : ''}</span><Button onClick={() => openResource(modal, i)}>查看资源</Button><label className="wb-button">替换文件（保留路径）<input type="file" hidden onChange={event => { const file = event.target.files[0]; event.target.value = ''; replaceResource(modal, i, file); }} /></label><Button onClick={() => {
          if (modal.resourceDrafts?.[path]) { setError(Object.assign(new Error('此资源有保留文本草稿，请打开后应用或明确丢弃，再移除。'), { code: 'SYSTEM_RESOURCE_DRAFT_PENDING' })); return; }
          update('resources', modal.resources.filter((_, j) => j !== i));
        }}>移除</Button></div>; })}
        {modal.versions?.length > 0 && <details><summary>已保存版本 ({modal.versions.length})</summary>{modal.versions.map((v) => <div key={v.version} className="wb-row"><span className="wb-grow">v{v.version} · {v.createdAt}{drafts.current.has(systemVersionDraftKey({ ...modal, editingVersion: v.version })) ? ' · 有保留草稿' : ''}</span><Button onClick={() => leaveForm(modal, system => setModal(versionForm(system.type === 'system' ? system.sourceSystem : system, v)))}>查看 / 以此继续编辑</Button></div>)}</details>}
        <footer><Button onClick={closeModal}>关闭 / 取消…</Button><Button disabled={busy} primary type="submit">保存新版本</Button></footer>
      </form>}
      </div>
    </Modal>}
  </section>;
}
export { LibraryPanel as default };

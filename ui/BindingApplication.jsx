import React from 'react';
import {Button,ErrorBox,errorValue} from './common.jsx';
import {bindingApplicationState,bindingRetryArgs,prepareBindingScope} from './binding-application.js';
import {orderedDesignPages} from './page-order.js';

export default function BindingApplication({project,design,pages,selection={},api,mutate}) {
  selection=selection||{};
  const [prepared,setPrepared]=React.useState(null),[busy,setBusy]=React.useState(false),[error,setError]=React.useState(null),[retry,setRetry]=React.useState(null),[outcome,setOutcome]=React.useState(null);
  const [scopeMode,setScopeMode]=React.useState('design'),[selectedIds,setSelectedIds]=React.useState([]);
  const ownerKey=project.id+':'+(design?.id||''),owner=React.useRef(ownerKey);owner.current=ownerKey;
  const serial=React.useRef(0);
  React.useEffect(()=>{serial.current++;setPrepared(null);setBusy(false);setError(null);setRetry(null);setOutcome(null);setScopeMode('design');setSelectedIds([]);},[ownerKey]);
  React.useEffect(()=>()=>{serial.current++;},[]);
  const begin=()=>({owner:ownerKey,id:++serial.current});
  const current=ticket=>ticket.owner===owner.current&&ticket.id===serial.current;
  const applied=design?.appliedSystem,state=bindingApplicationState(applied),designPages=design?orderedDesignPages(pages,design):[];
  const changeScope=(mode,ids=selectedIds)=>{setScopeMode(mode);setSelectedIds(ids);setPrepared(null);setRetry(null);setOutcome(null);setError(null);};
  const prepare=async()=>{
    const ticket=begin();setBusy(true);setError(null);setRetry(null);setOutcome(null);
    try {
      const scope=prepareBindingScope(project,design,pages,scopeMode,selectedIds,selection);
      const binding=await api('binding.resolve',{projectId:project.id,designId:design.id});
      if(!current(ticket))return;
      const effective=binding.effectiveBinding||binding.binding||binding;
      if(!effective.systemId)throw errorValue('当前设计没有已绑定的设计规范，请先确认绑定。','NO_SYSTEM');
      setPrepared({...scope,binding:effective});
    } catch(error) {if(current(ticket))setError(error);} finally {if(current(ticket))setBusy(false);}
  };
  const submit=async args=>{
    const ticket=begin();setBusy(true);setError(null);setOutcome(null);
    try {
      const result=await mutate('binding.apply',structuredClone(args));
      if(current(ticket)){setRetry(null);setOutcome(result);}
    } catch(error) {
      if(!current(ticket))return;
      setError(error);
      const next=bindingRetryArgs(args,error);
      if(next){
        setRetry({args:next,error});
        try {
          const latest=await api('workspace.open',{projectId:args.projectId});
          if(!current(ticket))return;
          const pending=latest.project?.workbench?.bindingApplications?.find(item=>next.applicationIds.includes(item.id));
          if(pending)setPrepared(previous=>previous?{...previous,binding:{...previous.binding,systemId:pending.systemId,version:pending.version,source:pending.source}}:previous);
        } catch(refreshError) {
          if(current(ticket))setError(Object.assign(new Error(error.message+'；待执行记录刷新失败：'+refreshError.message),{code:error.code,details:error.details}));
        }
      }
    } finally {if(current(ticket))setBusy(false);}
  };
  const retryPending=async()=>{
    if(!retry)return;
    const ticket=begin();setBusy(true);setError(null);
    try {
      const latest=await api('workspace.open',{projectId:retry.args.projectId});
      if(!current(ticket))return;
      const next=bindingRetryArgs(retry.args,retry.error,latest.projectRevision||latest.project?.revision);
      if(!next)throw errorValue('服务没有返回可复用的规范应用记录。','APPLICATION_RETRY_UNAVAILABLE');
      await submit(next);
    } catch(error) {if(current(ticket))setError(error);} finally {if(current(ticket))setBusy(false);}
  };
  const refresh=async()=>{const ticket=begin();setBusy(true);setError(null);try{await api('workspace.open',{projectId:project.id});}catch(error){if(current(ticket))setError(error);}finally{if(current(ticket))setBusy(false);}};
  return <section className="wb-stack" style={{borderTop:'1px solid var(--wb-border)',paddingTop:12}}>
    <h3>按已绑定规范更新设计</h3>
    <p className="wb-muted">先确认页面或对象范围与设计规范。已提交的任务保留当时的范围，绑定切换也不会改写它。</p>
    {applied&&<div className="wb-message wb-stack"><strong>最近应用 · {state.label}</strong><span>实际保存页面 · {state.savedPageIds.length}{state.savedPageIds.length?' / '+state.savedPageIds.join(', '):''}</span><span>视觉核对 · {state.visualLabel}</span><Button disabled={busy} onClick={refresh}>刷新实际保存状态</Button></div>}
    <label>应用范围<select disabled={busy||!!retry} value={scopeMode} onChange={event=>changeScope(event.target.value)}><option value="design">当前设计的全部现有页面</option><option value="pages">指定页面</option><option value="selection">当前画布所选对象</option></select></label>
    {scopeMode==='pages'&&<div role="group" aria-label="选择更新规范的页面" className="wb-stack">{designPages.map(page=><label className="wb-row" key={page.id}><input type="checkbox" disabled={busy||!!retry} checked={selectedIds.includes(page.id)} onChange={event=>changeScope('pages',event.target.checked?[...selectedIds,page.id]:selectedIds.filter(id=>id!==page.id))}/>{page.name}</label>)}</div>}
    {scopeMode==='selection'&&<p className="wb-muted">{designPages.find(page=>page.id===selection.pageId)?.name||'当前设计尚未选择页面'} · {selection.nodeIds?.length||0} 个所选对象</p>}
    <Button disabled={busy||!!retry||!design||!designPages.length} onClick={prepare}>预告所选范围的更新</Button>
    {prepared&&<div className="wb-message wb-stack"><strong>{prepared.designName} · {prepared.args.pageIds.length} 个页面{prepared.args.nodeIds?.length?' · '+prepared.args.nodeIds.length+' 个对象':''}</strong><p className="wb-muted">{prepared.pageNames.join(' / ')}</p><p>设计规范 · {prepared.binding.system?.name||prepared.binding.systemId} · 来源 {prepared.binding.source}</p>{!retry&&<div className="wb-row"><Button primary disabled={busy} onClick={()=>submit(prepared.args)}>确认按此范围启动规范更新</Button><Button disabled={busy} onClick={()=>setPrepared(null)}>取消</Button></div>}</div>}
    <ErrorBox error={error}/>
    {retry&&<div className="wb-message wb-stack"><p>现有 AI 任务忙碌。应用范围已登记为待执行。</p><span className="wb-muted">待执行记录 · {retry.args.applicationIds.join(', ')}</span><div className="wb-row"><Button primary disabled={busy} onClick={retryPending}>重试待执行任务（复用原范围）</Button><Button disabled={busy} onClick={()=>{setRetry(null);setPrepared(null);}}>重新选择范围</Button></div></div>}
    {outcome&&<div className="wb-message wb-stack"><strong>{state.status==='applied'?'当前范围内容已保存':state.status==='partial'?'已有部分页面保存':outcome.ai?.accepted?'任务已接受，正在执行':'规范应用请求已登记'}</strong><p className="wb-muted">实际保存页面以任务回执为准；视觉核对单独记录。</p></div>}
  </section>;
}

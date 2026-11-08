import React from 'react';
import {Button} from './common.jsx';
import {DIAGNOSTIC_CATEGORIES,DIAGNOSTIC_STATUS,normalizeDiagnosticReport,normalizeGuideTopics,sanitizeDiagnosticText,groupDiagnosticChecks,createDiagnosticRequestGate,buildDiagnosticPrompt} from './diagnostics-panel-state.js';

const evidenceLabels={registered:'已登记',inspected:'已检查',unavailable:'不可读取',originalCount:'原件数',searchableCount:'可检索数',nonsearchableCount:'仅原件数',partialImports:'未完整导入',explicitExampleCount:'示例数',configurationProven:'已确认配置',executionTested:'已实测执行',nodeVersion:'Node版本',platform:'系统',architecture:'架构',filesystem:'文件服务',store:'设计库服务',workspace:'工作空间服务',aiWorkbench:'AI工作台',mode:'权限模式',version:'版本',knownCapabilityCount:'已识别能力',withGoals:'有目标的项目',withRegisteredRequirements:'已登记需求',withRegisteredRules:'已登记规则',assetCount:'资源数',withHash:'有内容哈希',withSource:'有来源记录',bytesVerified:'已验证文件字节',inspectedBindings:'已检查绑定',pinnedBindings:'固定版本绑定',invalidBindings:'无效绑定',designCount:'设计稿数',webDesigns:'Web设计',mobileDesigns:'移动端设计',pageCount:'页面数',withViewport:'有视口设置',present:'已登记',behaviorTested:'已验证交互',stale:'已过期',notReady:'未就绪',unknown:'待确认'};
const summaryLabels={ok:'检查正常',attention:'有可优化项',blocked:'有事项需要处理',unknown:'部分结果待确认'};
const sameContext=(a,b)=>a.api===b.api&&a.category===b.category&&a.projectId===b.projectId;
const styles=`
.wb-diagnostics{min-width:0;padding:18px 20px;border:1px solid var(--wb-divider,var(--wb-border));border-radius:14px;background:var(--wb-panel,var(--wb-bg));font-size:12px;line-height:1.65;color:var(--wb-text)}
.wb-diagnostics *{box-sizing:border-box}.wb-diagnostics h3,.wb-diagnostics h4,.wb-diagnostics p{margin:0}.wb-diagnostics h3{font-size:15px}.wb-diagnostics h4{font-size:13px;font-weight:550}
.wb-diagnostics .diag-heading,.wb-diagnostics .diag-actions,.wb-diagnostics .diag-filters,.wb-diagnostics .diag-check-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.wb-diagnostics .diag-heading{justify-content:space-between;margin-bottom:12px}.wb-diagnostics .diag-muted{color:var(--wb-muted)}
.wb-diagnostics .diag-filters{gap:5px;margin:12px 0}.wb-diagnostics .diag-filters .wb-button{padding:4px 9px;min-height:30px;font-size:11px}.wb-diagnostics .diag-summary{padding:12px 14px;background:var(--wb-soft);border-radius:10px}.wb-diagnostics .diag-summary strong{font-size:14px}.wb-diagnostics .diag-counts{margin-top:3px;color:var(--wb-muted)}
.wb-diagnostics .diag-list{list-style:none;padding:0;margin:8px 0 0}.wb-diagnostics .diag-check{padding:12px 0;border-top:1px solid var(--wb-divider,var(--wb-border))}.wb-diagnostics .diag-check p{margin:5px 0;color:var(--wb-muted);overflow-wrap:anywhere}.wb-diagnostics .diag-check .diag-recommendation{color:var(--wb-text)}
.wb-diagnostics .diag-badge{display:inline-flex;align-items:center;gap:5px;padding:1px 7px;border-radius:6px;background:var(--wb-soft);font-size:10px;white-space:nowrap}.wb-diagnostics .diag-badge::before{content:'';width:5px;height:5px;background:currentColor;border-radius:50%}.wb-diagnostics .diag-badge[data-status=error]{color:var(--wb-danger)}.wb-diagnostics .diag-badge[data-status=warning]{font-weight:650}.wb-diagnostics .diag-badge[data-status=pass]{color:var(--wb-muted)}
.wb-diagnostics .diag-check-top h4{flex:1;min-width:120px}.wb-diagnostics .diag-evidence{display:flex;flex-wrap:wrap;gap:5px 13px;margin:6px 0;color:var(--wb-muted);font-size:11px}.wb-diagnostics .diag-section-label{margin:16px 0 0;font-size:12px;font-weight:550}.wb-diagnostics details{margin-top:12px}.wb-diagnostics summary{cursor:pointer;color:var(--wb-muted)}
.wb-diagnostics .diag-actions{margin-top:14px}.wb-diagnostics .diag-actions .wb-button{font-size:12px}.wb-diagnostics .diag-notice{margin-top:9px;font-size:11px;color:var(--wb-muted)}.wb-diagnostics .diag-error{padding:10px 12px;border-radius:8px;background:var(--wb-soft);margin:10px 0}.wb-diagnostics .diag-error p{color:var(--wb-danger);margin-bottom:7px}.wb-diagnostics .diag-copy{margin-top:12px}.wb-diagnostics .diag-copy label{display:block;margin-bottom:5px}.wb-diagnostics .diag-copy textarea{width:100%;min-height:150px;max-height:280px;font:11px/1.65 ui-monospace,monospace;resize:vertical;white-space:pre-wrap}
.wb-diagnostics .diag-guide{margin-top:15px;padding-top:14px;border-top:1px solid var(--wb-divider,var(--wb-border))}.wb-diagnostics .diag-guide-text{white-space:pre-wrap;overflow-wrap:anywhere;max-height:290px;overflow:auto;margin:10px 0;font-size:12px;line-height:1.8}.wb-diagnostics .diag-guide-topics{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.wb-diagnostics .diag-guide-title{display:flex;align-items:center;justify-content:space-between;gap:8px}.wb-diagnostics .diag-empty{padding:12px 0;color:var(--wb-muted)}
@media(max-width:520px){.wb-diagnostics{padding:14px 12px}.wb-diagnostics .diag-actions .wb-button{flex:1;white-space:normal}.wb-diagnostics .diag-heading{align-items:flex-start}.wb-diagnostics .diag-evidence{gap:4px 10px}}
`;

// A project change remounts the view, including all pending report/guide/copy state.
export default function DiagnosticsPanel({api,projectId,onAskAI,heading=true}){
  return <DiagnosticsView key={projectId||'library'} api={api} projectId={projectId} onAskAI={onAskAI} heading={heading}/>;
}
function DiagnosticsView({api,projectId,onAskAI,heading}){
  const [category,setCategory]=React.useState('all'),[attempt,setAttempt]=React.useState(0),[state,setState]=React.useState({loading:true,report:null,error:false});
  const [guide,setGuide]=React.useState(null),[topics,setTopics]=React.useState(null),[copy,setCopy]=React.useState({busy:false,message:'',fallback:false}),[asking,setAsking]=React.useState(false);
  const reportGate=React.useRef(createDiagnosticRequestGate()),guideGate=React.useRef(createDiagnosticRequestGate()),interactionGate=React.useRef(createDiagnosticRequestGate());
  const copyField=React.useRef(null),headingId=React.useId();
  const context=React.useRef(null);context.current={api,category,projectId};
  React.useEffect(()=>{
    const ticket=reportGate.current.begin(`${projectId||'library'}:${category}`),requestApi=api;
    guideGate.current.invalidate();interactionGate.current.invalidate();setGuide(null);setTopics(null);setCopy({busy:false,message:'',fallback:false});setAsking(false);setState({loading:true,report:null,error:false});
    const current=()=>reportGate.current.isCurrent(ticket)&&context.current.api===requestApi&&context.current.category===category&&context.current.projectId===projectId;
    Promise.resolve().then(()=>{if(!current())return;if(typeof api!=='function')throw new Error('API unavailable');return api('diagnostics.run',{...(projectId?{projectId}:{}),...(category!=='all'?{categories:[category]}:{})});}).then(value=>{if(!current())return;const report=normalizeDiagnosticReport(value);setState({loading:false,report,error:false});}).catch(()=>{if(current())setState({loading:false,report:null,error:true});});
    return ()=>{reportGate.current.invalidate();guideGate.current.invalidate();interactionGate.current.invalidate();};
  },[api,projectId,category,attempt]);
  React.useEffect(()=>{if(copy.fallback)copyField.current?.focus();},[copy.fallback]);
  const changeCategory=value=>{if(value===category)return;reportGate.current.invalidate();guideGate.current.invalidate();interactionGate.current.invalidate();setCategory(value);};
  const refresh=()=>{reportGate.current.invalidate();guideGate.current.invalidate();interactionGate.current.invalidate();setAttempt(value=>value+1);};
  const loadGuide=async(topic,offset=0)=>{
    const ticket=guideGate.current.begin(topic),owner=context.current;
    setGuide(previous=>({topic,title:state.report?.guideTopics.find(item=>item.id===topic)?.title||'优化指南',text:offset?previous?.text||'':'',nextOffset:offset,loading:true,error:false}));
    try{
      const value=await api('diagnostics.guide',{topic,offset,limit:1800});
      if(!guideGate.current.isCurrent(ticket)||!sameContext(context.current,owner))return;
      const text=sanitizeDiagnosticText(value?.text??value?.content,2400),next=Number.isSafeInteger(value?.nextOffset)&&value.nextOffset>offset?value.nextOffset:null;
      if(!text)throw new Error('Empty guide');
      setGuide(previous=>({topic,title:sanitizeDiagnosticText(value?.title,70)||previous?.title||'优化指南',text:(offset?`${previous?.text||''}\n${text}`:text).slice(0,9000),nextOffset:next,loading:false,error:false}));
    }catch{if(guideGate.current.isCurrent(ticket)&&sameContext(context.current,owner))setGuide(previous=>({...previous,loading:false,error:true,retryOffset:offset}));}
  };
  const openGuides=async(force=false)=>{
    if(topics&&!force){guideGate.current.invalidate();setTopics(null);setGuide(null);return;}
    const ticket=guideGate.current.begin('catalog'),owner=context.current;setTopics({loading:true,items:[]});
    try{const result=await api('diagnostics.catalog',{});if(guideGate.current.isCurrent(ticket)&&sameContext(context.current,owner))setTopics({items:normalizeGuideTopics(result?.topics)});}
    catch{if(guideGate.current.isCurrent(ticket)&&sameContext(context.current,owner))setTopics({items:[],error:true});}
  };
  const prompt=state.report?buildDiagnosticPrompt(state.report):'';
  const copyPrompt=async()=>{
    const ticket=interactionGate.current.begin('copy');setCopy({busy:true,message:'',fallback:false});
    try{if(!globalThis.navigator?.clipboard?.writeText)throw new Error('Clipboard unavailable');await navigator.clipboard.writeText(prompt);if(interactionGate.current.isCurrent(ticket))setCopy({busy:false,message:'已复制，可粘贴到 DSH 对话中。',fallback:false});}
    catch{if(interactionGate.current.isCurrent(ticket))setCopy({busy:false,message:'剪贴板不可用，请在下方选择并手动复制。',fallback:true});}
  };
  const askAI=async()=>{
    const ticket=interactionGate.current.begin('ask');setAsking(true);setCopy({busy:false,message:'',fallback:false});
    try{await onAskAI(prompt);if(interactionGate.current.isCurrent(ticket))setCopy({busy:false,message:'已交给 AI 输入框，请确认后发送。',fallback:false});}
    catch{if(interactionGate.current.isCurrent(ticket))setCopy({busy:false,message:'无法交给 AI 输入框，请复制摘要后粘贴。',fallback:true});}
    finally{if(interactionGate.current.isCurrent(ticket))setAsking(false);}
  };
  const groups=state.report?groupDiagnosticChecks(state.report.checks):{issues:[],healthy:[]};
  const renderCheck=(check,index)=><li key={`${check.id}-${index}`} className="diag-check"><div className="diag-check-top"><span className="diag-badge" data-status={check.status}>{DIAGNOSTIC_STATUS[check.status]}</span><h4>{check.title}</h4><span className="diag-muted">{DIAGNOSTIC_CATEGORIES[check.category]}</span></div>{check.finding&&<p>{check.finding}</p>}{check.recommendation&&<p className="diag-recommendation">{check.recommendation}</p>}{check.evidence.length>0&&<div className="diag-evidence">{check.evidence.map((item,index)=><span key={index}>{evidenceLabels[item.label]||item.label}：{item.value}</span>)}</div>}{check.guideId&&<Button className="wb-ghost" aria-label={`查看${check.title}的优化指南`} onClick={()=>loadGuide(check.guideId)}>查看建议指南</Button>}</li>;
  return <section className="wb-diagnostics" aria-labelledby={heading?headingId:undefined} aria-label={heading?undefined:'诊断报告'}>
    <style>{styles}</style>
    <div className="diag-heading"><div>{heading&&<h3 id={headingId}>诊断与优化</h3>}<p className="diag-muted">{projectId?'当前项目':'工作空间'} · 只读检查，不会自动修改。</p></div><Button disabled={state.loading} onClick={refresh}>重新诊断</Button></div>
    <div className="diag-filters" role="group" aria-label="诊断类别">{[['all','全部'],...Object.entries(DIAGNOSTIC_CATEGORIES)].map(([value,label])=><Button key={value} aria-pressed={category===value} onClick={()=>changeCategory(value)}>{label}</Button>)}</div>
    {state.loading&&<p role="status" className="diag-empty">正在读取诊断…</p>}
    {state.error&&<div className="diag-error" role="alert"><p>诊断暂时不可用，请重试。</p><Button onClick={refresh}>重试诊断</Button></div>}
    {state.report&&<>
      <div className="diag-summary" role="status"><strong>{summaryLabels[state.report.summary.status]}</strong><p className="diag-counts">需处理 {state.report.summary.counts.error} · 建议 {state.report.summary.counts.warning} · 待确认 {state.report.summary.counts.unknown} · 正常 {state.report.summary.counts.pass}</p></div>
      {groups.issues.length>0&&<><p className="diag-section-label">需要关注 · {groups.issues.length}</p><ul className="diag-list">{groups.issues.map(renderCheck)}</ul></>}
      {!groups.issues.length&&<p className="diag-empty">{state.report.checks.length?'当前检查未发现需要处理的事项。':'此类别暂无检查结果。'}</p>}
      {groups.healthy.length>0&&<details><summary>正常与不适用的检查 · {groups.healthy.length}</summary><ul className="diag-list">{groups.healthy.map(renderCheck)}</ul></details>}
      <div className="diag-actions"><Button disabled={copy.busy||asking} onClick={copyPrompt}>{copy.busy?'正在复制…':'复制诊断给AI'}</Button>{typeof onAskAI==='function'&&<Button disabled={asking||copy.busy} onClick={askAI}>{asking?'正在准备…':'交给AI分析'}</Button>}<Button onClick={()=>openGuides()} aria-expanded={!!topics}>{topics?'收起指南':'优化指南'}</Button></div>
      <p className="diag-notice">复制精简摘要与分析提示，后续操作仍遵循当前任务权限。</p>
      {copy.message&&<p role="status" className="diag-notice">{copy.message}</p>}
      {copy.fallback&&<div className="diag-copy"><label htmlFor={`${headingId}-copy`}>手动复制诊断与提示</label><textarea id={`${headingId}-copy`} ref={copyField} value={prompt} readOnly onFocus={event=>event.target.select()}/><Button onClick={()=>{copyField.current?.focus();copyField.current?.select();}}>选择全部内容</Button></div>}
      {topics&&<div className="diag-guide"><h4>选择优化主题</h4>{topics.loading&&<p role="status">正在读取主题…</p>}{topics.error&&<div role="alert"><p>指南主题暂时不可用。</p><Button onClick={()=>openGuides(true)}>重试读取主题</Button></div>}<div className="diag-guide-topics">{topics.items.map(topic=><Button key={topic.id} onClick={()=>loadGuide(topic.id)}>{topic.title}</Button>)}</div></div>}
      {guide&&<div className="diag-guide"><div className="diag-guide-title"><h4>{guide.title}</h4><Button aria-label="关闭优化指南" onClick={()=>{guideGate.current.invalidate();setGuide(null);}}>关闭</Button></div>{guide.text&&<div className="diag-guide-text" tabIndex={0} aria-label="优化指南正文">{guide.text}</div>}{guide.loading&&<p role="status">正在读取指南…</p>}{guide.error&&<div className="diag-error" role="alert"><p>指南暂时不可用，请重试。</p><Button onClick={()=>loadGuide(guide.topic,guide.retryOffset||0)}>重试指南</Button></div>}{!guide.loading&&!guide.error&&guide.nextOffset!==null&&guide.text.length<9000&&<Button onClick={()=>loadGuide(guide.topic,guide.nextOffset)}>继续阅读</Button>}{guide.text.length>=9000&&<p className="diag-muted">面板已显示精简内容，可让 AI 按需继续读取指南。</p>}</div>}
    </>}
  </section>;
}

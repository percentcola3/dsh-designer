import React from 'react';
import PanelResize from '../ui/PanelResize.jsx';
import {selectionIds,selectionMetadata,artifactOf,commonValue,sourceEditable,requiresSourceTemplateConfirmation} from './geometry.js';
import {cssInput} from './property-model.js';

const fields=[['position','定位方式'],['left','左侧位置'],['top','顶部位置'],['right','右侧位置'],['bottom','底部位置'],['translate','位移 translate'],['transform','变换 transform'],['z-index','层级'],['width','宽度'],['height','高度'],['color','文字颜色'],['background-color','背景颜色'],['font-size','字号'],['font-weight','字重'],['line-height','行高'],['border','边框'],['border-color','边框颜色'],['border-width','边框宽度'],['border-style','边框样式'],['border-radius','圆角'],['padding','内边距'],['padding-top','上内边距'],['padding-right','右内边距'],['padding-bottom','下内边距'],['padding-left','左内边距'],['margin','外边距'],['margin-top','上外边距'],['margin-right','右外边距'],['margin-bottom','下外边距'],['margin-left','左外边距'],['gap','间距'],['display','布局'],['flex-direction','排列方向'],['justify-content','主轴对齐'],['align-items','交叉轴对齐']];
const lengths=new Set(['left','top','right','bottom','border-width']);
const invalid=message=>Object.assign(new Error(message),{code:'PROPERTY_INVALID'});
export default function SourceProperties({page,model,selection,objects=[],width=330,onWidthChange,onClose,onReference,onResolve,onController,onError,onApply,projectRevision,readonly=false,saving=false}){
 const [busy,setBusy]=React.useState(false),[notice,setNotice]=React.useState(''),[draft,setDraft]=React.useState({}),[confirmed,setConfirmed]=React.useState(false),[problem,setProblem]=React.useState(null);
 const pending=React.useRef({}),basis=React.useRef(null),inflight=React.useRef(null),confirmation=React.useRef(false),live=React.useRef(null),mounted=React.useRef(true);confirmation.current=confirmed;
 live.current={page,objects,selection,projectRevision,readonly};
 const artifact=artifactOf(model,page),editable=objects.filter(sourceEditable),ids=editable.map(object=>object.nodeId||object.id),canEdit=ids.length>0&&editable.length===objects.length,dirty=Object.keys(draft).length>0,key=page?.id+':'+selectionIds(selection).join('|')+':'+selection?.documentEpoch;
 const isText=canEdit&&objects.every(object=>!object.elementChildCount&&!['img','input','select','textarea','video','audio','svg','canvas','br','hr'].includes(object.tag));
 React.useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;}},[]);
 React.useEffect(()=>{setNotice('');if(!Object.keys(pending.current).length){setConfirmed(false);confirmation.current=false;setProblem(null);}},[key]);
 const valueFor=object=>({pageId:page.id,nodeIds:object.nodeId?[object.nodeId]:[],objects:[object],referenceOnly:!!object.referenceOnly,...selectionMetadata([object])});
 const selectedBasis=()=>{const p=live.current;return {pageId:p.page.id,expectedRevision:p.projectRevision,selection:{...p.selection,pageId:p.page.id,nodeIds:p.objects.map(object=>object.nodeId||object.id),objects:p.objects,...selectionMetadata(p.objects)}};};
 const report=error=>{if(mounted.current&&['SOURCE_DYNAMIC_TEXT','PROPERTY_INVALID'].includes(error.code))setProblem(error.code==='SOURCE_DYNAMIC_TEXT'?'文字由动态绑定生成，未覆盖表达式。请加入对话，让 AI 修改组件数据或源码。':error.message);if(!error.canvasReported){onError?.({code:error.code||'ELEMENT_CONTEXT',message:error.message,pageId:live.current.page.id});error.canvasReported=true;}};
 const flush=React.useCallback(async()=>{
  if(inflight.current)return inflight.current;const values={...pending.current},target=basis.current;if(!target||!Object.keys(values).length)return;
  const task=(async()=>{if(live.current.readonly)throw invalid('当前源码页面为只读。');const operations=[],styles={};for(const [name,value]of Object.entries(values)){if(name==='text')operations.push({type:'text.set',nodeIds:target.selection.nodeIds,text:value});else{const property=name.slice(6),raw=String(value).trim(),normalized=lengths.has(property)&&/^-?(?:\d+\.?\d*|\.\d+)$/.test(raw)?raw+'px':cssInput(property,value);if(normalized!==null&&globalThis.CSS?.supports&&!CSS.supports(property,normalized))throw invalid((fields.find(([key])=>key===property)?.[1]||property)+'不支持此值：'+value);styles[property]=normalized;}}
   if(Object.keys(styles).length)operations.push({type:'style.set',nodeIds:target.selection.nodeIds,styles});
   const result=await onApply({...target,operations,sourceTemplateConfirmed:confirmation.current===true,summary:'保存组件源码属性'});
   for(const [name,value]of Object.entries(values))if(pending.current[name]===value)delete pending.current[name];if(!Object.keys(pending.current).length)basis.current=null;
   if(mounted.current){setDraft({...pending.current});setProblem(null);setNotice('源码已保存并重新编译。');}return result;
  })();inflight.current=task;try{return await task;}catch(error){report(error);throw error;}finally{inflight.current=null;}
 },[onApply,onError]);
 React.useEffect(()=>{onController?.({flush,hasDirty:()=>Object.keys(pending.current).length>0});return()=>onController?.(null);},[flush,onController]);
 const update=(name,value)=>{if(readonly||!canEdit)return;if(!basis.current)basis.current=selectedBasis();pending.current={...pending.current,[name]:value};setDraft({...pending.current});setProblem(null);};
 const discard=()=>{if(inflight.current)return;pending.current={};basis.current=null;setDraft({});setConfirmed(false);setProblem(null);};
 const run=async action=>{if(busy)return;setBusy(true);setNotice('');try{await action();}catch(error){report(error);}finally{if(mounted.current)setBusy(false);}};
 const structural=type=>run(async()=>{if(Object.keys(pending.current).length)throw invalid('请先保存或放弃属性草稿，再复制或删除。');await onApply({...selectedBasis(),operations:[{type,nodeIds:ids}],sourceTemplateConfirmed:confirmation.current===true,summary:type==='node.delete'?'删除源码节点':'复制源码节点'});});
 const copyElement=object=>run(async()=>{const resolved=await onResolve(valueFor(object)),element=resolved.objects[0];if(element.outerHTMLTruncated||typeof element.outerHTML!=='string')throw new Error('元素正文尚未完整读取，请重新选择。');if(!navigator.clipboard?.writeText)throw new Error('当前环境不支持剪贴板复制，请在元素正文中选择并复制。');await navigator.clipboard.writeText(element.outerHTML);if(mounted.current)setNotice('已复制完整 element。');});
 const disabled=readonly||saving||busy||!canEdit;
 return <aside className="ec-properties" aria-label="组件源码属性" style={{width,maxWidth:'calc(100% - 12px)'}}>
  {onWidthChange&&<PanelResize label="对象属性宽度" value={width} min={270} max={520} edge="left" onChange={onWidthChange}/>}
  <header><strong>组件源码 · {artifact?.kind==='vue'?'Vue':'React'}</strong><button aria-label="收起属性" disabled={saving} onClick={onClose}>×</button></header>
  <div className="ec-property-section"><p className="ec-muted">属性会写回组件源文件并重新编译；预览中的业务交互保持临时状态。</p><label>页面入口<input readOnly value={artifact?.entry||'未提供入口'}/></label>
   {!objects.length&&<p className="ec-muted">点击或框选页面元素查看源码位置并调整属性。</p>}
   {objects.length>0&&!canEdit&&<p className="ec-muted">选区含没有源码映射的运行元素，仅可查看和引用。</p>}
   {canEdit&&<>
    <label>文字<textarea rows={3} disabled={disabled||!isText} value={Object.hasOwn(draft,'text')?draft.text:objects.every(object=>object.text===objects[0]?.text)?objects[0]?.text||'':''} placeholder={isText?'混合文字，输入后统一修改':'请选择纯文字叶子；动态绑定需通过 AI 修改'} onChange={event=>update('text',event.target.value)}/></label>
    {problem&&<p className="ec-property-error" role="alert">{problem}</p>}
    <div className="ec-property-grid">{fields.map(([name,label])=>{const common=commonValue(objects,name),value=Object.hasOwn(draft,'style.'+name)?draft['style.'+name]:common.value;return <label key={name}>{label}<input disabled={disabled} value={value} placeholder={common.mixed?'混合值；清空移除源内联属性':'CSS 值；清空移除源内联属性'} onChange={event=>update('style.'+name,event.target.value)}/></label>;})}</div>
    <p className="ec-muted">拖动使用 translate 位移，不改变文档流顺序。left / top 等位置值需配合定位方式；清空字段仅移除对应内联属性。</p>
    {requiresSourceTemplateConfirmation(objects)&&<label className="ec-check"><input type="checkbox" disabled={saving||busy} checked={confirmed} onChange={event=>{confirmation.current=event.target.checked;setConfirmed(event.target.checked);}}/>我确认修改源码模板，会影响同一源码节点的全部运行实例。</label>}
    {dirty&&<p className="ec-muted">有未保存属性，切换选区前会保存到原选区的源码。</p>}
    <div className="ec-property-actions"><button disabled={disabled||!dirty} onClick={()=>run(flush)}>保存源码属性</button><button disabled={saving||busy||!dirty} onClick={discard}>放弃属性草稿</button><button disabled={disabled||dirty} onClick={()=>structural('node.duplicate')}>复制源码节点</button><button disabled={disabled||dirty} onClick={()=>structural('node.delete')}>删除源码节点</button></div>
   </>}
   {objects.map((object,index)=>{const locator=object.sourceLocator,id=object.nodeId||object.id;return <section key={id||`reference-${index}`} className="ec-property-section">
    <strong>{object.name||object.tag||'选中元素'}</strong><label>源文件<input readOnly value={locator?.path||'此运行元素没有源码映射'}/></label>
    <div className="ec-property-grid"><label>源码行列<input readOnly value={locator?.line?`${locator.line}:${locator.column??1}`:'未提供'}/></label><label>源码节点<input readOnly value={object.sourceNodeId||locator?.id||'未映射'}/></label></div>
    <label>nodeId<input readOnly value={id||'仅参考'}/></label><label>instanceId<input readOnly value={object.instanceId||'未提供'}/></label>
    {object.sourceInstanceCount>1&&<p className="ec-muted">此源码节点当前渲染了 {object.sourceInstanceCount} 个实例，源码修改会影响整个模板。</p>}
    {locator&&<details className="ec-schema"><summary>精确源码位置</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify({sourceLocator:locator,documentEpoch:object.documentEpoch,renderEpoch:object.renderEpoch,sceneId:object.sceneId,artifact:object.artifact},null,2)}</pre></details>}
    {object.referenceOnly&&<p className="ec-muted">此元素可作为完整运行参考；尚无精确源码映射。</p>}
    <details open className="ec-schema"><summary>完整 element · {object.outerHTMLTotalBytes??0} 字节</summary><textarea aria-label={`${object.name||object.tag||'元素'}完整 element`} readOnly rows={12} spellCheck={false} value={object.outerHTML||''} style={{width:'100%',fontFamily:'monospace',whiteSpace:'pre',overflow:'auto'}}/></details>
    <div className="ec-property-actions"><button disabled={busy||object.outerHTMLTruncated} onClick={()=>copyElement(object)}>复制 element</button><button disabled={busy||dirty||object.outerHTMLTruncated} onClick={()=>run(()=>onReference({...valueFor(object),label:object.name||object.tag||'选中元素'}))}>加入对话</button></div>
   </section>;})}
   {objects.length>1&&<div className="ec-property-actions"><button disabled={busy||dirty} onClick={()=>run(()=>onReference({...selection,pageId:page.id,objects,label:`${objects.length} 个选中元素`}))}>将全部选中元素加入对话</button></div>}
   {notice&&<p className="ec-muted" role="status">{notice}</p>}
  </div>
 </aside>;
}

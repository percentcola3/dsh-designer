import React from 'react';
import {Icon} from '../ui/brand.jsx';
import PanelResize from '../ui/PanelResize.jsx';
import StyleField from './StyleField.jsx';
import {inspectorFields,fieldValue,positionEditable,inspectorStyles} from './inspector-fields.js';
import {isFrameworkArtifact,sourceEditable} from './geometry.js';

export default function Properties({page,model,selection,objects=[],side='right',width=330,onWidthChange,onClose,onController,onApply,projectRevision,readonly,saving,imageReplacement}){
  const [draft,setDraft]=React.useState({}),[problem,setProblem]=React.useState('');
  const basis=React.useRef(null),pending=React.useRef({}),inflight=React.useRef(null);
  const source=isFrameworkArtifact(model,page),runtime=selection?.referenceOnly?objects[0]:null;
  const key=JSON.stringify([page.id,...objects.map(o=>o.referenceId||o.nodeId||o.id)]);
  const disabled=readonly||saving||!objects.length||objects.some(o=>o.locked)||
    (source?objects.some(o=>!sourceEditable(o)):Boolean(runtime&&!runtime.runtimeSelector));

  function update(property,value){
    if(disabled)return;
    if(!basis.current)basis.current={pageId:page.id,objects,selection:{...selection,objects},source,runtime,expectedRevision:projectRevision,
      expectedFsVersion:model.version,expectedArtboardRevision:model.artboardRevision??page.revision,
      origin:{x:fieldValue(objects,'x').value,y:fieldValue(objects,'y').value}};
    pending.current={...pending.current,[property]:value};
    setDraft(pending.current);setProblem('');
  }
  const flush=React.useCallback(async()=>{
    if(inflight.current)return inflight.current;
    const target=basis.current,values=pending.current;
    if(!target)return;
    const task=(async()=>{
      const {objects,source,runtime,origin,selection,...versions}=target;
      const operations=objects.map(o=>({type:'style',nodeIds:[o.nodeId||o.id],styles:inspectorStyles(o,values,origin),scope:'instance'}))
        .filter(op=>Object.keys(op.styles).length);
      let result;
      if(operations.length){
        const payload=runtime&&!source?{runtimeStyle:{referenceId:runtime.referenceId,selector:runtime.runtimeSelector,styles:operations[0].styles}}:{operations,selection};
        result=await onApply({...versions,...payload,summary:'调整对象属性'});
      }
      const remaining={...pending.current};
      for(const [field,value] of Object.entries(values))if(remaining[field]===value)delete remaining[field];
      pending.current=remaining;setDraft(remaining);setProblem('');
      basis.current=Object.keys(remaining).length?{...target,expectedRevision:result?.project?.revision??target.expectedRevision,
        expectedFsVersion:result?.document?.version??target.expectedFsVersion,expectedArtboardRevision:result?.page?.revision??target.expectedArtboardRevision}:null;
      return result;
    })();
    inflight.current=task;
    try{return await task;}catch(error){setProblem(error.message);throw error;}finally{inflight.current=null;}
  },[onApply]);
  React.useEffect(()=>{onController?.({flush,hasDirty:()=>Boolean(basis.current)});return()=>onController?.(null);},[flush,onController]);
  const save=()=>flush().catch(()=>{});
  return <aside className="ec-properties" data-side={side} aria-label="设计对象属性" style={{width,maxWidth:'calc(100% - 12px)'}}>
    {onWidthChange&&<PanelResize label="对象属性宽度" value={width} min={270} max={520} edge={side==='left'?'right':'left'} onChange={onWidthChange}/>}
    <header><strong>对象属性</strong><button type="button" className="ec-inspector-close" aria-label="收起属性" onClick={()=>flush().then(onClose).catch(()=>{})}><Icon name="x" size={15}/></button></header>
    <div className="ec-property-section">
      <div className="ec-property-grid">{inspectorFields(objects).map(([property,title])=>{
        const state=fieldValue(objects,property),position=property==='x'||property==='y';
        return <StyleField key={key+property} property={property} title={title} mixed={state.mixed} value={draft[property]??state.value}
          disabled={disabled||(position&&!objects.every(positionEditable))} onValue={value=>update(property,value)} onCommit={save}/>;
      })}</div>
      {imageReplacement}
      {problem&&<div className="ec-property-error" role="alert">{problem}<button onClick={()=>{pending.current={};basis.current=null;setDraft({});setProblem('');}}>撤销输入</button></div>}
    </div>
  </aside>;
}

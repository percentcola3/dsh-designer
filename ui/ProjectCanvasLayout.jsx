import React from 'react';
import {Icon} from './brand.jsx';
import {Button} from './common.jsx';
import canvasWorkspaceStyles from './project-canvas-styles.js';
import {CONVERSATION_DEFAULTS,conversationWidthBounds,fitConversationWidth,draggedConversationWidth} from './canvas-conversation-layout.js';

export default function ProjectCanvasLayout({designs,designId,onSelectDesign,onCreateDesign,onImportDesign,onReplicateWebsite,workflowTabs=[],activeWorkflowId,onSelectWorkflow,onCloseWorkflow,onOpenConversation,conversationOpen=true,navOpen,onToggleFiles,tool='select',onTool,onCommand,mode,onPreview,onSave,busy,zoom=100,menuItems=[],navigation,conversation,conversationLayout=CONVERSATION_DEFAULTS,onConversationWidthChange,children}) {
  const stripTabs=[...designs.map(tab=>({...tab,workflow:false})),...workflowTabs.map(tab=>({...tab,workflow:true}))];
  const buttons=React.useRef(new Map()),more=React.useRef(null),saveLock=React.useRef(false),saveOwner=React.useRef(designId);
  const [saving,setSaving]=React.useState(false),[saved,setSaved]=React.useState(false);
  const boardRef=React.useRef(null),resize=React.useRef(null),[boardWidth,setBoardWidth]=React.useState(1440),[resizeEdge,setResizeEdge]=React.useState(null);
  const conversationMode=conversationLayout.mode==='sidebar'?'sidebar':'dock',hasConversation=Boolean(conversation);
  const conversationWidth=fitConversationWidth(conversationMode==='sidebar'?conversationLayout.sideWidth:conversationLayout.dockWidth,conversationMode,boardWidth);
  const bounds=conversationWidthBounds(conversationMode,boardWidth);
  const stopResize=React.useCallback(()=>{const active=resize.current;if(!active)return;resize.current=null;if(active.node.hasPointerCapture?.(active.pointerId))active.node.releasePointerCapture(active.pointerId);setResizeEdge(null);},[]);
  React.useLayoutEffect(()=>{const node=boardRef.current;if(!node)return;const measure=()=>setBoardWidth(node.getBoundingClientRect().width);measure();const observer=new ResizeObserver(measure);observer.observe(node);return()=>observer.disconnect();},[]);
  React.useEffect(()=>{stopResize();},[conversationMode,hasConversation,designId,stopResize]);
  React.useEffect(()=>{window.addEventListener('blur',stopResize);return()=>{window.removeEventListener('blur',stopResize);stopResize();};},[stopResize]);
  const startResize=(event,edge)=>{if(event.button!==0||event.isPrimary===false||!onConversationWidthChange)return;event.preventDefault();event.stopPropagation();const node=event.currentTarget;node.setPointerCapture(event.pointerId);if(!node.hasPointerCapture(event.pointerId))return;resize.current={node,pointerId:event.pointerId,startX:event.clientX,width:conversationWidth,edge,mode:conversationMode};setResizeEdge(edge);};
  const moveResize=event=>{const active=resize.current;if(!active||active.pointerId!==event.pointerId)return;event.preventDefault();event.stopPropagation();onConversationWidthChange?.(active.mode,draggedConversationWidth(active.width,event.clientX-active.startX,active.edge,active.mode,boardRef.current?.getBoundingClientRect().width||boardWidth));};
  const resizeHandle=edge=><div className="wb-conversation-resizer" data-resize-edge={edge} role="separator" aria-orientation="vertical" aria-label={conversationMode==='sidebar'?'调整 AI 侧边面板宽度':`调整 AI 面板${edge==='left'?'左':'右'}侧宽度`} aria-valuemin={Math.round(bounds.min)} aria-valuemax={Math.round(bounds.max)} aria-valuenow={Math.round(conversationWidth)} tabIndex={0} title="拖拽调整宽度，双击恢复默认" onPointerDown={event=>startResize(event,edge)} onPointerMove={moveResize} onPointerUp={event=>{if(resize.current?.pointerId===event.pointerId){moveResize(event);stopResize();}}} onPointerCancel={event=>{if(resize.current?.pointerId===event.pointerId)stopResize();}} onLostPointerCapture={event=>{if(resize.current?.pointerId===event.pointerId)stopResize();}} onDoubleClick={()=>onConversationWidthChange?.(conversationMode,conversationMode==='sidebar'?400:760)} onKeyDown={event=>{const next=event.key==='Home'?bounds.min:event.key==='End'?bounds.max:event.key==='ArrowLeft'?conversationWidth-10:event.key==='ArrowRight'?conversationWidth+10:null;if(next!==null){event.preventDefault();event.stopPropagation();onConversationWidthChange?.(conversationMode,fitConversationWidth(next,conversationMode,boardWidth));}}}/>;
  saveOwner.current=designId;
  React.useEffect(()=>{setSaved(false);},[designId]);
  React.useLayoutEffect(()=>{buttons.current.get(activeWorkflowId||designId)?.scrollIntoView({inline:'nearest',block:'nearest'});},[designId,activeWorkflowId]);
  React.useEffect(()=>{if(!saved)return;const timer=setTimeout(()=>setSaved(false),2000);return()=>clearTimeout(timer);},[saved]);
  React.useEffect(()=>{const close=event=>{if(more.current?.open&&!more.current.contains(event.target))more.current.open=false;};document.addEventListener('pointerdown',close,true);return()=>document.removeEventListener('pointerdown',close,true);},[]);
  const save=async()=>{if(saveLock.current)return;const owner=designId;saveLock.current=true;setSaving(true);try{const result=await onSave();if(saveOwner.current===owner&&result!==false)setSaved(true);}finally{saveLock.current=false;setSaving(false);}};
  function tabKey(event,index){let next;if(event.key==='ArrowRight')next=(index+1)%stripTabs.length;else if(event.key==='ArrowLeft')next=(index-1+stripTabs.length)%stripTabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=stripTabs.length-1;else return;event.preventDefault();const tab=stripTabs[next];if(tab){(tab.workflow?onSelectWorkflow:onSelectDesign)?.(tab.id);buttons.current.get(tab.id)?.focus();buttons.current.get(tab.id)?.scrollIntoView({inline:'nearest',block:'nearest'});}}
  const action=(label,icon,fn,extra={})=><Button aria-label={label} title={label} onClick={fn} {...extra}><Icon name={icon} size={18}/></Button>;
  return <section className="wb-canvas-editor" aria-label="项目画布编辑器"><style>{canvasWorkspaceStyles}</style>
    <div className="wb-design-strip" aria-label="项目设计稿栏">
      <div className="wb-design-strip-left"><Button className="wb-design-files" aria-label="项目文件" title={navOpen?'隐藏文件树':'显示文件树'} aria-expanded={navOpen} aria-pressed={navOpen} onClick={onToggleFiles}><Icon name={navOpen?'panel-left-close':'panel-left-open'} size={17}/><span>文件</span></Button></div>
      <div className="wb-design-center"><div className="wb-design-tabs" role="tablist" aria-label="设计稿">
      {designs.map((d,index)=><button key={d.id} ref={el=>el?buttons.current.set(d.id,el):buttons.current.delete(d.id)} type="button" role="tab" className="wb-design-tab" data-design-id={d.id} aria-label={d.name} aria-selected={!activeWorkflowId&&d.id===designId} tabIndex={!activeWorkflowId&&d.id===designId?0:-1} disabled={busy} onClick={()=>onSelectDesign(d.id)} onKeyDown={e=>tabKey(e,index)}><Icon name="layers" size={14}/><span>{d.name}</span>{d.name.toLowerCase()!==(d.platform==='mobile'?'mobile':'web')&&<small>{d.platform==='mobile'?'Mobile':'Web'}</small>}</button>)}
      {workflowTabs.map((tab,index)=><div key={tab.id} className="wb-design-workflow-tab" data-selected={activeWorkflowId===tab.id}><button ref={el=>el?buttons.current.set(tab.id,el):buttons.current.delete(tab.id)} type="button" role="tab" className="wb-design-tab" aria-label={tab.name} title={`${tab.name} · ${designs.find(d=>d.id===tab.designId)?.name||''}`} aria-selected={activeWorkflowId===tab.id} tabIndex={activeWorkflowId===tab.id?0:-1} onClick={()=>onSelectWorkflow?.(tab.id)} onKeyDown={event=>tabKey(event,designs.length+index)}><Icon name={tab.provider==='website'?'external':'layers'} size={14}/><span>{tab.name}</span></button><button className="wb-design-workflow-close" type="button" aria-label={`关闭 ${tab.name}`} onClick={()=>onCloseWorkflow?.(tab.id)}><Icon name="x" size={12}/></button></div>)}
      </div><Button className="wb-design-add" aria-label="新建设计稿" title="新建设计稿" disabled={busy} onClick={onCreateDesign}><Icon name="plus" size={17}/></Button></div>
      <div className="wb-design-imports"><Button aria-label="MasterGo 导入" title="MasterGo 导入" disabled={busy||!designId} onClick={onImportDesign}><Icon name="layers" size={16}/><span>MasterGo 导入</span></Button><Button aria-label="网页复刻" title="网页复刻" disabled={busy||!designId} onClick={onReplicateWebsite}><Icon name="external" size={16}/><span>网页复刻</span></Button>{!conversationOpen&&<Button aria-label="打开 AI 对话" title="打开 AI 对话" onClick={onOpenConversation}><Icon name="message-square" size={16}/><span>AI 对话</span></Button>}</div>
    </div>
    <div ref={boardRef} className={`wb-canvas-board${resizeEdge?' wb-conversation-resizing':''}`} data-ai-layout={hasConversation?conversationMode:'hidden'} style={{'--wb-conversation-width':`${conversationWidth}px`}}>
      <div className="wb-canvas-viewport">
      {children}
      {!activeWorkflowId&&<div className="wb-canvas-tools" role="toolbar" aria-label="画布操作">
        {action('选择工具','cursor',()=>onTool('select'),{'aria-pressed':tool==='select',title:'选择工具（V）'})}
        {action('手型工具','hand',()=>onTool('hand'),{'aria-pressed':tool==='hand',title:'手型工具（H）· 按住空格临时拖动画布'})}
        {action('适合窗口','fit',()=>onCommand('fit'))}<i/>
        {action('缩小画布','minus',()=>onCommand('zoomOut'))}<button type="button" className="wb-canvas-zoom" aria-label={`画布缩放 ${zoom}%，点击恢复 100%`} title="点击恢复 100%" onClick={()=>onCommand('resetZoom')}>{zoom}%</button>{action('放大画布','plus',()=>onCommand('zoomIn'))}<i/>
        {action(mode==='preview'?'返回编辑':'预览设计','external',onPreview,{'aria-pressed':mode==='preview'})}
        <Button className="wb-canvas-save" disabled={busy||saving} onClick={save}>{saving?'保存中…':saved?'已保存':'保存'}</Button>
        <details ref={more} className="wb-canvas-more" onKeyDown={event=>{if(event.key==='Escape'){event.currentTarget.open=false;event.currentTarget.querySelector('summary')?.focus();}}}><summary aria-label="更多画布操作" title="更多画布操作"><Icon name="more" size={19}/></summary><div className="wb-canvas-more-menu">{menuItems.map(item=><Button key={item.id} disabled={item.disabled} onClick={e=>{e.currentTarget.closest('details').open=false;item.onSelect();}}>{item.label}</Button>)}</div></details>
      </div>}
      {!activeWorkflowId&&<div className="wb-canvas-gesture-hint">滚轮缩放 · 触控板双指平移 / 捏合缩放 · 空格 / 中键拖动</div>}
      {!activeWorkflowId&&navigation}
      </div>
      {conversation&&<div className="wb-canvas-conversation" data-layout={conversationMode}>
        {resizeHandle('left')}{conversationMode==='dock'&&resizeHandle('right')}{conversation}
      </div>}
      {resizeEdge&&<div className="wb-conversation-resize-shield" aria-hidden="true"/>}
    </div>
  </section>;
}

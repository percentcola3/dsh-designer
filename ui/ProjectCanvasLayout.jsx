import React from 'react';
import {Icon} from './brand.jsx';
import {Button} from './common.jsx';
import canvasWorkspaceStyles from './project-canvas-styles.js';
import {CONVERSATION_DEFAULTS,conversationWidthBounds,fitConversationWidth,draggedConversationWidth} from './canvas-conversation-layout.js';

export default function ProjectCanvasLayout({designs,designId,onSelectDesign,onCreateDesign,onImportDesign,onReplicateWebsite,workflowTabs=[],activeWorkflowId,onSelectWorkflow,onCloseWorkflow,onOpenConversation,conversationOpen=true,navOpen,onToggleFiles,tool='interact',onTool,frozen=false,onFreeze,onZoom,onScreenshot,capturing=false,busy,navigation,conversation,conversationLayout=CONVERSATION_DEFAULTS,onConversationWidthChange,children}) {
  const stripTabs=[...designs.map(tab=>({...tab,workflow:false})),...workflowTabs.map(tab=>({...tab,workflow:true}))];
  const buttons=React.useRef(new Map());
  const boardRef=React.useRef(null),resize=React.useRef(null),[boardWidth,setBoardWidth]=React.useState(1440),[resizeEdge,setResizeEdge]=React.useState(null);
  const conversationMode=conversationLayout.mode==='sidebar'?'sidebar':'dock',hasConversation=Boolean(conversation);
  React.useEffect(()=>{
    const toggle=event=>{
      if(onScreenshot&&!busy&&!capturing&&!activeWorkflowId&&!event.isComposing&&!event.repeat&&event.altKey&&event.shiftKey&&event.code==='KeyS'){
        event.preventDefault();onScreenshot();return;
      }
      if(onFreeze&&!busy&&!activeWorkflowId&&!event.isComposing&&!event.repeat&&event.altKey&&event.shiftKey&&event.code==='KeyF'){
        event.preventDefault();onFreeze();
      }
    };
    window.addEventListener('keydown',toggle);
    return()=>window.removeEventListener('keydown',toggle);
  },[onFreeze,onScreenshot,capturing,busy,activeWorkflowId]);
  const conversationWidth=fitConversationWidth(conversationMode==='sidebar'?conversationLayout.sideWidth:conversationLayout.dockWidth,conversationMode,boardWidth);
  const bounds=conversationWidthBounds(conversationMode,boardWidth);
  const stopResize=React.useCallback(()=>{const active=resize.current;if(!active)return;resize.current=null;if(active.node.hasPointerCapture?.(active.pointerId))active.node.releasePointerCapture(active.pointerId);setResizeEdge(null);},[]);
  React.useLayoutEffect(()=>{const node=boardRef.current;if(!node)return;const measure=()=>setBoardWidth(node.getBoundingClientRect().width);measure();const observer=new ResizeObserver(measure);observer.observe(node);return()=>observer.disconnect();},[]);
  React.useEffect(()=>{stopResize();},[conversationMode,hasConversation,designId,stopResize]);
  React.useEffect(()=>{window.addEventListener('blur',stopResize);return()=>{window.removeEventListener('blur',stopResize);stopResize();};},[stopResize]);
  const startResize=(event,edge)=>{if(event.button!==0||event.isPrimary===false||!onConversationWidthChange)return;event.preventDefault();event.stopPropagation();const node=event.currentTarget;node.setPointerCapture(event.pointerId);if(!node.hasPointerCapture(event.pointerId))return;resize.current={node,pointerId:event.pointerId,startX:event.clientX,width:conversationWidth,edge,mode:conversationMode};setResizeEdge(edge);};
  const moveResize=event=>{const active=resize.current;if(!active||active.pointerId!==event.pointerId)return;event.preventDefault();event.stopPropagation();onConversationWidthChange?.(active.mode,draggedConversationWidth(active.width,event.clientX-active.startX,active.edge,active.mode,boardRef.current?.getBoundingClientRect().width||boardWidth));};
  const resizeHandle=edge=><div className="wb-conversation-resizer" data-resize-edge={edge} role="separator" aria-orientation="vertical" aria-label={conversationMode==='sidebar'?'调整 AI 侧边面板宽度':`调整 AI 面板${edge==='left'?'左':'右'}侧宽度`} aria-valuemin={Math.round(bounds.min)} aria-valuemax={Math.round(bounds.max)} aria-valuenow={Math.round(conversationWidth)} tabIndex={0} title="拖拽调整宽度，双击恢复默认" onPointerDown={event=>startResize(event,edge)} onPointerMove={moveResize} onPointerUp={event=>{if(resize.current?.pointerId===event.pointerId){moveResize(event);stopResize();}}} onPointerCancel={event=>{if(resize.current?.pointerId===event.pointerId)stopResize();}} onLostPointerCapture={event=>{if(resize.current?.pointerId===event.pointerId)stopResize();}} onDoubleClick={()=>onConversationWidthChange?.(conversationMode,conversationMode==='sidebar'?CONVERSATION_DEFAULTS.sideWidth:CONVERSATION_DEFAULTS.dockWidth)} onKeyDown={event=>{const next=event.key==='Home'?bounds.min:event.key==='End'?bounds.max:event.key==='ArrowLeft'?conversationWidth-10:event.key==='ArrowRight'?conversationWidth+10:null;if(next!==null){event.preventDefault();event.stopPropagation();onConversationWidthChange?.(conversationMode,fitConversationWidth(next,conversationMode,boardWidth));}}}/>;
  React.useLayoutEffect(()=>{buttons.current.get(activeWorkflowId||designId)?.scrollIntoView({inline:'nearest',block:'nearest'});},[designId,activeWorkflowId]);
  function tabKey(event,index){let next;if(event.key==='ArrowRight')next=(index+1)%stripTabs.length;else if(event.key==='ArrowLeft')next=(index-1+stripTabs.length)%stripTabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=stripTabs.length-1;else return;event.preventDefault();const tab=stripTabs[next];if(tab){(tab.workflow?onSelectWorkflow:onSelectDesign)?.(tab.id);buttons.current.get(tab.id)?.focus();buttons.current.get(tab.id)?.scrollIntoView({inline:'nearest',block:'nearest'});}}
  const freezeLabel=frozen?'恢复交互':'冻结页面';
  const action=(label,icon,fn,extra={})=><Button aria-label={label} title={label} data-tooltip={extra.title||label} onClick={fn} {...extra}><Icon name={icon} size={16}/></Button>;
  return <section className="wb-canvas-editor" data-ai-layout={hasConversation?conversationMode:'hidden'} style={{'--wb-conversation-width':`${conversationWidth}px`}} aria-label="项目页面预览"><style>{canvasWorkspaceStyles}</style>
    <div className="wb-design-strip" aria-label="项目设计稿栏">
      <div className="wb-design-strip-left"><Button className="wb-design-files" aria-label="项目文件" title={navOpen?'隐藏文件树':'显示文件树'} aria-expanded={navOpen} aria-pressed={navOpen} onClick={onToggleFiles}><Icon name={navOpen?'panel-left-close':'panel-left-open'} size={17}/></Button></div>
      <div className="wb-design-center"><div className="wb-design-tabs" role="tablist" aria-label="设计稿">
      {designs.map((d,index)=><button key={d.id} ref={el=>el?buttons.current.set(d.id,el):buttons.current.delete(d.id)} type="button" role="tab" className="wb-design-tab" data-design-id={d.id} aria-label={d.name} aria-selected={!activeWorkflowId&&d.id===designId} tabIndex={!activeWorkflowId&&d.id===designId?0:-1} disabled={busy} onClick={()=>onSelectDesign(d.id)} onKeyDown={e=>tabKey(e,index)}><Icon name="file-pen" size={14}/><span>{d.name}</span>{d.name.toLowerCase()!==(d.platform==='mobile'?'mobile':'web')&&<small>{d.platform==='mobile'?'Mobile':'Web'}</small>}</button>)}
      {workflowTabs.map((tab,index)=><div key={tab.id} className="wb-design-workflow-tab" data-selected={activeWorkflowId===tab.id}><button ref={el=>el?buttons.current.set(tab.id,el):buttons.current.delete(tab.id)} type="button" role="tab" className="wb-design-tab" aria-label={tab.name} title={`${tab.name} · ${designs.find(d=>d.id===tab.designId)?.name||''}`} aria-selected={activeWorkflowId===tab.id} tabIndex={activeWorkflowId===tab.id?0:-1} onClick={()=>onSelectWorkflow?.(tab.id)} onKeyDown={event=>tabKey(event,designs.length+index)}><Icon name={tab.provider==='website'?'browser-copy':'layers'} size={14}/><span>{tab.name}</span></button><button className="wb-design-workflow-close" type="button" aria-label={`关闭 ${tab.name}`} onClick={()=>onCloseWorkflow?.(tab.id)}><Icon name="x" size={12}/></button></div>)}
      </div><Button className="wb-design-add" aria-label="新建设计稿" title="新建设计稿" disabled={busy} onClick={onCreateDesign}><Icon name="plus" size={17}/></Button></div>
      <div className="wb-design-imports"><Button aria-label="MasterGo 导入" title="MasterGo 导入" disabled={busy||!designId} onClick={onImportDesign}><Icon name="layers" size={16}/><span>MasterGo 导入</span></Button><Button aria-label="网页复刻" title="网页复刻" disabled={busy||!designId} onClick={onReplicateWebsite}><Icon name="browser-copy" size={16}/><span>网页复刻</span></Button>{!conversationOpen&&<Button aria-label="打开 AI 对话" title="打开 AI 对话" onClick={onOpenConversation}><Icon name="message-square" size={16}/><span>AI 对话</span></Button>}</div>
    </div>
    <div ref={boardRef} className={`wb-canvas-board${resizeEdge?' wb-conversation-resizing':''}`}>
      <div className="wb-canvas-viewport">
      {children}
      {!activeWorkflowId&&<div className="wb-canvas-tools" role="toolbar" aria-label="页面预览操作">
        {action('拾取元素','hand',()=>onTool(tool==='pick'?'interact':'pick'),{'aria-pressed':tool==='pick',disabled:busy||!onTool,onMouseDown:event=>event.preventDefault(),title:'拾取元素加入对话'})}
        {action(freezeLabel,frozen?'unlock':'lock',onFreeze,{'aria-pressed':frozen,disabled:busy||!onFreeze,title:freezeLabel+' · Alt + Shift + F','aria-keyshortcuts':'Alt+Shift+F'})}
        <div role="group" aria-label="页面缩放" className="wb-preview-zoom">
          {action('缩小','minus',()=>onZoom('out'),{disabled:busy||!onZoom})}
          {action('适合整页','fit',()=>onZoom('fit'),{disabled:busy||!onZoom})}
          {action('放大','plus',()=>onZoom('in'),{disabled:busy||!onZoom})}
        </div>
        {action('截图','camera',onScreenshot,{disabled:busy||capturing||!onScreenshot,'aria-keyshortcuts':'Alt+Shift+S',title:capturing?'正在生成 PNG…':'框选截图并复制 · Alt + Shift + S'})}
      </div>}
      {!activeWorkflowId&&navigation}
      </div>
      {conversation&&<div className="wb-canvas-conversation" data-layout={conversationMode}>
        {resizeHandle('left')}{conversationMode==='dock'&&resizeHandle('right')}{conversation}
      </div>}
      {resizeEdge&&<div className="wb-conversation-resize-shield" aria-hidden="true"/>}
    </div>
  </section>;
}

import React from 'react';
import Workbench from './ui/Workbench.jsx';
import CanvasEditor from './editor/CanvasEditor.jsx';
import {createLegacyClient} from './legacy-client.js';
import {uploadFile} from './ui/upload.js';
import {FileActionsContext} from './ui/common.jsx';
import {PlantLogo} from './ui/brand.jsx';
import {designerLegacyPromptRule} from './ui/ai-conversation-state.js';
import {RemoteStreamCarrierError} from '@deepseek-ai/dsh-api-gateway/client';
import NativeConversation, {DesignerComposerSeat, selectComposerSeat} from './ui/NativeConversation.jsx';

const NS='designer-studio';
const KNOWLEDGE_TREE_OPTIONS={fallback:<p className="kb-empty-inline">文件树组件暂不可用，请启用 DSH 文件插件。</p>};
export default {
  inject:['slots','locale','layout','sessions','uiWorkspace','uiSession','uiConversation','remote','remote.permissionPresets','modelDirectories','connection','fileActions'],
  apply(ctx){
    const legacy=createLegacyClient(require);
    ctx.effect(()=>ctx.uiConversation.userText.register(designerLegacyPromptRule));
    ctx.slots.inject('conversation.user.text.node',()=>ctx.slots.register({name:'conversation.user.text.node',key:designerLegacyPromptRule.id,priority:100},({node})=><span style={{whiteSpace:'pre-wrap'}}>{node.data.text}</span>));
    ctx.effect(()=>ctx.locale.register(NS,'zh',legacy.zh));
    ctx.effect(()=>ctx.locale.register(NS,'en',legacy.en));
    const t=ctx.locale.bind(NS);
    const api=(action,args={})=>legacy.api(action,args);
    api.upload=(file,args={})=>uploadFile({},file,{contextSessionId:legacy.readLocal('contextSessionId',null),...args});
    const Canvas=props=><CanvasEditor {...props} api={props.api||api} t={props.t||t}/>;
    function ImportDialog(props){
      const bound=React.useMemo(()=>createLegacyClient(require,{api:(action,args)=>api(action,{...args,...(props.design?.id?{designId:props.design.id}:{})})}),[props.project?.id,props.design?.id]);
      return <div className="ds" style={{display:'contents'}}><style>{bound.css+'\n'+bound.importCss}</style><bound.ImportDialog key={props.project?.id} {...props} t={props.t||t}/></div>;
    }
    let speechRemote;
    ctx.inject(['remote.speech'],scope=>{speechRemote=scope.remote.speech;scope.effect(()=>()=>{speechRemote=undefined;});});
    const composerContext={streamEndedError:message=>new RemoteStreamCarrierError(message),sessions:ctx.sessions,uiSession:ctx.uiSession,uiConversation:ctx.uiConversation,modelDirectories:ctx.modelDirectories,get:name=>ctx.get(name),remote:{permissionPresets:ctx.remote.permissionPresets,$on:(...args)=>ctx.remote.$on(...args),$stream:(...args)=>ctx.remote.$stream(...args),get speech(){return speechRemote;}}};
    const adapters={nativeContext:composerContext,ImportDialog,createImportDialog:override=>{
      const bound=createLegacyClient(require,{api:override});
      return props=><div className="ds" style={{display:'contents'}}><style>{bound.css+'\n'+bound.importCss}</style><bound.ImportDialog key={props.project?.id} {...props} t={props.t||t}/></div>;
    },openFullChat:async sessionId=>{await ctx.sessions.refresh();ctx.uiWorkspace.openSession(sessionId);},getAIState:projectId=>api('ai.status',{projectId})};
    function Main(){return null;}
    const registerDesignerComposer = seat => ctx.slots.inject('conversation.composer',()=>ctx.slots.register({
      name:'conversation.composer',
      priority:1000,
      select:owner=>selectComposerSeat(seat,owner),
    },DesignerComposerSeat));
    ctx.slots.inject('designer.conversation',()=>ctx.slots.register({
      name:'designer.conversation',
      inject:()=>({registerComposer:registerDesignerComposer}),
    },NativeConversation));
    function Surface({usePanelInfo,useSessionAccess,useRemoteAccess,SessionProvider,renderSlot,renderFactorySlot}){
      const NativeKnowledgeTree=React.useMemo(()=>function NativeKnowledgeTree(input){return renderFactorySlot('sidebar.files.tree',input,KNOWLEDGE_TREE_OPTIONS);},[renderFactorySlot]);
      const active=usePanelInfo(info=>info.activePanelId==='designer-studio');
      const ProjectConversation=React.useMemo(()=>function ProjectConversation({reference,children}){
        return <SessionProvider session={reference} empty={()=><div className="wb-ai-compose">{children}</div>}>
          {renderSlot('designer.conversation',{composer:children})}
        </SessionProvider>;
      },[SessionProvider,renderSlot]);
      React.useSyncExternalStore(fn=>ctx.locale.subscribe(fn),()=>ctx.locale.getSnapshot());
      React.useEffect(()=>{if(active)return ctx.slots.inject('shell.leading',()=>ctx.slots.register({name:'shell.leading',priority:-1000},()=>null));},[active]);
      return active?<legacy.WorkspaceSurface label={t('studio')}><FileActionsContext.Provider value={ctx.fileActions}><Workbench ctx={ctx} Canvas={Canvas} api={api} legacy={{...adapters,NativeConversation:ProjectConversation,NativeKnowledgeTree,nativeAccess:{useSessionAccess,useRemoteAccess}}} t={t} onExit={()=>ctx.layout.selectPanel(null)}/></FileActionsContext.Provider></legacy.WorkspaceSurface>:null;
    }
    // The header supplies the ordinary chat's context to requests made from the sidebar.
    function RememberSession({sessionId}){
      React.useEffect(()=>{
        if(sessionId&&!String(sessionId).startsWith('designer-'))legacy.writeLocal('contextSessionId',sessionId);
      },[sessionId]);
      return null;
    }
    ctx.slots.inject('conversation.session.header.actions',()=>ctx.slots.register({name:'conversation.session.header.actions',id:'designer-studio',order:30,label:()=>t('studio')},RememberSession));
    ctx.slots.inject('sidebar.panellist',()=>ctx.slots.register({name:'sidebar.panellist',id:'designer-studio',order:20,label:()=>t('studio')},props=><PlantLogo size={props.size||20} style={{borderRadius:5}}/>));
    ctx.slots.inject('main',()=>ctx.slots.register({name:'main',key:'designer-studio'},Main));
    ctx.slots.inject('shell.overlay',()=>ctx.slots.register({name:'shell.overlay',id:'designer-workspace',order:-100,label:()=>t('studio'),children:{'designer.conversation':{kind:'single',scope:'session'}}},Surface));
  }
};

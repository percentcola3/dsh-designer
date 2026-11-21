import React from 'react';
import {ErrorBox} from './common.jsx';
import DesignerComposer from './DesignerComposer.jsx';
import {useNativeDesignerComposer} from './NativeComposerControls.jsx';
import {uploadFile} from './upload.js';
import ProjectCard from './ProjectCard.jsx';
import homeStyles from './home-styles.js';

const MAX_PROMPT_LENGTH = 20000;

export default function HomePanel({
  recentProjects = [], allProjects = recentProjects, api, previewApi, ctx, nativeAccess = {}, systems = [], composeOptions = {}, onComposeOptionsChange, groups = [], draft = '', onDraftChange, onStart, onOpenProject, onProjectAction, busy = false, error = null,
}) {
  const composerRef = React.useRef(null);
  const [uploading,setUploading]=React.useState(false);
  const mounted=React.useRef(true);
  React.useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const sending = React.useRef(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [startError, setStartError] = React.useState(null);
  const pending = busy || submitting || uploading || Boolean(composeOptions.uploading);
  const onSessionReady=React.useCallback(sessionId=>{setStartError(null);onComposeOptionsChange?.(value=>value.sessionId===sessionId?value:{...value,sessionId});},[onComposeOptionsChange]);
  const native=useNativeDesignerComposer({ctx,api,onSessionReady,useSessionAccess:nativeAccess.useSessionAccess,useRemoteAccess:nativeAccess.useRemoteAccess,composerRef,locked:pending,onError:setStartError});
  const patch=values=>onComposeOptionsChange?.(current=>({...current,...values}));
  const addFiles=async files=>{
    if(!native.canUpload||!native.sessionId||pending)return;
    setUploading(true);onComposeOptionsChange?.(current=>({...current,uploading:true}));setStartError(null);
    try{for(const file of files){const result=await uploadFile(api,file,{composerSessionId:native.sessionId,contextSessionId:native.sessionId,purpose:'attachment',name:file.name,mediaType:file.type||'application/octet-stream'});const receipt=result.receiptId?result:result.receipt||result.attachment;if(!receipt?.receiptId)throw new Error('附件上传未返回原生凭据。');onComposeOptionsChange?.(current=>({...current,attachments:[...(current.attachments||[]),{...receipt,label:file.name}]}));}}
    catch(failure){if(mounted.current)setStartError(failure);}finally{onComposeOptionsChange?.(current=>({...current,uploading:false}));if(mounted.current)setUploading(false);}
  };
  const seen = new Set();
  const projects = recentProjects.filter(project => {
    if (!project?.id || project.deletedAt || project.archived || project.unavailable || seen.has(project.id)) return false;
    seen.add(project.id);
    return true;
  }).slice(0, 5);
  const prompt = draft.trim();
  const canStart = !pending && native.canPrompt && Boolean(prompt) && draft.length <= MAX_PROMPT_LENGTH && typeof onStart === 'function';

  async function start(event) {
    event?.preventDefault();
    if (!canStart || sending.current) return;
    sending.current = true;
    setSubmitting(true);
    setStartError(null);
    try {
      await onStart(prompt, {...composeOptions,sessionId:native.sessionId});
    } catch (failure) {
      setStartError(failure || new Error('创建失败，请重试。'));
    } finally {
      sending.current = false;
      setSubmitting(false);
    }
  }

  return <section className="wb-home" data-has-recent={projects.length > 0} aria-label="设计师工作台首页" aria-busy={pending}>
    <style>{homeStyles}</style>
    <div className="wb-home-inner">
      <div className="wb-home-composer-host"><DesignerComposer ref={composerRef} variant="home" value={draft}
        onChange={value=>{setStartError(null);onDraftChange?.(value);}} onSubmit={start} disabled={pending} submitDisabled={!native.canPrompt}
        submitting={busy||submitting} ariaLabel="设计需求" placeholder="描述你的想法，开始新的设计…" api={api} conversation={ctx?.uiConversation} contextSessionId={native.sessionId}
        projects={allProjects} references={composeOptions.references||[]} onReferencesChange={references=>patch({references})}
        attachments={composeOptions.attachments||[]} onFiles={addFiles} canAttach={native.canUpload}
        onRemoveAttachment={(_attachment,index)=>patch({attachments:(composeOptions.attachments||[]).filter((_,i)=>i!==index)})}
        systems={systems} systemChoice={composeOptions.systemChoice} onSystemChange={systemChoice=>patch({systemChoice})}
        leftControls={native.leftControls} rightControls={native.rightControls} onError={setStartError}/>
      </div>
      <div className="wb-home-error"><ErrorBox error={error || startError || native.error}/></div>
      {projects.length > 0 && <section className="wb-home-recent" aria-label="最近操作的项目">
        <header className="wb-home-recent-header"><h2>最近项目</h2></header>
        <div className="wb-home-project-grid">
          {projects.map(project => <ProjectCard key={project.id} project={project} api={previewApi||api} groups={groups}
            onOpenProject={onOpenProject} onProjectAction={onProjectAction} disabled={pending}/>)}
        </div>
      </section>}
    </div>
  </section>;
}

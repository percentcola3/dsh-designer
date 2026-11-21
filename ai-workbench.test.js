import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {AIWorkbench,assertAction,assertCommitScope} from './ai-workbench.js';
import {normalizeDocument,applyDocumentOperations} from './document-model.js';
import {FrameworkService} from './framework-service.js';
import {normalizeFrameworkSource,replaceSourceElement} from './framework-compiler.js';
import {sourceTemplateConfirmation} from './ui/target-state.js';
import {systemTextMatches,systemUsage} from './system-usage.js';
import {desktopComponentManifest,desktopSystemFiles} from './desktop-theme.js';

const digest=s=>createHash('sha256').update(s).digest('hex');

test('pinned desktop usage supplies bounded public integration recipes and preserves custom contracts',()=>{
  const files=Object.fromEntries(desktopSystemFiles().map(file=>[file.logicalPath,file.content]));
  const requested=['ds-button','ds-input','ds-textarea','ds-select','ds-tag','ds-tabs'];
  const usage=systemUsage({manifest:desktopComponentManifest,tokens:JSON.parse(files['tokens.json']),examples:files['examples/components.html'],components:requested});
  assert.ok(JSON.stringify(usage).length<12000);
  assert.match(usage.startup,/DOMContentLoaded/);
  const tabs=usage.components.find(component=>component.tag==='ds-tabs');
  assert.match(tabs.integration.example,/data-tab-list/);
  assert.match(tabs.integration.events,/detail.value/);
  const controls=systemUsage({manifest:desktopComponentManifest,components:['ds-dialog','ds-toast'],includeTokens:false});
  assert.equal(controls.tokens,undefined);
  assert.match(controls.components[0].integration.close,/data-ds-close/);
  assert.match(controls.components[1].integration.scene,/duration/);
  const own=systemUsage({manifest:{...desktopComponentManifest,components:[{tag:'ds-tabs',integration:{write:'custom API'}}]},components:['ds-tabs']});
  assert.deepEqual(own.components[0].integration,{write:'custom API'});
  const other=systemUsage({manifest:{...desktopComponentManifest,name:'Other kit'},components:['ds-tabs']});
  assert.equal(other.components[0].integration,undefined);
});
const html='<!doctype html><html data-dsh-node="html"><head><title>Shop</title><style>.card{color:red}</style></head><body data-dsh-node="body"><main data-dsh-node="main"><section data-dsh-node="a"><button data-dsh-node="button">Buy</button><p data-dsh-node="text">A</p></section><aside data-dsh-node="b">B</aside></main></body></html>';
const normalized=()=>normalizeDocument(html).html;
const selection={projectId:'p-one',designId:'d-one',pageId:'a-one',pageIds:['a-one'],nodeIds:['a'],scope:'selection',designIds:['d-one']};
const code=(fn,expected)=>assert.throws(fn,e=>e.code===expected);
function fixture(){
  const pages=new Map([['a-one',{artboard:{id:'a-one',revision:2,designId:'d-one',name:'Main',contentHash:digest(normalized())},html:normalized()}],['a-two',{artboard:{id:'a-two',revision:3,designId:'d-two',name:'Other'},html:normalizeDocument(html.replace('Shop','Other')).html}]]);
  const project={id:'p-one',revision:7,name:'Shop',description:'Goal',artboards:[...pages.values()].map(p=>p.artboard),imports:[{id:'i-one',revision:4}],workbench:{requirementsPath:'requirements.md',rulesPath:'rules.md',designs:[{id:'d-one',pageIds:['a-one']},{id:'d-two',pageIds:['a-two']}],sourceProjects:[{id:'src-one'}]}};
  let binding={mode:'inherit',source:'project',systemId:'s-one',version:1,system:{name:'Light',tokens:{color:'red'},guidelines:'Use red'}};
  let missing=false,requirements='latest requirements '.repeat(1000),resolvedVersion=2,fileVersion='fs-9';const calls=[],savedFiles=new Map();
  const owner={bindings:new Map([['designer-p-one','p-one']]),ctx:{fileUploads:{async upload(agent,input){calls.push({upload:input,agent:agent.id});return {receiptId:'receipt-one'}}}},store:{async read(relative,_signal,optional=false){if(!savedFiles.has(relative)){if(optional)return null;throw Object.assign(new Error('missing'),{code:'NOT_FOUND'});}return {content:savedFiles.get(relative),version:'stored-1'}},async write(relative,content,previous,_signal,policy){if(policy?.mode==='read-only')throw Object.assign(new Error('policy'),{code:'FS_SANDBOX_DENIED'});if(savedFiles.has(relative)&&previous===null)throw Object.assign(new Error('existing'),{code:'VERSION_CONFLICT'});savedFiles.set(relative,content);return 'stored-1'},async projectGet(id){assert.equal(id,'p-one');return {project}},async artboardGet(pid,id){assert.equal(pid,'p-one');return pages.get(id)}},workbench:{async execute(input){calls.push(input);switch(input.action){case 'binding.resolve':return binding;case 'file.read':{const data=input.path==='rules.md'?'latest rules':requirements,offset=input.offset||0,part=Buffer.from(data).subarray(offset).toString('utf8').slice(0,input.limit||5000),next=offset+Buffer.byteLength(part),total=Buffer.byteLength(data);return {fileId:input.path==='rules.md'?'file-rules':'file-requirements',path:input.path,mimeType:'text/plain',text:part,version:fileVersion,total,nextOffset:next<total?next:null};}case 'reference.resolve':if(input.reference.projectId&&input.reference.projectId!=='p-one')throw Object.assign(new Error('foreign'),{code:'PROJECT_SCOPE'});if(missing)throw Object.assign(new Error('gone'),{code:'REFERENCE_NOT_FOUND'});if(input.reference.sourceVersion!==undefined&&input.reference.sourceVersion!==resolvedVersion)throw Object.assign(new Error('changed'),{code:'REFERENCE_VERSION_CONFLICT'});return {resourceId:input.reference.pageId||input.reference.fileId,page:pages.get('a-one').artboard,sourceVersion:resolvedVersion,resolved:true,...(input.reference.nodeId?{node:{id:input.reference.nodeId}}:{})};default:throw Error(input.action)}}}};
  const ai=new AIWorkbench(owner);return {ai,owner,project,pages,calls,savedFiles,setBinding:v=>binding=v,setMissing:v=>missing=v,setVersion:v=>resolvedVersion=v,setRequirements:v=>requirements=v,setFileVersion:v=>fileVersion=v};
}
test('single admitted page reads infer the exact target while explicit and multi-page choices remain authoritative',async()=>{
  const f=fixture(),agent={id:'designer-p-one'},calls=[];
  f.ai.setTask(agent,{...selection,scope:'design'});
  f.ai.scopedPolicy=async()=>({mode:'workspace-write',workspaceRoot:'/workspace'});
  f.owner.execute=async input=>{calls.push(input);return {pageId:input.pageId};};
  const tool=f.ai.scopedTool(agent,'p-one');
  await tool.execute({action:'edit.read',options:{view:'source'}},{});
  assert.equal(calls.at(-1).pageId,'a-one');
  await tool.execute({action:'edit.read',options:{pageId:'a-two'}},{});
  assert.equal(calls.at(-1).pageId,'a-two');
  f.ai.setTask(agent,{...selection,scope:'design',pageIds:['a-one','a-two']});
  await tool.execute({action:'edit.read',options:{}},{});
  assert.equal(calls.at(-1).pageId,undefined);
});
test('misplaced public resource read arguments retain scope checks and nested precedence',async()=>{
  const f=fixture(),agent={id:'designer-p-one'},received=[];
  f.ai.setTask(agent,{...selection,scope:'design'});
  f.ai.scopedPolicy=async()=>({mode:'workspace-write',workspaceRoot:'/workspace'});
  const execute=f.ai.execute;
  f.ai.execute=async input=>{received.push(input);return {readonly:true};};
  const tool=f.ai.scopedTool(agent,'p-one');
  await tool.execute({action:'context.read',projectId:'foreign',resourceId:'binding-design:d-one',path:'components.js',query:'observe',contextLines:3,options:{query:'ds-tabs'}},{});
  assert.equal(received[0].projectId,'p-one');
  assert.equal(received[0].path,'components.js');
  assert.equal(received[0].query,'ds-tabs');
  assert.equal(received[0].contextLines,3);
  f.ai.execute=execute;
  await assert.rejects(tool.execute({action:'context.read',resourceId:'unadmitted',path:'rule.md'},{}),error=>error.message==='Resource is not in this task. Add it as a user reference first');
});
test('generic model reads and writes reject sensitive files at every monorepo depth',async()=>{
  const task={...selection,scope:'read'},sensitive=['.env','apps/web/.env','apps/web/.env.local','apps/web/.npmrc','apps/web/.netrc','apps/web/node_modules/pkg/index.js','apps/.workbench/state.json'];
  for(const path of sensitive){
    code(()=>assertAction({action:'file.read',projectId:'p-one',sourceId:'src-one',path},{task}),'SCOPE_DENIED');
    code(()=>assertAction({action:'file.write',projectId:'p-one',path},{task:{...selection,scope:'project',allowedPaths:['apps']}}),'USER_ONLY');
  }
  const selected={...task,authority:{kind:'source-file',sourceProjectId:'src-one',path:'apps/web/.env.local',sensitiveRead:true}};
  assert.equal(assertAction({action:'file.read',projectId:'p-one',sourceId:'src-one',path:'apps/web/.env.local'},{task:selected}).allowed,true);
  code(()=>assertAction({action:'file.read',projectId:'p-one',sourceId:'src-two',path:'apps/web/.env.local'},{task:selected}),'SCOPE_DENIED');
  const f=fixture();
  await assert.rejects(f.ai.prepare({projectId:'p-one',prompt:'Read file',target:{scope:'read',sourceId:'src-one',path:'apps/web/.env.local'},references:[]},{user:true,originUser:false}),{code:'SCOPE_DENIED'});
});
const submission=(extra={})=>({projectId:'p-one',prompt:'Improve the card',target:{...selection},references:[{pageId:'a-one',nodeId:'button',summary:'Original button',sourceVersion:2}],...extra});

test('prepare freezes exact target, actual source versions and latest bounded documents',async()=>{const f=fixture(),input=submission();const r=await f.ai.prepare(input,{user:true});assert.ok(Object.isFrozen(r.task)&&Object.isFrozen(r.task.nodeIds));input.target.pageId='a-two';f.project.workbench.designs[0].pageIds.push('a-two');assert.equal(r.task.pageId,'a-one');assert.deepEqual(r.task.pageIds,['a-one']);assert.equal(r.task.sourceVersion,2);assert.equal(r.task.contentHash,digest(f.pages.get('a-one').html));assert.equal(r.task.requirements.version,'fs-9');assert.equal(r.task.requirements.text.length,5000);assert.equal(r.task.rules.text,'latest rules');assert.ok(r.task.requirements.nextOffset);assert.ok(!r.prompt.includes(f.pages.get('a-one').html));});
test('binding changes apply to a later submission and never mutate admitted task',async()=>{const f=fixture(),first=await f.ai.prepare(submission(),{user:true});f.setBinding({mode:'independent',source:'design',systemId:'s-new',version:9,system:{guidelines:'New'}});const second=await f.ai.prepare(submission(),{user:true});assert.equal(first.task.effectiveBinding.version,1);assert.equal(second.task.effectiveBinding.version,9);});
test('faithful source retains submitted binding history but applies no project system',async()=>{const f=fixture(),r=await f.ai.prepare(submission({sourceId:'i-one',sourceVersion:4,sourceFidelity:'faithful'}),{user:true});assert.equal(r.effectiveBinding.mode,'none');assert.equal(r.effectiveBinding.system,null);assert.equal(r.task.submittedBinding.systemId,'s-one');assert.equal(r.task.source.version,4);});
test('stale source submission is rejected',async()=>{const f=fixture();await assert.rejects(f.ai.prepare(submission({sourceId:'i-one',sourceVersion:3}),{user:true}),e=>e.code==='REFERENCE_VERSION_CONFLICT');});
test('reference restoration revalidates identity and retains original summary/version',async()=>{const f=fixture(),r=await f.ai.prepare(submission(),{user:true});f.setMissing(true);const restored=await f.ai.revalidate(r.task);assert.equal(restored.current[0].invalid,true);assert.equal(restored.historical[0].summary,'Original button');assert.equal(restored.historical[0].sourceVersion,2);assert.equal(r.task.refs[0].invalid,false);});
test('cross-project references are marked invalid and do not change target',async()=>{const f=fixture(),r=await f.ai.prepare(submission({references:[{projectId:'p-other',fileId:'secret',label:'Read me'}]}),{user:true});assert.equal(r.task.refs[0].invalid,true);assert.equal(r.task.refs[0].reason,'PROJECT_SCOPE');assert.equal(r.task.projectId,'p-one');});
test('missing exact selected IDs reject without fuzzy replacement',async()=>{const f=fixture();await assert.rejects(f.ai.prepare(submission({target:{...selection,nodeIds:['gone']}}),{user:true}),e=>e.code==='REFERENCE_NOT_FOUND');});
test('opening references supplies no write grant',async()=>{const f=fixture(),r=await f.ai.prepare(submission({target:{projectId:'p-one',scope:'read'},references:[{fileId:'file-one'}]}),{user:true});code(()=>assertAction({action:'file.write',projectId:'p-one',path:'rules.md'},{task:r.task}),'SCOPE_DENIED');});
test('model cannot prepare a target or expand user-only permissions',async()=>{const f=fixture();await assert.rejects(f.ai.prepare(submission(),{user:true,agent:{id:'model'}}),e=>e.code==='USER_ONLY');for(const action of ['permissions.set','credentials.set','git.commit','git.push','share.create','binding.set'])code(()=>assertAction({action,projectId:'p-one'},{task:{...selection,scope:'project'},user:true,agent:{id:'model'}}),'USER_ONLY');});
test('project session bindings cannot cross projects',()=>{const f=fixture();code(()=>f.ai.setTask({id:'designer-p-other'},selection),'PROJECT_SCOPE');code(()=>assertAction({action:'artboard.commit',projectId:'p-other',artboardId:'a-one'},{task:selection}),'PROJECT_SCOPE');});
test('page and selection scopes cannot touch another page or design',()=>{for(const scope of ['page','selection']){const task={...selection,scope};code(()=>assertAction({action:'artboard.commit',projectId:'p-one',artboardId:'a-two'},{task}),'SCOPE_DENIED');code(()=>assertAction({action:'edit.apply',projectId:'p-one',pageId:'a-one',designId:'d-two'},{task}),'SCOPE_DENIED');}});
test('scope instructions come from frozen task instead of caller-supplied IDs',()=>{const r=assertAction({action:'edit.apply',projectId:'p-one',pageId:'a-one',scopeNodeIds:['b']},{task:selection});assert.deepEqual(r.scopeNodeIds,['a']);assert.equal(r.scopeMode,'selection');});
test('read policy rejects even project-scope writes',()=>code(()=>assertAction({action:'design.create',projectId:'p-one'},{task:{...selection,scope:'project'},policy:{mode:'read-only'}}),'SCOPE_DENIED'));
test('unknown action fails closed',()=>code(()=>assertAction({action:'super.readThenWrite',projectId:'p-one'},{task:{...selection,scope:'project'}}),'ACTION_NOT_ALLOWED'));
test('file writes need explicit paths; traversal and external source mismatch rejected',()=>{const task={...selection,scope:'project',allowedPaths:['designs/card'],sourceWrite:{sourceProjectId:'src-one',paths:['designs/card']}};assert.equal(assertAction({action:'file.write',projectId:'p-one',path:'designs/card/style.css'},{task}).allowed,true);for(const path of ['designs/other/style.css','designs/card/../other.css','/secret','designs\\card\\a.css'])code(()=>assertAction({action:'file.write',projectId:'p-one',path},{task}),'SCOPE_DENIED');code(()=>assertAction({action:'file.write',projectId:'p-one',path:'designs/card/a.css',sourceProjectId:'src-other'},{task}),'SCOPE_DENIED');});
test('selection full HTML allows subtree text, attributes and new children',()=>{const before=normalized(),after=before.replace('>Buy<',' style="color:blue">Pay<').replace('>A</p>','>A<span data-dsh-node="new-child">New</span></p>');assert.equal(assertCommitScope(before,after,selection),true);});
test('selection full HTML rejects sibling text, ancestor attributes and moved root',()=>{const before=normalized();for(const after of [before.replace('>B<','>changed<'),before.replace('<main data-dsh-node="main">','<main data-dsh-node="main" class="oops">'),before.replace('<aside data-dsh-node="b">B</aside>','')])code(()=>assertCommitScope(before,after,selection),'SCOPE_DENIED');});
test('selection full HTML rejects global CSS, head and script injection including inside selected subtree',()=>{const before=normalized();for(const after of [before.replace('.card{color:red}',':root{color:blue}'),before.replace('<title>Shop</title>','<title>Bad</title>'),before.replace('>Buy<',' onclick="evil()">Buy<'),before.replace('>A</p>','>A<style>*{display:none}</style></p>'),before.replace('>A</p>','>A<script>evil()</script></p>')])code(()=>assertCommitScope(before,after,selection),'SCOPE_DENIED');});
test('selection cannot steal outside stable identity or remove selected root',()=>{const before=normalized();for(const after of [before.replace('data-dsh-node="text"','data-dsh-node="b"'),before.replace('data-dsh-node="a"','data-dsh-node="replacement"')])code(()=>assertCommitScope(before,after,selection),'SCOPE_DENIED');});
test('structured selected responsive style compiles trusted controlled CSS',()=>{const before=normalized(),after=applyDocumentOperations(before,[{type:'style',nodeIds:['button'],styles:{color:'blue'},breakpoint:'mobile'}],{scopeMode:'selection',scopeNodeIds:['a']}).html;assert.equal(assertCommitScope(before,after,selection),true);code(()=>assertCommitScope(before,after.replace('[data-dsh-hidden="true"]{display:none!important}','*{display:none!important}'),selection),'SCOPE_DENIED');});
test('only selected interaction entries may change and targets must stay in selection',()=>{const before=normalized(),after=applyDocumentOperations(before,[{type:'interaction.set',interaction:{id:'i-button',type:'toggle',sourceId:'button',targetId:'text'}}],{scopeMode:'selection',scopeNodeIds:['a']}).html;assert.equal(assertCommitScope(before,after,selection),true);const bad=after.replace('"targetId":"text"','"targetId":"b"');code(()=>assertCommitScope(before,bad,selection),'SCOPE_DENIED');});
test('shared definition root cannot affect unselected registered instance',()=>{const doc=applyDocumentOperations(normalized(),[{type:'definition.set',definition:{id:'shared',rootId:'a',instanceIds:['b']}}]).html;code(()=>assertCommitScope(doc,doc.replace('>Buy<','>Changed<'),selection),'SCOPE_DENIED');});
test('read full HTML refuses writes; page full HTML permits page content',()=>{code(()=>assertCommitScope(html,html+' ',{...selection,scope:'read'}),'SCOPE_DENIED');assert.equal(assertCommitScope(html,html,{...selection,scope:'read'}),true);assert.equal(assertCommitScope(html,html.replace('Shop','New'),{...selection,scope:'page'}),true);});
test('context reads are bounded and reference identity is revalidated',async()=>{const f=fixture(),r=await f.ai.prepare(submission(),{user:true});const part=await f.ai.readContext({resourceId:'a-one',limit:80},{task:r.task});assert.equal(part.text.length,80);assert.equal(part.nextOffset,80);await assert.rejects(f.ai.readContext({resourceId:'a-two'},{task:r.task}),e=>e.code==='REFERENCE_NOT_FOUND');await assert.rejects(f.ai.readContext({resourceId:'a-one',limit:12001},{task:r.task}),e=>e.code==='INVALID_INPUT');});
test('prepare preserves real vision image bytes and stages files only at send',async()=>{const f=fixture(),image={type:'image',data:Buffer.from('real encoded raster fixture').toString('base64'),mediaType:'image/png',name:'screen.png'},file={type:'file',data:Buffer.from('file contents').toString('base64'),name:'brief.pdf'};const r=await f.ai.prepare(submission({attachments:[image,file]}),{user:true});assert.deepEqual(r.attachments,[image]);assert.equal(r.uploadInputs.length,1);assert.equal(f.calls.some(c=>c.upload),false);assert.equal(r.task.attachments[0].contentHash,digest(Buffer.from(image.data,'base64')));assert.ok(!r.prompt.includes(image.data));const parts=await f.ai.attachmentsForSession(r,{id:'designer-p-one'});assert.deepEqual(parts,[image,{type:'file',receiptId:'receipt-one'}]);assert.equal(f.calls.filter(c=>c.upload).length,1);});
test('preview.prepare is read-only and does not activate a DSH agent',async()=>{const f=fixture();const r=await f.ai.execute({...submission(),action:'preview.prepare'},{user:true});assert.equal(r.task.scope,'selection');assert.equal(f.ai.tasks.size,0);assert.ok(f.calls.every(c=>['binding.resolve','file.read','reference.resolve'].includes(c.action)));});
test('file IDs resolve to actual paths before authorization and cannot be disguised',async()=>{const f=fixture();f.project.workbench.files=[{id:'f-safe',path:'designs/card/a.css'},{id:'f-other',path:'designs/other/a.css'},{id:'f-ro',path:'designs/card/ref.css',readonly:true}];const task={...selection,scope:'project',allowedPaths:['designs/card']};assert.equal((await f.ai.authorizeAction({action:'file.write',projectId:'p-one',fileId:'f-safe'},{task})).allowed,true);await assert.rejects(f.ai.authorizeAction({action:'file.write',projectId:'p-one',fileId:'f-other',path:'designs/card/a.css'},{task}),e=>e.code==='SCOPE_DENIED');await assert.rejects(f.ai.authorizeAction({action:'file.write',projectId:'p-one',fileId:'f-ro'},{task}),e=>e.code==='SCOPE_DENIED');});
test('sourceId cannot borrow project path grants to write external code',()=>{const task={...selection,scope:'project',allowedPaths:['src']};code(()=>assertAction({action:'file.write',projectId:'p-one',sourceId:'source-external',path:'src/index.js'},{task}),'SCOPE_DENIED');assert.equal(assertAction({action:'file.write',projectId:'p-one',sourceId:'source-external',path:'src/index.js'},{task:{...task,sourceWrite:{sourceProjectId:'source-external',paths:['src']}}}).allowed,true);});
test('nested options cannot smuggle authorization or metadata mutations',()=>{code(()=>assertAction({action:'project.update',projectId:'p-one',options:{workbench:{permissions:{writablePaths:['secret']}}}},{task:{...selection,scope:'project'}}),'USER_ONLY');});
test('source imports use immutable historical version IDs and verify version bytes',async()=>{const f=fixture();f.project.workbench.sourceImports=[{id:'x-one',latestVersionId:'xv-new',mode:'faithful',versions:[{id:'xv-old',sha256:'old-hash'},{id:'xv-new',sha256:'new-hash'}]}];f.owner.execute=async input=>{assert.equal(input.action,'workbench.source.read');f.calls.push(input);return {version:{id:input.versionId},captureIds:['xc-one']}};const r=await f.ai.prepare(submission({sourceId:'x-one',sourceVersion:'xv-old',sourceCaptureIds:['xc-one']}),{user:true});assert.equal(r.task.source.version,'xv-old');assert.equal(r.task.source.contentHash,'old-hash');assert.equal(r.effectiveBinding.mode,'none');assert.equal(f.calls.filter(c=>c.action==='workbench.source.read').length,2);});
test('source adaptation freezes the explicitly chosen system version',async()=>{const f=fixture();f.owner.store.systemGet=async()=>({id:'s-override',name:'Brand',platforms:['web'],versions:[{version:5,tokens:{color:'pink'}}]});const r=await f.ai.prepare(submission({sourceId:'i-one',sourceFidelity:'system-adaptation',bindingOverride:{systemId:'s-override',version:5}}),{user:true});assert.equal(r.effectiveBinding.source,'source-override');assert.equal(r.task.effectiveBinding.version,5);assert.equal(r.task.submittedBinding.version,1);});
test('a no-page design generation target is writable and remains that design',async()=>{const f=fixture();f.project.artboards=[];f.project.workbench.designs[0].pageIds=[];const r=await f.ai.prepare(submission({mode:'generate',target:{projectId:'p-one',designId:'d-one'},references:[]}),{user:true});assert.equal(r.task.scope,'design');assert.deepEqual(r.task.pageIds,[]);assert.equal(assertAction({action:'page.create',projectId:'p-one',designId:'d-one'},{task:r.task}).allowed,true);code(()=>assertAction({action:'page.create',projectId:'p-one',designId:'d-two'},{task:r.task}),'SCOPE_DENIED');});
test('selection cannot modify locked descendants or global html root',()=>{const before=normalized().replace('data-dsh-node="text"','data-dsh-node="text" data-dsh-locked="true"');code(()=>assertCommitScope(before,before.replace('>A<','>changed<'),selection),'SCOPE_DENIED');code(()=>assertCommitScope(before,before.replace('<title>Shop</title>','<title>new</title>'),{...selection,nodeIds:['html']}),'SCOPE_DENIED');});
test('persisted long rules remain readable after live edits and trusted DSH reload',async()=>{const f=fixture(),original='规则内容🙂ABCD'.repeat(10000);f.setRequirements(original);const prepared=await f.ai.prepare(submission(),{user:true});const descriptor=await f.ai.persistTask(prepared,{policy:{mode:'workspace-write'}});assert.equal(descriptor.path,`.workbench/tasks/${prepared.task.id}/task.json`);assert.equal(descriptor.sha256,digest(f.savedFiles.get(`projects/p-one/${descriptor.path}`)));assert.ok(f.savedFiles.size>3);f.project.workbench.lastTaskRef={...descriptor,sessionId:'designer-p-one',requestId:'request-one'};f.setRequirements('changed current requirements');f.setFileVersion('fs-10');const reloaded=new AIWorkbench(f.owner),restored=await reloaded.restorePersistedTask({id:'designer-p-one'},descriptor);assert.deepEqual(restored.task.allowedPaths,prepared.task.allowedPaths);const offset=Buffer.byteLength(original.slice(0,31000)),chunk=await reloaded.readContext({resourceId:'file-requirements',offset,limit:500},{task:restored.task});assert.equal(chunk.text,original.slice(31000,31500));assert.equal(chunk.frozen,true);assert.equal(chunk.version,'fs-9');assert.equal(chunk.nextOffset,offset+Buffer.byteLength(chunk.text));assert.equal(restored.task.requirements.text,prepared.task.requirements.text);});
test('restore requires trusted project anchor and rejects changed metadata hashes',async()=>{const f=fixture(),prepared=await f.ai.prepare(submission({target:{projectId:'p-one',scope:'project'},allowedPaths:['designs/card']}),{user:true}),descriptor=await f.ai.persistTask(prepared);const reload=new AIWorkbench(f.owner),agent={id:'designer-p-one'};await assert.rejects(reload.restorePersistedTask(agent,descriptor),e=>e.code==='TASK_NOT_ANCHORED');f.project.workbench.lastTaskRef={...descriptor,sessionId:agent.id,requestId:'admitted'};const location=`projects/p-one/${descriptor.path}`;f.savedFiles.set(location,f.savedFiles.get(location).replace('designs/card','secrets'));await assert.rejects(reload.restorePersistedTask(agent,descriptor),e=>e.code==='TASK_HASH_MISMATCH');});
test('frozen document chunk integrity is checked progressively on retrieval',async()=>{const f=fixture(),prepared=await f.ai.prepare(submission(),{user:true}),descriptor=await f.ai.persistTask(prepared);const manifest=JSON.parse(f.savedFiles.get(`projects/p-one/${descriptor.path}`)),chunk=manifest.documents[0].chunks[0];f.savedFiles.set(`projects/p-one/${chunk.path}`,'tampered');await assert.rejects(f.ai.readContext({resourceId:'file-requirements',limit:100},{task:prepared.task}),e=>e.code==='TASK_HASH_MISMATCH');});
test('persist obeys DSH read-only policy and refuses ad-hoc forged task objects',async()=>{const f=fixture(),prepared=await f.ai.prepare(submission(),{user:true});await assert.rejects(f.ai.persistTask(prepared,{policy:{mode:'read-only'}}),e=>e.code==='FS_SANDBOX_DENIED');await assert.rejects(f.ai.persistTask({task:{...prepared.task}}),e=>e.code==='TASK_REQUIRED');});
test('multi-object reference restoration preserves grouping and original source version',async()=>{const f=fixture(),prepared=await f.ai.prepare(submission({references:[{pageId:'a-one',nodeIds:['button','text'],summary:'Group'}]}),{user:true});f.setVersion(3);const restored=await f.ai.revalidate(prepared.task);assert.equal(restored.current[0].nodes.length,2);assert.equal(restored.current[0].invalid,true);assert.equal(restored.historical[0].summary,'Group');assert.equal(restored.historical[0].nodes[0].sourceVersion,2);});
test('explicit page subset narrows existing pages and permits newly generated pages',async()=>{const f=fixture(),prepared=await f.ai.prepare(submission({target:{projectId:'p-one',scope:'project',pageIds:['a-one']},references:[]}),{user:true});assert.deepEqual(prepared.task.pageIds,['a-one']);assert.deepEqual(prepared.task.existingPageIds,['a-one','a-two']);code(()=>assertAction({action:'artboard.commit',projectId:'p-one',artboardId:'a-two'},{task:prepared.task}),'SCOPE_DENIED');const added={artboard:{id:'a-new',revision:1,designId:'d-one'},html:normalized()};f.pages.set('a-new',added);f.project.artboards.push(added.artboard);f.project.workbench.designs[0].pageIds.push('a-new');assert.equal((await f.ai.authorizeAction({action:'artboard.commit',projectId:'p-one',artboardId:'a-new'},{task:prepared.task})).allowed,true);const context=await f.ai.readContext({resourceId:'a-new',limit:20},{task:prepared.task});assert.equal(context.version,1);assert.deepEqual(prepared.task.pageIds,['a-one']);});
test('design subset rejects another design page and broad binding application',async()=>{const f=fixture();await assert.rejects(f.ai.prepare(submission({target:{projectId:'p-one',designId:'d-one',scope:'design',pageIds:['a-two']}}),{user:true}),e=>e.code==='SCOPE_DENIED');const prepared=await f.ai.prepare(submission({target:{projectId:'p-one',scope:'project',pageIds:['a-one']},references:[]}),{user:true});await assert.rejects(f.ai.authorizeAction({action:'binding.apply',projectId:'p-one',designIds:['d-two']},{task:prepared.task}),e=>e.code==='SCOPE_DENIED');});
test('queued DSH prompt blocks replacement before agent starts running',async()=>{const f=fixture();f.owner.ctx.sessionController={async state(){return {running:false,queue:[{id:'m-one',placement:'queued',rpcId:'request-one'}]}}};const result=await f.ai.admissionState({id:'designer-p-one'},{requestId:'request-one'});assert.equal(result.busy,true);assert.equal(result.reason,'queued');assert.equal(result.queue[0].rpcId,'request-one');});
test('idle DSH state requires exact admitted request and its following turn end',async()=>{const f=fixture(),events=[];f.owner.ctx.sessionController={async state(){return {running:false,queue:[]}}};const agent={id:'designer-p-one',session:{snapshotEvents:()=>events}};assert.equal((await f.ai.admissionState(agent,{requestId:'request-one'})).reason,'awaiting-request-record');events.push({type:'turn/end',seq:1,data:{turn:1}},{type:'turn/start',seq:2,data:{turn:2}},{type:'user/message',seq:3,data:{source:{kind:'user',rpcId:'request-one'}}});assert.equal((await f.ai.admissionState(agent,{requestId:'request-one'})).busy,true);events.push({type:'turn/end',seq:4,data:{turn:99}});assert.equal((await f.ai.admissionState(agent,{requestId:'request-one'})).busy,true);events.push({type:'turn/end',seq:5,data:{turn:2}});const completed=await f.ai.admissionState(agent,{requestId:'request-one'});assert.equal(completed.busy,false);assert.equal(completed.completedSeq,5);});
test('mixed image/file order survives DSH upload staging and project receiver is enforced',async()=>{const f=fixture(),image={type:'image',data:Buffer.from('image').toString('base64'),mediaType:'image/png'},file={type:'file',data:Buffer.from('file').toString('base64'),name:'brief'};const prepared=await f.ai.prepare(submission({attachments:[file,image]}),{user:true});const parts=await f.ai.attachmentsForSession(prepared,{id:'designer-p-one'});assert.equal(parts[0].type,'file');assert.equal(parts[1].type,'image');await assert.rejects(f.ai.attachmentsForSession(prepared,{id:'designer-p-other'}),e=>e.code==='PROJECT_SCOPE');});
test('mutating source workflow setup cannot masquerade as a read action',()=>{for(const action of ['source.plan','source.select','source.refreshPreview','workbench.source.plan'])code(()=>assertAction({action,projectId:'p-one'},{task:{...selection,scope:'read'}}),'USER_ONLY');});
test('scoped source read dispatches the actual workbench workflow namespace',async()=>{const f=fixture(),agent={id:'designer-p-one'};f.ai.setTask(agent,selection);let received;f.owner.execute=async input=>{received=input;return {ok:true}};await f.ai.scopedTool(agent,'p-one').execute({action:'source.read',options:{sourceId:'x-one',versionId:'xv-one'}},{});assert.equal(received.action,'workbench.source.read');});
test('legacy page target infers its actual design before resolving independent binding',async()=>{const f=fixture();const prepared=await f.ai.prepare({projectId:'p-one',prompt:'Edit',artboardId:'a-one',mode:'edit'},{user:true});assert.equal(prepared.task.designId,'d-one');assert.ok(f.calls.some(c=>c.action==='binding.resolve'&&c.designId==='d-one'));});
test('domain: native lifecycle correlates the exact RPC to its containing turn and known terminal reason',async()=>{
  const f=fixture(),events=[];let running=true;const sessionId='designer-p-one';f.owner.ctx.agents={get:()=>({id:sessionId,session:{snapshotEvents:()=>events}})};f.owner.ctx.sessionController={async state(){return {running,queue:[]}}};const request={sessionId,requestId:'rpc-one'};
  events.push({type:'turn/start',seq:1,data:{turn:10}},{type:'user/message',seq:2,data:{source:{kind:'user',rpcId:'rpc-one'}}},{type:'turn/end',seq:3,data:{turn:9,reason:{kind:'completed'}}});assert.equal((await f.ai.requestLifecycle(request)).generation,'running');
  events.push({type:'user/message',seq:4,data:{source:{kind:'user',rpcId:'rpc-steering'}}},{type:'turn/end',seq:5,data:{turn:10,reason:{kind:'max-tokens'}}});running=false;const limited=await f.ai.requestLifecycle(request);assert.equal(limited.generation,'incomplete');assert.equal(limited.terminalSeq,5);assert.equal((await f.ai.requestLifecycle({...request,requestId:'rpc-steering'})).turn,10);
  for(const [kind,status]of [['completed','completed'],['error','failed'],['aborted','cancelled'],['blocked','incomplete'],['success','unknown']]){events[4]={type:'turn/end',seq:5,data:{turn:10,reason:{kind}}};assert.equal((await f.ai.requestLifecycle(request)).generation,status);}
  events.push({type:'turn/start',seq:6,data:{turn:11}},{type:'user/message',seq:7,data:{source:{kind:'user',rpcId:'rpc-two'}}},{type:'turn/end',seq:8,data:{turn:11,reason:{kind:'completed'}}});assert.equal((await f.ai.requestLifecycle(request)).generation,'unknown');assert.equal((await f.ai.requestLifecycle({...request,requestId:'rpc-missing'})).generation,'unknown');
});
test('domain: source review remains user-only through nested workbench aliases',()=>{for(const action of ['source.review','workbench.source.review'])code(()=>assertAction({action,projectId:'p-one',options:{user:true}},{task:selection,user:true,agent:{id:'designer-p-one'}}),'USER_ONLY');});
test('tool schema stays compact and help discovers bounded resource reads',()=>{const f=fixture(),tool=f.ai.scopedTool({id:'designer-p-one'},'p-one');assert.ok(JSON.stringify(tool.parameters).length<2000);assert.ok(f.ai.help().actions.some(a=>a.action==='context.read'));assert.ok(f.ai.help('context.read').fields.includes('12000'));});

test('scoped help starts with the compact task directory and retains exact action help',async()=>{
  const f=fixture(),agent={id:'designer-p-one'};f.ai.setTask(agent,selection);
  f.ai.scopedPolicy=async()=>({mode:'workspace-write',workspaceRoot:'/workspace'});
  const tool=f.ai.scopedTool(agent,'p-one');let detailed=0;
  f.owner.actionHelp=(topic)=>{detailed++;return {action:topic,fields:{pageId:'required'}};};
  const index=await tool.execute({action:'help'},{});
  assert.ok(index.actions.some(row=>row.action==='edit.read'));assert.equal(detailed,0);
  assert.deepEqual(await tool.execute({action:'help',options:{action:'edit.read'}},{}),{action:'edit.read',fields:{pageId:'required'}});
  assert.equal(detailed,1);
});

function frameworkFixture({kind='react',bothFiles=false,sourceRoot}={}) {
  const f=fixture(),design=f.project.workbench.designs[0],page=f.project.artboards[0];
  design.folder='designs/first';
  sourceRoot??=`${design.folder}/source-${page.id}`;
  const paths=[`${sourceRoot}/App.${kind==='react'?'jsx':'vue'}`,`${sourceRoot}/Card.${kind==='react'?'jsx':'vue'}`];
  const source=kind==='react'?`const items=['one','two'];\nexport default function App(){return <main data-dsh-source="root">{items.map(item=><button data-dsh-source="source-button" onClick={()=>console.log(item)}>{item}</button>)}<aside data-dsh-source="sibling">Preserve me</aside></main>}`:`<script setup>const items=['one','two']; const click=item=>console.log(item)</script>\n<template><main data-dsh-source="root"><button v-for="item in items" :key="item" data-dsh-source="source-button" @click="click(item)">{{item}}</button><aside data-dsh-source="sibling">Preserve me</aside></main></template>`;
  const normalized=paths.map(path=>normalizeFrameworkSource({path,framework:kind,code:source})),files=Object.fromEntries(paths.map((path,i)=>[path,normalized[i].code]));
  const artifact={kind,sourceRoot,entry:paths[0],files:paths,manifest:normalized.flatMap(row=>row.nodes),version:3,buildId:'build-source-3'};
  page.artifact=artifact;
  const artifactIdentity=Object.fromEntries(['kind','entry','version','buildId'].map(key=>[key,artifact[key]]));
  const object=(path,index)=>({id:`runtime-${index}`,nodeId:`runtime-${index}`,instanceId:`runtime-${index}`,sourceNodeId:'source-button',sourceLocator:structuredClone(artifact.manifest.find(row=>row.path===path&&row.id==='source-button')),documentEpoch:'document-1',renderEpoch:7,sceneId:'query',artifact:structuredClone(artifactIdentity),sourceInstanceCount:2,outerHTML:`<button data-dsh-source="source-button" data-dsh-node="runtime-${index}">${'完整元素'.repeat(index===1?4000:2)}</button>`});
  const objects=[object(paths[0],1),object(paths[0],2),...(bothFiles?[object(paths[1],3)]:[])];
  const picked={pageId:page.id,nodeIds:objects.map(row=>row.instanceId),artifact:artifactIdentity,documentEpoch:'document-1',renderEpoch:7,sceneId:'query',objects};
  f.owner.workbench.project=async()=>f.project;
  f.owner.framework=new FrameworkService(f.owner);
  // The actual framework resolver and AST utilities run over isolated in-memory files.
  f.owner.framework.records=async()=>({files,versions:Object.fromEntries(paths.map(path=>[path,'source-v1']))});
  f.owner.execute=async(input,options)=>{f.calls.push(input);if(input.action==='framework.element.get')return f.owner.framework.element(input,options);
    if(input.action!=='framework.element.replace')throw Error('Unexpected test dispatch');
    const result=replaceSourceElement({path:input.path,framework:kind,code:files[input.path],nodeId:input.nodeId,expectedSourceHash:input.expectedSourceHash,replacement:input.replacement,preserveRootId:true});files[input.path]=result.code;return {saved:true,sourceSaved:true,sourceHash:digest(result.code)};};
  const request=()=>({projectId:f.project.id,prompt:'Make the source template button clearer',target:{...selection,nodeIds:[...picked.nodeIds],sourceTemplateConfirmed:sourceTemplateConfirmation(picked)},selection:structuredClone(picked)});
  return {...f,page,paths,files,picked,request};
}

test('framework picks freeze verified source IDs while retaining complete runtime evidence and required template acknowledgement',async()=>{
  const f=frameworkFixture(),input=f.request();
  input.selection.objects.forEach((object,index)=>object.selectionLabel=['A','C'][index]);
  await assert.rejects(f.ai.prepare({...input,target:{...input.target,sourceTemplateConfirmed:undefined}},{user:true}),error=>error.code==='SOURCE_TEMPLATE_CONFIRMATION_REQUIRED');
  const prepared=await f.ai.prepare(input,{user:true}),task=prepared.task,target=task.framework.sourceTargets[0];
  assert.equal(task.scope,'selection');assert.deepEqual(task.nodeIds,['source-button']);assert.deepEqual(target.instanceIds,['runtime-1','runtime-2']);assert.equal(target.instanceCount,2);
  assert.equal(target.element,f.picked.objects[0].outerHTML);assert.ok(target.element.length>12000);assert.equal(target.sourceCode,f.files[f.paths[0]]);assert.ok(target.sourceElement.includes('onClick'));assert.ok(target.sourceElement.includes('{item}'));
  assert.deepEqual(task.framework.runtimeSelection,input.selection);assert.ok(Object.isFrozen(task.framework.runtimeSelection.objects[0]));assert.ok(prepared.prompt.includes('data-dsh-source'));assert.ok(prepared.prompt.includes('data-dsh-node'));assert.ok(prepared.prompt.includes('SOURCE TEMPLATE'));assert.ok(prepared.prompt.includes('never write outerHTML'));
  input.selection.objects[0].outerHTML='changed';assert.equal(task.framework.runtimeSelection.objects[0].outerHTML,f.picked.objects[0].outerHTML);
  const summary=f.ai.taskSummary(task);assert.equal(summary.framework.sourceTargets[0].sourceCode,undefined);assert.equal(summary.framework.runtimeSelection,undefined);assert.deepEqual(summary.framework.selectionLabels.map(row=>[row.selectionLabel,row.instanceId]),[['A','runtime-1'],['C','runtime-2']]);assert.ok(prepared.prompt.includes('selectionLabel'));assert.ok(summary.framework.sourceTargets[0].resourceId.startsWith('source-selection:'));
  const agent={id:'designer-p-one'},restored=await f.ai.restoreTask(agent,task);assert.equal(restored.task.id,task.id); // runtime IDs are absent from the static HTML model.
});

test('framework source resources distinguish two files with the same node ID and return complete paginated elements, source and instances',async()=>{
  const f=frameworkFixture({bothFiles:true}),{task}=await f.ai.prepare(f.request(),{user:true}),targets=task.framework.sourceTargets;
  assert.equal(targets.length,2);assert.notEqual(targets[0].resourceId,targets[1].resourceId);assert.equal(targets[0].nodeId,targets[1].nodeId);
  const readAll=async(resourceId,field)=>{let text='',offset=0;for(;;){const part=await f.ai.readContext({resourceId,field,offset,limit:4096},{task});assert.equal(part.complete,true);assert.equal(part.frozen,true);assert.equal(part.readonly,true);text+=part.text;if(part.nextOffset===null)return text;offset=part.nextOffset;}};
  assert.equal(await readAll(targets[0].resourceId,'element'),f.picked.objects[0].outerHTML);assert.equal(await readAll(targets[0].resourceId,'source'),f.files[f.paths[0]]);
  assert.equal(await readAll(targets[1].resourceId,'sourceElement'),targets[1].sourceElement);assert.deepEqual(JSON.parse(await readAll(targets[0].resourceId,'instances')),f.picked.objects.slice(0,2));
  await assert.rejects(f.ai.readContext({resourceId:'source-selection:forged'},{task}),error=>error.code==='REFERENCE_NOT_FOUND');
});

test('framework selection blocks generic writes, unrelated source paths and IDs, hash changes and page configuration smuggling',async()=>{
  const f=frameworkFixture(),{task}=await f.ai.prepare(f.request(),{user:true}),target=task.framework.sourceTargets[0],base={projectId:task.projectId,pageId:task.pageId,path:target.path,nodeId:target.nodeId,expectedSourceHash:target.sourceHash};
  assert.equal(assertAction({action:'framework.element.get',...base},{task}).allowed,true);
  assert.equal(assertAction({action:'framework.element.replace',...base},{task}).scopeMode,'source-selection');
  for(const action of ['artboard.commit','document.apply','edit.apply','file.write','file.create','framework.write','framework.build','framework.read','asset.import'])code(()=>assertAction({action,...base,html:normalized(),files:[{path:target.path,code:'bad'}]},{task}),'SCOPE_DENIED');
  for(const patch of [{path:f.paths[1]},{path:target.path.replace('/App.jsx','/../outside.jsx')},{nodeId:'sibling'},{pageId:'a-two'},{files:[]},{entry:target.path},{scenes:[]},{kind:'vue'},{html:'<button>DOM substitute</button>'}])code(()=>assertAction({action:'framework.element.replace',...base,...patch},{task}),'SCOPE_DENIED');
  for(const patch of [{expectedSourceHash:undefined},{expectedSourceHash:'0'.repeat(64)}])code(()=>assertAction({action:'framework.element.replace',...base,...patch},{task}),'REFERENCE_VERSION_CONFLICT');
  code(()=>assertAction({action:'framework.element.replace',...base},{task,policy:{mode:'read-only'}}),'SCOPE_DENIED');
  code(()=>assertCommitScope(normalized(),normalized(),task),'SCOPE_DENIED');
});

test('framework admission rejects stale artifact hashes, forged manifest ranges, truncated elements and mixed scene epochs',async()=>{
  const f=frameworkFixture(),base=f.request();
  for(const mutate of [value=>{value.selection.artifact.buildId='old-build'},value=>{value.selection.objects[0].sourceLocator.sourceHash='0'.repeat(64)},value=>{value.selection.objects[0].sourceLocator.start++},value=>{value.selection.objects[0].sourceLocator.path=f.paths[1]},value=>{value.selection.objects[0].sourceNodeId='absent'},value=>{value.selection.objects[0].renderEpoch++},value=>{value.selection.objects[0].sceneId='create'},value=>{value.selection.objects[0].outerHTMLTruncated=true}]){
    const value=structuredClone(base);mutate(value);await assert.rejects(f.ai.prepare(value,{user:true}),error=>['REFERENCE_VERSION_CONFLICT','SOURCE_SELECTION_STALE','INVALID_SCOPE','SOURCE_TEMPLATE_CONFIRMATION_REQUIRED','ELEMENT_CONTEXT_INCOMPLETE'].includes(error.code),JSON.stringify(value.selection.objects[0].sourceLocator));
  }
  const {task}=await f.ai.prepare(base,{user:true}),target=task.framework.sourceTargets[0];f.files[target.path]+='\n// external edit';
  await assert.rejects(f.ai.readContext({resourceId:target.resourceId,field:'source'},{task}),error=>error.code==='SOURCE_SELECTION_STALE');
  await assert.rejects(f.ai.authorizeAction({action:'framework.element.replace',projectId:task.projectId,pageId:task.pageId,path:target.path,nodeId:target.nodeId,expectedSourceHash:target.sourceHash,replacement:target.sourceElement},{task}),error=>error.code==='SOURCE_SELECTION_STALE');
});

for(const kind of ['react','vue'])test(`scoped AI ${kind} source replacement reaches the real AST helper and preserves sibling source`,async()=>{
  const f=frameworkFixture({kind}),{task}=await f.ai.prepare(f.request(),{user:true}),target=task.framework.sourceTargets[0],before=f.files[target.path],other=f.files[f.paths[1]],agent={id:'designer-p-one'};
  f.ai.setTask(agent,task);const tool=f.ai.scopedTool(agent,task.projectId);
  const replacement=kind==='react'?'<button data-dsh-source="source-button" onClick={()=>console.log(item)}>Saved {item}</button>':'<button v-for="item in items" :key="item" data-dsh-source="source-button" @click="click(item)">Saved {{item}}</button>';
  const result=await tool.execute({action:'framework.element.replace',options:{pageId:task.pageId,path:target.path,nodeId:target.nodeId,expectedSourceHash:target.sourceHash,replacement,expectedRevision:task.projectVersion}},{});
  assert.equal(result.saved,true);assert.ok(f.files[target.path].includes('Saved'));assert.equal(f.files[f.paths[1]],other);
  assert.equal(f.files[target.path].slice(0,target.locator.start),before.slice(0,target.locator.start));assert.equal(f.files[target.path].slice(target.locator.start+replacement.length),before.slice(target.locator.end));
  assert.ok(f.files[target.path].includes('Preserve me'));assert.ok(f.files[target.path].includes(kind==='react'?'onClick':'@click'));assert.ok(!f.files[target.path].includes('完整元素'));assert.ok(!f.files[target.path].includes('runtime-1'));
});

test('framework page generation stays in the frozen Design and exact page source directory',async()=>{
  const f=frameworkFixture(),{task}=await f.ai.prepare({projectId:'p-one',prompt:'Create React view',target:{projectId:'p-one',designId:'d-one',pageId:'a-one',scope:'page'}},{user:true}),base={projectId:task.projectId,pageId:task.pageId,expectedRevision:task.projectVersion};
  assert.equal((await f.ai.authorizeAction({action:'framework.write',...base,kind:'react',entry:f.paths[0],files:[{path:f.paths[0],code:'export default ()=>null'}]},{task})).allowed,true);
  for(const path of ['designs/other/source-a-one/App.jsx','designs/first/source-a-two/App.jsx','designs/first/source-a-one/../outside.jsx','designs/first/source-a-one/.env'])await assert.rejects(f.ai.authorizeAction({action:'framework.write',...base,files:[{path,code:'bad'}]},{task}),error=>error.code==='SCOPE_DENIED');
  await assert.rejects(f.ai.authorizeAction({action:'framework.build',...base,pageId:'a-two'},{task}),error=>error.code==='SCOPE_DENIED');
});

test('an explicitly chosen framework page scope keeps its broader authority while picks remain source reference evidence',async()=>{
 const f=frameworkFixture(),input=f.request();input.target.scope='page';delete input.target.sourceTemplateConfirmed;
 const {task,context,prompt}=await f.ai.prepare(input,{user:true});assert.equal(task.scope,'page');assert.equal(task.framework.sourceTargets.length,1);assert.equal(context.pageArtifacts[0].artifact.kind,'react');assert.equal(task.pageArtifacts[0].artifact.sourceRoot,f.page.artifact.sourceRoot);assert.ok(prompt.includes('never edit it through artboard.commit'));
 assert.equal((await f.ai.authorizeAction({action:'framework.write',projectId:task.projectId,pageId:task.pageId,files:[{path:f.paths[0],code:f.files[f.paths[0]]}],expectedRevision:task.projectVersion},{task})).allowed,true);
});

test('framework sourceRoot survives whole-project page ID rebasing without granting sibling Design directories',async()=>{
 const f=frameworkFixture({sourceRoot:'designs/first/source-original-cloned-page'}),{task}=await f.ai.prepare(f.request(),{user:true});assert.equal(task.framework.sourceRoot,f.page.artifact.sourceRoot);
 const generated=await f.ai.prepare({projectId:'p-one',prompt:'Update page source',target:{projectId:'p-one',designId:'d-one',pageId:'a-one',scope:'page'}},{user:true});
 const input={action:'framework.write',projectId:task.projectId,pageId:task.pageId,files:[{path:f.paths[0],code:f.files[f.paths[0]]}]};assert.equal((await f.ai.authorizeAction(input,{task:generated.task})).allowed,true);
 await assert.rejects(f.ai.authorizeAction({...input,files:[{path:'designs/first/source-sibling/App.jsx',code:'x'}]},{task:generated.task}),error=>error.code==='SCOPE_DENIED');
 for(const root of ['designs/other/source-original-cloned-page','designs/first/nested/source-original-cloned-page','designs/first','designs/first/source-sibling']){
  f.page.artifact.sourceRoot=root;await assert.rejects(f.ai.authorizeAction(input,{task:generated.task}),error=>error.code==='SCOPE_DENIED');
 }
});

test('framework.edit remains owner-only even when the AI has full project authority',()=>{
 for(const action of ['framework.edit','workbench.framework.edit'])for(const scope of ['selection','page','design','project'])code(()=>assertAction({action,projectId:'p-one',pageId:'a-one'},{task:{...selection,scope},agent:{id:'designer-p-one'},user:true}),'USER_ONLY');
 const actions=fixture().ai.help('actions');assert.ok(actions.userOnly.includes('framework.edit'));assert.ok(!actions.framework.includes('framework.edit'));
});

test('HTML tasks retain complete runtime elements, original frame metadata and the full saved HTML source node',async()=>{
 const f=fixture(),outerHTML='<section data-dsh-node="a">'+('运行时完整元素'.repeat(4500))+'</section>',picked={pageId:'a-one',nodeIds:['a'],documentEpoch:'html-document-2',renderEpoch:8,sceneId:'error',artifact:{kind:'html',version:2},objects:[{id:'a',nodeId:'a',tag:'section',outerHTML,documentEpoch:'html-document-2',renderEpoch:8,sceneId:'error',artifact:{kind:'html',version:2},sourceLocator:{kind:'html-node',path:'designs/first/page.html',id:'a'}}]};
 picked.objects[0].selectionLabel='C';
 const {task,context,prompt}=await f.ai.prepare({projectId:'p-one',prompt:'Refine this element',target:{...selection},selection:picked},{user:true}),resource=task.selectionElements[0].resourceId;
 assert.equal(context.selectionElements[0].selectionLabel,'C');assert.ok(prompt.includes('selectionLabel'));
 assert.equal(task.selectionEvidence.objects[0].outerHTML,outerHTML);assert.ok(Object.isFrozen(task.selectionEvidence.objects[0]));assert.equal(context.selectionElements[0].elementCharacters,outerHTML.length);assert.ok(prompt.includes('complete captured runtime outerHTML'));assert.equal(context.pageArtifacts[0].artifact.kind,'html');assert.equal(f.ai.taskSummary(task).selectionEvidence,undefined);assert.equal(f.ai.taskSummary(task).selectionElements[0].sourceElement,undefined);
 let text='',offset=0;for(;;){const value=await f.ai.readContext({resourceId:resource,offset,limit:4096},{task});text+=value.text;assert.equal(value.frame.documentEpoch,'html-document-2');assert.equal(value.frame.renderEpoch,8);assert.equal(value.frame.sceneId,'error');assert.equal(value.observation.sourceLocator.path,'designs/first/page.html');assert.equal(value.sourceVersion,2);assert.equal(value.readonly,true);if(value.nextOffset===null)break;offset=value.nextOffset;}
 assert.equal(text,outerHTML);const saved=await f.ai.readContext({resourceId:resource,field:'sourceElement'},{task});assert.ok(saved.text.includes('data-dsh-node="a"'));assert.ok(saved.text.includes('Buy'));assert.ok(!saved.text.includes('运行时完整元素'));assert.equal(saved.sourceHash,digest(saved.text));
 picked.objects[0].outerHTML='changed';assert.equal((await f.ai.readContext({resourceId:resource,offset:0,limit:4096},{task})).total,outerHTML.length);
 await assert.rejects(f.ai.readContext({resourceId:'selection-element:forged'},{task}),error=>error.code==='REFERENCE_NOT_FOUND');
});

test('HTML and framework runtime selections fail explicitly for partial or aggregate 2 MiB overflow instead of freezing prefixes',async()=>{
 const f=fixture(),base={projectId:'p-one',prompt:'Edit selected element',target:{...selection},selection:{pageId:'a-one',objects:[{nodeId:'a',outerHTML:'<section data-dsh-node="a">complete</section>'}]}};
 const near=structuredClone(base);near.selection.objects[0].outerHTML='<section>'+('中'.repeat(698000))+'</section>';const prepared=await f.ai.prepare(near,{user:true});assert.equal(prepared.task.selectionEvidence.objects[0].outerHTML,near.selection.objects[0].outerHTML);
 for(const kind of ['html','react']){
  const current=kind==='html'?base:frameworkFixture().request();
  const partial=structuredClone(current);partial.selection.objects[0].outerHTMLTruncated=true;await assert.rejects(f.ai.prepare(partial,{user:true}),error=>error.code==='ELEMENT_CONTEXT_INCOMPLETE');
  const large=structuredClone(current);large.selection.objects[0].outerHTML='中'.repeat(700000);await assert.rejects(f.ai.prepare(large,{user:true}),error=>error.code==='ELEMENT_CONTEXT_TOO_LARGE');
 }
 const forged=structuredClone(base);forged.selection.objects[0].nodeId='body > section:nth-child(1)';await assert.rejects(f.ai.prepare(forged,{user:true}),error=>error.code==='REFERENCE_NOT_FOUND');
});

test('scoped help reaches executable schemas and read aliases retain native compaction',async()=>{
  const f=fixture(),agent={id:'designer-p-one'};f.ai.setTask(agent,selection);
  f.owner.actionHelp=(action,options)=>({action,type:options.type});
  const tool=f.ai.scopedTool(agent,'p-one');
  assert.deepEqual(await tool.execute({action:'help',options:{action:'edit.operations',type:'scene.create'}},{}),{action:'edit.operations',type:'scene.create'});
  const calls=[];f.owner.execute=async(input,options)=>{calls.push({input,options});return {ok:true}};
  for(const action of ['edit.read','edit.operations','document.get','state'])await tool.execute({action,options:{pageId:'a-one'}},{});
  assert.deepEqual(calls.map(row=>row.input.action),['edit.read','edit.operations','edit.read','project.get']);
  assert.ok(calls.every(row=>row.options.modelFacing===true));
});

test('task reads expose live revision separately from the frozen admission snapshot',async()=>{
  const f=fixture(),{task}=await f.ai.prepare(submission(),{user:true});
  f.project.revision=99;
  const read=await f.ai.execute({action:'task.get',projectId:'p-one'},{task});
  assert.equal(read.currentProjectRevision,99);assert.notEqual(task.projectRevision,99);
});

test('pinned context paths read verified files, paginate text and omit embedded binary payloads',async()=>{
  const f=fixture(),content='body{background:url(data:image/png;base64,YWJj)} end',resource={id:'r-css',logicalPath:'theme.css',mimeType:'text/css',sha256:digest(content)};
  const system={id:'s-one',version:3,resources:[resource]},task={projectId:'p-one',effectiveBinding:{systemId:'s-one',version:3,system}};
  f.owner.workbench.execute=async input=>{assert.equal(input.action,'system.resource.read');assert.equal(input.systemId,'s-one');assert.equal(input.version,3);return {bytesBase64:Buffer.from(content).toString('base64'),mimeType:'text/css'}};
  const read=await f.ai.readContext({resourceId:'binding:s-one',path:'theme.css'},{task});
  assert.ok(read.text.includes('[embedded binary omitted]'));assert.ok(!read.text.includes('YWJj'));assert.equal(read.binaryDataOmitted,true);assert.equal(read.sourceContentHash,resource.sha256);
  const page=await f.ai.readContext({resourceId:'binding:s-one',path:'theme.css',offset:2,limit:4},{task});
  assert.equal(page.text,read.text.slice(2,6));assert.equal(page.nextOffset,6);
  const search=await f.ai.readContext({resourceId:'binding:s-one',path:'theme.css',query:'BACKGROUND',contextLines:0},{task});
  assert.equal(JSON.parse(search.text).matchCount,1);assert.equal(JSON.parse(search.text).matches[0].startLine,1);
  assert.ok(!search.text.includes('YWJj'));assert.equal(search.sourceContentHash,read.sourceContentHash);
  await assert.rejects(f.ai.readContext({resourceId:'binding:s-one',path:'theme.css',query:''},{task}),{code:'INVALID_INPUT'});
  await assert.rejects(f.ai.readContext({resourceId:'binding:s-one',path:'other.css'},{task}),{code:'REFERENCE_NOT_FOUND'});
  const designTask={projectId:'p-one',effectiveBinding:{},effectiveBindingsByDesign:{'d-one':{systemId:'s-one',version:3,system}}};
  assert.equal((await f.ai.readContext({resourceId:'binding-design:d-one',path:'theme.css'},{task:designTask})).version,3);
  const appTask={projectId:'p-one',effectiveBinding:{applications:[{resourceId:'app-one',systemResourceId:'system-one'}],systems:{'system-one':system}}};
  assert.equal((await f.ai.readContext({resourceId:'app-one',path:'theme.css'},{task:appTask})).systemId,'s-one');
  f.owner.workbench.execute=async()=>({bytesBase64:Buffer.from('changed').toString('base64'),mimeType:'text/css'});
  await assert.rejects(f.ai.readContext({resourceId:'binding:s-one',path:'theme.css'},{task}),{code:'REFERENCE_VERSION_CONFLICT'});
});

test('pinned usage reads only public contracts and selected exact examples with verified pagination',async()=>{
  const f=fixture(), files={
    'components.json':JSON.stringify({name:'Project components',version:'2.1',components:[{tag:'custom-field',attributes:['value']},{tag:'custom-dialog',methods:['showModal()']}] }),
    'tokens.json':JSON.stringify({primary:'#123456'}),
    'examples/components.html':'<!doctype html><html><body><custom-field><input></custom-field><custom-dialog><p>Actual pinned example</p></custom-dialog></body></html>',
    'theme.css':'PRIVATE_IMPLEMENTATION_CSS',
    'components.js':'PRIVATE_IMPLEMENTATION_JS',
  };
  const resources=Object.entries(files).map(([logicalPath,content])=>({id:logicalPath,logicalPath,mimeType:logicalPath.endsWith('.json')?'application/json':'text/plain',sha256:digest(content)}));
  const system={id:'s-custom',version:8,resources},task={projectId:'p-one',scope:'read',designId:'d-one',designIds:['d-one'],pageIds:[],effectiveBinding:{},effectiveBindingsByDesign:{'d-one':{systemId:'s-custom',version:8,system}}};
  const reads=[];
  f.owner.workbench.execute=async input=>{reads.push(input);assert.equal(input.systemId,'s-custom');assert.equal(input.version,8);return {bytesBase64:Buffer.from(files[input.resourceId]).toString('base64'),mimeType:resources.find(r=>r.id===input.resourceId).mimeType};};
  const input={resourceId:'binding-design:d-one',view:'usage',components:['custom-dialog','missing-element']};
  const read=await f.ai.readContext(input,{task}),usage=JSON.parse(read.text);
  assert.deepEqual(usage.componentIndex,['custom-field','custom-dialog']);
  assert.equal(usage.components.length,1);assert.equal(usage.components[0].tag,'custom-dialog');
  assert.equal(usage.components[0].sample.html,'<custom-dialog><p>Actual pinned example</p></custom-dialog>');
  assert.equal(files['examples/components.html'].slice(usage.components[0].sample.offset,usage.components[0].sample.offset+usage.components[0].sample.length),usage.components[0].sample.html);
  assert.deepEqual(usage.tokens,{primary:'#123456'});assert.deepEqual(usage.missingComponents,['missing-element']);
  assert.equal(read.frozen,true);assert.equal(read.readonly,true);assert.equal(Object.keys(read.sourceResources).length,3);
  const alias=await f.ai.readContext({...input,path:'components.json'},{task});assert.equal(alias.text,read.text);
  const virtual=await f.ai.readContext({...input,view:undefined,path:'usage'},{task});assert.equal(virtual.text,read.text);
  const index=await f.ai.readContext({resourceId:input.resourceId,view:'usage'},{task});assert.equal(JSON.parse(index.text).components.length,2);
  const agent={id:'designer-p-one'};f.ai.setTask(agent,task);f.ai.scopedPolicy=async()=>({mode:'read-only',workspaceRoot:'/workspace'});
  const tool=f.ai.scopedTool(agent,'p-one'),native=await tool.execute({action:'system.usage',options:{resourceId:input.resourceId,components:input.components}},{});
  assert.equal(native.text,read.text);assert.deepEqual(JSON.parse(JSON.stringify(native)),native);
  reads.length=0;
  const discovery=await tool.execute({action:'system.index',options:{resourceId:input.resourceId}},{});
  const catalog=JSON.parse(discovery.text);
  assert.equal(discovery.view,'index');
  assert.deepEqual(catalog.components,[{tag:'custom-field'},{tag:'custom-dialog'}]);
  assert.equal(catalog.tokens,undefined);
  assert.deepEqual(reads.map(row=>row.resourceId),['components.json']);
  assert.deepEqual(Object.keys(discovery.sourceResources),['components.json']);
  reads.length=0;
  const later=await tool.execute({action:'system.usage',options:{resourceId:input.resourceId,components:['custom-field'],includeTokens:false}},{});
  assert.equal(JSON.parse(later.text).tokens,undefined);
  assert.equal(JSON.parse(later.text).components[0].tag,'custom-field');
  assert.ok(!reads.some(row=>row.resourceId==='tokens.json'));
  await assert.rejects(f.ai.readContext({...input,includeTokens:'false'},{task}),{code:'INVALID_INPUT'});
  assert.ok(reads.every(r=>r.action==='system.resource.read'&&!['theme.css','components.js'].includes(r.resourceId)));
  const first=await f.ai.readContext({...input,limit:100},{task}),second=await f.ai.readContext({...input,offset:first.nextOffset,limit:12000},{task});
  assert.equal(first.text+second.text,read.text);assert.equal(first.contentHash,second.contentHash);assert.equal(second.nextOffset,null);
  await assert.rejects(f.ai.readContext({...input,resourceId:'binding-design:foreign'},{task}),{code:'REFERENCE_NOT_FOUND'});
  await assert.rejects(tool.execute({action:'system.index',options:{resourceId:'binding-design:foreign'}},{}),{code:'REFERENCE_NOT_FOUND'});
  await assert.rejects(f.ai.readContext({...input,components:'custom-dialog'},{task}),{code:'INVALID_INPUT'});
  await assert.rejects(f.ai.readContext({...input,path:'components.js'},{task}),{code:'INVALID_INPUT'});
  files['components.json']='{"components":[]}';
  await assert.rejects(f.ai.readContext(input,{task}),{code:'REFERENCE_VERSION_CONFLICT'});
  await assert.rejects(tool.execute({action:'system.index',options:{resourceId:input.resourceId}},{}),{code:'REFERENCE_VERSION_CONFLICT'});
});

test('usage discovery preserves legacy systems without a component manifest',async()=>{
  const f=fixture(),task={projectId:'p-one',effectiveBinding:{systemId:'old',version:1,system:{resources:[]}}};
  const read=await f.ai.readContext({resourceId:'binding:old',view:'usage'},{task});
  assert.equal(JSON.parse(read.text).available,false);assert.deepEqual(read.sourceResources,{});
});

test('system source lookup returns literal matching lines and explicitly bounds disjoint matches',()=>{
  const source='Header\r\nvalue(foo)\r\nFooter\r\n';
  const result=systemTextMatches(source,'VALUE(foo)',1);
  assert.equal(result.matchCount,1);assert.equal(result.matches[0].startLine,1);assert.equal(result.matches[0].endLine,3);
  assert.equal(result.matches[0].text,source.slice(0,-1));assert.equal(result.matches[0].offset,0);
  const many=systemTextMatches(('match\nother\n').repeat(60),'match',0);
  assert.equal(many.matchCount,60);assert.equal(many.matches.length,50);assert.equal(many.omittedMatchCount,10);
  assert.throws(()=>systemTextMatches(source,'foo',20),{code:'INVALID_INPUT'});
});

test('admission compares the chosen design identity with stored binding',async()=>{
  const f=fixture(),request=submission({expectedDesignBinding:{designId:'d-one',systemId:'s-one'}});
  await f.ai.prepare(request,{user:true});
  f.setBinding({mode:'none',source:'none',systemId:null,version:null,system:null});
  await assert.rejects(f.ai.prepare(request,{user:true}),{code:'BINDING_CHANGED'});
});
test('a decorative library tag cannot hide unthemed fields on an existing page',async()=>{
  const f=fixture();
  const task={scope:'page',effectiveBinding:{systemId:'s-one',version:1,system:{resources:['theme.css','components.js','components.json'].map(logicalPath=>({logicalPath}))}}};
  f.ai.systemText=async()=>({text:JSON.stringify(desktopComponentManifest)});
  const input={expectedRevision:f.project.revision,html:'<main><ds-tag>状态</ds-tag><button>保存</button><input><select></select></main>'};
  await assert.rejects(f.ai.prepareGeneratedHTML(input,f.project,'d-one',f.project.artboards[0],{agent:{},task}),error=>{
    assert.equal(error.code,'SYSTEM_COMPONENTS_MISSING');
    assert.deepEqual(error.details.components,['ds-button','ds-input','ds-select']);return true;
  });
});

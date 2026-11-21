import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {parse} from '@babel/parser';
import * as sourceState from './source-state.js';
import * as sourceSelection from './source-selection.js';
import {readFrozenSource} from './source-preview.js';
import {requireSavedSourceResult} from './source-result.js';
import {uploadFile} from './upload.js';
import {selectSourceRecord,hydrateSourceForm,sourceViewTransition,sourceResponseCurrent,sourceFormAfterResponse,normalizeWebsiteURL,pinnedSourceBinding,websitePlanInput,websiteDraftKey,websitePreviewReady} from './source-state.js';
const websiteForm={url:'https://example.com',name:'',width:1440,height:900,faithful:true,pagesText:'',statesText:'',regionsText:'',viewportsText:'',captureScope:'page'};
test('website plans normalize HTTP URLs and reject credentials and invalid JSON with field context',()=>{assert.equal(normalizeWebsiteURL(' https://example.com '),'https://example.com/');for(const url of ['','not a website','javascript:alert(1)','ftp://example.com','https://user:pass@example.com'])assert.throws(()=>normalizeWebsiteURL(url),error=>error.code==='SOURCE_FIELD_INVALID'&&error.details.field==='url');assert.throws(()=>websitePlanInput({...websiteForm,statesText:'{'},null),error=>error.details.field==='statesText');assert.throws(()=>websitePlanInput({...websiteForm,width:100},null),error=>error.details.field==='viewportsText');});
test('adaptation freezes a concrete resolved binding and cannot invent an unbound/latest system',()=>{const pin=pinnedSourceBinding({effectiveBinding:{systemId:'s-one',version:4,system:{name:'规范'}}});assert.deepEqual(pin,{systemId:'s-one',version:4,name:'规范'});for(const value of [{systemId:'s-one'},{systemId:'s-one',version:'latest'},{systemId:'s-one',version:4,invalid:true}])assert.equal(pinnedSourceBinding(value),null);assert.throws(()=>websitePlanInput({...websiteForm,faithful:false},null),error=>error.code==='SYSTEM_REQUIRED');const plan=websitePlanInput({...websiteForm,faithful:false},pin);assert.equal(plan.mode,'system-adaptation');assert.equal(plan.systemVersion,4);assert.equal(plan.systemId,'s-one');assert.equal(websitePlanInput(websiteForm,pin).systemId,undefined);});
test('replication requires displayed proof for the exact URL options source version capture and viewport',()=>{const key=websiteDraftKey(websiteForm),preview={draftKey:key,sourceId:'x-one',versionId:'xv-one',captureId:'xc-one',image:'/frozen'};const current={draftKey:key,sourceId:'x-one',versionId:'xv-one',captureId:'xc-one',designId:'d-one',seen:true};assert.equal(websitePreviewReady(preview,current),true);for(const patch of [{seen:false},{sourceId:'x-other'},{versionId:'xv-other'},{captureId:'xc-other'},{draftKey:websiteDraftKey({...websiteForm,url:'https://different.test'})}])assert.equal(websitePreviewReady(preview,{...current,...patch}),false);const pin={systemId:'s-one',version:4};assert.notEqual(websiteDraftKey({...websiteForm,faithful:false},pin),websiteDraftKey({...websiteForm,faithful:false},{...pin,version:5}));});
const source={id:'b',kind:'mastergo',name:'Mobile library',url:'https://mastergo.com/file/b',mode:'system-adaptation',pages:[{id:'page',sourceNodeId:'frame',url:'https://mastergo.com/file/b',selected:true,scope:'regions',regions:[{rect:{x:0,y:0,width:300,height:600}}],states:[{name:'menu',actions:[]}]}],viewports:[{id:'phone',width:390,height:844}],latestVersionId:'v-b'};

test('a new source form never silently selects the first archived source',()=>{
 assert.equal(selectSourceRecord([source]),null);assert.equal(selectSourceRecord([source],'missing'),null);assert.equal(selectSourceRecord([source],'b'),source);
});

test('an explicit source selection hydrates its provider, URL, scope and viewport together',()=>{
 const form=hydrateSourceForm(source);
 assert.equal(form.source,'mastergo');assert.equal(form.url,source.url);assert.equal(form.name,'Mobile library');assert.equal(form.faithful,false);assert.deepEqual(form.selected,['frame']);assert.equal(form.width,390);assert.equal(form.height,844);assert.equal(form.captureScope,'regions');assert.equal(form.versionId,'v-b');assert.match(form.statesText,/menu/);assert.match(form.regionsText,/300/);
});

test('same-source acquisition metadata cannot overwrite form edits made while it waited',()=>{
 const edited={...hydrateSourceForm(source),name:'Unsaved name',url:'https://mastergo.com/file/next',faithful:true};
 assert.equal(sourceFormAfterResponse('b',{...source,name:'Server old name'},edited),edited);
 const next=sourceFormAfterResponse('b',{id:'c',kind:'figma'},edited);
 assert.equal(next.source,'figma');assert.equal(next.name,'');assert.equal(next.url,'');assert.equal(next.versionId,'');assert.deepEqual(next.selected,[]);
});

test('a slow A response cannot select B or change its preview',()=>{
 const a={sourceId:'a',sequence:1},ticket={...a,requestId:7};
 const b=sourceViewTransition(a,'b');
 assert.equal(sourceResponseCurrent(ticket,b,7,'a'),false);assert.equal(sourceResponseCurrent(ticket,b,8,'b'),false);
 assert.equal(sourceResponseCurrent(ticket,a,7,'a'),true);
});

test('new-source adoption is allowed only for the still-current initiating view',()=>{
 const view={sourceId:null,sequence:0},ticket={...view,requestId:1};
 assert.equal(sourceResponseCurrent(ticket,view,1,'created',{createsSource:true}),true);
 assert.equal(sourceResponseCurrent(ticket,sourceViewTransition(view,'other'),2,'created',{createsSource:true}),false);
 assert.equal(sourceResponseCurrent(ticket,view,1,'created'),false);
});

test('switching frozen versions invalidates older requests even for the same source',()=>{
 const view={sourceId:'a',sequence:1},ticket={...view,requestId:1};
 assert.equal(sourceResponseCurrent(ticket,sourceViewTransition(view,'a'),2,'a'),false);
 assert.equal(sourceResponseCurrent(ticket,view,2,'a'),false);
});

// Run real component hooks/effects and real work/chooseSource; only JSX is removed.
function sourcePanelHarness({activePanel=false,beforeWorkspace,failCapture=false,provider='website',onUpload,failConnection=false}={}){
 const text=readFileSync(new URL('./SourcePanel.jsx',import.meta.url),'utf8'),ast=parse(text,{sourceType:'module',plugins:['jsx']}),component=ast.program.body.find(node=>node.type==='FunctionDeclaration'&&node.id?.name==='SourcePanel'),lastReturn=component.body.body.findLast(node=>node.type==='ReturnStatement'),edits=[];
 const walk=node=>{if(!node||typeof node!=='object')return;if(node===lastReturn){edits.push([node.start,node.end,'return {previewWebsite,changeWebsiteSize,work,chooseSource,record,sourceId,websitePhase,websitePreview,error,sourceView,requestSerial,websiteRun,importFile,fileImportPhase,inspectConnection,connection,markPreviewLoaded,replicateWebsite,readyToReplicate,replicaSaved,websiteHistory,navigateWebsite,refreshWebsite,url,websiteFieldError};']);return;}if(['ImportDeclaration','ExportNamedDeclaration'].includes(node.type)){edits.push([node.start,node.end,'']);return;}if(['JSXElement','JSXFragment'].includes(node.type)){edits.push([node.start,node.end,'null']);return;}for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);};walk(ast);let executable=text;for(const [start,end,value]of edits.sort((a,b)=>b[0]-a[0]))executable=executable.slice(0,start)+value+executable.slice(end);
 const cells=[],effects=[];let cursor=0,scheduled=false,renderCount=0,output;const equal=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));const schedule=()=>{if(!scheduled){scheduled=true;queueMicrotask(()=>{scheduled=false;render();});}};
 const React={useRef(value){const id=cursor++;if(!cells[id])cells[id]={current:value};return cells[id];},useState(value){const id=cursor++;if(!cells[id])cells[id]={value:typeof value==='function'?value():value};return [cells[id].value,next=>{const value=typeof next==='function'?next(cells[id].value):next;if(!Object.is(value,cells[id].value)){cells[id].value=value;schedule();}}];},useMemo(factory,deps){const id=cursor++;if(!cells[id]||!equal(cells[id].deps,deps))cells[id]={value:factory(),deps};return cells[id].value;},useEffect(effect,deps){const id=cursor++;if(!cells[id]||!equal(cells[id].deps,deps)){const previous=cells[id];cells[id]={deps,cleanup:previous?.cleanup};effects.push(()=>{previous?.cleanup?.();cells[id].cleanup=effect();});}}};
 const calls=[],record={id:'x-new',kind:'website',name:'IANA',url:'https://www.iana.org/',mode:'faithful',pages:[{id:'xp-new',url:'https://www.iana.org/',selected:true,states:[],regions:[]}],viewports:[{id:'custom',width:1440,height:900}],versions:[]},version={id:'xv-new',captures:[{id:'xc-new',preview:{url:'/api/designer/resource/cap/p-one/imports/i-one/preview.png'}}]};
 let serverRevision=1;
 const missing={url:'https://www.iana.org/missing.css',code:'DOWNLOAD_FAILED',message:'Missing stylesheet'};
 const props={provider,activePanel,project:{id:'p-one',revision:1,workbench:{sourceImports:[]}},design:{id:'d-one',pageIds:[]},viewState:{url:provider==='website'?'https://www.iana.org/':''},legacy:{},onViewState:view=>{props.viewState={...props.viewState,...view};schedule();},api:async(action,args={})=>{
  calls.push({action,args});await Promise.resolve();
  if(action==='binding.resolve')return {systemId:null};
  if(action==='connection.status'){if(failConnection)throw Object.assign(new Error('Status unavailable'),{code:'CONNECTION_FAILED'});return {connections:[{provider:'mastergo',configured:true}]};}
  if(action==='workbench.source.plan'){assert.equal(args.expectedRevision,serverRevision);record.kind=args.kind;record.name=args.name;if(args.url)record.url=args.url;return {source:{...record},projectRevision:++serverRevision};}
  if(action==='workspace.open'){await beforeWorkspace?.(harness);props.project={...props.project,revision:serverRevision,workbench:{sourceImports:[{...record}]}};schedule();return {project:props.project};}
  if(action==='workbench.source.capture'){
   assert.equal(args.expectedRevision,serverRevision);
   if(failCapture==='incomplete'&&!args.allowPartial)throw Object.assign(new Error('Source has missing resources'),{code:'IMPORT_INCOMPLETE',details:{failures:[missing]}});
   if(failCapture===true)throw Object.assign(new Error('Browser connection missing'),{code:'BROWSER_CONNECTION_REQUIRED'});
   if(failCapture==='incomplete')version.captures[0].resourceSummary={styles:{count:0,bytes:0},images:{count:0,bytes:0},fonts:{count:0,bytes:0},total:{count:0,bytes:0},failedCount:1};
   return {source:{...record,latestVersionId:version.id},version,projectRevision:++serverRevision};
  }
  if(action==='workbench.source.replicate')return {projectRevision:++serverRevision,page:{id:'a-copy',websiteCapture:{captureId:args.captureId}}};
  if(action==='workbench.source.import'){assert.equal(args.expectedRevision,serverRevision);return {source:{...record,latestVersionId:version.id},version,projectRevision:++serverRevision};}
  if(action==='workbench.source.read')return args.captureId?{sourceId:record.id,versionId:version.id,capture:{id:'xc-new',preview:version.captures[0].preview,resources:[],failures:failCapture==='incomplete'?[missing]:[]},text:'<p>x</p>',offset:0,total:8,nextOffset:null}:{source:{...record,latestVersionId:version.id},version};
  throw new Error('Unexpected API '+action);
 }};
 props.api.upload=async(file,args)=>{calls.push({action:'upload',args});assert.equal(args.expectedRevision,serverRevision);const projectRevision=++serverRevision;await onUpload?.(harness);return {file:{path:'designs/d-one/assets/qa.html'},projectRevision};};
 const context={React,...sourceState,...sourceSelection,readFrozenSource,requireSavedSourceResult,uploadFile,crypto:webcrypto,location:{origin:'https://designer.test'},window:{addEventListener(){},removeEventListener(){}},queueMicrotask,console,errorValue:(message,code)=>Object.assign(new Error(message),{code})};vm.runInNewContext(executable+'\nglobalThis.component=SourcePanel;',context);
 function render(){if(++renderCount>200)throw new Error('SourcePanel render loop');cursor=0;output=context.component(props);while(effects.length)effects.shift()();}
 const harness={props,calls,get output(){return output;},get renderCount(){return renderCount;},async flush(){for(let index=0;index<20;index++)await Promise.resolve();}};render();return harness;
}
test('an active restored address opens once without Enter',async()=>{
 const panel=sourcePanelHarness({activePanel:true});
 for(let i=0;i<10;i++)await panel.flush();
 assert.equal(panel.output.websitePhase,'ready');
 assert.equal(panel.calls.filter(call=>call.action==='workbench.source.capture').length,1);
});
test('real SourcePanel plan adoption survives parent rerenders and reaches capture and frozen preview',async()=>{const panel=sourcePanelHarness();await panel.flush();await panel.output.previewWebsite();await panel.flush();assert.ok(panel.renderCount>3);assert.equal(panel.output.error,null);assert.equal(panel.output.websitePhase,'ready');assert.equal(panel.output.websitePreview?.captureId,'xc-new');assert.deepEqual(panel.calls.filter(call=>call.action.startsWith('workbench.source.')).map(call=>call.action),['workbench.source.plan','workbench.source.capture','workbench.source.read','workbench.source.read']);});
test('real SourcePanel capture errors remain visible after plan source identity adoption',async()=>{const panel=sourcePanelHarness({failCapture:true});await panel.flush();await panel.output.previewWebsite();await panel.flush();assert.equal(panel.output.websitePreview,null);assert.equal(panel.output.error?.code,'BROWSER_CONNECTION_REQUIRED');assert.equal(panel.output.websitePhase,'failed');});
test('one click submits the displayed partial capture without confirmation or recapture',async()=>{
 const panel=sourcePanelHarness({failCapture:'incomplete'});await panel.flush();
 await panel.output.previewWebsite();await panel.flush();
 const preview=panel.output.websitePreview;
 assert.equal(panel.output.error,null);assert.equal(preview.failures.length,1);
 assert.equal(panel.output.readyToReplicate,false);
 panel.output.markPreviewLoaded(preview);await panel.flush();
 assert.equal(panel.output.readyToReplicate,true);
 await Promise.all([panel.output.replicateWebsite(),panel.output.replicateWebsite()]);await panel.flush();
 assert.equal(panel.output.error,null);assert.equal(panel.output.replicaSaved,true);
 assert.equal(panel.calls.filter(call=>call.action==='workbench.source.capture').length,1);
 assert.equal(panel.calls.some(call=>call.action==='workbench.source.generate'),false);
 const requests=panel.calls.filter(call=>call.action==='workbench.source.replicate');
 assert.equal(requests.length,1);
 const args=requests[0].args;assert.equal(args.sourceId,preview.sourceId);assert.equal(args.versionId,preview.versionId);
 assert.equal(args.captureId,preview.captureId);assert.equal(args.designId,undefined);
});

test('switching to a mobile viewport recaptures the displayed URL and invalidates the prior preview',async()=>{
 const panel=sourcePanelHarness();await panel.flush();await panel.output.previewWebsite();await panel.flush();
 const desktop=panel.output.websitePreview;
 panel.output.markPreviewLoaded(desktop);await panel.flush();
 await panel.output.changeWebsiteSize({width:390,height:844});await panel.flush();
 const mobile=panel.output.websitePreview;
 assert.equal(mobile.width,390);assert.equal(mobile.height,844);
 assert.notEqual(mobile.draftKey,desktop.draftKey);
 assert.equal(panel.calls.filter(call=>call.action==='workbench.source.capture').length,2);
 panel.output.markPreviewLoaded(desktop);await panel.flush();assert.equal(panel.output.readyToReplicate,false);
 panel.output.markPreviewLoaded(mobile);await panel.flush();assert.equal(panel.output.readyToReplicate,true);
});
test('new MasterGo offline upload uses real files plan upload import read with sequential CAS and no official account request',async()=>{const panel=sourcePanelHarness({provider:'mastergo'});await panel.flush();const input={files:[{name:'qa.html',type:'text/html'}],value:'qa.html'};await panel.output.importFile({currentTarget:input});await panel.flush();assert.equal(panel.output.error,null);assert.equal(panel.output.fileImportPhase,'saved');assert.equal(panel.output.record.kind,'files');assert.equal(input.value,'');const writes=panel.calls.filter(call=>['workbench.source.plan','upload','workbench.source.import','workbench.source.read'].includes(call.action));assert.deepEqual(writes.map(call=>call.action),['workbench.source.plan','upload','workbench.source.import','workbench.source.read']);assert.deepEqual(writes.map(call=>call.args.expectedRevision),[1,2,3,4]);assert.equal(writes[0].args.kind,'files');assert.equal(writes[2].args.path,'designs/d-one/assets/qa.html');assert.equal(writes[2].args.allowPartial,false);assert.equal(panel.calls.some(call=>/generate|connection|browser/.test(call.action)),false);});
test('offline upload cannot import into a source chosen while upload is pending',async()=>{const panel=sourcePanelHarness({provider:'mastergo',onUpload:async panel=>{panel.output.chooseSource({id:'x-other',kind:'files',name:'Other',pages:[],viewports:[]},{force:true});await panel.flush();}});await panel.flush();await panel.output.importFile({currentTarget:{files:[{name:'qa.html',type:'text/html'}],value:'qa.html'}});await panel.flush();assert.equal(panel.output.sourceId,'x-other');assert.equal(panel.calls.some(call=>call.action==='workbench.source.import'),false);});
test('MasterGo connection configuration and failures have persistent state after the request',async()=>{for(const failConnection of [false,true]){const panel=sourcePanelHarness({provider:'mastergo',failConnection});await panel.flush();await panel.output.inspectConnection();await panel.flush();assert.equal(panel.output.connection.provider,'mastergo');assert.equal(panel.output.connection.status,failConnection?'failed':'configured');await panel.flush();assert.equal(panel.output.connection.status,failConnection?'failed':'configured');if(failConnection)assert.equal(panel.output.error.code,'CONNECTION_FAILED');}});
test('one operation reporter stays outside collapsed details and one file input is independent of record',()=>{const source=readFileSync(new URL('./SourcePanel.jsx',import.meta.url),'utf8'),ast=parse(source,{sourceType:'module',plugins:['jsx']});let reporters=0,uploads=0;const walk=(node,ancestors=[])=>{if(!node||typeof node!=='object')return;if(node.type==='JSXElement'&&node.openingElement.name?.name==='ErrorBox'){reporters++;assert.equal(ancestors.some(parent=>parent.type==='JSXElement'&&['details','fieldset'].includes(parent.openingElement.name?.name)),false);}if(node.type==='JSXOpeningElement'&&node.name?.name==='input'&&node.attributes.some(attr=>attr.name?.name==='type'&&attr.value?.value==='file'))uploads++;for(const value of Object.values(node))if(Array.isArray(value))value.forEach(child=>walk(child,[...ancestors,node]));else if(value&&typeof value==='object')walk(value,[...ancestors,node]);};walk(ast);assert.equal(reporters,1);assert.equal(uploads,1);});

test('browser-style addresses are normalized before planning while unsupported schemes stay rejected',()=>{
 for(const [address,expected] of [
  ['www.google.com','https://www.google.com/'],
  [' example.com/path?q=design#top ','https://example.com/path?q=design#top'],
  ['//example.com','https://example.com/'],
  ['localhost:3000/page','https://localhost:3000/page'],
  ['127.0.0.1:8080','https://127.0.0.1:8080/'],
  ['[::1]:8080','https://[::1]:8080/'],
  ['http://example.com','http://example.com/'],
 ])assert.equal(normalizeWebsiteURL(address),expected);
 for(const address of ['javascript:123','data:text/html,hello','file:///tmp/page','user:pass@example.com','https://user@example.com']){
  assert.throws(()=>normalizeWebsiteURL(address),error=>error.code==='SOURCE_FIELD_INVALID'&&error.details.field==='url');
 }
});

test('address-bar submission uses the entered value instead of the previous React form value',async()=>{
 const panel=sourcePanelHarness();await panel.flush();
 await panel.output.previewWebsite({address:'www.google.com'});await panel.flush();
 assert.equal(panel.calls.find(call=>call.action==='workbench.source.plan').args.url,'https://www.google.com/');
 assert.equal(panel.output.url,'https://www.google.com/');
 assert.equal(panel.output.websitePhase,'ready');
 assert.equal(panel.output.websiteFieldError,null);
});

test('back, forward and refresh navigate actual URL plans and a new branch drops forward history',async()=>{
 const panel=sourcePanelHarness();await panel.flush();
 const load=async address=>{await panel.output.previewWebsite({address});await panel.flush();};
 await load('example.com/first');await load('example.com/second');
 assert.equal(panel.output.websiteHistory.index,1);
 await panel.output.navigateWebsite(-1);await panel.flush();
 assert.equal(panel.output.url,'https://example.com/first');
 assert.equal(panel.output.websiteHistory.index,0);
 await panel.output.navigateWebsite(1);await panel.flush();
 assert.equal(panel.output.url,'https://example.com/second');
 await panel.output.refreshWebsite();await panel.flush();
 assert.equal(panel.output.websiteHistory.entries.length,2);
 assert.equal(panel.calls.filter(call=>call.action==='workbench.source.capture').length,5);
 await panel.output.navigateWebsite(-1);await panel.flush();
 await load('example.com/third');
 assert.deepEqual(Array.from(panel.output.websiteHistory.entries),['https://example.com/first','https://example.com/third']);
 const count=panel.calls.length;await panel.output.navigateWebsite(1);await panel.flush();assert.equal(panel.calls.length,count);
});

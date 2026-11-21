import test from 'node:test';
import assert from 'node:assert/strict';
import {modelSafe,modelResult} from './model-output.js';

test('optional object values and sparse array slots become explicit JSON data without mutation',()=>{
  const sparse=new Array(3);sparse[1]=undefined;sparse[2]={optional:undefined,keep:null};
  const original={optional:undefined,nested:{optional:undefined},sparse,negativeZero:-0};
  assert.deepEqual(modelSafe(original),{nested:{},sparse:[null,null,{keep:null}],negativeZero:0});
  assert.equal(Object.hasOwn(original,'optional'),true);assert.equal(0 in sparse,false);
  assert.equal(modelSafe(undefined),null);
});

test('all existing private fields, nested binary data and owner capability links stay redacted',()=>{
  const privateKeys=['capability','previewTicket','assetBase','assetRoot','savedHTML','bytesBase64','imageBase64','accessToken','refreshToken','authorization','password','privateKey','passphrase','httpsToken'];
  const privateValues=Object.fromEntries(privateKeys.map(key=>[key,'SECRET']));
  // Filtering occurs before inspection, so even private cyclic/invalid values never escape.
  privateValues.capability=privateValues;privateValues.password=NaN;
  const value=modelSafe({node:{id:'n',slot:'title',instanceId:'card'},tokens:{color:'#123'},nested:[privateValues],image:'data:image/png;base64,SECRET',url:'http://local/api/designer/source-resource/SECRET/project/x',links:['/api/designer/knowledge-resource/SECRET/x','https://local/api/designer/download/SECRET/x']});
  assert.deepEqual(value.nested,[{}]);assert.deepEqual(value.node,{id:'n',slot:'title',instanceId:'card'});assert.deepEqual(value.tokens,{color:'#123'});
  assert.ok(!JSON.stringify(value).includes('SECRET'));assert.equal(value.image,'[binary attachment omitted]');
});

test('invalid non-JSON data fails explicitly without echoing values or invoking serialization hooks',()=>{
  const circular={};circular.self=circular;
  for(const value of [NaN,Infinity,-Infinity,1n,Symbol('SECRET'),()=>{},new Date(),new Map(),Buffer.from('SECRET'),circular]){
    assert.throws(()=>modelSafe({value}),error=>error.code==='INVALID_MODEL_OUTPUT'&&!error.message.includes('SECRET'));
  }
  let calls=0;const accessor={get body(){calls++;throw Error('SECRET');}};
  assert.throws(()=>modelSafe(accessor),{code:'INVALID_MODEL_OUTPUT'});assert.equal(calls,0);
  const privateAccessor={get password(){calls++;throw Error('SECRET');}};
  assert.deepEqual(modelSafe(privateAccessor),{});assert.equal(calls,0);
  assert.throws(()=>modelSafe({toJSON(){calls++;return 'SECRET';}}),{code:'INVALID_MODEL_OUTPUT'});assert.equal(calls,0);
  const array=[];array.extra='SECRET';assert.throws(()=>modelSafe(array),{code:'INVALID_MODEL_OUTPUT'});
  const symbolObject={[Symbol('SECRET')]:'SECRET'};assert.throws(()=>modelSafe(symbolObject),{code:'INVALID_MODEL_OUTPUT'});
});

test('shared values detach independently and special JSON keys do not modify prototypes',()=>{
  const shared={id:'n'};const output=modelSafe({a:shared,b:shared});assert.notEqual(output.a,output.b);assert.notEqual(output.a,shared);
  const special=JSON.parse('{"__proto__":{"safe":true},"constructor":"data"}'),safe=modelSafe(special);
  assert.equal(Object.getPrototypeOf(safe),Object.prototype);assert.deepEqual(safe,special);assert.equal({}.safe,undefined);
});

test('bounded edit/commit receipts retain the committed artboard, versions and save warnings',()=>{
  const page={id:'page-1',revision:4},warning={code:'VERSION_CONFLICT',message:'Receipt metadata changed'};
  const input={action:'artboard.commit',nodeOffset:1,nodeLimit:1};
  const original={projectRevision:12,page,file:{id:'file-1'},version:'fs-4',saved:true,previewStatus:'pending',receiptWarning:warning,document:{html:'PRIVATE LARGE HTML',nodes:{a:{id:'a'},b:{id:'b',text:'x'.repeat(200)},c:{id:'c'}},diagnostics:[]}};
  const result=modelResult(original,input);
  assert.deepEqual(result.artboard,page);assert.deepEqual(result.page,page);assert.equal(result.projectRevision,12);assert.deepEqual(result.receiptWarning,warning);assert.equal(result.version,'fs-4');assert.equal(result.saved,true);
  assert.equal(result.nodes.length,1);assert.equal(result.nodes[0].text.length,160);assert.equal(result.nodes[0].textTruncated,true);assert.equal(result.nodeTotal,3);assert.equal(result.nextNodeOffset,2);assert.equal(result.more.fileId,'file-1');assert.equal(result.document,undefined);
  assert.ok(!JSON.stringify(result).includes('PRIVATE LARGE HTML'));assert.equal(original.document.nodes.b.text.length,200);
  assert.deepEqual(modelResult({ok:true,optional:undefined},{action:'task.get'}),{ok:true});
});

test('compact native receipts deduplicate file reads and omit full projects after saves',()=>{
  const file={text:'same source',content:'same source',version:'v1'};
  assert.deepEqual(modelResult(file,{action:'file.read'},{compact:true}),{text:'same source',version:'v1'});
  assert.deepEqual(modelResult(file,{action:'file.read'}),file);
  assert.equal(modelResult(file,{action:'context.read'},{compact:true}).content,undefined);
  const value={saved:true,project:{id:'p-one',revision:8,history:[{large:'history'}],audit:['large'],workbench:{designs:[],files:[],sourceProjects:[]}}};
  const receipt=modelResult(value,{action:'file.write'},{compact:true});
  assert.equal(receipt.project,undefined);assert.equal(receipt.projectRevision,8);assert.equal(receipt.saved,true);
  const read=modelResult(value,{action:'project.get'},{compact:true});
  assert.equal(read.project.history,undefined);assert.equal(read.project.audit,undefined);assert.equal(read.project.historyTotal,1);
  assert.deepEqual(modelResult(value,{action:'file.write'}),value);
});

test('compact editor reads paginate source and keep scene definitions while writes return no nodes by default',()=>{
  const value={saved:true,projectRevision:8,page:{id:'a-one'},file:{id:'f-one'},version:'v1',document:{html:'0123456789',nodes:{a:{id:'a',tag:'button',attributes:{id:'save',d:'large svg'},text:'Save'}},scenes:{items:[{id:'detail'}]},interactions:{items:[{id:'open'}]}}};
  const write=modelResult(value,{action:'edit.apply'},{compact:true});
  assert.deepEqual(write.nodes,[]);assert.equal(write.nodeTotal,1);assert.equal(write.version,'v1');
  const read=modelResult(value,{action:'edit.read'},{compact:true});
  assert.equal(read.nodes[0].attributes,undefined);assert.equal(read.nodes[0].htmlId,'save');assert.deepEqual(read.scenes,value.document.scenes);
  const detail=modelResult(value,{action:'edit.read',nodeIds:['a']},{compact:true});
  assert.equal(detail.nodes[0].attributes.d,'large svg');
  const source=modelResult(value,{action:'edit.read',view:'source',offset:2,limit:3},{compact:true});
  assert.equal(source.text,'234');assert.equal(source.nextOffset,5);assert.equal(source.total,10);
});

test('node queries locate literal identities and leaf content with filtered continuation',()=>{
  const nodes={root:{id:'root',tag:'main',childIds:['a','b'],text:'Save .[x]'},a:{id:'a',tag:'button',attributes:{id:'save-button'},childIds:[],text:'Save'},b:{id:'b',tag:'span',childIds:[],text:'.[x]'}};
  const value={page:{id:'page'},document:{nodes,scenes:{items:[{id:'default'}]},interactions:[]}};
  const literal=modelResult(value,{action:'edit.read',query:'.[x]'},{compact:true});
  assert.deepEqual(literal.nodes.map(node=>node.id),['b']);
  const result=modelResult(value,{action:'edit.read',query:'SAVE',nodeLimit:1},{compact:true});
  assert.deepEqual(result.nodes.map(node=>node.id),['a']);
  assert.equal(result.more.query,'SAVE');
  assert.equal(modelResult(value,{action:'edit.read',query:'missing'},{compact:true}).nodeTotal,0);
  assert.equal(modelResult(value,{action:'edit.read',query:'save',nodeIds:['b']},{compact:true}).nodeTotal,0);
  assert.equal(modelResult(value,{action:'edit.read'},{compact:true}).nodeTotal,3);
  assert.deepEqual(result.scenes,value.document.scenes);
});

test('compiled artifacts and their build history stay out of default project, artboard and layout replies', () => {
  const options = {compact:true};
  const page = {id:'page',revision:3,viewport:{width:800,height:600},artifact:{
    kind:'schema',entry:'page.design.json',sourceHash:'sha',buildId:'build',sourceMap:{node:'SOURCE_MAP_PAYLOAD'},
    history:{entries:[{binding:'OLD_BINDING_PAYLOAD'}]},
  }};
  const files = [{id:'file',path:'registry-path'}];
  const history = Array.from({length:15},(_,i) => ({id:String(i)}));
  const project = {id:'project',revision:4,artboards:[page],workbench:{files},history};
  const value = {project,artboards:[page],history};
  const read = modelResult(value,{action:'project.get',historyOffset:10},options);
  assert.deepEqual(read.history,history.slice(10));
  assert.equal(read.historyTotal,15);
  assert.equal(read.project.workbench.fileCount,1);
  assert.equal(read.project.workbench.filesRequest.action,'file.tree');
  assert.equal(read.artboards[0].artifact.entry,'page.design.json');
  const full = modelResult(value,{action:'project.get',view:'full'},options);
  assert.deepEqual(full.project.workbench.files,files);
  const html = '<html>compiled marker</html>';
  const board = {artboard:page,html,projectRevision:4};
  const summary = modelResult(board,{action:'artboard.get'},options);
  assert.deepEqual(summary.renderedSource,{action:'edit.read',pageId:'page',view:'source'});
  assert.deepEqual(modelResult(board,{action:'artboard.get',view:'full'},options),board);
  assert.equal(modelResult(board,{action:'artboard.get',view:'source',offset:6,limit:8},options).text,'compiled');
  const layout = modelResult({project,artboard:page,projectRevision:4},{action:'artboard.layout'},options);
  assert.deepEqual(layout.artboard.viewport,page.viewport);
  assert.equal(layout.projectRevision,4);
  assert.doesNotMatch(JSON.stringify([summary,layout,read]),/SOURCE_MAP_PAYLOAD|OLD_BINDING_PAYLOAD|registry-path|compiled marker/);
  const legacy = {...board,artboard:{id:'old-html'}};
  assert.deepEqual(modelResult(legacy,{action:'artboard.get'},options),legacy);
  const starter = {...board,artboard:{id:'fresh',revision:1,initialTemplateHash:'signed',contentHash:'signed'}};
  const initial = modelResult(starter,{action:'artboard.get'},options);
  assert.equal(initial.status,'initial-page');
  assert.equal(initial.html,undefined);
  assert.deepEqual(modelResult(starter,{action:'artboard.get',view:'full'},options),starter);
  assert.equal(modelResult(starter,{action:'artboard.get',view:'source',offset:6,limit:8},options).text,'compiled');
  const edited = {...starter,artboard:{...starter.artboard,contentHash:'edited'}};
  assert.deepEqual(modelResult(edited,{action:'artboard.get'},options),edited);
});

test('native editor excerpts locate literals, retain exact source paging and support repeated matches', () => {
  const html = '<h1>Office</h1><button>Save</button><label>Save</label>';
  const value = {page:{id:'p',revision:2},document:{html}};
  const read = input => modelResult(value,{action:'edit.read',view:'source',...input},{compact:true});
  const first = read({query:'Save',limit:10});
  assert.equal(first.matchOffset,html.indexOf('Save'));
  assert.equal(first.text,html.slice(first.offset,first.offset+10));
  const second = read({query:'Save',offset:first.nextMatchOffset,limit:8});
  assert.equal(second.matchOffset,html.lastIndexOf('Save'));
  assert.equal(second.nextMatchOffset,null);
  const missing = read({query:'save'});
  assert.equal(missing.matchOffset,null);
  assert.equal(missing.text,'');
  const whole = read({limit:12000});
  assert.equal(whole.text,html);
  assert.equal(whole.nextOffset,null);
});

test('the bound usage rule keeps its original text, hash and pagination alongside native workflow guidance', () => {
  const value={path:'rule.md',frozen:true,systemId:'s-one',text:'Copy this pattern. Use midnight blue.',contentHash:'pinned-hash',offset:0,nextOffset:36};
  const result=modelResult(value,{action:'context.read'},{compact:true});
  assert.match(result.hostWorkflow,/designer_commit_html/);
  assert.match(result.hostWorkflow,/only needed if the user requests/);
  const {hostWorkflow,...resource}=result;
  assert.deepEqual(resource,value);
  assert.equal(modelResult(value,{action:'context.read'}).hostWorkflow,undefined);
  assert.equal(modelResult({...value,systemId:undefined},{action:'context.read'},{compact:true}).hostWorkflow,undefined);
});

test('compact batch capture receipts preserve failures and render evidence with full manifest discovery',()=>{
  const metadata={captureId:'c1',pageId:'p1',pageRevision:2,sourceHtmlHash:'render-hash',savedSourceHash:'saved-hash',fontStatus:'loaded',imageFailures:1,runtime:{present:true,scene:'error'},boundsVersion:{sourceHash:'saved-hash'}};
  const value={complete:false,captures:[{scene:'error',export:{id:'e1',manifestHash:'manifest'},capture:{format:'png',width:1280,height:800,metadata,warnings:[{code:'IMAGE_FAILED'}]}}],failedIndex:1,error:{code:'CAPTURE_FAILED'},projectRevision:4};
  const result=modelResult(value,{action:'export.create'},{compact:true});
  assert.equal(result.complete,false);assert.equal(result.failedIndex,1);assert.deepEqual(result.error,value.error);
  assert.equal(result.captures[0].capture.metadata.imageFailures,1);
  assert.equal(result.captures[0].capture.metadata.sourceHtmlHash,'render-hash');
  assert.deepEqual(result.captures[0].capture.warnings,value.captures[0].capture.warnings);
  assert.deepEqual(result.captures[0].details,{action:'export.get',exportId:'e1'});
  assert.equal(result.captures[0].capture.metadata.boundsVersion,undefined);
  assert.deepEqual(modelResult(value,{action:'export.create'}),value);
  assert.deepEqual(modelResult(value,{action:'export.get'},{compact:true}),value);
});

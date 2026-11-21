import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild-wasm';

const require=createRequire(import.meta.url),React=require('react');
const bundle=await build({entryPoints:[new URL('./KnowledgeFiles.jsx',import.meta.url).pathname],bundle:true,write:false,format:'cjs',platform:'node',external:['react'],plugins:[{name:'knowledge-files-test',setup(build){
 build.onLoad({filter:/\/common\.jsx$/},()=>({contents:'export function Button(){};export function Modal(){};export function FieldError(){};export const useDownload=()=>async()=>{};'}));
 build.onLoad({filter:/\/KnowledgeDocumentView\.jsx$/},()=>({contents:'export default function KnowledgeDocumentView(){}'}));
}}]});
function nodes(element){return React.isValidElement(element)?[element,...React.Children.toArray(element.props.children).flatMap(nodes)]:[];}
function fixture(){
 const slots=[],calls=[],retained=new Map();let cursor=0,serial=0;
 let knowledge={id:'k-test',revision:3,documents:[{id:'d-one',name:'one.md',relativePath:'docs/one.md',sha256:'a'.repeat(64),mimeType:'text/plain',bytes:5},{id:'d-two',name:'two.md',relativePath:'docs/two.md',sha256:'b'.repeat(64),mimeType:'text/plain',bytes:5}]};
 for(const doc of knowledge.documents)retained.set(doc.id,doc);
 const react={...React,useState(initial){const index=cursor++;if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;return[slots[index],next=>{slots[index]=typeof next==='function'?next(slots[index]):next;}];},useRef(initial){const index=cursor++;if(!(index in slots))slots[index]={current:initial};return slots[index];},useMemo:fn=>fn(),useEffect(){},useImperativeHandle(ref,factory){if(ref)ref.current=factory();}};
 const module={exports:{}};
 new Function('require','module','exports',bundle.outputFiles[0].text)(name=>name==='react'?react:require(name),module,module.exports);
 const ref={current:null},NativeFileTree=()=>null;
 const api=async(action,args)=>{
  calls.push({action,args:structuredClone(args)});
  if(action==='knowledge.get')return{knowledge};
  assert.equal(args.expectedRevision,knowledge.revision);
  if(action==='knowledge.document.copy'){
   const documents=args.files.map(file=>({...retained.get(file.documentId),id:'d-copy-'+(++serial),name:file.relativePath.split('/').pop(),relativePath:file.relativePath}));
   for(const doc of documents)retained.set(doc.id,doc);
   knowledge={...knowledge,revision:knowledge.revision+1,documents:[...knowledge.documents,...documents]};return{knowledge,documents};
  }
  if(action==='knowledge.document.remove'){
   const removed=knowledge.documents.filter(doc=>args.documentIds.includes(doc.id));
   knowledge={...knowledge,revision:knowledge.revision+1,documents:knowledge.documents.filter(doc=>!args.documentIds.includes(doc.id))};return{knowledge,removed};
  }
  if(action==='knowledge.document.move'){
   knowledge={...knowledge,revision:knowledge.revision+1,documents:knowledge.documents.map(doc=>{const target=args.files.find(file=>file.documentId===doc.id);return target?{...doc,relativePath:target.relativePath,name:target.relativePath.split('/').pop()}:doc;})};return{knowledge};
  }
  throw new Error(action);
 };
 const render=()=>{cursor=0;return module.exports.default.render({api,knowledge,query:'',onChanged:value=>{knowledge=value.knowledge;},onRefresh:async()=>{},NativeFileTree},ref);};
 const find=predicate=>{const found=nodes(render()).find(predicate);assert.ok(found,'Expected file manager control');return found;};
 const root=()=>find(node=>node.props['aria-label']==='知识库文件树');
 const native=()=>find(node=>node.type===NativeFileTree).props;
 const button=label=>find(node=>node.props.children===label);
 const event=extra=>({target:{closest:()=>null},preventDefault(){},stopPropagation(){},...extra});
 const clipboard=new Map(),clipboardData={files:[],setData:(type,value)=>clipboard.set(type,value),getData:type=>clipboard.get(type)||''};
 return{calls,find,render,native,ref,get knowledge(){return knowledge;},async flush(){await new Promise(setImmediate);render();},
  copy(cut=false){root().props[cut?'onCut':'onCopy'](event({clipboardData}));},paste(){root().props.onPaste(event({clipboardData}));},
  key(key){root().props.onKeyDown(event({key}));},submit(){find(node=>node.type==='form').props.onSubmit(event());},click:label=>button(label).props.onClick(),
 };
}

test('tree copy/paste shortcuts use native file identities and select the newly created copy',async()=>{
 const f=fixture();f.copy();f.paste();await f.flush();
 const copy=f.calls.find(call=>call.action==='knowledge.document.copy');
 assert.equal(copy.args.sourceKnowledgeId,'k-test');
 assert.equal(copy.args.files[0].relativePath,'docs/one (2).md');
 assert.equal(f.native().current,'docs/one (2).md#d-copy-1');
 assert.equal(f.knowledge.documents.length,3);
});

test('tree cut/paste moves into the selected folder and cannot replay a consumed cut',async()=>{
 const f=fixture();f.copy(true);f.native().onToggle({path:'archive',meta:{kind:'directory'}},true);f.paste();await f.flush();
 const move=f.calls.find(call=>call.action==='knowledge.document.move');
 assert.equal(move.args.files[0].relativePath,'archive/one.md');
 f.paste();await f.flush();assert.equal(f.calls.filter(call=>call.action==='knowledge.document.move').length,1);
});

test('Delete confirms selection and undo restores the original directory instead of duplicating its root',async()=>{
 const f=fixture();f.key('Delete');f.submit();await f.flush();
 assert.equal(f.knowledge.documents.length,1);
 f.click('撤销删除');await f.flush();
 const restored=f.calls.find(call=>call.action==='knowledge.document.copy');
 assert.equal(restored.args.files[0].relativePath,'docs/one.md');
 assert.equal(f.knowledge.documents.length,2);
 assert.equal(f.native().current,'docs/one.md#d-copy-1');
});

test('F2 saves the changed relative path through the move API',async()=>{
 const f=fixture();f.key('F2');
 f.find(node=>node.type==='input'&&node.props.required).props.onChange({target:{value:'archive/renamed.md'}});
 f.submit();await f.flush();
 assert.equal(f.calls.find(call=>call.action==='knowledge.document.move').args.files[0].relativePath,'archive/renamed.md');
});

test('file navigation asks to resolve a dirty editor and preserves the draft when continuing to edit',()=>{
 const f=fixture();
 const editor=f.find(node=>typeof node.props.onWrite==='function').ref;
 let discarded=false;editor.current={isDirty:()=>true,discard:()=>{discarded=true;}};
 f.native().onOpen(f.native().entries.find(entry=>entry.meta.documentId==='d-two'));
 assert.ok(f.find(node=>node.props.title==='保存当前文件'));
 f.click('继续编辑');
 assert.equal(discarded,false);assert.equal(f.calls.length,0);
 assert.equal(f.native().current,'docs/one.md#d-one');
});

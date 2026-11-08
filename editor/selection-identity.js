/** Self-contained: frameDocument serializes this factory into the opaque frame. */
export function createSelectionIdentity(config={},environment={}){
  const document=environment.document||globalThis.document;
  const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
  const artifact=config.artifact,kind=artifact?.kind||(!artifact?'html':null),framework=kind==='react'||kind==='vue';
  const relativePath=value=>typeof value==='string'&&value.length>0&&value.length<=2048&&!/[\\\x00-\x1f?#%<>"'`]/.test(value)&&!value.startsWith('/')&&!/^[A-Za-z][\w+.-]*:/.test(value)&&value.split('/').every(part=>part&&part!=='.'&&part!=='..');
  const version=value=>typeof value==='string'&&value.length>0&&value.length<=256||typeof value==='number'&&Number.isFinite(value);
  const validArtifact=(!artifact||own(artifact,'kind'))&&(kind==='html'||framework&&['kind','entry','version','buildId','manifest'].every(key=>own(artifact,key))&&relativePath(artifact.entry)&&version(artifact.version)&&typeof artifact.buildId==='string'&&artifact.buildId.length>0&&artifact.buildId.length<=256&&Array.isArray(artifact.manifest));
  const manifest=new Map(),seen=new Set();
  if(framework&&validArtifact)for(const item of artifact.manifest){
    if(!item||!own(item,'id')||typeof item.id!=='string'||!/^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/.test(item.id))continue;
    if(seen.has(item.id)){manifest.delete(item.id);continue;}seen.add(item.id);
    if(!['native','path','tag','start','end','line','column','sourceHash'].every(key=>own(item,key))||item.native!==true||!relativePath(item.path)||typeof item.tag!=='string'||!/^[A-Za-z][\w:.-]*$/.test(item.tag)||!Number.isSafeInteger(item.start)||!Number.isSafeInteger(item.end)||item.start<0||item.end<=item.start||!Number.isSafeInteger(item.line)||item.line<1||!Number.isSafeInteger(item.column)||item.column<1||typeof item.sourceHash!=='string'||!/^[a-fA-F0-9]{64}$/.test(item.sourceHash))continue;
    manifest.set(item.id,Object.freeze({id:item.id,path:item.path,tag:item.tag,start:item.start,end:item.end,line:item.line,column:item.column,sourceHash:item.sourceHash,native:true,...(typeof item.elementHash==='string'&&/^[a-fA-F0-9]{64}$/.test(item.elementHash)?{elementHash:item.elementHash}:{})}));
  }
  const crypto=environment.crypto||globalThis.crypto;
  const epoch=environment.documentEpoch||'doc-'+(crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
  const instances=new WeakMap(),lastSnapshots=new WeakMap(),snapshots=new Map();let sequence=0,readSequence=0,renderEpoch=0,sceneId=null,snapshotBytes=0;
  const artifactSummary=artifact?Object.freeze({kind,entry:artifact.entry,version:artifact.version,buildId:artifact.buildId}):{kind:'html'};
  const context=()=>({documentEpoch:epoch,renderEpoch,sceneId,artifact:{...artifactSummary}});
  function identify(node){
    if(!validArtifact||!node?.getAttribute||node.isConnected===false)return null;
    if(!framework){const id=node.getAttribute('data-dsh-node');return typeof id==='string'&&/^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/.test(id)?{id,nodeId:id,...context()}:null;}
    const sourceNodeId=node.getAttribute('data-dsh-source'),source=manifest.get(sourceNodeId);
    if(!source||source.tag.toLowerCase()!==node.tagName?.toLowerCase())return null;
    let record=instances.get(node);
    if(!record||record.sourceNodeId!==sourceNodeId){record={instanceId:'i-'+epoch+'-'+(++sequence).toString(36),sourceNodeId};instances.set(node,record);}
    if(node.getAttribute('data-dsh-instance')!==record.instanceId)node.setAttribute('data-dsh-instance',record.instanceId);
    return {id:record.instanceId,nodeId:record.instanceId,instanceId:record.instanceId,sourceNodeId,sourceLocator:{...source},...context()};
  }
  const all=()=>Array.from(document.querySelectorAll(framework?'[data-dsh-source]':'[data-dsh-node]')).filter(node=>identify(node));
  function nodeFor(id){if(typeof id!=='string')return null;let found=null;for(const node of all())if(identify(node).nodeId===id){if(found)return null;found=node;}return found;}
  function parent(node){for(let current=node?.parentElement;current;current=current.parentElement)if(identify(current))return current;return null;}
  function sourceInstanceCount(sourceNodeId){const source=manifest.get(sourceNodeId);if(!framework||!source)return 0;return Array.from(document.querySelectorAll('[data-dsh-source]')).filter(node=>node.isConnected!==false&&node.getAttribute('data-dsh-source')===sourceNodeId&&node.tagName?.toLowerCase()===source.tag.toLowerCase()).length;}
  const bytes=value=>{let count=0;for(const char of value){const code=char.codePointAt(0);count+=code<=0x7f?1:code<=0x7ff?2:code<=0xffff?3:4;}return count;};
  function snapshot(node,identity=identify(node),html=String(node?.outerHTML||''),totalBytes=bytes(html)){
    const current=context(),prior=snapshots.get(lastSnapshots.get(node));
    if(prior&&prior.html===html&&prior.nodeId===(identity?.nodeId||null)&&prior.renderEpoch===current.renderEpoch&&prior.sceneId===current.sceneId){snapshots.delete(prior.readId);snapshots.set(prior.readId,prior);return prior;}
    const readId='element-'+epoch+'-'+(++readSequence).toString(36);
    const record={html,total:html.length,totalBytes,readId,nodeId:identity?.nodeId||null,sourceNodeId:identity?.sourceNodeId||null,...current};
    snapshots.set(readId,record);lastSnapshots.set(node,readId);snapshotBytes+=totalBytes;
    // Keep the newest complete snapshot even when one element exceeds the budget.
    while(snapshots.size>1&&(snapshots.size>8||snapshotBytes>32*1024*1024)){const first=snapshots.keys().next().value;snapshotBytes-=snapshots.get(first).totalBytes;snapshots.delete(first);}
    return record;
  }
  function element(node,identity=identify(node)){
    const html=String(node?.outerHTML||''),totalBytes=bytes(html),truncated=totalBytes>256*1024;
    const record=truncated?snapshot(node,identity,html,totalBytes):null;
    return {outerHTML:truncated?html.slice(0,65536):html,outerHTMLTotal:html.length,outerHTMLTotalBytes:totalBytes,outerHTMLTruncated:truncated,outerHTMLUnit:'utf16',...(record?{elementReadId:record.readId}:{})};
  }
  function readElement(args={}){
    const offset=args.offset??0,limit=args.limit??65536;
    if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>262144)throw new Error('Invalid element.read range; offsets use UTF-16 code units and limit is at most 262144');
    if(args.documentEpoch!==undefined&&args.documentEpoch!==epoch)throw new Error('Element belongs to a different document epoch');
    let record;
    if(args.readId!==undefined){record=snapshots.get(args.readId);if(!record)throw new Error('Element snapshot expired; describe the element again');if(args.nodeId!==undefined&&args.nodeId!==record.nodeId)throw new Error('Element snapshot identity mismatch');}
    else{if(offset!==0)throw new Error('Use the readId from the first element.read page');const node=nodeFor(args.nodeId);if(!node)throw new Error('Mapped element is no longer available');record=snapshot(node);}
    if(offset>record.total)throw new Error('Element offset exceeds snapshot length');
    snapshots.delete(record.readId);snapshots.set(record.readId,record);
    const content=record.html.slice(offset,offset+limit),endOffset=offset+content.length,done=endOffset===record.total;
    return {readId:record.readId,nodeId:record.nodeId,sourceNodeId:record.sourceNodeId,documentEpoch:record.documentEpoch,renderEpoch:record.renderEpoch,sceneId:record.sceneId,artifact:{...record.artifact},content,offset,endOffset,nextOffset:done?null:endOffset,total:record.total,totalBytes:record.totalBytes,unit:'utf16',truncated:!done,done};
  }
  return {identify,all,nodeFor,parent,sourceInstanceCount,context,element,readElement,advanceRender(){renderEpoch++;},setScene(value){sceneId=typeof value==='string'?value.slice(0,256):null;}};
}

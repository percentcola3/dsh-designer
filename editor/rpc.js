export const FRAME_CHANNEL='dsh-workbench-frame';
export const VIEW_COMMANDS=new Set(['reference.measure','freeze','patchSource','captureState','captureScreenshotState','snapGuides','previewPosition','hitTest','measure','boxSelect','parent','scroll','restoreScroll','locate','mode','reset','state','element.read','source.instances']);
const eventKinds=new Set(['canvasWheel','toggleFreeze','screenshot','pageActive','ready','scroll','layout','diagnostic','navigate','exitPreview']);
export const frameError=(code,message)=>Object.assign(new Error(message),{code});
export const lifecycleError=error=>['FRAME_CLOSED','FRAME_RELOADED'].includes(error?.code);
export function authenticatedPacket(event,{source,token,pageId}){const packet=event?.data;if(!source||event.source!==source||packet?.channel!==FRAME_CHANNEL||packet.token!==token||packet.pageId!==pageId)return null;if(packet.kind==='response'&&typeof packet.requestId==='string'||eventKinds.has(packet.kind))return packet;return null}
export const MAX_ELEMENT_BYTES=2*1024*1024;
const elementBytes=value=>new TextEncoder().encode(value).byteLength;
/** Restore one immutable element snapshot, never treating a prefix as complete context. */
export async function readCompleteElement(request,object,{maxBytes=MAX_ELEMENT_BYTES,limit=65536}={}){
 if(!object)return object;
 const tooLarge=()=>frameError('ELEMENT_TOO_LARGE',`单个元素超过 ${Math.floor(maxBytes/1024)} KiB，请选择更小的子元素后重试。`);
 if(Number(object.outerHTMLTotalBytes)>maxBytes)throw tooLarge();
 if(!object.outerHTMLTruncated){
  if(typeof object.outerHTML!=='string')throw frameError('ELEMENT_CONTEXT_MISSING','页面未返回完整元素，请重新选择后重试。');
  if(elementBytes(object.outerHTML)>maxBytes)throw tooLarge();
  if(object.outerHTMLTotal!==undefined&&object.outerHTMLTotal!==object.outerHTML.length)throw frameError('ELEMENT_READ_INCOMPLETE','元素正文长度不完整，请重新选择后重试。');
  return {...object,outerHTMLTotal:object.outerHTML.length,outerHTMLTotalBytes:elementBytes(object.outerHTML),outerHTMLTruncated:false};
 }
 if(typeof object.elementReadId!=='string'||!object.elementReadId)throw frameError('ELEMENT_READ_UNAVAILABLE','大元素缺少冻结快照，无法读取完整正文，请重新选择。');
 const nodeId=object.nodeId||object.id,chunks=[];let offset=0,total=null,totalBytes=null,bytes=0;
 while(total===null||offset<total){
  const chunk=await request('element.read',{readId:object.elementReadId,nodeId,documentEpoch:object.documentEpoch,offset,limit});
  if(!chunk||chunk.readId!==object.elementReadId||chunk.nodeId!==nodeId||chunk.offset!==offset||chunk.unit!=='utf16'||typeof chunk.content!=='string'||!Number.isSafeInteger(chunk.total)||chunk.total<0||!Number.isSafeInteger(chunk.totalBytes)||chunk.totalBytes<0)throw frameError('ELEMENT_READ_INVALID','元素分段回执不完整，请重新选择后重试。');
  if(['documentEpoch','renderEpoch','sceneId','sourceNodeId'].some(key=>object[key]!==undefined&&chunk[key]!==object[key])||object.artifact&&['kind','entry','version','buildId'].some(key=>chunk.artifact?.[key]!==object.artifact[key]))throw frameError('ELEMENT_IDENTITY_CHANGED','元素快照与选区身份不匹配，请重新选择。');
  if(total!==null&&(total!==chunk.total||totalBytes!==chunk.totalBytes))throw frameError('ELEMENT_READ_CHANGED','元素冻结快照在读取期间改变，请重新选择。');
  total=chunk.total;totalBytes=chunk.totalBytes;if(totalBytes>maxBytes||total>maxBytes)throw tooLarge();
  const next=offset+chunk.content.length;
  if(next>total||next===offset&&next<total||chunk.nextOffset!==(next<total?next:null)||chunk.done!==(next===total))throw frameError('ELEMENT_READ_INCOMPLETE','元素分段有缺失或重叠，未发送不完整正文。');
  chunks.push(chunk.content);bytes+=elementBytes(chunk.content);if(bytes>maxBytes+chunks.length*4)throw tooLarge();offset=next;
 }
 const outerHTML=chunks.join(''),actualBytes=elementBytes(outerHTML);
 if(actualBytes>maxBytes)throw tooLarge();
 if(actualBytes!==totalBytes||object.outerHTMLTotal!==undefined&&object.outerHTMLTotal!==total||object.outerHTMLTotalBytes!==undefined&&object.outerHTMLTotalBytes!==totalBytes)throw frameError('ELEMENT_READ_INCOMPLETE','元素完整正文的长度校验失败，请重新选择。');
 return {...object,outerHTML,outerHTMLTotal:total,outerHTMLTotalBytes:totalBytes,outerHTMLTruncated:false,outerHTMLUnit:'utf16'};
}
export async function readCompleteElements(request,objects,options){const result=[];for(const object of objects||[])result.push(await readCompleteElement(request,object,options));return result;}

export async function readSourceInstances(request,sourceNodeIds,{documentEpoch,artifact}={}){
 const ids=[...new Set(sourceNodeIds||[])];if(!ids.length)return {objects:[],missingSourceNodeIds:[]};
 const result=await request('source.instances',{sourceNodeIds:ids,offset:0,limit:200,documentEpoch,artifact});
 if(!result||!Array.isArray(result.objects)||!Number.isSafeInteger(result.total)||result.total<0||result.offset!==0)throw frameError('SOURCE_INSTANCES_INVALID','源码实例查询回执不完整，请重新选择。');
 if(result.truncated||!result.done||result.nextOffset!==null||result.total>200)throw frameError('SOURCE_INSTANCE_LIMIT','此源码节点渲染了超过 200 个实例，请在画布中重新选择明确实例。');
 if(result.objects.length!==result.total||documentEpoch!==undefined&&result.documentEpoch!==documentEpoch||artifact&&['kind','entry','version','buildId'].some(key=>result.artifact?.[key]!==artifact[key]))throw frameError('ELEMENT_IDENTITY_CHANGED','源码实例查询期间构建已改变，请重新选择。');
 if(result.objects.some(object=>!ids.includes(object.sourceNodeId)||object.documentEpoch!==result.documentEpoch))throw frameError('SOURCE_INSTANCES_INVALID','源码实例查询包含不匹配的对象，未恢复选区。');
 return {...result,objects:await readCompleteElements(request,result.objects)};
}

/** Correlation for read-only iframe view requests. Generated content cannot submit edits. */
export class FrameSession {
  constructor({token,pageId,getWindow,onEvent=()=>{},timeout=8000,setTimer=(fn,delay)=>globalThis.setTimeout(fn,delay),clearTimer=timer=>globalThis.clearTimeout(timer)}){this.token=token;this.pageId=pageId;this.getWindow=getWindow;this.onEvent=onEvent;this.timeout=timeout;this.setTimer=setTimer;this.clearTimer=clearTimer;this.pending=new Map();this.waiters=new Set();this.sequence=0;this.ready=false;this.closed=false;}
  whenReady(){if(this.closed)return Promise.reject(frameError('FRAME_CLOSED','页面已关闭。'));if(this.ready)return Promise.resolve();return new Promise((resolve,reject)=>{const waiter={resolve,reject};waiter.timer=this.setTimer(()=>{this.waiters.delete(waiter);reject(frameError('FRAME_READY_TIMEOUT','页面尚未完成加载，请检查预览诊断。'))},this.timeout);this.waiters.add(waiter)})}
  async request(command,args={}){if(!VIEW_COMMANDS.has(command))throw frameError('FRAME_COMMAND_DENIED','页面桥只接受读取与临时视图命令。');await this.whenReady();if(this.closed)throw frameError('FRAME_CLOSED','页面已关闭。');return new Promise((resolve,reject)=>{const requestId=String(++this.sequence),timer=this.setTimer(()=>{this.pending.delete(requestId);reject(frameError('FRAME_REQUEST_TIMEOUT','页面视图操作超时。'))},this.timeout);this.pending.set(requestId,{resolve,reject,timer,command});const target=this.getWindow();if(!target){this.clearTimer(timer);this.pending.delete(requestId);reject(frameError('FRAME_CLOSED','页面已关闭。'));return}target.postMessage({channel:FRAME_CHANNEL,token:this.token,pageId:this.pageId,kind:'command',command,args,requestId},'*')})}
  receive(event){if(this.closed)return false;const packet=authenticatedPacket(event,{source:this.getWindow(),token:this.token,pageId:this.pageId});if(!packet)return false;
    if(packet.kind==='response'){const pending=this.pending.get(packet.requestId);if(!pending)return false;this.clearTimer(pending.timer);this.pending.delete(packet.requestId);if(packet.value?.error)pending.reject(frameError('FRAME_VIEW_ERROR',String(packet.value.error).slice(0,2000)));else pending.resolve(packet.value);return true}
    if(packet.kind==='ready'){this.ready=true;this.onEvent(packet.kind,packet.value);for(const waiter of this.waiters){this.clearTimer(waiter.timer);waiter.resolve()}this.waiters.clear();return true}
    this.onEvent(packet.kind,packet.value);return true;
  }
  close(code='FRAME_CLOSED'){if(this.closed)return;this.closed=true;const error=frameError(code,code==='FRAME_RELOADED'?'页面已更新，请重试当前操作。':'页面已关闭。');for(const pending of this.pending.values()){this.clearTimer(pending.timer);pending.reject(error)}this.pending.clear();for(const waiter of this.waiters){this.clearTimer(waiter.timer);waiter.reject(error)}this.waiters.clear();}
}

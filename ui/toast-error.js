const summaries={
 FS_SANDBOX_DENIED:'当前会话无权访问此目录，请检查项目的会话权限。',
 PROJECT_SESSION_REQUIRED:'项目会话尚未就绪，请稍后重试。',
 CLIENT_SESSION_CATALOG_UNAVAILABLE:'会话目录尚未同步完成，请重新加载项目。',
 'session/writer-held':'项目会话正在其他窗口准备或使用，请稍后重新加载。',
 'session/not-found':'项目会话尚未恢复，请重新加载项目。',
 UNSAFE_PROVIDER_TOOL:'当前设计工具不支持安全读取，请使用官方只读连接或导出的 HTML / ZIP。',
 PROJECT_SESSION_READ_ONLY:'当前项目会话为只读模式，请在会话权限中调整后再保存。',
 PROJECT_SCOPE:'操作与当前项目会话不匹配，请重新打开项目后再试。',
 VERSION_CONFLICT:'内容已发生变化，请刷新并处理冲突后再保存。',
 FS_STALE_VERSION:'文件已发生变化，请刷新后再保存。',
 SERVICE_DISPOSED:'服务正在重新连接，请稍后重试。',
 EPERM:'当前操作没有足够的文件访问权限，请检查项目的会话权限。',
 EACCES:'当前操作没有足够的文件访问权限，请检查项目的会话权限。',
 ENOENT:'所需文件或目录已不存在，请刷新后重试。',
 ENOSPC:'存储空间不足，请释放空间后重试。',
 NETWORK_ERROR:'连接暂时中断，请检查网络后重试。'
};
export function toastErrorMessage(error){
 const text=String(error?.message||error||'请稍后重试。');
 const known=summaries[error?.code] || (/\b(?:EPERM|EACCES)\b|permission denied|operation not permitted/i.test(text)?summaries.EPERM:null);
 if(known)return known;
 // Raw filesystem and transport diagnostics belong in the expandable details.
 if(/(?:\/(?:Users|home|private|var|tmp|Volumes|Applications)\/|(?:^|[\s'"（(：])\/(?:[^\s/]+\/)+[^\s]*|[A-Z]:\\|\b(?:Error:|ENOENT|FS_SANDBOX_DENIED)\b|^Unknown .+ action|fetch failed|failed to fetch)/i.test(text))return '操作失败，请稍后重试；具体原因可在详情中查看。';
 return text.length>180?`${text.slice(0,180)}…`:text;
}
export function toastErrorDetails(error){
 let text=`${error?.code||'ERROR'} · ${error?.message||String(error)}`;
 if(error?.details){try{text+='\n'+JSON.stringify(error.details,null,2);}catch{text+='\n（详情无法序列化）';}}
 return text;
}
function stableValue(value,seen=new WeakSet()){
 if(!value||typeof value!=='object')return value;
 if(seen.has(value))return '[Circular]';
 seen.add(value);
 const result=Array.isArray(value)?value.map(item=>stableValue(item,seen)):Object.fromEntries(Object.keys(value).sort().map(key=>[key,stableValue(value[key],seen)]));
 seen.delete(value);return result;
}
export function toastErrorKey(error){
 let details='';try{details=JSON.stringify(stableValue(error?.details))||'';}catch{}
 return `${error?.code||''}:${error?.message||String(error)}:${details}`;
}

// One store per mounted workbench; simultaneous reports share one notification.
export function createToastStore(){
 let entries=[],sequence=0;
 const listeners=new Set(),dismissedObjects=new WeakSet();
 const publish=()=>{for(const listener of listeners)listener();};
 const store={
  subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
  getSnapshot:()=>entries,
  reportError(error,{context='',dedupeKey,target,onClose,source}={}){
   if(!error||typeof error==='object'&&dismissedObjects.has(error))return()=>{};
   const key=dedupeKey||toastErrorKey(error),existing=entries.find(entry=>entry.key===key),sourceId=source||Symbol('toast-source');
   const report={error,onClose};
   if(existing){existing.sources.set(sourceId,report);if(!existing.target&&target){entries=entries.map(entry=>entry===existing?{...entry,target}:entry);publish();}}
   else{entries=[...entries,{id:++sequence,key,error,context,target,sources:new Map([[sourceId,report]])}];publish();}
   // Unmounting a dialog must not hide an operation failure before it can be read.
   return()=>{const entry=entries.find(item=>item.key===key);if(entry)entry.sources.delete(sourceId);};
  },
  dismissError(id){
   const entry=entries.find(item=>item.id===id);if(!entry)return;
   entries=entries.filter(item=>item!==entry);
   if(entry.error&&typeof entry.error==='object')dismissedObjects.add(entry.error);
   publish();
   for(const {error,onClose} of entry.sources.values()){
    if(error&&typeof error==='object')dismissedObjects.add(error);
    try{onClose?.(error);}catch{}
   }
  }
 };
 return store;
}

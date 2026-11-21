export function systemLogicalPath(basePath,href) {
  const value=new URL(href,'https://system.invalid/'+basePath);
  if(value.origin!=='https://system.invalid')throw Object.assign(new Error('体系内部资源引用不能跨到其他来源'),{code:'SYSTEM_RESOURCE_SCOPE'});
  const path=decodeURIComponent(value.pathname).replace(/^\//,'');
  return path;
}

export const isTextSystemResource=value=>/^text\//i.test(value.mimeType||value.resource?.mimeType||'')||/(?:json|javascript|typescript|xml|svg|yaml)/i.test(value.mimeType||value.resource?.mimeType||'')||/\.(?:html?|css|m?js|jsx|tsx?|json|md|markdown|svg|xml|ya?ml|txt)$/i.test(value.logicalPath||value.path||value.resource?.logicalPath||value.resource?.path||'');

// Only logical identity and descriptive metadata cross into a replacement. Storage
// paths, hashes, capabilities and filesystem versions belong to the old bytes.
export function replaceSystemResource(resource,body) {
  const logicalPath=resource.logicalPath||resource.path;
  if(!logicalPath)throw Object.assign(new Error('资源缺少逻辑路径，无法保持依赖关系'),{code:'SYSTEM_RESOURCE_PATH_REQUIRED'});
  const text=Object.hasOwn(body,'content'),binary=Object.hasOwn(body,'bytesBase64');
  if(text===binary||text&&typeof body.content!=='string'||binary&&typeof body.bytesBase64!=='string')throw Object.assign(new Error('替换资源需要明确的文本或二进制正文'),{code:'SYSTEM_RESOURCE_BODY_REQUIRED'});
  return {...Object.fromEntries(['id','name','type','description'].filter(key=>resource[key]!==undefined).map(key=>[key,resource[key]])),logicalPath,path:logicalPath,mimeType:body.mimeType||resource.mimeType||(text?'text/plain':'application/octet-stream'),...(text?{content:body.content}:{bytesBase64:body.bytesBase64})};
}

export async function systemResourceFileBody(file) {
  if(!file)throw Object.assign(new Error('未选择替换文件，原资源保持不变'),{code:'SYSTEM_RESOURCE_REPLACE_CANCELLED'});
  if(file.size>64*1024*1024)throw Object.assign(new Error('单个体系资源不能超过 64 MiB'),{code:'SYSTEM_RESOURCE_TOO_LARGE'});
  const bytesBase64=await new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result).split(',')[1]);
    reader.onerror=()=>reject(Object.assign(new Error('读取文件失败，原资源和草稿保持不变'),{code:'SYSTEM_RESOURCE_FILE_READ_FAILED',cause:reader.error}));
    reader.onabort=()=>reject(Object.assign(new Error('读取文件已取消，原资源和草稿保持不变'),{code:'SYSTEM_RESOURCE_REPLACE_CANCELLED'}));
    reader.readAsDataURL(file);
  });
  return {bytesBase64,...(file.type?{mimeType:file.type}:{})};
}

export function inlineSystemResource(resource) {
  const logicalPath=resource.logicalPath||resource.path;
  const content=resource.content??resource.text;
  if(typeof content==='string')return {...resource,logicalPath,path:logicalPath,content};
  if(typeof resource.bytesBase64!=='string')throw Object.assign(new Error('资源草稿缺少可读取正文'),{code:'SYSTEM_RESOURCE_BODY_UNAVAILABLE'});
  const url=`data:${resource.mimeType||'application/octet-stream'};base64,${resource.bytesBase64}`;
  if(!isTextSystemResource(resource))return {...resource,logicalPath,path:logicalPath,binary:true,previewUrl:url,downloadUrl:url};
  let text;
  try{text=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(resource.bytesBase64),char=>char.charCodeAt(0)));}
  catch{throw Object.assign(new Error('此资源不是有效 UTF-8 文本，请通过替换文件更新'),{code:'SYSTEM_RESOURCE_INVALID_UTF8'});}
  return {...resource,logicalPath,path:logicalPath,content:text,downloadUrl:url};
}

export async function readSystemResource(api,args) {
  const value=await api('system.resource.read',args);
  const resource={...value,logicalPath:value.logicalPath||value.resource?.logicalPath,path:value.logicalPath||value.resource?.logicalPath||value.resource?.path,readonly:true,binary:!isTextSystemResource(value)};
  if(!isTextSystemResource(resource)||typeof resource.content==='string'||typeof resource.text==='string')return resource;
  return {...resource,content:await (await fetchSystemResource(resource)).text()};
}

async function fetchSystemResource(resource) {
  const address=resource.downloadUrl||resource.previewUrl||resource.url;
  if(!address)throw Object.assign(new Error('此固定版本资源没有可读取的正文地址'),{code:'SYSTEM_RESOURCE_BODY_UNAVAILABLE'});
  const url=new URL(address,location.origin);
  const nativeResource=location.protocol==='dsh-app:'&&url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)&&url.pathname.startsWith('/api/designer/file-resource/');
  if(url.origin!==location.origin&&!nativeResource)throw Object.assign(new Error('资源正文地址不是受控的本地能力地址'),{code:'SYSTEM_RESOURCE_SCOPE'});
  const response=await fetch(nativeResource?url.pathname+url.search:url.href,{credentials:'same-origin'});
  if(!response.ok)throw Object.assign(new Error('读取固定版本资源正文失败：HTTP '+response.status),{code:'SYSTEM_RESOURCE_READ_FAILED'});
  return response;
}

export async function readSystemResourceBytes(api,args) {
  const resource=await api('system.resource.read',args);
  const bytes=resource.bytesBase64!==undefined?Uint8Array.from(atob(resource.bytesBase64),char=>char.charCodeAt(0))
    :resource.content!==undefined?new TextEncoder().encode(resource.content)
    :new Uint8Array(await (await fetchSystemResource(resource)).arrayBuffer());
  return {...resource,bytes};
}

export function systemBytesBase64(bytes) {
  const chunks=[];
  for(let offset=0;offset<bytes.length;offset+=8192)chunks.push(String.fromCharCode(...bytes.subarray(offset,offset+8192)));
  return btoa(chunks.join(''));
}

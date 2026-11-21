const PREFIX='DSH_PORTABLE_PROJECT_V1\n';
const MAX_BYTES=16*1024*1024;
const failure=(code,message)=>Object.assign(new Error(message),{code});
export function pngClipboardBlob(payload,{BlobCtor=globalThis.Blob,decodeBase64=globalThis.atob}={}){
  if(payload.mimeType!=='image/png'||typeof payload.bytesBase64!=='string'||payload.bytesBase64.length>4*Math.ceil(MAX_BYTES/3))throw failure('CLIPBOARD_PAYLOAD_INVALID','PNG 剪贴板内容无效或超过 16 MiB。');
  const raw=decodeBase64(payload.bytesBase64),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));if(bytes.length>MAX_BYTES||[137,80,78,71,13,10,26,10].some((v,i)=>bytes[i]!==v))throw failure('CLIPBOARD_PAYLOAD_INVALID','导出内容不是有效的 PNG 图片。');
  return new BlobCtor([bytes],{type:'image/png'});
}
/** Copy actual content. A package text encoding is never presented as an OS file. */
export async function copyExportToClipboard(payload,{clipboard=globalThis.navigator?.clipboard,ClipboardItemCtor=globalThis.ClipboardItem,BlobCtor=globalThis.Blob,decodeBase64=globalThis.atob,richHTML=false}={}){
  if(!payload||!['project','html','png'].includes(payload.kind))throw failure('CLIPBOARD_PAYLOAD_INVALID','没有可复制的导出内容。');
  if(!clipboard)throw failure('CLIPBOARD_UNAVAILABLE','当前浏览器不支持剪贴板访问，请下载文件。');
  try{
    if(payload.kind==='png'){
      if(typeof clipboard.write!=='function'||!ClipboardItemCtor||!BlobCtor||typeof decodeBase64!=='function')throw failure('CLIPBOARD_PNG_UNAVAILABLE','当前浏览器无法复制 PNG 图片，请下载 PNG 文件。');
      await clipboard.write([new ClipboardItemCtor({'image/png':pngClipboardBlob(payload,{BlobCtor,decodeBase64})})]);return {kind:'png',representation:'image/png'};
    }
    if(typeof payload.text!=='string'||new TextEncoder().encode(payload.text).length>MAX_BYTES)throw failure('CLIPBOARD_PAYLOAD_INVALID','剪贴板文本无效或超过 16 MiB，请下载完整包。');
    if(payload.kind==='project'&&(payload.encoding!=='dsh-portable-project-text-v1'||!payload.text.startsWith(PREFIX)))throw failure('CLIPBOARD_PAYLOAD_INVALID','完整包必须是标示清楚的便携文本编码。');
    if(payload.kind==='html'&&richHTML){
      if(typeof clipboard.write!=='function'||!ClipboardItemCtor||!BlobCtor)throw failure('CLIPBOARD_HTML_UNAVAILABLE','当前浏览器不支持富文本 HTML 复制，请复制源码或下载。');
      await clipboard.write([new ClipboardItemCtor({'text/html':new BlobCtor([payload.text],{type:'text/html'}),'text/plain':new BlobCtor([payload.text],{type:'text/plain'})})]);return {kind:'html',representation:'text/html'};
    }
    if(typeof clipboard.writeText!=='function')throw failure('CLIPBOARD_TEXT_UNAVAILABLE','当前浏览器无法写入剪贴板文本，请下载文件。');
    await clipboard.writeText(payload.text);return {kind:payload.kind,representation:'text/plain'};
  }catch(error){if(typeof error?.code==='string'&&error.code.startsWith('CLIPBOARD_'))throw error;throw failure('CLIPBOARD_WRITE_DENIED','浏览器拒绝了剪贴板写入，请允许剪贴板权限后重试，或下载文件。');}
}

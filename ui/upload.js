// Raw File/Blob upload avoids base64 expansion and JSON ingress limits.
export async function uploadFile(api,file,options) {
  if(typeof api.upload==='function')return api.upload(file,options);
  const query=new URLSearchParams();
  for(const [key,value] of Object.entries({...options,name:options.name||file.name,mediaType:options.mediaType||file.type||'application/octet-stream'}))if(value!==undefined&&value!==null)query.set(key,String(value));
  const response=await fetch('/api/designer/upload?'+query.toString(),{method:'POST',credentials:'same-origin',headers:{'Content-Type':options.mediaType||file.type||'application/octet-stream'},body:file});
  let result;try{result=await response.json();}catch{throw Object.assign(new Error('上传服务未返回有效响应：'+response.status),{code:'UPLOAD_RESPONSE_INVALID'});}
  if(!response.ok||result.ok===false)throw Object.assign(new Error(result.error?.message||`上传失败：HTTP ${response.status}`),{code:result.error?.code||`HTTP_${response.status}`,details:result.error?.details});
  return result.value??result;
}

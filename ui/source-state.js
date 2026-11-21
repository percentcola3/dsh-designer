const sourceInputError=(message,field)=>Object.assign(new Error(message),{code:'SOURCE_FIELD_INVALID',details:{field}});
export function normalizeWebsiteURL(value){
 let address=String(value||'').trim();
 if(!address)throw sourceInputError('请输入网站地址。','url');
 const hostWithPort=/^(?:localhost|[^/?#:@]+\.[^/?#:@]+):\d+(?:[/?#]|$)/i.test(address);
 if(address.startsWith('//'))address='https:'+address;
 else if(!/^https?:\/\//i.test(address)){
  if(/^[a-z][a-z\d+.-]*:/i.test(address)&&!hostWithPort)throw sourceInputError('网站地址须使用 HTTP 或 HTTPS，且不能包含账号密码。','url');
  address='https://'+address;
 }
 let url;try{url=new URL(address);}catch{throw sourceInputError('请输入有效的网站地址，例如 https://example.com。','url');}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw sourceInputError('网站地址须使用 HTTP 或 HTTPS，且不能包含账号密码。','url');
 return url.href;
}
export function pinnedSourceBinding(value){const binding=value?.effectiveBinding||value?.binding||value;if(!binding||binding.invalid||!binding.systemId||!Number.isSafeInteger(binding.version)||binding.version<1)return null;return {systemId:binding.systemId,version:binding.version,name:binding.system?.name||binding.name||binding.systemId};}
export function websitePlanInput(form,binding){
 const url=normalizeWebsiteURL(form.url),parse=(key,label)=>{const value=String(form[key]||'').trim();if(!value)return undefined;try{return JSON.parse(value);}catch{throw sourceInputError(label+'必须是有效 JSON。',key);}},urls=String(form.pagesText||'').split('\n').map(value=>value.trim()).filter(Boolean),states=parse('statesText','状态操作'),regions=parse('regionsText','区域'),viewports=parse('viewportsText','多视口')||[{id:'custom',width:Number(form.width),height:Number(form.height)}];
 if(!Array.isArray(viewports)||!viewports.length||viewports.some(value=>!Number.isInteger(value.width)||!Number.isInteger(value.height)||value.width<240||value.width>3840||value.height<240||value.height>3840))throw sourceInputError('视口宽高须为 240–3840 之间的整数。','viewportsText');
 if(states!==undefined&&!Array.isArray(states))throw sourceInputError('状态操作需要 JSON 数组。','statesText');if(regions!==undefined&&!Array.isArray(regions))throw sourceInputError('区域需要 JSON 数组。','regionsText');
 const faithful=form.faithful!==false,pin=faithful?null:pinnedSourceBinding(binding);if(!faithful&&!pin)throw Object.assign(new Error('当前设计稿未绑定有效的设计规范。请先在设计设置中绑定规范，再选择按规范改版。'),{code:'SYSTEM_REQUIRED'});
 return {kind:'website',url,name:String(form.name||'').trim()||new URL(url).hostname,pages:(urls.length?urls:[url]).map((value,index)=>({name:form.name||'页面 '+(index+1),url:normalizeWebsiteURL(value),states,regions,scope:form.captureScope||'page'})),viewports,mode:faithful?'faithful':'system-adaptation',...(pin?{systemId:pin.systemId,systemVersion:pin.version}:{})};
}
export function websiteDraftKey(form,binding){try{return JSON.stringify(websitePlanInput(form,binding));}catch{return null;}}
export function websitePreviewReady(preview,{draftKey,sourceId,versionId,captureId,seen}={}){return !!(preview&&seen&&draftKey&&preview.draftKey===draftKey&&preview.sourceId===sourceId&&preview.versionId===versionId&&preview.captureId===captureId&&(preview.image||preview.html));}
export function sourceStateLabel(value){return {available:'已取得',pending:'待处理',requested:'已提交',running:'运行中',completed:'原生请求已结束',failed:'失败',cancelled:'已取消',incomplete:'输出不完整',unknown:'终态待确认',saved:'当前范围已保存',partial:'部分内容已保存',none:'暂无保存',passed:'核验通过',verified:'已核验',stale:'保存版本已变，待重新核验'}[value]||value;}
export function selectSourceRecord(records,sourceId) {
  return sourceId?records.find(record=>record.id===sourceId)||null:null;
}

export function hydrateSourceForm(record,provider='website') {
  const pages=record?.pages||[],viewports=record?.viewports||[],first=pages[0];
  return {
    source:(record?.kind||provider)==='export'?'files':record?.kind||provider,
    name:record?.name||'',url:record?.url||first?.url||'',
    selected:pages.filter(page=>page.selected!==false).map(page=>page.sourceNodeId||page.id),
    faithful:record?.mode!=='system-adaptation',
    width:viewports[0]?.width||1440,height:viewports[0]?.height||900,
    pagesText:pages.map(page=>page.url).filter(Boolean).join('\n'),
    statesText:first?.states?.length?JSON.stringify(first.states,null,2):'',
    regionsText:first?.regions?.length?JSON.stringify(first.regions,null,2):'',
    captureScope:first?.scope||'page',
    viewportsText:viewports.length>1?JSON.stringify(viewports,null,2):'',
    path:record?.path||'',versionId:record?.latestVersionId||'',
  };
}

export function sourceViewTransition(view,sourceId) {
  return {sourceId:sourceId||null,sequence:(view?.sequence||0)+1};
}

export function sourceResponseCurrent(ticket,view,requestId,responseSourceId,{createsSource=false}={}) {
  return ticket.requestId===requestId&&ticket.sequence===view.sequence&&ticket.sourceId===view.sourceId&&(createsSource||!responseSourceId||responseSourceId===view.sourceId);
}

export function sourceFormAfterResponse(previousId,nextRecord,currentForm,provider) {
  return previousId===nextRecord?.id?currentForm:hydrateSourceForm(nextRecord,provider);
}

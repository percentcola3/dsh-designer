export function systemVersionDraft(version={}){
  return {tokens:JSON.stringify(version.tokens??{},null,2),guidelines:version.guidelines||'',examples:JSON.stringify(version.examples??[],null,2),skeletons:JSON.stringify(version.skeletons??[],null,2),variables:JSON.stringify(version.variables??{},null,2),resources:structuredClone(version.resources||[]),resourceVersion:version.version,editingVersion:version.version};
}
export function systemVersionForm(system,version,kept){
  const form={...system,type:'system',...systemVersionDraft(version),resourceDrafts:{},sourceSystem:system};
  form.baseline=systemVersionDraftFingerprint(form);
  return kept?{...kept,revision:system.revision,versions:system.versions,sourceSystem:system}:form;
}
export function systemVersionDraftKey(draft){return `${draft.id||'new'}:${draft.editingVersion??'new'}`;}
export function systemVersionDraftFingerprint(draft){
  return JSON.stringify(Object.fromEntries(['name','description','platforms','tokens','guidelines','examples','skeletons','variables','resources','resourceDrafts'].map(key=>[key,draft[key]??(key==='resourceDrafts'?{}:null)])));
}
export function hasSystemVersionChanges(draft){return draft.baseline!==systemVersionDraftFingerprint(draft);}
export function applySystemResourceDraft(draft,index,resource){
  if(!draft.resources[index]||(draft.resources[index].logicalPath||draft.resources[index].path)!==(resource.logicalPath||resource.path))throw Object.assign(new Error('资源草稿已不属于当前版本，请保留草稿并重新打开资源'),{code:'SYSTEM_RESOURCE_DRAFT_CONFLICT'});
  const resources=draft.resources.map((item,i)=>i===index?structuredClone(resource):item),resourceDrafts={...draft.resourceDrafts};
  delete resourceDrafts[resource.logicalPath||resource.path];
  return {...draft,resources,resourceDrafts};
}
export function parseSystemVersionDraft(draft){
  if(Object.keys(draft.resourceDrafts||{}).length)throw Object.assign(new Error('仍有保留的资源文本草稿，请先逐一应用到版本表单或丢弃，再保存新版本。'),{code:'SYSTEM_RESOURCE_DRAFT_PENDING'});
  const result={};
  for(const [key,label,fallback] of [['tokens','样式变量','{}'],['examples','示例','[]'],['skeletons','页面骨架','[]'],['variables','扩展变量','{}']]){
    try{result[key]=JSON.parse(draft[key]??fallback);}catch{throw Object.assign(new Error(label+'必须为有效 JSON。'),{code:'INVALID_SYSTEM_JSON',details:{field:key}});}
  }
  if(!result.tokens||typeof result.tokens!=='object'||Array.isArray(result.tokens))throw Object.assign(new Error('样式变量必须为 JSON 对象。'),{code:'INVALID_SYSTEM_JSON',details:{field:'tokens'}});
  return result;
}

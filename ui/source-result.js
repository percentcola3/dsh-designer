export function requireSavedSourceResult(result){
  if(result?.error||result?.ok===false||['connection-required','failed','error'].includes(result?.status)){
    const value=result.error||{};
    throw Object.assign(new Error(value.message||'来源资料尚未保存。请检查官方连接，或使用导出 HTML / JSON / 资源包入口。'),{code:value.code||'SOURCE_NOT_SAVED',details:{...value.details,status:result.status,offlineImportAvailable:true}});
  }
  if(!result?.version?.id)throw Object.assign(new Error('来源服务没有返回已保存的冻结版本，请重试采集。'),{code:'SOURCE_NOT_SAVED'});
  return result;
}

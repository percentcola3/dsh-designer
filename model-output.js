// Model-facing values are detached JSON data, never owner preview capabilities.
const PRIVATE_KEYS=new Set(['capability','previewTicket','assetBase','assetRoot','savedHTML','bytesBase64','imageBase64','accessToken','refreshToken','authorization','password','privateKey','passphrase','httpsToken']);
const PREVIEW_LINK=/(?:https?:\/\/[^\s/"'<>]+)?\/api\/designer\/(?:share|capture|resource|file-resource|source-resource|knowledge-resource|download)\/[^\s"'<>)]*/g;
const bounded=(value,limit)=>typeof value==='string'?value.slice(0,limit):'';

function invalid(reason){const error=new TypeError(`Designer model output contains ${reason}`);error.code='INVALID_MODEL_OUTPUT';throw error;}

/**
 * Preserve the existing modelSafe redactions and explicitly handle optional JS
 * values: omit undefined object fields and use null for undefined/holes in arrays.
 * Reject unsupported data instead of silently stringifying NaN, functions, etc.
 * Do not invoke getters or toJSON hooks, including those on private fields.
 */
export function modelSafe(value){
  const ancestors=new WeakSet();
  function visit(value){
    if(value===undefined||value===null)return null;
    if(typeof value==='string')return /^data:[^,]*;base64,/i.test(value)?'[binary attachment omitted]':value.replace(PREVIEW_LINK,'[owner preview link omitted]');
    if(typeof value==='boolean')return value;
    if(typeof value==='number'){if(!Number.isFinite(value))invalid('a non-finite number');return Object.is(value,-0)?0:value;}
    if(typeof value!=='object')invalid('an unsupported value type');
    if(ancestors.has(value))invalid('a circular reference');
    const array=Array.isArray(value),prototype=Object.getPrototypeOf(value);
    if(!array&&prototype!==Object.prototype&&prototype!==null)invalid('a non-plain object');
    ancestors.add(value);
    try{
      if(array){
        const result=[];
        for(let index=0;index<value.length;index++){
          const descriptor=Object.getOwnPropertyDescriptor(value,String(index));
          if(descriptor&&!Object.hasOwn(descriptor,'value'))invalid('an accessor');
          result.push(visit(descriptor?.value));
        }
        for(const key of Reflect.ownKeys(value))if(key!=='length'&&!(typeof key==='string'&&/^(?:0|[1-9]\d*)$/.test(key)&&Number(key)<value.length))invalid('an extra array property');
        return result;
      }
      const result={};
      for(const key of Reflect.ownKeys(value)){
        if(typeof key==='string'&&PRIVATE_KEYS.has(key))continue;
        const descriptor=Object.getOwnPropertyDescriptor(value,key);
        if(!descriptor?.enumerable)continue;
        if(typeof key!=='string')invalid('a symbol property');
        if(!Object.hasOwn(descriptor,'value'))invalid('an accessor');
        if(descriptor.value===undefined)continue;
        Object.defineProperty(result,key,{value:visit(descriptor.value),enumerable:true,writable:true,configurable:true});
      }
      return result;
    }finally{ancestors.delete(value);}
  }
  return visit(value);
}

/** Bounded editor receipt, retaining durable save identities and warnings. */
export function modelResult(value,input={}){
  if((/^edit\./.test(input.action)||['file.write','artboard.commit'].includes(input.action))&&value?.document){
    const nodes=Object.values(value.document.nodes||{}),offset=Math.max(0,Number.isSafeInteger(input.nodeOffset)?input.nodeOffset:0),limit=Math.min(100,Math.max(1,Number.isSafeInteger(input.nodeLimit)?input.nodeLimit:60));
    return modelSafe({projectRevision:value.projectRevision,page:value.page,artboard:value.artboard??value.page,file:value.file,version:value.version,sourceHash:value.sourceHash,changes:value.changes,diagnostics:value.diagnostics||value.document.diagnostics,nodes:nodes.slice(offset,offset+limit).map(node=>({...node,text:bounded(node.text,160),...(node.text?.length>160?{textTruncated:true}:{})})),nodeOffset:offset,nodeTotal:nodes.length,nextNodeOffset:offset+limit<nodes.length?offset+limit:null,more:{action:'file.read',fileId:value.file?.id,offset:0,limit:12000},saved:value.saved,previewStatus:value.previewStatus,interactionVerification:value.interactionVerification,receiptWarning:value.receiptWarning});
  }
  return modelSafe(value);
}

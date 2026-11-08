const problem=(field,message)=>Object.assign(new Error(message),{code:'INVALID_SKILL_FILE',details:{field}});
const keys=['name','description','instructions'];
const quote=value=>JSON.stringify(value).replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');

/** Native flat Markdown skill format. Produces a download, never installs or registers a skill. */
export function skillFileDraft(draft={}){
  const name=typeof draft.name==='string'?draft.name.trim():'';
  if(!name||name.length>64||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name))throw problem('name','名称须为不超过 64 字符的小写字母、数字和短横线，如 design-review。');
  const description=typeof draft.description==='string'?draft.description.trim():'';
  if(!description||description.length>4000||description.includes('\0'))throw problem('description','请填写不超过 4000 字的技能描述。');
  const instructions=typeof draft.instructions==='string'?draft.instructions.replace(/\r\n?/g,'\n'):'';
  if(!instructions.trim()||instructions.length>200000||instructions.includes('\0'))throw problem('instructions','请填写不超过 200000 字的技能正文。');
  return {name:`${name}.md`,mimeType:'text/markdown;charset=utf-8',content:`---\nname: ${quote(name)}\ndescription: ${quote(description)}\n---\n\n${instructions}${instructions.endsWith('\n')?'':'\n'}`};
}

export function skillFileDraftChanged(draft){
  if(!draft)return false;
  return keys.some(key=>(draft[key]||'')!==(draft.downloadedValues?.[key]||''));
}

export function downloadedSkillFileDraft(draft){
  return {...draft,downloadedValues:Object.fromEntries(keys.map(key=>[key,draft[key]||'']))};
}

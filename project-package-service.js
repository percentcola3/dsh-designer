import {createHash,randomUUID} from 'node:crypto';
import {fail} from './store.js';
import {zipStored} from './delivery-service.js';
import {buildPortableProject,validatePortableProject,portableJSON,PORTABLE_MANIFEST_PATH} from './portable-project.js';

const hash=value=>createHash('sha256').update(value).digest('hex');
const CLIPBOARD_LIMIT=16*1024*1024;
export const PORTABLE_TEXT_PREFIX='DSH_PORTABLE_PROJECT_V1\n';
export class ProjectPackageService {
  constructor(owner){this.owner=owner;}
  help(action){const fields={projectId:'required',expectedRevision:'required for create and current clipboard',exportId:'required for get; optional saved package clipboard',kind:'clipboard only: project|html|png',pageId:'HTML clipboard saved page ID'};return {action:action||'package',actions:['package.create','package.get','package.list','package.clipboard'],fields,userOnly:true,limits:{files:4000,fileBytes:33554432,totalBytes:134217728,clipboardBytes:CLIPBOARD_LIMIT},clipboard:'Project copy is an explicitly labelled portable text encoding, not an operating-system ZIP file object.'};}
  async project(id,env){return (await this.owner.store.projectRecord(id,env.signal)).value;}
  async execute(input,env={}){
    if(env.user!==true||env.agent)fail('USER_ONLY','Project packages require an explicit user operation');
    if(input.options)input={...input.options,...input};
    const p=await this.project(input.projectId,env),records=p.workbench?.deliveryRecords?.exports||[];
    if(input.action==='package.list')return {packages:records.filter(r=>r.format==='project-package').map(r=>this.owner.delivery.exportView(p.id,r)),projectRevision:p.revision};
    if(input.action==='package.get'){const record=this.record(records,input.exportId);return {package:this.owner.delivery.exportView(p.id,record),manifest:await this.owner.delivery.exportManifest(p,record,env.signal),projectRevision:p.revision};}
    if(input.action==='package.clipboard')return this.clipboard(p,records,input,env);
    if(input.action!=='package.create')fail('UNKNOWN_ACTION','Unknown project package action');
    if(!env.policy||env.policy.mode==='read-only')fail('FS_SANDBOX_DENIED','Saving a package requires the current writable host policy');
    if(input.expectedRevision!==p.revision)fail('VERSION_CONFLICT','Project changed before packaging');
    if(records.length>=100)fail('LIMIT_REACHED','A project supports 100 recorded exports');
    const snapshot=await buildPortableProject(this.owner,p.id,{...env,expectedRevision:input.expectedRevision}),artifact=zipStored(snapshot.files),id='e-'+randomUUID(),folder=`delivery/${id}`,artifactPath=`${folder}/artifact.zip`;
    const manifest={schemaVersion:1,exportId:id,projectId:p.id,projectRevision:p.revision,format:'project-package',portable:snapshot.manifest,entryPath:PORTABLE_MANIFEST_PATH,pages:snapshot.manifest.project.artboards.map(p=>({id:p.id,designId:p.designId,htmlPath:p.htmlPath,revision:p.revision})),warnings:[],files:snapshot.files.map(f=>({path:f.path,storedPath:`${folder}/files/${f.path}`,mimeType:f.path.endsWith('.json')?'application/json':'application/octet-stream',sha256:hash(f.bytes),byteLength:f.bytes.length,public:false})),artifact:{path:artifactPath,mimeType:'application/zip',sha256:hash(artifact),byteLength:artifact.length}};
    const manifestText=portableJSON(manifest),manifestPath=`${folder}/manifest.json`,record={id,name:p.name+' 完整项目包.zip',format:'project-package',revision:1,projectRevision:p.revision,pageIds:snapshot.manifest.project.artboards.map(p=>p.id),manifestPath,manifestHash:hash(manifestText),artifactPath,mimeType:'application/zip',sha256:hash(artifact),byteLength:artifact.length,portableManifestHash:snapshot.manifest.manifestHash,createdAt:new Date().toISOString()};
    await this.owner.delivery.writeFiles(p.id,snapshot.files.map(f=>({path:`${folder}/files/${f.path}`,bytes:f.bytes})),env);
    await this.owner.delivery.writeFiles(p.id,[{path:artifactPath,bytes:artifact},{path:manifestPath,bytes:Buffer.from(manifestText)}],env);
    const saved=await this.owner.store.mutate(p.id,input.expectedRevision,'Save complete portable project package',next=>{next.workbench||={schemaVersion:1};next.workbench.deliveryRecords||={exports:[],shares:[]};next.workbench.deliveryRecords.exports||=[];if(next.workbench.deliveryRecords.exports.length>=100)fail('LIMIT_REACHED','A project supports 100 recorded exports');next.workbench.deliveryRecords.exports.unshift(record);},env.signal,env.policy,false);
    return {package:this.owner.delivery.exportView(p.id,record),manifest,project:saved,projectRevision:saved.revision};
  }
  record(records,id){const record=records.find(r=>r.id===id&&r.format==='project-package');if(!record)fail('PACKAGE_NOT_FOUND','Saved project package is unavailable');return record;}
  async frozen(p,record,env){const manifest=await this.owner.delivery.exportManifest(p,record,env.signal),files=[];for(const f of manifest.files){const bytes=await this.owner.delivery.readProjectBytes(p.id,f.storedPath,env.signal);if(hash(bytes)!==f.sha256||bytes.length!==f.byteLength)fail('INTEGRITY_MISMATCH','Saved package bytes changed');files.push({path:f.path,bytes});}return validatePortableProject({files,manifest:manifest.portable});}
  async clipboard(p,records,input,env){
    const kind=input.kind||'project';
    if(kind==='png'){
      const record=records.find(r=>r.id===input.exportId&&r.format==='png');if(!record)fail('PNG_EXPORT_REQUIRED','Select a saved PNG export');
      const manifest=await this.owner.delivery.exportManifest(p,record,env.signal),bytes=await this.owner.delivery.readProjectBytes(p.id,record.artifactPath,env.signal);
      if(bytes.length>CLIPBOARD_LIMIT)fail('CLIPBOARD_TOO_LARGE','PNG exceeds 16 MiB; download it instead');if(bytes.length<8||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||hash(bytes)!==record.sha256||manifest.artifact.sha256!==record.sha256)fail('INTEGRITY_MISMATCH','PNG artifact differs from its receipt');
      return {kind:'png',mimeType:'image/png',bytesBase64:bytes.toString('base64'),byteLength:bytes.length,sha256:hash(bytes),readonly:true};
    }
    if(!['project','html'].includes(kind))fail('INVALID_INPUT','Clipboard kind must be project, html or png');
    if(!input.exportId&&input.expectedRevision!==p.revision)fail('VERSION_CONFLICT','Project changed before clipboard export');
    const snapshot=input.exportId?await this.frozen(p,this.record(records,input.exportId),env):await buildPortableProject(this.owner,p.id,{...env,expectedRevision:input.expectedRevision});
    if(kind==='html'){
      const page=snapshot.manifest.project.artboards.find(p=>p.id===input.pageId);if(!page)fail('PAGE_NOT_FOUND','Choose a saved page for HTML copy');const bytes=snapshot.files.find(f=>f.path===page.htmlPath).bytes;if(bytes.length>CLIPBOARD_LIMIT)fail('CLIPBOARD_TOO_LARGE','HTML exceeds 16 MiB; download it instead');let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail('UNSUPPORTED_ENCODING','Saved HTML is not UTF-8');}return {kind:'html',mimeType:'text/html',text,byteLength:bytes.length,readonly:true};
    }
    const predicted=snapshot.files.reduce((n,f)=>n+4*Math.ceil(f.bytes.length/3)+f.path.length+100,0);if(predicted>CLIPBOARD_LIMIT)fail('CLIPBOARD_TOO_LARGE','Portable project text exceeds 16 MiB; download the ZIP instead');
    const text=PORTABLE_TEXT_PREFIX+JSON.stringify({format:'dsh-portable-project-text',schemaVersion:1,manifestHash:snapshot.manifest.manifestHash,files:snapshot.files.map(f=>({path:f.path,bytesBase64:f.bytes.toString('base64')}))});
    if(Buffer.byteLength(text)>CLIPBOARD_LIMIT)fail('CLIPBOARD_TOO_LARGE','Portable project text exceeds 16 MiB; download the ZIP instead');return {kind:'project',mimeType:'text/plain',encoding:'dsh-portable-project-text-v1',text,byteLength:Buffer.byteLength(text),manifestHash:snapshot.manifest.manifestHash,readonly:true};
  }
}

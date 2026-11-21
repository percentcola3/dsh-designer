import path from 'node:path';
import {createHash} from 'node:crypto';
import {BuiltinGitEngine} from './builtin-git-engine.js';
import {portablePath} from './portable-project.js';
import {fail,policyAllowsTarget} from './store.js';

const digest=value=>createHash('sha256').update(value).digest('hex');
const MAX_FILE=32*1024*1024,MAX_TOTAL=128*1024*1024;

/** Automatic, offline checkpoints of committed project content. */
export class LocalHistory {
  constructor(owner){this.owner=owner;this.engine=new BuiltinGitEngine(owner);this.receipts=new Map();this.queues=new Map();}
  status(projectId){return this.receipts.get(projectId)||null;}
  async checkpoint(project,{signal,policy,summary='Save design project'}={}){
    const operation=async()=>{
      try{
        const {store,ctx:{fs}}=this.owner;
        const root=await store.target(`projects/${project.id}`,signal);
        if(!await policyAllowsTarget(fs,policy,root,signal)){
          const receipt={state:'unavailable',revision:project.revision,error:{code:'FS_SANDBOX_DENIED',message:'当前权限无法记录本地 Git 历史'}};
          this.receipts.set(project.id,receipt);return receipt;
        }
        const metadata=await store.projectRecord(project.id,signal);
        if(metadata.value.revision!==project.revision)fail('VERSION_CONFLICT','Project changed before its Git checkpoint');
        const candidates=new Set(['project.json','.gitignore']);
        for(const file of project.workbench?.files||[]){
          if(file.removedAt||file.private||file.visibility==='private'||file.sourceId||file.sourceProjectId||file.referenceOnly||file.type==='reference')continue;
          try{portablePath(file.path);candidates.add(file.path);}catch{/* Only project-owned public content is checkpointed. */}
        }
        const pages=new Map(project.artboards.filter(p=>!p.deletedAt).map(p=>[p.htmlPath,p]));
        for(const filename of pages.keys()){portablePath(filename);candidates.add(filename);}
        if(candidates.size>4000)fail('GIT_SNAPSHOT_LIMIT','Local history supports 4000 files');
        const files=[];let total=0;
        for(const filename of candidates){
          const target=await store.target(`projects/${project.id}/${filename}`,signal);
          if(fs.processPath(target)!==path.join(fs.processPath(root),filename))fail('GIT_UNSAFE_PATH','Local history file aliases another path');
          const before=await fs.stat(target,signal);
          if(!before&&filename==='.gitignore')continue;
          if(before?.type!=='file'||before.size>MAX_FILE)fail('GIT_SNAPSHOT_LIMIT','A history file is unavailable or exceeds 32 MiB');
          const bytes=Buffer.from(await fs.readBytes(target,signal,MAX_FILE));
          if((await fs.stat(target,signal))?.version!==before.version)fail('VERSION_CONFLICT','File changed during Git checkpoint');
          const page=pages.get(filename);
          if(page?.contentHash&&digest(bytes)!==page.contentHash)fail('VERSION_CONFLICT','Saved page changed before Git checkpoint');
          total+=bytes.length;if(total>MAX_TOTAL)fail('GIT_SNAPSHOT_LIMIT','Local history exceeds 128 MiB');
          files.push({path:filename,bytesBase64:bytes.toString('base64')});
        }
        const current=await store.projectRecord(project.id,signal);
        if(current.version!==metadata.version)fail('VERSION_CONFLICT','Project changed during Git checkpoint');
        const saved=await this.engine.run('localCheckpoint',{projectId:project.id,files,message:`${summary} · revision ${project.revision}`},{signal,policy});
        const receipt={...saved,state:'saved',revision:project.revision};this.receipts.set(project.id,receipt);return receipt;
      }catch(error){
        signal?.throwIfAborted();
        const receipt={state:'failed',revision:project.revision,error:{code:error.code||'GIT_CHECKPOINT_FAILED',message:'项目已保存，本地 Git 历史记录失败。'+String(error.message||'').slice(0,300)}};
        this.receipts.set(project.id,receipt);return receipt;
      }
    };
    const pending=(this.queues.get(project.id)||Promise.resolve()).then(operation);
    this.queues.set(project.id,pending);
    try{return await pending;}finally{if(this.queues.get(project.id)===pending)this.queues.delete(project.id);}
  }
}

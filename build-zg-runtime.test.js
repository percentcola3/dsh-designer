import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat,mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import {createHash} from 'node:crypto';
import Module,{createRequire} from 'node:module';
import vm from 'node:vm';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {ZG_SOURCE,ZVEC_WRAPPER_SOURCE,LIBC_SOURCE,ZG_RUNTIME_DEPENDENCIES,ZG_OPTIONAL_BINDINGS,ZVEC_NATIVE_EXPORTS} from './build-zg-runtime.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),vendor=path.join(root,'vendor'),sha=b=>createHash('sha256').update(b).digest('hex');
const provenance=JSON.parse(await readFile(path.join(vendor,'zg-provenance.json'),'utf8'));
const cacheBase=path.join(root,'.build','zg-vendor-0.2.1'),hasVerifiedSourceCache=(await Promise.all([ZG_SOURCE,ZVEC_WRAPPER_SOURCE,LIBC_SOURCE].map(source=>stat(path.join(cacheBase,source.cacheDirectory||'',source.name.split('/').at(-1)+'-'+source.version+'.tgz')).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;})))).every(Boolean);

test('official SDK provenance pins verified archive, source files and every shipped artifact',async()=>{
  assert.equal(provenance.source.integrity,ZG_SOURCE.integrity);assert.equal(provenance.source.version,'0.2.1');assert.equal(provenance.source.tarballSha256,'65c691e4fac082dffc408e7329d66096c1e4753513cab9d9d5500382b9b6327f');assert.ok(provenance.sourceFiles.length>=70);assert.deepEqual(provenance.runtimeDependencies,ZG_RUNTIME_DEPENDENCIES);
  assert.equal(provenance.build.scriptSha256,sha(await readFile(path.join(root,'build-zg-runtime.mjs'))));
  assert.deepEqual(provenance.exports,['createZvecGrep','createEmbeddingModel','EmbeddingPurpose','isImageContent','isTextContent','WorkspaceIndex','readWorkspaceManifest','workspaceIndexInfoFromManifest',...Object.keys(ZVEC_NATIVE_EXPORTS)]);
  assert.deepEqual(provenance.nativeExports.mappings,ZVEC_NATIVE_EXPORTS);assert.equal(provenance.nativeExports.source,'@zvec/zvec');assert.equal(provenance.nativeExports.version,'0.7.0');
  for(const item of provenance.artifacts){const bytes=await readFile(path.join(vendor,item.path));assert.equal(bytes.length,item.bytes);assert.equal(sha(bytes),item.sha256);}
  for(const item of provenance.licenses)assert.equal(sha(await readFile(path.join(root,item.path))),item.sha256);
  assert.match((await readFile(path.join(root,'licenses/zg-LICENSE.txt'),'utf8')),/Apache License/);assert.match((await readFile(path.join(root,'licenses/zg-NOTICE.txt'),'utf8')),/Internal API notice/);
  const core=await readFile(path.join(vendor,'zg-core.js'),'utf8');assert.match(core,/new URL\("\.\/zg-model2vec-worker\.js", import\.meta\.url\)/);assert.doesNotMatch(core,/new URL\("\.\/model2vec-worker\.js"/);
  for(const name of provenance.externalImports)assert.ok(name.startsWith('node:')||Object.hasOwn(ZG_RUNTIME_DEPENDENCIES,name)||Object.hasOwn(ZG_OPTIONAL_BINDINGS,name));assert.deepEqual(provenance.optionalDependencies,ZG_OPTIONAL_BINDINGS);assert.equal(Object.hasOwn(ZG_RUNTIME_DEPENDENCIES,'@zvec/zvec'),false);assert.equal(Object.hasOwn(ZG_RUNTIME_DEPENDENCIES,'zod'),false);assert.equal(Object.hasOwn(ZG_RUNTIME_DEPENDENCIES,'jsonc-parser'),false);
});

test('vendored entry imports native SDK exports and disabled heavy models throw before any network call',async()=>{
  const load=Module._load,bindings=[];Module._load=function(request,...args){assert.ok(!['@zvec/zvec','detect-libc'].includes(request),'Removed wrapper packages cannot be loaded');if(String(request).includes('bindings-'))bindings.push(request);return load.call(this,request,...args);};let sdk;try{sdk=await import('./vendor/zg-core.js');}finally{Module._load=load;}assert.ok(bindings.some(request=>String(request).endsWith('zvec_node_binding.node')));for(const name of provenance.exports)assert.ok(name in sdk,name);assert.equal(typeof sdk.WorkspaceIndex,'function');assert.equal(typeof sdk.readWorkspaceManifest,'function');
  const original=globalThis.fetch;let network=0;globalThis.fetch=async()=>{network++;throw Error('Disabled embedding backends cannot access the network');};try{
    for(const model of ['local/bge-small-en-v1.5','local/all-minilm-l6-v2','local/embeddinggemma-300m','local/qwen3-embedding-0.6b'])assert.throws(()=>sdk.createEmbeddingModel(model),{code:'ZG_EMBEDDING_BACKEND_NOT_INCLUDED'});
    const local=sdk.createEmbeddingModel('local/potion-code-16m-v2');assert.equal(local.info.dimension,256);assert.equal(local.info.reference,'local/potion-code-16m-v2');await local.dispose();assert.equal(network,0);
  }finally{globalThis.fetch=original;}
});

test('official native exports index and reopen genuine vector-free FTS without model or wrapper packages',async()=>{
  const scratch=await mkdtemp(path.join(os.tmpdir(),'zg-vendor-fts-'));
  try{
    const script=`
      import assert from 'node:assert/strict';
      import Module from 'node:module';
      import path from 'node:path';
      const load=Module._load;
      Module._load=function(request,...args){assert.ok(!['@zvec/zvec','detect-libc','@huggingface/transformers','node-llama-cpp'].includes(request),'Must use inlined wrapper and no model provider');return load.call(this,request,...args);};
      let network=0;globalThis.fetch=async()=>{network++;throw Error('FTS-only must not download models');};
      const core=await import(${JSON.stringify(pathToFileURL(path.join(vendor,'zg-core.js')).href)});
      core.ZVecInitialize({logLevel:core.ZVecLogLevel.ERROR,queryThreads:1,optimizeThreads:1});
      const schema=new core.ZVecCollectionSchema({name:'fts_only',fields:[{name:'text',dataType:core.ZVecDataType.STRING,nullable:false,indexParams:{indexType:core.ZVecIndexType.FTS,tokenizerName:'jieba',filters:['lowercase']}}]});
      assert.deepEqual(schema.vectors(),[]);
      const collectionPath=path.join(process.argv[1],'collection');
      let collection=core.ZVecCreateAndOpen(collectionPath,schema);
      const query={fieldName:'text',fts:{matchString:'authentication'},topk:5};
      const check=()=>{const hits=collection.querySync(query);assert.equal(hits.length,1);assert.equal(hits[0].id,'auth');assert.equal(hits[0].fields.text,'Authentication user tokens 中文登录认证');assert.ok(Number.isFinite(hits[0].score)&&hits[0].score>0);assert.deepEqual(hits[0].vectors,{});assert.deepEqual(collection.querySync({...query,fts:{matchString:'nonexistentterm'}}),[]);return hits;};
      let hits;
      try{
        collection.insertSync([{id:'auth',fields:{text:'Authentication user tokens 中文登录认证'}},{id:'other',fields:{text:'Rendering colors and typography'}}]);
        check();collection.optimizeSync();hits=check();
      }finally{collection.closeSync();}
      collection=core.ZVecOpen(collectionPath,{readOnly:true});
      try{assert.deepEqual(collection.schema.vectors(),[]);check();const chinese=collection.querySync({...query,fts:{matchString:'认证'}});assert.equal(chinese[0].id,'auth');assert.ok(chinese[0].score>0);}finally{collection.closeSync();}
      assert.equal(network,0);console.log(JSON.stringify({id:hits[0].id,score:hits[0].score,vectors:hits[0].vectors,network}));
    `;
    const result=spawnSync(process.execPath,['--input-type=module','-e',script,scratch],{cwd:root,encoding:'utf8',timeout:30000,env:{...process.env,XDG_CACHE_HOME:path.join(scratch,'unused-model-cache')}});
    assert.equal(result.status,0,result.stderr);const evidence=JSON.parse(result.stdout.trim());assert.equal(evidence.id,'auth');assert.ok(evidence.score>0);assert.deepEqual(evidence.vectors,{});assert.equal(evidence.network,0);
  }finally{
    // Only remove the uniquely created test directory after verifying its absolute target.
    assert.equal(path.dirname(path.resolve(scratch)),path.resolve(os.tmpdir()));assert.ok(path.basename(scratch).startsWith('zg-vendor-fts-'));await rm(scratch,{recursive:true,force:true});
  }
});

test('official inlined native selector covers all six platform/libc packages with fixed upstream version',{skip:hasVerifiedSourceCache?false:'Pinned upstream source cache is required for selector audit.'},async()=>{
  assert.equal(provenance.embeddedSources.find(s=>s.name==='@zvec/zvec').integrity,ZVEC_WRAPPER_SOURCE.integrity);assert.equal(provenance.embeddedSources.find(s=>s.name==='detect-libc').integrity,LIBC_SOURCE.integrity);
  for(const source of provenance.embeddedSources)for(const file of source.files)assert.equal(sha(await readFile(path.join(cacheBase,source.cacheDirectory,'source',file.path))),file.sha256);
  const code=await readFile(path.join(cacheBase,'zvec-0.7.0/source/src/prebuilt.js'),'utf8'),module={exports:{}};vm.runInNewContext(code,{module,process:{platform:process.platform,arch:process.arch,argv:[]},require:name=>{assert.equal(name,'detect-libc');return {familySync:()=>null,GLIBC:'glibc',MUSL:'musl'};}});
  for(const target of ['darwin-arm64','linux-arm64','linux-arm64-musl','linux-x64','linux-x64-musl','win32-x64']){const [platform,arch,libc]=target.split('-'),options={platform,arch,...(platform==='linux'?{libc:libc==='musl'?'musl':'glibc'}:{})},selected=module.exports.resolvePrebuiltTarget(options);assert.equal(selected.packageName,'@zvec/bindings-'+target);assert.equal(ZG_OPTIONAL_BINDINGS[selected.packageName],'0.7.0');}
  assert.throws(()=>module.exports.resolvePrebuiltTarget({platform:'darwin',arch:'x64'}),/No prebuilt binding/);
});

test('tree-sitter runtime and every official supported grammar resolve from installed vendor package location',async()=>{
  const require=createRequire(new URL('./vendor/zg-core.js',import.meta.url)),Parser=(await import('web-tree-sitter')).default;
  await Parser.init();const grammarRoot=path.join(require.resolve('tree-sitter-wasms/package.json'),'..','out');
  for(const language of ['c','cpp','go','java','javascript','python','rust','tsx','typescript']){const wasm=path.join(grammarRoot,'tree-sitter-'+language+'.wasm');assert.ok((await stat(wasm)).size>0);const grammar=await Parser.Language.load(wasm),parser=new Parser();parser.setLanguage(grammar);const tree=parser.parse('value = 1');assert.ok(tree.rootNode);tree.delete();parser.delete();}
  const {rgPath}=await import('@vscode/ripgrep');assert.ok((await stat(rgPath)).size>0);const result=spawnSync(rgPath,['--version'],{encoding:'utf8',timeout:10000});assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/ripgrep/);
});

test('offline rebuild reproduces SDK, worker, licenses and provenance byte for byte',{skip:hasVerifiedSourceCache?false:'Run build-zg-runtime.mjs once to seed the pinned verified npm tar cache; tests never download implicitly.'},async()=>{
  const paths=[...provenance.artifacts.map(f=>path.join(vendor,f.path)),...provenance.licenses.map(f=>path.join(root,f.path)),path.join(vendor,'zg-provenance.json')],before=await Promise.all(paths.map(p=>readFile(p)));
  const result=spawnSync(process.execPath,[path.join(root,'build-zg-runtime.mjs'),'--offline'],{cwd:root,encoding:'utf8',timeout:30000});assert.equal(result.status,0,result.stderr);assert.doesNotMatch(result.stderr,/Downloading|npm install/);const after=await Promise.all(paths.map(p=>readFile(p)));for(let i=0;i<paths.length;i++)assert.deepEqual(after[i],before[i],path.basename(paths[i]));
});

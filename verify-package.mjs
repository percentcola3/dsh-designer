import {readFile} from 'node:fs/promises';
import {execFileSync,spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {isBuiltin} from 'node:module';
import {build} from 'esbuild-wasm';

// Validate the real npm file set and Host import closure, without mounting a fake UI.
const root=fileURLToPath(new URL('.',import.meta.url));
const manifest=JSON.parse(await readFile(new URL('./package.json',import.meta.url),'utf8'));
const packed=JSON.parse(execFileSync('npm',['pack','--dry-run','--json'],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024}))[0];
const names=new Set(packed.files.map(f=>f.path));
const problems=[];
for(const name of ['index.js','client.js','diagnostics-service.js','diagnostics-guides.js','ai-adapter.js','resource-service.js','upload-service.js','capture-service.js','cordis.patch.yml','knowledge-service.js','knowledge-import-service.js','knowledge-import-helper.js','knowledge-lexical-engine.js','zg-service.js','zg-helper.js','zg-runtime.js','vendor/zg-core.js','vendor/zg-model2vec-worker.js','vendor/zg-provenance.json'])if(!names.has(name))problems.push('Required runtime file is absent: '+name);
const hostFiles=packed.files.filter(f=>f.path.endsWith('.js')&&f.path!=='client.js');
const dependencies=new Set([...Object.keys(manifest.dependencies||{}),...Object.keys(manifest.optionalDependencies||{})]);
let imports=0;
for(const file of hostFiles){
  const absolute=path.resolve(root,file.path);
  const syntax=spawnSync(process.execPath,['--check',absolute],{encoding:'utf8'});
  if(syntax.status!==0)problems.push(file.path+': '+syntax.stderr.trim());
}
// Parse actual imports rather than mistaking CSS @import or browser-script strings for Host dependencies.
const graph=await build({entryPoints:['index.js','builtin-git-helper.js','knowledge-import-helper.js','zg-helper.js','vendor/zg-model2vec-worker.js'],outdir:'__verify_only__',absWorkingDir:root,bundle:true,write:false,metafile:true,format:'esm',platform:'node',packages:'external',logLevel:'silent'});
for(const [file,info] of Object.entries(graph.metafile.inputs)){
  if(!names.has(file))problems.push('Host entry links an unpacked source file: '+file);
  for(const entry of info.imports){
    imports++;
    if(!entry.external){if(!names.has(entry.path))problems.push(file+' imports an unpacked file: '+entry.path);continue;}
    if(isBuiltin(entry.path))continue;
    const name=entry.path.startsWith('@')?entry.path.split('/').slice(0,2).join('/'):entry.path.split('/')[0];
    if(!dependencies.has(name))problems.push(file+' imports an undeclared runtime dependency: '+entry.path);
  }
}
const clientSyntax=spawnSync(process.execPath,['--check',path.join(root,'client.js')],{encoding:'utf8'});
if(clientSyntax.status!==0)problems.push('client.js: '+clientSyntax.stderr.trim());
if(problems.length){console.error(problems.join('\n'));process.exit(1);}
// The bundled native selector is dynamic; verify every platform binding against the pinned provenance.
const provenance=JSON.parse(await readFile(path.join(root,'vendor/zg-provenance.json'),'utf8'));
for(const [name,version] of Object.entries(provenance.runtimeDependencies||{}))if(manifest.dependencies?.[name]!==version)problems.push('zg runtime dependency version differs from provenance: '+name);
for(const [name,version] of Object.entries(provenance.optionalDependencies||{}))if(manifest.optionalDependencies?.[name]!==version)problems.push('zg native binding version differs from provenance: '+name);
if(manifest.dependencies?.['@zvec/zvec'])problems.push('The bundled native wrapper must not require an installation script');
if(problems.length){console.error(problems.join('\n'));process.exit(1);}
// Loading the actual ESM entry verifies named exports and linked runtime dependencies.
await import(pathToFileURL(path.join(root,'index.js')).href);
console.log(JSON.stringify({name:manifest.name,version:manifest.version,files:packed.files.length,hostModules:hostFiles.length,staticImports:imports,packedBytes:packed.size,unpackedBytes:packed.unpackedSize,react:'Host external; checked by the Client build',status:'passed'},null,2));

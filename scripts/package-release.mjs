import {readFile,writeFile,mkdir,appendFile,access} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const root=fileURLToPath(new URL('../',import.meta.url)),out=path.join(root,'artifacts');
const manifest=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
assert.equal(manifest.private,true,'This repository distributes private GitHub releases, not npm publications');
await access(path.join(root,'client.js'));
await mkdir(out,{recursive:true});
const [result]=JSON.parse(execFileSync('npm',['pack','--json','--pack-destination',out],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024}));
assert.equal(result.version,manifest.version);
assert.equal(path.basename(result.filename),result.filename);
const bytes=await readFile(path.join(out,result.filename)),sha256=createHash('sha256').update(bytes).digest('hex');
await writeFile(path.join(out,'SHA256SUMS'),sha256+'  '+result.filename+'\n');
let commit=null;try{commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{/* Local pre-commit package checks have no commit yet. */}
await writeFile(path.join(out,'release.json'),JSON.stringify({name:manifest.name,version:manifest.version,filename:result.filename,sha256,bytes:bytes.length,commit,node:process.version},null,2)+'\n');
if(process.env.GITHUB_OUTPUT)await appendFile(process.env.GITHUB_OUTPUT,`version=${manifest.version}\nfilename=${result.filename}\n`);
console.log(JSON.stringify({version:manifest.version,filename:result.filename,sha256,bytes:bytes.length},null,2));

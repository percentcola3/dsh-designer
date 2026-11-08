import {readdir, mkdir, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2),focused=args.includes('--focused'),models=args.includes('--models');
const forwarded=args.filter(value=>!['--focused','--models'].includes(value));
const options=forwarded.filter(value=>value.startsWith('--'));
let files=forwarded.filter(value=>!value.startsWith('--'));
if(focused&&!files.length)throw new Error('Pass test files, for example: npm run test:focused -- ui/skill-file-draft.test.js');
if(!files.length){
  if(models)files=['zg-helper.test.js'];
  else for(const directory of ['.','ui','editor'])for(const name of (await readdir(path.join(root,directory))).sort())if(name.endsWith('.test.js'))files.push(path.join(directory,name));
}
for(const file of files){const absolute=path.resolve(root,file);if(!absolute.startsWith(root)||!file.endsWith('.test.js')||!(await stat(absolute)).isFile())throw new Error('Tests must be .test.js files within this repository: '+file);}
await mkdir(path.join(root,'.build'),{recursive:true});
const env={...process.env,...(models?{DSH_MODEL_TESTS:'1'}:{})};
const child=spawn(process.execPath,['--test','--test-concurrency=4',...options,...files],{cwd:root,env,stdio:'inherit'});
child.once('error',error=>{console.error(error.message);process.exitCode=1;});
child.once('exit',(code,signal)=>{if(signal)console.error('Test process ended: '+signal);process.exitCode=code??1;});

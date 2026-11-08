import {spawn} from 'node:child_process';
import {access, mkdir, readFile, realpath, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const plugin=repo;
const debugRoot=path.join(repo,'.build/designer-debug');
const home=path.join(debugRoot,'home');
const workspace=path.join(debugRoot,'workspace');
const resources=process.env.DSH_APP_RESOURCES||'/Applications/DeepSeek Harness.app/Contents/Resources';
const cli=path.join(resources,'runtime/cli/bin/dsh');
const args=process.argv.slice(2);
const flags=new Set(['--help','--no-open','--no-build','--setup-only','--smoke']);
let port='0';
for(let i=0;i<args.length;i++){
  if(args[i]==='--port'){
    port=args[++i];
    if(!/^\d+$/.test(port||'')||Number(port)>65535)throw new Error('--port must be between 0 and 65535');
  }else if(!flags.has(args[i]))throw new Error(`Unknown argument: ${args[i]}`);
}
if(args.includes('--help')){
  console.log(`Usage: sh scripts/designer-debug.sh [options]

Start the locally linked Designer plugin in a separate DSH Web instance.
All profile data stays under .build/designer-debug/home.
Test projects stay under .build/designer-debug/workspace.

  --port <number>  Listen port (default: 0, choose a free port)
  --no-open        Print the authenticated URL without opening a browser
  --no-build       Reuse the existing client.js instead of rebuilding it
  --setup-only     Prepare/build the isolated profile without serving
  --smoke          Check real startup, authentication and plugin API, then stop
  --help          Print this help without changing files

Stop a running instance with Ctrl+C. Run this command again to restart.
No production settings, credentials, sessions or design files are copied.`);
  process.exit(0);
}
const env={...process.env,DSH_HOME:home,DSH_TELEMETRY_DISABLED:'1',DSH_PERMISSION_MODE:'workspace-write',npm_config_cache:path.join(debugRoot,'npm-cache')};
// Runtime-context values belong to the parent session, not this new instance.
delete env.DSH_WEB_URL;
function run(command,argv,{cwd=workspace,quiet=false}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(command,argv,{cwd,env,stdio:quiet?'ignore':'inherit'});
    const interrupt=()=>child.kill('SIGINT'),terminate=()=>child.kill('SIGTERM');
    process.once('SIGINT',interrupt);process.once('SIGTERM',terminate);
    child.once('error',finish);child.once('exit',(code,signal)=>finish(code===0?null:new Error(`Command failed (${signal||code}): ${path.basename(command)} ${argv.join(' ')}`)));
    function finish(error){process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',terminate);if(error)reject(error);else resolve();}
  });
}
function redact(value){return String(value).replace(/([?&]token=)[^\s"'<>]+/g,'$1[redacted]');}
async function smoke(launchArgs){
  const child=spawn(cli,launchArgs,{cwd:workspace,env,stdio:['ignore','pipe','pipe']});
  let output='',resolveReady,rejectReady;
  const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
  const exited=new Promise(resolve=>child.once('close',(code,signal)=>{resolve({code,signal});rejectReady(new Error(`Debug host exited before readiness (${signal||code}).\n${redact(output)}`));}));
  child.once('error',rejectReady);
  for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{
    output=(output+String(chunk)).slice(-32000);
    const match=/dsh web: (https?:\/\/[^\s\u001b]+)/u.exec(output);
    if(match){const url=new URL(match[1]);if(url.hostname==='127.0.0.1'&&url.searchParams.has('token'))resolveReady(url);}
  });
  const interrupt=()=>child.kill('SIGTERM');
  process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
  const timeout=setTimeout(()=>rejectReady(new Error(`Host startup timed out.\n${redact(output)}`)),45000);
  try{
    const launch=await ready;
    clearTimeout(timeout);
    const origin=launch.origin;
    const request=(url,options={})=>fetch(url,{...options,signal:AbortSignal.timeout(10000)});
    const anonymous=await request(origin,{redirect:'manual'});
    if(anonymous.status!==401)throw new Error(`Expected unauthenticated HTTP 401, received ${anonymous.status}`);
    const login=await request(launch,{redirect:'manual'});
    const cookie=login.headers.getSetCookie().map(value=>value.split(';',1)[0]).join('; ');
    if(login.status<200||login.status>=400||!cookie)throw new Error(`Authentication exchange failed: HTTP ${login.status}`);
    const headers={Cookie:cookie,Origin:origin};
    const page=await request(origin,{headers});
    if(page.status!==200||!(await page.text()).includes('__DSH_BOOT__'))throw new Error('Authenticated Web bootstrap was not served');
    const call=async action=>{
      const response=await request(origin+'/api/designer',{method:'POST',headers:{...headers,'Content-Type':'application/json','X-Designer-Action':action},body:JSON.stringify({action})});
      const value=await response.json();
      if(!response.ok||!value.ok)throw new Error(`Designer ${action}: ${value.error?.code||response.status}: ${value.error?.message||'request failed'}`);
      return value.value;
    };
    const state=await call('state');
    if(path.resolve(state.root)!==path.join(workspace,'DesignerLibrary'))throw new Error('Designer library is not the isolated test library');
    if(path.resolve(state.permissions.workspaceRoot)!==workspace||state.permissions.mode!=='workspace-write')throw new Error('Unexpected debug workspace policy');
    const status=await call('workbench.status');
    const tools=status.schemas.installedGlobalNames;
    if(!['designer_manage','designer_import','designer_workbench'].every(name=>tools.includes(name)))throw new Error('Designer tools did not register');
    if(status.taskRecoveryErrors.length)throw new Error('Designer task recovery errors were reported');
    console.log(JSON.stringify({result:'passed',origin,authentication:'anonymous 401; authenticated bootstrap 200',pluginVersion:JSON.parse(await readFile(path.join(plugin,'package.json'),'utf8')).version,tools,libraryRoot:state.root,workspaceRoot:workspace,projects:state.projects.length,gui:'not exercised',model:'not exercised'},null,2));
  }finally{
    clearTimeout(timeout);
    process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);
    if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');
    const force=setTimeout(()=>child.kill('SIGKILL'),8000);
    await exited;clearTimeout(force);
  }
}
try{
  await access(cli);
  await access(path.join(plugin,'node_modules/parse5/package.json'));
  await mkdir(workspace,{recursive:true});
  await mkdir(home,{recursive:true,mode:0o700});
  // Refuse symlinked debug roots so the test home cannot silently become production.
  if(await realpath(debugRoot)!==debugRoot||await realpath(home)!==home||await realpath(workspace)!==workspace)throw new Error('Debug directories must not be symbolic links');
  if(!args.includes('--no-build')){
    console.log('Building local Designer client…');
    await run(process.execPath,['build.mjs'],{cwd:plugin});
  }
  await run(cli,['web','--dump-default-config'],{quiet:true});
  console.log('Linking local plugin into the isolated Web profile (offline)…');
  await run(cli,['plugin','--profile','web','add','--offline','--ignore-scripts','--store-dir',path.join(debugRoot,'pnpm-store'),`link:${plugin}`]);
  const overlay=path.join(debugRoot,'debug.patch.yml');
  await writeFile(overlay,`# Generated local debug overlay; production profiles are not changed.\n- id: sandbox-policy\n  config:\n    mode: workspace-write\n    workspaceRoot: ${JSON.stringify(workspace)}\n- id: designer-studio\n  config:\n    workspaceRoot: ${JSON.stringify(workspace)}\n    libraryRoot: ${JSON.stringify(path.join(workspace,'DesignerLibrary'))}\n`);
  console.log(`Debug home: ${home}\nTest workspace: ${workspace}\nLocal plugin: ${plugin}`);
  if(!args.includes('--setup-only')){
    const launchArgs=['web','--patch',overlay,'--host','127.0.0.1','--port',port,...(args.includes('--no-open')||args.includes('--smoke')?['--no-open']:[])];
    if(args.includes('--smoke'))await smoke(launchArgs);
    else{
      console.log('Open the COMPLETE launch URL printed below. Keep this terminal open; Ctrl+C stops only this instance.');
      await run(cli,launchArgs);
    }
  }
}catch(error){console.error(redact(error.message));process.exitCode=1;}

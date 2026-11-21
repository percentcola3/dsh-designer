import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {installPageFreeze,patchPageSource} from './freeze.js';

test('live dialog and its handlers survive an in-place patch while timers are held',{skip:!process.env.CHROME_BIN},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'designer-freeze-'));
  try{
    const body='<dialog data-dsh-node="d"><h2 data-dsh-node="t">原文</h2><input data-dsh-node="i"><button data-dsh-node="b">关闭</button></dialog>';
    const source='<!doctype html><body>'+body+'</body>';
    const updated=source.replace('原文','新标题').replace('<h2 ','<h2 style="color: red" ');
    const script=`const nativeLater=window.setTimeout.bind(window);
      const freeze=(${installPageFreeze.toString()})(),patch=(${patchPageSource.toString()});
      const dialog=document.querySelector('dialog'),field=document.querySelector('input'),button=document.querySelector('button');
      field.value='未提交';dialog.showModal();button.onclick=()=>dialog.close();dialog.classList.add('runtime');
      let elapsed=false,cleared=false;setTimeout(()=>elapsed=true,80);const cancelled=setInterval(()=>cleared=true,50);
      freeze(true);clearTimeout(cancelled);
      nativeLater(()=>{
        button.click();
        const paused=!elapsed&&!cleared&&dialog.matches(':modal');
        const patched=patch(${JSON.stringify(source)},${JSON.stringify(updated)});
        const state=field.value==='未提交'&&dialog.matches(':modal')&&dialog.classList.contains('runtime')&&document.querySelector('h2').textContent==='新标题'&&document.querySelector('h2').style.color==='red';
        freeze(false);button.click();
        nativeLater(()=>document.body.textContent=JSON.stringify({paused,patched,state,closed:!dialog.open,elapsed,cleared}),150);
      },150);`;
    const file=join(dir,'test.html');await writeFile(file,source.replace('</body>','<script>'+script+'</script></body>'));
    const output=execFileSync(process.env.CHROME_BIN,['--headless','--disable-gpu','--no-first-run','--disable-background-networking','--user-data-dir='+join(dir,'profile'),'--virtual-time-budget=1200','--dump-dom',pathToFileURL(file).href],{encoding:'utf8',timeout:20000,stdio:['ignore','pipe','pipe']});
    assert.deepEqual(JSON.parse(output.match(/<body>(\{[^<]+\})<\/body>/)[1]),{paused:true,patched:true,state:true,closed:true,elapsed:true,cleared:false});
  }finally{await rm(dir,{recursive:true,force:true,maxRetries:4,retryDelay:75});}
});

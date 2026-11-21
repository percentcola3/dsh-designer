import assert from 'node:assert/strict';
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {mobileComponentsScript} from '../mobile-components.js';
import {installPageFreeze} from './freeze.js';

test('portable pickers respect constraints, touch targets, scrolling and frozen hover', {skip: !process.env.CHROME_BIN}, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'designer-pickers-'));
  try {
    const page = join(dir, 'index.html');
    const probe = () => {
      const byId = id => document.getElementById(id);
      const popup = () => document.querySelector('[data-dsh-controlled="canvas-date-picker"]:popover-open').shadowRoot;
      function pick(id, selector) {
        const field = byId(id);
        field.click();
        popup().querySelector(selector).click();
        return field.value;
      }
      const result = {};
      result.month = pick('month','[data-date="2026-12"]');
      result.week = pick('week','[data-date="2026-W48"]');
      byId('date').click();
      const cell = popup().querySelector('[data-date]');
      result.touch = [cell.offsetWidth, cell.offsetHeight];
      popup().querySelector('[aria-pressed=true]').click();
      for (const type of ['time','datetime-local']) {
        const field = byId(type), changes = [];
        field.addEventListener('input', () => changes.push('input'));
        field.addEventListener('change', () => changes.push('change'));
        field.click();
        const root = popup(), minute = root.querySelector('[data-part=m]'), apply = root.querySelector('[data-action=apply]');
        function setMinute(value) { minute.value = value; minute.dispatchEvent(new Event('input', {bubbles:true})); }
        setMinute('03'); const invalid = apply.disabled;
        setMinute('15'); apply.click();
        result[type] = {value:field.value, invalid, changes};
      }
      byId('color').click();
      popup().querySelector('[data-color="#ff4d4f"]').click();
      popup().querySelector('[data-action=apply]').click();
      result.color = byId('color').value;
      const tip = byId('tip'), panel = tip.querySelector('[popover]'), anchor = tip.querySelector('button');
      tip.dispatchEvent(new PointerEvent('pointerenter'));
      const distance = () => Math.round(panel.getBoundingClientRect().top - anchor.getBoundingClientRect().top);
      const before = distance();
      byId('scroll').scrollTop = 40;
      byId('scroll').dispatchEvent(new Event('scroll'));
      result.staysAnchored = before === distance();
      window.freezeTest(true);
      tip.dispatchEvent(new PointerEvent('pointerleave'));
      result.frozen = panel.matches(':popover-open');
      window.freezeTest(false);
      tip.dispatchEvent(new PointerEvent('pointerleave'));
      result.resumed = !panel.matches(':popover-open');
      document.body.textContent = JSON.stringify(result);
    };
    const fields = [['month','2026-11'],['week','2026-W47'],['date','2026-11-19'],['time','12:00'],['datetime-local','2026-11-19T12:00'],['color','#000000']];
    await writeFile(page, `<!doctype html><meta charset="utf-8"><script>window.freezeTest=(${installPageFreeze})();</script><script>${mobileComponentsScript()}</script>
      <body class="ds-theme ds-mobile">${fields.map(([type,value]) => `<ds-input><input type="${type}" id="${type}" value="${value}" ${type.includes('time') ? 'step="900"' : ''}></ds-input>`).join('')}
      <div id="scroll" style="height:130px;overflow:auto;margin-top:100px"><div style="height:80px"></div><ds-tooltip id="tip"><button data-trigger>提示</button><div data-floating-content>内容</div></ds-tooltip><div style="height:160px"></div></div>
      <script>addEventListener('load',(${probe}));</script>`);
    const output = execFileSync(process.env.CHROME_BIN, ['--headless','--disable-gpu','--no-first-run','--user-data-dir='+join(dir,'profile'),'--virtual-time-budget=1500','--dump-dom',pathToFileURL(page).href], {encoding:'utf8',timeout:20000,stdio:['ignore','pipe','pipe']});
    const actual = JSON.parse(output.match(/<body[^>]*>(\{[^<]+\})<\/body>/)[1]);
    assert.deepEqual(actual, {month:'2026-12',week:'2026-W48',touch:[44,44],time:{value:'12:15',invalid:true,changes:['input','change']},'datetime-local':{value:'2026-11-19T12:15',invalid:true,changes:['input','change']},color:'#ff4d4f',staysAnchored:true,frozen:true,resumed:true});
  } finally { await rm(dir,{recursive:true,force:true,maxRetries:3}); }
});

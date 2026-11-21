import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parse} from 'parse5';
import {desktopSystemFiles, normalizeDesktopTheme, desktopThemeCSS, desktopThemeTokens, desktopThemeContrast, desktopComponentManifest, desktopExampleHTML, DESKTOP_THEME_FORMAT} from './desktop-theme.js';
import {desktopComponentsScript} from './desktop-components.js';

function descendants(node) {return [node, ...(node.childNodes || []).flatMap(descendants)];}
const attr = (node, name) => node.attrs?.find(attr => attr.name === name)?.value;

test('PC theme packages contain executable components, matching schema and local HTML dependencies', () => {
  const files = desktopSystemFiles({primary: '#663399', radius: 12, fontSize: 16});
  const find = name => files.find(file => file.logicalPath === name);
  const config = JSON.parse(find('tokens.json').content);
  assert.equal(config.format, DESKTOP_THEME_FORMAT);
  assert.equal(config.values.primary, '#663399');
  assert.equal(config.values.radius, 12);
  assert.match(find('theme.css').content, /--ds-primary: #663399/);
  assert.match(find('theme.css').content, /--ds-radius: 12px/);
  const nodes = descendants(parse(find('examples/components.html').content));
  for (const node of nodes) {
    const href = node.tagName === 'link' ? attr(node, 'href') : node.tagName === 'script' ? attr(node, 'src') : undefined;
    if (href) assert.ok(find(href.replace(/^\.\.\//, '')), href);
    if (node.tagName?.startsWith('ds-')) assert.ok(desktopComponentManifest.components.some(component => component.tag === node.tagName), node.tagName);
  }
  assert.doesNotThrow(() => new vm.Script(find('components.js').content));
  assert.match(find('rule.md').content, /theme\.css/);
  assert.match(find('rule.md').content, /designer_commit_html/);
});

test('theme inputs preserve independent systems and constrain stylesheet values', () => {
  assert.equal(normalizeDesktopTheme({radius: 100}).radius, 24);
  assert.equal(normalizeDesktopTheme({radius: -8}).radius, 0);
  assert.equal(normalizeDesktopTheme({radius: NaN}).radius, 6);
  const malicious = {primary: 'red;}body{display:none}', fontFamily: 'x;</style><script>bad()</script>'};
  const css = desktopThemeCSS(malicious);
  assert.ok(!css.includes('<script>'));
  assert.equal(normalizeDesktopTheme(malicious).primary, '#1677ff');
  assert.notEqual(desktopThemeCSS({primary: '#663399'}), desktopThemeCSS({primary: '#1677ff'}));
  assert.equal(normalizeDesktopTheme().primary, '#1677ff');
  assert.ok(!desktopComponentsScript().includes('#1677ff'));
});

test('preview and exported examples use the same component implementation', () => {
  const preview = descendants(parse(desktopExampleHTML({inline: true, tokens: {primary: '#663399'}})));
  const exported = descendants(parse(desktopExampleHTML()));
  const tags = nodes => nodes.filter(node => node.tagName?.startsWith('ds-')).map(node => node.tagName);
  assert.deepEqual(tags(preview), tags(exported));
  const script = preview.find(node => node.tagName === 'script');
  assert.equal(script.childNodes[0].value, desktopComponentsScript());
  assert.ok(preview.some(node => node.tagName === 'style' && node.childNodes[0]?.value.includes('--ds-primary: #663399')));
});

test('rendered PC overlay headers, fields and footer controls align at the theme edges', {skip: !process.env.CHROME_BIN}, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'designer-overlay-'));
  try {
    const probe = `<script>addEventListener('load', () => {
      const results = [];
      for (const id of ['preview-dialog', 'preview-drawer']) {
        const host = document.getElementById(id);
        host.showModal();
        const dialog = host.querySelector('dialog');
        const close = dialog.querySelector('header button[data-ds-close]');
        const style = getComputedStyle(close);
        const title = dialog.querySelector('header span').getBoundingClientRect();
        const field = dialog.querySelector('[data-dialog-body] label').getBoundingClientRect();
        const footer = dialog.querySelector('footer button');
        results.push({
          size: [style.width, style.height], border: style.borderWidth,
          aligned: Math.abs(title.left - field.left) < 1,
          footerHeight: getComputedStyle(footer).height,
        });
        close.click();
        results.at(-1).closed = !dialog.open;
      }
      document.body.textContent = JSON.stringify(results);
    });</script>`;
    const path = join(dir, 'overlays.html');
    await writeFile(path, desktopExampleHTML({inline: true}).replace('</body>', probe + '</body>'));
    const html = execFileSync(process.env.CHROME_BIN, ['--headless', '--disable-gpu', '--disable-background-networking',
      '--no-first-run', '--user-data-dir=' + join(dir, 'profile'), '--dump-dom', pathToFileURL(path).href],
      {encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'pipe']});
    const body = descendants(parse(html)).find(node => node.tagName === 'body');
    const expected = {size: ['24px', '24px'], border: '0px', aligned: true, footerHeight: '32px', closed: true};
    assert.deepEqual(JSON.parse(body.childNodes[0].value), [expected, expected]);
  } finally {
    await rm(dir, {recursive: true, force: true, maxRetries: 3});
  }
});

test('the visual preview can load the exact archived component runtime', () => {
  const runtime = 'window.customRuntime="</script>";';
  const nodes = descendants(parse(desktopExampleHTML({inline: true, runtime})));
  const scripts = nodes.filter(node => node.tagName === 'script');
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].childNodes[0].value, 'window.customRuntime="<\\/script>";');
});

test('feedback components have real triggers and portable overlay definitions', () => {
  const nodes = descendants(parse(desktopExampleHTML()));
  const ids = new Set(nodes.map(node => attr(node, 'id')).filter(Boolean));
  for (const node of nodes) for (const name of ['data-ds-open', 'data-ds-show']) {
    const id = attr(node, name);
    if (id) assert.ok(ids.has(id), id);
  }
  for (const tag of ['ds-drawer', 'ds-toast', 'ds-notification', 'ds-tooltip', 'ds-popconfirm', 'ds-progress', 'ds-skeleton', 'ds-empty']) assert.ok(nodes.some(node => node.tagName === tag), tag);
  const feedback = descendants(parse(desktopExampleHTML({view: 'feedback'})));
  assert.ok(feedback.some(node => node.tagName === 'section' && attr(node, 'aria-label') === '浮层与反馈组件'));
  const legacy = descendants(parse(desktopExampleHTML({feedback: false})));
  assert.ok(!legacy.some(node => node.tagName === 'section' && attr(node, 'aria-label') === '浮层与反馈组件'));
});

test('select gallery covers search, multiple, groups, disabled options and empty states', () => {
  const nodes = descendants(parse(desktopExampleHTML({view: 'select'})));
  const select = name => nodes.find(node => node.tagName === 'ds-select' && attr(node, 'name') === name);
  assert.notEqual(attr(select('owner'), 'searchable'), undefined);
  assert.notEqual(attr(select('owner'), 'clearable'), undefined);
  assert.notEqual(attr(select('members'), 'multiple'), undefined);
  assert.ok(nodes.some(node => node.tagName === 'optgroup' && attr(node, 'disabled') !== undefined));
  assert.ok(nodes.some(node => node.tagName === 'option' && attr(node, 'data-description')));
  const api = desktopComponentManifest.components.find(component => component.tag === 'ds-select');
  for (const name of ['searchable', 'clearable', 'multiple']) assert.ok(api.attributes.includes(name));
  assert.ok(api.events.includes('ds-search'));
  const css = desktopThemeCSS();
  assert.match(css, /min-height:32px;margin:0;padding:5px 12px/);
});


test('select and action-menu spacing use the same configurable gutter', () => {
  assert.equal(normalizeDesktopTheme().optionGap, 2);
  assert.equal(normalizeDesktopTheme({optionGap: 100}).optionGap, 8);
  const css = desktopThemeCSS({optionGap: 4});
  assert.match(css, /--ds-option-gap: 4px/);
  assert.match(css, /\[role=option\]\+\[role=option\] \{ margin-top:var\(--ds-option-gap\)/);
  assert.match(css, /data-menu\] \{ display:flex;flex-direction:column;gap:var\(--ds-option-gap\)/);
});

test('official palettes map brand and independent functional seeds to semantic component states', () => {
  const defaults = desktopThemeTokens();
  assert.deepEqual(defaults.palettes.primary, ['#e6f4ff', '#bae0ff', '#91caff', '#69b1ff', '#4096ff', '#1677ff', '#0958d9', '#003eb3', '#002c8c', '#001d66']);
  assert.equal(defaults.semantic.primaryHover, defaults.palettes.primary[4]);
  assert.equal(defaults.semantic.primaryActive, defaults.palettes.primary[6]);
  assert.equal(defaults.semantic.primarySoft, defaults.palettes.primary[0]);
  const custom = desktopThemeTokens({primary: '#663399', success: '#006666', warning: '#994400'});
  assert.equal(custom.palettes.primary[5], '#663399');
  assert.notEqual(custom.semantic.successSoft, defaults.semantic.successSoft);
  assert.notEqual(custom.semantic.warningBorder, defaults.semantic.warningBorder);
  assert.equal(custom.components.optionSelectedBg, 'var(--ds-primary-soft)');
  const css = desktopThemeCSS({success: '#006666', warning: '#994400'});
  assert.match(css, /ds-alert\[tone=success\] \{ border-color:var\(--ds-success-border\);background:var\(--ds-success-soft\)/);
  assert.match(css, /ds-alert\[tone=warning\] \{ border-color:var\(--ds-warning-border\);background:var\(--ds-warning-soft\)/);
  assert.match(css, /aria-selected=true\]:not\(\[aria-disabled=true\]\):is\(:hover,\[data-active\]\) \{ background:var\(--ds-option-selected-hover-bg\)/);
  assert.doesNotMatch(css, /background:#fffbe6|background:#fff2f0|background:#f6ffed/);
});

test('saved theme layers and scalable typography retain the legacy seed configuration', () => {
  const values = {primary: '#663399', fontSize: 16, spacing: 10, optionGap: 4};
  const config = JSON.parse(desktopSystemFiles(values).find(file => file.logicalPath === 'tokens.json').content);
  assert.equal(config.version, 1);
  for (const [key, value] of Object.entries(values)) assert.equal(config.values[key], value);
  assert.deepEqual(config.derived, desktopThemeTokens(config.values));
  assert.equal(desktopThemeTokens().scales.fontSizeHeading1, '38px');
  assert.equal(desktopThemeTokens().scales.controlHeightSM, '24px');
  assert.equal(desktopThemeTokens().scales.spaceLG, '24px');
  assert.equal(config.derived.scales.spaceLG, '30px');
  assert.equal(config.derived.scales.fontSizeHeading5, '18px');
  const css = desktopThemeCSS(values);
  assert.match(css, /--ds-space-xxs: 5px/);
  assert.match(css, /--ds-control-height-sm: 24px/);
  assert.match(css, /--ds-font-size-heading5: 18px/);
  assert.match(css, /border-radius:var\(--ds-option-radius\)/);
  assert.match(css, /border-radius:var\(--ds-popup-radius\)/);
});

test('contrast checks cover actual normal, hover and active text pairs without changing choices', () => {
  const checks = desktopThemeContrast({text: '#000000', surface: '#ffffff', primary: '#ffffff', primaryText: '#ffffff'});
  assert.equal(checks[0].ratio, 21);
  assert.equal(checks[0].passes, true);
  assert.equal(checks[3].ratio, 1);
  assert.equal(checks[3].passes, false);
  assert.equal(checks.length, 6);
  assert.equal(normalizeDesktopTheme({primary: '#ffffff'}).primary, '#ffffff');
  const defaults = desktopThemeContrast();
  assert.equal(defaults[0].passes, true);
  assert.ok(defaults[4].ratio < defaults[3].ratio);
  assert.ok(defaults[5].ratio > defaults[3].ratio);
});

test('foundation preview uses portable theme tokens and rules describe design decisions', () => {
  const nodes = descendants(parse(desktopExampleHTML({inline: true, view: 'foundations', tokens: {spacing: 10}})));
  assert.ok(nodes.some(node => attr(node, 'aria-label') === '基础设计规范'));
  assert.equal(nodes.filter(node => attr(node, 'class') === 'foundation-palette').length, 5);
  assert.ok(nodes.some(node => attr(node, 'data-theme-value') === '--ds-space-xs' && node.childNodes[0].value === '10px'));
  assert.equal(nodes.filter(node => attr(node, 'data-contrast-index') !== undefined).length, 6);
  const files = desktopSystemFiles();
  const rules = files.find(file => file.logicalPath === 'design-principles.md').content;
  const entry = files.find(file => file.logicalPath === 'rule.md').content;
  assert.ok(entry.length < rules.length / 2);
  for (const instruction of ['任务到组件', 'system.usage', 'design-principles.md', 'querySelector', '保存回执提供结构诊断']) assert.ok(entry.includes(instruction), instruction);
  for (const instruction of ['派生语义', '同一业务类型', '返回、关闭', '信息层级', '3–5', 'tabular-nums', '4.5:1', '错误保留已输入内容']) assert.ok(rules.includes(instruction), instruction);
});

test('desktop patterns retain editable identities, component contracts and complete scene targets',async()=>{
  const {normalizeDocument}=await import('./document-model.js');
  const files=desktopSystemFiles(),find=name=>files.find(file=>file.logicalPath===name);
  const patterns=JSON.parse(find('skeletons.json').content);
  for(const pattern of patterns){
    const source=find(pattern.path).content,document=normalizeDocument(source);
    assert.equal(document.scenes.items.length,pattern.sceneIds.length);
    for(const scene of document.scenes.items)for(const id of Object.keys(scene.nodes))assert.ok(document.nodes[id],id);
    const nodes=descendants(parse(source));
    for(const element of nodes.filter(node=>node.tagName?.startsWith('ds-')))assert.ok(pattern.components.includes(element.tagName),element.tagName);
    for(const row of pattern.editableNodes.records)for(const id of Object.values(row.fields))assert.ok(document.nodes[id],id);
    for(const element of nodes.filter(node=>node.tagName==='script'&&!attr(node,'src')&&!attr(node,'type')))assert.doesNotThrow(()=>new vm.Script(element.childNodes.map(node=>node.value||'').join('')));
  }
});

test('the portable date field anchors its calendar inside a scaled modal and preserves form semantics', {skip: !process.env.CHROME_BIN}, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'designer-date-'));
  try {
    const content = `<!doctype html><html lang="zh-CN"><head><script>${desktopComponentsScript()}</script></head><body>
      <dialog><form><ds-input><input name="joined" type="date" value="2026-11-19" min="2026-11-19" max="2026-11-25" step="2"></ds-input></form></dialog>
      <script>addEventListener('load', () => {
        const field = document.querySelector('input'), dialog = document.querySelector('dialog');
        const events = [];
        dialog.showModal();
        for (const type of ['input','change','ds-change']) field.parentNode.addEventListener(type, () => events.push(type));
        field.click();
        const popup = document.querySelector('[popover]:popover-open');
        const anchor = field.getBoundingClientRect(), box = popup.getBoundingClientRect();
        const button = date => popup.shadowRoot.querySelector('[data-date="' + date + '"]');
        const anchored = Math.abs(anchor.left - box.left) < 1 && Math.min(Math.abs(box.top-anchor.bottom-4), Math.abs(box.bottom-anchor.top+4)) < 1;
        const constrained = button('2026-11-18').disabled && button('2026-11-20').disabled;
        button('2026-11-21').click();
        parent.postMessage({anchored,constrained, events,modal:dialog.open,closed:!popup.isConnected,value:new FormData(field.form).get('joined')}, '*');
      });</script></body></html>`;
    const path = join(dir, 'scaled.html');
    const escaped = content.replaceAll('&','&amp;').replaceAll('"','&quot;');
    await writeFile(path, `<body><script>onmessage=e=>document.body.textContent=JSON.stringify(e.data)</script><iframe style="width:1000px;height:800px;transform:scale(.6);transform-origin:0 0" srcdoc="${escaped}"></iframe></body>`);
    const output = execFileSync(process.env.CHROME_BIN, ['--headless','--disable-gpu','--no-first-run','--user-data-dir='+join(dir,'profile'),'--virtual-time-budget=1500','--dump-dom',pathToFileURL(path).href], {encoding:'utf8',timeout:20000,stdio:['ignore','pipe','pipe']});
    const body = descendants(parse(output)).find(node => node.tagName === 'body');
    const result = JSON.parse(body.childNodes[0].value);
    assert.deepEqual(result, {anchored:true,constrained:true,events:['input','ds-change','change'],modal:true,closed:true,value:'2026-11-21'});
  } finally {
    await rm(dir,{recursive:true,force:true,maxRetries:3});
  }
});

test('desktop presets retain their identity when a user edits a theme token',()=>{
  for(const [preset,name,color] of [['element','Element Plus','#409eff'],['arco','Arco Design','#165dff'],['heroui','HeroUI','#0485f7']]){
    const files=Object.fromEntries(desktopSystemFiles({preset}).map(f=>[f.logicalPath,f.content]));
    const {values}=JSON.parse(files['tokens.json']);
    assert.equal(values.primary,color);assert.equal(values.preset,preset);
    assert.ok(files['rule.md'].includes(name));assert.ok(files['design-principles.md'].includes(name));
    const edited=desktopSystemFiles({...values,radius:14});
    assert.ok(edited.find(f=>f.logicalPath==='theme.css').content.includes('--ds-radius: 14px'));
    assert.equal(JSON.parse(edited.find(f=>f.logicalPath==='tokens.json').content).values.preset,preset);
  }
});

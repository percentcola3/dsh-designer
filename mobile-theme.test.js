import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parse} from 'parse5';
import {mobileSystemFiles, normalizeMobileTheme, mobileThemeCSS, mobileThemeTokens, mobileThemeContrast, mobileExampleHTML, mobileComponentManifest, MOBILE_THEME_FORMAT} from './mobile-theme.js';
import {MOBILE_COMPONENT_VERSION, mobileComponentsScript} from './mobile-components.js';

const nodes = node => [node, ...(node.childNodes || []).flatMap(nodes)];
const attr = (node, name) => node.attrs?.find(attribute => attribute.name === name)?.value;

test('mobile packages deliver their own portable theme, runtime, manifest and examples', () => {
  const files = mobileSystemFiles({primary: '#663399', navBarHeight: 52});
  const find = path => files.find(file => file.logicalPath === path);
  const config = JSON.parse(find('tokens.json').content);
  assert.equal(config.format, MOBILE_THEME_FORMAT);
  assert.equal(config.componentVersion, MOBILE_COMPONENT_VERSION);
  assert.equal(config.values.navBarHeight, 52);
  assert.equal(config.derived.palettes.primary[5], '#663399');
  assert.equal(config.derived.scales.controlHeightSM, '32px');
  assert.equal(config.derived.scales.controlHeightLG, '50px');
  assert.equal(config.derived.scales.fontSizeHeading1, '28px');
  assert.match(find('theme.css').content, /--ds-nav-bar-height: 52px/);
  assert.doesNotThrow(() => new vm.Script(find('components.js').content));
  for (const path of ['examples/components.html', 'examples/page.html']) {
    for (const node of nodes(parse(find(path).content))) {
      const href = node.tagName === 'link' ? attr(node, 'href') : node.tagName === 'script' ? attr(node, 'src') : undefined;
      if (href) assert.ok(find(href.replace(/^\.\.\//, '')), href);
      if (node.tagName?.startsWith('ds-')) assert.ok(mobileComponentManifest.components.some(component => component.tag === node.tagName), node.tagName);
    }
  }
  assert.equal(mobileComponentManifest.platform, 'mobile');
  assert.equal(mobileComponentManifest.components.length, 24);
});

test('mobile defaults and editable constraints maintain touch and safe-area rules', () => {
  const defaults = normalizeMobileTheme();
  assert.equal(defaults.primary, '#1989fa');
  assert.equal(defaults.controlHeight, 44);
  assert.equal(defaults.navBarHeight, 46);
  assert.equal(defaults.tabbarHeight, 50);
  assert.equal(defaults.pagePadding, 16);
  assert.equal(normalizeMobileTheme({touchTarget: 12}).touchTarget, 44);
  assert.equal(normalizeMobileTheme({controlHeight: 20}).controlHeight, 44);
  assert.equal(normalizeMobileTheme({navBarHeight: NaN}).navBarHeight, 46);
  assert.equal(normalizeMobileTheme({primary: 'red;}body{display:none}'}).primary, '#1989fa');
  const css = mobileThemeCSS({success: '#006666', buttonRadius: 12});
  assert.match(css, /env\(safe-area-inset-bottom,0px\)/);
  assert.match(css, /ds-drawer\[placement=bottom\]>dialog/);
  assert.match(css, /min-height:max\(var\(--ds-cell-height\),var\(--ds-touch-target\)\)/);
  assert.match(css, /font-size:var\(--ds-font-size\);line-height:24px/);
  assert.match(css, /--ds-button-radius: 12px/);
  assert.ok(css.includes(mobileThemeTokens({success: '#006666'}).semantic.successSoft));
});

test('Vant mobile presentation has independent field, dialog, choice and navigation styles', () => {
  const css = mobileThemeCSS();
  assert.doesNotMatch(css, /ds-table[\s>{.]|ds-dropdown[\s>{.]|\.wb-modal/);
  assert.match(css, /\.ds-mobile ds-dialog>dialog \{ inset:45% auto auto 50%;width:var\(--ds-dialog-width\)/);
  assert.match(css, /--ds-dialog-width: 320px/);
  assert.match(css, /--ds-dialog-action-height: 48px/);
  assert.match(css, /padding:26px 24px 0;text-align:center/);
  assert.match(css, /padding:8px 24px 26px;text-align:center/);
  assert.match(css, /dialog::backdrop \{ background:rgb\(0 0 0 \/ 70%\)/);
  assert.match(css, /footer ds-button\[variant=primary\]>button \{ color:var\(--ds-primary\)/);
  assert.match(css, /grid-template-columns:6\.2em minmax\(0,1fr\)/);
  assert.match(css, /margin:0;padding:0;border:0;border-radius:0;background:transparent/);
  assert.match(css, /width:20px;height:20px;.*border-radius:50%/);
  assert.match(css, /--ds-switch-size: 26px/);
  assert.match(css, /width:28px;height:28px/);
  assert.match(css, /ds-tabbar \[data-mobile-icon\] \{ font-size:22px/);
  assert.match(css, /@font-face \{ font-family:DSHMobileIcons;src:url\("data:font\/woff2;(?:charset=utf-8;)?base64,/);
  assert.doesNotMatch(css, /url\([^)]*https?:/);
  assert.match(css, /MIT License/);
  assert.match(css, /Youzan/);
  const checks = mobileThemeContrast({primary: '#663399'});
  assert.equal(checks.find(check => check.label === '主按钮文字').ratio, checks.find(check => check.label === '主按钮悬停文字').ratio);
  assert.equal(mobileThemeTokens({primary: '#663399'}).semantic.primaryActive, '#5c2e8a');
});

test('mobile examples and manifest expose Vant-specific structures and variants', () => {
  const example = nodes(parse(mobileExampleHTML()));
  assert.ok(example.some(node => node.tagName === 'ds-drawer' && attr(node, 'data-kind') === 'actions'));
  assert.ok(example.some(node => node.tagName === 'ds-drawer' && attr(node, 'data-kind') === 'selection'));
  assert.ok(example.some(node => node.tagName === 'i' && attr(node, 'data-mobile-icon') === 'home'));
  const component = tag => mobileComponentManifest.components.find(item => item.tag === tag);
  assert.ok(component('ds-button').attributes.includes('plain'));
  assert.ok(component('ds-tag').attributes.includes('plain'));
  assert.ok(component('ds-cell-group').attributes.includes('inset'));
  assert.ok(component('ds-checkbox').attributes.includes('shape=round|square'));
});

test('mobile preview and exported examples share the same runtime and reachable overlay targets', () => {
  const preview = nodes(parse(mobileExampleHTML({inline: true})));
  const exported = nodes(parse(mobileExampleHTML()));
  const tags = rows => rows.filter(node => node.tagName?.startsWith('ds-')).map(node => node.tagName);
  assert.deepEqual(tags(preview), tags(exported));
  const scripts = preview.filter(node => node.tagName === 'script');
  assert.equal(scripts[0].childNodes[0].value, mobileComponentsScript());
  const ids = new Set(preview.map(node => attr(node, 'id')).filter(Boolean));
  for (const node of preview) for (const name of ['data-ds-open', 'data-ds-show']) if (attr(node, name)) assert.ok(ids.has(attr(node, name)), attr(node, name));
  assert.ok(preview.some(node => node.tagName === 'meta' && attr(node, 'content')?.includes('viewport-fit=cover')));
  const page = nodes(parse(mobileExampleHTML({view: 'page'})));
  assert.ok(page.some(node => node.tagName === 'ds-tabbar'));
  assert.ok(page.some(node => attr(node, 'data-mobile-tab') === 'services'));
  assert.ok(page.some(node => attr(node, 'data-mobile-choice') === 'notice-scope'));
  for (const view of ['foundations', 'select', 'feedback']) assert.doesNotThrow(() => parse(mobileExampleHTML({inline: true, view})));
});

test('mobile rules explain navigation, keyboard, touch interactions and supported component patterns', () => {
  const rules = mobileSystemFiles().find(file => file.logicalPath === 'rule.md').content;
  for (const text of ['Vant 4.9.22', 'asset.fromSystemResource', 'designer_commit_html', '软键盘', 'env(safe-area-inset-bottom)', '44px', '3–5', '4.5:1', '同类页面', '触控、滚动', 'ds-stepper', 'placement=bottom']) assert.ok(rules.includes(text), text);
});

test('danger actions in dialog footers keep readable surface backgrounds',()=>{
  assert.match(mobileThemeCSS(),/\.ds-mobile ds-dialog footer ds-button\[danger\]>button\s*\{\s*background:var\(--ds-surface\);\s*border-color:transparent;\s*color:var\(--ds-danger\);/);
});

test('mobile close icons and fallback text share a center in sheets, dialogs and notifications', {skip: !process.env.CHROME_BIN}, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'designer-mobile-close-'));
  try {
    const button = '<button data-overlay-close aria-label="关闭">×</button>';
    const header = '<dialog open><header><span>标题</span>' + button + '</header></dialog>';
    const path = join(dir, 'close.html');
    await writeFile(path, `<!doctype html><style>${mobileThemeCSS()}</style><body class="ds-mobile">
      <ds-drawer placement="bottom">${header}</ds-drawer><ds-dialog>${header}</ds-dialog>
      <ds-notification open><button data-feedback-close aria-label="关闭通知">×</button></ds-notification>
      <script>
        const checks = Array.from(document.querySelectorAll('button'), button => {
          const box = button.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(button);
          const text = range.getBoundingClientRect();
          const icon = getComputedStyle(button, '::before');
          return {centered: Math.abs(text.top + text.height/2 - box.top - box.height/2) < 1,
            glyph: icon.fontSize, touch: box.width >= 44 && box.height >= 44};
        });
        const sheet = document.querySelector('ds-drawer button');
        document.body.textContent = JSON.stringify({checks, sheetHeight:sheet.offsetHeight, horizontalPadding:getComputedStyle(sheet).paddingInline});
      </script>`);
    const html = execFileSync(process.env.CHROME_BIN, ['--headless','--disable-gpu','--no-first-run',
      '--user-data-dir=' + join(dir, 'profile'),'--dump-dom',pathToFileURL(path).href],
      {encoding:'utf8',timeout:20000,stdio:['ignore','pipe','pipe']});
    const body = nodes(parse(html)).find(node => node.tagName === 'body');
    const expected = {centered:true,glyph:'22px',touch:true};
    assert.deepEqual(JSON.parse(body.childNodes[0].value), {checks:[expected,expected,expected],sheetHeight:48,horizontalPadding:'16px'});
  } finally {
    await rm(dir, {recursive:true,force:true,maxRetries:3});
  }
});

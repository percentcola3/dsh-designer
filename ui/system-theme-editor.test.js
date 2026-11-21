import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild-wasm';
import {desktopSystemFiles, normalizeDesktopTheme} from '../desktop-theme.js';
import {DESKTOP_COMPONENT_VERSION} from '../desktop-components.js';
import {mobileSystemFiles, normalizeMobileTheme, MOBILE_THEME_FORMAT} from '../mobile-theme.js';
import {MOBILE_COMPONENT_VERSION} from '../mobile-components.js';

const require = createRequire(import.meta.url), React = require('react');
const bundle = await build({
  entryPoints: [new URL('./SystemThemeEditor.jsx', import.meta.url).pathname],
  bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'],
  plugins: [{name: 'theme-test-view', setup(build) {
    build.onLoad({filter: /\/common\.jsx$/}, () => ({contents: 'export const Button=()=>null,ErrorBox=()=>null;'}));
    build.onLoad({filter: /\/SystemRuleEditor\.jsx$/}, () => ({contents: 'export default ()=>null;'}));
  }}],
});

function fixture({mobile = false, legacyVersion} = {}) {
  const slots = [mobile ? normalizeMobileTheme() : normalizeDesktopTheme(), null, 'components', '', legacyVersion || (mobile ? MOBILE_COMPONENT_VERSION : DESKTOP_COMPONENT_VERSION)], changes = [], platforms = [];
  let cursor = 0;
  const react = {...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], value => {slots[index] = value;}];
    },
    useRef(initial) {const index = cursor++; return slots[index] ||= {current: initial};},
    useEffect() {}, useMemo(callback) {return callback();},
  };
  const module = {exports: {}};
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(name => name === 'react' ? react : require(name), module, module.exports);
  const files = (mobile ? mobileSystemFiles() : desktopSystemFiles()).map(file => {
    if (file.logicalPath === 'rule.md') return {...file, content: '# 用户自定义规则'};
    if (legacyVersion && file.logicalPath === 'tokens.json') return {...file, content: JSON.stringify({...JSON.parse(file.content), componentVersion: legacyVersion})};
    if (legacyVersion && file.logicalPath === 'components.js') return {...file, content: '// archived runtime'};
    if (legacyVersion && file.logicalPath.startsWith('examples/')) return {...file, content: '<html>用户自定义示例</html>'};
    return file;
  });
  const visit = node => React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(visit)] : [];
  const find = predicate => {
    cursor = 0;
    const tree = module.exports.default({draft: {localId: 'theme-fixture', files, platforms: [mobile ? 'mobile' : 'web']}, api: async () => {}, busy: false, onChange: (value, platform) => {changes.push(value); platforms.push(platform);}});
    return visit(tree).find(predicate);
  };
  const input = label => find(node => node.type === 'input' && node.props['aria-label'] === label);
  return {input, find, changes, files, platforms};
}

for (const mobile of [false, true]) test(`${mobile ? 'mobile' : 'desktop'} usage rules tab opens the rule editor`, () => {
  const f = fixture({mobile});
  const tab = f.find(node => node.props.children === '使用规则');
  assert.ok(tab);
  tab.props.onClick();
  const selected = f.find(node => node.props.children === '使用规则');
  assert.equal(selected.props['aria-pressed'], true);
  assert.equal(f.find(node => node.type === 'main').props['data-view'], 'rule');
  assert.equal(f.changes.length, 0);
});

test('numeric theme entry commits the full value and preserves custom rules and runtime', () => {
  const f = fixture(), input = f.input('基础间距');
  assert.equal(input.props.defaultValue, 8);
  assert.equal(input.props.value, undefined);
  assert.equal(input.props.onChange, undefined);
  assert.equal(f.changes.length, 0);
  const control = {value: '10', valueAsNumber: 10};
  input.props.onBlur({currentTarget: control});
  assert.equal(control.value, '10');
  const saved = f.changes[0], config = JSON.parse(saved.find(file => file.logicalPath === 'tokens.json').content);
  assert.equal(config.values.spacing, 10);
  assert.equal(config.derived.scales.spaceLG, '30px');
  for (const path of ['rule.md', 'components.js']) assert.equal(saved.find(file => file.logicalPath === path), f.files.find(file => file.logicalPath === path));
});

test('numeric blur restores empty values, bounds completed input and Enter commits via blur', () => {
  const f = fixture(), input = f.input('基础间距');
  const empty = {value: '', valueAsNumber: NaN};
  input.props.onBlur({currentTarget: empty});
  assert.equal(empty.value, '8');
  assert.equal(f.changes.length, 0);
  const large = {value: '100', valueAsNumber: 100};
  input.props.onBlur({currentTarget: large});
  assert.equal(large.value, '16');
  let prevented = false, blurred = false;
  input.props.onKeyDown({key: 'Enter', preventDefault() {prevented = true;}, currentTarget: {blur() {blurred = true;}}});
  assert.ok(prevented && blurred);
});

test('unchanged color blur and same-value control events do not emit edited files', () => {
  const f = fixture();
  f.input('品牌色值').props.onBlur({target: {value: '#1677FF'}});
  f.input('品牌色').props.onChange({target: {value: '#1677ff'}});
  f.input('基础间距滑块').props.onChange({target: {value: '8'}});
  assert.equal(f.changes.length, 0);
  f.input('品牌色值').props.onBlur({target: {value: '#663399'}});
  assert.equal(f.changes.length, 1);
  f.input('品牌色值').props.onBlur({target: {value: '#1677FF'}});
  const restored = JSON.parse(f.changes[1].find(file => file.logicalPath === 'tokens.json').content);
  assert.equal(restored.values.primary, '#1677ff');
});

test('mobile editor changes keep its format, platform, archived runtime and user rules', () => {
  const f = fixture({mobile: true});
  assert.equal(f.input('导航栏高度').props.defaultValue, 46);
  f.input('品牌色值').props.onBlur({target: {value: '#1989FA'}});
  assert.equal(f.changes.length, 0);
  f.input('导航栏高度').props.onBlur({currentTarget: {value: '52', valueAsNumber: 52}});
  const saved = f.changes[0], config = JSON.parse(saved.find(file => file.logicalPath === 'tokens.json').content);
  assert.equal(config.format, MOBILE_THEME_FORMAT);
  assert.equal(config.values.navBarHeight, 52);
  assert.equal(config.componentVersion, MOBILE_COMPONENT_VERSION);
  assert.deepEqual(f.platforms, ['mobile']);
  for (const path of ['rule.md', 'components.js']) assert.equal(saved.find(file => file.logicalPath === path), f.files.find(file => file.logicalPath === path));
});

test('mobile 1.0 upgrade updates the theme and runtime while preserving user rules and examples', () => {
  const f = fixture({mobile: true, legacyVersion: '1.0.0'});
  const button = f.find(node => node.props.children === '更新组件基座');
  assert.ok(button);
  assert.ok(button.props.title.includes('rule.md'));
  button.props.onClick();
  const saved = f.changes[0], find = path => saved.find(file => file.logicalPath === path);
  assert.equal(JSON.parse(find('tokens.json').content).componentVersion, MOBILE_COMPONENT_VERSION);
  assert.ok(find('components.js').content.includes(`DSH Mobile Components ${MOBILE_COMPONENT_VERSION}`));
  assert.equal(JSON.parse(find('components.json').content).version, MOBILE_COMPONENT_VERSION);
  assert.match(find('theme.css').content, /--ds-dialog-action-height: 48px/);
  for (const path of ['rule.md', 'examples/components.html', 'examples/page.html']) assert.equal(find(path), f.files.find(file => file.logicalPath === path));
  assert.deepEqual(f.platforms, ['mobile']);
  assert.equal(f.find(node => node.props.children === '更新组件基座'), undefined);
});

import {createRequire} from 'node:module';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

// Install the pinned extraction tools outside the plugin, then pass their directory.
// node build-antd-template.mjs .build/antd-source
const source = resolve(process.argv[2] || '.build/antd-source');
const require = createRequire(join(source, 'package.json'));
const React = require('react');
const antd = require('antd');
const {renderToStaticMarkup} = require('react-dom/server');
const {extractStyle} = require('@ant-design/static-style-extract');
const output = join(dirname(fileURLToPath(import.meta.url)), 'templates/antd');
const theme = {hashed: false, cssVar: {key: 'dsh-antd'}};
const css = extractStyle({customTheme: node => React.createElement(antd.ConfigProvider, {theme}, node)});
const globals = css.match(/\.dsh-antd\{([^}]+)\}/)?.[1];
if (!globals) throw new Error('Official global CSS variables were not extracted');
const seed = require('antd/lib/theme/themes/seed').default;
const tokens = antd.theme.getDesignToken();
const demo = renderToStaticMarkup(React.createElement(antd.ConfigProvider, {theme},
  React.createElement(antd.Space, {direction: 'vertical', size: 24},
    React.createElement(antd.Typography.Title, {level: 2}, 'Ant Design 设计规范'),
    React.createElement(antd.Space, null,
      React.createElement(antd.Button, {type: 'primary'}, '主要操作'),
      React.createElement(antd.Button, null, '次要操作'),
      React.createElement(antd.Button, {disabled: true}, '不可用')),
    React.createElement(antd.Input, {placeholder: '输入内容', style: {width: 280}}),
    React.createElement(antd.Alert, {type: 'success', title: '操作已完成', showIcon: true}),
    React.createElement(antd.Card, {title: '信息卡片', style: {width: 360}}, '用清晰的层级组织内容。'))));
const files = {
  'tokens.json': JSON.stringify(tokens, null, 2) + '\n',
  'seed.json': JSON.stringify(seed, null, 2) + '\n',
  'css/tokens.css': '/* Extracted from Ant Design CSS-in-JS default global variables. */\n:root{'+globals+'}\n',
  'css/antd.css': '/*! Ant Design '+antd.version+' · MIT · official static-style-extract output */\n'+css+'\n',
  'css/reset.css': await readFile(require.resolve('antd/dist/reset.css'), 'utf8'),
  'assets/LICENSE.txt': await readFile(require.resolve('antd/LICENSE'), 'utf8'),
  'examples/components.html': '<!doctype html>\n<html lang="zh-CN"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ant Design 组件示例</title><link rel="stylesheet" href="../css/reset.css"><link rel="stylesheet" href="../css/tokens.css"><link rel="stylesheet" href="../css/antd.css"><body style="padding:32px">'+demo+'</body></html>\n',
};
const provenance = {
  upstream: 'https://github.com/ant-design/ant-design',
  antd: antd.version,
  extractor: require('@ant-design/static-style-extract/package.json').version,
  theme,
  extraction: 'theme.getDesignToken(), lib/theme/themes/seed.js, official extractStyle(), dist/reset.css, React SSR sample',
  tokenCount: Object.keys(tokens).length,
  inputs: {}, outputs: {},
};
for (const name of ['antd/lib/theme/themes/seed.js', 'antd/lib/theme/getDesignToken.js', 'antd/dist/reset.css']) {
  const bytes = await readFile(require.resolve(name));
  provenance.inputs[name] = createHash('sha256').update(bytes).digest('hex');
}
for (const [name, content] of Object.entries(files)) {
  await mkdir(dirname(join(output, name)), {recursive: true});
  await writeFile(join(output, name), content);
  provenance.outputs[name] = createHash('sha256').update(content).digest('hex');
}
await writeFile(join(output, 'provenance.json'), JSON.stringify(provenance, null, 2)+'\n');
console.log('Extracted Ant Design', antd.version, Object.keys(tokens).length, 'tokens and', Buffer.byteLength(css), 'CSS bytes');

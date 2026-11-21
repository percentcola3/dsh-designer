import test from 'node:test';
import assert from 'node:assert/strict';
import {systemPreviewDocument} from './system-preview.js';

test('directory previews inline exact relative CSS, nested imports and images while stripping scripts', async () => {
  const files = {
    'css/main.css': {content: '@import "nested/more.css" screen;body{background:url(../assets/background.png)}', mimeType: 'text/css'},
    'css/nested/more.css': {content: 'h1{color:purple}', mimeType: 'text/css'},
    'assets/background.png': {bytesBase64: 'AAEC', mimeType: 'image/png'},
  };
  const reads = [];
  const html = await systemPreviewDocument('<link rel="stylesheet" href="../css/main.css"><script>bad()</script><main onclick="bad()"><img src="../assets/background.png"><h1>Preview</h1></main>', 'examples/demo.html', async path => {reads.push(path); return files[path];});
  assert.match(html, /href="data:text\/css;base64,/);
  assert.match(html, /src="data:image\/png;base64,AAEC"/);
  assert.doesNotMatch(html, /bad\(\)|onclick|<script/);
  assert.match(html, /style-src 'unsafe-inline' data:/);
  assert.deepEqual(reads.sort(), Object.keys(files).sort());
});

test('preview file resolution reports missing and cyclic styles and blocks external dependencies', async () => {
  await assert.rejects(systemPreviewDocument('<link rel="stylesheet" href="missing.css">', 'index.html', async () => null), /缺少预览资源/);
  await assert.rejects(systemPreviewDocument('<link rel="stylesheet" href="a.css">', 'index.html', async () => ({mimeType:'text/css',content:'@import "a.css";'})), /循环引用/);
  const html = await systemPreviewDocument('<img src="https://example.com/tracker">', 'index.html', async () => {throw Error('Unexpected read');});
  assert.match(html, /about:blank#external/);
});

test('parallel CSS dependencies cannot deadlock on a mutual import', async () => {
  const files = {'root.css':'@import "a.css";@import "b.css";', 'a.css':'@import "b.css";', 'b.css':'@import "a.css";'};
  await assert.rejects(systemPreviewDocument('<link rel="stylesheet" href="root.css">', 'index.html', async path => ({content:files[path],mimeType:'text/css'})), /循环引用/);
});

test('interactive pattern previews load package scripts within an isolated offline document', async () => {
  const reads = [];
  const html = await systemPreviewDocument('<meta http-equiv="refresh" content="0;url=https://example.com"><link rel="stylesheet" href="../theme.css"><script src="../components.js"></script><button onclick="this.textContent=\'done\'">Run</button><script>window.ready=true</script><iframe src="https://example.com"></iframe>', 'patterns/example.html', async path => {
    reads.push(path);
    return path === 'theme.css' ? {content: 'body{color:blue}', mimeType: 'text/css'} : {content: 'window.componentsReady=true', mimeType: 'application/javascript'};
  }, {interactive: true});
  assert.deepEqual(reads, ['theme.css', 'components.js']);
  assert.match(html, /src="data:application\/javascript;base64,/);
  assert.match(html, /window.ready=true/);
  assert.match(html, /onclick=/);
  assert.match(html, /script-src 'unsafe-inline' data:/);
  assert.match(html, /connect-src 'none'/);
  assert.doesNotMatch(html, /<iframe|http-equiv="refresh"|https:\/\/example/);
});

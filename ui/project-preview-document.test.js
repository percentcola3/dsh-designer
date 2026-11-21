import test from 'node:test';
import assert from 'node:assert/strict';
import {projectPreviewDocument} from './project-preview-document.js';
import {loadProjectPreview} from './project-preview.js';
import {normalizeDocument} from '../document-model.js';
const base='http://localhost/api/designer/resource/'+('a'.repeat(32))+'/p-one/designs/web/pages/home/';
const empty='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>';
test('script-mounted framework pages use the default cover while static framework content remains visible',()=>{
  const head='<head><script data-dsh-framework-runtime="true">runtime()</script><style>body{background:#f7f8fa}</style></head>';
  assert.equal(projectPreviewDocument(`${head}<body><div id="root"></div><script>mount()</script></body>`),null);
  assert.match(projectPreviewDocument(`${head}<body><div id="root"><h1>Saved content</h1></div></body>`),/<h1>Saved content<\/h1>/);
});
test('initial empty HTML and its controlled document metadata use the default cover',()=>{
  for(const html of ['',empty,normalizeDocument(empty).html,
    '<html><head><title>Project name</title><style>/* Design styles */</style></head><body> \n<!-- Start here --> </body></html>']){
    assert.equal(projectPreviewDocument(html),null);
  }
});
test('blank detection keeps CSS-only designs, visual elements and unknown markup conservatively',()=>{
  for(const html of [
    '<html><body style="background:linear-gradient(blue,pink)"></body></html>',
    '<html style="background:#123"><body></body></html>',
    '<body bgcolor="#123"></body>',
    '<head><style>body{background:#123}body::before{content:"Hello"}</style></head><body></body>',
    '<head><link rel="stylesheet" href="/assets/design.css"></head><body></body>',
    '<head><style id="dsh-document-styles" data-dsh-controlled="styles">body{background:pink}</style></head><body></body>',
    '<body><img src="data:image/png;base64,AA=="></body>',
    '<body><svg><rect width="100" height="100" fill="blue"/></svg></body>',
    '<body><iframe src="/saved-design.html"></iframe></body>',
    '<body><canvas width="100" height="100"></canvas></body>',
    '<body><div></div></body>',
    '<body><custom-design></custom-design></body>',
    '<body>Saved text</body>',
  ])assert.equal(typeof projectPreviewDocument(html),'string',html);
  const saved=normalizeDocument('<body style="background:pink"></body>').html;
  assert.match(projectPreviewDocument(saved),/background:pink/);
});
test('static preview preserves saved design markup while removing active scripts and redirects',()=>{
 const html=projectPreviewDocument('<html><head><meta http-equiv="refresh" content="0;url=https://other"><script>parent.alert(1)</script><style>body{color:green}</style></head><body onload="alert(2)"><h1>Actual design</h1><iframe src="https://other"></iframe><input autofocus></body></html>');
 assert.match(html,/<h1>Actual design<\/h1>/);assert.match(html,/script-src 'none'/);assert.ok(!html.includes('<script'));assert.ok(!html.includes('onload='));assert.ok(!html.includes('<iframe'));assert.ok(!html.includes('autofocus'));assert.ok(!html.includes('http-equiv="refresh"'));
});
test('project asset paths are rewritten to controlled dependencies and never leave the project root',()=>{
 const html=projectPreviewDocument('<img src="/assets/photo.png"><img src="../../../../../../private"><style>.a{background:url(/assets/bg.png)}</style>',{assetBase:base,projectId:'p-one'});
 assert.ok(html.includes('/p-one/assets/photo.png'));assert.ok(html.includes('/p-one/assets/bg.png'));assert.ok(html.includes('about:blank#blocked'));
 assert.equal(projectPreviewDocument('<p>A</p>',{assetBase:base,projectId:'p-other'}),null);
});
test('saved HTML is previewed directly without depending on file preview HTTP routes',async()=>{
 const p={id:'p-one',revision:1,workbench:{designs:[]},artboards:[{id:'a',htmlPath:'designs/a/index.html',viewport:{width:1440,height:1000}}]};
 const api=async()=>({path:'designs/a/index.html',version:'one',content:'<h1>Saved design</h1>',nextOffset:null,previewUrl:'/missing/route'});
 const value=await loadProjectPreview(api,p);assert.match(value.html,/<h1>Saved design<\/h1>/);assert.equal(value.url,undefined);
});
test('long saved designs join bounded windows only while the native file version remains unchanged',async()=>{
 const p={id:'p-one',workbench:{designs:[]},artboards:[{id:'a',htmlPath:'designs/a/index.html'}]};let calls=0;
 const value=await loadProjectPreview(async(_a,args)=>{calls++;return {path:'designs/a/index.html',version:'v1',content:args.offset?'</h1>':'<h1>Saved',nextOffset:args.offset?null:8};},p);
 assert.equal(calls,2);assert.match(value.html,/<h1>Saved<\/h1>/);
 const stale=await loadProjectPreview(async(_a,args)=>({path:'designs/a/index.html',version:args.offset?'v2':'v1',content:'changed',nextOffset:args.offset?null:8}),p);assert.equal(stale,null);
 const foreign=await loadProjectPreview(async(_a,args)=>({projectId:args.offset?'p-other':'p-one',path:'designs/a/index.html',version:'v1',content:'other',nextOffset:args.offset?null:8}),p);assert.equal(foreign,null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  controlledProjectPreviewUrl, fitProjectPreview, loadProjectPreview,
  projectPreviewKey, projectPreviewViewport, selectProjectPreviewPage,
} from './project-preview.js';

const url = '/api/designer/file-resource/controlled/index.html?preview=1';
function project(overrides = {}) {
  return {id:'p-one', revision:1, updatedAt:'today', platform:'web',
    artboards:[{id:'a-one', designId:'d-one', htmlPath:'designs/one/index.html'}],
    workbench:{designs:[{id:'d-one', pageIds:['a-one']}]}, ...overrides};
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
}

test('preview page follows design order and pageIds, skipping deleted or missing HTML pages', () => {
  const p = project({artboards:[
    {id:'first', htmlPath:'first.html'},
    {id:'deleted', htmlPath:'deleted.html', deletedAt:'now'},
    {id:'empty'},
    {id:'ordered', htmlPath:'ordered.html'},
    {id:'removed-design', designId:'gone', htmlPath:'gone.html'},
  ], workbench:{designs:[
    {id:'gone', deletedAt:'now', pageIds:['removed-design']},
    {id:'active', pageIds:['deleted','empty','ordered','first']},
  ]}});
  assert.equal(selectProjectPreviewPage(p).id, 'ordered');
  p.workbench.designs[1].pageIds = ['missing'];
  assert.equal(selectProjectPreviewPage(p).id, 'first');
  assert.equal(selectProjectPreviewPage(project({artboards:[]})), null);
});

test('pages in removed designs are excluded even without designId', () => {
  const p = project({artboards:[{id:'gone', htmlPath:'gone.html'}, {id:'valid', htmlPath:'valid.html'}],
    workbench:{designs:[{id:'d-gone', removedAt:'now', pageIds:['gone']}]}});
  assert.equal(selectProjectPreviewPage(p).id, 'valid');
});

test('viewport uses real page dimensions and mobile defaults; fit covers cards at the original aspect ratio', () => {
  const p = project();
  assert.deepEqual(projectPreviewViewport(p, {...p.artboards[0], viewport:{width:1200,height:800}}), {width:1200,height:800});
  assert.deepEqual(projectPreviewViewport(p, {platform:'mobile'}), {width:390,height:844});
  p.workbench.designs[0].platform = 'mobile';
  assert.deepEqual(projectPreviewViewport(p, {...p.artboards[0],viewport:{width:NaN,height:-5}}), {width:390,height:844});
  assert.deepEqual(fitProjectPreview({width:300,height:300}, {width:1200,height:800}), {scale:0.375,width:450,height:300});
  assert.deepEqual(fitProjectPreview({width:300,height:300}, {width:100,height:100}), {scale:3,width:300,height:300});
  const card = {width:320,height:180};
  for (const viewport of [{width:1440,height:1000},{width:390,height:844},{width:1920,height:600}]) {
    const fit = fitProjectPreview(card, viewport);
    assert.ok(fit.width >= card.width && fit.height >= card.height);
    assert.ok(Math.abs(fit.width / fit.height - viewport.width / viewport.height) < 1e-10);
  }
  assert.equal(fitProjectPreview({width:0,height:300}, {width:100,height:100}), null);
});

test('only controlled relative or same-origin designer URLs are admitted', () => {
  const origin = 'http://127.0.0.1:60510';
  assert.equal(controlledProjectPreviewUrl(url, origin), url);
  assert.equal(controlledProjectPreviewUrl(origin + url, origin), origin + url);
  for (const bad of [
    'https://evil.example' + url, '//evil.example' + url, 'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>', 'blob:' + origin + '/id',
    '/api/designer-evil/frame', '/api/designer/../../private', '/api/designer/..%2f../private',
    '/api/designer/\\evil.example/frame', '/api/designer/\nframe',
    origin + '/private', 'http://user:password@127.0.0.1:60510' + url,
  ]) {
    assert.equal(controlledProjectPreviewUrl(bad, origin), null, bad);
  }
  assert.equal(controlledProjectPreviewUrl(origin + url, null), null);
});

test('existing metadata reads only its chosen HTML file and never modifies supplied metadata', async () => {
  const p = project(), before = structuredClone(p), calls = [];
  const api = async (action, args) => {calls.push({action,args}); return {previewUrl:url,path:args.path};};
  assert.deepEqual(await loadProjectPreview(api,p), {url,pageId:'a-one',viewport:{width:1440,height:1000}});
  assert.deepEqual(calls, [{action:'file.read',args:{projectId:'p-one',path:'designs/one/index.html'}}]);
  assert.deepEqual(p,before);
});

test('summary metadata triggers one read-only project.get before file.read', async () => {
  const full = project(), calls = [];
  const api = async (action,args) => {
    calls.push({action,args});
    return action === 'project.get' ? {project:full} : {previewUrl:url};
  };
  assert.equal((await loadProjectPreview(api,{id:full.id,revision:1,updatedAt:'today'})).pageId,'a-one');
  assert.deepEqual(calls.map(call => call.action), ['project.get','file.read']);
  assert.deepEqual(calls[0].args,{projectId:'p-one'});
});

test('missing API, unavailable projects, empty projects and unsafe preview responses use fallback', async () => {
  let calls = 0;
  const api = async () => {calls++; throw Error('must not read');};
  for (const p of [null, {}, project({unavailable:true}), project({deletedAt:'now'}), project({artboards:[]})]) {
    assert.equal(await loadProjectPreview(api,p), null);
  }
  assert.equal(await loadProjectPreview(null,project()), null);
  assert.equal(calls,0);
  for (const result of [null,{}, {previewUrl:'https://evil.example/frame'},
    {previewUrl:url, projectId:'p-other'}, {previewUrl:url,path:'wrong.html'},
    {previewUrl:url, projectRevision:2}, {previewUrl:url,sourceId:'r-external'}]) {
    assert.equal(await loadProjectPreview(async () => result,project()),null);
  }
});

test('new blank HTML uses fallback even when a preview URL exists; saved design still previews', async () => {
  const p = project(), blank = '<!doctype html><html><head><meta charset="utf-8"></head><body> <!-- Empty page --> </body></html>';
  let content = blank;
  const api = async () => ({path:p.artboards[0].htmlPath,content,previewUrl:url});
  assert.equal(await loadProjectPreview(api,p),null);
  content = '<html><head><style>body{background:linear-gradient(blue,pink)}</style></head><body></body></html>';
  const preview = await loadProjectPreview(api,p);
  assert.match(preview.html,/background:linear-gradient\(blue,pink\)/);
  assert.equal(preview.pageId,'a-one');
  assert.equal(preview.url,undefined);
});

test('project metadata replies must match the requested owner and version', async () => {
  for (const change of [{id:'p-other'}, {revision:2}, {updatedAt:'tomorrow'}, {unavailable:true}]) {
    const calls = [];
    const api = async action => {calls.push(action);return {project:project(change)};};
    assert.equal(await loadProjectPreview(api,{id:'p-one',revision:1,updatedAt:'today'}),null);
    assert.deepEqual(calls,['project.get']);
  }
});

test('same API/project version shares a pending read; settled links are not cached', async () => {
  const gate = deferred(); let reads = 0;
  const api = async () => {reads++; await gate.promise; return {previewUrl:url};};
  const a = loadProjectPreview(api,project()), b = loadProjectPreview(api,project());
  assert.equal(a,b);
  gate.resolve();
  await Promise.all([a,b]);
  assert.equal(reads,1);
  await loadProjectPreview(api,project());
  assert.equal(reads,2);
});

test('API identity, project id, revision and updatedAt isolate pending read owners', async () => {
  const gate = deferred();
  const api = async () => {await gate.promise;return {previewUrl:url};};
  const otherApi = async () => {await gate.promise;return {previewUrl:url};};
  const p = project();
  const requests = [loadProjectPreview(api,p), loadProjectPreview(otherApi,p),
    loadProjectPreview(api,project({id:'p-other'})), loadProjectPreview(api,project({revision:2})),
    loadProjectPreview(api,project({updatedAt:'tomorrow'}))];
  assert.equal(new Set(requests).size,5);
  assert.equal(new Set([p,project({id:'p-other'}),project({revision:2}),project({updatedAt:'tomorrow'})].map(projectPreviewKey)).size,4);
  gate.resolve(); await Promise.all(requests);
});

test('all cards share a three-read concurrency bound', async () => {
  const gate = deferred(), started = deferred(); let active = 0, peak = 0, total = 0;
  const api = async () => {
    active++; total++; peak = Math.max(peak,active);
    if (total === 3) started.resolve();
    await gate.promise; active--; return {previewUrl:url};
  };
  const requests = Array.from({length:20},(_,index) => loadProjectPreview(api,project({id:'p-' + index})));
  await started.promise;
  assert.equal(total,3); assert.equal(active,3);
  gate.resolve(); await Promise.all(requests);
  assert.equal(peak,3); assert.equal(total,20);
});

test('failed reads are released so a later mount can retry', async () => {
  let fail = true, calls = 0;
  const api = async () => {calls++;if (fail) throw Error('offline');return {previewUrl:url};};
  await assert.rejects(loadProjectPreview(api,project()), /offline/);
  fail = false;
  assert.equal((await loadProjectPreview(api,project())).url,url);
  assert.equal(calls,2);
});

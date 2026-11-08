import test from 'node:test';
import assert from 'node:assert/strict';
import {DesignImportEngine,McpDesignClient,normalizeDesignConfig,validateToolArguments,normalizeDesignResult} from './design-import.js';
const schema = (properties,required = []) => ({type:'object',properties,required,additionalProperties:false});
const string = {type:'string'};
const designTool = {name:'get_design_context',description:'Read a selected Figma frame',inputSchema:schema({fileKey:string,nodeId:string,clientLanguages:string,clientFrameworks:string},['fileKey','nodeId'])};
const screenshotTool = {name:'get_screenshot',inputSchema:schema({fileKey:string,nodeId:string},['fileKey','nodeId'])};
const assetTool = {name:'download_assets',inputSchema:schema({fileKey:string,nodeIds:{type:'array',items:string}},['fileKey','nodeIds'])};
const init = {protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'Official-compatible test server',version:'1'}};
const json = (result,id,headers = {}) => new Response(JSON.stringify({jsonrpc:'2.0',id,result}),{headers:{'content-type':'application/json',...headers}});
const image = Buffer.from('fixture image bytes').toString('base64');
const resultText = text => ({content:[{type:'text',text}]});
const hasCode = code => error => error?.code === code;
function server({tools = [designTool,screenshotTool,assetTool],results = {},sse = false,catalogPage,initialize = init,token,provider = 'figma'} = {}) {
  const requests = [];const posts = [];
  const fetch = async (url,options = {}) => {
    assert.equal(options.redirect,'manual');
    const message = options.body ? JSON.parse(options.body):null;requests.push({url,options,message});
    if (options.method === 'DELETE') return new Response(null,{status:204});
    if (token) assert.equal(options.headers[provider === 'figma' ? 'Authorization':'x-mg-useraccesstoken'],provider === 'figma' ? `Bearer ${token}`:token);
    if (message?.method === 'initialize') return json(initialize,message.id,{'Mcp-Session-Id':'private-session'});
    assert.equal(options.headers['Mcp-Session-Id'],'private-session');
    assert.equal(options.headers['MCP-Protocol-Version'],'2024-11-05');
    if (message?.method === 'notifications/initialized' || message?.error) return new Response(null,{status:202});
    if (message?.method === 'tools/list') return json(catalogPage ? catalogPage(message.params):{tools},message.id);
    if (message?.method === 'tools/call') {
      posts.push(message.params);const result = results[message.params.name] || (message.params.name === 'get_screenshot' ? {content:[{type:'image',mimeType:'image/png',data:image}]} : message.params.name === 'download_assets' ? {structuredContent:{assets:[{url:'https://cdn.example/a.svg',mimeType:'image/svg+xml'}]}} : resultText('<main style="font-family:Demo">Design</main> https://cdn.example/demo.woff2'));
      if (!sse) return json(result,message.id);
      const encoder = new TextEncoder();
      const fragments = [': ping\r\n\r\n','event: message\r\ndata: ' + JSON.stringify({jsonrpc:'2.0',method:'notifications/progress',params:{progress:1}}) + '\r\n\r\n','event: message\r\ndata: ' + JSON.stringify({jsonrpc:'2.0',id:message.id,result}) + '\r\n\r\n'];
      return new Response(new ReadableStream({start(controller) {for (const fragment of fragments) {const mid = Math.floor(fragment.length/2);controller.enqueue(encoder.encode(fragment.slice(0,mid)));controller.enqueue(encoder.encode(fragment.slice(mid)));}controller.close();}}),{headers:{'content-type':'text/event-stream'}});
    }
    throw new Error('Unexpected request');
  };
  return {fetch,requests,posts};
}

test('discover negotiates init, initialized, session headers and paginated actual schemas',async () => {
  const mock = server({catalogPage:params => params.cursor ? {tools:[screenshotTool]}:{tools:[designTool],nextCursor:'page2'}});
  const value = await new DesignImportEngine({fetch:mock.fetch}).discover({provider:'figma'});
  assert.equal(value.connected,true);assert.equal(value.tools.length,2);assert.deepEqual(value.tools[0].inputSchema,designTool.inputSchema);assert.equal(value.transport,'http');
  assert.equal(mock.requests.at(-1).options.method,'DELETE');assert.ok(!JSON.stringify(value).includes('private-session'));
});

test('Figma design read uses only advertised arguments and normalizes context, screenshot and assets',async () => {
  const mock = server();const value = await new DesignImportEngine({fetch:mock.fetch}).read({provider:'figma',url:'https://www.figma.com/design/FILE123/App?node-id=12-34'});
  assert.equal(value.kind,'figma');assert.ok(value.context.includes('<main'));assert.equal(value.preview.bytesBase64,image);assert.equal(value.preview.mimeType,'image/png');
  assert.equal(value.source.fileKey,'FILE123');assert.equal(value.source.nodeId,'12:34');assert.equal(value.sourceURL,'https://www.figma.com/design/FILE123/App?node-id=12-34');
  assert.deepEqual(mock.posts[0].arguments,{fileKey:'FILE123',nodeId:'12:34'});
  assert.deepEqual(mock.posts[2].arguments,{fileKey:'FILE123',nodeIds:['12:34']});assert.ok(value.assets.some(a => a.url.endsWith('.woff2')));assert.ok(value.assets.some(a => a.mimeType === 'image/svg+xml'));
});

test('Streamable HTTP accepts incrementally chunked SSE and ignores unrelated notifications',async () => {
  const mock = server({sse:true});const engine = new DesignImportEngine({fetch:mock.fetch});
  const value = await engine.read({provider:'figma',fileKey:'FILE',nodeId:'1:2'});
  assert.ok(value.context.includes('Design'));assert.equal(value.preview.bytesBase64,image);
});

test('2024 HTTP+SSE fallback uses server-announced same-origin message endpoint and matches IDs',async () => {
  const encoder = new TextEncoder();let controller;const records = [];
  const fetch = async (url,options = {}) => {
    records.push({url,options});
    if (url === 'http://127.0.0.1:3845/sse' && options.method === 'POST') return new Response(null,{status:405});
    if (options.method === 'GET') return new Response(new ReadableStream({start(c) {controller = c;c.enqueue(encoder.encode('event: endpoint\ndata: /messages?sessionId=secret\n\n'));options.signal.addEventListener('abort',() => {try {c.close();} catch {}},{once:true});}}),{headers:{'content-type':'text/event-stream'}});
    assert.equal(url,'http://127.0.0.1:3845/messages?sessionId=secret');
    const message = JSON.parse(options.body);let result;
    if (message.method === 'initialize') result = init;
    else if (message.method === 'tools/list') result = {tools:[{name:'get_design_context',inputSchema:schema({})}]};
    else if (message.method === 'tools/call') result = resultText('Legacy design context https://cdn.example/legacy.png');
    if (message.id !== undefined) controller.enqueue(encoder.encode('event: message\ndata: ' + JSON.stringify({jsonrpc:'2.0',id:message.id,result}) + '\n\n'));
    return new Response(null,{status:202});
  };
  const value = await new DesignImportEngine({fetch}).read({provider:'figma',endpoint:'http://127.0.0.1:3845/sse',includePreview:false,includeAssets:false});
  assert.ok(value.context.includes('Legacy'));assert.equal(value.assets[0].filename,'legacy.png');assert.ok(records.some(r => r.options.method === 'GET'));
});

test('MasterGo Magic uses official HTTP endpoint and exact discovered getDsl schema/header',async () => {
  const tool = {name:'mcp__getDsl',inputSchema:schema({fileId:string,layerId:string},['fileId','layerId'])};
  const mock = server({provider:'mastergo',token:'mg_test_credential',tools:[tool],results:{mcp__getDsl:resultText('{"layers":[{"name":"Hero","image":"https://cdn.example/hero.webp"}]}')}});
  const value = await new DesignImportEngine({fetch:mock.fetch}).read({provider:'mastergo',token:'mg_test_credential',url:'https://mastergo.com/file/12345?layer_id=8:9'});
  assert.equal(mock.requests[0].url,'https://mastergo.com/mcp/xf/sse');assert.deepEqual(mock.posts[0],{name:'mcp__getDsl',arguments:{fileId:'12345',layerId:'8:9'}});assert.equal(value.kind,'mastergo');assert.ok(value.assets.some(a => a.filename === 'hero.webp'));assert.ok(!JSON.stringify(value).includes('mg_test_credential'));
});

test('Vibe HTTP bridge reads inline HTML and disables external writes using discovered fields',async () => {
  const vibe = {name:'get_frontend_code',inputSchema:schema({projectDir:string,targetNodeId:string,frontendFramework:{enum:['html','react']},writeToFile:{type:'boolean'},outDir:string,fileName:string},['projectDir'])};
  const screenshot = {name:'get_screenshot',inputSchema:schema({projectDir:string},['projectDir'])};
  const mock = server({tools:[vibe,screenshot],provider:'mastergo',results:{get_frontend_code:resultText('<!doctype html><html><main>Vibe</main></html>')}});
  const value = await new DesignImportEngine({fetch:mock.fetch}).read({provider:'mastergo',endpoint:'http://127.0.0.1:30678/mcp',projectDir:'/workspace/Project',nodeId:'8:9'});
  assert.deepEqual(mock.posts[0].arguments,{writeToFile:false,frontendFramework:'html',projectDir:'/workspace/Project',targetNodeId:'8:9'});
  assert.equal(mock.posts.length,1);assert.ok(value.warnings.some(w => w.includes('outside the DSH asset pipeline')));
  const unsafe = new DesignImportEngine({fetch:server({tools:[vibe]}).fetch});
  await assert.rejects(unsafe.read({provider:'mastergo',endpoint:'http://127.0.0.1:30678/mcp',toolArguments:{projectDir:'/workspace',writeToFile:true}}),hasCode('UNSAFE_PROVIDER_TOOL'));
});

test('missing required provider fields return actual schema and never guess/call tools',async () => {
  const actual = {name:'get_design_context',inputSchema:schema({actualSelectionIdentifier:string},['actualSelectionIdentifier'])};const mock = server({tools:[actual]});
  await assert.rejects(new DesignImportEngine({fetch:mock.fetch}).read({provider:'figma',fileKey:'WONT_INVENT'}),error => error.code === 'INVALID_TOOL_ARGUMENTS' && error.details.inputSchema.properties.actualSelectionIdentifier.type === 'string');assert.equal(mock.posts.length,0);
  const allowed = await new DesignImportEngine({fetch:mock.fetch}).read({provider:'figma',toolArguments:{actualSelectionIdentifier:'real-value'},includePreview:false,includeAssets:false});assert.ok(allowed.context);
});

test('MasterGo shared links and page/source layer query parameters follow the actual advertised schema',async()=>{
  const tool={name:'mcp__getDsl',inputSchema:schema({shortLink:string,fileId:string,layerId:string,sourceLayerId:string})},mock=server({provider:'mastergo',tools:[tool]});
  const engine=new DesignImportEngine({fetch:mock.fetch});await engine.read({provider:'mastergo',url:'https://mastergo.com/goto/SharedFrame',includePreview:false,includeAssets:false});assert.deepEqual(mock.posts[0].arguments,{shortLink:'https://mastergo.com/goto/SharedFrame'});
  const result=await engine.read({provider:'mastergo',url:'https://mastergo.com/file/123?page_id=50%3A2&source_layer_id=51%3A3',includePreview:false,includeAssets:false});assert.deepEqual(mock.posts[1].arguments,{fileId:'123',layerId:'50:2',sourceLayerId:'51:3'});assert.equal(result.source.sourceLayerId,'51:3');
  const strict={name:'mcp__getDsl',inputSchema:schema({fileId:string,layerId:string},['fileId','layerId'])},unsupported=server({provider:'mastergo',tools:[strict]});
  await assert.rejects(new DesignImportEngine({fetch:unsupported.fetch}).read({provider:'mastergo',url:'https://mastergo.com/goto/SharedFrame'}),error=>error.code==='INVALID_TOOL_ARGUMENTS'&&error.details.inputSchema.required.includes('fileId'));assert.equal(unsupported.posts.length,0);
  const missing=server({provider:'mastergo',tools:[tool]});await assert.rejects(new DesignImportEngine({fetch:missing.fetch}).read({provider:'mastergo',url:'https://mastergo.com/file/123'}),error=>error.code==='INVALID_TOOL_ARGUMENTS'&&error.details.tool==='mcp__getDsl');assert.equal(missing.posts.length,0);
});

test('MasterGo D2C provider-side file writes are never invoked as read-only imports',async()=>{
  const tool={name:'mcp__getD2c',inputSchema:schema({contentId:string})},mock=server({provider:'mastergo',tools:[tool]});
  await assert.rejects(new DesignImportEngine({fetch:mock.fetch}).read({provider:'mastergo',toolName:'mcp__getD2c',contentId:'copied-id'}),hasCode('UNSAFE_PROVIDER_TOOL'));assert.equal(mock.posts.length,0);
});

test('provider HTML is retained as explicit source evidence and JSON-encoded DSL discovers extensionless static assets',()=>{
  const html='<!doctype html><html><head><link rel="stylesheet" href="https://cdn.example/style.css"></head><body><h1>Provider code</h1></body></html>';
  const result=normalizeDesignResult([{tool:'get_frontend_code',result:resultText('```html\n'+html+'\n```')},{tool:'getDsl',result:resultText(JSON.stringify({images:{hero:'https://cdn.example/download?id=asset'},fonts:[{url:'https://cdn.example/typeface?id=font',mimeType:'font/woff2'}]}))}],{provider:'mastergo',url:'https://mastergo.com/file/123'});
  assert.equal(result.html,html);assert.equal(result.diagnostics.sourceFormat,'provider-html');assert.equal(result.diagnostics.preview,'unavailable');assert.ok(result.assets.some(asset=>asset.url==='https://cdn.example/download?id=asset'));assert.ok(result.assets.some(asset=>asset.url==='https://cdn.example/typeface?id=font'&&asset.mimeType==='font/woff2'));assert.equal(result.preview,undefined);
});

test('discovered schema checks local refs, union schemas, bounds and additional properties',() => {
  const s = {type:'object',properties:{node:{$ref:'#/$defs/node'},scale:{oneOf:[{type:'integer',minimum:1,maximum:4},{const:'auto'}]}},required:['node'],additionalProperties:false,$defs:{node:{type:'string',minLength:2,pattern:'^n'}}};
  assert.deepEqual(validateToolArguments(s,{node:'node',scale:'auto'}),{node:'node',scale:'auto'});
  assert.throws(() => validateToolArguments(s,{node:'x',scale:10,unexpected:true}),hasCode('INVALID_TOOL_ARGUMENTS'));
  assert.throws(() => validateToolArguments({$ref:'https://evil/schema'},{}),hasCode('SCHEMA_UNSUPPORTED'));
});

test('auth, permission and OAuth client restrictions stay explicit and do not claim connection',async () => {
  for (const status of [401,403]) {
    const engine = new DesignImportEngine({fetch:async () => new Response(null,{status,headers:{'www-authenticate':'Bearer resource_metadata="https://mcp.figma.com/.well-known/oauth-protected-resource"'}})});
    const result = await engine.probe({provider:'figma',endpoint:'https://mcp.figma.com/mcp'});assert.equal(result.connected,false);assert.equal(result.error.code,status === 401 ? 'AUTH_REQUIRED':'ACCESS_DENIED');
  }
});

test('provider credentials are redacted from echoed errors, descriptions, context and URLs',async () => {
  const token = 'mg_"quoted\\private';
  const mock = server({token,tools:[{...designTool,description:'Do not expose ' + token}],results:{get_design_context:resultText('<div>Echo ' + token + '</div> https://cdn.example/image.png?auth=' + encodeURIComponent(token))}});
  const engine = new DesignImportEngine({fetch:mock.fetch});
  const discovered = await engine.discover({provider:'figma',token});assert.ok(!JSON.stringify(discovered).includes('quoted'));
  const value = await engine.read({provider:'figma',token,fileKey:'FILE',nodeId:'1:2',includePreview:false,includeAssets:false});assert.ok(value.context.includes('[redacted]'));assert.ok(!JSON.stringify(value).includes('quoted'));assert.equal(value.assets.length,0);
  const failed = new DesignImportEngine({fetch:server({token,results:{get_design_context:{isError:true,content:[{type:'text',text:'Denied ' + token}]}}}).fetch});
  await assert.rejects(failed.read({provider:'figma',token,fileKey:'FILE',nodeId:'1:2'}),error => error.code === 'DESIGN_READ_FAILED' && !error.message.includes('quoted'));
});

test('write tools are never invoked even if present in the real catalog',async () => {
  const mock = server({tools:[{name:'delete_node',inputSchema:schema({})}]});
  await assert.rejects(new DesignImportEngine({fetch:mock.fetch}).read({provider:'figma',toolName:'delete_node'}),hasCode('DESIGN_TOOL_UNAVAILABLE'));assert.equal(mock.posts.length,0);
});

test('redirects and cross-origin SSE announcements cannot forward credentials',async () => {
  let calls = 0;const engine = new DesignImportEngine({fetch:async (_url,options) => {calls++;assert.equal(options.redirect,'manual');return new Response(null,{status:302,headers:{location:'https://evil.example/mcp'}});}});
  const rejected = await engine.probe({provider:'figma',token:'secret'});assert.equal(rejected.error.code,'REDIRECT_BLOCKED');assert.equal(calls,1);
  const stream = 'event: endpoint\ndata: https://evil.example/messages\n\n';
  const bad = new DesignImportEngine({fetch:async () => new Response(stream,{headers:{'content-type':'text/event-stream'}})});
  const legacy = await bad.probe({provider:'figma',transport:'sse'});assert.equal(legacy.error.code,'UNTRUSTED_MCP_ENDPOINT');
});

test('malformed protocols, mismatched IDs, repeated cursors and bounded responses fail clearly',async () => {
  const badProtocol = await new DesignImportEngine({fetch:server({initialize:{...init,protocolVersion:'1999-01-01'}}).fetch}).probe({provider:'figma'});assert.equal(badProtocol.error.code,'MCP_PROTOCOL_ERROR');
  const repeated = await new DesignImportEngine({fetch:server({catalogPage:() => ({tools:[],nextCursor:'same'})}).fetch}).probe({provider:'figma'});assert.equal(repeated.error.code,'MCP_PROTOCOL_ERROR');
  const mismatch = await new DesignImportEngine({fetch:async () => json(init,999)}).probe({provider:'figma'});assert.equal(mismatch.error.code,'MCP_PROTOCOL_ERROR');
  const large = await new DesignImportEngine({fetch:server().fetch,maxBytes:5}).probe({provider:'figma'});assert.equal(large.error.code,'RESPONSE_TOO_LARGE');
});

test('unavailable endpoints and invalid config return useful disconnected status',async () => {
  const offline = await new DesignImportEngine({fetch:async () => {throw new TypeError('fetch failed');}}).probe({provider:'figma'});assert.equal(offline.connected,false);assert.equal(offline.error.code,'CONNECTION_FAILED');
  for (const endpoint of ['http://example.com/mcp','https://user:password@example.com/mcp','https://example.com/mcp?token=secret']) assert.throws(() => normalizeDesignConfig({provider:'figma',endpoint}),hasCode('INVALID_ENDPOINT'));
  const invalid = await new DesignImportEngine().probe({provider:'unknown',token:'not-in-output'});assert.equal(invalid.connected,false);assert.ok(!JSON.stringify(invalid).includes('not-in-output'));
});

test('cancellation aborts fetch and produces a stable cancelled status',async () => {
  const abort = new AbortController();const engine = new DesignImportEngine({fetch:async (_url,{signal}) => new Promise((_resolve,reject) => {signal.addEventListener('abort',() => reject(new DOMException('Aborted','AbortError')),{once:true});queueMicrotask(() => abort.abort());})});
  const result = await engine.probe({provider:'figma'},{signal:abort.signal});assert.equal(result.error.code,'CANCELLED');
});

test('domain: advertised official metadata supplies actual grouped XML IDs and paged thumbnails',async()=>{
  const tool={name:'get_metadata',inputSchema:schema({fileKey:string,nodeId:string},['fileKey'])};const mock=server({tools:[tool],results:{get_metadata:resultText('<canvas id="0:1" name="Page"><frame id="1:1" name="First" x="0" y="1" width="100" height="80"/><frame id="2:1" name="Second &amp; real" thumbnail="https://cdn.example/second.png"><text id="3:1" name="Label"/></frame></canvas>')}});const engine=new DesignImportEngine({fetch:mock.fetch});const output=await engine.outline({provider:'figma',url:'https://www.figma.com/design/REAL/Name',offset:2,limit:2});assert.equal(output.status,'available');assert.equal(output.nodeTotal,4);assert.equal(output.nodes[0].id,'2:1');assert.equal(output.nodes[0].parentId,'0:1');assert.equal(output.nodes[0].name,'Second & real');assert.equal(output.nodes[1].parentId,'2:1');assert.equal(output.nodes[0].thumbnail,'https://cdn.example/second.png');assert.equal(output.nextNodeOffset,null);assert.deepEqual(mock.posts[0],{name:'get_metadata',arguments:{fileKey:'REAL'}});
});

test('domain: discovery refuses unavailable metadata capability and never substitutes generated context nodes',async()=>{
  const absent=server({tools:[designTool]});const output=await new DesignImportEngine({fetch:absent.fetch}).outline({provider:'figma',fileKey:'REAL'});assert.equal(output.status,'unsupported');assert.deepEqual(output.nodes,[]);assert.equal(absent.posts.length,0);
  const tool={name:'get_metadata',inputSchema:schema({actualRequiredScope:string},['actualRequiredScope'])},unusable=server({tools:[tool]});const missing=await new DesignImportEngine({fetch:unusable.fetch}).outline({provider:'mastergo',url:'https://mastergo.com/file/real'});assert.equal(missing.status,'unsupported');assert.equal(unusable.posts.length,0);
  const prose=server({tools:[{name:'get_metadata',inputSchema:schema({})}],results:{get_metadata:resultText('A beautiful dashboard with three frames')}});assert.equal((await new DesignImportEngine({fetch:prose.fetch}).outline({provider:'figma'})).status,'unsupported');
});

test('domain: outline validates paging before connecting and preserves actual provider auth failures',async()=>{
  let calls=0;const engine=new DesignImportEngine({fetch:async()=>{calls++;return new Response(null,{status:401});}});await assert.rejects(engine.outline({provider:'figma',limit:201}),hasCode('INVALID_INPUT'));assert.equal(calls,0);await assert.rejects(engine.outline({provider:'mastergo'}),hasCode('AUTH_REQUIRED'));
});

test('normalized outputs are bounded, filename-safe and reject empty design responses',() => {
  const value = normalizeDesignResult([{tool:'get_design_context',result:resultText('ABCDE https://cdn.example/%ZZ.png https://cdn.example/a.svg https://cdn.example/b.png')}],{provider:'figma',endpoint:'http://127.0.0.1:3845/mcp'},{maxContextChars:4,maxAssets:1});
  assert.equal(value.context,'ABCD');assert.equal(value.contextTruncated,true);assert.equal(value.assets.length,1);assert.equal(value.assets[0].filename,'_ZZ.png');assert.ok(value.warnings.length >= 2);
  assert.throws(() => normalizeDesignResult([{tool:'get_design_context',result:{content:[]}}],{provider:'figma'}),hasCode('EMPTY_DESIGN'));
});

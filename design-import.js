// Design-source reads only. No filesystem, process execution, credential storage or logging.
import {parseFragment} from 'parse5';
export const DESIGN_PROVIDERS = Object.freeze({
  figma: {name:'Figma',endpoint:'http://127.0.0.1:3845/mcp',remoteEndpoint:'https://mcp.figma.com/mcp',authHeader:'Authorization',docs:'https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/'},
  mastergo: {name:'MasterGo Magic',endpoint:'https://mastergo.com/mcp/xf/sse',authHeader:'x-mg-useraccesstoken',docs:'https://mastergo.com/help/ai-features/magic-mcp.html'}
});
export class DesignImportError extends Error {
  constructor(code,message,details = {}) {super(message);this.name = 'DesignImportError';this.code = code;this.details = details;}
}
const fail = (code,message,details) => {throw new DesignImportError(code,message,details);};
const own = (value,key) => Object.prototype.hasOwnProperty.call(value,key);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const limitText = (value,max = 4000) => String(value ?? '').slice(0,max);
const READ_TOOLS = new Set(['get_design_context','get_metadata','get_screenshot','download_assets','getDsl','get_frontend_code','get_selection_image']);
const canonical = name => name.replace(/^mcp_+/,'');
const SUPPORTED_PROTOCOLS = ['2024-11-05','2025-03-26','2025-06-18','2025-11-25'];
function endpointURL(value) {
  let url;try {url = new URL(value);} catch {fail('INVALID_ENDPOINT','Provide an absolute MCP endpoint URL');}
  const local = ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) fail('INVALID_ENDPOINT','Use HTTPS, or HTTP on localhost; keep credentials out of endpoint URLs');
  return url;
}
export function normalizeDesignConfig(input = {}) {
  if (!isObject(input) || !own(DESIGN_PROVIDERS,input.provider)) fail('INVALID_PROVIDER','Choose figma or mastergo');
  const definition = DESIGN_PROVIDERS[input.provider];
  const endpoint = endpointURL(input.endpoint || definition.endpoint).href;
  if (input.token !== undefined && (typeof input.token !== 'string' || /[\r\n]/.test(input.token) || input.token.length > 16000)) fail('INVALID_CREDENTIAL','Invalid provider credential');
  if (!['auto','http','sse'].includes(input.transport || 'auto')) fail('INVALID_TRANSPORT','transport must be auto, http or sse');
  return {provider:input.provider,endpoint,transport:input.transport || 'auto',token:input.token || ''};
}
function redact(value,token) {
  let result = String(value);
  if (token) for (const secret of new Set([token,encodeURIComponent(token)])) result = result.split(secret).join('[redacted]');
  return result.replace(/(Bearer\s+)(?![A-Za-z_]+=)[A-Za-z0-9._~+\/-]{8,}/gi,'$1[redacted]');
}
function publicSource(config) {return {provider:config.provider,endpoint:config.endpoint};}
function redactValue(value,token) {
  if (typeof value === 'string') return redact(value,token);
  if (Array.isArray(value)) return value.map(item => redactValue(item,token));
  if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([key,item]) => [redact(key,token),redactValue(item,token)]));
  return value;
}
function publicError(error,token) {return {code:typeof error?.code === 'string' ? error.code : ['TimeoutError','AbortError'].includes(error?.name) ? 'TIMEOUT':'CONNECTION_FAILED',message:redact(limitText(error?.message || error),token),details:redactValue(error?.details || {},token)};}
function combinedSignal(signal,timeoutMs) {return signal ? AbortSignal.any([signal,AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);}
async function bodyText(response,maxBytes) {
  const reader = response.body?.getReader();if (!reader) return '';
  const decoder = new TextDecoder();let size = 0;let text = '';
  try {while (true) {const {done,value} = await reader.read();if (done) break;size += value.byteLength;if (size > maxBytes) fail('RESPONSE_TOO_LARGE','The design server response exceeds the configured limit');text += decoder.decode(value,{stream:true});}return text + decoder.decode();}
  finally {await reader.cancel().catch(() => {});reader.releaseLock();}
}
async function* sseEvents(response,maxBytes) {
  const reader = response.body?.getReader();if (!reader) fail('MCP_PROTOCOL_ERROR','MCP SSE response has no body');
  const decoder = new TextDecoder();let buffer = '';let bytes = 0;
  try {
    while (true) {
      const {done,value} = await reader.read();
      if (!done) {bytes += value.byteLength;if (bytes > maxBytes) fail('RESPONSE_TOO_LARGE','MCP event stream exceeded its bounded read');buffer += decoder.decode(value,{stream:true});}
      else buffer += decoder.decode();
      buffer = buffer.replace(/\r\n/g,'\n').replace(/\r(?!$)/g,'\n');
      if (done) buffer = buffer.replace(/\r/g,'\n');
      let end;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0,end);buffer = buffer.slice(end + 2);let event = 'message';const data = [];
        for (const line of frame.split('\n')) {if (line.startsWith('event:')) event = line.slice(6).trim();else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /,''));}
        if (data.length) yield {event,data:data.join('\n')};
      }
      if (done) break;
    }
  } finally {await reader.cancel().catch(() => {});reader.releaseLock();}
}

/** Streamable HTTP and 2024-11-05 HTTP+SSE; never invokes sampling, roots or writes. */
export class McpDesignClient {
  #token;#config;#fetch;#session;#protocol;#counter = 0;#abort = new AbortController();#postURL;#legacyIterator;#pending = new Map();#pump;#closed = false;
  constructor(config,{fetch:fetchImpl = globalThis.fetch,timeoutMs = 30000,maxBytes = 8_000_000} = {}) {
    this.#config = normalizeDesignConfig(config);this.#token = this.#config.token;this.#fetch = fetchImpl;this.timeoutMs = timeoutMs;this.maxBytes = maxBytes;
    if (typeof fetchImpl !== 'function') fail('FETCH_UNAVAILABLE','This Host needs the standard Fetch API');
  }
  get source() {return publicSource(this.#config);}
  headers(accept = 'application/json, text/event-stream') {
    const headers = {'Accept':accept,'Content-Type':'application/json'};
    if (this.#token) headers[DESIGN_PROVIDERS[this.#config.provider].authHeader] = this.#config.provider === 'figma' ? `Bearer ${this.#token}` : this.#token;
    if (this.#session) headers['Mcp-Session-Id'] = this.#session;
    if (this.#protocol) headers['MCP-Protocol-Version'] = this.#protocol;
    return headers;
  }
  async fetchResponse(url,options,signal) {
    let response;
    try {response = await this.#fetch(url,{...options,redirect:'manual',signal:combinedSignal(AbortSignal.any([this.#abort.signal,...(signal ? [signal]:[])]),this.timeoutMs)});}
    catch (error) {if (signal?.aborted || this.#abort.signal.aborted) fail('CANCELLED','Design read was cancelled');if (error?.name === 'TimeoutError' || error?.name === 'AbortError') fail('TIMEOUT','The design server did not respond in time');fail('CONNECTION_FAILED','Cannot connect to the design server. Check that the desktop MCP service is enabled, or verify the remote endpoint.');}
    if ([401,403].includes(response.status)) {
      const challenge = response.headers.get('www-authenticate') || '';
      await response.body?.cancel().catch(() => {});
      fail(response.status === 401 ? 'AUTH_REQUIRED' : 'ACCESS_DENIED',response.status === 401 ? (this.#config.provider === 'figma' ? 'Authorize Figma remote with an approved OAuth client, or enable the Figma desktop MCP server; the desktop server requires no bearer token.' : 'Save a valid MasterGo personal access token before importing. Magic MCP requires a Team plan or higher and a file in an authorized team project.') : 'The provider denied access. Verify account plan, file permissions and authorized MCP-client support.',{status:response.status,...(challenge ? {authentication:redact(limitText(challenge,2000),this.#token)}: {})});
    }
    if (response.status >= 300 && response.status < 400) {await response.body?.cancel().catch(() => {});fail('REDIRECT_BLOCKED','MCP endpoint redirected; save its final trusted endpoint instead');}
    return response;
  }
  unpack(message,id) {
    if (!isObject(message) || message.jsonrpc !== '2.0' || message.id !== id) return undefined;
    if (message.error) fail('MCP_RPC_ERROR',redact(limitText(message.error.message || 'MCP request failed'),this.#token),{rpcCode:message.error.code});
    if (!own(message,'result')) fail('MCP_PROTOCOL_ERROR','MCP response is missing its result');
    return {value:message.result};
  }
  async httpMessage(message,signal,allowFallback = false) {
    const response = await this.fetchResponse(this.#config.endpoint,{method:'POST',headers:this.headers(),body:JSON.stringify(message)},signal);
    if (allowFallback && [404,405].includes(response.status)) {await response.body?.cancel().catch(() => {});return {fallback:true};}
    if (!response.ok) {await response.body?.cancel().catch(() => {});fail('MCP_HTTP_ERROR',`Design MCP returned HTTP ${response.status}`,{status:response.status});}
    const session = response.headers.get('mcp-session-id');if (session) this.#session = session;
    if (!own(message,'id') || !message.method) {await response.body?.cancel().catch(() => {});return {value:null};}
    const type = response.headers.get('content-type') || '';
    if (type.includes('text/event-stream')) {
      for await (const event of sseEvents(response,this.maxBytes)) {
        let decoded;try {decoded = JSON.parse(event.data);} catch {continue;}
        for (const item of Array.isArray(decoded) ? decoded:[decoded]) {
          if (isObject(item) && item.method && own(item,'id')) await this.rejectServerRequest(item,signal);
          const result = this.unpack(item,message.id);if (result) return result;
        }
      }
      fail('MCP_PROTOCOL_ERROR','MCP stream ended before the requested response arrived');
    }
    if (!type.includes('application/json')) {await response.body?.cancel().catch(() => {});fail('MCP_PROTOCOL_ERROR','Endpoint did not return an MCP JSON or SSE response');}
    let decoded;try {decoded = JSON.parse(await bodyText(response,this.maxBytes));} catch (error) {if (error instanceof DesignImportError) throw error;fail('MCP_PROTOCOL_ERROR','MCP returned malformed JSON');}
    for (const item of Array.isArray(decoded) ? decoded:[decoded]) {const result = this.unpack(item,message.id);if (result) return result;}
    fail('MCP_PROTOCOL_ERROR','MCP response ID did not match the request');
  }
  async rejectServerRequest(request,signal) {
    const message = {jsonrpc:'2.0',id:request.id,error:{code:-32601,message:'This read-only design client does not provide client-side methods'}};
    if (this.#postURL) await this.postLegacy(message,signal);else await this.httpMessage(message,signal);
  }
  async openLegacy(signal) {
    const response = await this.fetchResponse(this.#config.endpoint,{method:'GET',headers:this.headers('text/event-stream')},signal);
    if (!response.ok || !response.headers.get('content-type')?.includes('text/event-stream')) {await response.body?.cancel().catch(() => {});fail('MCP_PROTOCOL_ERROR','The configured endpoint is not an HTTP+SSE MCP server');}
    const iterator = sseEvents(response,this.maxBytes)[Symbol.asyncIterator]();this.#legacyIterator = iterator;
    const first = await iterator.next();
    if (first.done || first.value.event !== 'endpoint') fail('MCP_PROTOCOL_ERROR','Legacy MCP did not announce a message endpoint');
    let endpoint;try {endpoint = new URL(first.value.data,this.#config.endpoint);} catch {fail('MCP_PROTOCOL_ERROR','MCP announced an invalid message endpoint');}
    if (endpoint.origin !== new URL(this.#config.endpoint).origin || endpoint.username || endpoint.password || endpoint.hash) fail('UNTRUSTED_MCP_ENDPOINT','MCP message endpoint must use the configured origin');
    this.#postURL = endpoint.href;
    this.#pump = (async () => {
      try {
        while (!this.#closed) {
          const next = await iterator.next();if (next.done) break;if (next.value.event !== 'message') continue;
          let decoded;try {decoded = JSON.parse(next.value.data);} catch {continue;}
          for (const item of Array.isArray(decoded) ? decoded:[decoded]) {
            if (item?.method && own(item,'id')) {await this.rejectServerRequest(item,signal);continue;}
            const pending = this.#pending.get(item?.id);if (!pending) continue;
            this.#pending.delete(item.id);pending.resolve(item);
          }
        }
        if (!this.#closed) throw new DesignImportError('MCP_DISCONNECTED','The design MCP event stream disconnected');
      } catch (error) {for (const item of this.#pending.values()) item.reject(error);this.#pending.clear();}
    })();
  }
  async postLegacy(message,signal) {
    const response = await this.fetchResponse(this.#postURL,{method:'POST',headers:this.headers(),body:JSON.stringify(message)},signal);
    if (!response.ok) {await response.body?.cancel().catch(() => {});fail('MCP_HTTP_ERROR',`MCP message endpoint returned HTTP ${response.status}`,{status:response.status});}
    await response.body?.cancel().catch(() => {});
  }
  async legacyMessage(message,signal) {
    if (!own(message,'id')) {await this.postLegacy(message,signal);return null;}
    const timeout = combinedSignal(AbortSignal.any([this.#abort.signal,...(signal ? [signal]:[])]),this.timeoutMs);
    let rejectPending;
    const response = new Promise((resolve,reject) => {rejectPending = reject;this.#pending.set(message.id,{resolve,reject});});
    response.catch(() => {});
    const abort = () => {this.#pending.delete(message.id);rejectPending(new DesignImportError(signal?.aborted ? 'CANCELLED':'TIMEOUT','Design MCP request was cancelled or timed out'));};
    timeout.addEventListener('abort',abort,{once:true});
    try {await this.postLegacy(message,signal);const result = this.unpack(await response,message.id);if (!result) fail('MCP_PROTOCOL_ERROR','Invalid legacy MCP response');return result.value;}
    finally {timeout.removeEventListener('abort',abort);this.#pending.delete(message.id);response.catch(() => {});}
  }
  async request(method,params,signal) {
    const message = {jsonrpc:'2.0',id:++this.#counter,method,...(params !== undefined ? {params}: {})};
    return this.#postURL ? this.legacyMessage(message,signal) : (await this.httpMessage(message,signal)).value;
  }
  async connect(signal) {
    const initialize = {jsonrpc:'2.0',id:++this.#counter,method:'initialize',params:{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'DSH Designer',version:'1.0.0'}}};
    let result;
    if (this.#config.transport === 'sse') {await this.openLegacy(signal);result = await this.legacyMessage(initialize,signal);}
    else {
      const reply = await this.httpMessage(initialize,signal,this.#config.transport === 'auto');
      if (reply.fallback) {await this.openLegacy(signal);result = await this.legacyMessage(initialize,signal);} else result = reply.value;
    }
    if (!isObject(result) || !SUPPORTED_PROTOCOLS.includes(result.protocolVersion) || !isObject(result.capabilities)) fail('MCP_PROTOCOL_ERROR','Server initialization did not negotiate a supported MCP protocol');
    this.#protocol = result.protocolVersion;
    const notification = {jsonrpc:'2.0',method:'notifications/initialized'};
    if (this.#postURL) await this.postLegacy(notification,signal);else await this.httpMessage(notification,signal);
    if (!result.capabilities.tools) fail('TOOLS_UNAVAILABLE','This MCP server does not advertise design tools');
    const tools = [];const cursors = new Set();let cursor;
    for (let page = 0;page < 20;page++) {
      const list = await this.request('tools/list',cursor ? {cursor}: {},signal);
      if (!Array.isArray(list?.tools)) fail('MCP_PROTOCOL_ERROR','tools/list did not return a tool catalog');
      for (const tool of list.tools) {
        if (typeof tool.name !== 'string' || !isObject(tool.inputSchema)) fail('MCP_PROTOCOL_ERROR','A discovered tool has no valid input schema');
        tools.push({name:tool.name,description:tool.description || '',inputSchema:tool.inputSchema});
      }
      if (tools.length > 1000) fail('TOOLS_TOO_LARGE','The provider tool catalog is too large');
      cursor = list.nextCursor;if (!cursor) break;
      if (typeof cursor !== 'string' || cursors.has(cursor) || page === 19) fail('MCP_PROTOCOL_ERROR','Tool catalog pagination did not complete');cursors.add(cursor);
    }
    const names = new Set();for (const tool of tools) {if (names.has(tool.name)) fail('MCP_PROTOCOL_ERROR','Provider catalog contains duplicate tool names');names.add(tool.name);}
    return {tools,server:result.serverInfo || {},protocolVersion:this.#protocol,transport:this.#postURL ? 'sse':'http'};
  }
  async call(tool,args,signal) {
    if(canonical(tool.name)==='getD2c')fail('UNSAFE_PROVIDER_TOOL','MasterGo getD2c writes provider-side files; use getDsl or import an exported file through the workspace');
    if (!READ_TOOLS.has(canonical(tool.name))) fail('TOOL_NOT_ALLOWED','Only supported design-read tools can be invoked');
    validateToolArguments(tool.inputSchema,args);
    const name = canonical(tool.name);
    if (name === 'get_frontend_code' && args.writeToFile !== false || name === 'get_screenshot' && (tool.inputSchema.required || []).includes('projectDir')) fail('UNSAFE_PROVIDER_TOOL','This provider tool must not write files outside the DSH asset pipeline');
    if (Object.keys(args).some(key => /(?:outDir|outputDir|outputPath|savePath|saveDir|fileName)$/i.test(key) && args[key])) fail('UNSAFE_PROVIDER_TOOL','Import tools must return assets rather than write external files');
    const result = await this.request('tools/call',{name:tool.name,arguments:args},signal);
    if (!isObject(result) || (!Array.isArray(result.content) && !isObject(result.structuredContent))) fail('MCP_PROTOCOL_ERROR','Design tool returned an invalid content envelope');
    if (result.isError) {
      const message = (result.content || []).filter(p => p.type === 'text').map(p => p.text).join('\n');
      fail('DESIGN_READ_FAILED',redact(limitText(message || 'Provider could not read this design. Verify the selected frame and account access.'),this.#token),{tool:tool.name});
    }
    return redactValue(result,this.#token);
  }
  async close() {
    this.#closed = true;this.#abort.abort();for (const pending of this.#pending.values()) pending.reject(new DesignImportError('CANCELLED','Design MCP connection closed'));this.#pending.clear();
    await this.#pump?.catch(() => {});await this.#legacyIterator?.return?.().catch(() => {});
    if (this.#session && !this.#postURL) {
      try {const response = await this.#fetch(this.#config.endpoint,{method:'DELETE',headers:this.headers(),redirect:'manual',signal:AbortSignal.timeout(1500)});await response.body?.cancel().catch(() => {});} catch {}
    }
    this.#token = '';this.#session = undefined;
  }
}

// Validate the discovered schema, never a handwritten provider argument schema.
export function validateToolArguments(schema,value) {
  const root = schema;const issues = [];
  function check(s,v,at = '$',depth = 0) {
    if (depth > 40) fail('SCHEMA_UNSUPPORTED','Design tool schema nesting is too deep');
    if (s === true) return;if (s === false) {issues.push(at + ' is disallowed');return;}
    if (!isObject(s)) fail('SCHEMA_UNSUPPORTED','Design tool schema is malformed');
    if (s.$ref) {
      if (typeof s.$ref !== 'string' || !s.$ref.startsWith('#/')) fail('SCHEMA_UNSUPPORTED','Only local schema references are supported');
      let target = root;for (const key of s.$ref.slice(2).split('/').map(k => k.replace(/~1/g,'/').replace(/~0/g,'~'))) target = target?.[key];
      if (!target) fail('SCHEMA_UNSUPPORTED','Unresolved design tool schema reference');check(target,v,at,depth + 1);
    }
    if (s.const !== undefined && JSON.stringify(s.const) !== JSON.stringify(v)) issues.push(at + ' must match const');
    if (s.enum && !s.enum.some(item => JSON.stringify(item) === JSON.stringify(v))) issues.push(at + ' must match enum');
    const kind = v === null ? 'null':Array.isArray(v) ? 'array':typeof v;
    const types = s.type === undefined ? []:Array.isArray(s.type) ? s.type:[s.type];
    if (types.length && !types.some(type => type === kind || type === 'integer' && Number.isInteger(v))) {issues.push(at + ' has an invalid type');return;}
    for (const key of ['anyOf','oneOf']) if (Array.isArray(s[key])) {
      let count = 0;for (const option of s[key]) {const start = issues.length;check(option,v,at,depth + 1);if (issues.length === start) count++;issues.splice(start);}
      if (key === 'oneOf' ? count !== 1:count === 0) issues.push(at + ' does not match ' + key);
    }
    for (const option of s.allOf || []) check(option,v,at,depth + 1);
    if (s.not || s.if || s.dependentSchemas || s.patternProperties || s.unevaluatedProperties !== undefined) fail('SCHEMA_UNSUPPORTED','This tool uses unsupported conditional schema rules');
    if (isObject(v)) {
      for (const key of s.required || []) if (!own(v,key)) issues.push(at + '.' + key + ' is required');
      for (const [key,item] of Object.entries(v)) {
        if (['__proto__','constructor','prototype'].includes(key)) {issues.push(at + '.' + key + ' is not allowed');continue;}
        if (own(s.properties || {},key)) check(s.properties[key],item,at + '.' + key,depth + 1);
        else if (s.additionalProperties === false) issues.push(at + '.' + key + ' is not accepted');
        else if (isObject(s.additionalProperties)) check(s.additionalProperties,item,at + '.' + key,depth + 1);
      }
    }
    if (Array.isArray(v)) {if (s.minItems !== undefined && v.length < s.minItems || s.maxItems !== undefined && v.length > s.maxItems) issues.push(at + ' has an invalid array length');if (s.items) v.forEach((item,index) => check(s.items,item,at + '[' + index + ']',depth + 1));}
    if (typeof v === 'string') {
      if (s.minLength !== undefined && v.length < s.minLength || s.maxLength !== undefined && v.length > s.maxLength) issues.push(at + ' has an invalid string length');
      if (s.pattern) {if (s.pattern.length > 1000 || v.length > 10000) fail('SCHEMA_UNSUPPORTED','Pattern validation exceeds the bounded input limit');try {if (!new RegExp(s.pattern).test(v)) issues.push(at + ' does not match pattern');} catch {fail('SCHEMA_UNSUPPORTED','Invalid schema pattern');}}
    }
    if (typeof v === 'number' && (!Number.isFinite(v) || s.minimum !== undefined && v < s.minimum || s.maximum !== undefined && v > s.maximum)) issues.push(at + ' is outside its numeric bounds');
  }
  if (!isObject(value)) fail('INVALID_TOOL_ARGUMENTS','MCP tool arguments must be an object');
  check(schema,value);
  if (issues.length) fail('INVALID_TOOL_ARGUMENTS','Supply the arguments required by the discovered design tool',{issues:issues.slice(0,20),inputSchema:schema});
  return value;
}

function selection(input,provider) {
  const values = {};
  if (input.url) {
    let url;try {url = new URL(input.url);} catch {fail('INVALID_DESIGN_URL','Provide a valid design selection URL');}
    if (!['https:','http:'].includes(url.protocol) || url.username || url.password) fail('INVALID_DESIGN_URL','Design links must use HTTP(S) and contain no embedded credentials');
    values.url = url.href;
    if (provider === 'figma') {const match = url.pathname.match(/^\/(?:design|file|proto|make)\/([^/]+)/);if (match) values.fileKey = match[1];values.nodeId = url.searchParams.get('node-id')?.replace(/^(\d+)-(\d+)$/,'$1:$2');}
    else {values.fileId=url.pathname.match(/^\/file\/([^/]+)/)?.[1];values.layerId=url.searchParams.get('layer_id')||url.searchParams.get('page_id')||undefined;values.sourceLayerId=url.searchParams.get('source_layer_id')||undefined;if(/^\/goto\/[^/]+\/?$/.test(url.pathname))values.shortLink=url.href;}
  }
  for (const key of ['fileKey','fileId','nodeId','layerId','sourceLayerId','contentId']) if (input[key] !== undefined) {if (typeof input[key] !== 'string' || input[key].length > 1000) fail('INVALID_SELECTION',`Invalid ${key}`);values[key] = input[key];}
  if (provider === 'mastergo' && values.nodeId && !values.layerId) values.layerId = values.nodeId;
  return values;
}
function argsFor(tool,input,values,override) {
  const properties = tool.inputSchema.properties || {};
  if (override !== undefined && !isObject(override)) fail('INVALID_TOOL_ARGUMENTS','Tool arguments must be a JSON object');
  const args = {...(override || {})};
  const name = canonical(tool.name);
  if (name === 'get_frontend_code') {
    if (!own(properties,'writeToFile')) fail('UNSAFE_PROVIDER_TOOL','This Vibe tool cannot disable external file writes');
    if (args.writeToFile === true || args.outDir || args.fileName) fail('UNSAFE_PROVIDER_TOOL','Designer imports inline code; external MCP file writes are disabled');
    args.writeToFile = false;
    if (own(properties,'frontendFramework')) args.frontendFramework = 'html';
    if (own(properties,'projectDir') && !own(args,'projectDir') && typeof input.projectDir === 'string') args.projectDir = input.projectDir;
    if (own(properties,'targetNodeId') && !own(args,'targetNodeId') && (values.layerId || values.nodeId)) args.targetNodeId = values.layerId || values.nodeId;
  }
  if (name === 'get_screenshot' && (tool.inputSchema.required || []).includes('projectDir')) fail('UNSAFE_PROVIDER_TOOL','This Vibe screenshot tool writes files outside the DSH asset pipeline; use the browser capture preview instead');
  for (const key of ['url','fileKey','fileId','nodeId','layerId','sourceLayerId','shortLink','contentId']) if (own(properties,key) && !own(args,key) && values[key] !== undefined) args[key] = values[key];
  if (own(properties,'nodeIds') && !own(args,'nodeIds') && values.nodeId) args.nodeIds = [values.nodeId];
  validateToolArguments(tool.inputSchema,args);
  if(name==='getDsl'&&(own(properties,'fileId')||own(properties,'shortLink'))&&!args.shortLink&&!(args.fileId&&(args.layerId||args.sourceLayerId)))fail('INVALID_TOOL_ARGUMENTS','Select a MasterGo layer/page URL, or use a shared link supported by the advertised shortLink field',{inputSchema:tool.inputSchema,tool:tool.name,selectionKind:values.shortLink?'shared-link':'file-or-layer',docs:DESIGN_PROVIDERS.mastergo.docs});
  return args;
}
function textContent(result) {
  const parts = (result.content || []).flatMap(part => part.type === 'text' && typeof part.text === 'string' ? [part.text]:part.type === 'resource' && typeof part.resource?.text === 'string' ? [part.resource.text]:[]);
  if (result.structuredContent) parts.push(JSON.stringify(result.structuredContent,null,2));
  return parts.join('\n\n');
}
export function normalizeDesignResult(results,source,{maxContextChars = 200000,maxAssets = 200} = {}) {
  const assets = new Map();const warnings = [];let preview,html;const contexts = [];
  const suppliedHTML=result=>{for(const candidate of [result.structuredContent?.html,result.structuredContent?.code,...(result.content||[]).filter(part=>part.type==='text').map(part=>part.text)]){if(typeof candidate!=='string')continue;const fenced=/```html\s*([\s\S]*?)```/i.exec(candidate),value=(fenced?fenced[1]:candidate).trim();if((fenced||/^<(?:!doctype\s+html|html)\b/i.test(value)||candidate===result.structuredContent?.html)&&value.startsWith('<'))return value;}return undefined;};
  function asset(url,extra = {},loose = false) {
    if (typeof url !== 'string') return;
    let parsed;try {parsed = new URL(url.replace(/&amp;/g,'&'));} catch {return;}
    if (!['https:','http:'].includes(parsed.protocol) || parsed.username || parsed.password || url.includes('[redacted')) return;
    if (!loose && !/\.(?:png|jpe?g|webp|gif|svg|avif|ico|woff2?|ttf|otf|css)(?:$|\?)/i.test(parsed.href) && !/\/(?:assets?|images?)\//i.test(parsed.pathname)) return;
    if (assets.size >= maxAssets) {if (!warnings.includes('Asset list truncated')) warnings.push('Asset list truncated');return;}
    let filename = parsed.pathname.split('/').at(-1) || 'asset';try {filename = decodeURIComponent(filename);} catch {}
    filename = filename.replace(/[^\p{L}\p{N}._-]/gu,'_').slice(0,160);
    assets.set(parsed.href,{...assets.get(parsed.href),url:parsed.href,...(filename ? {filename}: {}),...extra});
  }
  function walk(value,key = '',depth = 0) {
    if (depth > 25 || value === null) return;
    if (typeof value === 'string') {for (const match of value.matchAll(/https?:\/\/[^\s"'<>`\\)\]}]+/g)) asset(match[0],{},/(?:asset|image|download|screenshot|preview|thumbnail|font)/i.test(key));if(/^[\s]*[\[{]/.test(value)&&value.length<=2_000_000){try{const parsed=JSON.parse(value);if(parsed&&typeof parsed==='object')walk(parsed,key,depth+1);}catch{/* Plain provider prose is retained verbatim as context. */}}}
    else if (Array.isArray(value)) value.forEach(item => walk(item,key,depth + 1));
    else if (isObject(value)) {if (typeof value.url === 'string') asset(value.url,{...(typeof value.mimeType === 'string' ? {mimeType:value.mimeType}: {})},/(?:asset|image|download|preview|screenshot|thumbnail|font)/i.test(key));for (const [child,item] of Object.entries(value)) walk(item,key + '.' + child,depth + 1);}
  }
  for (const {tool,result,role = 'context'} of results) {
    walk(result,role);
    if (role === 'context') {contexts.push(textContent(result));html ||= suppliedHTML(result);}
    for (const part of result.content || []) if (part.type === 'image' && typeof part.data === 'string') {
      if (part.data.length <= 8_000_000 && /^image\/(?:png|jpeg|webp|gif)$/.test(part.mimeType || '')) preview ||= {mimeType:part.mimeType,bytesBase64:part.data};
      else warnings.push(`Unsupported or oversized preview from ${tool}`);
    }
    if (role === 'preview' && !preview) {const found = [...assets.values()].find(a => /\.(png|jpe?g|webp|gif)(?:$|\?)/i.test(a.url));if (found) preview = {url:found.url,mimeType:found.mimeType || 'image/png'};}
  }
  const fullContext = contexts.join('\n\n');
  if (!fullContext.trim()) fail('EMPTY_DESIGN','The design server returned no usable design context. Select a frame or supply the tool arguments requested by its schema.');
  if (fullContext.length > maxContextChars) warnings.push('Design context truncated; import a smaller frame for full fidelity');
  return {kind:source.provider,sourceURL:source.url || source.endpoint,source,...(html?{html}:{}),diagnostics:{sourceFormat:html?'provider-html':'design-context',preview:preview?'provider-supplied':'unavailable',assets:'discovered-not-yet-archived'},context:fullContext.slice(0,maxContextChars),assets:[...assets.values()],...(preview ? {preview}: {}),warnings,contextTruncated:fullContext.length > maxContextChars,toolsUsed:results.map(r => r.tool)};
}

function metadataOutline(result){
  const nodes=[],seen=new Set(),designTag=/^(?:frame|canvas|page|document|section|group|component(?:_set)?|instance|text|rectangle|rounded_rectangle|vector|line|ellipse|regular_polygon|star|boolean_operation|slice|sticky|shape_with_text|connector)$/i;let visits=0,truncated=false;
  const add=(v,parentId,tag)=>{const id=typeof v.id==='string'||typeof v.id==='number'?String(v.id):typeof v.nodeId==='string'?v.nodeId:null;if(!id||!designTag.test(String(v.type||tag||'')))return parentId;if(seen.has(id))return id;if(nodes.length>=6000){truncated=true;return id;}seen.add(id);const number=k=>Number.isFinite(Number(v[k]))?Number(v[k]):undefined;const layout=v.absoluteBoundingBox||v.bounds||v.layout||(v.width!==undefined?Object.fromEntries(['x','y','width','height'].map(k=>[k,number(k)])):undefined);nodes.push({id,parentId:v.parentId||parentId||null,name:v.name||id,tag:v.type||tag||'design-node',layout,thumbnail:v.thumbnail||v.thumbnailUrl||v.preview});return id;};
  const walk=(v,parentId=null,depth=0)=>{if(!v||typeof v!=='object')return;if(++visits>20000||depth>60){truncated=true;return;}if(Array.isArray(v)){for(const item of v)walk(item,parentId,depth+1);return;}const id=add(v,parentId,v.type);for(const [key,item]of Object.entries(v))if(['children','document','pages','nodes','frames','layers'].includes(key)||!v.id&&!v.nodeId&&!v.type)walk(item,id,depth+1);};
  if(result.structuredContent)walk(result.structuredContent);
  for(const part of result.content||[]){if(part.type!=='text'||typeof part.text!=='string')continue;const source=part.text;try{walk(JSON.parse(source));continue;}catch{}
    // Official Figma metadata is XML. Only actual ID attributes enter the index.
    const stack=[];for(const match of source.matchAll(/<(\/?)([\w:-]+)\b([^<>]*?)(\/?)>/g)){if(++visits>20000){truncated=true;break;}const [,closing,tag,raw,selfClosing]=match;if(closing){const at=stack.findLastIndex(n=>n.tag===tag);if(at>=0)stack.length=at;continue;}const element=parseFragment('<span '+raw+'></span>').childNodes[0],values=Object.fromEntries((element?.attrs||[]).map(a=>[a.name,a.value]));const id=add(values,stack.at(-1)?.id||null,tag);if(!selfClosing)stack.push({tag,id});}
  }
  return {nodes,truncated};
}

export class DesignImportEngine {
  constructor(options = {}) {this.options = options;}
  async discover(config, {signal} = {}) {
    let client;let normalized;
    try {normalized = normalizeDesignConfig(config);client = new McpDesignClient(normalized,this.options);const connected = await client.connect(signal);return {connected:true,source:client.source,...redactValue(connected,normalized.token)};}
    catch (error) {return {connected:false,...(normalized ? {source:publicSource(normalized)}: {}),error:publicError(signal?.aborted ? new DesignImportError('CANCELLED','Design read was cancelled'):error,config?.token)};}
    finally {await client?.close();}
  }
  async probe(config,options) {return this.discover(config,options);}
  /** Read only advertised official metadata. No context/code conversion is treated as discovery. */
  async outline(input,{signal}={}){
    const offset=input.offset??0,limit=input.limit??100;
    if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>200)fail('INVALID_INPUT','Outline offset must be nonnegative and limit must be 1–200');
    const config=normalizeDesignConfig(input),client=new McpDesignClient(config,this.options),base={provider:config.provider,capability:'outline-discovery',nodes:[],nodeOffset:offset,nodeTotal:0,nextNodeOffset:null};
    try{
      const {tools}=await client.connect(signal),tool=tools.find(t=>canonical(t.name)==='get_metadata');
      if(!tool)return {...base,status:'unsupported',reason:'The official provider does not advertise a supported read-only metadata outline tool; choose an explicit node URL or import an export'};
      const values=selection({...input,...(input.parentId?{nodeId:input.parentId}: {})},config.provider);let args;
      try{args=argsFor(tool,input,values,input.toolArguments);}catch(error){if(error.code==='INVALID_TOOL_ARGUMENTS')return {...base,status:'unsupported',reason:'Official metadata requires an explicit source scope or arguments unavailable to bounded discovery',requiredFields:tool.inputSchema.required||[]};throw error;}
      const result=await client.call(tool,args,signal),parsed=metadataOutline(result);
      if(!parsed.nodes.length)return {...base,status:'unsupported',reason:'The official metadata response supplied no supported structured node outline',tool:tool.name};
      return {...base,status:'available',tool:tool.name,nodes:parsed.nodes.slice(offset,offset+limit),nodeTotal:parsed.nodes.length,nextNodeOffset:offset+limit<parsed.nodes.length?offset+limit:null,truncated:parsed.truncated,limitReason:parsed.truncated?'Provider metadata exceeded the 6000-node bounded index; select a smaller source parent':undefined};
    }catch(error){const safe=publicError(signal?.aborted?new DesignImportError('CANCELLED','Design read was cancelled'):error,config.token);throw new DesignImportError(safe.code,safe.message,safe.details);}
    finally{await client.close();}
  }
  async read(input,{signal} = {}) {
    const config = normalizeDesignConfig(input);const client = new McpDesignClient(config,this.options);
    try {
      const {tools} = await client.connect(signal);const values = selection(input,config.provider);
      const preferred = input.toolName || (config.provider === 'figma' ? 'get_design_context':'getDsl');
      let primary = tools.find(t => t.name === preferred || canonical(t.name) === preferred);
      if (!primary && !input.toolName && config.provider === 'mastergo') primary = tools.find(t => canonical(t.name) === 'get_frontend_code');
      if(primary&&canonical(primary.name)==='getD2c')fail('UNSAFE_PROVIDER_TOOL','MasterGo getD2c writes provider-side files; use getDsl or import an exported file through the workspace',{docs:DESIGN_PROVIDERS.mastergo.docs});
      if (!primary || !READ_TOOLS.has(canonical(primary.name))) fail('DESIGN_TOOL_UNAVAILABLE','The connected server does not expose the requested read-only design tool',{availableTools:tools.filter(t => READ_TOOLS.has(canonical(t.name))).map(t => t.name)});
      let argumentsForPrimary;
      try {argumentsForPrimary = argsFor(primary,input,values,input.toolArguments);} catch (error) {if (error.code === 'INVALID_TOOL_ARGUMENTS') error.details = {...error.details,tool:primary.name};throw error;}
      const results = [{tool:primary.name,result:await client.call(primary,argumentsForPrimary,signal)}];const warnings = [];
      const extraRoles = [
        ['preview',input.includePreview !== false,config.provider === 'figma' || canonical(primary.name) === 'get_frontend_code' ? 'get_screenshot':'get_selection_image',input.previewArguments],
        ['assets',input.includeAssets !== false,config.provider === 'figma' ? 'download_assets':null,input.assetArguments]
      ];
      for (const [role,enabled,name,overrides] of extraRoles) {
        if (!enabled || !name) continue;const tool = tools.find(t => canonical(t.name) === name);
        if (!tool) {if (role === 'assets') warnings.push('Provider has no dedicated asset-download tool; asset URLs are extracted from design context');if(role==='preview')warnings.push('Provider did not advertise a source preview tool; no source screenshot was captured');continue;}
        try {const args = argsFor(tool,input,values,overrides);results.push({tool:tool.name,role,result:await client.call(tool,args,signal)});}
        catch (error) {if (signal?.aborted || error.code === 'CANCELLED') throw error;warnings.push(`${role}: ${publicError(error,config.token).message}`);}
      }
      const source = redactValue({...client.source,...(values.url ? {url:values.url}: {}),...Object.fromEntries(['fileKey','fileId','nodeId','layerId','sourceLayerId'].filter(k => values[k] !== undefined).map(k => [k,values[k]]))},config.token);
      const result = normalizeDesignResult(results,source,this.options);result.warnings.push(...warnings);return result;
    } catch (error) {const safe = publicError(signal?.aborted ? new DesignImportError('CANCELLED','Design read was cancelled'):error,config.token);throw new DesignImportError(safe.code,safe.message,safe.details);}
    finally {await client.close();}
  }
}

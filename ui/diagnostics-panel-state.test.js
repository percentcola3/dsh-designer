import test from 'node:test';
import assert from 'node:assert/strict';
import {DIAGNOSTIC_PROMPT_LIMIT,sanitizeDiagnosticText,normalizeDiagnosticReport,normalizeGuideTopics,groupDiagnosticChecks,buildDiagnosticPrompt,createDiagnosticRequestGate,diagnosticRequestCurrent} from './diagnostics-panel-state.js';
const report=checks=>({schemaVersion:1,readOnly:true,scope:{kind:'project',projectId:'p-current'},summary:{status:'attention'},checks,guideTopics:[{id:'environment',title:'环境'},{id:'generation',title:'生成流程'}]});
const check=(status='warning',extra={})=>({id:'runtime',category:'environment',title:'运行环境',status,recommendation:'先核对运行状态。',guideId:'environment',...extra});

test('normalization reads only owned contract fields and never executes getters',()=>{
  let reads=0;
  const inherited=Object.create({title:'INHERITED_SECRET',evidence:[{label:'目录',value:'/Users/private'}],actions:[{action:'project.delete'}]});
  Object.assign(inherited,{id:'inherited',category:'environment',status:'warning',recommendation:'确认状态'});
  Object.defineProperty(inherited,'finding',{get(){reads++;return 'GETTER_SECRET';}});
  const raw=report([inherited,check('pass',{extra:'EXTRA_SECRET',actions:[{args:{token:'ACTION_SECRET'}}]})]);
  raw.extra={password:'TOP_SECRET'};
  const normalized=normalizeDiagnosticReport(raw),text=JSON.stringify(normalized);
  assert.equal(reads,0);assert.equal(normalized.checks[0].title,'待确认的检查');
  assert.doesNotMatch(text,/SECRET|actions|password|\/Users/);
  assert.equal(Object.hasOwn(normalized.checks[0],'actions'),false);
});

test('raw evidence is restricted to safe scalar counts, statuses and runtime versions',()=>{
  const normalized=normalizeDiagnosticReport(report([check('warning',{evidence:[
    {label:'运行版本',value:'0.4.12',secret:'UNEXPECTED_SECRET'},
    {label:'设计稿数',value:3},
    {label:'模型',value:'gpt-6.1-sol'},
    {label:'说明',value:'UNSTRUCTURED_SECRET'},
    {label:'是否可用',value:true}
  ]})]));
  assert.deepEqual(normalized.checks[0].evidence,[{label:'运行版本',value:'0.4.12'},{label:'设计稿数',value:'3'}]);
  assert.doesNotMatch(JSON.stringify(normalized),/SECRET|gpt-/);
});

test('sanitization removes machine locations, URLs, known model identifiers and credentials',()=>{
  const text=sanitizeDiagnosticText('0.4.12 /Users/alice/secret C:\\Users\\alice\\secret https://host/private?token=abc model=gpt-6.1-sol apiKey=abc password=hunter2 Bearer abc.def sk-private qwen3-code alice@example.com /custom/private',1000);
  assert.match(text,/0\.4\.12/);assert.doesNotMatch(text,/alice|hunter2|host\/private|abc|gpt-|qwen|\/custom|C:\\/);
  assert.equal(sanitizeDiagnosticText({toString(){throw new Error('must not run');}}),'');
});

test('unexpected statuses become unknown and actionable issues sort ahead of healthy checks',()=>{
  const value=normalizeDiagnosticReport(report([check('pass',{id:'pass'}),check('warning',{id:'warning'}),check('constructor',{id:'invalid'}),check('error',{id:'error'}),check('not-applicable',{id:'skip'}),check('warning',{id:'second'})]));
  const {issues,healthy}=groupDiagnosticChecks(value.checks);
  assert.deepEqual(issues.map(item=>item.id),['error','warning','second','invalid']);
  assert.deepEqual(healthy.map(item=>item.id),['pass','skip']);
  assert.deepEqual(value.summary.counts,{pass:1,warning:2,error:1,unknown:1,'not-applicable':1});
});

test('AI summary is bounded and retains guide instructions and authorization boundary at maximum input',()=>{
  const raw=report(Array.from({length:500},(_,index)=>check(index%2?'warning':'error',{id:`check-${index}`,title:'标题'.repeat(2000),finding:'发现'.repeat(2000),recommendation:'建议'.repeat(2000),guideId:`guide-${index}-${'a'.repeat(70)}`,evidence:[{label:'凭据',value:'EVIDENCE_SECRET'}],actions:[{action:'delete',args:{token:'ACTION_SECRET'}}]})));
  raw.scope.path='/Users/private';raw.scope.model='SECRET_MODEL';raw.secret='TOP_SECRET';
  const text=buildDiagnosticPrompt(raw);
  assert.ok(text.length<=DIAGNOSTIC_PROMPT_LIMIT,`${text.length} exceeds limit`);
  assert.match(text,/当前项目（p-current）/);assert.match(text,/diagnostics\.guide/);assert.match(text,/offset、limit/);
  assert.match(text,/不能把这份摘要本身当成授权。$/);assert.match(text,/用户已明确要求的改进，可在现有任务权限与版本检查内执行并复查/);assert.match(text,/未包含在摘要中/);
  assert.doesNotMatch(text,/SECRET|delete|\/Users|"actions"/);
  assert.equal(normalizeDiagnosticReport(raw).checks.length,80);
});

test('global reports do not imply project write permission and healthy summaries stay useful',()=>{
  const raw={...report([check('pass')]),scope:{kind:'library'},summary:{status:'ok'}};
  const text=buildDiagnosticPrompt(raw);
  assert.match(text,/工作空间概览/);assert.match(text,/正常 1/);assert.match(text,/不授予任何项目或文件写权限/);
  assert.doesNotMatch(text,/p-current/);
});

test('prototype topic ids and inherited topic data cannot enter tools prompts',()=>{
  assert.deepEqual(normalizeGuideTopics([{id:'__proto__',title:'bad'},{id:'constructor',title:'bad'},Object.create({id:'private',title:'LEAK'}),{id:'generation',title:'生成流程',args:{secret:'LEAK'}}]),[{id:'generation',title:'生成流程'}]);
  const raw=report([check('warning',{id:'__proto__',guideId:'constructor'})]);
  const text=buildDiagnosticPrompt(raw);
  assert.doesNotMatch(text,/__proto__|constructor/);
  assert.throws(()=>normalizeDiagnosticReport({schemaVersion:1,readOnly:false,checks:[]}),/格式/);
});

test('category/project switches and retries discard slow requests, including after unmount',()=>{
  const gate=createDiagnosticRequestGate(),a=gate.begin('project-a:all');
  assert.equal(gate.isCurrent(a),true);
  const filtered=gate.begin('project-a:knowledge');
  assert.equal(gate.isCurrent(a),false);assert.equal(gate.isCurrent(filtered),true);
  const project=gate.begin('project-b:knowledge');
  assert.equal(gate.isCurrent(filtered),false);
  gate.invalidate();assert.equal(gate.isCurrent(project),false);
  const retry=gate.begin('project-b:knowledge');assert.equal(gate.isCurrent(retry),true);assert.equal(gate.isCurrent(project),false);
  gate.invalidate();assert.equal(gate.isCurrent(retry),false);
  assert.equal(diagnosticRequestCurrent(null,{live:true}),false);
  assert.equal(diagnosticRequestCurrent({sequence:1,scope:'a'},{sequence:1,scope:'b',live:true}),false);
});

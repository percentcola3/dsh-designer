import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {compilePageSchema} from './schema-compiler.js';
import {validatePageSchema,schemaPathParts,pageSchemaJSONSchema} from './page-schema.js';
import {desktopSystemFiles} from './desktop-theme.js';
import {mobileSystemFiles} from './mobile-theme.js';
import {normalizeDocument,validateDocument,exportDocument} from './document-model.js';

export function pageFixture() {
  return {schemaVersion:1,id:'notice',root:'page',nodes:{
    page:{kind:'layout',layout:'stack',children:['heading','form','confirm'],style:{maxWidth:880}},
    heading:{kind:'text',tag:'h1',text:'通知设置'},
    form:{kind:'component',use:'form',props:{model:'draft',fields:[{id:'team',label:'团队名称',rules:['required']},{id:'email',label:'邮箱',inputType:'email',rules:['required','email']},{id:'frequency',label:'频率',control:'select',options:[{value:'daily',label:'每日'},{value:'weekly',label:'每周'}]},{id:'enabled',label:'邮件通知',control:'switch'}],submit:{text:'保存',action:'save'},actions:[{id:'restore',text:'恢复默认',action:'open'}]}},
    confirm:{kind:'component',use:'dialog',props:{title:'恢复默认',text:'确认恢复？',actions:[{id:'cancel',text:'取消',action:'close'},{id:'confirm',text:'确认恢复',action:'reset',variant:'primary'}]}},
  },state:{draft:{team:'示例团队',email:'team@example.com',frequency:'daily',enabled:true}},
  actions:{save:{type:'form.submit',target:'form',onValid:[{type:'feedback.show',text:'保存成功'}]},open:{type:'overlay.open',target:'confirm'},close:{type:'overlay.close',target:'confirm'},reset:{type:'sequence',steps:[{type:'state.reset'},{type:'overlay.close',target:'confirm'}]}},
  scenes:{default:{name:'默认'},invalid:{name:'邮箱错误',state:{draft:{email:'bad'}},ui:{form:{validation:'submitted'}}},success:{name:'保存成功',ui:{feedback:{text:'保存成功',tone:'success',persistent:true}}},confirm:{name:'恢复确认',ui:{confirm:{open:true}}}}};
}
function binding(mobile=false){
  const files=mobile?mobileSystemFiles():desktopSystemFiles();
  return {manifest:JSON.parse(files.find(file=>file.logicalPath==='components.json').content),resources:{'theme.css':{url:'assets/theme.css'},'components.js':{url:'assets/components.js'}}};
}

test('the same semantic definition compiles against desktop and mobile pinned component contracts',()=>{
  const spec=pageFixture(), desktop=compilePageSchema(spec,{binding:binding()}),mobile=compilePageSchema(spec,{binding:binding(true),platform:'mobile'});
  for(const compiled of [desktop,mobile]){
    assert.deepEqual(compiled.sceneIds,['default','invalid','success','confirm']);
    assert.match(compiled.html,/<ds-select/);
    assert.match(compiled.html,/assets\/components.js/);
    const document=normalizeDocument(compiled.html);
    assert.ok(document.nodes['form:email:input']);
    assert.ok(document.nodes.confirm);
    assert.equal(document.scenes.items.length,4);
    assert.equal(compiled.sourceMap['form:email:label'].fieldId,'email');
  }
  assert.match(mobile.html,/mobile-field/);
  assert.match(desktop.html,/schema-field/);
  assert.deepEqual(desktop.sourceMap,mobile.sourceMap);
});

test('compilation is deterministic and plain HTML controls work without a bound system',()=>{
  const spec=pageFixture(),first=compilePageSchema(spec),second=compilePageSchema(structuredClone(spec));
  assert.equal(first.html,second.html);
  assert.equal(first.sourceHash,second.sourceHash);
  const document=normalizeDocument(first.html);
  const buttons=Object.values(document.nodes).filter(node=>node.tag==='button');
  assert.equal(buttons.filter(node=>node.attributes['data-schema-action']).length,4);
  assert.equal(buttons.filter(node=>Object.hasOwn(node.attributes,'data-schema-dismiss')).length,1);
  assert.equal(Object.values(document.nodes).filter(node=>node.tag==='button'&&node.childIds.some(id=>document.nodes[id]?.tag==='button')).length,0);
});

test('stable keyed collection instances and source locations survive record order changes',()=>{
  const spec={schemaVersion:1,id:'table',root:'table',nodes:{table:{kind:'component',use:'table',props:{source:'records',key:'code',columns:[{id:'name',title:'名称'}]}}},state:{records:[{code:'a',name:'甲'},{code:'b',name:'乙'}]}};
  const first=compilePageSchema(spec);
  spec.state.records.reverse();
  const second=compilePageSchema(spec);
  assert.deepEqual(Object.keys(first.sourceMap).sort(),Object.keys(second.sourceMap).sort());
  assert.ok(Object.values(first.sourceMap).some(location=>location.recordKey==='a'&&location.field==='name'));
});

test('custom layout, free composition, text, images, repeat and raw HTML retain editable identities',()=>{
  const spec={schemaVersion:1,id:'poster',root:'page',nodes:{
    page:{kind:'layout',layout:'free',children:['title','image','items','custom'],style:{width:800,height:1200}},
    title:{kind:'text',text:'展示页面',style:{position:'absolute',left:40,top:60,fontSize:48}},
    image:{kind:'image',src:'assets/hero.png',alt:'场景图片'},
    items:{kind:'repeat',props:{source:'records',key:'id'},children:['item']},
    item:{kind:'text',bind:'item.name'},custom:{kind:'html',html:'<aside><strong>扩展内容</strong></aside>'},
  },state:{records:[{id:'one',name:'项目一'}]}};
  const compiled=compilePageSchema(spec);
  assert.match(compiled.html,/schema-free/);assert.match(compiled.html,/项目一/);assert.match(compiled.html,/data-dsh-node="custom:html/);
});

for(const [name,change]of [
  ['missing root',spec=>{spec.root='missing';}],
  ['cycle',spec=>{spec.nodes.page.children.push('page');}],
  ['unreachable node',spec=>{spec.nodes.outside={kind:'text',text:'outside'};}],
  ['invalid action',spec=>{spec.actions.save={type:'unknown'};}],
  ['action cycle',spec=>{spec.actions.save='save';}],
  ['missing scene',spec=>{spec.actions.save={type:'scene.enter',scene:'missing'};}],
  ['unsafe path',spec=>{spec.actions.save={type:'state.set',path:'__proto__.x',value:true};}],
  ['unknown field',spec=>{spec.nodes.form.props.fields[0].control='unknown';}],
  ['unknown rule',spec=>{spec.nodes.form.props.fields[0].rules=['unknown'];}],
  ['unknown component',spec=>{spec.nodes.form.use='unknown';}],
])test('invalid schema reports the exact path for '+name,()=>{
  const spec=pageFixture();change(spec);
  const result=validatePageSchema(spec);
  assert.equal(result.valid,false);
  assert.ok(result.diagnostics.every(diagnostic=>diagnostic.path));
});

test('malformed JSON, cycles and prototype state paths fail before compilation',()=>{
  assert.equal(validatePageSchema('{bad').valid,false);
  const spec=pageFixture();spec.state.circular=spec.state;
  assert.equal(validatePageSchema(spec).valid,false);
  for(const value of ['__proto__.x','a.constructor.x','a..b','a[0]'])assert.throws(()=>schemaPathParts(value));
});

test('a missing pinned component gives an explicit capability diagnostic',()=>{
  const system=binding();system.manifest.components=system.manifest.components.filter(component=>component.tag!=='ds-dialog');
  assert.throws(()=>compilePageSchema(pageFixture(),{binding:system}),{code:'SCHEMA_COMPONENT_UNAVAILABLE'});
});

test('tag and navigation aliases compile to the pinned public component structure across themes',()=>{
  const spec={schemaVersion:1,id:'booking',root:'root',nodes:{
    root:{kind:'layout',children:['nav','status','label']},
    nav:{kind:'component',use:'ds-nav-bar',props:{title:'预约详情',back:'back'}},
    status:{kind:'component',use:'ds-tag',props:{text:'已确认',tone:'success',plain:true}},
    label:{kind:'component',use:'tag',props:{bind:'draft.slot'}},
  },state:{draft:{slot:'上午'}},actions:{back:{type:'back'}},scenes:{afternoon:{name:'下午预约',state:{draft:{slot:'下午'}}}}};
  const custom={manifest:{components:[{tag:'brand-header',semanticRole:'nav'},{tag:'brand-label',semanticRole:'tag'}]}};
  for(const [theme,platform,nav,tag] of [
    [binding(true),'mobile','ds-nav-bar','ds-tag'],[binding(),'web','header','ds-tag'],
    [custom,'web','brand-header','brand-label'],[{},'web','header','span'],
    [{manifest:{components:[]}},'mobile','header','span'],
  ]){
    const compiled=compilePageSchema(spec,{binding:theme,platform}),nodes=normalizeDocument(compiled.html).nodes;
    assert.equal(compiled.spec.nodes.nav.use,'nav');
    assert.equal(compiled.spec.nodes.status.use,'tag');
    assert.equal(nodes.nav.tag,nav);
    assert.equal(nodes.status.tag,tag);
    assert.equal(nodes.status.text,'已确认');
    assert.equal(nodes.status.attributes.tone,'success');
    assert.ok(Object.hasOwn(nodes.status.attributes,'plain'));
    assert.equal(nodes.label.attributes['data-schema-text'],'draft.slot');
    assert.equal(compiled.sourceMap.status.part,'props.text');
    assert.equal(compiled.sourceMap.label.bind,'draft.slot');
    assert.deepEqual(compiled.sceneIds,['afternoon']);
    if(nav!=='header'){
      assert.equal(nodes[nodes.nav.childIds[0]].tag,'button');
      assert.ok(Object.hasOwn(nodes[nodes.nav.childIds[0]].attributes,'data-nav-back'));
      assert.equal(nodes[nodes.nav.childIds[0]].attributes['data-schema-action'],'back');
      assert.equal(nodes[nodes.nav.childIds[1]].tag,'strong');
    }
  }
  const accepted=pageSchemaJSONSchema().$defs.node.properties.use.enum;
  for(const role of ['nav','nav-bar','ds-nav-bar','tag','ds-tag'])assert.ok(accepted.includes(role));
  spec.nodes.nav.use='nav-bar';
  assert.equal(validatePageSchema(spec).spec.nodes.nav.use,'nav');
  spec.nodes.nav.use='missing-business-widget';
  const issue=validatePageSchema(spec).diagnostics.find(item=>item.path==='nodes.nav.use');
  assert.match(issue.message,/missing-business-widget/);
  assert.match(issue.message,/local fragment/);
});

for (const [name,change] of [
  ['missing set path',spec=>{spec.actions.save={type:'state.set',value:true};}],
  ['missing record value',spec=>{spec.actions.save={type:'collection.append',path:'draft'};}],
  ['malformed tabs',spec=>{spec.nodes.form={kind:'component',use:'tabs',props:{bind:'tab',items:{}}};}],
  ['malformed button',spec=>{spec.nodes.confirm.props.actions=[null];}],
  ['invalid condition',spec=>{spec.nodes.heading.when={eq:true};}],
  ['invalid scene UI',spec=>{spec.scenes.default.ui={form:{unknown:true}};}],
  ['nonfinite state',spec=>{spec.state.number=NaN;}],
]) test('malformed contracts return diagnostics without throwing for '+name,()=>{
  const spec=pageFixture();change(spec);
  const result=validatePageSchema(spec);
  assert.equal(result.valid,false);
  assert.ok(result.diagnostics.some(item=>item.path));
});

test('long nested authored identities compile into stable bounded document IDs',()=>{
  const parent='p'.repeat(90),child='c'.repeat(90);
  const document={schemaVersion:1,id:'long',root:parent,nodes:{
    [parent]:{kind:'repeat',props:{source:'records'},children:[child]},
    [child]:{kind:'text',bind:'item.name'},
  },state:{records:[{id:'one',name:'Long identity'}]}};
  const first=compilePageSchema(document),model=normalizeDocument(first.html);
  assert.equal(validateDocument(first.html).valid,true);
  assert.ok(Object.keys(model.nodes).every(id=>id.length<=128));
  assert.ok(Object.values(first.sourceMap).some(item=>item.nodeId===child&&item.recordKey==='one'));
});

test('detached overlays compile as shared document portals and the catalog example is executable',async()=>{
  const {pageSchemaCatalog}=await import('./page-schema.js');
  const spec=pageFixture();spec.nodes.page.children=spec.nodes.page.children.filter(id=>id!=='confirm');
  assert.equal(validatePageSchema(spec).valid,true);
  assert.ok(normalizeDocument(compilePageSchema(spec).html).nodes.confirm);
  assert.equal(validatePageSchema(pageSchemaCatalog().example).valid,true);
});

test('business form errors share the declarative action and named scene contracts',()=>{
  const spec=pageFixture();spec.actions.business={type:'form.errors',target:'form',errors:{email:'该邮箱已被使用'}};
  spec.scenes.business={name:'业务校验失败',ui:{form:{validation:'submitted',errors:{email:'该邮箱已被使用'}}}};
  assert.equal(validatePageSchema(spec).valid,true);
  spec.actions.business.errors.unknown='Unknown';
  assert.equal(validatePageSchema(spec).valid,false);
});

test('field constraints, mobile input hints and required labels compile to native controls under either theme',()=>{
  for(const mobile of [false,true]){
    const spec=pageFixture(), fields=spec.nodes.form.props.fields;
    fields[0]={id:'code',label:'验证码',required:true,inputMode:'numeric',autoComplete:'one-time-code',minLength:6,maxLength:6,pattern:'[0-9]{6}',patternMessage:'请输入六位数字'};
    const compiled=compilePageSchema(spec,{platform:mobile?'mobile':'web',binding:binding(mobile)});
    const nodes=normalizeDocument(compiled.html).nodes;
    const code=nodes['form:code:input'].attributes;
    assert.equal(code.inputmode,'numeric');
    assert.equal(code.autocomplete,'one-time-code');
    assert.equal(code.pattern,'[0-9]{6}');
    assert.equal(code.minlength,'6');
    assert.equal(code.maxlength,'6');
    for(const key of ['code','email']){
      assert.equal(nodes['form:'+key+':input'].attributes['aria-required'],'true');
      assert.ok(Object.hasOwn(nodes['form:'+key+':input'].attributes,'required'));
      assert.ok(Object.hasOwn(nodes['form:'+key+':label'].attributes,'data-schema-required'));
    }
    assert.ok(!Object.hasOwn(nodes['form:enabled:label'].attributes,'data-schema-required'));
    assert.equal(compiled.spec.nodes.form.props.fields[0].maxlength,6);
  }
});

test('invalid regional patterns and conflicting native input constraints return field diagnostics',()=>{
  for(const attributes of [{pattern:'[bad'},{minlength:10,maxlength:5},{maxlength:-1},{maxlength:5,maxLength:6},{inputmode:'keyboard'},{required:'yes'},{inputType:'number',pattern:'[0-9]+'}]){
    const spec=pageFixture();
    Object.assign(spec.nodes.form.props.fields[0],attributes);
    const validated=validatePageSchema(spec);
    assert.equal(validated.valid,false);
    assert.ok(validated.diagnostics.some(item=>item.path.startsWith('nodes.form.props.fields[0]')));
  }
});

test('submit and editable error scenes use the same native pattern and programmatic length checks',()=>{
  const spec={schemaVersion:1,id:'codes',root:'form',nodes:{form:{kind:'component',use:'form',props:{model:'draft',
    fields:[{id:'code',label:'编码',pattern:'[0-9]+',patternMessage:'请填写数字',maxlength:6,minlength:3,required:true}],
    submit:{text:'保存',action:'save'}}}},state:{draft:{code:'1234'}},actions:{save:{type:'form.submit',target:'form',onValid:{type:'state.set',path:'saved',value:true}}},
    scenes:{letters:{name:'字母',state:{draft:{code:'ABCD'}},ui:{form:{validation:'submitted'}}},long:{name:'超长',state:{draft:{code:'1234567'}},ui:{form:{validation:'submitted'}}}}};
  const compiled=compilePageSchema(spec),window={__DSH_DESIGN_RUNTIME__:{}};
  let focused=false;
  const input={value:'',dataset:{schemaBind:'draft.code'},matches:()=>false,closest:()=>null,setAttribute(){},focus(){focused=true;},
    get validity(){return {patternMismatch:this.value!==''&&!/^[0-9]+$/.test(this.value)};}};
  const message={},form={dataset:{schemaDefinition:'form',dshNode:'form'},querySelectorAll:()=>[],closest:()=>null,toggleAttribute(){}};
  const controls={form,'form:code:input':input,'form:code:error':message};
  const document={readyState:'complete',addEventListener(){},
    querySelector:selector=>controls[selector.match(/^\[data-dsh-node="([^"]+)"\]$/)?.[1]]??null,
    querySelectorAll:selector=>selector==='[data-schema-definition]'?[form]:selector==='[data-schema-bind]'?[input]:[]};
  const script=compiled.html.match(/<script[^>]*data-dsh-schema-runtime[^>]*>([\s\S]*?)<\/script>/)[1];
  runInNewContext(script,{window,document,structuredClone,clearTimeout});
  const runtime=window.__DSH_SCHEMA_RUNTIME__;
  runtime.setScene('letters');
  assert.equal(message.textContent,'请填写数字');
  runtime.execute('save');
  assert.ok(focused);
  assert.equal(runtime.getState().schemaState.saved,undefined);
  runtime.setScene('long');
  assert.match(message.textContent,/最多允许 6/);
  runtime.execute({type:'state.set',path:'draft.code',value:'1'});
  assert.match(message.textContent,/至少需要 3/);
  runtime.execute({type:'state.set',path:'draft.code',value:''});
  assert.equal(message.textContent,'请填写编码');
  runtime.execute({type:'state.set',path:'draft.code',value:'123'});
  runtime.execute('save');
  assert.equal(runtime.getState().schemaState.saved,true);
  assert.equal(message.hidden,true);
});

test('all references in the discoverable machine contract resolve for schema tooling',()=>{
  const contract=pageSchemaJSONSchema();
  for(const [,ref] of JSON.stringify(contract).matchAll(/"\$ref":"([^"]+)"/g)) {
    const target=ref.slice(2).split('/').reduce((value,key)=>value?.[key],contract);
    assert.ok(target,ref);
  }
});

function radioFixture() {
  const field={id:'choice',label:'选择',control:'radio',required:true,help:'请选择一项',options:[
    {value:'retired',label:'已停用',disabled:true},{value:0,label:'零'},{value:false,label:'否'},{value:'0',label:'文字零'},
  ]};
  return {schemaVersion:1,id:'choices',root:'form',nodes:{form:{kind:'component',use:'form',props:{model:'draft',fields:[field]}}},
    state:{draft:{choice:0}},actions:{save:{type:'form.submit',target:'form',onValid:{type:'state.set',path:'saved',value:true}}},
    scenes:{off:{name:'否',state:{draft:{choice:false}}},missing:{name:'未选择',state:{draft:{choice:null}},ui:{form:{validation:'submitted'}}}}};
}

test('named native radio options follow the PC or mobile system and fall back to labels in a partial system',()=>{
  const partial=binding();
  partial.manifest.components=partial.manifest.components.filter(component=>component.tag!=='ds-radio');
  for(const [platform,system,wc] of [['web',{},false],['web',partial,false],['web',binding(),true],['mobile',binding(true),true]]) {
    const spec=radioFixture();
    spec.nodes.form.props.fields.push({id:'flag',label:'标志',control:'radio'});
    spec.state.draft.flag=true;
    spec.root='page';
    spec.nodes.page={kind:'layout',children:['form','second']};
    spec.nodes.second=structuredClone(spec.nodes.form);
    // A theme without a radio component still supports the grouped native input.
    if(system===partial) {
      spec.nodes.form.props.fields.pop();
      spec.nodes.second.props.fields.pop();
    }
    const {html,sourceMap}=compilePageSchema(spec,{platform,binding:system});
    const nodes=normalizeDocument(html).nodes;
    for(const owner of ['form','second']) {
      const id=owner+':choice';
      assert.equal(nodes[id].attributes.role,'radiogroup');
      assert.equal(nodes[id].attributes['aria-labelledby'],nodes[id+':label'].attributes.id);
      for(const [index,option] of spec.nodes.form.props.fields[0].options.entries()){
        const choice=id+':option-'+index, input=nodes[choice+':input'];
        assert.equal(input.attributes.name,id);
        assert.equal(input.attributes.value,String(option.value));
        assert.equal(JSON.parse(input.attributes['data-schema-radio-value']),option.value);
        assert.equal(input.attributes['aria-describedby'],id+':error '+id+':help');
        assert.equal(Object.hasOwn(input.attributes,'checked'),option.value===0);
        assert.equal(Object.hasOwn(input.attributes,'disabled'),option.disabled===true);
        assert.equal(nodes[choice+':label'].tag,'label');
        assert.equal(nodes[choice+':text'].text,option.label);
        assert.equal(nodes[choice]?.tag,wc?'ds-radio':undefined);
        assert.equal(sourceMap[choice+':text'].part,'field.option.label');
      }
    }
    if(system!==partial) {
      assert.equal(nodes['form:flag:input'].attributes['data-schema-radio-value'],undefined);
      assert.ok(Object.hasOwn(nodes['form:flag:input'].attributes,'checked'));
    }
  }
  for(const options of [[],[{}],[{value:'one',label:'一'},{value:'one',label:'重复'}]]) {
    const spec=radioFixture();spec.nodes.form.props.fields[0].options=options;
    assert.equal(validatePageSchema(spec).valid,false);
  }
});

test('radio selection events keep scalar types, restore scenes and focus the first enabled choice on validation',()=>{
  const spec=radioFixture(), compiled=compilePageSchema(spec), window={__DSH_DESIGN_RUNTIME__:{}}, handlers=new Map();
  const inputs=spec.nodes.form.props.fields[0].options.map(option=>({
    dataset:{schemaBind:'draft.choice',schemaRadioValue:JSON.stringify(option.value)},disabled:!!option.disabled,checked:false,parentElement:{parentElement:{localName:'div'}},
    closest(selector){return selector==='[data-schema-bind]'?this:null;},focus(){document.activeElement=this;},
    setAttribute(name,value){this[name]=value;},
  }));
  const message={},group={querySelectorAll:()=>inputs,toggleAttribute(){},setAttribute(){}};
  const form={dataset:{schemaDefinition:'form',dshNode:'form'},querySelectorAll:()=>inputs,closest:()=>null,toggleAttribute(){}};
  const controls={'form':form,'form:choice':group,'form:choice:error':message};
  const document={readyState:'complete',addEventListener(type,handler){handlers.set(type,handler);},
    querySelector:selector=>controls[selector.match(/^\[data-dsh-node="([^"]+)"\]$/)?.[1]]||null,
    querySelectorAll:selector=>selector==='[data-schema-definition]'?[form]:selector==='[data-schema-bind]'?inputs:[]};
  runInNewContext(compiled.html.match(/<script[^>]*data-dsh-schema-runtime[^>]*>([\s\S]*?)<\/script>/)[1],{window,document,structuredClone,clearTimeout});
  const rt=window.__DSH_SCHEMA_RUNTIME__, selected=()=>inputs.filter(input=>input.checked);
  assert.deepEqual(selected(),[inputs[1]]);
  rt.setScene('off');
  assert.deepEqual(selected(),[inputs[2]]);
  rt.execute('save');
  assert.equal(rt.getState().schemaState.saved,true);
  rt.setScene('missing');
  assert.deepEqual(selected(),[]);
  rt.execute('save');
  assert.equal(document.activeElement,inputs[1]);
  assert.ok(inputs.every(input=>input['aria-invalid']==='true'));
  assert.equal(message.hidden,false);
  for(const [index,expected] of [[3,'0'],[1,0],[2,false]]) {
    inputs[index].checked=true;
    handlers.get('input')({target:inputs[index]});
    assert.equal(rt.getState().schemaState.draft.choice,expected);
    assert.deepEqual(selected(),[inputs[index]]);
    assert.equal(message.hidden,true);
  }
  window.__DSH_DESIGN_RUNTIME__.resetScene();
  assert.deepEqual(selected(),[inputs[1]]);
});

test('scene, action and reset keep the select label and native selection in sync across themes',()=>{
  for(const theme of ['desktop','mobile','native']){
    const spec={schemaVersion:1,id:'booking',root:'root',nodes:{
      root:{kind:'layout',children:['slot','days']},
      slot:{kind:'component',use:'select',props:{bind:'slot',options:[{value:'am',label:'上午'},{value:'pm',label:'下午'}]}},
      days:{kind:'component',use:'select',props:{bind:'days',multiple:true,options:[{value:1,label:'周一'},{value:false,label:'待定'}]}},
    },state:{slot:'am',days:[1,false]},scenes:{afternoon:{name:'下午预约',state:{slot:'pm',days:[false]}}}};
    const compiled=compilePageSchema(spec,{platform:theme==='mobile'?'mobile':'web',binding:theme==='native'?{}:binding(theme==='mobile')});
    const nodes=normalizeDocument(compiled.html).nodes;
    assert.equal(nodes['days:option-1'].attributes.value,'false');
    assert.ok(Object.hasOwn(nodes['days:option-1'].attributes,'selected'));
    assert.equal(nodes.days.attributes.value,undefined);
    const inputs=['slot','days'].map(key=>{
      const props=spec.nodes[key].props;
      const options=props.options.map(({value,label})=>({value:String(value),label,selected:true}));
      const input={localName:'select',dataset:{schemaBind:key},options,multiple:props.multiple===true,closest:()=>null,
        get value(){return options.find(option=>option.selected)?.value??'';},
        set value(next){for(const option of options)option.selected=option.value===next;}};
      if(!input.multiple)input.value=String(spec.state[key]);
      const labels=()=>options.filter(option=>option.selected).map(option=>option.label).join('、');
      const host={localName:theme==='native'?'span':'ds-select',label:labels(),writes:0,attribute:nodes[key].attributes.value,
        matches:selector=>selector==='ds-select'&&theme!=='native',get value(){return input.value;},
        getAttribute(){return this.attribute;},
        setAttribute(name,value){this.attribute=value;input.value=value;this.label=labels();this.writes++;},
        set values(selected){for(const option of options)option.selected=selected.includes(option.value);this.label=labels();this.writes++;}};
      input.parentElement=host;
      return input;
    });
    const window={__DSH_DESIGN_RUNTIME__:{}};
    const document={readyState:'complete',addEventListener(){},querySelector:()=>null,querySelectorAll:selector=>selector==='[data-schema-bind]'?inputs:[]};
    const script=compiled.html.match(/<script[^>]*data-dsh-schema-runtime[^>]*>([\s\S]*?)<\/script>/)[1];
    runInNewContext(script,{window,document,structuredClone,clearTimeout});
    const runtime=window.__DSH_SCHEMA_RUNTIME__,[slot,days]=inputs;
    const visible=control=>theme==='native'?control.options.filter(option=>option.selected).map(option=>option.label).join('、'):control.parentElement.label;
    runtime.setScene('afternoon');
    assert.equal(slot.value,'pm');
    assert.equal(visible(slot),'下午');
    assert.equal(visible(days),'待定');
    const writes=inputs.map(input=>input.parentElement.writes);
    runtime.render();
    assert.deepEqual(inputs.map(input=>input.parentElement.writes),writes);
    runtime.execute({type:'state.set',path:'days',value:[]});
    assert.equal(visible(days),'');
    window.__DSH_DESIGN_RUNTIME__.resetScene();
    assert.equal(slot.value,'am');
    assert.equal(visible(slot),'上午');
    assert.equal(visible(days),'周一、待定');
  }
});

test('schema navigation uses saved relative paths, delivery paths or editor view history according to its host',()=>{
  const document=pageFixture();
  document.actions.home={type:'if',condition:{ref:'draft.enabled'},then:[{type:'navigate',pageId:'home'}]};
  document.actions.back={type:'back'};
  const built=compilePageSchema(document,{pageURLs:{home:'../home/index.html',unused:'unused.html'}});
  const delivered=exportDocument(built.html,{mode:'delivery',pageURLs:{home:'./final-home.html'}});
  const subset=exportDocument(built.html,{mode:'delivery',pageURLs:{}});
  function run(html,editor,action){
    const metadata={textContent:html.match(/<script[^>]*id="dsh-document-model"[^>]*>([^<]+)<\/script>/)[1]};
    const runtime=html.match(/<script[^>]*data-dsh-schema-runtime[^>]*>([\s\S]*?)<\/script>/)[1];
    const window={__DSH_DESIGN_RUNTIME__:{}}, messages=[], events={}, location={href:'initial'};
    let back=0;
    window.parent={postMessage:message=>messages.push(message)};
    const document={
      readyState:'complete',querySelectorAll:()=>[],
      getElementById:id=>id==='dsh-document-model'?metadata:null,
      querySelector:selector=>selector==='#dsh-document-model'?metadata:selector==='script[data-dsh-editor-bridge]'&&editor?{}:null,
      addEventListener:(name,listener)=>{events[name]=listener;},
    };
    runInNewContext(runtime,{window,document,location,history:{back(){back++;}},structuredClone,clearTimeout});
    const button={dataset:{schemaAction:action},closest:selector=>selector==='[data-schema-action]'?button:null};
    events.click({target:button,preventDefault(){}});
    return {url:location.href,back,messages:JSON.parse(JSON.stringify(messages)),pageURLs:JSON.parse(metadata.textContent).runtime.pageURLs};
  }
  assert.deepEqual(run(built.html,false,'home'),{url:'../home/index.html',back:0,messages:[],pageURLs:{home:'../home/index.html'}});
  assert.equal(run(delivered.html,false,'home').url,'./final-home.html');
  assert.equal(run(subset.html,false,'home').url,'initial');
  const canvas=run(built.html,true,'home');
  assert.equal(canvas.url,'initial');
  assert.deepEqual(canvas.messages,[{type:'dsh:runtime',action:'navigate',pageId:'home'}]);
  assert.deepEqual(run(built.html,true,'back').messages,[{type:'dsh:runtime',action:'back'}]);
  assert.equal(run(built.html,false,'back').back,1);
});

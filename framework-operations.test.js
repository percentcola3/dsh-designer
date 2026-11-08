import test from 'node:test';
import assert from 'node:assert/strict';
import {parse as parseJS} from '@babel/parser';
import traverseModule from '@babel/traverse';
import {parse as parseSFC} from '@vue/compiler-sfc';
import {normalizeFrameworkSource,sourceElement,compileFrameworkProject} from './framework-compiler.js';
import {applyFrameworkOperations} from './framework-operations.js';

const traverse=traverseModule.default||traverseModule;
const file=framework=>framework==='react'?'src/App.tsx':'src/App.vue';
const prepared=(framework,code)=>({framework,path:file(framework),...normalizeFrameworkSource({framework,path:file(framework),code})});
const operation=(type,nodeIds,extra={})=>({type,nodeIds,...extra});
const apply=(source,...operations)=>applyFrameworkOperations({...source,operations});
const element=(source,nodeId)=>sourceElement({...source,nodeId});
const throws=(fn,code)=>assert.throws(fn,error=>error.code===code);
function unchangedOutside(before,after,id){const a=element(before,id),b=element({...before,code:after.code},id);assert.equal(after.code.slice(0,b.start),before.code.slice(0,a.start));assert.equal(after.code.slice(b.end),before.code.slice(a.end));}
function reactNode(code,id){let result;traverse(parseJS(code,{sourceType:'module',plugins:['jsx','typescript']}),{JSXElement(p){if(p.node.openingElement.attributes.some(a=>a.type==='JSXAttribute'&&a.name.name==='data-dsh-source'&&(a.value?.value||a.value?.expression?.value)===id))result=p.node;}});return result;}
function vueNode(code,id){let result;const walk=node=>{if(node.type===1&&node.props.some(p=>p.type===6&&p.name==='data-dsh-source'&&p.value?.content===id))result=node;for(const child of node.children||[])walk(child);};walk(parseSFC(code).descriptor.template.ast);return result;}

for(const framework of ['react','vue']){
  test(`${framework} plain text edits preserve all outside bytes and escape literal binding syntax`,()=>{
    const source=prepared(framework,framework==='react'?'// Unicode 😀 prefix\nexport default () => <main><p data-dsh-source="target">old</p><aside>unchanged</aside></main>;\n// exact tail':'<script setup>const untouched="😀"</script>\n<template><main><p data-dsh-source="target">old</p><aside>unchanged</aside></main></template>\n<style>p { color: teal }</style>');
    const text='你好 < & " {value} {{binding}}\nnext',result=apply(source,operation('text.set',['target'],{text}));
    unchangedOutside(source,result,'target');assert.deepEqual(result.selectedSourceIds,['target']);assert.equal(result.changes[0].changed,true);
    if(framework==='react')assert.equal(reactNode(result.code,'target').children[0].expression.value,text);
    else{const child=vueNode(result.code,'target').children[0];assert.equal(child.type,2);assert.equal(child.content,text.replace(/\s+/g,' '));assert.ok(element({...source,code:result.code},'target').code.includes('\nnext'));}
  });

  test(`${framework} dynamic text and child elements are refused atomically`,()=>{
    const dynamic=framework==='react'?['<p data-dsh-source="target">{title}</p>','<p data-dsh-source="target">prefix <b>child</b></p>','<p data-dsh-source="target" dangerouslySetInnerHTML={{__html:html}}/>']:['<p data-dsh-source="target">{{title}}</p>','<p data-dsh-source="target">prefix <b>child</b></p>','<p data-dsh-source="target" v-text="title"/>'];
    for(const fragment of dynamic){const source=prepared(framework,framework==='react'?`export default ()=>${fragment}`:`<template>${fragment}</template>`),original=source.code;
      throws(()=>apply(source,operation('style.set',['target'],{styles:{color:'red'}}),operation('text.set',['target'],{text:'erase'})),'SOURCE_DYNAMIC_TEXT');assert.equal(source.code,original);
    }
  });

  test(`${framework} drag/resize and CSS properties remain local source operations`,()=>{
    const source=prepared(framework,framework==='react'?'export default ()=> <main><div data-dsh-source="target" className="card" onClick={onClick}>box</div><aside>fixed</aside></main>':'<script setup>const onClick=()=>{}</script><template><main><div data-dsh-source="target" class="card" :class="extraClass" @click="onClick">box</div><aside>fixed</aside></main></template>');
    const styles={'background-color':'#123456','border-color':'#fff','border-width':'2px',padding:'12px',margin:'8px',position:'absolute',left:'20px',top:'30px',right:'auto',bottom:'auto',translate:'10px 20px',transform:'rotate(5deg)',width:'180px',height:'80px'};
    const result=apply(source,operation('style.set',['target','target'],{styles}));unchangedOutside(source,result,'target');assert.equal(result.changes.length,1);
    const selected=element({...source,code:result.code},'target').code;
    assert.ok(selected.includes(framework==='react'?'backgroundColor':'background-color'));assert.ok(selected.includes('10px 20px'));assert.ok(selected.includes('180px'));assert.ok(selected.includes(framework==='react'?'onClick={onClick}':'@click="onClick"'));assert.ok(selected.includes(framework==='react'?'className="card"':':class="extraClass"'));
  });

  test(`${framework} clone refreshes all source IDs and business IDs with local ARIA links`,()=>{
    const source=prepared(framework,framework==='react'?'// pre\nexport default ()=> <main><section data-dsh-source="target" id="card" key="old-key" onClick={click}><label htmlFor="field" aria-labelledby="heading">Name</label><h2 id="heading">Heading</h2><input id="field"/><a href="#heading">jump</a></section><aside>same</aside></main>; // post':'<script setup>const click=()=>{}</script><template><main><section data-dsh-source="target" id="card" key="old-key" @click="click"><label for="field" aria-labelledby="heading">Name</label><h2 id="heading">Heading</h2><input id="field"/><a href="#heading">jump</a></section><aside>same</aside></main></template><style>main {padding:2px}</style>');
    const result=apply(source,operation('node.duplicate',['target'])),cloneId=result.selectedSourceIds[0],all=normalizeFrameworkSource({...source,code:result.code});
    assert.ok(cloneId&&cloneId!=='target');assert.equal(all.changed,false);assert.equal(new Set(all.nodes.map(n=>n.id)).size,all.nodes.length);
    const original=element(source,'target'),kept=element({...source,code:result.code},'target'),clone=element({...source,code:result.code},cloneId);
    assert.equal(kept.code,original.code);assert.equal(result.code.slice(0,original.start),source.code.slice(0,original.start));assert.equal(result.code.slice(clone.end),source.code.slice(original.end));
    const childIds=source.nodes.filter(n=>n.start>=original.start&&n.end<=original.end).map(n=>n.id);
    for(const id of childIds)assert.ok(!clone.code.includes(id==='target'?'data-dsh-source="target"':id));
    assert.equal(result.changes[0].createdSourceIds.length,childIds.length);
    if(framework==='react'){
      const root=reactNode(result.code,cloneId),attr=(n,name)=>{const a=n.openingElement.attributes.find(a=>a.name?.name===name);return a?.value?.value??a?.value?.expression?.value;};
      const children=root.children.filter(n=>n.type==='JSXElement'),heading=attr(children.find(n=>n.openingElement.name.name==='h2'),'id'),field=attr(children.find(n=>n.openingElement.name.name==='input'),'id');
      assert.notEqual(heading,'heading');assert.notEqual(field,'field');assert.equal(attr(children.find(n=>n.openingElement.name.name==='label'),'htmlFor'),field);assert.equal(attr(children.find(n=>n.openingElement.name.name==='a'),'href'),'#'+heading);assert.equal(attr(root,'key'),cloneId);
    }else{
      const root=vueNode(result.code,cloneId),attr=(n,name)=>n.props.find(p=>p.name===name)?.value?.content,heading=attr(root.children.find(n=>n.tag==='h2'),'id'),field=attr(root.children.find(n=>n.tag==='input'),'id');
      assert.notEqual(heading,'heading');assert.equal(attr(root.children.find(n=>n.tag==='label'),'for'),field);assert.equal(attr(root.children.find(n=>n.tag==='a'),'href'),'#'+heading);assert.equal(attr(root,'key'),cloneId);
    }
    assert.ok(clone.code.includes(framework==='react'?'onClick={click}':'@click="click"'));
  });

  test(`${framework} ordered ancestor/descendant operations reparse stable source IDs`,()=>{
    const source=prepared(framework,framework==='react'?'export default ()=> <main data-dsh-source="outer"><p data-dsh-source="inner">old</p></main>':'<template><main data-dsh-source="outer"><p data-dsh-source="inner">old</p></main></template>');
    const result=apply(source,operation('style.set',['outer'],{styles:{padding:'12px'}}),operation('text.set',['inner'],{text:'new'}),operation('node.delete',['inner']));
    assert.deepEqual(result.selectedSourceIds,[]);assert.equal(result.changes.length,3);assert.ok(!result.code.includes('data-dsh-source="inner"'));assert.ok(result.code.includes('12px'));
    throws(()=>apply(source,operation('node.delete',['outer']),operation('text.set',['inner'],{text:'new'})),'SOURCE_ELEMENT_NOT_FOUND');assert.ok(source.code.includes('old'));
  });

  test(`${framework} root and nested deletion produce valid language syntax`,()=>{
    const source=prepared(framework,framework==='react'?'// keep\nexport default ()=> <main data-dsh-source="target"><span/></main>; // tail':'<script setup>const keep=1</script><template><main data-dsh-source="target"><span/></main></template><style>p{color:red}</style>');
    const selected=element(source,'target'),result=apply(source,operation('node.delete',['target']));assert.deepEqual(result.selectedSourceIds,[]);
    assert.equal(result.code,source.code.slice(0,selected.start)+(framework==='react'?'null':'')+source.code.slice(selected.end));
  });

  test(`${framework} source ID lookup never interprets a runtime-instance locator`,()=>{
    const source=prepared(framework,framework==='react'?'export default ()=> <p data-dsh-source="target">old</p>':'<template><p data-dsh-source="target">old</p></template>');
    throws(()=>apply(source,operation('text.set',['runtime-instance-42'],{text:'new'})),'SOURCE_ELEMENT_NOT_FOUND');
  });
}

test('React literal string children and self-closing nodes become editable text safely',()=>{
  for(const node of ['<p data-dsh-source="target">hello {"world"}</p>','<p data-dsh-source="target"/>']){
    const source=prepared('react',`export default ()=>${node}`),result=apply(source,operation('text.set',['target'],{text:'<literal>'}));assert.equal(reactNode(result.code,'target').children[0].expression.value,'<literal>');
  }
});

test('React style objects preserve unrelated expressions and spreads, and dynamic bindings merge safely',()=>{
  for(const style of ['{{...theme, color: oldColor, padding: spacing}}','{theme.style}']){
    const source=prepared('react',`const theme={style:{}}; const spacing=4,oldColor='teal'; export default ()=> <p data-dsh-source="target" style=${style} title="keep">hello</p>`),result=apply(source,operation('style.set',['target'],{styles:{'background-color':'pink',color:'red'}}));
    unchangedOutside(source,result,'target');const span=element({...source,code:result.code},'target').code;
    assert.ok(span.includes(style.startsWith('{{')?'...theme':'...(theme.style)'));assert.ok(span.includes('backgroundColor'));if(style.startsWith('{{'))assert.ok(span.includes('padding: spacing'));assert.ok(span.includes('title="keep"'));
    throws(()=>apply(source,operation('style.set',['target'],{styles:{color:null}})),'SOURCE_DYNAMIC_STYLE');
  }
  const source=prepared('react','export default ()=> <p data-dsh-source="target" style={{color:"red", padding: 4, margin:"2px"}}>x</p>'),result=apply(source,operation('style.set',['target'],{styles:{color:null,padding:'12px'}}));
  const node=reactNode(result.code,'target'),style=node.openingElement.attributes.find(a=>a.name?.name==='style').value.expression;assert.ok(!style.properties.some(p=>(p.key.name||p.key.value)==='color'));assert.ok(result.code.includes('margin:"2px"'));
});

test('React business spreads keep their original semantics and unknown final style bindings are refused',()=>{
  const source=prepared('react','export default ()=> <p {...props} style={{color:"blue",padding:"2px"}} data-dsh-source="target">x</p>'),result=apply(source,operation('style.set',['target'],{styles:{color:null}}));
  assert.ok(result.code.includes('{...props}'));assert.ok(result.code.includes('padding:"2px"'));const opening=reactNode(result.code,'target').openingElement;assert.ok(opening.attributes.findIndex(a=>a.name?.name==='style')>opening.attributes.findIndex(a=>a.type==='JSXSpreadAttribute'));
  for(const attrs of ['style={{color:"blue"}} {...props}','{...props}']){const dynamic=prepared('react',`export default ()=> <p ${attrs} data-dsh-source="target">x</p>`);throws(()=>apply(dynamic,operation('style.set',['target'],{styles:{color:'red'}})),'SOURCE_DYNAMIC_STYLE');}
});

test('Vue static style removes only requested properties and preserves class/bindings and CSS strings',()=>{
  const source=prepared('vue','<template><p data-dsh-source="target" class="card" :class="classes" style="background-image:url(\'data:image/svg+xml;a;b\');color:red;padding:4px;--label:\'a;b\'">hello</p></template>');
  const result=apply(source,operation('style.set',['target'],{styles:{color:null,padding:'12px','border-color':'#fff'}}));unchangedOutside(source,result,'target');
  const node=vueNode(result.code,'target'),style=node.props.find(p=>p.name==='style').value.content;
  assert.ok(!style.includes('color:red'));assert.ok(style.includes("url('data:image/svg+xml;a;b')"));assert.ok(style.includes("--label:'a;b'"));assert.ok(style.includes('padding: 12px'));assert.ok(result.code.includes(':class="classes"'));
  throws(()=>apply(source,operation('style.set',['target'],{styles:{color:'red;background:blue'}})),'INVALID_SOURCE_OPERATION');
});

test('Vue dynamic style bindings and Vue dynamic/void text are explicitly refused',()=>{
  for(const attr of [':style="dynamic"','v-bind="attrs"']){const source=prepared('vue',`<template><p data-dsh-source="target" ${attr}>hello</p></template>`);throws(()=>apply(source,operation('style.set',['target'],{styles:{color:'red'}})),'SOURCE_DYNAMIC_STYLE');}
  const source=prepared('vue','<template><input data-dsh-source="target"/></template>');
  // Self-closing custom elements can expand; a native HTML void element cannot.
  throws(()=>apply(source,operation('text.set',['target'],{text:'bad'})),'SOURCE_DYNAMIC_TEXT');
});

test('duplication refuses unsafe dynamic business IDs, spreads, references, keys and Vue branch structures',()=>{
  for(const [framework,node,code] of [
    ['react','<p data-dsh-source="target" id={businessId}/>','SOURCE_DYNAMIC_DUPLICATE'],
    ['react','<p data-dsh-source="target" {...props}/>','SOURCE_DYNAMIC_DUPLICATE'],
    ['react','<p data-dsh-source="target" id="x"><a href={link}/></p>','SOURCE_DYNAMIC_DUPLICATE'],
    ['react','<p data-dsh-source="target" key={key}/>','SOURCE_DUPLICATE_KEY'],
    ['vue','<p data-dsh-source="target" :id="businessId"/>','SOURCE_DYNAMIC_DUPLICATE'],
    ['vue','<p data-dsh-source="target" v-bind="attrs"/>','SOURCE_DYNAMIC_DUPLICATE'],
    ['vue','<p data-dsh-source="target" v-for="item in items" :key="item.id"/>','SOURCE_DYNAMIC_DUPLICATE'],
    ['vue','<p data-dsh-source="target" :key="key"/>','SOURCE_DUPLICATE_KEY']
  ]){const source=prepared(framework,framework==='react'?`export default ()=>${node}`:`<template>${node}</template>`);throws(()=>apply(source,operation('node.duplicate',['target'])),code);}
});

test('Vue conditional-chain edits fail explicitly instead of orphaning or rebinding v-else',()=>{
  const source=prepared('vue','<template><p v-if="shown" data-dsh-source="target">yes</p><!-- chain --><p v-else data-dsh-source="other">no</p></template>');
  throws(()=>apply(source,operation('node.delete',['target'])),'SOURCE_DYNAMIC_DELETE');
  throws(()=>apply(source,operation('node.duplicate',['target'])),'SOURCE_DYNAMIC_DUPLICATE');
  const deleted=apply(source,operation('node.delete',['other']));assert.ok(!deleted.code.includes('v-else'));
});

test('root React duplication uses a fragment and Vue template supports multiple roots',()=>{
  for(const framework of ['react','vue']){
    const source=prepared(framework,framework==='react'?'// prefix\nexport default ()=> <p data-dsh-source="target">hello</p>;\n// tail':'<script setup>const n=1</script><template><p data-dsh-source="target">hello</p></template><style>p{color:red}</style>'),result=apply(source,operation('node.duplicate',['target']));
    if(framework==='react')assert.match(result.code,/=> <>/);else assert.equal(parseSFC(result.code).descriptor.template.ast.children.filter(n=>n.type===1).length,2);
    assert.ok(element({...source,code:result.code},result.selectedSourceIds[0]));
  }
});

test('invalid operations, illegal style values and operation count are bounded',()=>{
  const source=prepared('react','export default ()=> <p data-dsh-source="target">hello</p>');
  for(const operations of [[],Array(101).fill(operation('node.delete',['target'])),[{type:'text.set',nodeIds:[],text:'x'}],[{type:'unknown',nodeIds:['target']}]])throws(()=>applyFrameworkOperations({...source,operations}),'INVALID_SOURCE_OPERATION');
  for(const styles of [{color:NaN},{color:undefined},{'__proto__!':'x'},{color:{value:'red'}},{}])throws(()=>apply(source,operation('style.set',['target'],{styles})),'INVALID_SOURCE_OPERATION');
});

for(const framework of ['react','vue'])test(`${framework} real compiler accepts text, drag/resize, clone and delete output`,async()=>{
  const source=prepared(framework,framework==='react'?'const click=()=>{};export default ()=> <main><p data-dsh-source="target" id="title" onClick={click}>Hello</p><aside data-dsh-source="remove">remove</aside></main>':'<script setup lang="ts">const click=()=>{}</script><template><main><p data-dsh-source="target" id="title" @click="click">Hello</p><aside data-dsh-source="remove">remove</aside></main></template><style scoped>main{padding:4px}</style>');
  const edited=apply(source,operation('text.set',['target'],{text:'New < {{literal}} & text'}),operation('style.set',['target'],{styles:{'background-color':'#ffcc00',translate:'30px 40px',width:'200px',height:'70px',padding:'12px','border-radius':'8px'}}),operation('node.duplicate',['target']),operation('node.delete',['remove']));
  const output=await compileFrameworkProject({framework,entry:source.path,files:{[source.path]:edited.code}});
  assert.equal(output.manifest.runtime,'bundled');assert.match(output.html,/<!doctype html>/);assert.equal(output.manifest.nodes.filter(n=>n.tag==='p').length,2);assert.ok(!output.manifest.nodes.some(n=>n.id==='remove'));assert.equal(new Set(output.manifest.nodes.map(n=>n.id)).size,output.manifest.nodes.length);
});

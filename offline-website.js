import {parseExpression} from '@babel/parser';
import {parse,parseFragment,serialize} from 'parse5';

// Compile self-contained DOM actions to data. Site functions and their closures never run in a design.
export function localClickActions(source){
  let fn;
  try{fn=parseExpression('('+source+')');}catch{return [];}
  const callee=(expr,object,name)=>expr?.type==='MemberExpression'&&!expr.computed&&expr.object?.name===object&&expr.property.name===name;
  const target=expr=>{
    if(expr?.type==='ThisExpression')return {self:true};
    if(expr?.type!=='CallExpression'||expr.arguments.length!==1||expr.arguments[0].type!=='StringLiteral')return null;
    const value=expr.arguments[0].value;
    if(callee(expr.callee,'document','getElementById'))return {id:value};
    if(callee(expr.callee,'document','querySelector'))return {selector:value};
    return null;
  };
  const actions=[];
  for(const stmt of fn.body?.type==='BlockStatement'?fn.body.body:[{type:'ExpressionStatement',expression:fn.body}]){
    if(stmt.type!=='ExpressionStatement')return [];
    const expr=stmt.expression,member=expr?.callee||expr?.left;
    if(member?.type!=='MemberExpression'||member.computed)return [];
    const property=member.property.name;
    if(expr.type==='CallExpression'){
      if(member.object?.property?.name==='classList'&&['toggle','add','remove'].includes(property)&&expr.arguments.length===1&&expr.arguments[0].type==='StringLiteral'){
        actions.push({target:target(member.object.object),op:property,value:expr.arguments[0].value});
      }else if(['showModal','close','focus'].includes(property)&&!expr.arguments.length)actions.push({target:target(member.object),op:property});
      else return [];
    }else if(expr.type==='AssignmentExpression'&&expr.operator==='='&&['hidden','open','checked','textContent','value'].includes(property)&&['BooleanLiteral','StringLiteral','NumericLiteral'].includes(expr.right.type)){
      actions.push({target:target(member.object),op:'set',property,value:expr.right.value});
    }else return [];
  }
  return actions.every(a=>a.target)?actions:[];
}

function installOfflineControls(links,handlers){
  function unavailable(){
    let message=document.querySelector('[data-offline-feedback]');
    if(!message){
      message=document.createElement('div');message.dataset.offlineFeedback='';message.setAttribute('role','status');
      Object.assign(message.style,{position:'fixed',bottom:'16px',left:'50%',transform:'translateX(-50%)',padding:'6px 12px',background:'#262626',color:'white',borderRadius:'6px',font:'13px system-ui',zIndex:'2147483647',pointerEvents:'none'});
      document.body.append(message);
    }
    message.textContent='此操作的结果未收录到离线稿';clearTimeout(message.timer);message.timer=setTimeout(()=>message.remove(),2200);
  }
  document.addEventListener('submit',event=>event.preventDefault(),true);
  document.addEventListener('click',event=>{
    if(event.defaultPrevented)return;
    const control=event.target.closest?.('[data-offline-control],button,a,input,summary,[role=button],[role=tab]');
    if(!control)return;
    const id=control.getAttribute('data-dsh-node'),link=links[id],actions=handlers[id];
    if(link){
      event.preventDefault();
      if(document.querySelector('script[data-dsh-editor-bridge]'))document.dispatchEvent(new CustomEvent('dsh:navigate',{detail:{pageId:link.pageId}}));
      else location.assign(link.path);
    }else if(Array.isArray(actions)&&actions.length){
      event.preventDefault();
      for(const action of actions){
        const node=action.target.self?control:action.target.id?document.getElementById(action.target.id):document.querySelector(action.target.selector);
        if(!node){unavailable();break;}
        if(action.op==='set')node[action.property]=action.value;
        else if(['toggle','add','remove'].includes(action.op))node.classList[action.op](action.value);
        else if(['showModal','close','focus'].includes(action.op))node[action.op]?.();
      }
    }else if(control.hasAttribute('data-offline-missing')||control.matches('button:not([popovertarget]):not([commandfor]),[role=button],[role=tab]')){
      event.preventDefault();unavailable();
    }
  });
}

export function offlineWebsiteHTML(html,{links={},handlers={}}={}){
  const doc=parse(html),root=doc.childNodes.find(n=>n.tagName==='html');
  const walk=node=>{
    if(node.attrs){
      const id=node.attrs.find(a=>a.name==='data-dsh-node')?.value;
      if(Object.hasOwn(links,id)||Object.hasOwn(handlers,id))node.attrs.push({name:'data-offline-control',value:''});
      if(node.tagName==='a'||node.tagName==='area'){
        const href=node.attrs.find(a=>a.name==='href');
        if(href&&!href.value.startsWith('#')){
          href.value='#';
          node.attrs.push({name:'data-offline-missing',value:''});
        }
        node.attrs=node.attrs.filter(a=>!['target','download','ping'].includes(a.name));
      }
    }
    for(const child of node.childNodes||[])walk(child);
    if(node.content)walk(node.content);
  };
  walk(root);
  const head=root.childNodes.find(n=>n.tagName==='head'),body=root.childNodes.find(n=>n.tagName==='body');
  const policy="default-src 'none'; connect-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; media-src 'self' data:; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'";
  const meta=parseFragment('<meta http-equiv="Content-Security-Policy">').childNodes[0];meta.attrs.push({name:'content',value:policy});meta.parentNode=head;head.childNodes.unshift(meta);
  const script=parseFragment('<script></script>').childNodes[0],json=value=>JSON.stringify(value).replaceAll('<','\\u003c');
  script.parentNode=body;script.childNodes=[{nodeName:'#text',parentNode:script,value:'('+installOfflineControls.toString()+')('+json(links)+','+json(handlers)+');'}];body.childNodes.push(script);
  return serialize(doc);
}

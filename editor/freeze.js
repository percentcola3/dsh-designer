// Installed before the page's own scripts, only inside an interactive editor
// iframe. Editor RPC and measurements use native scheduling independently.
export function installPageFreeze() {
  const later=window.setTimeout.bind(window), cancel=window.clearTimeout.bind(window);
  const raf=window.requestAnimationFrame.bind(window), caf=window.cancelAnimationFrame.bind(window);
  const jobs=new Map(), animations=new Set(), media=new Set();
  let frozen=false, serial=0x40000000;
  function arm(job) {
    job.start=performance.now();
    const run=time=>{
      if (!jobs.has(job.id)||frozen) return;
      if (job.kind==='interval') {job.remaining=job.delay;arm(job);}
      else jobs.delete(job.id);
      job.fn.apply(window,job.kind==='raf'?[time]:job.args);
    };
    job.handle=job.kind==='raf'?raf(run):later(run,job.remaining);
  }
  function add(kind,fn,delay,args) {
    const id=++serial, ms=Math.max(0,Number(delay)||0);
    const job={id,kind,fn,delay:ms,remaining:ms,args};
    jobs.set(id,job);if(!frozen)arm(job);return id;
  }
  function stop(job) {
    if(job.handle==null)return;
    if(job.kind==='raf')caf(job.handle);
    else {cancel(job.handle);job.remaining=Math.max(0,job.remaining-(performance.now()-job.start));}
    job.handle=null;
  }
  for(const [name,kind] of [['setTimeout','timeout'],['setInterval','interval']]){
    const original=window[name].bind(window);
    window[name]=(fn,delay,...args)=>typeof fn==='function'?add(kind,fn,delay,args):original(fn,delay,...args);
  }
  window.requestAnimationFrame=fn=>add('raf',fn,0,[]);
  for(const name of ['clearTimeout','clearInterval','cancelAnimationFrame']){
    const original=window[name].bind(window);
    window[name]=id=>{const job=jobs.get(id);if(job){stop(job);jobs.delete(id);}else original(id);};
  }
  for(const type of ['pointerdown','pointerup','pointermove','pointerover','pointerout','pointerenter','pointerleave','mouseenter','mouseleave','mousedown','mouseup','mouseover','mouseout','click','dblclick','contextmenu','keydown','keyup','beforeinput','input','change','submit','cancel','blur','focusout','animationend','transitionend']){
    window.addEventListener(type,event=>{if(frozen){event.stopImmediatePropagation();if(event.cancelable)event.preventDefault();}},true);
  }
  // The editor's selection surface takes pointer and keyboard focus. Pin the
  // selectors that displayed a CSS-only menu before that surface was mounted.
  let restoreSelectors=[];
  function holdSelectors() {
    const states=['hover','focus-within','focus-visible','focus'];
    for(const state of states){
      const attr='data-dsh-freeze-'+state;
      for(const el of document.querySelectorAll(':'+state)){
        if(el.hasAttribute(attr))continue;
        el.setAttribute(attr,'');
        restoreSelectors.push(()=>el.removeAttribute(attr));
      }
    }
    const holdRules=sheet=>{
      let rules;
      try{rules=sheet.cssRules;}catch{return;} // External sheets can be opaque.
      for(const rule of rules||[]){
        if(rule.selectorText){
          const original=rule.selectorText;
          const pinned=original.replace(/(?<!:):(focus-within|focus-visible|focus|hover)\b/g,'[data-dsh-freeze-$1]');
          if(original!==pinned){
            rule.selectorText=pinned;
            restoreSelectors.push(()=>{rule.selectorText=original;});
          }
        }
        if(rule.cssRules)holdRules(rule);
      }
    };
    for(const sheet of document.styleSheets)holdRules(sheet);
  }
  return enabled=>{
    if(enabled===frozen)return;
    frozen=enabled;
    if(enabled){
      holdSelectors();
      for(const job of jobs.values())stop(job);
      for(const animation of document.getAnimations())if(animation.playState==='running'){animation.pause();animations.add(animation);}
      for(const el of document.querySelectorAll('audio,video'))if(!el.paused){el.pause();media.add(el);}
    }else{
      for(const restore of restoreSelectors)restore();
      restoreSelectors=[];
      for(const job of jobs.values())arm(job);
      for(const animation of animations)if(animation.playState==='paused')animation.play();
      for(const el of media)if(el.isConnected)el.play().catch(()=>{});
      animations.clear();media.clear();
    }
  };
}

// Apply only differences between two *saved* source documents. Reading the
// live DOM as a baseline would reset dialog.open, input values and JS classes.
export function patchPageSource(beforeHTML,afterHTML) {
  const parser=new DOMParser();
  const before=parser.parseFromString(beforeHTML,'text/html'),after=parser.parseFromString(afterHTML,'text/html');
  const changes=[];
  // These editor-authored rules apply to elements created by page scripts.
  // Patch just their sheets, keeping the selected live instance and its data.
  const styleBlocks=doc=>new Map(Array.from(doc.head.querySelectorAll('style[data-dsh-object-style]'),el=>[el.dataset.dshObjectStyle,el]));
  const priorStyles=styleBlocks(before),nextStyles=styleBlocks(after),liveStyles=styleBlocks(document);
  for(const key of new Set([...priorStyles.keys(),...nextStyles.keys()])){
    const old=priorStyles.get(key),next=nextStyles.get(key),live=liveStyles.get(key);
    if(old?.textContent!==next?.textContent)changes.push(()=>{
      if(!next)live?.remove();
      else if(live)live.textContent=next.textContent;
      else document.head.append(document.importNode(next,true));
    });
    old?.remove();next?.remove();
  }
  function compare(old,next){
    if(old.isEqualNode(next))return true;
    if(old.nodeType!==next.nodeType||old.nodeName!==next.nodeName)return false;
    if(old.nodeType!==1)return false;
    const id=old.getAttribute('data-dsh-node');
    const locate=()=>id?document.querySelector('[data-dsh-node="'+CSS.escape(id)+'"]'):old.id?document.getElementById(old.id):null;
    if(old.id==='dsh-document-model'&&next.id===old.id){
      const prior=JSON.parse(old.textContent),updated=JSON.parse(next.textContent);
      for(const key of ['responsive','overrides']){delete prior[key];delete updated[key];}
      if(JSON.stringify(prior)!==JSON.stringify(updated))return false;
      const el=locate();if(!el)return false;
      changes.push(()=>{el.textContent=next.textContent;});return true;
    }
    if(old.matches('script,base,link,template')||id!==next.getAttribute('data-dsh-node'))return false;
    for(const name of new Set([...old.getAttributeNames(),...next.getAttributeNames()])){
      const value=next.getAttribute(name),prior=old.getAttribute(name);
      if(value===prior)continue;
      if(/^on/i.test(name)||name==='srcdoc')return false;
      const el=locate();if(!el)return false;
      if(name==='style'){
        for(const prop of new Set([...old.style,...next.style])){
          const css=next.style.getPropertyValue(prop),priority=next.style.getPropertyPriority(prop);
          if(css!==old.style.getPropertyValue(prop)||priority!==old.style.getPropertyPriority(prop))
            changes.push(()=>css?el.style.setProperty(prop,css,priority):el.style.removeProperty(prop));
        }
      }else if(name==='class'){
        changes.push(()=>{for(const c of old.classList)if(!next.classList.contains(c))el.classList.remove(c);
          for(const c of next.classList)if(!old.classList.contains(c))el.classList.add(c);});
      }else changes.push(()=>value===null?el.removeAttribute(name):el.setAttribute(name,value));
    }
    if(!old.childElementCount&&!next.childElementCount&&old.textContent!==next.textContent){
      const el=locate();if(!el||el.childElementCount)return false;
      changes.push(()=>{el.textContent=next.textContent;});return true;
    }
    // SVG title and desc are intentionally outside the editable node index.
    const key=node=>node.getAttribute('data-dsh-node')||
      (old.localName==='svg'&&['title','desc'].includes(node.localName)?'@svg:'+node.localName:null);
    const priorChildren=[...old.children],nextChildren=[...next.children];
    if(priorChildren.map(key).join('|')!==nextChildren.map(key).join('|')){
      const parent=locate();
      if(!parent||[...old.childNodes,...next.childNodes].some(n=>n.nodeType===3&&n.data.trim())||
          [...priorChildren,...nextChildren].some(n=>!key(n)))return false;
      if([priorChildren,nextChildren].some(children=>new Set(children.map(key)).size!==children.length))return false;
      const oldById=new Map(priorChildren.map(n=>[key(n),n]));
      const nextIds=new Set(nextChildren.map(key)),liveById=new Map();
      for(const child of priorChildren){
        const el=[...parent.children].find(n=>key(n)===key(child));
        if(!el)return false;
        liveById.set(key(child),el);
        if(!nextIds.has(key(child)))changes.push(()=>el.remove());
      }
      for(const child of nextChildren){
        const prior=oldById.get(key(child));
        if(prior){if(!compare(prior,child))return false;}
        else{
          // Cross-parent moves and executable content need the authored loader.
          if(before.querySelector('[data-dsh-node="'+CSS.escape(key(child))+'"]')||
              [child,...child.querySelectorAll('*')].some(n=>n.matches('script,iframe,base,link,object,embed')||n.getAttributeNames().some(a=>/^on/i.test(a))))return false;
          liveById.set(key(child),document.importNode(child,true));
        }
      }
      changes.push(()=>{
        let anchor=null;
        for(const child of [...nextChildren].reverse()){
          const el=liveById.get(key(child));
          if(el.parentElement!==parent||el.nextElementSibling!==anchor)parent.insertBefore(el,anchor);
          anchor=el;
        }
      });
      return true;
    }
    if(old.childNodes.length!==next.childNodes.length)return false;
    for(let i=0;i<old.childNodes.length;i++){
      const a=old.childNodes[i],b=next.childNodes[i];
      if(a.nodeType===3&&b.nodeType===3&&a.data!==b.data){
        const el=locate();if(!el)return false;
        // Child elements inserted by a component must keep their listeners.
        const position=[...old.childNodes].slice(0,i).filter(n=>n.nodeType===3).length;
        const text=[...el.childNodes].filter(n=>n.nodeType===3)[position];
        if(!text)return false;
        changes.push(()=>{text.data=b.data;});
      }else if(!compare(a,b))return false;
    }
    return true;
  }
  if(!compare(before.documentElement,after.documentElement))return false;
  for(const apply of changes)apply();
  return true;
}

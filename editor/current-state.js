// Serialized into the sandbox bridge. Import into an inert document so cloning
// cannot run application constructors or reset the live form.
export function captureCurrentState({screenshot=false}={}) {
  const inert = document.implementation.createHTMLDocument('');
  const root = inert.importNode(document.documentElement, true);
  const copy = [root, ...root.querySelectorAll('*')];
  const live = [document.documentElement, ...document.documentElement.querySelectorAll('*')];
  const ids = new Set();
  let hasTopLayer = false;
  for (let i = 0; i < live.length; i++) {
    const el = live[i], node = copy[i];
    if (node!==root && !root.contains(node)) continue;
    if (screenshot&&el.scrollTop)node.setAttribute('data-preview-scroll-y',String(el.scrollTop));
    if (screenshot&&el.scrollLeft)node.setAttribute('data-preview-scroll-x',String(el.scrollLeft));
    if ((!screenshot&&el.matches('style[data-dsh-controlled="preview-scrollbars"],style[data-dsh-controlled="editor-layout"]'))||el.matches('script,base,template,meta[http-equiv],[data-dsh-controlled="canvas-date-picker"],dialog:not([open]),[role=tabpanel][hidden]')) {
      node.remove(); continue;
    }
    if (el.shadowRoot || el.matches('iframe,object,embed')) {
      if (el.getClientRects().length) throw Error(screenshot?'该视口含独立嵌入内容，暂无法生成完整截图。':'当前视图包含独立嵌入内容，无法完整拆成可编辑 HTML。');
      node.remove(); continue;
    }
    if (screenshot && el.localName==='style' && el.sheet) {
      // CSSOM contains the viewport-unit rules used to render the expanded canvas.
      try { node.textContent=Array.from(el.sheet.cssRules,rule=>rule.cssText).join('\n'); } catch { /* Keep the original sheet text. */ }
    }
    if (!screenshot && node.hasAttribute('style')) {
      const css=node.getAttribute('style');
      node.setAttribute('style',css.replace(/calc\((-?[\d.]+) \* var\(--dsh-editor-([dsl]?vh)\)\)/gi,'$1$2'));
    }
    for (const attr of Array.from(node.attributes)) {
      if (screenshot && ['data-dsh-editor-expand','data-dsh-view-mode'].includes(attr.name)) continue;
      if (/^on/i.test(attr.name) || attr.name.startsWith('data-dsh-freeze-') || ['data-dsh-instance','data-dsh-editor-expand','data-dsh-view-mode','data-dsh-controlled','autofocus'].includes(attr.name))
        node.removeAttribute(attr.name);
    }
    if (node.id==='dsh-document-styles') node.removeAttribute('id');
    const id = node.getAttribute('data-dsh-node');
    if (id && ids.has(id)) node.removeAttribute('data-dsh-node');
    if (id) ids.add(id);
    if (el.localName==='input') {
      if (['password','hidden','file'].includes(el.type)) {
        node.removeAttribute('value');
        node.parentElement?.closest('ds-input')?.removeAttribute('value');
      } else {
        node.setAttribute('value',el.value);
        if (['checkbox','radio'].includes(el.type)) node.toggleAttribute('checked',el.checked);
      }
    } else if (el.localName==='textarea') node.textContent=el.value;
    else if (el.localName==='option') node.toggleAttribute('selected',el.selected);
    else if (el.localName==='canvas') {
      const img=inert.createElement('img');
      for(const a of node.attributes)img.setAttribute(a.name,a.value);
      img.src=el.toDataURL();img.width=el.width;img.height=el.height;node.replaceWith(img);
    }
    if (el.matches(':modal,:popover-open')) {
      node.setAttribute('data-snapshot-top',el.matches(':modal')?'modal':'popover');
      hasTopLayer=true;
    }
  }
  if (hasTopLayer&&!screenshot) {
    const restore=inert.createElement('script');
    restore.textContent="for(const el of document.querySelectorAll('[data-snapshot-top]')){if(el.dataset.snapshotTop==='modal'){el.removeAttribute('open');el.showModal()}else el.showPopover()}";
    root.querySelector('body').append(restore);
  }
  const heading=document.querySelector('dialog[open] h1,dialog[open] h2,dialog[open] header,[role=dialog]:not([hidden]) h2,[role=tab][aria-selected=true]');
  const html='<!doctype html>\n'+root.outerHTML;
  if (/\/api\/designer\/resource\/|(?:src|href|poster)=["']blob:|url\(["']?blob:/i.test(html)) throw Error('页面仍包含临时资源地址，无法保存独立状态。');
  if(new TextEncoder().encode(html).length>2*1024*1024)throw Error('当前状态超过 2 MiB，请缩小页面内容后重试。');
  return {html,label:(heading?.textContent||'').trim().slice(0,50)};
}

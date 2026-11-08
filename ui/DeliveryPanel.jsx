import React from 'react';
import {Button,ErrorBox,downloadValue} from './common.jsx';
import {copyExportToClipboard} from './export-clipboard.js';

export default function DeliveryPanel({api,project,design,pages,onChanged}) {
  const [format,setFormat]=React.useState('zip'),[scope,setScope]=React.useState('design'),[pageIds,setPageIds]=React.useState([]),[background,setBackground]=React.useState('transparent'),[marks,setMarks]=React.useState(false);
  const [exports,setExports]=React.useState([]),[packages,setPackages]=React.useState([]),[shares,setShares]=React.useState([]),[selectedExport,setSelectedExport]=React.useState(''),[access,setAccess]=React.useState('local-link');
  const [result,setResult]=React.useState(null),[notice,setNotice]=React.useState(''),[error,setError]=React.useState(null),[busy,setBusy]=React.useState(false),[revision,setRevision]=React.useState(project.revision),[confirm,setConfirm]=React.useState(null);
  const lock=React.useRef(false),owner=React.useRef(project.id);owner.current=project.id;
  React.useEffect(()=>setRevision(project.revision),[project.revision]);
  const run=async operation=>{if(lock.current)return;const token={};lock.current=token;const id=project.id;setBusy(true);setError(null);setNotice('');try{const r=await operation();if(owner.current!==id)return;if(r){setResult(r);if(r.projectRevision)setRevision(r.projectRevision);if(r.project?.revision){setRevision(r.project.revision);await onChanged?.(r.project);}}return r;}catch(e){if(owner.current===id)setError(e);}finally{if(lock.current===token){lock.current=false;if(owner.current===id)setBusy(false);}}};
  const call=(action,args={})=>api(action,{projectId:project.id,...args});
  const work=(action,args={})=>run(()=>call(action,args));
  const refresh=async()=>{const id=project.id;const [a,b,c]=await Promise.all([call('export.list'),call('share.list'),call('package.list')]);if(owner.current!==id)return;setExports((a.exports||[]).filter(e=>e.format!=='project-package'));setShares(b.shares||[]);setPackages(c.packages||[]);};
  React.useEffect(()=>{lock.current=false;setBusy(false);setExports([]);setPackages([]);setShares([]);setSelectedExport('');setResult(null);setNotice('');setError(null);setConfirm(null);setPageIds([]);refresh().catch(e=>{if(owner.current===project.id)setError(e);});},[project.id]);
  const selectedPages=pages.filter(p=>scope==='project'||scope==='design'&&(p.designId===design?.id||design?.pageIds?.includes(p.id))||scope==='pages'&&pageIds.includes(p.id));
  const selection=scope==='design'?{designId:design?.id}:scope==='pages'?{pageIds}:{};
  const create=async()=>{const r=await work('export.create',{expectedRevision:revision,...selection,format,background,editorMarks:marks,expectedPageRevisions:Object.fromEntries(selectedPages.map(p=>[p.id,p.revision]))});if(r?.export){setExports(e=>[r.export,...e]);setSelectedExport(r.export.id);}};
  const createPackage=async()=>{const r=await work('package.create',{expectedRevision:revision});if(r?.package){setPackages(p=>[r.package,...p]);try{downloadValue(r.package);}catch(error){setError(error);}}};
  const download=async(item,isPackage=false)=>run(async()=>{const r=await call(isPackage?'package.get':'export.get',{exportId:item.id});downloadValue(r.package||r.export||r,item.name||item.id);return r;});
  const copy=async(kind,args={})=>run(async()=>{const payload=await call('package.clipboard',{kind,expectedRevision:revision,...args});await copyExportToClipboard(payload);if(owner.current===project.id)setNotice(kind==='project'?'已复制完整项目的便携文本编码，可粘贴保存。':kind==='png'?'已将实际 PNG 图片复制到剪贴板。':'已复制完整 HTML 源码。');return null;});
  const share=async()=>{const r=await work('share.create',{expectedRevision:revision,exportId:selectedExport,scope:access,hosting:'local'});if(r?.share){setShares(s=>[r.share,...s]);setConfirm(null);}};
  const revoke=async item=>{const r=await work('share.revoke',{expectedRevision:revision,shareId:item.id,expectedShareRevision:item.revision});if(r?.share)setShares(s=>s.map(x=>x.id===r.share.id?r.share:x));};
  return <div className="wb-stack">
    <p className="wb-muted">导出使用已保存的有效版本。分享固定到一次导出，后续草稿不会改变分享内容。</p>
    <section className="wb-stack wb-message">
      <h3>完整项目保存</h3>
      <p className="wb-muted">保存所有设计稿、原始页面模型、项目公开资源、需求规范与固定版本设计体系。包可用于项目迁移和云同步。</p>
      <div className="wb-row" style={{flexWrap:'wrap'}}><Button primary disabled={busy} onClick={createPackage}>保存完整项目 ZIP</Button><Button disabled={busy} onClick={()=>copy('project')}>复制完整项目便携文本</Button></div>
      <p className="wb-muted">剪贴板复制带标记的完整便携文本编码，含实际文件内容。ZIP 文件请使用下载；浏览器剪贴板不提供系统 ZIP 文件对象。</p>
      {packages.map(item=><div className="wb-row" key={item.id} style={{flexWrap:'wrap'}}><span className="wb-grow">{item.name||item.id} · {Math.ceil((item.byteLength||0)/1024)} KiB</span><Button disabled={busy} onClick={()=>download(item,true)}>下载 ZIP</Button><Button disabled={busy} onClick={()=>copy('project',{exportId:item.id})}>复制此版本内容</Button></div>)}
    </section>
    <div className="wb-operation-grid"><label>交付范围<select value={scope} onChange={e=>setScope(e.target.value)}><option value="design">当前设计 · {design?.name||'未选择'}</option><option value="project">整个项目</option><option value="pages">所选页面</option></select></label><label>交付格式<select value={format} onChange={e=>setFormat(e.target.value)}>{[['zip','独立 HTML 与资源 ZIP'],['design-package','页面设计源包'],['png','PNG 图片'],['jpeg','JPEG 图片'],['webp','WebP 图片']].map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></label></div>
    {scope==='pages'&&pages.map(p=><label className="wb-row" key={p.id}><input type="checkbox" checked={pageIds.includes(p.id)} onChange={e=>setPageIds(s=>e.target.checked?[...s,p.id]:s.filter(id=>id!==p.id))}/>{p.name}</label>)}
    {['png','jpeg','webp'].includes(format)&&<div className="wb-row"><label>背景<select value={background} onChange={e=>setBackground(e.target.value)}><option value="transparent">透明</option><option value="page">页面背景</option><option value="white">白色</option><option value="black">黑色</option></select></label><label className="wb-row"><input type="checkbox" checked={marks} onChange={e=>setMarks(e.target.checked)}/>包含编辑辅助标记</label></div>}
    <div className="wb-row" style={{flexWrap:'wrap'}}><Button primary disabled={busy||!selectedPages.length||scope==='design'&&!design} onClick={create}>创建交付包 / 图片</Button><Button disabled={busy||selectedPages.length!==1} onClick={()=>copy('html',{pageId:selectedPages[0]?.id})}>复制所选页面 HTML 源码</Button></div>
    <ErrorBox error={error} onClose={()=>setError(null)} context="导出与分享"/>{notice&&<p role="status" className="wb-muted">{notice}</p>}
    <section className="wb-stack"><div className="wb-row"><h3 className="wb-grow">已保存的导出</h3><Button disabled={busy} onClick={()=>run(refresh)}>刷新列表</Button></div>
      {exports.map(e=><div className="wb-message wb-row" key={e.id} style={{flexWrap:'wrap'}}><input aria-label={'选择导出 '+e.id} type="radio" name="export" checked={selectedExport===e.id} onChange={()=>setSelectedExport(e.id)}/><span className="wb-grow">{e.name||e.id} · {e.format||'zip'} · {e.createdAt?new Date(e.createdAt).toLocaleString():''}</span><Button disabled={busy} onClick={()=>download(e)}>下载</Button>{e.format==='png'&&<Button disabled={busy} onClick={()=>copy('png',{exportId:e.id})}>复制 PNG 图片</Button>}<Button disabled={busy} onClick={()=>work('export.get',{exportId:e.id})}>查看清单</Button></div>)}
    </section>
    <section className="wb-stack"><h3>分享固定版本</h3><label>访问范围<select value={access} onChange={e=>setAccess(e.target.value)}><option value="owner">仅所有者</option><option value="local-link">本机链接</option><option value="unlisted">持有链接可访问</option></select></label><Button disabled={busy||!selectedExport} onClick={()=>setConfirm('share')}>创建分享链接</Button>
      {confirm==='share'&&<div className="wb-message wb-stack"><p>将所选导出固定为分享版本，访问范围：{access}。</p><div className="wb-row"><Button primary disabled={busy} onClick={share}>确认创建分享</Button><Button disabled={busy} onClick={()=>setConfirm(null)}>取消</Button></div></div>}
      {shares.map(s=><div className="wb-message wb-stack" key={s.id}><div className="wb-row"><span className="wb-grow">{s.id} · {s.scope} · {s.revokedAt?'已撤销':'有效'}</span><Button disabled={busy||!!s.revokedAt} onClick={()=>revoke(s)}>撤销</Button></div>{s.url&&!s.revokedAt&&<a href={s.url} target="_blank" rel="noreferrer">打开分享预览</a>}</div>)}
    </section>
    {result&&<details><summary>操作结果与清单</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(result,null,2)}</pre></details>}
  </div>;
}

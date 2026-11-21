const records = [
  ['APT-001','林晓','138 0013 8000','助餐配送','2026-11-16 11:30','王秀兰','幸福里社区食堂','待确认'],
  ['APT-002','陈建国','139 1024 7788','家政保洁','2026-11-16 14:00','李桂芳','阳光花园 3 栋','已确认'],
  ['APT-003','周敏','136 5521 9032','居家护理','2026-11-17 09:00','赵春梅','康乐苑 12 栋','已确认'],
  ['APT-004','吴海燕','137 8890 2145','陪同就医','2026-11-17 08:30','孙志强','市第一医院','待确认'],
  ['APT-005','郑国强','135 6677 3321','家电维修','2026-11-18 15:30','刘建军','和平里 7 栋','已完成'],
  ['APT-006','黄丽','139 7788 4412','助餐配送','2026-11-18 11:45','王秀兰','幸福里社区食堂','已取消'],
  ['APT-007','徐斌','138 5566 2140','居家护理','2026-11-19 10:00','赵春梅','康乐苑 8 栋','已确认'],
  ['APT-008','何静','137 2255 6708','家政保洁','2026-11-19 13:30','李桂芳','阳光花园 2 栋','已完成'],
];
const fields = ['code','name','phone','service','time','staff','place','status'];
const sceneIds = ['scene-list-default','scene-list-loading','scene-list-empty','scene-list-page2','scene-detail','scene-reschedule','scene-reschedule-error','scene-reschedule-success','scene-cancel'];
const node = (id, text) => `<span data-dsh-node="${id}">${text}</span>`;

export const desktopPattern = {
  id:'desktop-records', name:'桌面记录管理与多状态面板', path:'patterns/desktop-records.html', platform:'web',
  description:'导航、统计、姓名/服务搜索、状态筛选、分页、详情抽屉、时间调整表单、删除或取消确认及加载/空/错误/成功场景。',
  components:['ds-button','ds-input','ds-textarea','ds-select','ds-table','ds-tag','ds-drawer','ds-dialog','ds-alert','ds-toast','ds-empty','ds-skeleton'],
  resourceBindings:[{nodeId:'pattern-theme',attribute:'href',path:'theme.css'},{nodeId:'pattern-components',attribute:'src',path:'components.js'}],
  editableNodes:{
    title:'page-title',description:'page-description',brand:'brand-name',navigation:'nav-active',
    detailTitle:'detail-title',formTitle:'reschedule-title',confirmTitle:'cancel-title',
    records:records.map((_,index)=>({rowId:`row-${index+1}`,fields:Object.fromEntries(fields.map(field=>[field,`row-${index+1}-${field}`]))})),
  },
  sceneIds,
  guidance:'Copy with designer_commit_html pattern:{resourceId,patternId:"desktop-records"}, existing artboardId and current expectedRevision. Use edit.apply text operations on editableNodes to tailor the saved page. Table field text is the runtime data source, so edits also update search/details/forms after reload. Edit the saved layout with style/insert operations. Preserve all requested states and validate their sceneIds. The supplied behavior covers the listed pattern; add task-specific behavior through scoped edits.',
};

function patternRuntime() {
  const find = id => document.querySelector(`[data-dsh-node="${id}"]`);
  const rows = Array.from(document.querySelectorAll('[data-record-row]'));
  const field = (row, name) => row.querySelector(`[data-field="${name}"]`);
  const value = (row, name) => field(row,name).textContent.trim();
  const search = document.getElementById('record-search');
  const status = document.getElementById('record-status');
  const service = document.getElementById('record-service');
  const detail = document.getElementById('detail-panel');
  const formPanel = document.getElementById('reschedule-panel');
  const confirm = document.getElementById('cancel-panel');
  const form = document.getElementById('reschedule-form');
  const date = document.getElementById('new-date');
  const time = document.getElementById('new-time');
  const toast = document.getElementById('record-toast');
  const today = new Date();
  date.min = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const tones = {'待确认':'warning','已确认':'primary','已完成':'success','已取消':'danger'};
  let page = 1;
  let activeRow = rows[0];
  let loadingTimer;

  function open(panel) {
    if (!panel.hasAttribute('open')) panel.showModal();
  }
  function render() {
    const query = search.value.trim().toLowerCase();
    const matches = rows.filter(row => {
      const text = `${value(row,'name')} ${value(row,'service')} ${value(row,'code')}`.toLowerCase();
      return text.includes(query) && (!status.value || value(row,'status') === status.value) && (!service.value || value(row,'service') === service.value);
    });
    const pages = Math.max(1, Math.ceil(matches.length / 5));
    page = Math.max(1, Math.min(page,pages));
    rows.forEach(row => {const index=matches.indexOf(row);row.hidden=index<0||index<(page-1)*5||index>=page*5;});
    find('table-wrap').hidden = matches.length === 0;
    find('list-empty').hidden = matches.length > 0;
    find('list-loading').hidden = true;
    find('pagination').hidden = matches.length === 0;
    find('list-count').textContent = `共 ${matches.length} 条预约`;
    find('page-summary').textContent = `第 ${page} / ${pages} 页 · 每页 5 条`;
    document.getElementById('page-prev').disabled = page === 1;
    document.getElementById('page-next').disabled = page >= pages;
    document.getElementById('page-2').hidden = pages < 2;
    [1,2].forEach(number => document.getElementById(`page-${number}`).setAttribute('aria-current',number===page?'page':'false'));
    find('stat-total').textContent = String(rows.length);
    find('stat-pending').textContent = String(rows.filter(row=>value(row,'status')==='待确认').length);
    find('stat-completed').textContent = String(rows.filter(row=>value(row,'status')==='已完成').length);
    find('stat-cancelled').textContent = String(rows.filter(row=>value(row,'status')==='已取消').length);
    rows.forEach(row=>{
      const currentStatus=value(row,'status');
      field(row,'status').setAttribute('tone',tones[currentStatus]||'primary');
      row.querySelectorAll('button[data-record-action]').forEach(button=>{
        const closed=currentStatus==='已完成'||currentStatus==='已取消';
        button.disabled=button.dataset.recordAction!=='detail'&&closed;
        button.closest('ds-button').toggleAttribute('disabled',button.disabled);
        button.setAttribute('aria-label',`${button.textContent.trim()} ${value(row,'name')}的预约`);
      });
    });
  }
  function reset() {
    search.value = ''; status.value = ''; service.value = ''; page = 1;
    status.dispatchEvent(new Event('change',{bubbles:true}));
    service.dispatchEvent(new Event('change',{bubbles:true}));
    render();
  }
  function fillDetail(row) {
    fieldsForDetail.forEach(name=>{find(`detail-${name}`).textContent=value(row,name);});
    open(detail);
  }
  const fieldsForDetail = ['code','name','phone','service','time','staff','place','status'];
  function editTime(row) {
    find('reschedule-context').textContent = `${value(row,'name')} · ${value(row,'service')} · ${value(row,'time')}`;
    const today = new Date();
    const min = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    date.min = min;
    date.value = value(row,'time').slice(0,10) < min ? min : value(row,'time').slice(0,10);
    time.value = value(row,'time').slice(11,16);
    clearErrors();
    document.getElementById('change-reason').value='';
    open(formPanel);
  }
  function clearErrors() {
    find('form-error').hidden = true;
    find('date-error').hidden = true;
    date.setAttribute('aria-invalid','false');
    find('date-host').removeAttribute('invalid');
    find('time-host').removeAttribute('invalid');
    time.setAttribute('aria-invalid','false');
  }
  document.addEventListener('click',event=>{
    const button = event.target.closest('button[data-record-action]');
    if (!button || button.disabled) return;
    const row = button.closest('[data-record-row]');
    if (row) activeRow = row;
    const action = button.dataset.recordAction;
    if (action === 'detail') fillDetail(activeRow);
    if (action === 'reschedule') {detail.close();editTime(activeRow);}
    if (action === 'cancel') {
      find('cancel-context').textContent = `${value(activeRow,'name')} · ${value(activeRow,'service')} · ${value(activeRow,'time')}`;
      open(confirm);
    }
    if (action === 'confirm-cancel') {
      field(activeRow,'status').textContent = '已取消';
      confirm.close(); render(); toast.show('预约已取消，已通知居民',{tone:'success'});
    }
    if (action === 'reset') reset();
    if (action === 'search') {page=1;render();}
    if (action === 'refresh' && !loadingTimer) {
      find('list-loading').hidden = false; find('table-wrap').hidden = true; find('list-empty').hidden = true;
      loadingTimer = setTimeout(()=>{loadingTimer=null;render();},500);
    }
  });
  [search,status,service].forEach(control=>control.addEventListener(control===search?'input':'change',()=>{page=1;render();}));
  [1,2].forEach(number=>document.getElementById(`page-${number}`).addEventListener('click',()=>{page=number;render();}));
  document.getElementById('page-prev').addEventListener('click',()=>{page--;render();});
  document.getElementById('page-next').addEventListener('click',()=>{page++;render();});
  form.addEventListener('submit',event=>{
    event.preventDefault(); clearErrors();
    if (!date.value || date.value < date.min || !time.value) {
      const invalidDate=!date.value||date.value<date.min;
      find('date-host').toggleAttribute('invalid',invalidDate);
      find('time-host').toggleAttribute('invalid',!time.value);
      date.setAttribute('aria-invalid',String(invalidDate));
      time.setAttribute('aria-invalid',String(!time.value));
      find('date-error').hidden = false; find('form-error').hidden = false;
      (invalidDate?date:time).focus(); return;
    }
    const newTime = `${date.value} ${time.value}`;
    field(activeRow,'time').textContent = newTime;
    find('success-text').textContent = `${value(activeRow,'name')}的预约已改期至 ${newTime}。`;
    find('success-banner').hidden = false;
    formPanel.close(); render(); toast.show('改期成功，已通知居民与服务人员',{tone:'success'});
  });
  const services=[...new Set(rows.map(row=>value(row,'service')))];
  service.replaceChildren(...['',...services].map(text=>{
    const option=document.createElement('option');option.value=text;option.textContent=text||'全部服务';return option;
  }));
  render();
}

function rowHTML(values,index) {
  const id = `row-${index+1}`;
  const cells = fields.map((field,i)=>field==='status'
    ? `<td><ds-tag data-field="status" data-dsh-node="${id}-status">${values[i]}</ds-tag></td>`
    : `<td><span data-field="${field}" data-dsh-node="${id}-${field}">${values[i]}</span></td>`);
  return `<tr data-record-row data-dsh-node="${id}"${index>=5?' hidden':''}>
${cells.join('\n')}
<td class="row-actions"><ds-button variant="text"><button type="button" data-record-action="detail" data-dsh-node="${id}-detail" aria-label="查看${values[1]}的预约详情">详情</button></ds-button><ds-button variant="text"><button type="button" data-record-action="reschedule" data-dsh-node="${id}-reschedule" aria-label="为${values[1]}改期">改期</button></ds-button><ds-button variant="text" danger><button type="button" data-record-action="cancel" data-dsh-node="${id}-cancel" aria-label="取消${values[1]}的预约">取消</button></ds-button></td>
</tr>`;
}

function metadata() {
  const panels = {'scene-detail':'detail-panel','scene-reschedule':'reschedule-panel','scene-reschedule-error':'reschedule-panel','scene-cancel':'cancel-panel'};
  const names = ['预约列表 · 默认','列表加载中','筛选无结果','预约列表 · 第2页','预约详情','改期表单','改期校验失败','改期成功','取消确认'];
  const items = sceneIds.map((id,index)=>({id,name:names[index],nodes:panels[id]?{[panels[id]]:{attributes:{open:''}}}:{}}));
  items[1].nodes = {'list-loading':{hidden:false},'table-wrap':{hidden:true},pagination:{hidden:true}};
  items[2].nodes = {'list-empty':{hidden:false},'table-wrap':{hidden:true},pagination:{hidden:true},'list-count':{text:'共 0 条预约'}};
  items[3].nodes = {...Object.fromEntries(records.map((_,index)=>[`row-${index+1}`,{hidden:index<5}])), 'page-summary':{text:'第 2 / 2 页 · 每页 5 条'},'page-prev':{attributes:{disabled:null}},'page-next':{attributes:{disabled:''}},'page-1':{attributes:{'aria-current':'false'}},'page-2':{attributes:{'aria-current':'page'}}};
  items[6].nodes = {...items[6].nodes,'date-host':{attributes:{invalid:''}},'date-input':{attributes:{value:''}},'date-error':{hidden:false},'form-error':{hidden:false}};
  items[7].nodes = {'success-banner':{hidden:false},'success-text':{text:'改期成功 · 林晓的预约已调整为 2026-11-20 11:30。'},'row-1-time':{text:'2026-11-20 11:30'}};
  const interactions = records.flatMap((_,index)=>['detail','reschedule','cancel'].map(action=>({id:`open-${index+1}-${action}`,type:'modal',sourceId:`row-${index+1}-${action}`,targetId:action==='detail'?'detail-panel':action==='reschedule'?'reschedule-panel':'cancel-panel',action:'open'})));
  return {schemaVersion:1,scenes:{active:sceneIds[0],items},interactions};
}

export function desktopRecordsHTML() {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>预约管理</title>
<link data-dsh-node="pattern-theme" rel="stylesheet" href="../theme.css">
<style>
* { box-sizing:border-box; }
body { margin:0; }
[hidden] { display:none!important; }
.workspace { padding:var(--ds-space-xl,32px); min-width:0; }
.topbar { display:flex; align-items:center; justify-content:space-between; gap:var(--ds-space-lg,24px); padding:var(--ds-space,16px) var(--ds-space-xl,32px); background:var(--ds-surface); border-bottom:1px solid var(--ds-split); }
.brand { font-weight:600; font-size:var(--ds-font-size-heading5,16px); }
.topbar nav { display:flex; gap:var(--ds-space-lg,24px); color:var(--ds-text-secondary); }
.topbar [aria-current=page] { color:var(--ds-primary); }
.page-heading { display:flex; align-items:center; justify-content:space-between; gap:var(--ds-space,16px); margin-bottom:var(--ds-space-lg,24px); }
h1 { font-size:var(--ds-font-size-heading3,24px); line-height:var(--ds-line-height-heading3,32px); margin:0 0 var(--ds-space-xs,8px); }
h2 { font-size:var(--ds-font-size-heading5,16px); margin:0; }
p { margin:0; }
.secondary { color:var(--ds-text-secondary); }
.statistics { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:var(--ds-space,16px); margin-bottom:var(--ds-space-lg,24px); }
.surface { background:var(--ds-surface); border:1px solid var(--ds-border); border-radius:var(--ds-card-radius,8px); }
.statistics article { padding:var(--ds-space-lg,24px); }
.stat-number { display:block; margin-top:var(--ds-space-xs,8px); font-size:var(--ds-font-size-heading2,30px); font-weight:600; font-variant-numeric:tabular-nums; }
.filters { display:flex; flex-wrap:wrap; align-items:end; gap:var(--ds-space,16px); padding:var(--ds-space-lg,24px); margin-bottom:var(--ds-space-lg,24px); }
.filters label { display:grid; gap:var(--ds-space-xs,8px); min-width:160px; }
.filters label:first-child { min-width:240px; }
.list-heading,.pager { display:flex; align-items:center; justify-content:space-between; gap:var(--ds-space,16px); padding:var(--ds-space-md,20px) var(--ds-space-lg,24px); }
.table-scroll { overflow-x:auto; }
ds-table { display:block; }
table { min-width:1100px; width:100%; }
td,th { white-space:nowrap; }
.row-actions { display:flex; align-items:center; gap:0; }
.page-buttons { display:flex; gap:var(--ds-space-xs,8px); }
.page-buttons button[aria-current=page] { color:var(--ds-primary); border-color:var(--ds-primary); background:var(--ds-primary-soft); }
.details { display:grid; grid-template-columns:100px minmax(0,1fr); gap:var(--ds-space,16px); margin:0; }
.details dt { color:var(--ds-text-secondary); }
.details dd { margin:0; overflow-wrap:anywhere; }
.form-fields { display:grid; gap:var(--ds-space-md,20px); }
.form-fields label { display:grid; gap:var(--ds-space-xs,8px); }
.field-error { color:var(--ds-danger); }
#success-banner { margin-bottom:var(--ds-space-lg,24px); }
@media(max-width:900px) { .workspace { padding:var(--ds-space,16px); } .statistics { grid-template-columns:repeat(2,minmax(0,1fr)); } .topbar { flex-wrap:wrap; padding:var(--ds-space,16px); } }
</style>
<script data-dsh-node="pattern-components" src="../components.js" defer></script>
</head><body class="ds-theme">
<header class="topbar"><span class="brand" data-dsh-node="brand-name">邻里服务</span><nav aria-label="主导航"><span>工作台</span><span data-dsh-node="nav-active" aria-current="page">预约管理</span><span>居民档案</span></nav><span class="secondary">社区运营</span></header>
<main class="workspace">
<section class="page-heading"><div><h1 data-dsh-node="page-title">预约管理</h1><p class="secondary" data-dsh-node="page-description">集中处理社区服务预约，查看详情、调整时间与取消预约。</p></div><ds-button><button type="button" data-record-action="refresh">刷新列表</button></ds-button></section>
<section class="statistics" aria-label="预约统计">${[['本周预约','stat-total','8'],['待确认','stat-pending','2'],['已完成','stat-completed','2'],['已取消','stat-cancelled','1']].map(([label,id,total])=>`<article class="surface"><span class="secondary">${label}</span><strong class="stat-number" data-dsh-node="${id}">${total}</strong></article>`).join('\n')}</section>
<ds-alert id="success-banner" data-dsh-node="success-banner" tone="success" role="status" hidden>${node('success-text','预约调整成功。')}</ds-alert>
<section class="surface filters" aria-label="搜索与筛选">
<label>居民姓名或服务<ds-input><input id="record-search" type="search" placeholder="输入居民姓名、服务或编号" aria-label="居民姓名或服务"></ds-input></label>
<label>服务项目<ds-select clearable searchable><select id="record-service" aria-label="服务项目"><option value="">全部服务</option>${[...new Set(records.map(row=>row[3]))].map(text=>`<option>${text}</option>`).join('')}</select></ds-select></label>
<label>预约状态<ds-select><select id="record-status" aria-label="预约状态"><option value="">全部状态</option>${Object.keys({'待确认':1,'已确认':1,'已完成':1,'已取消':1}).map(text=>`<option>${text}</option>`).join('')}</select></ds-select></label>
<ds-button variant="primary"><button type="button" data-record-action="search">查询</button></ds-button><ds-button><button type="button" data-record-action="reset">重置</button></ds-button>
</section>
<section class="surface"><header class="list-heading"><h2>预约列表</h2><span class="secondary" data-dsh-node="list-count">共 8 条预约</span></header>
<ds-skeleton data-dsh-node="list-loading" aria-label="正在加载预约列表" aria-busy="true" hidden><span></span><span></span><span></span></ds-skeleton>
<ds-empty data-dsh-node="list-empty" hidden><span>没有符合条件的预约</span><ds-button><button type="button" data-record-action="reset">清空筛选</button></ds-button></ds-empty>
<div class="table-scroll" data-dsh-node="table-wrap"><ds-table><table><thead><tr>${['预约编号','居民','联系电话','服务','预约时间','服务人员','地点','状态','操作'].map(text=>`<th scope="col">${text}</th>`).join('')}</tr></thead><tbody>${records.map(rowHTML).join('\n')}</tbody></table></ds-table></div>
<footer class="pager" data-dsh-node="pagination"><span class="secondary" data-dsh-node="page-summary">第 1 / 2 页 · 每页 5 条</span><div class="page-buttons"><ds-button><button id="page-prev" data-dsh-node="page-prev" type="button" disabled>上一页</button></ds-button><ds-button><button id="page-1" data-dsh-node="page-1" type="button" aria-label="第1页" aria-current="page">1</button></ds-button><ds-button><button id="page-2" data-dsh-node="page-2" type="button" aria-label="第2页">2</button></ds-button><ds-button><button id="page-next" data-dsh-node="page-next" type="button">下一页</button></ds-button></div></footer></section>
</main>
<ds-drawer id="detail-panel" data-dsh-node="detail-panel"><dialog aria-labelledby="detail-title"><header><span id="detail-title" data-dsh-node="detail-title">预约详情</span><button type="button" data-overlay-close data-ds-close aria-label="关闭预约详情">×</button></header><div data-dialog-body><dl class="details">${fields.map((field,index)=>`<dt>${['预约编号','居民','联系电话','服务','预约时间','服务人员','地点','状态'][index]}</dt><dd data-dsh-node="detail-${field}">${records[0][index]}</dd>`).join('')}</dl></div><footer><ds-button><button type="button" data-ds-close>关闭</button></ds-button><ds-button variant="primary"><button type="button" data-record-action="reschedule">改期</button></ds-button></footer></dialog></ds-drawer>
<ds-dialog id="reschedule-panel" data-dsh-node="reschedule-panel"><dialog aria-labelledby="reschedule-title"><header><span id="reschedule-title" data-dsh-node="reschedule-title">改期预约</span><button type="button" data-overlay-close data-ds-close aria-label="关闭改期表单">×</button></header><div data-dialog-body><p class="secondary" data-dsh-node="reschedule-context">林晓 · 助餐配送 · 2026-11-16 11:30</p><ds-alert tone="error" role="alert" data-dsh-node="form-error" hidden>请检查新预约日期和时间后再提交。</ds-alert><form id="reschedule-form" class="form-fields" novalidate>
<label for="new-date">新的预约日期<ds-input required data-dsh-node="date-host"><input id="new-date" data-dsh-node="date-input" type="date" value="2026-11-20" required aria-describedby="date-error"></ds-input><small id="date-error" class="field-error" data-dsh-node="date-error" hidden>请选择今天或之后的有效日期及时间。</small></label>
<label for="new-time">新的预约时间<ds-input required data-dsh-node="time-host"><input id="new-time" type="time" value="11:30" required aria-describedby="date-error"></ds-input></label>
<label for="change-reason">改期原因<ds-textarea><textarea id="change-reason" placeholder="补充说明（选填）"></textarea></ds-textarea></label>
</form></div><footer><ds-button><button type="button" data-ds-close>取消</button></ds-button><ds-button variant="primary"><button type="submit" form="reschedule-form">确认改期</button></ds-button></footer></dialog></ds-dialog>
<ds-dialog id="cancel-panel" data-dsh-node="cancel-panel"><dialog aria-labelledby="cancel-title"><header><span id="cancel-title" data-dsh-node="cancel-title">取消预约</span><button type="button" data-overlay-close data-ds-close aria-label="关闭取消确认">×</button></header><div data-dialog-body><p data-dsh-node="cancel-context">林晓 · 助餐配送 · 2026-11-16 11:30</p><p class="secondary">确认取消后将释放预约时段并通知居民。</p></div><footer><ds-button><button type="button" data-ds-close>保留预约</button></ds-button><ds-button variant="primary" danger><button type="button" data-record-action="confirm-cancel">确认取消</button></ds-button></footer></dialog></ds-dialog>
<ds-toast id="record-toast" role="status" duration="4000"></ds-toast>
<script id="dsh-document-model" type="application/json">${JSON.stringify(metadata())}</script>
<script>(${patternRuntime.toString()})();</script>
</body></html>`;
}

export function desktopPatternFiles() {
  return {'skeletons.json':JSON.stringify([desktopPattern],null,2),'patterns/desktop-records.html':desktopRecordsHTML()};
}

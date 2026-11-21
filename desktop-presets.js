export const desktopPresets = {
  element: {
    name:'Element Plus', reference:'https://element-plus.org/en-US/component/button.html',
    guidance:'适合表单与数据管理。输入框用白底描边，主要提交用品牌色实心按钮，普通操作用白底按钮。表格行以底部分隔线建立层级。',
    values:{primary:'#409eff',background:'#f5f7fa',text:'#303133',muted:'#606266',border:'#dcdfe6',success:'#67c23a',warning:'#e6a23c',danger:'#f56c6c',info:'#909399',radius:4,buttonRadius:4,cardRadius:4,optionGap:0,optionRadius:0,popupRadius:4},
    css:`.ds-theme ds-button>button{box-shadow:none;font-weight:500}.ds-theme [data-select-options] [role=option]{min-height:34px;padding-inline:20px}.ds-theme [data-select-options] [role=option][aria-selected=true]{background:var(--ds-surface);color:var(--ds-primary);font-weight:600}.ds-theme ds-table th{background:var(--ds-surface);color:var(--ds-muted)}`
  },
  arco: {
    name:'Arco Design', reference:'https://arco.design/react/components/button',
    guidance:'适合高密度工作台。输入框与次要操作采用浅灰填充，聚焦时以品牌色描边，表头用浅灰底。工具栏按钮与筛选控件保持相同高度。',
    values:{primary:'#165dff',background:'#f2f3f5',text:'#1d2129',muted:'#4e5969',border:'#e5e6eb',success:'#00b42a',warning:'#ff7d00',danger:'#f53f3f',info:'#165dff',radius:2,buttonRadius:2,cardRadius:4,optionGap:0,optionRadius:0,popupRadius:4},
    css:`.ds-theme :is(ds-input>input,ds-textarea>textarea,ds-select>[data-select-trigger]),.ds-theme ds-button:not([variant]):not([danger])>button{background:var(--ds-fill-hover);border-color:transparent;box-shadow:none}.ds-theme ds-button>button{box-shadow:none}.ds-theme :is(ds-input>input,ds-textarea>textarea):focus,.ds-theme ds-select>[data-select-trigger][aria-expanded=true]{border-color:var(--ds-primary);background:var(--ds-surface)}.ds-theme ds-table th{background:var(--ds-fill-hover)}`
  },
  heroui: {
    name:'HeroUI', reference:'https://heroui.com/docs/react/getting-started/theming',
    guidance:'以 surface 区分页面层级。卡片与输入框采用柔和阴影，按钮突出主次，常规字段保持较大的圆角。键盘聚焦时显示清晰的外圈。',
    values:{primary:'#0485f7',background:'#f7f7f8',text:'#18181b',muted:'#71717a',border:'#e4e4e7',success:'#17c964',warning:'#f7b750',danger:'#db3b3e',info:'#0485f7',controlHeight:36,radius:12,buttonRadius:24,cardRadius:16,popupRadius:16,optionRadius:8,optionGap:4,shadow:6},
    css:`.ds-theme ds-button>button{font-weight:500;box-shadow:none}.ds-theme ds-button:not([variant]):not([danger])>button{background:var(--ds-fill-hover);border-color:transparent}.ds-theme :is(ds-input>input,ds-textarea>textarea,ds-select>[data-select-trigger]){border-color:transparent;box-shadow:0 1px 4px color-mix(in srgb,var(--ds-text) 18%,transparent)}.ds-theme ds-card{border-color:transparent}.ds-theme :is(ds-input>input,ds-textarea>textarea,[data-select-trigger]):focus-visible{outline:2px solid var(--ds-primary);outline-offset:2px}`
  }
};

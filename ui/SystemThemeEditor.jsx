import React from 'react';
import {Icon} from './brand.jsx';
import {importThemeFont,themeFont,themeFontFace} from './theme-fonts.js';
import SystemRuleEditor from './SystemRuleEditor.jsx';
import {Button, ErrorBox} from './common.jsx';
import {desktopThemeFields, desktopFontOptions, normalizeDesktopTheme, desktopThemeTokens, desktopThemeCSS, desktopThemeContrast, desktopExampleHTML, desktopSystemFiles, DESKTOP_THEME_FORMAT} from '../desktop-theme.js';
import {DESKTOP_COMPONENT_VERSION} from '../desktop-components.js';
import {mobileThemeFields, normalizeMobileTheme, mobileThemeTokens, mobileThemeCSS, mobileThemeContrast, mobileExampleHTML, mobileSystemFiles, MOBILE_THEME_FORMAT} from '../mobile-theme.js';
import {MOBILE_COMPONENT_VERSION} from '../mobile-components.js';
import {systemFilePath} from '../system-directory.js';
import {inlineSystemResource, readSystemResource, readSystemResourceBytes, systemBytesBase64} from './system-resource.js';

const themes = {
  [DESKTOP_THEME_FORMAT]: {fields: desktopThemeFields, normalize: normalizeDesktopTheme, tokens:desktopThemeTokens, css: desktopThemeCSS, contrast: desktopThemeContrast, example: desktopExampleHTML, files: desktopSystemFiles, version: DESKTOP_COMPONENT_VERSION, versions: ['1.0.0', '1.1.0', '1.2.0', '1.2.1', DESKTOP_COMPONENT_VERSION], platform: 'web', label: 'PC'},
  [MOBILE_THEME_FORMAT]: {fields: mobileThemeFields, normalize: normalizeMobileTheme, tokens:mobileThemeTokens, css: mobileThemeCSS, contrast: mobileThemeContrast, example: mobileExampleHTML, files: mobileSystemFiles, version: MOBILE_COMPONENT_VERSION, versions: ['1.0.0', '1.1.0', '1.1.1', MOBILE_COMPONENT_VERSION], platform: 'mobile', label: '移动端'},
};

export default function SystemThemeEditor({draft, api, busy, runTask, onChange, initialView = 'components', onViewChange}) {
  const [values, setValues] = React.useState(null), [error, setError] = React.useState(null), [view, setView] = React.useState(initialView), [runtime, setRuntime] = React.useState(null), [componentVersion, setComponentVersion] = React.useState(null);
  const [format, setFormat] = React.useState(draft.platforms?.length === 1 && draft.platforms[0] === 'mobile' ? MOBILE_THEME_FORMAT : DESKTOP_THEME_FORMAT);
  const theme = themes[format], legacyFeedback = theme.platform === 'web' && componentVersion === '1.0.0';
  const frame = React.useRef(null), current = React.useRef(values); current.current = values;
  React.useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const file = draft.files.find(file => systemFilePath(file) === 'tokens.json');
        const resource = file.content !== undefined || file.bytesBase64 !== undefined ? inlineSystemResource(file) : await readSystemResource(api, {systemId: draft.id, version: draft.version, resourceId: file.id});
        const config = JSON.parse(resource.content ?? resource.text);
        const profile = themes[config.format];
        if (!profile || config.version !== 1 || !profile.versions.includes(config.componentVersion)) throw new Error('当前规范的主题格式暂不支持可视化编辑。');
        const script = draft.files.find(file => systemFilePath(file) === 'components.js');
        const loaded = script.content !== undefined || script.bytesBase64 !== undefined ? inlineSystemResource(script) : await readSystemResource(api, {systemId: draft.id, version: draft.version, resourceId: script.id});
        if (typeof (loaded.content ?? loaded.text) !== 'string') throw new Error('组件脚本缺少正文。');
        if (alive) {setFormat(config.format); setValues(profile.normalize(config.values)); setRuntime(loaded.content ?? loaded.text); setComponentVersion(config.componentVersion);}
      } catch (failure) {if (alive) setError(failure);}
    };
    load();
    return () => {alive = false;};
  }, [draft.id, draft.localId, draft.version, api]);
  const fonts=React.useMemo(()=>draft.files.map(themeFont).filter(Boolean),[draft.files]);
  const selectedFont=fonts.find(font=>font.value===values?.fontFamily);
  const fontFile=selectedFont?.file, picker=React.useRef(null), faceCSS=React.useRef(''), uploadTicket=React.useRef(0);
  const latest=React.useRef(null);
  latest.current={draft,values};
  React.useEffect(()=>()=>{uploadTicket.current++;},[draft.id,draft.localId,draft.version]);
  const updateFont=()=>frame.current?.contentWindow?.postMessage({type:'dsh:theme-font',css:faceCSS.current},'*');
  React.useEffect(()=>{
    let active=true;
    faceCSS.current='';updateFont();
    if(fontFile)(async()=>{
      const data=fontFile.bytesBase64??systemBytesBase64((await readSystemResourceBytes(api,{systemId:draft.id,version:draft.version,resourceId:fontFile.id})).bytes);
      if(active){faceCSS.current=themeFontFace(selectedFont,'data:font/'+selectedFont.extension+';base64,'+data);updateFont();}
    })().catch(e=>{if(active)setError(e);});
    return ()=>{active=false;};
  },[fontFile,api,draft.id,draft.version]);
  const updatePreview = () => {
    if (current.current) frame.current?.contentWindow?.postMessage({type: 'dsh:desktop-theme', css: theme.css(current.current), checks: theme.contrast(current.current)}, '*');
  };
  React.useEffect(updatePreview, [values, theme]);
  const html = React.useMemo(() => theme.example({inline: true, view, runtime: runtime || '', feedback: !legacyFeedback}).replace('</head>', '<style>.preview-page{max-width:none;padding:clamp(14px,2vw,32px)}.preview-page>.preview-lead{display:none}.preview-page>h1{margin-bottom:16px}</style></head>').replace('</body>', `<script>addEventListener('message', event => {if(event.source!==parent)return;if(event.data?.type==='dsh:theme-font'){let el=document.getElementById('live-font');if(!el){el=document.createElement('style');el.id='live-font';document.head.append(el)}el.textContent=event.data.css;return;}if(event.data?.type !== 'dsh:desktop-theme' || typeof event.data.css !== 'string')return;let style=document.getElementById('live-theme');if(!style){style=document.createElement('style');style.id='live-theme';document.head.append(style);}style.textContent=event.data.css;const css=getComputedStyle(document.body);document.querySelectorAll('[data-theme-value]').forEach(node=>{node.textContent=css.getPropertyValue(node.dataset.themeValue).trim();});if(Array.isArray(event.data.checks))event.data.checks.forEach((check,index)=>{if(!Number.isFinite(check.ratio))return;const row=document.querySelector('[data-contrast-index="'+index+'"]');if(row){row.dataset.pass=String(check.passes);row.querySelector('strong').textContent=check.ratio.toFixed(2)+':1 · '+(check.passes?'达标':'待调整');}});});</script></body>`), [view, runtime, theme, legacyFeedback]);
  const writeTheme=(next,files,font)=>{
    setValues(next);
    const generated=[
      {logicalPath:'theme.css',name:'theme.css',mimeType:'text/css',content:themeFontFace(font)+theme.css(next)},
      {logicalPath:'tokens.json',name:'tokens.json',mimeType:'application/json',content:JSON.stringify({
        format,version:1,componentVersion,values:next,derived:theme.tokens(next),
      },null,2)},
    ];
    onChange([...files.filter(file=>!generated.some(item=>item.logicalPath===systemFilePath(file))),...generated],theme.platform);
  };
  const uploadFont=async event=>{
    const input=event.currentTarget,file=input.files?.[0];input.value='';
    if(!file)return;
    const ticket = ++uploadTicket.current;
    setError(null);
    await runTask(async () => {
      const font = await importThemeFont(file);
      if (ticket !== uploadTicket.current) return;
      const {draft, values} = latest.current;
      const present = draft.files.some(item => systemFilePath(item) === font.path);
      writeTheme(theme.normalize({...values, fontFamily: font.value}), present ? draft.files : [...draft.files, font.file], font);
    });
  };
  const change = (key, value) => {
    const field = theme.fields.find(field => field.key === key);
    const next = theme.normalize({...values, [key]: field.type === 'color' ? value.toLowerCase() : value});
    if (field.type === 'color' ? next[key].toLowerCase() === values[key].toLowerCase() : next[key] === values[key]) return;
    writeTheme(next,draft.files,fonts.find(font=>font.value===next.fontFamily));
  };
  const commitNumber = (event, field) => {
    const control = event.currentTarget, value = control.valueAsNumber;
    if (!Number.isFinite(value)) {control.value = String(values[field.key]); return;}
    const next = theme.normalize({...values, [field.key]: value})[field.key];
    control.value = String(next);
    if (next !== values[field.key]) change(field.key, next);
  };
  const changeView = value => {setView(value); onViewChange?.(value);};
  const upgrade = () => {
    const generated = theme.files(values).map(file=>file.logicalPath==='theme.css'?{...file,content:themeFontFace(selectedFont)+file.content}:file).filter(file => theme.platform !== 'mobile' || ['components.js', 'components.json', 'tokens.json', 'theme.css'].includes(systemFilePath(file))), paths = new Set(generated.map(systemFilePath));
    onChange([...draft.files.filter(file => !paths.has(systemFilePath(file))), ...generated], theme.platform);
    setRuntime(generated.find(file => file.logicalPath === 'components.js').content); setComponentVersion(theme.version);
  };
  const groups = [...new Set(theme.fields.map(field => field.group))];
  return <div className="wb-theme-editor" aria-label={`${theme.label} 设计规范可视化编辑器`}>
    <aside className="wb-theme-controls" aria-label="主题参数">
      <header><strong>主题设置</strong></header>
      <ErrorBox error={error}/>{values && componentVersion !== theme.version && <div className="wb-theme-upgrade"><span>此规范使用组件基座 {componentVersion}</span><Button disabled={busy} onClick={upgrade} title={theme.platform === 'mobile' ? '更新组件脚本、清单和主题样式，保留主题参数、rule.md、示例及其他资源' : '更新组件脚本、主题样式、用法及示例，保留当前主题参数和其他资源'}>更新组件基座</Button></div>}
      {!values && !error && <p className="wb-muted">正在加载主题…</p>}
      {values && groups.map(group => <details key={group} open><summary>{group}</summary><div className="wb-theme-fields">{theme.fields.filter(field => field.group === group).map(field => <div key={field.key} className="wb-theme-field">
        <span>{field.label}</span>
        {field.type === 'color' ? <span className="wb-theme-color"><input key={values[field.key]} type="text" aria-label={`${field.label}值`} defaultValue={values[field.key].toUpperCase()} maxLength={7} disabled={busy} onBlur={event => {if (/^#[0-9a-f]{6}$/i.test(event.target.value)) change(field.key, event.target.value); else event.target.value = values[field.key].toUpperCase();}} onKeyDown={event => {if (event.key === 'Enter') {event.preventDefault(); event.currentTarget.blur();}}}/><input type="color" onInput={event => change(field.key, event.currentTarget.value)} aria-label={field.label} disabled={busy} value={values[field.key]} onChange={event => change(field.key, event.target.value)}/></span>
          : field.type === 'font' ? <span className="wb-theme-font"><select aria-label={field.label} value={values[field.key]} disabled={busy} onChange={event => change(field.key, event.target.value)}>{desktopFontOptions.map(([label, value]) => <option value={value} key={value}>{label}</option>)}{fonts.map(font=><option key={font.value} value={font.value}>{font.label}</option>)}{!selectedFont && !desktopFontOptions.some(([_label, value]) => value === values.fontFamily) && <option value={values.fontFamily}>{values.fontFamily}</option>}</select><button type="button" aria-label="上传字体" title="上传字体" disabled={busy} onClick={()=>picker.current?.click()}><Icon name="upload" size={14}/></button>
              <input hidden ref={picker} aria-label="选择字体文件" type="file" accept=".woff2,.woff,.ttf,.otf" onChange={uploadFont}/></span>
            : <span className="wb-theme-number"><input type="range" style={{'--filled':((values[field.key]-field.min)/(field.max-field.min)*100)+'%'}} aria-label={`${field.label}滑块`} disabled={busy} min={field.min} max={field.max} step={field.step || 1} value={values[field.key]} onChange={event => change(field.key, Number(event.target.value))}/><input key={`${field.key}:${values[field.key]}`} type="number" aria-label={field.label} disabled={busy} min={field.min} max={field.max} step={field.step || 1} defaultValue={values[field.key]} onBlur={event => commitNumber(event, field)} onKeyDown={event => {if (event.key === 'Enter') {event.preventDefault(); event.currentTarget.blur();}}}/><small>{field.unit}</small></span>}
      </div>)}</div></details>)}
    </aside>
    <main className="wb-theme-preview" data-platform={theme.platform} data-view={view}>
      <header><div role="group" aria-label="预览内容"><Button aria-pressed={view === 'foundations'} onClick={() => changeView('foundations')}>基础规范</Button><Button aria-pressed={view === 'components'} onClick={() => changeView('components')}>组件</Button><Button aria-pressed={view === 'page'} onClick={() => changeView('page')}>页面效果</Button><Button disabled={legacyFeedback} aria-pressed={view === 'feedback'} onClick={() => changeView('feedback')}>浮层与反馈</Button><Button aria-pressed={view === 'select'} disabled={componentVersion !== theme.version} onClick={() => changeView('select')}>选择器</Button><Button aria-pressed={view === 'rule'} onClick={() => changeView('rule')}>使用规则</Button></div></header>
      {view === 'rule' ? <SystemRuleEditor draft={draft} api={api} busy={busy} onChange={onChange}/> : runtime !== null && <iframe ref={frame} title={`${theme.label} 组件实时预览`} sandbox="allow-scripts" srcDoc={html} onLoad={()=>{updatePreview();updateFont();}}/>}
    </main>
  </div>;
}

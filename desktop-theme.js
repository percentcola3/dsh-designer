import {desktopPresets} from './desktop-presets.js';
import {DESKTOP_COMPONENT_VERSION, desktopComponentsScript, desktopOverlayCloseButton} from './desktop-components.js';
import {desktopPatternFiles} from './desktop-patterns.js';
import {generate} from '@ant-design/colors';

export const DESKTOP_SYSTEM_NAME = 'Ant Design · Web Components';
export const DESKTOP_THEME_FORMAT = 'dsh-desktop-theme';
export const desktopThemeFields = [
  {key: 'primary', label: '品牌色', type: 'color', group: '颜色', value: '#1677ff'},
  {key: 'background', label: '页面背景', type: 'color', group: '颜色', value: '#f5f5f5'},
  {key: 'primaryText', label: '主按钮文字', type: 'color', group: '颜色', value: '#ffffff'},
  {key: 'surface', label: '组件背景', type: 'color', group: '颜色', value: '#ffffff'},
  {key: 'text', label: '正文颜色', type: 'color', group: '颜色', value: '#141414'},
  {key: 'muted', label: '辅助文字', type: 'color', group: '颜色', value: '#737373'},
  {key: 'border', label: '边框颜色', type: 'color', group: '颜色', value: '#d9d9d9'},
  {key: 'success', label: '成功色', type: 'color', group: '颜色', value: '#52c41a'},
  {key: 'warning', label: '警告色', type: 'color', group: '颜色', value: '#faad14'},
  {key: 'danger', label: '错误色', type: 'color', group: '颜色', value: '#ff4d4f'},
  {key: 'info', label: '信息色', type: 'color', group: '颜色', value: '#1677ff'},
  {key: 'fontFamily', label: '字体', type: 'font', group: '文字', value: 'system-ui, -apple-system, "Segoe UI", sans-serif'},
  {key: 'fontSize', label: '基础字号', type: 'number', group: '文字', value: 14, min: 12, max: 20, unit: 'px'},
  {key: 'lineHeight', label: '行高', type: 'number', group: '文字', value: 1.57, min: 1.2, max: 2, step: 0.01},
  {key: 'controlHeight', label: '控件高度', type: 'number', group: '尺寸与形状', value: 32, min: 28, max: 48, unit: 'px'},
  {key: 'radius', label: '控件圆角', type: 'number', group: '尺寸与形状', value: 6, min: 0, max: 24, unit: 'px'},
  {key: 'cardRadius', label: '卡片圆角', type: 'number', group: '尺寸与形状', value: 8, min: 0, max: 24, unit: 'px'},
  {key: 'spacing', label: '基础间距', type: 'number', group: '尺寸与形状', value: 8, min: 4, max: 16, unit: 'px'},
  {key: 'buttonRadius', label: '按钮圆角', type: 'number', group: '组件', value: 6, min: 0, max: 24, unit: 'px'},
  {key: 'optionGap', label: '选项间隔', type: 'number', group: '组件', value: 2, min: 0, max: 8, unit: 'px'},
  {key: 'optionRadius', label: '选项圆角', type: 'number', group: '组件', value: 4, min: 0, max: 24, unit: 'px'},
  {key: 'popupRadius', label: '浮层圆角', type: 'number', group: '组件', value: 8, min: 0, max: 24, unit: 'px'},
  {key: 'popupShadow', label: '浮层阴影', type: 'number', group: '组件', value: 8, min: 0, max: 20, unit: '%'},
  {key: 'shadow', label: '卡片阴影', type: 'number', group: '尺寸与形状', value: 0, min: 0, max: 20, unit: '%'},
];
export const desktopFontOptions = [
  ['系统字体', 'system-ui, -apple-system, "Segoe UI", sans-serif'],
  ['苹方 / 微软雅黑', '"PingFang SC", "Microsoft YaHei", sans-serif'],
  ['思源黑体', '"Noto Sans SC", "Source Han Sans SC", sans-serif'],
  ['衬线字体', '"Noto Serif SC", "Songti SC", serif'],
  ['等宽字体', 'ui-monospace, "SFMono-Regular", Consolas, monospace'],
];
export function normalizeThemeFields(fields, input = {}) {
  return Object.fromEntries(fields.map(field => {
    const value = input[field.key] ?? field.value;
    if (field.type === 'color') return [field.key, /^#[0-9a-f]{6}$/i.test(value) ? value : field.value];
    if (field.type === 'font') return [field.key, typeof value === 'string' && value.length <= 300 && /^[\w\s,"'.\u0080-\uffff-]+$/.test(value) ? value : field.value];
    return [field.key, typeof value === 'number' && Number.isFinite(value) ? Math.max(field.min, Math.min(field.max, value)) : field.value];
  }));
}
export function normalizeDesktopTheme(input = {}) {const preset=Object.hasOwn(desktopPresets,input.preset)?desktopPresets[input.preset]:null;
  return {...normalizeThemeFields(desktopThemeFields,{...preset?.values,...input}),...(preset?{preset:input.preset}:{})};}
const cssName = key => key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z])([A-Z][a-z])/g, '$1-$2').toLowerCase();

const colorChannels = color => [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16));
export function blendColor(foreground, background, opacity) {
  const back = colorChannels(background);
  return '#' + colorChannels(foreground).map((channel, index) => Math.round(channel * opacity + back[index] * (1 - opacity)).toString(16).padStart(2, '0')).join('');
}

/** Resolve the same seed → semantic → component mappings for preview and delivery. */
export function desktopThemeTokens(input) {
  const values = normalizeDesktopTheme(input);
  const palettes = Object.fromEntries(['primary', 'success', 'warning', 'danger', 'info'].map(key => [key, generate(values[key])]));
  const semantic = {};
  for (const [key, colors] of Object.entries(palettes)) {
    semantic[key + 'Soft'] = colors[0];
    semantic[key + 'SoftHover'] = colors[1];
    semantic[key + 'Border'] = colors[2];
    semantic[key + 'Hover'] = colors[4];
    semantic[key + 'Active'] = colors[6];
  }
  Object.assign(semantic, {
    textSecondary: blendColor(values.text, values.surface, .68),
    textDisabled: blendColor(values.text, values.surface, .25),
    fillHover: blendColor(values.text, values.surface, .04),
    fillActive: blendColor(values.text, values.surface, .15),
    split: blendColor(values.text, values.surface, .06),
  });
  const scales = {
    fontSizeSM: `${Math.max(12, values.fontSize - 2)}px`,
    controlLineHeight: `${Math.round(values.fontSize * values.lineHeight)}px`,
    controlHeightSM: `${Math.max(24, values.controlHeight - 8)}px`,
    controlHeightLG: `${values.controlHeight + 8}px`,
    motionFast: '0.1s', motionMid: '0.2s', motionSlow: '0.3s',
  };
  for (const [index, size] of [38, 30, 24, 20, 16].entries()) {
    const fontSize = Math.round(size * values.fontSize / 14 / 2) * 2;
    scales[`fontSizeHeading${index + 1}`] = `${fontSize}px`;
    scales[`lineHeightHeading${index + 1}`] = `${fontSize + 8}px`;
  }
  for (const [key, multiplier] of Object.entries({spaceXXS: .5, spaceXS: 1, spaceSM: 1.5, space: 2, spaceMD: 2.5, spaceLG: 3, spaceXL: 4, spaceXXL: 6})) scales[key] = `${values.spacing * multiplier}px`;
  const components = {
    buttonPrimaryBg: 'var(--ds-primary)', buttonPrimaryText: 'var(--ds-primary-text)',
    buttonPrimaryHoverBg: 'var(--ds-primary-hover)', buttonPrimaryActiveBg: 'var(--ds-primary-active)',
    inputBg: 'var(--ds-surface)', inputBorder: 'var(--ds-border)', inputHoverBorder: 'var(--ds-primary-hover)', inputFocusBorder: 'var(--ds-primary)',
    optionHoverBg: 'var(--ds-fill-hover)', optionSelectedBg: 'var(--ds-primary-soft)', optionSelectedHoverBg: 'var(--ds-primary-soft-hover)',
    tableHeaderBg: 'var(--ds-background)', tableRowHoverBg: 'var(--ds-fill-hover)',
    focusRing: 'var(--ds-primary)',
  };
  return {algorithm: '@ant-design/colors/light', palettes, semantic, scales, components};
}

export function desktopThemeContrast(input) {
  const values = normalizeDesktopTheme(input), {semantic} = desktopThemeTokens(values);
  return themeContrastChecks([
    ['正文与组件背景', values.text, values.surface],
    ['正文与页面背景', values.text, values.background],
    ['辅助文字与组件背景', values.muted, values.surface],
    ['主按钮文字', values.primaryText, values.primary],
    ['主按钮悬停文字', values.primaryText, semantic.primaryHover],
    ['主按钮按下文字', values.primaryText, semantic.primaryActive],
  ]);
}

export function themeContrastChecks(pairs) {
  const luminance = color => colorChannels(color).map(channel => {
    const value = channel / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  }).reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
  return pairs.map(([label, foreground, background]) => {
    const a = luminance(foreground), b = luminance(background), ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    return {label, foreground, background, ratio, passes: ratio >= 4.5};
  });
}

export function desktopThemeCSS(input) {
  const values = normalizeDesktopTheme(input);
  const {palettes, semantic, scales, components} = desktopThemeTokens(values);
  const declarations = desktopThemeFields.map(field => `  --ds-${field.key === 'popupShadow' ? 'popup-shadow-strength' : cssName(field.key)}: ${values[field.key]}${field.unit === 'px' ? 'px' : field.unit === '%' ? '%' : ''};`).join('\n');
  const derived = {...Object.fromEntries(Object.entries(palettes).flatMap(([key, colors]) => colors.map((color, index) => [`${key}-${index + 1}`, color]))), ...semantic, ...scales, ...components};
  return `/* DSH Desktop theme · ${desktopPresets[values.preset]?.name||'Ant Design'} */
:root, .ds-theme {
${declarations}
${Object.entries(derived).map(([key, value]) => `  --ds-${cssName(key)}: ${value};`).join('\n')}
  --ds-popup-shadow: 0 6px 16px 0 rgb(0 0 0 / var(--ds-popup-shadow-strength)), 0 3px 6px -4px rgb(0 0 0 / calc(var(--ds-popup-shadow-strength)*1.5)), 0 9px 28px 8px rgb(0 0 0 / calc(var(--ds-popup-shadow-strength)*.625));
  --ds-card-shadow: 0 4px 18px rgb(0 0 0 / var(--ds-shadow));
}
.ds-theme { margin: 0; color: var(--ds-text); background: var(--ds-background); font: var(--ds-font-size)/var(--ds-line-height) var(--ds-font-family); }
.ds-theme *, .ds-theme *::before, .ds-theme *::after { box-sizing: border-box; }
.ds-theme [hidden] { display: none !important; }
.ds-theme button, .ds-theme input, .ds-theme select, .ds-theme textarea { font: inherit; }
.ds-theme :is(button,input,select,textarea,summary):focus-visible { outline: 2px solid var(--ds-focus-ring); outline-offset: 3px; }
ds-button, ds-checkbox, ds-switch, ds-tag, ds-dropdown { display: inline-block; vertical-align: middle; }
ds-input, ds-select, ds-textarea, ds-card, ds-tabs, ds-table, ds-alert { display: block; }
.ds-theme ds-button>button {
  display: inline-flex; align-items: center; justify-content: center; gap: calc(var(--ds-spacing)*.75);
  min-height: var(--ds-control-height); padding: 3px calc(var(--ds-spacing)*2); border: 1px solid var(--ds-border);
  border-radius: var(--ds-button-radius); background: var(--ds-surface); color: var(--ds-text); cursor: pointer;
  box-shadow: 0 2px 0 rgb(0 0 0 / 2%); transition: background .15s, border-color .15s, color .15s;
}
.ds-theme ds-button>button:hover:not(:disabled) { color: var(--ds-primary); border-color: var(--ds-primary); }
.ds-theme ds-button[variant="primary"]>button { background: var(--ds-button-primary-bg); color: var(--ds-button-primary-text); border-color: var(--ds-button-primary-bg); }
.ds-theme ds-button[variant="primary"]>button:hover:not(:disabled) { color:var(--ds-button-primary-text); background: var(--ds-button-primary-hover-bg); border-color: var(--ds-button-primary-hover-bg); }
.ds-theme ds-button[variant="primary"]>button:active:not(:disabled) { background: var(--ds-button-primary-active-bg); border-color:var(--ds-button-primary-active-bg); }
.ds-theme ds-button[variant="text"]>button { border-color: transparent; background: transparent; box-shadow: none; }
.ds-theme ds-button[danger]>button { color: var(--ds-danger); border-color: var(--ds-danger); }
.ds-theme ds-button[size="small"]>button { min-height: var(--ds-control-height-sm); padding: 1px var(--ds-spacing); font-size: var(--ds-font-size-sm); }
.ds-theme ds-button[size="large"]>button { min-height: var(--ds-control-height-lg); }
.ds-theme ds-button[loading]>button::before { content: ''; width: 12px; height: 12px; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: ds-spin .8s linear infinite; }
@keyframes ds-spin { to { transform: rotate(360deg); } }
.ds-theme :is(button,input,textarea,select):disabled { cursor: not-allowed; opacity: .48; }
.ds-theme :is(ds-input>input,ds-textarea>textarea,ds-select>select) { width: 100%; min-height: var(--ds-control-height); padding: 4px calc(var(--ds-spacing)*1.5); color: var(--ds-text); background: var(--ds-input-bg); border: 1px solid var(--ds-input-border); border-radius: var(--ds-radius); transition: border-color var(--ds-motion-mid), box-shadow var(--ds-motion-mid); }
.ds-theme :is(ds-input>input,ds-textarea>textarea,ds-select>select):hover { border-color: var(--ds-input-hover-border); }
.ds-theme :is(ds-input>input,ds-textarea>textarea,ds-select>select):focus { border-color: var(--ds-input-focus-border); box-shadow: 0 0 0 2px var(--ds-primary-soft); }
.ds-theme :is(ds-input,ds-textarea,ds-select)[invalid]>* { border-color: var(--ds-danger); }
.ds-theme ds-textarea>textarea { min-height: 84px; resize: vertical; }
.ds-theme ds-checkbox input { width: 16px; height: 16px; accent-color: var(--ds-primary); vertical-align: middle; margin: 0 var(--ds-spacing) 2px 0; }
.ds-theme ds-switch input { appearance: none; width: 36px; height: 20px; margin: 0; border-radius: 20px; background: var(--ds-border); vertical-align: middle; cursor: pointer; position: relative; transition: background .15s; }
.ds-theme ds-switch input::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px #0002; transition: transform .15s; }
.ds-theme ds-switch input:checked { background: var(--ds-primary); }
.ds-theme ds-switch input:checked::after { transform: translateX(16px); }
.ds-theme ds-card { background: var(--ds-surface); border: 1px solid var(--ds-border); border-radius: var(--ds-card-radius); box-shadow: var(--ds-card-shadow); overflow: hidden; }
.ds-theme ds-card>header { padding: calc(var(--ds-spacing)*2) calc(var(--ds-spacing)*3); border-bottom: 1px solid var(--ds-border); font-weight: 600; }
.ds-theme ds-card>[data-card-body] { padding: calc(var(--ds-spacing)*3); }
.ds-theme ds-tag { padding: 0 var(--ds-spacing); font-size: max(12px, calc(var(--ds-font-size) - 2px)); border: 1px solid var(--ds-border); border-radius: calc(var(--ds-radius)*.65); background: var(--ds-background); }
.ds-theme ds-tag[tone="primary"] { color: var(--ds-primary-active); background: var(--ds-primary-soft); border-color: var(--ds-primary-border); }
.ds-theme ds-tag[tone="success"] { color: var(--ds-success-active); background: var(--ds-success-soft); border-color: var(--ds-success-border); }
.ds-theme ds-tag[tone="warning"] { color: var(--ds-warning-active); background: var(--ds-warning-soft); border-color: var(--ds-warning-border); }
.ds-theme ds-tag[tone="danger"] { color: var(--ds-danger-active); background:var(--ds-danger-soft);border-color:var(--ds-danger-border); }
.ds-theme ds-tabs [data-tab-list] { display: flex; gap: calc(var(--ds-spacing)*3); border-bottom: 1px solid var(--ds-border); }
.ds-theme ds-tabs [data-tab] { border: 0; border-bottom: 2px solid transparent; color: var(--ds-muted); background: transparent; padding: calc(var(--ds-spacing)*1.5) 0; cursor: pointer; }
.ds-theme ds-tabs [aria-selected="true"] { border-bottom-color: var(--ds-primary); color: var(--ds-primary); }
.ds-theme ds-tabs [data-panel] { padding-top: calc(var(--ds-spacing)*2); }
.ds-theme ds-table { overflow-x: auto; }
.ds-theme ds-table table { width: 100%; border-collapse: collapse; text-align: left; }
.ds-theme ds-table :is(th,td) { padding: calc(var(--ds-spacing)*1.5) calc(var(--ds-spacing)*2); border-bottom: 1px solid var(--ds-border); white-space: nowrap; }
.ds-theme ds-table th { font-weight: 600; background: var(--ds-table-header-bg); }
.ds-theme ds-table :is(th,td) { font-variant-numeric:tabular-nums; }
.ds-theme ds-table th button { border: 0; color: inherit; background: transparent; cursor: pointer; padding: 0; }
.ds-theme ds-table tbody tr:hover { background: var(--ds-table-row-hover-bg); }
.ds-theme ds-alert { padding: var(--ds-spacing) calc(var(--ds-spacing)*2); border: 1px solid var(--ds-info-border); background: var(--ds-info-soft); border-radius: var(--ds-radius); }
.ds-theme ds-dropdown { position: relative; }
.ds-theme ds-dropdown summary { cursor: pointer; list-style: none; border: 1px solid var(--ds-border); border-radius: var(--ds-radius); padding: 4px calc(var(--ds-spacing)*1.5); min-height: var(--ds-control-height); background: var(--ds-surface); }
.ds-theme ds-dropdown summary::after { content: '⌄'; margin-left: var(--ds-spacing); }
.ds-theme ds-dropdown [data-menu] { position: absolute; z-index: 10; top: calc(100% + 4px); right: 0; min-width: 140px; padding: 4px; border: 1px solid var(--ds-border); border-radius: var(--ds-radius); background: var(--ds-surface); box-shadow: var(--ds-card-shadow); }
.ds-theme ds-dropdown [data-menu]>button { display: block; width: 100%; border: 0; padding: 6px 12px; border-radius: calc(var(--ds-radius)*.5); text-align: left; color: var(--ds-text); background: transparent; cursor: pointer; }
.ds-theme ds-dropdown [data-menu]>button:hover { background: var(--ds-primary-soft); color: var(--ds-primary); }
/* PC overlays follow Ant Design's control and floating-layer dimensions. */
.ds-theme ds-card { box-shadow: var(--ds-card-shadow); }
.ds-theme ds-button>button:disabled { opacity: 1; color: var(--ds-text-disabled); background: var(--ds-fill-hover); border-color: var(--ds-border); box-shadow: none; }
.ds-theme ds-button[loading]>button:disabled { opacity: .65; color: var(--ds-text); background: var(--ds-surface); }
.ds-theme ds-button[loading][variant="primary"]>button:disabled { color: var(--ds-button-primary-text); background: var(--ds-button-primary-bg); border-color: var(--ds-button-primary-bg); }
.ds-theme :is(ds-input>input, ds-textarea>textarea, ds-select>select):disabled { opacity: 1; color: var(--ds-text-disabled); background: var(--ds-fill-hover); }
.ds-theme :is(ds-input>input, ds-textarea>textarea, [data-select-trigger]):focus-visible { outline: none; border-color: var(--ds-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--ds-primary) 10%, transparent); }
.ds-theme input::placeholder, .ds-theme textarea::placeholder { color: var(--ds-text-disabled); }
.ds-theme ds-select>select[hidden] { display: none!important; }
.ds-theme ds-select>[data-select-trigger] { display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;height:var(--ds-control-height);padding:0 11px;font:inherit;text-align:left;color:var(--ds-text);background:var(--ds-surface);border:1px solid var(--ds-border);border-radius:var(--ds-radius);cursor:pointer;transition:border-color .2s,box-shadow .2s; }
.ds-theme ds-select>[data-select-trigger]::after { content:'';width:6px;height:6px;border-right:1.5px solid var(--ds-text-disabled);border-bottom:1.5px solid var(--ds-text-disabled);transform:rotate(45deg) translateY(-2px);flex:none;margin-right:2px; }
.ds-theme ds-select>[data-select-trigger]:hover:not(:disabled), .ds-theme ds-select>[data-select-trigger][aria-expanded=true] { border-color:var(--ds-primary); }
.ds-theme ds-select[invalid]>[data-select-trigger] { border-color:var(--ds-danger); }
.ds-theme :is(ds-input,ds-textarea,ds-select)[invalid]>:focus-visible { border-color:var(--ds-danger);box-shadow:0 0 0 2px color-mix(in srgb,var(--ds-danger) 10%,transparent); }
.ds-theme ds-select>[data-select-trigger]:disabled { opacity:1;color:var(--ds-muted);background:var(--ds-fill-hover);cursor:not-allowed; }
.ds-theme [data-select-options] { box-sizing:border-box;padding:4px;overflow-y:auto;border:0;border-radius:var(--ds-popup-radius);background:var(--ds-surface);color:var(--ds-text);box-shadow:var(--ds-popup-shadow);font:var(--ds-font-size)/var(--ds-line-height) var(--ds-font-family);z-index:1100; }
.ds-theme [data-select-options] [role=option] { display:flex;align-items:center;justify-content:space-between;min-height:32px;padding:5px 12px;border-radius:4px;cursor:pointer; }
.ds-theme [data-select-options] [role=option]:hover, .ds-theme [data-select-options] [role=option][data-active] { background:var(--ds-option-hover-bg); }
.ds-theme [data-select-options] [aria-selected=true] { background:var(--ds-option-selected-bg);font-weight:600; }
.ds-theme [data-select-options] [role=option][aria-selected=true]:not([aria-disabled=true]):is(:hover,[data-active]) { background:var(--ds-option-selected-hover-bg); }
.ds-theme [data-select-options] [aria-selected=true]::after { content:'✓';color:var(--ds-primary);font-size:14px;margin-left:16px; }
.ds-theme [data-select-options] [aria-disabled=true] { color:var(--ds-text-disabled);cursor:not-allowed;font-weight:400; }
.ds-theme ds-checkbox input, .ds-theme ds-radio input { appearance:none;width:16px;height:16px;border:1px solid var(--ds-border);border-radius:4px;background:var(--ds-surface);cursor:pointer;position:relative;vertical-align:middle;margin:0 8px 2px 0; }
.ds-theme ds-checkbox input:checked { background:var(--ds-primary);border-color:var(--ds-primary); }
.ds-theme ds-checkbox input:checked::after { content:'';position:absolute;left:4px;top:1px;width:5px;height:9px;border:2px solid white;border-left:0;border-top:0;transform:rotate(45deg); }
.ds-theme ds-radio { display:inline-block; }
.ds-theme ds-radio input { border-radius:50%; }
.ds-theme ds-radio input:checked { border-color:var(--ds-primary);background:var(--ds-primary); }
.ds-theme ds-radio input:checked::after { content:'';position:absolute;inset:4px;border-radius:50%;background:#fff; }
.ds-theme ds-switch input { width:44px;height:22px; }
.ds-theme ds-switch input::after { width:18px;height:18px; }
.ds-theme ds-switch input:checked::after { transform:translateX(22px); }
.ds-theme :is(ds-dialog,ds-drawer)>dialog { border:0;width:520px;max-height:calc(100dvh - 64px);padding:20px 24px;border-radius:var(--ds-popup-radius);box-shadow:var(--ds-popup-shadow);overflow:auto; }
.ds-theme ds-dialog>dialog { margin:0 auto;top:100px;max-width:calc(100vw - 48px);color:var(--ds-text);background:var(--ds-surface); }
.ds-theme :is(ds-dialog,ds-drawer)>dialog::backdrop { background:rgb(0 0 0 / 45%); }
.ds-theme :is(ds-dialog,ds-drawer)>dialog>header { display:flex;align-items:center;justify-content:space-between;gap:16px;padding:0 0 8px;font-size:16px;font-weight:600;line-height:24px; }
.ds-theme :is(ds-dialog,ds-drawer)>dialog>[data-dialog-body] { padding:8px 0 16px; }
.ds-theme :is(ds-dialog,ds-drawer)>dialog>footer { display:flex;justify-content:flex-end;gap:8px;padding:12px 0 0;border:0; }
.ds-theme :is([data-overlay-close], :where(ds-dialog,ds-drawer)>dialog>header>button[data-ds-close]) { display:grid;place-items:center;width:24px;height:24px;padding:0;border:0;border-radius:4px;color:var(--ds-muted);background:transparent;cursor:pointer;font-size:22px;font-weight:400; }
.ds-theme :is([data-overlay-close], :where(ds-dialog,ds-drawer)>dialog>header>button[data-ds-close]):hover { background:var(--ds-background);color:var(--ds-text); }
.ds-theme :is([data-overlay-close], :where(ds-dialog,ds-drawer)>dialog>header>button[data-ds-close]):focus-visible { outline:2px solid var(--ds-primary);outline-offset:2px; }
.ds-theme ds-drawer>dialog { position:fixed;inset:0 0 0 auto;margin:0;width:378px;height:100dvh;max-height:100dvh;max-width:calc(100vw - 32px);border-radius:0;padding:0; }
.ds-theme ds-drawer>dialog:modal { display:flex;flex-direction:column;overflow:hidden; }
.ds-theme ds-drawer>dialog>header { padding:16px 24px;border-bottom:1px solid var(--ds-border); }
.ds-theme ds-drawer>dialog>[data-dialog-body] { padding:24px;flex:1;min-height:0;overflow:auto; }
.ds-theme ds-drawer>dialog>footer { flex:none;padding:12px 24px;border-top:1px solid var(--ds-border); }
.ds-theme ds-drawer[placement=left]>dialog { inset:0 auto 0 0; }
.ds-theme :is(ds-toast,ds-notification):not([open]) { display:none; }
.ds-theme :is(ds-toast,ds-notification) { position:fixed;inset:auto;top:var(--ds-feedback-top,24px);margin:0;padding:0;border:0;background:transparent;color:var(--ds-text);font:var(--ds-font-size)/var(--ds-line-height) var(--ds-font-family);overflow:visible;z-index:1200; }
.ds-theme ds-toast { left:50%;transform:translateX(-50%);max-width:calc(100vw - 48px); }
.ds-theme ds-toast [data-feedback-body] { display:flex;align-items:center;gap:8px;padding:9px 12px;border-radius:var(--ds-popup-radius);background:var(--ds-surface);box-shadow:var(--ds-popup-shadow); }
.ds-theme ds-toast [data-feedback-body]::before, .ds-theme ds-notification [data-feedback-body]::before { content:'i';display:inline-grid;place-items:center;flex:none;width:16px;height:16px;border-radius:50%;background:var(--ds-info);color:white;font-size:12px;font-weight:600; }
.ds-theme :is(ds-toast,ds-notification)[tone=success] [data-feedback-body]::before { content:'✓';background:var(--ds-success); }
.ds-theme :is(ds-toast,ds-notification)[tone=warning] [data-feedback-body]::before { content:'!';background:var(--ds-warning); }
.ds-theme :is(ds-toast,ds-notification)[tone=error] [data-feedback-body]::before { content:'×';background:var(--ds-danger); }
.ds-theme ds-notification { right:24px;width:384px;max-width:calc(100vw - 48px);padding:20px 24px;border-radius:var(--ds-popup-radius);background:var(--ds-surface);box-shadow:var(--ds-popup-shadow); }
.ds-theme ds-notification [data-feedback-body] { display:grid;grid-template-columns:24px 1fr;column-gap:12px; }
.ds-theme ds-notification [data-feedback-body]::before { grid-row:1/3;width:24px;height:24px;font-size:16px; }
.ds-theme ds-notification strong { padding-right:16px;font-size:16px;font-weight:600;line-height:24px; }
.ds-theme ds-notification p { margin:8px 0 0;grid-column:2;color:var(--ds-text); }
.ds-theme [data-feedback-close] { position:absolute;top:16px;right:16px;display:grid;place-items:center;width:24px;height:24px;border:0;border-radius:4px;color:var(--ds-muted);background:transparent;font-size:22px;cursor:pointer; }
.ds-theme [data-feedback-close]:hover { background:var(--ds-background); }
.ds-theme :is(ds-tooltip,ds-popconfirm) { display:inline-block; }
.ds-theme [data-floating-content] { box-sizing:border-box;margin:0;inset:auto;max-width:320px;overflow:visible;border:0;border-radius:var(--ds-radius);padding:12px;background:var(--ds-surface);color:var(--ds-text);box-shadow:var(--ds-popup-shadow);font:var(--ds-font-size)/var(--ds-line-height) var(--ds-font-family);z-index:1100; }
.ds-theme ds-tooltip [data-floating-content] { width:max-content;max-width:250px;padding:6px 8px;background:rgba(0,0,0,.85);color:#fff;font-size:14px; }
.ds-theme ds-popconfirm [data-floating-content] { min-width:240px; }
.ds-theme ds-popconfirm [data-floating-content]>strong { font-weight:600; }
.ds-theme ds-popconfirm [data-floating-content]>p { margin:4px 0 12px;color:var(--ds-muted); }
.ds-theme ds-popconfirm [data-floating-content]>footer { display:flex;justify-content:flex-end;gap:8px; }
.ds-theme ds-alert[tone=warning] { border-color:var(--ds-warning-border);background:var(--ds-warning-soft); }
.ds-theme ds-alert[tone=error] { border-color:var(--ds-danger-border);background:var(--ds-danger-soft); }
.ds-theme ds-alert[tone=success] { border-color:var(--ds-success-border);background:var(--ds-success-soft); }
.ds-theme ds-progress { display:block; }
.ds-theme ds-progress progress { appearance:none;width:100%;height:8px;border:0;border-radius:100px;overflow:hidden;background:var(--ds-background); }
.ds-theme ds-progress progress::-webkit-progress-bar { background:var(--ds-background); }
.ds-theme ds-progress progress::-webkit-progress-value { background:var(--ds-primary);border-radius:100px; }
.ds-theme ds-progress progress::-moz-progress-bar { background:var(--ds-primary);border-radius:100px; }
.ds-theme ds-empty { display:flex;flex-direction:column;align-items:center;gap:8px;padding:24px;color:var(--ds-muted);font-size:14px; }
.ds-theme ds-empty::before { content:'';width:54px;height:32px;border:1px solid var(--ds-border);border-radius:6px;background:linear-gradient(var(--ds-surface),var(--ds-background));box-shadow:0 6px 0 -3px var(--ds-background); }
.ds-theme ds-skeleton { display:flex;flex-direction:column;gap:12px; }
.ds-theme ds-skeleton>span { display:block;height:16px;border-radius:4px;background:linear-gradient(90deg,var(--ds-background),color-mix(in srgb,var(--ds-text) 8%,var(--ds-surface)),var(--ds-background));background-size:200% 100%;animation:ds-skeleton-pulse 1.4s ease infinite; }
.ds-theme ds-skeleton>span:first-child { width:38%;height:20px;margin-bottom:8px; }
.ds-theme ds-skeleton>span:last-child { width:64%; }
@keyframes ds-skeleton-pulse { to { background-position:-200% 0; } }

/* Select controls and menu rows use component typography, independent of page line height. */
.ds-theme ds-select>[data-select-trigger] { position:relative;display:flex;align-items:center;flex-wrap:nowrap;gap:4px;box-sizing:border-box;min-height:var(--ds-control-height);height:auto;padding:0 11px;line-height:22px; }
.ds-theme ds-select>[data-select-trigger]::after { content:none; }
.ds-theme [data-select-values] { min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.ds-theme [data-select-trigger][data-empty]:not([data-searchable])::before { content:attr(data-placeholder);color:var(--ds-text-disabled);flex:1; }
.ds-theme [data-select-trigger] [data-select-search] { box-sizing:border-box;min-width:20px;width:20px;flex:1;height:calc(var(--ds-control-height) - 2px);padding:0;margin:0;border:0;border-radius:0;outline:0;box-shadow:none;background:transparent;color:var(--ds-text);font:inherit;line-height:22px; }
.ds-theme [data-select-trigger][data-searchable]:not([data-multiple]) [data-select-values] { position:absolute;left:11px;right:30px;pointer-events:none; }
.ds-theme [data-select-trigger][data-searchable]:focus-within [data-select-values] { opacity:.45; }
.ds-theme [data-select-trigger]:focus-within { border-color:var(--ds-primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--ds-primary) 10%,transparent); }
.ds-theme [data-select-trigger][aria-disabled=true] { background:var(--ds-fill-hover);color:var(--ds-text-disabled);cursor:not-allowed; }
.ds-theme [data-select-trigger][aria-disabled=true]:hover { border-color:var(--ds-border); }
.ds-theme [data-select-trigger][data-multiple] { padding:2px 4px;gap:4px;flex-wrap:wrap; }
.ds-theme [data-select-trigger][data-multiple] [data-select-values] { display:contents; }
.ds-theme [data-select-trigger][data-multiple] [data-select-search] { min-width:36px;flex:1;max-width:100%;height:calc(var(--ds-control-height) - 8px); }
.ds-theme [data-select-tag] { display:inline-flex;align-items:center;gap:4px;max-width:calc(100% - 24px);min-height:calc(var(--ds-control-height) - 8px);padding:0 4px 0 8px;line-height:22px;border:1px solid var(--ds-split);border-radius:4px;background:var(--ds-fill-hover); }
.ds-theme [data-select-tag]>span { overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.ds-theme [data-select-tag]>button { display:grid;place-items:center;flex:none;width:14px;height:20px;padding:0;border:0;background:transparent;font:inherit;font-size:14px;color:var(--ds-muted);cursor:pointer; }
.ds-theme [data-select-tag]>button:hover { color:var(--ds-text); }
.ds-theme [data-select-arrow] { display:block;flex:none;width:6px;height:6px;margin:0 2px 3px 8px;border-right:1.5px solid var(--ds-text-disabled);border-bottom:1.5px solid var(--ds-text-disabled);transform:rotate(45deg); }
.ds-theme [data-select-clear] { display:grid;place-items:center;flex:none;width:14px;height:14px;margin-left:auto;padding:0;border:0;border-radius:50%;background:var(--ds-text-disabled);color:var(--ds-surface);font-size:12px;line-height:14px;cursor:pointer; }
.ds-theme [data-select-clear]:hover { background:var(--ds-muted); }
.ds-theme ds-select[loading] [data-select-arrow] { width:12px;height:12px;transform:none;border:2px solid var(--ds-primary);border-right-color:transparent;border-radius:50%;animation:ds-spin .8s linear infinite; }
.ds-theme [data-select-options] { display:block;padding:4px;line-height:22px;scrollbar-width:thin; }
.ds-theme [data-select-options] [role=group] { display:block;margin:0;padding:0; }
.ds-theme [data-select-group] { box-sizing:border-box;min-height:32px;padding:5px 12px;color:var(--ds-muted);font-size:12px;line-height:22px; }
.ds-theme [data-select-options] [role=option] { box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:32px;margin:0;padding:5px 12px;border:0;border-radius:var(--ds-option-radius);font-size:var(--ds-font-size);line-height:var(--ds-control-line-height); }
.ds-theme [data-select-options] [role=option]+[role=option] { margin-top:var(--ds-option-gap); }
.ds-theme [data-select-options] [aria-selected=true]::after { content:none; }
.ds-theme [data-select-options][data-multiple] [aria-selected=true]::after { content:'✓';flex:none;align-self:center;color:var(--ds-primary);font-size:14px;line-height:22px;margin:0; }
.ds-theme [data-option-text] { min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.ds-theme [data-option-text]>small { display:block;overflow:hidden;text-overflow:ellipsis;font-size:12px;color:var(--ds-muted);line-height:20px; }
.ds-theme [data-select-options] [role=option][aria-disabled=true]:hover { background:transparent; }
.ds-theme [data-select-empty] { padding:16px 12px;text-align:center;color:var(--ds-muted);font-size:14px;line-height:22px; }
.ds-theme ds-select[size=small]>[data-select-trigger] { min-height:var(--ds-control-height-sm);font-size:var(--ds-font-size-sm); }
.ds-theme ds-select[size=small] [data-select-search] { height:22px; }
.ds-theme ds-select[size=large]>[data-select-trigger] { min-height:var(--ds-control-height-lg);font-size:var(--ds-font-size-heading5); }
.ds-theme ds-select[size=large] [data-select-search] { height:38px; }
.ds-theme ds-select[invalid]>[data-select-trigger]:focus-within { border-color:var(--ds-danger);box-shadow:0 0 0 2px color-mix(in srgb,var(--ds-danger) 10%,transparent); }
.ds-theme ds-dropdown [data-menu] { display:flex;flex-direction:column;gap:var(--ds-option-gap);padding:4px;border:0;border-radius:var(--ds-popup-radius);box-shadow:var(--ds-popup-shadow); }
.ds-theme ds-dropdown [data-menu]>button { box-sizing:border-box;min-height:32px;margin:0;padding:5px 12px;border-radius:var(--ds-option-radius);line-height:var(--ds-control-line-height);font-size:var(--ds-font-size); }
.ds-theme ds-dropdown [data-menu]>button:hover:not(:disabled) { background:var(--ds-option-hover-bg);color:var(--ds-text); }

@media (prefers-reduced-motion: reduce) { .ds-theme * { animation-duration: 0s !important; transition: none !important; } }
${desktopPresets[values.preset]?.css||''}
`;
}

export const desktopComponentManifest = {
  name: 'DSH Desktop Components', version: DESKTOP_COMPONENT_VERSION, platform: 'web', dom: 'light',
  components: [
    {tag: 'ds-button', native: 'button', attributes: ['variant=default|primary|text', 'size=small|default|large', 'disabled', 'loading', 'danger', 'type=button|submit|reset'], events: ['click'], example: '<ds-button variant="primary"><button type="button">保存</button></ds-button>'},
    {tag: 'ds-input', native: 'input', picker: 'Use ds-input around a native date, time, month, week, datetime-local or color input. The picker opens within the page. Keep the native input for min, max, step, values and form events.', attributes: ['value', 'type', 'min', 'max', 'step', 'name', 'placeholder', 'disabled', 'readonly', 'required', 'invalid'], events: ['ds-input', 'ds-change'], example: '<label>名称<ds-input name="name"><input></ds-input></label>'},
    {tag: 'ds-textarea', native: 'textarea', attributes: ['value', 'name', 'placeholder', 'disabled', 'readonly', 'required', 'invalid'], events: ['ds-input', 'ds-change']},
    {tag: 'ds-select', native: 'select', attributes: ['value', 'name', 'disabled', 'required', 'invalid', 'searchable', 'clearable', 'multiple', 'loading', 'size=small|default|large', 'empty-text'], methods: ['values (array)', 'focus()', 'checkValidity()'], events: ['ds-change (detail.values for multiple)', 'ds-search', 'ds-clear', 'ds-open-change'], example: '<ds-select name="status"><select><option value="active">启用</option></select></ds-select>'},
    {tag: 'ds-checkbox', native: 'input[type=checkbox]', attributes: ['checked', 'disabled', 'name', 'value'], events: ['ds-change']},
    {tag: 'ds-switch', native: 'input[type=checkbox][role=switch]', attributes: ['checked', 'disabled', 'name', 'value', 'aria-label'], events: ['ds-change']},
    {tag: 'ds-card', structure: 'header + [data-card-body]'},
    {tag: 'ds-tag', attributes: ['tone=primary|success|warning|danger']},
    {tag: 'ds-alert', attributes: ['tone=success|error'], accessibility: 'Use role=status for feedback or role=alert for urgent errors'},
    {tag: 'ds-tabs', attributes: ['value'], structure: '[data-tab-list] > button[data-tab], [data-panel]', events: ['ds-change']},
    {tag: 'ds-table', structure: 'Native table with optional button[data-sort] in th', events: ['ds-sort']},
    {tag: 'ds-dropdown', structure: 'details > summary + [data-menu] > button', keyboard: 'Native details keyboard access, Escape closes'},
    {tag: 'ds-dialog', attributes: ['open'], methods: ['showModal()', 'close(value)'], structure: 'dialog > header + [data-dialog-body] + footer', events: ['ds-close', 'ds-cancel'], trigger: 'button[data-ds-open=dialog-id], button[data-ds-close]'},
    {tag: 'ds-radio', native: 'input[type=radio]', attributes: ['checked', 'disabled', 'name', 'value'], events: ['ds-change']},
    {tag: 'ds-drawer', attributes: ['open', 'placement=left|right'], methods: ['showModal()', 'close(value)'], structure: 'dialog > header + [data-dialog-body] + footer', events: ['ds-close', 'ds-cancel']},
    {tag: 'ds-toast', attributes: ['open', 'tone=success|warning|error|info', 'duration (ms, 0 keeps open)'], methods: ['show(message?, {tone?, duration?})', 'close()'], events: ['ds-close']},
    {tag: 'ds-notification', attributes: ['open', 'tone', 'duration'], methods: ['show(message?, {tone?, duration?})', 'close()'], structure: 'strong + p', events: ['ds-close']},
    {tag: 'ds-tooltip', attributes: ['open'], structure: 'button[data-trigger] + [data-floating-content]', keyboard: 'Focus opens, Escape closes'},
    {tag: 'ds-popconfirm', attributes: ['open'], structure: 'button[data-trigger] + [data-floating-content] with [data-confirm]/[data-cancel]', events: ['ds-confirm (cancelable)']},
    {tag: 'ds-progress', attributes: ['value', 'max', 'aria-label'], native: 'progress'},
    {tag: 'ds-empty', structure: 'Empty state message and optional action'},
    {tag: 'ds-skeleton', structure: 'span placeholders, aria-busy=true'},
  ],
};

export function desktopSystemRules() {
  return `# PC 设计规范使用指南

## 默认实施路径

以 DSH Desktop Components ${DESKTOP_COMPONENT_VERSION} 和当前绑定 tokens.json 为准。直接编写页面 HTML。页面 body 添加 ds-theme，通过 designer_commit_html 保存新页面时会自动接入主题与组件脚本。按需读取所用组件的公开用法，使用 designer_commit_html 保存。需要复用已有范式时，可通过 system.patterns 查看。

## 任务到组件的映射

- 操作按钮选 ds-button。主要操作 variant="primary"，行内轻操作 variant="text"，破坏性操作 danger。
- 文本与日期选 ds-input，长文本选 ds-textarea。选项选 ds-select，搜索多时开启 searchable，允许清空时加 clearable。
- 数据列表选 ds-table 内的原生 table。分页使用原生 button，维护页码与禁用状态。
- 详情采用 ds-drawer。需要确认后继续的任务选 ds-dialog。两者包含原生 dialog 与 header、[data-dialog-body]、footer。
- 状态文字选 ds-tag，字段组错误选 ds-alert，短暂结果选 ds-toast，需要持续关注的信息选 ds-notification。
- 加载选 ds-skeleton，空结果选 ds-empty，提供合适的恢复入口。

常用结构：<ds-button variant="primary"><button type="button">操作</button></ds-button>、<ds-input><input aria-label="查询"></ds-input>、<ds-select><select><option>全部</option></select></ds-select>、<ds-table><table>…</table></ds-table>、<ds-tag tone="success">正常</ds-tag>。这些组件自带主题样式，页面 CSS 仅补布局。使用原生 input/change/click 处理业务。

其他需要确认用法的组件可按标签一并查询 system.usage，传 brief=true 即可取得公开属性、结构与交互方法。

## 统一的业务页面骨架

页面信息架构以任务要求为准。管理页以主要任务为中心。简短需求按业务目标补全必要操作，使用有代表性的数据，确保管理操作可执行并提供反馈。需求中提到的统计、表单、详情、批量操作或分页按实际范围交付。工作台、详情、流程和其他任务按实际区域与交互组织布局。1440px 下外侧留白通常32px，区块间距24px，卡片内边距24px，相关字段间距16px，标签与控件间距8px。统计区可采用 repeat(4,minmax(0,1fr))，页面主体 min-width:0。表格容纳窄窗口时提供局部横向滚动。

正文14px、行高约22px，辅助说明12px，页面标题24px，区块标题16px。全页选择3–5种字阶，正文400，强调500–600，数字使用 tabular-nums。沿用绑定字体。常规控件32px，小控件24px，大控件40px。同一工具栏保持统一高度。

## Token 与视觉决策

直接在页面布局中引用 theme.css 的语义变量即可。需要精确数值时查 tokens.json。品牌色 --ds-primary，背景 --ds-background，表面 --ds-surface，正文 --ds-text，次要文字 --ds-text-secondary，辅助文字 --ds-muted，边框 --ds-border，分割线 --ds-split。状态使用 --ds-success/--ds-warning/--ds-danger/--ds-info 并配文字。普通悬停选 --ds-fill-hover，选中选 --ds-primary-soft。

间距沿用4/8/12/16/20/24/32/48阶梯及 --ds-space-*。圆角、阴影和按钮状态沿用组件默认映射。布局可在页面CSS中补充。对比度按实际背景检查，普通文字4.5:1，大文字3:1，重要边界及焦点3:1。具体的色阶生成、字阶、布局、阴影和动效原理见 design-principles.md，主题调整或特殊布局任务按需读取对应章节。

## 表单与浮层的确定用法

组件采用 Light DOM。写全原生子元素，标签关联原生输入框的HTML id。通过宿主 querySelector('input')、querySelector('select') 或 querySelector('textarea') 读写 .value/.checked，或使用原生input/change/submit事件。给被脚本引用的HTML元素设置匹配的id。

浮层宿主的 showModal()/close() 控制打开与关闭。关闭按钮位于标题右侧，表单取消与提交位于底部，详情返回保留来源上下文。Toast通过show(message,{tone,duration})显示。组件结构、合法属性和示例以 system.usage 返回为准。

## 状态与完成检查

用页面控件打开弹窗或抽屉，关闭后回到来源。

完成前检查资源可解析、表单值可获取、脚本选择器匹配、弹窗可关闭、字段错误有修正方法、重复操作受控。保存回执提供结构诊断。遇到具体问题时集中修正，按任务要求核对实际交互。详细设计依据与可访问性约定保存在 design-principles.md。
`;
}

function desktopDesignPrinciples() {
  return `# PC 设计规范

## 基座与适用范围

采用 DSH Desktop Components ${DESKTOP_COMPONENT_VERSION}，基于 Web Components 与原生 HTML 控件，默认主题参考 Ant Design 的桌面视觉和交互约定。支持 PC Web，组件行为位于 components.js，视觉样式位于 theme.css。组件目录与属性见 components.json，主题配置保存在 tokens.json。

## 接入与交付

为页面引入 theme.css，并使用 defer 脚本引入 components.js，在 body 或顶层容器添加 ds-theme 类。参考 examples/components.html 的真实结构。HTML 交付须携带同一版本的组件脚本、主题、字体和其他资源，引用使用相对路径。

在 Designer 中先读取所选规范的公开用法。页面另行引用的图片和字体通过 asset.fromSystemResource 获取实际相对路径。文件目录改变时同步更新相对引用。

## 组件用法

组件使用 Light DOM，使用原生子元素。生成页面时写出完整子元素结构。ds-button 中使用 button，ds-input 中使用 input，ds-select 中使用 select 与 option，ds-dialog 中使用 dialog。文本、表格数据及布局由页面提供。

主要按钮使用 ds-button variant="primary"，次要按钮使用默认 variant，轻操作使用 variant="text"，危险操作添加 danger。加载时设置 loading 并提供正在处理的文案，禁用时设置 disabled。支持 small、default、large 尺寸。

ds-select 保留原生 select 进行表单提交，界面通过自定义 combobox/listbox 显示可主题化选项。searchable 开启输入搜索，clearable 显示清除按钮，multiple 开启多选和可移除标签。optgroup 支持分组，option[data-description] 提供说明，disabled option/optgroup 不可选择。values 属性读取或设置多选数组，原生 select 继续负责表单多值提交。ds-search 携带 query，ds-change 的 detail.values 携带多选结果。支持中文输入、方向键、Home/End、Enter 选择和 Escape 关闭；查询无结果时显示空状态。

输入控件的 name、value、required、disabled、readonly、invalid 等参数放在组件宿主上。标签使用外层 label 或 for 关联原生输入元素。ds-input、ds-select、ds-textarea、ds-checkbox、ds-switch 派发 ds-change，输入时另派发 ds-input，事件 detail 含 value 与 checked。原生事件和表单提交仍可使用。

标签页使用 data-tab-list、button[data-tab] 与对应 data-panel，支持方向键、Home、End。表格使用原生 table，可在 th 中提供 button[data-sort] 启用排序。下拉使用 details、summary 和 data-menu。弹窗通过宿主 showModal()/close() 或 data-ds-open/data-ds-close 触发，支持 Escape、焦点约束和恢复。

ds-drawer 复用弹窗的 showModal()/close() 与 open 属性，placement 支持 left/right。ds-toast 和 ds-notification 使用 show(message?, {tone, duration}) 显示，duration 为毫秒，0 表示持续显示，close() 关闭。可通过 button[data-ds-show="组件ID"] 触发已有提示。Toast 顶部排列，通知右上角排列，悬停或聚焦暂停计时。

ds-tooltip 与 ds-popconfirm 包含 button[data-trigger] 和 [data-floating-content]。确认气泡通过 data-confirm/data-cancel 触发，ds-confirm 可阻止默认关闭。ds-progress 使用 value/max 表达进度，ds-empty 提供空状态内容，ds-skeleton 通过 span 展示骨架并声明 aria-busy。

## 主题与变量

主题按基础参数、派生语义、组件映射组织。tokens.json 的 values 保存可编辑参数，derived 记录自动生成的色板、语义变量、尺寸阶梯与组件映射。theme.css 是这份配置的实际样式交付。调整参数后重新生成派生值，预览与交付消费同一套变量。组件级定制通过对应语义映射进行，避免让一个组件的局部调整扩散到全部组件。

基础变量以 --ds- 为前缀，品牌色为 --ds-primary，背景为 --ds-background，组件背景为 --ds-surface，正文、次要文字和辅助文字为 --ds-text/--ds-text-secondary/--ds-muted，禁用文字为 --ds-text-disabled，边线为 --ds-border，分割线为 --ds-split。成功、警告、错误、信息使用 --ds-success/--ds-warning/--ds-danger/--ds-info。

本体系使用 @ant-design/colors 的浅色色板算法，每个品牌色和功能色生成 10 级色阶，变量如 --ds-primary-1 至 --ds-primary-10。第 6 级为主色，第 5 级用于悬停，第 7 级用于按下，第 1 级用于弱背景，第 2 级用于选中悬停背景，第 3 级用于浅色边框。使用 --ds-primary-hover/--ds-primary-active/--ds-primary-soft 等语义变量表达状态。品牌色用于关键操作、选中与重要信息，成功、警告、错误、信息色表达明确状态，并配合文字或图标。普通选项悬停和表格行悬停使用中性填充 --ds-fill-hover，选中背景使用品牌弱背景。

主要按钮背景 --ds-button-primary-bg 引用 --ds-primary。 项目页面沿用所选规范的基础值和组件映射。遇到对比度问题时记录对应颜色和比值，并通过用户明确的主题调整任务处理。修改体系时优先调整 tokens.json 的配置并生成 theme.css，保留语义映射。字号、字体、行高、间距、控件高度、控件圆角、按钮圆角、卡片圆角和阴影均有对应变量。下拉选项的背景之间使用 --ds-option-gap 控制间隔，默认 2px，可在可视化编辑器的“选项间隔”中调整。普通选项高度为 32px，内容内边距为 5px 12px；带说明的选项按内容增高。自定义字体需随 assets 分发并声明 @font-face，系统字体依赖设备安装情况。

## 信息层级、字体与布局

先明确页面的主要任务、关键信息和次要操作，再组织导航、标题、工具栏、主体内容与反馈。同一业务类型沿用一致的页面骨架。列表至详情的导航保留来源上下文，详情页返回、关闭，弹窗关闭与表单取消应具有稳定的位置、名称、图标和行为。

默认正文 14px、行高约 22px，辅助字号 12px，标题字阶为 16、20、24、30、38px，对应行高 24、28、32、38、46px。调整基础字号后按比例派生标题；在同一工作页面中选用约 3–5 种字阶，正文使用 400 字重，强调使用 500–600。使用 --ds-font-size-heading1 至 heading5 及对应 --ds-line-height-heading1 至 heading5。可纵向比较的数据使用 font-variant-numeric:tabular-nums。

默认布局采用 8px 基础间距，派生 4、8、12、16、20、24、32、48px 阶梯，使用 --ds-space-xxs、--ds-space-xs、--ds-space-sm、--ds-space、--ds-space-md、--ds-space-lg、--ds-space-xl、--ds-space-xxl。相关内容靠近，区块之间留出更明显的分组距离。根据内容选择流式布局或 24 栅格，明确固定导航、可伸缩内容、最小留白与窄窗口处理。业务布局按实际内容确定断点并检查长文本和窗口缩放。

默认小、常规、大控件高度为 24、32、40px，使用 --ds-control-height-sm、--ds-control-height、--ds-control-height-lg。表单与工具栏内保持相同尺寸体系。控件、按钮、选项、卡片和浮层使用各自圆角变量，支持局部调整。层级由页面、卡片、跟随浮层、模态界面逐级表达，输入框保持清晰边界，卡片使用卡片阴影，下拉和弹窗使用浮层阴影，遮罩建立模态关系。常规短动效参考 --ds-motion-fast/mid/slow 的 100/200/300ms，并尊重减少动态效果的偏好。

## 布局、状态与可访问性

PC 页面使用清晰的导航、工具栏、表单、表格与反馈层级。hover、active、focus-visible、disabled、loading、selected 和 invalid 使用组件主题。为图标控件提供可访问名称，保留原生键盘行为。颜色反馈配合文字，动效尊重 prefers-reduced-motion。

组件库提供交互行为，页面仍需实现任务要求的业务逻辑及数据。

普通文字与实际背景按 WCAG AA 检查至少 4.5:1，符合大文字定义的内容至少 3:1，重要可视控件边界与焦点标识结合具体背景检查 3:1。分别检查按钮的常态、悬停、按下状态，以及正文和辅助文字，记录实际比例并调整相关参数。可视化编辑器提供当前文字配对的对比度检查。颜色选择与字体调整后重新检查对应状态，保留可见焦点、原生键盘操作、明确标签和错误恢复说明。

交互反馈应贴近触发位置。字段错误在字段附近说明原因和修正方法，短暂操作结果使用 Toast，需要持续关注的跨区域信息使用通知，影响继续操作的重要决策使用弹窗。加载过程说明正在处理的内容并避免重复提交，空状态给出合适的下一步，错误保留已输入内容并提供恢复路径。破坏性操作按影响程度提供撤销或有明确对象和后果的确认。

## 参考依据

- [Ant Design 色彩](https://ant.design/docs/spec/colors-cn)
- [Ant Design 字体](https://ant.design/docs/spec/font-cn)
- [Ant Design 布局](https://ant.design/docs/spec/layout-cn)
- [Ant Design 阴影](https://ant.design/docs/spec/shadow-cn)
- [Ant Design 主题定制与 Token 派生](https://ant.design/docs/react/customize-theme-cn)
- [WCAG 文字对比度](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
`;
}

export const themePreviewCSS = `
.preview-plain-button{font:inherit;border:1px solid var(--ds-border);border-radius:var(--ds-radius);padding:4px 15px;min-height:var(--ds-control-height);color:var(--ds-text);background:var(--ds-surface);cursor:pointer}.preview-plain-button:hover{color:var(--ds-primary);border-color:var(--ds-primary)}.preview-page{max-width:1200px;margin:auto;padding:var(--ds-space-xl)}.preview-page h1{font-size:var(--ds-font-size-heading3);line-height:var(--ds-line-height-heading3);margin:0 0 6px}.preview-page h2{font-size:var(--ds-font-size-heading5);line-height:var(--ds-line-height-heading5);margin:0 0 18px;font-weight:600}.preview-lead{color:var(--ds-muted);margin:0 0 28px}.preview-grid{display:grid;grid-template-columns:1fr 1fr;gap:var(--ds-space-md)}.preview-row{display:flex;align-items:center;flex-wrap:wrap;gap:var(--ds-space-sm)}.preview-stack{display:flex;flex-direction:column;gap:var(--ds-space)}.preview-fields{display:grid;grid-template-columns:1fr 1fr;gap:var(--ds-space)}.preview-fields label{display:flex;flex-direction:column;gap:6px}.preview-wide{grid-column:1/-1}.preview-label{font-size:var(--ds-font-size-sm);color:var(--ds-muted);margin:0 0 8px}.preview-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:20px}.preview-muted{color:var(--ds-muted)}.preview-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px}.preview-stat{padding:20px}.preview-stat strong{display:block;font-size:28px;margin-top:8px}.preview-nav{display:flex;gap:24px;margin-bottom:28px;border-bottom:1px solid var(--ds-border);padding-bottom:14px}.preview-nav span:first-child{color:var(--ds-primary);font-weight:600}ds-card.preview-stat{box-shadow:var(--ds-card-shadow)}
.foundation-palette{display:grid;grid-template-columns:repeat(10,minmax(0,1fr));overflow:hidden;border-radius:var(--ds-radius);margin-bottom:var(--ds-space)}.foundation-palette>div{height:52px;position:relative}.foundation-palette span{position:absolute;bottom:5px;left:50%;transform:translateX(-50%);font-size:11px;line-height:18px;padding:0 4px;background:var(--ds-surface);color:var(--ds-text);border-radius:3px}.foundation-palette [data-base]{box-shadow:inset 0 0 0 2px var(--ds-text)}.foundation-type{margin:0 0 var(--ds-space-sm);font-weight:500}.foundation-type small{display:block;font-size:12px;line-height:20px;color:var(--ds-muted);font-weight:400}.foundation-spaces{display:flex;flex-direction:column;gap:var(--ds-space-xs)}.foundation-spaces>div{display:flex;align-items:center;gap:12px}.foundation-spaces code{width:95px;flex:none;font-size:11px}.foundation-spaces span{height:12px;background:var(--ds-primary);border-radius:2px}.foundation-contrast{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--ds-split);font-size:var(--ds-font-size-sm)}.foundation-contrast>strong{font-variant-numeric:tabular-nums;font-size:12px;white-space:nowrap}.foundation-contrast[data-pass=false]>strong{color:var(--ds-danger-active)}.foundation-neutral{display:grid;grid-template-columns:1fr 1fr;gap:12px}.foundation-neutral>div{display:flex;align-items:center;gap:8px;font-size:12px}.foundation-neutral i{width:24px;height:24px;border:1px solid var(--ds-border);border-radius:4px;flex:none}.foundation-neutral code{overflow-wrap:anywhere}.foundation-height{display:flex;align-items:flex-end;gap:12px;margin:16px 0}.foundation-height span{padding:0 12px;display:grid;place-items:center;border:1px solid var(--ds-border);border-radius:var(--ds-radius);background:var(--ds-background);font-size:12px}.foundation-note{margin:12px 0 0;font-size:12px;color:var(--ds-muted)}
@media(max-width:640px){.preview-page{padding:var(--ds-space)}.preview-grid,.preview-fields{grid-template-columns:1fr}.foundation-neutral{grid-template-columns:1fr}}
`;

export function desktopExampleHTML({inline = false, tokens, view = 'components', runtime = desktopComponentsScript(), feedback = true} = {}) {
  const header = inline ? `<style>${desktopThemeCSS(tokens)}</style><script>${runtime.replace(/<\/script/gi, '<\\/script')}</script>` : '<link rel="stylesheet" href="../theme.css"><script defer src="../components.js"></script>';
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PC 组件预览</title>${header}
<style>${themePreviewCSS}
</style></head><body class="ds-theme"><main class="preview-page">
${view === 'page' ? `<div class="preview-nav"><span>工作台</span><span>项目管理</span><span>团队成员</span><span>设置</span></div><h1>项目概览</h1><p class="preview-lead">管理团队项目与交付进度</p><div class="preview-stats"><ds-card class="preview-stat"><span class="preview-muted">进行中项目</span><strong>24</strong></ds-card><ds-card class="preview-stat"><span class="preview-muted">本月已交付</span><strong>12</strong></ds-card><ds-card class="preview-stat"><span class="preview-muted">团队成员</span><strong>8</strong></ds-card></div>` : view === 'foundations' ? '<h1>基础规范</h1><p class="preview-lead">调整基础参数，查看色阶、语义映射与尺寸层级。</p>' : view === 'select' ? '<h1>选择器</h1><p class="preview-lead">搜索、多选、分组与状态，使用同一套组件参数和主题。</p>' : view === 'feedback' ? '<h1>浮层与反馈</h1><p class="preview-lead">弹窗、抽屉与消息提示，可直接触发检查交互。</p>' : '<h1>组件预览</h1>'}
${view === 'foundations' ? foundationPreview(tokens) : ''}
<div class="preview-grid" ${['feedback', 'select', 'foundations'].includes(view) ? 'hidden' : ''}>
<ds-card><div data-card-body><h2>按钮</h2><div class="preview-stack"><div class="preview-row"><ds-button variant="primary"><button type="button">主要按钮</button></ds-button><ds-button><button type="button">默认按钮</button></ds-button><ds-button variant="text"><button type="button">文字按钮</button></ds-button></div><div class="preview-row"><ds-button variant="primary" size="small"><button type="button">小尺寸</button></ds-button><ds-button disabled><button type="button">禁用状态</button></ds-button><ds-button variant="primary" loading><button type="button">加载中</button></ds-button><ds-button danger><button type="button">删除</button></ds-button></div></div></div></ds-card>
<ds-card><div data-card-body><h2>选择与反馈</h2><div class="preview-stack"><div class="preview-row"><ds-checkbox checked><label><input type="checkbox">记住选择</label></ds-checkbox><ds-switch checked aria-label="启用通知"><input type="checkbox" role="switch"></ds-switch><ds-tag tone="primary">进行中</ds-tag><ds-tag tone="success">已完成</ds-tag><ds-tag tone="warning">待审核</ds-tag></div><ds-alert role="status">此项目仅团队成员可见。</ds-alert></div></div></ds-card>
<ds-card class="preview-wide"><div data-card-body><h2>表单控件</h2><form class="preview-fields"><label>项目名称<ds-input name="project" placeholder="请输入项目名称"><input></ds-input></label><label>开始日期<ds-input><input name="start-date" type="date"></ds-input></label><label>项目类型<ds-select name="kind"><select><option value="product">产品设计</option><option value="brand">品牌设计</option><option value="website">网站设计</option></select></ds-select></label><label>校验状态<ds-input invalid value="example" aria-label="邮箱"><input></ds-input><small style="color:var(--ds-danger)">请输入有效邮箱地址</small></label><label>禁用状态<ds-input disabled value="无修改权限"><input></ds-input></label><label class="preview-wide">项目描述<ds-textarea name="description" placeholder="输入项目描述"><textarea></textarea></ds-textarea></label></form></div></ds-card>
<ds-card class="preview-wide"><div data-card-body><div class="preview-toolbar"><h2 style="margin:0">项目列表</h2><div class="preview-row"><ds-dropdown><details><summary>更多操作</summary><div data-menu><button type="button">导出列表</button><button type="button">复制项目</button></div></details></ds-dropdown><ds-button variant="primary"><button type="button" data-ds-open="preview-dialog">新建项目</button></ds-button></div></div><ds-tabs value="all"><div data-tab-list><button data-tab="all">全部项目</button><button data-tab="active">进行中</button><button data-tab="archived" disabled>已归档</button></div><section data-panel="all">${exampleTable()}</section><section data-panel="active"><ds-alert role="status">当前有 2 个进行中的项目。</ds-alert></section></ds-tabs></div></ds-card>
</div>${feedback && view === 'select' ? selectPreview() : ''}${feedback && ['components', 'feedback'].includes(view) ? feedbackPreview() : ''}<ds-dialog id="preview-dialog"><dialog aria-labelledby="preview-dialog-title"><header><span id="preview-dialog-title">新建项目</span>${desktopOverlayCloseButton('关闭弹窗')}</header><div data-dialog-body><label>项目名称<ds-input placeholder="输入项目名称"><input></ds-input></label></div><footer><ds-button><button type="button" data-ds-close>取消</button></ds-button><ds-button variant="primary"><button type="button" data-ds-close>创建项目</button></ds-button></footer></dialog></ds-dialog>${feedbackOverlays()}
</main></body></html>`;
}
function exampleTable() {
  return '<ds-table><table><thead><tr><th><button type="button" data-sort="name">项目名称 ↕</button></th><th>负责人</th><th>状态</th><th><button type="button" data-sort="date">更新时间 ↕</button></th><th>操作</th></tr></thead><tbody><tr><td>品牌官网改版</td><td>林晓</td><td><ds-tag tone="primary">进行中</ds-tag></td><td>2026-11-12</td><td><ds-button variant="text"><button type="button" data-ds-open="preview-dialog">编辑</button></ds-button></td></tr><tr><td>数据管理平台</td><td>陈然</td><td><ds-tag tone="success">已完成</ds-tag></td><td>2026-11-10</td><td><ds-button variant="text"><button type="button" data-ds-open="preview-dialog">编辑</button></ds-button></td></tr><tr><td>客户服务门户</td><td>王悦</td><td><ds-tag tone="primary">进行中</ds-tag></td><td>2026-11-08</td><td><ds-button variant="text"><button type="button" data-ds-open="preview-dialog">编辑</button></ds-button></td></tr></tbody></table></ds-table>';
}

export function foundationPreview(input, {scales = desktopThemeTokens(input).scales, checks = desktopThemeContrast(input), paletteHint = '1 弱背景 · 2 选中悬停 · 3 浅边框 · 5 悬停 · 6 主色 · 7 按下'} = {}) {
  const palettes = [['primary', '品牌色'], ['success', '成功'], ['warning', '警告'], ['danger', '错误'], ['info', '信息']];
  const spaces = ['spaceXXS', 'spaceXS', 'spaceSM', 'space', 'spaceMD', 'spaceLG', 'spaceXL', 'spaceXXL'];
  return `<section class="preview-grid" aria-label="基础设计规范">
<ds-card class="preview-wide"><header>色板与状态</header><div data-card-body>${palettes.map(([key, label]) => `<p class="preview-label">${label} · --ds-${key}</p><div class="foundation-palette" aria-label="${label}十级色阶">${Array.from({length: 10}, (_, index) => `<div style="background:var(--ds-${key}-${index + 1})" title="--ds-${key}-${index + 1}" ${index === 5 ? 'data-base' : ''}><span>${index + 1}</span></div>`).join('')}</div>`).join('')}<p class="foundation-note">${paletteHint}</p></div></ds-card>
<ds-card><header>字体层级</header><div data-card-body>${[1, 2, 3, 4, 5].map(index => `<p class="foundation-type" style="font-size:var(--ds-font-size-heading${index});line-height:var(--ds-line-height-heading${index})">标题层级 ${index}<small>字号 <span data-theme-value="--ds-font-size-heading${index}">${scales[`fontSizeHeading${index}`]}</span> · 行高 <span data-theme-value="--ds-line-height-heading${index}">${scales[`lineHeightHeading${index}`]}</span></small></p>`).join('')}<p>正文 · 任务信息与操作说明</p><small style="font-size:var(--ds-font-size-sm);color:var(--ds-muted)">辅助信息 · 时间、说明和元数据</small><p class="foundation-note">同一工作页面选用约 3–5 种字阶。</p></div></ds-card>
<ds-card><header>间距与控件</header><div data-card-body><div class="foundation-spaces">${spaces.map(key => `<div><code>--ds-${cssName(key)}</code><span style="width:var(--ds-${cssName(key)})"></span><small data-theme-value="--ds-${cssName(key)}">${scales[key]}</small></div>`).join('')}</div><div class="foundation-height"><span style="height:var(--ds-control-height-sm)">小尺寸</span><span style="height:var(--ds-control-height)">常规</span><span style="height:var(--ds-control-height-lg)">大尺寸</span></div><p class="foundation-note">控件、按钮、选项与浮层可分别调整圆角。</p></div></ds-card>
<ds-card><header>中性色与信息层级</header><div data-card-body class="foundation-neutral">${[['text', '正文'], ['text-secondary', '次要文字'], ['muted', '辅助文字'], ['text-disabled', '禁用文字'], ['border', '边框'], ['split', '分割线'], ['fill-hover', '悬停填充'], ['fill-active', '按下填充'], ['background', '页面背景'], ['surface', '组件背景']].map(([key, label]) => `<div><i style="background:var(--ds-${key})" aria-hidden="true"></i><span>${label}<br><code>--ds-${key}</code></span></div>`).join('')}</div></ds-card>
<ds-card><header>文字对比度</header><div data-card-body>${checks.map((check, index) => `<div class="foundation-contrast" data-contrast-index="${index}" data-pass="${check.passes}"><span>${check.label}</span><strong>${check.ratio.toFixed(2)}:1 · ${check.passes ? '达标' : '待调整'}</strong></div>`).join('')}<p class="foundation-note">以上配对按普通文字 WCAG AA 的 4.5:1 检查，可调整文字色或对应背景色。</p></div></ds-card>
</section>`;
}

function selectPreview() {
  return `<section class="preview-grid" style="margin:20px 0" aria-label="选择器形态">
<ds-card><header>搜索与清除</header><div data-card-body class="preview-stack"><label>项目负责人<ds-select searchable clearable name="owner" aria-label="项目负责人" placeholder="输入姓名或邮箱搜索"><select><option value="" disabled hidden selected>请选择负责人</option><option value="lin" data-description="lin@example.com · 产品设计">林晓</option><option value="chen" data-description="chen@example.com · 研发">陈然</option><option value="wang" data-description="wang@example.com · 运营">王悦</option><option value="zhang" disabled data-description="账号已停用">张明</option></select></ds-select></label><small class="preview-muted">支持搜索、中文输入、方向键选择和清除。</small></div></ds-card>
<ds-card><header>多选与标签移除</header><div data-card-body class="preview-stack"><label>项目成员<ds-select multiple clearable name="members" aria-label="项目成员" placeholder="搜索并选择成员"><select multiple><option value="lin" selected>林晓</option><option value="chen" selected>陈然</option><option value="wang">王悦</option><option value="zhou">周宁</option><option value="zhang" disabled>张明（已停用）</option></select></ds-select></label><small class="preview-muted">点击选项切换选择，标签可移除，空搜索时按退格移除最后一项。</small></div></ds-card>
<ds-card><header>分组与禁用项</header><div data-card-body><label>所属团队<ds-select searchable clearable name="team" aria-label="所属团队" placeholder="搜索团队"><select><optgroup label="设计团队"><option value="product">产品设计</option><option value="brand">品牌设计</option><option value="research" disabled>体验研究（暂不可用）</option></optgroup><optgroup label="研发团队"><option value="frontend">前端研发</option><option value="backend">后端研发</option></optgroup><optgroup label="已归档" disabled><option value="legacy">历史项目组</option></optgroup></select></ds-select></label></div></ds-card>
<ds-card><header>加载与空结果</header><div data-card-body class="preview-stack"><label>加载中<ds-select loading aria-label="加载中的选项" placeholder="正在获取选项"><select></select></ds-select></label><label>暂无选项<ds-select searchable aria-label="暂无选项" placeholder="请选择"><select></select></ds-select></label><small class="preview-muted">搜索不匹配时显示“无匹配选项”，结果区域保留一致的面板留白。</small></div></ds-card>
<ds-card><header>尺寸</header><div data-card-body class="preview-stack"><ds-select size="small" aria-label="小尺寸选择器"><select><option>小尺寸</option><option>备选内容</option></select></ds-select><ds-select aria-label="默认尺寸选择器"><select><option>默认尺寸</option><option>备选内容</option></select></ds-select><ds-select size="large" aria-label="大尺寸选择器"><select><option>大尺寸</option><option>备选内容</option></select></ds-select></div></ds-card>
<ds-card><header>校验与禁用</header><div data-card-body class="preview-stack"><label>必选项目<ds-select invalid required clearable aria-label="必选项目" placeholder="请选择一个项目"><select><option value="" disabled hidden selected>请选择一个项目</option><option value="website">品牌官网</option><option value="admin">管理后台</option></select></ds-select></label><small style="color:var(--ds-danger)">请选择一个项目</small><label>已禁用<ds-select disabled multiple aria-label="已禁用成员"><select multiple><option selected>林晓</option><option selected>陈然</option></select></ds-select></label></div></ds-card>
</section>`;
}

function feedbackPreview() {
  return `<section class="preview-grid" style="margin-top:20px" aria-label="浮层与反馈组件">
<ds-card><header>弹窗与面板</header><div data-card-body class="preview-stack"><p class="preview-muted" style="margin:0">检查遮罩、标题、内容区、底部操作和关闭行为。</p><div class="preview-row"><ds-button variant="primary"><button type="button" data-ds-open="preview-dialog">打开弹窗</button></ds-button><ds-button><button type="button" data-ds-open="preview-drawer">打开抽屉</button></ds-button><ds-popconfirm><button type="button" data-trigger class="preview-plain-button">删除确认</button><div data-floating-content hidden><strong>确认删除这个项目？</strong><p>请确认已保留需要的项目资料。</p><footer><ds-button size="small"><button type="button" data-cancel>取消</button></ds-button><ds-button size="small" variant="primary"><button type="button" data-confirm>确认</button></ds-button></footer></div></ds-popconfirm></div></div></ds-card>
<ds-card><header>全局提示 Message / Toast</header><div data-card-body class="preview-stack"><p class="preview-muted" style="margin:0">提示出现在页面顶部，多条消息依次排列，3 秒后自动关闭。</p><div class="preview-row"><ds-button><button type="button" data-ds-show="toast-success">成功提示</button></ds-button><ds-button><button type="button" data-ds-show="toast-warning">警告提示</button></ds-button><ds-button danger><button type="button" data-ds-show="toast-error">错误提示</button></ds-button></div></div></ds-card>
<ds-card><header>通知与文字提示</header><div data-card-body class="preview-stack"><p class="preview-muted" style="margin:0">通知显示在右上角，支持主动关闭和鼠标悬停暂停。</p><div class="preview-row"><ds-button variant="primary"><button type="button" data-ds-show="notice-success">打开通知</button></ds-button><ds-tooltip><button type="button" data-trigger class="preview-plain-button">悬停查看 Tooltip</button><span data-floating-content hidden>这里是补充说明，支持键盘聚焦查看。</span></ds-tooltip></div></div></ds-card>
<ds-card><header>选择与进度</header><div data-card-body class="preview-stack"><div class="preview-row"><ds-radio name="scope" value="team" checked><label><input type="radio">团队可见</label></ds-radio><ds-radio name="scope" value="private"><label><input type="radio">仅自己可见</label></ds-radio></div><div><p class="preview-label">上传进度 · 65%</p><ds-progress value="65" aria-label="上传进度"><progress></progress></ds-progress></div></div></ds-card>
<ds-card class="preview-wide"><header>内联反馈 Alert</header><div data-card-body class="preview-stack"><ds-alert tone="success" role="status">成功 · 项目信息已保存。</ds-alert><ds-alert tone="warning" role="status">警告 · 还有待补充的资料。</ds-alert><ds-alert tone="error" role="alert">错误 · 操作失败，请检查后重试。</ds-alert></div></ds-card>
<ds-card><header>空状态 Empty</header><div data-card-body><ds-empty><span>暂无项目数据</span><ds-button variant="primary"><button type="button" data-ds-open="preview-dialog">创建项目</button></ds-button></ds-empty></div></ds-card>
<ds-card><header>加载骨架 Skeleton</header><div data-card-body><ds-skeleton aria-label="正在加载" aria-busy="true"><span></span><span></span><span></span><span></span></ds-skeleton></div></ds-card>
</section>`;
}
function feedbackOverlays() {
  return `<ds-drawer id="preview-drawer"><dialog aria-labelledby="drawer-title"><header><span id="drawer-title">项目设置</span>${desktopOverlayCloseButton('关闭抽屉')}</header><div data-dialog-body class="preview-stack"><label>项目名称<ds-input value="品牌官网改版"><input></ds-input></label><label>项目类型<ds-select><select><option>产品设计</option><option>品牌设计</option><option>网站设计</option></select></ds-select></label><label>说明<ds-textarea placeholder="请输入项目说明"><textarea></textarea></ds-textarea></label></div><footer><ds-button><button type="button" data-ds-close>取消</button></ds-button><ds-button variant="primary"><button type="button" data-ds-close>保存</button></ds-button></footer></dialog></ds-drawer>
<ds-toast id="toast-success" tone="success" duration="3000">操作成功，项目已保存</ds-toast><ds-toast id="toast-warning" tone="warning" duration="3000">请先补充必填信息</ds-toast><ds-toast id="toast-error" tone="error" duration="3000">操作失败，请稍后重试</ds-toast>
<ds-notification id="notice-success" tone="success" duration="4500"><strong>项目已发布</strong><p>团队成员现在可以查看项目的最新内容。</p></ds-notification>`;
}

export function desktopSystemFiles(input) {
  const values = normalizeDesktopTheme(input);
  const preset=desktopPresets[values.preset];
  const files = {
    'rule.md': desktopSystemRules().replace('## 默认实施路径',preset ? preset.name+' 桌面主题。'+preset.guidance+'\n\n## 默认实施路径' : '## 默认实施路径').replace('常规控件32px，小控件24px，大控件40px。',preset?'控件高度、圆角和尺寸层级取自当前主题变量。':'常规控件32px，小控件24px，大控件40px。'),
    'design-principles.md': preset ? '# '+preset.name+' 桌面设计原则\n\n'+preset.guidance+'\n\n主题的品牌、状态、字体、控件尺寸和浮层参数见 tokens.json。表单保留标签、键盘焦点和错误反馈。组件用法见 rule.md 和 components.json。\n\n参考：'+preset.reference : desktopDesignPrinciples(),
    ...desktopPatternFiles(),
    'tokens.json': JSON.stringify({format: DESKTOP_THEME_FORMAT, version: 1, componentVersion: DESKTOP_COMPONENT_VERSION, values, derived: desktopThemeTokens(values)}, null, 2),
    'theme.css': desktopThemeCSS(values),
    'components.js': desktopComponentsScript(),
    'components.json': JSON.stringify(desktopComponentManifest, null, 2),
    'examples/components.html': desktopExampleHTML(),
  };
  return Object.entries(files).map(([logicalPath, content]) => ({logicalPath, name: logicalPath.split('/').at(-1), content, mimeType: logicalPath.endsWith('.css') ? 'text/css' : logicalPath.endsWith('.js') ? 'text/javascript' : logicalPath.endsWith('.json') ? 'application/json' : logicalPath.endsWith('.html') ? 'text/html' : 'text/markdown'}));
}

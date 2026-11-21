import {desktopThemeFields, normalizeThemeFields, desktopThemeTokens, themeContrastChecks, blendColor, desktopComponentManifest, themePreviewCSS, foundationPreview} from './desktop-theme.js';
import {MOBILE_COMPONENT_VERSION, mobileComponentsScript} from './mobile-components.js';
import {mobileIconFont, mobileIconCodes, vantLicense} from './mobile-icons.js';
import mobileStyles from './mobile-styles.js';

export const MOBILE_SYSTEM_NAME = 'Vant · Mobile Web Components';
export const MOBILE_THEME_FORMAT = 'dsh-mobile-theme';
const defaults = {
  primary: '#1989fa', success: '#07c160', warning: '#ff976a', danger: '#ee0a24', info: '#1989fa',
  background: '#f7f8fa', text: '#323233', muted: '#969799', border: '#ebedf0',
  controlHeight: 44, lineHeight: 1.5, spacing: 4, radius: 4, buttonRadius: 4, popupRadius: 16,
  optionGap: 0, optionRadius: 0,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, "Segoe UI", Arial, Roboto, "PingFang SC", "Microsoft Yahei", sans-serif',
};
export const mobileThemeFields = [
  ...desktopThemeFields.map(field => ({...field, value: defaults[field.key] ?? field.value,
    ...(field.key === 'controlHeight' ? {min: 44} : {}),
  })),
  {key: 'touchTarget', label: '最小触控区域', type: 'number', group: '移动端', value: 44, min: 44, max: 56, unit: 'px'},
  {key: 'pagePadding', label: '页面边距', type: 'number', group: '移动端', value: 16, min: 12, max: 32, unit: 'px'},
  {key: 'navBarHeight', label: '导航栏高度', type: 'number', group: '移动端', value: 46, min: 44, max: 64, unit: 'px'},
  {key: 'tabbarHeight', label: '底部导航高度', type: 'number', group: '移动端', value: 50, min: 44, max: 72, unit: 'px'},
  {key: 'cellHeight', label: '单元格高度', type: 'number', group: '移动端', value: 44, min: 44, max: 64, unit: 'px'},
  {key: 'fill', label: '填充背景', type: 'color', group: '颜色', value: '#f2f3f5'},
  {key: 'placeholder', label: '占位文字', type: 'color', group: '颜色', value: '#c8c9cc'},
  {key: 'description', label: '说明文字', type: 'color', group: '颜色', value: '#646566'},
  {key: 'buttonBorder', label: '按钮边框', type: 'color', group: '组件', value: '#dcdee0'},
  {key: 'dialogWidth', label: '弹窗宽度', type: 'number', group: '组件', value: 320, min: 280, max: 360, unit: 'px'},
  {key: 'dialogActionHeight', label: '弹窗操作高度', type: 'number', group: '组件', value: 48, min: 44, max: 64, unit: 'px'},
  {key: 'switchSize', label: '开关大小', type: 'number', group: '组件', value: 26, min: 20, max: 32, unit: 'px'},
];
export const normalizeMobileTheme = (input = {}) => normalizeThemeFields(mobileThemeFields, input);

export function mobileThemeTokens(input) {
  const values = normalizeMobileTheme(input), derived = desktopThemeTokens(values);
  Object.assign(derived.semantic, {primaryHover: values.primary, primaryActive: blendColor('#000000', values.primary, .1), textSecondary: values.muted, textDisabled: values.placeholder, fillHover: values.fill, split: values.border});
  derived.scales.controlHeightSM = `${values.controlHeight - 12}px`;
  derived.scales.controlHeightLG = `${values.controlHeight + 6}px`;
  for (const [index, size] of [28, 24, 20, 18, 16].entries()) {
    const fontSize = Math.round(size * values.fontSize / 14);
    derived.scales[`fontSizeHeading${index + 1}`] = `${fontSize}px`;
    derived.scales[`lineHeightHeading${index + 1}`] = `${fontSize + 8}px`;
  }
  Object.assign(derived.components, {
    navBarBg: 'var(--ds-surface)', tabbarBg: 'var(--ds-surface)',
    tabbarActiveText: 'var(--ds-primary)', cellBg: 'var(--ds-surface)', cellBorder: 'var(--ds-border)',
    inputBg: 'transparent', inputBorder: 'transparent', inputFocusBorder: 'transparent',
    dialogMessageColor: 'var(--ds-description)',
  });
  return derived;
}
export function mobileThemeContrast(input) {
  const values = normalizeMobileTheme(input), {semantic} = mobileThemeTokens(values);
  return themeContrastChecks([
    ['正文与组件背景', values.text, values.surface], ['正文与页面背景', values.text, values.background],
    ['辅助文字与组件背景', values.muted, values.surface], ['主按钮文字', values.primaryText, values.primary],
    ['主按钮悬停文字', values.primaryText, values.primary], ['主按钮按下文字', values.primaryText, semantic.primaryActive],
  ]);
}
const cssName = key => key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z])([A-Z][a-z])/g, '$1-$2').toLowerCase();

export function mobileThemeCSS(input) {
  const values = normalizeMobileTheme(input), {palettes, semantic, scales, components} = mobileThemeTokens(values);
  const seeds = mobileThemeFields.map(field => `  --ds-${field.key === 'popupShadow' ? 'popup-shadow-strength' : cssName(field.key)}: ${values[field.key]}${field.unit === 'px' ? 'px' : field.unit === '%' ? '%' : ''};`);
  const derived = {...Object.fromEntries(Object.entries(palettes).flatMap(([key, colors]) => colors.map((color, index) => [`${key}-${index + 1}`, color]))), ...semantic, ...scales, ...components};
  return `/*! Vant 4.9.22 visual reference and embedded icon font.\n${vantLicense.replace(/\*\//g, '* /')}\n*/
@font-face { font-family:DSHMobileIcons;src:url(${JSON.stringify(mobileIconFont)}) format('woff2');font-display:block; }
:root, .ds-theme {
${seeds.join('\n')}
${Object.entries(derived).map(([key, value]) => `  --ds-${cssName(key)}: ${value};`).join('\n')}
  --ds-popup-shadow:0 2px 12px rgb(0 0 0 / var(--ds-popup-shadow-strength));
  --ds-card-shadow:0 4px 18px rgb(0 0 0 / var(--ds-shadow));
}
${Object.entries(mobileIconCodes).map(([name, code]) => `.ds-mobile [data-mobile-icon=${name}]::before { content:'\\${code.toString(16)}'; }`).join('\n')}
${mobileStyles}`;
}

export const mobileComponentManifest = {
  name: 'DSH Mobile Components', version: MOBILE_COMPONENT_VERSION, platform: 'mobile', dom: 'light',
  components: [
    ...desktopComponentManifest.components.filter(component => !['ds-table', 'ds-dropdown', 'ds-tooltip', 'ds-popconfirm'].includes(component.tag)).map(component => {
      if (component.tag === 'ds-drawer') return {...component, attributes: ['open', 'placement=bottom|left|right', 'data-kind=actions|selection'], patterns: ['bottom popup', 'action sheet', 'option picker']};
      if (component.tag === 'ds-button') return {...component, attributes: [...component.attributes, 'block', 'round', 'plain']};
      if (component.tag === 'ds-checkbox') return {...component, attributes: [...component.attributes, 'shape=round|square']};
      if (component.tag === 'ds-tag') return {...component, attributes: [...component.attributes, 'plain']};
      return component;
    }),
    {tag: 'ds-nav-bar', structure: 'button (back) + strong (title) + button (secondary action)', attributes: ['safe-area-top']},
    {tag: 'ds-cell-group', attributes: ['inset'], structure: 'ds-cell children'},
    {tag: 'ds-cell', structure: 'button, a or [data-cell-content], optional [data-cell-value] and [data-cell-arrow]'},
    {tag: 'ds-tabbar', attributes: ['value'], structure: '[data-tab-list] > button[data-tab] > i[data-mobile-icon] + span, optional [data-panel]', icons: Object.keys(mobileIconCodes), events: ['ds-change'], keyboard: 'ArrowLeft, ArrowRight, Home, End'},
    {tag: 'ds-badge', structure: 'Short count or status with an accessible text equivalent'},
    {tag: 'ds-stepper', native: 'input[type=number]', attributes: ['value', 'name', 'min', 'max', 'step (positive number)', 'disabled', 'readonly', 'aria-label'], methods: ['value', 'checkValidity()'], events: ['ds-input', 'ds-change']},
  ],
};

export function mobileSystemRules() {
  return `# 移动端设计规范

## 基座与设计依据

采用 DSH Mobile Components ${MOBILE_COMPONENT_VERSION}，默认视觉参考 Vant 4.9.22 的移动 Web 组件约定。原生表单、弹窗、标签页与反馈复用共享组件行为，移动端补充导航栏、单元格、底部导航、徽标和步进器。components.js 提供 Light DOM Web Components，theme.css 提供主题，components.json 列出实际支持的组件和结构，tokens.json 保存基础参数及派生映射。参考 examples/components.html 和 examples/page.html 使用完整结构。

## 接入与交付

页面声明 viewport 的 width=device-width、initial-scale=1、viewport-fit=cover，引入 theme.css 和 defer 的 components.js，在 body 添加 ds-theme ds-mobile。字体、图片和样式随 HTML 一起交付，资源使用相对于实际 htmlPath 的路径。在 Designer 中先读取所选规范的公开用法。保存新页面会接入主题和组件脚本，页面直接引用的其他资源通过 asset.fromSystemResource 获取相对路径。使用 designer_commit_html 保存页面。

## 色彩、文字与空间

默认品牌色 #1989fa，成功色 #07c160，警告色 #ff976a，错误色 #ee0a24。 项目页面沿用所选规范的颜色与组件映射，业务样式复用已有语义变量。对比度检查发现基线问题时记录颜色和比值，通过用户明确的主题调整任务处理。品牌、功能、中性色分别表达行动、状态与信息层级。复用共享色板算法派生 10 级色阶，以语义变量 --ds-primary、--ds-primary-soft、--ds-primary-hover、--ds-primary-active、--ds-success-soft 等驱动组件。tokens.json 的 values 为用户配置，derived 为派生色板、尺寸与组件映射。参数调整后同步生成 theme.css。结合实际背景检查普通文字 4.5:1、大文字 3:1，状态配合文字或图标表达。

默认正文 14px，基础行高 1.5，辅助文字 12px，标题参考 16、18、20、24、28px。单页采用清晰的 3–5 级文字层次，长正文可按内容提升至 16px。4px 为空间基数，页面左右边距默认 16px，相关项目就近分组，列表内容与操作纵向排列。以内容宽度适配 320–430px 常见窄屏并检查横屏和较大字体。使用触控、焦点和按下反馈来表达交互状态。

## 触控、导航与安全区

默认最小触控区域 44px，标准按钮 44px，小按钮可使用 32px 视觉高度并保留扩展点击区域。步进器使用 28px 按钮和 32×28px 输入框，按钮向上下扩展点击区域。导航栏默认 46px，底部导航默认 50px，单元格至少 44px。触控区域由 --ds-touch-target 控制，页面边距、导航栏、底部栏和单元格有独立变量。

同类页面保持标题、返回、关闭、取消和主要操作的位置、样式、名称与行为一致。详情页左侧返回来源页面并恢复筛选、选择和滚动上下文，弹出层提供清晰的关闭或取消入口。底部导航用于同层目的地，返回用于层级回退。重要任务提供明确的按钮和反馈。

页面通过 env(safe-area-inset-top) 和 env(safe-area-inset-bottom) 适配安全区。为固定底栏预留等量内容空间，表单聚焦时确认软键盘不会遮住当前字段和提交操作。支持原生滚动、纵向内容布局和 dvh，避免锁死页面高度。固定导航可标记 data-mobile-fixed，在编辑态使用局部适配保证完整内容可检查。

## 组件与交互

ds-button 使用原生 button，支持 variant=primary|default|text、size=small|default|large，以及移动端 block、round 和 plain。默认品牌按钮悬停保持品牌背景，按下叠加 10% 黑色。表单使用 ds-input、ds-textarea、ds-select、ds-checkbox、ds-radio 和 ds-switch，保留原生 input/select/textarea、name、type、required、disabled、readonly 与 label。字段使用 .mobile-field 行结构，标题放在 span 内，默认上下内边距 10px、左右 16px、内容行高 24px，输入区域无边框、无独立填充。单选和复选框默认圆形 20px，复选框支持 shape=square。开关默认旋钮 26px、轨道 50.8×30px。用合适的 email、tel、number 和 inputmode 提示键盘，字段校验就近说明修正方式并保留输入。

ds-select 支持 searchable、clearable、multiple、分组、禁用项、说明和空结果。复杂单选任务可使用 ds-drawer placement=bottom 与原生单选项组成选择面板，提供取消、确认与已选内容。ds-stepper 包含 input[type=number]，min/max/step 限定数量，支持原生键盘输入和表单提交，增加/减少触发 ds-input 和 ds-change。

ds-nav-bar 的子结构为返回按钮、strong 标题、右侧次要操作，返回按钮添加 data-nav-back 显示箭头。ds-cell-group 包含 ds-cell，inset 表示带页面边距和圆角的分组，交互单元格使用 button 或 a，静态内容使用 data-cell-content。单元格说明字号 12px、行高 18px、距标题 4px。ds-tabbar 复用标签页状态机制，使用 data-tab-list、button[data-tab] 与对应 data-panel，value 和 ds-change 表达当前目的地。导航项使用 i[data-mobile-icon] 和 span 文案，图标 22px、文案 12px、间距 4px。可用图标见 components.json，theme.css 内嵌 Vant MIT 授权图标字体，可离线使用。图标和徽标同时提供可理解的文本。

ds-drawer placement=bottom 作为底部弹层、动作面板和选择面板，使用 dialog > header + data-dialog-body + footer，保留关闭或取消按钮、Escape、焦点约束和恢复。通过 data-ds-open 或 showModal() 打开，通过 data-ds-close 或 close() 关闭。动作面板添加 data-kind=actions，在 data-action-list 中排列完整宽度操作，行高 50px，取消操作通过 8px 背景间隔分组。选择面板添加 data-kind=selection，44px 顶部工具栏依次放取消、居中标题、确认。ds-dialog 默认宽 320px、圆角 16px、中心位于视口高度 45%，标题居中、顶部留白 26px，说明区使用 8px 24px 26px 内边距，底部两个操作各占一半、默认高 48px，确认使用品牌色文字。遮罩为 70% 黑色。ds-toast 用于轻量结果，成功和失败提示带图标与 120×120px 默认容器，ds-notification 为顶部通栏通知。ds-tag 默认实底，plain 使用描边。

长列表按任务要求提供加载、空、错误、重试和加载更多状态。连续请求期间防止重复提交，破坏性操作提供明确对象和后果的确认或撤销。减少动效偏好、键盘操作、焦点指示和可访问名称均需保持可用。

## 页面验收

保存 HTML 后在移动视口检查触控、滚动和任务要求的业务交互。

## 参考

- [Vant 介绍](https://vant-ui.github.io/vant/#/zh-CN/home)
- [Vant 主题定制](https://vant-ui.github.io/vant/#/zh-CN/config-provider)
- [Vant 按钮](https://vant-ui.github.io/vant/#/zh-CN/button)
- [Vant 导航栏](https://vant-ui.github.io/vant/#/zh-CN/nav-bar)
- [Vant 弹出层](https://vant-ui.github.io/vant/#/zh-CN/popup)
`;
}

function mobileOverlays() {
  return `<ds-dialog id="mobile-confirm"><dialog aria-labelledby="mobile-confirm-title"><header><span id="mobile-confirm-title">确认提交</span></header><div data-dialog-body>请确认已填写的信息，提交后可在记录中查看。</div><footer><ds-button><button type="button" data-ds-close>取消</button></ds-button><ds-button variant="primary"><button type="button" data-ds-close data-ds-show="mobile-success">确认</button></ds-button></footer></dialog></ds-dialog>
<ds-drawer id="mobile-sheet" placement="bottom" data-kind="actions"><dialog aria-labelledby="mobile-sheet-title"><header><span id="mobile-sheet-title">更多操作</span><button type="button" data-overlay-close data-ds-close aria-label="关闭操作面板">×</button></header><div data-dialog-body data-action-list><button type="button" data-ds-close data-ds-show="mobile-success">收藏此内容</button><button type="button" data-ds-close data-ds-show="mobile-success">复制链接</button><button type="button" data-danger data-ds-close>移除收藏</button></div><footer><ds-button block><button type="button" data-ds-close>取消</button></ds-button></footer></dialog></ds-drawer>
<ds-drawer id="mobile-picker" placement="bottom" data-kind="selection"><dialog aria-labelledby="mobile-picker-title"><header><button type="button" data-ds-close>取消</button><span id="mobile-picker-title">选择通知范围</span><button type="button" data-ds-close data-mobile-apply="notice-scope">确认</button></header><div data-dialog-body><ds-radio name="notice-scope" value="all" checked><label><input type="radio">全部通知</label></ds-radio><ds-radio name="notice-scope" value="important"><label><input type="radio">仅重要通知</label></ds-radio><ds-radio name="notice-scope" value="none"><label><input type="radio">关闭通知</label></ds-radio></div></dialog></ds-drawer>
<ds-toast id="mobile-success" tone="success" duration="2000">操作成功</ds-toast><ds-toast id="mobile-error" tone="error" duration="3000">操作失败，请稍后重试</ds-toast><ds-notification id="mobile-notice" tone="info" duration="4500"><strong>新的服务通知</strong><p>预约信息已更新，请及时查看。</p></ds-notification>`;
}

function mobileSelectors() {
  return `<h2 class="mobile-section-title">搜索与选择</h2><section class="mobile-fields"><label class="mobile-field"><span>搜索服务</span><ds-input type="search" placeholder="输入服务名称" name="search"><input type="search"></ds-input></label><label class="mobile-field"><span>搜索单选</span><ds-select name="city" searchable clearable placeholder="搜索城市" aria-label="城市"><select><option value="" hidden disabled selected>请选择城市</option><option value="hangzhou">杭州</option><option value="shanghai">上海</option><option value="beijing">北京</option></select></ds-select></label><label class="mobile-field"><span>服务偏好</span><ds-select name="preferences" multiple clearable aria-label="服务偏好"><select multiple><option value="home" selected>上门服务</option><option value="weekend">周末可用</option><option value="express">快速响应</option></select></ds-select></label><ds-button block><button type="button" data-ds-open="mobile-picker">打开底部选择面板</button></ds-button></section>`;
}

function mobileFeedback() {
  return `<h2 class="mobile-section-title">浮层与反馈</h2><section class="mobile-section mobile-stack"><ds-button block variant="primary"><button type="button" data-ds-open="mobile-confirm">确认弹窗</button></ds-button><ds-button block><button type="button" data-ds-open="mobile-sheet">底部动作面板</button></ds-button><ds-button block><button type="button" data-ds-open="mobile-picker">底部选择面板</button></ds-button><div class="mobile-row"><ds-button><button type="button" data-ds-show="mobile-success">成功提示</button></ds-button><ds-button danger><button type="button" data-ds-show="mobile-error">错误提示</button></ds-button></div><ds-button block><button type="button" data-ds-show="mobile-notice">顶部通知</button></ds-button><ds-alert tone="success" role="status">信息已保存</ds-alert><ds-alert tone="warning" role="status">请补充必要信息</ds-alert><ds-alert tone="error" role="alert">连接失败，可稍后重试</ds-alert><ds-progress value="65" aria-label="上传进度"><progress></progress></ds-progress><ds-empty><span>暂无记录</span><ds-button><button type="button" data-ds-open="mobile-confirm">新建记录</button></ds-button></ds-empty><ds-skeleton aria-busy="true" aria-label="正在加载"><span></span><span></span><span></span></ds-skeleton></section>`;
}

function mobileGallery() {
  return `<ds-nav-bar><button type="button" data-nav-back disabled aria-label="返回上级（当前为组件预览首页）">返回</button><strong>移动端组件</strong><button type="button" data-ds-open="mobile-sheet">更多</button></ds-nav-bar>
<h2 class="mobile-section-title">按钮</h2><section class="mobile-section mobile-stack"><div class="mobile-row"><ds-button variant="primary"><button type="button" data-ds-show="mobile-success">主要按钮</button></ds-button><ds-button><button type="button" data-ds-open="mobile-confirm">默认按钮</button></ds-button><ds-button plain variant="primary"><button type="button" data-ds-open="mobile-sheet">朴素按钮</button></ds-button></div><ds-button variant="primary" block round><button type="button" data-ds-open="mobile-confirm">通栏圆角按钮</button></ds-button><div class="mobile-row"><ds-button size="small"><button type="button" data-ds-show="mobile-success">小尺寸</button></ds-button><ds-button loading variant="primary"><button type="button">处理中</button></ds-button><ds-button disabled><button type="button">禁用状态</button></ds-button></div></section>
<h2 class="mobile-section-title">单元格与徽标</h2><ds-cell-group><ds-cell><button type="button" data-ds-open="mobile-sheet"><span><strong>常用操作</strong><small>展示标题、说明与右侧操作</small></span><i data-cell-arrow aria-hidden="true"></i></button></ds-cell><ds-cell><button type="button" data-ds-show="mobile-notice"><span>消息通知</span><span data-cell-value><ds-badge aria-label="2 条未读消息">2</ds-badge></span><i data-cell-arrow aria-hidden="true"></i></button></ds-cell><ds-cell><div data-cell-content><span>服务状态</span><span data-cell-value><ds-tag tone="success">正常</ds-tag></span></div></ds-cell></ds-cell-group>
<h2 class="mobile-section-title">表单与数量</h2><form class="mobile-fields" aria-label="移动端表单示例"><label class="mobile-field"><span>姓名</span><ds-input name="customer" placeholder="请输入姓名" required><input autocomplete="name"></ds-input></label><label class="mobile-field"><span>手机号</span><ds-input name="phone" type="tel" placeholder="请输入手机号"><input type="tel" inputmode="tel" autocomplete="tel"></ds-input></label><label class="mobile-field"><span>校验提示</span><ds-input invalid value="123" aria-label="校验示例"><input></ds-input><small class="mobile-error">请填写完整的手机号</small></label><label class="mobile-field"><span>备注</span><ds-textarea name="remark" placeholder="补充说明"><textarea></textarea></ds-textarea></label><div class="mobile-control-row"><span>预约数量</span><ds-stepper name="quantity" value="1" min="1" max="5" aria-label="预约数量"><button type="button" data-step="down">−</button><input type="number" value="1"><button type="button" data-step="up">+</button></ds-stepper></div><div class="mobile-control-row"><ds-checkbox checked><label><input type="checkbox">同意服务条款</label></ds-checkbox></div><div class="mobile-control-row"><span>接收通知</span><ds-switch checked aria-label="接收通知"><input type="checkbox" role="switch"></ds-switch></div></form>
${mobileSelectors()}${mobileFeedback()}
<h2 class="mobile-section-title">标签页与底部导航</h2><section class="mobile-section"><ds-tabs value="pending"><div data-tab-list><button type="button" data-tab="pending">进行中</button><button type="button" data-tab="done">已完成</button></div><section data-panel="pending"><p>当前有 2 条进行中的记录</p></section><section data-panel="done"><p>已完成的记录会显示在这里</p></section></ds-tabs></section><ds-tabbar value="home" aria-label="底部导航示例"><div data-tab-list><button type="button" data-tab="home"><i data-mobile-icon="home" aria-hidden="true"></i><span>首页</span></button><button type="button" data-tab="messages"><i data-mobile-icon="message" aria-hidden="true"></i><span>消息</span></button><button type="button" data-tab="account"><i data-mobile-icon="account" aria-hidden="true"></i><span>我的</span></button></div><section data-panel="home" class="mobile-section">浏览服务与常用入口</section><section data-panel="messages" class="mobile-section">暂无新的消息</section><section data-panel="account" class="mobile-section">管理个人资料与服务偏好</section></ds-tabbar>`;
}

function mobilePage() {
  return `<ds-tabbar class="mobile-page-shell" value="services"><ds-nav-bar><span></span><strong>服务中心</strong><button type="button" data-ds-open="mobile-sheet">更多</button></ds-nav-bar><div class="mobile-page-content"><section data-panel="services"><h1 class="mobile-page-title">你好，林晓</h1><p class="mobile-page-lead">示例预约与服务进度</p><section class="mobile-section mobile-stack"><span class="mobile-meta">当前预约</span><strong class="mobile-service-name">上门清洁服务</strong><span>明天 10:00–12:00</span><ds-tag tone="primary" plain>待服务</ds-tag><ds-button block variant="primary"><button type="button" data-ds-open="mobile-confirm">确认预约</button></ds-button></section><h2 class="mobile-section-title">常用服务</h2><ds-cell-group inset><ds-cell><button type="button" data-ds-open="mobile-confirm"><span><strong>家居清洁</strong><small>全屋清洁与日常整理</small></span><i data-cell-arrow aria-hidden="true"></i></button></ds-cell><ds-cell><button type="button" data-ds-open="mobile-confirm"><span><strong>家电维护</strong><small>清洗保养与故障检修</small></span><i data-cell-arrow aria-hidden="true"></i></button></ds-cell><ds-cell><button type="button" data-ds-open="mobile-confirm"><span><strong>收纳整理</strong><small>让生活空间井然有序</small></span><i data-cell-arrow aria-hidden="true"></i></button></ds-cell></ds-cell-group><h2 class="mobile-section-title">通知偏好</h2><ds-cell-group inset><ds-cell><button type="button" data-ds-open="mobile-picker"><span>接收范围</span><span data-cell-value data-mobile-choice="notice-scope">全部通知</span><i data-cell-arrow aria-hidden="true"></i></button></ds-cell></ds-cell-group></section><section data-panel="records"><h1 class="mobile-page-title">预约记录</h1><ds-empty><span>暂无历史记录</span><ds-button variant="primary"><button type="button" data-mobile-tab="services">浏览可预约服务</button></ds-button></ds-empty></section><section data-panel="account"><h1 class="mobile-page-title">个人中心</h1><ds-cell-group inset><ds-cell><div data-cell-content><span>姓名</span><span data-cell-value>林晓</span></div></ds-cell><ds-cell><div data-cell-content><span>手机号</span><span data-cell-value>138 **** 8000</span></div></ds-cell></ds-cell-group></section></div><div data-tab-list><button type="button" data-tab="services"><i data-mobile-icon="service" aria-hidden="true"></i><span>服务</span></button><button type="button" data-tab="records"><i data-mobile-icon="records" aria-hidden="true"></i><span>记录</span></button><button type="button" data-tab="account"><i data-mobile-icon="account" aria-hidden="true"></i><span>我的</span></button></div></ds-tabbar>`;
}

export function mobileExampleHTML({inline = false, tokens, view = 'components', runtime = mobileComponentsScript()} = {}) {
  const values = normalizeMobileTheme(tokens);
  const header = inline ? `<style>${mobileThemeCSS(values)}</style><script>${runtime.replace(/<\/script/gi, '<\\/script')}</script>` : '<link rel="stylesheet" href="../theme.css"><script defer src="../components.js"></script>';
  let head = `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>移动端组件预览</title>${header}<style>${themePreviewCSS}</style></head>`;
  head = head.replace('</head>', `<style>
.mobile-demo{padding-bottom:16px}.mobile-section-title{margin:0;padding:32px 16px 16px;font-size:14px;line-height:16px;font-weight:400;color:#455a6499}.mobile-section{padding:16px;background:var(--ds-surface)}.mobile-stack{display:flex;flex-direction:column;gap:16px}.mobile-row{display:flex;flex-wrap:wrap;align-items:center;gap:12px}.mobile-control-row{position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 16px;min-height:44px;background:var(--ds-surface)}.mobile-fields>ds-button{margin:16px}.mobile-error{color:var(--ds-danger)}.mobile-demo:has(.mobile-page-shell){padding-bottom:0}.mobile-page-shell{height:100dvh;display:flex!important;flex-direction:column}.mobile-page-content{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain}.mobile-page-title{margin:24px 16px 8px;font-size:24px;line-height:32px}.mobile-page-lead{margin:0 16px 20px;color:var(--ds-muted)}.mobile-meta{font-size:12px;color:var(--ds-muted)}.mobile-service-name{font-size:18px}.mobile-page-content ds-cell-group{margin-bottom:20px}.mobile-page-content .mobile-section{margin:0 16px;border-radius:var(--ds-card-radius)}.mobile-page-shell>[data-tab-list]{flex:none}html[data-dsh-view-mode=edit] .mobile-page-shell{height:auto;min-height:100dvh}html[data-dsh-view-mode=edit] .mobile-page-content{overflow:visible}
</style></head>`);
  const body = view === 'foundations' ? `<main class="preview-page"><h1>移动端基础规范</h1><p class="preview-lead">触控、安全区、色彩与文字层级</p>${foundationPreview(values, {scales: mobileThemeTokens(values).scales, checks: mobileThemeContrast(values), paletteHint: '6 为主色。按钮保持品牌背景，按下叠加 10% 黑色反馈；派生色阶用于弱背景和其他语义。'})}</main>` : `<main class="mobile-demo">${view === 'page' ? mobilePage() : view === 'feedback' ? mobileFeedback() : view === 'select' ? mobileSelectors() : mobileGallery()}</main>`;
  return head + `<body class="ds-theme ds-mobile">${body}${mobileOverlays()}</body></html>`;
}

export function mobileSystemFiles(input) {
  const values = normalizeMobileTheme(input);
  const files = {
    'rule.md': mobileSystemRules(),
    'tokens.json': JSON.stringify({format: MOBILE_THEME_FORMAT, version: 1, componentVersion: MOBILE_COMPONENT_VERSION, values, derived: mobileThemeTokens(values)}, null, 2),
    'theme.css': mobileThemeCSS(values),
    'components.js': mobileComponentsScript(),
    'components.json': JSON.stringify(mobileComponentManifest, null, 2),
    'examples/components.html': mobileExampleHTML(),
    'examples/page.html': mobileExampleHTML({view: 'page'}),
  };
  return Object.entries(files).map(([logicalPath, content]) => ({logicalPath, name: logicalPath.split('/').at(-1), content,
    mimeType: logicalPath.endsWith('.css') ? 'text/css' : logicalPath.endsWith('.js') ? 'text/javascript' : logicalPath.endsWith('.json') ? 'application/json' : logicalPath.endsWith('.html') ? 'text/html' : 'text/markdown'}));
}

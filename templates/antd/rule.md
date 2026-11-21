# Ant Design 6.7.0 设计规范

## 使用这个目录

本目录以 Ant Design 6.7.0 默认浅色主题为基线。`seed.json` 是源码中的种子配置，`tokens.json` 是通过官方 `theme.getDesignToken()` 生成的完整衍生 token。`css/antd.css` 由官方 `@ant-design/static-style-extract` 提取，`css/reset.css` 来自官方发行包。文件哈希及提取配置见 `provenance.json`，许可证见 `assets/LICENSE.txt`。

修改设计规范时先修改本文件。选择新的配色或尺寸后，同步更新相应 token 和 CSS，避免规则与资源不一致。此目录可以按项目需要补充图片、字体、组件说明和页面示例。

## 配色

下列值来自默认 seed 与衍生 token。

- 品牌主色 `colorPrimary` 为 `#1677ff`。
- 成功色为 `#52c41a`，警告色为 `#faad14`，错误色为 `#ff4d4f`，信息色为 `#1677ff`。
- 背景、正文、弱化文字、边线与交互态使用 `tokens.json` 中的语义项，例如 `colorBgContainer`、`colorText`、`colorTextSecondary`、`colorBorder`、`colorPrimaryHover` 和 `colorPrimaryActive`。
- 主题色阶已包含在 token 中，使用相应语义值表达 hover、active、disabled、背景和文字。

## 字体与层级

- 基础字号为 14px，字体使用系统 sans-serif 字体栈，完整值见 `fontFamily`。
- 代码使用 `fontFamilyCode` 等宽字体栈。
- 正文、辅助文字和标题使用 `fontSize`、`fontSizeSM`、`fontSizeLG` 及 `fontSizeHeading1` 到 `fontSizeHeading5`。
- 行高使用对应的 `lineHeight` 和 `lineHeightHeading*`。字号与行高的数值以完整 token 文件为准。

## 尺寸、间距与形状

- 默认控件高度为 32px，小型与大型控件分别读取 `controlHeightSM`、`controlHeightLG`。
- 默认圆角为 6px，其他层级使用 `borderRadiusSM`、`borderRadiusLG` 等 token。
- 尺寸单位与步长均为 4，布局间距优先使用 `margin*`、`padding*`、`size*` token。
- 默认线宽为 1px，线型为 solid。弹出层基础 z-index 为 1000。
- 阴影采用 `boxShadow`、`boxShadowSecondary` 等语义项。

## 组件与交互

以下是本模板的使用约定，供页面生成与实现时遵循。

- 在一个任务区域内突出主要操作，其他动作使用默认、文字或链接按钮。
- 表单提供标签、必要的输入提示、校验信息及提交反馈。错误应与对应字段关联。
- 保留控件的 hover、active、focus-visible、disabled、loading 状态，具体视觉值使用官方 CSS 或对应 token。
- 列表和表格保持标题、数据与操作的清晰层级，为空数据、加载和失败提供可理解的反馈。
- 图标操作提供可访问名称，交互支持键盘与可见焦点，状态反馈同时包含文字。
- 动效时长与曲线读取 `motionDuration*`、`motionEase*`，并尊重用户减少动态效果的偏好。

## CSS 与代码接入

静态页面按顺序引入 `css/reset.css`、`css/tokens.css`、`css/antd.css`。`tokens.css` 提供全局 CSS 变量，组件 CSS 保留官方提取作用域 `dsh-antd`。组件元素应携带提取时对应的 Ant Design 类名与作用域，参照 `examples/components.html` 中由 React SSR 生成的真实标记。

使用 React 时安装 `antd@6.7.0`，将组件置于 `ConfigProvider` 中，配置 `theme={{hashed: false, cssVar: {key: 'dsh-antd'}}}`。动态组件交互使用 Ant Design React 组件实现，静态 HTML 示例展示视觉结构。若修改主题配置，应重新提取 CSS。

## 来源与再生成

上游仓库为 https://github.com/ant-design/ant-design ，官方文档为 https://ant.design 。版本固定为 6.7.0，提取工具固定为 2.1.0。

插件内提供 `build-antd-template.mjs`。在独立目录安装这两个固定版本及 React 18.3.1、React DOM 18.3.1 后，将该目录传给脚本，即可重新生成 token、CSS、示例和来源记录。这里的组件默认值来自官方代码，布局与可访问性条目是模板的使用约定。

# DSH Designer · 设计师工作台

DSH Designer 是 DeepSeek Harness 的独立插件。在「设计师模式」里选择设计规范，用当前 DSH 会话的模型生成可交互的 HTML。可以直接操作页面，也可以在弹窗、抽屉或详情展开时冻结画面，选中元素微调，再恢复交互。项目、设计稿和静态资源保存在本地。

## 安装

在 DSH 标准模式的对话框粘贴下面这句话，确认安装后，从侧栏打开「设计师模式」。

```text
请用 DSH 插件管理器安装 https://github.com/percentcola3/dsh-designer/releases/latest/download/dsh-designer.tgz
```

也可以在 **插件 → 添加插件** 中粘贴同一个地址。DSH 会下载已构建的插件和运行依赖。指定历史版本可在 [Releases](https://github.com/percentcola3/dsh-designer/releases) 中复制对应版本的安装包链接。

## 从需求到设计稿

1. 在首页新建项目，选择设计规范。桌面端提供 Ant Design、Element Plus、Arco Design 和 HeroUI 风格，移动端提供 Vant 风格。在「设计体系」中可以先调整品牌色、圆角、字号或上传字体，预览后保存。
2. 输入页面需求，使用 DSH 对话查看生成过程、工具调用和审批。生成的设计稿以 HTML 为入口，样式、脚本、图片和字体可以随设计目录一并交付。
3. 在预览中进入要调整的页面位置，点击「冻结页面」保留当前界面。拾取元素后可拖动、调整属性或替换图片。恢复交互后可继续操作页面。悬浮工具栏也支持框选区域截图并复制到剪贴板。

已有网页可以从「网站复刻」进入，选择视口并录制经过的页面或 SPA 状态。插件通过浏览器采集页面和资源，将录制结果保存为单独的离线设计稿。依赖原站接口或尚未加载的页面，需要先在录制中走到对应步骤。

## 维护规范与源码

| 位置 | 用途 |
| --- | --- |
| 设计规范目录中的 `rule.md`、`theme.css`、`tokens.json` | AI 的使用规则、页面实际使用的样式、可视化主题参数 |
| `desktop-theme.js`、`desktop-presets.js`、`mobile-theme.js` | 内置主题、组件示例和预设 |
| `ui/`、`editor/`、`client-entry.jsx` | 工作台、编辑交互和 DSH 客户端入口 |
| `index.js`、`workspace-service.js` | 插件注册、宿主接口与项目文件操作 |

## 开发与验证

安装依赖后，在装有 DSH Desktop 的 macOS 上运行 `npm run dev`，即可打开使用本仓库源码的独立 Web 实例。调试数据放在 `.build/`。启动、端口和工作区设置见[独立调试说明](DEBUGGING.md)。

```sh
npm run check
npm run test:focused -- desktop-theme.test.js
npm test
```

`check` 在内存中编译客户端，`test:focused` 运行指定测试，`npm test` 运行 portable 回归。真实模型测试使用 `npm run test:models`，会下载测试模型。安装包内包含构建好的客户端和第三方声明。开发约定与发布流程见[贡献指南](CONTRIBUTING.md)、[版本记录](CHANGELOG.md)和[发布说明](docs/RELEASING.md)。

## 开源许可

本项目的原创代码采用 [MIT 许可](LICENSE)。第三方组件、字体及资源保留各自的许可证，详见 [licenses](licenses) 和 [Ant Design 模板声明](templates/antd/assets/LICENSE.txt)。

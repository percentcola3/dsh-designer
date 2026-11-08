# 0.4.x 工作台验收记录

本记录区分源码实现、模块/集成测试、真实 DSH 运行和界面验收。全部需求仍属于交付范围；尚未验证的项目不记为通过。逐项要求见[完整矩阵](/Users/congbai/Desktop/找文章/dsh-designer/REQUIREMENTS.md)。

## 安装前基线（2026-11-05）

已通过真实 `designer_manage project.get` 再次读取原示例，并通过文件 SHA-256 重新核对实际 HTML 字节。此轮未修改原示例。

| 项目 | 值 |
|---|---|
| 原项目 ID | `p-33f1721a-9d90-4f71-af19-66ccf566db35` |
| 项目 revision | `16` |
| 原分组 ID | `g-d2e41314-03d3-40f7-9ce8-9979284a02c1` |
| 固定体系 | `d-14cacdd0-3c7d-47a5-aaa0-78e4fb3be7db`，项目仍使用 v1 |
| Web 页面 | `a-d160d912-c5d7-4c01-8f9b-fb262790a1bc`，revision 4 |
| Mobile 页面 | `a-c9f3ac36-47a6-4cb9-b40f-6ea581c5c2ef`，revision 3 |

实际字节摘要：

```text
Web     91633f805db3f3dda24ba77acd420be65e6e5cde959bbab081122e127a972df0
Mobile  3a7cab4bfd5e86990dfb6e8cf430e058f2c9593f9701651e2af6c7fc8192b586
```

原源码为 [Web HTML](/Users/congbai/Desktop/找文章/DesignerLibrary/projects/p-33f1721a-9d90-4f71-af19-66ccf566db35/html/h-6379e352-3862-4d73-a5f3-1cae0d4b49f8.html) 和 [Mobile HTML](/Users/congbai/Desktop/找文章/DesignerLibrary/projects/p-33f1721a-9d90-4f71-af19-66ccf566db35/html/h-401e9832-078f-425b-ae5f-3dd100cc7e14.html)。

## 当前构建与回归证据

- 真实 Client 构建已通过，产物使用宿主 React，未打入第二份 React；最近一次 Lead 构建约 2554 KiB。后续源码修改后需重新构建最终包。
- 会话目录 refresh-before-retain 的原三项回归已改为直接测试真实共享 helper，3/3 通过，保留中途取消及 refresh 失败不 retain 的断言。
- 导入旧兼容、安全范围、凭据 owner-only、资源 SHA 与 canonical alias 回归 22/22 通过。夹具新增真实 Connection 接口形状，未放宽生产认证。
- 首轮联合诊断：366 项，335 通过、30 失败、1 个 opt-in 浏览器测试跳过。29 个失败由旧夹具缺 Connection 引起，另 1 个是大媒体测试适配器的 ctime 版本噪音；修复后各负责模块已复跑，但尚待最终源码冻结后统一回归。
- 当前 Host 定向回归已由集成人员报告 30/30 通过，包含真实冻结任务 admission 与 canonical commit 业务链。该结果使用 SDK 合同测试适配器，不等于安装后的 composed SDK 证明。
- Delivery / Resource / Upload 最后联测 39/39 通过（20 + 12 + 7）。包含真实临时 Git、本地裸 remote、真实子进程和 HTTP 流；70 MiB 稀疏媒体的全流/分段/HEAD/ETag 读取、版本变化拒绝、权限与取消路径均有回归。真实 DSH 文件策略仍需安装后验证。
- UI 最终纯标签/状态/冻结事务与来源隔离测试 34/34；没有 DOM 模拟视觉或 rasterizer 截图，不将这些测试当成布局与鼠标验证。

各模块的更详细测试、接口和限制记录在对应说明中：[Workspace](/Users/congbai/Desktop/找文章/dsh-designer/workspace-notes.md)、[集成链](/Users/congbai/Desktop/找文章/dsh-designer/workbench-integration-notes.md)、[文档模型](/Users/congbai/Desktop/找文章/dsh-designer/document-model-notes.md)、[AI 范围](/Users/congbai/Desktop/找文章/dsh-designer/ai-workbench-notes.md)、[AI 适配](/Users/congbai/Desktop/找文章/dsh-designer/ai-adapter-notes.md)、[来源](/Users/congbai/Desktop/找文章/dsh-designer/source-workflows-notes.md)、[截图](/Users/congbai/Desktop/找文章/dsh-designer/capture-notes.md)、[交付](/Users/congbai/Desktop/找文章/dsh-designer/delivery-notes.md)、[资源读取](/Users/congbai/Desktop/找文章/dsh-designer/resource-notes.md)、[上传](/Users/congbai/Desktop/找文章/dsh-designer/upload-notes.md)、[UI](/Users/congbai/Desktop/找文章/dsh-designer/ui/UI-NOTES.md)。

## 最终 gate 与激活诊断

最终 Lead 完整 gate：**464 项，463 通过、0 失败、1 项 opt-in 浏览器测试跳过**，3.55 秒。构建为 2604 KiB，React 外置；实际分发包含 23 文件、16 Host 模块、80 个解析后的真实 import，闭包检查通过。后续修复插件 apply 返回值后，17 项 Host 注册/清理/工具集成已重新通过。

已生成两个不可变安装包：0.4.0 为初次候选，0.4.1 包含激活契约修复。0.4.1 的 SHA-1 为 `0ca7194c3ecf1d975c93cea261c92bb7e3d361c7`，压缩大小 852465 字节。

真实安装器证据：

1. 原目录 install 返回 `already-installed`，按正常 Manager 流程 remove/reinstall，未手动修改 profile。
2. 0.4.0 包已安装，但 activation 因当前加载的 workspace 路径缺 `parse5` 失败。确认源码目录无独立依赖后，在该源码目录执行 `npm ci --ignore-scripts` 修复，未在 profile 运行 npm/pnpm。
3. 后续激活报 `TypeError: Invalid effect`。发现 Host apply 返回 service 对象，已改为 `undefined`，测试夹具同步真实 effect 合同并通过。
4. 0.4.1 已由 Manager 装入，但再次 activation 仍报 `Invalid effect`。已提取当前安装的真实 Cordis 4.1.0 运行库冷挂载修正后的 Designer：挂载 3 工具/8 路由并完整清理均成功；真实 Fiber 堆栈也确认对象返回值复现 `Invalid effect`、async void 合法。0.4.1 实际已安装文件没有旧的 service 返回。已安装文件的冷挂载也成功，源码和 installed index SHA-256 同为 `466e8b655c6f122f74080a63d62715b62233ca8be8863dd8d728ae52573b7bd4`；[持久冷挂载证据](/Users/congbai/Desktop/找文章/dsh-designer/sdk-cold-mount-evidence.json) 明确区分真实 Cordis 生命周期与业务服务 stand-in。没有公开主进程 restart/relaunch 操作。用户已选择“稍后重启”，当前等待完全退出并重开原 DSH；**没有 application: applied 的成功回执**，不声明插件已生效。安装后再次核对原两份 HTML，字节 SHA 与基线一致。

## 本轮尚需完成的实装验收

1. 最终源文件冻结后跑全部回归、构建、包文件与 ESM 依赖闭包检查，取得实际安装回执与 live Tool/Slot 注册证据。
2. 用独立临时项目走真实初始化、设计/页面编辑、重开、撤销/重做、冲突、资源、体系、来源、导出与清理；不使用原示例做破坏性试验。
3. 验证实际 composed Fs/Shell 在只读、项目工作区和明确源码写入范围下的行为，不把严格内存适配器当成 OS 沙箱。
4. 使用本 goal 同一真实 Ego TaskSpace 验证保存 HTML 的字体、背景/透明度、区域、长页面和交互，以及当前已安装 DSH 界面的实际布局/鼠标路径。
5. 核对 DSH 原生图片/文件 receipt、只读上下文快照、请求绑定、历史恢复、真实模型工具保存及两项目不串权限。
6. 核对原示例两份 HTML 字节、页面 ID、历史及体系绑定与安装前基线一致。

GUI 访问权限、Figma/MasterGo 账号和外部发布环境以本轮真实观测为准。没有可用认证时不读取 cookie/token/profile 或绕过授权，不以 mock UI 取代真实界面，也不宣称已完成账号来源或公网发布。条件之外的已授权实现与测试继续执行。

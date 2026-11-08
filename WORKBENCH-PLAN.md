# AI 设计工作台：完整交付计划与模块契约

规范来源：用户 2026-11-05 提交的《AI 设计工作台：需求与方案》。其中全部功能属于交付范围，不以旧版画板选择/静态导入能力替代。此文件为实施索引；需求中的行为优先于技术草案。

## 核心数据与兼容

- DSH 继续拥有模型、Session、对话历史、轨迹、审批和执行。插件只持有设计业务数据、内容、引用、草稿与视图恢复信息。
- 统一内容以真实 HTML 为主体，稳定元素属性 `data-dsh-node` 为对象身份。编辑操作由 Host AST 事务保存 HTML；预览运行同一保存版本，编辑覆盖层不成为另一套内容。
- 可声明交互、场景与共享对象元数据置于 HTML 内受控 `application/json` 数据块，交付 HTML 同时携带相应运行代码，避免仅在工作台可交互。
- 项目仍由现有 DesignerStore 管理，全局库保持兼容。project.json 新增 `workbench` 元数据，schemaVersion:1 旧数据可读；workbench.schemaVersion:1 独立版本。旧 artboards 不丢 ID/历史，按需映射为默认设计的页面。
- project.workbench = {schemaVersion:1, goal, requirementsPath, rulesPath, designs:[Design], sourceProjects:[SourceProject], permissions?, referenceFiles?, deliveryRecords?}。
- Design = {id:'d-uuid',name,folder:'designs/<safe-name>-<id>',platform, pageIds:[artboardId],binding:{mode:'inherit'|'independent'|'none',systemId?,version?},appliedSystem?,scenes?,createdAt,updatedAt,deletedAt?}。页面沿用 artboard ID，新增 designId、entry/scene信息。目录初始化只创建说明/需求/规则/空资源入口，不编造业务内容或页面。
- 新设计页内容可继续不可变版本保存；Design.folder 的 pages/styles/assets 为可读、可迁移职责范围，manifest 记录当前文件；旧 html/assets/imports 路径保留兼容，导出时完整复制资源。
- WorkspaceService = new WorkspaceService(owner)。owner.store 为现有 Store；owner.ctx.fs/shell 为已发现公共接口；所有写入显式 signal/policy/CAS；不得直接写 profile 或用 Host node:fs 绕过沙箱。
- 新功能共用 `execute({action,projectId,...args},{signal,policy,user,agent,...})`。Host HTTP 仍 POST /api/designer，用户/模型调用同一业务方法。通用新工具 `designer_workbench` 使用 help + options 渐进式 schema，不把每个字段撑满首轮上下文。
- UI 纯视图交互不需要新模型工具；授权、扩大权限、Git push/pull、发布/撤销和凭据写入必须 user-only。引用与目标独立，提交时冻结范围/规范；Agent 工具真实检查范围，禁止仅靠 prompt。

## 分工与写入边界

1. designer-host：`document-model.js`、`document-model.test.js`、`document-model-notes.md`。parse5 AST 稳定身份、图层与属性编辑/结构事务、交互/场景定义和导出运行代码。Lead 安装 parse5，worker 不改 package/index/store/client。
2. workspace-core（新增）：`workspace-service.js`、`workspace-service.test.js`、`workspace-notes.md`。初始化/迁移、设计/页面管理、文件/规范/资产/需求、体系继承、视图与草稿恢复；不改原 store/index/client。
3. designer-assets：`delivery-service.js`、`delivery-service.test.js`、`delivery-notes.md`。源码登记/运行/日志/映射、Git、可独立交付包、图片导出、版本化分享与撤销。只用沙箱 shell/Fs；发布功能不实际对外发布用户内容。
4. designer-browser：`source-workflows.js`、`source-workflows.test.js`、`source-workflows-notes.md`，必要时其已拥有 browser-engine 文件。多页面/区域/状态/视口采集、来源版本与差异、布局/交互证据、对比局部再生成；保留忠实/规范改版区分。复用现有 imports 服务，无账号时支持导出资料文件入口并标明状态。
5. workbench-ui（新增）：`ui/**`，React 工作台壳、内容标签/文件查看器/导航/AI引用输入/对比界面，模块化源码。Lead 接 build 与 Canvas/bridge。不得改旧 client.js、index/store/package。
6. ai-context：`ai-workbench.js`、`ai-adapter.js` 与相应测试/说明。冻结权限、原生请求绑定、只读 DSH 附件快照、真实 receipt/image 接入、渐进上下文及来源精确文件写入策略。
7. 扩展归属：designer-host 继续独占 `editor/**`；designer-browser 继续完成 Host 接线（`index.js`、`editor-service.js`）及截图服务；designer-assets 继续只读资源/Range 与流式上传服务。WorkspaceService 的冲突协调、项目复制和体系资源逻辑路径由 workspace-core 单一写入。分配范围以共享任务和最新 Lead 消息为准，交接期间不并发改同一文件。
8. Lead：构建、包清单、Client 入口、跨模块审查、统一回归、安装、真实 SDK/GUI 验收与需求证据；最终运行与权限边界不以 worker 单元测试替代。

## UI 模块契约

- UI 以 ESM JSX 源文件构建为既有 ModuleLoader client.js，React 为宿主 require 外部依赖，不能打入第二份 React/私有 DSH Client 包。
- `ui/Workbench.jsx` 导出 Workbench({ctx,t?,Canvas,api,onExit,legacy})；api(action,args) 为现有 owner authenticated POST helper，结果为 value 或带 code/details 的 Error。
- Canvas 为 Lead 提供组件，props {project,design,pages,documents,activePageId,selection,mode,scene,viewState,onSelect,onNavigate,onChange,onViewState,onReference,onDiagnostics,readonly}；onChange 传 {pageId,operations:[...],expectedRevision,summary} 调新 edit.apply；Host 成功后返回真实保存内容更新 documents。
- 内容 Tab identity = projectId + resourceId/type，不以显示名称判断；state保留 preview/pinned/dirty/mode/cursor/scroll/view。打开参考不改变 target。工作台持有 target {projectId,designId,pageId?,nodeIds?,scope:'read'|'selection'|'page'|'design'|'project'} 与 references[]，已发送任务另存冻结快照。
- 初始空项目先展示需求文档、空设计列表、新建设计；新建设计三同级入口 需求生成/网站复刻/MasterGo还原（保留Figma作为支持来源）。
- 设计师仍使用 shell.overlay 占满工作区，默认 DSH sidebar 隐藏；原模式退出恢复原状态。

## 关键后端动作（各 worker 可扩展，但尽早确认返回值）

WorkspaceService: workspace.open, project.initialize/clone, design.list/create/update/clone/delete/reorder, page.list/create/clone/delete/reorder, binding.resolve/preview/set/apply, file.tree/read/write/create/rename/move/remove/copy, asset.import/replace/copy, workspace.state.get/save, draft.get/save/remove, reference.resolve。读返回 {project,designs,pages,files?,...}；变更返回 {project,design?,page?,projectRevision,...}。
Document model: normalizeDocument(html,{previousHtml?}) -> {html,tree,nodes,interactions,scenes,diagnostics}; applyDocumentOperations(html,operations,{scopeNodeIds?,scopeMode?,...}) -> 同shape+changes；validateDocument；resolveReferences；纯函数不写Fs。
DeliveryService: source.register/list/update/unregister/start/status/logs/stop/map; git.status/diff/branches/commit/pull/push/checkout; export.create/list/get; share.create/list/update/revoke。只读Git可模型用，所有Git写/启动自选命令/发布需user authority；模型修改已获项目范围源码仍走受控文件API。
SourceWorkflows: source.plan/select/capture/import/read/compare/refreshPreview/applyRefresh，输出来源观察、未验证交互、缺失资源、差异与可重做区域；刷新先产 diff 不发布，明确 apply 才改本地。

## 验证原则

- 单元测试用于核心事务/权限/冲突/身份/差异与持久化，不只做按钮镜像测试。
- 老版99项回归仍保留；新模块边集成边添加可复现验收用例。
- 新工作台第一版能运行后安装；视觉验证用真实 Harness 页面，禁止 mock shell/自制 rasterizer 代替。
- 私有账号来源、发布环境与系统授权若不可用，明确列出实际限制，不假称真实授权链路完成；其余已授权工作继续完成。
- 验收记录按 REQUIREMENTS.md 更新。仅当完整要求已实现并验证到适当层级才完成目标；未完成项不能隐藏成未来范围。

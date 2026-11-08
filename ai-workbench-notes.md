# AIWorkbench 接口与集成说明

实现文件：[ai-workbench.js](/Users/congbai/Desktop/找文章/dsh-designer/ai-workbench.js)，测试：[ai-workbench.test.js](/Users/congbai/Desktop/找文章/dsh-designer/ai-workbench.test.js)。仅修改这两份文件与本说明；没有改挂接、Store、Editor、其他 worker 文件，也没有安装插件。

## Owner 依赖与提交顺序

```js
const ai = new AIWorkbench(owner);
// owner.store: DesignerStore
// owner.workbench.execute: WorkspaceService 业务接口
// owner.execute: 来源读取及模型业务动作的统一 dispatch
// owner.bindings: Map<DSH agent.id, projectId>
// owner.ctx.fileUploads: 可选，原始普通附件需要
// owner.ctx.attachments: 可选，读取既有持久图片 ref 时需要

const prepared = await ai.prepare(input, { user: true, signal, policy });
const descriptor = await ai.persistTask(prepared, { signal, policy });
const {agent, sessionId} = await owner.projectAgent(prepared.project, signal, policy);
const attachments = await ai.attachmentsForSession(prepared, agent, signal);

// Lead 在其 admission/CAS 中保存可信项目锚点：
// project.workbench.lastTaskRef = {...descriptor, sessionId, requestId}
// 锚点应由 admission 私有方法维护，不能由模型 project.update 或 iframe payload 写入。
// 再由原有 owner.runAI/admitAI 提交 prepared.prompt + descriptor，content 追加 attachments。
// admission 成功前后按 Lead 的原有串行/失败回滚机制安装 ai.setTask(agent, prepared.task)。
// prompt 日志必须包含 descriptor；它只是定位信息，恢复的权威是项目锚点及 SHA。
```

模块没有创建 Agent、执行循环、聊天/轨迹存储、审批系统或自定义 DSH 事件。内存 `tasks`、`snapshots`、`descriptors` 是可从已锚定业务快照重建的权限/资料缓存，不是会话历史。

`prepare(input, env)` 返回 `{task, prompt, project, effectiveBinding, attachments, uploadInputs, attachmentOrder, context}`。`task` 和其嵌套数据均冻结；更换查看页、选区、体系和传入 input 对象不会改已提交 task。

输入支持：

```js
{
  projectId, prompt, mode: 'generate' | 'edit',
  target: { projectId, designId?, pageId?, pageIds?, nodeIds?, scope },
  // 兼容 来源工作流的 frozenTarget、旧 artboardId，以及顶层 designId/pageId/nodeIds/scope
  references: [{projectId?, resourceId|fileId|pageId|designId|sourceId|systemId,
    nodeId?, nodeIds?, sourceVersion?, versionId?, captureId?, regionId?, type?, summary?}],
  sourceId?, sourceVersion?, sourceCaptureIds?,
  sourceFidelity?: 'faithful' | 'system-adaptation',
  bindingOverride?: {systemId, version},
  allowedPaths?: ['designs/example/styles'],
  sourceWrite?: {sourceProjectId: 'registered-source-id', paths: ['src/components']},
  attachments?: [/* 实际图片/附件内容，格式见下 */]
}
```

`scope` 可为 `read|selection|page|design|project`。缺省：有 page 为 page，有 design 为 design，无页面/设计的 `mode:generate` 为 project，其他为 read。创建空设计后可直接生成页面。selection 必须有真实稳定 node ID，且 ID 来自目标页面，不能把引用或打开的文件作为可写目标。有 page 而未给 designId 时，根据当前真实所属设计推导 binding 和 designId。

`target.pageIds` 可在 design/project scope 明确提交既存页子集，只能缩小实际所属页面，不能引入另一设计/项目。task.pageIds 冻结授权子集，existingPageIds 冻结提交时项目全部既存页面；未被授权的既存页始终拒绝修改。新创建页仍可在冻结的 design/project 目标中生成/继续编辑，实际当前归属由 authorizeAction 验证；不会把生成页扩大到别的设计。binding.apply/delete 等批量操作也校验实际影响页，子集任务不能借省略 pageIds 改整个设计。涉及共享 raw files/资产替换需完整影响范围。

`admissionState(agent,{requestId,signal})` 直接查询已 inspect 的 DSH sessionController.state。running 或任何 queued/steering/context 项都算 busy，返回队列中的 rpcId 摘要；即使 Agent 尚未进入 running，也不能替换当前 taskMap。队列空且不 running 时，再在原生 Session.snapshotEvents 中找 exact user/message.data.source.rpcId，只有该消息后出现 turn/end 才算完成；未出现 request 记录仍保持 busy。Lead 必须保持原 pending admission 串行，临近 setTask/prompt 再检查 busy，以 lastTaskRef.requestId 关联当前提交；prompt 失败时恢复旧 anchor/task，避免未接受 request 永久占用。这个 helper 不执行或轮询 Agent，也不保存另一套队列/任务历史。

Task 记录 project/design/page/nodeIDs、范围、提交 projectRevision、真实 HTML 版本和 SHA-256、引用原摘要/原版本/invalid、需求规则最新版本和有界开头、原绑定/有效绑定、来源不可变版本/SHA/捕获范围/忠实度/override、显式路径授权和附件 SHA 摘要。源码登记根/修订/权限的摘要也冻结，登记变化后拒绝继续写旧任务。

`faithful` 的 effectiveBinding 强制 none，保留 submittedBinding 供历史说明；明确 `system-adaptation` 时可固定 override 的真实体系版本。支持 sourceImports 的 xv 版本，也兼容旧 imports。来源版本及每个指定捕获会经 `workbench.source.read` 校验 immutable JSON/SHA，不要求必须 latest。

## 发送前预览与渐进上下文

```js
await ai.execute({...input, action:'preview.prepare'}, {user:true, signal, policy});
// => {task, context, effectiveBinding, attachments: summaries, summary}
```

预览只读，不激活 Agent、不写任务、不上传附件，也不返回图片原始 base64。发送时重新 prepare，使当时最新需求/规则和绑定进入新任务。

首轮 prompt 提供目标、页面版本、需求/规则各最多 5000 字符、引用摘要、体系 mode/version 和资源 ID；不内联整页 HTML、整体系资源或 base64。

`context.read {resourceId,offset,limit}` 缺省 limit 6000，最大 12000；页面/体系 JSON 偏移为字符，项目文件/冻结文档使用 `offsetUnit:'utf8-bytes'`。下一次应直接用结果 nextOffset。目标页读取返回当前真实版本、hash 和 frozenVersion，便于 CAS 时保留并发用户变化；引用页/文件先重新验证精确身份和原版本。来源按冻结 sourceId/version/capture读取；体系绑定从冻结 task 读。多对象引用保留分组，不进行文本相似匹配。

`references.revalidate` 返回 `{historical,current,invalid}`，historical 保留原摘要/版本，当前失效结果另外返回。`task.get` 为有界摘要，体系详细内容由 resourceId 读取，不把大资源展开到工具结果。

## 任务存档与安全重载

`persistTask(prepared,{signal,policy})` 只接受同实例用户 prepare 产生的 task，返回 `{schemaVersion:1,id,projectId,path,sha256}`。使用 Store 的公共读写/CAS，遵守传入 DSH policy；read-only 无法写快照，明确报错，不绕过沙箱。

存档是项目 `.workbench/tasks/<task-id>/task.json`，metadata 最大 4MB；需求/规则按 30000 字符块读取并验证原 FsVersion，保存 UTF-8 字节边界、块 SHA 和位置。仅业务上下文存档，未保存 prompt、聊天、轨迹、图片原始字节。体系资源保留 immutable version/path/SHA 描述，剥除 base64 与临时 capability URL。失败的中间 chunk 不成为已 admission 的任务；同 task 重试只复用完全相同内容，不覆盖 immutable 文件。

```js
const restored = await ai.restorePersistedTask(agent, descriptor, {signal,policy});
// => {task, references:{historical,current,invalid}, descriptor}
```

恢复必须通过可信 `project.workbench.lastTaskRef` 锚点：descriptor 的 id/path/hash 和 sessionId 必须完全一致，同时当前 DSH agent 必须绑定该项目。然后验证 task metadata SHA、schema/身份和目录，验证真实选区，重新校验引用，再 setTask。**不能从 iframe 自报 task、自由 prompt 文本或未锚定 descriptor 恢复权限。** `restoreTask` 仅供已经可信的内部对象使用；跨重载一律调用 `restorePersistedTask`。

读取已存需求/规则时直接读冻结 chunk，按需验证每块 SHA，当前文档已经改动也不会丢失原长文未加载部分。体系的完整规范快照保留在 task metadata；二进制资源依赖其原不可变版本/SHA。如目标节点确实删除，恢复明确失败；不会猜相似节点重绑。

## 后端授权

```js
const authorization = await ai.authorizeAction(input, {task, agent, user, policy, signal});
// fileId 真实解析路径/readonly；拒绝伪造 path，检查目标当前所属设计、源码登记变化。
const env = ai.applyScope(input, {task, agent, policy, signal, ...authorization});
// env.target/env.scope/env.task 和 scopeMode/scopeNodeIds 来自冻结 task。

// 完整 HTML 保存也必须在 Store 写入前做：
ai.assertCommitScope(beforeHtml, afterHtml, task);
```

Lead 应在所有模型入口（旧 designer_project、designer_commit_html、新 designer_workbench）先 await authorizeAction。未知动作默认拒绝。user-only 判断不信 `user:true` + agent，权限扩大、凭据、Git 写、发布、体系绑定切换及命令/源码登记等必须真实用户动作。

read 任务不能写。页面/选区不能写其他 page/design/file。design/project 的原始文件写还要求显式 allowedPaths；外部 sourceId 必须匹配 task.sourceWrite.sourceProjectId 且路径属于明确 paths，不能借项目路径授权改外部代码。fileId 在授权前按元数据解析实际路径，仍由 Workspace/DSH 检查 canonical root、readonly 和 CAS。模型不能修改任务目录、项目元数据、历史或 Git 内部文件。

Structured Doc 操作的 scopeNodeIds 必须从 env 覆盖用户/模型输入。Editor 完成 AST/范围验证后可用私有写入环境持久化；不要把私有 page scope 回传成模型新授权。

Full HTML selection 采用 parse5 AST 比较：选中稳定根以外，其他节点属性/文本/结构、head、普通全局样式/脚本都保持；允许选中子树内修改及新增子节点，拒绝丢失根身份、偷用外部 ID、active content 注入及锁定节点改动。受控 JSON 只允许涉及授权节点的 entry；交互的 source/targets 都须在授权区域。responsive CSS 必须与 DocumentModel 实际编译结果一致，runtime 必须是原常量。shared root 修改影响任何未授权实例都拒绝。HTML/head 等全局根不能当 selection 绕过校验。

普通页面和项目的其他保存校验（资源、HTML 有效性、CAS）继续由既有 Editor/Store 处理，assertCommitScope 不取代这些校验。

## 可安装的紧凑工具定义

`scopedTool(agent,projectId)` 返回 `designer_workbench` 的完整定义但不注册；Lead 可在 installAgent 注册，并加入原 tool guard/restrict 白名单。其 `{action,options}` schema 保持紧凑，`help` 返回入口；`help options.action=<动作>` 复用 Workspace 的实际 action 字段，`help options.action='actions'` 返回按 scope 分类的动作目录。统一业务写仍回到 owner.execute。来源证据 read/compare 会转为实际 workbench.source.* namespace；外部源码 list/status/logs 保留 Delivery 的 source.* namespace。实际会写来源元数据的 plan/select/refreshPreview 等归用户动作，不允许 read task 当作只读查询执行。

`SCOPED_ACTIONS` 导出只读 action registry；`schemaHeuristic(priorSchemas)` 按真实 JSON 序列化字符数/4 报估计。基于改动前实际两工具 schema（designer_project + designer_commit_html）的重建测量：2676 字符/669 token；新 designer_workbench：567 字符/142 token，约减少 78.8%。这个比较不计 provider tokenizer 差异；若仍并列暴露旧工具，实际首轮总量需要加回旧工具，而不能宣称全部已减少。

## 图片与附件的真实 DSH 格式

已先经 Inspect 查询 sessionController、agents、attachments、fileUploads，并读取安装的 session-controller prompt admission 实现。

- Prompt 图片输入：`{type:'image',data:'<canonical-base64>',mediaType:'image/png|image/jpeg|image/webp|image/gif',name?}`。DSH admission 负责真实图片解码、模型视觉能力、数量/尺寸/字节限制及持久化。
- DSH 持久 image block：`{type:'image',attachment:{attachmentId,mediaType,bytes,width,height,name?,originalDimensions?}}`。prepare 若收到这种 ref，通过 ctx.attachments.readImage 验证并获取真实 bytes，绝不只发送路径文字。
- Prompt 普通附件必须 `{type:'file',receiptId}`，不是 durable file ref。原始 `{type:'file',data,name}` 先存在 prepared.uploadInputs，确定 projectAgent 后 attachmentsForSession 调 `ctx.fileUploads.upload(agent,{data,name},signal)` 换 receipt。此服务把上传限定到真实接收 Session，prompt admission 再验证/绑定 receipt。
- DSH 持久 file block：`{type:'file',attachment:{attachmentId,name,bytes}}`。
- 项目 fileId/path 附件通过受控 Workspace base64 读取真实内容；SVG 作为文件/只读参考，不能冒充受支持的 raster image。attachmentOrder 保持图片/普通附件原次序，task 只保存 SHA/尺寸摘要。

## 验证与边界

运行 `node --test ai-workbench.test.js`：47/47 通过，覆盖冻结目标、版本/hash、体系变化/faithful/override、精确引用失效与分组、跨项目、read/policy、路径/源码授权、fileId 冒充、嵌套参数、fullHTML 越权/CSS/script/metadata/共享定义/锁定对象、真实图片块与发送时上传、无页面生成、有界资料、长中文快照重载、可信锚点/篡改拒绝和只读持久化、既存页子集/新生成页、binding.apply批量范围、原生DSH queued窗口/exact request turn-end及混合附件次序。

Workspace.reference.resolve 必须在真实读取后核验已存 file.sha256/page.contentHash；尤其带 provenance 的 file.source.version 不能替代当前 bytes 核验。AI 恢复还会比较历史与当前摘要 hash，但不替代 Workspace 的源文件真实性校验。这个生产责任已明确交给 Lead，workspace-core 补真实集成回归。

这些是模块级及真实 Doc 模型回归，尚不代表 Lead 的会话 admission、HTTP 身份认证、锚点 CAS、实际图片模型、UI 预览或安装已联调通过。未创建测试项目/进程、未对外上传用户内容、未安装或改环境。

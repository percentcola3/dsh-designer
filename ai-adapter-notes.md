# AI adapter 挂接与只读分析

新增：[ai-adapter.js](/Users/congbai/Desktop/找文章/dsh-designer/ai-adapter.js)、[ai-adapter.test.js](/Users/congbai/Desktop/找文章/dsh-designer/ai-adapter.test.js)、本说明。必要支持修改仅在 [ai-workbench.js](/Users/congbai/Desktop/找文章/dsh-designer/ai-workbench.js)：DSH 附件快照、请求范围绑定、legacy canonical context 和延迟技能读取。没有改 index、Store、Editor、其他 worker 文件、旧服务断言或安装环境。

## Lead 的入口

```js
import {admitWorkbenchAI,restoreWorkbenchAgent} from './ai-adapter.js';

// index.execute -> runAI -> admitAI 必须透传真实 user 标记。
async admitAI(input,signal,policy,{user=false}={}) {
  return admitWorkbenchAI(this,input,signal,policy,{user});
}

// 保留 owner.runAI 原有 pending 串行；adapter 另有仅覆盖 admission 的项目锁，
// 没有新 Agent/执行循环/队列/聊天存储。
await restoreWorkbenchAgent(owner,agent,project,signal);
```

`admitWorkbenchAI(owner,input,signal,policy,{user=false})` 返回 `{sessionId,accepted,projectRevision,taskId,requestId,readonly}`。原生 API 在已入队/已记 user/message 后才抛传输错误时，仍返回 accepted:true 与 admissionWarning，保留真正已生效的任务，不错误回滚其权限。

Project Agent 若是 `ctx.agents.currentInitiator()` 且存在于 owner.bindings，始终禁止递归提交，包括传入 user:true。全局 main 工具可以继续调用普通 ai.run；user:false 的 sourceWrite 明确 USER_ONLY，不静默自授外部源码写权。源登记本身的 readonly/writable 继续由 Workspace 后端和 DSH policy 检查，不会由 task grant 自动修改。

输入项目与 target/frozenTarget 项目冲突，在创建 Session 或写项目以前拒绝。legacy 未传 mode 时，有页面按 edit，无页面按 generate；有 design 无页面可保持 design scope 生成。legacy selection 支持真实 nodeIds/nodeId、data-dsh-node 或唯一精确 HTML #id；无法精确定位时要求重选，不做模糊文本匹配或降为全页授权。

## 完整 admission 顺序

1. 读真实 project，检查删除/归档和调用权限。
2. 可写且 workbench schema 尚不存在时调用既有 project.initialize；不编造页面或业务需求。只读分支跳过初始化。
3. 复用 owner.projectAgent。只读传临时 aiSessionId 副本，避免其 store.bindSession 写项目。
4. 查询 AIWorkbench.admissionState，包括原生 running、queued/steering/context 与之前 exact RPC 对应 turn/end。
5. 从 owner.skillList 校验 project.skillNames；prepare 冻结目标/版本/绑定/引用和 selected skill 摘要。
6. attachmentsForSession 使用真实 DSH 上传 receipt，图片保留 native encoded image block。
7. persistTask 冻结完整业务快照；长规则/需求逐块读同 FsVersion。
8. 再查原生 busy，拒绝准备过程中插入的其他请求。
9. 可写分支用 Store.mutate 的当前 CAS 保存 lastTaskRef：`{...descriptor,sessionId,requestId}`。
10. setTask(agent,task,{requestId}) 后调用 sessionController.prompt，content 为真实 text/image/file receipt parts。

失败时恢复此前 task/request 绑定；只有本次 request 的 anchor 才回滚，不覆盖别人的新 anchor。回滚读取最新项目 revision，最多重试三次 CAS，保留其他并发项目修改；回滚本身被 policy/持续冲突拒绝时在原错误 details.rollback 说明，不扩大 policy。

只有项目 anchor、但 native queue 为空、未 running 且 Session 完全没有此 request 记录，视为 admission 遗留，不授予权限，也不会把下一次合法提交永久挡成 busy。已记录 RPC 但没有 turn/end、仍 queued 或 running 的请求依然 busy。

## 原生 request 与权限绑定

text 末尾有独立协议记录：

```text
DSH_DESIGNER_ADMITTED_TASK_V1
{"protocol":"designer-task/1","sessionId":"...","requestId":"...","descriptor":{...}}
```

恢复只查看原生 Session.snapshotEvents 的 user/message，source.kind 必须 user，source.rpcId 必须等于协议 requestId，sessionId 必须为当前 Agent。assistant 文本、iframe 自报 descriptor、无 RPC 的任意 prompt 文本均不用于恢复。

可写恢复还要求该 record 与可信项目 lastTaskRef 的 id/path/hash/sessionId/requestId 完全一致，再调用 restorePersistedTask 验证真实项目文件 SHA。仅有日志里的文字不能恢复可写权限。

每次工具授权还比较当前原生 Session 最后一个 RPC 与 taskRequestFor(agent)。外部 DSH prompt 不能借刚提交 task 的范围，也不能在排队竞态中使用另一个请求的新权限；不一致报 TASK_REQUEST_MISMATCH。这个映射是原生日志的缓存，不创建另一套运行调度。

## 只读分支已实现

`target.scope === read` 或调用 policy.mode === read-only 都进入只读分支。policy 原样保留，任务强制 read、无 allowedPaths/sourceWrite。只读 task 可以带 design/page 子集做多页分析。

该分支：

- 不 project.initialize，不 store.bindSession，不 store.mutate，不写项目目录，也不临时改 policy/扩大 writable root。
- 复用既有 projectAgent，通过临时 project.aiSessionId=`designer-${project.id}` 让其创建/恢复 DSH 拥有的 Session。
- 使用已 Inspect 的 ctx.attachments.saveFile 保存每个有界 UTF-8 文档 chunk 与 metadata JSON。context.read 通过 readFileStream 读真实附件并按需验证 SHA。
- metadata 最大 4MB；每个规则 chunk 最多 30000 字符/120KB。系统二进制资源仍用 immutable version/SHA 描述，不重复内联 base64。
- metadata 再经 fileUploads.uploadStream 绑定当前 Session receipt，作为真正的 file block 随正式 prompt 进入原生 DSH 日志。长规则 chunk 留在 DSH 附件服务，metadata 引用它们的不可变附件 ID/SHA。

只读 descriptor：

```js
{
  schemaVersion:1, storage:'dsh-attachment', id:taskId, projectId,
  sessionId, requestId,
  attachment:{attachmentId,name,bytes},
  sha256
}
```

恢复要求同一正式 user/message 有匹配的 durable file block，不只是文字里出现附件路径；metadata SHA、manifest admission/session/request、task identity/project 都验证。`restoreAttachmentTask` 只接受 scope:read 且无 sourceWrite/allowedPaths 的 manifest，哪怕有人构造一份有效 SHA 的附件，也不能通过该分支恢复 project/design/page 写权。规则 chunk 必须是有界附件，不能偷换成项目任意路径。

项目原文件后来修改、AIWorkbench 重建后，仍按冻结文档的 UTF-8 字节偏移读取原始未加载段。缺失的旧目标在 read 恢复中返回 targetInvalid，冻结资料仍可分析；可写 task 的目标失效继续拒绝恢复。

只读项目未持久化 aiSessionId，因此 Lead 的启动/agent-created 挂接不能只枚举 project.aiSessionId：对于真实存在项目的 `designer-${project.id}` Session，也应安装本项目 adapter 并调用 restoreWorkbenchAgent。函数会再次校验确定性 Session ID、项目绑定及原生日志，不能仅因 Session 名字像就直接 setTask。

## Skills 与 canonical legacy 内容

仅将已启用 selected skill 的 name/description/resourceId 写入冻结 task 和首轮 prompt，不内联 skill body。提示必须先读取；支持既有 designer_project skill.get，也支持 context.read resourceId=`skill:<name>`。后者调用 owner.skillOptions，继续保留原技能来源 preset/scope。

页面 context.read 总是提供 normalizeDocument(raw).html 的稳定投影，标记 canonicalized、offsetUnit:characters。所有页的分段都基于同一个 canonical 文本；version/contentHash/sourceHash 仍来自真实保存 raw。旧 raw HTML 尚无 data-dsh-node 时，selection 的 before HTML 使用相同只读 canonical 投影进行全 HTML 范围比较。规范化投影本身不保存、不扩大范围。

## Owner 需要的真实 SDK

- owner.store.projectGet/artboardGet/read/write/mutate；owner.workbench.execute。
- owner.projectAgent、bindings、skillList、skillOptions、policy。
- ctx.sessionController.state/prompt；Agent.session.snapshotEvents。
- ctx.attachments.saveFile/readFileStream（只读快照必需）；既有 image ref 额外需要 readImage。
- ctx.fileUploads.resolve/upload/uploadStream/uploadImageStream（真实 Session receipt、只读 metadata、历史重 stage）。
- ctx.sessionController.resolveAgent、owner.policy（原父策略与历史冷恢复）；ctx.fs.resolve/processPath/contains/stat/readBytes、store.target（可信 region artifact 与 canonical source 操作）。

均为已 Inspect 的公共接口。旧测试 fake Agent 缺 snapshotEvents、旧 fake Fs 缺 bounded reads、旧 ctx 未提供 attachment store 时应补公共 SDK 假实现；生产实现不会退回读取私有字段、假装只发送路径或跳过身份/哈希检查。

## 本轮追加的最终接口

`authorizeAction(input,env)` 现在必须 await，返回 `{allowed,input,policy,immutableDependency?,requiresDocumentValidation?,canonicalFiles?}`。Owner 执行时用 `authority.input || input`，该次调用用返回 policy；仅当规范化 action 是 asset.import 时把 authority.immutableDependency 放到私有 env。不能从 input 读取该标记。

- Design 默认路径来自真实 Design.folder、该设计已注册文件与 legacy 现存页面的精确路径。Project 默认路径来自公开业务目录/当前公开文件，受初始 writablePaths/readOnlyPaths 限制。显式 allowedPaths 只能缩小；项目元数据、machine state、历史、导出和引用原件不因默认路径变为可写。
- 外部单文件 target 为 `{type:'source-file',sourceId,path,scope:'project'}`；项目内为 `{type:'file',fileId,path,scope:'project'}`。两者 task.authority 独立于设计目标，pageIds/designIds 清空，不允许借 project scope 创建/编辑其它页面或设计。只查看/引用不授 sourceWrite。
- Project-file 的 fileId 是稳定对象身份。每次解析真实 canonical file，确认 project/design/page 绑定没变；仅 file.write 跟随 Core 生成的后续 immutable path。caller path 必须与实际路径一致，rename/move/copy 目的不继承此例外。context.read target-file 也按真实 stable ID 读当前版本。
- 外部 sourceWrite 只从真实 user admission 的 policy 参数派生 `authorization:{kind:'user-source-write',parentPolicy,permissionSessionId,canonicalPaths}`，忽略 caller 自报 authorization/parentPolicy。permissionSessionId 来自已 Inspect 的 SandboxExecutionPolicy.sessionId。每次写重新 resolve 原父 Session 并取当前 policy，同时验证登记 hash、readonly/writablePaths、canonical 冻结路径和原/现父策略。仅当前操作文件路径成为 child policy 的 additionalWritableRoots，模式保持 workspace-write；不改 child Session mode，不提到 danger-full-access，不把全 source root 加白。源登记被改、父策略撤销、路径 symlink 变更均拒绝。
- 模型 generic file.read/file.tree 不能读取 private machine state、project.json、Git/历史等；项目元数据走 project.get，冻结资料走 context.read，附件路径也不能偷读未发送草稿。实际用户明确选择的敏感外部源码 target 是独立精确读权限，main 模型不能伪造 originUser。项目内部 machine state 始终不能自动变 AI 文件目标/引用。

`contentOnly:true` 隐含 `existingOnly:true`。已有页面的规范应用可用 `{scope:'project'|'design',pageIds:[...],contentOnly:true,existingOnly:true}`：禁止创建/删除/管理/设置/绑定，写仅已有白名单页面 AST/HTML 与其 Design 新不可变依赖；独立 CSS/JS 文件不借此扩大范围。export.create 规范化到获准 pageIds；selection 固定当前 nodeIds 与 raster 格式，不能借 region/pageId 导出未授权页面。

selection/page 的 `file.write` 仅对实际 current registered HTML page 放行，并返回 requiresDocumentValidation:true 与可信 input.pageId。Owner 必须保留 `workspaceOperation -> editor.write -> editor.prepare -> AIWorkbench.assertCommitScope -> Core`；不能把它直接转成 raw Core file.write。普通源码 HTML、其他文件、伪造 path、readonly 都不适用。原 task.scope 不变。

## 区域截图、原生上传与资源复用

区域 ref 按真实 project.workbench.deliveryRecords.exports 的 exportId 找锚，验证 manifestHash、project/page、artifactPath/SHA/MIME/byteLength，读取真实 bounded FsTarget bytes 并再验证稳定 FsVersion 与 SHA。只信 manifest.capture 元数据和 requested.region，忽略 caller URL。同 export 去重后成为真正 native image part；task/历史只留摘要，不存重复 base64。

可信 boundsVersion 标准为 `{pageRevision,sourceHash,viewport:{width,height},scene}`，sourceHash 来自 savedSourceHash / sourceVersion.sourceHash；serialized sourceHtmlHash 仅表示 render HTML。兼容 caller 已有的可选 basis 字段，不因新增 optional 字段拒绝旧引用。当前页已变化时仍附原 immutable 图，标 historical:true/staleBounds:true/canLocate:false，提示旧几何不能定位/授权当前编辑。锚或 artifact 缺失、篡改、伪造 path/bounds 则 invalid 且不附图。

UI attachments 直接传原 native `{receiptId,file}` 或 `{receiptId,image}`。prepare 用 fileUploads.resolve 检查真实接收 Session；最终 prompt 始终 `{type:'file',receiptId}`，原生 controller 决定 image/file block。image receipt 参与真实 imageLimits 数量/总 bytes 计数，所有 encoded images 再经 validateImage。真实 imageLimits 字段已 Inspect：maxImageBytes/maxImagesPerMessage/maxMessageImageBytes/maxImagePixels/maxImageDimension/mediaTypes。

退休 receipt 若同项目原生日志有真实 durable attachmentId，可通过 readFileStream→uploadStream 或 readImage→uploadImageStream 重 stage；不会把大文件重放进 Web JSON ingress。没有本 Session stage/history 证据的 arbitrary ref、伪造 MIME/尺寸和 foreign receipt 均不可信。

公开 readonly resolver：

```js
await owner.aiWorkbench.resolveAttachment(
  {projectId,receiptId?,attachmentId?}, {signal,agent?}
); // {type,attachment:trustedNativeRef,source:'stage'|'history',sessionId,requestId?}
```

ResourceService 可直接复用，也可 Owner 设 resolveAttachmentReference 薄别名。它不返回本机路径、base64 或 GUI capability URL。history 只读正式 user/message 的实际 image/file parts；不信文字里自报的 ref。

scoped action `attachment.list` / task.get.attachmentResources 提供正式接收的 native refs，标 projectAsset:false。`asset.fromAttachment` 参数 attachmentId、expectedRevision、name?、project scope 下 designId?：从本 Session 正式历史取得可信 ImageAttachmentRef，调用真实 readImage，复制原生像素到允许 Design/assets 的全新路径并走 Core asset.import。返回真实 fileId/path/MIME/hash/version。scope read 拒绝；page/selection 仅该新 immutable dependency，原 task.scope 不变，原参考图不修改。Vision 图片本身不冒充已交付的项目 asset。

`asset.fromSystemResource` 处理“已绑定、尚未 binding.apply 的新生成”资源交付：只接受本 task effectiveBinding 或当前 Design per-target application 中的 pinned resourceId。缺旧资源 SHA 时在 prepare 经真实 system.resource.read 内部读取并冻结 SHA，不改共享系统；复制时再核对 SHA/MIME。单个字体/raster 复制该资源，CSS/HTML 等带相对依赖的资源保持整份归档逻辑层级，实际 bytes 只在内部 Core 调用流转，模型只收到 resourceMap。先验证/复用已 materialize 的 application map 或当前任务完整依赖组；否则在 Design/assets 新建唯一不可变组。原 policy、target 和 page/selection 私有依赖边界保持不变，global 原件 readonly。请求字段 resourceId、expectedRevision、designId?、applicationId?。没有归档文件的 legacy inline resource 要先通过正常规范库导入/保存，不伪造交付路径。

## 原生历史 carrier 与多 Design 规范

首 text 首行固定：

```text
DSH_WORKBENCH_REQUEST {"requestId":"...","userPrompt":"...","taskDescriptor":{...},"attachmentSummaries":[],"referenceSummaries":[]}
```

导出 REQUEST_CARRIER_PREFIX 常量。userPrompt 保留原话且从后续 prepared body 去重，仅用于展示；安全恢复仍使用尾部 ADMITTED_TASK_MARKER、真实 RPC、file block、SHA 和项目锚，首行 carrier 不是权限凭据。attachmentSummaries 保存当前实际 staged receiptId→durable ref/type/name；业务 metadata snapshot file 不作为用户上传材料写入 carrier。

Host binding.apply 的多 Design 批次仍只提交一个原生请求。传入 bindingApplications:[{id,designId,systemId,version,scope}]；prepare 对比 project.workbench 的可信 request，检查真实页还在原 Design 且 scope 未超 target，再冻结 per-target matrix。task.effectiveBinding.mode 为 per-target，systems 按 version 去重冻结；task.bindingApplications 与首轮上下文只放轻摘要/资源 ID。`context.read binding-app:<requestId>` 返回冻结 application、system 与真实 resourceMap。随后改变项目默认绑定/最新 system 不影响旧任务。

resourceMap 直接复用 Core applyBinding 已真实复制的资源：`logicalPath -> {logicalPath,resourceId,fileId,path,sha256,mimeType,fsVersion}`，实际 path 保留完整 logical 相对层级。AI 不重新猜字体文件名、不重复复制资源，不把多个体系替换成 project default。矩阵不能扩大 target，也不会增加原生队列/Agent loop。

## 验证

已实跑：`node --check ai-workbench.js && node --check ai-adapter.js && node --test ai-adapter.test.js ai-workbench.test.js workbench-integration.test.js`。

结果 111/111 通过：46 项 adapter + 原 47 项 AIWorkbench + 18 项真实 Store/Workspace/Editor 集成。涵盖完整顺序、busy/queued、回滚/重试、只读零项目写与附件快照重载、原生双锚/RPC、真实 region vision 与历史 bounds、image/file receipt/session/caps、3MiB 普通文件流式重发、source canonical 文件窄策略与原父 Session 撤权、单 fileId 两次真实 immutable 保存、contentOnly、选区全文 HTML、per-target 体系矩阵重载及原 scope 安全回归。

测试使用真实 AIWorkbench/DocumentModel 与按公共 SDK 实现的内存 Actor。未执行真实模型生成、未安装插件、未改旧服务单测断言；Lead 仍需跑 index 集成与实际 DSH Session/附件服务验收。

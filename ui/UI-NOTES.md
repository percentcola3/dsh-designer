# Workbench UI implementation handoff

## 2026-11-08 · 三类资源统一卡片布局（界面集成包0.4.19）

设计体系/知识库/技能共用resource-gallery-styles：顶部只有无框搜索、主新增及小型更多，去掉页面大标题和介绍；相同min240px网格、12px外角/8px控件、约191px卡片、三色alpha icon、两行简介、metadata和底部打开，无hover位移。体系保留创建/导入/版本/资源/草稿，导出/复制移卡片更多；知识库首页改库级卡片，点开独立目录详情，返回保留库名筛选，文件query独立，预览/下载/导入/绑定/归档/index状态与job/CAS保护保持。

技能项目选择移更多操作，卡片仍读原生skills.list/skill.get、project.update技能名单CAS。只读核对公共宿主确认无持久化skill新增RPC/管理页，未用runtime注册伪装安装。新增入口是本地标准Markdown文件表单，安全引用name/description生成frontmatter+真实正文，下载name.md；明确待安装，放入DSH技能目录后刷新才进实际列表，不写宿主目录/跨项目数据。关闭可保留/丢弃草稿，整体guard已接。

全量1181：1179通过、0失败、2环境跳过；新增6项技能序列化/文件名/注入/dirty测试。首轮原Git smartHTTP测试夹具child.stdin出现一次EPIPE，单文件12/12通过，按test-concurrency4重跑全套通过；未修改Git实现或测试。

Ego本目标唯一Space59/p1，实际Workbench/LibraryPanel/KnowledgePanel/CSS，明确mock metadata/content服务（非真实索引/账号/模型/业务HTTP）。桌面1440卡片246.7×191、无工具栏大标题；浅色3面板及深色390截图检查，390宽scrollWidth390、card283三页一致。操作了体系筛选/真实表单打开/新增选择、KB筛选→独立详情→内容query→真实夹具文件preview→返回保留query、技能正文/选项目启用CAS和真实浏览器下载gallery-review.md；下载不伪插卡片。结果在.build/resource-gallery-qa与resource-gallery-final-tests.tap。

打包期间工作区有并行Native Session恢复及资源捕获修改。本轮保留工作区源码和版本字段，审查ExactSessionAgents/恢复入口后，建立包含已完成修复的完整隔离快照0.4.19，补齐client-session.js打包；在公开cwd运行最终快照全量1218：1216通过、0失败、2环境跳过。资源采集预算测试原先假设串行请求，隔离快照测试显式concurrency1验证耗尽后不再请求，并按错误集合检查；不改运行时以迁就断言，工作区并行方也已更新为串行预算测试。17/18候选未安装。最终目录.build/resource-gallery-final-0.4.19；官方管理器安装0.4.19成功，application=restart-required/restartReason=package-moved，需重启DSH，不能只刷新宣称已应用。最终fixture指向该快照做3面板smoke均4卡/零错误，5个面板相关源文件与工作区逐字节一致。工作区本地调试使用自己的版本字段，已合入本轮UI。未声称已登录生产DOM、真实索引/账号/模型验收。

## 2026-11-08 · 参考三色、紧凑项目卡片与新建弹窗（0.4.15）

用户要求按参考图三种颜色+透明度收敛主题、去除AI渐变、缩小卡片、无边框输入和统一圆角，平台/产物类型回到新建项目弹窗，hover不浮动。从原图纯色内部区域采样blue #1744F4 / coral #FF586F / violet #2803B1；白灰/中性深底配三色08/16/24 alpha，品牌主操作blue，secondary/提示violet，小面积coral。标题纯色；无预览项目用7%品牌淡底+文件glyph，保留已有真实iframe缩略图，不动用户设计内容。画布格线/透明图片棋盘属于几何背景，保留。

圆角tokens主表面/card/composer/input/modal12px，小控件/menu/tab8px。composer与字段默认border0，文本聚焦用底色/label变化不画整圈边；按钮键盘focus轮廓保留。项目预览16:9，底栏46px，home/manager grid auto-fill min240（窄容器220），取消3张巨幅卡片固定列；hover只有底色与inset边线变化，位置尺寸/transform不变，generic v2 card也移除translate/增影。

HomePanel不再显示平台与HTML/React/Vue下拉，发送先进入WorkbenchDialogs.homeProject确认；取消不调用任何创建/AI接口且保留草稿/引用/附件/准备的Session。确认后使用选中platform/artifact继续原Native会话采用、规范绑定、范围和CAS；已有project checkpoint重试锁定原类型并复用IDs。项目管理实际入口由inline表单改Modal，含name/group/platform/artifact；group仍可inline。普通创建弹窗与manager共用createProjectWithOptions，create后立即记录checkpoint，initialize或refresh失败不会再次创建。0.4.14已交付的React/Vue源码画布、编译和选择区修改保持。

全量node --test *.test.js ui/*.test.js editor/*.test.js：1175项，1173通过、0失败、2环境跳过；其中home/options/native-compose27项取消零API、mobile/react及Vue选项、采用/引用/附件/规范和重试流程验证通过。后续纯文案/glyph/样式细调经整包编译和浏览器再查，不重复整套。

Ego Space57/p1真实Workbench/HomePanel/ProjectManager/WorkbenchDialogs+全部实际CSS，以明确mock-service UI夹具和合成项目验收（无真实模型或业务HTTP，Canvas为合成显示adapter）。1440桌面卡片249.6×186.4，hover前后rect完全相同/transform none；composer边框0、圆角12，home select数量0。已实际操作首页取消（create0/ai0、草稿保留）、确认mobile/react（创建参数及fake AI受理各1）、manager创建web/vue无AI；浅/深色、390px首页与350px弹窗无横向溢出，真实缩略图和新文件glyph均检查。最终图片与说明见.build/style-polish-qa，测试日志.build/style-polish-tests.tap。当前宿主60156匿名HTTP统一401；官方插件管理器确认0.4.15已安装启用，安装文件与源码哈希一致。管理器返回restart-required（package-moved），必须重启DSH后当前运行实例才加载新版，未声称已热激活、读取生产认证或已登录宿主DOM验收。

## 2026-11-08 · 诊断与对话优化入口（0.4.13）

新增只读 DiagnosticService：diagnostics.run 按 environment/generation/assets/knowledge 返回聚合证据、问题/建议/待确认与指南；diagnostics.catalog/guide 渐进提供环境、生成、资产、知识库、组件交互、迭代复查和框架边界七类中文内容。版本、运行时、服务注册可观察；真实模型/网络/视觉/交互没有实测就保持待确认，不用主观质量分数。未将此前讨论的 React/Vue/Rsbuild/代码库提炼方案标作已实现。

普通模型对话只读环境与静态指南；项目 Agent 使用冻结任务与准确项目/Design/pages/bindings/knowledge refs，避免同项目其他Design和库枚举；owner GUI可选当前项目或有上限的工作空间聚合。没有shell、模型配置读取、网络、探针、文件正文、索引或写入副作用。contextSessionId先按既有原生权限解析再移除，guide/catalog wrapper projectId精确校验。修复与优化继续通过现有范围/CAS，摘要不授新权限；不新增自动修复或自改插件接口。

设置与项目设置增加紧凑、默认收起入口。展开才请求报告，问题优先，健康/不适用项收起，支持分类、重试、按需指南。可复制最多7000字符的脱敏摘要给普通DSH对话；剪贴板失败显示手动复制区域。没有接到设计器首页生成流程，不静默发消息/建项目。可选onAskAI只为真正原生草稿入口预留，当前不传。环境白名单展示权限模式/系统/架构，证据字段转中文；资源README占位不当作真实媒体资产或缺来源错误。

专项/真实HTTP覆盖全局模型发现、owner/auth、只读任务及文件目标、guide分页、跨项目拒绝、同级Design隔离、未知字段/secret不泄、d-体系和真实Store/Workspace/Knowledge投影schema。最终全套1026项：1024通过、0失败、2环境跳过。构建/pack验证另做。

Ego同目标Space54/p1使用真实Settings/Diagnostics组件+真实apply/HTTP/受限Fs的合成测试服务，已操作展开、分类、七主题catalog、feedback正文、实际clipboard复制、Network阻断导致真实失败与恢复、项目范围；桌面浅色1280与深色390截图均检查，390宽无横向溢出。测试服务实际写入和shell执行均0；无真实模型或生产cookie读取，隔离owner不等于已登录生产GUI验收。证据保留.build/diagnostics-qa与diagnostics-final-tests.tap。

## 2026-11-08 · 用户修正：目录式知识库、免准备模型、导入后自动索引（0.4.9）

撤回前版“BM25也必须先准备16M”的默认产品流程。该限制来自zg高层组合索引，而官方Zvec0.7原生标量FTS实际不需要vectors或embedding。已用固定源码内联wrapper的7个官方原生导出建立真正FTS-only索引，默认backend=zvec-fts、vectorEmbedding=false、indexRequiresModel=false、model.required=false。无需模型缓存、setup或联网。DSH公开模型API目前只有聊天生成，未提供embedding，本次没有读取provider密钥或伪造向量；项目AI继续使用DSH当前模型通过BM25/read理解资料。旧向量索引仍兼容其原有模式。

页面全面收敛为目录/文件树、导入本地、导入Git、简短状态和搜索。模型/引擎/算法大面板移除；改名、项目挂载和归档恢复收进更多。全局导航与标签使用明确书架library图标。原生目录picker只选导入源，不切换设计库root；无nativepicker时保留浏览器文件/目录入口。文件原件可预览下载，PDF等只保存原件仍如实标注。浏览器begin→rawupload(batchId)→complete一次索引；本地/已有项目和Git按异步job扫描/fetch→批量保存→自动索引。部分失败/取消/CAS保留成功文件，重复路径更新活动文档但保留旧原件。

Git为内置只读浅fetch/readTree，不依赖系统Git、不checkout/push/执行hooks或代码。使用既有trusted SSHprofile/一次性HTTPtoken，凭据不落公开metadata。实际Node环境代理已用不可直连域名+本地HTTP代理证明生效；macOS仅在显式Git获取时读取既有系统proxy并传进程env，无全局改动。扫描前跳过隐藏/依赖/keyfiles，拒符号链接/私有managed库源，扫描整个工作区时避免自吞设计库。

UNKNOWN_ACTION的精确文本是旧dispatcher等价指纹，当前源码知识动作不会落designer默认分支。新增公开静态meta/version/instance及业务header，且真实HTTPapply/dispose/reapply/owner/origin回归通过；生产60510已实际GET验证0.4.8新fingerprint，工具、meta和业务401响应同一实例，证实新后端已加载而不是只更前端。业务owner gate未绕过。0.4.9收录最后import源路径安全修正，版本由package元数据自动取。

实际Native0.4.8固定常量语料健康检查：已有单UUID缓存write-scope构建、另一个真正read-only/full-OS-enforcement进程查询、Host最后清理，ran/available/buildSucceeded/querySucceeded/readOnlyEnforced/cleanupSucceeded全部true。FTS直接readonly开源索引不创建临时区，查询前后整个索引目录及文件SHA/mtimeNs/mode均不变；trueRO和权限撤销现在仍能只读搜索，不借缓存扩权。最后全套932项：931通过、0失败、1既有nested macOS sandbox环境跳过。

真实隔离HTTP服务已亲自跑完整本地导入→自动ready→BM25正分命中、Git smartHTTP导入→自动ready、raw批次封口→自动ready→命中新文件、中文原件能力链接真实200流读取、缺失Git仓库真实failed；无fake API/无模型缓存。这是合成资料测试服务，未替代生产登录态整页验收。Ego45在同一目标长时段后丢失且无可恢复空间，本轮没有新建空间绕恢复规则，因此目录页最终浏览器390px视觉复验未做；JSX与目录/批次状态测试已过，不宣称视觉通过。相关证据保存在根目录.build/knowledge-auto-qa与knowledge-auto-final-tests.tap。

## 2026-11-08 · 草稿会话权限修复与全局 toast（0.4.7）

截图 ai-compose 草稿 SHA-256 与 acd8936e... 精确对应。原路径来自旧 debug 库，项目 aiSessionId=null；旧 AIPanel/Workspace draft/state 调用省略contextSessionId，被legacy.api注入remembered Chat身份，从而在错误工作区策略下写入。新 project-machine-api 协调器为draft.get/save/remove、workspace.state.get/save与可见原生composer共享一次正式composer.prepare，得到实际项目Session后首次请求即绑定；队列保留所属项目，不读当前标签，不在拒绝后换身份/重试。普通项目业务API、克隆和共享规范不被此机器状态API重绑定。后端拒绝bound Session跨项目，并从已注册store.target校验canonical边界后收窄原生policy，不改模式/扩根。

Workbench全局错误从布局内ErrorBox改为右上固定ErrorToast，权限错误显示简短中文，原始代码/路径保留于折叠详情；可关闭、9秒自动消失，悬停/聚焦/展开详情暂停。AIPanel操作错误转交同一toast，任务失败状态仍独立保留，草稿保存错误不伪装成AI任务失败。表单/对话框就地校验保持其上下文。

Node22全套888项，887通过、0失败、1跳过；npm真实文件集/导入闭包59文件34host模块152imports通过。真实原生Fs验收：默认workspaceRoot为 .build/designer-draft-toast-qa/workspace，注册项目在其外同级external-project；首个draft/state写携带designer-p-draft-toast-native并200落盘。通过原生权限菜单降为只读后，同一Session写403且仅一次；磁盘仍是之前成功的草稿，输入保留未保存文字；toast自动收起、设计栏top仍48、无顶部错误横幅。截图 .build/designer-draft-toast-qa/toast-real-readonly.png。

官方安装0.4.7 tarball（.build/designer-draft-toast-deploy-20261108/）保留现有配置，已active；主60510运行态只读Inspector证实HTTP/tool同script7881且新guard/canonical校验已生效。client SHA256 0e54f5acb21bd8f7d29802a2b7309ae95236f19fd2d26941fb6a8e84ceac6045；index f7f39dedeaf88f0c8c16f4a37c953cfa3272d9956ca22d521f81d9377eaa3f11。

另查明用户截图所在旧60672调试Host从11/7运行至今，link源码但HMR root=[]，不能用磁盘更新推断backend热更。已核对PID/端口/cwd/overlay后优雅停止旧PID88889，保留DSH_HOME、workspace、debug.patch.yml与60672端口，用官方CLI启动同一实例（managed job bash-2026ad8491dc4df6，留给用户持续使用）。在原项目p-123efd60-3d51-47a7-ac0b-d1c6cb783d78上不改输入内容验收：composer.prepare从原remembered Chat上下文成功、随后的state/draft首写均使用designer-p-123efd60-3d51-47a7-ac0b-d1c6cb783d78并200，无错误横幅/Toast。未读取原用户Session正文或凭据，未迁移项目、扩大沙箱或运行安装脚本。

## 2026-11-08 · zg 本地知识库与原生缓存隔离（0.4.6 已应用）

新增独立「知识库」页，支持创建/编辑/归档恢复、文件及代码目录原件上传、原件预览下载、项目挂载与画布 AI 的 @ 知识库选择。项目挂载自动准入，额外 @ 仅准入当次固定内容版本。代码目录先验证全部结构路径，再跳过私密、隐藏及依赖目录，展示实际保存/跳过数量；服务端仍独立拒绝私密路径和穿越。任意原件可保存，当前仅支持受限 UTF-8 文本与代码投影；PDF/Office/图片/音视频无解析/OCR，不伪装可检索。

采用可复现构建的官方 zg0.2.1 SDK、Zvec0.7.0 JS 包装和静态 Potion16M 模型；上游源码、许可证和 tar/artifact 完整性可核对。官方平台预编译绑定直接作为 optional dependencies，未运行安装脚本、未批准构建脚本、未更改 profile 构建许可；不包含 Python、数据库/MCP 服务或 Transformer/ONNX/LLM 后端。脚本约386KiB、当前macOS运行依赖约84MiB，模型约32MiB首次显式准备。官方索引即使只查 BM25 首建也需要模型；一个不可变索引供 BM25/semantic/hybrid。索引和检索禁止隐式联网/模型下载，模型准备有真实进度/取消并按现有系统代理工作。

实际宿主检验暴露 Zvec readOnly 会 O_RDWR 打开并更新 Proxima，以及原生只读沙箱拒默认系统临时区。因此查询仅操作有界独立副本：已有现场原生写权限且冻结任务允许写时，在项目 `.workbench/zg-query-cache/<uuid>` 内创建私有机器缓存，双权限/项目身份校验后将 helper 唯一写根收窄到该目录；原库、原索引和业务文件不在任何写根。真正只读目标/原生权限不升级，平台临时区也不可写时明确失败，原文读取仍可用。prepare/scopedTool/context.read/main dispatch 全链保留真实 actor、任务与现场 nativePolicy/queryNativeScope；模型 payload、旧环境重放和撤销后的冻结证明不能恢复授权。取消和完成均按 nonce、canonical path 和 inode 清理。

AI prepare 真正 BM25 召回并带 path/line/sourceVersion 引用，总知识上下文≤16k；模型只允许 exact task refs 的 search/read/resource.list。原件能力、配置、安装、索引、绑定保持 owner-only；文档/注释按不可信资料处理，不改变用户目标或项目写权限。内容变化/归档使引用和索引失效，名称描述变化不强迫重建。

最终全套877项：875通过、0失败、2跳过（既有可选Chromium捕获、当前Harness禁止nested macOS sandbox-exec）。包含真实16M、三模式、AIprepare→search/read/context链、原文件sha/mtimeNs/mode不变、只读/撤销/伪造拒绝、Node权限只准单缓存根、SIGTERM清理、任意原件与CAS。官方管理器0.4.6 application:applied；实际宿主 workbench.status 返 available:true/queryReadonly:true/queryReadonlyScratch:true/queryIsolation:workspace-cache，默认临时区失败问题已用既有授权内独立缓存解决，无新增可写根授权。安装时 model:missing 是首次显式准备的预期状态。10个后端/SDK文件与源码一致；安装Client与0.4.6不可变发布包一致并确认包含全部知识库新功能，源码Client随后被独立UI任务重建，不回滚该任务生成物。

浏览器仅用本目标TaskSpace39，实际组件+受控API验收模型准备确认/取消、索引、三模式控件、来源预览、真实File多文件上传及stale禁检索、@精确只读引用、项目挂载、归档恢复、明暗和390px边界；原生目录选择自动化未成功，目录路径及私密跳过由状态/HTTP测试核实。宿主60510需认证，未绕认证，也未将夹具当登录态整页验收。证据：[最终回归日志](../../../.build/designer-zg-native-release-tests.tap)、[安装验收与hash](../../../.build/designer-zg-qa/acceptance.json)、[浏览器操作记录](../../../.build/designer-zg-qa/browser-actions.json)。

## 2026-11-08 · 用户修正：白色高亮、纯色按钮、补足红色

侧栏当前项与顶部当前标签均白色背景，去掉紫色填充与彩色描边，标签保留细中性灰边和轻投影；选中图标、文字与关闭按钮固定深紫，暗色白底时仍可读。移除action-gradient变量及其全部消费，主要按钮/发送使用纯蓝色（浅色#4f5fd5），hover也为纯色。默认封面由偏粉紫改成蓝→紫→明确的珊瑚红（--cover-red:#ff5365，8种tone小幅变体），保持直接铺满、无窗口装饰；白灰中性表面不变。

浏览器在设计体系页断言侧栏/标签背景rgb(255,255,255)、无背景图，真实“新建体系”按钮背景rgb(79,95,213)、无背景图；视觉截图 .build/designer-white-highlight-qa/systems-light.png、home-light.png。单独同步客户端并官方重挂后phase active且文件一致，SHA-256 8d63cf97d8230f97904f924fc8b39567b8cf2ec9984665426d606b0316ff1ad4；上一版client-before.js在同验收目录。

## 2026-11-08 · 用户修正：白灰底与直接渐变填充

用户明确不要浏览器窗口装饰，主题色只点缀关键位置。默认封面现在为单一 .wb-project-cover，渐变直接铺满预览区，无黑底/边框/内边距/顶栏/三色圆点。真实已有设计预览保持不变。明亮主题首页#fafafa、顶部/侧栏#f5f5f6、面板#fff，其他背景按中性白灰层级；暗色为中性炭灰。撤去大面积紫粉/蓝色框架、首页光晕与设计栏染色。彩色限定在选中标签/导航、主按钮/发送、焦点与标题关键词；普通hover、字段、聊天块为中性灰。

26项卡片/预览回归通过；浏览器断言封面与预览区等宽等高、装饰节点不存在、首页/侧栏/顶部无背景渐变，明暗截图 .build/designer-neutral-theme-qa/home-light.png 和 home-dark.png。已明确复制客户端并官方重挂，启用后文件一致、phase active，SHA-256 574edcbeef23dd9e3762fde25b12add12492e063d5116fbf349182d01c064500。上一版回滚产物 .build/designer-neutral-theme-qa/client-before.js。

## 2026-11-08 · Arc 风格主题与默认项目封面

浅色采用淡紫/浅粉/冰蓝的框架渐变与暖白面板，深色采用紫灰底、薰衣草文字和紫色主按钮；主题变量覆盖侧栏、标签、首页柔和背景、标题渐变、输入框、画布/编辑器、AI 面板及原生底栏/弹出菜单。品牌图形保留，默认色改紫；主要文字和按钮状态对比度4.68以上。发送按钮使用brand-action/on-brand，避免深色下淡紫底搭错图标颜色。

默认封面替换旧几何波浪：黑色背景、圆角微缩浏览器窗口、深灰22px标题栏、三色圆点、左紫蓝到右珊瑚粉的柔和渐变及左下薰衣草色光。8种稳定tone统一同色系。预览判空仅识别原始/规范化的初始空文档（含受控model/runtime/hide样式），已有真实页面及未知CSS/节点保留；不修改保存的设计内容与原安全sandbox。

Node22前端200/200测试通过，含空白回退、真实预览保留和卡片操作；验收1440px明暗首页、深色画布/AI面板及390px无横向溢出。最终图片在 .build/designer-arc-theme-qa/home-light.png 和 home-dark.png；前版产物client-before.js可回滚。

本轮检查发现已安装client与工作区已不共用inode，不能沿用上一轮硬链接假设。明确复制且校验客户端单一产物后官方set_bundle关/开，application=applied、fiberPhase=active，启用后哈希一致：2a17ffa96377a39769a17751cec8b54df52c66befb3b292c159d50537cd93015（8974131字节）；未重装包或变动无关后端及依赖。

## 2026-11-08 · 首页放大输入与会话连接恢复

首页输入框由780扩为920px，默认文本区100增为140px、最高320px；首页内容区扩到1440px、左右内边距36px，1440px验收中最近项目左沿由约196移至92px。共享输入栏取消顶部横线，普通工具按钮24px、发送28px、图标14–16px；权限显示短标签，默认体系/模型显示“规范”“模型”，完整名称与权限语义保留在title、aria-label和菜单。

当前60510真实HTTP handler与工具服务经只读运行态诊断确认同代，已识别composer.prepare，未发现旧路由仍占用；不据截图断言当前服务仍旧。前端准备步骤仅对UNKNOWN_ACTION/SERVICE_DISPOSED明确拒绝做有界200/600/1200ms重试，其他权限/身份错误不重试、不回退其他Session。失败按钮直接“重连”；成功后首页清除准备旧错误，画布只清除对应错误身份，保留草稿及其他错误。卸载与Owner变更取消后续重试。

验证：真实隔离宿主对前两次准备注入同款UNKNOWN_ACTION，第三次返回真实原生Session并保留原生权限/模型/语音控件；持续拒绝4次后点重连，第5次真实连接成功，旧错误消失、草稿不丢、发送恢复。920×140输入、24/28px按钮、0px分割线及390px边界通过；截图 .build/designer-home-session-qa/home-refined-light.png。仓库Node22全套860项，859通过、0失败、1项可选检查跳过；DSH签名Node24下新增向量依赖的Team ID/permission flag环境失败另记在regression.log，不归因此UI改动。

本地file依赖的已安装client.js与工作区产物为硬链接；本轮未重装未完成的无关后端包，仅核对构建哈希并使用官方set_bundle关/开重挂，application=applied且fiberPhase=active。客户端SHA-256 d053b3f46d164f5f883a0dff26fb8b46a0d524d46bc2c0dc58dc9f074f17e47b。当前主HTTP诊断报告位于 .build/designer-home-session-qa/route-diagnosis.md，不含认证凭据。

## 2026-11-08 · 完整项目导出、剪贴板与内置 Git 云同步

导出 / 分享新增完整项目 ZIP 保存下载与冻结版本，保留多设计稿原始模型、公开资源、需求规则和固定版本规范资源；公开元数据白名单、canonical containment、完整 SHA-256 清单及项目 CAS 阻止私有状态、外部目录或过期内容混入。支持复制真实 HTML 源码、真实 PNG 与明确标示的完整项目便携文本；浏览器不提供 OS ZIP 文件对象，ZIP 使用下载。

项目设置新增内置 Git 面板，画布更多菜单可直达。每项目绑定 HTTPS / SSH 仓库、分支、仓库内目录和作者；提交仅修改指定子目录，其他代码及 Git 树保留。纯 JavaScript Git/SSH 引擎在空 PATH 下完成真实 pack 传输，不要求系统 git/ssh/ssh-keygen；镜像按 URL 与 branch 隔离。每分钟自动检查仅在用户开启且面板有效时获取远端状态。提交、拉取、推送和同步均用户明确操作；首次导入精确确认、未保存草稿/运行中 AI/CAS/HEAD 变化与分叉均有保护，禁止 force push。

拉取验证远端完整包后追加新版本文件，最后以 CAS 发布元数据；原文件与历史保留，原生会话、授权、私有资源和只读引用不进入云快照。稳定路径和规范映射避免跨机导入后误报修改；相同规范 ID/version 但实际内容变化会另存新本地规范，不改旧规范。共享规范导入仍要求原生策略允许共享规范目录，不自动扩大项目权限。

SSH 配置可生成 Ed25519、导入、复制公钥、检查主机指纹、显式信任和测试。凭据在 native credentials，仅内部 helper stdin 接收密钥；不回填私钥/口令、不写 ~/.ssh。主机指纹与公钥指纹分开，主机变化拒绝认证。

最终回归：811 项，810 通过、0 失败、1 项可选 Chromium 捕获跳过。真实双设备 HTTP Git、SSH pack、二进制、多设计稿、带字体/SVG规范、并发 CAS 与凭据边界验证通过。ego-browser TaskSpace32 使用实际组件/受控 API 验证仓库表单、首次导入取消及只追加 allowInitialImport 的确认、HTML 和项目文本经系统原生粘贴的实际内容、真实 ZIP 下载、深色及390px无横向溢出。宿主60510页面需认证，未把组件夹具当作已登录宿主 GUI 验收；未绑定或推送用户仓库。当前安装版本0.4.3、sync.status新工具契约及8个关键运行文件与工作区哈希一致已核实。证据目录 .build/designer-git-qa/，最终日志 .build/designer-git-release-tests.tap。

## 2026-11-08 · AI 对话双模式、滚动与原生终态

画布 AIPanel 默认展开消息并提供独立滚动层；简易模式保持底部浮层，侧边模式放在画布右侧并让出画布宽度（860px 以下改为覆盖式布局，层级高于浮动工具条）。两种模式共享同一个 AIPanel 实例、Session、草稿和消息位置。header 可切换模式；两侧拖拽可调简易宽度，侧栏左沿调侧栏宽度，带 pointer capture、iframe 防穿透遮罩、失焦/取消清理、键盘步进和双击恢复。两种宽度及模式使用专用机器 localStorage 键持久化，视口缩小时只约束显示宽度，不覆盖原偏好。

用户接近底部才跟随消息；阅读旧消息时保留位置，新消息提示“回到底部”。输入及常驻任务状态不随消息滚动；侧栏目标设置默认折叠为摘要，给消息留出高度，面板 container queries 约束原生底栏。完成、取消、失败、不完整、未知分别处理；来源任务另显示真实保存覆盖和核验状态，不能用模型停止替代业务完成。ai.status 复用 requestLifecycle，优先取当前 Session 的队列/最新用户 RPC 并精确匹配 turn/end，旧任务错误不污染新请求。后端历史窗口由12增至60条；没有终态证明仍明确待确认。

验证：全套811项，810通过、0失败、1项可选Chromium测试跳过。真实隔离宿主验证 dock760→880、sidebar400→490、各自尺寸恢复、键盘/双击复位、刷新后偏好保持、切换时同一textarea节点和草稿；179px简易滚动区与约548px侧栏滚动区独立滚动，读旧消息不被新消息抢走，提示点击后到底部。隔离配置无模型API密钥，原生真实请求准确显示失败而非完成；完成/取消/缺失终态和跨turn匹配通过原生事件结构的自动测试验证，未声称完成真实模型生成。明暗与360px侧栏/底栏边界检查，截图位于 .build/designer-style-qa/ai-panel-*.png。

## 2026-11-08 · 两级标签栏与默认设计稿目录

全局项目标签保留白底与绿色胶囊；画布内第二级改为浅绿色底、52px 高、圆角矩形设计稿标签。设计稿标签组及新建加号居中，左侧提供文件树展开 / 收起，右侧提供 MasterGo 导入和网页复刻；原浮动画布工具组移除重复文件入口。窄屏保留按钮及无障碍名称，缩为图标；设计稿列表可水平滚动，新建按钮不随标签滚走。

两个右侧入口复用现有 SourcePanel 和正式来源工作流，以 provider + designId 区分资源标签，分别保留表单，不混用来源类型。打开来源前沿用保存及 workspace state 流程，并收起遮挡表单的文件树；未自动采集网站或请求外部连接。

project.initialize 首次初始化新项目时同时创建一个 Web 设计稿及真实根入口画板，设计目录包含 index.html、assets/README.md、css/style.css、js/main.js；现有 styles/pages 保持兼容。design.create 同样返回真实初始 page/artboard，CanvasDesignDialog 复用该返回，首页复用已初始化默认设计稿后绑定所选体系，不重复新建。page.create 仍用于追加画板。初始化使用稳定身份，重复或发布失败后恢复不覆盖既有字节；已存在或用户删除的设计不会被自动复活。

验证：最终全套 788 项，787 通过、0 失败、1 项可选 Chromium 检查跳过；UI 最终修正后的回归再次通过。真实隔离宿主验证新项目单默认稿 / 单画板、根 index 文件与实际画板绑定、移动端新增单画板、两个来源入口的独立状态、文件树开关与目录登记。明暗界面及 360px 边界检查通过：1440px 中间组中心为720px，窄屏所有按钮在视口内。截图在 .build/designer-style-qa/design-strip-*.png。官方插件管理器已 applied 更新至0.4.3，运行文件与当前工作区哈希一致，更新前副本在 .build/designer-design-strip-deploy-20261108/。安装期间明确禁用 cpu-features / ssh2 的可选原生脚本，并验证 SSH JavaScript Client 可以正常加载；未执行这些未获授权的安装脚本。

## 2026-11-07 · 项目共享 AI、激活设计稿写入与外挂知识

AIPanel 的 activeDesignId 与请求 target 分离，项目内切换设计稿继续复用同一原生 Session、对话及草稿。默认写入激活设计稿，不再在发送或取消选择后退回只读；显式选择只读仍保持只读。切换时解析激活设计稿独立绑定并忽略旧异步回包；提交后最终目标及规范冻结。整项目任务逐设计稿冻结 effectiveBindingsByDesign，各自规范用于上下文及资源落地。

AITargetPolicy 在 Session 创建、附件及 task anchor 写入前检查目标。跨设计稿、公共项目文件、整项目或明确命名另一设计稿的写入指令返回 TARGET_CONFIRMATION_REQUIRED；弹窗只为原始 payload 追加 opaque token 后重发。token 绑定原请求、项目 revision、激活稿和最终目标，有效十分钟；草稿、引用、附件、目标、激活稿或 revision 改动撤销待确认。取消保留草稿，不清除 compose CAS。确认后可执行，本次完成后默认目标回激活稿。自然语言识别是保守的明确名称/目录写动词启发式；有歧义不猜测目标。

Designer 项目工具每次操作将 native Fs policy 与 canonical 项目根相交，去掉其他 writable roots，Full access 也收窄为项目写入，readonly 不提升。严格任务另检查实际 canonical Design/file 边界，拒绝设计稿目录或其内部文件别名跳转到兄弟设计稿或外部目录；metadata/history 仍由受控事务写入项目内。专用附件和体系资源工具使用相同根策略。

@ 继续支持其他项目和项目文件，新增「选择知识目录…」及系统目录选择器/绝对路径输入。目录是可序列化只读 reference，不注册 writable source；模型只能通过 reference.list/read 或 context.read 读取任务已准入的目录/项目引用。限制私有路径、符号链接逃逸、宿主 Fs、单层分页和 UTF-8 文本窗口；项目引用保持固定 revision/摘要 hash，目录为 canonical 根身份下的活知识库，文件续页用 expectedVersion 检查。

验收：全套 664 项，663 通过、0 失败、1 项可选真实 Chromium 捕获测试跳过；新增宿主测试真实验证不同设计稿两次请求共用一个 Session、普通 HTML 写入成功、同项目兄弟 Design 别名及外部 system dependency 别名写入均无副作用。ego-browser 组件夹具使用受控 API/原生控件替身，验证确认前不准入、取消留草稿、重发仅加 token、切稿撤销旧确认并更换规范、@目录选择及只读 chip；该证据不等于真实模型生成或已登录宿主页面验收。客户端构建 8605 KiB、package closure 校验通过；官方插件管理器已 applied 安装本轮运行文件，当前实例 reference.create 新接口及 8 个核心运行文件哈希核对通过。宿主页面需刷新后加载新版客户端。

## 2026-11-07 · 共享输入框、原生会话控件与 @ 引用

首页与画布共用 DesignerComposer：透明、自适应高度输入区及统一底栏，包含附件、原生权限、固定版本设计体系、模型、语音与发送 / 停止。当前宿主未公开可嵌入的原生 React 控件，因此通过正式服务复用 ModelDirectory、permissions projection / permissionPresets catalog / session.command、Session 级远程权限、fileUploads 与 speech RPC；未借用私有 slot、伪造 Session 或绕过设计师 ai.run。

composer.prepare 是 owner-only 接口：首页只建立真实空会话，不创建项目、不调用模型；跨标签复用同一会话。发送时 composer.adopt 以项目 revision CAS 将其绑定到新项目，保留模型、权限和已上传的真实附件凭据。首页 admission 失败保留草稿与已创建身份，重试不另建项目；只有 Native accepted 后进入画布并按 compose generation 消费草稿，后来的输入保留。已 accepted 后草稿清理失败不会重复提交。

输入独立 @ 后弹出可搜索的引用菜单。首页支持其他项目；画布另支持当前文件，选择文件时先 resolve 真实 FsVersion。跨项目引用使用显式 type:project / referencedProjectId / project:<id> namespace，冻结源 revision 和 hash；仅提供有界公开概览，不扩大设计、文件或外部源码写入范围。项目卡预览上、左、右内边距归零，底部标题与操作区保留。

语音只在点击时获取系统默认麦克风，使用 DSH 当前识别服务及语言；未准备好时提供真实状态与原生识别设置入口，不自动安装或下载。转写不自动发送，过期插入保留文本供用户决定；取消、隐藏、卸载释放资源。通过公共 Gateway carrier 错误维持重连，PCM 同时遵守时长和字节限额。

验证：最终已接入模块回归 700 通过、1 跳过；另外并行加入但尚未接入的 ai-target-policy 测试有 2 项失败，未修改该并行工作。真实隔离实例验证权限往返、附件上传、跨标签保留、体系 v1 选择、首页 accepted 后原会话进入画布、项目与文件引用、明暗界面。隔离实例未配置 API Key / 语音服务，因此未跑真实模型生成或录音；Native 回执后正确显示缺少 API Key。

桌面实例已通过官方插件管理器更新并热应用；最终客户端 8605 KiB，运行文件与工作区哈希一致。更新前完整插件备份及哈希清单位于 `.build/designer-composer-deploy-20261107/`。真实画布额外验证体系清空 / 重绑，360px 下底栏按钮全部在视口内且无横向溢出；明暗与移动端截图位于 `.build/designer-style-qa/composer-*`。

## 2026-11-07 · 画布滚动、缩放与拖动

空项目现在挂载 EmptyCanvas，与 CanvasEditor 共用 useCanvasNavigation，不再显示无法操作的静态背景。空画布的缩放按钮、百分比复位、适合窗口及手型均接到实际控制器，空项目视角按项目保存在当前工作台内存。网格背景与画板相机同步平移及缩放，工具组、文件浮层和输入框保持固定。

离散鼠标滚轮默认以指针为中心缩放（5%–400%）；高精度触控板双轴滚动平移，Ctrl/Cmd+wheel 捏合缩放，Shift+滚轮横移。浏览器不提供可靠的设备类型，普通滚轮与触控板的自动区分依据 deltaMode、deltaX 与 deltaY 步长。空格 / 中键 / H 手型拖动，V 恢复选择，+ / - 缩放、0 适合窗口；百分比按钮恢复 100%。触屏双指支持以中点为锚缩放并平移。编辑画板不再吞掉普通画布滚轮；Alt+滚轮仍用于画板内部滚动。

手型拖动可跨画板标题及预览 iframe 覆盖层，不写入画板位置；预览选择模式仍可操作 iframe 内控件。画布拖动记录 pointerId，右键不触发导航，拖动期间屏蔽滚轮，pointercancel / 丢失捕获 / 窗口失焦 / 模式与设计切换时取消并释放捕获。标题位置拖动固定起始倍率，检查所有者、只读状态和移动阈值，静止点击不保存。

验证：新增 6 项导航数学回归，UI / editor / client-session 共 181 项通过；真实 React + CanvasEditor / EmptyCanvas / PageFrame 组件在 ego-browser 本地浏览器夹具验证空画布滚轮缩放与网格、画板与标题手型、空格 / 中键、右键忽略、拖动中滚轮、预览手型与按钮、输入框快捷键隔离、双触点 1.5 倍捏合、不同 pointerId 以及捕获立即丢失取消，导航保存请求为 0。该证据属于真实组件交互测试，不等于已登录宿主页面验收；当前 GUI 的匿名浏览器访问要求重新认证。最终客户端构建 8592 KiB，已在沙箱授权后同步 desktop profile 的 @local/dsh-designer/client.js 并校验哈希，旧版本备份保留在 .build/designer-canvas-qa/installed-client-before-canvas.js；宿主页面需刷新加载。

## 2026-11-07 · 最近项目与预览卡片（当前）

首页最近项目与项目列表共用 ProjectCard：16:10 预览在上，下方一行左侧项目名、右侧复制与更多操作。没有可用设计稿时，以项目 ID 稳定选择八种混合彩色渐变与斜向折面的卡面，不显示旧图标或装饰线。预览与功能行收进同一张无边框卡片，统一底色、18px 外圆角和固定轻阴影；预览上、左、右贴边，仅底部标题与操作区保留内边距；预览悬停不位移、不改变阴影。不显示旧描述、日期、齿轮、常驻分组下拉或打开箭头。首页保留最多五个真实最近项目，三列 / 两列 / 单列响应；项目列表保持全宽，自适应列数及原有 24px / 18px 留白。全局 Logo、侧栏和顶栏交界处的横竖分割线已移除。全局顶栏标签使用 36px 胶囊，激活项以更明显的品牌绿色填充和细描边区分；悬停、激活统一尺寸与圆角，移除旧页签连接内容区的边角，激活项悬停时保持选中外观。

ProjectPreview 可见时懒读实际页面文件，共享在途读取且限三项目并发；以 API 身份、项目 ID、revision、updatedAt 校验所有者。预览 API 按本地目录隔离，不更新编辑缓存。保存的 HTML 通过只读 file.read 分页读取，在无脚本 sandbox iframe 中等比缩小展示，移除脚本、事件、重定向并使用受控资源 CSP 和项目资源路径；不依赖返回 404 的 file-resource 预览页。无页面、失效资源或超出缩略预览上限时使用默认卡面。

更多面板提供重命名、移动分组及删除，支持外点 / Escape / 键盘关闭，固定定位且不被滚动区裁切。复制调用原生 project.clone 创建独立副本并停留当前页面；其余操作读取最新项目 revision 后更新或移入回收站，禁止重复请求及冲突自动重放。先保存当前资源，遇到未保存项目设置则保留草稿并阻止操作；元数据更新同步工作区标签与干净设置页，删除只移除该项目标签。写入成功后刷新失败仍按已完成处理，避免再次复制。

验证：安装客户端构建 8472 KiB，React 仍由 Host 提供；node --test ui/*.test.js editor/*.test.js client-session.test.js 共 153 项通过。真实隔离实例验证保存设计稿预览、重命名、复制、分组创建与移动、回收站删除及设计历史保留、菜单 Escape 焦点恢复、未保存设置阻止复制且草稿保留；1600px 明暗主题、项目列表四列全宽和 520px / 360px 单列、卡片按钮与菜单边界均通过。本轮未调用模型生成。

## 2026-11-07 · 画布优先的项目编辑

项目编辑默认隐藏全局 56px 导航，仅保留 48px 全局顶栏、42px 设计稿标签栏和整块网格画布。全局标签后的加号始终可见，可显示 / 隐藏导航、跳转全局页面、打开项目文件 / 画板 / 需求和新建设计稿。菜单位于 header 层，不被标签滚动区裁切，并提供焦点、Escape 和键盘菜单操作。

每个真实 Design 对应独立标签和 Canvas 视图，页面（artboard）属于 Design。新建设计稿使用原生 design.create / page.create 创建 Web 1440×1000 或移动端 390×844 空白画板；部分成功后重试复用已提交设计稿 / 页面。新增前和设计稿切换前保留原保存与 CAS 流程；首次进入恢复设计画布，文件草稿与资源标签继续保留。追加画板按现有画板右边界加间距摆放，适合窗口为底部对话预留空间。

画布顶部是文件、选择、手型、适合窗口、缩放、预览、保存及更多操作的悬浮组。旧高级画布工具通过更多 → 画布设置打开；属性、历史、规范、源码运行和导出按需进入。文件树是默认关闭的浮层，打开文件后自动收起树，文件编辑器在独立资源浮层展示且下方画布保持挂载；关闭资源浮层保留未保存缓冲。文件树 / 图层定位使用当前画布控制器，避免文件标签激活时定位失败。

AIPanel 的 layout="dock" 用于底部紧凑浮动输入区；目标设置和对话历史按需展开，原生 AI、附件、引用、IME、草稿、冻结目标及项目级 admission/CAS 继续使用原实现。输入区透明，错误与真实运行状态保持可见；未引入演示消息或生成内容。

修复 editor/rpc.js 默认 Window 定时器被当作 FrameSession 方法调用导致的 Illegal invocation。浏览器原生计时器现在由全局接收者调用；新增带浏览器接收者约束的隔离 VM 回归，覆盖等待就绪、请求响应、关闭清理。iframe 来源 / token 认证与只读命令白名单保持原状。

验证：node --test ui/*.test.js editor/*.test.js client-session.test.js 共 130 项通过；安装客户端构建 8442 KiB，React 仍由 Host 提供。真实隔离实例创建了 Web / 移动端两个设计稿和三个画板，验证独立切换、尺寸、缩放平移、页面选择、预览、错位新增、文件草稿隐藏与恢复、实际文件保存、对话草稿跨设计稿保留、全局加号和导航开关。1600px 明暗主题、520px 与 360px 的工具组 / 输入框 / 加号可达性通过，最终可见运行错误为 0。本轮未运行模型生成。

以下为此前实现记录；项目编辑布局与本节冲突时以本节为准，首页、项目管理和库的其余行为继续保留。

## 2026-11-07 · 工作区导航与浅白色界面

当前默认入口为首页，包含一体式透明内层输入区；不显示内层灰块、粗焦点轮廓、输入标题、说明或手动创建按钮。最近操作项目最多五个，过滤后没有项目时整个区域不渲染；有项目才显示。发送会经实际 API 创建项目、初始化设计并提交原生 AI；创建进度仅保存在当前面板内存，显式重试复用已返回的项目及设计 ID。最近列表按项目更新时间与本目录访问时间排序，排除回收站及不可用项目，访问记录按本地目录隔离，最多保留 100 项。

全局顶栏高 48px，横跨工作台，Logo 位于左上角并与下方 56px 固定图标侧栏对齐。侧栏仅保留首页、项目、设计体系、技能库与底部设置图标，保留名称提示及无障碍标签；不再提供展开 / 折叠开关。顶栏、侧栏与编辑工作区取消布局外边距、圆角和浮动阴影，使用明暗主题的 `--wb-divider` 细线分隔。编辑工具栏、文件导航、内容区、AI 面板与状态栏紧密衔接；保留导航和 AI 的 6px 拖拽命中区，专注模式同时收起顶栏与侧栏且内容填满框架。

外层工作区标签与原有项目资源标签分离：首页固定，项目列表、各项目、各项目设置、技能库、设计体系及工作台设置按稳定 ID 去重。顶栏标签仍支持横向滚动、方向键及 Home / End 切换、独立关闭和草稿保护。项目页仅保留单一导航入口，使用全宽布局，宽屏左右各留 24px、窄屏 18px，搜索 / 分组 / 列表共用左边界，新建按钮与列表共用右边界；不显示重复页面标题或数量。创建项目 / 分组使用页内小表单，分组标签筛选、卡片下拉移动项目，创建后停留列表。空列表只显示小图标及“暂无项目” / “未找到项目”。项目表单跨标签保留，受关闭 / 退出草稿保护；创建成功但刷新或初始化失败时，显式重试复用已提交记录。

目录设置仅在设置页展示，项目分组只在项目页管理；设计体系使用色盘图标，技能库使用魔棒图标，右上返回对话使用图标。浅色与深色共用状态，使用 `dsh-designer:appearance:1` 记忆选择并同步同源窗口，首次默认浅色。结构边界使用细线，内容卡片、表单、弹窗及首页输入区保留柔和圆角；绿色用于 Logo、首页标题关键词、当前导航 / 标签、小图标与上下文主操作，主要背景保持中性。

明暗主题已在真实浏览器验证：顶部与设置页双向切换、刷新后保持深色、项目卡片与弹窗 / 输入框无边框及圆角、520px 窄屏切换入口可见且首页无横向溢出。原生模型和文档预览的内容仍使用其真实数据与既有流程。

设置及库面板跨标签保持挂载；关闭前检查当前表单、资源文本与已保留草稿，库草稿由用户回到原表单明确保存。首页未发送需求也受退出保护。AI compose 的短期项目级 CAS 队列覆盖卸载、迟到 admission、快速重开与附件返回；只有仍属于当前项目的界面回调可以修改选区和引用。旧项目的需求文件读取与技能选择读取均丢弃过期回包。

验证：`node --test ui/*.test.js client-session.test.js` 共 94 项通过；客户端实际构建成功。真实隔离实例验证了五项目上限、多标签去重、全局顶栏 / 固定图标侧栏、面板拖拽与专注模式、项目设置跨标签草稿、库草稿关闭与恢复，以及首页创建项目/设计并提交原生会话。验收实例没有模型凭据，只验证到原生请求及凭据错误反馈，未验证实际模型生成结果。

下方保留早期交接记录；与本节冲突时，以本节为准。

Scope: only `ui/**`. Existing client entry, store, build, packages, editor and Host were not modified. Entry is named/default `Workbench` from Workbench.jsx. Real ESM JSX imports host-external React. No mock Harness, simulated React, static preview page or rasterizer was created.

## Implemented view behavior

- Project manager renders only group navigation and project cards. Search/group/recycle bin/create/edit/clone/archive/remove/restore, location picker, business goal/platform/default binding and empty/website/MasterGo/Figma/source start values use real APIs. Opening a project mounts its workspace and AI. Global system and skill managers remain separate management views.
- Project toolbar and resource tab strip are separate. Actual effective binding/source and last application record, design selector, editing/preview, standard/custom viewport, save/history/source/export/share, focus/fullscreen, collapsible navigation and stable AI width are present. Preview awaits Canvas controller flush/validate. Canvas/project closing flushes before leaving.
- Tabs use project + canonical Host resource ID. Path-only opens canonicalize after file.read before deduplication. Temporary single-click previews replace only disposable previews; double-click/edit/pin preserve. Full paths, duplicate title parents, dirty/readonly icons, reorder, pin, close-other/right, horizontal overflow and open-tab list are implemented. Save failures preserve tab with retry/keep/explicit discard. Closing does not remove the resource or cancel AI/services.
- Workspace state persists metadata, active tab, selection, mode, navigation width, device/custom viewport, camera and per-resource editor/read positions. Text draft bodies live in serialized per-resource draft writes, not duplicated in view state. Restoring re-reads resources and preserves both local draft and remote revision on conflict. Deleted/unavailable resources retain buffered content and show readonly errors. Late async file opens cannot take focus from a newer open.
- Documents load only for the active Canvas page and `viewState.visiblePageIds`, with a global limit of four reads. Failures are per-page and preserve a prior valid document. Restored resource tabs also use bounded batches. File content is read in UTF-8-byte offset pages; partially read files cannot be edited/saved over unread content.
- Canvas props follow WORKBENCH-PLAN plus onController. UI passes actual returned documents after asynchronous edit.apply. CAS includes project, page and Fs versions. The layer tree supports selection/locate, hierarchy collapse, explicit real visibility and lock/unlock transactions; parent-derived lock is explained. Canvas itself owns property editing, hit testing, interactions, scenes, camera controls, screenshot selection and safe parent edit bridge.
- CodeMirror has HTML/CSS/JS/TS/JSX/Markdown/JSON modes, normal basicSetup editing/search/folding/undo and merge comparison. File histories are independently viewable/restorable/undoable/redoable through Host file actions. Markdown supports safe GFM tables/code/heading navigation, project-relative images and project links opening tabs. HTML/SVG source/render/split remain within one resource tab; scripts never execute in document viewers. SVG parse errors are visible and block saving invalid XML.
- Image viewer has checkerboard, zoom, fit, original dimensions, drag pan, metadata and real GIF frame pause via canvas. PDF uses a locally bundled real PDF.js Canvas/TextLayer reader with actual scroll-page state, zoom/search/selection, pageNumber references, transient password input and page-relative recovery; initialization is lazy and bounded render work uses seven mounted pages/two concurrent tasks. Browser pixels, font/CMap decoding and pointer paths still require live QA. Audio/video uses native controls with metadata/progress/speed. Unknown binaries show metadata and original/external-copy downloads. Local resource copy/replace/reference actions call actual APIs.
- AI target and viewed content remain independent. Visible design/page/scope selectors only widen via user choice; ordinary resource viewing and source citations do not expand scope. Automatic goal/requirements/rules/selection and target-specific binding are summarized. Submission snapshots clone target/references/attachments/effective binding. References can be searched, located and removed. Attachments/pasted files use raw file streams and keep actual DSH Session receipts; uploaded receipts are serialized into compose drafts even if the project was switched while the upload finished. Native textarea preserves IME/newlines/paste/undo, compose drafts restore and serialize, accepted/error/waiting/running/cancelled states are distinct, prior tasks can be edited/resubmitted, and DSH full chat remains reachable. All opened project sessions are retained with catalog refresh and release-only cleanup, so switching projects does not cancel work.
- Source workflow tab uses exact `workbench.source.*`: multi-page/state/viewport plans, archived source/version/capture selection, provider outlines and multiple node selection, official connection/legacy real browser dialog, exported-file fallback, separate acquisition/generate/visual/interaction states. Generation explicitly freezes version and target. Original/result side/overlay comparison uses synchronized zoom/scroll, opacity and difference rectangles as references. Rebuild requires actual Canvas node selection. Refresh produces a proposal then explicit apply with page CAS; acquiring data is never labeled a completed editable reconstruction.
- Runtime tab registers existing external directories, explicit read/write-path grants, commands/ports/URL, actual start/stop/status/logs, source tree and source-map resolution, source file tabs and real running-URL preview tab. Git has actual status/branch/diff/exact file selection, selected commit and separately confirmed checkout/pull/push. Runtime start and Git writes never run automatically.
- Export/share UI chooses project/design/pages and format/background/editor marks, lists/downloads immutable artifacts, displays manifests, creates fixed-export previews with access scope, and explicitly updates/revokes shares. No automatic push or publish occurs.
- Shared design systems have list/get/import/export/copy/version edit, token/guideline/resource management and readonly resource viewers. Project/default versus design inherit/independent/none binding is explicit, preview precedes set, current versions remain pinned, and binding operations do not claim to rewrite old pages.

## Validation and ownership

`node --test ui/tabs.test.js ui/state-snapshot.test.js ui/canvas-transaction.test.js`: eleven meaningful pure tests pass (preview/draft protection, identity/dedup, camera preservation, reorder/close pin exclusions, restoration, duplicate parent titles, nested capability/body removal, and exclusion of unsent conversation data from view recovery). Real JSX was bundled in memory with installed esbuild-wasm and external React; latest successful output was 1,972,223 bytes including raw-stream uploads, Session receipts, reconcile wiring, explicit source-file targets, scoped legacy import capture, visual-only layer projection and clamped CodeMirror selection restoration. No generated client artifact was written from this scope.

Lead owns build integration, Canvas/editor, authenticated API dispatch/user-only checks, live installation, actual visual/keyboard verification and final requirements matrix. Compilation and reducer tests do not establish live visual acceptance. External account/provider availability and actual model generation/interaction verification remain backend/live acceptance evidence, never inferred from UI controls or data acquisition. Native PDF behavior depends on the browser's PDF viewer.

Important integration expectations are in API-CONTRACT.md. Host handoffs explicitly reported to Lead: attachment.get for Session-receipt resource viewing and fixed-version system-package relative dependency mapping/assetBase. Main attachment/asset/import/replace and global system-package import/create flows use raw upload streams; existing system.save and editable source actions use Lead's 96 MiB controlled JSON limit. Source reconciliation passes sourceId and uses Core's explicit writeback policy. Those remaining capability adapters and all transport paths must be wired and actually exercised before claiming full end-to-end acceptance. In particular file.read must provide scoped assetBase for relative HTML resource rendering (Lead adapter), and export.get must provide export.downloadUrl. Source-workflow temporary preview URLs are already supplied by its user response adapter. Legacy ImportDialog needs its original CSS/localization supplied by the client entry and createImportDialog(apiOverride) to preserve target design context.

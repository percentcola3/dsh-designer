// Compatibility dialogs extracted from v0.3.2. Workbench owns all new editing.
export function createLegacyClient(require,overrides={}) {
    const React = require('react');
    const {useState,useEffect,useRef,useCallback,useSyncExternalStore} = React;
    const h = React.createElement;
    const NS='designer-studio';
    const zh={
      studio:'设计师模式',normal:'默认模式',projects:'项目',systems:'设计体系',skills:'技能',ai:'AI 设计助手',newProject:'新建项目',newBoard:'新建设计稿',newSystem:'新建设计体系',library:'本地设计库',changeDirectory:'选择目录',refresh:'刷新',close:'关闭',cancel:'取消',save:'保存',create:'创建',name:'名称',description:'描述',platform:'适用平台',web:'Web',mobile:'Mobile',both:'Web + Mobile',noProjects:'从一个新项目开始',projectHint:'为你的下一个想法，留一块画布。',localHint:'设计稿以 HTML 保存到本地，随时可以继续编辑。',noBoards:'把想法放上画布',boardHint:'新建设计稿，或告诉 AI 你想设计什么。',noSystems:'还没有设计体系',systemHint:'把颜色、组件和设计原则沉淀下来，在项目中复用。',noSkills:'暂无可用技能',skillHint:'从 DSH 技能目录读取，勾选后用于当前项目。',search:'搜索',edit:'编辑',preview:'预览',fit:'适应内容',reset:'重置视图',zoomIn:'放大',zoomOut:'缩小',select:'选择',pan:'平移',canvasHint:'滚轮平移 · ⌘/Ctrl + 滚轮缩放 · 空格拖动',selected:'选中元素',clearSelection:'清除选择',generate:'生成新稿',modify:'修改当前稿',send:'开始设计',stop:'停止',promptPlaceholder:'描述页面、风格与内容…',editPlaceholder:'描述想调整的地方…',aiHint:'结合当前项目、设计体系和技能生成设计稿。',aiWelcome:'一起把想法变成界面',aiWelcomeDetail:'描述你要设计的页面，也可以先选择画布上的元素，再告诉我怎么修改。',working:'正在设计',ready:'就绪',version:'版本',history:'版本历史',restore:'恢复此版本',noHistory:'还没有修改记录',restoreHint:'恢复会保存当前版本，并还原设计稿内容。',binding:'项目设计体系',unbound:'不绑定设计体系',useVersion:'使用此版本',systemPinned:'项目绑定的体系版本',guidelines:'设计规范',tokens:'样式变量（JSON）',systemName:'例如：品牌官网设计体系',projectName:'例如：秋日品牌官网',boardName:'例如：首页',html:'初始 HTML（可选）',htmlHint:'可以粘贴现有 HTML；留空会创建空白页面。',settings:'项目设置',archive:'归档项目',archiveHint:'归档后会从项目列表隐藏，本地文件会保留。',chooseProject:'先打开一个项目',enabledSkills:'项目技能',skillContent:'技能内容',read:'查看',enabled:'已启用',noSelection:'未选中设计稿',target:'当前设计稿',newTarget:'新建一张设计稿',error:'操作未完成',loading:'正在加载…',openSession:'打开完整会话',width:'宽度',height:'高度',saved:'已保存到本地',untitled:'未命名',source:'HTML 源码',applySource:'保存 HTML',deleteSelection:'取消选中',projectSettings:'项目设置',systemDetail:'体系详情',saveNewVersion:'保存新版本',latest:'最新',skillsCount:'项技能',local:'本地',collapseShell:'收起 / 展开 DSH 侧栏',boardCount:'张设计稿',retry:'重试',directoryLimit:'目录需位于当前会话允许写入的工作区内。',aiStatus:'AI 任务',noTask:'还没有设计任务',emptySkillContent:'这个技能没有可显示的正文。',systemVersion:'体系版本',projectClosed:'关闭项目标签',editSystem:'编辑体系',rename:'设计稿名称',snapshotConfirm:'确认恢复',restoreConfirm:'将恢复所选版本。当前内容会先保存为一个版本。',newProjectDetail:'选择项目类型，之后可以同时添加 Web 和 Mobile 设计稿。',noResults:'没有匹配结果',viewSkills:'管理技能',nativePicker:'打开目录选择器',copyPath:'项目目录',selectionHint:'编辑态下，点击页面中的元素即可选中。',systemUnsupported:'当前体系不支持此项目平台',busy:'正在保存…',export:'下载 HTML',sourceHint:'修改源码后保存，会生成可恢复版本。',invalidTokens:'样式变量必须是有效的 JSON 对象。',projectContext:'当前项目',frames:'画板',recent:'我的项目',designLibrary:'设计资产库',blank:'空白画布',all:'全部',bound:'已绑定',unavailable:'连接不可用',stopPending:'正在停止',closePanel:'关闭面板',dragBoard:'拖动标题移动画板',resizeBoard:'调整画板尺寸',draft:'草稿',promptRequired:'请先描述你的设计需求。',statusError:'任务失败',statusComplete:'设计已更新',sourceUpdated:'HTML 已保存',archiveConfirm:'确认归档',open:'打开',notBound:'未绑定',view:'查看',projectPath:'本地路径',desktopHint:'Web 设计稿',mobileHint:'移动端设计稿'
    };
    const en={studio:'Designer mode',normal:'Default mode',projects:'Projects',systems:'Design systems',skills:'Skills',ai:'AI design assistant',newProject:'New project',newBoard:'New design',newSystem:'New design system',library:'Local design library',changeDirectory:'Choose directory',refresh:'Refresh',close:'Close',cancel:'Cancel',save:'Save',create:'Create',name:'Name',description:'Description',platform:'Platform',web:'Web',mobile:'Mobile',both:'Web + Mobile',noProjects:'Start with a new project',projectHint:'Make room for your next idea.',localHint:'Designs are saved locally as HTML, ready for your next iteration.',noBoards:'Put your ideas on canvas',boardHint:'Create a design or tell AI what you have in mind.',noSystems:'No design systems yet',systemHint:'Build a reusable collection of colors, components and principles.',noSkills:'No skills available',skillHint:'Skills come from DSH. Select the ones to use in this project.',search:'Search',edit:'Edit',preview:'Preview',fit:'Fit to content',reset:'Reset view',zoomIn:'Zoom in',zoomOut:'Zoom out',select:'Select',pan:'Pan',canvasHint:'Scroll to pan · ⌘/Ctrl + scroll to zoom · Space + drag',selected:'Selected element',clearSelection:'Clear selection',generate:'Generate a design',modify:'Edit current design',send:'Start designing',stop:'Stop',promptPlaceholder:'Describe the page, style and content…',editPlaceholder:'Describe what you want to change…',aiHint:'Uses the project, design system and selected skills.',aiWelcome:'Turn ideas into interfaces',aiWelcomeDetail:'Describe a page, or select an element on the canvas and tell me how to change it.',working:'Designing',ready:'Ready',version:'Version',history:'Version history',restore:'Restore version',noHistory:'No revisions yet',restoreHint:'Restore saves the current content before applying a previous version.',binding:'Project design system',unbound:'No design system',useVersion:'Use this version',systemPinned:'Pinned design system version',guidelines:'Design guidelines',tokens:'Style tokens (JSON)',systemName:'e.g. Brand website system',projectName:'e.g. Autumn brand website',boardName:'e.g. Home page',html:'Initial HTML (optional)',htmlHint:'Paste existing HTML, or leave empty for a blank page.',settings:'Project settings',archive:'Archive project',archiveHint:'Hides the project from the list. Local files are retained.',chooseProject:'Open a project first',enabledSkills:'Project skills',skillContent:'Skill content',read:'Read',enabled:'Enabled',noSelection:'No design selected',target:'Target design',newTarget:'Create a new design',error:'Could not complete the operation',loading:'Loading…',openSession:'Open full conversation',width:'Width',height:'Height',saved:'Saved locally',untitled:'Untitled',source:'HTML source',applySource:'Save HTML',deleteSelection:'Clear selection',projectSettings:'Project settings',systemDetail:'System details',saveNewVersion:'Save new version',latest:'Latest',skillsCount:'skills',local:'Local',collapseShell:'Toggle DSH sidebar',boardCount:'designs',retry:'Retry',directoryLimit:'The directory must be within the current writable workspace.',aiStatus:'AI task',noTask:'No design tasks yet',emptySkillContent:'This skill has no displayable content.',systemVersion:'System version',projectClosed:'Close project tab',editSystem:'Edit system',rename:'Design name',snapshotConfirm:'Confirm restore',restoreConfirm:'Restore the selected version. Current content will be saved first.',newProjectDetail:'Choose a starting platform. A project can contain Web and mobile designs.',noResults:'No results',viewSkills:'Manage skills',nativePicker:'Open directory picker',copyPath:'Project directory',selectionHint:'Click an element in edit mode to select it.',systemUnsupported:'This design system does not support the project platform',busy:'Saving…',export:'Download HTML',sourceHint:'Saving source creates a recoverable revision.',invalidTokens:'Style tokens must be a valid JSON object.',projectContext:'Current project',frames:'Artboards',recent:'My projects',designLibrary:'Design library',blank:'Blank canvas',all:'All',bound:'Bound',unavailable:'Connection unavailable',stopPending:'Stopping',closePanel:'Close panel',dragBoard:'Drag title to move artboard',resizeBoard:'Resize artboard',draft:'Draft',promptRequired:'Describe your design request first.',statusError:'Task failed',statusComplete:'Design updated',sourceUpdated:'HTML saved',archiveConfirm:'Confirm archive',open:'Open',notBound:'Not bound',view:'View',projectPath:'Local path',desktopHint:'Web design',mobileHint:'Mobile design'};
    Object.assign(zh,{projectManager:'项目管理',projectWorkspace:'项目工作台',backToProjects:'返回项目管理',managerHint:'整理项目与分组。进入项目后，打开画布与 AI 对话。',enterProject:'进入项目',editProject:'编辑项目',deleteProject:'删除项目',deleteProjectHint:'项目将移入回收站，设计稿和历史记录会保留，可随时恢复。',restoreProject:'恢复项目',trash:'回收站',emptyTrash:'回收站为空',groups:'项目分组',newGroup:'新建分组',renameGroup:'重命名分组',deleteGroup:'删除分组',deleteGroupHint:'只删除分组，组内项目将变为未分组，设计稿会保留。',group:'所属分组',groupName:'分组名称',ungrouped:'未分组',allProjects:'全部项目',projectCount:'个项目',noMatchingProjects:'没有匹配的项目',groupEmpty:'这个分组还没有项目',updated:'更新于',moveToGroup:'移动到分组',manager:'管理',delete:'删除',chooseSkillProject:'选择要配置技能的项目',sessionUnavailable:'暂时无法连接项目会话，请刷新重试。',systemsManagerHint:'管理可复用的设计规范与样式变量，在项目设置中绑定。',skillsManagerHint:'查看 DSH 技能，并为指定项目配置技能。',managementTab:'项目管理',noDescription:'还没有项目描述',workbenchHint:'项目内的画板、设计稿和 AI 对话',allSystems:'所有设计体系'});
    Object.assign(en,{projectManager:'Project manager',projectWorkspace:'Project workspace',backToProjects:'Back to projects',managerHint:'Organize projects and groups. Open a project to use its canvas and AI conversation.',enterProject:'Open project',editProject:'Edit project',deleteProject:'Delete project',deleteProjectHint:'Move this project to Trash. Designs and history are retained and can be restored.',restoreProject:'Restore project',trash:'Trash',emptyTrash:'Trash is empty',groups:'Project groups',newGroup:'New group',renameGroup:'Rename group',deleteGroup:'Delete group',deleteGroupHint:'Delete only this group. Its projects become ungrouped and their designs are retained.',group:'Project group',groupName:'Group name',ungrouped:'Ungrouped',allProjects:'All projects',projectCount:'projects',noMatchingProjects:'No matching projects',groupEmpty:'No projects in this group',updated:'Updated',moveToGroup:'Move to group',manager:'Manage',delete:'Delete',chooseSkillProject:'Choose a project to configure its skills',sessionUnavailable:'Cannot connect to the project conversation yet. Refresh to retry.',systemsManagerHint:'Manage reusable guidelines and style tokens. Bind them in project settings.',skillsManagerHint:'Read DSH skills and choose the ones to use in a project.',managementTab:'Projects',noDescription:'No project description yet',workbenchHint:'Artboards, designs and AI conversation within a project',allSystems:'All design systems'});
    Object.assign(zh,{webImport:'网页复刻',designImport:'Figma / MasterGo 导入',importTitle:'导入设计参考',importWebTab:'网页复刻',importDesignTab:'设计稿导入',importRecent:'最近导入',importNoRecent:'还没有导入记录',importWebHint:'在真实 Chromium 中打开并操作网页；这里显示浏览器截图，点击、滚动、文字和按键会发送到该网页。',importDesignHint:'读取官方 MCP 的设计上下文与资源，保存到本项目，再让 AI 生成 HTML 设计稿。',importURL:'网页地址',importOpen:'打开网页',importNavigate:'前往',importViewport:'浏览器视口',importResize:'应用尺寸',importViewportHint:'宽高为逻辑像素，范围 240–3840。',importBrowserEmpty:'输入网址，打开真实网页',importBrowserHint:'打开后可点击截图中的控件、滚动页面，再捕获当前状态。',importScreenshot:'真实 Chromium 截图，可点击或用键盘操作',importText:'向网页输入文字',importType:'输入文字',importKey:'按键',importPress:'发送按键',importScrollUp:'向上滚动',importScrollDown:'向下滚动',importBack:'后退',importForward:'前进',importCapture:'捕获并保存设计稿',importName:'设计稿名称（可选）',importStrict:'图片、CSS 和字体会归档到本项目；资源不完整时停止导入并显示失败明细。',importBusy:'正在处理，请稍候…',importProvider:'设计来源',importConnection:'连接设置',importEndpoint:'官方 MCP 端点',importTransport:'连接协议',importToken:'访问凭据（可选）',importTokenSaved:'已保存凭据；留空保留现有值',importTokenOptional:'Figma 桌面与本地 Vibe 无需凭据；远程服务按官方要求授权',importSaveConnection:'保存连接',importTestConnection:'测试已保存连接',importClearConnection:'清除连接',importConnectionReady:'连接成功',importCredentialPresent:'已保存访问凭据',importCredentialAbsent:'无需或尚未保存访问凭据',importSaveFirst:'修改连接后，先保存再测试或导入。',importDesktop:'Figma 桌面',importRemote:'Figma 远程 OAuth',importMagic:'MasterGo Magic',importVibe:'Vibe 本地 HTTP bridge',importFigmaHint:'推荐开启 Figma 桌面 MCP。远程 MCP 需要已授权 OAuth，并受官方客户端开放范围限制。',importMastergoHint:'Magic 需要团队版及个人访问令牌；本地 Vibe 需已有可用的标准 HTTP MCP bridge。',importDocs:'查看官方连接说明',importDesignURL:'设计稿链接（可选）',importNode:'节点 / 图层 ID（可选）',importRead:'读取并开始 AI 设计',importDetails:'查看详细信息',importManifest:'资源清单',importResources:'已下载资源',importFonts:'字体',importFailures:'失败资源',importComplete:'资源完整',importIncomplete:'资源不完整',importUnknown:'完整性未确认',importDone:'导入已保存到本项目',importAIStarted:'AI 已开始生成 HTML，完成后将出现在画布上。',importAIError:'设计参考已保存，但 AI 未能启动。',importShowCanvas:'返回画布',importShowManifest:'查看资源清单',importNoBrowser:'请先打开网页',importBadViewport:'宽高必须是 240–3840 的整数。',importBadURL:'请输入有效的 HTTP 或 HTTPS 网页地址。',importFormat:'资源类型',importFile:'本地文件',importSize:'大小',importControlHint:'先点击网页中的输入框，再用下方输入文字或发送按键。',importMissingId:'导入记录没有可读取的 ID。'});
    Object.assign(en,{webImport:'Recreate a webpage',designImport:'Import Figma / MasterGo',importTitle:'Import a design reference',importWebTab:'Webpage',importDesignTab:'Design file',importRecent:'Recent imports',importNoRecent:'No imports yet',importWebHint:'Browse a real Chromium page. This view shows its screenshot; clicks, scrolling, text and keys operate that page.',importDesignHint:'Read design context and assets through official MCP, save them in this project, and ask AI to generate HTML.',importURL:'Webpage URL',importOpen:'Open webpage',importNavigate:'Go',importViewport:'Browser viewport',importResize:'Apply size',importViewportHint:'Logical pixels, from 240 to 3840.',importBrowserEmpty:'Enter a URL to open a real webpage',importBrowserHint:'Click controls in the screenshot, scroll the page, then capture its current state.',importScreenshot:'Real Chromium screenshot; click or use the keyboard to interact',importText:'Text to enter on the page',importType:'Enter text',importKey:'Key',importPress:'Send key',importScrollUp:'Scroll up',importScrollDown:'Scroll down',importBack:'Back',importForward:'Forward',importCapture:'Capture and save design',importName:'Design name (optional)',importStrict:'Images, CSS and fonts are archived in this project. Missing assets stop the import and show failure details.',importBusy:'Working, please wait…',importProvider:'Design source',importConnection:'Connection settings',importEndpoint:'Official MCP endpoint',importTransport:'Transport',importToken:'Access credential (optional)',importTokenSaved:'Credential saved; leave blank to keep it',importTokenOptional:'Figma desktop and local Vibe need no credential; authorize remote services as required',importSaveConnection:'Save connection',importTestConnection:'Test saved connection',importClearConnection:'Clear connection',importConnectionReady:'Connected',importCredentialPresent:'Access credential saved',importCredentialAbsent:'No credential saved; it may be optional',importSaveFirst:'Save connection changes before testing or importing.',importDesktop:'Figma desktop',importRemote:'Figma remote OAuth',importMagic:'MasterGo Magic',importVibe:'Local Vibe HTTP bridge',importFigmaHint:'Enable the Figma desktop MCP server for local access. Remote MCP needs authorized OAuth and is subject to official client availability.',importMastergoHint:'Magic requires a Team plan and personal access token. Local Vibe requires an existing standard HTTP MCP bridge.',importDocs:'Official connection instructions',importDesignURL:'Design URL (optional)',importNode:'Node / layer ID (optional)',importRead:'Read and start AI design',importDetails:'Show details',importManifest:'Asset manifest',importResources:'Downloaded assets',importFonts:'Fonts',importFailures:'Failed assets',importComplete:'Assets complete',importIncomplete:'Assets incomplete',importUnknown:'Completeness not confirmed',importDone:'Import saved to this project',importAIStarted:'AI is generating HTML. The design will appear on the canvas when ready.',importAIError:'The reference was saved, but AI could not start.',importShowCanvas:'Return to canvas',importShowManifest:'View asset manifest',importNoBrowser:'Open a webpage first',importBadViewport:'Width and height must be integers from 240 to 3840.',importBadURL:'Enter a valid HTTP or HTTPS webpage URL.',importFormat:'Type',importFile:'Local file',importSize:'Size',importControlHint:'Click an input on the page, then enter text or send a key below.',importMissingId:'This import record has no readable ID.'});
    const css=`
.ds{--d-bg:var(--dsw-alias-bg-base);--d-panel:var(--dsw-alias-bg-layer-1);--d-soft:var(--dsw-alias-bg-layer-2);--d-border:var(--dsw-alias-border-l1);--d-text:var(--dsw-alias-label-primary);--d-muted:var(--dsw-alias-label-secondary);--d-accent:var(--dsw-alias-brand-primary);height:100%;width:100%;box-sizing:border-box;padding-top:var(--dsh-frame-top-clearance,0px);min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden;background:var(--d-bg);color:var(--d-text);font-family:inherit;font-size:13px;line-height:1.5;isolation:isolate}
.ds *{box-sizing:border-box}.ds button,.ds input,.ds textarea,.ds select{font:inherit;color:inherit}.ds button{cursor:pointer}.ds button:disabled{opacity:.45;cursor:default}.ds button:focus-visible,.ds input:focus-visible,.ds textarea:focus-visible,.ds select:focus-visible{outline:2px solid var(--d-accent);outline-offset:2px}.ds button{border:0;background:none}.ds input,.ds select,.ds textarea{border:1px solid var(--d-border);border-radius:8px;background:var(--d-bg);padding:9px 11px;min-width:0;width:100%}.ds textarea{resize:vertical;line-height:1.65}.ds label{display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--d-muted)}.ds p{margin:0}.ds .ds-muted{color:var(--d-muted)}.ds .ds-small{font-size:11px}.ds .ds-row{display:flex;align-items:center;gap:8px;min-width:0}.ds .ds-grow{flex:1;min-width:0}.ds .ds-ellip{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ds .ds-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:34px;border:1px solid var(--d-border);border-radius:8px;padding:6px 12px;white-space:nowrap;background:var(--d-panel)}.ds .ds-btn:hover{background:var(--d-soft)}.ds .ds-btn.ds-primary{background:var(--d-accent);color:var(--d-bg);border-color:var(--d-accent)}.ds .ds-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:7px;flex-shrink:0;color:var(--d-muted)}.ds .ds-icon-btn:hover,.ds .ds-icon-btn[aria-pressed=true]{background:var(--d-soft);color:var(--d-text)}.ds .ds-top{height:52px;flex-shrink:0;border-bottom:1px solid var(--d-border);padding:0 16px;display:flex;align-items:center;gap:12px;background:var(--d-panel)}.ds .ds-brand{display:flex;align-items:center;gap:9px;font-size:14px;font-weight:650;white-space:nowrap}.ds .ds-brand-mark{display:grid;place-items:center;width:28px;height:28px;border-radius:8px;background:var(--d-soft);color:var(--d-accent)}.ds .ds-mode{border:1px solid var(--d-border);border-radius:7px;padding:4px 8px;font-size:11px;color:var(--d-muted)}.ds .ds-divider{width:1px;height:18px;background:var(--d-border)}.ds .ds-tabs{height:40px;flex-shrink:0;background:var(--d-panel);display:flex;border-bottom:1px solid var(--d-border);padding:0 12px;overflow-x:auto;gap:3px;scrollbar-width:thin}.ds .ds-tab{display:flex;align-items:center;gap:8px;max-width:220px;padding:0 10px;color:var(--d-muted);border-bottom:2px solid transparent;flex-shrink:0}.ds .ds-tab[aria-selected=true]{border-bottom-color:var(--d-accent);color:var(--d-text);background:var(--d-bg)}.ds .ds-tab .ds-icon-btn{width:22px;height:22px}.ds .ds-body{display:flex;flex:1;min-height:0;min-width:0;position:relative}.ds .ds-rail{width:56px;flex-shrink:0;padding:12px 5px;display:flex;flex-direction:column;gap:9px;background:var(--d-panel);border-right:1px solid var(--d-border)}.ds .ds-rail-btn{display:flex;flex-direction:column;align-items:center;gap:5px;padding:9px 0;border-radius:9px;font-size:10px;line-height:1.3;color:var(--d-muted);position:relative}.ds .ds-rail-btn:hover,.ds .ds-rail-btn[aria-pressed=true]{background:var(--d-soft);color:var(--d-accent)}.ds .ds-sidebars{display:flex;max-width:52%;overflow-x:auto;flex-shrink:0;scrollbar-width:thin}.ds .ds-sidebar{width:232px;min-width:190px;max-width:420px;flex-shrink:0;display:flex;flex-direction:column;overflow:hidden;background:var(--d-panel);border-right:1px solid var(--d-border);position:relative}.ds .ds-side-head{display:flex;align-items:center;padding:13px 13px 9px;gap:7px;font-weight:600}.ds .ds-side-scroll{overflow:auto;flex:1;padding:8px 10px 14px;min-height:0;scrollbar-width:thin}.ds .ds-side-foot{padding:10px 12px;border-top:1px solid var(--d-border);font-size:10px;color:var(--d-muted);display:flex;flex-direction:column;gap:5px}.ds .ds-section{font-size:10px;color:var(--d-muted);letter-spacing:.06em;margin:14px 5px 7px}.ds .ds-list-item{display:flex;align-items:center;width:100%;gap:9px;min-height:47px;padding:8px;border-radius:8px;text-align:left;margin-bottom:3px}.ds .ds-list-item:hover{background:var(--d-soft)}.ds .ds-list-item[data-active=true]{background:color-mix(in srgb,var(--d-accent) 10%,var(--d-panel))}.ds .ds-list-item[data-active=true] .ds-list-icon{color:var(--d-accent)}.ds .ds-list-icon{width:30px;height:32px;border:1px solid var(--d-border);border-radius:7px;display:grid;place-items:center;color:var(--d-muted);flex-shrink:0}.ds .ds-board-row{padding-left:24px;font-size:12px;min-height:34px}.ds .ds-dot{width:5px;height:5px;border-radius:50%;background:var(--d-accent);flex-shrink:0}.ds .ds-search{padding:0 12px 8px}.ds .ds-search input{font-size:12px;background:var(--d-bg)}.ds .ds-empty-side{padding:24px 12px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:10px;color:var(--d-muted);font-size:12px}.ds .ds-skill{padding:11px 4px;border-bottom:1px solid var(--d-border)}.ds .ds-skill label{display:flex;flex-direction:row;align-items:flex-start;gap:9px;color:var(--d-text);font-size:12px;cursor:pointer}.ds input[type=checkbox]{width:15px;height:15px;accent-color:var(--d-accent);margin-top:3px;flex-shrink:0}.ds .ds-skill-desc{font-size:11px;color:var(--d-muted);margin:5px 0 0 24px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.ds .ds-link{font-size:11px;color:var(--d-accent);padding:3px 0}.ds .ds-work{position:relative;flex:1;min-width:120px;min-height:0;display:flex;flex-direction:column;overflow:hidden;background:var(--d-bg)}.ds .ds-work-head{display:flex;align-items:center;gap:8px;min-height:47px;padding:8px 15px;border-bottom:1px solid var(--d-border);background:var(--d-bg)}.ds .ds-chip{font-size:10px;padding:2px 6px;border:1px solid var(--d-border);border-radius:5px;color:var(--d-muted);white-space:nowrap}.ds .ds-canvas{position:relative;overflow:hidden;flex:1;min-height:0;touch-action:none;outline:none;background-color:var(--d-bg);background-image:radial-gradient(var(--d-border) 1px,transparent 1px);background-size:20px 20px}.ds .ds-world{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform}.ds .ds-board{position:absolute;transform-origin:0 0;outline:1px solid var(--d-border);box-shadow:0 8px 30px color-mix(in srgb,var(--d-text) 7%,transparent);background:var(--d-panel)}.ds .ds-board[data-selected=true]{outline:2px solid var(--d-accent)}.ds .ds-board-title{height:36px;position:absolute;bottom:100%;left:0;width:100%;display:flex;align-items:center;gap:8px;font-size:13px;white-space:nowrap;cursor:grab;color:var(--d-muted);padding-bottom:5px}.ds .ds-board-title button{font-size:11px;padding:2px 6px;border-radius:4px;color:var(--d-muted);background:var(--d-panel)}.ds .ds-board-title button[aria-pressed=true]{color:var(--d-accent);background:var(--d-soft)}.ds .ds-board iframe{display:block;width:100%;height:100%;border:0;background:var(--d-panel)}.ds .ds-resize{position:absolute;width:16px;height:16px;right:-6px;bottom:-6px;border:2px solid var(--d-accent);background:var(--d-panel);border-radius:3px;cursor:nwse-resize}.ds .ds-canvas-bar{position:absolute;bottom:24px;left:50%;transform:translateX(-50%);padding:5px;display:flex;align-items:center;gap:3px;border:1px solid var(--d-border);border-radius:11px;background:var(--d-panel);box-shadow:0 4px 18px color-mix(in srgb,var(--d-text) 7%,transparent);z-index:3;white-space:nowrap}.ds .ds-zoom{font-size:11px;min-width:43px;text-align:center;color:var(--d-muted)}.ds .ds-canvas-note{position:absolute;bottom:5px;left:12px;font-size:10px;color:var(--d-muted);pointer-events:none}.ds .ds-empty{margin:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:14px;padding:32px;max-width:500px;min-height:100%;width:100%;position:relative}.ds .ds-empty-art{width:100px;height:82px;display:grid;place-items:center;color:var(--d-accent);position:relative;margin-bottom:9px}.ds .ds-empty-art:before{content:'';position:absolute;inset:0;border:1px solid var(--d-border);border-radius:16px;transform:rotate(-8deg);background:var(--d-panel)}.ds .ds-empty-art svg{position:relative}.ds .ds-empty h2{font-size:22px;letter-spacing:-.04em;font-weight:600;margin:0}.ds .ds-empty p{font-size:12px;color:var(--d-muted);max-width:290px;line-height:1.8}.ds .ds-ai{width:304px;min-width:250px;max-width:42%;flex-shrink:0;background:var(--d-panel);border-left:1px solid var(--d-border);display:flex;flex-direction:column;position:relative}.ds .ds-ai-head{height:47px;display:flex;align-items:center;padding:0 14px;gap:8px;border-bottom:1px solid var(--d-border);font-weight:600}.ds .ds-ai-scroll{overflow:auto;flex:1;min-height:0;padding:17px 14px;scrollbar-width:thin}.ds .ds-ai-welcome{padding:35px 6px;display:flex;flex-direction:column;gap:12px;color:var(--d-muted);font-size:12px}.ds .ds-ai-welcome strong{color:var(--d-text);font-size:16px;font-weight:550}.ds .ds-message{font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.8;margin-bottom:17px}.ds .ds-message[data-role=user]{padding:10px 12px;background:var(--d-soft);border-radius:9px}.ds .ds-message-label{font-size:10px;color:var(--d-muted);margin-bottom:5px}.ds .ds-ai-compose{padding:12px;border-top:1px solid var(--d-border);display:flex;flex-direction:column;gap:9px}.ds .ds-ai-compose textarea{min-height:90px;max-height:240px;font-size:12px;resize:vertical;background:var(--d-bg)}.ds .ds-ai-compose select{font-size:11px;padding:6px 8px}.ds .ds-context{border:1px solid var(--d-border);border-radius:8px;padding:8px 9px;background:var(--d-bg);font-size:11px}.ds .ds-context code{font-size:10px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--d-muted);margin-top:4px}.ds .ds-status{display:flex;gap:6px;align-items:center;font-size:10px;color:var(--d-muted)}.ds .ds-running{color:var(--d-accent)}.ds .ds-running svg{animation:ds-spin 2s linear infinite}@keyframes ds-spin{to{transform:rotate(360deg)}}.ds .ds-error{padding:9px 12px;background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 8%,var(--d-bg));color:var(--dsw-alias-state-error-primary);border-bottom:1px solid var(--d-border);font-size:12px;display:flex;align-items:center;gap:10px;flex-shrink:0}.ds .ds-modal-wrap{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--d-text) 22%,transparent);z-index:30;padding:24px}.ds .ds-modal{width:480px;max-width:100%;max-height:100%;overflow:auto;display:flex;flex-direction:column;background:var(--d-panel);border:1px solid var(--d-border);border-radius:14px;box-shadow:0 24px 80px color-mix(in srgb,var(--d-text) 15%,transparent)}.ds .ds-modal.ds-wide{width:760px}.ds .ds-modal-head{display:flex;align-items:center;gap:10px;padding:17px 20px;border-bottom:1px solid var(--d-border);font-size:16px;font-weight:600}.ds .ds-form{display:flex;flex-direction:column;gap:16px;padding:20px}.ds .ds-modal-foot{display:flex;justify-content:flex-end;gap:9px;padding:14px 20px;border-top:1px solid var(--d-border)}.ds .ds-code{font:11px/1.7 ui-monospace,SFMono-Regular,monospace!important;min-height:160px;tab-size:2}.ds pre.ds-code{white-space:pre-wrap;overflow-wrap:anywhere;max-height:58vh;overflow:auto;margin:0;background:var(--d-bg);padding:14px;border:1px solid var(--d-border);border-radius:8px}.ds .ds-segment{display:flex;border:1px solid var(--d-border);border-radius:8px;padding:3px;gap:3px}.ds .ds-segment button{flex:1;padding:7px;border-radius:5px;color:var(--d-muted);font-size:12px}.ds .ds-segment button[aria-pressed=true]{background:var(--d-soft);color:var(--d-accent)}.ds .ds-history{border:1px solid var(--d-border);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:6px}.ds .ds-resizer{position:absolute;right:0;top:0;bottom:0;width:4px;cursor:col-resize;z-index:4}.ds .ds-resizer:hover{background:var(--d-accent)}.ds .ds-ai .ds-resizer{right:auto;left:0}.ds .ds-badge{font-size:10px;color:var(--d-accent);border:1px solid var(--d-border);border-radius:4px;padding:1px 4px}.ds .ds-top-actions{display:flex;align-items:center;gap:6px}.ds .ds-source-stats{font-size:11px;color:var(--d-muted)}
.ds .ds-management{flex:1;min-width:0;overflow:auto;background:var(--d-bg);padding:32px 36px;scrollbar-width:thin}.ds .ds-manager-head{display:flex;align-items:flex-start;gap:20px;margin-bottom:27px}.ds .ds-manager-head h1{font-size:24px;font-weight:600;letter-spacing:-.035em;margin:0 0 7px}.ds .ds-manager-head p{font-size:12px;line-height:1.7;color:var(--d-muted)}.ds .ds-manager-tools{display:flex;align-items:center;gap:12px;margin-bottom:22px}.ds .ds-manager-tools input{max-width:330px;background:var(--d-panel)}.ds .ds-project-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:18px;align-items:stretch}.ds .ds-project-card{border:1px solid var(--d-border);border-radius:12px;background:var(--d-panel);padding:18px;display:flex;flex-direction:column;gap:13px;min-height:235px;min-width:0}.ds .ds-project-card:hover{border-color:var(--dsw-alias-border-l2)}.ds .ds-project-card h2{font-size:15px;line-height:1.5;font-weight:600;margin:0;overflow-wrap:anywhere}.ds .ds-project-card p{font-size:12px;color:var(--d-muted);line-height:1.7;overflow-wrap:anywhere}.ds .ds-card-description{flex:1;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.ds .ds-card-top{display:flex;align-items:center;gap:9px}.ds .ds-card-icon{width:38px;height:38px;border:1px solid var(--d-border);background:var(--d-soft);border-radius:10px;display:grid;place-items:center;color:var(--d-accent);flex-shrink:0}.ds .ds-card-meta{font-size:10px;color:var(--d-muted);display:flex;align-items:center;gap:8px}.ds .ds-card-foot{display:flex;gap:8px;align-items:center;border-top:1px solid var(--d-border);padding-top:12px}.ds .ds-card-foot select{font-size:11px;padding:6px 7px;min-width:0;flex:1;max-width:150px;background:var(--d-bg)}.ds .ds-card-foot .ds-btn{margin-left:auto}.ds .ds-group-row{display:flex;align-items:center;gap:2px;margin:3px 0;border-radius:8px;min-height:38px}.ds .ds-group-row[data-active=true]{background:var(--d-soft);color:var(--d-accent)}.ds .ds-group-main{display:flex;align-items:center;gap:8px;flex:1;min-width:0;text-align:left;padding:9px 7px;font-size:12px}.ds .ds-group-row .ds-icon-btn{width:24px;height:26px;opacity:.55}.ds .ds-group-row:hover .ds-icon-btn{opacity:1}.ds .ds-groups{width:218px;min-width:190px;background:var(--d-panel);border-right:1px solid var(--d-border);display:flex;flex-direction:column;flex-shrink:0}.ds .ds-skill-catalog{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}.ds .ds-skill-catalog .ds-skill{background:var(--d-panel);border:1px solid var(--d-border);border-radius:10px;padding:16px}.ds .ds-manager-empty{padding:70px 20px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:14px;color:var(--d-muted)}.ds .ds-manager-empty strong{font-size:17px;color:var(--d-text);font-weight:550}.ds .ds-tab.ds-manager-tab{flex-shrink:0}.ds .ds-board-sidebar{width:210px;min-width:170px;background:var(--d-panel);border-right:1px solid var(--d-border);display:flex;flex-direction:column;flex-shrink:0}.ds .ds-work-head .ds-back{margin-right:4px}[data-platform=darwin] .ds{padding-top:max(var(--dsh-frame-top-clearance,0px),48px)}
@media(max-width:850px){.ds .ds-management{padding:24px 20px}.ds .ds-groups{width:180px;min-width:160px}.ds .ds-manager-head{flex-wrap:wrap}.ds .ds-board-sidebar{width:175px;min-width:150px}}@media(max-width:620px){.ds .ds-groups{width:150px;min-width:140px}.ds .ds-management{padding:20px 14px}.ds .ds-manager-tools{flex-wrap:wrap}.ds .ds-project-grid{grid-template-columns:1fr}.ds .ds-manager-head{gap:12px}.ds .ds-board-sidebar{display:none}}
@media(max-width:1000px){.ds .ds-ai{width:260px}.ds .ds-sidebars{max-width:36%}.ds .ds-sidebar{width:206px}.ds .ds-top .ds-mode,.ds .ds-top .ds-divider{display:none}.ds .ds-canvas-note{display:none}.ds .ds-work-head{padding:8px}}@media(max-width:720px){.ds .ds-sidebars{position:absolute;left:56px;top:0;bottom:0;z-index:12;max-width:calc(100% - 56px);box-shadow:8px 0 24px color-mix(in srgb,var(--d-text) 10%,transparent)}.ds .ds-ai{position:absolute;right:0;top:0;bottom:0;z-index:11;width:300px;max-width:calc(100% - 56px)}.ds .ds-top{padding:0 10px}.ds .ds-top .ds-hide-small{display:none}.ds .ds-modal-wrap{padding:12px}.ds .ds-work-head .ds-hide-small{display:none}}
`;
    const importCss=`
.ds .ds-import-dialog{width:min(1180px,calc(100vw - 40px));max-width:none;height:min(960px,calc(100vh - 40px));max-height:calc(100vh - 40px);display:flex;flex-direction:column;overflow:hidden}.ds .ds-import-wrap{z-index:80}.ds .ds-import-tabs{display:flex;gap:6px;padding:10px 18px;border-bottom:1px solid var(--d-border);flex-shrink:0}.ds .ds-import-tabs button[aria-pressed=true]{background:var(--d-soft);color:var(--d-accent)}.ds .ds-import-body{flex:1;min-height:0;overflow:auto;padding:18px;scrollbar-width:thin}.ds .ds-import-stack{display:flex;flex-direction:column;gap:13px;min-width:0}.ds .ds-import-fields{border:0;padding:0;margin:0;display:flex;flex-direction:column;gap:12px;min-width:0}.ds .ds-import-url{display:flex;align-items:flex-end;gap:8px}.ds .ds-import-url label{flex:1}.ds .ds-import-viewport{display:flex;align-items:flex-end;gap:8px;flex-wrap:wrap}.ds .ds-import-viewport label{width:110px}.ds .ds-import-browser{border:1px solid var(--d-border);border-radius:10px;background:var(--d-soft);overflow:hidden;min-width:0}.ds .ds-import-browser-head{display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--d-border);padding:8px 10px;background:var(--d-panel);font-size:11px;min-width:0}.ds .ds-import-browser-view{height:min(52vh,560px);overflow:auto;overscroll-behavior:contain;display:flex;align-items:flex-start;justify-content:center;min-height:260px;position:relative}.ds .ds-import-screenshot{display:block;max-width:100%;height:auto;flex-shrink:0;cursor:crosshair;outline-offset:-3px;user-select:none}.ds .ds-import-placeholder{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;min-height:280px;padding:25px;text-align:center;color:var(--d-muted)}.ds .ds-import-control{display:grid;grid-template-columns:minmax(160px,1fr) auto minmax(110px,160px) auto;gap:8px;align-items:end}.ds .ds-import-design{display:grid;grid-template-columns:minmax(270px,340px) minmax(250px,1fr);gap:20px;align-items:start}.ds .ds-import-card{border:1px solid var(--d-border);border-radius:10px;padding:16px;display:flex;flex-direction:column;gap:13px;min-width:0}.ds .ds-import-card h3,.ds .ds-import-recent h3{margin:0;font-size:13px;font-weight:600}.ds .ds-import-presets{display:flex;gap:7px;flex-wrap:wrap}.ds .ds-import-presets button{font-size:11px;min-height:28px;padding:4px 8px}.ds .ds-import-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.ds .ds-import-error{border:1px solid var(--dsw-alias-state-error-primary);border-radius:9px;padding:12px;color:var(--dsw-alias-state-error-primary);font-size:12px;overflow-wrap:anywhere}.ds .ds-import-error pre,.ds .ds-import-details pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:270px;overflow:auto;padding:10px;background:var(--d-bg);border-radius:6px;font-size:11px}.ds .ds-import-error summary,.ds .ds-import-details summary{cursor:pointer;margin-top:8px}.ds .ds-import-success{border:1px solid var(--d-border);border-radius:9px;background:var(--d-soft);padding:13px;display:flex;flex-direction:column;gap:8px}.ds .ds-import-recent{margin-top:22px;border-top:1px solid var(--d-border);padding-top:17px;display:flex;flex-direction:column;gap:10px}.ds .ds-import-record{display:flex;align-items:center;gap:10px;min-width:0;padding:9px 0;border-bottom:1px solid var(--d-border)}.ds .ds-import-record small{display:block;color:var(--d-muted);font-size:10px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.ds .ds-import-stats{display:flex;gap:16px;flex-wrap:wrap;font-size:12px}.ds .ds-import-stats strong{margin-right:5px}.ds .ds-import-table{width:100%;border-collapse:collapse;font-size:11px;text-align:left;table-layout:fixed}.ds .ds-import-table th,.ds .ds-import-table td{padding:7px;border-bottom:1px solid var(--d-border);overflow-wrap:anywhere;vertical-align:top}.ds .ds-import-table th{color:var(--d-muted);font-weight:500}.ds .ds-import-manifest{border:1px solid var(--d-border);border-radius:9px;padding:13px;display:flex;flex-direction:column;gap:10px}.ds .ds-import-manifest img{max-width:100%;max-height:250px;object-fit:contain;align-self:flex-start;border:1px solid var(--d-border);border-radius:6px}.ds .ds-import-hint{font-size:11px;color:var(--d-muted);line-height:1.7}.ds .ds-import-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-shrink:0;border-top:1px solid var(--d-border);padding:12px 18px}.ds .ds-import-footer p{font-size:11px;color:var(--d-muted);max-width:780px}.ds .ds-import-toolbar{flex-wrap:wrap;min-height:48px;height:auto}.ds .ds-import-entry{display:flex;gap:8px;flex-wrap:wrap}.ds .ds-import-entry .ds-btn{font-size:11px}.ds .ds-import-safe-link{color:var(--d-accent);font-size:11px}.ds .ds-import-progress{font-size:11px;color:var(--d-accent)}@media(max-width:760px){.ds .ds-import-dialog{width:calc(100vw - 20px);height:calc(100vh - 20px);max-height:calc(100vh - 20px)}.ds .ds-import-wrap{padding:10px}.ds .ds-import-design{grid-template-columns:1fr}.ds .ds-import-control{grid-template-columns:1fr auto}.ds .ds-import-url{flex-wrap:wrap}.ds .ds-import-body{padding:13px}.ds .ds-import-footer{align-items:flex-start}.ds .ds-work-head .ds-import-entry .ds-btn{padding:5px 7px;font-size:10px}}
`;
    function Icon({name='canvas',size=18,...rest}) {
      const paths={canvas:'M3 4h12v11H3z M9 9h12v12H9z',projects:'M3 6h7l2 2h9v12H3z M3 6V4h7l2 2',systems:'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z',skills:'m12 3 2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z',plus:'M12 5v14 M5 12h14',close:'m6 6 12 12 M18 6 6 18',chevron:'m9 5 7 7-7 7',web:'M3 4h18v13H3z M8 21h8 M12 17v4',mobile:'M7 2h10v20H7z M11 18h2',arrow:'M19 12H5 M11 6l-6 6 6 6',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2',history:'M3 11a9 9 0 1 1 2 7 M3 4v7h7 M12 7v5l3 2',fit:'M3 9V3h6 M15 3h6v6 M21 15v6h-6 M9 21H3v-6',select:'m5 3 14 10-7 1-3 7z',pan:'M8 13V5a2 2 0 0 1 4 0v7 M12 6a2 2 0 0 1 4 0v6 M16 8a2 2 0 0 1 4 0v7c0 4-3 7-6 7h-2c-2 0-3-1-5-3l-4-5a2 2 0 0 1 3-3l2 2',minus:'M5 12h14',send:'m5 12 7-7 7 7 M12 5v15',code:'m8 6-6 6 6 6 M16 6l6 6-6 6 M14 3l-4 18',download:'M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5',refresh:'M20 7a9 9 0 1 0 1 8 M20 2v6h-6',sidebar:'M3 4h18v16H3z M9 4v16',check:'m5 12 4 4L19 6',stop:'M6 6h12v12H6z',eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12 M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',folder:'M3 6h7l2 2h9v12H3z',dots:'M5 12h1 M11 12h1 M17 12h1',spark:'m12 3 2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z',link:'M10 14l4-4 M9 7l2-2a5 5 0 0 1 7 7l-2 2 M15 17l-2 2a5 5 0 0 1-7-7l2-2'};
      return h('svg',{width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.6,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true,...rest},
        h('path',{d:paths[name]||paths.canvas}));
    }
    const readLocal=(key,fallback)=>{try{return JSON.parse(localStorage.getItem('dsh-designer:'+key))??fallback}catch{return fallback}};
    const writeLocal=(key,value)=>{try{localStorage.setItem('dsh-designer:'+key,JSON.stringify(value))}catch{}};
    async function api(action,args={}) {
      if(overrides.api)return overrides.api(action,args);
      const response=await fetch('/api/designer',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Designer-Action':action},body:JSON.stringify({action,contextSessionId:readLocal('contextSessionId',null),...args})});
      let result;try{result=await response.json()}catch{throw new Error(`DSH ${response.status}: ${response.statusText}`)}
      if(!response.ok||!result.ok){const error=new Error(result.error?.message||`DSH ${response.status}`);error.code=result.error?.code||`HTTP_${response.status}`;error.details=result.error?.details||{};error.status=response.status;throw error;}
      return result.value;
    }
    async function retainProjectSession(sessions,sessionId,signal) {
      // A persisted designer ID is not automatically in the Client catalog.
      // Refresh the catalog before acquiring an ordinary Session reference.
      await sessions.refresh();
      signal?.throwIfAborted();
      return sessions.retain(sessionId,{source:'controllerOperation',signal});
    }
    function bridgeScript(token,mode) {
      return `(()=>{const token=${JSON.stringify(token)};const edit=${JSON.stringify(mode==='edit')};function send(v){parent.postMessage({designer:token,...v},'*')}function selector(el){const parts=[];while(el&&el.nodeType===1&&el!==document.documentElement){const tag=el.localName;const sib=[...el.parentElement.children].filter(n=>n.localName===tag);parts.unshift(tag+(sib.length>1?':nth-of-type('+(sib.indexOf(el)+1)+')':''));el=el.parentElement}return parts.length?'html > '+parts.join(' > '):'html'}if(edit){document.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();const el=e.target;if(!el||el.nodeType!==1)return;clearHover();const rect=el.getBoundingClientRect();send({type:'selection',selection:{selector:selector(el),tag:el.localName,text:(el.textContent||'').slice(0,500),outerHTML:el.outerHTML.slice(0,8000)},rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height}})},true);document.addEventListener('submit',e=>e.preventDefault(),true);let last,old,hadStyle;function clearHover(){if(last&&last.style){last.style.outline=old;if(!hadStyle&&!last.getAttribute('style'))last.removeAttribute('style')}last=null}document.addEventListener('pointerover',e=>{clearHover();last=e.target;if(last&&last.style){old=last.style.outline;hadStyle=last.hasAttribute('style');last.style.outline='2px solid Highlight'}},true);document.addEventListener('pointerout',clearHover,true)}document.addEventListener('keydown',e=>{if(e.code==='Space'&&!(e.target instanceof HTMLInputElement)&&!(e.target instanceof HTMLTextAreaElement)){e.preventDefault();send({type:'space',down:true})}},true);document.addEventListener('keyup',e=>{if(e.code==='Space')send({type:'space',down:false})},true);document.addEventListener('wheel',e=>{if(edit||e.ctrlKey||e.metaKey){e.preventDefault();send({type:'wheel',deltaX:e.deltaX,deltaY:e.deltaY,zoom:e.ctrlKey||e.metaKey,x:e.clientX,y:e.clientY})}},{passive:false,capture:true});send({type:'ready'})})();`;
    }
    function Frame({board,html,assetBase,mode,onSelection,onSpace,onWheel}) {
      const ref=useRef(null),token=useRef('ds-'+crypto.randomUUID());
      const src=React.useMemo(()=>{
        // The opaque-origin sandbox keeps page scripts separate from DSH and its authenticated state.
        const csp=`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob: https: http:; style-src 'unsafe-inline' https: http:; font-src data: https: http:; script-src 'unsafe-inline' https:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri ${location.origin}">`;
        const bridge='<script>'+bridgeScript(token.current,mode)+'</script>';
        const base=assetBase?'<base href="'+new URL(assetBase,location.origin).href+'">':'';
        const text=(html||'<!doctype html><html><body></body></html>').replace(/<base\b[^>]*>/gi,'').replace(/<meta\b(?=[^>]*http-equiv\s*=\s*["']?(?:content-security-policy|refresh)\b)[^>]*>/gi,'');
        return /<head\b/i.test(text)?text.replace(/<head\b[^>]*>/i,m=>m+csp+base+bridge):text.replace(/^(<!doctype[^>]*>)?/i,m=>m+csp+base+bridge);
      },[html,assetBase,mode]);
      useEffect(()=>{
        const listen=e=>{
          if(e.source!==ref.current?.contentWindow||e.data?.designer!==token.current)return;
          if(e.data.type==='selection'&&mode==='edit')onSelection(board.id,e.data.selection);
          if(e.data.type==='space')onSpace(!!e.data.down);
          if(e.data.type==='wheel'&&['x','y','deltaX','deltaY'].every(k=>Number.isFinite(e.data[k]))){
            const r=ref.current.getBoundingClientRect();
            onWheel({...e.data,clientX:r.left+e.data.x*r.width/board.viewport.width,clientY:r.top+e.data.y*r.height/board.viewport.height});
          }
        };
        window.addEventListener('message',listen);return()=>window.removeEventListener('message',listen);
      },[board.id,board.viewport.width,board.viewport.height,mode,onSelection,onSpace,onWheel]);
      return h('iframe',{ref,title:board.name,sandbox:'allow-scripts',srcDoc:src,referrerPolicy:'no-referrer'});
    }
    function WorkspaceSurface({children,label}) {
      const ref=useRef(null);
      useEffect(()=>{
        const previous=document.activeElement;
        ref.current?.focus({preventScroll:true});
        return()=>{if(previous?.isConnected)previous.focus({preventScroll:true})};
      },[]);
      const containFocus=e=>{
        if(e.key!=='Tab'||e.defaultPrevented)return;
        const controls=[...ref.current.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),iframe,[tabindex="0"]')].filter(node=>node.tabIndex>=0&&node.getClientRects().length>0&&!node.closest('[inert]'));
        const first=controls[0],last=controls.at(-1),current=document.activeElement;
        if(!first){e.preventDefault();ref.current.focus();return;}
        if(e.shiftKey&&(current===first||current===ref.current)){e.preventDefault();last.focus()}
        else if(!e.shiftKey&&(current===last||current===ref.current)){e.preventDefault();first.focus()}
      };
      return h('div',{ref,role:'dialog','aria-modal':true,'aria-label':label,tabIndex:-1,onKeyDown:containFocus,
        style:{position:'absolute',inset:0,zIndex:1,pointerEvents:'auto',background:'var(--dsw-alias-bg-base)',outline:'none'}},children);
    }
    function FocusDialog({children,className,close,titleId,dialogKey}) {
      const ref=useRef(null),closeRef=useRef(close);closeRef.current=close;
      useEffect(()=>{
        const node=ref.current,previous=document.activeElement;
        (node?.querySelector('input,textarea,select')||node?.querySelector('button'))?.focus();
        const key=e=>{if(e.key==='Escape'){e.stopPropagation();e.preventDefault();closeRef.current()}if(e.key==='Tab'){const nodes=[...node.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')];const i=nodes.indexOf(document.activeElement);if(e.shiftKey&&i<=0){e.preventDefault();nodes.at(-1)?.focus()}else if(!e.shiftKey&&(i===nodes.length-1||i===-1)){e.preventDefault();nodes[0]?.focus()}}};
        node?.addEventListener('keydown',key);return()=>{node?.removeEventListener('keydown',key);if(previous?.isConnected)previous.focus()};
      },[dialogKey]);
      return h('section',{ref,className,role:'dialog','aria-modal':true,'aria-labelledby':titleId},children);
    }
    function ImportDialog({project,t,initialTab='web',initialProvider='figma',initialURL='',initialName='',onClose,onImported}) {
      const projectId=project.id;
      const [tab,setTab]=useState(initialTab),[busy,setBusy]=useState(false),[progress,setProgress]=useState(''),[problem,setProblem]=useState(null);
      const [address,setAddress]=useState(initialTab==='web'?initialURL:''),[width,setWidth]=useState(1280),[height,setHeight]=useState(800),[browser,setBrowser]=useState(null),[text,setText]=useState(''),[key,setKey]=useState('Enter'),[name,setName]=useState(initialName);
      const [provider,setProvider]=useState(initialProvider==='mastergo'?'mastergo':'figma'),[connections,setConnections]=useState([]),[endpoint,setEndpoint]=useState(initialProvider==='mastergo'?'https://mastergo.com/mcp/xf/sse':'http://127.0.0.1:3845/mcp'),[transport,setTransport]=useState('auto'),[token,setToken]=useState(''),[probe,setProbe]=useState(null),[designURL,setDesignURL]=useState(initialTab==='design'?initialURL:''),[nodeId,setNodeId]=useState('');
      const [lastResult,setLastResult]=useState(null),[manifestView,setManifestView]=useState(null),[connectionLoading,setConnectionLoading]=useState(true);
      const mounted=useRef(true),identity=useRef(projectId),busyRef=useRef(false),owned=useRef(new Set()),browserRef=useRef(null),providerRef=useRef(provider),connectionsRef=useRef(connections),tokenRef=useRef(token),wheelHost=useRef(null),wheelTimer=useRef(null),wheelDelta=useRef({x:0,y:0}),dispatchRef=useRef(null),statusSeq=useRef(0),formEdited=useRef(false);
      identity.current=projectId;providerRef.current=provider;connectionsRef.current=connections;tokenRef.current=token;browserRef.current=browser;
      const current=()=>mounted.current&&identity.current===projectId;
      const defaults=p=>p==='figma'?'http://127.0.0.1:3845/mcp':'https://mastergo.com/mcp/xf/sse';
      const saved=connections.find(c=>c.provider===provider),dirty=endpoint!==(saved?.endpoint||defaults(provider))||transport!==(saved?.transport||'auto')||!!token;
      const button=(label,fn,icon,primary=false,extra={})=>h('button',{type:'button',className:'ds-btn'+(primary?' ds-primary':''),onClick:fn,disabled:busy,...extra},icon&&h(Icon,{name:icon,size:14}),label);
      const iconButton=(label,icon,fn,extra={})=>h('button',{type:'button',className:'ds-icon-btn',title:label,'aria-label':label,onClick:fn,disabled:busy,...extra},h(Icon,{name:icon,size:15}));
      const safeError=(error,secret=tokenRef.current)=>{
        const clean=value=>typeof value==='string'&&secret?value.split(secret).join('[redacted]'):Array.isArray(value)?value.map(clean):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,clean(v)])):value;
        return clean({code:error?.code||'',message:error?.message||String(error),details:error?.details||{}});
      };
      const errorNode=error=>error&&h('div',{className:'ds-import-error',role:'alert'},h('strong',null,error.code?error.code+' · ':''),error.message,
        error.details&&Object.keys(error.details).length>0&&h('details',null,h('summary',null,t('importDetails')),h('pre',null,JSON.stringify(error.details,null,2).slice(0,80000))));
      const closeBrowser=id=>api('browser.close',{projectId,browserId:id}).catch(()=>{});
      const releaseOwned=()=>{for(const id of owned.current)closeBrowser(id);owned.current.clear();browserRef.current=null;};
      const requestClose=()=>{if(!busyRef.current)onClose()};
      async function work(operation,label=t('importBusy')) {
        if(busyRef.current||!current())return;
        busyRef.current=true;setBusy(true);setProgress(label);setProblem(null);
        try{return await operation()}catch(error){if(current())setProblem(safeError(error));return undefined}
        finally{busyRef.current=false;if(!mounted.current)releaseOwned();if(current()){setBusy(false);setProgress('')}}
      }
      async function refreshConnections(force=false) {
        const sequence=++statusSeq.current;if(current())setConnectionLoading(true);
        try{
          const result=await api('connection.status');if(!current()||sequence!==statusSeq.current)return;
          const rows=result.connections||[];setConnections(rows);connectionsRef.current=rows;
          if(force||!formEdited.current){const row=rows.find(c=>c.provider===providerRef.current);setEndpoint(row?.endpoint||defaults(providerRef.current));setTransport(row?.transport||'auto');formEdited.current=false;}
        }finally{if(current()&&sequence===statusSeq.current)setConnectionLoading(false)}
      }
      useEffect(()=>{
        mounted.current=true;refreshConnections().catch(error=>{if(current())setProblem(safeError(error))});
        return()=>{mounted.current=false;statusSeq.current++;clearTimeout(wheelTimer.current);if(!busyRef.current)releaseOwned();tokenRef.current='';};
      },[projectId]);
      const chooseProvider=value=>{
        if(busyRef.current)return;formEdited.current=false;providerRef.current=value;setProvider(value);const row=connectionsRef.current.find(c=>c.provider===value);
        setEndpoint(row?.endpoint||defaults(value));setTransport(row?.transport||'auto');setToken('');tokenRef.current='';setProbe(null);setProblem(null);setDesignURL('');setNodeId('');
      };
      const acceptBrowser=result=>{
        if(!current())return;
        setBrowser(result);browserRef.current=result;setAddress(result.url||'');setWidth(result.width);setHeight(result.height);
      };
      const viewport=()=>{const w=Number(width),h=Number(height);if(!Number.isInteger(w)||!Number.isInteger(h)||w<240||h<240||w>3840||h>3840)throw new Error(t('importBadViewport'));return {width:w,height:h}};
      const openBrowser=event=>{event?.preventDefault();work(async()=>{
        let url;try{url=new URL(address);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error()}catch{throw new Error(t('importBadURL'))}
        const dimensions=viewport(),existing=browserRef.current;
        if(existing){const result=await api('browser.action',{projectId,browserId:existing.browserId,type:'navigate',url:url.href});acceptBrowser(result);return;}
        const result=await api('browser.open',{projectId,url:url.href,...dimensions});
        if(!result.browserId)throw new Error(t('importNoBrowser'));
        if(!current()){await closeBrowser(result.browserId);return;}
        owned.current.add(result.browserId);acceptBrowser(result);
      },t('loading'))};
      const browserAction=(type,args={})=>work(async()=>{
        const value=browserRef.current;if(!value)throw new Error(t('importNoBrowser'));
        const result=await api('browser.action',{projectId,browserId:value.browserId,type,...args});acceptBrowser(result);
      });
      dispatchRef.current=browserAction;
      const scheduleWheel=()=>{
        clearTimeout(wheelTimer.current);wheelTimer.current=setTimeout(()=>{
          if(!current()||!browserRef.current)return;
          if(busyRef.current){scheduleWheel();return;}
          const delta=wheelDelta.current;wheelDelta.current={x:0,y:0};
          if(delta.x||delta.y)dispatchRef.current('scroll',{deltaX:Math.max(-10000,Math.min(10000,Math.round(delta.x))),deltaY:Math.max(-10000,Math.min(10000,Math.round(delta.y)))});
        },120);
      };
      useEffect(()=>{
        const host=wheelHost.current;if(!host)return;
        const wheel=event=>{
          if(!browserRef.current||event.ctrlKey||event.metaKey)return;
          event.preventDefault();const unit=event.deltaMode===1?16:event.deltaMode===2?browserRef.current.height:1;
          wheelDelta.current={x:Math.max(-10000,Math.min(10000,wheelDelta.current.x+event.deltaX*unit)),y:Math.max(-10000,Math.min(10000,wheelDelta.current.y+event.deltaY*unit))};scheduleWheel();
        };
        host.addEventListener('wheel',wheel,{passive:false});return()=>{host.removeEventListener('wheel',wheel);clearTimeout(wheelTimer.current);wheelDelta.current={x:0,y:0};};
      },[tab,!!browser]);
      const clickScreenshot=event=>{
        if(busyRef.current||!browserRef.current)return;
        const rect=event.currentTarget.getBoundingClientRect(),value=browserRef.current;if(!rect.width||!rect.height)return;
        const x=Math.max(0,Math.min(value.width-1,Math.floor((event.clientX-rect.left)*value.width/rect.width)));
        const y=Math.max(0,Math.min(value.height-1,Math.floor((event.clientY-rect.top)*value.height/rect.height)));
        event.currentTarget.focus();browserAction('click',{x,y});
      };
      const keyScreenshot=event=>{
        if(event.key==='Tab')return;
        event.preventDefault();event.stopPropagation();if(busyRef.current)return;
        if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){browserAction('type',{text:event.key});return;}
        const chord=[event.ctrlKey?'Control':null,event.metaKey?'Meta':null,event.altKey?'Alt':null,event.shiftKey?'Shift':null,event.key===' '?'Space':event.key].filter(Boolean).join('+');
        if(!['Shift','Control','Meta','Alt'].includes(event.key))browserAction('key',{key:chord});
      };
      async function imported(result) {
        if(!current())return;
        if(result?.error||result?.ok===false||['connection-required','failed','error'].includes(result?.status))throw Object.assign(new Error(result.error?.message||'来源资料尚未保存。'),{code:result.error?.code||'SOURCE_NOT_SAVED',details:result.error?.details});
        setLastResult(result);if(result.manifest)setManifestView({record:result.record,manifest:result.manifest,assetBase:result.assetBase});
        await onImported(result,projectId);
        if(current()&&result.ai?.accepted===false&&result.ai.error)setProblem(safeError(typeof result.ai.error==='string'?new Error(result.ai.error):result.ai.error));
      }
      const capture=()=>work(async()=>{setLastResult(null);const value=browserRef.current;if(!value)throw new Error(t('importNoBrowser'));const result=await api('browser.capture',{projectId,browserId:value.browserId,...(name.trim()?{name:name.trim()}:{}),allowPartial:false});await imported(result)},t('importCapture'));
      const saveConnection=()=>work(async()=>{
        const secret=tokenRef.current;await api('connection.save',{provider,endpoint:endpoint.trim(),transport,...(secret?{token:secret}:{})});
        if(!current())return;setToken('');tokenRef.current='';setProbe(null);await refreshConnections(true);
      },t('importSaveConnection'));
      const testConnection=()=>work(async()=>{if(dirty)throw new Error(t('importSaveFirst'));const result=await api('connection.test',{provider});if(current()){setProbe(result);if(!result.connected&&result.error)setProblem(safeError(result.error));}},t('importTestConnection'));
      const clearConnection=()=>work(async()=>{await api('connection.clear',{provider});if(current()){setToken('');tokenRef.current='';setProbe(null);await refreshConnections(true);}});
      const importSource=event=>{event?.preventDefault();work(async()=>{
        setLastResult(null);
        if(dirty)throw new Error(t('importSaveFirst'));
        const result=await api('source.import',{projectId,provider,...(designURL.trim()?{url:designURL.trim()}:{}),...(nodeId.trim()?{nodeId:nodeId.trim()}:{}),...(name.trim()?{name:name.trim()}:{}),generate:true,allowPartial:false});await imported(result);
      },t('importRead'))};
      const viewImport=record=>work(async()=>{const importId=record.id||record.importId;if(!importId)throw new Error(t('importMissingId'));const value=await api('import.get',{projectId,importId});if(current())setManifestView(value)},t('importShowManifest'));
      const manifestNode=()=>{
        if(!manifestView?.manifest)return null;
        const {manifest,record,assetBase}=manifestView,resources=manifest.resources||[],failures=manifest.failures||[];
        const complete=manifest.integrity==='complete'?true:manifest.integrity==='incomplete'?false:null;
        let preview;
        if(assetBase&&record?.previewPath&&!record.previewPath.startsWith('/')&&!record.previewPath.includes('\\')&&!record.previewPath.split('/').includes('..')){try{const url=new URL('../'+record.previewPath,new URL(assetBase,location.origin));if(url.origin===location.origin)preview=url.href}catch{}}
        return h('section',{className:'ds-import-manifest','aria-label':t('importManifest')},h('div',{className:'ds-row'},h('strong',{className:'ds-grow'},t('importManifest')+(record?.title?' · '+record.title:'')),h('span',{className:'ds-chip'},t(complete===true?'importComplete':complete===false?'importIncomplete':'importUnknown'))),
          h('div',{className:'ds-import-stats'},h('span',null,h('strong',null,resources.filter(r=>r.status==='downloaded').length),t('importResources')),h('span',null,h('strong',null,resources.filter(r=>r.category==='fonts').length),t('importFonts')),h('span',null,h('strong',null,failures.length),t('importFailures'))),
          preview&&h('img',{src:preview,alt:record.title||t('preview')}),failures.length>0&&h('div',{className:'ds-import-error'},failures.slice(0,30).map((f,i)=>h('p',{key:i},(f.code?f.code+' · ':'')+(f.url||'')+' — '+(f.message||'')))),
          (manifest.warnings||[]).length>0&&h('p',{className:'ds-import-hint'},manifest.warnings.map(w=>typeof w==='string'?w:JSON.stringify(w)).join('\n')),
          resources.length>0&&h('details',{className:'ds-import-details'},h('summary',null,t('importResources')+' · '+resources.length),h('table',{className:'ds-import-table'},h('thead',null,h('tr',null,h('th',null,t('importFile')),h('th',{style:{width:'20%'}},t('importFormat')),h('th',{style:{width:'16%'}},t('importSize')))),h('tbody',null,resources.slice(0,200).map((r,i)=>h('tr',{key:i},h('td',{title:r.url},r.path||r.url),h('td',null,r.mimeType||r.category),h('td',null,Math.ceil((r.byteLength||0)/1024)+' KB')))))),
          h('details',{className:'ds-import-details'},h('summary',null,t('importDetails')),h('pre',null,JSON.stringify(manifest,null,2).slice(0,80000))));
      };
      const renderWeb=()=>h('div',{className:'ds-import-stack'},h('p',{className:'ds-import-hint'},t('importWebHint')),
        h('form',{className:'ds-import-url',onSubmit:openBrowser},h('label',null,t('importURL'),h('input',{type:'url',value:address,required:true,placeholder:'https://example.com',disabled:busy,onChange:e=>setAddress(e.target.value)})),button(t(browser?'importNavigate':'importOpen'),null,'web',true,{type:'submit'})),
        h('div',{className:'ds-import-viewport'},h('label',null,t('width'),h('input',{type:'number',min:240,max:3840,step:1,value:width,disabled:busy,onChange:e=>setWidth(e.target.value)})),h('label',null,t('height'),h('input',{type:'number',min:240,max:3840,step:1,value:height,disabled:busy,onChange:e=>setHeight(e.target.value)})),button(t('importResize'),()=>{try{const size=viewport();browserAction('resize',size)}catch(e){setProblem(safeError(e))}},'fit',false,{disabled:busy||!browser}),h('span',{className:'ds-import-hint'},t('importViewportHint'))),
        h('div',{className:'ds-import-browser'},h('div',{className:'ds-import-browser-head'},iconButton(t('importBack'),'arrow',()=>browserAction('back'),{disabled:busy||!browser}),iconButton(t('importForward'),'chevron',()=>browserAction('forward'),{disabled:busy||!browser}),h('span',{className:'ds-grow ds-ellip',title:browser?.url},browser?.title||browser?.url||'Chromium'),browser&&h('span',null,browser.width+' × '+browser.height)),
          h('div',{ref:wheelHost,className:'ds-import-browser-view','aria-busy':busy},browser&&/^data:image\/(?:png|jpeg|webp);base64,/.test(browser.screenshot||'')?h('img',{className:'ds-import-screenshot',src:browser.screenshot,alt:t('importScreenshot'),tabIndex:0,draggable:false,style:{width:browser.width,pointerEvents:busy?'none':'auto'},onClick:clickScreenshot,onKeyDown:keyScreenshot,onDragStart:e=>e.preventDefault()}):h('div',{className:'ds-import-placeholder'},h(Icon,{name:'web',size:34}),h('strong',null,t('importBrowserEmpty')),h('p',null,t('importBrowserHint'))))),
        h('p',{className:'ds-import-hint'},t('importControlHint')),
        h('form',{className:'ds-import-control',onSubmit:event=>{event.preventDefault();if(text&&browser)work(async()=>{const value=browserRef.current;const result=await api('browser.action',{projectId,browserId:value.browserId,type:'type',text});if(current()){acceptBrowser(result);setText('')}})}},h('label',null,t('importText'),h('input',{value:text,maxLength:10000,disabled:busy||!browser,onChange:e=>setText(e.target.value)})),button(t('importType'),null,'send',false,{type:'submit',disabled:busy||!browser||!text}),h('label',null,t('importKey'),h('select',{value:key,disabled:busy||!browser,onChange:e=>setKey(e.target.value)},['Enter','Tab','Backspace','Delete','Escape','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Control+A','Meta+A'].map(k=>h('option',{value:k,key:k},k)))),button(t('importPress'),()=>browserAction('key',{key}),null,false,{disabled:busy||!browser})),
        h('div',{className:'ds-import-actions'},button(t('importScrollUp'),()=>browserAction('scroll',{deltaY:-Math.round((browser?.height||800)*.75)}),'pan',false,{disabled:busy||!browser}),button(t('importScrollDown'),()=>browserAction('scroll',{deltaY:Math.round((browser?.height||800)*.75)}),'pan',false,{disabled:busy||!browser})),
        h('label',null,t('importName'),h('input',{value:name,maxLength:200,disabled:busy,onChange:e=>setName(e.target.value)})),h('div',{className:'ds-import-actions'},button(t('importCapture'),capture,'download',true,{disabled:busy||!browser})));
      const renderDesign=()=>h('div',{className:'ds-import-stack'},h('p',{className:'ds-import-hint'},t('importDesignHint')),
        h('div',{className:'ds-import-design'},h('section',{className:'ds-import-card'},h('h3',null,t('importConnection')),
          h('fieldset',{className:'ds-import-fields',disabled:busy||connectionLoading},h('label',null,t('importProvider'),h('select',{value:provider,onChange:e=>chooseProvider(e.target.value)},h('option',{value:'figma'},'Figma'),h('option',{value:'mastergo'},'MasterGo'))),
            h('div',{className:'ds-import-presets'},provider==='figma'?h(React.Fragment,null,button(t('importDesktop'),()=>{setEndpoint(defaults('figma'));setProbe(null)}),button(t('importRemote'),()=>{setEndpoint('https://mcp.figma.com/mcp');setProbe(null)})):h(React.Fragment,null,button(t('importMagic'),()=>{setEndpoint(defaults('mastergo'));setProbe(null)}),button(t('importVibe'),()=>{setEndpoint('http://127.0.0.1:30678/mcp');setProbe(null)}))),
            h('label',null,t('importEndpoint'),h('input',{type:'url',value:endpoint,onChange:e=>{setEndpoint(e.target.value);setProbe(null)},required:true})),h('label',null,t('importTransport'),h('select',{value:transport,onChange:e=>{setTransport(e.target.value);setProbe(null)}},['auto','http','sse'].map(v=>h('option',{value:v,key:v},v)))),
            h('label',null,t('importToken'),h('input',{type:'password',value:token,autoComplete:'new-password',maxLength:16000,placeholder:t(saved?.configured?'importTokenSaved':'importTokenOptional'),onChange:e=>{setToken(e.target.value);tokenRef.current=e.target.value;setProbe(null)}})),h('p',{className:'ds-import-hint'},t(saved?.configured?'importCredentialPresent':'importCredentialAbsent'))),
          h('div',{className:'ds-import-actions'},button(t('importSaveConnection'),saveConnection,'check',false,{disabled:busy||connectionLoading}),button(t('importTestConnection'),testConnection,'link',false,{disabled:busy||connectionLoading||dirty}),button(t('importClearConnection'),clearConnection,null,false,{disabled:busy||connectionLoading})),dirty&&h('p',{className:'ds-import-hint'},t('importSaveFirst')),probe?.connected&&h('p',{className:'ds-import-progress',role:'status'},t('importConnectionReady')+' · '+(probe.server?.name||provider)),
          h('p',{className:'ds-import-hint'},t(provider==='figma'?'importFigmaHint':'importMastergoHint')),h('a',{className:'ds-import-safe-link',href:provider==='figma'?'https://developers.figma.com/docs/figma-mcp-server/local-server-installation/':'https://mastergo.com/help/ai-features/magic-mcp.html',target:'_blank',rel:'noopener noreferrer'},t('importDocs'))),
          h('form',{className:'ds-import-card',onSubmit:importSource},h('h3',null,provider==='figma'?'Figma':'MasterGo'),h('fieldset',{className:'ds-import-fields',disabled:busy||connectionLoading},h('label',null,t('importDesignURL'),h('input',{type:'url',value:designURL,placeholder:provider==='figma'?'https://www.figma.com/design/…?node-id=…':'https://mastergo.com/file/…?layer_id=…',onChange:e=>setDesignURL(e.target.value)})),h('label',null,t('importNode'),h('input',{value:nodeId,maxLength:1000,onChange:e=>setNodeId(e.target.value)})),h('label',null,t('importName'),h('input',{value:name,maxLength:200,onChange:e=>setName(e.target.value)}))),button(t('importRead'),null,'spark',true,{type:'submit',disabled:busy||connectionLoading||dirty}))));
      return h('div',{className:'ds-modal-wrap ds-import-wrap',onPointerDown:event=>{if(event.target===event.currentTarget)requestClose()}},h(FocusDialog,{dialogKey:'import-'+projectId,className:'ds-modal ds-import-dialog',close:requestClose,titleId:'ds-import-title'},
        h('div',{className:'ds-modal-head'},h(Icon,{name:tab==='web'?'web':'link',size:18}),h('span',{id:'ds-import-title',className:'ds-grow'},t('importTitle')+' · '+project.name),iconButton(t('close'),'close',requestClose)),
        h('div',{className:'ds-import-tabs'},button(t('importWebTab'),()=>{setTab('web');setProblem(null)},'web',false,{'aria-pressed':tab==='web'}),button(t('importDesignTab'),()=>{setTab('design');setProblem(null)},'link',false,{'aria-pressed':tab==='design'})),
        h('div',{className:'ds-import-body'},h('div',{className:'ds-import-stack'},errorNode(problem),busy&&h('p',{className:'ds-import-progress',role:'status','aria-live':'polite'},progress||t('importBusy')),tab==='web'?renderWeb():renderDesign(),lastResult&&h('div',{className:'ds-import-success',role:'status'},h('strong',null,t('importDone')),lastResult.ai?.accepted&&h('p',null,t('importAIStarted')),lastResult.ai?.accepted===false&&h('p',null,t('importAIError')),button(t('importShowCanvas'),requestClose,'arrow')),manifestNode()),
          h('section',{className:'ds-import-recent'},h('h3',null,t('importRecent')),!(project.imports||[]).length&&h('p',{className:'ds-import-hint'},t('importNoRecent')),(project.imports||[]).slice(0,20).map((record,index)=>h('div',{key:record.id||index,className:'ds-import-record'},h(Icon,{name:record.kind==='website'?'web':'link',size:16}),h('div',{className:'ds-grow ds-ellip'},h('span',null,record.title||record.sourceUrl||record.kind||t('untitled')),h('small',{title:record.sourceUrl},record.sourceUrl||'')),h('span',{className:'ds-chip'},record.resourceCount??'—'),button(t('importShowManifest'),()=>viewImport(record),'eye'))))),
        h('footer',{className:'ds-import-footer'},h('p',null,t('importStrict')),button(t('close'),requestClose))));
    }
    function App({ctx,t}) {
      const [state,setState]=useState({projects:[],systems:[],groups:[],root:''});
      const [screen,setScreen]=useState('projects'),[groupFilter,setGroupFilter]=useState('all');
      const [project,setProject]=useState(null),[htmls,setHtmls]=useState({}),[assetBases,setAssetBases]=useState({}),[opened,setOpened]=useState(()=>readLocal('opened',[]));
      const [active,setActive]=useState(()=>readLocal('active',null)),[panels,setPanels]=useState(()=>readLocal('panels',{projects:true,systems:false,skills:false}));
      const [aiOpen,setAiOpen]=useState(()=>readLocal('aiOpen',true)),[sizes,setSizes]=useState(()=>readLocal('sizes',{}));
      const [selected,setSelected]=useState(null),[selection,setSelection]=useState(null),[modes,setModes]=useState({}),[tool,setTool]=useState('select'),[space,setSpace]=useState(false);
      const [view,setView]=useState(()=>readLocal('view:'+readLocal('active',null),{x:60,y:70,zoom:.55})),[query,setQuery]=useState(''),[skills,setSkills]=useState([]),[skillQuery,setSkillQuery]=useState('');
      const [error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[modal,setModal]=useState(null),[importMode,setImportMode]=useState(null);
      const [drafts,setDrafts]=useState({}),[aiStates,setAiStates]=useState({}),[generation,setGeneration]=useState('generate');
      const rootRef=useRef(null),canvasRef=useRef(null),projectRef=useRef(null),activeRef=useRef(active),viewRef=useRef(view),viewOwner=useRef(active),gesture=useRef(null),loadSeq=useRef(0),opQueue=useRef(Promise.resolve());
      const draft=drafts[active]||'',aiState=aiStates[active]||{},boards=project?.artboards||[],board=boards.find(b=>b.id===selected);
      projectRef.current=project;activeRef.current=active;viewRef.current=view;
      const fail=useCallback(e=>setError(e?.message||String(e)),[]);
      const refreshState=useCallback(async()=>{const result=await api('state');setState(result);return result},[]);
      const loadProject=useCallback(async(id,{keepView=true}={})=>{
        if(!id||activeRef.current!==id)return;
        const seq=++loadSeq.current;
        const previouslyEmpty=projectRef.current?.id===id&&!projectRef.current.artboards.length;
        const data=await api('project.get',{projectId:id});
        const docs=await Promise.all(data.artboards.map(b=>api('artboard.get',{projectId:id,artboardId:b.id}).then(d=>[b.id,d])));
        if(seq!==loadSeq.current||activeRef.current!==id)return data.project;
        projectRef.current=data.project;setProject(data.project);setHtmls(Object.fromEntries(docs.map(([id,d])=>[id,d.html])));setAssetBases(Object.fromEntries(docs.map(([id,d])=>[id,d.assetBase])));
        setState(s=>({...s,projects:s.projects.map(p=>p.id===id?data.project:p)}));
        setSelected(prev=>data.artboards.some(b=>b.id===prev)?prev:(data.artboards.find(b=>b.id===readLocal('selected:'+id,null))?.id||data.artboards[0]?.id||null));
        if(!keepView||viewOwner.current!==id){viewOwner.current=id;setView(readLocal('view:'+id,data.project.canvas?.zoom?data.project.canvas:{x:60,y:70,zoom:.55}));}
        if(previouslyEmpty&&data.artboards.length&&canvasRef.current){
          const b=data.artboards[0],el=canvasRef.current,z=Math.max(.08,Math.min(1,(el.clientWidth-80)/b.viewport.width,(el.clientHeight-130)/b.viewport.height));
          setView({zoom:z,x:40-b.position.x*z,y:65-b.position.y*z});
        }
        return data.project;
      },[]);
      useEffect(()=>{let live=true;refreshState().then(s=>{if(!live)return;setOpened(o=>o.filter(id=>s.projects.some(p=>p.id===id&&!p.deletedAt&&!p.archived)));if(activeRef.current&&!s.projects.some(p=>p.id===activeRef.current))setActive(null)}).catch(fail).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[refreshState,fail]);
      useEffect(()=>{writeLocal('opened',opened)},[opened]);useEffect(()=>{writeLocal('active',active)},[active]);useEffect(()=>{writeLocal('panels',panels)},[panels]);useEffect(()=>{writeLocal('aiOpen',aiOpen)},[aiOpen]);useEffect(()=>{writeLocal('sizes',sizes)},[sizes]);
      useEffect(()=>{if(active&&viewOwner.current===active)writeLocal('view:'+active,view)},[active,view]);
      useEffect(()=>{if(active&&project?.id===active&&selected)writeLocal('selected:'+active,selected)},[active,project?.id,selected]);
      useEffect(()=>{
        if(!active){setProject(null);setHtmls({});setSelection(null);setSelected(null);return;}
        if(screen!=='project'&&screen!=='skills')return;
        const switching=projectRef.current?.id!==active;
        if(switching){setProject(null);setHtmls({});setSelection(null);setSelected(null);}
        setLoading(true);loadProject(active,{keepView:!switching}).catch(fail).finally(()=>{if(activeRef.current===active)setLoading(false)});
      },[active,screen,loadProject,fail]);
      useEffect(()=>{if(screen!=='skills')return;let live=true;api('skills.list',active?{projectId:active}:{}).then(r=>{if(live)setSkills(Array.isArray(r)?r:r.skills||[])}).catch(fail);return()=>{live=false}},[screen,active,fail]);
      useEffect(()=>{setImportMode(null)},[active,screen]);
      const handleImported=async(result,id)=>{
        if(activeRef.current!==id)return;
        await loadProject(id);if(activeRef.current!==id)return;
        if(result.artboard?.id){setSelected(result.artboard.id);setSelection(null)}
        if(result.ai?.accepted){setAiOpen(true);setAiStates(s=>({...s,[id]:{...s[id],running:true,sessionId:result.ai.sessionId}}))}
        await refreshState();
      };
      const openProject=useCallback(id=>{setOpened(o=>o.includes(id)?o:[...o,id]);setActive(id);setScreen('project');setError('')},[]);
      const closeProject=id=>{setOpened(o=>{const next=o.filter(x=>x!==id);if(active===id){setActive(next[next.length-1]||null);if(!next.length)setScreen('projects');}return next})};
      const mutate=useCallback((action,args={},reload=true)=>{
        const id=args.projectId||activeRef.current;
        const operation=async()=>{
          setBusy(true);setError('');
          try{
            const current=projectRef.current?.id===id?projectRef.current:await api('project.get',{projectId:id}).then(r=>r.project);
            const result=await api(action,{...args,projectId:id,expectedRevision:current.revision});
            const p=result?.project||((result?.artboards&&result?.id)?result:null);
            if(p){setState(s=>({...s,projects:s.projects.map(x=>x.id===id?p:x)}));if(activeRef.current===id){projectRef.current=p;setProject(p);}}
            if(reload&&activeRef.current===id)await loadProject(id);
            return result;
          }catch(e){fail(e);throw e}finally{setBusy(false)}
        };
        const next=opQueue.current.catch(()=>{}).then(operation);opQueue.current=next;return next;
      },[loadProject,fail]);
      const selectedElement=useCallback((id,value)=>{setSelected(id);setSelection({artboardId:id,...value});setGeneration('edit');setAiOpen(true)},[]);
      // Retain every opened project's session so switching tabs does not hide completion.
      const sessionTargets=JSON.stringify(opened.map(id=>{const p=state.projects.find(p=>p.id===id);return p?.aiSessionId?[id,p.aiSessionId]:null}).filter(Boolean));
      useEffect(()=>{
        let live=true;const cleanups=[];
        for(const [id,sessionId] of JSON.parse(sessionTargets)){
          let unsubscribe=()=>{},pending=false,dirty=false,lastKey='',lastRunning=false;
          const keyOf=s=>JSON.stringify([s.running,s.lastAgentError,s.pendingSubmissions?.length,s.awaitingFirstTurn]);
          const update=async binding=>{
            if(!live)return;if(pending){dirty=true;return}
            const snap=binding.session.getSnapshot(),key=keyOf(snap);if(key===lastKey)return;lastKey=key;pending=true;
            try{
              const status=await api('ai.status',{projectId:id});if(!live)return;
              const running=!!(snap.running||status.running);
              setAiStates(s=>({...s,[id]:{...status,running,error:status.error||snap.lastAgentError}}));
              if(lastRunning&&!running){if(activeRef.current===id)await loadProject(id);else{const data=await api('project.get',{projectId:id});if(live)setState(s=>({...s,projects:s.projects.map(p=>p.id===id?data.project:p)}))}}
              lastRunning=running;
            }catch(e){if(live)fail(e)}finally{pending=false;if(dirty){dirty=false;update(binding)}}
          };
          const controller=new AbortController();let reference;
          cleanups.push(()=>{controller.abort();unsubscribe();reference?.release()});
          (async()=>{
            const initial=await api('ai.status',{projectId:id});
            if(live)setAiStates(s=>({...s,[id]:initial}));lastRunning=!!initial.running;
            reference=await retainProjectSession(ctx.sessions,sessionId,controller.signal);
            if(!live){reference.release();return;}
            const binding=await reference.ready;
            if(!live)return;
            unsubscribe=binding.session.subscribe(()=>update(binding));update(binding);
          })().catch(e=>{if(live&&!controller.signal.aborted)fail(new Error(t('sessionUnavailable')))});
        }
        return()=>{live=false;for(const cleanup of cleanups)cleanup()};
      },[sessionTargets,ctx,loadProject,fail]);
      useEffect(()=>{
        const down=e=>{if(e.target.closest?.('.ds-import-dialog'))return;if(e.code==='Space'&&!/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)){e.preventDefault();setSpace(true)}if(e.key==='Escape'){setModal(null);setSelection(null);setSpace(false)}};
        const up=e=>{if(e.code==='Space')setSpace(false)};const blur=()=>setSpace(false);
        window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);
        return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur)};
      },[]);
      useEffect(()=>{
        const el=canvasRef.current;if(!el)return;
        const wheel=e=>{e.preventDefault();const v=viewRef.current;if(e.ctrlKey||e.metaKey){const rect=el.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top,z=Math.min(2,Math.max(.08,v.zoom*Math.exp(-e.deltaY*.005)));setView({zoom:z,x:x-(x-v.x)*z/v.zoom,y:y-(y-v.y)*z/v.zoom})}else setView({...v,x:v.x-e.deltaX,y:v.y-e.deltaY})};
        el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel);
      },[active,project?.id,screen]);
      const fit=useCallback(()=>{
        const bs=projectRef.current?.artboards||[],el=canvasRef.current;if(!el||!bs.length){setView({x:60,y:70,zoom:.55});return}
        const minX=Math.min(...bs.map(b=>b.position.x)),minY=Math.min(...bs.map(b=>b.position.y))-45,maxX=Math.max(...bs.map(b=>b.position.x+b.viewport.width)),maxY=Math.max(...bs.map(b=>b.position.y+b.viewport.height));
        const zoom=Math.min(1,Math.max(.08,Math.min((el.clientWidth-90)/(maxX-minX),(el.clientHeight-120)/(maxY-minY))));
        setView({zoom,x:(el.clientWidth-(maxX-minX)*zoom)/2-minX*zoom,y:(el.clientHeight-(maxY-minY)*zoom)/2-minY*zoom-15});
      },[]);
      const frameWheel=useCallback(info=>{
        const el=canvasRef.current,v=viewRef.current;if(!el)return;
        if(info.zoom){const rect=el.getBoundingClientRect(),x=info.clientX-rect.left,y=info.clientY-rect.top,z=Math.min(2,Math.max(.08,v.zoom*Math.exp(-info.deltaY*.005)));setView({zoom:z,x:x-(x-v.x)*z/v.zoom,y:y-(y-v.y)*z/v.zoom})}
        else setView({...v,x:v.x-info.deltaX,y:v.y-info.deltaY});
      },[]);
      const zoomBy=factor=>{const el=canvasRef.current,v=viewRef.current;if(!el)return;const z=Math.min(2,Math.max(.08,v.zoom*factor)),x=el.clientWidth/2,y=el.clientHeight/2;setView({zoom:z,x:x-(x-v.x)*z/v.zoom,y:y-(y-v.y)*z/v.zoom})};
      const startGesture=(event,kind,b)=>{
        if(event.button!==0&&event.button!==1)return;
        if(event.target.closest('button')&&kind!=='resize')return;
        if(space||tool==='pan'||event.button===1)kind='pan';
        event.preventDefault();event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);
        gesture.current={kind,startX:event.clientX,startY:event.clientY,view:{...viewRef.current},board:b?structuredClone(b):null,projectId:activeRef.current};
        if(b&&kind!=='pan')setSelected(b.id);
      };
      const moveGesture=e=>{
        const g=gesture.current;if(!g)return;const dx=e.clientX-g.startX,dy=e.clientY-g.startY;
        if(g.kind==='pan'){setView({...g.view,x:g.view.x+dx,y:g.view.y+dy});return}
        const id=g.board.id;const next=g.kind==='move'?{position:{x:Math.round(g.board.position.x+dx/g.view.zoom),y:Math.round(g.board.position.y+dy/g.view.zoom)}}:{viewport:{width:Math.max(240,Math.round(g.board.viewport.width+dx/g.view.zoom)),height:Math.max(240,Math.round(g.board.viewport.height+dy/g.view.zoom))}};
        setProject(p=>{if(!p)return p;const value={...p,artboards:p.artboards.map(b=>b.id===id?{...b,...next}:b)};projectRef.current=value;return value});
      };
      const endGesture=()=>{
        const g=gesture.current;if(!g)return;gesture.current=null;
        if(g.kind==='pan')return;
        const b=projectRef.current?.artboards.find(b=>b.id===g.board.id);if(!b)return;
        if(JSON.stringify(b.position)===JSON.stringify(g.board.position)&&JSON.stringify(b.viewport)===JSON.stringify(g.board.viewport))return;
        mutate('artboard.layout',{projectId:g.projectId,artboardId:b.id,position:b.position,viewport:b.viewport},false).catch(()=>loadProject(g.projectId).catch(fail));
      };
      const resizePanel=(e,id)=>{
        e.preventDefault();const start=e.clientX,width=sizes[id]||(id==='ai'?304:232),target=e.currentTarget;target.setPointerCapture(e.pointerId);
        const move=ev=>setSizes(s=>({...s,[id]:Math.max(id==='ai'?250:190,Math.min(420,width+(ev.clientX-start)*(id==='ai'?-1:1)))}));
        const done=()=>{target.removeEventListener('pointermove',move);target.removeEventListener('pointerup',done);target.removeEventListener('pointercancel',done)};
        target.addEventListener('pointermove',move);target.addEventListener('pointerup',done);target.addEventListener('pointercancel',done);
      };
      const btn=(text,fn,icon,primary=false,props={})=>h('button',{type:'button',className:'ds-btn'+(primary?' ds-primary':''),onClick:fn,...props},icon&&h(Icon,{name:icon,size:15}),text);
      const ib=(label,icon,fn,props={})=>h('button',{type:'button',className:'ds-icon-btn',title:label,'aria-label':label,onClick:fn,...props},
        h(Icon,{name:icon,size:16}));
      const togglePanel=id=>setPanels(s=>({...s,[id]:!s[id]}));
      const newProject=()=>setModal({type:'project',name:'',description:'',platform:'web',systemId:'',groupId:(state.groups||[]).some(g=>g.id===groupFilter)?groupFilter:''});
      const editProject=p=>setModal({type:'settings',projectId:p.id,name:p.name,description:p.description||'',systemId:p.systemId||'',systemVersion:p.systemVersion,groupId:(state.groups||[]).some(g=>g.id===p.groupId)?p.groupId:''});
      const newBoard=()=>setModal({type:'board',name:'',platform:project?.platform||'web',html:''});
      const fetchSystem=async id=>{try{const s=await api('system.get',{systemId:id}),latest=s.versions?.at(-1)||s;setModal({type:'system',...s,tokens:JSON.stringify(latest.tokens||{},null,2),platforms:s.platforms||['web','mobile'],guidelines:latest.guidelines||''})}catch(e){fail(e)}};
      const loadSkill=async name=>{try{const s=await api('skill.get',{name,...(active?{projectId:active}:{})});setModal({type:'skill',...s,name,content:s.content||s.instructions||''})}catch(e){fail(e)}};
      const submitModal=async e=>{
        e?.preventDefault();if(!modal||busy)return;setBusy(true);setError('');
        try{
          if(modal.type==='project'){
            let p=await api('project.create',{name:modal.name,description:modal.description,platform:modal.platform,groupId:modal.groupId||null});
            if(modal.systemId){const s=state.systems.find(s=>s.id===modal.systemId);p=await api('project.update',{projectId:p.id,expectedRevision:p.revision,systemId:s.id,systemVersion:s.version||s.revision})}
            await refreshState();setScreen('projects');if(modal.groupId)setGroupFilter(modal.groupId);else setGroupFilter('all');setModal(null);
          }else if(modal.type==='board'){
            const r=await mutate('artboard.create',{name:modal.name,platform:modal.platform,...(modal.html?{html:modal.html}:{})});setSelected(r.artboard.id);const b=r.artboard,el=canvasRef.current,z=el?Math.max(.08,Math.min(1,(el.clientWidth-80)/b.viewport.width,(el.clientHeight-130)/b.viewport.height)):.5;setView({zoom:z,x:40-b.position.x*z,y:65-b.position.y*z});setModal(null);
          }else if(modal.type==='system'){
            let tokens;try{tokens=JSON.parse(modal.tokens||'{}');if(!tokens||typeof tokens!=='object'||Array.isArray(tokens))throw new Error()}catch{throw new Error(t('invalidTokens'))}
            if(modal.id)await api('system.save',{systemId:modal.id,expectedRevision:modal.revision,name:modal.name,description:modal.description,platforms:modal.platforms,tokens,guidelines:modal.guidelines});
            else await api('system.create',{name:modal.name,description:modal.description,platforms:modal.platforms,tokens,guidelines:modal.guidelines});
            await refreshState();setModal(null);
          }else if(modal.type==='settings'){
            const system=state.systems.find(s=>s.id===modal.systemId);
            const current=state.projects.find(p=>p.id===(modal.projectId||active));
            await mutate('project.update',{projectId:modal.projectId||active,name:modal.name,description:modal.description,groupId:modal.groupId||null,systemId:modal.systemId||null,systemVersion:system?(modal.systemId===current?.systemId?current.systemVersion:system.version||system.revision):null},false);setModal(null);
          }else if(modal.type==='source'){
            await mutate('artboard.commit',{artboardId:modal.artboardId,html:modal.html,expectedArtboardRevision:modal.revision,summary:t('sourceUpdated')});setModal(null);
          }else if(modal.type==='restore'){
            await mutate('snapshot.restore',{snapshotId:modal.snapshotId});setModal(null);
          }else if(modal.type==='archive'){
            await mutate('project.archive',{},false);closeProject(active);await refreshState();setModal(null);
          }else if(modal.type==='group'){
            await api(modal.id?'group.update':'group.create',{...(modal.id?{groupId:modal.id,expectedRevision:modal.revision}:{}),name:modal.name});
            await refreshState();setModal(null);
          }else if(modal.type==='deleteGroup'){
            await api('group.delete',{groupId:modal.id,expectedRevision:modal.revision});
            await refreshState();if(groupFilter===modal.id)setGroupFilter('ungrouped');setModal(null);
          }else if(modal.type==='deleteProject'){
            await mutate('project.delete',{projectId:modal.projectId},false);
            closeProject(modal.projectId);await refreshState();setModal(null);
          }
        }catch(e){fail(e)}finally{setBusy(false)}
      };
      const runAI=async e=>{
        e.preventDefault();if(!active||!draft.trim()||aiState.running)return;setBusy(true);setError('');
        const id=active;try{
          const result=await api('ai.run',{projectId:id,prompt:draft,mode:generation,...(generation==='edit'&&selected?{artboardId:selected}:{}),...(generation==='edit'&&selection?.artboardId===selected?{selection}: {})});
          setDrafts(s=>({...s,[id]:''}));setAiStates(s=>({...s,[id]:{...s[id],running:true,sessionId:result.sessionId,messages:[...(s[id]?.messages||[]),{role:'user',text:draft}]}}));
          await loadProject(id);await refreshState();
        }catch(e){fail(e)}finally{setBusy(false)}
      };
      const chooseRoot=async()=>{try{const root=await ctx.uiWorkspace.pickDirectory();if(!root)return;setBusy(true);await api('root.set',{root});setActive(null);setOpened([]);setProject(null);await refreshState()}catch(e){fail(e)}finally{setBusy(false)}};
      const toggleSkill=async name=>{if(!project)return;const names=project.skillNames||[];try{await mutate('project.update',{skillNames:names.includes(name)?names.filter(n=>n!==name):[...names,name]},false)}catch{}};
      const sourceModal=()=>{if(board)setModal({type:'source',artboardId:board.id,name:board.name,revision:board.revision,html:htmls[board.id]||''})};
      const download=()=>{if(!board)return;const blob=new Blob([htmls[board.id]||''],{type:'text/html;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=board.name.replace(/[\\/:*?"<>|]/g,'-')+'.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),0)};
      const groupOptions=()=>[h('option',{key:'none',value:''},t('ungrouped')),...(state.groups||[]).map(g=>h('option',{key:g.id,value:g.id},g.name))];
      const groupField=(value,onChange)=>h('label',null,t('group'),h('select',{value:value||'',onChange:e=>onChange(e.target.value)},groupOptions()));
      const systemOptions=()=>[h('option',{key:'none',value:''},t('unbound')),...state.systems.map(s=>h('option',{key:s.id,value:s.id},s.name+' · v'+(s.version||s.revision)))];
      const sidebar=(id,title,body,foot)=>h('section',{className:'ds-sidebar',key:id,'aria-label':title,style:sizes[id]?{width:sizes[id]}:{}},
        h('div',{className:'ds-side-head'},
        h('span',{className:'ds-grow'},title),ib(t('closePanel'),'close',()=>togglePanel(id))),body,foot,
        h('div',{className:'ds-resizer',onPointerDown:e=>resizePanel(e,id),'aria-hidden':true}));
      const projectPanel=()=>sidebar('projects',t('projects'),
        h(React.Fragment,null,
        h('div',{className:'ds-search'},
        h('input',{value:query,onChange:e=>setQuery(e.target.value),placeholder:t('search'), 'aria-label':t('search')+' '+t('projects')})),
        h('div',{className:'ds-side-scroll'},btn(t('newProject'),newProject,'plus',false,{style:{width:'100%'}}),
        h('div',{className:'ds-section'},t('recent')),state.projects.filter(p=>!p.archived&&p.name.toLowerCase().includes(query.toLowerCase())).map(p=>h('div',{key:p.id},
        h('button',{className:'ds-list-item','data-active':p.id===active,onClick:()=>openProject(p.id)},
        h('span',{className:'ds-list-icon'},
        h(Icon,{name:'projects',size:16})),
        h('span',{className:'ds-grow'},
        h('span',{className:'ds-ellip',style:{display:'block',fontSize:12}},p.name),
        h('span',{className:'ds-muted ds-small'},(p.artboards?.length??0)+' '+t('boardCount'))),p.aiSessionId&&aiStates[p.id]?.running&&h('span',{className:'ds-dot'})),p.id===active&&boards.map(b=>h('button',{key:b.id,className:'ds-list-item ds-board-row','data-active':b.id===selected,onClick:()=>{setSelected(b.id);setSelection(null);setView(v=>({...v,x:40-b.position.x*v.zoom,y:65-b.position.y*v.zoom}))}},
        h(Icon,{name:b.platform==='mobile'?'mobile':'web',size:13}),
        h('span',{className:'ds-ellip ds-grow'},b.name))))),!state.projects.length&&h('div',{className:'ds-empty-side'},
        h(Icon,{name:'folder',size:24}),t('projectHint')))),
        h('div',{className:'ds-side-foot'},
        h('div',{className:'ds-row'},
        h(Icon,{name:'folder',size:12}),
        h('span',{className:'ds-grow'},t('library')),ib(t('changeDirectory'),'dots',chooseRoot,{disabled:busy})),
        h('span',{className:'ds-ellip',title:state.root},state.root)));
      const systemPanel=()=>sidebar('systems',t('systems'),
        h('div',{className:'ds-side-scroll'},btn(t('newSystem'),()=>setModal({type:'system',name:'',description:'',tokens:'{}',guidelines:'',platforms:['web','mobile']}),'plus',false,{style:{width:'100%'}}),
        h('div',{className:'ds-section'},t('designLibrary')),state.systems.map(s=>h('div',{key:s.id},
        h('button',{className:'ds-list-item','data-active':project?.systemId===s.id,onClick:()=>fetchSystem(s.id)},
        h('span',{className:'ds-list-icon'},
        h(Icon,{name:'systems',size:16})),
        h('span',{className:'ds-grow'},
        h('span',{className:'ds-ellip',style:{display:'block',fontSize:12}},s.name),
        h('span',{className:'ds-muted ds-small'},'v'+(s.version||s.revision)+' · '+(s.platforms||['web','mobile']).map(x=>t(x)).join(' / '))),project?.systemId===s.id&&h('span',{className:'ds-dot'})),project&&(project.systemId!==s.id||project.systemVersion!==(s.version||s.revision))&&h('button',{className:'ds-link',style:{marginLeft:47},disabled:busy,onClick:()=>mutate('project.update',{systemId:s.id,systemVersion:s.version||s.revision},false).catch(()=>{})},t('useVersion')))),!state.systems.length&&h('div',{className:'ds-empty-side'},
        h(Icon,{name:'systems',size:24}),t('noSystems'),
        h('p',null,t('systemHint')))),project?.systemId&&h('div',{className:'ds-side-foot'},t('systemPinned')+' · v'+project.systemVersion));
      const skillPanel=()=>sidebar('skills',t('skills'),
        h(React.Fragment,null,
        h('div',{className:'ds-search'},
        h('input',{value:skillQuery,onChange:e=>setSkillQuery(e.target.value),placeholder:t('search'),'aria-label':t('search')+' '+t('skills')})),
        h('div',{className:'ds-side-scroll'},
        h('p',{className:'ds-muted ds-small',style:{padding:'0 3px 8px'}},t('skillHint')),!active&&h('p',{className:'ds-small ds-muted'},t('chooseProject')),skills.filter(s=>(s.name+' '+s.description).toLowerCase().includes(skillQuery.toLowerCase())).map(s=>h('div',{key:s.name,className:'ds-skill'},
        h('label',null,
        h('input',{type:'checkbox',checked:!!project?.skillNames?.includes(s.name),disabled:!project||busy,onChange:()=>toggleSkill(s.name)}),
        h('span',{className:'ds-grow ds-ellip',title:s.name},s.name)),
        h('p',{className:'ds-skill-desc'},s.description),
        h('button',{className:'ds-link',style:{marginLeft:24},onClick:()=>loadSkill(s.name)},t('read')))),!skills.length&&h('div',{className:'ds-empty-side'},t('noSkills')))),project&&h('div',{className:'ds-side-foot'},(project.skillNames?.length||0)+' '+t('skillsCount')));
      const liveProjects=state.projects.filter(p=>!p.deletedAt&&!p.archived);
      const restoreProject=async p=>{try{await mutate('project.restore',{projectId:p.id},false);await refreshState()}catch{}};
      const renderGroups=()=>{
        const row=(id,label,count,group)=>h('div',{key:id,className:'ds-group-row','data-active':groupFilter===id},
          h('button',{className:'ds-group-main',onClick:()=>setGroupFilter(id)},h(Icon,{name:'folder',size:14}),h('span',{className:'ds-grow ds-ellip'},label),h('span',{className:'ds-small ds-muted'},count)),
          group&&ib(t('renameGroup'),'settings',()=>setModal({type:'group',...group})),group&&ib(t('deleteGroup'),'close',()=>setModal({type:'deleteGroup',...group})));
        return h('aside',{className:'ds-groups','aria-label':t('groups')},
          h('div',{className:'ds-side-head'},h('span',{className:'ds-grow'},t('projectManager'))),
          h('div',{className:'ds-side-scroll'},row('all',t('allProjects'),liveProjects.length),row('ungrouped',t('ungrouped'),liveProjects.filter(p=>!p.groupId).length),
            h('div',{className:'ds-row ds-section'},h('span',{className:'ds-grow'},t('groups')),ib(t('newGroup'),'plus',()=>setModal({type:'group',name:''}))),
            ...(state.groups||[]).map(g=>row(g.id,g.name,liveProjects.filter(p=>p.groupId===g.id).length,g)),
            h('div',{style:{borderTop:'1px solid var(--d-border)',marginTop:18,paddingTop:9}},row('trash',t('trash'),state.projects.filter(p=>p.deletedAt||p.archived).length))),
          h('div',{className:'ds-side-foot'},h('div',{className:'ds-row'},h(Icon,{name:'folder',size:12}),h('span',{className:'ds-grow'},t('library')),ib(t('changeDirectory'),'dots',chooseRoot,{disabled:busy})),h('span',{className:'ds-ellip',title:state.root},state.root)));
      };
      const renderProjectSidebar=()=>h('aside',{className:'ds-board-sidebar','aria-label':t('frames')},
        h('div',{className:'ds-side-head'},h('span',{className:'ds-grow'},t('frames')),ib(t('newBoard'),'plus',newBoard,{disabled:!project})),
        h('div',{className:'ds-side-scroll'},boards.map(b=>h('button',{key:b.id,className:'ds-list-item','data-active':selected===b.id,onClick:()=>{setSelected(b.id);setSelection(null);setView(v=>({...v,x:40-b.position.x*v.zoom,y:65-b.position.y*v.zoom}))}},
          h(Icon,{name:b.platform==='mobile'?'mobile':'web',size:16}),h('span',{className:'ds-grow ds-ellip'},b.name))),!boards.length&&h('p',{className:'ds-muted ds-small',style:{padding:12}},t('noBoards'))),
        h('div',{className:'ds-side-foot'},project?.name||t('loading')));
      const renderManagement=()=>{
        const trash=groupFilter==='trash';
        const projectItems=(trash?state.projects.filter(p=>p.deletedAt||p.archived):liveProjects).filter(p=>
          (trash||groupFilter==='all'||(groupFilter==='ungrouped'?!p.groupId:p.groupId===groupFilter))&&
          (p.name+' '+(p.description||'')).toLowerCase().includes(query.toLowerCase()));
        const title=screen==='systems'?t('systems'):screen==='skills'?t('skills'):trash?t('trash'):groupFilter==='all'?t('projectManager'):groupFilter==='ungrouped'?t('ungrouped'):(state.groups||[]).find(g=>g.id===groupFilter)?.name||t('projectManager');
        const headAction=screen==='systems'?btn(t('newSystem'),()=>setModal({type:'system',name:'',description:'',tokens:'{}',guidelines:'',platforms:['web','mobile']}),'plus',true):screen==='projects'&&!trash?btn(t('newProject'),newProject,'plus',true):null;
        return h('main',{className:'ds-management','aria-label':title},
          h('div',{className:'ds-manager-head'},h('div',{className:'ds-grow'},h('h1',null,title),h('p',null,t(screen==='systems'?'systemsManagerHint':screen==='skills'?'skillsManagerHint':'managerHint'))),headAction),
          screen==='projects'?h(React.Fragment,null,
            h('div',{className:'ds-manager-tools'},h('input',{value:query,onChange:e=>setQuery(e.target.value),placeholder:t('search')+' '+t('projects'),'aria-label':t('search')+' '+t('projects')}),h('span',{className:'ds-small ds-muted'},projectItems.length+' '+t('projectCount'))),
            h('div',{className:'ds-project-grid'},projectItems.map(p=>h('article',{className:'ds-project-card',key:p.id},
              h('div',{className:'ds-card-top'},h('span',{className:'ds-card-icon'},h(Icon,{name:'projects',size:20})),h('span',{className:'ds-chip'},t(p.platform||'web')),h('span',{className:'ds-grow'}),!trash&&ib(t('editProject'),'settings',()=>editProject(p)),!trash&&ib(t('deleteProject'),'close',()=>setModal({type:'deleteProject',projectId:p.id,name:p.name}))),
              h('h2',null,p.name),h('p',{className:'ds-card-description'},p.description||t('noDescription')),
              h('div',{className:'ds-card-meta'},h('span',null,(p.artboards?.length||0)+' '+t('boardCount')),h('span',null,'·'),h('span',null,t('updated')+' '+new Date(p.updatedAt).toLocaleDateString())),
              h('div',{className:'ds-card-foot'},trash?btn(t('restoreProject'),()=>restoreProject(p),'history',false,{disabled:busy}):h(React.Fragment,null,
                h('select',{'aria-label':t('moveToGroup')+' · '+p.name,value:p.groupId||'',disabled:busy,onChange:e=>mutate('project.update',{projectId:p.id,groupId:e.target.value||null},false).catch(()=>{})},groupOptions()),
                btn(t('enterProject'),()=>openProject(p.id),'chevron',true)))))), 
            !projectItems.length&&h('div',{className:'ds-manager-empty'},h(Icon,{name:'folder',size:36}),h('strong',null,t(trash?'emptyTrash':query?'noMatchingProjects':groupFilter==='all'?'noProjects':'groupEmpty')))):
          screen==='systems'?h('div',{className:'ds-project-grid'},state.systems.map(s=>h('article',{className:'ds-project-card',key:s.id},h('div',{className:'ds-card-top'},h('span',{className:'ds-card-icon'},h(Icon,{name:'systems',size:20})),h('span',{className:'ds-chip'},'v'+s.revision)),h('h2',null,s.name),h('p',{className:'ds-card-description'},s.description||t('systemHint')),h('div',{className:'ds-card-meta'},(s.platforms||[]).map(x=>t(x)).join(' / ')),h('div',{className:'ds-card-foot'},btn(t('editSystem'),()=>fetchSystem(s.id),'settings')))),!state.systems.length&&h('p',{className:'ds-muted'},t('noSystems'))):
          h(React.Fragment,null,h('div',{className:'ds-manager-tools'},h('select',{'aria-label':t('chooseSkillProject'),value:active||'',onChange:e=>setActive(e.target.value||null),style:{maxWidth:300}},h('option',{value:''},t('chooseSkillProject')),...liveProjects.map(p=>h('option',{key:p.id,value:p.id},p.name))),h('input',{value:skillQuery,onChange:e=>setSkillQuery(e.target.value),placeholder:t('search')+' '+t('skills'),'aria-label':t('search')+' '+t('skills')})),
            h('div',{className:'ds-skill-catalog'},skills.filter(s=>(s.name+' '+s.description).toLowerCase().includes(skillQuery.toLowerCase())).map(s=>h('article',{className:'ds-skill',key:s.name},h('label',null,h('input',{type:'checkbox',checked:!!project?.skillNames?.includes(s.name),disabled:!project||busy,onChange:()=>toggleSkill(s.name)}),h('span',{className:'ds-grow ds-ellip',title:s.name},s.name)),h('p',{className:'ds-skill-desc'},s.description),h('button',{className:'ds-link',onClick:()=>loadSkill(s.name),style:{marginLeft:24}},t('read')))),!skills.length&&h('p',{className:'ds-muted'},t('noSkills')))));
      };
      const renderCanvas=()=>h('section',{className:'ds-work'},project&&h('div',{className:'ds-work-head ds-import-toolbar'},
        ib(t('backToProjects'),'arrow',()=>setScreen('projects')),
        h(Icon,{name:'projects',size:15}),
        h('span',{className:'ds-grow ds-ellip',style:{fontWeight:550}},project.name),
        h('div',{className:'ds-import-entry'},btn(t('webImport'),()=>setImportMode('web'),'web',false,{disabled:busy}),btn(t('designImport'),()=>setImportMode('design'),'link',false,{disabled:busy})),
        h('span',{className:'ds-chip ds-hide-small'},boards.length+' '+t('boardCount')),ib(t('newBoard'),'plus',newBoard),ib(t('history'),'history',()=>setModal({type:'history'})),ib(t('projectSettings'),'settings',()=>editProject(project))),
        h('div',{className:'ds-canvas',ref:canvasRef,tabIndex:0,'aria-label':t('studio')+' '+t('canvasHint'),style:{cursor:space||tool==='pan'?'grab':'default',backgroundPosition:`${view.x}px ${view.y}px`,backgroundSize:`${Math.max(10,24*view.zoom)}px ${Math.max(10,24*view.zoom)}px`},onPointerDown:e=>{if(e.target===e.currentTarget||space||tool==='pan'||e.button===1)startGesture(e,'pan')},onPointerMove:moveGesture,onPointerUp:endGesture,onPointerCancel:endGesture},!project?h('div',{className:'ds-empty'},
        h('div',{className:'ds-empty-art'},
        h(Icon,{name:'canvas',size:46})),
        h('span',{className:'ds-chip'},t('local')+' · HTML'),
        h('h2',null,t('noProjects')),
        h('p',null,t('projectHint')+' '+t('localHint')),btn(t('newProject'),newProject,'plus',true)):!boards.length?h('div',{className:'ds-empty'},
        h('div',{className:'ds-empty-art'},
        h(Icon,{name:'canvas',size:46})),
        h('h2',null,t('noBoards')),
        h('p',null,t('boardHint')),btn(t('newBoard'),newBoard,'plus',true)):h('div',{className:'ds-world',style:{transform:`translate(${view.x}px,${view.y}px) scale(${view.zoom})`}},boards.map(b=>h('div',{key:b.id,className:'ds-board','data-selected':selected===b.id,style:{left:b.position.x,top:b.position.y,width:b.viewport.width,height:b.viewport.height}},
        h('div',{className:'ds-board-title',title:t('dragBoard'),onPointerDown:e=>startGesture(e,'move',b)},
        h(Icon,{name:b.platform==='mobile'?'mobile':'web',size:16}),
        h('span',{className:'ds-grow ds-ellip'},b.name),
        h('span',{style:{fontSize:10,marginRight:6}},b.viewport.width+' × '+b.viewport.height),
        h('button',{'aria-pressed':(modes[b.id]||'edit')==='edit',onClick:()=>setModes(m=>({...m,[b.id]:'edit'}))},t('edit')),
        h('button',{'aria-pressed':modes[b.id]==='preview',onClick:()=>{setModes(m=>({...m,[b.id]:'preview'}));setSelection(null)}},t('preview'))),
        h('div',{style:{width:'100%',height:'100%',pointerEvents:space||tool==='pan'?'none':'auto'}},
        h(Frame,{board:b,html:htmls[b.id],assetBase:assetBases[b.id],mode:modes[b.id]||'edit',onSelection:selectedElement,onSpace:setSpace,onWheel:frameWheel})),selected===b.id&&(modes[b.id]||'edit')==='edit'&&h('div',{className:'ds-resize',title:t('resizeBoard'),onPointerDown:e=>startGesture(e,'resize',b)})))),project&&h('div',{className:'ds-canvas-bar'},ib(t('select'),'select',()=>setTool('select'),{'aria-pressed':tool==='select'}),ib(t('pan'),'pan',()=>setTool('pan'),{'aria-pressed':tool==='pan'}),
        h('span',{className:'ds-divider'}),ib(t('zoomOut'),'minus',()=>zoomBy(1/1.2)),
        h('span',{className:'ds-zoom'},Math.round(view.zoom*100)+'%'),ib(t('zoomIn'),'plus',()=>zoomBy(1.2)),ib(t('fit'),'fit',fit),board&&h(React.Fragment,null,
        h('span',{className:'ds-divider'}),ib(t('source'),'code',sourceModal),ib(t('export'),'download',download))),project&&h('div',{className:'ds-canvas-note'},t('canvasHint'))));
      const renderAI=()=>h('aside',{className:'ds-ai','aria-label':t('ai'),style:sizes.ai?{width:sizes.ai}:{}},
        h('div',{className:'ds-resizer',onPointerDown:e=>resizePanel(e,'ai'),'aria-hidden':true}),
        h('div',{className:'ds-ai-head'},
        h(Icon,{name:'spark',size:16}),
        h('span',{className:'ds-grow'},t('ai')),ib(t('closePanel'),'close',()=>setAiOpen(false))),
        h('div',{className:'ds-ai-scroll'},!(aiState.messages?.length)&&h('div',{className:'ds-ai-welcome'},
        h(Icon,{name:'spark',size:27}),
        h('strong',null,t('aiWelcome')),
        h('p',null,t('aiWelcomeDetail'))),(aiState.messages||[]).map((m,i)=>h('div',{key:i,className:'ds-message','data-role':m.role},m.role!=='user'&&h('div',{className:'ds-message-label'},t('ai')),m.text||m.content||'')),aiState.running&&h('div',{className:'ds-status ds-running'},
        h(Icon,{name:'refresh',size:13}),t('working')+'…'),aiState.error&&h('p',{style:{color:'var(--dsw-alias-state-error-primary)',fontSize:12}},typeof aiState.error==='string'?aiState.error:JSON.stringify(aiState.error))),
        h('form',{className:'ds-ai-compose',onSubmit:runAI},selection&&selection.artboardId===selected&&h('div',{className:'ds-context'},
        h('div',{className:'ds-row'},
        h(Icon,{name:'select',size:12}),
        h('span',{className:'ds-grow'},t('selected')),ib(t('clearSelection'),'close',()=>setSelection(null))),
        h('code',null,selection.selector),
        h('p',{className:'ds-ellip',style:{marginTop:5}},selection.text)),project&&h('div',{className:'ds-row ds-small ds-muted'},
        h(Icon,{name:'projects',size:12}),
        h('span',{className:'ds-grow ds-ellip'},project.name),project.systemId&&h(Icon,{name:'systems',size:12}),(project.skillNames?.length||0)>0&&h('span',null,project.skillNames.length+' '+t('skillsCount'))),
        h('select',{'aria-label':t('target'),value:generation==='generate'?'new':selected||'new',disabled:!project||aiState.running,onChange:e=>{if(e.target.value==='new'){setGeneration('generate');setSelection(null)}else{setSelected(e.target.value);setGeneration('edit')}}},
        h('option',{value:'new'},t('newTarget')),...boards.map(b=>h('option',{key:b.id,value:b.id},b.name))),
        h('textarea',{value:draft,onChange:e=>setDrafts(s=>({...s,[active]:e.target.value})),placeholder:project?(generation==='edit'?t('editPlaceholder'):t('promptPlaceholder')):t('chooseProject'),'aria-label':t('ai'),disabled:!project,onKeyDown:e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();runAI(e)}}}),
        h('div',{className:'ds-row'},
        h('span',{className:'ds-status ds-grow'},
        h('span',{className:'ds-dot',style:{background:aiState.running?'var(--d-accent)':'var(--dsw-alias-state-idle-primary)'}}),aiState.running?t('working'):t('ready')),aiState.running?btn(t('stop'),async()=>{try{await api('ai.cancel',{projectId:active})}catch(e){fail(e)}},'stop'):btn(t('send'),null,'send',true,{type:'submit',disabled:!project||!draft.trim()||busy})),project?.aiSessionId&&h('button',{className:'ds-link',type:'button',onClick:async()=>{try{await ctx.sessions.refresh();ctx.uiWorkspace.openSession(project.aiSessionId)}catch{fail(new Error(t('sessionUnavailable')))}}},t('openSession'))));
      function renderModal(){
        if(!modal)return null;
        const update=(key,value)=>setModal(m=>({...m,[key]:value}));
        const field=(label,key,opts={})=>h('label',null,label,
        h(opts.area?'textarea':'input',{value:modal[key]||'',onChange:e=>update(key,e.target.value),required:opts.required,placeholder:opts.placeholder,rows:opts.rows||3,className:opts.code?'ds-code':undefined,...(opts.area?{}:{type:'text'})}));
        const type=modal.type,title={project:'newProject',board:'newBoard',system:modal.id?'editSystem':'newSystem',settings:'projectSettings',history:'history',skill:'skillContent',source:'source',restore:'snapshotConfirm',archive:'archiveConfirm',group:modal.id?'renameGroup':'newGroup',deleteGroup:'deleteGroup',deleteProject:'deleteProject'}[type];
        const readonly=type==='history'||type==='skill';
        const content=type==='group'?field(t('groupName'),'name',{required:true}):type==='deleteGroup'?h('p',null,t('deleteGroupHint')):type==='deleteProject'?h(React.Fragment,null,h('strong',null,modal.name),h('p',null,t('deleteProjectHint'))):type==='project'?h(React.Fragment,null,
        h('p',{className:'ds-muted ds-small'},t('newProjectDetail')),field(t('name'),'name',{required:true,placeholder:t('projectName')}),field(t('description'),'description',{area:true}),groupField(modal.groupId,value=>update('groupId',value)),
        h('label',null,t('platform'),
        h('div',{className:'ds-segment'},...['web','mobile'].map(p=>h('button',{key:p,type:'button','aria-pressed':modal.platform===p,onClick:()=>update('platform',p)},t(p))))),
        h('label',null,t('binding'),
        h('select',{value:modal.systemId,onChange:e=>update('systemId',e.target.value)},systemOptions()))):type==='board'?h(React.Fragment,null,field(t('name'),'name',{required:true,placeholder:t('boardName')}),
        h('label',null,t('platform'),
        h('select',{value:modal.platform,onChange:e=>update('platform',e.target.value)},
        h('option',{value:'web'},t('web')),
        h('option',{value:'mobile'},t('mobile')))),field(t('html'),'html',{area:true,code:true,placeholder:t('htmlHint')})):type==='system'?h(React.Fragment,null,field(t('name'),'name',{required:true,placeholder:t('systemName')}),field(t('description'),'description',{area:true,rows:2}),
        h('label',null,t('platform'),
        h('div',{className:'ds-segment'},...['web','mobile'].map(p=>h('button',{key:p,type:'button','aria-pressed':modal.platforms?.includes(p),onClick:()=>update('platforms',modal.platforms?.includes(p)?(modal.platforms.length>1?modal.platforms.filter(x=>x!==p):modal.platforms):[...(modal.platforms||[]),p])},t(p))))),field(t('tokens'),'tokens',{area:true,code:true}),field(t('guidelines'),'guidelines',{area:true,rows:5}),modal.id&&h('p',{className:'ds-small ds-muted'},'v'+(modal.version||modal.revision))):type==='settings'?h(React.Fragment,null,field(t('name'),'name',{required:true}),field(t('description'),'description',{area:true}),groupField(modal.groupId,value=>update('groupId',value)),
        h('label',null,t('binding'),
        h('select',{value:modal.systemId,onChange:e=>update('systemId',e.target.value)},systemOptions())),modal.systemId&&modal.systemVersion&&h('p',{className:'ds-small ds-muted'},t('systemPinned')+' · v'+modal.systemVersion),
        h('p',{className:'ds-small ds-muted'},t('projectPath')+': '+state.root+'/projects/'+(modal.projectId||active)),btn(t('deleteProject'),()=>setModal({type:'deleteProject',projectId:modal.projectId||active,name:modal.name}),'close')):type==='source'?h(React.Fragment,null,
        h('p',{className:'ds-muted ds-small'},t('sourceHint')),
        h('textarea',{'aria-label':t('source'),className:'ds-code',style:{minHeight:340},value:modal.html,onChange:e=>update('html',e.target.value)})):type==='skill'?h(React.Fragment,null,
        h('strong',null,modal.name),
        h('p',{className:'ds-muted ds-small'},modal.description),
        h('pre',{className:'ds-code'},modal.content||t('emptySkillContent'))):type==='history'?h(React.Fragment,null,
        h('p',{className:'ds-muted ds-small'},t('restoreHint')),!(project?.history?.length)&&h('p',null,t('noHistory')),[...(project?.history||[])].map(s=>h('div',{key:s.id,className:'ds-history'},
        h('div',{className:'ds-row'},
        h('strong',{className:'ds-grow'},s.summary||t('version')+' '+s.revision),
        h('span',{className:'ds-chip'},'v'+s.revision)),
        h('p',{className:'ds-small ds-muted'},new Date(s.createdAt).toLocaleString()),
        h('button',{className:'ds-link',type:'button',onClick:()=>setModal({type:'restore',snapshotId:s.id})},t('restore'))))):h('p',null,t(type==='restore'?'restoreConfirm':'archiveHint'));
        return h('div',{className:'ds-modal-wrap',onPointerDown:e=>{if(e.target===e.currentTarget&&!busy)setModal(null)}},
        h(FocusDialog,{dialogKey:type,className:'ds-modal'+(['source','skill','system'].includes(type)?' ds-wide':''),close:()=>setModal(null),titleId:'ds-dialog-title'},
        h('div',{className:'ds-modal-head'},
        h('span',{className:'ds-grow',id:'ds-dialog-title'},t(title)),ib(t('close'),'close',()=>setModal(null),{disabled:busy})),
        h('form',{onSubmit:submitModal},
        h('div',{className:'ds-form'},content,error&&h('p',{role:'alert',style:{color:'var(--dsw-alias-state-error-primary)',fontSize:12}},error)),
        h('div',{className:'ds-modal-foot'},btn(t(readonly?'close':'cancel'),()=>setModal(null),null,false,{disabled:busy}),!readonly&&btn(t(busy?'busy':type==='deleteProject'||type==='deleteGroup'?'delete':type==='project'||type==='board'||(type==='group'&&!modal.id)?'create':type==='system'&&modal.id?'saveNewVersion':type==='restore'?'restore':type==='archive'?'archive':'save'),null,null,true,{type:'submit',disabled:busy})))));
      }
      return h('div',{className:'ds',ref:rootRef},
        h('style',null,css+importCss),
        h('header',{className:'ds-top','data-window-drag':true},
        h('div',{className:'ds-brand'},
        h('span',{className:'ds-brand-mark'},
        h(Icon,{name:'canvas',size:18})),t('studio')),
        h('span',{className:'ds-mode'},'Beta'),
        h('span',{className:'ds-grow'}),
        h('div',{className:'ds-status ds-hide-small'},
        h(Icon,{name:busy?'refresh':'check',size:12}),t(busy?'busy':'saved')),
        h('div',{className:'ds-top-actions'},ib(t('refresh'),'refresh',()=>{refreshState().then(()=>screen==='project'&&active&&loadProject(active)).catch(fail)},{disabled:busy}),screen==='project'&&ib(t('ai'),'spark',()=>setAiOpen(s=>!s),{'aria-pressed':aiOpen}),
        h('span',{className:'ds-divider'}),btn(t('normal'),()=>ctx.layout.selectPanel(null),'arrow'))),
        h('nav',{className:'ds-tabs','aria-label':t('projects')},h('button',{type:'button',className:'ds-tab ds-manager-tab',role:'tab','aria-selected':screen==='projects',onClick:()=>setScreen('projects')},h(Icon,{name:'projects',size:14}),t('managementTab')),...opened.map(id=>{const p=state.projects.find(p=>p.id===id);if(!p)return null;return h('div',{className:'ds-tab',key:id,role:'tab','aria-selected':screen==='project'&&active===id},
        h('button',{className:'ds-row',onClick:()=>openProject(id)},
        h(Icon,{name:'projects',size:13}),
        h('span',{className:'ds-ellip'},p.name),aiStates[id]?.running&&h('span',{className:'ds-dot'})),ib(t('projectClosed'),'close',()=>closeProject(id)))}),ib(t('newProject'),'plus',newProject)),error&&!modal&&h('div',{className:'ds-error',role:'alert'},
        h('span',{className:'ds-grow'},error),ib(t('close'),'close',()=>setError(''))),
        h('div',{className:'ds-body'},
        h('nav',{className:'ds-rail','aria-label':t('designLibrary')},...['projects','systems','skills'].map(id=>h('button',{key:id,className:'ds-rail-btn','aria-pressed':screen===id||(screen==='project'&&id==='projects'),title:t(id),onClick:()=>{setScreen(id);setError('')}},
        h(Icon,{name:id,size:20}),
        h('span',null,t(id)))),
        h('span',{className:'ds-grow'}),
        h('span',{className:'ds-small ds-muted',style:{textAlign:'center'}},'DSH')),
        screen==='project'?h(React.Fragment,null,renderProjectSidebar(),renderCanvas(),aiOpen&&renderAI()):h(React.Fragment,null,screen==='projects'&&renderGroups(),renderManagement()),loading&&h('div',{className:'ds-status',style:{position:'absolute',top:12,left:'50%',padding:'6px 10px',background:'var(--d-panel)',borderRadius:8,zIndex:15}},
        h(Icon,{name:'refresh',size:12}),t('loading'))),modal&&renderModal(),screen==='project'&&project?.id===active&&importMode&&h(ImportDialog,{key:active,project,t,initialTab:importMode,onClose:()=>setImportMode(null),onImported:handleImported}));
    }

return {React,App,ImportDialog,FocusDialog,Frame,WorkspaceSurface,Icon,zh,en,api,readLocal,writeLocal,css,importCss};
}

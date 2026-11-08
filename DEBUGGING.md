# 独立 DSH 调试实例

从仓库根目录运行：

```sh
sh scripts/designer-debug.sh
```

启动器使用已安装的 DeepSeek Harness Desktop 自带 CLI 和 Node 运行时；无需全局安装 Node 或另外下载 DSH。默认每次启动先构建本地 Designer Client，再通过官方 CLI 将本地插件以 `link:` 方式加入独立 Web profile，选择空闲端口并由 DSH 打开带认证的启动链接。终端保持打开，按 Ctrl+C 停止这一个实例。

如果没有自动打开浏览器：

```sh
sh scripts/designer-debug.sh --no-open
```

复制终端 `dsh web:` 后面的**完整链接**到浏览器，其中的认证参数用于建立本次访问会话。仅输入主机和端口会遇到 `dsh web authentication required`。重启后以新输出的链接为准。不要把认证链接写入版本控制或公开分享。

## 数据与权限范围

- DSH_HOME：`.build/designer-debug/home`。Web profile、模型设置、凭据、会话、附件和其他 DSH 持久化状态独立存放。
- 测试工作区：`.build/designer-debug/workspace`，默认文件策略为 `workspace-write`，保留正常审批。
- 设计库：`.build/designer-debug/workspace/DesignerLibrary`。首次启动为空，请新建测试项目。
- 插件源码：本独立仓库根目录。使用真实后端、真实宿主 UI 和真实业务接口。

不复制桌面实例的配置、登录信息、历史对话或原设计项目。需要测试 AI 时，在调试实例自己的模型设置中配置提供商/登录及默认模型；模型任务和外部连接未在启动检查中验证。当前桌面 DSH 可以继续对话，调试实例的配置及进程与它分开。`.build/` 已被 Git 忽略。

## 日常修改与重启

修改 `client-entry.jsx`、`ui/` 或 `editor/` 后，停止调试实例并重新运行启动命令；启动器会重新构建 `client.js`。修改 Host JS 后也可按同样步骤重启加载。随后刷新测试浏览器，必要时使用本次完整启动链接重新认证。

此入口没有启动源码热更新 watcher，不承诺保存后自动更新。它不改动当前桌面 DSH 的安装包或 profile。

可选参数：

```sh
# 使用已有 client.js，跳过本次构建
sh scripts/designer-debug.sh --no-build

# 固定测试端口；端口被占用时明确报错
sh scripts/designer-debug.sh --port 60610

# 只准备独立 profile 与本地构建，不启动服务
sh scripts/designer-debug.sh --setup-only

# 真实启动检查；完成后自动停止，不打开浏览器
sh scripts/designer-debug.sh --smoke
```

`--smoke` 检查匿名访问被拒绝、正常认证交换、Web bootstrap、Designer API、设计库/工作区路径及三个工具的实际注册。它不等于浏览器界面、真实模型、外部账号或完整产品流程验收。

若 Desktop 安装在其他位置，设置 `DSH_APP_RESOURCES` 为该应用的 `Contents/Resources` 目录。启动器只使用 `web` profile，不使用桌面实例保留的 `desktop` profile。首次需要源码依赖已经安装；缺少依赖时在插件目录运行 `npm ci --ignore-scripts`。

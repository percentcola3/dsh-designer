# DSH Designer

Designer 的独立源码仓库：[`percentcola3/dsh-designer`](https://github.com/percentcola3/dsh-designer)。插件包名保持 `@local/dsh-designer`，供 DeepSeek Harness（DSH）安装使用。

本仓库私有，包标记为 `private: true`、`license: UNLICENSED`，不发布到 npm。第三方许可证和来源说明保留在 `licenses/`、`vendor/`，不受本项目私有声明替代。

## 安装

使用有权访问本仓库的 GitHub 账号下载 Release。以 `v0.4.20` 为例：

```sh
gh release download v0.4.20 --repo percentcola3/dsh-designer --pattern '*.tgz' --pattern SHA256SUMS
```

在下载目录校验：Linux 使用 `sha256sum -c SHA256SUMS`，macOS 使用 `shasum -a 256 -c SHA256SUMS`。再通过 DSH 官方插件管理器安装本地 `.tgz`；是否需要重启，以安装工具返回为准。

私有 Release 下载需要鉴权，不作为公开安装地址。安装包包含已构建客户端，不要求现场编译；不要手动编辑 DSH profile。

## 功能

在 DSH 中进入设计师模式，使用首页需求输入、项目与多设计稿、画布和资源查看器。设计体系、知识库和技能提供统一的搜索与卡片入口；AI 沿用 DSH 的会话、模型、权限和附件服务。源码登记、项目 Git 同步和交付遵守各自的范围与版本检查。

- [功能与边界](docs/FEATURES.md)
- [诊断与优化](DIAGNOSTICS.md)
- [源码工作流](SOURCE-MODE.md)
- [UI 接口合同](ui/API-CONTRACT.md)
- [需求矩阵](REQUIREMENTS.md)
- [实施索引](WORKBENCH-PLAN.md)

## 开发

推荐 Node.js 24；最低 Node.js 22.14。在仓库根目录执行：

```sh
npm ci --ignore-scripts
npm run build
npm run check
```

`check` 仅在内存中检查客户端构建；实际安装包或界面调试需要先执行 `build`。已安装 DSH Desktop 时可启动隔离调试环境：

```sh
npm run dev
```

启动器直接使用本仓库源码，隔离 DSH_HOME 和测试项目。可通过 `DSH_APP_RESOURCES` 指定 Desktop 的 `Contents/Resources` 目录；认证链接不提交到仓库。详见[独立调试](DEBUGGING.md)。

## 验证与自动化

本地按影响范围验证：样式做编译和相关浏览器检查，交互运行对应测试，不为每次 UI 调整默认执行全量回归。

```sh
npm run test:focused -- ui/knowledge-panel-state.test.js
npm test
npm run verify:package
```

`npm test` 执行 portable 全量测试，Node test 并发数为 4。PR/main 的 GitHub CI 自动安装锁定依赖、构建、运行 portable 测试、校验并打包。依赖真实 DSH 的合同用例在未安装宿主时明确跳过；真实 UI、模型、外部账号及服务须另行验证。

`npm run test:models` 显式启用真实模型集成，**会下载和缓存测试模型**。它与日常 CI 分开，也可在 Actions 的手动模型工作流中运行；普通 `npm test` 不下载模型。

开发约定见 [CONTRIBUTING](CONTRIBUTING.md)，版本变化见 [CHANGELOG](CHANGELOG.md)，私有包发布见[发布说明](docs/RELEASING.md)。

# 开发约定

本仓库独立维护 `@local/dsh-designer`，不再以其他工作区中的副本作为代码来源。保留第三方许可证、vendor 来源和 provenance，不发布到 npm。

## 环境

推荐 Node.js 24，最低 22.14。仓库根目录执行：

```sh
npm ci --ignore-scripts
npm run build
npm run check
```

`check` 仅检查 Client 内存编译，不写入新的 Client。真实界面调试或打包前执行 `build`；包完整性使用 `npm run verify:package`。

## 按影响范围验证

- 样式：编译并在相关浏览器页面检查浅深色、桌面和窄屏，不默认全量回归。
- 状态或交互：运行关联用例，检查成功、取消、重试和错误路径。
- Host、数据格式或权限：覆盖版本冲突、权限边界、旧数据兼容；跨模块核心变化再扩大回归。
- PR/main 和发布：GitHub CI 自动执行 portable 全量测试、构建和打包校验。

```sh
npm run test:focused -- ui/knowledge-panel-state.test.js
npm test
npm run verify:package
```

Node test 并发为 4。portable 测试不要求模型下载和已安装 DSH；真实宿主合同按环境明确跳过。跳过不表示验证通过。

## 宿主调试

```sh
npm run dev
```

需要已安装 DSH Desktop；`DSH_APP_RESOURCES` 可指定应用的 `Contents/Resources`。调试源码为本仓库，隔离 DSH_HOME 和测试项目位于 `.build/`，不复制日常宿主凭据、会话和项目。

使用终端输出的完整认证链接，不提交 token 或认证链接。修改 UI 后重新构建并按启动器要求加载；修改 Host 后重启调试实例。不承诺源码保存后自动热更新。详细步骤见 [DEBUGGING](DEBUGGING.md)。

## 可选集成

```sh
npm run test:models
```

此命令显式设置 `DSH_MODEL_TESTS=1`，会下载和缓存真实测试模型。也可手动运行 Actions 中的 Model integration；普通 PR/main CI 不执行它。

真实宿主 UI、Native Session、模型列表、真实模型任务及外部账号服务需单独记录。不要把编译、模拟服务或截图夹具描述为这些验收已经完成。

## 提交与发布

说明问题、行为变化及实际验证。样式附相关界面证据；行为变更说明取消、重试和权限检查。不提交 node_modules、生成的 Client、安装包、调试数据或凭据。

发布步骤见[发布说明](docs/RELEASING.md)。更新版本和 CHANGELOG，确认 main CI 后精确推送版本标签，不覆盖已发布标签。

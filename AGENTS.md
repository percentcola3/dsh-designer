# Designer 插件维护约定

本仓库是 `@local/dsh-designer` 的独立源码，原 dsh-forme 工作区不再作为本仓库的代码来源。

- 修改源码；不要手改生成的 `client.js`。运行 `npm run build` 后由 DSH 官方插件管理器安装/更新，按实际输出决定是否重启宿主。
- 本地按影响范围验证：纯样式做 `npm run check` 和相关浏览器检查；状态/交互做对应测试；跨模块核心变动才跑完整 `npm test`。不为每次 UI 调整重复全量测试。
- GitHub CI 在隔离环境执行 portable 回归、构建和打包校验。真实模型下载、浏览器及已安装 DSH 的合同验证需要显式启用，不把条件跳过当作已经通过。
- 调试使用 `npm run dev`，测试数据和隔离 DSH_HOME 在 `.build/`；不读取/复制生产凭据、会话或项目来充当夹具。
- 固定版本保存在 package.json 和 package-lock.json。发布前更新版本和 CHANGELOG；仅推送与版本一致的 `vX.Y.Z` 标签，Release 自动上传运行时 tgz 与 SHA-256 校验。
- 保留 vendor 源码出处、provenance 和第三方许可证；修改 SDK 构建器后真实重建，不能手改 hash 冒充重建。
- 不提交 node_modules、生成客户端、安装包、调试数据、认证链接或令牌。不自动发布 npm 包。

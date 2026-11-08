# 变更记录

## 0.4.20

独立仓库起始版本；实际发布状态以本私有仓库的 GitHub Release 为准。

- Designer 完整源码、测试、vendor 与第三方许可证独立维护，包名保持 `@local/dsh-designer`。
- 配置 PR/main 的 Node.js 24 构建、portable 回归和运行时打包校验。
- 配置版本标签发布私有 `.tgz`、`SHA256SUMS` 与构建元数据，不发布 npm。
- 测试和 SDK 构建缓存改为仓库内 `.build`，真实模型测试独立显式启用，保留默认原生 FTS 验证。
- 本地按影响范围检查，提供 focused 测试和隔离宿主调试入口。
- 原功能说明保留在[功能说明](docs/FEATURES.md)。

不补造独立仓库创建之前的 Release 历史；CI 和夹具结果不替代真实模型或宿主 UI 验收。

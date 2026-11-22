# 发布 DSH 安装包

稳定版本发布到公开 GitHub Release，每版使用相同的资产名 `dsh-designer.tgz`。README 中的安装地址自动指向最新稳定版。

## 自动化

- PR/main：Ubuntu、Node.js 24，锁定依赖安装、源码构建、portable 全量测试、包校验。
- `vX.Y.Z` 标签：复用上述检查，确认标签与 package.json、lockfile 版本一致，且标签提交属于 main 历史；成功后发布 `.tgz`、`SHA256SUMS`、`release.json`。
- 手动 Model integration：显式下载并运行真实模型集成。普通 CI 不要求模型、已安装的 DSH 或外部账号，不把条件跳过视为通过。

包校验覆盖实际文件集合、Host 依赖闭包、Client 语法和第三方来源。真实 UI、原生模型列表、Session、模型任务及外部服务另行验证。

## 发布

先合并所需修改、更新 CHANGELOG 并提交。维护者在干净的 main 工作树执行：

```sh
git switch main
git pull --ff-only
npm ci --ignore-scripts
npm run build
npm run verify:package
npm version patch
```

`npm version patch` 默认更新 package.json 和 lockfile，并生成版本提交和带注释的标签。先推 main，避免本机 push.followTags 配置提前发布：

```sh
git -c push.followTags=false push origin main
gh run list --branch main --commit "$(git rev-parse HEAD)"
```

确认该提交的 main CI 通过，再精确推送本次标签：

```sh
VERSION_TAG="v$(node -p "require('./package.json').version")"
git show --no-patch "$VERSION_TAG"
git push origin "$VERSION_TAG"
```

不要用 `--tags` 代替精确推送，不强推覆盖已发布标签。普通 main 推送不创建 Release；标签检查通过后自动发布。可从 Actions 手动重跑一个尚未发布的现有标签。

已发布 Release 的资产视为不可变；同一标签重复发布会失败，修订使用新版本。

## 更新 README 中的镜像版本

发布后，先从 GitHub Release 读取新版安装包的字节数和 SHA-256，再从镜像下载该版本文件核对。使用隔离的 DSH 配置和空的包缓存，限制联网目标为镜像及 npm 源，验证安装、宿主加载版本和插件工具注册。验证通过后将 README 的固定版本地址、文件大小和校验值一起更新。镜像暂不可用时继续保留上次实测版本。

## 下载和校验

以已发布的 v0.4.79 为例：

```sh
gh release view v0.4.79 --repo percentcola3/dsh-designer
gh release download v0.4.79 --repo percentcola3/dsh-designer --pattern '*.tgz' --pattern SHA256SUMS --pattern release.json
```

Linux 使用 `sha256sum -c SHA256SUMS`；macOS 使用 `shasum -a 256 -c SHA256SUMS`。

通过 DSH 官方插件管理器安装已校验的本地 `.tgz`。是否需要重启以工具结果为准。

安装后分别确认版本、入口和所需业务行为。安装、CI 成功不等于真实模型或外部账号已验收。

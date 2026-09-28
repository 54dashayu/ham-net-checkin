# HAM 台网点名主控台 V1.04 正式发布交付

## 发布基线

- 用户可见版本：`V1.04`
- npm / Tauri / Cargo：`1.4.0`
- 分支：`codex/v1.04-desktop-release`
- 标签：`desktop-v1.04`
- 架构：Tauri 2 + 系统 WebView

最终 commit、产物大小、SHA-256、Release URL 与公开下载状态在发布完成后以 GitHub Release 和校验文件为准。

## 交付范围

- V1.04 源码与中英文说明书。
- 网页版生产构建与服务器部署。
- Win64 x64 NSIS 安装包。
- Developer ID 签名、Apple 公证并 staple 的 macOS DMG。
- GitHub tag/Release、安装包、说明文档与 SHA-256。
- 相关页面和下载链接更新；V1.03、V1.02.1 保留回退。

## 发布门禁

| 区域 | 门禁 |
| --- | --- |
| 源码 | `npm test`、`npm run build`、`git diff --check` |
| Tauri | `cargo check --manifest-path src-tauri/Cargo.toml` |
| Win64 | tag commit 的 Actions 构建成功、NSIS x64 产物存在 |
| macOS | 签名、公证、staple、挂载、`codesign`、`spctl` 全部通过 |
| 文档 | 应用入口打开 V1.04 中英文说明；release notes 与版本元数据一致 |
| 发布面 | GitHub 与公开下载文件大小、SHA-256 一致，公开 URL 可访问 |

## 已知边界

- Win64 未在 Windows 真机执行安装、覆盖安装和卸载。
- 未覆盖全部 Windows 10/11 WebView2 与 macOS 小版本。
- DNS 因 ICP 备案暂停的二级域名不在本次发布中自行恢复；不可访问入口需明确标记。

## 回退

- 桌面端：使用保留的 V1.03 或 V1.02.1 安装包并核对其 SHA-256。
- 网页版：恢复部署前服务器备份并重启服务。
- GitHub：保留旧 tag/Release，不覆盖或删除旧资产。

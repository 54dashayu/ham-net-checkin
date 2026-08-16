# HAM 台网点名主控台 V1.03 桌面正式发布交付

## 发布基线

- 用户可见版本：`V1.03`
- npm / Tauri / Cargo 版本：`1.3.0`
- 发布分支：`codex/v1.03-desktop-release`
- 发布标签：`desktop-v1.03`
- 桌面架构：Tauri 2 + 系统 WebView，不捆绑 Chromium

发布 commit、产物大小与 SHA-256 以 GitHub Release 及同步发布的 `SHA256SUMS-HAM-Checkin-1.03.txt` 为准。安装包必须由该标签指向的 commit 构建。

## 用户可见变化

- FMO 监听项单击只加入备选，不立即查询呼号资料库。
- 双击备选卡片进入记录区时，才查询并合并 QTH、设备与历史资料。
- 备选卡片不显示“待录入”文字。
- 网络版访问局域网设备时提供更明确的本地设备桥接提示。
- 继承 V1.02.1 的稳定序号、跳号和手动 Excel 列选择修复。

## 产物与公开面

| 平台 | 产物 | 验证 |
| --- | --- | --- |
| Win64 x64 | `HAM-Checkin-1.03-Win64-Setup.exe` | GitHub Actions Windows runner 构建；NSIS / x64 元数据检查 |
| macOS | `HAM-Checkin-1.03-macOS.dmg` | Developer ID 签名、Apple 公证、staple、挂载、`codesign`、`spctl` |
| 校验 | `SHA256SUMS-HAM-Checkin-1.03.txt` | 本地、GitHub Release 与 VPS 三处比对 |

公开入口：

- GitHub Release：<https://github.com/54dashayu/ham-net-checkin/releases/tag/desktop-v1.03>
- Win64：<https://fmo.bh1jss.net/downloads/ham-checkin/HAM-Checkin-1.03-Win64-Setup.exe>
- macOS：<https://fmo.bh1jss.net/downloads/ham-checkin/HAM-Checkin-1.03-macOS.dmg>
- SHA-256：<https://fmo.bh1jss.net/downloads/ham-checkin/SHA256SUMS-HAM-Checkin-1.03.txt>
- VPS 网络版：<https://fmo.bh1jss.net/checkin/>

## 测试矩阵与门禁

| 区域 | 门禁 | 证据 |
| --- | --- | --- |
| 源码 | 单元测试、生产构建、`git diff --check` | `npm test`、`npm run build` |
| Tauri | Rust 编译检查 | `cargo check --manifest-path src-tauri/Cargo.toml` |
| Win64 | tag 对应 commit 的 Windows Actions 构建成功 | Actions run 与 artifact |
| macOS | tag 对应 commit 的签名/公证构建成功 | Actions run、notarytool、stapler、codesign、spctl |
| VPS | 服务 active，页面包含 V1.03，主路由和静态资源 HTTP 200 | `systemctl`、远程文件、公网 URL |
| 发布面 | Release/VPS 产物大小与 SHA-256 一致 | Release API、checksum、HTTP 探测 |

## 未验证风险

- Win64 没有在 Windows 真机执行安装、覆盖安装和卸载；Actions 构建成功不等于真机安装验证。
- 没有对所有 Windows 10/11 WebView2 和 macOS 版本做全量回归。
- FMO 实际设备与网络环境差异仍可能影响 WebSocket 连接；本次不改变 FMO 协议与设备端行为。

## 回退方法

- 桌面端：从同一下载页使用保留的 V1.02.1 Win64/macOS 安装包，并按 V1.02.1 校验文件复核。
- VPS：从部署前的 `/opt/ham-checkin` 带时间戳备份恢复，重启 `ham-checkin` 后检查服务与 `/checkin/` 公网入口。
- GitHub：保留 `desktop-v1.02.1` Release；不删除旧 tag 和旧 assets。

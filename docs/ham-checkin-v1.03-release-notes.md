# HAM 台网点名主控台 V1.03

## 本次更新

- 优化 FMO 候选录入性能。
- 单击监听列表时只把当前监听数据加入备选区，不查询呼号资料库。
- 双击备选卡片进入记录区后，才按呼号索引查询并合并 QTH、设备及历史资料。
- 备选卡片不再显示“待录入”文字，减少连续点名时的视觉干扰。
- 网络版尝试访问局域网设备时，显示更明确的本地设备桥接提示文案。
- 避免多个备选呼号触发重复的全库查询，改善连续点名录入的响应速度。

## 继承的 V1.02.1 修复

- 每条记录保存独立稳定序号，删除记录不再重排，可从指定的下一序号继续。
- 手动 Excel 导出可选择“天线”“功率”“模式”列；自动保存仍保留全部列。
- 旧版记录和 JSON 备份可自动补齐序号并保留已有有效序号。

## 发布范围

- VPS 网页版升级到 V1.03。
- Win64 提供 Tauri 2 / 系统 WebView2 的 NSIS x64 安装包。
- macOS 提供 Tauri 2 / 系统 WebKit 的 DMG，必须通过 Developer ID 签名、Apple 公证、staple 和 Gatekeeper 验证。
- GitHub Release 与 VPS 下载目录同步提供安装包和 SHA-256 校验文件。
- V1.02.1 安装包与校验文件继续保留，作为公开回退版。

## 版本与产物

- 用户可见版本：`V1.03`
- npm / Tauri / Cargo 版本：`1.3.0`
- 发布标签：`desktop-v1.03`
- Win64：`HAM-Checkin-1.03-Win64-Setup.exe`
- macOS：`HAM-Checkin-1.03-macOS.dmg`
- 校验：`SHA256SUMS-HAM-Checkin-1.03.txt`

## 验证边界

- Win64 由 GitHub Actions `windows-latest` x64 runner 构建并检查产物元数据；未在 Windows 真机安装。
- macOS 产物在 macOS runner 完成挂载、签名、Gatekeeper 和 staple 验证，下载后再在本机重复验证。
- 未对所有 Windows 10/11 与 macOS 版本做全量真机回归。

## 回退

- 桌面端可从公开下载页改用 V1.02.1 安装包。
- VPS 部署前保留 `/opt/ham-checkin` 带时间戳备份；如 V1.03 出现阻断问题，恢复备份并重启 `ham-checkin` 服务。

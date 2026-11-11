# V1.04.01

内部版本 1.4.1，基于 V1.04。

- FMO 仪表盘与备选区保留原始呼号标记，双击选入填写区后使用标准呼号。
- M. 对应 M5（ESP32），P. 对应 Passport，.R 对应 RedDV。
- 本地版每次启动检查新版本；“关于”可手动检查。用户确认后由 Tauri 更新器下载、验证签名并安装，再重新启动。
- 更新前将本地点名数据备份到 ham-before-update-backup；失败时保留当前版本，可使用官方下载页恢复安装。
- 后续发布须在安装包验收完成后更新 updates/latest.json。平台为 darwin-aarch64、windows-x86_64，包含安装包 HTTPS 地址与 Tauri 签名。版本使用三段数字比较。
- 签名私钥只保存在受限本地目录和 GitHub Actions Secret 中，仓库及安装包仅含公钥。不得丢失或更换既有签名私钥。
- 首次升级到本版仍需手动安装；本版可接收后续 OTA。

发布前须完成 Mac 签名、公证、Gatekeeper 验证，以及 Windows 构建；Windows 真机安装结果单独记录。

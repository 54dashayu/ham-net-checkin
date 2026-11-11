# V1.04.01 发布记录（2026-11-11）

- 代码产物基线：d4ca7af，分支 codex/v1.04.01-desktop-release。
- Mac 构建：GitHub Actions 43032124900，Windows 构建：43032137952，均成功。
- Mac：Developer ID 签名、Apple 公证、stapler、Gatekeeper，本机复核通过；arm64。
- OTA：Tauri updater，平台 darwin-aarch64、windows-x86_64；每次启动检查，确认后下载和安装。签名及篡改拒绝校验通过。界面调用、备份与重启采用模拟原生 IPC 验证。
- 13 项自动测试及生产构建通过。
- Windows 真机安装、两平台实际跨版本覆盖升级尚未现场验证；不得把模拟 IPC 当作完整原生升级实测。
- Windows SHA256：1c69ba32c3d08e303c87485bccdfd3b9e9ecca632ee900b239d6da03594ba57d。
- Mac DMG SHA256：c3ee3a8b730b984b17a4707a2da934e48835db91daf7172243fc5f96c274a483。

正式入口：https://fmo.bh1jss.net/checkin/ 。下载中心：https://app.bh1jss.net/#checkin-downloads 。

OTA 清单：https://fmo.bh1jss.net/checkin/updates/latest.json 。发布下一版本前须先上传完成签名及验收的包，再原子替换清单，不得更换既有更新公钥。

回退：旧 V1.04 文件未覆盖；恢复旧安装包可回退客户端。网页 index.html 备份位于阿里云 /var/backups/ham-checkin/20261111-v10401-final；下载页备份在下载服务器 /var/backups/ham-checkin/20261111-v10401-stage/app-index-before.html。

升级前备份键 ham-before-update-backup 保存点名记录和活动配置；原有资料库存储键未改变。首次安装支持 OTA 的本版仍需手动安装。

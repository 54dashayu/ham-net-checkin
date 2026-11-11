# V1.04.03 候选交付（2026-11-12）

状态：Mac 安装及原生跨版本 OTA 通过；Windows 按用户要求暂不在虚拟机测试，原生安装及升级未验收。正式下载入口和 OTA 清单保持原版本，尚未正式上线。

源码分支：codex/v1.04.02-location-upgrade；产物 commit：29532f2。

构建：
- Mac：https://github.com/54dashayu/ham-net-checkin/actions/runs/43062555117
- Windows：https://github.com/54dashayu/ham-net-checkin/actions/runs/43062577071

变更：监听区和备选区保留设备原始呼号；进入填写区时提取标准呼号并匹配 M5、Passport、RedDV 模式。地址查询与 FMO 最终规则对齐。修复更新提示撑高标题、重复版本提示及 Mac 原生确认框不显示。

验证：16 项自动测试与生产构建通过；两端 OTA 签名和篡改拒绝通过。Mac 公证、Gatekeeper、安装后签名通过；1.4.1 覆盖安装至 1.4.2，再真实 OTA 至 1.4.3。原始备份与 OTA 前备份分别对比升级后数据，109 条存储记录、活动配置、监听配置、资料库配置和授权均保留。仅正常同步时间字段不作字节一致比较；密钥等授权字段严格比较且不输出。

SHA256：
```
b0ae2af6574463c12d988fad549674c7c4836992b11ceb87c119e7976b99e1c5  HAM-Checkin-1.04.03-macOS.dmg
c877300d998673188f49fbbf8c7313dfa228d92089290a0b5eaa9e847747bf65  HAM-Checkin-1.04.03-Win64-Setup.exe
45ddb3fcb772ed2a34f26ef2c46206fe1f14c69e4bdd584621a8831b63b05eb6  HAM-Checkin-1.04.03-macOS.app.tar.gz
```

旧 Mac 1.4.1 的升级确认入口不能工作，需要先手动覆盖安装修复版一次；之后 OTA 已实测成功。无需卸载或清理应用数据。Windows 安装器尚无 Authenticode 签名，不能将 OTA 签名等同于 Windows 发行者签名。

恢复：先退出软件。旧 Mac 应用和升级前后数据库快照位于本机 ~/Library/Application Support/HAM升级验证/20261112（受限权限，不随安装包交付）。回退应用时保留 WebKit 数据目录；如需恢复数据，先备份当前数据，再从受限目录的 SQLite 快照恢复原 LocalStorage 数据库，避免在软件运行时覆盖。Windows 已有升级前虚拟机快照与 EBWebView 备份，尚未执行升级，因此未验证其恢复流程。

后续门禁：使用可用 Windows 原生环境验证安装、跨版本 OTA、点名记录、配置和资料库授权；验收通过后上传正式静态下载、校验远端 SHA256，最后原子切换 OTA 清单和下载页。

# V1.04.01

内部版本 1.4.1，基于 V1.04。

- 监听来源自动截取标准呼号。
- M. 对应 M5（ESP32），P. 对应 Passport，.R 对应 RedDV。
- 本地版启动检查新版本；“关于”可手动检查。发现新版后提示并打开官方下载页。
- 后续发布须在安装包验收完成后更新 desktop-latest.json 的 version、displayVersion、downloadPage。版本使用三段数字比较。
- 本版提供更新提醒，不自动覆盖安装。首次升级到本版仍需手动安装。

发布前须完成 Mac 签名、公证、Gatekeeper 验证，以及 Windows 构建；Windows 真机安装结果单独记录。

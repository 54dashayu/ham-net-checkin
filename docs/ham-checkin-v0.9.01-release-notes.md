# HAM 台网点名主控台 V0.9.01 发布记录

日期：2026-06-27

## 版本定位

V0.9.01 是 V0.9 测试版的修正构建，重点修复主控发射提示、顶部主控信息字段和桌面宽度适配问题。

界面版本显示为 `V0.9.01`。由于 npm/electron-builder 版本号需符合 semver，`package.json` 保持 `0.9.1`。

## 本次修复

- 主控发射提示：停止发射后对同一核心呼号增加 0.7 秒短抑制，避免停止后被实时列表首位历史记录再次点亮。
- 主控信息：顶部新增“主控天线”，并同步写入本地导出和服务端保存生成的 Excel 主控行。
- 宽度适配：桌面工作台最小宽度调整为 1200px，窄窗口不再把首行控件压缩到不可用。
- 基础库：Web 构建产物包含 `data/profiles/base-profiles.json`，本地测试和服务端静态读取路径保持一致。

## 已生成产物

- Web/VPS：`release/HAM台网点名主控台-0.9.01-web.tar.gz`
- Web/VPS 校验：`release/SHA256SUMS-web-0.9.01.txt`
- VPS 服务部署包：`release/HAM台网点名主控台-0.9.01-vps-bundle.tar.gz`
- VPS 服务部署包校验：`release/SHA256SUMS-vps-0.9.01.txt`
- macOS Universal Developer ID 已签名测试包：`release/macos-v0.9.01/HAM-Checkin-0.9.01-macOS-Universal-signed-not-notarized.dmg`
- macOS 已签名包校验：`release/macos-v0.9.01/SHA256SUMS-macOS-signed-0.9.01.txt`

## 校验值

```text
43d81eb15615fdc478f55bb3ff84644edfbbe68238d2883d009391813bdb1f1d  release/HAM台网点名主控台-0.9.01-web.tar.gz
64aa91e91b8b10ff39a8ea0e755557e0330eb34d394582b8d976f7afa9dde964  release/HAM台网点名主控台-0.9.01-vps-bundle.tar.gz
8a6762e4aee902cb9c242bd570ed339242aab8784453caf1981222da78027e78  release/macos-v0.9.01/HAM-Checkin-0.9.01-macOS-Universal-signed-not-notarized.dmg
d46a9c71694afc00eac3d0c745aca3caa0a7a2e74f2709bb7bd1202c9f138f86  release/macos-v0.9.01/HAM-Checkin-0.9.01-macOS-Universal-signed-not-notarized.dmg.blockmap
```

## 已验证

- `npm run profiles:audit` 通过：基础库 13564 条，无无效/重复呼号，构建时拒绝 4 条脏呼号。
- `npm run build` 通过，并将基础库复制到 `dist/data/profiles/base-profiles.json`。
- `node --check server/index.mjs` 通过。
- 隔离数据目录下 `POST /api/checkins` 通过，可生成服务端 Excel 记录。
- 本地服务 `http://127.0.0.1:37174/` 返回 200。
- 1200px 视口下顶部 6 个字段同排，包含“主控天线”。
- 关于弹窗版本显示为 `V0.9.01`。

## 桌面分发说明

macOS 本次已使用 `Developer ID Application: Feng Yu (NJFQ3H2HNZ)` 签名，`codesign --verify --deep --strict` 通过；但本机没有可用 notarytool profile，尚未完成 Apple notarization 和 staple。`spctl` 结果为 `rejected / Unnotarized Developer ID`，因此网页下载直接打开仍会被 Gatekeeper 拦截。

Windows Win64 正式包建议通过 GitHub Actions 的 Windows runner 构建。当前本地改动尚未提交和推送，直接触发 workflow 会构建远端旧代码。

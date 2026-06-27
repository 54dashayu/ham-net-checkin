# HAM 台网点名主控台 V0.9.01 发布记录

日期：2026-06-27

## 版本定位

V0.9.01 是 V0.9 测试版的修正构建，重点调整顶部主控信息字段、桌面宽度适配和多平台分发包。主控发射提示逻辑已回溯到 V0.9 原机制。

界面版本显示为 `V0.9.01`。由于 npm/electron-builder 版本号需符合 semver，`package.json` 保持 `0.9.1`。

## 本次修复

- 主控发射提示：回溯到 V0.9 原机制，不保留 V0.9.01 早期测试中的 0.7 秒抑制窗口。
- 主控信息：顶部新增“主控天线”，并同步写入本地导出和服务端保存生成的 Excel 主控行。
- 宽度适配：桌面工作台最小宽度调整为 1200px，窄窗口不再把首行控件压缩到不可用。
- 基础库：Web 构建产物包含 `data/profiles/base-profiles.json`，本地测试和服务端静态读取路径保持一致。

## 已生成产物

- Web/VPS：`release/HAM台网点名主控台-0.9.01-web.tar.gz`
- Web/VPS 校验：`release/SHA256SUMS-web-0.9.01.txt`
- VPS 服务部署包：`release/HAM台网点名主控台-0.9.01-vps-bundle.tar.gz`
- VPS 服务部署包校验：`release/SHA256SUMS-vps-0.9.01.txt`
- Win64 ZIP：`release/actions-win64-v0.9.01-rollback/HAM-Checkin-0.9.01-Win64.zip`
- Win64 ZIP 校验：`release/actions-win64-v0.9.01-rollback/SHA256SUMS-win64-zip-0.9.01.txt`
- macOS Universal Developer ID 公证版：`release/macos-v0.9.01/HAM-Checkin-0.9.01-macOS-Universal-notarized.dmg`
- macOS 公证版校验：`release/macos-v0.9.01/SHA256SUMS-macOS-notarized-0.9.01.txt`

## 校验值

```text
f9b27018f05af7ec29db1dbbabb07a03c3b0bc042629c2207dc20263f6a62c56  release/HAM台网点名主控台-0.9.01-web.tar.gz
14e26103dab2c97ade97b60448c6bdc2f06c3863f98d5f68fa0e37b26e002396  release/HAM台网点名主控台-0.9.01-vps-bundle.tar.gz
474fb80a226e4a83871eea0cceb4b62076256bbc8c7341058a39ca033daa0b07  release/actions-win64-v0.9.01-rollback/HAM-Checkin-0.9.01-Win64.zip
427eb91efe8359163ba8f9988ede18b3a4d52ad196bb039461c4363e46923c65  release/macos-v0.9.01/HAM-Checkin-0.9.01-macOS-Universal-notarized.dmg
```

## 已验证

- `npm run profiles:audit` 通过：基础库 13564 条，无无效/重复呼号，构建时拒绝 4 条脏呼号。
- `npm run build` 通过，并将基础库复制到 `dist/data/profiles/base-profiles.json`。
- `node --check server/index.mjs` 通过。
- 隔离数据目录下 `POST /api/checkins` 通过，可生成服务端 Excel 记录。
- 本地服务 `http://127.0.0.1:37174/` 返回 200。
- 1200px 视口下顶部 6 个字段同排，包含“主控天线”。
- 关于弹窗版本显示为 `V0.9.01`。
- Win64 GitHub Actions 构建成功：`https://github.com/54dashayu/ham-net-checkin/actions/runs/28294602101`。
- macOS DMG 和 DMG 内 `.app` 均通过 `spctl`，来源为 `Notarized Developer ID`。
- VPS `/checkin/`、Win64 ZIP、macOS DMG、Web 包和校验文件均返回 HTTP 200。

## 桌面分发说明

macOS 本次已使用 `Developer ID Application: Feng Yu (NJFQ3H2HNZ)` 签名，并通过 Apple notarization 与 `stapler staple`。公网下载的 DMG 经 `spctl -a -vvv -t install` 验证为 `accepted / Notarized Developer ID`。

Windows Win64 正式包已通过 GitHub Actions 的 Windows runner 构建，并以 ZIP 形式发布到 VPS 下载页。

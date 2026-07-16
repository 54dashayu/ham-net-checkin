# HAM 台网点名主控台 V1.02 交付与后续开发基线

## 1. 文档用途

本文档是 V1.02 完结时的交付快照，作为后续 V1.03 及更新版本的开发起点。

V1.02 的功能范围已冻结：

- 保留原有点名、候选、呼号资料库、Excel / ADIF 导出和备份功能。
- 完成 BM DMR、MMDVM、HAMBOX、FMO、YSF Dashboard 和 D-Star Dashboard 候选监听。
- P25、NXDN、FCS 仅保留模式入口和“监听功能待开发”状态，暂不实现。
- 后续小版本可优先增加已确认可抓取的 YSF / D-Star Dashboard，不建议在未有明确需求时扩展新协议。

## 2. 版本与代码基线

- 用户可见版本：`V1.02`
- `package.json` 版本：`1.2.0`
- Tauri / Cargo 版本：`1.2.0`
- 发布分支：`codex/ham-v1.0.01-win64-installer`
- 基线提交：`4f315c2 Release HAM Check-in V1.02 digital dashboard modes`
- 发布标签：`desktop-v1.02`
- GitHub Release：<https://github.com/54dashayu/ham-net-checkin/releases/tag/desktop-v1.02>

## 3. 已交付运行面

### 3.1 VPS 网络版

- 公网入口：<https://fmo.bh1jss.net/checkin/>
- 介绍与下载页：<https://fmo.bh1jss.net/>
- VPS 应用目录：`/opt/ham-checkin`
- 运行数据目录：`/var/lib/ham-checkin`
- systemd 服务：`ham-checkin.service`
- Node 服务端口：`127.0.0.1:37173`
- Nginx 路径：`/checkin/`
- 安装包下载目录：`/var/www/fmologs/downloads/ham-checkin/`

VPS 版的 YSF / D-Star Dashboard 由 `server/index.mjs` 访问外部页面、解析 Last Heard 表格并返回 JSON。不要改回浏览器直接跨域抓取，否则会再次遇到 CORS、HTTP/HTTPS 混合内容和超时差异。

### 3.2 轻量本地版

- 框架：Tauri 2 + 系统 WebView。
- 不捆绑 Chromium，不使用 Electron 发布包。
- 内置 HTTP 服务：`127.0.0.1:37175`
- 直接访问局域网 MMDVM / HAMBOX / FMO。
- YSF / D-Star Dashboard 请求由 Tauri 内置 Rust 服务转发至 VPS 的 `/checkin/api/ysf/last-heard` 和 `/checkin/api/dstar/last-heard` 接口。

因此，“本地版监听 MMDVM”可以直连局域网；“本地版查看 YSF / D-Star Dashboard”仍需要能访问 `fmo.bh1jss.net`。

## 4. 监听模式状态

| 模式 | V1.02 状态 | 数据来源 / 说明 |
| --- | --- | --- |
| BM DMR | 已完成 | BM 网络在线数据，通话组输入 |
| MMDVM | 已完成 | 本地 Dashboard / Last Heard，支持 TS1 / TS2 |
| HAMBOX | 已完成 | 局域网设备数据 |
| FMO | 已完成 | WebSocket / 最近通联候选 |
| YSF | 已完成基本功能 | 已验证 Dashboard Last Heard；处理呼号自定义后缀和常见电台型号 |
| D-Star | 已完成基本功能 | XLX Dashboard Last Heard，按模块筛选，界面标注 XRF / DCS 兼容入口 |
| P25 | 暂缓 | 仅占位，显示“监听功能待开发” |
| NXDN | 暂缓 | 仅占位，显示“监听功能待开发” |
| FCS | 暂缓 | 仅占位，作为最后一项，显示“监听功能待开发” |

## 5. YSF Dashboard 基线

V1.02 下拉框只放入了已确认能稳定读取 Last Heard 的中国常用反射器：

| 反射器 | 名称 | Dashboard |
| --- | --- | --- |
| YSF-18829 | DRCC-01 / CN CC#1 | <https://mmdvm.cc/ysf/> |
| YSF-46004 | C4FM-BG4IAJ | <http://139.196.236.224/main.php> |
| YSF-46008 | YSF-TG46008 | <http://c4fm.tg46008.cn/> |
| YSF-46059 | Daqing-460459 | <http://500a.cn:46059/> |

目录参考来源：

- W0CHP YSF Reflectors：<https://w0chp.radio/digital-radio-lists/ysf-reflectors/>
- Pi-Star YSF Reflectors：<https://www.pistar.uk/ysf_reflectors.php>

已知问题：YSF-18829 的原始 Dashboard 服务器时钟曾比北京时间超前约 1 小时 13 分。V1.02 按原页文本显示，没有额外增加时区。后续如要校正，应先读取 Dashboard 的服务器当前时间，再对 Last Heard 统一减去偏差；不要对所有 YSF 服务器硬编码减一小时。

## 6. D-Star Dashboard 基线

V1.02 已验证的反射器与模块：

| 反射器 | 模块 | 名称 |
| --- | --- | --- |
| XLX004 | C、E | 台州 |
| XLX055 | A、B、C | Team Helix |
| XLX355 | A、B、C、E | 安徽芜湖 |
| XLX454 | A、B、C、D | 香港 |
| XLX616 | A | APRNet |
| XLXCKG | C | 重庆 |
| XLXNPP | B | 山东济南 |
| XLXPRC | A | 佛山 |

后续可评估 `XLX996 C`：<https://mmdvm.cc/xlxd/>。其首页说明模块 D 用于 DMR，模块 C 用于 D-Star。加入前必须确认 Last Heard 表格实时更新，且现有解析器能正确识别呼号、时间、网关和模块。

## 7. 增加 Dashboard 的标准流程

### 7.1 验收条件

只有同时满足以下条件才加入用户下拉框：

1. Dashboard 公网可访问，不需要登录或人机验证。
2. 存在可解析的 Last Heard 表格，不是仅显示服务器介绍或 DG-ID / TG 映射说明。
3. 连续多次刷新能看到新通联，原页数据没有停滞数月或数年。
4. 页面返回时间和 VPS 抓取耗时可接受。
5. 原页时间、软件列表时间和当前北京时间已做对比。
6. 在 VPS 网络版和 Tauri 本地版各至少验证一次。

### 7.2 代码位置

- YSF 反射器列表与解析：`src/services/ysfClient.js`
- D-Star 反射器列表与解析：`src/services/dstarClient.js`
- 候选数据转换、显示和模式下拉：`src/App.vue`
- VPS Dashboard 抓取与表格解析：`server/index.mjs`
- Tauri 本地 HTTP 服务与 Dashboard 转发：`src-tauri/src/lib.rs`
- 表格列宽、提示条和候选高亮：`src/style.css`

### 7.3 不要重复的旧逻辑

- YSF DTMF / 反射器编号不等于 DMR TG。
- `DMR2YSF TG` 列是网关桥接映射，不能用来代替所有 YSF 反射器。
- DG-ID 切换 DMR TG 的服务器不是普通 YSF 反射器 Last Heard 源。
- D-StarUsers 全网 Last Heard 不保证能稳定按 XLX / XRF / DCS 模块实时筛选；优先使用反射器自身 Dashboard。
- HTTP 200 只代表页面可访问，不代表其中存在可解析、正在更新的 Last Heard 表格。

## 8. 发布产物

| 平台 | 文件 | 大小 | SHA-256 |
| --- | --- | --- | --- |
| Win64 | `HAM-Checkin-1.02-Win64-Setup.exe` | 约 5.8 MB | `6484291e5a6680405a5611f2afe7c8bfcff97668d4777d64aaf1b9c940392125` |
| macOS Apple Silicon | `HAM-Checkin-1.02-macOS.dmg` | 约 5.9 MB | `b92943a05070cc86db4c51c0fa7b5329bcbb47c208fd91bcb02b6d39d5aac6b6` |

公网下载：

- <https://fmo.bh1jss.net/downloads/ham-checkin/HAM-Checkin-1.02-Win64-Setup.exe>
- <https://fmo.bh1jss.net/downloads/ham-checkin/HAM-Checkin-1.02-macOS.dmg>
- <https://fmo.bh1jss.net/downloads/ham-checkin/SHA256SUMS-HAM-Checkin-1.02.txt>

macOS DMG 已通过：

- Developer ID Application 签名。
- Apple notarization。
- `xcrun stapler validate`。
- `codesign --verify --deep --strict`。
- Gatekeeper `spctl` 验证。

V1.02 macOS 产物是 `arm64` / Apple Silicon，不应在后续文案中误写成 Intel 通用包。

## 9. 构建与发布方式

前端验证：

```bash
npm ci
npm run build
```

Tauri 编译检查：

```bash
cd src-tauri
cargo check
```

桌面构建工作流：

- `.github/workflows/windows-desktop.yml`
- `.github/workflows/macos-desktop.yml`

Windows 必须在 Windows runner 构建 NSIS x64 安装包。macOS 使用 GitHub Actions 中的 Apple Developer 凭据完成签名和公证。不要将 Apple app-specific password、证书密码或私钥写入代码、文档或日志。

## 10. 已验证与未验证项

已验证：

- Vite 生产构建成功。
- Rust / Tauri `cargo check` 成功。
- Win64 和 macOS GitHub Actions 构建成功。
- macOS 签名、公证、装订和 Gatekeeper 检查成功。
- Tauri 内置服务在 `127.0.0.1:37175` 启动成功。
- 通过 Tauri 本地接口成功获取 YSF Dashboard Last Heard JSON。
- VPS 页面、下载链接和远端 SHA-256 已验证。

未完成全量验证：

- 未对每个 YSF / D-Star Dashboard 进行长时间实时性测量。
- 未在所有 Windows 10 / 11 及所有 Apple Silicon macOS 版本做真机全回归。
- P25、NXDN、FCS 未开发，不应在介绍页或发布说明中宣称可监听。

## 11. 回退与恢复

- 稳定回退标签：`desktop-v1.01.2`
- V1.01.2 旧安装包仍保留在 VPS 下载目录。
- VPS 页面和介绍页每次修改前都应在原目录生成带时间戳备份。
- 如新 Dashboard 导致超时或页面解析异常，优先从下拉列表中移除该单个入口，不必回退整个数字模式功能。

## 12. 建议的下一版起点

1. 保持 V1.02 整体界面和点名流程不变。
2. 优先增加已人工验证且有实时 Last Heard 的 YSF / D-Star Dashboard。
3. 为 Dashboard 增加“原站时间与本机时间偏差”诊断，先显示警告，再评估是否自动校正。
4. 如果 VPS 负载或外部 Dashboard 慢，优先增加短时缓存、并发请求合并和每服务器独立超时，不要单纯提高前端刷新频率。
5. 除非已确认实际用户需求和可用数据源，继续暂缓 P25、NXDN、FCS。

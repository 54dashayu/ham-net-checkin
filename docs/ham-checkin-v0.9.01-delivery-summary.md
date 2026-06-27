# HAM 台网点名主控台 V0.9.01 交付文档

日期：2026-06-28  
版本：V0.9.01  
项目目录：`/Users/bh1jss/Documents/HAM点名软件`  
GitHub：`https://github.com/54dashayu/ham-net-checkin`  
GitHub Release：`https://github.com/54dashayu/ham-net-checkin/releases/tag/desktop-v0.9.01`  
公网入口：`https://fmo.bh1jss.net/`  
网络版入口：`https://fmo.bh1jss.net/checkin/`

## 1. 交付结论

HAM 台网点名主控台 V0.9.01 已完成 Win64、macOS 和 VPS 网络版三端统一交付。当前公开下载、GitHub Release、VPS 首页介绍、校验文件和网络版版本标识均已对齐到 V0.9.01。

本版本以 V0.9 为基线完成收尾修正：

- 顶部主控信息增加“主控天线”字段。
- 桌面工作台最小宽度调整到 1200px，减少首行控件挤压。
- Web/VPS 构建产物包含基础呼号资料文件。
- 主控发射提示逻辑回溯到 V0.9 原机制，不保留 V0.9.01 早期测试中的 0.7 秒抑制窗口。
- macOS DMG 完成 Developer ID 签名、Apple 公证和 staple，可作为正式网页下载包。
- Win64 由 GitHub Actions Windows runner 构建，并以 ZIP 形式公开分发。

## 2. 公开交付位置

| 项目 | 地址 |
| --- | --- |
| 介绍与下载页 | `https://fmo.bh1jss.net/` |
| 网络版 | `https://fmo.bh1jss.net/checkin/` |
| Win64版 | `https://fmo.bh1jss.net/downloads/ham-checkin/HAM-Checkin-0.9.01-Win64.zip` |
| MacOS版 | `https://fmo.bh1jss.net/downloads/ham-checkin/HAM-Checkin-0.9.01-macOS-Universal-notarized.dmg` |
| 校验文件 | `https://fmo.bh1jss.net/downloads/ham-checkin/SHA256SUMS-HAM-Checkin-0.9.01.txt` |
| GitHub Release | `https://github.com/54dashayu/ham-net-checkin/releases/tag/desktop-v0.9.01` |

VPS 首页下载区当前保留 5 个入口：

- 网络版。
- Win64版。
- MacOS版。
- 校验文件。
- GitHub项目。

## 3. 交付产物

| 平台 | 文件 | 说明 |
| --- | --- | --- |
| Web/VPS | `HAM-Checkin-0.9.01-web.tar.gz` | `dist/` 静态构建包，供网络版部署和归档 |
| Win64 | `HAM-Checkin-0.9.01-Win64.zip` | Windows 64 位桌面版，ZIP 内含可直接运行的 EXE |
| macOS | `HAM-Checkin-0.9.01-macOS-Universal-notarized.dmg` | Universal DMG，支持 Apple Silicon 和 Intel Mac |
| 校验 | `SHA256SUMS-HAM-Checkin-0.9.01.txt` | Web、Win64、macOS 三个主要公开产物的 SHA256 |

## 4. SHA256 校验

```text
f9b27018f05af7ec29db1dbbabb07a03c3b0bc042629c2207dc20263f6a62c56  HAM-Checkin-0.9.01-web.tar.gz
474fb80a226e4a83871eea0cceb4b62076256bbc8c7341058a39ca033daa0b07  HAM-Checkin-0.9.01-Win64.zip
427eb91efe8359163ba8f9988ede18b3a4d52ad196bb039461c4363e46923c65  HAM-Checkin-0.9.01-macOS-Universal-notarized.dmg
```

## 5. 重要功能节点

### 5.1 台网活动主控台

主控台顶部用于维护本次台网活动的全局信息：

- 台网活动名称。
- 主控呼号。
- 主控 QTH。
- 主控设备。
- 主控天线。
- 主控功率。
- 秒级系统时间。
- 已记录数量和下一条序号。
- 保存、自动保存和新建活动。

V0.9.01 的主控天线字段已同步进入本地 Excel 和服务端 Excel 输出。

### 5.2 主控记录区

左侧记录区是人工确认后的正式入表区，设计原则是不让监听数据自动写入点名日志。主控从监听候选或手动输入资料后，再确认加入记录。

关键能力：

- 前缀、主呼号分离输入。
- 呼号标准化。
- 呼号候选和历史资料补全。
- QTH、设备、天线、功率、模式、信号报告补全。
- 首次参与和历史参与次数提示。
- 添加、编辑、删除、搜索、批量删除记录。
- 起始序号可按已有记录数量继续递增。

### 5.3 监听候选区

右侧监听区统一显示多个来源的最近通联候选，候选只用于辅助点选，不自动入表。

已接入或保留的来源：

- FMO：本地版主要监听源。
- MMDVM：读取本地设备 `mmdvmhost/lh.php` Last Heard。
- HAMBOX：读取本地设备 Dashboard/Last Heard 数据。
- BM DMR：监听指定 BrandMeister 通话组，网络版主要测试模式。
- YSF、FCS、D-Star / XLX、P25、NXDN：保留入口，后续逐步接入。

网络版由于浏览器安全策略、HTTPS mixed content、CORS 和局域网访问限制，主要提供 BM DMR 模式体验。本地版更适合 FMO、MMDVM 和 HAMBOX 设备监听。

### 5.4 主控发射提示

底部主控发射提示条保留 V0.9 原机制：

- 取实时通联列表首位候选。
- 将首位呼号与主控呼号做核心呼号匹配。
- 支持 `B3/BH1JSS`、`BH1JSS/1DR` 等带前缀或后缀形式。
- 首位匹配主控时高亮提示。
- 首位不再是主控或来源给出结束状态时恢复普通状态。
- 对没有明确结束事件的来源使用短时间失活兜底。

V0.9.01 早期测试过 0.7 秒抑制窗口，但最终已取消并回溯。

### 5.5 呼号数据库与资料补全

软件支持本地历史资料和共享呼号数据库两级补全：

- 保存记录时可积累本地呼号画像。
- 启用呼号数据库后可同步共享资料。
- 用户可通过注册、审核、导入验证密钥启用共享库。
- 补全优先使用当前呼号历史资料。
- 当用户输入字段片段时，可进入全库模糊匹配。
- 不在库中的呼号会提示“首次参与”。

共享呼号数据库的 UI 入口包括：

- 启用呼号数据库。
- 同步。
- 注册。
- 导入验证密钥。
- 导出验证密钥。

### 5.6 Excel 与备份

记录可导出为 `.xlsx`，兼容 Excel 和 WPS。Excel 内容包括：

- 活动名称。
- 主控信息。
- 记录表头。
- 天线列。
- 点名记录。
- 页脚：`本日志由 HAM台网点名主控台 自动生成，技术支持BH1JSS`。

同时支持 JSON 备份导出和导入，方便换机、回滚和活动资料留存。

### 5.7 旧库迁移

软件支持导入原 Windows 点名软件 `.db3` 数据库，读取旧库中的 `qsolog`、`qth` 等数据，生成点名记录和呼号画像，帮助从旧工具迁移到新平台。

### 5.8 VPS 网络版与后台

VPS 网络版挂载在 `/checkin/`，服务端提供：

- 网络版页面。
- 点名记录保存。
- 服务端 Excel 生成。
- 网络版访问限制。
- 共享呼号资料库注册提交。
- 管理后台注册审核。
- Excel 保存日志查看。
- 访问操作记录统计。

监控后台地址：

```text
https://fmo.bh1jss.net/checkin/admin/monitor
```

## 6. 版本与发布节点

| 阶段 | 主要成果 |
| --- | --- |
| 原型阶段 | 确定“主控记录区 + 实时监听候选区 + Excel 导出”的基本形态 |
| V0.1.x | 接入 FMO、MMDVM、BM DMR、HAMBOX，完成记录编辑、保存、导出和 Win64 本地版 |
| V0.9 | 形成较完整测试版，加入呼号数据库、VPS 页面、macOS Universal、Win64 下载和网络版 |
| V0.9.01 | 对齐主控天线、1200px 宽度、三端构建、macOS 公证、GitHub Release 和 VPS 下载页 |

## 7. 验证记录

本轮 V0.9.01 已完成以下验证：

- `npm run profiles:audit` 通过，基础库 13564 条，无无效和重复呼号。
- `npm run build` 通过，`dist/data/profiles/base-profiles.json` 已复制。
- VPS `/checkin/` 返回 HTTP 200。
- VPS 页面 JS 包含 `V0.9.01` 和“主控天线”。
- VPS CSS 包含 `--app-min-width:1200px`。
- Win64 ZIP 公网返回 HTTP 200。
- macOS 公证版 DMG 公网返回 HTTP 200。
- 合并校验文件公网返回 HTTP 200。
- macOS DMG 和 DMG 内 `.app` 均通过 `spctl`，来源为 `Notarized Developer ID`。
- GitHub Release `desktop-v0.9.01` 已创建并设为 Latest。
- 标签触发的 Win64 和 macOS GitHub Actions 均成功。

## 8. 已知边界

- 网络版主要用于 BM DMR 模式测试，不承诺稳定访问用户本地 FMO、MMDVM 或 HAMBOX 设备。
- 网络版有测试限制：同一 IP 每 24 小时 1 次，时长 1 小时 15 分钟，最多 60 条记录，1 个日志文件，Excel 下载 1 次。
- Win64 当前为 64 位桌面版，不支持 Win10 32 位和 Win7 x86。
- 本地版监听局域网设备时，仍需用户电脑能访问对应设备地址。
- YSF、FCS、D-Star / XLX、P25、NXDN 当前保留入口，实时监听接口尚未完整开放。

## 9. 后续建议

### 产品方向

- 为共享呼号数据库增加注册状态查询。
- 为同一呼号多资料增加可信度和最近使用排序。
- 增加正式台网日志、简洁签到表、活动统计表等多种 Excel 模板。
- 逐步接入 YSF、FCS、D-Star、P25、NXDN 的真实监听接口。

### 工程方向

- 将 `src/App.vue` 中的监听源、表单、Excel、资料库同步逻辑逐步拆分为 composable/store/service。
- 给监听源切换和呼号补全规则补充自动化测试。
- 将 VPS 首页和下载页纳入仓库管理，减少手工编辑服务器静态文件。
- 建立固定 release checklist，覆盖 build、checksum、GitHub Release、VPS 下载页和公网 URL 探测。

## 10. 交付状态

V0.9.01 当前可视为基本完结版本。公开交付面已对齐，适合进行用户测试、活动试用和后续 V0.9.02 / V1.0 规划。

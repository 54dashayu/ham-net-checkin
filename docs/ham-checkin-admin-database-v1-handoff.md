# HAM 台网点名主控台后台与呼号库治理交付文件

日期：2026-07-01  
当前版本基线：V0.9.01 / package `0.9.1`  
目标阶段：V1.0 前后台管理、数据库同步、审核与统计能力收口  
项目目录：`/Users/bh1jss/Documents/HAM点名软件`  
线上入口：`https://fmo.bh1jss.net/checkin/`  
后台入口：`https://fmo.bh1jss.net/checkin/admin/`

## 1. 交付目的

本文汇总本轮围绕“优化呼号数据库”和“后台管理监测”完成的实现、上线状态、数据口径、风险边界和 V1.0 后续建议。它用于后续制作 V1.0 时快速判断：

- 哪些后台能力已经上线。
- 哪些统计是真实业务动作，哪些只是近似或管理审计。
- 哪些能力不能在 V0.9.01 客户端不改动的前提下准确统计。
- V1.0 是否需要加入客户端心跳、启动上报、版本上报等新接口。

本轮遵守的核心边界是：不改动现有软件前台点名流程、不破坏公开网页体验，优先在服务端后台、审核机制、同步监测和数据治理层面增强。

## 2. 当前上线结论

后台管理第一版已经部署到 VPS 并可用：

- 后台首页已改为“本地版下载、主控活动、点名记录、Excel、审核、同步治理”的运维视角。
- 系统设置已持久化到 `data/admin-settings.json`。
- 注册审核已支持宽松、半自动、严格三档模式。
- 共享库同步开关和上传限制已影响后端接口行为。
- VPS Nginx access log 已接入下载统计。
- 数据库治理区已能查询呼号库、筛选同步拉取/上传记录。
- 总览卡片已支持点击跳转到对应详情区。
- 审核与设置保存后会回到原操作区域，不再跳回页面首屏。

当前线上后台可读取真实数据目录：

```text
/var/lib/ham-checkin
```

当前线上下载日志来源：

```text
/www/wwwlogs/fmolog.bh1jss.net.log
```

## 3. 已完成的后台功能

### 3.1 后台设置持久化

新增后台设置文件：

```text
data/admin-settings.json
```

保存字段：

| 字段 | 含义 | 当前可选值 |
| --- | --- | --- |
| `reviewMode` | 注册审核模式 | `loose` / `assisted` / `strict` |
| `profileSyncEnabled` | 共享呼号库同步总开关 | `true` / `false` |
| `uploadLimit` | 单次上传限制 | `2000` / `500` / `pull-only` |
| `downloadLogSource` | 本地版下载统计来源 | `pending` / `nginx` / `proxy` |

新增后端路由：

```text
POST /admin/settings
```

线上挂载后对应：

```text
POST /checkin/admin/settings
```

设置保存后会带锚点返回系统设置区：

```text
/checkin/admin/?range=7d#settings
```

### 3.2 注册审核模式

审核模式分三档：

| 模式 | 行为 | 适合阶段 |
| --- | --- | --- |
| 宽松 | 只显示资料，由管理员手动通过 | 推广期、熟人测试 |
| 半自动 | 显示风险提示，但不阻止通过 | 小范围扩大测试 |
| 严格 | 命中风险提示时禁止通过 | 正式共享库或注册量变大后 |

当前风险提示依据：

- 呼号格式异常。
- CRAC 操作证书号为空或过短。
- QTH 过短。
- 同呼号已有通过记录。
- 同证号已有通过记录。

注意：当前没有接入外部 CRAC 或证书数据库，不能确认“证号与呼号真实匹配”。严格模式只是基于本地规则和已有记录做拦截。

### 3.3 共享库同步控制

后台设置已实际影响接口：

| 设置 | 影响接口 | 行为 |
| --- | --- | --- |
| 关闭共享库同步 | `profiles-pull` / `profiles-push` | 返回同步暂时关闭 |
| 上传限制 `500` | `profiles-push` | 单次最多接收 500 条 |
| 上传限制 `2000` | `profiles-push` | 单次最多接收 2000 条 |
| 上传限制 `pull-only` | `profiles-push` | 拒绝上传，仅允许拉取 |

这部分不要求客户端改变调用方式，仍保持现有 API 兼容。

### 3.4 数据库治理与同步查询

后台新增“数据库治理与同步查询”区，集中展示：

- 数据库接入：发生过 `profiles-pull` 或 `profiles-push` 的注册呼号数。
- 同步拉取：`profiles-pull` 事件数。
- 上传更新：`profiles-push` 事件数。
- 上传资料：上传 profile 条数汇总。
- 合并资料：合并进共享库条数汇总。
- 基础库呼号、基础库 QTH、基础库设备数量。

操作入口：

- 全部同步记录。
- 查看拉取。
- 查看上传更新。
- 查询呼号库。

呼号库查询范围：

- 基础库。
- 共享库。
- 完整呼号。
- 核心呼号。
- QTH。
- 设备。
- 天线、功率、模式、信号报告等补充字段。

### 3.5 下载统计接入

下载统计已接入 VPS Nginx 日志。

当前匹配规则：

```text
/downloads/ham-checkin/*.exe
/downloads/ham-checkin/*.zip
/downloads/ham-checkin/*.dmg
```

当前统计口径：

- 只统计 `GET` 请求。
- 只统计 HTTP `200` 和 `206`。
- `200` 表示完整或普通下载响应。
- `206` 表示断点续传或分段下载响应。
- 不统计 `HEAD`，避免后台探测或浏览器预检污染下载量。

当前显示两类数字：

| 数字 | 含义 |
| --- | --- |
| 下载请求 | Nginx access log 中命中的下载请求次数 |
| 去重估算 | 按“日期 + IP + 文件名”去重后的估算值 |

边界：这是“下载趋势”统计，不等同于真实安装人数，也不等同于软件启动人数。

## 4. 后台总览与详情下钻

### 4.1 总览卡片

当前顶部总览包含：

- 本地版下载。
- 主控建活动 / 活动日志。
- 点名记录。
- Excel 生成 / 下载。
- 待批准申请。
- 登录独立 IP。

### 4.2 已支持详情跳转

| 卡片 | 点击后跳转 | 详情内容 |
| --- | --- | --- |
| 本地版下载 | `#usage-trend` | 按天下载、活动、同步趋势 |
| 主控建活动 / 活动日志 | `#checkin-details` | 主控呼号、活动名、记录数、Excel、同步状态 |
| 点名记录 | `#checkin-details` | 每个活动的记录数 |
| Excel 生成 / 下载 | `#checkin-details` | Excel 文件状态、后台下载次数 |
| 待批准申请 | `#registrations` | 待审核注册申请 |
| 登录独立 IP | `#admin-login-details` | 后台登录审计 |

### 4.3 需要注意的口径

`登录独立 IP` 是后台管理员登录审计，不代表本地版用户使用。

如果 V1.0 希望顶部只保留“软件使用相关”指标，建议将 `登录独立 IP` 从顶部总览移动到“系统设置与审计”区。

## 5. 当前真正可统计的业务动作

在不改 V0.9.01 客户端前端逻辑的情况下，后端能可靠统计这些动作：

| 动作 | 事件 | 说明 |
| --- | --- | --- |
| 保存点名到服务器 | `save-checkin` | 能统计主控呼号、活动、记录数、服务端 Excel 生成 |
| 拉取呼号库 | `profiles-pull` | 能统计数据库同步接入和拉取量 |
| 上传共享资料 | `profiles-push` | 能统计上传量、合并量、共享库贡献 |
| 后台下载 Excel | `download-checkin-file` | 能统计后台复盘或导出下载次数 |
| 注册申请提交 | `profile-registration-submit` | 能统计共享库申请入口 |
| 审核通过/拒绝 | `profile-registration-approve/reject` | 能统计管理员审核动作 |
| 后台登录 | `admin-login` | 仅用于后台审计 |

## 6. 当前无法准确统计的内容

因为 V0.9.01 下载版没有客户端心跳、启动上报和本地导出上报，所以当前无法准确统计：

- 下载后是否安装。
- 安装后是否启动。
- 打开本地版但未保存、未同步的使用行为。
- 本地导出 Excel 但未调用后端保存的次数。
- 客户端真实平台、版本、启动时长、活跃时段。
- 是否开启了本地数据库同步开关但没有真正拉取/上传。

当前能用作“实际使用”的代理指标只有：

- `save-checkin`。
- `profiles-pull`。
- `profiles-push`。
- 后台或服务端生成的 Excel 状态。

## 7. VPS 部署状态

### 7.1 服务路径

```text
/opt/ham-checkin
/var/lib/ham-checkin
/etc/systemd/system/ham-checkin.service
/etc/ham-checkin.env
```

### 7.2 Nginx 日志路径

当前实际使用宝塔/线上日志：

```text
/www/wwwlogs/fmolog.bh1jss.net.log
```

服务环境变量：

```text
HAM_CHECKIN_NGINX_ACCESS_LOG=/www/wwwlogs/fmolog.bh1jss.net.log
HAM_CHECKIN_NGINX_LOG_TAIL_BYTES=16777216
```

仓库部署模板中也补充了默认专用日志配置：

```text
deploy/nginx-ham-checkin.conf
deploy/ham-checkin.service
```

### 7.3 本轮部署包

本轮生成并用于部署的最后一版包：

```text
release/ham-checkin-admin-card-details-20260701-105552.tar.gz
```

SHA256：

```text
c735d3fafd36e12f7d7ac7487d2993a9e68ad384c2b8e98a0b91f445a4294e40
```

远端每次部署前已备份：

```text
/opt/ham-checkin-backups/
```

## 8. 本轮验证记录

本地验证：

```bash
node --check server/index.mjs
npm run build
```

VPS 验证：

```text
ham-checkin.service active
https://fmo.bh1jss.net/checkin/ HTTP 200
https://fmo.bh1jss.net/checkin/admin/login HTTP 200
```

后台页面验证过：

- 总览卡片可点击到详情锚点。
- `#checkin-details` 存在。
- `#admin-login-details` 存在。
- 设置保存后返回 `#settings`。
- 注册审核表单带 `#registrations` 返回位置。
- 下载统计读取 Nginx access log。

## 9. 已修改或新增的主要文件

### 9.1 后端与部署

```text
server/index.mjs
deploy/ham-checkin.service
deploy/nginx-ham-checkin.conf
```

### 9.2 需求和设计文档

```text
docs/profile-database-admin-requirements.md
docs/admin-dashboard-ui-design.md
```

### 9.3 本交付文件

```text
docs/ham-checkin-admin-database-v1-handoff.md
```

### 9.4 同目录内已有的 V1.0 总版交付草稿

```text
docs/ham-checkin-v1.0-prep-delivery-summary.md
```

该文档更偏 V0.9.01 到 V1.0 的三端分发、下载页、说明书和整体发布面；本文更偏后台、数据库、审核和监测。

## 10. V1.0 建议纳入事项

### 10.1 建议加入客户端轻量上报

如果 V1.0 需要真正回答“下载版有没有启动、谁在用、用多久”，建议增加轻量事件：

| 事件 | 建议触发时机 | 字段 |
| --- | --- | --- |
| `app-start` | 本地版启动后 | 版本、平台、注册呼号或主控呼号、匿名安装 ID |
| `app-active` | 每隔固定时间或关键页面停留 | 版本、平台、活动 ID、主控呼号 |
| `excel-export-local` | 本地导出 Excel 成功 | 活动 ID、记录数、是否本地文件 |
| `sync-toggle` | 用户开启/关闭数据库同步 | 注册呼号、开关状态 |
| `app-version-check` | 检查更新或启动时 | 版本、平台、构建号 |

V1.0 测试版已先做低风险预埋：

- 服务端新增 `POST /api/client-events`，事件写入现有 `data/logs/usage.jsonl`。
- 前端“关于”弹窗新增“允许匿名使用统计”开关，默认关闭。
- 开启后，本地版会发送 `app-start`、`app-version-check`、`app-active`、`excel-export-local`、`sync-toggle`。
- 上报字段限制为版本、平台、语言、匿名安装 ID、活动 ID、主控呼号、注册呼号、记录数、开关状态等运维字段。
- 不上传完整点名记录、QTH/设备列表、Excel 内容或呼号库明细。

隐私建议：

- 默认只采集必要运维字段。
- 不采集完整点名内容，除非用户主动保存到服务器。
- 给本地版设置“允许匿名使用统计”开关。
- 后台区分“精确业务数据”和“匿名活跃数据”。

### 10.2 建议调整后台信息架构

V1.0 后台建议拆成四组：

1. 本地版下载与真实使用。
2. 点名活动与 Excel 产出。
3. 呼号库同步与数据库治理。
4. 审核、系统设置与管理员审计。

其中 `登录独立 IP` 建议移入第 4 组，不再放在“本地版下载与数据库同步总览”的第一屏。

### 10.3 建议增强审核依据

当前严格模式只是规则校验。V1.0 后可考虑：

- 呼号格式更严谨校验。
- CRAC 证号格式校验。
- 同一 IP 短时间多次申请提示。
- 同一证号申请多个呼号时展示关联列表。
- 管理员审核备注。
- 审核历史记录。
- 重新放松/收紧审核模式时保留审计日志。

### 10.4 建议增强数据治理

V1.0 后可继续补：

- 最近新增共享资料。
- 最近变化 QTH。
- 疑似冲突资料。
- 资料稀疏呼号。
- 同一呼号多来源对比。
- 基础库与共享库差异统计。
- 一键导出治理报告。

## 11. V1.0 发布前检查清单

### 11.1 后台与数据

- [ ] 确认 `data/admin-settings.json` 默认值符合正式发布策略。
- [ ] 确认审核模式默认是宽松还是半自动。
- [ ] 确认共享库同步开关默认开启。
- [ ] 确认上传限制默认 `2000` 或更保守。
- [ ] 确认 Nginx 日志路径在正式 VPS 上可读。
- [ ] 确认下载统计不把 `HEAD` 算作下载。
- [ ] 确认后台卡片下钻路径可用。
- [ ] 确认管理员登录明细不被误当作本地版使用统计。

### 11.2 客户端统计

- [ ] 决定 V1.0 是否加入 `app-start`。
- [ ] 决定 V1.0 是否加入本地 Excel 导出上报。
- [ ] 决定是否加入匿名安装 ID。
- [ ] 决定是否增加“允许匿名统计”开关。
- [ ] 后台新增客户端版本、平台、活跃时段展示。

### 11.3 发布与回退

- [ ] `npm run profiles:audit` 通过。
- [ ] `npm run build` 通过。
- [ ] VPS `/checkin/` 验证 HTTP 200。
- [ ] 后台 `/checkin/admin/` 验证可登录。
- [ ] Nginx 下载统计验证有数据。
- [ ] Win64 下载链接验证 HTTP 200。
- [ ] macOS 下载链接验证 HTTP 200。
- [ ] SHA256 文件验证 HTTP 200。
- [ ] 记录最终部署包 SHA256。
- [ ] 记录远端备份路径。

## 12. 已知风险与边界

- 下载量来自 Nginx 日志，是近似趋势，不是安装量。
- 没有客户端心跳时，不能证明下载版已启动。
- 本地 Excel 导出如果不调用后端保存，后台无法知道。
- 后台登录明细只是管理审计，不是用户活跃。
- 严格审核模式不能替代外部证书校验。
- 当前后台仍是服务端渲染单页，适合轻量运维，不适合复杂 BI。
- VPS root 密码曾在会话中临时用于部署；正式长期运维建议改用 SSH key，并更换已暴露密码。

## 13. 建议的下一步

1. 把顶部 `登录独立 IP` 移到系统设置与审计区。
2. 设计 V1.0 客户端轻量上报接口。
3. 增加后台“客户端活跃详情”表。
4. 增加审核备注和审核历史。
5. 对呼号库做一次正式 V1.0 数据质量审计。
6. 确认 V1.0 是否默认半自动审核。
7. 生成 V1.0 总交付文件时引用本文。

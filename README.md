# HAM 台网点名记录台

用于业余无线电台网点名活动的本地记录工具。主控可以现场记录呼号、时间、QTH、设备、天线、功率、频率、模式、信号报告和备注，并导出 Excel 可打开的表格文件。

## 当前功能

- 台站点名录入：自动时间、呼号标准化、重复呼号提示。
- 历史台站档案：保存记录时自动记住该呼号的 QTH、设备、天线、功率、频率、模式等信息。
- 候选呼号：输入呼号片段时显示历史候选，一键套用历史资料。
- 常用候选值：QTH、设备、天线输入框支持历史值下拉。
- FMO 通联候选：添加 FMO 地址后读取正在通联/最近通联的 HAM 呼号、QTH/Grid、设备/备注等候选信息，主控点选抄收清楚的友台后再手动入表。
- 记录管理：搜索、编辑、删除、清空本次记录。
- 导出：生成 `.xlsx` 文件，可用 Excel/WPS 打开。
- 备份：导出/导入本软件 JSON 备份。
- 迁移：导入原 Windows 点名软件 `.db3`，读取 `qsolog`、`qth` 等表生成记录和历史档案。

## 参考资料

原 Windows 点名软件包已解压到：

```text
references/original-windows-tool/
```

已确认的主要 SQLite 表：

- `qsolog`: 点名记录，包含 `callsign`、`qth`、`rig`、`power`、`ant`、`modal`、`freq`、`rst`、`rst1`、`qsotime`、`op` 等字段。
- `qth`: 呼号与 QTH 历史资料。
- `rig`: 设备与模式候选。
- `power`: 功率候选。
- `ant`: 天线候选。
- `taiwang`: 台网活动信息。

## 开发

```bash
npm install
npm run dev
npm run build
```

当前开发服务器默认地址：

```text
http://127.0.0.1:5173/
```

## FMO 候选流程

1. 在右侧 `FMO 通联候选` 区填写 FMO 地址，例如 `192.168.40.3` 或 `fmo.example.net:40088`。
2. 选择 `ws` 或 `wss` 协议。局域网设备通常使用 `ws`。
3. 可选填写主控呼号，用于按 FMO 日志来源过滤最近通联。
4. 点击刷新或开启自动刷新。
5. 主控从候选中选择抄收清楚的友台，软件填入左侧表单。
6. 主控确认 QTH、设备、功率、信号报告后点击 `加入点名表`。

FMO 数据只作为候选来源，不会自动写入点名记录。候选会优先使用 FMO 返回的 `qth/address/location/toAddress/city/province`；如果没有 QTH，则显示 `toGrid/grid`。设备会优先使用 FMO 返回的 `device/rig/radio/equipment`，并尝试从用户备注中识别设备文本。

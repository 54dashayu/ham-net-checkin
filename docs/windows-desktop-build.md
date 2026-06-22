# Windows 桌面版打包说明

当前桌面版使用 Electron 打包，窗口启动后会在本机开启内置服务，再打开本机页面。因此 Web 版已有的保存接口、BM 设备信息代理和后台逻辑可以继续复用。

## 本地验证

```bash
npm ci
npm run build
npm run desktop
```

## 生成 Win64 EXE

推荐通过 GitHub Actions 的 Windows runner 构建：

1. 推送代码到 GitHub。
2. 在 Actions 中运行 `Build Windows Desktop`。
3. 下载 `ham-checkin-win64` artifact。

也可以在 Windows 电脑本地执行：

```bash
npm ci
npm run dist:win
```

产物会输出到 `release/`：

- NSIS 安装包：适合普通用户安装。
- Portable 便携版：适合免安装测试。

## 注意

macOS 上交叉构建 Windows EXE 可能遇到 NSIS、Wine、签名等环境差异。正式交付建议使用 GitHub Actions 或真实 Windows 环境构建。

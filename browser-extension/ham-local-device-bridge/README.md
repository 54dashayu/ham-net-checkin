# HAM Local Device Bridge

Chrome / Edge browser extension for HAM Check-in web console.

## Purpose

This extension lets `https://fmo.bh1jss.net/checkin/` read local FMO, MMDVM and HAMBOX devices without exposing a local proxy address in the web UI.

The bridge only allows loopback, private LAN and `.local` targets. It does not store the user's profile key.

## Install for testing

1. Open Chrome or Edge.
2. Visit `chrome://extensions` or `edge://extensions`.
3. Enable Developer mode.
4. Click "Load unpacked".
5. Select this folder: `browser-extension/ham-local-device-bridge`.
6. Open `https://fmo.bh1jss.net/checkin/`.

## 安装测试

1. 打开 Chrome 或 Edge。
2. 进入 `chrome://extensions` 或 `edge://extensions`。
3. 打开“开发者模式”。
4. 点击“加载已解压的扩展程序”。
5. 选择本目录：`browser-extension/ham-local-device-bridge`。
6. 打开 `https://fmo.bh1jss.net/checkin/`。

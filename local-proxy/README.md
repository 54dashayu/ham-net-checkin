# HAM Check-in Local Proxy / HAM 台网点名本地代理

本地代理运行在用户自己的电脑上，让 VPS 网页版
https://fmo.bh1jss.net/checkin 可以访问同一局域网内的 FMO、MMDVM、HAMBOX 设备。

The proxy runs on the user's own computer and lets the public web version access
local FMO, MMDVM, and HAMBOX devices.

## 启动 / Start

```sh
npm install
npm run local-proxy
```

Default URL:

```text
http://127.0.0.1:37174
```

## 安全 / Security

- 只允许访问本机和私有局域网地址。
- VPS 网页端必须导入作者审核后发放的密钥，才能启用同步和本地设备访问。
- 除非非常明确需要，请保持代理只监听 `127.0.0.1`。
- Only loopback and private LAN targets are allowed.
- The public web UI only enables local device access after an approved key is imported.
- Keep the proxy bound to `127.0.0.1` unless you know exactly why it must be exposed.

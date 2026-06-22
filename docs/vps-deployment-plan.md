# HAM 台网点名主控台网络版部署方案

目标地址：`http://fmo.bh1jss.net/checkin/`

## 服务组成

- 前端：`npm run build` 生成 `dist/`。
- 服务端：`server/index.mjs`，监听 `127.0.0.1:37173`，以 `/checkin` 为线上挂载路径。
- 数据目录：`/var/lib/ham-checkin`。
- 保存接口：`POST /api/checkins`。
- 监控后台：`GET /admin/monitor`，使用账号密码登录。

## 保存机制

顶部“保存”按钮在服务器环境中会调用 `/api/checkins`：

- 写入 Excel：`/var/lib/ham-checkin/checkins/{id}/{活动名称}.xlsx`
- 写入元数据：`/var/lib/ham-checkin/checkins/{id}/meta.json`
- 写入使用记录：`/var/lib/ham-checkin/logs/usage.jsonl`

保存成功后会自动开启自动保存。自动保存不会弹浏览器保存窗口，只会继续调用服务器接口。

## 监控后台

后台显示：

- 保存次数
- 累计记录条数
- 最近保存时间
- 最近保存日志列表
- 最近访问/操作记录

生产环境必须设置：

```bash
HAM_CHECKIN_ADMIN_USER=管理员账号
HAM_CHECKIN_ADMIN_PASSWORD=管理员密码
HAM_CHECKIN_SESSION_SECRET=一个长随机字符串
```

访问方式：

```text
https://example.com/checkin/admin/monitor
```

## 发布步骤

```bash
npm ci
npm run build

rsync -az --delete \
  dist server package.json package-lock.json deploy \
  root@your-server.example.com:/opt/ham-checkin/

ssh root@your-server.example.com
mkdir -p /var/lib/ham-checkin /opt/ham-checkin
chown -R www-data:www-data /var/lib/ham-checkin /opt/ham-checkin
cp /opt/ham-checkin/deploy/ham-checkin.service /etc/systemd/system/ham-checkin.service
systemctl daemon-reload
systemctl enable --now ham-checkin

# 若服务器已有同域名 Nginx 配置，应把 deploy/nginx-ham-checkin.conf 中的
# location /checkin/ 合并进现有 HTTP/HTTPS server block，
# 避免新建重复 server_name。
nginx -t
systemctl reload nginx
```

## 发布门禁

- `npm run build` 通过。
- `node --check server/index.mjs` 通过。
- 本地 `POST /api/checkins` 能生成 `.xlsx` 和 `meta.json`。
- 服务器上 `systemctl status ham-checkin` 正常。
- 公网 `http://fmo.bh1jss.net/checkin/` 可打开。
- 公网保存按钮能在 `/var/lib/ham-checkin/checkins/` 生成日志。

## 注意事项

公网页面运行在用户浏览器中，连接局域网 MMDVM/HAMBOX 页面时可能受浏览器 CORS/HTTPS mixed-content 限制。网络版主要提供 BM DMR 监听测试；需要稳定读取本地设备时，请使用本地版。

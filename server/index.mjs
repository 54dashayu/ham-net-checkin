import { createServer } from 'node:http'
import { createReadStream, promises as fs } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import ExcelJS from 'exceljs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const distDir = path.join(rootDir, 'dist')
const dataDir = process.env.HAM_CHECKIN_DATA_DIR || path.join(rootDir, 'data')
const defaultPort = Number(process.env.PORT || 37173)
const adminUser = process.env.HAM_CHECKIN_ADMIN_USER || 'bh1jss'
const adminPassword = process.env.HAM_CHECKIN_ADMIN_PASSWORD || ''
const sessionSecret =
  process.env.HAM_CHECKIN_SESSION_SECRET || adminPassword || crypto.randomBytes(32).toString('hex')
const basePath = String(process.env.HAM_CHECKIN_BASE_PATH || '').replace(/\/+$/g, '')
const sessionCookieName = 'ham_checkin_admin'

const jsonHeaders = { 'content-type': 'application/json; charset=utf-8' }

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
}

const sanitizeFilename = (value, fallback = 'HAM台网点名记录') =>
  String(value || fallback)
    .replace(/[\\/:*?"<>|\s]+/g, '')
    .slice(0, 48) || fallback

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, headers)
  res.end(body)
}

const sendJson = (res, status, payload) => {
  send(res, status, JSON.stringify(payload), jsonHeaders)
}

async function ensureDirs() {
  await fs.mkdir(path.join(dataDir, 'checkins'), { recursive: true })
  await fs.mkdir(path.join(dataDir, 'logs'), { recursive: true })
}

function getClientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
    .split(',')[0]
    .trim()
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function formatClock(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value || '')
  return date.toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit'
  })
}

function getExportTimeRange(records) {
  if (!records.length) return ''
  const sorted = [...records].sort((a, b) => String(a.createdAt || a.time).localeCompare(String(b.createdAt || b.time)))
  const first = formatClock(sorted[0]?.time)
  const last = formatClock(sorted.at(-1)?.time)
  return first && last ? `${first}--${last}` : first || last
}

async function createExcelBuffer(activity, records) {
  const sortedRecords = [...records].sort((a, b) =>
    String(a.createdAt || a.time).localeCompare(String(b.createdAt || b.time))
  )
  const headers = ['序号', '呼号', 'QTH', '设备', '功率', '方式', '通联时间 (BJT)']
  const exportTitle = activity.name || 'HAM台网点名记录'
  const exportTimeRange = getExportTimeRange(sortedRecords)
  const controlCallsign = String(activity.controlCallsign || '').trim().toUpperCase()
  const controlPower = activity.controlPower || ''
  const controlLine = [
    controlCallsign,
    activity.controlQth,
    activity.controlDevice,
    controlPower,
    exportTimeRange
  ]
    .filter(Boolean)
    .join('  ')

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'HAM 台网点名记录台'
  workbook.created = new Date()
  const worksheet = workbook.addWorksheet('台网日志', {
    views: [{ showGridLines: true }]
  })
  worksheet.columns = [
    { width: 8 },
    { width: 15 },
    { width: 25 },
    { width: 28 },
    { width: 8 },
    { width: 11 },
    { width: 18 }
  ]
  worksheet.mergeCells('A1:G1')
  worksheet.mergeCells('A2:G2')
  worksheet.getCell('A1').value = exportTitle
  worksheet.getCell('A2').value = controlLine
  worksheet.addRow(headers)
  worksheet.addRow([
    '主控',
    controlCallsign,
    activity.controlQth || '',
    activity.controlDevice || '',
    controlPower,
    '',
    exportTimeRange
  ])
  sortedRecords.forEach((record, index) => {
    worksheet.addRow([
      index + 1,
      record.callsign || '',
      record.qth || '',
      record.device || '',
      record.power || '',
      record.mode || record.remarks || '',
      formatClock(record.time)
    ])
  })
  worksheet.addRow(['本表格由“HAM 台网点名记录台”自动生成导出'])
  worksheet.mergeCells(`A${worksheet.rowCount}:G${worksheet.rowCount}`)

  const thinBorder = { style: 'thin', color: { argb: 'FF000000' } }
  worksheet.eachRow((row, rowNumber) => {
    row.height = rowNumber === 1 ? 30 : 21
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.numFmt = '@'
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.font = {
        name: 'Microsoft YaHei',
        size: rowNumber === 1 ? 18 : 11,
        bold: rowNumber === 1 || rowNumber === 3 || rowNumber === 4
      }
      if (rowNumber >= 3 && rowNumber < worksheet.rowCount) {
        cell.border = {
          top: thinBorder,
          left: thinBorder,
          bottom: thinBorder,
          right: thinBorder
        }
      }
      if (rowNumber === 3) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } }
      }
      if (rowNumber === 4) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } }
      }
    })
  })
  worksheet.getCell('A2').alignment = { horizontal: 'right', vertical: 'middle' }
  const foot = worksheet.getRow(worksheet.rowCount)
  foot.getCell(1).font = {
    name: 'Microsoft YaHei',
    size: 10,
    italic: true,
    color: { argb: 'FF008000' }
  }
  foot.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' }
  return workbook.xlsx.writeBuffer()
}

async function appendJsonl(file, payload) {
  await fs.appendFile(file, `${JSON.stringify(payload)}\n`, 'utf8')
}

async function logUsage(req, event, extra = {}) {
  const url = getRequestUrl(req)
  const entry = {
    at: new Date().toISOString(),
    event,
    ip: getClientIp(req),
    method: req.method,
    path: url.pathname,
    userAgent: req.headers['user-agent'] || '',
    ...extra
  }
  await appendJsonl(path.join(dataDir, 'logs', 'usage.jsonl'), entry)
}

async function readBody(req, limitBytes = 8 * 1024 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limitBytes) throw new Error('payload too large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || '')
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=')
        try {
          return index >= 0
            ? [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))]
            : [decodeURIComponent(part), '']
        } catch {
          return ['', '']
        }
      })
      .filter(([name]) => Boolean(name))
  )
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a))
  const right = Buffer.from(String(b))
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

function signSession(payload) {
  return crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url')
}

function createSessionCookie() {
  const payload = Buffer.from(
    JSON.stringify({
      user: adminUser,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000
    })
  ).toString('base64url')
  return `${payload}.${signSession(payload)}`
}

function getCookiePath() {
  return `${basePath || '/'}${basePath ? '/' : ''}`
}

function buildCookie(value, req, maxAge = 7 * 24 * 60 * 60) {
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''
  return `${sessionCookieName}=${encodeURIComponent(value)}; Path=${getCookiePath()}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`
}

function clearSessionCookie(req) {
  return buildCookie('', req, 0)
}

function isAdminSession(req) {
  const value = parseCookies(req)[sessionCookieName]
  if (!value || !value.includes('.')) return false
  const [payload, signature] = value.split('.')
  if (!safeEqual(signature || '', signSession(payload))) return false
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return session.user === adminUser && Number(session.exp || 0) > Date.now()
  } catch {
    return false
  }
}

function redirectToLogin(req, res) {
  const url = getRequestUrl(req)
  const next = url.pathname.startsWith('/admin/') ? url.pathname : '/admin/monitor'
  send(res, 302, '', { location: `${basePath}/admin/login?next=${encodeURIComponent(next)}` })
}

function requireAdmin(req, res) {
  if (!adminPassword) {
    send(res, 503, 'Admin password is not configured', { 'content-type': 'text/plain; charset=utf-8' })
    return false
  }
  if (isAdminSession(req)) return true
  redirectToLogin(req, res)
  return false
}

function renderAdminLogin(req, res, message = '') {
  const url = getRequestUrl(req)
  const next = url.searchParams.get('next') || '/admin/monitor'
  send(
    res,
    200,
    `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>台网点名主控台登录</title>
    <style>
      body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;background:#edf1ef;color:#18231f}
      form{width:min(420px,calc(100vw - 32px));background:#fff;border:1px solid #d5ddd8;border-radius:10px;padding:28px;box-shadow:0 18px 40px rgba(24,35,31,.08)}
      h1{font-size:24px;margin:0 0 8px}
      p{margin:0 0 22px;color:#65716c}
      label{display:block;font-weight:700;margin:14px 0 6px}
      input{box-sizing:border-box;width:100%;height:46px;border:1px solid #aebeb6;border-radius:8px;padding:0 12px;font-size:18px;background:#fff}
      button{width:100%;height:48px;border:0;border-radius:8px;background:#0b7fd3;color:#fff;font-size:18px;font-weight:800;margin-top:22px;cursor:pointer}
      .error{background:#fff0f0;color:#a12828;border:1px solid #f0c4c4;border-radius:8px;padding:10px 12px;margin-bottom:12px}
    </style></head><body>
      <form method="post" action="${basePath}/admin/login">
        <h1>后台监控登录</h1>
        <p>台网点名主控台</p>
        ${message ? `<div class="error">${escapeHtml(message)}</div>` : ''}
        <input type="hidden" name="next" value="${escapeHtml(next)}" />
        <label for="username">账号</label>
        <input id="username" name="username" autocomplete="username" autofocus />
        <label for="password">密码</label>
        <input id="password" name="password" type="password" autocomplete="current-password" />
        <button type="submit">登录</button>
      </form>
    </body></html>`,
    { 'content-type': 'text/html; charset=utf-8' }
  )
}

async function handleAdminLogin(req, res) {
  if (!adminPassword) {
    send(res, 503, 'Admin password is not configured', { 'content-type': 'text/plain; charset=utf-8' })
    return
  }
  const body = await readBody(req, 16 * 1024)
  const form = new URLSearchParams(body)
  const username = form.get('username') || ''
  const password = form.get('password') || ''
  const next = form.get('next') || '/admin/monitor'
  if (!safeEqual(username, adminUser) || !safeEqual(password, adminPassword)) {
    await logUsage(req, 'admin-login-failed', { username })
    renderAdminLogin(req, res, '账号或密码不正确')
    return
  }
  await logUsage(req, 'admin-login', { username })
  const safeNext = next.startsWith('/admin/') ? next : '/admin/monitor'
  send(res, 302, '', {
    location: `${basePath}${safeNext}`,
    'set-cookie': buildCookie(createSessionCookie(), req)
  })
}

async function handleAdminLogout(req, res) {
  await logUsage(req, 'admin-logout')
  send(res, 302, '', {
    location: `${basePath}/admin/login`,
    'set-cookie': clearSessionCookie(req)
  })
}

async function saveCheckin(req, res) {
  const body = await readBody(req)
  const payload = JSON.parse(body || '{}')
  const activity = payload.activityConfig || {}
  const records = Array.isArray(payload.records) ? payload.records : []

  const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`
  const title = sanitizeFilename(activity.name)
  const activityDir = path.join(dataDir, 'checkins', id)
  await fs.mkdir(activityDir, { recursive: true })
  await fs.writeFile(path.join(activityDir, `${title}.xlsx`), await createExcelBuffer(activity, records))
  await fs.writeFile(
    path.join(activityDir, 'meta.json'),
    JSON.stringify(
      {
        id,
        savedAt: new Date().toISOString(),
        title,
        activity,
        records,
        recordCount: records.length,
        client: payload.client || {}
      },
      null,
      2
    ),
    'utf8'
  )
  await logUsage(req, 'save-checkin', { id, title, recordCount: records.length })
  sendJson(res, 200, {
    ok: true,
    id,
    recordCount: records.length,
    excelPath: `${basePath}/admin/checkins/${id}/${encodeURIComponent(title)}.xlsx`
  })
}

async function listCheckins() {
  const base = path.join(dataDir, 'checkins')
  let names = []
  try {
    names = await fs.readdir(base)
  } catch {
    return []
  }
  const rows = []
  for (const id of names) {
    try {
      const raw = await fs.readFile(path.join(base, id, 'meta.json'), 'utf8')
      rows.push(JSON.parse(raw))
    } catch {
      /* ignore incomplete record */
    }
  }
  return rows.sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)))
}

async function readRecentUsage(limit = 80) {
  try {
    const raw = await fs.readFile(path.join(dataDir, 'logs', 'usage.jsonl'), 'utf8')
    return raw
      .trim()
      .split('\n')
      .filter(Boolean)
      .slice(-limit)
      .reverse()
      .map((line) => JSON.parse(line))
  } catch {
    return []
  }
}

async function monitorPage(req, res) {
  if (!requireAdmin(req, res)) return
  const [checkins, usage] = await Promise.all([listCheckins(), readRecentUsage()])
  const totalRecords = checkins.reduce((sum, item) => sum + Number(item.recordCount || 0), 0)
  const rows = checkins
    .slice(0, 60)
    .map(
      (item) => `<tr>
        <td>${item.savedAt || ''}</td>
        <td>${item.title || ''}</td>
        <td>${item.activity?.controlCallsign || ''}</td>
        <td>${item.recordCount || 0}</td>
        <td><a href="${basePath}/admin/checkins/${item.id}/${encodeURIComponent(item.title || 'log')}.xlsx">Excel</a></td>
      </tr>`
    )
    .join('')
  const usageRows = usage
    .slice(0, 80)
    .map(
      (item) => `<tr>
        <td>${item.at || ''}</td>
        <td>${item.event || ''}</td>
        <td>${item.ip || ''}</td>
        <td>${item.path || ''}</td>
      </tr>`
    )
    .join('')
  send(
    res,
    200,
    `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>台网点名主控台监控</title>
    <style>
      body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;margin:0;background:#edf1ef;color:#18231f}
      main{max-width:1180px;margin:0 auto;padding:24px}
      .topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px}
      h1{font-size:24px;margin:0}
      .cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:18px}
      .card,section{background:#fff;border:1px solid #d5ddd8;border-radius:8px;padding:14px}
      .num{font-size:30px;font-weight:800;color:#008c2a}
      table{border-collapse:collapse;width:100%;font-size:13px}
      th,td{border-bottom:1px solid #d5ddd8;padding:7px 8px;text-align:left}
      th{background:#eef3f0}
      section{margin-top:14px;overflow:auto}
      a{color:#0b78d0}
    </style></head><body><main>
    <div class="topbar"><h1>台网点名主控台监控</h1><a href="${basePath}/admin/logout">退出登录</a></div>
    <div class="cards">
      <div class="card"><div>保存次数</div><div class="num">${checkins.length}</div></div>
      <div class="card"><div>累计记录</div><div class="num">${totalRecords}</div></div>
      <div class="card"><div>最近保存</div><div class="num" style="font-size:18px">${checkins[0]?.savedAt || '暂无'}</div></div>
    </div>
    <section><h2>保存日志</h2><table><thead><tr><th>时间</th><th>活动</th><th>主控</th><th>条数</th><th>文件</th></tr></thead><tbody>${rows}</tbody></table></section>
    <section><h2>访问/操作记录</h2><table><thead><tr><th>时间</th><th>事件</th><th>IP</th><th>路径</th></tr></thead><tbody>${usageRows}</tbody></table></section>
    </main></body></html>`,
    { 'content-type': 'text/html; charset=utf-8' }
  )
}

function splitSocketIoPayload(payload) {
  return String(payload || '')
    .split('\x1e')
    .flatMap((part) => {
      const packets = []
      let rest = part
      while (rest) {
        const lengthMatch = rest.match(/^(\d+):/)
        if (!lengthMatch) {
          packets.push(rest)
          break
        }
        const start = lengthMatch[0].length
        const size = Number(lengthMatch[1])
        packets.push(rest.slice(start, start + size))
        rest = rest.slice(start + size)
      }
      return packets
    })
    .filter(Boolean)
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 9000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

function collectBrandmeisterLastHeard(talkgroup, seconds = 7) {
  return new Promise((resolve, reject) => {
    const rows = []
    const seen = new Set()
    let settled = false
    const ws = new WebSocket('wss://api.brandmeister.network/lh/socket.io/?EIO=4&transport=websocket')
    const finish = (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        ws.close()
      } catch {
        /* ignore close errors */
      }
      if (error) reject(error)
      else resolve(rows.slice(0, 20))
    }
    const timer = setTimeout(() => finish(), seconds * 1000)

    ws.addEventListener('open', () => {
      /* Engine.IO sends the handshake as the first message. */
    })
    ws.addEventListener('error', () => finish(new Error('BrandMeister WebSocket failed')))
    ws.addEventListener('message', (event) => {
      const packet = String(event.data || '')
      if (packet.startsWith('0')) {
        ws.send('40')
        return
      }
      if (packet === '2') {
        ws.send('3')
        return
      }
      if (packet.startsWith('40')) {
        ws.send(`42["join","dst_${talkgroup}"]`)
        ws.send(
          `42["searchMongo",${JSON.stringify({ query: `DestinationID = ${talkgroup}`, amount: 80 })}]`
        )
        return
      }
      if (!packet.startsWith('42')) return
      let eventPayload
      try {
        eventPayload = JSON.parse(packet.slice(2))
      } catch {
        return
      }
      if (eventPayload?.[0] !== 'mqtt') return
      let call
      try {
        call = JSON.parse(eventPayload?.[1]?.payload || '{}')
      } catch {
        return
      }
      if (String(call.DestinationID || '') !== talkgroup) return
      const key = `${call.SessionID || call.SourceID || call.SourceCall}-${call.Start}-${call.Stop}-${call.Event}`
      if (seen.has(key)) return
      seen.add(key)
      rows.push(call)
      if (rows.length >= 20) finish()
    })
  })
}

async function fetchBrandmeisterLastHeard(req, res) {
  const url = getRequestUrl(req)
  const talkgroup = String(url.searchParams.get('talkgroup') || '').replace(/\D+/g, '')
  const seconds = Math.min(15, Math.max(4, Number(url.searchParams.get('seconds') || 7)))
  if (!talkgroup) {
    sendJson(res, 400, { ok: false, error: 'missing talkgroup' })
    return
  }

  const rows = await collectBrandmeisterLastHeard(talkgroup, seconds)
  await logUsage(req, 'brandmeister-last-heard', { talkgroup, rowCount: rows.length })
  sendJson(res, 200, {
    ok: true,
    source: 'brandmeister',
    talkgroup,
    target: `BrandMeister TG${talkgroup}`,
    rows
  })
}

async function fetchBrandmeisterDevice(req, res) {
  const url = getRequestUrl(req)
  const id = String(url.searchParams.get('id') || '').replace(/\D+/g, '')
  if (!id) {
    sendJson(res, 400, { ok: false, error: 'missing id' })
    return
  }
  const response = await fetchWithTimeout(`https://api.brandmeister.network/v2/device/${id}`, {
    headers: { accept: 'application/json' }
  }, 8000)
  const text = await response.text()
  let device = null
  try {
    device = JSON.parse(text)
  } catch {
    /* BrandMeister may return an HTML error page. */
  }
  if (!response.ok || !device || typeof device !== 'object') {
    sendJson(res, 200, { ok: true, id, device: null })
    return
  }
  await logUsage(req, 'brandmeister-device', { id, callsign: device.callsign || '' })
  sendJson(res, 200, { ok: true, id, device })
}

async function proxyMmdvmPage(req, res) {
  const url = getRequestUrl(req)
  const target = url.searchParams.get('url')
  if (!target) {
    send(res, 400, 'Missing url')
    return
  }
  let parsed
  try {
    parsed = new URL(target)
  } catch {
    send(res, 400, 'Invalid url')
    return
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    send(res, 400, 'Unsupported protocol')
    return
  }
  const response = await fetchWithTimeout(parsed, { headers: { accept: 'text/html,*/*' } }, 8000)
  const text = await response.text()
  send(res, response.status, text, {
    'content-type': response.headers.get('content-type') || 'text/html; charset=utf-8',
    'access-control-allow-origin': '*'
  })
}

async function serveCheckinFile(req, res) {
  if (!requireAdmin(req, res)) return
  const url = getRequestUrl(req)
  const match = decodeURIComponent(url.pathname).match(/^\/admin\/checkins\/([^/]+)\/(.+)$/)
  if (!match) {
    send(res, 404, 'Not Found')
    return
  }
  const [, id, filename] = match
  const file = path.normalize(path.join(dataDir, 'checkins', id, path.basename(filename)))
  if (!file.startsWith(path.join(dataDir, 'checkins'))) {
    send(res, 403, 'Forbidden')
    return
  }
  const ext = path.extname(file)
  res.writeHead(200, {
    'content-type': mimeTypes[ext] || 'application/octet-stream',
    'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(file))}`
  })
  createReadStream(file)
    .on('error', () => send(res, 404, 'Not Found'))
    .pipe(res)
}

async function serveStatic(req, res) {
  const url = getRequestUrl(req)
  let pathname = decodeURIComponent(url.pathname)
  if (pathname === '/') pathname = '/index.html'
  const file = path.normalize(path.join(distDir, pathname))
  if (!file.startsWith(distDir)) {
    send(res, 403, 'Forbidden')
    return
  }
  try {
    const stat = await fs.stat(file)
    if (!stat.isFile()) throw new Error('not file')
    const ext = path.extname(file)
    res.writeHead(200, { 'content-type': mimeTypes[ext] || 'application/octet-stream' })
    createReadStream(file).pipe(res)
  } catch {
    createReadStream(path.join(distDir, 'index.html'))
      .on('error', () => send(res, 404, 'Not Found'))
      .pipe(res)
  }
}

function getRequestUrl(req) {
  if (req.appUrl) return req.appUrl
  const url = new URL(req.url, 'http://localhost')
  if (basePath && url.pathname === basePath) {
    url.pathname = '/'
  } else if (basePath && url.pathname.startsWith(`${basePath}/`)) {
    url.pathname = url.pathname.slice(basePath.length) || '/'
  }
  return url
}

export async function startServer({ host = '127.0.0.1', port = defaultPort } = {}) {
  await ensureDirs()
  const server = createServer(async (req, res) => {
    try {
      const url = getRequestUrl(req)
      req.appUrl = url
      if (req.method === 'POST' && url.pathname === '/api/checkins') return saveCheckin(req, res)
      if (req.method === 'GET' && url.pathname === '/api/brandmeister/last-heard') return fetchBrandmeisterLastHeard(req, res)
      if (req.method === 'GET' && url.pathname === '/api/brandmeister/device') return fetchBrandmeisterDevice(req, res)
      if (req.method === 'GET' && url.pathname === '/mmdvm-proxy') return proxyMmdvmPage(req, res)
      if (req.method === 'GET' && url.pathname === '/admin/login') return renderAdminLogin(req, res)
      if (req.method === 'POST' && url.pathname === '/admin/login') return handleAdminLogin(req, res)
      if (url.pathname === '/admin/logout') return handleAdminLogout(req, res)
      if (url.pathname === '/admin/monitor') return monitorPage(req, res)
      if (url.pathname.startsWith('/admin/checkins/')) return serveCheckinFile(req, res)
      if (req.method === 'GET' || req.method === 'HEAD') {
        if (!url.pathname.startsWith('/assets/')) logUsage(req, 'page-view').catch(() => {})
        return serveStatic(req, res)
      }
      send(res, 405, 'Method Not Allowed')
    } catch (error) {
      console.error(error)
      sendJson(res, 500, { ok: false, error: error?.message || 'server error' })
    }
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      resolve()
    })
  })
  return server
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  startServer()
    .then((server) => {
      const address = server.address()
      const actualPort = typeof address === 'object' && address ? address.port : defaultPort
      console.log(`HAM check-in server listening on http://127.0.0.1:${actualPort}`)
    })
    .catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
}

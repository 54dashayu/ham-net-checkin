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
const isNetworkEdition = Boolean(basePath)
const networkLimits = {
  durationMs: 75 * 60 * 1000,
  resetWindowMs: 24 * 60 * 60 * 1000,
  maxRecords: 60,
  maxActivities: 1
}

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

const profileCorsHeaders = {
  ...jsonHeaders,
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers':
    'content-type,x-ham-callsign,x-ham-crac-certificate,x-ham-registration-qth,x-ham-registration-repeater,x-ham-profile-code'
}

const sendProfileJson = (res, status, payload) => {
  send(res, status, JSON.stringify(payload), profileCorsHeaders)
}

async function ensureDirs() {
  await fs.mkdir(path.join(dataDir, 'checkins'), { recursive: true })
  await fs.mkdir(path.join(dataDir, 'logs'), { recursive: true })
  await fs.mkdir(path.join(dataDir, 'profiles'), { recursive: true })
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
    timeZone: 'Asia/Shanghai',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatBjt(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value || '')
  return date
    .toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
    .replaceAll('/', '-')
}

function formatBytes(value) {
  const size = Number(value || 0)
  if (!size) return '-'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function normalizeMonitorCallsign(value) {
  return String(value || '').trim().toUpperCase()
}

function normalizeCracCertificate(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '')
}

function normalizeProfileCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function normalizeRegistrationText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ')
}

function decodeRegistrationHeader(value) {
  const text = String(value || '').trim()
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

function getRegistrationId(callsign, cracCertificate) {
  return crypto
    .createHash('sha1')
    .update(`${normalizeMonitorCallsign(callsign)}|${normalizeCracCertificate(cracCertificate)}`)
    .digest('hex')
    .slice(0, 16)
}

function createVerificationCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const chars = Array.from(crypto.randomBytes(16), (byte) => alphabet[byte % alphabet.length]).join('')
  const groups = chars.match(/.{1,4}/g) || [chars]
  return `HAM-${new Date().getFullYear()}-${groups.join('-')}`
}

const profileFields = ['qth', 'device', 'power', 'mode', 'signal']

const sharedProfilesFile = () => path.join(dataDir, 'profiles', 'shared-profiles.json')
const profileRegistrationsFile = () => path.join(dataDir, 'profiles', 'profile-registrations.json')

function uniqueProfileValues(values, limit = 48) {
  return [
    ...new Set(
      values
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  ].slice(0, limit)
}

function normalizeSharedProfile(profile) {
  const callsign = normalizeMonitorCallsign(profile?.callsign)
  const history = Object.fromEntries(
    profileFields.map((key) => {
      const values = [
        profile?.[key],
        ...((profile?.history && Array.isArray(profile.history[key]) && profile.history[key]) || [])
      ]
      return [key, uniqueProfileValues(values)]
    })
  )
  return {
    callsign,
    qth: history.qth[0] || '',
    device: history.device[0] || '',
    power: history.power[0] || '',
    mode: history.mode[0] || '',
    signal: history.signal[0] || '',
    lastCheckinAt: String(profile?.lastCheckinAt || profile?.time || ''),
    updatedAt: String(profile?.updatedAt || new Date().toISOString()),
    history
  }
}

function mergeSharedProfile(baseProfile, incomingProfile) {
  const base = normalizeSharedProfile(baseProfile || {})
  const incoming = normalizeSharedProfile(incomingProfile || {})
  if (!incoming.callsign) return base
  const history = Object.fromEntries(
    profileFields.map((key) => [
      key,
      uniqueProfileValues([
        incoming[key],
        ...(incoming.history?.[key] || []),
        base[key],
        ...(base.history?.[key] || [])
      ])
    ])
  )
  const latestTime = [incoming.lastCheckinAt, base.lastCheckinAt]
    .filter(Boolean)
    .sort()
    .at(-1) || ''

  return {
    callsign: incoming.callsign,
    qth: incoming.qth || base.qth || history.qth[0] || '',
    device: incoming.device || base.device || history.device[0] || '',
    power: incoming.power || base.power || history.power[0] || '',
    mode: incoming.mode || base.mode || history.mode[0] || '',
    signal: incoming.signal || base.signal || history.signal[0] || '',
    lastCheckinAt: latestTime,
    updatedAt: new Date().toISOString(),
    history
  }
}

async function readSharedProfiles() {
  try {
    const raw = await fs.readFile(sharedProfilesFile(), 'utf8')
    const payload = JSON.parse(raw)
    const profiles = Array.isArray(payload.profiles)
      ? payload.profiles.map(normalizeSharedProfile).filter((profile) => profile.callsign)
      : []
    return {
      version: Number(payload.version || 1),
      updatedAt: String(payload.updatedAt || ''),
      profiles
    }
  } catch {
    return { version: 1, updatedAt: '', profiles: [] }
  }
}

async function writeSharedProfiles(payload) {
  const file = sharedProfilesFile()
  const tmpFile = `${file}.tmp`
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(tmpFile, JSON.stringify(payload, null, 2), 'utf8')
  await fs.rename(tmpFile, file)
}

function normalizeProfileRegistration(registration) {
  const callsign = normalizeMonitorCallsign(registration?.callsign)
  const cracCertificate = normalizeCracCertificate(registration?.cracCertificate)
  return {
    id: registration?.id || getRegistrationId(callsign, cracCertificate),
    callsign,
    cracCertificate,
    qth: String(registration?.qth || '').trim(),
    repeater: String(registration?.repeater || '').trim(),
    fmoServer: String(registration?.fmoServer || '').trim(),
    status: ['approved', 'rejected'].includes(registration?.status) ? registration.status : 'pending',
    verificationCode: String(registration?.verificationCode || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, ''),
    submittedAt: String(registration?.submittedAt || new Date().toISOString()),
    reviewedAt: String(registration?.reviewedAt || ''),
    updatedAt: String(registration?.updatedAt || new Date().toISOString()),
    ip: String(registration?.ip || ''),
    userAgent: String(registration?.userAgent || '')
  }
}

async function readProfileRegistrations() {
  try {
    const raw = await fs.readFile(profileRegistrationsFile(), 'utf8')
    const payload = JSON.parse(raw)
    return Array.isArray(payload.registrations)
      ? payload.registrations.map(normalizeProfileRegistration).filter((item) => item.callsign && item.cracCertificate)
      : []
  } catch {
    return []
  }
}

async function writeProfileRegistrations(registrations) {
  const file = profileRegistrationsFile()
  const tmpFile = `${file}.tmp`
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(
    tmpFile,
    JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), registrations }, null, 2),
    'utf8'
  )
  await fs.rename(tmpFile, file)
}

async function requireProfileRegistration(req, res) {
  const callsign = normalizeMonitorCallsign(req.headers['x-ham-callsign'] || req.appUrl?.searchParams.get('callsign'))
  const cracCertificate = normalizeCracCertificate(
    req.headers['x-ham-crac-certificate'] || req.appUrl?.searchParams.get('crac')
  )
  const verificationCode = normalizeProfileCode(req.headers['x-ham-profile-code'] || req.appUrl?.searchParams.get('code'))
  const qth = normalizeRegistrationText(
    decodeRegistrationHeader(req.headers['x-ham-registration-qth'] || req.appUrl?.searchParams.get('qth'))
  )
  const repeater = normalizeRegistrationText(
    decodeRegistrationHeader(req.headers['x-ham-registration-repeater'] || req.appUrl?.searchParams.get('repeater'))
  )
  if (!callsign || !cracCertificate || !qth || !repeater || !verificationCode) {
    sendProfileJson(res, 403, { ok: false, error: '共享呼号资料库需注册审核后使用。' })
    return null
  }
  const registrations = await readProfileRegistrations()
  const registration = registrations.find(
    (item) =>
      item.callsign === callsign &&
      item.cracCertificate === cracCertificate &&
      normalizeRegistrationText(item.qth) === qth &&
      normalizeRegistrationText(item.repeater) === repeater &&
      normalizeProfileCode(item.verificationCode) === verificationCode &&
      item.status === 'approved'
  )
  if (!registration) {
    sendProfileJson(res, 403, { ok: false, error: '注册资料与审核记录不一致，或校验码不正确。' })
    return null
  }
  return registration
}

function getSharedProfileStats(profiles) {
  const callsigns = new Set()
  const qths = new Set()
  const devices = new Set()
  let entries = 0
  profiles.forEach((profile) => {
    const normalized = normalizeSharedProfile(profile)
    if (normalized.callsign) callsigns.add(normalized.callsign)
    profileFields.forEach((key) => {
      const values = uniqueProfileValues([normalized[key], ...(normalized.history?.[key] || [])], 100)
      entries += values.length
      if (key === 'qth') values.forEach((value) => qths.add(value))
      if (key === 'device') values.forEach((value) => devices.add(value))
    })
  })
  return {
    entries,
    callsigns: callsigns.size,
    qths: qths.size,
    devices: devices.size
  }
}

function getExcelFilename(item) {
  return `${item.title || 'log'}.xlsx`
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
  workbook.creator = 'HAM台网点名主控台'
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
  worksheet.addRow(['本日志由 HAM台网点名主控台 自动生成，技术支持BH1JSS'])
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
  const next = url.pathname.startsWith('/admin') ? url.pathname : '/admin/'
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
  const next = url.searchParams.get('next') || '/admin/'
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
  const next = form.get('next') || '/admin/'
  if (!safeEqual(username, adminUser) || !safeEqual(password, adminPassword)) {
    await logUsage(req, 'admin-login-failed', { username })
    renderAdminLogin(req, res, '账号或密码不正确')
    return
  }
  await logUsage(req, 'admin-login', { username })
  const safeNext = next.startsWith('/admin') ? next : '/admin/'
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
  const activityId = String(payload.activityId || 'default')
  const clientIp = getClientIp(req)

  if (isNetworkEdition) {
    if (records.length > networkLimits.maxRecords) {
      sendJson(res, 403, { ok: false, error: '网络版最多保存 60 条记录，请使用本地版。' })
      return
    }
    const usage = await readUsage(0)
    const now = Date.now()
    const saves = usage.filter((item) => {
      if (item.event !== 'save-checkin' || item.ip !== clientIp) return false
      const savedAt = new Date(item.at).getTime()
      return Number.isFinite(savedAt) && now - savedAt < networkLimits.resetWindowMs
    })
    const firstSaveAt = saves
      .map((item) => new Date(item.at).getTime())
      .filter((time) => Number.isFinite(time))
      .sort((a, b) => a - b)[0]
    if (firstSaveAt && now - firstSaveAt > networkLimits.durationMs) {
      sendJson(res, 403, { ok: false, error: '网络版测试时长已超过 1 小时 15 分钟，请使用本地版。' })
      return
    }
    const savedActivityIds = new Set(saves.map((item) => item.activityId).filter(Boolean))
    if (!savedActivityIds.has(activityId) && savedActivityIds.size >= networkLimits.maxActivities) {
      sendJson(res, 403, { ok: false, error: '网络版仅允许 1 个日志文件，请使用本地版。' })
      return
    }
  }

  const existing = (await listCheckins()).find((item) => item.activityId === activityId)
  const id = existing?.id || `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`
  const title = sanitizeFilename(activity.name)
  const activityDir = path.join(dataDir, 'checkins', id)
  await fs.mkdir(activityDir, { recursive: true })
  await fs.writeFile(path.join(activityDir, `${title}.xlsx`), await createExcelBuffer(activity, records))
  await fs.writeFile(
    path.join(activityDir, 'meta.json'),
    JSON.stringify(
      {
        id,
        activityId,
        savedAt: new Date().toISOString(),
        title,
        activity,
        records,
        recordCount: records.length,
        profileStats: payload.profileStats || null,
        client: payload.client || {}
      },
      null,
      2
    ),
    'utf8'
  )
  await logUsage(req, 'save-checkin', {
    id,
    activityId,
    title,
    recordCount: records.length,
    profileStats: payload.profileStats || null
  })
  sendJson(res, 200, {
    ok: true,
    id,
    recordCount: records.length,
    excelPath: `${basePath}/admin/checkins/${id}/${encodeURIComponent(title)}.xlsx`
  })
}

async function pullSharedProfiles(req, res) {
  const registration = await requireProfileRegistration(req, res)
  if (!registration) return
  const payload = await readSharedProfiles()
  await logUsage(req, 'profiles-pull', { count: payload.profiles.length })
  sendProfileJson(res, 200, {
    ok: true,
    version: payload.version,
    updatedAt: payload.updatedAt,
    count: payload.profiles.length,
    stats: getSharedProfileStats(payload.profiles),
    profiles: payload.profiles
  })
}

async function pushSharedProfiles(req, res) {
  const registration = await requireProfileRegistration(req, res)
  if (!registration) return
  const body = await readBody(req, 2 * 1024 * 1024)
  const payload = JSON.parse(body || '{}')
  const incomingProfiles = Array.isArray(payload.profiles) ? payload.profiles.slice(0, 2000) : []
  const normalizedIncoming = incomingProfiles
    .map(normalizeSharedProfile)
    .filter((profile) => profile.callsign)
    .filter((profile) =>
      profileFields.some((key) => profile[key] || (profile.history?.[key] || []).length)
    )

  const current = await readSharedProfiles()
  const profileMap = new Map(
    current.profiles
      .map(normalizeSharedProfile)
      .filter((profile) => profile.callsign)
      .map((profile) => [profile.callsign, profile])
  )
  const mergedCallsigns = new Set()
  normalizedIncoming.forEach((profile) => {
    profileMap.set(profile.callsign, mergeSharedProfile(profileMap.get(profile.callsign), profile))
    mergedCallsigns.add(profile.callsign)
  })

  const profiles = [...profileMap.values()].sort((a, b) => a.callsign.localeCompare(b.callsign))
  const updatedAt = new Date().toISOString()
  await writeSharedProfiles({
    version: 1,
    updatedAt,
    profiles
  })
  await logUsage(req, 'profiles-push', {
    accepted: normalizedIncoming.length,
    merged: mergedCallsigns.size,
    total: profiles.length,
    client: payload.client || {}
  })
  sendProfileJson(res, 200, {
    ok: true,
    accepted: normalizedIncoming.length,
    merged: mergedCallsigns.size,
    callsigns: [...mergedCallsigns],
    total: profiles.length,
    updatedAt,
    stats: getSharedProfileStats(profiles)
  })
}

async function registerSharedProfileAccess(req, res) {
  const body = await readBody(req, 128 * 1024)
  const payload = JSON.parse(body || '{}')
  const callsign = normalizeMonitorCallsign(payload.callsign)
  const cracCertificate = normalizeCracCertificate(payload.cracCertificate)
  if (!callsign || !/^[A-Z0-9/]{3,20}$/.test(callsign)) {
    sendProfileJson(res, 400, { ok: false, error: '请填写有效呼号。' })
    return
  }
  if (!cracCertificate || cracCertificate.length < 4) {
    sendProfileJson(res, 400, { ok: false, error: '请填写 CRAC 操作证书号。' })
    return
  }
  const id = getRegistrationId(callsign, cracCertificate)
  const registrations = await readProfileRegistrations()
  const existing = registrations.find((item) => item.id === id)
  const now = new Date().toISOString()
  const next = normalizeProfileRegistration({
    ...existing,
    id,
    callsign,
    cracCertificate,
    qth: payload.qth,
    repeater: payload.repeater,
    fmoServer: payload.fmoServer,
    status: existing?.status === 'approved' ? 'approved' : 'pending',
    verificationCode: existing?.verificationCode || '',
    submittedAt: existing?.submittedAt || now,
    updatedAt: now,
    ip: getClientIp(req),
    userAgent: req.headers['user-agent'] || ''
  })
  const nextRegistrations = [...registrations.filter((item) => item.id !== id), next].sort((a, b) =>
    String(b.updatedAt).localeCompare(String(a.updatedAt))
  )
  await writeProfileRegistrations(nextRegistrations)
  await logUsage(req, 'profile-registration-submit', {
    id,
    callsign,
    status: next.status,
    qth: next.qth,
    repeater: next.repeater,
    fmoServer: next.fmoServer
  })
  sendProfileJson(res, 200, {
    ok: true,
    id,
    callsign,
    status: next.status,
    message: next.status === 'approved' ? '注册已审核通过，请填写校验码。' : '注册申请已提交，等待作者审核。'
  })
}

async function handleProfileRegistrationAction(req, res, id, action) {
  if (!requireAdmin(req, res)) return
  const registrations = await readProfileRegistrations()
  const index = registrations.findIndex((item) => item.id === id)
  if (index === -1) {
    send(res, 404, 'registration not found', { 'content-type': 'text/plain; charset=utf-8' })
    return
  }
  const now = new Date().toISOString()
  const current = registrations[index]
  registrations[index] = normalizeProfileRegistration({
    ...current,
    status: action === 'reject' ? 'rejected' : 'approved',
    verificationCode: action === 'reject' ? current.verificationCode : current.verificationCode || createVerificationCode(),
    reviewedAt: now,
    updatedAt: now
  })
  await writeProfileRegistrations(registrations)
  await logUsage(req, `profile-registration-${action}`, {
    id,
    callsign: registrations[index].callsign,
    status: registrations[index].status
  })
  send(res, 303, '', { location: `${basePath}/admin/` })
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

async function readUsage(limit = 5000) {
  try {
    const raw = await fs.readFile(path.join(dataDir, 'logs', 'usage.jsonl'), 'utf8')
    const rows = raw
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
    return limit ? rows.slice(-limit) : rows
  } catch {
    return []
  }
}

let baseProfileStatsCache = null

async function readBaseProfileStats() {
  if (baseProfileStatsCache) return baseProfileStatsCache
  try {
    const raw = await fs.readFile(path.join(distDir, 'base-profiles.json'), 'utf8')
    const payload = JSON.parse(raw)
    const profiles = Array.isArray(payload.profiles) ? payload.profiles : []
    const callsigns = new Set()
    const qths = new Set()
    const devices = new Set()
    let entries = 0

    profiles.forEach((profile) => {
      const callsign = normalizeMonitorCallsign(profile?.callsign)
      if (callsign) callsigns.add(callsign)
      ;['qth', 'device', 'power', 'mode', 'signal'].forEach((key) => {
        const values = [
          profile?.[key],
          ...((profile?.history && Array.isArray(profile.history[key]) && profile.history[key]) || [])
        ]
          .map((value) => String(value || '').trim())
          .filter(Boolean)
        const uniqueValues = [...new Set(values)]
        entries += uniqueValues.length
        if (key === 'qth') uniqueValues.forEach((value) => qths.add(value))
        if (key === 'device') uniqueValues.forEach((value) => devices.add(value))
      })
    })

    baseProfileStatsCache = {
      entries,
      callsigns: callsigns.size,
      qths: qths.size,
      devices: devices.size
    }
  } catch {
    baseProfileStatsCache = { entries: 0, callsigns: 0, qths: 0, devices: 0 }
  }
  return baseProfileStatsCache
}

function subtractProfileStats(total, base) {
  return {
    entries: Math.max(0, Number(total.entries || 0) - Number(base.entries || 0)),
    callsigns: Math.max(0, Number(total.callsigns || 0) - Number(base.callsigns || 0)),
    qths: Math.max(0, Number(total.qths || 0) - Number(base.qths || 0)),
    devices: Math.max(0, Number(total.devices || 0) - Number(base.devices || 0))
  }
}

function collectProfileStats(checkins, baseStats) {
  const latestSnapshot = checkins.find((item) => item.profileStats)?.profileStats || null
  const callsigns = new Set()
  const qths = new Set()
  const devices = new Set()
  let recordEntries = 0

  checkins.forEach((item) => {
    ;(item.records || []).forEach((record) => {
      const callsign = normalizeMonitorCallsign(record.callsign)
      if (callsign) callsigns.add(callsign)
      if (record.qth) qths.add(String(record.qth).trim())
      if (record.device) devices.add(String(record.device).trim())
      if (callsign || record.qth || record.device || record.power || record.mode || record.signal) recordEntries += 1
    })
  })

  const fallbackAdded = {
    entries: recordEntries,
    callsigns: callsigns.size,
    qths: qths.size,
    devices: devices.size
  }
  const total = latestSnapshot
    ? {
        entries: Number(latestSnapshot.entries || 0),
        callsigns: Number(latestSnapshot.callsigns || 0),
        qths: Number(latestSnapshot.qths || 0),
        devices: Number(latestSnapshot.devices || 0)
      }
    : {
        entries: Number(baseStats.entries || 0) + fallbackAdded.entries,
        callsigns: Number(baseStats.callsigns || 0) + fallbackAdded.callsigns,
        qths: Number(baseStats.qths || 0) + fallbackAdded.qths,
        devices: Number(baseStats.devices || 0) + fallbackAdded.devices
      }

  return {
    total,
    base: baseStats,
    added: latestSnapshot ? subtractProfileStats(total, baseStats) : fallbackAdded,
    entries: total.entries,
    callsigns: total.callsigns,
    qths: total.qths,
    devices: total.devices,
    snapshotAt: latestSnapshot?.capturedAt || ''
  }
}

function collectCallsignStats(checkins) {
  const map = new Map()
  checkins.forEach((item) => {
    ;(item.records || []).forEach((record) => {
      const callsign = normalizeMonitorCallsign(record.callsign)
      if (!callsign) return
      const row = map.get(callsign) || {
        callsign,
        count: 0,
        qths: new Set(),
        devices: new Set(),
        latestAt: ''
      }
      row.count += 1
      if (record.qth) row.qths.add(String(record.qth).trim())
      if (record.device) row.devices.add(String(record.device).trim())
      const time = record.time || record.createdAt || item.savedAt || ''
      if (String(time).localeCompare(String(row.latestAt)) > 0) row.latestAt = time
      map.set(callsign, row)
    })
  })
  return [...map.values()]
    .sort((a, b) => b.count - a.count || a.callsign.localeCompare(b.callsign))
    .map((row) => ({
      ...row,
      qthCount: row.qths.size,
      deviceCount: row.devices.size
    }))
}

function collectUsageStats(usage) {
  const loginIps = new Set()
  const downloadIps = new Set()
  let downloadCount = 0
  usage.forEach((item) => {
    if (item.event === 'admin-login' && item.ip) loginIps.add(item.ip)
    if (item.event === 'download-checkin-file') {
      downloadCount += 1
      if (item.ip) downloadIps.add(item.ip)
    }
  })
  return {
    loginUniqueIpCount: loginIps.size,
    downloadCount,
    downloadUniqueIpCount: downloadIps.size
  }
}

async function enrichCheckins(checkins, usage) {
  const downloadCounts = new Map()
  usage.forEach((item) => {
    if (item.event === 'download-checkin-file' && item.id) {
      downloadCounts.set(item.id, (downloadCounts.get(item.id) || 0) + 1)
    }
  })

  const enriched = []
  for (const item of checkins) {
    const filename = getExcelFilename(item)
    const file = path.join(dataDir, 'checkins', item.id, filename)
    let fileStat = null
    try {
      const stat = await fs.stat(file)
      if (stat.isFile()) fileStat = stat
    } catch {
      /* missing file */
    }
    enriched.push({
      ...item,
      filename,
      fileExists: Boolean(fileStat),
      fileSize: fileStat?.size || 0,
      downloadCount: downloadCounts.get(item.id) || 0
    })
  }
  return enriched
}

async function monitorPage(req, res) {
  if (!requireAdmin(req, res)) return
  const [rawCheckins, usage, baseProfileStats, sharedProfilePayload, registrations] = await Promise.all([
    listCheckins(),
    readUsage(0),
    readBaseProfileStats(),
    readSharedProfiles(),
    readProfileRegistrations()
  ])
  const checkins = await enrichCheckins(rawCheckins, usage)
  const totalRecords = checkins.reduce((sum, item) => sum + Number(item.recordCount || 0), 0)
  const profileStats = collectProfileStats(checkins, baseProfileStats)
  const sharedProfileStats = getSharedProfileStats(sharedProfilePayload.profiles)
  const callsignStats = collectCallsignStats(checkins)
  const topCallsignStats = callsignStats.slice(0, 20)
  const usageStats = collectUsageStats(usage)
  const generatedExcelCount = checkins.filter((item) => item.fileExists).length
  const pendingRegistrationCount = registrations.filter((item) => item.status === 'pending').length
  const rows = checkins
    .slice(0, 60)
    .map(
      (item) => `<tr>
        <td>${formatBjt(item.savedAt)}</td>
        <td>${escapeHtml(item.title || '')}</td>
        <td>${escapeHtml(normalizeMonitorCallsign(item.activity?.controlCallsign || ''))}</td>
        <td>${item.recordCount || 0}</td>
        <td>${item.fileExists ? `<a href="${basePath}/admin/checkins/${item.id}/${encodeURIComponent(item.filename)}">${escapeHtml(item.filename)}</a>` : '文件缺失'}</td>
        <td>${formatBytes(item.fileSize)}</td>
        <td>${item.downloadCount}</td>
      </tr>`
    )
    .join('')
  const callsignRows = topCallsignStats
    .map(
      (item) => `<tr>
        <td><strong>${escapeHtml(item.callsign)}</strong></td>
        <td>${item.count}</td>
        <td>${item.qthCount}</td>
        <td>${item.deviceCount}</td>
        <td>${formatBjt(item.latestAt)}</td>
      </tr>`
    )
    .join('')
  const usageRows = [...usage]
    .reverse()
    .slice(0, 80)
    .map(
      (item) => `<tr>
        <td>${formatBjt(item.at)}</td>
        <td>${escapeHtml(item.event || '')}</td>
        <td>${escapeHtml(item.ip || '')}</td>
        <td>${escapeHtml(item.path || '')}</td>
      </tr>`
    )
    .join('')
  const registrationRows = registrations
    .slice(0, 80)
    .map(
      (item) => `<tr>
        <td>${formatBjt(item.updatedAt || item.submittedAt)}</td>
        <td><strong>${escapeHtml(item.callsign)}</strong></td>
        <td>${escapeHtml(item.cracCertificate)}</td>
        <td>${escapeHtml(item.qth || '')}</td>
        <td>${escapeHtml(item.repeater || '')}</td>
        <td>${escapeHtml(item.status)}</td>
        <td>${
          item.verificationCode
            ? `<button type="button" class="code-copy" data-code="${escapeHtml(item.verificationCode)}">${escapeHtml(item.verificationCode)}</button>`
            : '<code>-</code>'
        }</td>
        <td class="actions">
          <form method="post" action="${basePath}/admin/registrations/${item.id}/approve"><button type="submit">通过/发码</button></form>
          <form method="post" action="${basePath}/admin/registrations/${item.id}/reject"><button type="submit">拒绝</button></form>
        </td>
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
      main{max-width:1280px;margin:0 auto;padding:24px}
      .topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px}
      h1{font-size:24px;margin:0}
      h2{font-size:18px;margin:0 0 12px}
      .cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:18px}
      .card,section{background:#fff;border:1px solid #d5ddd8;border-radius:8px;padding:14px}
      .num{font-size:30px;font-weight:800;color:#008c2a}
      .hint{color:#65716c;font-size:12px;margin-top:4px}
      table{border-collapse:collapse;width:100%;font-size:13px}
      th,td{border-bottom:1px solid #d5ddd8;padding:7px 8px;text-align:left}
      th{background:#eef3f0}
      code,.code-copy{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-weight:800;color:#008c2a}
      .code-copy{background:#f3fbf5;border-color:#91d4a2;letter-spacing:.2px}
      .copy-toast{position:fixed;right:20px;bottom:20px;background:#0d2b1c;color:#fff;border-radius:8px;padding:10px 14px;box-shadow:0 10px 28px rgba(0,0,0,.18);opacity:0;transform:translateY(8px);transition:.18s}
      .copy-toast.show{opacity:1;transform:translateY(0)}
      .actions{display:flex;gap:8px;white-space:nowrap}
      form{margin:0}
      button{background:#fff;border:1px solid #a8b6af;border-radius:6px;padding:5px 9px;font:inherit;font-weight:700;cursor:pointer}
      button:hover{border-color:#008c2a;color:#008c2a}
      section{margin-top:14px;overflow:auto}
      a{color:#0b78d0}
      @media(max-width:900px){.cards{grid-template-columns:repeat(2,minmax(0,1fr))}}
    </style></head><body><main>
    <div class="topbar"><h1>台网点名主控台监控</h1><a href="${basePath}/admin/logout">退出登录</a></div>
    <div class="cards">
      <div class="card"><div>保存次数</div><div class="num">${checkins.length}</div></div>
      <div class="card"><div>累计记录</div><div class="num">${totalRecords}</div></div>
      <div class="card"><div>Excel 新生成</div><div class="num">${generatedExcelCount}</div><div class="hint">有效文件可点击下载</div></div>
      <div class="card"><div>Excel 下载</div><div class="num">${usageStats.downloadCount}</div><div class="hint">独立 IP ${usageStats.downloadUniqueIpCount}</div></div>
      <div class="card"><div>登录独立 IP</div><div class="num">${usageStats.loginUniqueIpCount}</div></div>
      <div class="card"><div>合并后呼号</div><div class="num">${callsignStats.length}</div><div class="hint">大小写已合并</div></div>
      <div class="card"><div>基础库 呼号 / QTH / 设备</div><div class="num" style="font-size:24px">${profileStats.base.callsigns} / ${profileStats.base.qths} / ${profileStats.base.devices}</div><div class="hint">基础条目 ${profileStats.base.entries}</div></div>
      <div class="card"><div>共享库 呼号 / QTH / 设备</div><div class="num" style="font-size:24px">${sharedProfileStats.callsigns} / ${sharedProfileStats.qths} / ${sharedProfileStats.devices}</div><div class="hint">共享条目 ${sharedProfileStats.entries}</div></div>
      <div class="card"><div>待审核注册</div><div class="num">${pendingRegistrationCount}</div><div class="hint">通过后生成校验码</div></div>
      <div class="card"><div>本地库新增条目</div><div class="num">${profileStats.added.entries}</div><div class="hint">快照 ${profileStats.snapshotAt ? formatBjt(profileStats.snapshotAt) : '按记录推算'}</div></div>
      <div class="card"><div>新增 呼号 / QTH / 设备</div><div class="num" style="font-size:24px">${profileStats.added.callsigns} / ${profileStats.added.qths} / ${profileStats.added.devices}</div></div>
      <div class="card"><div>最近保存</div><div class="num" style="font-size:18px">${checkins[0]?.savedAt ? formatBjt(checkins[0].savedAt) : '暂无'}</div><div class="hint">UTC+8 北京时间</div></div>
    </div>
    <section><h2>共享呼号资料库注册审核</h2><table><thead><tr><th>时间</th><th>呼号</th><th>CRAC 操作证书号</th><th>常用 QTH</th><th>常用服务器</th><th>状态</th><th>校验码</th><th>操作</th></tr></thead><tbody>${registrationRows}</tbody></table></section>
    <section><h2>Excel 保存日志</h2><table><thead><tr><th>时间 (UTC+8)</th><th>活动</th><th>主控</th><th>条数</th><th>有效文件</th><th>大小</th><th>下载</th></tr></thead><tbody>${rows}</tbody></table></section>
    <section><h2>合并呼号统计 TOP 20</h2><table><thead><tr><th>呼号</th><th>记录数</th><th>QTH 数</th><th>设备数</th><th>最近出现 (UTC+8)</th></tr></thead><tbody>${callsignRows}</tbody></table></section>
    <section><h2>访问/操作记录</h2><table><thead><tr><th>时间</th><th>事件</th><th>IP</th><th>路径</th></tr></thead><tbody>${usageRows}</tbody></table></section>
    </main><div id="copyToast" class="copy-toast">校验码已复制</div><script>
      document.addEventListener('click', async (event) => {
        const button = event.target.closest('.code-copy')
        if (!button) return
        const code = button.dataset.code || button.textContent.trim()
        try {
          await navigator.clipboard.writeText(code)
          const toast = document.getElementById('copyToast')
          toast.classList.add('show')
          window.clearTimeout(window.__copyToastTimer)
          window.__copyToastTimer = window.setTimeout(() => toast.classList.remove('show'), 1400)
        } catch {
          window.prompt('复制校验码', code)
        }
      })
    </script></body></html>`,
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
  let stat
  try {
    stat = await fs.stat(file)
    if (!stat.isFile()) throw new Error('not file')
  } catch {
    send(res, 404, 'Not Found')
    return
  }
  await logUsage(req, 'download-checkin-file', {
    id,
    filename: path.basename(file),
    bytes: stat.size
  })
  const ext = path.extname(file)
  res.writeHead(200, {
    'content-type': mimeTypes[ext] || 'application/octet-stream',
    'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(file))}`
  })
  createReadStream(file).pipe(res)
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
      if (req.method === 'OPTIONS' && url.pathname.startsWith('/api/profiles/')) {
        return send(res, 204, '', profileCorsHeaders)
      }
      if (req.method === 'POST' && url.pathname === '/api/checkins') return saveCheckin(req, res)
      if (req.method === 'POST' && url.pathname === '/api/profiles/register') return registerSharedProfileAccess(req, res)
      if (req.method === 'GET' && url.pathname === '/api/profiles/pull') return pullSharedProfiles(req, res)
      if (req.method === 'POST' && url.pathname === '/api/profiles/push') return pushSharedProfiles(req, res)
      if (req.method === 'GET' && url.pathname === '/api/brandmeister/last-heard') return fetchBrandmeisterLastHeard(req, res)
      if (req.method === 'GET' && url.pathname === '/api/brandmeister/device') return fetchBrandmeisterDevice(req, res)
      if (req.method === 'GET' && url.pathname === '/mmdvm-proxy') return proxyMmdvmPage(req, res)
      if (req.method === 'GET' && url.pathname === '/admin/login') return renderAdminLogin(req, res)
      if (req.method === 'POST' && url.pathname === '/admin/login') return handleAdminLogin(req, res)
      if (url.pathname === '/admin/logout') return handleAdminLogout(req, res)
      const registrationAction = url.pathname.match(/^\/admin\/registrations\/([^/]+)\/(approve|reject)$/)
      if (req.method === 'POST' && registrationAction) {
        return handleProfileRegistrationAction(req, res, registrationAction[1], registrationAction[2])
      }
      if (url.pathname === '/admin') return send(res, 302, '', { location: `${basePath}/admin/` })
      if (url.pathname === '/admin/') return monitorPage(req, res)
      if (url.pathname.startsWith('/admin/checkins/')) return serveCheckinFile(req, res)
      if (url.pathname.startsWith('/admin/')) return send(res, 404, 'Not Found', { 'content-type': 'text/plain; charset=utf-8' })
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

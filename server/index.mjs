import { createServer, request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
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
const nginxAccessLogPath = process.env.HAM_CHECKIN_NGINX_ACCESS_LOG || '/var/log/nginx/access.log'
const nginxLogTailBytes = Number(process.env.HAM_CHECKIN_NGINX_LOG_TAIL_BYTES || 8 * 1024 * 1024)
const appDownloadPathPattern = /\/downloads\/ham-checkin\/[^?\s"]+\.(zip|dmg|exe)(?:[?\s"]|$)/i
const networkLimits = {
  durationMs: 75 * 60 * 1000,
  resetWindowMs: 24 * 60 * 60 * 1000,
  maxRecords: 60,
  maxActivities: 1
}
const defaultAdminSettings = {
  reviewMode: 'loose',
  profileSyncEnabled: true,
  uploadLimit: '2000',
  downloadLogSource: 'pending'
}
const adminReviewModes = new Set(['loose', 'assisted', 'strict'])
const adminUploadLimits = new Set(['2000', '500', 'pull-only'])
const downloadLogSources = new Set(['pending', 'nginx', 'proxy'])
const clientEventTypes = new Set([
  'app-start',
  'app-active',
  'excel-export-local',
  'adif-export-local',
  'sync-toggle',
  'app-version-check'
])

const jsonHeaders = { 'content-type': 'application/json; charset=utf-8' }

function createAbortError() {
  const error = new Error('Aborted')
  error.name = 'AbortError'
  return error
}

function fallbackFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = url instanceof URL ? url : new URL(String(url))
    const requestFn = parsed.protocol === 'https:' ? httpsRequest : httpRequest
    const req = requestFn(parsed, { method: options.method || 'GET', headers: options.headers || {} }, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        const body = Buffer.concat(chunks)
        resolve({
          ok: Number(res.statusCode || 0) >= 200 && Number(res.statusCode || 0) < 300,
          status: Number(res.statusCode || 0),
          headers: {
            get(name) {
              const value = res.headers[String(name).toLowerCase()]
              return Array.isArray(value) ? value.join(', ') : value || null
            }
          },
          text: async () => body.toString('utf8')
        })
      })
    })
    req.on('error', reject)
    if (options.signal) {
      if (options.signal.aborted) req.destroy(createAbortError())
      options.signal.addEventListener('abort', () => req.destroy(createAbortError()), {
        once: true
      })
    }
    req.end()
  })
}

const runtimeFetch = globalThis.fetch || fallbackFetch

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

const faviconLinks = () => `
    <link rel="icon" type="image/svg+xml" href="${basePath}/favicon.svg" />
    <link rel="alternate icon" type="image/png" href="${basePath}/favicon.png" />`

const profileCorsHeaders = {
  ...jsonHeaders,
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers':
    'content-type,x-ham-callsign,x-ham-crac-certificate,x-ham-registration-qth,x-ham-registration-repeater,x-ham-profile-code,x-ham-profile-key'
}

const clientEventCorsHeaders = {
  ...jsonHeaders,
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST,OPTIONS',
  'access-control-allow-headers': 'content-type'
}

const sendProfileJson = (res, status, payload) => {
  send(res, status, JSON.stringify(payload), profileCorsHeaders)
}

const sendClientEventJson = (res, status, payload) => {
  send(res, status, JSON.stringify(payload), clientEventCorsHeaders)
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

function getCoreMonitorCallsign(value) {
  const parts = normalizeMonitorCallsign(value).split('/').filter(Boolean)
  return parts.find((part) => /^[A-Z0-9]{3,}$/.test(part) && /[A-Z]/.test(part)) || parts.at(-1) || ''
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

function formatRegistrationStatus(value) {
  return {
    pending: '待审核',
    approved: '已通过',
    rejected: '已拒绝'
  }[value] || value || '-'
}

function decodeRegistrationHeader(value) {
  const text = String(value || '').trim()
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

function base64urlEncode(buffer) {
  return Buffer.from(buffer).toString('base64url')
}

function base64urlDecode(value) {
  return Buffer.from(String(value || ''), 'base64url')
}

function getProfileKeySecret() {
  return crypto.createHash('sha256').update(`ham-profile-key|${sessionSecret}`).digest()
}

function encryptProfileKeyPayload(payload) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getProfileKeySecret(), iv)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1.${base64urlEncode(iv)}.${base64urlEncode(encrypted)}.${base64urlEncode(tag)}`
}

function decryptProfileKeyToken(token) {
  const parts = String(token || '').trim().split('.')
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('invalid profile key')
  const decipher = crypto.createDecipheriv('aes-256-gcm', getProfileKeySecret(), base64urlDecode(parts[1]))
  decipher.setAuthTag(base64urlDecode(parts[3]))
  const decrypted = Buffer.concat([decipher.update(base64urlDecode(parts[2])), decipher.final()])
  return JSON.parse(decrypted.toString('utf8'))
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

const profileFields = ['qth', 'device', 'antenna', 'power', 'mode', 'signal']

const sharedProfilesFile = () => path.join(dataDir, 'profiles', 'shared-profiles.json')
const baseProfilesFile = () => path.join(dataDir, 'profiles', 'base-profiles.json')
const profileRegistrationsFile = () => path.join(dataDir, 'profiles', 'profile-registrations.json')
const adminSettingsFile = () => path.join(dataDir, 'admin-settings.json')

function normalizeAdminSettings(settings = {}) {
  return {
    reviewMode: adminReviewModes.has(settings.reviewMode) ? settings.reviewMode : defaultAdminSettings.reviewMode,
    profileSyncEnabled:
      typeof settings.profileSyncEnabled === 'boolean'
        ? settings.profileSyncEnabled
        : defaultAdminSettings.profileSyncEnabled,
    uploadLimit: adminUploadLimits.has(String(settings.uploadLimit || ''))
      ? String(settings.uploadLimit)
      : defaultAdminSettings.uploadLimit,
    downloadLogSource: downloadLogSources.has(settings.downloadLogSource)
      ? settings.downloadLogSource
      : defaultAdminSettings.downloadLogSource
  }
}

async function readAdminSettings() {
  try {
    const raw = await fs.readFile(adminSettingsFile(), 'utf8')
    return normalizeAdminSettings(JSON.parse(raw || '{}'))
  } catch {
    return { ...defaultAdminSettings }
  }
}

async function writeAdminSettings(settings) {
  const normalized = normalizeAdminSettings(settings)
  await fs.mkdir(dataDir, { recursive: true })
  await fs.writeFile(
    adminSettingsFile(),
    JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), ...normalized }, null, 2),
    'utf8'
  )
  return normalized
}

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
    antenna: history.antenna[0] || '',
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
    antenna: incoming.antenna || base.antenna || history.antenna[0] || '',
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

async function readBaseProfiles() {
  const candidates = [
    baseProfilesFile(),
    path.join(distDir, 'data/profiles/base-profiles.json'),
    path.join(distDir, 'base-profiles.json')
  ]
  for (const file of candidates) {
    try {
      const raw = await fs.readFile(file, 'utf8')
      const payload = JSON.parse(raw)
      const profiles = Array.isArray(payload.profiles)
        ? payload.profiles.map(normalizeSharedProfile).filter((profile) => profile.callsign)
        : []
      return {
        version: Number(payload.version || 1),
        updatedAt: String(payload.updatedAt || payload.generatedAt || ''),
        profiles
      }
    } catch {
      // Try the next source.
    }
  }
  return { version: 1, updatedAt: '', profiles: [] }
}

function mergeProfileLists(baseProfiles, sharedProfiles) {
  const profileMap = new Map()
  baseProfiles
    .map(normalizeSharedProfile)
    .filter((profile) => profile.callsign)
    .forEach((profile) => profileMap.set(profile.callsign, profile))
  sharedProfiles
    .map(normalizeSharedProfile)
    .filter((profile) => profile.callsign)
    .forEach((profile) => {
      profileMap.set(profile.callsign, mergeSharedProfile(profileMap.get(profile.callsign), profile))
    })
  return [...profileMap.values()].sort((a, b) => a.callsign.localeCompare(b.callsign))
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

function profileKeyPayload(registration) {
  const item = normalizeProfileRegistration(registration)
  const encryptedPayload = encryptProfileKeyPayload({
    callsign: item.callsign,
    cracCertificate: item.cracCertificate,
    qth: item.qth,
    repeater: item.repeater,
    verificationCode: item.verificationCode,
    issuedAt: item.reviewedAt || item.updatedAt || new Date().toISOString()
  })
  return {
    app: 'HAM 台网点名主控台',
    type: 'shared-profile-access-key',
    version: 1,
    callsign: item.callsign,
    key: encryptedPayload,
    issuedAt: item.reviewedAt || item.updatedAt || new Date().toISOString()
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

function getRegistrationRiskFlags(registration, registrations = []) {
  const item = normalizeProfileRegistration(registration)
  const flags = []
  if (!/^[A-Z0-9/]{3,20}$/.test(item.callsign)) flags.push('呼号格式异常')
  if (!item.cracCertificate || item.cracCertificate.length < 4) flags.push('证号过短')
  if (!item.qth || item.qth.length < 2) flags.push('QTH 过短')
  const approvedSameCallsign = registrations.find(
    (other) => other.id !== item.id && other.status === 'approved' && other.callsign === item.callsign
  )
  if (approvedSameCallsign) flags.push('同呼号已有通过记录')
  const approvedSameCertificate = registrations.find(
    (other) =>
      other.id !== item.id &&
      other.status === 'approved' &&
      other.cracCertificate &&
      other.cracCertificate === item.cracCertificate
  )
  if (approvedSameCertificate) flags.push('同证号已有通过记录')
  return flags
}

async function requireProfileRegistration(req, res) {
  let callsign = ''
  let cracCertificate = ''
  let verificationCode = ''
  let qth = ''
  let repeater = ''
  const profileKey = String(req.headers['x-ham-profile-key'] || req.appUrl?.searchParams.get('profileKey') || '').trim()
  if (profileKey) {
    try {
      const payload = decryptProfileKeyToken(profileKey)
      callsign = normalizeMonitorCallsign(payload.callsign)
      cracCertificate = normalizeCracCertificate(payload.cracCertificate)
      verificationCode = normalizeProfileCode(payload.verificationCode)
      qth = normalizeRegistrationText(payload.qth)
      repeater = normalizeRegistrationText(payload.repeater)
    } catch {
      sendProfileJson(res, 403, { ok: false, error: '验证密钥无效，请重新导入作者发放的密钥文件。' })
      return null
    }
  } else {
    callsign = normalizeMonitorCallsign(req.headers['x-ham-callsign'] || req.appUrl?.searchParams.get('callsign'))
    cracCertificate = normalizeCracCertificate(
      req.headers['x-ham-crac-certificate'] || req.appUrl?.searchParams.get('crac')
    )
    verificationCode = normalizeProfileCode(req.headers['x-ham-profile-code'] || req.appUrl?.searchParams.get('code'))
    qth = normalizeRegistrationText(
      decodeRegistrationHeader(req.headers['x-ham-registration-qth'] || req.appUrl?.searchParams.get('qth'))
    )
    repeater = normalizeRegistrationText(
      decodeRegistrationHeader(req.headers['x-ham-registration-repeater'] || req.appUrl?.searchParams.get('repeater'))
    )
  }
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
  const headers = ['序号', '呼号', 'QTH', '设备', '天线', '功率', '方式', '通联时间 (BJT)']
  const exportTitle = activity.name || 'HAM台网点名记录'
  const exportTimeRange = getExportTimeRange(sortedRecords)
  const controlCallsign = String(activity.controlCallsign || '').trim().toUpperCase()
  const controlPower = activity.controlPower || ''
  const controlLine = [
    controlCallsign,
    activity.controlQth,
    activity.controlDevice,
    activity.controlAntenna,
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
    { width: 24 },
    { width: 16 },
    { width: 8 },
    { width: 11 },
    { width: 18 }
  ]
  worksheet.mergeCells('A1:H1')
  worksheet.mergeCells('A2:H2')
  worksheet.getCell('A1').value = exportTitle
  worksheet.getCell('A2').value = controlLine
  worksheet.addRow(headers)
  worksheet.addRow([
    '主控',
    controlCallsign,
    activity.controlQth || '',
    activity.controlDevice || '',
    activity.controlAntenna || '',
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
      record.antenna || '',
      record.power || '',
      record.mode || record.remarks || '',
      formatClock(record.time)
    ])
  })
  worksheet.addRow(['本日志由 HAM台网点名主控台 自动生成，技术支持BH1JSS'])
  worksheet.mergeCells(`A${worksheet.rowCount}:H${worksheet.rowCount}`)

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

function safeAdminReturnTo(value, fallback = '/admin/') {
  const text = String(value || '').trim()
  if (!text) return fallback
  try {
    const parsed = new URL(text, 'http://local')
    if (parsed.origin !== 'http://local') return fallback
    if (parsed.pathname !== '/admin' && parsed.pathname !== '/admin/') return fallback
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return fallback
  }
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
    ${faviconLinks()}
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

async function handleAdminSettings(req, res) {
  if (!requireAdmin(req, res)) return
  const body = await readBody(req, 64 * 1024)
  const form = new URLSearchParams(body)
  const returnTo = safeAdminReturnTo(form.get('returnTo'), '/admin/#settings')
  const settings = await writeAdminSettings({
    reviewMode: form.get('reviewMode'),
    profileSyncEnabled: form.get('profileSyncEnabled') === 'on',
    uploadLimit: form.get('uploadLimit'),
    downloadLogSource: form.get('downloadLogSource')
  })
  await logUsage(req, 'admin-settings-update', settings)
  send(res, 303, '', { location: `${basePath}${returnTo}` })
}

const sanitizeClientMetricText = (value, maxLength = 120) =>
  String(value || '')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, maxLength)

async function recordClientEvent(req, res) {
  const body = await readBody(req, 64 * 1024)
  const payload = JSON.parse(body || '{}')
  const event = sanitizeClientMetricText(payload.event, 48)
  if (!clientEventTypes.has(event)) {
    sendClientEventJson(res, 400, { ok: false, error: 'unsupported client event' })
    return
  }
  const client = payload.client && typeof payload.client === 'object' ? payload.client : {}
  await logUsage(req, event, {
    clientMetric: true,
    appVersion: sanitizeClientMetricText(client.appVersion, 32),
    build: sanitizeClientMetricText(client.build, 64),
    platform: sanitizeClientMetricText(client.platform, 64),
    edition: sanitizeClientMetricText(client.edition, 32),
    language: sanitizeClientMetricText(client.language, 8),
    installId: sanitizeClientMetricText(client.installId, 80),
    activityId: sanitizeClientMetricText(payload.activityId, 96),
    controlCallsign: normalizeMonitorCallsign(payload.controlCallsign),
    profileCallsign: normalizeMonitorCallsign(payload.profileCallsign),
    recordCount: Number.isFinite(Number(payload.recordCount)) ? Number(payload.recordCount) : 0,
    enabled: typeof payload.enabled === 'boolean' ? payload.enabled : null,
    localFile: typeof payload.localFile === 'boolean' ? payload.localFile : null,
    silent: typeof payload.silent === 'boolean' ? payload.silent : null
  })
  sendClientEventJson(res, 200, { ok: true })
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
  const settings = await readAdminSettings()
  if (!settings.profileSyncEnabled) {
    sendProfileJson(res, 503, { ok: false, error: '共享呼号资料库同步暂时关闭。' })
    return
  }
  const registration = await requireProfileRegistration(req, res)
  if (!registration) return
  const [basePayload, sharedPayload] = await Promise.all([readBaseProfiles(), readSharedProfiles()])
  const profiles = mergeProfileLists(basePayload.profiles, sharedPayload.profiles)
  await logUsage(req, 'profiles-pull', {
    callsign: registration.callsign,
    count: profiles.length,
    baseCount: basePayload.profiles.length,
    sharedCount: sharedPayload.profiles.length
  })
  sendProfileJson(res, 200, {
    ok: true,
    version: Math.max(basePayload.version || 1, sharedPayload.version || 1),
    updatedAt: [basePayload.updatedAt, sharedPayload.updatedAt].filter(Boolean).sort().at(-1) || '',
    count: profiles.length,
    baseCount: basePayload.profiles.length,
    sharedCount: sharedPayload.profiles.length,
    stats: getSharedProfileStats(profiles),
    profiles
  })
}

async function pushSharedProfiles(req, res) {
  const settings = await readAdminSettings()
  if (!settings.profileSyncEnabled) {
    sendProfileJson(res, 503, { ok: false, error: '共享呼号资料库同步暂时关闭。' })
    return
  }
  if (settings.uploadLimit === 'pull-only') {
    sendProfileJson(res, 403, { ok: false, error: '共享呼号资料库当前仅允许拉取，暂不接收上传。' })
    return
  }
  const registration = await requireProfileRegistration(req, res)
  if (!registration) return
  const body = await readBody(req, 2 * 1024 * 1024)
  const payload = JSON.parse(body || '{}')
  const uploadLimit = Number(settings.uploadLimit || 2000)
  const incomingProfiles = Array.isArray(payload.profiles) ? payload.profiles.slice(0, uploadLimit) : []
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
    callsign: registration.callsign,
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
  const body = await readBody(req, 64 * 1024)
  const form = new URLSearchParams(body)
  const returnTo = safeAdminReturnTo(form.get('returnTo'), '/admin/#registrations')
  const settings = await readAdminSettings()
  const registrations = await readProfileRegistrations()
  const index = registrations.findIndex((item) => item.id === id)
  if (index === -1) {
    send(res, 404, 'registration not found', { 'content-type': 'text/plain; charset=utf-8' })
    return
  }
  const now = new Date().toISOString()
  const current = registrations[index]
  const riskFlags = getRegistrationRiskFlags(current, registrations)
  if (action !== 'reject' && settings.reviewMode === 'strict' && riskFlags.length) {
    send(res, 409, `严格审核模式下存在风险：${riskFlags.join('、')}`, {
      'content-type': 'text/plain; charset=utf-8'
    })
    return
  }
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
    status: registrations[index].status,
    reviewMode: settings.reviewMode,
    riskFlags
  })
  send(res, 303, '', { location: `${basePath}${returnTo}` })
}

async function downloadProfileRegistrationKey(req, res, id) {
  if (!requireAdmin(req, res)) return
  const registrations = await readProfileRegistrations()
  const registration = registrations.find((item) => item.id === id)
  if (!registration) {
    send(res, 404, 'registration not found', { 'content-type': 'text/plain; charset=utf-8' })
    return
  }
  if (registration.status !== 'approved' || !registration.verificationCode) {
    send(res, 409, 'registration is not approved', { 'content-type': 'text/plain; charset=utf-8' })
    return
  }
  const payload = profileKeyPayload(registration)
  const body = JSON.stringify(payload, null, 2)
  await logUsage(req, 'profile-registration-key-download', {
    id,
    callsign: registration.callsign
  })
  send(res, 200, body, {
    'content-type': 'application/json; charset=utf-8',
    'content-disposition': `attachment; filename="${encodeURIComponent(`HAM呼号库验证密钥-${registration.callsign}.json`)}"`
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

async function readFileTail(file, maxBytes) {
  const handle = await fs.open(file, 'r')
  try {
    const stat = await handle.stat()
    const length = Math.max(0, Math.min(Number(maxBytes || 0), stat.size))
    const position = Math.max(0, stat.size - length)
    const buffer = Buffer.alloc(length)
    await handle.read(buffer, 0, length, position)
    return buffer.toString('utf8')
  } finally {
    await handle.close()
  }
}

function parseNginxAccessTime(value) {
  const match = String(value || '').match(/^(\d{2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})$/)
  if (!match) return ''
  const months = {
    Jan: 0,
    Feb: 1,
    Mar: 2,
    Apr: 3,
    May: 4,
    Jun: 5,
    Jul: 6,
    Aug: 7,
    Sep: 8,
    Oct: 9,
    Nov: 10,
    Dec: 11
  }
  const [, day, month, year, hour, minute, second, offset] = match
  if (!(month in months)) return ''
  const localMs = Date.UTC(Number(year), months[month], Number(day), Number(hour), Number(minute), Number(second))
  const sign = offset.startsWith('-') ? -1 : 1
  const offsetMinutes = sign * (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(3, 5)))
  return new Date(localMs - offsetMinutes * 60 * 1000).toISOString()
}

function classifyAppDownload(pathname) {
  const decodedPath = decodeURIComponent(String(pathname || ''))
  const filename = path.basename(decodedPath)
  if (/macos|darwin|universal|\.dmg$/i.test(filename)) return { platform: 'macOS', filename }
  if (/win|windows|win64|\.exe|\.zip$/i.test(filename)) return { platform: 'Win64', filename }
  return { platform: '本地版', filename }
}

function parseNginxDownloadLine(line) {
  const match = String(line || '').match(/^(\S+) \S+ \S+ \[([^\]]+)\] "([A-Z]+) ([^"]+?) HTTP\/[^"]+" (\d{3}) (\S+)/)
  if (!match) return null
  const [, ip, rawTime, method, rawTarget, rawStatus, rawBytes] = match
  if (method !== 'GET') return null
  const status = Number(rawStatus)
  if (![200, 206].includes(status)) return null
  let pathname = rawTarget
  try {
    pathname = new URL(rawTarget, 'https://fmo.bh1jss.net').pathname
  } catch {
    pathname = rawTarget.split('?')[0]
  }
  if (!appDownloadPathPattern.test(pathname)) return null
  return {
    at: parseNginxAccessTime(rawTime),
    ip,
    path: pathname,
    status,
    bytes: Number(rawBytes) || 0,
    ...classifyAppDownload(pathname)
  }
}

async function readNginxDownloadEvents(settings) {
  if (settings.downloadLogSource !== 'nginx') {
    return {
      available: false,
      source: '下载日志待接入',
      events: []
    }
  }
  try {
    const raw = await readFileTail(nginxAccessLogPath, nginxLogTailBytes)
    const events = raw
      .split(/\r?\n/)
      .map(parseNginxDownloadLine)
      .filter((item) => item?.at)
    return {
      available: true,
      source: `Nginx access log：${nginxAccessLogPath}`,
      events
    }
  } catch (error) {
    return {
      available: false,
      source: `Nginx 日志不可读：${nginxAccessLogPath}`,
      error: error?.message || String(error),
      events: []
    }
  }
}

function collectDownloadStats(downloadEvents) {
  const uniqueKeys = new Set()
  const byPlatform = new Map()
  downloadEvents.forEach((item) => {
    const dateKey = toBjtDateKey(item.at)
    uniqueKeys.add(`${dateKey}|${item.ip}|${item.filename}`)
    byPlatform.set(item.platform, (byPlatform.get(item.platform) || 0) + 1)
  })
  return {
    total: downloadEvents.length,
    uniqueEstimate: uniqueKeys.size,
    byPlatform
  }
}

let baseProfileStatsCache = null

async function readBaseProfileStats() {
  if (baseProfileStatsCache) return baseProfileStatsCache
  try {
    const payload = await readBaseProfiles()
    const profiles = Array.isArray(payload.profiles) ? payload.profiles : []
    const callsigns = new Set()
    const qths = new Set()
    const devices = new Set()
    let entries = 0

    profiles.forEach((profile) => {
      const callsign = normalizeMonitorCallsign(profile?.callsign)
      if (callsign) callsigns.add(callsign)
      profileFields.forEach((key) => {
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

function formatDurationMs(ms) {
  const totalSeconds = Math.max(0, Math.round(Number(ms || 0) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours) return `${hours}小时${minutes}分`
  if (minutes) return `${minutes}分${seconds}秒`
  return `${seconds}秒`
}

function toBjtDateKey(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date
    .toLocaleDateString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
    .replaceAll('/', '-')
}

function getRangeStart(range) {
  const now = new Date()
  const start = new Date(now)
  if (range === 'today') {
    const bjtDate = toBjtDateKey(now)
    return new Date(`${bjtDate}T00:00:00+08:00`)
  }
  if (range === '30d') {
    start.setDate(start.getDate() - 29)
    return start
  }
  if (range === 'all') return null
  start.setDate(start.getDate() - 6)
  return start
}

function filterByRange(rows, range, getValue) {
  const start = getRangeStart(range)
  if (!start) return rows
  const startMs = start.getTime()
  return rows.filter((row) => {
    const time = new Date(getValue(row) || '').getTime()
    return Number.isFinite(time) && time >= startMs
  })
}

function countUnique(values) {
  return new Set(values.map((value) => String(value || '').trim()).filter(Boolean)).size
}

function buildUsageSessions(usage) {
  const byIp = new Map()
  ;[...usage]
    .sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')))
    .forEach((item) => {
      if (!item.ip || !item.at) return
      const atMs = new Date(item.at).getTime()
      if (!Number.isFinite(atMs)) return
      const sessions = byIp.get(item.ip) || []
      const latest = sessions.at(-1)
      if (latest && atMs - latest.lastMs <= 30 * 60 * 1000) {
        latest.lastAt = item.at
        latest.lastMs = atMs
        latest.events += 1
      } else {
        sessions.push({
          ip: item.ip,
          firstAt: item.at,
          firstMs: atMs,
          lastAt: item.at,
          lastMs: atMs,
          events: 1
        })
      }
      byIp.set(item.ip, sessions)
    })
  return byIp
}

function findUsageSession(sessionsByIp, ip, at) {
  const atMs = new Date(at || '').getTime()
  if (!ip || !Number.isFinite(atMs)) return null
  return (sessionsByIp.get(ip) || []).find((session) => atMs >= session.firstMs && atMs <= session.lastMs + 30 * 60 * 1000) || null
}

function getProfileFieldValues(profile, field) {
  return [
    profile?.[field],
    ...((profile?.history && Array.isArray(profile.history[field]) && profile.history[field]) || [])
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
}

function includesProfileValue(profile, field, query) {
  return getProfileFieldValues(profile, field).some((value) => value.toUpperCase().includes(query))
}

function buildProfileSearchRows(query, profiles, callsignStats) {
  const normalizedQuery = normalizeMonitorCallsign(query)
  if (!normalizedQuery) return []
  const statsMap = new Map(callsignStats.map((item) => [item.callsign, item]))
  const coreQuery = getCoreMonitorCallsign(normalizedQuery)
  const rows = profiles
    .map(normalizeSharedProfile)
    .filter((profile) => profile.callsign)
    .map((profile) => {
      const stats = statsMap.get(profile.callsign)
      const callsign = profile.callsign
      const coreCallsign = getCoreMonitorCallsign(callsign)
      const exactCallsign = callsign === normalizedQuery
      const exactCore = coreQuery && coreCallsign === coreQuery
      const prefixCallsign = callsign.startsWith(normalizedQuery)
      const partialCallsign = callsign.includes(normalizedQuery)
      const qthMatch = includesProfileValue(profile, 'qth', normalizedQuery)
      const deviceMatch = includesProfileValue(profile, 'device', normalizedQuery)
      const otherMatch = ['antenna', 'power', 'mode', 'signal'].some((field) =>
        includesProfileValue(profile, field, normalizedQuery)
      )
      if (!exactCallsign && !exactCore && !prefixCallsign && !partialCallsign && !qthMatch && !deviceMatch && !otherMatch) {
        return null
      }
      const rank =
        (exactCallsign ? 0 : exactCore ? 1 : prefixCallsign ? 2 : partialCallsign ? 3 : qthMatch ? 4 : deviceMatch ? 5 : 6) * 100000 -
        Number(stats?.count || 0)
      return {
        rank,
        callsign,
        qth: getProfileFieldValues(profile, 'qth').join(' / ') || '-',
        device: getProfileFieldValues(profile, 'device').join(' / ') || '-',
        count: Number(stats?.count || profile.checkinCount || 0),
        latestAt: stats?.latestAt || profile.lastCheckinAt || profile.updatedAt || ''
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank || b.count - a.count || a.callsign.localeCompare(b.callsign))
    .slice(0, 80)
  return rows
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

function collectSyncEvents(usage) {
  return usage
    .filter((item) => ['profiles-pull', 'profiles-push'].includes(item.event))
    .map((item) => ({
      at: item.at || '',
      callsign: normalizeMonitorCallsign(item.callsign || ''),
      coreCallsign: getCoreMonitorCallsign(item.callsign || ''),
      ip: item.ip || '',
      event: item.event,
      pulled: Number(item.count || 0),
      uploaded: Number(item.accepted || 0),
      merged: Number(item.merged || 0),
      baseCount: Number(item.baseCount || 0),
      sharedCount: Number(item.sharedCount || 0),
      total: Number(item.total || item.count || 0),
      client: item.client || null
    }))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
}

function collectPageViews(usage) {
  return usage.filter((item) => item.event === 'page-view')
}

function collectAdminOverview({ checkins, usage, syncEvents, usageStats, downloadStats, downloadSource }) {
  const activeControlCallsigns = [
    ...checkins.map((item) => normalizeMonitorCallsign(item.activity?.controlCallsign || '')),
    ...syncEvents.map((item) => item.callsign)
  ].filter(Boolean)
  const recentUseAt = [
    ...checkins.map((item) => item.savedAt),
    ...syncEvents.map((item) => item.at)
  ]
    .filter(Boolean)
    .sort()
    .at(-1)
  return {
    downloadTotal: downloadStats ? downloadStats.total : null,
    downloadUniqueEstimate: downloadStats ? downloadStats.uniqueEstimate : null,
    effectiveCheckins: checkins.length,
    totalRecords: checkins.reduce((sum, item) => sum + Number(item.recordCount || 0), 0),
    excelGenerated: checkins.filter((item) => item.fileExists).length,
    excelDownloads: usageStats.downloadCount,
    syncEnabled: countUnique(syncEvents.map((item) => item.callsign || item.ip)),
    syncPulls: syncEvents.filter((item) => item.event === 'profiles-pull').length,
    syncPushes: syncEvents.filter((item) => item.event === 'profiles-push').length,
    uploadedProfiles: syncEvents.reduce((sum, item) => sum + Number(item.uploaded || 0), 0),
    mergedProfiles: syncEvents.reduce((sum, item) => sum + Number(item.merged || 0), 0),
    activeControllers: countUnique(activeControlCallsigns),
    recentUseAt,
    downloadSource
  }
}

function buildDailyUsageRows({ checkins, usage, syncEvents, downloadEvents, downloadAvailable, range }) {
  const dailyMap = new Map()
  const ensureDay = (dateKey) => {
    if (!dateKey) return null
    if (!dailyMap.has(dateKey)) {
      dailyMap.set(dateKey, {
        date: dateKey,
        downloads: downloadAvailable ? 0 : null,
        excelDownloads: 0,
        effectiveCheckins: 0,
        totalRecords: 0,
        excelGenerated: 0,
        syncEnabled: new Set(),
        syncPulls: 0,
        syncPushes: 0,
        uploadedProfiles: 0,
        mergedProfiles: 0,
        controllers: new Set()
      })
    }
    return dailyMap.get(dateKey)
  }
  filterByRange(usage, range, (item) => item.at)
    .filter((item) => item.event === 'download-checkin-file')
    .forEach((item) => {
      const row = ensureDay(toBjtDateKey(item.at))
      if (row) row.excelDownloads += 1
    })
  filterByRange(downloadEvents || [], range, (item) => item.at).forEach((item) => {
    const row = ensureDay(toBjtDateKey(item.at))
    if (row) row.downloads += 1
  })
  filterByRange(checkins, range, (item) => item.savedAt).forEach((item) => {
    const row = ensureDay(toBjtDateKey(item.savedAt))
    if (!row) return
    row.effectiveCheckins += 1
    row.totalRecords += Number(item.recordCount || 0)
    if (item.fileExists) row.excelGenerated += 1
    const callsign = normalizeMonitorCallsign(item.activity?.controlCallsign || '')
    if (callsign) row.controllers.add(callsign)
  })
  filterByRange(syncEvents, range, (item) => item.at).forEach((item) => {
    const row = ensureDay(toBjtDateKey(item.at))
    if (!row) return
    row.syncEnabled.add(item.callsign || item.ip)
    if (item.event === 'profiles-pull') row.syncPulls += 1
    if (item.event === 'profiles-push') row.syncPushes += 1
    row.uploadedProfiles += Number(item.uploaded || 0)
    row.mergedProfiles += Number(item.merged || 0)
    if (item.callsign) row.controllers.add(item.callsign)
  })
  return [...dailyMap.values()]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 30)
    .map((row) => ({
      ...row,
      syncEnabledCount: row.syncEnabled.size,
      controllerCount: row.controllers.size
    }))
}

function getCheckinSyncStatus(checkin, syncEvents) {
  const callsign = normalizeMonitorCallsign(checkin.activity?.controlCallsign || '')
  const savedAtMs = new Date(checkin.savedAt || '').getTime()
  const related = syncEvents.find((event) => {
    if (callsign && event.callsign === callsign) return true
    const eventAtMs = new Date(event.at || '').getTime()
    return checkin.saveEvent?.ip && event.ip === checkin.saveEvent.ip && Number.isFinite(savedAtMs) && Number.isFinite(eventAtMs) && Math.abs(eventAtMs - savedAtMs) < 6 * 60 * 60 * 1000
  })
  if (!related) return '未同步'
  return related.event === 'profiles-push' ? '已上传' : '已拉取'
}

function buildEffectiveUsageRows(checkins, syncEvents) {
  const rows = checkins.map((item) => ({
    at: item.savedAt || '',
    type: isNetworkEdition ? '网络版点名' : '点名保存',
    callsign: normalizeMonitorCallsign(item.activity?.controlCallsign || ''),
    title: item.title || '',
    recordCount: Number(item.recordCount || 0),
    excelStatus: item.fileExists ? '已生成' : '文件缺失',
    downloadCount: Number(item.downloadCount || 0),
    syncStatus: getCheckinSyncStatus(item, syncEvents),
    ip: item.saveEvent?.ip || '',
    client: item.client?.platform || item.client?.version || '-',
    fileLink: item.fileExists
      ? `${basePath}/admin/checkins/${item.id}/${encodeURIComponent(item.filename)}`
      : ''
  }))
  return rows.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 80)
}

async function enrichCheckins(checkins, usage) {
  const downloadCounts = new Map()
  const saveEvents = new Map()
  usage.forEach((item) => {
    if (item.event === 'download-checkin-file' && item.id) {
      downloadCounts.set(item.id, (downloadCounts.get(item.id) || 0) + 1)
    }
    if (item.event === 'save-checkin' && item.id) {
      saveEvents.set(item.id, item)
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
      downloadCount: downloadCounts.get(item.id) || 0,
      saveEvent: saveEvents.get(item.id) || null
    })
  }
  return enriched
}

async function monitorPage(req, res) {
  if (!requireAdmin(req, res)) return
  const url = getRequestUrl(req)
  const profileQuery = String(url.searchParams.get('profileQuery') || '').trim()
  const registrationQuery = String(url.searchParams.get('registrationQuery') || '').trim()
  const syncEventFilter = ['profiles-pull', 'profiles-push'].includes(url.searchParams.get('syncEvent'))
    ? url.searchParams.get('syncEvent')
    : ''
  const registrationStatus = ['approved', 'rejected'].includes(url.searchParams.get('registrationStatus'))
    ? url.searchParams.get('registrationStatus')
    : ''
  const range = ['today', '7d', '30d', 'all'].includes(url.searchParams.get('range'))
    ? url.searchParams.get('range')
    : '7d'
  const [rawCheckins, usage, baseProfileStats, baseProfilePayload, sharedProfilePayload, registrations, adminSettings] = await Promise.all([
    listCheckins(),
    readUsage(0),
    readBaseProfileStats(),
    readBaseProfiles(),
    readSharedProfiles(),
    readProfileRegistrations(),
    readAdminSettings()
  ])
  const checkins = await enrichCheckins(rawCheckins, usage)
  const syncEvents = collectSyncEvents(usage)
  const downloadLog = await readNginxDownloadEvents(adminSettings)
  const rangedCheckins = filterByRange(checkins, range, (item) => item.savedAt)
  const rangedUsage = filterByRange(usage, range, (item) => item.at)
  const rangedSyncEvents = filterByRange(syncEvents, range, (item) => item.at)
  const rangedDownloadEvents = filterByRange(downloadLog.events, range, (item) => item.at)
  const profileStats = collectProfileStats(checkins, baseProfileStats)
  const callsignStats = collectCallsignStats(checkins)
  const usageStats = collectUsageStats(rangedUsage)
  const downloadStats = downloadLog.available ? collectDownloadStats(rangedDownloadEvents) : null
  const pendingRegistrationCount = registrations.filter((item) => item.status === 'pending').length
  const mergedProfiles = mergeProfileLists(baseProfilePayload.profiles, sharedProfilePayload.profiles)
  const profileSearchRows = buildProfileSearchRows(profileQuery, mergedProfiles, callsignStats)
  const overview = collectAdminOverview({
    checkins: rangedCheckins,
    usage: rangedUsage,
    syncEvents: rangedSyncEvents,
    usageStats,
    downloadStats,
    downloadSource: downloadLog.source
  })
  const dailyUsageRows = buildDailyUsageRows({
    checkins,
    usage,
    syncEvents,
    downloadEvents: downloadLog.events,
    downloadAvailable: downloadLog.available,
    range
  })
  const effectiveUsageRows = buildEffectiveUsageRows(rangedCheckins, rangedSyncEvents)
  const metric = (value) => value === null || value === undefined ? '<span class="pending">待接入</span>' : String(value)
  const rangeHref = (value) =>
    `${basePath}/admin/?range=${value}${profileQuery ? `&profileQuery=${encodeURIComponent(profileQuery)}` : ''}${syncEventFilter ? `&syncEvent=${syncEventFilter}` : ''}`
  const syncHref = (event = '') =>
    `${basePath}/admin/?range=${range}${event ? `&syncEvent=${event}` : ''}${profileQuery ? `&profileQuery=${encodeURIComponent(profileQuery)}` : ''}`
  const currentAdminReturnTo = `/admin/?range=${encodeURIComponent(range)}${profileQuery ? `&profileQuery=${encodeURIComponent(profileQuery)}` : ''}${syncEventFilter ? `&syncEvent=${encodeURIComponent(syncEventFilter)}` : ''}${registrationStatus ? `&registrationStatus=${encodeURIComponent(registrationStatus)}` : ''}${registrationQuery ? `&registrationQuery=${encodeURIComponent(registrationQuery)}` : ''}`
  const registrationReturnTo = `${currentAdminReturnTo}#registrations`
  const settingsReturnTo = `${currentAdminReturnTo}#settings`
  const rangeLabel = { today: '今日', '7d': '7天', '30d': '30天', all: '全部' }[range] || '7天'
  const trendRows = dailyUsageRows
    .map(
      (item) => `<tr>
        <td><strong>${escapeHtml(item.date)}</strong></td>
        <td>${metric(item.downloads)}</td>
        <td>${item.controllerCount}</td>
        <td>${item.effectiveCheckins}</td>
        <td>${item.totalRecords}</td>
        <td>${item.excelGenerated}</td>
        <td>${item.excelDownloads}</td>
        <td>${item.syncEnabledCount}</td>
        <td>${item.syncPulls}</td>
        <td>${item.syncPushes}</td>
        <td>${item.mergedProfiles}</td>
      </tr>`
    )
    .join('') || '<tr><td colspan="11">暂无使用趋势数据</td></tr>'
  const effectiveRows = effectiveUsageRows
    .map(
      (item) => `<tr class="${item.excelStatus === '文件缺失' ? 'warn-row' : ''}">
        <td>${formatBjt(item.at)}</td>
        <td><span class="tag">${escapeHtml(item.type)}</span></td>
        <td><strong>${escapeHtml(item.callsign || '-')}</strong></td>
        <td>${escapeHtml(item.title || '-')}</td>
        <td>${item.recordCount}</td>
        <td>${item.fileLink ? `<a href="${item.fileLink}">${escapeHtml(item.excelStatus)}</a>` : escapeHtml(item.excelStatus)}</td>
        <td>${item.downloadCount}</td>
        <td>${escapeHtml(item.syncStatus)}</td>
        <td>${escapeHtml(item.ip || '-')}</td>
        <td>${escapeHtml(item.client || '-')}</td>
      </tr>`
    )
    .join('') || '<tr><td colspan="10">暂无有效点名记录</td></tr>'
  const adminLoginRows = rangedUsage
    .filter((item) => item.event === 'admin-login')
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, 80)
    .map(
      (item) => `<tr>
        <td>${formatBjt(item.at)}</td>
        <td>${escapeHtml(item.username || '-')}</td>
        <td>${escapeHtml(item.ip || '-')}</td>
        <td>${escapeHtml(item.userAgent || '-')}</td>
      </tr>`
    )
    .join('') || '<tr><td colspan="4">暂无后台登录记录</td></tr>'
  const databaseSummary = {
    syncEnabled: overview.syncEnabled,
    syncPulls: overview.syncPulls,
    syncPushes: overview.syncPushes,
    uploadedProfiles: overview.uploadedProfiles,
    mergedProfiles: overview.mergedProfiles,
    baseCallsigns: profileStats.base.callsigns,
    baseQths: profileStats.base.qths,
    baseDevices: profileStats.base.devices
  }
  const filteredSyncEvents = syncEventFilter
    ? rangedSyncEvents.filter((item) => item.event === syncEventFilter)
    : rangedSyncEvents
  const syncRows = filteredSyncEvents
    .slice(0, 80)
    .map(
      (item) => `<tr class="${item.event === 'profiles-push' ? 'accent-row' : ''}">
        <td>${formatBjt(item.at)}</td>
        <td><strong>${escapeHtml(item.callsign || '-')}</strong></td>
        <td>${escapeHtml(item.coreCallsign || '-')}</td>
        <td>${escapeHtml(item.ip || '-')}</td>
        <td><span class="tag">${item.event === 'profiles-push' ? '上传' : '拉取'}</span></td>
        <td>${item.pulled || '-'}</td>
        <td>${item.uploaded || '-'}</td>
        <td>${item.merged || '-'}</td>
        <td>${item.baseCount || '-'}</td>
        <td>${item.sharedCount || '-'}</td>
      </tr>`
    )
    .join('') || '<tr><td colspan="10">暂无匹配的数据库同步记录</td></tr>'
  const profileRows = profileSearchRows
    .map(
      (item) => `<tr>
        <td><strong>${escapeHtml(item.callsign)}</strong></td>
        <td>${escapeHtml(item.qth)}</td>
        <td>${escapeHtml(item.device)}</td>
        <td>${item.count || '-'}</td>
        <td>${formatBjt(item.latestAt)}</td>
      </tr>`
    )
    .join('') || `<tr><td colspan="5">${profileQuery ? '未查询到匹配呼号资料' : '请输入呼号或关键字查询'}</td></tr>`
  const pendingRegistrations = registrations
    .filter((item) => item.status === 'pending')
    .sort((a, b) => String(b.updatedAt || b.submittedAt).localeCompare(String(a.updatedAt || a.submittedAt)))
  const processedRegistrations = registrations
    .filter((item) => item.status !== 'pending')
    .filter((item) => !registrationStatus || item.status === registrationStatus)
    .filter((item) => {
      const keyword = registrationQuery.toUpperCase()
      if (!keyword) return true
      return [item.callsign, item.cracCertificate, item.qth, item.repeater, item.status]
        .join(' ')
        .toUpperCase()
        .includes(keyword)
    })
    .sort(
      (a, b) =>
        String(b.updatedAt || b.submittedAt).localeCompare(String(a.updatedAt || a.submittedAt))
    )
  const registrationActionButtons = (item) => `
          ${
            item.status !== 'approved'
              ? `<form method="post" action="${basePath}/admin/registrations/${item.id}/approve"><input type="hidden" name="returnTo" value="${escapeHtml(registrationReturnTo)}" /><button type="submit">通过/生成密钥</button></form>`
              : ''
          }
          ${
            item.status !== 'rejected'
              ? `<form method="post" action="${basePath}/admin/registrations/${item.id}/reject"><input type="hidden" name="returnTo" value="${escapeHtml(registrationReturnTo)}" /><button type="submit">拒绝</button></form>`
              : ''
          }`
  const registrationRow = (item) => {
    const riskFlags = getRegistrationRiskFlags(item, registrations)
    return `<tr>
        <td>${formatBjt(item.updatedAt || item.submittedAt)}</td>
        <td><strong>${escapeHtml(item.callsign)}</strong></td>
        <td>${escapeHtml(item.cracCertificate)}</td>
        <td>${escapeHtml(item.qth || '')}</td>
        <td>${escapeHtml(item.repeater || '')}</td>
        <td>${riskFlags.length ? riskFlags.map((flag) => `<span class="tag">${escapeHtml(flag)}</span>`).join(' ') : '-'}</td>
        <td>${escapeHtml(formatRegistrationStatus(item.status))}</td>
        <td>${
          item.status === 'approved' && item.verificationCode
            ? `<a class="key-link" href="${basePath}/admin/registrations/${item.id}/key">下载密钥</a>`
            : '<code>-</code>'
        }</td>
        <td class="actions">${registrationActionButtons(item)}</td>
      </tr>`
  }
  const pendingRegistrationRows = pendingRegistrations
    .slice(0, 20)
    .map(registrationRow)
    .join('') || '<tr><td colspan="9">暂无待批准申请</td></tr>'
  const processedRegistrationRows = processedRegistrations
    .slice(0, 80)
    .map(registrationRow)
    .join('') || '<tr><td colspan="9">暂无已处理申请</td></tr>'
  const registrationHref = (status) =>
    `${basePath}/admin/?range=${range}&registrationStatus=${status}${profileQuery ? `&profileQuery=${encodeURIComponent(profileQuery)}` : ''}`
  send(
    res,
    200,
    `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>HAM 台网点名后台</title>
    ${faviconLinks()}
    <style>
      *{box-sizing:border-box}
      body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;margin:0;background:#edf1ef;color:#18231f}
      main{max-width:1440px;margin:0 auto;padding:24px}
      .topbar{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px}
      h1{font-size:24px;margin:0}
      h2{font-size:18px;margin:0 0 12px}
      .subtitle{color:#65716c;margin-top:4px;font-size:13px}
      .top-actions{display:flex;gap:12px;align-items:center;white-space:nowrap}
      .filters{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:0 0 16px}
      .filter-link{border:1px solid #cbd8d0;background:#fff;border-radius:999px;padding:7px 12px;text-decoration:none;color:#26342d;font-weight:700}
      .filter-link.active{background:#008c2a;color:#fff;border-color:#008c2a}
      .cards{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-bottom:14px}
      .card,section{background:#fff;border:1px solid #d5ddd8;border-radius:8px;padding:14px}
      a.card{text-decoration:none;color:inherit;display:block}
      a.card:hover{border-color:#008c2a;box-shadow:0 8px 22px rgba(0,140,42,.12)}
      .card.primary{border-color:#9bd1a7;background:#f6fcf7}
      .card.attention{border-color:#f0c36a;background:#fff9ea}
      .num{font-size:30px;font-weight:800;color:#008c2a;line-height:1.1}
      .pending{color:#7a8580;font-size:18px;font-weight:800}
      .hint{color:#65716c;font-size:12px;margin-top:4px}
      .funnel{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:4px 0}
      .funnel-step{border:1px solid #d5ddd8;border-radius:8px;padding:12px;background:#f9fbfa}
      .funnel-step strong{display:block;font-size:24px;color:#008c2a;margin-top:5px}
      table{border-collapse:collapse;width:100%;font-size:13px}
      th,td{border-bottom:1px solid #d5ddd8;padding:7px 8px;text-align:left}
      th{background:#eef3f0}
      .table-scroll{max-height:391px;overflow:auto;border:1px solid #d5ddd8;border-radius:8px}
      .table-scroll table{border:0}
      .table-scroll th{position:sticky;top:0;z-index:1}
      .table-scroll td:first-child,.table-scroll th:first-child{padding-left:10px}
      .warn-row{background:#fff8ef}
      .accent-row{background:#f4fbf5}
      .tag{display:inline-block;border:1px solid #cbd8d0;border-radius:999px;padding:2px 8px;background:#fff;white-space:nowrap}
      .stat-strip{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 12px}
      .stat-pill{border:1px solid #d5ddd8;border-radius:999px;background:#f9fbfa;padding:7px 11px;font-size:13px}
      .stat-pill strong{color:#008c2a;margin-left:6px}
      details{background:#fff;border:1px solid #d5ddd8;border-radius:8px;padding:12px;margin-top:12px}
      summary{cursor:pointer;font-weight:800}
      code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-weight:800;color:#008c2a}
      .key-link{display:inline-block;border:1px solid #91d4a2;border-radius:6px;background:#f3fbf5;color:#008c2a;font-weight:800;padding:5px 9px;text-decoration:none;white-space:nowrap}
      .actions{display:flex;gap:8px;white-space:nowrap}
      form{margin:0}
      button{background:#fff;border:1px solid #a8b6af;border-radius:6px;padding:5px 9px;font:inherit;font-weight:700;cursor:pointer}
      button:hover{border-color:#008c2a;color:#008c2a}
      section{margin-top:14px;overflow:hidden}
      a{color:#0b78d0}
      .profile-search{display:flex;gap:10px;align-items:center;margin-bottom:12px}
      .profile-search input{min-width:280px;flex:0 1 420px;border:1px solid #a8b6af;border-radius:8px;padding:8px 10px;font:inherit}
      .profile-search .hint{margin:0}
      .settings-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
      .setting-card{border:1px solid #d5ddd8;border-radius:8px;background:#f9fbfa;padding:12px}
      .setting-card label{display:block;font-weight:800;margin-bottom:8px}
      .setting-card select{width:100%;border:1px solid #a8b6af;border-radius:8px;background:#fff;padding:8px 10px;font:inherit}
      .setting-card input[type="checkbox"]{width:18px;height:18px;vertical-align:middle}
      .setting-row{display:flex;align-items:center;gap:8px;min-height:39px}
      .setting-card :disabled{opacity:.72;cursor:not-allowed}
      .back-top{position:fixed;right:20px;bottom:24px;width:46px;height:46px;border-radius:999px;border:1px solid #a8b6af;background:#fff;color:#008c2a;font-size:24px;font-weight:900;box-shadow:0 10px 24px rgba(0,0,0,.12);display:grid;place-items:center;text-decoration:none}
      .back-top:hover{border-color:#008c2a;background:#f3fbf5}
      @media(max-width:1100px){.cards,.funnel,.settings-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:700px){main{padding:14px}.cards,.funnel{grid-template-columns:1fr}.topbar{display:block}.top-actions{margin-top:10px}}
    </style></head><body><main id="top">
    <div class="topbar">
      <div><h1>HAM 台网点名后台</h1><div class="subtitle">本地版下载、数据库接入与共享库更新监测 · 当前范围：${rangeLabel} · 最近刷新 ${formatBjt(new Date().toISOString())}</div></div>
      <div class="top-actions"><a href="${basePath}/admin/">刷新</a><a href="${basePath}/admin/logout">退出登录</a></div>
    </div>
    <div class="filters">
      <span class="hint">时间范围</span>
      <a class="filter-link ${range === 'today' ? 'active' : ''}" href="${rangeHref('today')}">今日</a>
      <a class="filter-link ${range === '7d' ? 'active' : ''}" href="${rangeHref('7d')}">7天</a>
      <a class="filter-link ${range === '30d' ? 'active' : ''}" href="${rangeHref('30d')}">30天</a>
      <a class="filter-link ${range === 'all' ? 'active' : ''}" href="${rangeHref('all')}">全部</a>
      <span class="hint">下载统计：${overview.downloadSource}</span>
    </div>
    <section id="overview">
      <h2>本地版下载与数据库同步总览</h2>
    <div class="cards">
      <a class="card" href="#usage-trend"><div>本地版下载</div><div class="num">${metric(overview.downloadTotal)}</div><div class="hint">${overview.downloadUniqueEstimate === null ? 'Nginx 下载日志待接入' : `去重估算 ${overview.downloadUniqueEstimate}`} · 查看趋势</div></a>
      <a class="card primary" href="#checkin-details"><div>主控建活动/活动日志</div><div class="num">${overview.activeControllers} / ${overview.effectiveCheckins}</div><div class="hint">主控呼号 / 活动日志 · 查看明细</div></a>
      <a class="card primary" href="#checkin-details"><div>点名记录</div><div class="num">${overview.totalRecords}</div><div class="hint">累计记录条数 · 查看活动记录</div></a>
      <a class="card primary" href="#checkin-details"><div>Excel 生成/下载</div><div class="num">${overview.excelGenerated} / ${overview.excelDownloads}</div><div class="hint">文件生成 / 后台下载 · 查看文件</div></a>
      <a class="card attention" href="#registrations"><div>待批准申请</div><div class="num">${pendingRegistrationCount}</div><div class="hint">需要后台处理 · 查看审核</div></a>
      <a class="card" href="#admin-login-details"><div>登录独立 IP</div><div class="num">${usageStats.loginUniqueIpCount}</div><div class="hint">后台访问 · 查看登录明细</div></a>
    </div>
    </section>
    <section>
      <h2>数据库同步使用链路</h2>
      <div class="funnel">
        <div class="funnel-step">接入数据库<strong>${overview.syncEnabled}</strong><span class="hint">发生过拉取或上传</span></div>
        <div class="funnel-step">同步拉取<strong>${overview.syncPulls}</strong><span class="hint">获取共享库</span></div>
        <div class="funnel-step">上传更新<strong>${overview.syncPushes}</strong><span class="hint">贡献资料</span></div>
        <div class="funnel-step">最近同步/使用<strong style="font-size:16px">${overview.recentUseAt ? formatBjt(overview.recentUseAt) : '暂无'}</strong><span class="hint">UTC+8</span></div>
      </div>
    </section>
    <section id="usage-trend"><h2>本地版使用与同步趋势</h2><div class="table-scroll"><table><thead><tr><th>日期</th><th>本地版下载</th><th>主控呼号</th><th>活动日志</th><th>点名记录</th><th>Excel生成</th><th>Excel下载</th><th>数据库接入</th><th>同步拉取</th><th>上传更新</th><th>合并资料</th></tr></thead><tbody>${trendRows}</tbody></table></div></section>
    <section id="checkin-details"><h2>主控活动、点名记录与 Excel 明细</h2><div class="table-scroll"><table><thead><tr><th>时间</th><th>类型</th><th>主控呼号</th><th>活动名</th><th>记录数</th><th>Excel</th><th>Excel下载</th><th>同步</th><th>IP</th><th>客户端</th></tr></thead><tbody>${effectiveRows}</tbody></table></div></section>
    <section id="admin-login-details"><h2>后台登录明细</h2><div class="table-scroll"><table><thead><tr><th>时间</th><th>账号</th><th>IP</th><th>客户端</th></tr></thead><tbody>${adminLoginRows}</tbody></table></div></section>
    <section id="registrations">
      <h2>数据库治理与同步查询</h2>
      <div class="stat-strip">
        <span class="stat-pill">数据库接入<strong>${databaseSummary.syncEnabled}</strong></span>
        <span class="stat-pill">同步拉取<strong>${databaseSummary.syncPulls}</strong></span>
        <span class="stat-pill">上传更新<strong>${databaseSummary.syncPushes}</strong></span>
        <span class="stat-pill">上传资料<strong>${databaseSummary.uploadedProfiles}</strong></span>
        <span class="stat-pill">合并资料<strong>${databaseSummary.mergedProfiles}</strong></span>
        <span class="stat-pill">基础库呼号<strong>${databaseSummary.baseCallsigns}</strong></span>
        <span class="stat-pill">基础库 QTH / 设备<strong>${databaseSummary.baseQths} / ${databaseSummary.baseDevices}</strong></span>
      </div>
      <div class="filters" style="margin-bottom:12px">
        <span class="hint">操作</span>
        <a class="filter-link ${!syncEventFilter ? 'active' : ''}" href="${syncHref()}">全部同步记录</a>
        <a class="filter-link ${syncEventFilter === 'profiles-pull' ? 'active' : ''}" href="${syncHref('profiles-pull')}">查看拉取</a>
        <a class="filter-link ${syncEventFilter === 'profiles-push' ? 'active' : ''}" href="${syncHref('profiles-push')}">查看上传更新</a>
        <span class="hint">结果：${filteredSyncEvents.length} 条同步记录，呼号查询 ${profileSearchRows.length} 条</span>
      </div>
      <form class="profile-search" method="get" action="${basePath}/admin/">
        <input type="hidden" name="range" value="${escapeHtml(range)}" />
        <input type="hidden" name="syncEvent" value="${escapeHtml(syncEventFilter)}" />
        <input name="profileQuery" value="${escapeHtml(profileQuery)}" placeholder="输入呼号、QTH、设备或关键字" autocomplete="off" />
        <button type="submit">查询呼号库</button>
        <span class="hint">结果来自基础库 + 共享库，完整呼号和核心呼号优先。</span>
      </form>
      <div class="table-scroll" style="margin-bottom:12px"><table><thead><tr><th>呼号</th><th>QTH</th><th>设备</th><th>点名次数</th><th>记录时间 / 参与时间 (UTC+8)</th></tr></thead><tbody>${profileRows}</tbody></table></div>
      <div class="table-scroll"><table><thead><tr><th>时间</th><th>注册呼号</th><th>核心呼号</th><th>IP</th><th>事件</th><th>拉取</th><th>上传</th><th>合并</th><th>基础库</th><th>共享库</th></tr></thead><tbody>${syncRows}</tbody></table></div>
    </section>
    <section>
      <h2>共享呼号资料库注册审核</h2>
      <div class="cards">
        <div class="card attention"><div>待批准</div><div class="num">${pendingRegistrationCount}</div><div class="hint">优先处理</div></div>
        <a class="card" href="${registrationHref('approved')}" style="text-decoration:none;color:inherit"><div>已通过</div><div class="num">${registrations.filter((item) => item.status === 'approved').length}</div><div class="hint">点击查询列表</div></a>
        <a class="card" href="${registrationHref('rejected')}" style="text-decoration:none;color:inherit"><div>已拒绝</div><div class="num">${registrations.filter((item) => item.status === 'rejected').length}</div><div class="hint">点击查询列表</div></a>
      </div>
      <h2 style="margin-top:10px">待批准申请</h2>
      <div class="table-scroll"><table><thead><tr><th>时间</th><th>呼号</th><th>CRAC 操作证书号</th><th>常用 QTH</th><th>常用服务器</th><th>风险提示</th><th>状态</th><th>验证密钥</th><th>操作</th></tr></thead><tbody>${pendingRegistrationRows}</tbody></table></div>
      <details ${registrationStatus || registrationQuery ? 'open' : ''}>
        <summary>查询已处理申请 ${processedRegistrations.length} 条${registrationStatus ? ` · ${formatRegistrationStatus(registrationStatus)}` : ''}</summary>
        <form class="profile-search" method="get" action="${basePath}/admin/" style="margin-top:10px">
          <input type="hidden" name="range" value="${escapeHtml(range)}" />
          <input type="hidden" name="registrationStatus" value="${escapeHtml(registrationStatus)}" />
          <input name="registrationQuery" value="${escapeHtml(registrationQuery)}" placeholder="查询已处理呼号、证号、QTH、服务器" autocomplete="off" />
          <button type="submit">查询</button>
          <a class="filter-link ${registrationStatus === 'approved' ? 'active' : ''}" href="${registrationHref('approved')}">已通过</a>
          <a class="filter-link ${registrationStatus === 'rejected' ? 'active' : ''}" href="${registrationHref('rejected')}">已拒绝</a>
        </form>
        <div class="table-scroll" style="margin-top:10px"><table><thead><tr><th>时间</th><th>呼号</th><th>CRAC 操作证书号</th><th>常用 QTH</th><th>常用服务器</th><th>风险提示</th><th>状态</th><th>验证密钥</th><th>操作</th></tr></thead><tbody>${processedRegistrationRows}</tbody></table></div>
      </details>
    </section>
    <section id="settings"><h2>系统设置与审计</h2>
      <form method="post" action="${basePath}/admin/settings">
      <input type="hidden" name="returnTo" value="${escapeHtml(settingsReturnTo)}" />
      <div class="settings-grid">
        <div class="setting-card">
          <label for="review-mode">审核模式</label>
          <select id="review-mode" name="reviewMode">
            <option value="loose" ${adminSettings.reviewMode === 'loose' ? 'selected' : ''}>宽松：管理员手动通过</option>
            <option value="assisted" ${adminSettings.reviewMode === 'assisted' ? 'selected' : ''}>半自动：显示风险提示</option>
            <option value="strict" ${adminSettings.reviewMode === 'strict' ? 'selected' : ''}>严格：高风险禁止通过</option>
          </select>
          <div class="hint">严格模式下，有风险提示的申请不能直接通过。</div>
        </div>
        <div class="setting-card">
          <label for="sync-enabled">共享库同步</label>
          <div class="setting-row"><input id="sync-enabled" name="profileSyncEnabled" type="checkbox" ${adminSettings.profileSyncEnabled ? 'checked' : ''} /><span>开放给通过审核用户</span></div>
          <div class="hint">控制已批准用户拉取和上传共享呼号资料。</div>
        </div>
        <div class="setting-card">
          <label for="upload-limit">上传限制</label>
          <select id="upload-limit" name="uploadLimit">
            <option value="2000" ${adminSettings.uploadLimit === '2000' ? 'selected' : ''}>单次最多 2000 条</option>
            <option value="500" ${adminSettings.uploadLimit === '500' ? 'selected' : ''}>单次最多 500 条</option>
            <option value="pull-only" ${adminSettings.uploadLimit === 'pull-only' ? 'selected' : ''}>暂停上传，仅允许拉取</option>
          </select>
          <div class="hint">保存后会影响 profiles-push 接口。</div>
        </div>
        <div class="setting-card">
          <label for="download-log-source">本地版下载统计</label>
          <select id="download-log-source" name="downloadLogSource">
            <option value="pending" ${adminSettings.downloadLogSource === 'pending' ? 'selected' : ''}>待接入 Nginx access log</option>
            <option value="nginx" ${adminSettings.downloadLogSource === 'nginx' ? 'selected' : ''}>读取 Nginx 日志</option>
            <option value="proxy" ${adminSettings.downloadLogSource === 'proxy' ? 'selected' : ''}>服务端下载代理</option>
          </select>
          <div class="hint">不改前台下载链接时，优先读取 VPS 日志。</div>
        </div>
      </div>
      <div style="margin-top:12px"><button type="submit">保存设置</button><span class="hint" style="margin-left:10px">保存到 data/admin-settings.json。</span></div>
      </form>
    </section>
    </main><a class="back-top" href="#top" title="回到顶部">↑</a></body></html>`,
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
    return await runtimeFetch(url, { ...options, signal: controller.signal })
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
  try {
    const response = await fetchWithTimeout(parsed, { headers: { accept: 'text/html,*/*' } }, 8000)
    const text = await response.text()
    send(res, response.status, text, {
      'content-type': response.headers.get('content-type') || 'text/html; charset=utf-8',
      'access-control-allow-origin': '*'
    })
  } catch (error) {
    const isTimeout = error?.name === 'AbortError'
    const message = isTimeout
      ? '局域网设备连接超时，请确认设备 IP 可访问，并在 macOS 系统设置中允许本软件访问本地网络。'
      : '局域网设备连接失败，请确认设备 IP、网络连接和 macOS 本地网络权限。'
    send(res, 502, message, {
      'content-type': 'text/plain; charset=utf-8',
      'access-control-allow-origin': '*'
    })
  }
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
      if (req.method === 'OPTIONS' && url.pathname === '/api/client-events') {
        return send(res, 204, '', clientEventCorsHeaders)
      }
      if (req.method === 'OPTIONS' && url.pathname.startsWith('/api/profiles/')) {
        return send(res, 204, '', profileCorsHeaders)
      }
      if (req.method === 'POST' && url.pathname === '/api/checkins') return saveCheckin(req, res)
      if (req.method === 'POST' && url.pathname === '/api/client-events') return recordClientEvent(req, res)
      if (req.method === 'POST' && url.pathname === '/api/profiles/register') return registerSharedProfileAccess(req, res)
      if (req.method === 'GET' && url.pathname === '/api/profiles/pull') return pullSharedProfiles(req, res)
      if (req.method === 'POST' && url.pathname === '/api/profiles/push') return pushSharedProfiles(req, res)
      if (req.method === 'GET' && url.pathname === '/api/brandmeister/last-heard') return fetchBrandmeisterLastHeard(req, res)
      if (req.method === 'GET' && url.pathname === '/api/brandmeister/device') return fetchBrandmeisterDevice(req, res)
      if (req.method === 'GET' && url.pathname === '/mmdvm-proxy') return proxyMmdvmPage(req, res)
      if (req.method === 'GET' && url.pathname === '/admin/login') return renderAdminLogin(req, res)
      if (req.method === 'POST' && url.pathname === '/admin/login') return handleAdminLogin(req, res)
      if (req.method === 'POST' && url.pathname === '/admin/settings') return handleAdminSettings(req, res)
      if (url.pathname === '/admin/logout') return handleAdminLogout(req, res)
      const registrationAction = url.pathname.match(/^\/admin\/registrations\/([^/]+)\/(approve|reject)$/)
      if (req.method === 'POST' && registrationAction) {
        return handleProfileRegistrationAction(req, res, registrationAction[1], registrationAction[2])
      }
      const registrationKeyDownload = url.pathname.match(/^\/admin\/registrations\/([^/]+)\/key$/)
      if (req.method === 'GET' && registrationKeyDownload) {
        return downloadProfileRegistrationKey(req, res, registrationKeyDownload[1])
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

const DIRECTORY_CSV_URL = 'https://w0chp.radio/digital-radio-lists/ysf-reflectors/download.csv'
const DIRECTORY_PAGE_URL = 'https://w0chp.radio/digital-radio-lists/ysf-reflectors/'
const VERIFIED_CHINA_DASHBOARDS = new Set(['YSF-18829', 'YSF-46004', 'YSF-46008', 'YSF-46059'])
const VERIFIED_DASHBOARD_URLS = {
  'YSF-18829': 'https://mmdvm.cc/ysf/',
  'YSF-46004': 'http://139.196.236.224/main.php',
  'YSF-46008': 'http://c4fm.tg46008.cn/',
  'YSF-46059': 'http://500a.cn:46059/'
}

export const getVerifiedChinaYsfReflectors = () => [
  {
    number: '18829',
    id: 'YSF-18829',
    name: 'DRCC-01',
    description: 'CN CC#1 · MMDVM China Club',
    host: '47.104.177.248',
    port: '42000',
    dmr2ysf: '7018829',
    dashboardUrl: VERIFIED_DASHBOARD_URLS['YSF-18829']
  },
  {
    number: '46004',
    id: 'YSF-46004',
    name: 'C4FM-BG4IAJ',
    description: 'China C4FM',
    host: '139.196.236.224',
    port: '42000',
    dmr2ysf: '7046004',
    dashboardUrl: VERIFIED_DASHBOARD_URLS['YSF-46004']
  },
  {
    number: '46008',
    id: 'YSF-46008',
    name: 'YSF-TG46008',
    description: 'YSF_BM_TG46008',
    host: '47.108.229.231',
    port: '42003',
    dmr2ysf: '7046008',
    dashboardUrl: VERIFIED_DASHBOARD_URLS['YSF-46008']
  },
  {
    number: '46059',
    id: 'YSF-46059',
    name: 'Daqing-460459',
    description: 'CN-C4FM-Daqing',
    host: '106.75.24.21',
    port: '42000',
    dmr2ysf: '7046059',
    dashboardUrl: VERIFIED_DASHBOARD_URLS['YSF-46059']
  }
]

const fallbackReflectors = [
  ['18829', 'DRCC-01', 'CN CC#1 · MMDVM China Club', '47.104.177.248', '42000', '7018829', 'https://mmdvm.cc/ysf/'],
  ['46001', 'C4FM-TG46001', 'China', 'www.bh1nyr.net', '42000', '7046001', 'http://www.bh1nyr.net'],
  ['46004', 'C4FM-BG4IAJ', 'China C4FM', '139.196.236.224', '42000', '7046004', 'http://139.196.236.224'],
  ['46007', 'China-9', 'China', '125.91.17.122', '42000', '7046007', 'http://125.91.17.122:8090/ysf/'],
  ['46008', 'YSF-TG46008', 'China', '47.108.229.231', '42003', '7046008', 'http://c4fm.tg46008.cn/'],
  ['46010', 'BJ-TG46010', 'China', '222.128.4.82', '42002', '7046010', 'http://www.bh1nyr.net'],
  ['46020', 'YSF-46020', 'China', '8.163.29.23', '42000', '7046020', 'http://8.163.29.23/'],
  ['46023', 'YSF-46023', 'China', '47.109.55.52', '42005', '7046023', 'http://47.109.55.52/']
].map(([number, name, description, host, port, dmr2ysf, dashboardUrl]) => ({
  number,
  id: `YSF-${number}`,
  name,
  description,
  host,
  port,
  dmr2ysf,
  dashboardUrl
}))

function parseCsvLine(line) {
  const values = []
  let value = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (char === ',' && !quoted) {
      values.push(value)
      value = ''
    } else {
      value += char
    }
  }
  values.push(value)
  return values.map((item) => item.trim())
}

export function parseYsfDirectoryCsv(csv) {
  return String(csv || '')
    .split(/\r?\n/)
    .slice(1)
    .map(parseCsvLine)
    .filter((row) => row.length >= 5 && row[0])
    .map(([rawId, name, description, host, port, dmr2ysf]) => {
      const number = String(rawId).replace(/\D+/g, '').padStart(5, '0')
      return {
        number,
        id: `YSF-${number}`,
        name,
        description,
        host,
        port,
        dmr2ysf
      }
    })
}

export function parseYsfDirectoryHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return [...doc.querySelectorAll('tr')]
    .map((row) => {
      const cells = [...row.querySelectorAll('td')]
      const idCell = cells.find((cell) => /reflector id/i.test(cell.getAttribute('data-label') || '')) || cells[0]
      const rawId = textOf(idCell)
      if (!/^YSF-\d{5}$/i.test(rawId)) return null
      const valueByLabel = (pattern, fallbackIndex) =>
        textOf(cells.find((cell) => pattern.test(cell.getAttribute('data-label') || '')) || cells[fallbackIndex])
      const number = rawId.replace(/\D+/g, '').padStart(5, '0')
      return {
        number,
        id: `YSF-${number}`,
        name: valueByLabel(/refl.*name/i, 1),
        description: valueByLabel(/description/i, 2),
        host: valueByLabel(/hostname|host\/ip/i, 3),
        port: valueByLabel(/port/i, 4),
        dmr2ysf: valueByLabel(/dmr2ysf/i, 5),
        connectedUsers: Number(valueByLabel(/connected users/i, 6) || 0),
        dashboardUrl: idCell?.querySelector('a[href]')?.href || ''
      }
    })
    .filter(Boolean)
}

async function fetchText(url, timeoutMs = 9000) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.text()
  } finally {
    window.clearTimeout(timer)
  }
}

async function fetchViaDevProxy(url) {
  return fetchText(`/mmdvm-proxy?url=${encodeURIComponent(url)}`)
}

function discoverDashboardLinks(html, pageUrl) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const hint = /ysf|c4fm|fusion|reflector|dashboard|last|heard|qso|实时|在线|状态/i
  return [...doc.querySelectorAll('a[href]')]
    .map((link) => {
      const href = link.getAttribute('href') || ''
      const label = textOf(link)
      if (!hint.test(`${href} ${label}`)) return ''
      try {
        const url = new URL(href, pageUrl)
        return ['http:', 'https:'].includes(url.protocol) ? url.href : ''
      } catch {
        return ''
      }
    })
    .filter(Boolean)
}

async function discoverYsfDashboard(startUrl, maxDepth = 2, maxPages = 16) {
  const queue = [{ url: startUrl, depth: 0 }]
  const visited = new Set()
  let lastError = null
  while (queue.length && visited.size < maxPages) {
    const current = queue.shift()
    if (!current?.url || visited.has(current.url)) continue
    visited.add(current.url)
    try {
      const html = await fetchViaDevProxy(current.url)
      const parsed = parseYsfDashboard(html)
      if (parsed.supported) return { url: current.url, ...parsed }
      if (current.depth >= maxDepth) continue
      for (const url of discoverDashboardLinks(html, current.url)) {
        if (!visited.has(url)) queue.push({ url, depth: current.depth + 1 })
      }
    } catch (error) {
      lastError = error
    }
  }
  if (lastError && visited.size === 1) throw lastError
  throw new Error(`已检查 ${visited.size} 个相关页面，未发现可读取的 YSF Last Heard 表格`)
}

export async function fetchYsfReflectors() {
  try {
    const html = await fetchViaDevProxy(DIRECTORY_PAGE_URL)
    const rows = parseYsfDirectoryHtml(html)
    if (rows.length) return rows
  } catch (error) {
    console.warn('W0CHP YSF 目录页面读取失败，改读 CSV:', error)
  }
  try {
    const csv = await fetchViaDevProxy(DIRECTORY_CSV_URL)
    const rows = parseYsfDirectoryCsv(csv)
    if (rows.length) return rows
  } catch (error) {
    console.warn('W0CHP YSF CSV 读取失败，使用内置中国区列表:', error)
  }
  return fallbackReflectors
}

const textOf = (node) => String(node?.textContent || '').replace(/\s+/g, ' ').trim()

export function parseYsfDashboard(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const rows = []
  let supported = false
  const preferredTables = [...doc.querySelectorAll('table#currtx, table#lh')]
  const tables = preferredTables.length ? preferredTables : [...doc.querySelectorAll('table')]
  for (const table of tables) {
    const tableRows = [...table.querySelectorAll('tr')]
    const headerRow = tableRows.find((row) => row.querySelectorAll('th').length >= 3)
    if (!headerRow) continue
    const headers = [...headerRow.cells].map((cell) => textOf(cell).toLowerCase())
    const callIndex = headers.findIndex((header) => /^call$|callsign/.test(header))
    if (callIndex < 0) continue
    const hasQsoShape = headers.some((header) => /time|时间/.test(header)) &&
      headers.some((header) => /gateway|网关|target|目标|status|stream/.test(header))
    if (!hasQsoShape) continue
    supported = true
    const indexOf = (pattern) => headers.findIndex((header) => pattern.test(header))
    const gatewayIndex = indexOf(/gateway/)
    const radioIndex = indexOf(/radio/)
    const targetIndex = indexOf(/target/)
    const streamIndex = indexOf(/stream/)
    const timeIndex = indexOf(/utc.*time|time.*qso/)
    const statusIndex = indexOf(/status/)
    for (const row of tableRows.slice(tableRows.indexOf(headerRow) + 1)) {
      const cells = [...row.cells]
      const callsign = textOf(cells[callIndex]).split(/\s+/)[0].toUpperCase()
      if (!/^[A-Z0-9/-]{3,}$/.test(callsign)) continue
      rows.push({
        callsign,
        gateway: gatewayIndex >= 0 ? textOf(cells[gatewayIndex]) : '',
        radio: radioIndex >= 0 ? textOf(cells[radioIndex]) : '',
        target: targetIndex >= 0 ? textOf(cells[targetIndex]) : '',
        stream: streamIndex >= 0 ? textOf(cells[streamIndex]) : '',
        timeText: timeIndex >= 0 ? textOf(cells[timeIndex]) : '',
        status: statusIndex >= 0 ? textOf(cells[statusIndex]) : '',
        rawText: cells.map(textOf).join(' | ')
      })
    }
  }
  return {
    supported,
    rows: rows.slice(0, 30)
  }
}

export async function fetchYsfDashboard(reflector) {
  if (!reflector?.dashboardUrl) throw new Error('W0CHP 没有提供该反射器的 Web 地址')
  const dashboardUrl = VERIFIED_DASHBOARD_URLS[reflector.id] || reflector.dashboardUrl
  const appBasePath = window.location.pathname.startsWith('/checkin') ? '/checkin' : ''
  const response = await fetch(
    `${appBasePath}/api/ysf/last-heard?url=${encodeURIComponent(dashboardUrl)}`,
    { cache: 'no-store' }
  )
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `YSF Dashboard HTTP ${response.status}`)
  }
  return {
    target: `${reflector.id} ${reflector.name}`.trim(),
    dashboardUrl,
    rows: payload.rows || []
  }
}

export function getYsfDashboardStatus(reflector) {
  if (VERIFIED_CHINA_DASHBOARDS.has(reflector?.id)) return 'verified'
  if (!reflector?.dashboardUrl) return 'no-link'
  return 'unverified'
}

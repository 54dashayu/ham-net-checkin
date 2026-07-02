import { normalizeHost } from './fmoClient'

const targetLabels = [
  /目标/,
  /target/i,
  /d-?star\s+reflector/i,
  /dmr\s+talk\s*group/i,
  /dmr\s+talkgroup/i,
  /ysf\s+network/i,
  /reflector/i
]

const textOf = (node) => String(node?.textContent || '').replace(/\s+/g, ' ').trim()

export function buildMmdvmLastHeardUrl(host) {
  const normalizedHost = normalizeHost(host)
  return `http://${normalizedHost}/mmdvmhost/lh.php`
}

export function buildMmdvmDashboardUrl(host) {
  const normalizedHost = normalizeHost(host)
  return `http://${normalizedHost}/`
}

function valueAt(row, headers, patterns) {
  const index = headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)))
  return index >= 0 ? textOf(row.cells[index]) : ''
}

function normalizeHeader(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseTarget(doc) {
  for (const row of doc.querySelectorAll('tr')) {
    const cells = [...row.cells]
    if (cells.length < 2) continue
    const label = textOf(cells[0]).replace(/[:：]$/g, '')
    if (targetLabels.some((pattern) => pattern.test(label))) {
      return textOf(cells[1])
    }
  }

  for (const table of doc.querySelectorAll('table')) {
    const headerRow = [...table.querySelectorAll('tr')].find((row) => row.querySelectorAll('th').length)
    if (!headerRow) continue
    const headers = [...headerRow.querySelectorAll('th')].map((cell) => normalizeHeader(textOf(cell)))
    const targetIndex = headers.findIndex((header) =>
      targetLabels.some((pattern) => pattern.test(header))
    )
    if (targetIndex < 0) continue
    const firstDataRow = [...table.querySelectorAll('tr')]
      .slice([...table.querySelectorAll('tr')].indexOf(headerRow) + 1)
      .find((row) => row.cells.length > targetIndex)
    const value = firstDataRow ? textOf(firstDataRow.cells[targetIndex]) : ''
    if (value && !targetLabels.some((pattern) => pattern.test(value))) return value
  }

  return ''
}

function parseDashboardNetworkName(doc) {
  for (const table of doc.querySelectorAll('table')) {
    const rows = [...table.querySelectorAll('tr')]
    const heading = rows[0] ? textOf(rows[0]) : ''
    if (!/网络/.test(heading) || /网络状态/.test(heading)) continue
    const valueRow = rows.find((row, index) => index > 0 && textOf(row))
    const value = valueRow ? textOf(valueRow) : ''
    if (value) return value
  }
  return ''
}

function parseLastHeardRows(doc) {
  const candidates = []
  for (const table of doc.querySelectorAll('table')) {
    const rows = [...table.querySelectorAll('tr')]
    const headerRow = rows.find((row) => row.querySelectorAll('th').length >= 2)
    if (!headerRow) continue
    const headers = [...headerRow.querySelectorAll('th')].map((cell) => normalizeHeader(textOf(cell)))
    const hasCallsign = headers.some((header) => /呼号|call\s*sign|callsign|call/i.test(header))
    if (!hasCallsign) continue

    for (const row of rows.slice(rows.indexOf(headerRow) + 1)) {
      if (!row.cells.length) continue
      const callsign = valueAt(row, headers, [/呼号/, /call\s*sign/i, /callsign/i, /^call$/i])
        .split(/\s+/)[0]
        .toUpperCase()
      if (!/^[A-Z0-9/]{3,}$/.test(callsign)) continue

      const time = valueAt(row, headers, [/时间/, /time/i, /date/i])
      const target = valueAt(row, headers, [/目标/, /target/i, /reflector/i, /talk\s*group/i])
      const mode = valueAt(row, headers, [/模式/, /mode/i]) || 'MMDVM'
      const timeslot = valueAt(row, headers, [/时隙/, /^ts$/i, /time\s*slot/i, /slot/i]) || mode.match(/\bTS\s*[12]\b/i)?.[0] || ''
      const duration = valueAt(row, headers, [/时长/, /dur/i, /duration/i])
      candidates.push({
        callsign,
        timeText: time,
        target,
        mode,
        timeslot,
        duration,
        rawText: [...row.cells].map(textOf).join(' | ')
      })
    }
  }
  return candidates
}

export function parseMmdvmLastHeard(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return {
    target: parseTarget(doc),
    rows: parseLastHeardRows(doc).slice(0, 20)
  }
}

export function parseMmdvmDashboard(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return {
    networkName: parseDashboardNetworkName(doc)
  }
}

function isLocalOrigin() {
  const hostname = window.location.hostname.toLowerCase()
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

async function fetchWithTimeout(url, timeoutMs = 3500) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal })
    if (!response.ok) {
      const message = await response.text().catch(() => '')
      throw new Error(message || `HTTP ${response.status}`)
    }
    return response.text()
  } finally {
    window.clearTimeout(timer)
  }
}

async function fetchHtmlWithProxy(directUrl) {
  const proxyUrl = `/mmdvm-proxy?url=${encodeURIComponent(directUrl)}`
  const urls = isLocalOrigin() ? [proxyUrl] : [directUrl, proxyUrl]
  let lastError = null
  for (const url of urls) {
    try {
      return await fetchWithTimeout(url)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError || new Error('MMDVM 页面读取失败')
}

function buildLocalProxyUrl(localProxyUrl, directUrl) {
  const base = String(localProxyUrl || '').trim().replace(/\/+$/g, '')
  if (!base) return ''
  return `${base}/proxy/raw?url=${encodeURIComponent(directUrl)}`
}

async function fetchHtmlWithLocalProxy(directUrl, options = {}) {
  const localProxyUrl = buildLocalProxyUrl(options.localProxyUrl, directUrl)
  const urls = options.preferLocalProxy && localProxyUrl
    ? [localProxyUrl, ...(isLocalOrigin() ? [`/mmdvm-proxy?url=${encodeURIComponent(directUrl)}`] : [directUrl, `/mmdvm-proxy?url=${encodeURIComponent(directUrl)}`])]
    : null
  if (!urls) return fetchHtmlWithProxy(directUrl)
  let lastError = null
  for (const url of urls) {
    try {
      return await fetchWithTimeout(url)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError || new Error('MMDVM 页面读取失败')
}

export async function fetchMmdvmLastHeard(host, options = {}) {
  const lastHeardHtml = await fetchHtmlWithLocalProxy(buildMmdvmLastHeardUrl(host), options)
  const lastHeard = parseMmdvmLastHeard(lastHeardHtml)
  if (options.includeDashboard === false) return lastHeard
  try {
    const dashboardHtml = await fetchHtmlWithLocalProxy(buildMmdvmDashboardUrl(host), options)
    const dashboard = parseMmdvmDashboard(dashboardHtml)
    return {
      ...lastHeard,
      target: dashboard.networkName || lastHeard.target
    }
  } catch {
    return lastHeard
  }
}

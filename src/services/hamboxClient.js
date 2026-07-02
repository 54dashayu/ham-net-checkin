import { normalizeHost } from './fmoClient'

export function buildHamboxDataUrl(host) {
  const normalizedHost = normalizeHost(host)
  return `http://${normalizedHost}/cgi-bin/luci/hambox/dashboard/data?ver=2&limit=25`
}

function isLocalOrigin() {
  const hostname = window.location.hostname.toLowerCase()
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

async function fetchWithTimeout(url, timeoutMs = 3500) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: { accept: 'application/json,text/plain,*/*' },
      signal: controller.signal
    })
    if (!response.ok) {
      const message = await response.text().catch(() => '')
      throw new Error(message || `HTTP ${response.status}`)
    }
    return response.text()
  } finally {
    window.clearTimeout(timer)
  }
}

async function fetchJsonWithProxy(directUrl) {
  const proxyUrl = `/mmdvm-proxy?url=${encodeURIComponent(directUrl)}`
  const urls = isLocalOrigin() ? [proxyUrl] : [directUrl, proxyUrl]
  let lastError = null
  for (const url of urls) {
    try {
      const text = await fetchWithTimeout(url)
      return JSON.parse(text)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError || new Error('HAMBOX 数据读取失败')
}

function buildLocalProxyUrl(localProxyUrl, directUrl) {
  const base = String(localProxyUrl || '').trim().replace(/\/+$/g, '')
  if (!base) return ''
  return `${base}/proxy/raw?url=${encodeURIComponent(directUrl)}`
}

async function fetchJsonWithLocalProxy(directUrl, options = {}) {
  const localProxyUrl = buildLocalProxyUrl(options.localProxyUrl, directUrl)
  const urls = options.preferLocalProxy && localProxyUrl
    ? [localProxyUrl, ...(isLocalOrigin() ? [`/mmdvm-proxy?url=${encodeURIComponent(directUrl)}`] : [directUrl, `/mmdvm-proxy?url=${encodeURIComponent(directUrl)}`])]
    : null
  if (!urls) return fetchJsonWithProxy(directUrl)
  let lastError = null
  for (const url of urls) {
    try {
      const text = await fetchWithTimeout(url)
      return JSON.parse(text)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError || new Error('HAMBOX 数据读取失败')
}

const sortByTimestampDesc = (left, right) => Number(right.timestamp || 0) - Number(left.timestamp || 0)

export async function fetchHamboxLastHeard(host, options = {}) {
  const data = await fetchJsonWithLocalProxy(buildHamboxDataUrl(host), options)
  const networkRows = Array.isArray(data?.lh_net) ? data.lh_net : []
  const rfRows = Array.isArray(data?.lh_rf) ? data.lh_rf : []
  const rows = [...networkRows, ...rfRows].filter(Boolean).sort(sortByTimestampDesc).slice(0, 25)
  return {
    target: rows[0]?.to || rows[0]?.dstCall || 'HAMBOX',
    rows
  }
}

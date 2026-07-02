import { createServer, request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { fileURLToPath } from 'node:url'

const version = '1.01.1-test'
const defaultPort = Number(process.env.HAM_CHECKIN_LOCAL_PROXY_PORT || process.env.PORT || 37174)
const defaultHost = process.env.HAM_CHECKIN_LOCAL_PROXY_HOST || '127.0.0.1'
const allowedOrigins = new Set([
  'https://fmo.bh1jss.net',
  'http://127.0.0.1:5173',
  'http://localhost:5173'
])

function createAbortError() {
  const error = new Error('Aborted')
  error.name = 'AbortError'
  return error
}

function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const parsed = url instanceof URL ? url : new URL(String(url))
    const requestFn = parsed.protocol === 'https:' ? httpsRequest : httpRequest
    const req = requestFn(
      parsed,
      {
        method: options.method || 'GET',
        headers: options.headers || {}
      },
      (res) => {
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
            body
          })
        })
      }
    )
    req.on('error', reject)
    const timer = setTimeout(() => req.destroy(createAbortError()), timeoutMs)
    req.on('close', () => clearTimeout(timer))
    req.end()
  })
}

function normalizeHost(address) {
  return String(address || '')
    .trim()
    .replace(/：/g, ':')
    .replace(/^(https?):?\/\//i, '')
    .replace(/[/?#].*$/g, '')
    .replace(/\/+$/g, '')
}

function isPrivateHost(host) {
  const normalized = normalizeHost(host).replace(/:\d+$/g, '').toLowerCase()
  if (normalized === 'localhost') return true
  const match = normalized.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!match) return normalized.endsWith('.local')
  const octets = match.slice(1).map(Number)
  if (octets.some((item) => item < 0 || item > 255)) return false
  const [a, b] = octets
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

function corsHeaders(req, contentType = 'application/json; charset=utf-8') {
  const origin = String(req.headers.origin || '')
  const allowOrigin = allowedOrigins.has(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)
    ? origin
    : 'https://fmo.bh1jss.net'
  return {
    'access-control-allow-origin': allowOrigin,
    'access-control-allow-methods': 'GET,OPTIONS',
    'access-control-allow-headers': 'content-type,accept',
    'access-control-max-age': '86400',
    'content-type': contentType
  }
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers)
  res.end(body)
}

function sendJson(req, res, status, payload) {
  send(res, status, JSON.stringify(payload), corsHeaders(req))
}

function buildMmdvmUrl(host, page = 'last-heard') {
  const normalizedHost = normalizeHost(host)
  if (page === 'dashboard') return `http://${normalizedHost}/`
  return `http://${normalizedHost}/mmdvmhost/lh.php`
}

function buildHamboxUrl(host) {
  const normalizedHost = normalizeHost(host)
  return `http://${normalizedHost}/cgi-bin/luci/hambox/dashboard/data?ver=2&limit=25`
}

function validateTarget(target) {
  let parsed
  try {
    parsed = new URL(target)
  } catch {
    throw new Error('Invalid target URL')
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Unsupported protocol')
  if (!isPrivateHost(parsed.host)) {
    throw new Error('Only local network targets are allowed')
  }
  return parsed
}

async function proxyRaw(req, res, target) {
  const parsed = validateTarget(target)
  const response = await fetchWithTimeout(parsed, { headers: { accept: 'application/json,text/html,*/*' } }, 8000)
  const contentType = response.headers.get('content-type') || 'text/plain; charset=utf-8'
  send(res, response.status, response.body, corsHeaders(req, contentType))
}

async function handleRequest(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`)
  if (req.method === 'OPTIONS') {
    send(res, 204, '', corsHeaders(req))
    return
  }
  if (req.method !== 'GET') {
    sendJson(req, res, 405, { ok: false, error: 'Method not allowed' })
    return
  }
  if (url.pathname === '/health') {
    sendJson(req, res, 200, {
      ok: true,
      name: 'HAM Check-in Local Proxy',
      version,
      time: new Date().toISOString()
    })
    return
  }
  try {
    if (url.pathname === '/proxy/raw') {
      await proxyRaw(req, res, url.searchParams.get('url') || '')
      return
    }
    if (url.pathname === '/proxy/mmdvm') {
      const host = url.searchParams.get('host') || ''
      const page = url.searchParams.get('page') || 'last-heard'
      await proxyRaw(req, res, buildMmdvmUrl(host, page))
      return
    }
    if (url.pathname === '/proxy/hambox') {
      await proxyRaw(req, res, buildHamboxUrl(url.searchParams.get('host') || ''))
      return
    }
    sendJson(req, res, 404, { ok: false, error: 'Not found' })
  } catch (error) {
    const isTimeout = error?.name === 'AbortError'
    sendJson(req, res, isTimeout ? 504 : 502, {
      ok: false,
      error: isTimeout ? 'Local device request timed out' : error?.message || 'Local proxy request failed'
    })
  }
}

export function startLocalProxy({ host = defaultHost, port = defaultPort } = {}) {
  const server = createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      sendJson(req, res, 500, { ok: false, error: error?.message || 'Local proxy failed' })
    })
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      resolve(server)
    })
  })
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  startLocalProxy()
    .then(() => {
      console.log(`HAM Check-in local proxy listening on http://${defaultHost}:${defaultPort}`)
    })
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}

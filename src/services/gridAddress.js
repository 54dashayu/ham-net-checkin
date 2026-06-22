const API_BASE_URL = 'https://grid.lzyike.cn'
const CACHE_KEY = 'ham-net-checkin-grid-address-cache-v1'

let cache = {}
let lastRequestAt = 0

try {
  cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
} catch {
  cache = {}
}

const normalizeGrid = (value) =>
  String(value || '')
    .trim()
    .toUpperCase()

export function isMaidenheadGrid(value) {
  const grid = normalizeGrid(value)
  return /^[A-R]{2}\d{2}([A-X]{2})?(\d{2})?$/.test(grid)
}

export function formatAddress(data) {
  if (!data) return ''
  return [data.province, data.city, data.district]
    .filter(Boolean)
    .filter((part, index, arr) => arr.indexOf(part) === index)
    .join(' ')
}

export async function gridToAddressText(value) {
  const grid = normalizeGrid(value)
  if (!isMaidenheadGrid(grid)) return ''
  if (cache[grid]) return cache[grid]

  const wait = Math.max(0, lastRequestAt + 650 - Date.now())
  if (wait) await new Promise((resolve) => window.setTimeout(resolve, wait))
  lastRequestAt = Date.now()

  const response = await fetch(`${API_BASE_URL}/api/grid2addr/${encodeURIComponent(grid)}`, {
    method: 'GET',
    headers: { Accept: 'application/json' }
  })
  if (!response.ok) throw new Error(`grid2addr HTTP ${response.status}`)

  const result = await response.json()
  if (result.retcode !== 0 || !result.data) {
    throw new Error(result.retmsg || 'grid2addr failed')
  }

  const address = formatAddress(result.data)
  if (address) {
    cache[grid] = address
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  }
  return address
}

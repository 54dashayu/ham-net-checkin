const recentCache = new Map()
const pending = new Map()

export function aprsCallsign(raw) {
  const text = String(raw || '').trim().toUpperCase()
  if (text.startsWith('AI-')) return ''
  const call = text.replace(/^[MP]\./, '').replace(/\.R$/, '')
  return /^[A-Z0-9]{3,6}(?:-[A-Z0-9]{1,2})?$/.test(call) ? call : ''
}

export function coordinatesGrid(data) {
  const latitude = data?.latitude ?? data?.lat
  const longitude = data?.longitude ?? data?.lon ?? data?.lng
  if (typeof latitude !== 'number' || typeof longitude !== 'number' || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return ''
  let lon = Math.min(longitude + 180, 359.999999999)
  let lat = Math.min(latitude + 90, 179.999999999)
  let grid = String.fromCharCode(65 + Math.floor(lon / 20), 65 + Math.floor(lat / 10))
  lon %= 20; lat %= 10
  grid += `${Math.floor(lon / 2)}${Math.floor(lat)}`
  lon %= 2; lat %= 1
  grid += String.fromCharCode(65 + Math.floor(lon * 12), 65 + Math.floor(lat * 24))
  lon %= 1 / 12; lat %= 1 / 24
  return grid + Math.min(9, Math.floor(lon * 120)) + Math.min(9, Math.floor(lat * 240))
}

export async function resolveStationLocation(candidate, { isGrid, gridAddress, fetcher = fetch } ) {
  const raw = candidate.displayCallsign || candidate.callsign
  if (String(raw).toUpperCase().startsWith('AI-')) return null
  const packet = candidate.raw || {}
  const grid = [candidate.grid, packet.toGrid, packet.grid, packet.gridsquare].find(isGrid) || coordinatesGrid(packet)
  if (grid) return { qth: await gridAddress(grid), grid, locationSource: '通联位置' }
  if ([packet.qth, packet.address, packet.location].some(value => typeof value === 'string' && value.trim() && !isGrid(value))) return null
  const call = aprsCallsign(raw)
  if (!call) return null
  if (!recentCache.has(call) || recentCache.get(call).until < Date.now()) {
    if (!pending.has(call)) pending.set(call, (async () => {
      const response = await fetcher(`https://fmo.bh1jss.net/aprs/api/position?callsign=${encodeURIComponent(call)}`, { signal: AbortSignal.timeout(3000), headers: { Accept: 'application/json' } })
      if (response.status === 404) return null
      if (!response.ok) throw new Error('位置服务暂不可用')
      const data = await response.json()
      const locationGrid = coordinatesGrid(data)
      if (!locationGrid || typeof data.receivedAt !== 'number' || !Number.isFinite(data.receivedAt) || data.receivedAt <= 0) return null
      return { qth: typeof data.address === 'string' && data.address.trim() ? data.address : await gridAddress(locationGrid), locationSource: 'APRS 最近位置' }
    })().then(value => { recentCache.set(call, { value, until: Date.now() + 300000 }); return value }).finally(() => pending.delete(call)))
    return pending.get(call)
  }
  return recentCache.get(call).value
}

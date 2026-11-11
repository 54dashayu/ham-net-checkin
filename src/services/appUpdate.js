export const UPDATE_URL = 'https://fmo.bh1jss.net/checkin/desktop-latest.json'

export function isNewerVersion(latest, current) {
  const parse = value => /^\d+\.\d+\.\d+$/.test(value) ? value.split('.').map(Number) : null
  const a = parse(latest), b = parse(current)
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i]
  }
  return false
}

export async function fetchAppUpdate(current) {
  const response = await fetch(UPDATE_URL, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error('暂时无法检查更新')
  const value = await response.json()
  if (!isNewerVersion(value.version, current)) return null
  const url = new URL(value.downloadPage)
  if (url.protocol !== 'https:' || !['bh1jss.net', 'fmo.bh1jss.net', 'app.bh1jss.net'].includes(url.hostname)) throw new Error('更新地址无效')
  return { version: value.displayVersion || value.version, downloadPage: url.href }
}

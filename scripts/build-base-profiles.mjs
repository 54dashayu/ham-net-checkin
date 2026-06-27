import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sources = [
  path.join(rootDir, 'references/original-windows-tool/M TG46001.db3'),
  path.join(rootDir, 'references/original-windows-tool/M YSF C4FM.db3')
]
const outputFile = path.join(rootDir, 'data/profiles/base-profiles.json')
const distOutputFile = path.join(rootDir, 'dist/data/profiles/base-profiles.json')

const normalizeCallsign = (value) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')

const normalizeText = (value) => String(value || '').trim().replace(/\s+/g, ' ')
const isValidCallsign = (callsign) => /^[A-Z0-9/]{3,20}$/.test(callsign)

const uniquePush = (target, value, limit = 24) => {
  const normalized = normalizeText(value)
  if (!normalized || target.includes(normalized)) return
  target.push(normalized)
  if (target.length > limit) target.length = limit
}

const sqliteJson = (dbFile, sql) => {
  const text = execFileSync('sqlite3', ['-json', dbFile, sql], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024
  })
  return JSON.parse(text || '[]')
}

const profileMap = new Map()
const sourceStats = []
const rejectedCallsigns = new Map()

const rejectCallsign = (source, callsign) => {
  const normalized = normalizeCallsign(callsign)
  if (!normalized) return
  const item = rejectedCallsigns.get(normalized) || { callsign: normalized, sources: new Set() }
  item.sources.add(path.basename(source))
  rejectedCallsigns.set(normalized, item)
}

const ensureProfile = (callsign, source) => {
  const normalized = normalizeCallsign(callsign)
  if (!normalized) return null
  if (!isValidCallsign(normalized)) {
    rejectCallsign(source, normalized)
    return null
  }
  if (!profileMap.has(normalized)) {
    profileMap.set(normalized, {
      callsign: normalized,
      qth: '',
      device: '',
      power: '',
      mode: '',
      signal: '',
      remarks: '',
      lastCheckinAt: '',
      updatedAt: new Date().toISOString(),
      history: {
        qth: [],
        device: [],
        power: [],
        mode: [],
        signal: []
      }
    })
  }
  return profileMap.get(normalized)
}

for (const source of sources) {
  const qsoRows = sqliteJson(
    source,
    `select ID,callsign,qth,rig as device,power,modal as mode,rst,rst1,qsotime
       from qsolog
      where callsign is not null and trim(callsign) <> ''
      order by ID desc`
  )
  const qthRows = sqliteJson(
    source,
    `select callsign,qth
       from qth
      where callsign is not null and trim(callsign) <> ''`
  )

  for (const row of qsoRows) {
    const profile = ensureProfile(row.callsign, source)
    if (!profile) continue
    const signal = row.rst || row.rst1 ? `RX ${row.rst || '-'} / TX ${row.rst1 || '-'}` : ''
    uniquePush(profile.history.qth, row.qth)
    uniquePush(profile.history.device, row.device)
    uniquePush(profile.history.power, row.power)
    uniquePush(profile.history.mode, row.mode)
    uniquePush(profile.history.signal, signal)
    if (!profile.qth) profile.qth = profile.history.qth[0] || ''
    if (!profile.device) profile.device = profile.history.device[0] || ''
    if (!profile.power) profile.power = profile.history.power[0] || ''
    if (!profile.mode) profile.mode = profile.history.mode[0] || ''
    if (!profile.signal) profile.signal = profile.history.signal[0] || ''
    if (!profile.lastCheckinAt) profile.lastCheckinAt = row.qsotime || ''
  }

  for (const row of qthRows) {
    const profile = ensureProfile(row.callsign, source)
    if (!profile) continue
    uniquePush(profile.history.qth, row.qth)
    if (!profile.qth) profile.qth = profile.history.qth[0] || ''
  }

  sourceStats.push({
    file: path.basename(source),
    qsoRows: qsoRows.length,
    qthRows: qthRows.length
  })
}

const profiles = [...profileMap.values()].sort((a, b) => a.callsign.localeCompare(b.callsign))
const quality = {
  fieldCoverage: Object.fromEntries(
    ['qth', 'device', 'power', 'mode', 'signal'].map((key) => [
      key,
      profiles.filter((profile) => String(profile[key] || '').trim()).length
    ])
  ),
  rejectedCallsigns: [...rejectedCallsigns.values()]
    .map((item) => ({
      callsign: item.callsign,
      sources: [...item.sources].sort()
    }))
    .sort((a, b) => a.callsign.localeCompare(b.callsign))
}
const payload = {
  generatedAt: new Date().toISOString(),
  sourceStats,
  quality,
  count: profiles.length,
  profiles
}

fs.mkdirSync(path.dirname(outputFile), { recursive: true })
fs.writeFileSync(outputFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
if (fs.existsSync(path.join(rootDir, 'dist'))) {
  fs.mkdirSync(path.dirname(distOutputFile), { recursive: true })
  fs.copyFileSync(outputFile, distOutputFile)
}
console.log(`Wrote ${profiles.length} base profiles to ${outputFile}`)
if (quality.rejectedCallsigns.length) {
  console.log(`Rejected ${quality.rejectedCallsigns.length} invalid callsigns`)
}

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataFile = path.join(rootDir, 'data/profiles/base-profiles.json')
const payload = JSON.parse(fs.readFileSync(dataFile, 'utf8'))
const profiles = Array.isArray(payload.profiles) ? payload.profiles : []
const fields = ['qth', 'device', 'antenna', 'power', 'mode', 'signal']

const normalizeCallsign = (value) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')

const historyValues = (profile, field) =>
  Array.isArray(profile.history?.[field]) ? profile.history[field].filter(Boolean) : []

const fieldCoverage = Object.fromEntries(
  fields.map((field) => [
    field,
    profiles.filter((profile) => String(profile[field] || '').trim() || historyValues(profile, field).length).length
  ])
)

const invalidCallsigns = profiles
  .map((profile) => normalizeCallsign(profile.callsign))
  .filter((callsign) => callsign && !/^[A-Z0-9/]{3,20}$/.test(callsign))

const duplicateCallsigns = [
  ...profiles
    .map((profile) => normalizeCallsign(profile.callsign))
    .filter(Boolean)
    .reduce((map, callsign) => map.set(callsign, (map.get(callsign) || 0) + 1), new Map())
]
  .filter(([, count]) => count > 1)
  .map(([callsign, count]) => ({ callsign, count }))

const sparseProfiles = profiles
  .map((profile) => {
    const filledFields = fields.filter(
      (field) => String(profile[field] || '').trim() || historyValues(profile, field).length
    )
    return {
      callsign: normalizeCallsign(profile.callsign),
      filled: filledFields.length,
      missing: fields.filter((field) => !filledFields.includes(field))
    }
  })
  .filter((profile) => profile.callsign && profile.filled <= 1)

const percent = (count) => (profiles.length ? `${((count / profiles.length) * 100).toFixed(1)}%` : '0.0%')
const printSample = (title, rows, formatter = (item) => String(item)) => {
  console.log(`\n${title}: ${rows.length}`)
  rows.slice(0, 20).forEach((item) => console.log(`  - ${formatter(item)}`))
  if (rows.length > 20) console.log(`  ... and ${rows.length - 20} more`)
}

console.log(`Base profile audit: ${dataFile}`)
console.log(`Generated at: ${payload.generatedAt || '-'}`)
console.log(`Profiles: ${profiles.length}`)
console.log(`File size: ${(fs.statSync(dataFile).size / 1024 / 1024).toFixed(2)} MB`)
console.log('\nField coverage:')
fields.forEach((field) => {
  console.log(`  ${field}: ${fieldCoverage[field]} (${percent(fieldCoverage[field])})`)
})

printSample('Invalid callsigns', invalidCallsigns)
printSample('Duplicate callsigns', duplicateCallsigns, (item) => `${item.callsign} x${item.count}`)
printSample('Sparse profiles (only one filled field)', sparseProfiles, (item) => `${item.callsign}: missing ${item.missing.join(', ')}`)

if (Array.isArray(payload.quality?.rejectedCallsigns) && payload.quality.rejectedCallsigns.length) {
  printSample(
    'Rejected at build time',
    payload.quality.rejectedCallsigns,
    (item) => `${item.callsign}: ${(item.sources || []).join(', ')}`
  )
}

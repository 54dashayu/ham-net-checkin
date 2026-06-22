import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataFile = path.join(rootDir, 'public/base-profiles.json')
const keyword = process.argv.slice(2).join(' ').trim().toUpperCase()

if (!keyword) {
  console.log('用法: node scripts/search-base-profiles.mjs <呼号或关键字>')
  console.log('示例: node scripts/search-base-profiles.mjs BI1KQL')
  process.exit(0)
}

const payload = JSON.parse(fs.readFileSync(dataFile, 'utf8'))
const profiles = Array.isArray(payload.profiles) ? payload.profiles : []
const matches = profiles
  .filter((profile) => JSON.stringify(profile).toUpperCase().includes(keyword))
  .slice(0, 30)

console.log(`基础库: ${payload.count || profiles.length} 个呼号，命中 ${matches.length} 条，关键字: ${keyword}`)
for (const profile of matches) {
  console.log('\n' + profile.callsign)
  console.log(`  QTH: ${profile.history?.qth?.join(' / ') || profile.qth || '-'}`)
  console.log(`  设备: ${profile.history?.device?.join(' / ') || profile.device || '-'}`)
  console.log(`  功率: ${profile.history?.power?.join(' / ') || profile.power || '-'}`)
  console.log(`  模式: ${profile.history?.mode?.join(' / ') || profile.mode || '-'}`)
  console.log(`  信号: ${profile.history?.signal?.join(' / ') || profile.signal || '-'}`)
}

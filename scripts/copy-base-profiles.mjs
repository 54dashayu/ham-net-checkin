import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceFile = path.join(rootDir, 'data/profiles/base-profiles.json')
const outputFile = path.join(rootDir, 'dist/data/profiles/base-profiles.json')

if (!fs.existsSync(sourceFile)) {
  console.log('Base profiles not found, skipped dist copy')
  process.exit(0)
}

if (!fs.existsSync(path.join(rootDir, 'dist'))) {
  console.log('dist not found, skipped base profiles copy')
  process.exit(0)
}

fs.mkdirSync(path.dirname(outputFile), { recursive: true })
fs.copyFileSync(sourceFile, outputFile)
console.log(`Copied base profiles to ${outputFile}`)

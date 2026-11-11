import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
const [before, after] = process.argv.slice(2)
const relevant = key => /records-v1|activity-config-v1|fmo-config-v1|profile-sync-v1|profiles-v1/.test(key)
function stable(key, value) {
  if (!key.includes('profile-sync-v1')) return value
  const config = JSON.parse(value.toString('utf16le'))
  delete config.lastPulledAt
  delete config.lastPushedAt
  return Buffer.from(JSON.stringify(config))
}
function read(path) {
  const db = new DatabaseSync(path, { readOnly: true })
  const map = new Map(db.prepare('select key,value from ItemTable').all().filter(row => relevant(row.key)).map(row => [row.key,Buffer.from(row.value)]))
  db.close();return map
}
const a=read(before),b=read(after)
let failed=false,total=0
for(const [key,value] of a) {
  let count
  if(key.includes('records-v1')) { try {count=JSON.parse(value.toString('utf16le')).length;total+=count} catch{} }
  const same=b.has(key)&&stable(key,value).equals(stable(key,b.get(key)))
  if(!same)failed=true
  console.log(JSON.stringify({key,unchanged:same,recordCount:count}))
}
console.log(JSON.stringify({allPreserved:!failed,totalRecords:total,authorizationPreserved:[...a.keys()].filter(key=>key.includes('profile-sync-v1')).every(key=>b.has(key)&&stable(key,a.get(key)).equals(stable(key,b.get(key))))}))
if(failed)process.exitCode=1

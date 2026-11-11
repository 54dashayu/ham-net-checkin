import { readFileSync, writeFileSync } from 'node:fs'
import { createHash, createPublicKey, verify } from 'node:crypto'
const version = process.argv[2] || '1.4.3'
if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error('Invalid version')
const displayVersion = version.split('.').map((n, i) => i ? n.padStart(2,'0') : n).join('.')
const root = process.argv[3] || '/var/backups/ham-checkin/20261112-v10403-stage'
const pub = Buffer.from('dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEQ0QzJCNDI2QkJCMzA5MTQKUldRVUNiTzdKclRDMUR0bVFxQlpDVnZsM2RHWkU4MjdVT3VJallOTEJ1MXJrL3B6QlcvQWlGNHgK','base64').toString().trim().split('\n')[1]
const rawKey = Buffer.from(pub,'base64')
const key = createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),rawKey.subarray(10)]),format:'der',type:'spki'})
function check(path) {
  const data = readFileSync(path)
  const text = readFileSync(path+'.sig','utf8').trim()
  const lines = Buffer.from(text,'base64').toString().trim().split('\n')
  const sig = Buffer.from(lines[1],'base64')
  if (!sig.subarray(2,10).equals(rawKey.subarray(2,10))) throw Error('Signature key ID mismatch')
  const payload = sig.subarray(0,2).toString()==='ED' ? createHash('blake2b512').update(data).digest() : data
  if (!verify(null,payload,key,sig.subarray(10))) throw Error('Invalid artifact signature')
  const tampered=Buffer.from(payload);tampered[0]^=1
  if(verify(null,tampered,key,sig.subarray(10))) throw Error('Tamper test failed')
  console.log('Signature and tamper rejection verified:',path.split('/').at(-1))
  return text
}
const mac = `${root}/mac/HAM 台网点名主控台.app.tar.gz`
const win = `${root}/win/HAM-Checkin-${displayVersion}-Win64-Setup.exe`
const manifest={version,notes:'地址查询、更新确认窗口和顶部布局修复',pub_date:new Date().toISOString(),platforms:{'darwin-aarch64':{signature:check(mac),url:`https://fmo.bh1jss.net/checkin/updates/candidate/HAM-Checkin-${displayVersion}-macOS.app.tar.gz`},'windows-x86_64':{signature:check(win),url:`https://fmo.bh1jss.net/checkin/updates/candidate/HAM-Checkin-${displayVersion}-Win64-Setup.exe`}}}
writeFileSync(`${root}/latest.json`,JSON.stringify(manifest,null,2)+'\n')

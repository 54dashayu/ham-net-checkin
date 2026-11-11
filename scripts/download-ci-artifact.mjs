import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
const [id, output] = process.argv.slice(2)
const token = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim()
const headers = execFileSync('curl', ['-4','-sS','--max-time','30','-D','-','-o','/dev/null','--config','-'], { input: `url = "https://api.github.com/repos/54dashayu/ham-net-checkin/actions/artifacts/${id}/zip"\nheader = "Authorization: Bearer ${token}"\n`, encoding:'utf8' })
const url = headers.match(/^location:\s*(.+)$/im)?.[1].trim()
if (!url) throw new Error('Artifact redirect unavailable')
if (process.env.ARTIFACT_HOST) {
  if (!/^\/tmp\/[a-zA-Z0-9_.-]+$/.test(output)) throw new Error('Invalid remote path')
  execFileSync('ssh', [process.env.ARTIFACT_HOST, `curl -4 -fLsS --max-time 90 -o ${output} --config -`], { input:`url = ${JSON.stringify(url)}\n` })
} else execFileSync('curl', ['-4','-fLsS','--max-time','90','-o',output,'--config','-'], { input:`url = ${JSON.stringify(url)}\n` })
console.log('Artifact downloaded')

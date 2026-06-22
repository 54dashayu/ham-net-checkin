import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import packageJson from './package.json' with { type: 'json' }

function splitSocketIoPayload(payload) {
  return String(payload || '')
    .split('\x1e')
    .flatMap((part) => {
      const packets = []
      let rest = part
      while (rest) {
        const lengthMatch = rest.match(/^(\d+):/)
        if (!lengthMatch) {
          packets.push(rest)
          break
        }
        const start = lengthMatch[0].length
        const size = Number(lengthMatch[1])
        packets.push(rest.slice(start, start + size))
        rest = rest.slice(start + size)
      }
      return packets
    })
    .filter(Boolean)
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 9000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

function fetchBrandmeisterLastHeard(talkgroup, seconds = 7) {
  return new Promise((resolve, reject) => {
    const rows = []
    const seen = new Set()
    let settled = false
    const ws = new WebSocket('wss://api.brandmeister.network/lh/socket.io/?EIO=4&transport=websocket')
    const finish = (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        ws.close()
      } catch {
        /* ignore close errors */
      }
      if (error) reject(error)
      else resolve(rows.slice(0, 20))
    }
    const timer = setTimeout(() => finish(), seconds * 1000)

    ws.addEventListener('message', (event) => {
      const packet = String(event.data || '')
      if (packet.startsWith('0')) {
        ws.send('40')
        return
      }
      if (packet === '2') {
        ws.send('3')
        return
      }
      if (packet.startsWith('40')) {
        ws.send(`42["join","dst_${talkgroup}"]`)
        ws.send(
          `42["searchMongo",${JSON.stringify({ query: `DestinationID = ${talkgroup}`, amount: 80 })}]`
        )
        return
      }
      if (!packet.startsWith('42')) return
      let eventPayload
      try {
        eventPayload = JSON.parse(packet.slice(2))
      } catch {
        return
      }
      if (eventPayload?.[0] !== 'mqtt') return
      let call
      try {
        call = JSON.parse(eventPayload?.[1]?.payload || '{}')
      } catch {
        return
      }
      if (String(call.DestinationID || '') !== talkgroup) return
      const key = `${call.SessionID || call.SourceID || call.SourceCall}-${call.Start}-${call.Stop}-${call.Event}`
      if (seen.has(key)) return
      seen.add(key)
      rows.push(call)
      if (rows.length >= 20) finish()
    })
    ws.addEventListener('error', () => finish(new Error('BrandMeister WebSocket failed')))
  })
}

function mmdvmProxyPlugin() {
  return {
    name: 'ham-checkin-dev-proxies',
    configureServer(server) {
      server.middlewares.use('/api/brandmeister/last-heard', async (req, res) => {
        try {
          const requestUrl = new URL(req.url || '', 'http://127.0.0.1')
          const talkgroup = String(requestUrl.searchParams.get('talkgroup') || '').replace(/\D+/g, '')
          const seconds = Math.min(15, Math.max(4, Number(requestUrl.searchParams.get('seconds') || 7)))
          if (!talkgroup) {
            res.statusCode = 400
            res.setHeader('content-type', 'application/json; charset=utf-8')
            res.end(JSON.stringify({ ok: false, error: 'missing talkgroup' }))
            return
          }
          const rows = await fetchBrandmeisterLastHeard(talkgroup, seconds)
          res.statusCode = 200
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.setHeader('access-control-allow-origin', '*')
          res.end(
            JSON.stringify({
              ok: true,
              source: 'brandmeister',
              talkgroup,
              target: `BrandMeister TG${talkgroup}`,
              rows
            })
          )
        } catch (error) {
          res.statusCode = 502
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ ok: false, error: error?.message || 'BrandMeister proxy failed' }))
        }
      })
      server.middlewares.use('/api/brandmeister/device', async (req, res) => {
        try {
          const requestUrl = new URL(req.url || '', 'http://127.0.0.1')
          const id = String(requestUrl.searchParams.get('id') || '').replace(/\D+/g, '')
          if (!id) {
            res.statusCode = 400
            res.setHeader('content-type', 'application/json; charset=utf-8')
            res.end(JSON.stringify({ ok: false, error: 'missing id' }))
            return
          }
          const response = await fetchWithTimeout(
            `https://api.brandmeister.network/v2/device/${id}`,
            { headers: { accept: 'application/json' } },
            8000
          )
          const text = await response.text()
          let device = null
          try {
            device = JSON.parse(text)
          } catch {
            /* BrandMeister may return an HTML error page. */
          }
          res.statusCode = 200
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.setHeader('access-control-allow-origin', '*')
          res.end(JSON.stringify({ ok: true, id, device: response.ok && device ? device : null }))
        } catch (error) {
          res.statusCode = 200
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ ok: true, device: null, error: error?.message || 'BrandMeister device lookup failed' }))
        }
      })
      server.middlewares.use('/mmdvm-proxy', async (req, res) => {
        try {
          const requestUrl = new URL(req.url || '', 'http://127.0.0.1')
          const target = requestUrl.searchParams.get('url')
          if (!target) {
            res.statusCode = 400
            res.end('Missing url')
            return
          }
          const parsed = new URL(target)
          if (!['http:', 'https:'].includes(parsed.protocol)) {
            res.statusCode = 400
            res.end('Unsupported protocol')
            return
          }
          const response = await fetch(parsed)
          const text = await response.text()
          res.statusCode = response.status
          res.setHeader('content-type', response.headers.get('content-type') || 'text/html; charset=utf-8')
          res.setHeader('access-control-allow-origin', '*')
          res.end(text)
        } catch (error) {
          res.statusCode = 502
          res.end(error?.message || 'Proxy failed')
        }
      })
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version)
  },
  plugins: [vue(), mmdvmProxyPlugin()],
})

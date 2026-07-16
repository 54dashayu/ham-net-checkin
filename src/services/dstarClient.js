const verifiedChinaDstarRooms = [
  { reflector: 'XLX004', modules: ['C', 'E'], name: '台州', url: 'http://121.43.36.126/' },
  { reflector: 'XLX055', modules: ['A', 'B', 'C'], name: 'Team Helix', url: 'http://52.80.4.154/dstar/' },
  { reflector: 'XLX355', modules: ['A', 'B', 'C', 'E'], name: '安徽芜湖', url: 'http://223.95.197.217:8551/' },
  { reflector: 'XLX454', modules: ['A', 'B', 'C', 'D'], name: '香港', url: 'http://xlx454.hkham.net/db/' },
  { reflector: 'XLX616', modules: ['A'], name: 'APRNet', url: 'http://xlx616.aivian.org:51300/' },
  { reflector: 'XLXCKG', modules: ['C'], name: '重庆', url: 'http://tg46023.cn:9081/' },
  { reflector: 'XLXNPP', modules: ['B'], name: '山东济南', url: 'http://49.232.24.178/' },
  { reflector: 'XLXPRC', modules: ['A'], name: '佛山', url: 'http://urf.fmrs.cn:73/' }
]

export const getVerifiedChinaDstarRooms = () =>
  verifiedChinaDstarRooms.flatMap((item) =>
    item.modules.map((module) => ({
      ...item,
      module,
      id: `${item.reflector}-${module}`,
      label: `${item.reflector} ${module} · ${item.name} · XRF/DCS兼容入口`
    }))
  )

const textOf = (node) => String(node?.textContent || '').replace(/\s+/g, ' ').trim()

function headerIndex(headers, patterns) {
  return headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)))
}

export function parseDstarDashboard(html, selectedModule = '') {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const rows = []
  let supported = false
  for (const table of doc.querySelectorAll('table')) {
    const tableRows = [...table.querySelectorAll('tr')]
    const headerRow = tableRows.find((row) => {
      const directHeaders = [...row.children].filter((cell) => cell.tagName === 'TH')
      if (directHeaders.length < 3) return false
      const headers = directHeaders.map((cell) => textOf(cell).toLowerCase())
      return (
        headerIndex(headers, [/callsign/, /呼号/]) >= 0 &&
        headerIndex(headers, [/last heard/, /最后通联/, /最后呼叫/]) >= 0 &&
        headerIndex(headers, [/via/, /peer/, /gateway/, /网关/, /经由/, /节点/]) >= 0
      )
    })
    if (!headerRow) continue
    const headers = [...headerRow.cells].map((cell) => textOf(cell).toLowerCase())
    const callsignIndex = headerIndex(headers, [/callsign/, /呼号/])
    const timeIndex = headerIndex(headers, [/last heard/, /最后通联/, /最后呼叫/])
    const viaIndex = headerIndex(headers, [/via/, /peer/, /gateway/, /网关/, /经由/, /节点/])
    if (callsignIndex < 0 || timeIndex < 0 || viaIndex < 0) continue
    supported = true
    const suffixIndex = headerIndex(headers, [/suffix/, /后缀/, /语音模式/])
    const explicitModuleIndex = headerIndex(headers, [/^module$/, /模块/])
    for (const row of tableRows.slice(tableRows.indexOf(headerRow) + 1)) {
      const cells = [...row.cells]
      const callsign = textOf(cells[callsignIndex]).split(/\s+/)[0].toUpperCase()
      if (!/^[A-Z0-9]{3,}$/.test(callsign)) continue
      const lastCell = textOf(cells.at(-1)).toUpperCase()
      const module = (
        explicitModuleIndex >= 0 ? textOf(cells[explicitModuleIndex]) : /^[A-Z]$/.test(lastCell) ? lastCell : ''
      ).toUpperCase()
      if (selectedModule && module && module !== selectedModule) continue
      rows.push({
        callsign,
        suffix: suffixIndex >= 0 ? textOf(cells[suffixIndex]) : '',
        via: textOf(cells[viaIndex]),
        timeText: textOf(cells[timeIndex]),
        module,
        isSpeaking: Boolean(cells.at(-1)?.querySelector('img[src*="tx"], img[src*="speaker"]')),
        rawText: cells.map(textOf).join(' | ')
      })
    }
  }
  return { supported, rows: rows.slice(0, 30) }
}

async function fetchText(url, timeoutMs = 9000) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`/mmdvm-proxy?url=${encodeURIComponent(url)}`, {
      cache: 'no-store',
      signal: controller.signal
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.text()
  } finally {
    window.clearTimeout(timer)
  }
}

const appBasePath = () => (window.location.pathname.startsWith('/checkin') ? '/checkin' : '')

export async function fetchDstarLastHeard(room) {
  if (!room?.url) throw new Error('该 D-Star 房间没有 Dashboard 地址')
  const response = await fetch(
    `${appBasePath()}/api/dstar/last-heard?url=${encodeURIComponent(room.url)}&module=${encodeURIComponent(room.module || '')}`,
    { cache: 'no-store' }
  )
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `D-Star Dashboard HTTP ${response.status}`)
  }
  return {
    target: `${room.reflector} ${room.module}`,
    rows: payload.rows || []
  }
}

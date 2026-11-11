const toHalfWidth = (value) =>
  String(value || '')
    .replace(/[\uff01-\uff5e]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ')

const CHINESE_CALLSIGN_PATTERN = /B[A-Z]\d[A-Z]{2,3}/g
const GENERAL_CALLSIGN_PATTERN = /[A-Z0-9]{1,3}\d[A-Z]{1,4}/g

const findMatches = (text, pattern) => [...text.matchAll(pattern)].map((match) => match[0])

export function inferMonitoredMode(value) {
  const text = toHalfWidth(value).trim().toUpperCase()
  if (/^M\./.test(text)) return 'M5（ESP32）'
  if (/^P\./.test(text)) return 'Passport'
  if (/\.R$/.test(text)) return 'RedDV'
  return ''
}

export function canonicalizeMonitoredCallsign(value) {
  const text = toHalfWidth(value).trim().toUpperCase()
  if (!text) return ''

  const chineseMatches = findMatches(text, CHINESE_CALLSIGN_PATTERN)
  if (chineseMatches.length) return chineseMatches[0]

  const generalMatches = findMatches(text, GENERAL_CALLSIGN_PATTERN)
  return generalMatches[0] || ''
}


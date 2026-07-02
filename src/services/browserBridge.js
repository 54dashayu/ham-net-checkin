const PAGE_SOURCE = 'ham-checkin-page'
const BRIDGE_SOURCE = 'ham-checkin-local-bridge'
const pending = new Map()

function nextId(prefix = 'bridge') {
  if (window.crypto?.randomUUID) return `${prefix}-${window.crypto.randomUUID()}`
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function requestBridge(type, payload = {}, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const id = nextId(type)
    const timer = window.setTimeout(() => {
      pending.delete(id)
      reject(new Error('HAM local bridge timeout'))
    }, timeoutMs)
    pending.set(id, { resolve, reject, timer })
    window.postMessage({ source: PAGE_SOURCE, id, type, ...payload }, window.location.origin)
  })
}

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return
  const message = event.data || {}
  if (message.source !== BRIDGE_SOURCE || !message.id) return
  const request = pending.get(message.id)
  if (!request) return
  pending.delete(message.id)
  window.clearTimeout(request.timer)
  if (message.ok === false) request.reject(new Error(message.error || 'HAM local bridge failed'))
  else request.resolve(message)
})

export async function detectBrowserBridge() {
  try {
    const response = await requestBridge('ping', {}, 1200)
    return Boolean(response?.ok)
  } catch {
    return false
  }
}

export async function fetchTextViaBrowserBridge(url, timeoutMs = 4500) {
  const response = await requestBridge('fetch', { url, timeoutMs }, timeoutMs + 800)
  if (response.status && response.status >= 400) {
    throw new Error(response.text || `HTTP ${response.status}`)
  }
  return String(response.text || '')
}

export class BrowserBridgeWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  constructor(url) {
    this.url = url
    this.id = nextId('ws')
    this.readyState = BrowserBridgeWebSocket.CONNECTING
    this.onopen = null
    this.onmessage = null
    this.onerror = null
    this.onclose = null
    this.handleWindowMessage = this.handleWindowMessage.bind(this)
    window.addEventListener('message', this.handleWindowMessage)
    window.postMessage({ source: PAGE_SOURCE, id: this.id, type: 'ws-open', url }, window.location.origin)
  }

  handleWindowMessage(event) {
    if (event.source !== window || event.origin !== window.location.origin) return
    const message = event.data || {}
    if (message.source !== BRIDGE_SOURCE || message.id !== this.id || message.type !== 'ws-event') return
    if (message.event === 'open') {
      this.readyState = BrowserBridgeWebSocket.OPEN
      this.onopen?.()
      return
    }
    if (message.event === 'message') {
      this.onmessage?.({ data: message.data })
      return
    }
    if (message.event === 'error') {
      this.onerror?.(new Error(message.error || 'Bridge WebSocket error'))
      return
    }
    if (message.event === 'close') {
      this.readyState = BrowserBridgeWebSocket.CLOSED
      window.removeEventListener('message', this.handleWindowMessage)
      this.onclose?.()
    }
  }

  send(data) {
    if (this.readyState !== BrowserBridgeWebSocket.OPEN) {
      throw new Error('Bridge WebSocket is not open')
    }
    window.postMessage({ source: PAGE_SOURCE, id: this.id, type: 'ws-send', data }, window.location.origin)
  }

  close() {
    if (this.readyState === BrowserBridgeWebSocket.CLOSED) return
    this.readyState = BrowserBridgeWebSocket.CLOSING
    window.postMessage({ source: PAGE_SOURCE, id: this.id, type: 'ws-close' }, window.location.origin)
    window.removeEventListener('message', this.handleWindowMessage)
    this.readyState = BrowserBridgeWebSocket.CLOSED
    this.onclose?.()
  }
}

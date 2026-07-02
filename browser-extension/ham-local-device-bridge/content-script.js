const PAGE_SOURCE = 'ham-checkin-page'
const BRIDGE_SOURCE = 'ham-checkin-local-bridge'
const ports = new Map()

function postToPage(id, type, payload = {}) {
  window.postMessage({ source: BRIDGE_SOURCE, id, type, ...payload }, window.location.origin)
}

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return
  const message = event.data || {}
  if (message.source !== PAGE_SOURCE || !message.id) return

  if (message.type === 'ping') {
    chrome.runtime.sendMessage({ type: 'ping' }, (response) => {
      postToPage(message.id, 'pong', response || { ok: false })
    })
    return
  }

  if (message.type === 'fetch') {
    chrome.runtime.sendMessage(
      {
        type: 'fetch',
        url: message.url,
        timeoutMs: message.timeoutMs
      },
      (response) => {
        postToPage(message.id, 'fetch-result', response || { ok: false, error: chrome.runtime.lastError?.message || 'bridge unavailable' })
      }
    )
    return
  }

  if (message.type === 'ws-open') {
    const port = chrome.runtime.connect({ name: 'ws' })
    ports.set(message.id, port)
    port.onMessage.addListener((payload) => {
      postToPage(message.id, 'ws-event', payload)
    })
    port.onDisconnect.addListener(() => {
      ports.delete(message.id)
      postToPage(message.id, 'ws-event', { event: 'close' })
    })
    port.postMessage({ type: 'open', url: message.url })
    return
  }

  if (message.type === 'ws-send') {
    ports.get(message.id)?.postMessage({ type: 'send', data: message.data })
    return
  }

  if (message.type === 'ws-close') {
    ports.get(message.id)?.postMessage({ type: 'close' })
    ports.delete(message.id)
  }
})

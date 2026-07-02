const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./
]

function isAllowedLocalTarget(rawUrl) {
  let url
  try {
    url = new URL(String(rawUrl || ''))
  } catch {
    return false
  }
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) return false
  const hostname = url.hostname.toLowerCase()
  return hostname.endsWith('.local') || PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname))
}

function jsonResponse(ok, extra = {}) {
  return { ok, bridge: 'ham-local-device-bridge', version: '1.01.1', ...extra }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'ping') {
    sendResponse(jsonResponse(true))
    return false
  }

  if (message?.type === 'fetch') {
    ;(async () => {
      const url = String(message.url || '')
      if (!isAllowedLocalTarget(url)) {
        sendResponse(jsonResponse(false, { error: 'Only local network targets are allowed.' }))
        return
      }
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), Number(message.timeoutMs || 4500))
      try {
        const response = await fetch(url, {
          cache: 'no-store',
          headers: { accept: 'application/json,text/html,text/plain,*/*' },
          signal: controller.signal
        })
        const text = await response.text()
        sendResponse(jsonResponse(true, {
          status: response.status,
          contentType: response.headers.get('content-type') || '',
          text
        }))
      } catch (error) {
        sendResponse(jsonResponse(false, { error: error?.message || 'Local request failed.' }))
      } finally {
        clearTimeout(timer)
      }
    })()
    return true
  }

  sendResponse(jsonResponse(false, { error: 'Unsupported bridge message.' }))
  return false
})

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'ws') return
  let socket = null

  const closeSocket = () => {
    if (!socket) return
    try {
      socket.close()
    } catch {
      /* ignore */
    }
    socket = null
  }

  port.onDisconnect.addListener(closeSocket)
  port.onMessage.addListener((message) => {
    if (message?.type === 'open') {
      const url = String(message.url || '')
      if (!isAllowedLocalTarget(url) || !/^wss?:\/\//i.test(url)) {
        port.postMessage({ event: 'error', error: 'Only local WebSocket targets are allowed.' })
        port.postMessage({ event: 'close' })
        return
      }
      closeSocket()
      try {
        socket = new WebSocket(url)
      } catch (error) {
        port.postMessage({ event: 'error', error: error?.message || 'WebSocket create failed.' })
        return
      }
      socket.onopen = () => port.postMessage({ event: 'open' })
      socket.onmessage = (event) => port.postMessage({ event: 'message', data: event.data })
      socket.onerror = () => port.postMessage({ event: 'error', error: 'WebSocket error.' })
      socket.onclose = () => port.postMessage({ event: 'close' })
      return
    }

    if (message?.type === 'send') {
      if (socket?.readyState === WebSocket.OPEN) socket.send(String(message.data ?? ''))
      return
    }

    if (message?.type === 'close') {
      closeSocket()
    }
  })
})

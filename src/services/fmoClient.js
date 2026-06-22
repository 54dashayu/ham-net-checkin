export function normalizeHost(address) {
  if (!address) return ''
  let value = String(address)
    .trim()
    .replace(/：/g, ':')
    .replace(/^(https?|wss?):?\/\//i, '')
    .replace(/\/+$/, '')

  value = value.replace(/[?#].*$/, '')
  value = value.replace(/\/(ws|events)\/?$/i, '')
  value = value.replace(/\/.*$/, '')
  return value
}

export function isValidHostAddress(address) {
  if (!address) return false

  let host = normalizeHost(address)
  let port = null
  const portMatch = host.match(/^(.+):(\d+)$/)

  if (portMatch) {
    host = portMatch[1]
    port = Number.parseInt(portMatch[2], 10)
    if (port < 1 || port > 65535) return false
  }

  const ipv4Regex =
    /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
  if (ipv4Regex.test(host)) return true

  return (
    host.length <= 253 &&
    !/\s/.test(host) &&
    !/[/?#@]/.test(host) &&
    /^[a-zA-Z0-9._-]+$/.test(host) &&
    /^[a-zA-Z0-9]/.test(host) &&
    /[a-zA-Z0-9]$/.test(host)
  )
}

export function getProtocolFromAddress(address, fallback = 'ws') {
  const value = String(address || '').trim()
  if (/^(wss|https):\/\//i.test(value)) return 'wss'
  if (/^(ws|http):\/\//i.test(value)) return 'ws'
  return fallback === 'wss' ? 'wss' : 'ws'
}

export function buildWebSocketUrl(host, protocol = 'ws', path = '/ws') {
  const normalizedHost = normalizeHost(host)
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const wsProtocol = protocol === 'wss' ? 'wss' : 'ws'
  return `${wsProtocol}://${normalizedHost}${normalizedPath}`
}

function splitSocketMessages(raw) {
  return String(raw)
    .split('}{')
    .map((message, index, array) => {
      if (array.length === 1) return message
      if (index === 0) return `${message}}`
      if (index === array.length - 1) return `{${message}`
      return `{${message}}`
    })
}

export function getAddressWarning(host, protocol = 'ws') {
  const normalizedHost = normalizeHost(host).replace(/:\d+$/, '').toLowerCase()
  if (normalizedHost === 'fmo.local' || normalizedHost.endsWith('.local')) {
    return 'Windows 环境可能无法解析 .local 地址，建议填写 FMO 设备的局域网 IP。'
  }
  if (window.location?.protocol === 'https:' && protocol === 'ws') {
    return 'HTTPS 页面不能连接普通 ws:// FMO，请使用本地版或改用 wss://。'
  }
  return ''
}

export class FmoClient {
  constructor({ host, protocol = 'ws' }) {
    this.host = normalizeHost(host)
    this.protocol = protocol === 'wss' ? 'wss' : 'ws'
    this.socket = null
    this.connectPromise = null
    this.pending = new Map()
    this.timers = new Map()
  }

  async connect() {
    if (this.socket?.readyState === WebSocket.OPEN) return
    if (this.socket?.readyState === WebSocket.CONNECTING) return this.connectPromise

    const wsUrl = buildWebSocketUrl(this.host, this.protocol)
    this.connectPromise = new Promise((resolve, reject) => {
      try {
        this.socket = new WebSocket(wsUrl)
      } catch (error) {
        this.connectPromise = null
        reject(error)
        return
      }

      const timeout = window.setTimeout(() => {
        this.connectPromise = null
        this.close()
        reject(new Error(`连接超时：${wsUrl}`))
      }, 10000)

      this.socket.onopen = () => {
        window.clearTimeout(timeout)
        this.connectPromise = null
        resolve()
      }

      this.socket.onmessage = (event) => {
        this.handleMessage(event.data)
      }

      this.socket.onerror = () => {
        window.clearTimeout(timeout)
        this.connectPromise = null
        reject(new Error(`WebSocket 连接失败：${wsUrl}`))
      }

      this.socket.onclose = () => {
        window.clearTimeout(timeout)
        this.connectPromise = null
      }
    })

    return this.connectPromise
  }

  handleMessage(raw) {
    const messages = splitSocketMessages(raw)

    for (const messageText of messages) {
      try {
        this.handleParsedMessage(JSON.parse(messageText))
      } catch {
        /* ignore malformed frame */
      }
    }
  }

  handleParsedMessage(message) {
    const { type, subType, code, data } = message
    let requestSubType = String(subType || '').replace('Response', '')
    if (type === 'station' && requestSubType === 'getList') requestSubType = 'getListRange'
    const key = `${type}:${requestSubType}`

    const request = this.pending.get(key)
    if (!request) return

    this.pending.delete(key)
    window.clearTimeout(this.timers.get(key))
    this.timers.delete(key)

    if (code === 0 || code === undefined) {
      request.resolve(data)
    } else {
      request.reject(new Error(`FMO API Error: code ${code}`))
    }
  }

  async request(type, subType, data = {}, timeoutMs = 12000) {
    await this.connect()
    const key = `${type}:${subType}`
    return new Promise((resolve, reject) => {
      this.pending.set(key, { resolve, reject })
      this.socket.send(JSON.stringify({ type, subType, data }))
      const timer = window.setTimeout(() => {
        this.pending.delete(key)
        this.timers.delete(key)
        reject(new Error(`请求超时：${key}`))
      }, timeoutMs)
      this.timers.set(key, timer)
    })
  }

  getCurrentStation() {
    return this.request('station', 'getCurrent')
  }

  getQsoList(page = 0, pageSize = 20, fromCallsign = '') {
    const data = { page, pageSize }
    if (fromCallsign) data.fromCallsign = fromCallsign
    return this.request('qso', 'getList', data, 18000)
  }

  close() {
    if (this.socket) {
      try {
        if (
          this.socket.readyState === WebSocket.OPEN ||
          this.socket.readyState === WebSocket.CONNECTING
        ) {
          this.socket.close()
        }
      } catch {
        /* ignore */
      }
      this.socket = null
    }
    this.pending.clear()
    this.timers.forEach((timer) => window.clearTimeout(timer))
    this.timers.clear()
  }
}

export class FmoEventsClient {
  constructor({ host, protocol = 'ws', onEvent = null, onStatus = null, reconnectMs = 5000 }) {
    this.host = normalizeHost(host)
    this.protocol = protocol === 'wss' ? 'wss' : 'ws'
    this.onEvent = onEvent
    this.onStatus = onStatus
    this.reconnectMs = reconnectMs
    this.socket = null
    this.connectPromise = null
    this.reconnectTimer = null
    this.manualClose = false
  }

  async connect() {
    if (this.socket?.readyState === WebSocket.OPEN) return
    if (this.socket?.readyState === WebSocket.CONNECTING) return this.connectPromise

    this.manualClose = false
    const wsUrl = buildWebSocketUrl(this.host, this.protocol, '/events')
    this.connectPromise = new Promise((resolve, reject) => {
      try {
        this.socket = new WebSocket(wsUrl)
      } catch (error) {
        this.connectPromise = null
        reject(error)
        return
      }

      const timeout = window.setTimeout(() => {
        this.connectPromise = null
        this.close()
        reject(new Error(`实时事件连接超时：${wsUrl}`))
      }, 10000)

      this.socket.onopen = () => {
        window.clearTimeout(timeout)
        this.connectPromise = null
        this.emitStatus('connected')
        resolve()
      }

      this.socket.onmessage = (event) => {
        this.handleMessage(event.data)
      }

      this.socket.onerror = () => {
        window.clearTimeout(timeout)
        const isOpening = !!this.connectPromise
        this.connectPromise = null
        if (isOpening) reject(new Error(`实时事件连接失败：${wsUrl}`))
      }

      this.socket.onclose = () => {
        window.clearTimeout(timeout)
        this.connectPromise = null
        this.socket = null
        if (this.manualClose) {
          this.emitStatus('disconnected')
          return
        }
        this.emitStatus('reconnecting')
        this.scheduleReconnect()
      }
    })

    return this.connectPromise
  }

  handleMessage(raw) {
    for (const messageText of splitSocketMessages(raw)) {
      try {
        const message = JSON.parse(messageText)
        if (this.onEvent) this.onEvent(message)
      } catch {
        /* ignore malformed frame */
      }
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      if (!this.manualClose) this.connect().catch(() => this.scheduleReconnect())
    }, this.reconnectMs)
  }

  emitStatus(status) {
    if (!this.onStatus) return
    try {
      this.onStatus(status)
    } catch {
      /* ignore listener error */
    }
  }

  close() {
    this.manualClose = true
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.socket) {
      try {
        if (
          this.socket.readyState === WebSocket.OPEN ||
          this.socket.readyState === WebSocket.CONNECTING
        ) {
          this.socket.close()
        }
      } catch {
        /* ignore */
      }
      this.socket = null
    }
    this.connectPromise = null
  }
}

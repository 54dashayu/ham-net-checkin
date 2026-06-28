const { app, BrowserWindow, shell } = require('electron')
const path = require('node:path')

const rootDir = path.resolve(__dirname, '..')

let localServer

app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('disable-software-rasterizer')

async function createWindow() {
  process.env.HAM_CHECKIN_DATA_DIR ||= path.join(app.getPath('userData'), 'data')
  process.env.HAM_CHECKIN_SESSION_SECRET ||= 'desktop-local-session'

  const { startServer } = await import('../server/index.mjs')
  try {
    localServer = await startServer({ port: 37173 })
  } catch (error) {
    if (error?.code !== 'EADDRINUSE') throw error
    localServer = await startServer({ port: 0 })
  }
  const address = localServer.address()
  const port = typeof address === 'object' && address ? address.port : 37173

  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    title: 'HAM 台网点名主控台',
    show: true,
    icon: path.join(rootDir, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`http://127.0.0.1:${port}`)) {
      return { action: 'allow' }
    }
    shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    const html = [
      '<!doctype html><meta charset="utf-8" />',
      '<body style="font-family: Microsoft YaHei, Arial; padding: 24px; line-height: 1.7;">',
      '<h2>HAM 台网点名主控台启动失败</h2>',
      `<p>本地页面加载失败：${errorCode} ${String(errorDescription || '')}</p>`,
      `<p>地址：${String(validatedURL || '')}</p>`,
      '<p>请关闭任务管理器中的旧进程后重新打开；如仍失败，请反馈此错误信息。</p>',
      '</body>'
    ].join('')
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch(() => {})
    win.show()
  })
  try {
    await win.loadURL(`http://127.0.0.1:${port}/`)
    win.show()
    win.focus()
  } catch (error) {
    win.show()
    throw error
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  localServer?.close()
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

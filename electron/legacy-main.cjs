const { app, BrowserWindow, shell } = require('electron')
const path = require('node:path')

const rootDir = path.resolve(__dirname, '..')

let localServer

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
    show: false,
    icon: path.join(rootDir, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.once('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`http://127.0.0.1:${port}`)) {
      return { action: 'allow' }
    }
    shell.openExternal(url)
    return { action: 'deny' }
  })
  await win.loadURL(`http://127.0.0.1:${port}/`)
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  localServer?.close()
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

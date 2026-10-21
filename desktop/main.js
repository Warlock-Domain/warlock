// Casca desktop (PoC): janela própria que abre o jogo no ar, sem menu do Electron
const { app, BrowserWindow, Menu } = require('electron')

Menu.setApplicationMenu(null)

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Warlock Wars',
    backgroundColor: '#0a0406',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  win.maximize()
  win.loadURL('https://warlock.fernandorffdev.com')
})

app.on('window-all-closed', () => app.quit())

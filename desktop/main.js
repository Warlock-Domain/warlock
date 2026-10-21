// Casca desktop (PoC): janela própria que abre o jogo no ar, sem menu do Electron
const { app, BrowserWindow, Menu, shell } = require('electron')

Menu.setApplicationMenu(null)

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Warlock Wars',
    backgroundColor: '#0a0406',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  // link para fora (GitHub, créditos) abre no navegador do sistema, não dentro da janela do jogo
  win.webContents.setWindowOpenHandler(({ url }) => (shell.openExternal(url), { action: 'deny' }))
  win.maximize()
  win.loadURL('https://warlock.fernandorffdev.com')
})

app.on('window-all-closed', () => app.quit())

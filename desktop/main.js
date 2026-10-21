// Casca desktop (PoC): janela própria que abre o jogo no ar, sem menu do Electron
const { app, BrowserWindow, Menu, shell } = require('electron')

const GAME = 'https://warlock.fernandorffdev.com'

Menu.setApplicationMenu(null)

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Warlock Wars',
    backgroundColor: '#0a0406',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  // link para fora (GitHub, créditos) abre no navegador do sistema, não dentro da janela do jogo;
  // só https: file:, smb: ou protocolo registrado no Windows nunca chegam ao sistema
  const external = (url) => { if (url.startsWith('https://')) shell.openExternal(url) }
  win.webContents.setWindowOpenHandler(({ url }) => (external(url), { action: 'deny' }))
  win.webContents.on('will-navigate', (e, url) => {
    if (new URL(url).origin !== GAME) (e.preventDefault(), external(url))
  })
  win.maximize()
  win.loadURL(GAME)
})

app.on('window-all-closed', () => app.quit())

const { app, BrowserWindow, ipcMain, dialog, Menu, shell, nativeTheme } = require('electron')
const { autoUpdater } = require('electron-updater')
const log  = require('electron-log')
const path = require('path')
const fs   = require('fs')
const os   = require('os')

const isDev  = !app.isPackaged
const isMac  = process.platform === 'darwin'
const isWin  = process.platform === 'win32'

const APP_NAME = 'Komplizen Protokolle'

// ── Data files ───────────────────────────────────────────────────────────────────
function dataFile()     { return path.join(app.getPath('userData'), 'protocols.json') }
function projectsFile() { return path.join(app.getPath('userData'), 'projects.json')  }

function readData() {
  const f = dataFile()
  if (!fs.existsSync(f)) return []
  try { return JSON.parse(fs.readFileSync(f, 'utf-8')) } catch { return [] }
}
function writeData(protocols) {
  fs.writeFileSync(dataFile(), JSON.stringify(protocols, null, 2), 'utf-8')
}

function readProjects() {
  const f = projectsFile()
  if (!fs.existsSync(f)) return []
  try { return JSON.parse(fs.readFileSync(f, 'utf-8')) } catch { return [] }
}
function writeProjects(projects) {
  fs.writeFileSync(projectsFile(), JSON.stringify(projects, null, 2), 'utf-8')
}

// ── Auto-Updater ────────────────────────────────────────────────────────────────
log.transports.file.level = 'info'
autoUpdater.logger         = log
autoUpdater.autoDownload   = true

function setupAutoUpdater(win) {
  if (isDev) return

  const cfgPath = path.join(app.getPath('userData'), 'update-config.json')
  if (fs.existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
      if (cfg.url) autoUpdater.setFeedURL({ provider: 'generic', url: cfg.url })
    } catch (e) { log.warn('update-config.json ungültig:', e.message) }
  }

  autoUpdater.on('update-available',  (info) => win.webContents.send('update:available',  info))
  autoUpdater.on('update-downloaded', (info) => win.webContents.send('update:downloaded', info))
  autoUpdater.on('error', (err) => log.error('Updater-Fehler:', err.message))

  setTimeout(() => autoUpdater.checkForUpdates(), 10_000)
  setInterval(() => autoUpdater.checkForUpdates(), 4 * 60 * 60 * 1000)
}

// ── Window ───────────────────────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width:     1360,
    height:    900,
    minWidth:  820,
    minHeight: 600,
    title:     APP_NAME,

    titleBarStyle:        isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 16, y: 16 } : undefined,
    vibrancy:             isMac ? 'sidebar' : undefined,

    webPreferences: {
      preload:                    path.join(__dirname, 'preload.js'),
      contextIsolation:           true,
      nodeIntegration:            false,
      sandbox:                    true,
      webSecurity:                true,
      allowRunningInsecureContent: false,
      devTools:                   isDev,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  if (isMac) nativeTheme.themeSource = 'system'

  win.webContents.on('will-navigate', (event, url) => {
    const allowed = isDev
      ? url.startsWith('http://localhost:5173')
      : url.startsWith('file://')
    if (!allowed) event.preventDefault()
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  buildMenu(win)
  setupAutoUpdater(win)
  return win
}

// ── App menu ─────────────────────────────────────────────────────────────────────
function buildMenu(win) {
  const send = (channel) => () => win.webContents.send(channel)

  const fileMenu = {
    label: 'Datei',
    submenu: [
      { label: 'Protokoll importieren…',       click: send('menu:import'),       accelerator: 'CmdOrCtrl+O' },
      { type: 'separator' },
      { label: 'Agenda versenden…',             click: send('menu:send-agenda'),  accelerator: 'CmdOrCtrl+Shift+A' },
      { type: 'separator' },
      { label: 'Protokoll exportieren (JSON)…', click: send('menu:export-json'),  accelerator: 'CmdOrCtrl+S' },
      { label: 'Als PDF drucken…',              click: send('menu:print'),         accelerator: 'CmdOrCtrl+P' },
      ...(!isMac ? [{ type: 'separator' }, { role: 'quit', label: 'Beenden' }] : []),
    ],
  }

  const editMenu = {
    label: 'Bearbeiten',
    submenu: [
      { role: 'undo',      label: 'Rükgängig'       },
      { role: 'redo',      label: 'Wiederholen'       },
      { type: 'separator' },
      { role: 'cut',       label: 'Ausschneiden'      },
      { role: 'copy',      label: 'Kopieren'          },
      { role: 'paste',     label: 'Einfügen'          },
      { role: 'selectAll', label: 'Alles auswählen'   },
      ...(isMac ? [
        { type: 'separator' },
        { label: 'Sprachdienste', role: 'startSpeaking', label: 'Vorlesen' },
      ] : []),
    ],
  }

  const viewMenu = {
    label: 'Ansicht',
    submenu: [
      { role: 'reload',           label: 'Neu laden'          },
      { role: 'toggleDevTools',   label: 'Entwicklertools'    },
      { type: 'separator' },
      { role: 'resetZoom',        label: 'Zoom zurücksetzen'  },
      { role: 'zoomIn',           label: 'Vergrößern'         },
      { role: 'zoomOut',          label: 'Verkleinern'        },
      { type: 'separator' },
      { role: 'togglefullscreen', label: 'Vollbild'           },
    ],
  }

  const windowMenu = {
    label: 'Fenster',
    role: 'window',
    submenu: [
      { role: 'minimize', label: 'Minimieren'  },
      { role: 'zoom',     label: 'Zoomen'      },
      ...(isMac ? [
        { type: 'separator' },
        { role: 'front',  label: 'Alle nach vorne' },
      ] : [
        { role: 'close',  label: 'Schließen'   },
      ]),
    ],
  }

  const macAppMenu = {
    label: app.name,
    submenu: [
      { role: 'about',        label: `Über ${APP_NAME}`       },
      { type: 'separator' },
      { role: 'services',     label: 'Dienste'                },
      { type: 'separator' },
      { role: 'hide',         label: `${APP_NAME} ausblenden` },
      { role: 'hideOthers',   label: 'Andere ausblenden'      },
      { role: 'unhide',       label: 'Alle einblenden'        },
      { type: 'separator' },
      { role: 'quit',         label: `${APP_NAME} beenden`    },
    ],
  }

  const template = [
    ...(isMac ? [macAppMenu] : []),
    fileMenu,
    editMenu,
    viewMenu,
    windowMenu,
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ── macOS About panel ────────────────────────────────────────────────────────────
if (isMac) {
  app.setAboutPanelOptions({
    applicationName:    APP_NAME,
    applicationVersion: app.getVersion(),
    copyright:          '© 2026',
    credits:            'Baubesprechungs- und Jour-Fixe-Protokollverwaltung',
  })
}

// ── IPC handlers ─────────────────────────────────────────────────────────────────

ipcMain.handle('protocols:load', () => readData())

ipcMain.handle('protocols:save', (_e, protocols) => {
  try { writeData(protocols); return true } catch { return false }
})

ipcMain.handle('projects:load', () => readProjects())

ipcMain.handle('projects:save', (_e, projects) => {
  try { writeProjects(projects); return true } catch { return false }
})

ipcMain.handle('protocols:export-json', async (_e, protocol) => {
  const name = (protocol.projectName || 'Protokoll').replace(/[\/\\:*?"<>|]/g, '-')
  const { filePath, canceled } = await dialog.showSaveDialog({
    title:       'Protokoll als JSON exportieren',
    defaultPath: `${name}_${protocol.date || 'Datum'}.json`,
    filters:     [{ name: 'JSON-Datei', extensions: ['json'] }],
  })
  if (canceled || !filePath) return false
  fs.writeFileSync(filePath, JSON.stringify(protocol, null, 2), 'utf-8')
  shell.showItemInFolder(filePath)
  return true
})

ipcMain.handle('shell:open-external', (_e, url) => {
  return shell.openExternal(url)
})

ipcMain.handle('attachment:open', async (_e, { data, mimeType, name }) => {
  try {
    const ext     = name.includes('.') ? name.split('.').pop() : 'bin'
    const tmpPath = path.join(os.tmpdir(), `kp_anlage_${Date.now()}.${ext}`)
    fs.writeFileSync(tmpPath, Buffer.from(data, 'base64'))
    await shell.openPath(tmpPath)
    return true
  } catch { return false }
})

// ── Attachment blob storage ──────────────────────────────────────────────────────────
function attachmentsDir() {
  const dir = path.join(app.getPath('userData'), 'attachments')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

ipcMain.handle('attachment:save', (_e, id, base64) => {
  try {
    fs.writeFileSync(path.join(attachmentsDir(), id), Buffer.from(base64, 'base64'))
    return true
  } catch { return false }
})

ipcMain.handle('attachment:load', (_e, id) => {
  try {
    const p = path.join(attachmentsDir(), id)
    if (!fs.existsSync(p)) return null
    return fs.readFileSync(p).toString('base64')
  } catch { return null }
})

ipcMain.handle('attachment:delete', (_e, id) => {
  try {
    const p = path.join(attachmentsDir(), id)
    if (fs.existsSync(p)) fs.unlinkSync(p)
    return true
  } catch { return false }
})

ipcMain.handle('protocols:import-json', async () => {
  const { filePaths, canceled } = await dialog.showOpenDialog({
    title:      'Protokoll importieren',
    filters:    [{ name: 'JSON-Datei', extensions: ['json'] }],
    properties: ['openFile'],
  })
  if (canceled || !filePaths?.[0]) return null
  try   { return JSON.parse(fs.readFileSync(filePaths[0], 'utf-8')) }
  catch { return null }
})

// ── Update IPC ──────────────────────────────────────────────────────────────────────
ipcMain.handle('update:install', () => autoUpdater.quitAndInstall())
ipcMain.handle('update:check',   () => { if (!isDev) autoUpdater.checkForUpdates() })

// ── Lifecycle ────────────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  const win = createWindow()

  win.webContents.session.setSpellCheckerLanguages(['de-DE', 'de-AT', 'de-CH'])

  win.webContents.on('context-menu', (_e, params) => {
    const { misspelledWord, dictionarySuggestions, selectionText } = params
    if (!misspelledWord && !selectionText) return

    const menuItems = []

    if (misspelledWord) {
      const suggestions = (dictionarySuggestions ?? []).slice(0, 7)
      if (suggestions.length > 0) {
        suggestions.forEach(word => {
          menuItems.push({
            label: word,
            click: () => win.webContents.replaceMisspelling(word),
          })
        })
      } else {
        menuItems.push({ label: 'Keine Vorschläge', enabled: false })
      }
      menuItems.push({ type: 'separator' })
      menuItems.push({
        label: `„${misspelledWord}“ zum Wörterbuch hinzufügen`,
        click: () => win.webContents.session.addWordToSpellCheckerDictionary(misspelledWord),
      })
      menuItems.push({ type: 'separator' })
    }

    menuItems.push(
      { role: 'cut',   label: 'Ausschneiden' },
      { role: 'copy',  label: 'Kopieren'     },
      { role: 'paste', label: 'Einfügen'     },
    )

    Menu.buildFromTemplate(menuItems).popup({ window: win })
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (!isMac) app.quit()
})

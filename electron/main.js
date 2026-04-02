const { app, BrowserWindow, ipcMain, dialog, Menu, shell, nativeTheme } = require('electron')
const path = require('path')
const fs   = require('fs')
const os   = require('os')

const isDev  = !app.isPackaged
const isMac  = process.platform === 'darwin'
const isWin  = process.platform === 'win32'

const APP_NAME = 'Komplizen Protokolle'

// ── Data files ───────────────────────────────────────────────────────────────
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

// ── Window ───────────────────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width:     1360,
    height:    900,
    minWidth:  820,
    minHeight: 600,
    title:     APP_NAME,

    // macOS: traffic-light buttons sit inside the window frame (cleaner look)
    titleBarStyle:        isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 16, y: 16 } : undefined,

    // macOS: enable vibrancy for native sidebar-like feel
    vibrancy:             isMac ? 'sidebar' : undefined,

    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // On macOS reflect the system dark/light mode automatically
  if (isMac) {
    nativeTheme.themeSource = 'system'
  }

  buildMenu(win)
  return win
}

// ── App menu ─────────────────────────────────────────────────────────────────
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
      // On macOS "Beenden" lives in the app menu – omit it here
      ...(!isMac ? [{ type: 'separator' }, { role: 'quit', label: 'Beenden' }] : []),
    ],
  }

  const editMenu = {
    label: 'Bearbeiten',
    submenu: [
      { role: 'undo',      label: 'Rückgängig'       },
      { role: 'redo',      label: 'Wiederholen'       },
      { type: 'separator' },
      { role: 'cut',       label: 'Ausschneiden'      },
      { role: 'copy',      label: 'Kopieren'          },
      { role: 'paste',     label: 'Einfügen'          },
      { role: 'selectAll', label: 'Alles auswählen'   },
      // macOS: spell checking and substitutions
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

  // macOS: the first menu entry is always the app name menu
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

// ── macOS About panel ─────────────────────────────────────────────────────────
if (isMac) {
  app.setAboutPanelOptions({
    applicationName:    APP_NAME,
    applicationVersion: app.getVersion(),
    copyright:          '© 2026',
    credits:            'Baubesprechungs- und Jour-Fixe-Protokollverwaltung',
  })
}

// ── IPC handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('protocols:load', () => readData())

ipcMain.handle('protocols:save', (_e, protocols) => {
  try { writeData(protocols); return true } catch { return false }
})

ipcMain.handle('projects:load', () => readProjects())

ipcMain.handle('projects:save', (_e, projects) => {
  try { writeProjects(projects); return true } catch { return false }
})

ipcMain.handle('protocols:export-json', async (_e, protocol) => {
  const name = (protocol.projectName || 'Protokoll').replace(/[/\\:*?"<>|]/g, '-')
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

// ── Lifecycle ─────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow()

  // macOS: re-create window when clicking the dock icon with no windows open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// macOS: keep the process alive when all windows are closed (standard macOS behaviour)
app.on('window-all-closed', () => {
  if (!isMac) app.quit()
})

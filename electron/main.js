const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron')
const path = require('path')
const fs   = require('fs')

const isDev = !app.isPackaged

// ── Data file ────────────────────────────────────────────────────────────────
function dataFile() {
  return path.join(app.getPath('userData'), 'protocols.json')
}

function readData() {
  const f = dataFile()
  if (!fs.existsSync(f)) return []
  try { return JSON.parse(fs.readFileSync(f, 'utf-8')) } catch { return [] }
}

function writeData(protocols) {
  fs.writeFileSync(dataFile(), JSON.stringify(protocols, null, 2), 'utf-8')
}

// ── Window ───────────────────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width:    1360,
    height:   900,
    minWidth: 800,
    minHeight: 600,
    title: 'Baubesprechung Protokoll',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  buildMenu(win)
}

// ── App menu ─────────────────────────────────────────────────────────────────
function buildMenu(win) {
  const template = [
    {
      label: 'Datei',
      submenu: [
        { label: 'Protokoll importieren…', click: () => win.webContents.send('menu:import') },
        { type: 'separator' },
        { label: 'Protokoll exportieren (JSON)…', click: () => win.webContents.send('menu:export-json') },
        { label: 'Als PDF drucken…',              click: () => win.webContents.send('menu:print') },
        { type: 'separator' },
        { role: 'quit', label: 'Beenden' },
      ],
    },
    {
      label: 'Bearbeiten',
      submenu: [
        { role: 'undo',      label: 'Rückgängig'  },
        { role: 'redo',      label: 'Wiederholen' },
        { type: 'separator' },
        { role: 'cut',       label: 'Ausschneiden' },
        { role: 'copy',      label: 'Kopieren'    },
        { role: 'paste',     label: 'Einfügen'    },
        { role: 'selectAll', label: 'Alles auswählen' },
      ],
    },
    {
      label: 'Ansicht',
      submenu: [
        { role: 'reload',          label: 'Neu laden'           },
        { role: 'toggleDevTools',  label: 'Entwicklertools'     },
        { type: 'separator'        },
        { role: 'resetZoom',       label: 'Zoom zurücksetzen'   },
        { role: 'zoomIn',          label: 'Vergrößern'          },
        { role: 'zoomOut',         label: 'Verkleinern'         },
        { type: 'separator'        },
        { role: 'togglefullscreen',label: 'Vollbild'            },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ── IPC handlers ─────────────────────────────────────────────────────────────

// Load all protocols from disk
ipcMain.handle('protocols:load', () => readData())

// Save all protocols to disk (called on every change from renderer)
ipcMain.handle('protocols:save', (_e, protocols) => {
  try { writeData(protocols); return true } catch { return false }
})

// Export a single protocol as JSON file (user picks location)
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

// Import a single protocol from a JSON file
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
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

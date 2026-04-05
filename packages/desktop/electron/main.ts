import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'path';
import Store from 'electron-store';
import { startFolderWatcher, stopFolderWatcher } from './folderWatcher';
import { generateICS } from './calendarExport';
import type { CalendarEventInput } from '@dokuvault/shared';

// ─── Electron Store (persists settings) ──────────────────────────────────────
const store = new Store<{
  watchFolders: string[];
  supabaseUrl: string;
  supabaseAnonKey: string;
  anthropicApiKey: string;
}>();

// ─── Window management ────────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null;

const isDev = process.env['NODE_ENV'] === 'development';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5174');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  // Re-start folder watchers from saved settings
  const watchFolders = store.get('watchFolders', []);
  for (const folder of watchFolders) {
    startFolderWatcher(folder, (filePath) => {
      mainWindow?.webContents.send('folder-watcher:file-added', filePath);
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopFolderWatcher();
  if (process.platform !== 'darwin') app.quit();
});

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

// Settings
ipcMain.handle('settings:get', () => ({
  watchFolders: store.get('watchFolders', []),
  supabaseUrl: store.get('supabaseUrl', ''),
  supabaseAnonKey: store.get('supabaseAnonKey', ''),
  anthropicApiKey: store.get('anthropicApiKey', ''),
}));

ipcMain.handle('settings:set', (_event, settings: Record<string, unknown>) => {
  for (const [key, value] of Object.entries(settings)) {
    store.set(key, value);
  }
  return true;
});

// File picker
ipcMain.handle('dialog:open-files', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Documents', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'tiff'] },
    ],
  });
  return result.canceled ? [] : result.filePaths;
});

// Folder picker
ipcMain.handle('dialog:open-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

// Folder watcher management
ipcMain.handle('watcher:add-folder', (_event, folderPath: string) => {
  const folders = store.get('watchFolders', []);
  if (!folders.includes(folderPath)) {
    folders.push(folderPath);
    store.set('watchFolders', folders);
    startFolderWatcher(folderPath, (filePath) => {
      mainWindow?.webContents.send('folder-watcher:file-added', filePath);
    });
  }
  return folders;
});

ipcMain.handle('watcher:remove-folder', (_event, folderPath: string) => {
  const folders = store.get('watchFolders', []).filter((f) => f !== folderPath);
  store.set('watchFolders', folders);
  // Full restart of watchers for simplicity
  stopFolderWatcher();
  for (const folder of folders) {
    startFolderWatcher(folder, (filePath) => {
      mainWindow?.webContents.send('folder-watcher:file-added', filePath);
    });
  }
  return folders;
});

// Calendar export (ICS)
ipcMain.handle('calendar:export-ics', async (_event, events: CalendarEventInput[]) => {
  const icsContent = generateICS(events);

  const { filePath } = await dialog.showSaveDialog({
    defaultPath: 'DokuVault-Termine.ics',
    filters: [{ name: 'iCalendar', extensions: ['ics'] }],
  });

  if (!filePath) return { success: false };

  const fs = await import('fs/promises');
  await fs.writeFile(filePath, icsContent, 'utf-8');
  shell.showItemInFolder(filePath);
  return { success: true, filePath };
});

// Read file as base64 (for passing to Claude)
ipcMain.handle('file:read-base64', async (_event, filePath: string) => {
  const fs = await import('fs/promises');
  const buffer = await fs.readFile(filePath);
  return buffer.toString('base64');
});

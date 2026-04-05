import { contextBridge, ipcRenderer } from 'electron';
import type { CalendarEventInput } from '@dokuvault/shared';

// ─── Type-safe API exposed to renderer ───────────────────────────────────────

export interface ElectronAPI {
  // Settings
  getSettings(): Promise<{
    watchFolders: string[];
    supabaseUrl: string;
    supabaseAnonKey: string;
    anthropicApiKey: string;
  }>;
  setSettings(settings: Record<string, unknown>): Promise<boolean>;

  // File / folder dialogs
  openFiles(): Promise<string[]>;
  openFolder(): Promise<string | null>;

  // Folder watcher
  addWatchFolder(folderPath: string): Promise<string[]>;
  removeWatchFolder(folderPath: string): Promise<string[]>;
  onFileAdded(callback: (filePath: string) => void): () => void;

  // Calendar
  exportICS(events: CalendarEventInput[]): Promise<{ success: boolean; filePath?: string }>;

  // File reading
  readFileBase64(filePath: string): Promise<string>;
}

const api: ElectronAPI = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (settings) => ipcRenderer.invoke('settings:set', settings),

  openFiles: () => ipcRenderer.invoke('dialog:open-files'),
  openFolder: () => ipcRenderer.invoke('dialog:open-folder'),

  addWatchFolder: (folderPath) => ipcRenderer.invoke('watcher:add-folder', folderPath),
  removeWatchFolder: (folderPath) => ipcRenderer.invoke('watcher:remove-folder', folderPath),
  onFileAdded: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, filePath: string) =>
      callback(filePath);
    ipcRenderer.on('folder-watcher:file-added', handler);
    // Return cleanup function
    return () => ipcRenderer.removeListener('folder-watcher:file-added', handler);
  },

  exportICS: (events) => ipcRenderer.invoke('calendar:export-ics', events),
  readFileBase64: (filePath) => ipcRenderer.invoke('file:read-base64', filePath),
};

contextBridge.exposeInMainWorld('electron', api);

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Runtime info
  platform: process.platform,   // 'darwin' | 'win32' | 'linux'

  // Persistence
  loadProtocols:  ()          => ipcRenderer.invoke('protocols:load'),
  saveProtocols:  (protocols) => ipcRenderer.invoke('protocols:save', protocols),

  // File I/O
  exportJSON:     (protocol)  => ipcRenderer.invoke('protocols:export-json', protocol),
  importJSON:     ()          => ipcRenderer.invoke('protocols:import-json'),

  // Shell
  openExternal:   (url)       => ipcRenderer.invoke('shell:open-external', url),

  // Menu events pushed from main → renderer
  onMenuImport:      (cb) => ipcRenderer.on('menu:import',       (_e) => cb()),
  onMenuExportJSON:  (cb) => ipcRenderer.on('menu:export-json',  (_e) => cb()),
  onMenuPrint:       (cb) => ipcRenderer.on('menu:print',        (_e) => cb()),
  onMenuSendAgenda:  (cb) => ipcRenderer.on('menu:send-agenda',  (_e) => cb()),

  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
})

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Runtime info
  platform: process.platform,   // 'darwin' | 'win32' | 'linux'

  // Persistence – protocols
  loadProtocols:  ()          => ipcRenderer.invoke('protocols:load'),
  saveProtocols:  (protocols) => ipcRenderer.invoke('protocols:save', protocols),

  // Persistence – projects
  loadProjects:   ()          => ipcRenderer.invoke('projects:load'),
  saveProjects:   (projects)  => ipcRenderer.invoke('projects:save', projects),

  // File I/O
  exportJSON:     (protocol)  => ipcRenderer.invoke('protocols:export-json', protocol),
  importJSON:     ()          => ipcRenderer.invoke('protocols:import-json'),

  // Shell
  openExternal:   (url)        => ipcRenderer.invoke('shell:open-external', url),
  openAttachment: (attachment) => ipcRenderer.invoke('attachment:open', attachment),

  // Attachment blob storage
  saveAttachment:   (id, base64) => ipcRenderer.invoke('attachment:save', id, base64),
  loadAttachment:   (id)         => ipcRenderer.invoke('attachment:load', id),
  deleteAttachment: (id)         => ipcRenderer.invoke('attachment:delete', id),

  // Menu events pushed from main → renderer
  onMenuImport:      (cb) => ipcRenderer.on('menu:import',       (_e) => cb()),
  onMenuExportJSON:  (cb) => ipcRenderer.on('menu:export-json',  (_e) => cb()),
  onMenuPrint:       (cb) => ipcRenderer.on('menu:print',        (_e) => cb()),
  onMenuSendAgenda:  (cb) => ipcRenderer.on('menu:send-agenda',  (_e) => cb()),

  // Auto-updater events pushed from main
  onUpdateAvailable:  (cb) => ipcRenderer.on('update:available',  (_e, info) => cb(info)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update:downloaded', (_e, info) => cb(info)),
  installUpdate:      ()   => ipcRenderer.invoke('update:install'),
  checkForUpdates:    ()   => ipcRenderer.invoke('update:check'),

  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),

  // Microsoft Graph (Electron only – requires Azure App Registration)
  graphGetStatus:    ()     => ipcRenderer.invoke('graph:get-status'),
  graphLogin:        ()     => ipcRenderer.invoke('graph:login'),
  graphLogout:       ()     => ipcRenderer.invoke('graph:logout'),
  graphSendAgenda:   (data) => ipcRenderer.invoke('graph:send-agenda',   data),
  graphCreateEvent:  (data) => ipcRenderer.invoke('graph:create-event',  data),
  graphSendProtocol: (data) => ipcRenderer.invoke('graph:send-protocol', data),
})

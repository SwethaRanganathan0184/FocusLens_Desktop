const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('focusAPI', {
  ping:             ()  => ipcRenderer.invoke('ping'),
  getTodaySummary:  ()  => ipcRenderer.invoke('get-today-summary'),
  getMeetingEvents: ()  => ipcRenderer.invoke('get-meeting-events'),
  generateReport:   ()  => ipcRenderer.invoke('generate-report'),
})

require('dotenv').config()

const { checkAndRequestPermissions } = require('./permissions')
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { initDB } = require('./db')
const { startTracker, stopTracker } = require('./tracker')
const { generateDailyReport, summariseSessions, msToReadable } = require('./report')
const { getTodaySessions, getTodayMeetingEvents } = require('./db')

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    title: 'FocusLens',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  mainWindow.webContents.openDevTools()
}

// ── IPC Handlers ─────────────────────────────────────────────────

// Ping test
ipcMain.handle('ping', () => 'pong')

// Return today's app usage summary
ipcMain.handle('get-today-summary', () => {
  const sessions = getTodaySessions()
  const summary = summariseSessions(sessions)
  return summary.map(a => ({
    ...a,
    duration_readable: msToReadable(a.total_ms)
  }))
})

// Return today's meeting events
ipcMain.handle('get-meeting-events', () => {
  return getTodayMeetingEvents()
})

// Generate the AI report (calls Groq)
ipcMain.handle('generate-report', async () => {
  return await generateDailyReport()
})

// ── App lifecycle ─────────────────────────────────────────────────

app.whenReady().then(async () => {
  initDB()
  createWindow()

  // Check permissions first, then start tracker
  const hasPermissions = await checkAndRequestPermissions()
  if (hasPermissions) {
    startTracker()
  } else {
    console.log('Permissions not granted — tracker not started')
    // Re-check every 10 seconds in case user grants permissions
    const permCheck = setInterval(async () => {
      const granted = await checkAndRequestPermissions()
      if (granted) {
        startTracker()
        clearInterval(permCheck)
      }
    }, 10000)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopTracker()
})
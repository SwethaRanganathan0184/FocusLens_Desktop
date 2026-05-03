require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })

const { getGroqApiKey, saveGroqApiKey, hasGroqApiKey } = require('./config')
const http = require('http')
const { checkAndRequestPermissions } = require('./permissions')
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { initDB } = require('./db')
const { startTracker, stopTracker } = require('./tracker')
const { generateDailyReport, summariseSessions, msToReadable } = require('./report')
const { getTodaySessions, getTodayMeetingEvents, getTodayBrowserSessions, insertBrowserSession } = require('./db')
const { categorizeTab } = require('./categorizer')

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

ipcMain.handle('ping', () => 'pong')

ipcMain.handle('get-today-summary', () => {
  const sessions = getTodaySessions()
  const summary = summariseSessions(sessions)
  return summary.map(a => ({
    ...a,
    duration_readable: msToReadable(a.total_ms)
  }))
})

ipcMain.handle('get-meeting-events', () => {
  return getTodayMeetingEvents()
})

ipcMain.handle('get-browser-sessions', () => {
  return getTodayBrowserSessions()
})

ipcMain.handle('generate-report', async () => {
  return await generateDailyReport()
})

// Get current API key status
ipcMain.handle('get-api-key-status', () => {
  return { hasKey: hasGroqApiKey() }
})

// Save API key from UI
ipcMain.handle('save-api-key', (event, key) => {
  if (!key || key.trim().length < 10) return { ok: false, error: 'Invalid key' }
  const saved = saveGroqApiKey(key.trim())
  return { ok: saved }
})
// ── Local HTTP server for Chrome extension ────────────────────────
const IGNORED_TITLES = [
  'New Tab', 'New tab', 'Open', 'Extensions',
  'Settings', 'Downloads', 'History', 'Chrome Web Store'
]

function isValidTitle(title) {
  if (!title || title.trim().length < 3) return false
  if (IGNORED_TITLES.includes(title.trim())) return false
  if (title.startsWith('chrome://')) return false
  if (title.startsWith('about:')) return false
  return true
}

function startChromeServer() {
  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    if (req.method === 'POST' && req.url === '/tab') {
      let body = ''
      req.on('data', chunk => { body += chunk.toString() })
      req.on('end', async () => {
        try {
          const { title, url, browser, duration_ms } = JSON.parse(body)

          if (!isValidTitle(title)) {
            res.writeHead(200)
            res.end(JSON.stringify({ ok: true, skipped: true }))
            return
          }

          const category = await categorizeTab(title)
          const now = Date.now()
          insertBrowserSession({
            browser: browser || 'Google Chrome',
            tab_title: title.trim(),
            category,
            started_at: now - (duration_ms || 0),
            ended_at: now,
            duration_ms: duration_ms || 0
          })
          console.log(`Chrome tab: "${title}" → ${category} (${duration_ms || 0}ms)`)
          res.writeHead(200)
          res.end(JSON.stringify({ ok: true, category }))
        } catch (err) {
          console.error('Chrome server error:', err.message)
          res.writeHead(400)
          res.end(JSON.stringify({ error: err.message }))
        }
      })
    } else {
      res.writeHead(404)
      res.end()
    }
  })

  server.listen(27420, '127.0.0.1', () => {
    console.log('Chrome extension server listening on port 27420')
  })

  server.on('error', (err) => {
    console.error('Chrome server error:', err.message)
  })

  return server
}

// ── App lifecycle ─────────────────────────────────────────────────

app.whenReady().then(async () => {
  initDB()
  startChromeServer()
  createWindow()

  const hasPermissions = await checkAndRequestPermissions()
  if (hasPermissions) {
    startTracker()
  } else {
    console.log('Permissions not granted — tracker not started')
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
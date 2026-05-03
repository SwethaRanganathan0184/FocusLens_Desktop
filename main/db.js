const Database = require('better-sqlite3')
const path = require('path')
const { app } = require('electron')

// Store the DB file in the user's app data folder
// macOS: ~/Library/Application Support/focuslens-desktop/
// Windows: C:\Users\<user>\AppData\Roaming\focuslens-desktop\
const DB_PATH = path.join(app.getPath('userData'), 'focuslens.db')

let db

function initDB() {
  db = new Database(DB_PATH)

  // Enable WAL mode — faster writes, safer for desktop apps
  db.pragma('journal_mode = WAL')

  // Table 1: every app session (a continuous stretch of focus on one app)
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_sessions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      app_name    TEXT NOT NULL,
      window_title TEXT,
      category    TEXT DEFAULT 'Uncategorized',
      started_at  INTEGER NOT NULL,
      ended_at    INTEGER,
      duration_ms INTEGER
    )
  `)

  // Table 2: meeting events (switches away from a meeting app and back)
  db.exec(`
    CREATE TABLE IF NOT EXISTS meeting_events (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_app   TEXT NOT NULL,
      meeting_title TEXT,
      event_type    TEXT NOT NULL,
      app_switched_to TEXT,
      timestamp     INTEGER NOT NULL
    )
  `)


  // Table 3: browser tab sessions
  db.exec(`
    CREATE TABLE IF NOT EXISTS browser_sessions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      browser       TEXT NOT NULL,
      tab_title     TEXT NOT NULL,
      category      TEXT DEFAULT 'Uncategorized',
      started_at    INTEGER NOT NULL,
      ended_at      INTEGER,
      duration_ms   INTEGER
    )
  `)

  // Table 4: site category cache (avoid repeated Groq calls)
  db.exec(`
    CREATE TABLE IF NOT EXISTS site_categories (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      tab_title   TEXT NOT NULL UNIQUE,
      category    TEXT NOT NULL,
      source      TEXT DEFAULT 'manual'
    )
  `)

  console.log('Database ready at:', DB_PATH)
  return db
}

// Insert a completed app session
function insertSession(session) {
  const stmt = db.prepare(`
    INSERT INTO app_sessions (app_name, window_title, category, started_at, ended_at, duration_ms)
    VALUES (@app_name, @window_title, @category, @started_at, @ended_at, @duration_ms)
  `)
  return stmt.run(session)
}

// Insert a meeting event (switch away, switch back, meeting start/end)
function insertMeetingEvent(event) {
  const stmt = db.prepare(`
    INSERT INTO meeting_events (meeting_app, meeting_title, event_type, app_switched_to, timestamp)
    VALUES (@meeting_app, @meeting_title, @event_type, @app_switched_to, @timestamp)
  `)
  return stmt.run(event)
}

// Get all sessions for today
function getTodaySessions() {
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  return db.prepare(`
    SELECT * FROM app_sessions
    WHERE started_at >= ?
    ORDER BY started_at ASC
  `).all(startOfDay.getTime())
}

// Get today's meeting events
function getTodayMeetingEvents() {
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  return db.prepare(`
    SELECT * FROM meeting_events
    WHERE timestamp >= ?
    ORDER BY timestamp ASC
  `).all(startOfDay.getTime())
}


// Insert a browser tab session
function insertBrowserSession(session) {
  const stmt = db.prepare(`
    INSERT INTO browser_sessions (browser, tab_title, category, started_at, ended_at, duration_ms)
    VALUES (@browser, @tab_title, @category, @started_at, @ended_at, @duration_ms)
  `)
  return stmt.run(session)
}

// Get today's browser sessions
function getTodayBrowserSessions() {
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  return db.prepare(`
    SELECT * FROM browser_sessions
    WHERE started_at >= ?
    ORDER BY started_at ASC
  `).all(startOfDay.getTime())
}

// Get cached category for a tab title
function getCachedCategory(tabTitle) {
  return db.prepare(`
    SELECT category FROM site_categories WHERE tab_title = ?
  `).get(tabTitle)
}

// Save a category to cache
function saveCategoryCache(tabTitle, category, source = 'manual') {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO site_categories (tab_title, category, source)
    VALUES (?, ?, ?)
  `)
  return stmt.run(tabTitle, category, source)
}

module.exports = { 
  initDB, 
  insertSession, 
  insertMeetingEvent, 
  getTodaySessions, 
  getTodayMeetingEvents,
  insertBrowserSession,
  getTodayBrowserSessions,
  getCachedCategory,
  saveCategoryCache
}
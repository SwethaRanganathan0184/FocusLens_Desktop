const activeWin = require('active-win')
const { insertSession, insertMeetingEvent } = require('./db')

// Apps that indicate an active meeting

const IGNORED_APPS = [
  'loginwindow',
  'UserNotificationCenter', 
  'Notification Center',
  'SystemUIServer',
  'ControlStrip',
  'Dock',
  'Window Server',
  'FocusLens',  // ignore our own app
]


const MEETING_APPS = [
  'Microsoft Teams', 'zoom.us', 'Zoom', 'Google Meet',
  'Slack', 'Discord', 'Webex', 'Skype'
]

// How to detect a live meeting from the window title
const MEETING_TITLE_PATTERNS = [
  /meeting/i, /call/i, /\| microsoft teams/i,
  /zoom meeting/i, /meet\.google\.com/i
]

let currentSession = null      // the app currently in focus
let activeMeeting = null       // meeting currently in progress
let pollInterval = null

function isMeetingApp(appName) {
  return MEETING_APPS.some(m => appName?.toLowerCase().includes(m.toLowerCase()))
}

function isMeetingWindow(appName, title) {
  if (!isMeetingApp(appName)) return false
  return MEETING_TITLE_PATTERNS.some(p => p.test(title || ''))
}

async function poll() {
  try {
    const win = await activeWin()
    if (!win) return

    const appName = win.owner?.name || 'Unknown'
    if (IGNORED_APPS.includes(appName)) return
    const title   = win.title || ''
    const now     = Date.now()

    // ── Session tracking ──────────────────────────────────────────
    if (!currentSession) {
      // First poll ever
      currentSession = { app_name: appName, window_title: title, started_at: now }

    } else if (currentSession.app_name !== appName) {
      // App changed — close the old session
      const duration = now - currentSession.started_at
      if (duration > 1000) {   // ignore sub-1s flickers
        insertSession({
          app_name:     currentSession.app_name,
          window_title: currentSession.window_title,
          category:     'Uncategorized',
          started_at:   currentSession.started_at,
          ended_at:     now,
          duration_ms:  duration
        })
      }
      // Start a new session
      currentSession = { app_name: appName, window_title: title, started_at: now }
    }

    // ── Meeting tracking ──────────────────────────────────────────
    const inMeeting = isMeetingWindow(appName, title)

    if (inMeeting && !activeMeeting) {
      // Meeting just started
      activeMeeting = { app: appName, title, started_at: now }
      insertMeetingEvent({
        meeting_app:    appName,
        meeting_title:  title,
        event_type:     'meeting_start',
        app_switched_to: null,
        timestamp:      now
      })
      console.log(`Meeting started: ${appName} — "${title}"`)

    } else if (!inMeeting && activeMeeting) {
      if (isMeetingApp(appName)) {
        // Still in the meeting app but not in a call window — ignore
      } else {
        // Switched away from meeting to another app
        insertMeetingEvent({
          meeting_app:    activeMeeting.app,
          meeting_title:  activeMeeting.title,
          event_type:     'switch_away',
          app_switched_to: appName,
          timestamp:      now
        })
        console.log(`Switched away from meeting to: ${appName}`)
      }

    } else if (inMeeting && activeMeeting && appName === activeMeeting.app) {
      // Returned to meeting
      if (activeMeeting._switched_away) {
        insertMeetingEvent({
          meeting_app:    activeMeeting.app,
          meeting_title:  activeMeeting.title,
          event_type:     'switch_back',
          app_switched_to: null,
          timestamp:      now
        })
        activeMeeting._switched_away = false
        console.log('Returned to meeting')
      }
    }

  } catch (err) {
    console.error('Tracker poll error:', err.message)
  }
}

function startTracker() {
  console.log('Tracker started — polling every second')
  pollInterval = setInterval(poll, 1000)
}

function stopTracker() {
  if (pollInterval) {
    clearInterval(pollInterval)
    console.log('Tracker stopped')
  }
}

module.exports = { startTracker, stopTracker }
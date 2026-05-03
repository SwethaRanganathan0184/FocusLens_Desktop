const activeWin = require('active-win')
const { insertSession, insertMeetingEvent, insertBrowserSession } = require('./db')
const { categorizeTab } = require('./categorizer')

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


// Known browsers and their display names
const BROWSERS = {
  'Google Chrome': 'Google Chrome',
  'Safari': 'Safari',
  'Firefox': 'Firefox',
  'Brave Browser': 'Brave',
  'Microsoft Edge': 'Edge',
  'Opera': 'Opera',
  'Arc': 'Arc',
  'Vivaldi': 'Vivaldi',
  'Chromium': 'Chromium'
}

let currentBrowserSession = null  // tracks current browser tab session

function parseTabTitle(windowTitle, browserName) {
  // Chrome/most browsers format: "Page Title - Browser Name"
  // Safari format: "Page Title — Safari"  
  const separators = [` - ${browserName}`, ` — ${browserName}`, ` | ${browserName}`]
  for (const sep of separators) {
    if (windowTitle.includes(sep)) {
      return windowTitle.replace(sep, '').trim()
    }
  }
  // Fallback — just remove everything after last " - " or " — "
  const dashIndex = windowTitle.lastIndexOf(' - ')
  if (dashIndex > 0) return windowTitle.substring(0, dashIndex).trim()
  return windowTitle.trim()
}

function isBrowser(appName) {
  return Object.keys(BROWSERS).includes(appName)
}

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
    // ── Browser tab tracking ──────────────────────────────────────
    if (isBrowser(appName)) {
      const browserName = BROWSERS[appName]
      const tabTitle = parseTabTitle(title, browserName)
      

      if (!currentBrowserSession) {
        currentBrowserSession = { browser: appName, tab_title: tabTitle, started_at: now }

      } else if (currentBrowserSession.tab_title !== tabTitle || currentBrowserSession.browser !== appName) {
        // Tab changed — close old browser session
        const duration = now - currentBrowserSession.started_at
        if (duration > 1000) {
          const category = await categorizeTab(currentBrowserSession.tab_title)
          insertBrowserSession({
            browser: currentBrowserSession.browser,
            tab_title: currentBrowserSession.tab_title,
            category,
            started_at: currentBrowserSession.started_at,
            ended_at: now,
            duration_ms: duration
          })
        }
        currentBrowserSession = { browser: appName, tab_title: tabTitle, started_at: now }
      }
    } else {
      // Switched away from browser — close browser session
      if (currentBrowserSession) {
        const duration = now - currentBrowserSession.started_at
        if (duration > 1000) {
          const category = await categorizeTab(currentBrowserSession.tab_title)
          insertBrowserSession({
            browser: currentBrowserSession.browser,
            tab_title: currentBrowserSession.tab_title,
            category,
            started_at: currentBrowserSession.started_at,
            ended_at: now,
            duration_ms: duration
          })
        }
        currentBrowserSession = null
      }
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
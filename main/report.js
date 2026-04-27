const { getTodaySessions, getTodayMeetingEvents } = require('./db')

const GROQ_API_KEY = process.env.GROQ_API_KEY 


// App category lookup — same idea as your Chrome extension
const CATEGORY_MAP = {
  'Google Chrome': 'Browser',
  'Safari': 'Browser',
  'Firefox': 'Browser',
  'Code': 'Development',
  'Xcode': 'Development',
  'Terminal': 'Development',
  'iTerm2': 'Development',
  'Slack': 'Communication',
  'Microsoft Teams': 'Communication',
  'zoom.us': 'Meetings',
  'Discord': 'Communication',
  'Notion': 'Productivity',
  'Obsidian': 'Productivity',
  'Figma': 'Design',
  'Spotify': 'Entertainment',
  'Music': 'Entertainment',
  'Finder': 'System',
  'SystemPreferences': 'System',
}

function categorizeApp(appName) {
  return CATEGORY_MAP[appName] || 'Other'
}

// Summarise raw sessions into per-app totals
function summariseSessions(sessions) {
  const totals = {}
  for (const s of sessions) {
    const cat = categorizeApp(s.app_name)
    if (!totals[s.app_name]) {
      totals[s.app_name] = { app_name: s.app_name, category: cat, total_ms: 0, switches: 0 }
    }
    totals[s.app_name].total_ms += s.duration_ms || 0
    totals[s.app_name].switches += 1
  }
  return Object.values(totals).sort((a, b) => b.total_ms - a.total_ms)
}

// Summarise meeting distractions
function summariseMeetings(events) {
  const meetings = {}
  for (const e of events) {
    const key = e.meeting_title || e.meeting_app
    if (!meetings[key]) {
      meetings[key] = { title: key, app: e.meeting_app, switch_aways: 0, apps_switched_to: [] }
    }
    if (e.event_type === 'switch_away') {
      meetings[key].switch_aways += 1
      if (e.app_switched_to) meetings[key].apps_switched_to.push(e.app_switched_to)
    }
  }
  return Object.values(meetings)
}

function msToReadable(ms) {
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  const rem = mins % 60
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`
}

async function generateDailyReport() {
  const sessions = getTodaySessions()
  const meetingEvents = getTodayMeetingEvents()

  if (sessions.length === 0) {
    return { error: 'No activity recorded today yet.' }
  }

  const appSummary = summariseSessions(sessions)
  const meetingSummary = summariseMeetings(meetingEvents)

  // Build the prompt for Groq
  const appLines = appSummary
    .map(a => `- ${a.app_name} (${a.category}): ${msToReadable(a.total_ms)}, ${a.switches} session(s)`)
    .join('\n')

  const meetingLines = meetingSummary.length > 0
    ? meetingSummary.map(m =>
        `- ${m.title}: switched away ${m.switch_aways} time(s) to [${[...new Set(m.apps_switched_to)].join(', ')}]`
      ).join('\n')
    : 'No meetings detected today.'

  const prompt = `You are a productivity coach analyzing someone's workday. Based on their app usage data, write a friendly, insightful daily report in 3 sections:

1. **Day Overview** — 2-3 sentences summarising how the day looked overall
2. **Focus Analysis** — What they spent most time on, any concerning patterns (too much switching, entertainment during work hours etc.)
3. **Meeting Behaviour** — How focused they were during meetings, how many times they got distracted
4. **One actionable tip** for tomorrow

App usage today:
${appLines}

Meeting distractions today:
${meetingLines}

Keep the tone warm and constructive, not judgmental. Be specific with the numbers.`

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 600,
        temperature: 0.7
      })
    })

    const data = await response.json()
    const text = data.choices?.[0]?.message?.content || 'Could not generate report.'

    return {
      generated_at: new Date().toISOString(),
      app_summary: appSummary,
      meeting_summary: meetingSummary,
      ai_report: text
    }

  } catch (err) {
    console.error('Groq API error:', err.message)
    return {
      generated_at: new Date().toISOString(),
      app_summary: appSummary,
      meeting_summary: meetingSummary,
      ai_report: 'AI report unavailable — check your API key.'
    }
  }
}

module.exports = { generateDailyReport, summariseSessions, msToReadable }

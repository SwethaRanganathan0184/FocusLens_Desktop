const { getCachedCategory, saveCategoryCache } = require('./db')

const { getGroqApiKey } = require('./config')
// Predefined category map — matched against tab title keywords
// NOTE: YouTube removed intentionally — title content determines category
const CATEGORY_MAP = {
  // Development
  'github': 'Development',
  'stackoverflow': 'Development',
  'gitlab': 'Development',
  'bitbucket': 'Development',
  'codepen': 'Development',
  'replit': 'Development',
  'vercel': 'Development',
  'netlify': 'Development',
  'developer': 'Development',
  'documentation': 'Development',
  'localhost': 'Development',
  'geeksforgeeks': 'Development',
  'leetcode': 'Development',
  'hackerrank': 'Development',
  'w3schools': 'Development',
  'mdn': 'Development',

  // Communication
  'gmail': 'Communication',
  'outlook': 'Communication',
  'slack': 'Communication',
  'teams': 'Communication',
  'discord': 'Communication',
  'whatsapp': 'Communication',
  'telegram': 'Communication',

  // Meetings
  'zoom': 'Meetings',
  'webex': 'Meetings',
  'calendar': 'Meetings',

  // Social Media
  'twitter': 'Social Media',
  'x.com': 'Social Media',
  'instagram': 'Social Media',
  'facebook': 'Social Media',
  'linkedin': 'Social Media',
  'reddit': 'Social Media',
  'threads': 'Social Media',

  // Entertainment
  'netflix': 'Entertainment',
  'twitch': 'Entertainment',
  'primevideo': 'Entertainment',
  'hotstar': 'Entertainment',
  'disney': 'Entertainment',
  'spotify': 'Entertainment',

  // News
  'bbc': 'News',
  'cnn': 'News',
  'guardian': 'News',
  'reuters': 'News',
  'techcrunch': 'News',
  'wikipedia': 'News',

  // Productivity
  'notion': 'Productivity',
  'figma': 'Productivity',
  'canva': 'Productivity',
  'trello': 'Productivity',
  'asana': 'Productivity',
  'jira': 'Productivity',
  'confluence': 'Productivity',
  'claude': 'Productivity',
  'chatgpt': 'Productivity',

  // Search
  'google search': 'Search',
  'bing': 'Search',
  'duckduckgo': 'Search',

  // Shopping
  'amazon': 'Shopping',
  'flipkart': 'Shopping',
  'myntra': 'Shopping',
  'swiggy': 'Shopping',
  'zomato': 'Shopping',

  // Finance
  'zerodha': 'Finance',
  'groww': 'Finance',
  'paypal': 'Finance',
  'stripe': 'Finance',
}

// Try to match tab title against predefined map
function matchPredefined(tabTitle) {
  const lower = tabTitle.toLowerCase()

  // Special case: Google Search results
  if (lower.includes('- google search') || lower.includes('google search -')) {
    return 'Search'
  }

  // Special case: Wikipedia
  if (lower.includes('- wikipedia') || lower.includes('wikipedia -')) {
    return 'News'
  }

  for (const [keyword, category] of Object.entries(CATEGORY_MAP)) {
    if (lower.includes(keyword)) return category
  }
  return null
}

// Ask Groq to categorize if no predefined match
async function categorizeWithGroq(tabTitle) {
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getGroqApiKey()}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{
          role: 'user',
          content: `You are categorizing browser tab titles for a productivity tracker.

Categorize this tab title into exactly one of these categories:
- Development (coding, programming, tech docs, tutorials about code/software)
- Communication (email, messaging, chat)
- Meetings (video calls, calendar)
- Social Media (Twitter, Instagram, Reddit, Facebook, LinkedIn)
- Entertainment (movie trailers, music videos, vlogs, gaming videos, comedy, sports highlights)
- Education (online courses, lectures, educational videos, learning content, DSA, algorithms)
- News (news articles, current events, Wikipedia)
- Productivity (project management, documents, design tools, AI assistants)
- Shopping (e-commerce, product pages)
- Finance (banking, stocks, payments)
- Search (Google Search results, Bing results)
- Other (anything that doesn't fit above)

Tab title: "${tabTitle}"

Important rules:
- YouTube videos about coding/programming/DSA/algorithms → Development
- YouTube videos that are courses or tutorials about tech → Education  
- YouTube movie trailers, music videos, vlogs, entertainment → Entertainment
- YouTube cooking, fitness, lifestyle → Education or Entertainment based on content
- Google Search results pages → Search
- Wikipedia articles → News
- If title ends with "- YouTube", judge by the content before that

Reply with ONLY the category name, nothing else.`
        }],
        max_tokens: 10,
        temperature: 0
      })
    })
    const data = await response.json()
    return data.choices?.[0]?.message?.content?.trim() || 'Other'
  } catch (err) {
    console.error('Groq categorization error:', err.message)
    return 'Other'
  }
}

// Main categorize function — checks cache first, then predefined, then Groq
async function categorizeTab(tabTitle) {
  if (!tabTitle || tabTitle.trim() === '') return 'Other'

  // 1. Check cache
  const cached = getCachedCategory(tabTitle)
  if (cached) return cached.category

  // 2. Try predefined map
  const predefined = matchPredefined(tabTitle)
  if (predefined) {
    saveCategoryCache(tabTitle, predefined, 'manual')
    return predefined
  }

  // 3. Fall back to Groq
  const groqCategory = await categorizeWithGroq(tabTitle)
  saveCategoryCache(tabTitle, groqCategory, 'groq')
  return groqCategory
}

module.exports = { categorizeTab }
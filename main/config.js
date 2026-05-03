const fs = require('fs')
const path = require('path')
const { app } = require('electron')

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json')

function readConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return {}
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
  } catch (err) {
    console.error('Error reading config:', err.message)
    return {}
  }
}

function writeConfig(config) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 
'utf8')
    return true
  } catch (err) {
    console.error('Error writing config:', err.message)
    return false
  }
}

function getGroqApiKey() {
  // Priority: environment variable first, then config file
  if (process.env.GROQ_API_KEY) return process.env.GROQ_API_KEY
  const config = readConfig()
  return config.groqApiKey || null
}

function saveGroqApiKey(key) {
  const config = readConfig()
  config.groqApiKey = key
  return writeConfig(config)
}

function hasGroqApiKey() {
  return !!getGroqApiKey()
}

module.exports = { getGroqApiKey, saveGroqApiKey, hasGroqApiKey, 
readConfig, writeConfig }

const { shell, dialog, app } = require('electron')
const permissions = process.platform === 'darwin' ? require('node-mac-permissions') : null

async function checkAndRequestPermissions() {
  // Only needed on macOS
  if (process.platform !== 'darwin') return true

  const results = await Promise.all([
    checkAccessibility(),
    checkScreenRecording()
  ])

  return results.every(r => r === true)
}

async function checkAccessibility() {
  const status = permissions.getAuthStatus('accessibility')
  console.log('Accessibility permission:', status)

  if (status === 'authorized') return true

  const { response } = await dialog.showMessageBox({
    type: 'warning',
    title: 'Accessibility Permission Required',
    message: 'FocusLens needs Accessibility access',
    detail: 'This lets FocusLens see which app is currently in focus.\n\nClick "Open Settings" then enable FocusLens under Privacy & Security → Accessibility.',
    buttons: ['Open Settings', 'Skip for now'],
    defaultId: 0,
    cancelId: 1
  })

  if (response === 0) {
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')
  }

  return false
}

async function checkScreenRecording() {
  const status = permissions.getAuthStatus('screen')
  console.log('Screen Recording permission:', status)

  if (status === 'authorized') return true

  const { response } = await dialog.showMessageBox({
    type: 'warning',
    title: 'Screen Recording Permission Required',
    message: 'FocusLens needs Screen Recording access',
    detail: 'This lets FocusLens read window titles so it can tell what you\'re working on.\n\nClick "Open Settings" then enable FocusLens under Privacy & Security → Screen Recording.',
    buttons: ['Open Settings', 'Skip for now'],
    defaultId: 0,
    cancelId: 1
  })

  if (response === 0) {
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
  }

  return false
}

module.exports = { checkAndRequestPermissions }

import { createCapacitorElectronApp } from '@capawesome/capacitor-electron'
import { app, session, shell } from 'electron'

import config from './capacitor.electron.config'

const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url)
      if (ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
        void shell.openExternal(parsed.toString())
      }
    } catch {
      // ignore invalid URLs
    }
    return { action: 'deny' }
  })
})

void app.whenReady().then(() => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (!details.url.startsWith('http://') && !details.url.startsWith('https://')) {
      callback({ responseHeaders: details.responseHeaders })
      return
    }
    const headers = { ...(details.responseHeaders ?? {}) }
    const hasAllowOrigin = Object.keys(headers).some(
      (key) => key.toLowerCase() === 'access-control-allow-origin'
    )
    if (!hasAllowOrigin) {
      headers['Access-Control-Allow-Origin'] = ['*']
    }
    const hasAllowHeaders = Object.keys(headers).some(
      (key) => key.toLowerCase() === 'access-control-allow-headers'
    )
    if (!hasAllowHeaders) {
      headers['Access-Control-Allow-Headers'] = ['*']
    }
    const hasAllowMethods = Object.keys(headers).some(
      (key) => key.toLowerCase() === 'access-control-allow-methods'
    )
    if (!hasAllowMethods) {
      headers['Access-Control-Allow-Methods'] = ['GET, POST, PUT, DELETE, OPTIONS']
    }
    callback({ responseHeaders: headers })
  })
})

createCapacitorElectronApp(config)

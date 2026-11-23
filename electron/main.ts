import { createCapacitorElectronApp } from '@capawesome/capacitor-electron';
import { app, session, shell } from 'electron';

import config from './capacitor.electron.config';

const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
let isQuitting = false;

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
        void shell.openExternal(parsed.toString());
      }
    } catch {
      // ignore invalid URLs
    }
    return { action: 'deny' };
  });
});

void app.whenReady().then(() => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (!details.url.startsWith('http://') && !details.url.startsWith('https://')) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }
    const headers = { ...(details.responseHeaders ?? {}) };
    const hasAllowOrigin = Object.keys(headers).some(
      (key) => key.toLowerCase() === 'access-control-allow-origin'
    );
    if (!hasAllowOrigin) {
      headers['Access-Control-Allow-Origin'] = ['*'];
    }
    const hasAllowHeaders = Object.keys(headers).some(
      (key) => key.toLowerCase() === 'access-control-allow-headers'
    );
    if (!hasAllowHeaders) {
      headers['Access-Control-Allow-Headers'] = ['*'];
    }
    const hasAllowMethods = Object.keys(headers).some(
      (key) => key.toLowerCase() === 'access-control-allow-methods'
    );
    if (!hasAllowMethods) {
      headers['Access-Control-Allow-Methods'] = ['GET, POST, PUT, DELETE, OPTIONS'];
    }
    callback({ responseHeaders: headers });
  });
});

const electronApp = createCapacitorElectronApp({
  ...config,
  hooks: {
    ...config.hooks,
    async onWindowCreated(win) {
      await config.hooks?.onWindowCreated?.(win);
      if (process.platform === 'darwin') {
        // macOS 关闭按钮仅隐藏窗口，避免销毁 mainWindow 后触发 second-instance 抛出 Object has been destroyed
        win.on('close', (event) => {
          if (!isQuitting) {
            event.preventDefault();
            win.hide();
          }
        });
      }
    },
  },
});

app.on('activate', () => {
  const win = electronApp.getMainWindow();
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) {
      win.restore();
    }
    win.show();
    win.focus();
  }
});

import { getCapacitorBridge, isCapacitorNative } from './env.js'

/**
 * 绑定移动端硬件返回键（Android）；返回 true 表示事件已被消费，false 表示允许默认退出。
 */
export const bindPlatformBackButton = (onBack: () => boolean): (() => void) => {
  if (!isCapacitorNative()) {
    return () => {}
  }
  const appPlugin = getCapacitorBridge()?.Plugins?.App
  if (!appPlugin?.addListener) {
    return () => {}
  }
  let active = true
  let removeListener: (() => Promise<void> | void) | undefined
  try {
    // 原生桥接层的 Plugins.App.addListener 可能同步返回句柄或返回 Promise
    const maybeHandle = appPlugin.addListener('backButton', ({ canGoBack }) => {
      if (!active) {
        return
      }
      if (onBack()) {
        return
      }
      if (!canGoBack) {
        void Promise.resolve(appPlugin.exitApp?.()).catch(() => {})
      }
    })
    void Promise.resolve(maybeHandle)
      .then((handle) => {
        if (!handle || typeof handle.remove !== 'function') {
          return
        }
        if (active) {
          removeListener = handle.remove
        } else {
          void Promise.resolve(handle.remove()).catch(() => {})
        }
      })
      .catch(() => {})
  } catch {
    // 忽略不支持 backButton 的平台（如 iOS）
  }

  return () => {
    active = false
    if (removeListener) {
      void Promise.resolve(removeListener()).catch(() => {})
    }
  }
}

/** 同步移动端系统状态栏明暗风格 */
export const syncSystemStatusBar = (theme: 'light' | 'dark'): void => {
  if (!isCapacitorNative()) {
    return
  }
  const statusBar = getCapacitorBridge()?.Plugins?.StatusBar
  if (statusBar?.setStyle) {
    void Promise.resolve(statusBar.setStyle({ style: theme === 'dark' ? 'DARK' : 'LIGHT' })).catch(
      () => {}
    )
  }
}

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
  let removeListener: (() => Promise<void>) | undefined
  void appPlugin
    .addListener('backButton', ({ canGoBack }) => {
      if (!active) {
        return
      }
      if (onBack()) {
        return
      }
      if (!canGoBack) {
        void appPlugin.exitApp?.()
      }
    })
    .then((handle) => {
      if (active) {
        removeListener = handle.remove
      } else {
        void handle.remove()
      }
    })
    .catch(() => {})

  return () => {
    active = false
    void removeListener?.().catch(() => {})
  }
}

/** 同步移动端系统状态栏明暗风格 */
export const syncSystemStatusBar = (theme: 'light' | 'dark'): void => {
  if (!isCapacitorNative()) {
    return
  }
  const statusBar = getCapacitorBridge()?.Plugins?.StatusBar
  if (statusBar?.setStyle) {
    void statusBar.setStyle({ style: theme === 'dark' ? 'DARK' : 'LIGHT' }).catch(() => {})
  }
}

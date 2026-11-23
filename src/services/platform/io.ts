import { getCapacitorBridge, getElectronBridge, isCapacitorNative, isElectron } from './env.js'

const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'))
    reader.readAsDataURL(blob)
  })

const triggerWebDownload = (filename: string, blob: Blob) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/**
 * 跨平台导出文件：
 * - Electron 优先调用原生保存对话框；
 * - Capacitor 写入缓存目录后调起系统分享面板；
 * - Web 走浏览器 <a download> 下载。
 */
export const exportBlobFile = async (filename: string, blob: Blob): Promise<void> => {
  if (isElectron()) {
    const bridge = getElectronBridge()
    if (bridge?.saveFile) {
      const bytes = new Uint8Array(await blob.arrayBuffer())
      await bridge.saveFile(filename, bytes)
      return
    }
  }

  if (isCapacitorNative()) {
    const plugins = getCapacitorBridge()?.Plugins
    if (plugins?.Filesystem?.writeFile && plugins?.Share?.share) {
      const data = await blobToBase64(blob)
      const { uri } = await plugins.Filesystem.writeFile({
        path: filename,
        data,
        directory: 'CACHE',
        recursive: true,
      })
      await plugins.Share.share({
        title: filename,
        url: uri,
      })
      return
    }
  }

  triggerWebDownload(filename, blob)
}

/**
 * 跨平台打开外部链接：
 * - Electron 通过 shell.openExternal 打开系统默认浏览器；
 * - Capacitor 通过应用内浏览器标签页打开；
 * - Web 通过 window.open 打开。
 */
export const openExternalUrl = async (rawUrl: string): Promise<boolean> => {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return false
  }
  if (!ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
    return false
  }
  const url = parsed.toString()

  if (isElectron()) {
    const bridge = getElectronBridge()
    if (bridge?.openExternal) {
      await bridge.openExternal(url)
      return true
    }
  }

  if (isCapacitorNative()) {
    const browser = getCapacitorBridge()?.Plugins?.Browser
    if (browser?.open) {
      await browser.open({ url })
      return true
    }
  }

  window.open(url, '_blank', 'noopener,noreferrer')
  return true
}

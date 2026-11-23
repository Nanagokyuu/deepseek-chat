export type PlatformType = 'web' | 'electron' | 'ios' | 'android'

export type ElectronPlatformBridge = {
  platform?: string
  openExternal?: (url: string) => Promise<void> | void
  saveFile?: (filename: string, data: Uint8Array) => Promise<boolean>
}

export type CapacitorBridge = {
  isNativePlatform?: () => boolean
  getPlatform?: () => string
  Plugins?: {
    App?: {
      addListener?: (
        eventName: string,
        listener: (data: { canGoBack?: boolean }) => void
      ) => Promise<{ remove: () => Promise<void> }>
      exitApp?: () => Promise<void>
    }
    Browser?: {
      open?: (options: { url: string }) => Promise<void>
    }
    CapacitorHttp?: {
      request?: (options: {
        url: string
        method?: string
        headers?: Record<string, string>
        data?: unknown
        responseType?: 'text' | 'json' | 'arraybuffer' | 'blob'
      }) => Promise<{
        status: number
        headers: Record<string, string>
        data: unknown
      }>
    }
    Filesystem?: {
      writeFile?: (options: {
        path: string
        data: string
        directory: string
        recursive?: boolean
      }) => Promise<{ uri: string }>
    }
    Share?: {
      share?: (options: { title?: string; url?: string; files?: string[] }) => Promise<void>
    }
    StatusBar?: {
      setStyle?: (options: { style: 'DARK' | 'LIGHT' }) => Promise<void>
    }
  }
}

type PlatformWindow = Window & {
  Capacitor?: CapacitorBridge
  electronPlatform?: ElectronPlatformBridge
}

const getPlatformWindow = (): PlatformWindow | undefined =>
  typeof window === 'undefined' ? undefined : (window as PlatformWindow)

export const getCapacitorBridge = (): CapacitorBridge | undefined => getPlatformWindow()?.Capacitor

export const getElectronBridge = (): ElectronPlatformBridge | undefined =>
  getPlatformWindow()?.electronPlatform

export const isElectron = (): boolean => Boolean(getElectronBridge())

export const isCapacitorNative = (): boolean => {
  const cap = getCapacitorBridge()
  return Boolean(cap?.isNativePlatform?.())
}

export const getPlatformType = (): PlatformType => {
  if (isElectron()) {
    return 'electron'
  }
  const capPlatform = getCapacitorBridge()?.getPlatform?.()
  if (capPlatform === 'ios') {
    return 'ios'
  }
  if (capPlatform === 'android') {
    return 'android'
  }
  return 'web'
}

export const isMobileNative = (): boolean => {
  const platform = getPlatformType()
  return platform === 'ios' || platform === 'android'
}

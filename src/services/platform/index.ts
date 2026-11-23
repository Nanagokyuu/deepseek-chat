export {
  getCapacitorBridge,
  getElectronBridge,
  getPlatformType,
  isCapacitorNative,
  isElectron,
  isMobileNative,
  type CapacitorBridge,
  type ElectronPlatformBridge,
  type PlatformType,
} from './env.js'
export { platformFetch } from './http.js'
export { exportBlobFile, openExternalUrl } from './io.js'
export { bindPlatformBackButton, syncSystemStatusBar } from './lifecycle.js'

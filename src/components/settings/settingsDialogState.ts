import { create } from 'zustand'
import { getActiveProvider } from '../../services/settings.js'

/** 设置弹窗的分组：通用设置 / 模型与服务商 / 数据管理 */
export type SettingsSection = 'general' | 'providers' | 'data'

/** 设置弹窗：侧边栏底部、没有 API Key 时的操作与 401 提示都可以打开；section 为打开时选中的分组 */
export const useSettingsDialog = create(() => ({
  open: false,
  section: 'general' as SettingsSection,
}))

export const openSettings = (section: SettingsSection) =>
  useSettingsDialog.setState({ open: true, section })

export const closeSettings = () => useSettingsDialog.setState({ open: false })

/** 当前激活服务商缺少 API Key 时打开设置（本地 Ollama 等 localhost 服务除外） */
export const ensureApiKey = () => {
  const provider = getActiveProvider()
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(provider.baseUrl)
  if (provider.apiKey || isLocal) {
    return true
  }
  openSettings('data')
  return false
}

import { create } from 'zustand'
import { getActiveProvider } from '../../services/settings.js'
import { hasAnyReadyProvider, isProviderReady, openOnboarding } from './onboardingState.js'

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

/** 当前激活服务商未就绪时：若完全未配置任何服务商则启动引导向导，否则打开模型与服务商设置 */
export const ensureApiKey = () => {
  const provider = getActiveProvider()
  if (isProviderReady(provider)) {
    return true
  }
  if (!hasAnyReadyProvider()) {
    openOnboarding()
  } else {
    openSettings('providers')
  }
  return false
}

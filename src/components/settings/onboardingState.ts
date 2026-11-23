import { create } from 'zustand'
import type { ProviderConfig } from '../../services/api/providers/types.js'
import { useSettings } from '../../services/settings.js'

export const isLocalProviderUrl = (baseUrl: string): boolean =>
  /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(baseUrl.trim())

export const isProviderReady = (provider: ProviderConfig): boolean =>
  Boolean(provider.apiKey.trim()) || isLocalProviderUrl(provider.baseUrl)

export const hasAnyReadyProvider = (): boolean =>
  useSettings.getState().providers.some(isProviderReady)

export const useOnboardingDialog = create(() => ({ open: false }))

export const openOnboarding = () => useOnboardingDialog.setState({ open: true })

export const closeOnboarding = () => useOnboardingDialog.setState({ open: false })

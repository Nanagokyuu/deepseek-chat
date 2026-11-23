import { create } from 'zustand'
import {
  createDefaultDeepSeekProvider,
  DEFAULT_DEEPSEEK_PROVIDER_ID,
} from './api/providers/presets.js'
import type { ProviderConfig, ThinkingEffort } from './api/providers/types.js'
import type { TtsVoice } from './api/speech.js'
import { normalizeLocation, type UserLocation } from './location.js'

export type Locale = 'zh-CN' | 'en-US'

/** 主题偏好；默认跟随系统 */
export type ThemePreference = 'light' | 'dark' | 'system'

export type WebSearchEngine = 'none' | 'tavily' | 'brave' | 'serper' | 'searxng'
export type UrlReaderMode = 'auto' | 'direct' | 'jina' | 'off'

export type WebSearchConfig = {
  engine: WebSearchEngine
  apiKey: string
  baseUrl: string
  urlReader: UrlReaderMode
}

export type SpeechEngineMode = 'auto' | 'deepseek' | 'openai' | 'system'

export type SpeechConfig = {
  asrEngine: SpeechEngineMode
  ttsEngine: SpeechEngineMode
  baseUrl: string
  apiKey: string
  asrModel: string
  ttsModel: string
  openaiTtsVoice: string
}

/** 本机设置，存 localStorage */
type Settings = {
  apiKey: string | null
  providers: ProviderConfig[]
  activeProviderId: string
  activeModel: string
  webSearchConfig: WebSearchConfig
  speechConfig: SpeechConfig
  locale: Locale
  themePreference: ThemePreference
  location: UserLocation | null
  ttsVoice: TtsVoice
  thinking: boolean
  thinkingEffort: ThinkingEffort
  search: boolean
  siderCollapsed: boolean
}

const KEYS = {
  apiKey: 'chat-demo:api-key',
  providers: 'chat-demo:providers',
  activeProviderId: 'chat-demo:active-provider-id',
  activeModel: 'chat-demo:active-model',
  webSearchConfig: 'chat-demo:web-search-config',
  speechConfig: 'chat-demo:speech-config',
  locale: 'chat-demo:locale',
  location: 'chat-demo:location',
  themePreference: 'chat-demo:theme-preference',
  ttsVoice: 'chat-demo:tts-voice',
  thinking: 'chat-demo:thinking',
  thinkingEffort: 'chat-demo:thinking-effort',
  search: 'chat-demo:search',
  siderCollapsed: 'chat-demo:sider-collapsed',
} as const

const read = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const write = (key: string, value: string | null) => {
  try {
    if (value === null) {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, value)
    }
  } catch {
    // 存储不可用时只在内存中生效
  }
}

/** 位置选择模式跟随浏览器语言，与应用内选择的界面语言无关。 */
export const isChineseBrowser = (): boolean =>
  (typeof navigator === 'undefined' ? 'zh' : navigator.language).toLowerCase().startsWith('zh')

const initialLocale = (): Locale => {
  const saved = read(KEYS.locale)
  if (saved === 'zh-CN' || saved === 'en-US') {
    return saved
  }
  return isChineseBrowser() ? 'zh-CN' : 'en-US'
}

const initialLocation = (): UserLocation | null => {
  try {
    const location = normalizeLocation(JSON.parse(read(KEYS.location) ?? 'null'))
    if (!location) {
      return null
    }
    return isChineseBrowser()
      ? location.region === 'CN' && location.province
        ? location
        : null
      : { region: location.region }
  } catch {
    return null
  }
}

/** 未保存过时跟随系统 */
const initialThemePreference = (): ThemePreference => {
  const saved = read(KEYS.themePreference)
  return saved === 'light' || saved === 'dark' ? saved : 'system'
}

/** 未保存过时使用服务端默认音色 stella（海星） */
const initialTtsVoice = (): TtsVoice => (read(KEYS.ttsVoice) === 'tide' ? 'tide' : 'stella')

const initialThinkingEffort = (): ThinkingEffort => {
  const saved = read(KEYS.thinkingEffort)
  if (saved === 'off' || saved === 'low' || saved === 'medium' || saved === 'high') {
    return saved
  }
  return read(KEYS.thinking) === 'true' ? 'medium' : 'off'
}

const isValidProvider = (item: unknown): item is ProviderConfig =>
  typeof item === 'object' &&
  item !== null &&
  typeof (item as ProviderConfig).id === 'string' &&
  typeof (item as ProviderConfig).name === 'string' &&
  typeof (item as ProviderConfig).protocol === 'string' &&
  typeof (item as ProviderConfig).baseUrl === 'string' &&
  typeof (item as ProviderConfig).apiKey === 'string' &&
  Array.isArray((item as ProviderConfig).models)

const initialProviders = (): ProviderConfig[] => {
  const legacyKey = read(KEYS.apiKey) ?? ''
  try {
    const raw = read(KEYS.providers)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        const valid = parsed.filter(isValidProvider)
        if (valid.length > 0) {
          return valid
        }
      }
    }
  } catch {
    // 损坏时回退至默认 DeepSeek 配置
  }
  const defaults = [createDefaultDeepSeekProvider(legacyKey)]
  write(KEYS.providers, JSON.stringify(defaults))
  return defaults
}

const DEFAULT_WEB_SEARCH_CONFIG: WebSearchConfig = {
  engine: 'none',
  apiKey: '',
  baseUrl: '',
  urlReader: 'auto',
}

const DEFAULT_SPEECH_CONFIG: SpeechConfig = {
  asrEngine: 'auto',
  ttsEngine: 'auto',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  asrModel: 'whisper-1',
  ttsModel: 'tts-1',
  openaiTtsVoice: 'alloy',
}

const readJsonObject = <T extends Record<string, unknown>>(key: string, fallback: T): T => {
  try {
    const raw = read(key)
    if (!raw) {
      return fallback
    }
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return { ...fallback, ...(parsed as Partial<T>) }
    }
  } catch {
    // 忽略损坏配置
  }
  return fallback
}

const providersInit = initialProviders()
const savedActiveProviderId = read(KEYS.activeProviderId)
const initialActiveProvider =
  providersInit.find((p) => p.id === savedActiveProviderId) ?? providersInit[0]
const savedActiveModel = read(KEYS.activeModel)
const initialActiveModel =
  savedActiveModel && initialActiveProvider.models.includes(savedActiveModel)
    ? savedActiveModel
    : initialActiveProvider.defaultModel || initialActiveProvider.models[0] || ''

export const useSettings = create<Settings>(() => ({
  apiKey: initialActiveProvider.apiKey || read(KEYS.apiKey),
  providers: providersInit,
  activeProviderId: initialActiveProvider.id,
  activeModel: initialActiveModel,
  webSearchConfig: readJsonObject(KEYS.webSearchConfig, DEFAULT_WEB_SEARCH_CONFIG),
  speechConfig: readJsonObject(KEYS.speechConfig, DEFAULT_SPEECH_CONFIG),
  locale: initialLocale(),
  location: initialLocation(),
  themePreference: initialThemePreference(),
  ttsVoice: initialTtsVoice(),
  thinking: read(KEYS.thinking) === 'true',
  thinkingEffort: initialThinkingEffort(),
  search: read(KEYS.search) === 'true',
  siderCollapsed: read(KEYS.siderCollapsed) === 'true',
}))

export const getActiveProvider = (): ProviderConfig => {
  const { providers, activeProviderId } = useSettings.getState()
  return providers.find((p) => p.id === activeProviderId) ?? providers[0]
}

const persistProviders = (
  providers: ProviderConfig[],
  activeProviderId: string,
  activeModel: string
) => {
  write(KEYS.providers, JSON.stringify(providers))
  write(KEYS.activeProviderId, activeProviderId)
  write(KEYS.activeModel, activeModel)
  const active = providers.find((p) => p.id === activeProviderId) ?? providers[0]
  const legacyKey = active?.apiKey ? active.apiKey : null
  write(KEYS.apiKey, legacyKey)
  useSettings.setState({
    providers,
    activeProviderId: active.id,
    activeModel,
    apiKey: legacyKey,
  })
}

export const setActiveProvider = (providerId: string, model?: string) => {
  const { providers } = useSettings.getState()
  const target = providers.find((p) => p.id === providerId)
  if (!target) {
    return
  }
  const nextModel =
    model && target.models.includes(model) ? model : target.defaultModel || target.models[0] || ''
  persistProviders(providers, target.id, nextModel)
}

export const setActiveModel = (model: string) => {
  const { providers, activeProviderId } = useSettings.getState()
  const updated = providers.map((p) =>
    p.id === activeProviderId
      ? {
          ...p,
          defaultModel: model,
          models: p.models.includes(model) ? p.models : [...p.models, model],
        }
      : p
  )
  persistProviders(updated, activeProviderId, model)
}

export const upsertProvider = (config: ProviderConfig, activate = false) => {
  const { providers, activeProviderId, activeModel } = useSettings.getState()
  const exists = providers.some((p) => p.id === config.id)
  const nextProviders = exists
    ? providers.map((p) => (p.id === config.id ? config : p))
    : [...providers, config]
  const nextActiveId = activate ? config.id : activeProviderId
  const target = nextProviders.find((p) => p.id === nextActiveId) ?? nextProviders[0]
  const nextModel =
    nextActiveId === config.id
      ? config.models.includes(config.defaultModel)
        ? config.defaultModel
        : config.models[0] || ''
      : activeModel
  persistProviders(nextProviders, target.id, nextModel)
}

export const removeProvider = (providerId: string) => {
  const { providers, activeProviderId, activeModel } = useSettings.getState()
  if (providers.length <= 1) {
    return
  }
  const nextProviders = providers.filter((p) => p.id !== providerId)
  const nextActive = nextProviders.find((p) => p.id === activeProviderId) ?? nextProviders[0]
  const nextModel =
    nextActive.id === activeProviderId && nextActive.models.includes(activeModel)
      ? activeModel
      : nextActive.defaultModel || nextActive.models[0] || ''
  persistProviders(nextProviders, nextActive.id, nextModel)
}

export const setLocale = (locale: Locale) => {
  write(KEYS.locale, locale)
  useSettings.setState({ locale })
}

export const setLocation = (value: UserLocation | null) => {
  const location = normalizeLocation(value)
  write(KEYS.location, location ? JSON.stringify(location) : null)
  useSettings.setState({ location })
}

export const setThemePreference = (themePreference: ThemePreference) => {
  write(KEYS.themePreference, themePreference)
  useSettings.setState({ themePreference })
}

export const setTtsVoice = (ttsVoice: TtsVoice) => {
  write(KEYS.ttsVoice, ttsVoice)
  useSettings.setState({ ttsVoice })
}

/** 更新当前激活服务商的 API Key（兼容旧表单入口） */
export const setApiKey = (apiKey: string | null) => {
  const { providers, activeProviderId, activeModel } = useSettings.getState()
  const targetId = activeProviderId || DEFAULT_DEEPSEEK_PROVIDER_ID
  const updated = providers.map((p) => (p.id === targetId ? { ...p, apiKey: apiKey ?? '' } : p))
  persistProviders(updated, targetId, activeModel)
}

export const setThinking = (thinking: boolean) => {
  write(KEYS.thinking, String(thinking))
  const effort: ThinkingEffort = thinking
    ? useSettings.getState().thinkingEffort === 'off'
      ? 'medium'
      : useSettings.getState().thinkingEffort
    : 'off'
  write(KEYS.thinkingEffort, effort)
  useSettings.setState({ thinking, thinkingEffort: effort })
}

export const setThinkingEffort = (thinkingEffort: ThinkingEffort) => {
  const thinking = thinkingEffort !== 'off'
  write(KEYS.thinkingEffort, thinkingEffort)
  write(KEYS.thinking, String(thinking))
  useSettings.setState({ thinkingEffort, thinking })
}

export const setSearch = (search: boolean) => {
  write(KEYS.search, String(search))
  useSettings.setState({ search })
}

export const setSiderCollapsed = (siderCollapsed: boolean) => {
  write(KEYS.siderCollapsed, String(siderCollapsed))
  useSettings.setState({ siderCollapsed })
}

export const setWebSearchConfig = (patch: Partial<WebSearchConfig>) => {
  const next = { ...useSettings.getState().webSearchConfig, ...patch }
  write(KEYS.webSearchConfig, JSON.stringify(next))
  useSettings.setState({ webSearchConfig: next })
}

export const setSpeechConfig = (patch: Partial<SpeechConfig>) => {
  const next = { ...useSettings.getState().speechConfig, ...patch }
  write(KEYS.speechConfig, JSON.stringify(next))
  useSettings.setState({ speechConfig: next })
}

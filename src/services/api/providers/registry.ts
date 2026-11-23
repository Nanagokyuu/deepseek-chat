import { anthropicAdapter } from './anthropic.js'
import { deepseekAdapter } from './deepseek.js'
import { geminiAdapter } from './gemini.js'
import { openaiAdapter } from './openai.js'
import type { ChatProviderAdapter, ProviderProtocol } from './types.js'

const ADAPTERS: Record<ProviderProtocol, ChatProviderAdapter> = {
  deepseek: deepseekAdapter,
  'openai-compatible': openaiAdapter,
  anthropic: anthropicAdapter,
  gemini: geminiAdapter,
}

export const getProviderAdapter = (protocol: ProviderProtocol): ChatProviderAdapter =>
  ADAPTERS[protocol]

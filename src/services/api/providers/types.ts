import type { ResolvedAttachment } from '../../fileCompat.js'
import type { WebSearchConfig } from '../../settings.js'
import type { MessageParam, MessageStreamEvent } from '../types.js'

export type ProviderProtocol = 'deepseek' | 'openai-compatible' | 'anthropic' | 'gemini'

export type ThinkingEffort = 'off' | 'low' | 'medium' | 'high'

export type ThinkingProtocol =
  | 'auto'
  | 'deepseek'
  | 'openai-reasoning'
  | 'boolean'
  | 'anthropic'
  | 'gemini'
  | 'none'

export type ProviderConfig = {
  id: string
  name: string
  protocol: ProviderProtocol
  baseUrl: string
  apiKey: string
  models: string[]
  defaultModel: string
  thinkingProtocol?: ThinkingProtocol
  systemPrompt?: string
}

export type UnifiedChatRequest = {
  provider: ProviderConfig
  model: string
  system: string
  messages: MessageParam[]
  /** 按 user 消息出现顺序对应的非 DeepSeek 兼容附件 */
  userAttachments?: ResolvedAttachment[][]
  thinking: boolean
  thinkingEffort: ThinkingEffort
  search: boolean
  searchConfig?: WebSearchConfig
  latestReminder?: string
  enableTitle?: boolean
}

export interface ChatProviderAdapter {
  readonly protocol: ProviderProtocol
  verify(config: ProviderConfig, signal?: AbortSignal): Promise<string[]>
  streamChat(request: UnifiedChatRequest, signal: AbortSignal): AsyncGenerator<MessageStreamEvent>
  generateTitle?(
    config: ProviderConfig,
    model: string,
    userText: string,
    replyText: string,
    signal?: AbortSignal
  ): Promise<string | null>
}

export type ResolvedThinkingMode =
  | 'deepseek'
  | 'openai-reasoning'
  | 'boolean'
  | 'anthropic'
  | 'gemini'
  | 'none'

/** 根据服务商协议与模型名称推断实际使用的思考控制协议 */
export const resolveThinkingMode = (
  provider: Pick<ProviderConfig, 'protocol' | 'thinkingProtocol'>,
  model: string
): ResolvedThinkingMode => {
  const configured = provider.thinkingProtocol ?? 'auto'
  if (configured !== 'auto') {
    return configured
  }
  switch (provider.protocol) {
    case 'deepseek':
      return 'deepseek'
    case 'anthropic':
      return 'anthropic'
    case 'gemini':
      return 'gemini'
    case 'openai-compatible': {
      const lower = model.toLowerCase()
      if (/^(o1|o3|o4|gpt-5)/.test(lower) || lower.includes('reasoning')) {
        return 'openai-reasoning'
      }
      if (lower.includes('qwen3') || lower.includes('thinking')) {
        return 'boolean'
      }
      return 'none'
    }
  }
}

/** 是否支持多档位思考控制（DeepSeek 原生维持二元开关） */
export const supportsThinkingEffortLevels = (
  provider: Pick<ProviderConfig, 'protocol' | 'thinkingProtocol'>,
  model: string
): boolean => {
  const mode = resolveThinkingMode(provider, model)
  return mode === 'openai-reasoning' || mode === 'anthropic' || mode === 'gemini'
}

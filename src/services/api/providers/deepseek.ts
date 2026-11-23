import { streamMessage, verifyApiKey } from '../client.js'
import type { CreateMessageRequest } from '../types.js'
import type { ChatProviderAdapter, ProviderConfig, UnifiedChatRequest } from './types.js'

const buildDeepSeekTools = (search: boolean): CreateMessageRequest['tools'] => {
  const tools: CreateMessageRequest['tools'] = [
    { type: 'deepseek_read_url', name: 'deepseek_read_url' },
  ]
  if (search) {
    tools.push({ type: 'deepseek_web_search', name: 'deepseek_web_search' })
  }
  return tools
}

export const deepseekAdapter: ChatProviderAdapter = {
  protocol: 'deepseek',

  async verify(config: ProviderConfig, signal?: AbortSignal): Promise<string[]> {
    const models = await verifyApiKey(config.apiKey, signal, config.baseUrl)
    return models.length > 0 ? models : config.models
  },

  streamChat(request: UnifiedChatRequest, signal: AbortSignal) {
    const body: CreateMessageRequest = {
      model: request.model || request.provider.defaultModel || 'deepseek-flash',
      system: request.provider.systemPrompt || request.system,
      messages: request.messages,
      thinking: { type: request.thinking ? 'enabled' : 'disabled' },
      safety_check: { level: 'high' },
      tools: buildDeepSeekTools(request.search),
      ...(request.enableTitle ? { title: { enabled: true } } : {}),
    }
    return streamMessage(request.provider.apiKey, body, signal, request.provider.baseUrl)
  },
}

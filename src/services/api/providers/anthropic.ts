import type { ResolvedAttachment } from '../../fileCompat.js'
import { runClientToolsBeforeChat } from '../../tools/clientAgent.js'
import { ApiError, isErrorBody, readErrorResponse, request } from '../client.js'
import { readMessageEvent } from '../parseEvent.js'
import { readServerSentEvents } from '../sse.js'
import type { MessageParam, MessageStreamEvent } from '../types.js'
import type {
  ChatProviderAdapter,
  ProviderConfig,
  ThinkingEffort,
  UnifiedChatRequest,
} from './types.js'

const ANTHROPIC_VERSION = '2023-06-01'

const normalizeAnthropicBase = (baseUrl: string) =>
  baseUrl.trim().replace(/\/+$/, '').replace(/\/v1$/, '')

const THINKING_BUDGET: Record<Exclude<ThinkingEffort, 'off'>, number> = {
  low: 2048,
  medium: 8192,
  high: 16384,
}

const anthropicHeaders = (apiKey: string): Record<string, string> => ({
  'x-api-key': apiKey,
  'anthropic-version': ANTHROPIC_VERSION,
  'anthropic-dangerous-direct-browser-access': 'true',
})

const toAnthropicMessages = (
  messages: MessageParam[],
  userAttachments?: ResolvedAttachment[][]
): { messages: unknown[]; reminder?: string } => {
  const result: unknown[] = []
  let reminder: string | undefined
  let userIndex = 0

  for (const msg of messages) {
    if (msg.role === 'latest_reminder') {
      reminder = msg.content
      continue
    }
    if (msg.role === 'user') {
      const attachments = userAttachments?.[userIndex] ?? []
      userIndex += 1
      const baseText =
        typeof msg.content === 'string'
          ? msg.content
          : msg.content
              .filter((block) => block.type === 'text')
              .map((block) => block.text)
              .join('\n')

      const docTexts = attachments
        .filter((a): a is Extract<ResolvedAttachment, { kind: 'text' }> => a.kind === 'text')
        .map((a) => `<attachment name="${a.name}">\n${a.text}\n</attachment>`)
        .join('\n\n')
      const fullText = [baseText, docTexts].filter(Boolean).join('\n\n')

      const blocks: unknown[] = []
      for (const att of attachments) {
        if (att.kind === 'image') {
          blocks.push({
            type: 'image',
            source: { type: 'base64', media_type: att.mimeType, data: att.base64 },
          })
        } else if (att.kind === 'pdf-binary') {
          blocks.push({
            type: 'document',
            source: { type: 'base64', media_type: att.mimeType, data: att.base64 },
          })
        }
      }
      if (fullText) {
        blocks.push({ type: 'text', text: fullText })
      }
      if (blocks.length > 0) {
        result.push({ role: 'user', content: blocks })
      }
      continue
    }
    const text = msg.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
    if (text) {
      result.push({ role: 'assistant', content: [{ type: 'text', text }] })
    }
  }
  return { messages: result, reminder }
}

export const anthropicAdapter: ChatProviderAdapter = {
  protocol: 'anthropic',

  async verify(config: ProviderConfig, signal?: AbortSignal): Promise<string[]> {
    const base = normalizeAnthropicBase(config.baseUrl)
    try {
      const response = await request(`${base}/v1/models`, {
        method: 'GET',
        headers: anthropicHeaders(config.apiKey),
        signal,
      })
      const body = (await response.json()) as { data?: { id?: string }[] }
      const models = (body.data ?? [])
        .map((item) => item.id)
        .filter((id): id is string => typeof id === 'string')
      return models.length > 0 ? models : config.models
    } catch (error) {
      // 部分 Anthropic 兼容网关未实现 /v1/models，仅在 401/403 时抛出鉴权失败
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        throw error
      }
      if (error instanceof ApiError && error.status === 404) {
        return config.models
      }
      throw error
    }
  },

  async *streamChat(
    req: UnifiedChatRequest,
    signal: AbortSignal
  ): AsyncGenerator<MessageStreamEvent> {
    const base = normalizeAnthropicBase(req.provider.baseUrl)
    const model = req.model || req.provider.defaultModel
    let effectiveMessages = req.messages
    if (req.searchConfig) {
      for await (const toolEvent of runClientToolsBeforeChat(
        req.messages,
        { enableSearch: req.search, searchConfig: req.searchConfig, model },
        signal,
        (updated) => {
          effectiveMessages = updated
        }
      )) {
        yield toolEvent
      }
    }
    const { messages, reminder } = toAnthropicMessages(effectiveMessages, req.userAttachments)
    const systemParts = [req.provider.systemPrompt?.trim(), reminder ? `Context: ${reminder}` : '']
      .filter(Boolean)
      .join('\n\n')

    const budget = req.thinkingEffort === 'off' ? 0 : THINKING_BUDGET[req.thinkingEffort]
    const thinkingEnabled = budget > 0
    const body: Record<string, unknown> = {
      model,
      max_tokens: thinkingEnabled ? budget + 8192 : 8192,
      messages,
      stream: true,
      ...(systemParts ? { system: systemParts } : {}),
      ...(thinkingEnabled ? { thinking: { type: 'enabled', budget_tokens: budget } } : {}),
    }

    const response = await request(`${base}/v1/messages`, {
      method: 'POST',
      headers: {
        ...anthropicHeaders(req.provider.apiKey),
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(body),
      signal,
    })

    const contentType = response.headers.get('Content-Type') ?? ''
    if (!response.body || !contentType.includes('text/event-stream')) {
      throw await readErrorResponse(response, 'protocol', '')
    }

    for await (const { event: eventName, data } of readServerSentEvents(response.body, signal)) {
      let payload: unknown
      try {
        payload = JSON.parse(data)
      } catch {
        if (eventName !== 'error') {
          continue
        }
      }
      if (isErrorBody(payload)) {
        throw new ApiError('stream', payload.error.message)
      }
      if (eventName === 'error') {
        throw new ApiError('stream', data)
      }
      const event = readMessageEvent(payload)
      if (!event) {
        continue
      }
      yield event
      if (event.type === 'message_stop') {
        return
      }
    }
    throw new ApiError('interrupted', '')
  },

  async generateTitle(
    config: ProviderConfig,
    model: string,
    userText: string,
    replyText: string,
    signal?: AbortSignal
  ): Promise<string | null> {
    const base = normalizeAnthropicBase(config.baseUrl)
    try {
      const response = await request(`${base}/v1/messages`, {
        method: 'POST',
        headers: {
          ...anthropicHeaders(config.apiKey),
          'Content-Type': 'application/json',
        },
        signal,
        body: JSON.stringify({
          model,
          max_tokens: 32,
          system:
            'Generate a concise chat title (under 15 words, no quotes, same language as the user). Output only the title.',
          messages: [
            {
              role: 'user',
              content: `User: ${userText.slice(0, 400)}\nAssistant: ${replyText.slice(0, 400)}`,
            },
          ],
        }),
      })
      const body = (await response.json()) as {
        content?: { type?: string; text?: string }[]
      }
      const title = body.content
        ?.find((b) => b.type === 'text')
        ?.text?.trim()
        .replace(/^["'「『]+|["'」』]+$/g, '')
      return title || null
    } catch {
      return null
    }
  },
}

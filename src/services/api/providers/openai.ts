import type { ResolvedAttachment } from '../../fileCompat.js'
import { runClientToolsBeforeChat } from '../../tools/clientAgent.js'
import { ApiError, isErrorBody, readErrorResponse, request } from '../client.js'
import { readServerSentEvents } from '../sse.js'
import type { MessageParam, MessageStreamEvent, StopReason } from '../types.js'
import {
  resolveThinkingMode,
  type ChatProviderAdapter,
  type ProviderConfig,
  type UnifiedChatRequest,
} from './types.js'

const normalizeBaseUrl = (baseUrl: string) => baseUrl.trim().replace(/\/+$/, '')

type OpenAIContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

type OpenAIMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string | OpenAIContentPart[]
}

/** 将内部 MessageParam 与兼容附件转换为标准 OpenAI Chat Completions 消息列表 */
const toOpenAIMessages = (
  system: string,
  messages: MessageParam[],
  userAttachments?: ResolvedAttachment[][],
  latestReminder?: string
): OpenAIMessage[] => {
  const result: OpenAIMessage[] = []
  let activeReminder = latestReminder
  let userIndex = 0

  for (const msg of messages) {
    if (msg.role === 'latest_reminder') {
      activeReminder = msg.content
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
      const images = attachments.filter(
        (a): a is Extract<ResolvedAttachment, { kind: 'image' }> => a.kind === 'image'
      )

      if (images.length > 0) {
        const parts: OpenAIContentPart[] = images.map((img) => ({
          type: 'image_url',
          image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
        }))
        if (fullText) {
          parts.push({ type: 'text', text: fullText })
        }
        result.push({ role: 'user', content: parts })
      } else if (fullText) {
        result.push({ role: 'user', content: fullText })
      }
      continue
    }
    const assistantText = msg.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
    if (assistantText) {
      result.push({ role: 'assistant', content: assistantText })
    }
  }

  const systemParts = [system.trim()]
  if (activeReminder?.trim()) {
    systemParts.push(`Context: ${activeReminder.trim()}`)
  }
  const fullSystem = systemParts.filter(Boolean).join('\n\n')
  if (fullSystem) {
    result.unshift({ role: 'system', content: fullSystem })
  }
  return result
}

const mapFinishReason = (reason: unknown): StopReason => {
  if (reason === 'length') {
    return 'max_tokens'
  }
  if (reason === 'tool_calls') {
    return 'tool_use'
  }
  if (reason === 'content_filter') {
    return 'refusal'
  }
  return 'end_turn'
}

/**
 * 增量拆解正文中的 `<think>...</think>` 标签，兼容未单独拆分 `reasoning_content` 的模型。
 */
class ThinkTagSplitter {
  private inThink = false
  private buffer = ''

  push(chunk: string): { kind: 'thinking' | 'text'; value: string }[] {
    this.buffer += chunk
    const out: { kind: 'thinking' | 'text'; value: string }[] = []

    while (this.buffer.length > 0) {
      if (!this.inThink) {
        const openIdx = this.buffer.indexOf('<think>')
        if (openIdx === -1) {
          // 保留可能是不完整 `<think>` 前缀的尾部字符
          const safeLen = this.safePrefixLength(this.buffer, '<think>')
          if (safeLen > 0) {
            out.push({ kind: 'text', value: this.buffer.slice(0, safeLen) })
            this.buffer = this.buffer.slice(safeLen)
          }
          break
        }
        if (openIdx > 0) {
          out.push({ kind: 'text', value: this.buffer.slice(0, openIdx) })
        }
        this.buffer = this.buffer.slice(openIdx + '<think>'.length)
        this.inThink = true
      } else {
        const closeIdx = this.buffer.indexOf('</think>')
        if (closeIdx === -1) {
          const safeLen = this.safePrefixLength(this.buffer, '</think>')
          if (safeLen > 0) {
            out.push({ kind: 'thinking', value: this.buffer.slice(0, safeLen) })
            this.buffer = this.buffer.slice(safeLen)
          }
          break
        }
        if (closeIdx > 0) {
          out.push({ kind: 'thinking', value: this.buffer.slice(0, closeIdx) })
        }
        this.buffer = this.buffer.slice(closeIdx + '</think>'.length)
        this.inThink = false
      }
    }
    return out
  }

  flush(): { kind: 'thinking' | 'text'; value: string }[] {
    if (!this.buffer) {
      return []
    }
    const out = [
      { kind: this.inThink ? ('thinking' as const) : ('text' as const), value: this.buffer },
    ]
    this.buffer = ''
    return out
  }

  private safePrefixLength(text: string, tag: string): number {
    for (let i = Math.min(text.length, tag.length - 1); i > 0; i--) {
      if (tag.startsWith(text.slice(-i))) {
        return text.length - i
      }
    }
    return text.length
  }
}

export const openaiAdapter: ChatProviderAdapter = {
  protocol: 'openai-compatible',

  async verify(config: ProviderConfig, signal?: AbortSignal): Promise<string[]> {
    const baseUrl = normalizeBaseUrl(config.baseUrl)
    const headers: Record<string, string> = {}
    if (config.apiKey) {
      headers.Authorization = `Bearer ${config.apiKey}`
    }
    const response = await request(`${baseUrl}/models`, {
      method: 'GET',
      headers,
      signal,
    })
    try {
      const body: unknown = await response.json()
      if (
        typeof body === 'object' &&
        body !== null &&
        'data' in body &&
        Array.isArray((body as { data: unknown }).data)
      ) {
        const models = (body as { data: unknown[] }).data
          .map((item) =>
            typeof item === 'object' &&
            item !== null &&
            typeof (item as { id?: unknown }).id === 'string'
              ? (item as { id: string }).id
              : null
          )
          .filter((id): id is string => id !== null)
        return models.length > 0 ? models : config.models
      }
    } catch {
      // 部分兼容接口不返回 JSON 模型数组
    }
    return config.models
  },

  async *streamChat(
    req: UnifiedChatRequest,
    signal: AbortSignal
  ): AsyncGenerator<MessageStreamEvent> {
    const baseUrl = normalizeBaseUrl(req.provider.baseUrl)
    const model = req.model || req.provider.defaultModel
    const systemPrompt = req.provider.systemPrompt ?? ''
    let effectiveMessages = req.messages
    let nextBlockIndex = 0
    let started = false

    if (req.searchConfig) {
      for await (const toolEvent of runClientToolsBeforeChat(
        req.messages,
        { enableSearch: req.search, searchConfig: req.searchConfig, model },
        signal,
        (updated) => {
          effectiveMessages = updated
        }
      )) {
        if (toolEvent.type === 'message_start') {
          started = true
        } else if (toolEvent.type === 'content_block_start') {
          nextBlockIndex = Math.max(nextBlockIndex, toolEvent.index + 1)
        }
        yield toolEvent
      }
    }

    const messages = toOpenAIMessages(
      systemPrompt,
      effectiveMessages,
      req.userAttachments,
      req.latestReminder
    )
    const thinkingMode = resolveThinkingMode(req.provider, model)

    const payload: Record<string, unknown> = {
      model,
      messages,
      stream: true,
    }
    if (thinkingMode === 'openai-reasoning' && req.thinkingEffort !== 'off') {
      payload.reasoning_effort = req.thinkingEffort
    } else if (thinkingMode === 'boolean') {
      payload.enable_thinking = req.thinkingEffort !== 'off'
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    }
    if (req.provider.apiKey) {
      headers.Authorization = `Bearer ${req.provider.apiKey}`
    }

    const response = await request(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal,
    })
    const contentType = response.headers.get('Content-Type') ?? ''
    if (!response.body || !contentType.includes('text/event-stream')) {
      throw await readErrorResponse(response, 'protocol', '')
    }

    let currentKind: 'thinking' | 'text' | null = null
    let currentBlockIndex = -1
    let stopReason: StopReason = 'end_turn'
    const splitter = new ThinkTagSplitter()

    const ensureStart = function* (): Generator<MessageStreamEvent> {
      if (!started) {
        started = true
        yield {
          type: 'message_start',
          message: { id: crypto.randomUUID(), model },
        }
      }
    }

    const emitSegment = function* (
      kind: 'thinking' | 'text',
      value: string
    ): Generator<MessageStreamEvent> {
      if (!value) {
        return
      }
      yield* ensureStart()
      if (currentKind !== kind) {
        if (currentKind !== null) {
          yield { type: 'content_block_stop', index: currentBlockIndex }
        }
        currentKind = kind
        currentBlockIndex = nextBlockIndex++
        yield {
          type: 'content_block_start',
          index: currentBlockIndex,
          content_block:
            kind === 'thinking'
              ? { type: 'thinking', thinking: '', signature: '' }
              : { type: 'text', text: '' },
        }
      }
      yield {
        type: 'content_block_delta',
        index: currentBlockIndex,
        delta:
          kind === 'thinking'
            ? { type: 'thinking_delta', thinking: value }
            : { type: 'text_delta', text: value },
      }
    }

    for await (const { data } of readServerSentEvents(response.body, signal)) {
      if (data === '[DONE]') {
        break
      }
      let chunk: unknown
      try {
        chunk = JSON.parse(data)
      } catch {
        continue
      }
      if (isErrorBody(chunk)) {
        throw new ApiError('stream', chunk.error.message)
      }
      if (typeof chunk !== 'object' || chunk === null) {
        continue
      }
      const choices = (chunk as { choices?: unknown }).choices
      if (!Array.isArray(choices) || choices.length === 0) {
        continue
      }
      const choice = choices[0] as {
        delta?: {
          content?: unknown
          reasoning_content?: unknown
          reasoning?: unknown
        }
        finish_reason?: unknown
      }
      if (choice.finish_reason) {
        stopReason = mapFinishReason(choice.finish_reason)
      }
      const delta = choice.delta
      if (!delta) {
        continue
      }
      const reasoning =
        typeof delta.reasoning_content === 'string'
          ? delta.reasoning_content
          : typeof delta.reasoning === 'string'
            ? delta.reasoning
            : ''
      if (reasoning) {
        yield* emitSegment('thinking', reasoning)
      }
      if (typeof delta.content === 'string' && delta.content.length > 0) {
        for (const seg of splitter.push(delta.content)) {
          yield* emitSegment(seg.kind, seg.value)
        }
      }
    }

    for (const seg of splitter.flush()) {
      yield* emitSegment(seg.kind, seg.value)
    }
    yield* ensureStart()
    if (currentKind !== null) {
      yield { type: 'content_block_stop', index: currentBlockIndex }
    }
    yield {
      type: 'message_delta',
      delta: { stop_reason: stopReason, stop_sequence: null },
    }
    yield { type: 'message_stop' }
  },

  async generateTitle(
    config: ProviderConfig,
    model: string,
    userText: string,
    replyText: string,
    signal?: AbortSignal
  ): Promise<string | null> {
    const baseUrl = normalizeBaseUrl(config.baseUrl)
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (config.apiKey) {
      headers.Authorization = `Bearer ${config.apiKey}`
    }
    try {
      const response = await request(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        signal,
        body: JSON.stringify({
          model,
          max_tokens: 32,
          temperature: 0.3,
          messages: [
            {
              role: 'system',
              content:
                'Generate a concise chat title (under 15 words, no quotes, same language as the user). Output only the title.',
            },
            {
              role: 'user',
              content: `User: ${userText.slice(0, 400)}\nAssistant: ${replyText.slice(0, 400)}`,
            },
          ],
        }),
      })
      const body = (await response.json()) as {
        choices?: { message?: { content?: string } }[]
      }
      const title = body.choices?.[0]?.message?.content
        ?.trim()
        .replace(/^["'「『]+|["'」』]+$/g, '')
      return title || null
    } catch {
      return null
    }
  },
}

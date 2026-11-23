import type { ResolvedAttachment } from '../../fileCompat.js'
import { ApiError, isErrorBody, readErrorResponse, request } from '../client.js'
import { readServerSentEvents } from '../sse.js'
import type { MessageParam, MessageStreamEvent, StopReason, TextCitation } from '../types.js'
import type {
  ChatProviderAdapter,
  ProviderConfig,
  ThinkingEffort,
  UnifiedChatRequest,
} from './types.js'

const normalizeGeminiBase = (baseUrl: string) =>
  baseUrl
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/v1beta$/, '')

const THINKING_BUDGET: Record<Exclude<ThinkingEffort, 'off'>, number> = {
  low: 2048,
  medium: 8192,
  high: 16384,
}

type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } }

const toGeminiContents = (messages: MessageParam[], userAttachments?: ResolvedAttachment[][]) => {
  const contents: { role: 'user' | 'model'; parts: GeminiPart[] }[] = []
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

      const parts: GeminiPart[] = []
      for (const att of attachments) {
        if (att.kind === 'image' || att.kind === 'pdf-binary') {
          parts.push({ inlineData: { mimeType: att.mimeType, data: att.base64 } })
        }
      }
      if (fullText) {
        parts.push({ text: fullText })
      }
      if (parts.length > 0) {
        contents.push({ role: 'user', parts })
      }
      continue
    }
    const text = msg.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
    if (text) {
      contents.push({ role: 'model', parts: [{ text }] })
    }
  }
  return { contents, reminder }
}

const mapFinishReason = (reason: unknown): StopReason => {
  if (reason === 'MAX_TOKENS') {
    return 'max_tokens'
  }
  if (reason === 'SAFETY' || reason === 'RECITATION') {
    return 'refusal'
  }
  return 'end_turn'
}

export const geminiAdapter: ChatProviderAdapter = {
  protocol: 'gemini',

  async verify(config: ProviderConfig, signal?: AbortSignal): Promise<string[]> {
    const base = normalizeGeminiBase(config.baseUrl)
    const response = await request(`${base}/v1beta/models`, {
      method: 'GET',
      headers: { 'x-goog-api-key': config.apiKey },
      signal,
    })
    const body = (await response.json()) as {
      models?: { name?: string; supportedGenerationMethods?: string[] }[]
    }
    const models = (body.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => (m.name ?? '').replace(/^models\//, ''))
      .filter(Boolean)
    return models.length > 0 ? models : config.models
  },

  async *streamChat(
    req: UnifiedChatRequest,
    signal: AbortSignal
  ): AsyncGenerator<MessageStreamEvent> {
    const base = normalizeGeminiBase(req.provider.baseUrl)
    const model = req.model || req.provider.defaultModel
    const { contents, reminder } = toGeminiContents(req.messages, req.userAttachments)
    const systemText = [req.provider.systemPrompt?.trim(), reminder ? `Context: ${reminder}` : '']
      .filter(Boolean)
      .join('\n\n')

    const thinkingConfig =
      req.thinkingEffort === 'off'
        ? { thinkingBudget: 0 }
        : { includeThoughts: true, thinkingBudget: THINKING_BUDGET[req.thinkingEffort] }

    const body: Record<string, unknown> = {
      contents,
      generationConfig: { thinkingConfig },
      ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
      ...(req.search ? { tools: [{ google_search: {} }] } : {}),
    }

    const response = await request(
      `${base}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
      {
        method: 'POST',
        headers: {
          'x-goog-api-key': req.provider.apiKey,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(body),
        signal,
      }
    )

    const contentType = response.headers.get('Content-Type') ?? ''
    if (!response.body || !contentType.includes('text/event-stream')) {
      throw await readErrorResponse(response, 'protocol', '')
    }

    let started = false
    let nextBlockIndex = 0
    let currentKind: 'thinking' | 'text' | null = null
    let currentBlockIndex = -1
    let stopReason: StopReason = 'end_turn'
    let emittedGrounding = false

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
      const candidates = (chunk as { candidates?: unknown }).candidates
      if (!Array.isArray(candidates) || candidates.length === 0) {
        continue
      }
      const candidate = candidates[0] as {
        content?: { parts?: { text?: string; thought?: boolean }[] }
        finishReason?: unknown
        groundingMetadata?: {
          webSearchQueries?: string[]
          groundingChunks?: { web?: { uri?: string; title?: string } }[]
        }
      }
      if (candidate.finishReason) {
        stopReason = mapFinishReason(candidate.finishReason)
      }

      // 优先把 Google Search Grounding 元数据映射为内置搜索块
      const grounding = candidate.groundingMetadata
      if (
        !emittedGrounding &&
        grounding &&
        (grounding.webSearchQueries?.length || grounding.groundingChunks?.length)
      ) {
        emittedGrounding = true
        yield* ensureStart()
        if (currentKind !== null) {
          yield { type: 'content_block_stop', index: currentBlockIndex }
          currentKind = null
        }
        const toolId = `srvtoolu_s_gemini_${crypto.randomUUID().slice(0, 8)}`
        const queries = grounding.webSearchQueries ?? []
        const useIndex = nextBlockIndex++
        yield {
          type: 'content_block_start',
          index: useIndex,
          content_block: {
            type: 'server_tool_use',
            id: toolId,
            name: 'deepseek_web_search',
            kind: 'search',
            caller: { type: 'direct' },
            input: { action: 'search', queries },
          },
        }
        yield { type: 'content_block_stop', index: useIndex }

        const results = (grounding.groundingChunks ?? [])
          .filter((item) => typeof item.web?.uri === 'string')
          .map((item) => ({
            type: 'web_search_result' as const,
            url: item.web?.uri ?? '',
            title: item.web?.title || item.web?.uri || '',
            snippet: '',
            site_icon: null,
            site_name: null,
            encrypted_content: '',
            page_age: null,
          }))
        const resultIndex = nextBlockIndex++
        yield {
          type: 'content_block_start',
          index: resultIndex,
          content_block: {
            type: 'web_search_tool_result',
            tool_use_id: toolId,
            kind: 'search',
            content: results,
          },
        }
        yield { type: 'content_block_stop', index: resultIndex }

        if (results.length > 0 && currentKind === 'text') {
          const citation: TextCitation = {
            type: 'web_search_result_location',
            url: results[0].url,
            title: results[0].title,
            cited_text: '',
            encrypted_index: '',
          }
          yield {
            type: 'content_block_delta',
            index: currentBlockIndex,
            delta: { type: 'citations_delta', citation },
          }
        }
      }

      for (const part of candidate.content?.parts ?? []) {
        if (typeof part.text === 'string' && part.text.length > 0) {
          yield* emitSegment(part.thought ? 'thinking' : 'text', part.text)
        }
      }
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
    const base = normalizeGeminiBase(config.baseUrl)
    try {
      const response = await request(
        `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: {
            'x-goog-api-key': config.apiKey,
            'Content-Type': 'application/json',
          },
          signal,
          body: JSON.stringify({
            systemInstruction: {
              parts: [
                {
                  text: 'Generate a concise chat title (under 15 words, no quotes, same language as the user). Output only the title.',
                },
              ],
            },
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: `User: ${userText.slice(0, 400)}\nAssistant: ${replyText.slice(0, 400)}`,
                  },
                ],
              },
            ],
            generationConfig: { maxOutputTokens: 32, thinkingConfig: { thinkingBudget: 0 } },
          }),
        }
      )
      const body = (await response.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[]
      }
      const title = body.candidates?.[0]?.content?.parts?.[0]?.text
        ?.trim()
        .replace(/^["'「『]+|["'」』]+$/g, '')
      return title || null
    } catch {
      return null
    }
  },
}

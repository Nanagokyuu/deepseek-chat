import type { MessageParam, MessageStreamEvent, WebSearchResult } from '../api/types.js'
import type { WebSearchConfig } from '../settings.js'
import { extractUrls, readWebPage } from './urlReader.js'
import { runClientWebSearch } from './webSearch.js'

const getLastUserText = (messages: MessageParam[]): string => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role === 'user') {
      return typeof msg.content === 'string'
        ? msg.content
        : msg.content
            .filter((b) => b.type === 'text')
            .map((b) => b.text)
            .join('\n')
    }
  }
  return ''
}

const appendContextToLastUser = (
  messages: MessageParam[],
  extraContext: string
): MessageParam[] => {
  if (!extraContext.trim()) {
    return messages
  }
  const next = [...messages]
  for (let i = next.length - 1; i >= 0; i--) {
    const msg = next[i]
    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        next[i] = { ...msg, content: `${msg.content}\n\n${extraContext}` }
      } else {
        next[i] = {
          ...msg,
          content: [...msg.content, { type: 'text', text: `\n\n${extraContext}` }],
        }
      }
      break
    }
  }
  return next
}

export type ClientToolsResult = {
  events: MessageStreamEvent[]
  messages: MessageParam[]
}

/**
 * 为非原生支持搜索/链接阅读的厂商执行客户端工具预处理：
 * 1. 自动抓取用户消息中的链接正文（若未关闭 urlReader）；
 * 2. 若开启 search 且配置了第三方搜索引擎，执行搜索并生成内置搜索结果块事件，
 *    使现有 SearchPanel 与引用 UI 完整生效。
 */
export async function* runClientToolsBeforeChat(
  messages: MessageParam[],
  options: {
    enableSearch: boolean
    searchConfig: WebSearchConfig
    model: string
  },
  signal: AbortSignal,
  onDone: (updatedMessages: MessageParam[]) => void
): AsyncGenerator<MessageStreamEvent> {
  const userText = getLastUserText(messages)
  const urls = options.searchConfig.urlReader === 'off' ? [] : extractUrls(userText)
  const shouldSearch =
    options.enableSearch &&
    options.searchConfig.engine !== 'none' &&
    (options.searchConfig.engine === 'searxng'
      ? Boolean(options.searchConfig.baseUrl.trim())
      : Boolean(options.searchConfig.apiKey.trim()))

  if (urls.length === 0 && !shouldSearch) {
    onDone(messages)
    return
  }

  let blockIndex = 0
  const contextSections: string[] = []
  yield {
    type: 'message_start',
    message: { id: crypto.randomUUID(), model: options.model },
  }

  // 1. 客户端链接阅读
  for (const url of urls) {
    const toolId = `srvtoolu_rl_client_${crypto.randomUUID().slice(0, 8)}`
    const useIdx = blockIndex++
    yield {
      type: 'content_block_start',
      index: useIdx,
      content_block: {
        type: 'server_tool_use',
        id: toolId,
        name: 'deepseek_read_url',
        kind: 'read_link',
        caller: { type: 'direct' },
        input: { action: 'read_link', url },
      },
    }
    yield { type: 'content_block_stop', index: useIdx }

    const resIdx = blockIndex++
    try {
      const page = await readWebPage(url, options.searchConfig.urlReader, signal)
      yield {
        type: 'content_block_start',
        index: resIdx,
        content_block: {
          type: 'web_fetch_tool_result',
          tool_use_id: toolId,
          kind: 'read_link',
          content: {
            type: 'web_fetch_result',
            url: page.url,
            published_at: null,
            content: {
              type: 'document',
              title: page.title,
              source: { type: 'text', media_type: 'text/plain', data: '' },
            },
          },
        },
      }
      contextSections.push(
        `[Web Page Content]\nURL: ${page.url}\nTitle: ${page.title ?? 'N/A'}\nContent:\n${page.content}`
      )
    } catch {
      signal.throwIfAborted()
      yield {
        type: 'content_block_start',
        index: resIdx,
        content_block: {
          type: 'web_fetch_tool_result',
          tool_use_id: toolId,
          kind: 'read_link',
          content: {
            type: 'web_fetch_tool_result_error',
            error_code: 'url_not_accessible',
          },
        },
      }
    }
    yield { type: 'content_block_stop', index: resIdx }
  }

  // 2. 客户端联网搜索
  if (shouldSearch) {
    const query =
      userText
        .replace(/https?:\/\/\S+/g, '')
        .trim()
        .slice(0, 200) || userText.slice(0, 200)
    const toolId = `srvtoolu_s_client_${crypto.randomUUID().slice(0, 8)}`
    const useIdx = blockIndex++
    yield {
      type: 'content_block_start',
      index: useIdx,
      content_block: {
        type: 'server_tool_use',
        id: toolId,
        name: 'deepseek_web_search',
        kind: 'search',
        caller: { type: 'direct' },
        input: { action: 'search', queries: [query] },
      },
    }
    yield { type: 'content_block_stop', index: useIdx }

    const resIdx = blockIndex++
    let results: WebSearchResult[] = []
    try {
      results = await runClientWebSearch(query, options.searchConfig, signal)
      yield {
        type: 'content_block_start',
        index: resIdx,
        content_block: {
          type: 'web_search_tool_result',
          tool_use_id: toolId,
          kind: 'search',
          content: results,
        },
      }
      if (results.length > 0) {
        const formatted = results
          .map((r, idx) => `[${idx + 1}] ${r.title}\nURL: ${r.url}\nSnippet: ${r.snippet || 'N/A'}`)
          .join('\n\n')
        contextSections.push(
          `[Web Search Results]\nUse these up-to-date search results to answer the user's question accurately and cite sources with links when helpful:\n\n${formatted}`
        )
      }
    } catch {
      signal.throwIfAborted()
      yield {
        type: 'content_block_start',
        index: resIdx,
        content_block: {
          type: 'web_search_tool_result',
          tool_use_id: toolId,
          kind: 'search',
          content: [{ type: 'web_search_tool_result_error', error_code: 'unavailable' }],
        },
      }
    }
    yield { type: 'content_block_stop', index: resIdx }
  }

  onDone(appendContextToLastUser(messages, contextSections.join('\n\n')))
}

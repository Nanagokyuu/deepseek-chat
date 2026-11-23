import { platformFetch } from '../platform/http.js'
import type { WebSearchResult } from '../api/types.js'
import type { WebSearchConfig } from '../settings.js'

const hostnameOf = (url: string): string | null => {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || null
  } catch {
    return null
  }
}

const makeResult = (
  url: string,
  title: string,
  snippet: string,
  pageAge: string | null = null
): WebSearchResult => ({
  type: 'web_search_result',
  url,
  title: title || url,
  snippet,
  site_icon: null,
  site_name: hostnameOf(url),
  encrypted_content: '',
  page_age: pageAge,
})

const searchTavily = async (
  query: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<WebSearchResult[]> => {
  const res = await platformFetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: 6,
      include_answer: false,
    }),
  })
  if (!res.ok) {
    throw new Error(`Tavily error (${res.status})`)
  }
  const data = (await res.json()) as {
    results?: { url?: string; title?: string; content?: string }[]
  }
  return (data.results ?? [])
    .filter((r) => typeof r.url === 'string')
    .map((r) => makeResult(r.url ?? '', r.title ?? '', r.content ?? ''))
}

const searchBrave = async (
  query: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<WebSearchResult[]> => {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=6`
  const res = await platformFetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': apiKey,
    },
    signal,
  })
  if (!res.ok) {
    throw new Error(`Brave Search error (${res.status})`)
  }
  const data = (await res.json()) as {
    web?: { results?: { url?: string; title?: string; description?: string; age?: string }[] }
  }
  return (data.web?.results ?? [])
    .filter((r) => typeof r.url === 'string')
    .map((r) => makeResult(r.url ?? '', r.title ?? '', r.description ?? '', r.age ?? null))
}

const searchSerper = async (
  query: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<WebSearchResult[]> => {
  const res = await platformFetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey,
    },
    signal,
    body: JSON.stringify({ q: query, num: 6 }),
  })
  if (!res.ok) {
    throw new Error(`Serper error (${res.status})`)
  }
  const data = (await res.json()) as {
    organic?: { link?: string; title?: string; snippet?: string; date?: string }[]
  }
  return (data.organic ?? [])
    .filter((r) => typeof r.link === 'string')
    .map((r) => makeResult(r.link ?? '', r.title ?? '', r.snippet ?? '', r.date ?? null))
}

const searchSearxng = async (
  query: string,
  baseUrl: string,
  signal?: AbortSignal
): Promise<WebSearchResult[]> => {
  const origin = baseUrl.trim().replace(/\/+$/, '')
  if (!origin) {
    throw new Error('SearXNG base URL is required')
  }
  const url = `${origin}/search?q=${encodeURIComponent(query)}&format=json`
  const res = await platformFetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!res.ok) {
    throw new Error(`SearXNG error (${res.status})`)
  }
  const data = (await res.json()) as {
    results?: { url?: string; title?: string; content?: string; publishedDate?: string }[]
  }
  return (data.results ?? [])
    .slice(0, 6)
    .filter((r) => typeof r.url === 'string')
    .map((r) => makeResult(r.url ?? '', r.title ?? '', r.content ?? '', r.publishedDate ?? null))
}

/** 执行客户端第三方网页搜索 */
export const runClientWebSearch = async (
  query: string,
  config: WebSearchConfig,
  signal?: AbortSignal
): Promise<WebSearchResult[]> => {
  const q = query.trim()
  if (!q || config.engine === 'none') {
    return []
  }
  switch (config.engine) {
    case 'tavily':
      return searchTavily(q, config.apiKey, signal)
    case 'brave':
      return searchBrave(q, config.apiKey, signal)
    case 'serper':
      return searchSerper(q, config.apiKey, signal)
    case 'searxng':
      return searchSearxng(q, config.baseUrl, signal)
  }
}

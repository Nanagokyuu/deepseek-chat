import { Readability } from '@mozilla/readability'
import { platformFetch } from '../platform/http.js'
import type { UrlReaderMode } from '../settings.js'

export type FetchedPage = {
  url: string
  title: string | null
  content: string
}

const URL_REGEX = /https?:\/\/[^\s<>"'`)\]]+/gi

/** 提取消息中的去重 HTTP(S) URL（最多前 3 个） */
export const extractUrls = (text: string): string[] => {
  const matches = text.match(URL_REGEX) ?? []
  const cleaned = matches
    .map((u) => u.replace(/[.,;:!?。，；：！？]+$/, ''))
    .filter((u) => {
      try {
        const parsed = new URL(u)
        return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      } catch {
        return false
      }
    })
  return [...new Set(cleaned)].slice(0, 3)
}

const fetchDirect = async (url: string, signal?: AbortSignal): Promise<FetchedPage> => {
  const res = await platformFetch(url, {
    method: 'GET',
    headers: { Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8' },
    signal,
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  const contentType = res.headers.get('Content-Type') ?? ''
  const raw = await res.text()
  if (!contentType.includes('html') && !raw.trimStart().startsWith('<')) {
    return { url, title: null, content: raw.slice(0, 20_000) }
  }
  const doc = new DOMParser().parseFromString(raw, 'text/html')
  const baseEl = doc.createElement('base')
  baseEl.href = url
  doc.head?.appendChild(baseEl)
  const parsed = new Readability(doc).parse()
  const title = parsed?.title?.trim() || doc.title?.trim() || null
  const text = (parsed?.textContent ?? doc.body?.textContent ?? '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!text) {
    throw new Error('Empty extracted content')
  }
  return { url, title, content: text.slice(0, 20_000) }
}

const fetchViaJina = async (url: string, signal?: AbortSignal): Promise<FetchedPage> => {
  const res = await platformFetch(`https://r.jina.ai/${url}`, {
    method: 'GET',
    headers: { Accept: 'text/plain' },
    signal,
  })
  if (!res.ok) {
    throw new Error(`Jina Reader error (${res.status})`)
  }
  const text = (await res.text()).trim()
  if (!text) {
    throw new Error('Empty Jina Reader content')
  }
  const titleMatch = /^Title:\s*(.+)$/m.exec(text)
  return {
    url,
    title: titleMatch?.[1]?.trim() || null,
    content: text.slice(0, 20_000),
  }
}

/** 抓取并提取网页正文；auto 模式下直连失败自动回退到 Jina Reader */
export const readWebPage = async (
  url: string,
  mode: UrlReaderMode,
  signal?: AbortSignal
): Promise<FetchedPage> => {
  if (mode === 'off') {
    throw new Error('URL reader is disabled')
  }
  if (mode === 'jina') {
    return fetchViaJina(url, signal)
  }
  if (mode === 'direct') {
    return fetchDirect(url, signal)
  }
  try {
    return await fetchDirect(url, signal)
  } catch (error) {
    if (signal?.aborted) {
      throw error
    }
    return fetchViaJina(url, signal)
  }
}

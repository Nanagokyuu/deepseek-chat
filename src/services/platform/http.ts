import { getCapacitorBridge, isCapacitorNative } from './env.js'

const isStreamRequest = (init?: RequestInit): boolean => {
  if (!init?.headers) {
    return false
  }
  const headers = new Headers(init.headers)
  const accept = headers.get('accept') ?? ''
  return accept.includes('text/event-stream')
}

const headersToRecord = (headersInit?: HeadersInit): Record<string, string> => {
  const result: Record<string, string> = {}
  if (!headersInit) {
    return result
  }
  new Headers(headersInit).forEach((value, key) => {
    result[key] = value
  })
  return result
}

/**
 * 跨平台 HTTP 请求入口：
 * - 常规或流式请求优先走原生 fetch（Electron 主进程会补充 CORS 放行）；
 * - 在 Capacitor 原生端对非流式且非 FormData 请求，若检测到 CapacitorHttp 插件可用，
 *   支持自动切换原生请求以绕过 WebView 的 CORS 限制。
 */
export const platformFetch = async (url: string, init?: RequestInit): Promise<Response> => {
  if (
    isCapacitorNative() &&
    !isStreamRequest(init) &&
    !(init?.body instanceof FormData) &&
    !init?.signal?.aborted
  ) {
    const http = getCapacitorBridge()?.Plugins?.CapacitorHttp
    if (http?.request) {
      const headers = headersToRecord(init?.headers)
      let data: unknown = init?.body
      if (typeof data === 'string' && headers['content-type']?.includes('application/json')) {
        try {
          data = JSON.parse(data)
        } catch {
          // 保持原始字符串
        }
      }
      const res = await http.request({
        url,
        method: init?.method ?? 'GET',
        headers,
        data,
        responseType: 'text',
      })
      const bodyText = typeof res.data === 'string' ? res.data : JSON.stringify(res.data ?? '')
      return new Response(bodyText, {
        status: res.status,
        headers: res.headers,
      })
    }
  }
  return fetch(url, init)
}

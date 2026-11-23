import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'io.github.nanagokyuu.deepseekchat',
  appName: 'DeepSeek Chat',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'capacitor',
  },
  plugins: {
    Keyboard: {
      resize: 'native',
      resizeOnFullScreen: true,
    },
    CapacitorHttp: {
      // 保持 false，避免全局拦截 window.fetch 破坏 SSE 流式 ReadableStream；
      // 非流式请求由 src/services/platform/http.ts 按需显式调用 CapacitorHttp。
      enabled: false,
    },
  },
}

// eslint-disable-next-line import/no-default-export
export default config

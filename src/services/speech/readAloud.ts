import { create } from 'zustand'
import type { TranslationMessage } from '../../i18n/index.js'
import { ApiError } from '../api/client.js'
import { classifyApiError } from '../api/errors.js'
import { synthesize, synthesizeOpenAI, TTS_SAMPLE_RATE } from '../api/speech.js'
import { getActiveProvider, useSettings } from '../settings.js'
import { stripMarkdownForSpeech } from './markdownFilter.js'

/**
 * 朗读：同一时间只读一条回复。
 * 请求 TTS 的裸 PCM 流，边收边用 AudioContext 按顺序排程播放，首帧到达即出声。
 * 状态：loading（已请求、未出声）→ playing → 结束回到 idle。
 */
export type ReadAloudStatus = 'idle' | 'loading' | 'playing'

type ReadAloudState = {
  /** 正在朗读的回复 id */
  messageId: string | null
  status: ReadAloudStatus
}

export const useReadAloud = create<ReadAloudState>(() => ({ messageId: null, status: 'idle' }))

/** 首帧前多缓冲一点，减少网络抖动造成的断续 */
const START_DELAY = 0.1

let current: { controller: AbortController; context: AudioContext | null } | null = null

const finish = (controller: AbortController) => {
  if (current?.controller !== controller) {
    return
  }
  if (current.context) {
    void current.context.close()
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }
  current = null
  useReadAloud.setState({ messageId: null, status: 'idle' })
}

/** 停止当前朗读（发送、停止生成、切换会话等场景调用） */
export const stopReadAloud = () => {
  if (current) {
    const { controller } = current
    controller.abort()
    finish(controller)
  }
}

/** 16-bit 小端 PCM 转成 Float32；奇数字节留到下一段 */
const toFloat32 = (bytes: Uint8Array) => {
  const samples = new Float32Array(bytes.length >> 1)
  const view = new DataView(bytes.buffer, bytes.byteOffset, samples.length * 2)
  for (let i = 0; i < samples.length; i++) {
    samples[i] = view.getInt16(i * 2, true) / 0x8000
  }
  return samples
}

export const describeReadAloudError = (error: unknown): TranslationMessage | string => {
  if (error instanceof ApiError && error.kind === 'protocol') {
    return error.message
  }
  // 400 表示这段正文服务端无法合成，与其余失败区分开
  if (error instanceof ApiError && error.status === 400) {
    return { key: 'ttsUnavailable' }
  }
  switch (classifyApiError(error)) {
    case 'unauthorized':
      return { key: 'apiKeyInvalidRetry' }
    case 'insufficientBalance':
      return { key: 'insufficientBalance' }
    case 'rateLimited':
      return { key: 'rateLimited' }
    default:
      return { key: 'ttsFailed' }
  }
}

/**
 * 开始朗读一条回复的正文；同一条正在朗读时调用等于停止。
 * 必须在点击事件中同步调用：AudioContext 需要用户手势才能出声。
 */
export const toggleReadAloud = (
  messageId: string,
  text: string,
  onError: (error: unknown) => void
) => {
  const reading = useReadAloud.getState().messageId
  stopReadAloud()
  if (reading === messageId) {
    return
  }
  const controller = new AbortController()
  const { ttsVoice, speechConfig, locale } = useSettings.getState()
  const provider = getActiveProvider()

  const resolvedMode =
    speechConfig.ttsEngine !== 'auto'
      ? speechConfig.ttsEngine
      : provider.protocol === 'deepseek'
        ? 'deepseek'
        : speechConfig.apiKey || provider.protocol === 'openai-compatible'
          ? 'openai'
          : 'system'

  // 系统原生 speechSynthesis 兜底模式
  if (resolvedMode === 'system') {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      onError(new Error('Speech synthesis unavailable'))
      return
    }
    const clean = stripMarkdownForSpeech(text)
    if (!clean) {
      return
    }
    current = { controller, context: null }
    useReadAloud.setState({ messageId, status: 'playing' })
    const utterance = new SpeechSynthesisUtterance(clean)
    utterance.lang = locale
    utterance.onend = () => finish(controller)
    utterance.onerror = () => {
      if (!controller.signal.aborted) {
        finish(controller)
        onError(new Error('System TTS failed'))
      }
    }
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
    return
  }

  const context = new AudioContext({ sampleRate: TTS_SAMPLE_RATE })
  current = { controller, context }
  useReadAloud.setState({ messageId, status: 'loading' })

  void (async () => {
    let nextTime = 0
    let lastSource: AudioBufferSourceNode | null = null
    let rest = new Uint8Array(0)
    try {
      const stream =
        resolvedMode === 'deepseek'
          ? await synthesize(
              provider.protocol === 'deepseek' ? provider.apiKey : speechConfig.apiKey,
              text,
              ttsVoice,
              controller.signal,
              provider.protocol === 'deepseek' ? provider.baseUrl : undefined
            )
          : await synthesizeOpenAI(
              speechConfig.apiKey
                ? speechConfig.baseUrl
                : provider.protocol === 'openai-compatible'
                  ? provider.baseUrl
                  : speechConfig.baseUrl,
              speechConfig.apiKey || provider.apiKey,
              speechConfig.ttsModel,
              speechConfig.openaiTtsVoice,
              stripMarkdownForSpeech(text),
              controller.signal
            )
      const reader = stream.getReader()
      controller.signal.addEventListener('abort', () => void reader.cancel().catch(() => {}))
      for (;;) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }
        const bytes = new Uint8Array(rest.length + value.length)
        bytes.set(rest)
        bytes.set(value, rest.length)
        const samples = toFloat32(bytes)
        rest = bytes.slice(samples.length * 2)
        if (samples.length === 0) {
          continue
        }
        const buffer = context.createBuffer(1, samples.length, TTS_SAMPLE_RATE)
        buffer.copyToChannel(samples, 0)
        const source = context.createBufferSource()
        source.buffer = buffer
        source.connect(context.destination)
        // 网络慢于播放时从当前时间续上，不补播过去的时间
        nextTime = Math.max(nextTime, context.currentTime + (lastSource ? 0 : START_DELAY))
        source.start(nextTime)
        nextTime += buffer.duration
        lastSource = source
        if (useReadAloud.getState().status === 'loading') {
          useReadAloud.setState({ status: 'playing' })
        }
      }
      if (lastSource) {
        lastSource.onended = () => finish(controller)
      } else {
        finish(controller)
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        finish(controller)
        onError(error)
      }
    }
  })()
}

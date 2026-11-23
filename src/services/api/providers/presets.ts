import type { ProviderConfig } from './types.js'

const API_ORIGIN = __API_ORIGIN__

export type ProviderPreset = {
  presetId: string
  label: string
  config: Omit<ProviderConfig, 'id' | 'apiKey'>
}

export const DEFAULT_DEEPSEEK_PROVIDER_ID = 'deepseek'

export const createDefaultDeepSeekProvider = (apiKey = ''): ProviderConfig => ({
  id: DEFAULT_DEEPSEEK_PROVIDER_ID,
  name: 'DeepSeek',
  protocol: 'deepseek',
  baseUrl: API_ORIGIN,
  apiKey,
  models: ['deepseek-flash', 'deepseek-v4-pro'],
  defaultModel: 'deepseek-flash',
  thinkingProtocol: 'auto',
})

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    presetId: 'deepseek',
    label: 'DeepSeek (原生)',
    config: {
      name: 'DeepSeek',
      protocol: 'deepseek',
      baseUrl: API_ORIGIN,
      models: ['deepseek-flash', 'deepseek-v4-pro'],
      defaultModel: 'deepseek-flash',
      thinkingProtocol: 'auto',
    },
  },
  {
    presetId: 'openai',
    label: 'OpenAI',
    config: {
      name: 'OpenAI',
      protocol: 'openai-compatible',
      baseUrl: 'https://api.openai.com/v1',
      models: ['gpt-4.1', 'gpt-4o', 'o4-mini', 'o3'],
      defaultModel: 'gpt-4.1',
      thinkingProtocol: 'auto',
    },
  },
  {
    presetId: 'anthropic',
    label: 'Anthropic (Claude)',
    config: {
      name: 'Anthropic',
      protocol: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      models: [
        'claude-sonnet-4-20250514',
        'claude-3-7-sonnet-20250219',
        'claude-3-5-haiku-20241022',
      ],
      defaultModel: 'claude-sonnet-4-20250514',
      thinkingProtocol: 'auto',
    },
  },
  {
    presetId: 'gemini',
    label: 'Google Gemini',
    config: {
      name: 'Google Gemini',
      protocol: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com',
      models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
      defaultModel: 'gemini-2.5-flash',
      thinkingProtocol: 'auto',
    },
  },
  {
    presetId: 'openrouter',
    label: 'OpenRouter',
    config: {
      name: 'OpenRouter',
      protocol: 'openai-compatible',
      baseUrl: 'https://openrouter.ai/api/v1',
      models: ['openai/gpt-4o', 'anthropic/claude-sonnet-4', 'google/gemini-2.5-pro'],
      defaultModel: 'openai/gpt-4o',
      thinkingProtocol: 'auto',
    },
  },
  {
    presetId: 'siliconflow',
    label: 'SiliconFlow (硅基流动)',
    config: {
      name: 'SiliconFlow',
      protocol: 'openai-compatible',
      baseUrl: 'https://api.siliconflow.cn/v1',
      models: ['deepseek-ai/DeepSeek-V3', 'deepseek-ai/DeepSeek-R1', 'Qwen/Qwen3-32B'],
      defaultModel: 'deepseek-ai/DeepSeek-V3',
      thinkingProtocol: 'auto',
    },
  },
  {
    presetId: 'dashscope',
    label: '阿里云百炼 (DashScope)',
    config: {
      name: 'DashScope',
      protocol: 'openai-compatible',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      models: ['qwen-plus', 'qwen-max', 'qwq-plus'],
      defaultModel: 'qwen-plus',
      thinkingProtocol: 'auto',
    },
  },
  {
    presetId: 'ollama',
    label: 'Ollama (本地)',
    config: {
      name: 'Ollama',
      protocol: 'openai-compatible',
      baseUrl: 'http://localhost:11434/v1',
      models: ['llama3.2', 'qwen3:8b', 'deepseek-r1:8b'],
      defaultModel: 'llama3.2',
      thinkingProtocol: 'auto',
    },
  },
]

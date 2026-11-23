import type { ProviderConfig } from './types.js'

const API_ORIGIN = __API_ORIGIN__

export type ProviderPreset = {
  presetId: string
  label: string
  tagline: string
  keyUrl?: string
  requiresKey: boolean
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
    label: 'DeepSeek',
    tagline: '原生深度思考 · 联网搜索 · 语音 · 文件解析',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    requiresKey: true,
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
    tagline: 'GPT-4.1 · GPT-4o · o3 / o4-mini',
    keyUrl: 'https://platform.openai.com/api-keys',
    requiresKey: true,
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
    tagline: 'Claude Sonnet 4 · 扩展思考 · 原生 PDF',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    requiresKey: true,
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
    tagline: 'Gemini 2.5 · 原生 Google 搜索 · 思考档位',
    keyUrl: 'https://aistudio.google.com/apikey',
    requiresKey: true,
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
    tagline: '聚合全球主流大模型单一入口',
    keyUrl: 'https://openrouter.ai/keys',
    requiresKey: true,
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
    tagline: '高速国产模型托管 · DeepSeek / Qwen',
    keyUrl: 'https://cloud.siliconflow.cn/account/ak',
    requiresKey: true,
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
    tagline: '通义千问 Qwen / QwQ 官方兼容接口',
    keyUrl: 'https://bailian.console.aliyun.com/',
    requiresKey: true,
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
    label: 'Ollama (本地模型)',
    tagline: '本机离线运行 · 无需 API Key',
    requiresKey: false,
    config: {
      name: 'Ollama',
      protocol: 'openai-compatible',
      baseUrl: 'http://localhost:11434/v1',
      models: ['llama3.2', 'qwen3:8b', 'deepseek-r1:8b'],
      defaultModel: 'llama3.2',
      thinkingProtocol: 'auto',
    },
  },
  {
    presetId: 'custom',
    label: '自定义 OpenAI 兼容',
    tagline: '自建网关 · OneAPI / NewAPI / vLLM',
    requiresKey: true,
    config: {
      name: 'Custom OpenAI',
      protocol: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      models: ['gpt-4o'],
      defaultModel: 'gpt-4o',
      thinkingProtocol: 'auto',
    },
  },
]

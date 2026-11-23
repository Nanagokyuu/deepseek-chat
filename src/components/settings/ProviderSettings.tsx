import clsx from 'clsx'
import { useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { getProviderAdapter } from '../../services/api/providers/registry.js'
import { PROVIDER_PRESETS } from '../../services/api/providers/presets.js'
import type {
  ProviderConfig,
  ProviderProtocol,
  ThinkingProtocol,
} from '../../services/api/providers/types.js'
import {
  removeProvider,
  setActiveModel,
  setActiveProvider,
  upsertProvider,
  useSettings,
} from '../../services/settings.js'
import { createId } from '../../utils/id.js'
import { Button } from '../base/Button.js'
import { Select } from '../base/Select.js'
import styles from './Settings.module.css'

export const ProviderSettings = () => {
  const t = useTranslate()
  const providers = useSettings((state) => state.providers)
  const activeProviderId = useSettings((state) => state.activeProviderId)
  const activeModel = useSettings((state) => state.activeModel)
  const activeProvider = providers.find((p) => p.id === activeProviderId) ?? providers[0]

  const [editing, setEditing] = useState<ProviderConfig | null>(null)
  const [modelsInput, setModelsInput] = useState('')
  const [testing, setTesting] = useState(false)
  const [testNotice, setTestNotice] = useState<{ text: string; error?: boolean } | null>(null)

  const startEdit = (provider: ProviderConfig) => {
    setEditing({ ...provider })
    setModelsInput(provider.models.join(', '))
    setTestNotice(null)
  }

  const addFromPreset = (presetId: string) => {
    const preset = PROVIDER_PRESETS.find((item) => item.presetId === presetId)
    if (!preset) {
      return
    }
    const config: ProviderConfig = {
      id: `${preset.presetId}-${createId().slice(0, 6)}`,
      apiKey: '',
      ...preset.config,
      models: [...preset.config.models],
    }
    startEdit(config)
  }

  const parseModels = (raw: string, fallback: string) => {
    const list = raw
      .split(/[,，\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
    return list.length > 0 ? [...new Set(list)] : fallback ? [fallback] : []
  }

  const handleSave = () => {
    if (!editing) {
      return
    }
    const models = parseModels(modelsInput, editing.defaultModel)
    const defaultModel = models.includes(editing.defaultModel)
      ? editing.defaultModel
      : models[0] || editing.defaultModel
    upsertProvider(
      {
        ...editing,
        name: editing.name.trim() || editing.protocol,
        baseUrl: editing.baseUrl.trim(),
        apiKey: editing.apiKey.trim(),
        models,
        defaultModel,
      },
      true
    )
    setEditing(null)
    setTestNotice(null)
  }

  const handleTest = async () => {
    if (!editing || testing) {
      return
    }
    setTesting(true)
    setTestNotice(null)
    try {
      const adapter = getProviderAdapter(editing.protocol)
      const fetched = await adapter.verify({
        ...editing,
        baseUrl: editing.baseUrl.trim(),
        apiKey: editing.apiKey.trim(),
      })
      const existing = parseModels(modelsInput, editing.defaultModel)
      const merged = [...new Set([...fetched, ...existing])]
      setModelsInput(merged.join(', '))
      if (merged.length > 0 && !merged.includes(editing.defaultModel)) {
        setEditing({ ...editing, defaultModel: merged[0] })
      }
      setTestNotice({ text: t('providersTestSuccess', { count: fetched.length }) })
    } catch (error) {
      setTestNotice({
        text: error instanceof Error ? error.message : String(error),
        error: true,
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className={styles.providerRoot}>
      <div className={clsx(styles.cell, styles.row)}>
        <div className={styles.text}>
          <div className={styles.label}>{t('providersActive')}</div>
        </div>
        <div className={styles.providerActions}>
          <Select
            ariaLabel={t('providersActive')}
            value={activeProvider.id}
            options={providers.map((p) => ({ value: p.id, label: p.name }))}
            onChange={(id) => setActiveProvider(id)}
          />
          <Button variant="outlined" size="m" onClick={() => startEdit(activeProvider)}>
            {t('providersEdit')}
          </Button>
        </div>
      </div>

      <div className={clsx(styles.cell, styles.row)}>
        <div className={styles.text}>
          <div className={styles.label}>{t('providersModel')}</div>
        </div>
        <Select
          ariaLabel={t('providersModel')}
          value={activeModel}
          options={(activeProvider.models.length > 0 ? activeProvider.models : [activeModel])
            .filter(Boolean)
            .map((model) => ({ value: model, label: model }))}
          onChange={setActiveModel}
        />
      </div>

      <div className={clsx(styles.cell, styles.row)}>
        <div className={styles.text}>
          <div className={styles.label}>{t('providersAdd')}</div>
        </div>
        <Select
          ariaLabel={t('providersPreset')}
          value=""
          placeholder={t('providersPreset')}
          options={PROVIDER_PRESETS.map((item) => ({ value: item.presetId, label: item.label }))}
          onChange={addFromPreset}
        />
      </div>

      {editing ? (
        <div className={styles.providerEditor}>
          <div className={styles.providerField}>
            <label className={styles.providerFieldLabel}>{t('providersName')}</label>
            <input
              className={styles.providerInput}
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
          </div>
          <div className={styles.providerField}>
            <label className={styles.providerFieldLabel}>{t('providersProtocol')}</label>
            <Select
              ariaLabel={t('providersProtocol')}
              value={editing.protocol}
              options={[
                { value: 'deepseek', label: 'DeepSeek (Anthropic + Tools)' },
                { value: 'openai-compatible', label: 'OpenAI Compatible' },
                { value: 'anthropic', label: 'Anthropic Messages' },
                { value: 'gemini', label: 'Google Gemini' },
              ]}
              onChange={(protocol) =>
                setEditing({ ...editing, protocol: protocol as ProviderProtocol })
              }
            />
          </div>
          <div className={styles.providerField}>
            <label className={styles.providerFieldLabel}>{t('providersBaseUrl')}</label>
            <input
              className={styles.providerInput}
              value={editing.baseUrl}
              onChange={(e) => setEditing({ ...editing, baseUrl: e.target.value })}
            />
          </div>
          <div className={styles.providerField}>
            <label className={styles.providerFieldLabel}>{t('providersApiKey')}</label>
            <input
              type="password"
              className={styles.providerInput}
              value={editing.apiKey}
              placeholder={t('apiKeyPlaceholder')}
              onChange={(e) => setEditing({ ...editing, apiKey: e.target.value })}
            />
          </div>
          <div className={styles.providerField}>
            <label className={styles.providerFieldLabel}>{t('providersModels')}</label>
            <input
              className={styles.providerInput}
              value={modelsInput}
              onChange={(e) => setModelsInput(e.target.value)}
            />
          </div>
          <div className={styles.providerField}>
            <label className={styles.providerFieldLabel}>{t('providersDefaultModel')}</label>
            <input
              className={styles.providerInput}
              value={editing.defaultModel}
              onChange={(e) => setEditing({ ...editing, defaultModel: e.target.value })}
            />
          </div>
          <div className={styles.providerField}>
            <label className={styles.providerFieldLabel}>{t('providersThinkingProtocol')}</label>
            <Select
              ariaLabel={t('providersThinkingProtocol')}
              value={editing.thinkingProtocol ?? 'auto'}
              options={[
                { value: 'auto', label: t('providersThinkingAuto') },
                { value: 'deepseek', label: t('providersThinkingDeepSeek') },
                { value: 'openai-reasoning', label: t('providersThinkingOpenAI') },
                { value: 'boolean', label: t('providersThinkingBoolean') },
                { value: 'anthropic', label: t('providersThinkingAnthropic') },
                { value: 'gemini', label: t('providersThinkingGemini') },
                { value: 'none', label: t('providersThinkingNone') },
              ]}
              onChange={(thinkingProtocol) =>
                setEditing({
                  ...editing,
                  thinkingProtocol: thinkingProtocol as ThinkingProtocol,
                })
              }
            />
          </div>
          <div className={styles.providerField}>
            <label className={styles.providerFieldLabel}>{t('providersSystemPrompt')}</label>
            <input
              className={styles.providerInput}
              value={editing.systemPrompt ?? ''}
              onChange={(e) => setEditing({ ...editing, systemPrompt: e.target.value })}
            />
          </div>

          {testNotice ? (
            <div className={clsx(styles.description, testNotice.error && styles.error)}>
              {testNotice.text}
            </div>
          ) : null}

          <div className={styles.providerEditorFooter}>
            <Button
              variant="outlined"
              size="m"
              disabled={testing}
              onClick={() => void handleTest()}
            >
              {testing ? t('providersTesting') : t('providersTest')}
            </Button>
            {providers.length > 1 && providers.some((p) => p.id === editing.id) ? (
              <Button
                variant="dangerOutlined"
                size="m"
                onClick={() => {
                  removeProvider(editing.id)
                  setEditing(null)
                }}
              >
                {t('delete')}
              </Button>
            ) : null}
            <Button variant="outlined" size="m" onClick={() => setEditing(null)}>
              {t('cancel')}
            </Button>
            <Button variant="primary" size="m" onClick={handleSave}>
              {t('providersSave')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

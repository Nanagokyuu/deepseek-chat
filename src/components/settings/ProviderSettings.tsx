import clsx from 'clsx'
import { useEffect, useState } from 'react'
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
import { isProviderReady } from './onboardingState.js'
import styles from './Settings.module.css'

export const ProviderSettings = () => {
  const t = useTranslate()
  const providers = useSettings((state) => state.providers)
  const activeProviderId = useSettings((state) => state.activeProviderId)
  const activeModel = useSettings((state) => state.activeModel)
  const activeProvider = providers.find((p) => p.id === activeProviderId) ?? providers[0]

  const [editing, setEditing] = useState<ProviderConfig | null>(null)
  const [candidateModels, setCandidateModels] = useState<string[]>([])
  const [newModelInput, setNewModelInput] = useState('')
  const [testing, setTesting] = useState(false)
  const [testNotice, setTestNotice] = useState<{ text: string; error?: boolean } | null>(null)

  const startEdit = (provider: ProviderConfig) => {
    const presetMatches =
      PROVIDER_PRESETS.find((item) => item.config.protocol === provider.protocol)?.config.models ??
      []
    const pool = [...new Set([...provider.models, provider.defaultModel, ...presetMatches])].filter(
      Boolean
    )
    setEditing({ ...provider, models: [...provider.models] })
    setCandidateModels(pool)
    setNewModelInput('')
    setTestNotice(null)
  }

  // 当前激活服务商尚未填写密钥时自动展开编辑区，减少点击层级
  useEffect(() => {
    if (!editing && !isProviderReady(activeProvider)) {
      startEdit(activeProvider)
    }
    // 仅在激活服务商切换时检查是否自动展开
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProvider.id])

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

  const toggleModel = (model: string) => {
    if (!editing) {
      return
    }
    const selected = editing.models.includes(model)
    const nextModels = selected
      ? editing.models.filter((item) => item !== model)
      : [...editing.models, model]
    // 至少保留一个已选模型
    if (nextModels.length === 0) {
      return
    }
    const nextDefault = nextModels.includes(editing.defaultModel)
      ? editing.defaultModel
      : nextModels[0]
    setEditing({ ...editing, models: nextModels, defaultModel: nextDefault })
  }

  const addCustomModel = () => {
    const id = newModelInput.trim()
    if (!editing || !id) {
      return
    }
    const nextCandidates = candidateModels.includes(id) ? candidateModels : [...candidateModels, id]
    const nextModels = editing.models.includes(id) ? editing.models : [...editing.models, id]
    setCandidateModels(nextCandidates)
    setEditing({
      ...editing,
      models: nextModels,
      defaultModel: editing.defaultModel || id,
    })
    setNewModelInput('')
  }

  const selectAllModels = () => {
    if (!editing || candidateModels.length === 0) {
      return
    }
    setEditing({
      ...editing,
      models: [...candidateModels],
      defaultModel: candidateModels.includes(editing.defaultModel)
        ? editing.defaultModel
        : candidateModels[0],
    })
  }

  const handleSave = () => {
    if (!editing) {
      return
    }
    const models =
      editing.models.length > 0 ? editing.models : [editing.defaultModel].filter(Boolean)
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
      const mergedCandidates = [...new Set([...fetched, ...candidateModels])]
      setCandidateModels(mergedCandidates)
      // 若此前没有任何已选模型，自动选中首个拉取到的模型
      if (editing.models.length === 0 && mergedCandidates.length > 0) {
        setEditing({
          ...editing,
          models: [mergedCandidates[0]],
          defaultModel: mergedCandidates[0],
        })
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
            <div className={styles.modelHeaderRow}>
              <label className={styles.providerFieldLabel}>{t('providersModel')}</label>
              <button type="button" className={styles.modelActionLink} onClick={selectAllModels}>
                {t('providersSelectAll')}
              </button>
            </div>
            <div className={styles.modelAddRow}>
              <input
                className={styles.providerInput}
                value={newModelInput}
                placeholder={t('providersAddModelPlaceholder')}
                onChange={(e) => setNewModelInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    addCustomModel()
                  }
                }}
              />
              <Button variant="outlined" size="m" onClick={addCustomModel}>
                {t('providersAddModel')}
              </Button>
            </div>
            <div className={styles.modelChecklist}>
              {candidateModels.map((model) => {
                const checked = editing.models.includes(model)
                const isDefault = editing.defaultModel === model
                return (
                  <div key={model} className={styles.modelCheckRow}>
                    <label className={styles.modelCheckLabel}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleModel(model)}
                      />
                      <span className={styles.modelCheckName}>{model}</span>
                    </label>
                    {checked ? (
                      isDefault ? (
                        <span className={styles.modelDefaultBadge}>
                          {t('providersDefaultBadge')}
                        </span>
                      ) : (
                        <button
                          type="button"
                          className={styles.modelActionLink}
                          onClick={() => setEditing({ ...editing, defaultModel: model })}
                        >
                          {t('providersSetDefault')}
                        </button>
                      )
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>

          <div className={styles.providerField}>
            <label className={styles.providerFieldLabel}>{t('providersDefaultModel')}</label>
            <Select
              ariaLabel={t('providersDefaultModel')}
              value={editing.defaultModel}
              options={editing.models.map((model) => ({ value: model, label: model }))}
              onChange={(defaultModel) => setEditing({ ...editing, defaultModel })}
            />
          </div>

          <details className={styles.advancedDetails}>
            <summary className={styles.advancedSummary}>{t('providersAdvanced')}</summary>
            <div className={styles.advancedFields}>
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
                <label className={styles.providerFieldLabel}>
                  {t('providersThinkingProtocol')}
                </label>
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
            </div>
          </details>

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

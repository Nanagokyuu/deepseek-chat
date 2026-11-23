import clsx from 'clsx'
import { useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { ApiError } from '../../services/api/client.js'
import { classifyApiError } from '../../services/api/errors.js'
import {
  DEFAULT_DEEPSEEK_PROVIDER_ID,
  PROVIDER_PRESETS,
  type ProviderPreset,
} from '../../services/api/providers/presets.js'
import { getProviderAdapter } from '../../services/api/providers/registry.js'
import type { ProviderConfig } from '../../services/api/providers/types.js'
import { openExternalUrl } from '../../services/platform/io.js'
import { upsertProvider } from '../../services/settings.js'
import { createId } from '../../utils/id.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import { closeOnboarding, useOnboardingDialog } from './onboardingState.js'
import { openSettings } from './settingsDialogState.js'
import styles from './Onboarding.module.css'

export const OnboardingDialog = () => {
  const open = useOnboardingDialog((state) => state.open)
  return open ? <OnboardingContent /> : null
}

const OnboardingContent = () => {
  const t = useTranslate()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [preset, setPreset] = useState<ProviderPreset>(PROVIDER_PRESETS[0])
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState(PROVIDER_PRESETS[0].config.baseUrl)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [candidateModels, setCandidateModels] = useState<string[]>([])
  const [selectedModels, setSelectedModels] = useState<string[]>([])
  const [defaultModel, setDefaultModel] = useState('')

  const selectPreset = (item: ProviderPreset) => {
    setPreset(item)
    setBaseUrl(item.config.baseUrl)
    setApiKey('')
    setError(null)
    setStep(2)
  }

  const verifyAndProceed = async () => {
    if (verifying) {
      return
    }
    const trimmedKey = apiKey.trim()
    if (preset.requiresKey && !trimmedKey) {
      setError(t('apiKeyPlaceholder'))
      return
    }
    setVerifying(true)
    setError(null)
    const draft: ProviderConfig = {
      id: preset.presetId,
      apiKey: trimmedKey,
      ...preset.config,
      baseUrl: baseUrl.trim() || preset.config.baseUrl,
      models: [...preset.config.models],
    }
    try {
      const adapter = getProviderAdapter(draft.protocol)
      const fetched = await adapter.verify(draft)
      const merged = [...new Set([...preset.config.models, ...fetched])].filter(Boolean)
      const initialSelected =
        preset.config.models.filter((m) => merged.includes(m)).length > 0
          ? preset.config.models.filter((m) => merged.includes(m))
          : merged.slice(0, 3)
      setCandidateModels(merged)
      setSelectedModels(initialSelected)
      setDefaultModel(
        initialSelected.includes(preset.config.defaultModel)
          ? preset.config.defaultModel
          : initialSelected[0] || merged[0] || ''
      )
      setStep(3)
    } catch (err) {
      const kind = classifyApiError(err)
      if (kind === 'unauthorized') {
        setError(t('apiKeyInvalid'))
      } else if (kind === 'network') {
        setError(t('commonNetworkErrorToast'))
      } else if (err instanceof ApiError && err.localMessage) {
        setError(t(err.localMessage.key, err.localMessage.params))
      } else {
        setError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setVerifying(false)
    }
  }

  const toggleModel = (model: string) => {
    const exists = selectedModels.includes(model)
    const next = exists ? selectedModels.filter((m) => m !== model) : [...selectedModels, model]
    if (next.length === 0) {
      return
    }
    setSelectedModels(next)
    if (!next.includes(defaultModel)) {
      setDefaultModel(next[0])
    }
  }

  const finishSetup = () => {
    const models = selectedModels.length > 0 ? selectedModels : [defaultModel].filter(Boolean)
    const targetDefault = models.includes(defaultModel) ? defaultModel : models[0] || ''
    const id =
      preset.presetId === 'deepseek'
        ? DEFAULT_DEEPSEEK_PROVIDER_ID
        : `${preset.presetId}-${createId().slice(0, 6)}`
    upsertProvider(
      {
        id,
        apiKey: apiKey.trim(),
        ...preset.config,
        baseUrl: baseUrl.trim() || preset.config.baseUrl,
        models,
        defaultModel: targetDefault,
      },
      true
    )
    closeOnboarding()
  }

  return (
    <Modal title={t('onboardingTitle')} closable className={styles.modal} onClose={closeOnboarding}>
      <div className={styles.body}>
        <div className={styles.steps}>
          {[1, 2, 3].map((idx) => (
            <div
              key={idx}
              className={clsx(
                styles.stepDot,
                step === idx && styles.stepActive,
                step > idx && styles.stepDone
              )}
            />
          ))}
        </div>

        {step === 1 ? (
          <>
            <div className={styles.heading}>{t('onboardingStep1Title')}</div>
            <div className={styles.subtitle}>{t('onboardingStep1Subtitle')}</div>
            <div className={styles.grid}>
              {PROVIDER_PRESETS.map((item) => (
                <button
                  key={item.presetId}
                  type="button"
                  className={styles.card}
                  onClick={() => selectPreset(item)}
                >
                  <div className={styles.cardTitle}>{item.label}</div>
                  <div className={styles.cardDesc}>{item.tagline}</div>
                </button>
              ))}
            </div>
            <div className={styles.footer}>
              <button
                type="button"
                className={styles.textLink}
                onClick={() => {
                  closeOnboarding()
                  openSettings('providers')
                }}
              >
                {t('onboardingFullSettings')}
              </button>
              <Button variant="outlined" size="m" onClick={closeOnboarding}>
                {t('onboardingSkip')}
              </Button>
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <div className={styles.heading}>
              {t('onboardingStep2Title')} · {preset.label}
            </div>
            {preset.requiresKey ? (
              <div className={styles.field}>
                <div className={styles.labelRow}>
                  <label className={styles.label}>{t('providersApiKey')}</label>
                  {preset.keyUrl ? (
                    <button
                      type="button"
                      className={styles.textLink}
                      onClick={() => void openExternalUrl(preset.keyUrl ?? '')}
                    >
                      {t('onboardingGetKey')} ↗
                    </button>
                  ) : null}
                </div>
                <input
                  type="password"
                  autoFocus
                  className={styles.input}
                  placeholder={t('apiKeyPlaceholder')}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                      void verifyAndProceed()
                    }
                  }}
                />
              </div>
            ) : (
              <div className={styles.hintBox}>{t('onboardingOllamaHint')}</div>
            )}

            <details className={styles.advanced} open={preset.presetId === 'custom'}>
              <summary className={styles.advancedSummary}>{t('providersAdvanced')}</summary>
              <div className={styles.field}>
                <label className={styles.label}>{t('providersBaseUrl')}</label>
                <input
                  className={styles.input}
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                />
              </div>
            </details>

            <div className={styles.privacy}>{t('onboardingLocalPrivacy')}</div>
            {error ? <div className={styles.error}>{error}</div> : null}

            <div className={styles.footer}>
              <Button variant="outlined" size="m" onClick={() => setStep(1)}>
                {t('onboardingBack')}
              </Button>
              <div className={styles.footerRight}>
                <Button variant="outlined" size="m" onClick={closeOnboarding}>
                  {t('onboardingSkip')}
                </Button>
                <Button
                  variant="primary"
                  size="m"
                  disabled={verifying}
                  onClick={() => void verifyAndProceed()}
                >
                  {verifying ? t('apiKeyVerifying') : t('onboardingVerifyNext')}
                </Button>
              </div>
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <div className={styles.heading}>{t('onboardingStep3Title')}</div>
            <div className={styles.checklist}>
              {candidateModels.map((model) => {
                const checked = selectedModels.includes(model)
                const isDefault = defaultModel === model
                return (
                  <div key={model} className={styles.checkRow}>
                    <label className={styles.checkLabel}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleModel(model)}
                      />
                      <span className={styles.checkName}>{model}</span>
                    </label>
                    {checked ? (
                      isDefault ? (
                        <span className={styles.defaultBadge}>{t('providersDefaultBadge')}</span>
                      ) : (
                        <button
                          type="button"
                          className={styles.textLink}
                          onClick={() => setDefaultModel(model)}
                        >
                          {t('providersSetDefault')}
                        </button>
                      )
                    ) : null}
                  </div>
                )
              })}
            </div>
            <div className={styles.footer}>
              <Button variant="outlined" size="m" onClick={() => setStep(2)}>
                {t('onboardingBack')}
              </Button>
              <Button variant="primary" size="m" onClick={finishSetup}>
                {t('onboardingFinish')}
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  )
}

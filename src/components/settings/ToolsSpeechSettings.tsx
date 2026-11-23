import clsx from 'clsx'
import { useTranslate } from '../../i18n/index.js'
import {
  setSpeechConfig,
  setWebSearchConfig,
  useSettings,
  type SpeechEngineMode,
  type UrlReaderMode,
  type WebSearchEngine,
} from '../../services/settings.js'
import { Select } from '../base/Select.js'
import styles from './Settings.module.css'

export const ToolsSpeechSettings = () => {
  const t = useTranslate()
  const webSearchConfig = useSettings((state) => state.webSearchConfig)
  const speechConfig = useSettings((state) => state.speechConfig)

  return (
    <div className={styles.providerEditor}>
      <div className={clsx(styles.cell, styles.row)}>
        <div className={styles.text}>
          <div className={styles.label}>{t('toolsSearchEngine')}</div>
        </div>
        <Select
          ariaLabel={t('toolsSearchEngine')}
          value={webSearchConfig.engine}
          options={[
            { value: 'none', label: t('toolsSearchNone') },
            { value: 'tavily', label: 'Tavily' },
            { value: 'brave', label: 'Brave Search' },
            { value: 'serper', label: 'Serper (Google)' },
            { value: 'searxng', label: 'SearXNG' },
          ]}
          onChange={(engine) => setWebSearchConfig({ engine: engine as WebSearchEngine })}
        />
      </div>

      {webSearchConfig.engine !== 'none' ? (
        <div className={styles.providerField}>
          <label className={styles.providerFieldLabel}>
            {webSearchConfig.engine === 'searxng' ? t('toolsSearchBaseUrl') : t('toolsSearchKey')}
          </label>
          <input
            type={webSearchConfig.engine === 'searxng' ? 'text' : 'password'}
            className={styles.providerInput}
            value={
              webSearchConfig.engine === 'searxng'
                ? webSearchConfig.baseUrl
                : webSearchConfig.apiKey
            }
            placeholder={
              webSearchConfig.engine === 'searxng'
                ? 'https://searxng.example.com'
                : t('apiKeyPlaceholder')
            }
            onChange={(e) =>
              setWebSearchConfig(
                webSearchConfig.engine === 'searxng'
                  ? { baseUrl: e.target.value }
                  : { apiKey: e.target.value }
              )
            }
          />
        </div>
      ) : null}

      <div className={clsx(styles.cell, styles.row)}>
        <div className={styles.text}>
          <div className={styles.label}>{t('toolsUrlReader')}</div>
        </div>
        <Select
          ariaLabel={t('toolsUrlReader')}
          value={webSearchConfig.urlReader}
          options={[
            { value: 'auto', label: t('toolsUrlReaderAuto') },
            { value: 'direct', label: t('toolsUrlReaderDirect') },
            { value: 'jina', label: t('toolsUrlReaderJina') },
            { value: 'off', label: t('toolsUrlReaderOff') },
          ]}
          onChange={(urlReader) => setWebSearchConfig({ urlReader: urlReader as UrlReaderMode })}
        />
      </div>

      <div className={clsx(styles.cell, styles.row)}>
        <div className={styles.text}>
          <div className={styles.label}>{t('speechAsrEngine')}</div>
        </div>
        <Select
          ariaLabel={t('speechAsrEngine')}
          value={speechConfig.asrEngine}
          options={[
            { value: 'auto', label: t('speechEngineAuto') },
            { value: 'deepseek', label: t('speechEngineDeepSeek') },
            { value: 'openai', label: t('speechEngineOpenAI') },
          ]}
          onChange={(asrEngine) => setSpeechConfig({ asrEngine: asrEngine as SpeechEngineMode })}
        />
      </div>

      <div className={clsx(styles.cell, styles.row)}>
        <div className={styles.text}>
          <div className={styles.label}>{t('speechTtsEngine')}</div>
        </div>
        <Select
          ariaLabel={t('speechTtsEngine')}
          value={speechConfig.ttsEngine}
          options={[
            { value: 'auto', label: t('speechEngineAuto') },
            { value: 'deepseek', label: t('speechEngineDeepSeek') },
            { value: 'openai', label: t('speechEngineOpenAI') },
            { value: 'system', label: t('speechEngineSystem') },
          ]}
          onChange={(ttsEngine) => setSpeechConfig({ ttsEngine: ttsEngine as SpeechEngineMode })}
        />
      </div>

      {speechConfig.asrEngine === 'openai' || speechConfig.ttsEngine === 'openai' ? (
        <>
          <div className={styles.providerField}>
            <label className={styles.providerFieldLabel}>{t('speechBaseUrl')}</label>
            <input
              className={styles.providerInput}
              value={speechConfig.baseUrl}
              onChange={(e) => setSpeechConfig({ baseUrl: e.target.value })}
            />
          </div>
          <div className={styles.providerField}>
            <label className={styles.providerFieldLabel}>{t('speechApiKey')}</label>
            <input
              type="password"
              className={styles.providerInput}
              value={speechConfig.apiKey}
              placeholder={t('apiKeyPlaceholder')}
              onChange={(e) => setSpeechConfig({ apiKey: e.target.value })}
            />
          </div>
          <div className={clsx(styles.cell, styles.row)}>
            <div className={styles.text}>
              <div className={styles.label}>{t('speechOpenAiVoice')}</div>
            </div>
            <Select
              ariaLabel={t('speechOpenAiVoice')}
              value={speechConfig.openaiTtsVoice}
              options={['alloy', 'nova', 'shimmer', 'echo', 'fable', 'onyx'].map((v) => ({
                value: v,
                label: v,
              }))}
              onChange={(openaiTtsVoice) => setSpeechConfig({ openaiTtsVoice })}
            />
          </div>
        </>
      ) : null}
    </div>
  )
}

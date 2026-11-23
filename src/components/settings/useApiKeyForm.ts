import { useState } from 'react'
import { ApiError } from '../../services/api/client.js'
import { getProviderAdapter } from '../../services/api/providers/registry.js'
import { classifyApiError } from '../../services/api/errors.js'
import { getActiveProvider, upsertProvider } from '../../services/settings.js'
import { useTranslate } from '../../i18n/index.js'

/** 输入 API Key 后先用当前服务商协议校验，通过才保存并刷新模型列表 */
export const useApiKeyForm = (onSaved?: () => void) => {
  const t = useTranslate()
  const [value, setValue] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [failure, setFailure] = useState<{ cause: unknown } | null>(null)
  const cause = failure?.cause
  const error =
    failure === null
      ? null
      : classifyApiError(cause) === 'unauthorized'
        ? t('apiKeyInvalid')
        : classifyApiError(cause) === 'network'
          ? t('commonNetworkErrorToast')
          : t('apiKeyVerificationFailed', {
              message:
                cause instanceof ApiError && cause.localMessage
                  ? t(cause.localMessage.key, cause.localMessage.params)
                  : cause instanceof Error
                    ? cause.message
                    : String(cause),
            })

  const submit = async () => {
    const apiKey = value.trim()
    if (!apiKey || verifying) {
      return
    }
    setVerifying(true)
    setFailure(null)
    try {
      const provider = getActiveProvider()
      const adapter = getProviderAdapter(provider.protocol)
      const models = await adapter.verify({ ...provider, apiKey })
      const mergedModels = models.length > 0 ? models : provider.models
      const defaultModel = mergedModels.includes(provider.defaultModel)
        ? provider.defaultModel
        : mergedModels[0] || provider.defaultModel
      upsertProvider({ ...provider, apiKey, models: mergedModels, defaultModel }, true)
      setValue('')
      onSaved?.()
    } catch (e) {
      setFailure({ cause: e })
    } finally {
      setVerifying(false)
    }
  }

  return { value, setValue, verifying, error, submit }
}

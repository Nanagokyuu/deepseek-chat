import { useIsMobile } from '../../app/viewport.js'
import { useTranslate } from '../../i18n/index.js'
import { useSettings } from '../../services/settings.js'
import { ChatInput } from '../chatInput/ChatInput.js'
import { isProviderReady, openOnboarding } from '../settings/onboardingState.js'
import { MobileHeader } from './MobileHeader.js'
import styles from './Welcome.module.css'

/** 新对话：问候语 + 未配置提示 + 输入框。桌面端居中；移动端输入框吸底 */
export const Welcome = () => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  const providers = useSettings((state) => state.providers)
  const activeProviderId = useSettings((state) => state.activeProviderId)
  const activeProvider = providers.find((p) => p.id === activeProviderId) ?? providers[0]
  const ready = isProviderReady(activeProvider)

  return (
    <div className={styles.container}>
      {isMobile ? <MobileHeader /> : null}
      <div className={styles.welcome}>
        <div className={styles.greeting}>{t('welcomeMessageChat250808')}</div>
        {!ready ? (
          <div className={styles.setupBanner}>
            <span>{t('welcomeUnconfigured')}</span>
            <button type="button" className={styles.setupButton} onClick={openOnboarding}>
              {t('welcomeConfigureAction')}
            </button>
          </div>
        ) : null}
        <ChatInput sessionId={null} />
        {isMobile ? <div className={styles.caveat}>{t('contentCaveat')}</div> : null}
      </div>
    </div>
  )
}

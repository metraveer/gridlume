import { useTranslation } from 'react-i18next'
import { Icon, type IconName } from '../design'
import s from './Welcome.module.css'

const STEPS: { icon: IconName; key: string; stage: number }[] = [
  { icon: 'map', key: 'welcome.s1', stage: 1 },
  { icon: 'laptop', key: 'welcome.s2', stage: 2 },
  { icon: 'bell', key: 'welcome.s3', stage: 3 },
]

/** First screen on an empty map: what Gridlume is and the three steps to fill it. */
export function Welcome() {
  const { t } = useTranslation()
  return (
    <div className={s.wrap}>
      <div className={s.box}>
        <h1>{t('welcome.title')}</h1>
        <p className={s.lead}>{t('welcome.lead')}</p>
        <ol className={s.steps}>
          {STEPS.map((step, i) => (
            <li key={step.key} className={s.step} aria-disabled="true" data-tip={t('common.soon', { stage: step.stage })}>
              <span className={s.n}>{i + 1}</span>
              <Icon name={step.icon} size={22} />
              <b>{t(step.key)}</b>
              <span className={s.d}>{t(`${step.key}.d`)}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client'
import { Button, Segmented } from '../design'
import { setLanguage, type Language } from '../i18n'
import { useApp } from '../state/app'
import s from './AuthScreens.module.css'

function Field({ label, hint, ...input }: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={s.field}>
      <span>{label}</span>
      <input className={s.input} {...input} />
      {hint && <small className={s.hint}>{hint}</small>}
    </label>
  )
}

function useSubmit(fn: () => Promise<void>) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: { preventDefault: () => void }) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(t(err instanceof ApiError ? err.key : 'err.internal'))
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, submit }
}

/** Centred card with the language switch in the corner: these screens come before the shell. */
function Screen({ children }: { children: React.ReactNode }) {
  const { t, i18n } = useTranslation()
  return (
    <div className={s.wrap}>
      <div className={s.lang}>
        <Segmented<Language>
          label={t('app.lang')}
          value={i18n.language as Language}
          onChange={(l) => void setLanguage(l)}
          options={[{ value: 'ru', label: 'RU' }, { value: 'en', label: 'EN' }]}
        />
      </div>
      {children}
    </div>
  )
}

/** The core could not be reached when the interface started. */
export function OfflineScreen() {
  const { t } = useTranslation()
  const error = useApp((st) => st.error)
  const init = useApp((st) => st.init)
  return (
    <Screen>
      <div className={s.card}>
        <h1>{t('core.down')}</h1>
        <p className={s.lead}>{t(error ?? 'err.offline')}</p>
        <Button variant="primary" onClick={() => void init()}>{t('common.retry')}</Button>
      </div>
    </Screen>
  )
}

/** First run: the code printed in the core's console creates the owner account. */
export function SetupScreen() {
  const { t } = useTranslation()
  const setup = useApp((st) => st.setup)
  const [code, setCode] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const mismatch = repeat !== '' && repeat !== password
  const { busy, error, submit } = useSubmit(() => setup(code, username, password))

  return (
    <Screen>
      <form className={s.card} onSubmit={submit}>
        <h1>{t('setup.title')}</h1>
        <p className={s.lead}>{t('setup.lead')}</p>
        <Field label={t('setup.code')} hint={t('setup.code.hint')} value={code} onChange={(e) => setCode(e.target.value)} autoFocus required autoComplete="off" spellCheck={false} />
        <Field label={t('auth.username')} value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="username" />
        <Field label={t('auth.password')} hint={t('setup.password.hint')} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" minLength={10} />
        <Field label={t('setup.repeat')} type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required autoComplete="new-password" />
        {mismatch && <p className={s.error}>{t('setup.mismatch')}</p>}
        {error && <p className={s.error} role="alert">{error}</p>}
        <Button variant="primary" type="submit" disabled={busy || mismatch}>{t('setup.submit')}</Button>
      </form>
    </Screen>
  )
}

export function LoginScreen() {
  const { t } = useTranslation()
  const login = useApp((st) => st.login)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const { busy, error, submit } = useSubmit(() => login(username, password))

  return (
    <Screen>
      <form className={s.card} onSubmit={submit}>
        <h1>{t('login.title')}</h1>
        <Field label={t('auth.username')} value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required autoComplete="username" />
        <Field label={t('auth.password')} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        {error && <p className={s.error} role="alert">{error}</p>}
        <Button variant="primary" type="submit" disabled={busy}>{t('login.submit')}</Button>
      </form>
    </Screen>
  )
}

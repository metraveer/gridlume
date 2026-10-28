import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, ApiError } from '../api/client'
import { AGENT_MODES, type AgentMode } from '../api/types'
import { Button, Dialog, Icon } from '../design'
import { useApp } from '../state/app'
import { useLive } from '../state/live'
import s from './AgentDialog.module.css'

/** True when an address only works on this computer: other machines could not reach the core there. */
function isLocal(core: string) {
  try {
    const h = new URL(core).hostname
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.localhost')
  } catch {
    return true
  }
}

/** The install command a user pastes on the machine. */
export function installCommand(core: string, code: string, mode: AgentMode, lang: string) {
  const base = core.replace(/\/+$/, '')
  return `curl -fsSL ${base}/install.sh | sudo sh -s -- --code ${code} --mode ${mode} --lang ${lang === 'ru' ? 'ru' : 'en'}`
}

/**
 * "Connect a machine": choose how much the agent may do, get a one-time command, run it on the machine.
 * With nodeId the agent joins that node; without, the machine appears as a new node.
 */
export function AgentDialog({ nodeId, close }: { nodeId?: string; close: () => void }) {
  const { t, i18n } = useTranslation()
  const nodes = useApp((st) => st.map.nodes)
  const [mode, setMode] = useState<AgentMode>('user')
  const [core, setCore] = useState(window.location.origin)
  const [code, setCode] = useState<{ code: string; expiresAt: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // Agents known when the code was made; a new one (or this node's coming online) means it worked.
  const [before, setBefore] = useState<Record<string, boolean>>({})
  const agents = useLive((st) => st.agents)
  const connected = code
    ? Object.values(agents).find((a) => a.online && (nodeId ? a.nodeId === nodeId && !before[a.id] : !before[a.id]))
    : undefined
  const target = nodes.find((n) => n.id === nodeId)

  const getCode = async () => {
    setError(null)
    try {
      setBefore(Object.fromEntries(Object.values(useLive.getState().agents).map((a) => [a.id, true])))
      setCode(await api.agentCode(nodeId ?? '', mode))
    } catch (e) {
      setError(t(e instanceof ApiError ? e.key : 'err.internal'))
    }
  }
  const command = code ? installCommand(core, code.code, mode, i18n.language) : ''
  const copy = async () => {
    await navigator.clipboard.writeText(command).catch(() => undefined)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Dialog
      title={target ? t('agent.connect.to', { name: target.name }) : t('agent.connect')}
      risk={mode === 'root' ? 'careful' : undefined}
      onClose={close}
      footer={
        connected ? (
          <Button variant="primary" onClick={close}>{t('common.done')}</Button>
        ) : code ? (
          <Button variant="ghost" onClick={close}>{t('common.close')}</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={() => void getCode()}>{t('agent.getCommand')}</Button>
          </>
        )
      }
    >
      {!code ? (
        <div className={s.form}>
          <p className={s.lead}>{t('agent.lead')}</p>
          <fieldset className={s.modes}>
            <legend className={s.label}>{t('agent.mode')}</legend>
            {AGENT_MODES.map((m) => (
              <label key={m} className={s.mode} data-checked={mode === m}>
                <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} />
                <span className={s.modeText}>
                  <b>{t(`agent.mode.${m}`)}{m === 'user' && <span className={s.default}>{t('agent.mode.default')}</span>}</b>
                  <small>{t(`agent.mode.${m}.sees`)}</small>
                  <small className={s.risk}>{t(`agent.mode.${m}.risk`)}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <label className={s.row}>
            <span className={s.label}>{t('agent.core')}</span>
            <input className={`${s.input} mono`} value={core} onChange={(e) => setCore(e.target.value)} spellCheck={false} />
            <small className={isLocal(core) ? s.warn : s.hint}>{isLocal(core) ? t('agent.core.local') : t('agent.core.hint')}</small>
          </label>
          {error && <p className={s.error} role="alert">{error}</p>}
        </div>
      ) : (
        <div className={s.form}>
          <p className={s.lead}>{t('agent.run')}</p>
          <div className={s.command}>
            <code className="mono">{command}</code>
            <Button size="sm" icon="copy" onClick={() => void copy()}>{copied ? t('common.copied') : t('common.copy')}</Button>
          </div>
          <p className={s.hint}>{t('agent.expires', { time: new Date(code.expiresAt * 1000).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' }) })}</p>
          <div className={s.wait} data-done={!!connected}>
            {connected ? <Icon name="shield" /> : <span className={s.spinner} aria-hidden="true" />}
            <span>{connected ? t('agent.connected', { name: connected.hostname }) : t('agent.waiting')}</span>
          </div>
        </div>
      )}
    </Dialog>
  )
}

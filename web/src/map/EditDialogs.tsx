import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client'
import { LINK_KINDS, NODE_KINDS, PLACE_TONES, type Link, type MapNode, type Place } from '../api/types'
import { Button, Dialog } from '../design'
import { useApp } from '../state/app'
import { AgentDialog } from './AgentDialog'
import { canContain } from './model'
import s from './EditDialogs.module.css'

type Setter<T> = <K extends keyof T>(k: K, v: T[K]) => void

function useForm<T>(initial: T): [T, Setter<T>] {
  const [v, setV] = useState(initial)
  return [v, (k, val) => setV((old) => ({ ...old, [k]: val }))]
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className={s.row}>
      <span className={s.label}>{label}</span>
      {children}
      {hint && <small className={s.hint}>{hint}</small>}
    </label>
  )
}

function useSave(fn: () => Promise<unknown>, close: () => void) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      close()
    } catch (e) {
      setError(t(e instanceof ApiError ? e.key : 'err.internal'))
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, save }
}

function Footer({ busy, onCancel, onSave, isNew }: { busy: boolean; onCancel: () => void; onSave: () => void; isNew: boolean }) {
  const { t } = useTranslation()
  return (
    <>
      <Button variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button>
      <Button variant="primary" disabled={busy} onClick={onSave}>{isNew ? t('common.add') : t('common.save')}</Button>
    </>
  )
}

function NodeDialog({ initial, close }: { initial: Partial<MapNode>; close: () => void }) {
  const { t } = useTranslation()
  const map = useApp((st) => st.map)
  const level = useApp((st) => st.level)
  const saveNode = useApp((st) => st.saveNode)
  const [n, setN] = useForm<Partial<MapNode>>({ kind: 'server', state: 'unknown', parentId: level, ...initial })
  const machines = map.nodes.filter((x) => canContain(x) && x.id !== n.id)
  const { busy, error, save } = useSave(() => saveNode(n), close)

  return (
    <Dialog title={n.id ? t('edit.node') : t('add.node')} onClose={close} footer={<Footer busy={busy} isNew={!n.id} onCancel={close} onSave={save} />}>
      <div className={s.form}>
        <Row label={t('f.kind')}>
          <select className={s.input} value={n.kind} onChange={(e) => setN('kind', e.target.value as MapNode['kind'])}>
            {NODE_KINDS.map((k) => <option key={k} value={k}>{t(`kind.${k}`)}</option>)}
          </select>
        </Row>
        <Row label={t('f.name')}>
          <input className={s.input} value={n.name ?? ''} onChange={(e) => setN('name', e.target.value)} autoFocus placeholder={t('f.name.ph')} />
        </Row>
        <Row label={t('f.subtitle')} hint={t('f.subtitle.hint')}>
          <input className={s.input} value={n.subtitle ?? ''} onChange={(e) => setN('subtitle', e.target.value)} />
        </Row>
        <Row label={t('f.address')}>
          <input className={`${s.input} mono`} value={n.address ?? ''} onChange={(e) => setN('address', e.target.value)} placeholder="192.168.1.63" />
        </Row>
        <Row label={t('f.inside')} hint={t('f.inside.hint')}>
          <select className={s.input} value={n.parentId ?? ''} onChange={(e) => setN('parentId', e.target.value || null)}>
            <option value="">{t('f.inside.none')}</option>
            {machines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Row>
        {!n.parentId && (
          <Row label={t('f.place')}>
            <select className={s.input} value={n.placeId ?? ''} onChange={(e) => setN('placeId', e.target.value || null)}>
              <option value="">{t('f.place.none')}</option>
              {map.places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Row>
        )}
        <Row label={t('f.state')} hint={t('f.state.hint')}>
          <select className={s.input} value={n.state} onChange={(e) => setN('state', e.target.value as MapNode['state'])}>
            {(['unknown', 'ok', 'planned'] as const).map((k) => <option key={k} value={k}>{t(`state.${k}`)}</option>)}
          </select>
        </Row>
        {error && <p className={s.error} role="alert">{error}</p>}
      </div>
    </Dialog>
  )
}

function LinkDialog({ initial, close }: { initial: Partial<Link>; close: () => void }) {
  const { t } = useTranslation()
  const map = useApp((st) => st.map)
  const saveLink = useApp((st) => st.saveLink)
  const [l, setL] = useForm<Partial<Link>>({ kind: 'lan', planned: false, ...initial })
  const name = (id?: string) => map.nodes.find((n) => n.id === id)?.name ?? ''
  const { busy, error, save } = useSave(() => saveLink(l), close)
  // A starting explanation for the chosen kind, so a link is never "just an arrow". Editable.
  const suggest = () => {
    if (!l.kind || l.about) return
    setL('about', t(`about.${l.kind}`, { from: name(l.fromId), to: name(l.toId) }))
    if (!l.ifBroken) setL('ifBroken', t(`broken.${l.kind}`, { from: name(l.fromId), to: name(l.toId) }))
  }

  return (
    <Dialog title={l.id ? t('edit.link') : t('add.link')} onClose={close} footer={<Footer busy={busy} isNew={!l.id} onCancel={close} onSave={save} />}>
      <div className={s.form}>
        {!l.id && (
          <div className={s.pair}>
            <Row label={t('f.from')}>
              <select className={s.input} value={l.fromId ?? ''} onChange={(e) => setL('fromId', e.target.value)}>
                <option value="" disabled>—</option>
                {map.nodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
            </Row>
            <Row label={t('f.to')}>
              <select className={s.input} value={l.toId ?? ''} onChange={(e) => setL('toId', e.target.value)}>
                <option value="" disabled>—</option>
                {map.nodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
            </Row>
          </div>
        )}
        <Row label={t('f.linkKind')} hint={l.kind ? t(`link.${l.kind}.hint`) : undefined}>
          <select className={s.input} value={l.kind} onChange={(e) => setL('kind', e.target.value as Link['kind'])} onBlur={suggest}>
            {LINK_KINDS.map((k) => <option key={k} value={k}>{t(`link.${k}`)}</option>)}
          </select>
        </Row>
        <div className={s.pair}>
          <Row label={t('f.proto')}>
            <input className={`${s.input} mono`} value={l.proto ?? ''} onChange={(e) => setL('proto', e.target.value)} placeholder="HTTP · 3000/tcp" />
          </Row>
          <Row label={t('f.speed')}>
            <input className={`${s.input} mono`} type="number" min={0} value={l.speedMbit ?? ''} onChange={(e) => setL('speedMbit', e.target.value ? Number(e.target.value) : null)} placeholder="700" />
          </Row>
        </div>
        <Row label={t('f.about')} hint={t('f.about.hint')}>
          <textarea className={s.input} rows={3} value={l.about ?? ''} onFocus={suggest} onChange={(e) => setL('about', e.target.value)} />
        </Row>
        <Row label={t('f.ifBroken')}>
          <textarea className={s.input} rows={2} value={l.ifBroken ?? ''} onChange={(e) => setL('ifBroken', e.target.value)} />
        </Row>
        <label className={s.check}>
          <input type="checkbox" checked={!!l.planned} onChange={(e) => setL('planned', e.target.checked)} />
          {t('f.planned')}
        </label>
        {error && <p className={s.error} role="alert">{error}</p>}
      </div>
    </Dialog>
  )
}

function PlaceDialog({ initial, close }: { initial: Partial<Place>; close: () => void }) {
  const { t } = useTranslation()
  const savePlace = useApp((st) => st.savePlace)
  const places = useApp((st) => st.map.places)
  // New places go to the right of the existing ones.
  const right = places.reduce((m, p) => Math.max(m, p.x + p.w + 40), 40)
  const [p, setP] = useForm<Partial<Place>>({ tone: 'green', x: right, y: 150, w: 440, h: 320, ...initial })
  const { busy, error, save } = useSave(() => savePlace(p), close)

  return (
    <Dialog title={p.id ? t('edit.place') : t('add.place')} onClose={close} footer={<Footer busy={busy} isNew={!p.id} onCancel={close} onSave={save} />}>
      <div className={s.form}>
        <Row label={t('f.name')}>
          <input className={s.input} value={p.name ?? ''} onChange={(e) => setP('name', e.target.value)} autoFocus placeholder={t('f.place.ph')} />
        </Row>
        <Row label={t('f.tone')}>
          <div className={s.tones}>
            {PLACE_TONES.map((tone) => (
              <button key={tone} type="button" className={`${s.tone} ${s[`tone_${tone}`]}`} aria-pressed={p.tone === tone} aria-label={t(`tone.${tone}`)} data-tip={t(`tone.${tone}`)} onClick={() => setP('tone', tone)} />
            ))}
          </div>
        </Row>
        {error && <p className={s.error} role="alert">{error}</p>}
      </div>
    </Dialog>
  )
}

/** The add / edit dialog currently open, if any. */
export function EditDialogs() {
  const editing = useApp((st) => st.editing)
  const edit = useApp((st) => st.edit)
  const close = () => edit(null)
  if (!editing) return null
  if (editing.kind === 'node') return <NodeDialog initial={editing.node} close={close} />
  if (editing.kind === 'link') return <LinkDialog initial={editing.link} close={close} />
  if (editing.kind === 'agent') return <AgentDialog nodeId={editing.nodeId} close={close} />
  return <PlaceDialog initial={editing.place} close={close} />
}

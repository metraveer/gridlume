import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CheckResult, Link, MapNode, Place } from '../api/types'
import { Button, Dialog, Icon, IconButton, KV, Section, StateBadge, type Risk } from '../design'
import { useApp } from '../state/app'
import { useLive, useNodeLive } from '../state/live'
import { usePrefs } from '../state/prefs'
import { AgentSection, HistorySection, LiveSection, unlinkAgent } from './AgentPanel'
import { ContainerSection, DockerSummary, SuggestionsSection } from './DockerPanel'
import { speed } from './flow'
import { ago, daysUntil, percent, rate } from './format'
import { canContain, dependents, LINK_META, NODE_META, requirements } from './model'
import { latencyLabel, useLinkPing, useLinkTraffic } from './traffic'
import s from './Inspector.module.css'

/** Delete with a confirmation. Danger (something else breaks) asks to type the name. */
function ConfirmDelete({ name, risk, consequence, onConfirm, onClose, title, action }: { name: string; risk: Risk; consequence: string; onConfirm: () => void; onClose: () => void; title?: string; action?: string }) {
  const { t } = useTranslation()
  const [typed, setTyped] = useState('')
  const ok = risk !== 'danger' || typed.trim() === name
  return (
    <Dialog
      title={title ?? t('del.title', { name })}
      risk={risk}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="danger" disabled={!ok} onClick={onConfirm}>{action ?? t('common.delete')}</Button>
        </>
      }
    >
      <p className={s.text}>{consequence}</p>
      {risk === 'danger' && (
        <label className={s.confirm}>
          <span>{t('del.type', { name })}</span>
          <input className={s.input} value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
        </label>
      )}
    </Dialog>
  )
}

function NodeList({ ids, empty }: { ids: string[]; empty: string }) {
  const nodes = useApp((st) => st.map.nodes)
  const select = useApp((st) => st.select)
  if (!ids.length) return <p className={s.muted}>{empty}</p>
  return (
    <ul className={s.list}>
      {ids.map((id) => {
        const n = nodes.find((x) => x.id === id)
        if (!n) return null
        return (
          <li key={id}>
            <button type="button" className={s.item} onClick={() => select({ kind: 'node', id })}>
              <Icon name={NODE_META[n.kind].icon} />
              <span className={s.itemName}>{n.name}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function NodePanel({ node }: { node: MapNode }) {
  const { t } = useTranslation()
  const map = useApp((st) => st.map)
  const viewer = useApp((st) => st.user?.role === 'viewer')
  const { edit, enter, select, patchNode, remove } = useApp.getState()
  const [notes, setNotes] = useState(node.notes)
  const [confirm, setConfirm] = useState(false)
  useAskedDelete('node', node.id, () => setConfirm(true))
  const [confirmUnlink, setConfirmUnlink] = useState(false)
  const { agent, snap, container, check, state } = useNodeLive(node)
  const isCore = useApp((st) => !!st.system?.coreNode && st.system.coreNode === node.id)
  // Keep the draft in step when another node is selected.
  const [shownId, setShownId] = useState(node.id)
  if (shownId !== node.id) {
    setShownId(node.id)
    setNotes(node.notes)
  }

  const name = (id: string | null) => map.nodes.find((n) => n.id === id)?.name ?? ''
  const place = map.places.find((p) => p.id === node.placeId)
  const links = map.links.filter((l) => l.fromId === node.id || l.toId === node.id)
  const kids = map.nodes.filter((n) => n.parentId === node.id)
  const breaks = dependents(map, node.id)
  const needs = requirements(map, node.id)
  // Deleting a machine also deletes what is inside it, with all their links.
  const gone = new Set([node.id, ...kids.map((k) => k.id)])
  const linksGone = map.links.filter((l) => gone.has(l.fromId) || gone.has(l.toId)).length
  const breaksOutside = breaks.filter((id) => !gone.has(id)).length
  const risk: Risk = breaksOutside || kids.length ? 'danger' : linksGone ? 'careful' : 'safe'

  return (
    <>
      <div className={s.head}>
        <span className={s.glyph}><Icon name={NODE_META[node.kind].icon} /></span>
        <div className={s.title}>
          <h2>{node.name}</h2>
          <span>{t(`kind.${node.kind}`)}</span>
        </div>
        <IconButton icon="x" label={t('common.close')} onClick={() => select(null)} />
      </div>
      <div className={s.status}>
        <StateBadge state={state} />
        {isCore && <span className={s.core} data-tip={t('core.here.tip')}>{t('core.here')}</span>}
        {!agent && !viewer && canContain(node) && (
          <Button size="sm" icon="server" tip={t('agent.connect.tip')} onClick={() => edit({ kind: 'agent', nodeId: node.id })}>{t('agent.connect.short')}</Button>
        )}
      </div>

      {check && <CheckSection c={check} />}
      {container !== undefined && <ContainerSection c={container} />}
      {snap && <LiveSection snap={snap} />}
      {snap && <DockerSummary snap={snap} />}
      {canContain(node) && <SuggestionsSection machine={node} />}

      <Section title={t('insp.overview')}>
        <KV
          rows={[
            [t('f.address'), node.address ? <span className="mono">{node.address}</span> : '—'],
            [t('f.subtitle'), node.subtitle || '—'],
            node.parentId ? [t('f.inside'), name(node.parentId)] : [t('f.place'), place?.name ?? '—'],
            ...(canContain(node) ? [[t('insp.contains'), t('nodes.count', { count: kids.length })] as [string, string]] : []),
          ]}
        />
      </Section>

      {agent && <HistorySection nodeId={node.id} />}
      {agent && <AgentSection agent={agent} canEdit={!viewer} onUnlink={() => setConfirmUnlink(true)} />}

      <Section title={t('insp.notes')} help={t('insp.notes.help')}>
        <textarea
          className={s.input}
          rows={4}
          value={notes}
          readOnly={viewer}
          placeholder={t('insp.notes.ph')}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== node.notes && void patchNode(node.id, { notes })}
        />
      </Section>

      <Section title={t('insp.links', { count: links.length })}>
        {links.length === 0 && <p className={s.muted}>{t('insp.links.none')}</p>}
        <ul className={s.list}>
          {links.map((l) => {
            const out = l.fromId === node.id
            return (
              <li key={l.id}>
                <button type="button" className={s.item} onClick={() => select({ kind: 'link', id: l.id })} data-tip={l.about || undefined}>
                  <span className={s.dir}>{out ? '→' : '←'}</span>
                  <span className={s.itemName}>{name(out ? l.toId : l.fromId)}</span>
                  <span className={s.itemMeta}>{l.proto || t(`link.${l.kind}`)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </Section>

      <Section title={t('insp.breaks')} help={t('insp.breaks.help')}>
        <NodeList ids={breaks} empty={t('insp.breaks.none')} />
      </Section>
      <Section title={t('insp.needs')} help={t('insp.needs.help')}>
        <NodeList ids={needs} empty={t('insp.needs.none')} />
      </Section>

      {!viewer && (
        <div className={s.actions}>
          <Button size="sm" icon="gear" onClick={() => edit({ kind: 'node', node })}>{t('common.edit')}</Button>
          {canContain(node) && <Button size="sm" icon="chevron" onClick={() => enter(node.id)}>{t('insp.open')}</Button>}
          <Button size="sm" icon="link" onClick={() => edit({ kind: 'link', link: { fromId: node.id, kind: 'lan' } })}>{t('add.link')}</Button>
          <Button size="sm" variant="danger" icon="x" onClick={() => setConfirm(true)}>{t('common.delete')}</Button>
        </div>
      )}

      {confirmUnlink && agent && (
        <ConfirmDelete
          name={node.name}
          risk="careful"
          title={t('agent.unlink.title', { name: node.name })}
          action={t('agent.unlink')}
          consequence={t('agent.unlink.what')}
          onClose={() => setConfirmUnlink(false)}
          onConfirm={() => {
            setConfirmUnlink(false)
            void unlinkAgent(agent)
          }}
        />
      )}

      {confirm && (
        <ConfirmDelete
          name={node.name}
          risk={risk}
          consequence={[
            kids.length ? t('del.node.kids', { count: kids.length }) : '',
            linksGone ? t('del.node.links', { count: linksGone }) : '',
            breaksOutside ? t('del.node.breaks', { count: breaksOutside }) : '',
          ].filter(Boolean).join(' ') || t('del.node.nothing')}
          onClose={() => setConfirm(false)}
          onConfirm={() => {
            setConfirm(false)
            void remove('node', node.id)
          }}
        />
      )}
    </>
  )
}

function LinkPanel({ link }: { link: Link }) {
  const { t } = useTranslation()
  const nodes = useApp((st) => st.map.nodes)
  const viewer = useApp((st) => st.user?.role === 'viewer')
  const { edit, select, swapLink, remove } = useApp.getState()
  const [confirm, setConfirm] = useState(false)
  useAskedDelete('link', link.id, () => setConfirm(true))
  const name = (id: string) => nodes.find((n) => n.id === id)?.name ?? ''

  return (
    <>
      <div className={s.head}>
        <span className={s.glyph}><Icon name="link" /></span>
        <div className={s.title}>
          <h2>{name(link.fromId)} → {name(link.toId)}</h2>
          <span>{t(`link.${link.kind}`)}{link.planned ? ` · ${t('map.planned')}` : ''}</span>
        </div>
        <IconButton icon="x" label={t('common.close')} onClick={() => select(null)} />
      </div>

      <Section title={t('insp.what')} help={t(`link.${link.kind}.hint`)}>
        <p className={s.text}>{link.about || <span className={s.muted}>{t('insp.what.none')}</span>}</p>
      </Section>
      <Section title={t('f.ifBroken')}>
        <p className={s.text}>{link.ifBroken || <span className={s.muted}>{t('insp.what.none')}</span>}</p>
      </Section>
      <Section title={t('insp.overview')}>
        <KV
          rows={[
            [t('f.from'), name(link.fromId)],
            [t('f.to'), name(link.toId)],
            [t('f.proto'), link.proto ? <span className="mono">{link.proto}</span> : '—'],
            [t('f.speed'), link.speedMbit ? speed(link.speedMbit, t) : '—'],
          ]}
        />
      </Section>
      {LINK_META[link.kind].traffic && !link.planned && <TrafficSection link={link} name={name} />}

      {!viewer && (
        <div className={s.actions}>
          <Button size="sm" icon="gear" onClick={() => edit({ kind: 'link', link })}>{t('common.edit')}</Button>
          <Button size="sm" icon="restart" tip={t('insp.swap.tip')} onClick={() => void swapLink(link.id)}>{t('insp.swap')}</Button>
          <Button size="sm" variant="danger" icon="x" onClick={() => setConfirm(true)}>{t('common.delete')}</Button>
        </div>
      )}

      {confirm && (
        <ConfirmDelete
          name={`${name(link.fromId)} → ${name(link.toId)}`}
          risk="careful"
          consequence={t('del.link')}
          onClose={() => setConfirm(false)}
          onConfirm={() => {
            setConfirm(false)
            void remove('link', link.id)
          }}
        />
      )}
    </>
  )
}

/** The core's own check of a node without an agent: how, whether it answers, and the certificate. */
function CheckSection({ c }: { c: CheckResult }) {
  const { t, i18n } = useTranslation()
  const how = c.kind === 'http' ? `${c.target.startsWith('https') ? 'HTTPS' : 'HTTP'} ${c.target}` : `${c.kind === 'ping' ? 'ping' : 'TCP'} ${c.target}`
  const rows: [string, React.ReactNode][] = [[t('chk.how'), <span className="mono">{how}</span>]]
  if (!c.at) {
    rows.push([t('chk.answers'), <span className={s.muted}>{t('chk.waiting')}</span>])
  } else if (c.kind === 'ping') {
    if (c.error) rows.push([t('chk.answers'), t(`insp.ping.err.${c.error}`, { host: c.target })])
    else {
      rows.push([t('chk.answers'), (c.loss ?? 0) >= 100 ? <span className={s.warnText}>{t('chk.no')}</span> : <span className="mono">{t('chk.yes', { ms: c.rtt >= 10 ? Math.round(c.rtt) : +c.rtt.toFixed(1) })}</span>])
      rows.push([t('insp.ping.loss'), <span className={`mono ${(c.loss ?? 0) > 0 ? s.warnText : ''}`}>{percent(c.loss ?? 0)}</span>])
    }
  } else {
    rows.push([
      t('chk.answers'),
      c.ok ? <span className="mono">{t('chk.yes', { ms: Math.round(c.rtt) })}</span> : <span className={s.warnText}>{t('chk.noWhy', { why: c.error ?? '' })}</span>,
    ])
    if (c.status) rows.push([t('chk.status'), <span className="mono">{c.status}</span>])
  }
  if (c.certUntil) {
    const days = daysUntil(c.certUntil)
    const date = new Date(c.certUntil * 1000).toLocaleDateString(i18n.language, { day: 'numeric', month: 'long', year: 'numeric' })
    rows.push([t('chk.cert'), <span className={days <= 14 ? s.warnText : ''}>{days < 0 ? t('chk.cert.expired', { date }) : t('chk.cert.until', { date, count: days })}</span>])
  }
  if (c.at) rows.push([t('chk.checked'), ago(t, c.at / 1000)])
  return (
    <Section title={t('chk.title')} help={t('chk.help')}>
      <KV rows={rows} />
    </Section>
  )
}

/** Live traffic of a network link: both directions, what it should carry, and whose counters these are. */
function TrafficSection({ link, name }: { link: Link; name: (id: string) => string }) {
  const { t } = useTranslation()
  const tr = useLinkTraffic(link)
  const ping = useLinkPing(link)
  const fromLive = useLive((st) => !!st.snaps[link.fromId])
  const hasAgent = useLive((st) => fromLive || !!st.snaps[link.toId])
  const nodes = useApp((st) => st.map.nodes)
  const rows: [string, React.ReactNode][] = []
  if (tr) {
    const should = [link.speedMbit ? t('insp.traffic.contract', { speed: speed(link.speedMbit, t) }) : '', tr.portMbit ? t('insp.traffic.port', { speed: speed(tr.portMbit, t) }) : '']
      .filter(Boolean)
      .join(' · ')
    rows.push(
      [t('insp.traffic.dir', { from: name(link.fromId), to: name(link.toId) }), <span className="mono">{rate(t, tr.fwd)}</span>],
      [t('insp.traffic.dir', { from: name(link.toId), to: name(link.fromId) }), <span className="mono">{rate(t, tr.back)}</span>],
      [t('insp.traffic.should'), should || '—'],
    )
    if (tr.capacityMbit) rows.push([t('insp.traffic.load'), <span className={`mono ${tr.load >= 80 ? s.warnText : ''}`}>{percent(tr.load)}</span>])
    rows.push([
      t('insp.traffic.source'),
      <span data-tip={tr.auto ? t('insp.traffic.auto') : undefined}>{t('insp.traffic.on', { iface: tr.iface, node: name(tr.side === 'from' ? link.fromId : link.toId) })}</span>,
    ])
  }
  if (ping && !ping.error && ping.sent > 0) {
    rows.push(
      [t('insp.ping.rtt'), <span className="mono">{latencyLabel(t, ping)}</span>],
      [t('insp.ping.loss'), <span className={`mono ${ping.loss > 0 ? s.warnText : ''}`}>{percent(ping.loss)}</span>],
      [t('insp.ping.how'), t('insp.ping.on', { host: ping.host, node: name(ping.side === 'from' ? link.fromId : link.toId) })],
    )
  }

  // Why something is missing, and what to do about it.
  const hints: string[] = []
  if (!tr) hints.push(link.iface && hasAgent ? t('insp.traffic.noIface', { iface: link.iface }) : t('insp.traffic.none'))
  if (ping?.error) hints.push(t(`insp.ping.err.${ping.error}`, { host: ping.host }))
  else if (!ping && hasAgent) {
    // The end without an agent needs an address to be pinged.
    const far = nodes.find((n) => n.id === (fromLive ? link.toId : link.fromId))
    if (far && !far.address) hints.push(t('insp.ping.noAddress', { node: far.name }))
  } else if (ping && ping.sent === 0) hints.push(t('insp.ping.starting'))

  return (
    <Section title={t('insp.traffic')} help={t('insp.traffic.help')}>
      {rows.length > 0 && <KV rows={rows} />}
      {hints.map((h) => <p key={h} className={s.muted}>{h}</p>)}
    </Section>
  )
}

function PlacePanel({ place }: { place: Place }) {
  const { t } = useTranslation()
  const nodes = useApp((st) => st.map.nodes)
  const viewer = useApp((st) => st.user?.role === 'viewer')
  const { edit, select, remove } = useApp.getState()
  const [confirm, setConfirm] = useState(false)
  useAskedDelete('place', place.id, () => setConfirm(true))
  const inside = nodes.filter((n) => n.placeId === place.id && n.parentId === null)

  return (
    <>
      <div className={s.head}>
        <span className={s.glyph}><Icon name="map" /></span>
        <div className={s.title}>
          <h2>{place.name}</h2>
          <span>{t('insp.place')}</span>
        </div>
        <IconButton icon="x" label={t('common.close')} onClick={() => select(null)} />
      </div>
      <Section title={t('insp.inPlace', { count: inside.length })} help={t('insp.place.help')}>
        <NodeList ids={inside.map((n) => n.id)} empty={t('insp.place.empty')} />
      </Section>
      {!viewer && (
        <div className={s.actions}>
          <Button size="sm" icon="gear" onClick={() => edit({ kind: 'place', place })}>{t('common.edit')}</Button>
          <Button size="sm" icon="plus" onClick={() => edit({ kind: 'node', node: { placeId: place.id, parentId: null, x: place.x + 40, y: place.y + 60 } })}>{t('add.node')}</Button>
          <Button size="sm" variant="danger" icon="x" onClick={() => setConfirm(true)}>{t('common.delete')}</Button>
        </div>
      )}
      {confirm && (
        <ConfirmDelete
          name={place.name}
          risk="careful"
          consequence={t('del.place', { count: inside.length })}
          onClose={() => setConfirm(false)}
          onConfirm={() => {
            setConfirm(false)
            void remove('place', place.id)
          }}
        />
      )}
    </>
  )
}

/** Right-hand panel for whatever is selected on the map. */
export function Inspector() {
  const selection = useApp((st) => st.selection)
  const map = useApp((st) => st.map)
  if (!selection) return null
  let body = null
  if (selection.kind === 'node') {
    const n = map.nodes.find((x) => x.id === selection.id)
    if (n) body = <NodePanel node={n} />
  } else if (selection.kind === 'link') {
    const l = map.links.find((x) => x.id === selection.id)
    if (l) body = <LinkPanel link={l} />
  } else {
    const p = map.places.find((x) => x.id === selection.id)
    if (p) body = <PlacePanel place={p} />
  }
  if (!body) return null
  return <InspectorFrame>{body}</InspectorFrame>
}

/** Opens a panel's delete confirmation when a menu or the Delete key asked for it. */
function useAskedDelete(kind: 'node' | 'link' | 'place', id: string, open: () => void) {
  const deleting = useApp((st) => st.deleting)
  useEffect(() => {
    if (deleting?.kind === kind && deleting.id === id) {
      useApp.setState({ deleting: null })
      open()
    }
  }, [deleting, kind, id, open])
}

// 440 is both the usual width and the least that fits the action buttons in one row (with room for the scrollbar).
export const INSPECTOR_MIN = 440
export const INSPECTOR_MAX = 640

/** The panel on the right: 440 px, up to 640 px by dragging its left edge (remembered on this device). */
function InspectorFrame({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const width = Math.min(INSPECTOR_MAX, Math.max(INSPECTOR_MIN, usePrefs((p) => p.inspectorWidth)))
  const setPrefs = usePrefs((p) => p.set)
  const [drag, setDrag] = useState<{ x: number; w: number } | null>(null)
  return (
    <aside className={s.panel} style={{ width }} data-nofade>
      <div
        className={s.resize}
        role="separator"
        aria-orientation="vertical"
        aria-label={t('insp.resize')}
        data-tip={t('insp.resize')}
        data-active={!!drag}
        onPointerDown={(e) => {
          e.preventDefault()
          e.currentTarget.setPointerCapture(e.pointerId)
          setDrag({ x: e.clientX, w: width })
        }}
        onPointerMove={(e) => {
          if (!drag) return
          // The edge is on the left: dragging left makes the panel wider.
          setPrefs({ inspectorWidth: Math.round(Math.min(INSPECTOR_MAX, Math.max(INSPECTOR_MIN, drag.w + drag.x - e.clientX))) })
        }}
        onPointerUp={() => setDrag(null)}
        onDoubleClick={() => setPrefs({ inspectorWidth: INSPECTOR_MIN })}
      />
      <div className={s.scroll}>{children}</div>
    </aside>
  )
}

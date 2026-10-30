import { useTranslation } from 'react-i18next'
import type { Container, MapNode, Snapshot, Suggestion } from '../api/types'
import { Badge, Button, IconButton, KV, Section, StateBadge } from '../design'
import { useApp, useReadOnly } from '../state/app'
import { containerState } from '../state/live'
import { bytes, percent } from './format'
import { dependents } from './model'
import { programOf, programProto } from './programs'
import s from './DockerPanel.module.css'

/** What a known program is and what stops without it ("PostgreSQL — a database: …"). */
function ProgramAbout({ node, image }: { node: MapNode; image: string }) {
  const { t } = useTranslation()
  const map = useApp((st) => st.map)
  const p = programOf(image)
  if (!p) return null
  const users = dependents(map, node.id)
    .map((id) => map.nodes.find((n) => n.id === id)?.name)
    .filter(Boolean)
    .slice(0, 3)
    .join(', ')
  return (
    <div className={s.program}>
      <p><b>{p.name}</b> — {t(`prog.${p.key}.what`)}</p>
      <p className={s.muted}>
        {t('prog.ifStops')}: {users ? t(`prog.${p.key}.broken`, { from: users, to: node.name }) : t('prog.ifStops.generic')}
      </p>
    </div>
  )
}

/** One container, for its node's inspector. null: the machine no longer has it. */
export function ContainerSection({ c, node }: { c: Container | null; node: MapNode }) {
  const { t } = useTranslation()
  if (c === null) {
    return (
      <Section title={t('docker.container')}>
        <p className={s.muted}>{t('docker.gone.long')}</p>
      </Section>
    )
  }
  const ports = (c.ports ?? []).map((p) => (p.public ? `${p.public} → ${p.private}/${p.proto}` : `${p.private}/${p.proto}`))
  return (
    <Section title={t('docker.container')} help={t('docker.container.help')}>
      <ProgramAbout node={node} image={c.image} />
      <div className={s.state}>
        <StateBadge state={containerState(c)}>{t(`docker.state.${c.state}`)}{c.health ? ` · ${t(`docker.health.${c.health}`)}` : ''}</StateBadge>
        <span className={s.status}>{c.status}</span>
      </div>
      <KV
        rows={[
          ...(c.state === 'running'
            ? [
                [t('live.cpu.short'), <span className="mono">{percent(c.cpu)}</span>],
                [t('live.mem'), <span className="mono">{bytes(t, c.memUsed)}{c.memLimit && c.memLimit < 2 ** 50 ? ` / ${bytes(t, c.memLimit)}` : ''}</span>],
              ] as [string, React.ReactNode][]
            : []),
          [t('docker.image'), <span className="mono">{c.image}</span>],
          ...(c.project ? [[t('docker.project'), `${c.project} / ${c.service}`] as [string, React.ReactNode]] : []),
          [t('docker.ports'), ports.length ? <span className="mono" data-tip={t('docker.ports.tip')}>{ports.join(', ')}</span> : '—'],
          [t('docker.networks'), (c.networks ?? []).join(', ') || '—'],
          [t('docker.restarts'), <span data-tip={t('docker.restarts.tip')}>{c.restarts}</span>],
          [t('docker.name'), <span className="mono">{c.name} · {c.id}</span>],
        ]}
      />
    </Section>
  )
}

/** On a machine: how many containers run, or why Docker cannot be read. */
export function DockerSummary({ snap }: { snap: Snapshot }) {
  const { t } = useTranslation()
  if (snap.dockerError) {
    return (
      <Section title={t('docker.title')}>
        <p className={s.muted}>{t(`docker.error.${snap.dockerError}`)}</p>
      </Section>
    )
  }
  if (!snap.docker) return null
  const all = snap.docker.containers
  const running = all.filter((c) => c.state === 'running').length
  const broken = all.filter((c) => containerState(c) === 'crit').length
  return (
    <Section title={t('docker.title')} help={t('docker.title.help')}>
      <div className={s.counts}>
        <Badge tone="ok">{t('docker.running', { count: running })}</Badge>
        {broken > 0 && <Badge tone="crit">{t('docker.broken', { count: broken })}</Badge>}
        <span className={s.muted}>{t('docker.total', { count: all.length })}</span>
      </div>
    </Section>
  )
}

/** Why the core thinks these two are linked, in words. */
function reasonText(t: (k: string, o?: Record<string, unknown>) => string, sg: Suggestion, from: string, to: string) {
  return sg.reason === 'compose_depends' ? t('suggest.compose', { from, to }) : t('suggest.env', { from, host: sg.detail })
}

/**
 * Links guessed from Docker, waiting for a yes or no, in the machine's inspector. Accepting makes a normal
 * link with an explanation, so the map keeps saying why each line is there.
 */
export function SuggestionsSection({ machine }: { machine: MapNode }) {
  const { t } = useTranslation()
  const nodes = useApp((st) => st.map.nodes)
  const suggestions = useApp((st) => st.suggestions)
  const viewer = useReadOnly()
  const level = useApp((st) => st.level)
  const { acceptSuggestion, dismissSuggestion, enter } = useApp.getState()
  const inside = new Set(nodes.filter((n) => n.parentId === machine.id).map((n) => n.id))
  const list = suggestions.filter((sg) => inside.has(sg.fromId) && inside.has(sg.toId))
  if (!list.length || viewer) return null
  const name = (id: string) => nodes.find((n) => n.id === id)?.name ?? ''

  return (
    <Section title={t('suggest.title', { count: list.length })} help={t('suggest.lead')}>
      {level !== machine.id && (
        <Button size="sm" className={s.open} onClick={() => enter(machine.id)}>{t('suggest.review')}</Button>
      )}
      <ul className={s.list}>
        {list.map((sg) => {
          const from = name(sg.fromId)
          const to = name(sg.toId)
          // A known program at the other end explains the link better than its kind does.
          const prog = programOf(nodes.find((n) => n.id === sg.toId)?.subtitle)
          const about = prog ? t(`prog.${prog.key}.link`, { from, to }) : t(`about.${sg.kind}`, { from, to })
          const broken = prog ? t(`prog.${prog.key}.broken`, { from, to }) : t(`broken.${sg.kind}`, { from, to })
          return (
            <li key={sg.id} className={s.item}>
              <div className={s.what}>
                <span className={s.pair}>{from} → {to}</span>
                <span className={s.kind}>{t(`link.${sg.kind}`)}</span>
                <small className={s.muted}>{reasonText(t, sg, from, to)}</small>
              </div>
              <div className={s.actions}>
                <Button size="sm" variant="primary" data-tip={about} onClick={() => void acceptSuggestion(sg, about, broken, prog ? programProto(prog) : '')}>
                  {t('suggest.accept')}
                </Button>
                <IconButton icon="x" label={t('suggest.dismiss')} onClick={() => void dismissSuggestion(sg)} />
              </div>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

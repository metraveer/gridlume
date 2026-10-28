import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Dialog, KV, NodeCard, RiskLabel, Section, StateBadge } from '../design'
import s from './DesignPage.module.css'

/** Living reference of the design system inside the app (the static one is design/mockup/design-system.html). */
export function DesignPage() {
  const { t } = useTranslation()
  const [dialog, setDialog] = useState(false)
  return (
    <div className={s.page}>
      <h1>{t('ds.title')}</h1>
      <p className={s.lead}>{t('ds.lead')}</p>

      <h2>{t('ds.buttons')}</h2>
      <div className={s.row}>
        <Button variant="primary">{t('ds.btn.primary')}</Button>
        <Button icon="logs" tip={t('ds.btn.tip')}>{t('ds.btn.default')}</Button>
        <Button variant="ghost">{t('ds.btn.ghost')}</Button>
        <Button variant="danger" icon="stop">{t('ds.btn.danger')}</Button>
        <Button size="sm">{t('ds.btn.default')}</Button>
      </div>

      <h2>{t('ds.states')}</h2>
      <div className={s.row}>
        <StateBadge state="ok" />
        <StateBadge state="warn" />
        <StateBadge state="crit" />
        <StateBadge state="unknown" />
        <StateBadge state="planned" />
        <Badge tone="info">{t('ds.info')}</Badge>
        <RiskLabel risk="safe" />
        <RiskLabel risk="careful" />
        <RiskLabel risk="danger" />
      </div>

      <h2>{t('ds.nodes')}</h2>
      <div className={s.row}>
        <NodeCard icon="laptop" name="calibur" sub="Acer E5-575G" state="ok" selected />
        <NodeCard icon="router" name="Keenetic" sub={t('ds.node.router')} state="ok" />
        <NodeCard icon="cloud" name="gridman.example" sub="Timeweb" state="warn" />
        <NodeCard icon="box" name="postgres" state="ok" small />
        <NodeCard icon="server" name="max" sub={t('state.planned')} state="planned" />
      </div>

      <h2>{t('ds.panel')}</h2>
      <div className={s.panel}>
        <Section title={t('ds.section')} help={t('ds.section.help')}>
          <KV rows={[[t('ds.kv.place'), t('ds.kv.place.v')], [t('ds.kv.address'), <span className="mono">192.168.1.20</span>], [t('ds.kv.system'), 'Debian 13.7']]} />
        </Section>
        <Section title={t('ds.plural')}>
          <p className={s.plural}>{[1, 2, 5, 21, 22, 25].map((n) => t('nodes.count', { count: n })).join(' · ')}</p>
        </Section>
      </div>

      <h2>{t('ds.dialog')}</h2>
      <Button onClick={() => setDialog(true)}>{t('ds.dialog.open')}</Button>
      {dialog && (
        <Dialog
          title={t('ds.dialog.title')}
          risk="danger"
          onClose={() => setDialog(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDialog(false)}>{t('ds.btn.ghost')}</Button>
              <Button variant="danger" onClick={() => setDialog(false)}>{t('ds.btn.danger')}</Button>
            </>
          }
        >
          {t('ds.dialog.body')}
        </Dialog>
      )}
    </div>
  )
}

import { useEffect } from 'react'
import { LoginScreen, OfflineScreen, SetupScreen } from '../auth/AuthScreens'
import { TooltipLayer, useScrollHints } from '../design'
import { ErrorBanner, MapPage } from '../map/MapPage'
import { NodesPage } from '../map/NodesPage'
import { useApp } from '../state/app'
import { startLive } from '../state/live'
import { NotificationsPage } from './NotificationsPage'
import { SettingsPage } from './SettingsPage'
import { useRoute } from './route'
import { Shell } from './Shell'

/** Live agent data for as long as someone is signed in. */
function LiveSync() {
  useEffect(() => startLive(), [])
  return null
}

/** First run → owner setup, then sign-in, then the app itself. */
function Gate() {
  const route = useRoute()
  const ready = useApp((st) => st.ready)
  const needsSetup = useApp((st) => st.needsSetup)
  const offline = useApp((st) => st.offline)
  const user = useApp((st) => st.user)
  const init = useApp((st) => st.init)
  useEffect(() => void init(), [init])

  if (!ready) return null
  if (offline) return <OfflineScreen />
  if (needsSetup) return <SetupScreen />
  if (!user) return <LoginScreen />
  return (
    <Shell route={route}>
      {route === 'nodes' ? <NodesPage /> : route === 'settings' ? <SettingsPage /> : route === 'alerts' ? <NotificationsPage /> : <MapPage />}
      <ErrorBanner />
      <LiveSync />
    </Shell>
  )
}

export function App() {
  useScrollHints()
  return (
    <>
      <Gate />
      <TooltipLayer />
    </>
  )
}

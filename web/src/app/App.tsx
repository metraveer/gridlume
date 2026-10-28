import { useEffect } from 'react'
import { LoginScreen, OfflineScreen, SetupScreen } from '../auth/AuthScreens'
import { TooltipLayer, useScrollHints } from '../design'
import { ErrorBanner, MapPage } from '../map/MapPage'
import { NodesPage } from '../map/NodesPage'
import { useApp } from '../state/app'
import { DesignPage } from './DesignPage'
import { useRoute } from './route'
import { Shell } from './Shell'

/** First run → owner setup, then sign-in, then the app itself. */
function Gate() {
  const route = useRoute()
  const ready = useApp((st) => st.ready)
  const needsSetup = useApp((st) => st.needsSetup)
  const offline = useApp((st) => st.offline)
  const user = useApp((st) => st.user)
  const init = useApp((st) => st.init)
  useEffect(() => void init(), [init])

  // The design reference needs no account: it shows components only.
  if (route === 'design') return <Shell route={route}><DesignPage /></Shell>
  if (!ready) return null
  if (offline) return <OfflineScreen />
  if (needsSetup) return <SetupScreen />
  if (!user) return <LoginScreen />
  return (
    <Shell route={route}>
      {route === 'nodes' ? <NodesPage /> : <MapPage />}
      <ErrorBanner />
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

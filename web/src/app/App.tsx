import { useEffect, useState } from 'react'
import { TooltipLayer, useScrollHints } from '../design'
import { DesignPage } from './DesignPage'
import { Shell } from './Shell'
import { Welcome } from './Welcome'

export type Route = 'map' | 'design'

function readRoute(): Route {
  return window.location.hash === '#/design' ? 'design' : 'map'
}

/** Hash routes keep the core simple: every page is index.html. */
function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(readRoute)
  useEffect(() => {
    const onHash = () => setRoute(readRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return [route, (r) => (window.location.hash = r === 'design' ? '#/design' : '#/')]
}

export function App() {
  const [route, go] = useRoute()
  useScrollHints()
  return (
    <>
      <Shell route={route} onNavigate={go}>
        {route === 'design' ? <DesignPage /> : <Welcome />}
      </Shell>
      <TooltipLayer />
    </>
  )
}

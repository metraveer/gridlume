import { useEffect, useState } from 'react'

export type Route = 'map' | 'nodes' | 'outside' | 'alerts' | 'settings'

const HASH: Record<Route, string> = { map: '#/', nodes: '#/nodes', outside: '#/outside', alerts: '#/alerts', settings: '#/settings' }

function readRoute(): Route {
  const h = window.location.hash
  return (Object.keys(HASH) as Route[]).find((r) => r !== 'map' && HASH[r] === h) ?? 'map'
}

export function go(r: Route) {
  window.location.hash = HASH[r]
}

/** Hash routes keep the core simple: every page is index.html. */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(readRoute)
  useEffect(() => {
    const onHash = () => setRoute(readRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return route
}

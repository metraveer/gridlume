import { useEffect, useState } from 'react'

export type Route = 'map' | 'nodes' | 'design'

const HASH: Record<Route, string> = { map: '#/', nodes: '#/nodes', design: '#/design' }

function readRoute(): Route {
  const h = window.location.hash
  return h === HASH.design ? 'design' : h === HASH.nodes ? 'nodes' : 'map'
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

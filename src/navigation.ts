import { useEffect, useState } from 'react'

export type Route =
  | { name: 'start' }
  | { name: 'spiel'; id: string }
  | { name: 'einstellungen' }
  | { name: 'ranks' }
  | { name: 'historie' }
  | { name: 'statistik' }
  | { name: 'anmelden' }
  | { name: 'benutzer' }
  | { name: 'online-lobby' }
  | { name: 'online-tisch' }
  | { name: 'online-tisch-vierer' }

export function routeZuHash(route: Route): string {
  switch (route.name) {
    case 'spiel':
      return `#/spiel/${encodeURIComponent(route.id)}`
    case 'einstellungen':
      return '#/einstellungen'
    case 'ranks':
      return '#/ranks'
    case 'historie':
      return '#/historie'
    case 'statistik':
      return '#/statistik'
    case 'anmelden':
      return '#/anmelden'
    case 'benutzer':
      return '#/benutzer'
    case 'online-lobby':
      return '#/online'
    case 'online-tisch':
      return '#/online/tisch'
    case 'online-tisch-vierer':
      return '#/online/tisch-vierer'
    case 'start':
      return '#/'
  }
}

export function hashZuRoute(hash: string): Route {
  const teile = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  const [erstes, zweites] = teile

  switch (erstes) {
    case 'spiel':
      return zweites ? { name: 'spiel', id: decodeURIComponent(zweites) } : { name: 'start' }
    case 'einstellungen':
      return { name: 'einstellungen' }
    case 'ranks':
      return { name: 'ranks' }
    case 'historie':
      return { name: 'historie' }
    case 'statistik':
      return { name: 'statistik' }
    case 'anmelden':
      return { name: 'anmelden' }
    case 'benutzer':
      return { name: 'benutzer' }
    case 'online':
      if (zweites === 'tisch') return { name: 'online-tisch' }
      if (zweites === 'tisch-vierer') return { name: 'online-tisch-vierer' }
      return { name: 'online-lobby' }
    default:
      return { name: 'start' }
  }
}

/**
 * Feste Eltern-Route je Screen – unabhängig vom tatsächlichen Navigationsverlauf.
 * So führt der Zurück-Pfeil immer an dieselbe, vorhersehbare Stelle, egal wie
 * man auf den aktuellen Screen gekommen ist (anders als Browser-„Zurück").
 */
const ELTERN_ROUTE: Partial<Record<Route['name'], Route>> = {
  spiel: { name: 'start' },
  einstellungen: { name: 'start' },
  ranks: { name: 'start' },
  historie: { name: 'start' },
  statistik: { name: 'start' },
  benutzer: { name: 'einstellungen' },
  'online-lobby': { name: 'start' },
  'online-tisch': { name: 'online-lobby' },
  'online-tisch-vierer': { name: 'online-lobby' },
}

export function elternRoute(route: Route): Route {
  return ELTERN_ROUTE[route.name] ?? { name: 'start' }
}

export function navigiere(route: Route): void {
  const ziel = routeZuHash(route)
  if (window.location.hash === ziel) return
  window.location.hash = ziel
}

/** Ersetzt den aktuellen Eintrag, ohne die Verlauf-Historie zu verlängern. */
export function ersetzeRoute(route: Route): void {
  const ziel = routeZuHash(route)
  if (window.location.hash === ziel) return
  window.history.replaceState(null, '', ziel)
  window.dispatchEvent(new Event('hashchange'))
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => hashZuRoute(window.location.hash))

  useEffect(() => {
    const aktualisiere = () => setRoute(hashZuRoute(window.location.hash))
    window.addEventListener('hashchange', aktualisiere)
    aktualisiere()
    return () => window.removeEventListener('hashchange', aktualisiere)
  }, [])

  return route
}

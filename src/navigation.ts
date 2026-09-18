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
    default:
      return { name: 'start' }
  }
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

export function zurueck(): void {
  if (window.history.length > 1) window.history.back()
  else navigiere({ name: 'start' })
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

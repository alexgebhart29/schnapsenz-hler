import { useEffect } from 'react'
import { starteSynchronisation, useSitzung } from './core/session'
import { useAppState } from './core/store'
import { ersetzeRoute, useRoute } from './navigation'
import { AdminScreen } from './screens/AdminScreen'
import { GameScreen } from './screens/GameScreen'
import { HistoryScreen } from './screens/HistoryScreen'
import { LoginScreen } from './screens/LoginScreen'
import { OnlineLobbyScreen } from './screens/OnlineLobbyScreen'
import { OnlineTischScreen } from './screens/OnlineTischScreen'
import { RanksScreen } from './screens/RanksScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { StartScreen } from './screens/StartScreen'
import { StatsScreen } from './screens/StatsScreen'
import type { Theme } from './core/types'

/** Setzt das Theme (System folgt der Geräteeinstellung). */
function useTheme(theme: Theme): void {
  useEffect(() => {
    const medien = window.matchMedia('(prefers-color-scheme: dark)')

    const anwenden = () => {
      const dunkel = theme === 'dunkel' || (theme === 'system' && medien.matches)
      document.documentElement.dataset.theme = dunkel ? 'dunkel' : 'hell'
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', dunkel ? '#101d17' : '#f3f6f1')
    }

    anwenden()
    if (theme !== 'system') return
    medien.addEventListener('change', anwenden)
    return () => medien.removeEventListener('change', anwenden)
  }, [theme])
}

export function App() {
  const state = useAppState()
  const route = useRoute()
  const sitzung = useSitzung()
  useTheme(state.settings.theme)

  useEffect(() => {
    starteSynchronisation()
  }, [])

  const spiel = route.name === 'spiel' ? state.spiele.find((s) => s.id === route.id) : undefined

  // Ungültige Spiel-Route (z. B. gelöschtes Spiel) → zurück zum Start.
  useEffect(() => {
    if (route.name === 'spiel' && !spiel) ersetzeRoute({ name: 'start' })
  }, [route, spiel])

  // Server vorhanden, aber nicht angemeldet: zuerst die Anmeldung zeigen.
  const brauchtAnmeldung = sitzung.status === 'abgemeldet'

  if (sitzung.status === 'pruefe') {
    return <div className="app" />
  }

  if (route.name === 'anmelden' || brauchtAnmeldung) {
    return (
      <div className="app">
        <LoginScreen />
      </div>
    )
  }

  return (
    <div className="app">
      {route.name === 'spiel' && spiel ? (
        <GameScreen spiel={spiel} state={state} />
      ) : route.name === 'einstellungen' ? (
        <SettingsScreen state={state} />
      ) : route.name === 'ranks' ? (
        <RanksScreen state={state} />
      ) : route.name === 'historie' ? (
        <HistoryScreen state={state} />
      ) : route.name === 'statistik' ? (
        <StatsScreen state={state} />
      ) : route.name === 'benutzer' ? (
        <AdminScreen />
      ) : route.name === 'online-lobby' ? (
        <OnlineLobbyScreen state={state} />
      ) : route.name === 'online-tisch' ? (
        <OnlineTischScreen state={state} kartendesign={state.settings.kartendesign} />
      ) : (
        <StartScreen state={state} />
      )}
    </div>
  )
}

import { useState } from 'react'
import { Dialog } from '../components/Dialog'
import { Screen } from '../components/Screen'
import { navigiere } from '../navigation'
import { api } from '../core/api'
import { abmelden, fuehreSyncAus, useSitzung } from '../core/session'
import { actions } from '../core/store'
import { MAX_STARTWERT, MIN_STARTWERT } from '../core/schnapsen'
import type { AppState, Theme } from '../core/types'
import { Stepper } from './StartScreen'
import { RankVerwaltung } from './RanksScreen'

type Props = { state: AppState }

type Bestaetigung = 'namen' | 'historie' | 'alles' | null

const THEMES: { wert: Theme; label: string }[] = [
  { wert: 'system', label: 'System' },
  { wert: 'hell', label: 'Hell' },
  { wert: 'dunkel', label: 'Dunkel' },
]

export function SettingsScreen({ state }: Props) {
  const [bestaetigung, setBestaetigung] = useState<Bestaetigung>(null)

  return (
    <Screen titel="Einstellungen">
      <section className="karte">
        <h2 className="karte__titel">Zähler</h2>
        <div className="reihe reihe--verteilt">
          <div className="wachsen">
            <div style={{ fontWeight: 600 }}>Startwert Zweier</div>
            <div className="hinweis">
              {MIN_STARTWERT}–{MAX_STARTWERT} Punkte, gilt für neue Zweier-Spiele
            </div>
          </div>
          <Stepper
            wert={state.settings.startwert}
            onChange={(startwert) => actions.setSettings({ startwert })}
            label="Startwert Zweier"
          />
        </div>
        <hr className="trenner" />
        <div className="reihe reihe--verteilt">
          <div className="wachsen">
            <div style={{ fontWeight: 600 }}>Startwert Vierer</div>
            <div className="hinweis">
              {MIN_STARTWERT}–{MAX_STARTWERT} Punkte, gilt für neue Vierer-Spiele (traditionell 24)
            </div>
          </div>
          <Stepper
            wert={state.settings.startwertVierer}
            onChange={(startwertVierer) => actions.setSettings({ startwertVierer })}
            label="Startwert Vierer"
          />
        </div>
      </section>

      <section className="karte">
        <h2 className="karte__titel">Darstellung</h2>
        <div className="segmente">
          {THEMES.map((theme) => (
            <button
              type="button"
              key={theme.wert}
              className="segmente__knopf"
              aria-pressed={state.settings.theme === theme.wert}
              onClick={() => actions.setSettings({ theme: theme.wert })}
            >
              {theme.label}
            </button>
          ))}
        </div>
      </section>

      <RankVerwaltung ranks={state.ranks} />

      <KontoBereich />

      <section className="karte">
        <h2 className="karte__titel">Gespeicherte Spielernamen</h2>
        {state.namen.length === 0 ? (
          <p className="hinweis" style={{ margin: 0 }}>
            Noch keine Namen gespeichert. Namen werden beim Spielstart automatisch gemerkt.
          </p>
        ) : (
          <div className="chips">
            {state.namen.map((eintrag) => (
              <button
                type="button"
                key={eintrag.name}
                className="chip"
                onClick={() => actions.nameEntfernen(eintrag.name)}
                title={`${eintrag.name} aus den Vorschlägen entfernen`}
              >
                {eintrag.name} ✕
              </button>
            ))}
          </div>
        )}
        {state.namen.length > 0 && (
          <button
            type="button"
            className="btn btn--geist btn--klein"
            onClick={() => setBestaetigung('namen')}
          >
            Alle Namen löschen
          </button>
        )}
      </section>

      <section className="karte">
        <h2 className="karte__titel">Daten</h2>
        <button type="button" className="btn" onClick={() => navigiere({ name: 'historie' })}>
          Spielverlauf ansehen ({state.spiele.length})
        </button>
        <button type="button" className="btn btn--gefahr" onClick={() => setBestaetigung('historie')}>
          Spielverlauf löschen
        </button>
        <button type="button" className="btn btn--gefahr" onClick={() => setBestaetigung('alles')}>
          Alle Daten zurücksetzen
        </button>
        <p className="hinweis" style={{ margin: 0 }}>
          Alle Daten liegen ausschließlich lokal auf diesem Gerät – kein Konto, keine Cloud. Zum
          Installieren am iPhone: in Safari teilen → „Zum Home-Bildschirm“.
        </p>
      </section>

      {bestaetigung && (
        <Dialog
          titel={
            bestaetigung === 'namen'
              ? 'Alle Namen löschen?'
              : bestaetigung === 'historie'
                ? 'Spielverlauf löschen?'
                : 'Alle Daten zurücksetzen?'
          }
          text={
            bestaetigung === 'namen'
              ? 'Die Namensvorschläge werden entfernt. Spiele und Rangliste bleiben erhalten.'
              : bestaetigung === 'historie'
                ? 'Alle protokollierten Spiele werden gelöscht. Ein laufendes Spiel bleibt erhalten.'
                : 'Spiele, Namen, Rangliste und Einstellungen werden gelöscht. Das kann nicht rückgängig gemacht werden.'
          }
          onAbbrechen={() => setBestaetigung(null)}
          aktionen={
            <>
              <button
                type="button"
                className="btn btn--gefahr"
                onClick={() => {
                  if (bestaetigung === 'namen') actions.namenLoeschen()
                  else if (bestaetigung === 'historie') actions.historieLoeschen()
                  else actions.alleDatenLoeschen()
                  setBestaetigung(null)
                }}
              >
                Ja, löschen
              </button>
              <button type="button" className="btn btn--geist" onClick={() => setBestaetigung(null)}>
                Abbrechen
              </button>
            </>
          }
        />
      )}
    </Screen>
  )
}

/** Anmeldung, Passwort und Abgleich – nur sichtbar, wenn ein Server vorhanden ist. */
function KontoBereich() {
  const sitzung = useSitzung()
  const [altes, setAltes] = useState('')
  const [neues, setNeues] = useState('')
  const [meldung, setMeldung] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  if (sitzung.status === 'pruefe' || sitzung.status === 'lokal') return null

  if (sitzung.status === 'abgemeldet') {
    return (
      <section className="karte">
        <h2 className="karte__titel">Konto</h2>
        <p className="hinweis" style={{ margin: 0 }}>
          Nicht angemeldet. Die Spiele bleiben nur auf diesem Gerät.
        </p>
        <button
          type="button"
          className="btn btn--primaer btn--block"
          onClick={() => navigiere({ name: 'anmelden' })}
        >
          Anmelden
        </button>
      </section>
    )
  }

  const aendern = async () => {
    setMeldung(null)
    setFehler(null)
    try {
      await api.passwortAendern(altes, neues)
      setAltes('')
      setNeues('')
      setMeldung('Passwort geändert. Andere Geräte wurden abgemeldet.')
    } catch (ausnahme) {
      setFehler(ausnahme instanceof Error ? ausnahme.message : 'Ändern fehlgeschlagen')
    }
  }

  return (
    <section className="karte">
      <h2 className="karte__titel">Konto</h2>
      <div className="reihe reihe--verteilt">
        <div className="wachsen">
          <div style={{ fontWeight: 600 }}>{sitzung.benutzer?.benutzername}</div>
          <div className="hinweis">
            {sitzung.benutzer?.istAdmin ? 'Administrator' : 'Benutzer'} · Daten werden abgeglichen
          </div>
        </div>
        <button type="button" className="btn btn--klein" onClick={() => void fuehreSyncAus()}>
          Jetzt abgleichen
        </button>
      </div>

      {sitzung.benutzer?.istAdmin && (
        <button type="button" className="btn" onClick={() => navigiere({ name: 'benutzer' })}>
          Benutzer verwalten
        </button>
      )}

      <hr className="trenner" />

      <div className="feld">
        <label className="feld__label" htmlFor="altes-passwort">
          Aktuelles Passwort
        </label>
        <input
          id="altes-passwort"
          className="eingabe"
          type="password"
          value={altes}
          autoComplete="current-password"
          onChange={(event) => setAltes(event.target.value)}
        />
      </div>
      <div className="feld">
        <label className="feld__label" htmlFor="neues-eigenes-passwort">
          Neues Passwort (mindestens 8 Zeichen)
        </label>
        <input
          id="neues-eigenes-passwort"
          className="eingabe"
          type="password"
          value={neues}
          autoComplete="new-password"
          onChange={(event) => setNeues(event.target.value)}
        />
      </div>

      {meldung && <p className="hinweis" style={{ margin: 0 }}>{meldung}</p>}
      {fehler && <p className="fehler">{fehler}</p>}

      <button
        type="button"
        className="btn"
        onClick={() => void aendern()}
        disabled={!altes || neues.length < 8}
      >
        Passwort ändern
      </button>

      <button
        type="button"
        className="btn btn--gefahr"
        onClick={() => {
          void abmelden()
          navigiere({ name: 'anmelden' })
        }}
      >
        Abmelden
      </button>
    </section>
  )
}

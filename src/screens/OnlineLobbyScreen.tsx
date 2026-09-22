import { useCallback, useEffect, useState } from 'react'
import { Dialog } from '../components/Dialog'
import { Screen } from '../components/Screen'
import { navigiere } from '../navigation'
import { api } from '../core/api'
import { onlineAktionen, useOnlineZustand } from '../core/onlineSitzung'
import { onlineAktionenVierer, useOnlineZustandVierer } from '../core/onlineSitzungVierer'
import { parteiName } from '../core/schnapsen'
import type { AppState, Spiel } from '../core/types'

type OffenerTisch = { id: string; ersteller: string }
type OffenerTischVierer = { id: string; plaetze: (string | null)[] }

type Props = { state: AppState }

/** Tisch erstellen oder einem offenen Tisch aus der Liste beitreten. */
export function OnlineLobbyScreen({ state }: Props) {
  const zustand = useOnlineZustand()
  const zustandVierer = useOnlineZustandVierer()
  const [offeneTische, setOffeneTische] = useState<OffenerTisch[] | null>(null)
  const [offeneTischeVierer, setOffeneTischeVierer] = useState<OffenerTischVierer[] | null>(null)
  const [ladeFehler, setLadeFehler] = useState<string | null>(null)
  const [fortsetzenSpiel, setFortsetzenSpiel] = useState<Spiel | null>(null)

  const laden = useCallback(() => {
    api
      .offeneTische()
      .then((antwort) => setOffeneTische(antwort.tische))
      .catch((ausnahme) => {
        setLadeFehler(ausnahme instanceof Error ? ausnahme.message : 'Konnte Tische nicht laden')
      })
    api
      .offeneTischeVierer()
      .then((antwort) => setOffeneTischeVierer(antwort.tische))
      .catch(() => {
        // Fehler beim Vierer-Laden wird nicht separat angezeigt, die Zweier-Meldung reicht.
      })
  }, [])

  useEffect(() => {
    laden()
  }, [laden])

  // Sobald ein Gegner am Tisch ist (Sicht mit richtigem zweiten Namen kommt
  // an) oder eine Partie läuft, direkt zum Spieltisch weiterleiten.
  useEffect(() => {
    if (zustand.status === 'wartet-auf-gegner' || zustand.status === 'laufend') {
      navigiere({ name: 'online-tisch' })
    }
  }, [zustand.status])

  useEffect(() => {
    if (zustandVierer.status === 'warteraum' || zustandVierer.status === 'laufend') {
      navigiere({ name: 'online-tisch-vierer' })
    }
  }, [zustandVierer.status])

  const laufendeSpiele = state.spiele.filter(
    (spiel) => spiel.status === 'laufend' && spiel.modus === 'zweier',
  )

  return (
    <Screen titel="Online spielen">
      {laufendeSpiele.length > 0 && (
        <section className="karte">
          <h2 className="karte__titel">Laufendes Spiel online fortsetzen</h2>
          <p className="hinweis" style={{ margin: 0 }}>
            Der aktuelle Punktestand wird zum Startwert des Online-Tisches.
          </p>
          <div className="liste">
            {laufendeSpiele.map((spiel) => (
              <div className="eintrag" key={spiel.id}>
                <div className="wachsen">
                  <div className="eintrag__titel">
                    {parteiName(spiel, 0)} vs. {parteiName(spiel, 1)}
                  </div>
                  <div className="eintrag__meta">
                    Stand {spiel.punkte[0]} : {spiel.punkte[1]}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn--klein"
                  disabled={zustand.status === 'verbindet'}
                  onClick={() => setFortsetzenSpiel(spiel)}
                >
                  Fortsetzen
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="karte">
        <div className="reihe reihe--verteilt">
          <h2 className="karte__titel">Offene Tische</h2>
          <button type="button" className="btn btn--geist btn--klein" onClick={laden}>
            Aktualisieren
          </button>
        </div>
        {offeneTische === null && !ladeFehler && (
          <p className="hinweis" style={{ margin: 0 }}>
            Lade …
          </p>
        )}
        {ladeFehler && <p className="fehler">{ladeFehler}</p>}
        {offeneTische?.length === 0 && (
          <p className="hinweis" style={{ margin: 0 }}>
            Gerade wartet niemand auf einen Gegner. Eröffne selbst einen Tisch!
          </p>
        )}
        {offeneTische && offeneTische.length > 0 && (
          <div className="liste">
            {offeneTische.map((tisch) => (
              <div className="eintrag" key={tisch.id}>
                <div className="wachsen">
                  <div className="eintrag__titel">{tisch.ersteller}</div>
                </div>
                <button
                  type="button"
                  className="btn btn--primaer btn--klein"
                  disabled={zustand.status === 'verbindet'}
                  onClick={() => onlineAktionen.tischBeitreten(tisch.id)}
                >
                  Beitreten
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="karte">
        <h2 className="karte__titel">Neuen Tisch eröffnen</h2>
        <p className="hinweis" style={{ margin: 0 }}>
          Dein Tisch erscheint bei allen anderen in der Liste offener Tische.
        </p>
        <button
          type="button"
          className="btn btn--primaer btn--block"
          disabled={zustand.status === 'verbindet'}
          onClick={() => onlineAktionen.tischErstellen()}
        >
          Tisch eröffnen
        </button>
      </section>

      <section className="karte">
        <div className="reihe reihe--verteilt">
          <h2 className="karte__titel">Offene Tische (Vierer)</h2>
          <button type="button" className="btn btn--geist btn--klein" onClick={laden}>
            Aktualisieren
          </button>
        </div>
        {offeneTischeVierer?.length === 0 && (
          <p className="hinweis" style={{ margin: 0 }}>
            Gerade wartet kein Vierer-Tisch auf Mitspieler. Eröffne selbst einen!
          </p>
        )}
        {offeneTischeVierer && offeneTischeVierer.length > 0 && (
          <div className="liste">
            {offeneTischeVierer.map((tisch) => {
              const besetzt = tisch.plaetze.filter((name) => name !== null).length
              return (
                <div className="eintrag" key={tisch.id}>
                  <div className="wachsen">
                    <div className="eintrag__titel">
                      {tisch.plaetze.filter((name): name is string => name !== null).join(', ')}
                    </div>
                    <div className="eintrag__meta">{besetzt} / 4 Plätze besetzt</div>
                  </div>
                  <button
                    type="button"
                    className="btn btn--primaer btn--klein"
                    disabled={zustandVierer.status === 'verbindet'}
                    onClick={() => onlineAktionenVierer.tischBeitreten(tisch.id)}
                  >
                    Beitreten
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="karte">
        <h2 className="karte__titel">Neuen Vierer-Tisch eröffnen</h2>
        <p className="hinweis" style={{ margin: 0 }}>
          4 Spieler, feste Teams (Platz 1+3 gegen Platz 2+4 in Beitrittsreihenfolge), mit Ansage und Spritzen.
        </p>
        <button
          type="button"
          className="btn btn--primaer btn--block"
          disabled={zustandVierer.status === 'verbindet'}
          onClick={() => onlineAktionenVierer.tischErstellen(state.settings.bettlerAktiv)}
        >
          Vierer-Tisch eröffnen
        </button>
      </section>

      {zustand.fehler && <p className="fehler">{zustand.fehler}</p>}
      {zustandVierer.fehler && <p className="fehler">{zustandVierer.fehler}</p>}

      {fortsetzenSpiel && (
        <Dialog
          titel="Welche Seite bist du?"
          text="Damit deine Punkte richtig weitergezählt werden."
          onAbbrechen={() => setFortsetzenSpiel(null)}
          aktionen={
            <>
              <button
                type="button"
                className="btn btn--primaer btn--block"
                onClick={() => {
                  onlineAktionen.tischErstellenAusSpiel(fortsetzenSpiel, 0)
                  setFortsetzenSpiel(null)
                }}
              >
                {parteiName(fortsetzenSpiel, 0)}
              </button>
              <button
                type="button"
                className="btn btn--primaer btn--block"
                onClick={() => {
                  onlineAktionen.tischErstellenAusSpiel(fortsetzenSpiel, 1)
                  setFortsetzenSpiel(null)
                }}
              >
                {parteiName(fortsetzenSpiel, 1)}
              </button>
              <button type="button" className="btn btn--geist" onClick={() => setFortsetzenSpiel(null)}>
                Abbrechen
              </button>
            </>
          }
        />
      )}
    </Screen>
  )
}

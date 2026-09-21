import { useState } from 'react'
import { Dialog } from '../components/Dialog'
import { Screen } from '../components/Screen'
import { formatDatum, formatZeit } from '../format'
import { navigiere } from '../navigation'
import { anzeigeBummerl, anzeigeGewinner, parteiName, spielSieger } from '../core/schnapsen'
import { actions } from '../core/store'
import type { AppState, Spiel } from '../core/types'

type Props = { state: AppState }

export function HistoryScreen({ state }: Props) {
  const [offen, setOffen] = useState<string | null>(null)
  const [loeschen, setLoeschen] = useState<Spiel | null>(null)

  return (
    <Screen
      titel="Spielverlauf"
      aktion={
        state.spiele.length > 0 ? (
          <button
            type="button"
            className="btn btn--geist btn--klein"
            onClick={() => navigiere({ name: 'statistik' })}
          >
            Statistik
          </button>
        ) : undefined
      }
    >
      {state.spiele.length === 0 ? (
        <section className="karte">
          <p className="leer">Noch keine Spiele gespielt.</p>
          <button
            type="button"
            className="btn btn--primaer btn--block"
            onClick={() => navigiere({ name: 'start' })}
          >
            Erstes Spiel starten
          </button>
        </section>
      ) : (
        <div className="liste">
          {state.spiele.map((spiel) => (
            <SpielEintrag
              key={spiel.id}
              spiel={spiel}
              offen={offen === spiel.id}
              onToggle={() => setOffen(offen === spiel.id ? null : spiel.id)}
              onLoeschen={() => setLoeschen(spiel)}
            />
          ))}
        </div>
      )}

      {loeschen && (
        <Dialog
          titel="Spiel löschen?"
          text={`${parteiName(loeschen, 0)} vs. ${parteiName(loeschen, 1)} vom ${formatDatum(loeschen.datum)} wird aus dem Verlauf entfernt.`}
          onAbbrechen={() => setLoeschen(null)}
          aktionen={
            <>
              <button
                type="button"
                className="btn btn--gefahr"
                onClick={() => {
                  actions.spielLoeschen(loeschen.id)
                  setLoeschen(null)
                }}
              >
                Ja, löschen
              </button>
              <button type="button" className="btn btn--geist" onClick={() => setLoeschen(null)}>
                Abbrechen
              </button>
            </>
          }
        />
      )}
    </Screen>
  )
}

function SpielEintrag({
  spiel,
  offen,
  onToggle,
  onLoeschen,
}: {
  spiel: Spiel
  offen: boolean
  onToggle: () => void
  onLoeschen: () => void
}) {
  const sieger = spiel.status === 'beendet' ? spielSieger(spiel) : null
  // Bummerl-Anzeige: umgekehrt zur internen Zählung, die für Rangliste/
  // Statistik weiterläuft – siehe schnapsen.ts → anzeigeBummerl().
  const anzeigeSieger = sieger === null ? null : anzeigeGewinner(sieger)
  const [anzeige0, anzeige1] = anzeigeBummerl(spiel)

  return (
    <div className="karte" style={{ padding: 0, gap: 0 }}>
      <button
        type="button"
        className="eintrag eintrag--knopf"
        style={{ border: 0, background: 'transparent' }}
        onClick={onToggle}
        aria-expanded={offen}
      >
        <div className="wachsen">
          <div className="eintrag__titel">
            <span style={anzeigeSieger === 0 ? { color: 'var(--gold)' } : undefined}>
              {parteiName(spiel, 0)}
            </span>
            <span className="muted"> vs. </span>
            <span style={anzeigeSieger === 1 ? { color: 'var(--gold)' } : undefined}>
              {parteiName(spiel, 1)}
            </span>
          </div>
          <div className="eintrag__meta">
            {formatDatum(spiel.datum)} · Startwert {spiel.startwert}
            {spiel.modus === 'vierer' ? ' · Vierer' : ''}
          </div>
        </div>
        {spiel.status === 'laufend' && <span className="abzeichen abzeichen--laufend">läuft</span>}
        <span className="eintrag__wert">
          {anzeige0} : {anzeige1}
        </span>
      </button>

      {offen && (
        <div className="stapel" style={{ padding: '0 13px 13px' }}>
          <hr className="trenner" />
          {spiel.bummerlLog.length === 0 ? (
            <p className="hinweis" style={{ margin: 0 }}>
              Kein abgeschlossenes Bummerl in diesem Spiel.
            </p>
          ) : (
            <div className="stapel stapel--eng">
              <div className="karte__titel">Bummerl</div>
              {spiel.bummerlLog.map((eintrag) => (
                <div className="reihe reihe--verteilt klein" key={eintrag.nummer}>
                  <span className="muted">#{eintrag.nummer}</span>
                  <span className="wachsen" style={{ fontWeight: 600 }}>
                    {parteiName(spiel, anzeigeGewinner(eintrag.gewinner))}
                  </span>
                  {eintrag.schneider && (
                    <span className="abzeichen abzeichen--rang" title="Verlierer hat keinen Punkt gemacht, zählte doppelt">
                      Schneider ×2
                    </span>
                  )}
                  <span className="muted mono-zahl">
                    {eintrag.endstand[0]} : {eintrag.endstand[1]}
                  </span>
                  <span className="muted">{formatZeit(eintrag.beendetAm)}</span>
                </div>
              ))}
            </div>
          )}

          {spiel.status === 'beendet' && spiel.beendetAm && (
            <p className="hinweis" style={{ margin: 0 }}>
              Beendet am {formatDatum(spiel.beendetAm)}
              {anzeigeSieger !== null
                ? ` · Sieger: ${parteiName(spiel, anzeigeSieger)}`
                : ' · unentschieden'}
            </p>
          )}

          <div className="btn-gitter">
            <button
              type="button"
              className="btn btn--primaer"
              onClick={() => {
                if (spiel.status === 'laufend') actions.setAktivesSpiel(spiel.id)
                else actions.spielFortsetzen(spiel.id)
                navigiere({ name: 'spiel', id: spiel.id })
              }}
            >
              {spiel.status === 'laufend' ? 'Fortsetzen' : 'Weiterspielen'}
            </button>
            <button type="button" className="btn btn--gefahr" onClick={onLoeschen}>
              Löschen
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

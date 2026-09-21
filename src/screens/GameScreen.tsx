import { useState } from 'react'
import { Dialog } from '../components/Dialog'
import { Screen } from '../components/Screen'
import { formatZeit } from '../format'
import { navigiere } from '../navigation'
import {
  ABZUG_OPTIONEN,
  anzeigeBummerl,
  anzeigeGewinner,
  BETTLER_PUNKTE,
  bummerlAbschliessen,
  entschieden,
  gegner,
  kannAbziehen,
  kannUndo,
  letzterUndoLabel,
  parteiName,
  punkteAbziehen,
  spielBeenden,
  spielSieger,
  undo,
} from '../core/schnapsen'
import { actions, sortierteKategorien } from '../core/store'
import type { AppState, Spiel, SpielerIndex } from '../core/types'

type Props = { spiel: Spiel; state: AppState }

type OffenerDialog = 'spielBeenden' | null

/** Punktekategorien fürs Vierer als Schaltflächen, inkl. „Bettler“ falls aktiviert. */
function vierKategorien(state: AppState): { id: string; name: string; punkte: number }[] {
  const kategorien = sortierteKategorien(state.kategorien)
  if (!state.settings.bettlerAktiv) return kategorien
  return [...kategorien, { id: 'bettler', name: 'Bettler', punkte: BETTLER_PUNKTE }]
}

export function GameScreen({ spiel, state }: Props) {
  const [dialog, setDialog] = useState<OffenerDialog>(null)
  const kategorien = vierKategorien(state)

  const sieger = entschieden(spiel)
  const beendet = spiel.status === 'beendet'
  const gesamtSieger = beendet ? spielSieger(spiel) : null
  const aenderbar = kannAbziehen(spiel)
  const schneiderAktiv = state.settings.schneiderAktiv
  // Steht das Bummerl schon fest, hier vorab anzeigen, ob es als Schneider zählt.
  const wirdSchneider =
    sieger !== null && schneiderAktiv && spiel.punkte[gegner(sieger)] === spiel.startwert
  // Bummerl-Anzeige (Leiste, Verlauf, Dialoge): umgekehrt zur internen
  // Zählung, die für Rangliste/Statistik weiterläuft – siehe anzeigeBummerl().
  const [anzeige0, anzeige1] = anzeigeBummerl(spiel)

  const update = (fn: (spiel: Spiel) => Spiel) => actions.updateSpiel(spiel.id, fn)

  const fortsetzen = () => actions.spielFortsetzen(spiel.id)

  const abziehen = (spieler: SpielerIndex, punkte: number) =>
    update((aktuell) => punkteAbziehen(aktuell, spieler, punkte))

  const naechstesBummerl = () =>
    update((aktuell) => bummerlAbschliessen(aktuell, undefined, undefined, schneiderAktiv))

  const beenden = () => {
    update((aktuell) => spielBeenden(aktuell, undefined, schneiderAktiv))
    setDialog(null)
    navigiere({ name: 'historie' })
  }

  return (
    <Screen
      titel={`${parteiName(spiel, 0)} vs. ${parteiName(spiel, 1)}`}
      aktion={
        <button
          type="button"
          className="btn btn--geist btn--klein"
          onClick={() => update(undo)}
          disabled={!kannUndo(spiel)}
        >
          ↩︎ Undo
        </button>
      }
    >
      <div className="bummerl-leiste">
        <span className="bummerl-leiste__name">{parteiName(spiel, 0)}</span>
        <span className="bummerl-leiste__wert mono-zahl">{anzeige0}</span>
        <span className="bummerl-leiste__label">Bummerl</span>
        <span className="bummerl-leiste__wert mono-zahl">{anzeige1}</span>
        <span className="bummerl-leiste__name">{parteiName(spiel, 1)}</span>
      </div>

      {beendet && (
        <section className="karte">
          <h2 className="karte__titel">Spiel beendet</h2>
          <p className="hinweis" style={{ margin: 0 }}>
            Endstand {anzeige0} : {anzeige1}
            {gesamtSieger !== null
              ? ` · Sieger: ${parteiName(spiel, anzeigeGewinner(gesamtSieger))}`
              : ' · unentschieden'}.
            Du kannst jederzeit weiterspielen – Bummerl-Stand und Verlauf bleiben erhalten.
          </p>
          <button
            type="button"
            className="btn btn--primaer btn--gross btn--block"
            onClick={fortsetzen}
          >
            Weiterspielen
          </button>
        </section>
      )}

      {([0, 1] as const).map((index) => (
        <SpielerKarte
          key={index}
          spiel={spiel}
          index={index}
          aenderbar={aenderbar}
          hervorgehoben={sieger === index}
          kategorien={kategorien}
          onAbziehen={abziehen}
        />
      ))}

      {kannUndo(spiel) && (
        <p className="hinweis" style={{ textAlign: 'center' }}>
          Letzte Aktion: {letzterUndoLabel(spiel)}
        </p>
      )}

      {!beendet && (
        <button
          type="button"
          className="btn btn--block"
          onClick={() => setDialog('spielBeenden')}
        >
          Spiel beenden
        </button>
      )}

      {spiel.bummerlLog.length > 0 && (
        <section className="karte karte--flach">
          <h2 className="karte__titel">Bummerl-Verlauf</h2>
          <div className="stapel stapel--eng">
            {[...spiel.bummerlLog].reverse().map((eintrag) => (
              <div className="reihe reihe--verteilt klein" key={eintrag.nummer}>
                <span className="muted">#{eintrag.nummer}</span>
                <span className="wachsen" style={{ fontWeight: 600 }}>
                  {parteiName(spiel, anzeigeGewinner(eintrag.gewinner))}
                </span>
                {eintrag.schneider && (
                  <span className="abzeichen abzeichen--rang" title="Verlierer hat keinen Punkt gemacht, zählt doppelt">
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
        </section>
      )}

      {sieger !== null && (
        <Dialog
          icon="🏆"
          titel={`${parteiName(spiel, anzeigeGewinner(sieger))} gewinnt das Bummerl!${wirdSchneider ? ' Schneider!' : ''}`}
          text={`${wirdSchneider ? 'Der Verlierer hat keinen Punkt gemacht – zählt doppelt. ' : ''}Bummerl-Stand: ${anzeige0} : ${anzeige1} → ${
            anzeigeGewinner(sieger) === 0 ? anzeige0 + (wirdSchneider ? 2 : 1) : anzeige0
          } : ${anzeigeGewinner(sieger) === 1 ? anzeige1 + (wirdSchneider ? 2 : 1) : anzeige1}`}
          aktionen={
            <>
              <button type="button" className="btn btn--primaer btn--gross" onClick={naechstesBummerl}>
                Neues Bummerl
              </button>
              <button type="button" className="btn" onClick={beenden}>
                Spiel beenden
              </button>
              <button type="button" className="btn btn--geist" onClick={() => update(undo)}>
                ↩︎ Letzten Abzug zurücknehmen
              </button>
            </>
          }
        />
      )}

      {dialog === 'spielBeenden' && (
        <Dialog
          titel="Spiel beenden?"
          text={`Das Spiel wird mit ${anzeige0} : ${anzeige1} Bummerl in der Historie gespeichert.`}
          onAbbrechen={() => setDialog(null)}
          aktionen={
            <>
              <button type="button" className="btn btn--primaer" onClick={beenden}>
                Ja, beenden
              </button>
              <button type="button" className="btn btn--geist" onClick={() => setDialog(null)}>
                Weiterspielen
              </button>
            </>
          }
        />
      )}
    </Screen>
  )
}

function SpielerKarte({
  spiel,
  index,
  aenderbar,
  hervorgehoben,
  kategorien,
  onAbziehen,
}: {
  spiel: Spiel
  index: SpielerIndex
  aenderbar: boolean
  hervorgehoben: boolean
  kategorien: { id: string; name: string; punkte: number }[]
  onAbziehen: (spieler: SpielerIndex, punkte: number) => void
}) {
  const punkte = spiel.punkte[index]
  return (
    <section className={hervorgehoben ? 'spieler spieler--sieger' : 'spieler'}>
      <div className="spieler__kopf">
        <h2 className="spieler__name">{parteiName(spiel, index)}</h2>
        <span className="klein muted">{spiel.bummerl[gegner(index)]} Bummerl</span>
      </div>

      <div
        className={punkte <= 0 ? 'spieler__zahl spieler__zahl--null mono-zahl' : 'spieler__zahl mono-zahl'}
        aria-label={`${parteiName(spiel, index)} hat noch ${punkte} Punkte`}
      >
        {punkte}
      </div>

      <div className="spieler__fuss">
        <span>
          <strong>{parteiName(spiel, index)}</strong> gewinnt die Partie
        </span>
        <span>Augen des Gegners</span>
      </div>

      <div className="spieler__abzug">
        {ABZUG_OPTIONEN.map((option) => (
          <button
            type="button"
            key={option.punkte}
            className="abzug-knopf"
            disabled={!aenderbar}
            onClick={() => onAbziehen(index, option.punkte)}
            title={`${parteiName(spiel, index)} gewinnt die Partie: ${option.beschreibung}`}
          >
            <span className="abzug-knopf__zahl">−{option.punkte}</span>
            <span className="abzug-knopf__text">
              {option.punkte === 3 ? 'schwarz' : option.punkte === 2 ? '1–32' : '33+'}
            </span>
          </button>
        ))}
      </div>

      {spiel.modus === 'vierer' && (
        <>
          {kategorien.length > 0 && (
            <div className="kategorie-gitter">
              {kategorien.map((kategorie) => (
                <button
                  type="button"
                  key={kategorie.id}
                  className="kategorie-knopf"
                  disabled={!aenderbar}
                  onClick={() => onAbziehen(index, kategorie.punkte)}
                  title={`${parteiName(spiel, index)} gewinnt die Partie: ${kategorie.name}`}
                >
                  <span className="kategorie-knopf__zahl">−{kategorie.punkte}</span>
                  <span className="kategorie-knopf__text">{kategorie.name}</span>
                </button>
              ))}
            </div>
          )}
          <FreieAbzugEingabe
            aenderbar={aenderbar}
            label={parteiName(spiel, index)}
            onAbziehen={(punkte) => onAbziehen(index, punkte)}
          />
        </>
      )}
    </section>
  )
}

/**
 * Im Vierer können je nach Spielausgang auch mehr als 3 Punkte vergeben
 * werden – hier lässt sich ein beliebiger Wert eintragen.
 */
function FreieAbzugEingabe({
  aenderbar,
  label,
  onAbziehen,
}: {
  aenderbar: boolean
  label: string
  onAbziehen: (punkte: number) => void
}) {
  const [wert, setWert] = useState('')
  const zahl = Number(wert)
  const gueltig = wert.trim() !== '' && Number.isFinite(zahl) && zahl > 0

  const absenden = () => {
    if (!gueltig) return
    onAbziehen(Math.round(zahl))
    setWert('')
  }

  return (
    <div className="stapel stapel--eng">
      <span className="klein muted">Andere Punktzahl (falls mehr vergeben werden)</span>
      <div className="reihe">
        <input
          className="eingabe wachsen"
          type="number"
          inputMode="numeric"
          min={1}
          placeholder="z. B. 4"
          value={wert}
          disabled={!aenderbar}
          onChange={(event) => setWert(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') absenden()
          }}
          aria-label={`Andere Punktzahl für ${label}`}
        />
        <button
          type="button"
          className="btn btn--klein"
          disabled={!aenderbar || !gueltig}
          onClick={absenden}
          aria-label={`Abziehen für ${label}`}
        >
          Abziehen
        </button>
      </div>
    </div>
  )
}

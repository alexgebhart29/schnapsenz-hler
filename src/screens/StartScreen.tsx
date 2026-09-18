import { useId, useMemo, useState } from 'react'
import { formatRelativ } from '../format'
import { navigiere } from '../navigation'
import {
  endstandText,
  MAX_STARTWERT,
  MIN_STARTWERT,
  normalizeStartwert,
  parteiName,
} from '../core/schnapsen'
import { actions, namensListe } from '../core/store'
import type { AppState, Modus, Spiel } from '../core/types'
import { SyncAnzeige } from '../components/SyncAnzeige'

type Props = { state: AppState }

/** Beschriftung der Eingabefelder je Spielform. */
const FELDER: Record<Modus, string[]> = {
  zweier: ['Spieler 1', 'Spieler 2'],
  vierer: ['Team 1 – Spieler 1', 'Team 1 – Spieler 2', 'Team 2 – Spieler 1', 'Team 2 – Spieler 2'],
}

export function StartScreen({ state }: Props) {
  const [modus, setModus] = useState<Modus>('zweier')
  const [namen, setNamen] = useState<string[]>(['', '', '', ''])
  const [startwert, setStartwert] = useState<number>(state.settings.startwert)
  const [fehler, setFehler] = useState<string | null>(null)
  const listeId = useId()

  const gemerkteNamen = useMemo(() => namensListe(state.namen), [state.namen])
  const anzahlFelder = modus === 'zweier' ? 2 : 4

  const aktivesSpiel = useMemo(
    () =>
      state.spiele.find(
        (spiel) => spiel.id === state.aktivesSpielId && spiel.status === 'laufend',
      ) ?? null,
    [state.spiele, state.aktivesSpielId],
  )

  const letzteSpiele = useMemo(
    () => state.spiele.filter((spiel) => spiel.id !== aktivesSpiel?.id).slice(0, 3),
    [state.spiele, aktivesSpiel],
  )

  const setName = (index: number, wert: string) => {
    setNamen((alt) => alt.map((name, i) => (i === index ? wert : name)))
    setFehler(null)
  }

  const wechsleModus = (neuer: Modus) => {
    setModus(neuer)
    setStartwert(neuer === 'vierer' ? state.settings.startwertVierer : state.settings.startwert)
    setFehler(null)
  }

  const starten = () => {
    const eingaben = namen.slice(0, anzahlFelder).map((name) => name.trim())

    if (eingaben.some((name) => !name)) {
      setFehler(
        modus === 'zweier'
          ? 'Bitte beide Spielernamen eingeben.'
          : 'Bitte alle vier Spielernamen eingeben.',
      )
      return
    }

    const schluessel = eingaben.map((name) => name.toLowerCase())
    if (new Set(schluessel).size !== schluessel.length) {
      setFehler('Jeder Spieler darf nur einmal vorkommen.')
      return
    }

    const spiel =
      modus === 'zweier'
        ? actions.neuesSpiel([eingaben[0]!, eingaben[1]!], { startwert, modus })
        : actions.neuesSpiel([eingaben[0]!, eingaben[2]!], {
            startwert,
            modus,
            partner: [eingaben[1]!, eingaben[3]!],
          })

    setNamen(['', '', '', ''])
    navigiere({ name: 'spiel', id: spiel.id })
  }

  /** Vorschläge, die nicht schon in einem anderen Feld stehen. */
  const vorschlaege = (index: number) => {
    const belegt = new Set(
      namen
        .slice(0, anzahlFelder)
        .filter((_, i) => i !== index)
        .map((name) => name.trim().toLowerCase())
        .filter(Boolean),
    )
    return gemerkteNamen.filter((name) => !belegt.has(name.toLowerCase())).slice(0, 8)
  }

  return (
    <div className="screen">
      <div className="marke">
        <div className="marke__titel">Schnapsen Zähler</div>
        <div className="marke__untertitel">Bummerl &amp; Punkte im Blick</div>
      </div>

      <SyncAnzeige />

      {aktivesSpiel && <LaufendesSpiel spiel={aktivesSpiel} />}

      <section className="karte">
        <h2 className="karte__titel">Neues Spiel</h2>

        <div className="segmente">
          <button
            type="button"
            className="segmente__knopf"
            aria-pressed={modus === 'zweier'}
            onClick={() => wechsleModus('zweier')}
          >
            Zweier
          </button>
          <button
            type="button"
            className="segmente__knopf"
            aria-pressed={modus === 'vierer'}
            onClick={() => wechsleModus('vierer')}
          >
            Vierer (2 gegen 2)
          </button>
        </div>

        <datalist id={listeId}>
          {gemerkteNamen.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>

        {FELDER[modus].map((beschriftung, index) => (
          <div className="feld" key={beschriftung}>
            <label className="feld__label" htmlFor={`spieler-${index}`}>
              {beschriftung}
            </label>
            <input
              id={`spieler-${index}`}
              className="eingabe"
              list={listeId}
              value={namen[index] ?? ''}
              placeholder={['z. B. Anna', 'z. B. Bert', 'z. B. Cilli', 'z. B. Dori'][index]}
              autoComplete="off"
              autoCapitalize="words"
              enterKeyHint={index === anzahlFelder - 1 ? 'go' : 'next'}
              onChange={(event) => setName(index, event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && index === anzahlFelder - 1) starten()
              }}
            />
            {vorschlaege(index).length > 0 && (
              <div className="chips">
                {vorschlaege(index).map((name) => (
                  <button
                    type="button"
                    key={name}
                    className="chip"
                    aria-pressed={namen[index] === name}
                    onClick={() => setName(index, name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        <div className="reihe reihe--verteilt">
          <span className="feld__label">Startwert</span>
          <Stepper wert={startwert} onChange={setStartwert} />
        </div>

        {fehler && <p className="fehler">{fehler}</p>}

        <button type="button" className="btn btn--primaer btn--gross btn--block" onClick={starten}>
          Spiel starten
        </button>
      </section>

      {letzteSpiele.length > 0 && (
        <section className="stapel">
          <div className="reihe reihe--verteilt">
            <h2 className="karte__titel">Letzte Spiele</h2>
            <button
              type="button"
              className="btn btn--geist btn--klein"
              onClick={() => navigiere({ name: 'historie' })}
            >
              Alle
            </button>
          </div>
          <div className="liste">
            {letzteSpiele.map((spiel) => (
              <button
                type="button"
                key={spiel.id}
                className="eintrag eintrag--knopf"
                onClick={() => {
                  if (spiel.status === 'laufend') actions.setAktivesSpiel(spiel.id)
                  navigiere({ name: 'spiel', id: spiel.id })
                }}
              >
                <div className="wachsen">
                  <div className="eintrag__titel">
                    {parteiName(spiel, 0)} vs. {parteiName(spiel, 1)}
                  </div>
                  <div className="eintrag__meta">
                    {formatRelativ(spiel.datum)}
                    {spiel.modus === 'vierer' ? ' · Vierer' : ''}
                  </div>
                </div>
                {spiel.status === 'laufend' && (
                  <span className="abzeichen abzeichen--laufend">läuft</span>
                )}
                <span className="eintrag__wert">{endstandText(spiel)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <nav className="nav-gitter">
        <NavFeld
          icon="🏆"
          titel="Rangliste"
          text={
            state.ranks.length === 0
              ? 'Stufen anlegen'
              : `${state.ranks.length} ${state.ranks.length === 1 ? 'Stufe' : 'Stufen'}`
          }
          onClick={() => navigiere({ name: 'ranks' })}
        />
        <NavFeld
          icon="📊"
          titel="Statistik"
          text="Siegquoten & Gegner"
          onClick={() => navigiere({ name: 'statistik' })}
        />
        <NavFeld
          icon="🕑"
          titel="Historie"
          text={`${state.spiele.length} ${state.spiele.length === 1 ? 'Spiel' : 'Spiele'}`}
          onClick={() => navigiere({ name: 'historie' })}
        />
        <NavFeld
          icon="⚙️"
          titel="Einstellungen"
          text={`Startwert ${state.settings.startwert}`}
          onClick={() => navigiere({ name: 'einstellungen' })}
        />
      </nav>
    </div>
  )
}

function LaufendesSpiel({ spiel }: { spiel: Spiel }) {
  return (
    <section className="karte">
      <h2 className="karte__titel">Laufendes Spiel</h2>
      <div className="reihe reihe--verteilt">
        <div className="wachsen">
          <div className="eintrag__titel">
            {parteiName(spiel, 0)} vs. {parteiName(spiel, 1)}
          </div>
          <div className="eintrag__meta">
            Bummerl {endstandText(spiel)} · Punkte {spiel.punkte[0]} : {spiel.punkte[1]}
          </div>
        </div>
      </div>
      <button
        type="button"
        className="btn btn--primaer btn--block"
        onClick={() => navigiere({ name: 'spiel', id: spiel.id })}
      >
        Fortsetzen
      </button>
    </section>
  )
}

export function Stepper({
  wert,
  onChange,
  label = 'Startwert',
}: {
  wert: number
  onChange: (wert: number) => void
  /** Eindeutige Beschriftung, wichtig wenn mehrere Stepper auf einem Screen stehen. */
  label?: string
}) {
  return (
    <div className="stepper">
      <button
        type="button"
        className="btn btn--icon"
        onClick={() => onChange(normalizeStartwert(wert - 1))}
        disabled={wert <= MIN_STARTWERT}
        aria-label={`${label} verringern`}
      >
        −
      </button>
      <input
        className="eingabe eingabe--zahl"
        type="number"
        inputMode="numeric"
        min={MIN_STARTWERT}
        max={MAX_STARTWERT}
        value={wert}
        onChange={(event) => {
          const zahl = Number(event.target.value)
          if (Number.isFinite(zahl)) onChange(normalizeStartwert(zahl))
        }}
        aria-label={label}
      />
      <button
        type="button"
        className="btn btn--icon"
        onClick={() => onChange(normalizeStartwert(wert + 1))}
        disabled={wert >= MAX_STARTWERT}
        aria-label={`${label} erhöhen`}
      >
        +
      </button>
    </div>
  )
}

function NavFeld({
  icon,
  titel,
  text,
  onClick,
}: {
  icon: string
  titel: string
  text: string
  onClick: () => void
}) {
  return (
    <button type="button" className="nav-feld" onClick={onClick}>
      <span className="nav-feld__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="nav-feld__titel">{titel}</span>
      <span className="nav-feld__text">{text}</span>
    </button>
  )
}

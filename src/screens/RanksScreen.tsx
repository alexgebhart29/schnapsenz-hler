import { useMemo, useState } from 'react'
import { Screen } from '../components/Screen'
import { navigiere } from '../navigation'
import { absteigend, einstufungen, inhaber, ranksFuerModus, type Einstufung } from '../core/ranks'
import { berechneStatistik } from '../core/stats'
import { actions } from '../core/store'
import type { AppState, Modus, Rank, Spiel } from '../core/types'

type Props = { state: AppState }

/** Punktzahl einer Partei = Summe ihrer gewonnenen Bummerl in dieser Spielform. */
export function parteiPunkte(spiele: Spiel[], modus: Modus): { name: string; punkte: number }[] {
  return berechneStatistik(spiele, modus).map((eintrag) => ({
    name: eintrag.name,
    punkte: eintrag.bummerlGewonnen,
  }))
}

export function ModusWahl({
  modus,
  onChange,
}: {
  modus: Modus
  onChange: (modus: Modus) => void
}) {
  return (
    <div className="segmente">
      <button
        type="button"
        className="segmente__knopf"
        aria-pressed={modus === 'zweier'}
        onClick={() => onChange('zweier')}
      >
        Zweier
      </button>
      <button
        type="button"
        className="segmente__knopf"
        aria-pressed={modus === 'vierer'}
        onClick={() => onChange('vierer')}
      >
        Vierer
      </button>
    </div>
  )
}

export function RanksScreen({ state }: Props) {
  const [modus, setModus] = useState<Modus>('zweier')

  const punkte = useMemo(() => parteiPunkte(state.spiele, modus), [state.spiele, modus])
  const stufenListe = useMemo(() => ranksFuerModus(state.ranks, modus), [state.ranks, modus])
  const liste = useMemo(() => einstufungen(stufenListe, punkte), [stufenListe, punkte])
  const stufen = useMemo(() => absteigend(stufenListe), [stufenListe])

  return (
    <Screen titel="Rangliste">
      <ModusWahl modus={modus} onChange={setModus} />

      <p className="hinweis" style={{ margin: 0 }}>
        Jede Stufe hat eine Punkteschwelle.{' '}
        {modus === 'zweier'
          ? 'Ein Spieler trägt die höchste Stufe, deren Schwelle er mit seinen gewonnenen Bummerl erreicht hat.'
          : 'Im Vierer zählt das Team als Einheit – die gewonnenen Bummerl des Paares ergeben seine Punkte.'}{' '}
        Zweier und Vierer haben getrennte Stufen.
      </p>

      <section className="stapel">
        <h2 className="karte__titel">{modus === 'zweier' ? 'Spieler' : 'Teams'}</h2>
        {liste.length === 0 ? (
          <div className="karte">
            <p className="leer" style={{ padding: '8px 0' }}>
              Noch keine Punkte im {modus === 'zweier' ? 'Zweier' : 'Vierer'} gesammelt.
            </p>
            <button
              type="button"
              className="btn btn--primaer btn--block"
              onClick={() => navigiere({ name: 'start' })}
            >
              Spiel starten
            </button>
          </div>
        ) : (
          liste.map((eintrag, index) => (
            <SpielerRang key={eintrag.name} eintrag={eintrag} platz={index + 1} />
          ))
        )}
      </section>

      <section className="stapel">
        <h2 className="karte__titel">Stufen</h2>
        {stufen.length === 0 ? (
          <div className="karte">
            <p className="hinweis" style={{ margin: 0 }}>
              Noch keine Stufen für {modus === 'zweier' ? 'Zweier' : 'Vierer'} angelegt. Beispiel:
              „Gold 1“ ab 5 Punkten – wer 5 Bummerl gewonnen hat, trägt dann Gold 1.
            </p>
            <hr className="trenner" />
            <RankFormular modus={modus} />
          </div>
        ) : (
          <>
            <div className="liste">
              {stufen.map((rank) => (
                <StufenZeile key={rank.id} rank={rank} liste={liste} />
              ))}
            </div>
            <div className="karte">
              <h3 className="karte__titel">Stufe hinzufügen</h3>
              <RankFormular modus={modus} />
              <button
                type="button"
                className="btn btn--geist btn--klein"
                onClick={() => navigiere({ name: 'einstellungen' })}
              >
                Stufen bearbeiten
              </button>
            </div>
          </>
        )}
      </section>
    </Screen>
  )
}

function SpielerRang({ eintrag, platz }: { eintrag: Einstufung; platz: number }) {
  return (
    <article className="karte" aria-label={eintrag.name}>
      <div className="reihe">
        <span className={platz === 1 ? 'platz platz--1' : 'platz'}>
          {platz === 1 ? '🥇' : platz === 2 ? '🥈' : platz === 3 ? '🥉' : platz}
        </span>
        <div className="wachsen">
          <div className="eintrag__titel">{eintrag.name}</div>
          <div className="eintrag__meta">
            {eintrag.punkte} {eintrag.punkte === 1 ? 'Punkt' : 'Punkte'} · {eintrag.punkte} Bummerl
            gewonnen
          </div>
        </div>
        <span className={eintrag.rank ? 'abzeichen abzeichen--rang' : 'abzeichen'}>
          {eintrag.rank ? eintrag.rank.name : 'kein Rang'}
        </span>
      </div>

      {eintrag.naechster && (
        <>
          <div className="balken" aria-hidden="true">
            <div className="balken__fuell" style={{ width: `${eintrag.fortschritt * 100}%` }} />
          </div>
          <div className="hinweis" style={{ margin: 0 }}>
            {eintrag.fehlend === 0
              ? `${eintrag.naechster.name} erreicht`
              : `noch ${eintrag.fehlend} ${eintrag.fehlend === 1 ? 'Punkt' : 'Punkte'} bis ${eintrag.naechster.name} (ab ${eintrag.naechster.punkte})`}
          </div>
        </>
      )}
    </article>
  )
}

function StufenZeile({ rank, liste }: { rank: Rank; liste: Einstufung[] }) {
  const traeger = inhaber(rank, liste)
  return (
    <div className="eintrag">
      <div className="wachsen">
        <div className="eintrag__titel">{rank.name || 'Ohne Namen'}</div>
        <div className="eintrag__meta">
          {traeger.length > 0 ? traeger.join(', ') : 'noch niemand auf dieser Stufe'}
        </div>
      </div>
      <span className="klein muted">ab</span>
      <span className="eintrag__wert">{rank.punkte}</span>
    </div>
  )
}

/** Formular zum Anlegen einer neuen Stufe. */
function RankFormular({ modus }: { modus: Modus }) {
  const [name, setName] = useState('')
  const [punkte, setPunkte] = useState('')

  const hinzufuegen = () => {
    const sauber = name.trim()
    if (!sauber) return
    actions.rankHinzufuegen(sauber, Number(punkte) || 0, modus)
    setName('')
    setPunkte('')
  }

  return (
    <div className="stapel">
      <div className="reihe">
        <input
          className="eingabe wachsen"
          placeholder="Stufe, z. B. Gold 1"
          value={name}
          autoCapitalize="words"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') hinzufuegen()
          }}
          aria-label="Name der Stufe"
        />
        <input
          className="eingabe eingabe--zahl"
          type="number"
          inputMode="numeric"
          placeholder="ab"
          value={punkte}
          onChange={(event) => setPunkte(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') hinzufuegen()
          }}
          aria-label="Punkteschwelle"
        />
      </div>
      <button
        type="button"
        className="btn btn--primaer btn--block"
        onClick={hinzufuegen}
        disabled={!name.trim()}
      >
        Hinzufügen
      </button>
    </div>
  )
}

/** Vollständige Verwaltung (hinzufügen/bearbeiten/löschen) – wird in den Einstellungen gezeigt. */
export function RankVerwaltung({ ranks }: { ranks: Rank[] }) {
  const [modus, setModus] = useState<Modus>('zweier')
  const stufen = useMemo(() => absteigend(ranksFuerModus(ranks, modus)), [ranks, modus])

  return (
    <section className="karte">
      <div className="reihe reihe--verteilt">
        <h2 className="karte__titel">Rangliste (Stufen)</h2>
        {ranks.length > 0 && (
          <button
            type="button"
            className="btn btn--geist btn--klein"
            onClick={() => navigiere({ name: 'ranks' })}
          >
            Ansehen
          </button>
        )}
      </div>

      <ModusWahl modus={modus} onChange={setModus} />

      <p className="hinweis" style={{ margin: 0 }}>
        Name + Punkteschwelle, z. B. „Gold 1“ ab 5 Punkten. Ein Punkt = ein gewonnenes Bummerl
        {modus === 'vierer' ? ' des Teams' : ''}.
      </p>

      {stufen.length > 0 && (
        <div className="stapel stapel--eng">
          {stufen.map((rank) => (
            <RankZeile key={rank.id} rank={rank} />
          ))}
        </div>
      )}

      <hr className="trenner" />
      <RankFormular modus={modus} />
    </section>
  )
}

function RankZeile({ rank }: { rank: Rank }) {
  const [bearbeiten, setBearbeiten] = useState(false)
  const [name, setName] = useState(rank.name)
  const [punkte, setPunkte] = useState(String(rank.punkte))

  const speichern = () => {
    const sauber = name.trim()
    if (!sauber) {
      setName(rank.name)
      setBearbeiten(false)
      return
    }
    actions.rankAendern(rank.id, { name: sauber, punkte: Number(punkte) || 0 })
    setBearbeiten(false)
  }

  if (!bearbeiten) {
    return (
      <div className="reihe">
        <span className="wachsen eintrag__titel">{rank.name || 'Ohne Namen'}</span>
        <span className="klein muted">ab</span>
        <span className="eintrag__wert">{rank.punkte}</span>
        <button
          type="button"
          className="btn btn--geist btn--klein"
          onClick={() => {
            setName(rank.name)
            setPunkte(String(rank.punkte))
            setBearbeiten(true)
          }}
          aria-label={`${rank.name} bearbeiten`}
        >
          ✎
        </button>
        <button
          type="button"
          className="btn btn--geist btn--klein"
          onClick={() => actions.rankLoeschen(rank.id)}
          aria-label={`${rank.name} löschen`}
        >
          🗑
        </button>
      </div>
    )
  }

  return (
    <div className="reihe">
      <input
        className="eingabe wachsen"
        value={name}
        autoFocus
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') speichern()
          if (event.key === 'Escape') setBearbeiten(false)
        }}
        aria-label="Name der Stufe"
      />
      <input
        className="eingabe eingabe--zahl"
        type="number"
        inputMode="numeric"
        value={punkte}
        onChange={(event) => setPunkte(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') speichern()
          if (event.key === 'Escape') setBearbeiten(false)
        }}
        aria-label="Punkteschwelle"
      />
      <button type="button" className="btn btn--primaer btn--klein" onClick={speichern}>
        OK
      </button>
    </div>
  )
}

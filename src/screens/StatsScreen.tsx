import { useMemo, useState } from 'react'
import { Screen } from '../components/Screen'
import { formatProzent } from '../format'
import { navigiere } from '../navigation'
import { erreichterRank, ranksFuerModus } from '../core/ranks'
import { berechneStatistik } from '../core/stats'
import type { AppState, Modus, Rank } from '../core/types'
import { ModusWahl } from './RanksScreen'

type Props = { state: AppState }

export function StatsScreen({ state }: Props) {
  const [modus, setModus] = useState<Modus>('zweier')
  const statistik = useMemo(() => berechneStatistik(state.spiele, modus), [state.spiele, modus])
  const ranks = useMemo(() => ranksFuerModus(state.ranks, modus), [state.ranks, modus])

  return (
    <Screen titel="Statistik">
      <ModusWahl modus={modus} onChange={setModus} />

      {modus === 'vierer' && statistik.length > 0 && (
        <p className="hinweis" style={{ margin: 0 }}>
          Im Vierer wird pro Team gewertet.
        </p>
      )}

      {statistik.length === 0 ? (
        <section className="karte">
          <p className="leer">
            Noch keine Daten für {modus === 'zweier' ? 'Zweier' : 'Vierer'}. Die Statistik entsteht
            automatisch aus den gespielten Bummerl.
          </p>
          <button
            type="button"
            className="btn btn--primaer btn--block"
            onClick={() => navigiere({ name: 'start' })}
          >
            Spiel starten
          </button>
        </section>
      ) : (
        statistik.map((spieler) => (
          <section className="karte" key={spieler.name}>
            <div className="reihe reihe--verteilt">
              <h2 className="eintrag__titel wachsen" style={{ fontSize: '1.05rem' }}>
                {spieler.name}
              </h2>
              <Rangabzeichen ranks={ranks} punkte={spieler.bummerlGewonnen} />
              <span className="eintrag__wert">{formatProzent(spieler.siegquote)}</span>
            </div>

            <div className="balken" aria-hidden="true">
              <div className="balken__fuell" style={{ width: `${(spieler.siegquote ?? 0) * 100}%` }} />
            </div>

            <div className="stat-gitter">
              <div className="stat">
                <div className="stat__wert mono-zahl">{spieler.spiele}</div>
                <div className="stat__label">Spiele</div>
              </div>
              <div className="stat">
                <div className="stat__wert mono-zahl">{spieler.spieleGewonnen}</div>
                <div className="stat__label">gewonnen</div>
              </div>
              <div className="stat">
                <div className="stat__wert mono-zahl">{spieler.bummerlGewonnen}</div>
                <div className="stat__label">Bummerl +</div>
              </div>
              <div className="stat">
                <div className="stat__wert mono-zahl">{spieler.bummerlVerloren}</div>
                <div className="stat__label">Bummerl −</div>
              </div>
            </div>

            {spieler.haeufigsterGegner && (
              <p className="hinweis" style={{ margin: 0 }}>
                Häufigster Gegner: <strong>{spieler.haeufigsterGegner}</strong>
              </p>
            )}
          </section>
        ))
      )}
    </Screen>
  )
}

/** Zeigt die erreichte Rang-Stufe, sofern Stufen konfiguriert sind. */
function Rangabzeichen({ ranks, punkte }: { ranks: Rank[]; punkte: number }) {
  if (ranks.length === 0) return null
  const rank = erreichterRank(ranks, punkte)
  if (!rank) return null
  return <span className="abzeichen abzeichen--rang">{rank.name}</span>
}

import { farbSymbol, rangText, type Karte } from '../core/karten'
import type { Kartendesign } from '../core/types'

/**
 * Text/Symbol-Platzhalter für eine Spielkarte im Online-Modus (Zweier und
 * Vierer). Sobald echte Kartengrafiken vorliegen, ersetzt eine Bilddatei je
 * Karte diese Darstellung – siehe Kommentar in src/core/karten.ts.
 */
export function SpielKarte({
  karte,
  design,
  klickbar,
  klein,
  beschriftung,
  onClick,
}: {
  karte: Karte
  design: Kartendesign
  klickbar?: boolean
  klein?: boolean
  beschriftung?: string
  onClick?: () => void
}) {
  const rot = karte.farbe === 'herz' || karte.farbe === 'karo'
  const inhalt = (
    <div
      className="karte"
      style={{
        width: klein ? 46 : 58,
        height: klein ? 66 : 82,
        padding: 4,
        justifyContent: 'space-between',
        color: rot ? 'var(--rot)' : 'var(--text)',
        cursor: onClick ? 'pointer' : 'default',
        opacity: klickbar === false ? 0.4 : 1,
      }}
    >
      <span style={{ fontWeight: 800 }}>{rangText(karte.rang)}</span>
      <span style={{ fontSize: '1.4rem', textAlign: 'center' }}>
        {farbSymbol(karte.farbe, design)}
      </span>
    </div>
  )

  if (!beschriftung) {
    return onClick ? (
      <button type="button" onClick={onClick} style={{ padding: 0, border: 0, background: 'none' }}>
        {inhalt}
      </button>
    ) : (
      inhalt
    )
  }

  return (
    <div className="stapel stapel--eng" style={{ alignItems: 'center' }}>
      {inhalt}
      <span className="klein muted">{beschriftung}</span>
    </div>
  )
}

/** Visueller Kartenstoß (Talon): gestapelte Kartenrücken + Anzahl, plus die sichtbare Trumpfkarte. */
export function Kartenstoss({
  anzahl,
  trumpfKarte,
  kartendesign,
}: {
  anzahl: number
  trumpfKarte: Karte | null
  kartendesign: Kartendesign
}) {
  if (anzahl === 0 && !trumpfKarte) return null
  const sichtbareStapelkarten = Math.min(anzahl, 4)

  return (
    <div className="stapel stapel--eng" style={{ alignItems: 'center' }}>
      <div style={{ position: 'relative', width: 58, height: 82 }}>
        {Array.from({ length: sichtbareStapelkarten }).map((_, index) => (
          <div
            key={index}
            className="karte"
            style={{
              position: 'absolute',
              top: index * -3,
              left: index * 2,
              width: 58,
              height: 82,
              padding: 0,
              background: 'var(--surface-3)',
            }}
          />
        ))}
        {trumpfKarte && (
          <div style={{ position: 'absolute', top: sichtbareStapelkarten * -3 - 6, left: sichtbareStapelkarten * 2 + 8 }}>
            <SpielKarte karte={trumpfKarte} design={kartendesign} klein />
          </div>
        )}
      </div>
      <span className="klein muted">
        {anzahl} {anzahl === 1 ? 'Karte' : 'Karten'} im Stoß
      </span>
    </div>
  )
}

/** Die beiden Karten eines bestimmten (ersten) Stichs – bleiben zur Ansicht liegen. */
export function ErsterStichAnzeige({
  stich,
  design,
  beschriftung,
}: {
  stich: [Karte, Karte] | null
  design: Kartendesign
  beschriftung: string
}) {
  if (!stich) return null

  return (
    <div className="stapel stapel--eng">
      <span className="klein muted">{beschriftung}</span>
      <div className="reihe" style={{ gap: 4 }}>
        {stich.map((karte, index) => (
          <SpielKarte key={index} karte={karte} design={design} klein />
        ))}
      </div>
    </div>
  )
}

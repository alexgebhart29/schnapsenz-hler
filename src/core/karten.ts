/**
 * Rein darstellungsbezogenes Kartenmodell für den Client. Die Spielregeln
 * laufen ausschließlich am Server (server/src/online/spielRegeln.ts); hier
 * geht es nur darum, dieselben kanonischen Karten (immer französisches
 * Blatt: kreuz/pik/herz/karo) je nach Nutzer-Einstellung passend anzuzeigen.
 * Sobald echte Kartenbilder vorliegen, ersetzt eine Bilddatei je Karte diese
 * Text-Darstellung – Dateiname z. B. `kreuz-ass.png` bzw. `eichel-ass.png`.
 */

export type Farbe = 'kreuz' | 'pik' | 'herz' | 'karo'
export type Rang = '10' | 'U' | 'O' | 'K' | 'A'
export type Karte = { farbe: Farbe; rang: Rang }

const FARB_REIHENFOLGE: Farbe[] = ['kreuz', 'pik', 'herz', 'karo']
/** Stärke innerhalb einer Farbe, niedrig zu hoch (wie in der Spiel-Engine). */
const STAERKE_REIHENFOLGE: Rang[] = ['U', 'O', 'K', '10', 'A']

/** Sortiert eine Hand nach Farbe, innerhalb der Farbe nach Stärke (höchste zuerst). */
export function sortiereHand(hand: Karte[]): Karte[] {
  return [...hand].sort((a, b) => {
    const farbVergleich = FARB_REIHENFOLGE.indexOf(a.farbe) - FARB_REIHENFOLGE.indexOf(b.farbe)
    if (farbVergleich !== 0) return farbVergleich
    return STAERKE_REIHENFOLGE.indexOf(b.rang) - STAERKE_REIHENFOLGE.indexOf(a.rang)
  })
}

export type Kartendesign = 'franzoesisch' | 'deutsch'

/** Übliche Übersetzung der Farben zwischen französischem und deutschem Blatt. */
const FARB_ANZEIGE: Record<Kartendesign, Record<Farbe, { symbol: string; name: string }>> = {
  franzoesisch: {
    kreuz: { symbol: '♣', name: 'Kreuz' },
    pik: { symbol: '♠', name: 'Pik' },
    herz: { symbol: '♥', name: 'Herz' },
    karo: { symbol: '♦', name: 'Karo' },
  },
  deutsch: {
    kreuz: { symbol: '🌰', name: 'Eichel' },
    pik: { symbol: '🍃', name: 'Laub' },
    herz: { symbol: '❤', name: 'Herz' },
    karo: { symbol: '🔔', name: 'Schellen' },
  },
}

const ROTE_FARBEN = new Set<Farbe>(['herz', 'karo'])

export function farbSymbol(farbe: Farbe, design: Kartendesign): string {
  return FARB_ANZEIGE[design][farbe].symbol
}

export function farbName(farbe: Farbe, design: Kartendesign): string {
  return FARB_ANZEIGE[design][farbe].name
}

export function istRot(farbe: Farbe, design: Kartendesign): boolean {
  // Beim deutschen Blatt sind traditionell Herz und Schellen (karo) rot.
  return design === 'franzoesisch' ? ROTE_FARBEN.has(farbe) : farbe === 'herz' || farbe === 'karo'
}

// Deutliche Kürzel statt der knappen Einzelbuchstaben (U/O/K/A) – sonst
// leicht mit Farb-Kürzeln oder anderen Rängen zu verwechseln, solange noch
// keine echten Kartenbilder vorliegen.
const RANG_ANZEIGE: Record<Rang, string> = { '10': '10', U: 'Bu', O: 'Da', K: 'Kö', A: 'As' }

export function rangText(rang: Rang): string {
  return RANG_ANZEIGE[rang]
}

export function kartenId(karte: Karte): string {
  return `${karte.farbe}-${karte.rang}`
}

export function gleicheKarte(a: Karte, b: Karte): boolean {
  return a.farbe === b.farbe && a.rang === b.rang
}

export function kartenBeschreibung(karte: Karte, design: Kartendesign): string {
  const namen: Record<Rang, string> = { '10': 'Zehn', U: 'Bube', O: 'Dame', K: 'König', A: 'Ass' }
  return `${namen[karte.rang]} ${farbName(karte.farbe, design)}`
}

/**
 * Reines Kartenmodell für den Online-Spielmodus. Kanonisch wird intern immer
 * das französische Blatt verwendet (Kreuz/Pik/Herz/Karo) – die Anzeige beim
 * Client (deutsches oder französisches Blatt) ist davon unabhängig und rein
 * eine Darstellungsfrage auf Client-Seite.
 */

export type Farbe = 'kreuz' | 'pik' | 'herz' | 'karo'
export const FARBEN: Farbe[] = ['kreuz', 'pik', 'herz', 'karo']

/** Zehn, Bube (Unter), Dame (Ober), König, Ass – die 5 Ränge des 20er-Blatts. */
export type Rang = '10' | 'U' | 'O' | 'K' | 'A'
export const RAENGE: Rang[] = ['U', 'O', 'K', '10', 'A']

export type Karte = { farbe: Farbe; rang: Rang }

/** Punktwert einer Karte (Augen). */
export const PUNKTWERT: Record<Rang, number> = {
  A: 11,
  '10': 10,
  K: 4,
  O: 3,
  U: 2,
}

/** Reihenfolge innerhalb einer Farbe, niedrig zu hoch (Index = Stärke). */
const STAERKE_REIHENFOLGE: Rang[] = ['U', 'O', 'K', '10', 'A']

export function staerke(rang: Rang): number {
  return STAERKE_REIHENFOLGE.indexOf(rang)
}

export function kartenId(karte: Karte): string {
  return `${karte.farbe}-${karte.rang}`
}

export function gleicheKarte(a: Karte, b: Karte): boolean {
  return a.farbe === b.farbe && a.rang === b.rang
}

/** Das vollständige, ungemischte 20-Karten-Blatt. */
export function vollesBlatt(): Karte[] {
  const karten: Karte[] = []
  for (const farbe of FARBEN) {
    for (const rang of RAENGE) karten.push({ farbe, rang })
  }
  return karten
}

/** Fisher-Yates-Mischen. `zufall` ist injizierbar für deterministische Tests. */
export function mische<T>(liste: T[], zufall: () => number = Math.random): T[] {
  const kopie = [...liste]
  for (let i = kopie.length - 1; i > 0; i--) {
    const j = Math.floor(zufall() * (i + 1))
    ;[kopie[i], kopie[j]] = [kopie[j]!, kopie[i]!]
  }
  return kopie
}

import type { Modus, Rank } from './types'

/**
 * Ranks sind Stufen mit einer Punkteschwelle (z. B. „Gold 1“ ab 5 Punkten).
 * Als Punktzahl eines Spielers zählt die Summe seiner gewonnenen Bummerl.
 */

export type Einstufung = {
  name: string
  punkte: number
  /** Höchste erreichte Stufe, null wenn noch keine Schwelle erreicht ist. */
  rank: Rank | null
  /** Nächsthöhere Stufe, null wenn die höchste bereits erreicht ist. */
  naechster: Rank | null
  /** Punkte bis zur nächsten Stufe, null wenn es keine höhere gibt. */
  fehlend: number | null
  /** Fortschritt zur nächsten Stufe (0–1); 1 wenn die höchste Stufe erreicht ist. */
  fortschritt: number
}

/** Jede Spielform hat ihre eigene Stufenliste. */
export function ranksFuerModus(ranks: Rank[], modus: Modus): Rank[] {
  return ranks.filter((rank) => rank.modus === modus)
}

/** Stufen von der niedrigsten zur höchsten Schwelle. */
export function aufsteigend(ranks: Rank[]): Rank[] {
  return [...ranks].sort((a, b) => a.punkte - b.punkte || a.name.localeCompare(b.name, 'de'))
}

/** Stufen von der höchsten zur niedrigsten Schwelle (Anzeigereihenfolge). */
export function absteigend(ranks: Rank[]): Rank[] {
  return aufsteigend(ranks).reverse()
}

export function erreichterRank(ranks: Rank[], punkte: number): Rank | null {
  let treffer: Rank | null = null
  for (const rank of aufsteigend(ranks)) {
    if (rank.punkte <= punkte) treffer = rank
  }
  return treffer
}

export function naechsterRank(ranks: Rank[], punkte: number): Rank | null {
  return aufsteigend(ranks).find((rank) => rank.punkte > punkte) ?? null
}

export function einstufung(ranks: Rank[], name: string, punkte: number): Einstufung {
  const rank = erreichterRank(ranks, punkte)
  const naechster = naechsterRank(ranks, punkte)

  if (!naechster) {
    return { name, punkte, rank, naechster: null, fehlend: null, fortschritt: 1 }
  }

  const basis = rank ? rank.punkte : 0
  const spanne = naechster.punkte - basis
  const fortschritt = spanne > 0 ? Math.min(1, Math.max(0, (punkte - basis) / spanne)) : 0

  return {
    name,
    punkte,
    rank,
    naechster,
    fehlend: Math.max(0, naechster.punkte - punkte),
    fortschritt,
  }
}

/** Einstufung aller Spieler, nach Punkten absteigend. */
export function einstufungen(
  ranks: Rank[],
  spieler: { name: string; punkte: number }[],
): Einstufung[] {
  return spieler
    .map((eintrag) => einstufung(ranks, eintrag.name, eintrag.punkte))
    .sort((a, b) => b.punkte - a.punkte || a.name.localeCompare(b.name, 'de'))
}

/** Namen der Spieler, die genau diese Stufe aktuell tragen. */
export function inhaber(rank: Rank, alle: Einstufung[]): string[] {
  return alle.filter((eintrag) => eintrag.rank?.id === rank.id).map((eintrag) => eintrag.name)
}

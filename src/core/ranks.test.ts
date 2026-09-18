import { describe, expect, it } from 'vitest'
import { absteigend, einstufung, einstufungen, erreichterRank, inhaber, naechsterRank } from './ranks'
import type { Rank } from './types'

const RANKS: Rank[] = [
  { id: 'gold1', name: 'Gold 1', punkte: 5, modus: 'zweier', geaendertAm: 0 },
  { id: 'bronze', name: 'Bronze', punkte: 0, modus: 'zweier', geaendertAm: 0 },
  { id: 'silber', name: 'Silber', punkte: 2, modus: 'zweier', geaendertAm: 0 },
  { id: 'gold2', name: 'Gold 2', punkte: 10, modus: 'zweier', geaendertAm: 0 },
]

describe('erreichterRank', () => {
  it('nimmt die höchste erreichte Schwelle', () => {
    expect(erreichterRank(RANKS, 0)?.name).toBe('Bronze')
    expect(erreichterRank(RANKS, 1)?.name).toBe('Bronze')
    expect(erreichterRank(RANKS, 2)?.name).toBe('Silber')
    expect(erreichterRank(RANKS, 5)?.name).toBe('Gold 1')
    expect(erreichterRank(RANKS, 7)?.name).toBe('Gold 1')
    expect(erreichterRank(RANKS, 99)?.name).toBe('Gold 2')
  })

  it('gibt null zurück, wenn keine Schwelle erreicht ist', () => {
    const ranks: Rank[] = [{ id: 'a', name: 'Gold 1', punkte: 5, modus: 'zweier', geaendertAm: 0 }]
    expect(erreichterRank(ranks, 4)).toBeNull()
    expect(erreichterRank([], 10)).toBeNull()
  })
})

describe('naechsterRank', () => {
  it('nimmt die nächsthöhere Schwelle', () => {
    expect(naechsterRank(RANKS, 0)?.name).toBe('Silber')
    expect(naechsterRank(RANKS, 4)?.name).toBe('Gold 1')
    expect(naechsterRank(RANKS, 5)?.name).toBe('Gold 2')
    expect(naechsterRank(RANKS, 10)).toBeNull()
  })
})

describe('einstufung', () => {
  it('berechnet fehlende Punkte und Fortschritt', () => {
    const e = einstufung(RANKS, 'Anna', 3)
    expect(e.rank?.name).toBe('Silber')
    expect(e.naechster?.name).toBe('Gold 1')
    expect(e.fehlend).toBe(2)
    // Von Schwelle 2 (Silber) bis 5 (Gold 1): 1 von 3 Punkten geschafft.
    expect(e.fortschritt).toBeCloseTo(1 / 3)
  })

  it('zählt ohne erreichte Stufe ab 0 hoch', () => {
    const ranks: Rank[] = [{ id: 'a', name: 'Gold 1', punkte: 5, modus: 'zweier', geaendertAm: 0 }]
    const e = einstufung(ranks, 'Bert', 2)
    expect(e.rank).toBeNull()
    expect(e.fehlend).toBe(3)
    expect(e.fortschritt).toBeCloseTo(0.4)
  })

  it('markiert die höchste Stufe als abgeschlossen', () => {
    const e = einstufung(RANKS, 'Cilli', 12)
    expect(e.rank?.name).toBe('Gold 2')
    expect(e.naechster).toBeNull()
    expect(e.fehlend).toBeNull()
    expect(e.fortschritt).toBe(1)
  })

  it('kommt ohne konfigurierte Stufen klar', () => {
    const e = einstufung([], 'Dori', 4)
    expect(e.rank).toBeNull()
    expect(e.naechster).toBeNull()
    expect(e.fortschritt).toBe(1)
  })
})

describe('einstufungen', () => {
  it('sortiert nach Punkten absteigend', () => {
    const liste = einstufungen(RANKS, [
      { name: 'Anna', punkte: 3 },
      { name: 'Bert', punkte: 11 },
      { name: 'Cilli', punkte: 0 },
    ])
    expect(liste.map((e) => e.name)).toEqual(['Bert', 'Anna', 'Cilli'])
    expect(liste[0]?.rank?.name).toBe('Gold 2')
  })
})

describe('inhaber', () => {
  it('listet die Spieler einer Stufe', () => {
    const liste = einstufungen(RANKS, [
      { name: 'Anna', punkte: 5 },
      { name: 'Bert', punkte: 6 },
      { name: 'Cilli', punkte: 1 },
    ])
    const gold1 = RANKS.find((r) => r.id === 'gold1')!
    expect(inhaber(gold1, liste)).toEqual(['Bert', 'Anna'])
    const bronze = RANKS.find((r) => r.id === 'bronze')!
    expect(inhaber(bronze, liste)).toEqual(['Cilli'])
  })
})

describe('absteigend', () => {
  it('sortiert die Stufen von hoch nach niedrig', () => {
    expect(absteigend(RANKS).map((r) => r.name)).toEqual(['Gold 2', 'Gold 1', 'Silber', 'Bronze'])
  })
})

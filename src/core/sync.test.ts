import { describe, expect, it } from 'vitest'
import { createSpiel } from './schnapsen'
import { initialState } from './storage'
import { nachErfolg, sammleAenderungen, wendeAn } from './sync'
import type { AppState, Rank, Spiel, SyncPaket } from './types'

const leer = (): SyncPaket => ({ spiele: [], ranks: [], kategorien: [], namen: [], einstellungen: [] })

function spiel(id: string, geaendertAm: number, bummerl: [number, number] = [0, 0]): Spiel {
  return {
    ...createSpiel({ id, spieler: ['Anna', 'Bert'], startwert: 7, datum: '2026-01-01T12:00:00.000Z' }),
    bummerl,
    geaendertAm,
  }
}

const rank = (id: string, punkte: number, geaendertAm: number): Rank => ({
  id,
  name: `Stufe ${punkte}`,
  punkte,
  modus: 'zweier',
  geaendertAm,
})

function zustand(teile: Partial<AppState> = {}): AppState {
  return { ...initialState(), ...teile }
}

describe('sammleAenderungen', () => {
  it('packt vorgemerkte Spiele und Ranks ein', () => {
    const state = zustand({
      spiele: [spiel('a', 1000)],
      ranks: [rank('r1', 5, 1100)],
      ausstehend: { spiele: ['a'], ranks: ['r1'], kategorien: [], namen: [], einstellungen: [] },
    })

    const { paket, gesendet } = sammleAenderungen(state)
    expect(paket.spiele).toHaveLength(1)
    expect(paket.spiele[0]).toMatchObject({ id: 'a', geaendertAm: 1000 })
    expect(paket.ranks[0]).toMatchObject({ id: 'r1', geaendertAm: 1100 })
    expect(gesendet.spiele).toEqual({ a: 1000 })
  })

  it('schickt Löschungen als Grabstein', () => {
    const state = zustand({
      grabsteine: { spiele: { a: 2000 }, ranks: {}, kategorien: {}, namen: {} },
      ausstehend: { spiele: ['a'], ranks: [], kategorien: [], namen: [], einstellungen: [] },
    })

    const { paket } = sammleAenderungen(state)
    expect(paket.spiele[0]).toEqual({ id: 'a', geaendertAm: 2000, geloescht: true })
  })

  it('schickt Namen und Einstellungen mit', () => {
    const state = zustand({
      namen: [{ name: 'Anna', geaendertAm: 500 }],
      einstellungenGeaendertAm: { startwert: 700 },
      settings: { startwert: 9, startwertVierer: 24, theme: 'system', bettlerAktiv: false },
      ausstehend: { spiele: [], ranks: [], kategorien: [], namen: ['anna'], einstellungen: ['startwert'] },
    })

    const { paket } = sammleAenderungen(state)
    expect(paket.namen).toEqual([{ name: 'Anna', geaendertAm: 500 }])
    expect(paket.einstellungen).toEqual([{ schluessel: 'startwert', wert: 9, geaendertAm: 700 }])
  })

  it('ist leer, wenn nichts vorgemerkt ist', () => {
    const { paket } = sammleAenderungen(zustand({ spiele: [spiel('a', 1000)] }))
    expect(paket).toEqual(leer())
  })
})

describe('wendeAn', () => {
  it('übernimmt neue Spiele vom Server', () => {
    const neu = wendeAn(zustand(), { ...leer(), spiele: [{ id: 'a', geaendertAm: 1000, daten: spiel('a', 1000, [2, 1]) }] }, 7)

    expect(neu.spiele).toHaveLength(1)
    expect(neu.spiele[0]!.bummerl).toEqual([2, 1])
    expect(neu.sync.stand).toBe(7)
  })

  it('lässt die jüngere Version gewinnen', () => {
    const state = zustand({ spiele: [spiel('a', 3000, [5, 0])] })
    const aelter = wendeAn(state, { ...leer(), spiele: [{ id: 'a', geaendertAm: 1000, daten: spiel('a', 1000, [1, 1]) }] }, 1)
    expect(aelter.spiele[0]!.bummerl).toEqual([5, 0])

    const juenger = wendeAn(state, { ...leer(), spiele: [{ id: 'a', geaendertAm: 9000, daten: spiel('a', 9000, [1, 1]) }] }, 2)
    expect(juenger.spiele[0]!.bummerl).toEqual([1, 1])
  })

  it('behält bei gleichem Zeitstempel den lokalen Stand', () => {
    const state = zustand({ spiele: [spiel('a', 3000, [5, 0])] })
    const neu = wendeAn(state, { ...leer(), spiele: [{ id: 'a', geaendertAm: 3000, daten: spiel('a', 3000, [9, 9]) }] }, 1)
    expect(neu.spiele[0]!.bummerl).toEqual([5, 0])
  })

  it('entfernt gelöschte Spiele und merkt sich den Grabstein', () => {
    const jetzt = Date.now()
    const state = zustand({ spiele: [spiel('a', jetzt - 5000)], aktivesSpielId: 'a' })
    const neu = wendeAn(
      state,
      { ...leer(), spiele: [{ id: 'a', geaendertAm: jetzt - 1000, geloescht: true }] },
      1,
      jetzt,
    )

    expect(neu.spiele).toHaveLength(0)
    expect(neu.grabsteine.spiele.a).toBe(jetzt - 1000)
    // Das aktive Spiel gibt es nicht mehr.
    expect(neu.aktivesSpielId).toBeNull()
  })

  it('behält noch nicht übertragene Löschungen, auch wenn sie alt sind', () => {
    const jetzt = Date.now()
    const state = zustand({
      grabsteine: { spiele: { alt: jetzt - 200 * 24 * 3600_000 }, ranks: {}, kategorien: {}, namen: {} },
      ausstehend: { spiele: ['alt'], ranks: [], kategorien: [], namen: [], einstellungen: [] },
    })
    const neu = wendeAn(state, leer(), 1, jetzt)
    expect(neu.grabsteine.spiele.alt).toBeDefined()
  })

  it('ignoriert eine Wiederauferstehung nach neuerer lokaler Löschung', () => {
    const state = zustand({ grabsteine: { spiele: { a: 5000 }, ranks: {}, kategorien: {}, namen: {} } })
    const neu = wendeAn(state, { ...leer(), spiele: [{ id: 'a', geaendertAm: 1000, daten: spiel('a', 1000) }] }, 1)
    expect(neu.spiele).toHaveLength(0)
  })

  it('führt Namen und Einstellungen zusammen', () => {
    const state = zustand({ namen: [{ name: 'Anna', geaendertAm: 100 }] })
    const neu = wendeAn(
      state,
      {
        ...leer(),
        namen: [
          { name: 'ANNA', geaendertAm: 2000 },
          { name: 'Cilli', geaendertAm: 1500 },
        ],
        einstellungen: [{ schluessel: 'startwert', wert: 11, geaendertAm: 3000 }],
      },
      1,
    )

    expect(neu.namen.map((n) => n.name)).toEqual(['ANNA', 'Cilli'])
    expect(neu.settings.startwert).toBe(11)
    expect(neu.einstellungenGeaendertAm.startwert).toBe(3000)
  })

  it('sortiert Spiele nach Datum, neueste zuerst', () => {
    const alt = { ...spiel('alt', 1000), datum: '2026-01-01T10:00:00.000Z' }
    const neuer = { ...spiel('neu', 1000), datum: '2026-03-01T10:00:00.000Z' }
    const ergebnis = wendeAn(
      zustand({ spiele: [alt] }),
      { ...leer(), spiele: [{ id: 'neu', geaendertAm: 1000, daten: neuer }] },
      1,
    )
    expect(ergebnis.spiele.map((s) => s.id)).toEqual(['neu', 'alt'])
  })

  it('räumt alte Grabsteine auf', () => {
    const jetzt = Date.now()
    const state = zustand({
      grabsteine: {
        spiele: { alt: jetzt - 200 * 24 * 3600_000, frisch: jetzt - 1000 },
        ranks: {},
        kategorien: {},
        namen: {},
      },
    })
    const neu = wendeAn(state, leer(), 1, jetzt)
    expect(neu.grabsteine.spiele.alt).toBeUndefined()
    expect(neu.grabsteine.spiele.frisch).toBeDefined()
  })
})

describe('nachErfolg', () => {
  it('leert die Warteschlange für unveränderte Einträge', () => {
    const state = zustand({
      spiele: [spiel('a', 1000)],
      ausstehend: { spiele: ['a'], ranks: [], kategorien: [], namen: [], einstellungen: [] },
    })
    const { gesendet } = sammleAenderungen(state)
    expect(nachErfolg(state, gesendet).spiele).toEqual([])
  })

  it('behält Einträge, die sich während der Übertragung geändert haben', () => {
    const state = zustand({
      spiele: [spiel('a', 1000)],
      ausstehend: { spiele: ['a'], ranks: [], kategorien: [], namen: [], einstellungen: [] },
    })
    const { gesendet } = sammleAenderungen(state)

    // Während der Abgleich lief, wurde lokal weitergezählt.
    const inzwischen = { ...state, spiele: [spiel('a', 4000)] }
    expect(nachErfolg(inzwischen, gesendet).spiele).toEqual(['a'])
  })
})

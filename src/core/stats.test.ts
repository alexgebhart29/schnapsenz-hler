import { describe, expect, it } from 'vitest'
import { bummerlAbschliessen, createSpiel, punkteAbziehen, spielBeenden } from './schnapsen'
import { berechneStatistik } from './stats'
import type { Spiel, SpielerIndex } from './types'

/** Baut ein beendetes Spiel, in dem die angegebenen Spieler der Reihe nach Bummerl gewinnen. */
function spielMit(spieler: [string, string], gewinnerFolge: SpielerIndex[], id = 'x'): Spiel {
  let spiel = createSpiel({ id, spieler, startwert: 7, datum: '2026-01-01T12:00:00.000Z' })
  for (const gewinner of gewinnerFolge) {
    spiel = punkteAbziehen(spiel, gewinner, 7)
    spiel = bummerlAbschliessen(spiel, undefined, '2026-01-01T13:00:00.000Z')
  }
  return spielBeenden(spiel, '2026-01-01T13:30:00.000Z')
}

describe('berechneStatistik', () => {
  it('zählt Bummerl, Spiele und Siegquote', () => {
    const stats = berechneStatistik([spielMit(['Anna', 'Bert'], [0, 0, 1])])
    const anna = stats.find((s) => s.name === 'Anna')
    const bert = stats.find((s) => s.name === 'Bert')

    expect(anna).toMatchObject({
      spiele: 1,
      spieleGewonnen: 1,
      bummerlGewonnen: 2,
      bummerlVerloren: 1,
    })
    expect(anna?.siegquote).toBeCloseTo(2 / 3)
    expect(bert).toMatchObject({
      spiele: 1,
      spieleGewonnen: 0,
      bummerlGewonnen: 1,
      bummerlVerloren: 2,
    })
  })

  it('fasst Namen unabhängig von Groß-/Kleinschreibung zusammen', () => {
    const stats = berechneStatistik([
      spielMit(['ANNA', 'Bert'], [0], 'a'),
      spielMit(['anna', 'Cilli'], [1], 'b'),
    ])
    // Neueste Schreibweise gewinnt (Spiele werden neueste-zuerst übergeben).
    const anna = stats.find((s) => s.name === 'ANNA')
    expect(anna?.spiele).toBe(2)
    expect(anna?.bummerlGewonnen).toBe(1)
    expect(anna?.bummerlVerloren).toBe(1)
  })

  it('ermittelt den häufigsten Gegner', () => {
    const stats = berechneStatistik([
      spielMit(['Anna', 'Bert'], [0], 'a'),
      spielMit(['Anna', 'Bert'], [1], 'b'),
      spielMit(['Anna', 'Cilli'], [0], 'c'),
    ])
    expect(stats.find((s) => s.name === 'Anna')?.haeufigsterGegner).toBe('Bert')
  })

  it('ignoriert laufende Spiele ohne abgeschlossenes Bummerl', () => {
    const laufend = punkteAbziehen(
      createSpiel({ id: 'l', spieler: ['Anna', 'Bert'], startwert: 7 }),
      0,
      2,
    )
    expect(berechneStatistik([laufend])).toEqual([])
  })

  it('berücksichtigt laufende Spiele mit abgeschlossenem Bummerl', () => {
    let spiel = createSpiel({ id: 'l', spieler: ['Anna', 'Bert'], startwert: 7 })
    spiel = bummerlAbschliessen(punkteAbziehen(spiel, 0, 7), undefined, 'a')
    const stats = berechneStatistik([spiel])
    expect(stats.find((s) => s.name === 'Anna')).toMatchObject({
      bummerlGewonnen: 1,
      spieleGewonnen: 0,
    })
  })

  it('sortiert nach gewonnenen Bummerl', () => {
    const stats = berechneStatistik([spielMit(['Anna', 'Bert'], [1, 1, 1, 0])])
    expect(stats.map((s) => s.name)).toEqual(['Bert', 'Anna'])
  })
})

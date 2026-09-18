import { describe, expect, it } from 'vitest'
import {
  bummerlAbschliessen,
  createSpiel,
  defaultStartwertFuerModus,
  entschieden,
  kannAbziehen,
  kannUndo,
  MAX_UNDO,
  normalizeStartwert,
  punkteAbziehen,
  spielBeenden,
  spielFortsetzen,
  spielSieger,
  undo,
} from './schnapsen'
import type { Spiel } from './types'

const neu = (startwert = 7): Spiel =>
  createSpiel({ id: 'test', spieler: ['Anna', 'Bert'], startwert, datum: '2026-01-01T12:00:00.000Z' })

describe('normalizeStartwert', () => {
  it('klemmt auf den erlaubten Bereich', () => {
    expect(normalizeStartwert(3)).toBe(5)
    expect(normalizeStartwert(50)).toBe(40)
    expect(normalizeStartwert(24)).toBe(24)
    expect(normalizeStartwert(7)).toBe(7)
    expect(normalizeStartwert(7.4)).toBe(7)
    expect(normalizeStartwert(Number.NaN)).toBe(7)
  })
})

describe('defaultStartwertFuerModus', () => {
  it('zählt im Vierer traditionell von 24 herab, im Zweier von 7', () => {
    expect(defaultStartwertFuerModus('zweier')).toBe(7)
    expect(defaultStartwertFuerModus('vierer')).toBe(24)
  })
})

describe('createSpiel', () => {
  it('startet mit Startwert für beide Spieler', () => {
    const spiel = neu()
    expect(spiel.punkte).toEqual([7, 7])
    expect(spiel.bummerl).toEqual([0, 0])
    expect(spiel.status).toBe('laufend')
    expect(spiel.bummerlLog).toEqual([])
  })

  it('zählt im Vierer ohne expliziten Startwert von 24 herab', () => {
    const spiel = createSpiel({
      id: 'v',
      spieler: ['Anna', 'Cilli'],
      partner: ['Bert', 'Dori'],
    })
    expect(spiel.modus).toBe('vierer')
    expect(spiel.punkte).toEqual([24, 24])
  })

  it('erlaubt einen abweichenden Startwert auch im Vierer', () => {
    const spiel = createSpiel({
      id: 'v',
      spieler: ['Anna', 'Cilli'],
      partner: ['Bert', 'Dori'],
      startwert: 30,
    })
    expect(spiel.punkte).toEqual([30, 30])
  })
})

describe('punkteAbziehen', () => {
  it('zieht dem Gewinner vom eigenen Zähler ab', () => {
    const spiel = punkteAbziehen(neu(), 0, 2)
    expect(spiel.punkte).toEqual([5, 7])
  })

  it('summiert mehrere Abzüge', () => {
    let spiel = neu()
    spiel = punkteAbziehen(spiel, 0, 2)
    spiel = punkteAbziehen(spiel, 1, 3)
    spiel = punkteAbziehen(spiel, 0, 1)
    expect(spiel.punkte).toEqual([4, 4])
  })

  it('klemmt bei 0 und erkennt den Bummerl-Gewinner', () => {
    let spiel = neu()
    spiel = punkteAbziehen(spiel, 1, 3)
    spiel = punkteAbziehen(spiel, 1, 3)
    expect(entschieden(spiel)).toBeNull()
    spiel = punkteAbziehen(spiel, 1, 3)
    expect(spiel.punkte).toEqual([7, 0])
    expect(entschieden(spiel)).toBe(1)
    expect(kannAbziehen(spiel)).toBe(false)
  })

  it('ignoriert weitere Abzüge nach Entscheidung', () => {
    let spiel = punkteAbziehen(neu(), 0, 7)
    const vorher = spiel
    spiel = punkteAbziehen(spiel, 1, 2)
    expect(spiel).toBe(vorher)
  })

  it('ignoriert ungültige Abzüge', () => {
    const spiel = neu()
    expect(punkteAbziehen(spiel, 0, 0)).toBe(spiel)
    expect(punkteAbziehen(spiel, 0, -2)).toBe(spiel)
    expect(punkteAbziehen(spiel, 0, Number.NaN)).toBe(spiel)
  })
})

describe('bummerlAbschliessen', () => {
  it('schreibt das Bummerl gut, protokolliert und setzt zurück', () => {
    let spiel = punkteAbziehen(neu(), 0, 7)
    spiel = bummerlAbschliessen(spiel, undefined, '2026-01-01T13:00:00.000Z')
    expect(spiel.bummerl).toEqual([1, 0])
    expect(spiel.punkte).toEqual([7, 7])
    expect(spiel.bummerlLog).toEqual([
      { nummer: 1, gewinner: 0, endstand: [0, 7], beendetAm: '2026-01-01T13:00:00.000Z' },
    ])
  })

  it('erlaubt manuellen Abschluss ohne 0-Stand', () => {
    let spiel = punkteAbziehen(neu(), 1, 2)
    spiel = bummerlAbschliessen(spiel, 1, '2026-01-01T13:00:00.000Z')
    expect(spiel.bummerl).toEqual([0, 1])
    expect(spiel.bummerlLog[0]?.endstand).toEqual([7, 5])
    expect(spiel.punkte).toEqual([7, 7])
  })

  it('tut nichts ohne Gewinner', () => {
    const spiel = neu()
    expect(bummerlAbschliessen(spiel)).toBe(spiel)
  })

  it('zählt mehrere Bummerl fortlaufend', () => {
    let spiel = neu()
    spiel = bummerlAbschliessen(punkteAbziehen(spiel, 0, 7), undefined, 'a')
    spiel = bummerlAbschliessen(punkteAbziehen(spiel, 1, 7), undefined, 'b')
    spiel = bummerlAbschliessen(punkteAbziehen(spiel, 0, 7), undefined, 'c')
    expect(spiel.bummerl).toEqual([2, 1])
    expect(spiel.bummerlLog.map((e) => e.nummer)).toEqual([1, 2, 3])
    expect(spielSieger(spiel)).toBe(0)
  })
})

describe('spielBeenden', () => {
  it('schreibt ein offenes Bummerl noch gut', () => {
    const spiel = spielBeenden(punkteAbziehen(neu(), 1, 7), '2026-01-01T14:00:00.000Z')
    expect(spiel.status).toBe('beendet')
    expect(spiel.beendetAm).toBe('2026-01-01T14:00:00.000Z')
    expect(spiel.bummerl).toEqual([0, 1])
    expect(spiel.bummerlLog).toHaveLength(1)
  })

  it('beendet auch mitten im Bummerl', () => {
    const spiel = spielBeenden(punkteAbziehen(neu(), 0, 1), '2026-01-01T14:00:00.000Z')
    expect(spiel.status).toBe('beendet')
    expect(spiel.bummerl).toEqual([0, 0])
    expect(spiel.bummerlLog).toHaveLength(0)
    expect(entschieden(spiel)).toBeNull()
  })

  it('ist idempotent', () => {
    const spiel = spielBeenden(neu(), 'x')
    expect(spielBeenden(spiel, 'y')).toBe(spiel)
  })
})

describe('spielFortsetzen', () => {
  it('nimmt ein beendetes Spiel wieder auf und behält den Stand', () => {
    let spiel = bummerlAbschliessen(punkteAbziehen(neu(), 0, 7), undefined, 'a')
    spiel = punkteAbziehen(spiel, 1, 2)
    spiel = spielBeenden(spiel, '2026-01-01T14:00:00.000Z')
    expect(spiel.status).toBe('beendet')

    spiel = spielFortsetzen(spiel)
    expect(spiel.status).toBe('laufend')
    expect(spiel.beendetAm).toBeUndefined()
    expect(spiel.bummerl).toEqual([1, 0])
    expect(spiel.punkte).toEqual([7, 5])
    expect(spiel.bummerlLog).toHaveLength(1)
    expect(kannAbziehen(spiel)).toBe(true)
  })

  it('lässt sich danach normal weiterspielen', () => {
    let spiel = spielFortsetzen(spielBeenden(punkteAbziehen(neu(), 0, 2), 'a'))
    spiel = punkteAbziehen(spiel, 0, 3)
    expect(spiel.punkte).toEqual([2, 7])
  })

  it('tut nichts bei einem laufenden Spiel', () => {
    const spiel = neu()
    expect(spielFortsetzen(spiel)).toBe(spiel)
  })

  it('ist per Undo umkehrbar', () => {
    const beendet = spielBeenden(punkteAbziehen(neu(), 0, 1), '2026-01-01T14:00:00.000Z')
    const wieder = undo(spielFortsetzen(beendet))
    expect(wieder.status).toBe('beendet')
    expect(wieder.beendetAm).toBe('2026-01-01T14:00:00.000Z')
  })
})

describe('undo', () => {
  it('macht den letzten Abzug rückgängig', () => {
    let spiel = punkteAbziehen(neu(), 0, 2)
    spiel = punkteAbziehen(spiel, 1, 3)
    expect(spiel.punkte).toEqual([5, 4])
    spiel = undo(spiel)
    expect(spiel.punkte).toEqual([5, 7])
    spiel = undo(spiel)
    expect(spiel.punkte).toEqual([7, 7])
    expect(kannUndo(spiel)).toBe(false)
  })

  it('macht einen Bummerl-Abschluss rückgängig', () => {
    let spiel = bummerlAbschliessen(punkteAbziehen(neu(), 0, 7), undefined, 'a')
    expect(spiel.bummerl).toEqual([1, 0])
    spiel = undo(spiel)
    expect(spiel.bummerl).toEqual([0, 0])
    expect(spiel.punkte).toEqual([0, 7])
    expect(spiel.bummerlLog).toEqual([])
    expect(entschieden(spiel)).toBe(0)
  })

  it('macht das Spielende rückgängig', () => {
    let spiel = spielBeenden(punkteAbziehen(neu(), 0, 7), 'a')
    spiel = undo(spiel)
    expect(spiel.status).toBe('laufend')
    expect(spiel.beendetAm).toBeUndefined()
    expect(spiel.bummerl).toEqual([1, 0])
  })

  it('tut nichts bei leerem Stack', () => {
    const spiel = neu()
    expect(undo(spiel)).toBe(spiel)
  })

  it('begrenzt die Länge des Undo-Stacks', () => {
    let spiel = createSpiel({ id: 't', spieler: ['A', 'B'], startwert: 15 })
    for (let i = 0; i < MAX_UNDO + 10; i++) {
      spiel = punkteAbziehen(spiel, 0, 1)
      if (entschieden(spiel) !== null) spiel = bummerlAbschliessen(spiel, undefined, 'z')
    }
    expect(spiel.undoStack.length).toBeLessThanOrEqual(MAX_UNDO)
  })
})

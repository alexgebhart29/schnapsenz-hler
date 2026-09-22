import { describe, expect, it } from 'vitest'
import { bestimmeLokalenGewinner } from './onlineSitzung'

describe('bestimmeLokalenGewinner', () => {
  it('zählt den Gewinn für die eigene Partei, wenn ich selbst gewonnen habe', () => {
    // Ich bin Tisch-Index 0 und im lokalen Spiel Partei 0.
    expect(bestimmeLokalenGewinner(0, 0, 0)).toBe(0)
    // Ich bin Tisch-Index 1, im lokalen Spiel aber Partei 1 (z. B. fortgesetztes Spiel).
    expect(bestimmeLokalenGewinner(1, 1, 1)).toBe(1)
  })

  it('zählt den Gewinn für den Gegner im Spiel, wenn der Gegner am Tisch gewonnen hat', () => {
    expect(bestimmeLokalenGewinner(1, 0, 0)).toBe(1)
    expect(bestimmeLokalenGewinner(0, 1, 0)).toBe(1)
  })

  it('übersetzt korrekt, auch wenn meine Tisch-Rolle nicht meiner Spiel-Partei entspricht', () => {
    // Ich bin Tisch-Index 1 (Beigetretener), aber im fortgesetzten Spiel Partei 0.
    expect(bestimmeLokalenGewinner(1, 1, 0)).toBe(0) // ich gewinne -> meine Partei (0)
    expect(bestimmeLokalenGewinner(0, 1, 0)).toBe(1) // Gegner gewinnt -> Gegner-Partei (1)
  })
})

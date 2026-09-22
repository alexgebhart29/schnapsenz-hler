import { beforeEach, describe, expect, it } from 'vitest'
import {
  _leereAlleTischeVierFuerTests,
  erstelleTischVierer,
  listeOffeneTischeVierer,
  oeffentlicheSichtVierer,
  tritteBeiVierer,
  ziehAnsagen,
  ziehKarteAusVierer,
  ziehPassen,
  ziehSpritzen,
  ziehTrumpfWaehlen,
  type Teilnehmer,
  type TischVierer,
} from './tischVierer.js'
import type { Karte } from './karten4.js'
import type { SitzIndex } from './spielRegelnVierer.js'

const k = (farbe: Karte['farbe'], rang: Karte['rang']): Karte => ({ farbe, rang })
const spieler = (name: string): Teilnehmer => ({ id: name, name })

beforeEach(() => {
  _leereAlleTischeVierFuerTests()
})

function fuelleAuf(tisch: TischVierer): void {
  tritteBeiVierer(tisch.code, spieler('Bert'), () => {})
  tritteBeiVierer(tisch.code, spieler('Clara'), () => {})
  tritteBeiVierer(tisch.code, spieler('Dora'), () => {})
}

describe('erstelleTischVierer / tritteBeiVierer', () => {
  it('startet erst, sobald alle 4 Plätze besetzt sind – Teamzuordnung nach Sitzplatz (0+2, 1+3)', () => {
    const tisch = erstelleTischVierer(spieler('Anna'), () => {}, true)
    expect(tisch.partie).toBeNull()

    tritteBeiVierer(tisch.code, spieler('Bert'), () => {})
    expect(tisch.partie).toBeNull()
    tritteBeiVierer(tisch.code, spieler('Clara'), () => {})
    expect(tisch.partie).toBeNull()
    const letzter = tritteBeiVierer(tisch.code, spieler('Dora'), () => {})

    expect(letzter.ok).toBe(true)
    if (!letzter.ok) return
    expect(letzter.meinIndex).toBe(3)
    expect(tisch.partie).not.toBeNull()
    expect(tisch.partie!.haende.map((h) => h.length)).toEqual([2, 2, 2, 2])
  })

  it('erlaubt Reconnect über dieselbe Teilnehmer-Id statt einen neuen Platz zu vergeben', () => {
    const tisch = erstelleTischVierer(spieler('Anna'), () => {}, true)
    fuelleAuf(tisch)

    const reconnect = tritteBeiVierer(tisch.code, spieler('Bert'), () => {})
    expect(reconnect.ok).toBe(true)
    if (reconnect.ok) expect(reconnect.meinIndex).toBe(1)
  })

  it('lehnt einen 5. Beitritt ab, wenn der Tisch schon voll ist', () => {
    const tisch = erstelleTischVierer(spieler('Anna'), () => {}, true)
    fuelleAuf(tisch)
    const fuenfter = tritteBeiVierer(tisch.code, spieler('Erik'), () => {})
    expect(fuenfter.ok).toBe(false)
  })
})

describe('listeOffeneTischeVierer', () => {
  it('listet nur Tische, die noch nicht voll sind, mit den bereits gesetzten Namen', () => {
    const tisch = erstelleTischVierer(spieler('Anna'), () => {}, true)
    expect(listeOffeneTischeVierer()).toEqual([
      { id: tisch.code, plaetze: ['Anna', null, null, null] },
    ])
    tritteBeiVierer(tisch.code, spieler('Bert'), () => {})
    expect(listeOffeneTischeVierer()).toEqual([
      { id: tisch.code, plaetze: ['Anna', 'Bert', null, null] },
    ])
    tritteBeiVierer(tisch.code, spieler('Clara'), () => {})
    tritteBeiVierer(tisch.code, spieler('Dora'), () => {})
    expect(listeOffeneTischeVierer()).toEqual([])
  })
})

describe('Bummerl-Zähler', () => {
  it('zieht die Spielpunkte einer gewonnenen Ansage vom Bummerl-Zähler des Gewinner-Teams ab', () => {
    const tisch = erstelleTischVierer(spieler('Anna'), () => {}, true)
    fuelleAuf(tisch)
    expect(tisch.bummerlPunkte).toEqual([24, 24])

    let fehler = ziehAnsagen(tisch, 0, 'schnapser')
    expect(fehler).toBeNull()
    for (const s of [1, 2, 3] as SitzIndex[]) {
      fehler = ziehPassen(tisch, s)
      expect(fehler).toBeNull()
    }
    fehler = ziehTrumpfWaehlen(tisch, 0, 'herz')
    expect(fehler).toBeNull()
    // Team 1 (nicht ansagend) ist zuerst am Zug beim Spritzen – hier: passen.
    fehler = ziehPassen(tisch, 1) // falscher Zug (Spritzen läuft, nicht Ansage) -> Fehlermeldung erwartet
    expect(fehler).not.toBeNull()

    // Manuell in die Spielphase überführen, indem beide Teams passen.
    tisch.partie = { ...tisch.partie!, phase: 'spielt', spritzenPhase: { stufe: 0, amZug: null } }
    // Präpariertes Blatt: Team 0 (Sitze 0,2) erreicht 66 im letzten möglichen Moment für Schnapser (Stich 1-3).
    tisch.partie = {
      ...tisch.partie!,
      haende: [[k('herz', 'A')], [k('pik', 'U')], [k('kreuz', 'U')], [k('karo', 'U')]],
      trumpf: 'herz',
      amZug: 0,
      stichNummer: 2,
      stichAugenTeam: [50, 0],
    }

    ziehKarteAusVierer(tisch, 0, k('herz', 'A'))
    ziehKarteAusVierer(tisch, 1, k('pik', 'U'))
    ziehKarteAusVierer(tisch, 2, k('kreuz', 'U'))
    ziehKarteAusVierer(tisch, 3, k('karo', 'U'))

    // 50 + 11+2+2+2 = 67 >= 66 -> Schnapser gelingt, 6 Punkte für Team 0. 24 - 6 = 18.
    expect(tisch.bummerlPunkte).toEqual([18, 24])
    // Nächste Partie ist automatisch schon ausgeteilt.
    expect(tisch.partie?.phase).toBe('ansage')
    expect(oeffentlicheSichtVierer(tisch, 0)?.bummerlPunkte).toEqual([18, 24])
  })

  it('schließt ein Bummerl ab und setzt den Zähler für beide Teams zurück', () => {
    const tisch = erstelleTischVierer(spieler('Anna'), () => {}, true)
    fuelleAuf(tisch)
    tisch.bummerlPunkte = [6, 24]

    tisch.partie = {
      ...tisch.partie!,
      phase: 'spielt',
      aktiveAnsage: { ansage: 'schnapser', spieler: 0, team: 0 },
      haende: [[k('herz', 'A')], [k('pik', 'U')], [k('kreuz', 'U')], [k('karo', 'U')]],
      trumpf: 'herz',
      amZug: 0,
      stichNummer: 2,
      stichAugenTeam: [50, 0],
    }

    ziehKarteAusVierer(tisch, 0, k('herz', 'A'))
    ziehKarteAusVierer(tisch, 1, k('pik', 'U'))
    ziehKarteAusVierer(tisch, 2, k('kreuz', 'U'))
    ziehKarteAusVierer(tisch, 3, k('karo', 'U'))

    expect(tisch.bummerl).toEqual([1, 0])
    expect(tisch.bummerlPunkte).toEqual([24, 24])
  })
})

describe('Spritzen über den Tisch', () => {
  it('verdoppelt die Spielpunkte, wenn beide Teams spritzen', () => {
    const tisch = erstelleTischVierer(spieler('Anna'), () => {}, true)
    fuelleAuf(tisch)

    let fehler = ziehAnsagen(tisch, 0, 'schnapser')
    expect(fehler).toBeNull()
    for (const s of [1, 2, 3] as SitzIndex[]) {
      fehler = ziehPassen(tisch, s)
      expect(fehler).toBeNull()
    }
    fehler = ziehTrumpfWaehlen(tisch, 0, 'herz')
    expect(fehler).toBeNull()
    expect(tisch.partie?.phase).toBe('spritzen')

    fehler = ziehSpritzen(tisch, 1) // Team 1, gegen die Ansage von Team 0
    expect(fehler).toBeNull()
    fehler = ziehSpritzen(tisch, 0) // Team 0 spritzt zurück
    expect(fehler).toBeNull()
    expect(tisch.partie?.spritzenFaktor).toBe(4)
    expect(tisch.partie?.phase).toBe('spielt')

    tisch.partie = {
      ...tisch.partie!,
      haende: [[k('herz', 'A')], [k('pik', 'U')], [k('kreuz', 'U')], [k('karo', 'U')]],
      amZug: 0,
      stichNummer: 2,
      stichAugenTeam: [50, 0],
    }
    ziehKarteAusVierer(tisch, 0, k('herz', 'A'))
    ziehKarteAusVierer(tisch, 1, k('pik', 'U'))
    ziehKarteAusVierer(tisch, 2, k('kreuz', 'U'))
    ziehKarteAusVierer(tisch, 3, k('karo', 'U'))

    // Schnapser (6) * Spritzen-Faktor 4 = 24 -> reicht, um das Bummerl (24) direkt zu gewinnen.
    expect(tisch.bummerl).toEqual([1, 0])
  })
})

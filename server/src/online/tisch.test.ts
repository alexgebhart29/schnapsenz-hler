import { beforeEach, describe, expect, it } from 'vitest'
import {
  _leereAlleTischeFuerTests,
  erstelleTisch,
  listeOffeneTische,
  oeffentlicheSicht,
  tritteBei,
  zaehleTischeVonTeilnehmer,
  ziehKarteAus,
  type Teilnehmer,
} from './tisch.js'
import type { Karte } from './karten.js'

const k = (farbe: Karte['farbe'], rang: Karte['rang']): Karte => ({ farbe, rang })

const spieler = (name: string): Teilnehmer => ({ id: name, name })

beforeEach(() => {
  _leereAlleTischeFuerTests()
})

describe('erstelleTisch', () => {
  it('startet ohne Angabe bei 7:7 und 0:0', () => {
    const tisch = erstelleTisch(spieler('Anna'), () => {})
    expect(tisch.bummerlPunkte).toEqual([7, 7])
    expect(tisch.bummerl).toEqual([0, 0])
  })

  it('übernimmt einen mitgegebenen Bummerl-Stand (Fortsetzen eines analogen Spiels)', () => {
    const tisch = erstelleTisch(spieler('Anna'), () => {}, {
      bummerlPunkte: [3, 5],
      bummerl: [2, 1],
    })
    expect(tisch.bummerlPunkte).toEqual([3, 5])
    expect(tisch.bummerl).toEqual([2, 1])
  })

  it('kappt einen kaputten/böswilligen Bummerl-Stand auf sinnvolle Grenzen', () => {
    const tisch = erstelleTisch(spieler('Anna'), () => {}, {
      bummerlPunkte: [-5, 999],
      bummerl: [-1, 100000],
    })
    expect(tisch.bummerlPunkte).toEqual([0, 40])
    expect(tisch.bummerl).toEqual([0, 999])
  })
})

describe('listeOffeneTische', () => {
  it('listet nur Tische, die noch auf einen zweiten Spieler warten', () => {
    const tisch = erstelleTisch(spieler('Anna'), () => {})
    expect(listeOffeneTische()).toEqual([{ id: tisch.code, ersteller: 'Anna' }])

    tritteBei(tisch.code, spieler('Bert'), () => {})
    expect(listeOffeneTische()).toEqual([])
  })
})


describe('Bummerl-Zähler', () => {
  it('zieht die Spielpunkte vom Bummerl-Zähler des Gewinners ab und startet die nächste Partie', () => {
    const tisch = erstelleTisch(spieler('Anna'), () => {})
    tritteBei(tisch.code, spieler('Bert'), () => {})
    expect(tisch.bummerlPunkte).toEqual([7, 7])
    expect(tisch.bummerl).toEqual([0, 0])

    // Letzte beiden Karten des Blatts, niemand erreicht 66: der letzte Stich
    // entscheidet die Partie mit 1 Spielpunkt für den Gewinner.
    tisch.partie = {
      ...tisch.partie!,
      haende: [[k('herz', 'A')], [k('herz', 'K')]],
      talon: [],
      trumpf: 'herz',
      trumpfGenommen: true,
      stichAugen: [0, 0],
      meldeAugen: [0, 0],
      anzahlStiche: [0, 0],
      offenerStich: null,
      amZug: 0,
    }

    ziehKarteAus(tisch, 0, k('herz', 'A'))
    ziehKarteAus(tisch, 1, k('herz', 'K'))

    // Spieler 0 gewinnt den letzten Stich (Trumpf-Ass schlägt Trumpf-König) -> 1 Spielpunkt. 7 - 1 = 6.
    expect(tisch.bummerlPunkte).toEqual([6, 7])
    expect(tisch.bummerl).toEqual([0, 0])
    // Nächste Partie ist automatisch schon ausgeteilt.
    expect(tisch.partie?.status).toBe('laufend')
    expect(oeffentlicheSicht(tisch, 0)?.bummerlPunkte).toEqual([6, 7])
  })

  it('schließt ein Bummerl ab, wenn der Zähler 0 erreicht, und setzt ihn zurück', () => {
    const tisch = erstelleTisch(spieler('Anna'), () => {})
    tritteBei(tisch.code, spieler('Bert'), () => {})
    tisch.bummerlPunkte = [1, 7]

    tisch.partie = {
      ...tisch.partie!,
      haende: [[k('herz', 'A')], [k('herz', 'K')]],
      talon: [],
      trumpf: 'herz',
      trumpfGenommen: true,
      stichAugen: [0, 0],
      meldeAugen: [0, 0],
      anzahlStiche: [0, 0],
      offenerStich: null,
      amZug: 0,
    }

    ziehKarteAus(tisch, 0, k('herz', 'A'))
    ziehKarteAus(tisch, 1, k('herz', 'K'))

    expect(tisch.bummerl).toEqual([1, 0])
    expect(tisch.bummerlPunkte).toEqual([7, 7])
  })
})

describe('Stich-Sichtbarkeit', () => {
  it('zeigt jedem Spieler alle eigenen Stiche, vom Gegner aber nur den ersten', () => {
    const tisch = erstelleTisch(spieler('Anna'), () => {})
    tritteBei(tisch.code, spieler('Bert'), () => {})

    // Je 4 Karten, damit nach 2 Stichen noch nicht ausgezählt/neu ausgeteilt wird
    // (Blatt geschlossen: talon leer + trumpfGenommen -> sofort Kartenzwang).
    tisch.partie = {
      ...tisch.partie!,
      haende: [
        [k('pik', 'A'), k('karo', 'K'), k('herz', '10'), k('herz', 'A')],
        [k('pik', 'K'), k('karo', 'A'), k('herz', 'U'), k('herz', 'K')],
      ],
      talon: [],
      trumpf: 'kreuz',
      trumpfGenommen: true,
      stichAugen: [0, 0],
      meldeAugen: [0, 0],
      anzahlStiche: [0, 0],
      offenerStich: null,
      amZug: 0,
    }

    // Stich 1: Anna (0) legt vor und gewinnt (Pik-Ass schlägt Pik-König, Kartenzwang erzwingt Bedienen).
    ziehKarteAus(tisch, 0, k('pik', 'A'))
    ziehKarteAus(tisch, 1, k('pik', 'K'))
    // Stich 2: Anna (Vorhand als Stichgewinnerin) legt vor, Bert (1) gewinnt (Karo-Ass schlägt Karo-König).
    ziehKarteAus(tisch, 0, k('karo', 'K'))
    ziehKarteAus(tisch, 1, k('karo', 'A'))

    // Anna sieht beide eigenen Stiche (1) und Berts einzigen (2. Stich).
    expect(oeffentlicheSicht(tisch, 0)?.stichVerlauf).toEqual([
      { nummer: 1, sieger: 0, karten: [k('pik', 'A'), k('pik', 'K')] },
      { nummer: 2, sieger: 1, karten: [k('karo', 'K'), k('karo', 'A')] },
    ])

    // Stich 3: Bert (Vorhand als Stichgewinner) legt vor, Anna (0) muss bedienen und gewinnt (Herz-10 schlägt Herz-Bube).
    ziehKarteAus(tisch, 1, k('herz', 'U'))
    ziehKarteAus(tisch, 0, k('herz', '10'))

    // Anna sieht jetzt alle drei eigenen/gegnerischen Stiche unverändert plus ihren neuen dritten.
    expect(oeffentlicheSicht(tisch, 0)?.stichVerlauf).toEqual([
      { nummer: 1, sieger: 0, karten: [k('pik', 'A'), k('pik', 'K')] },
      { nummer: 2, sieger: 1, karten: [k('karo', 'K'), k('karo', 'A')] },
      { nummer: 3, sieger: 0, karten: [k('herz', 'U'), k('herz', '10')] },
    ])
    // Bert sieht seinen einzigen eigenen Stich (2) und weiterhin nur Annas ersten (1) – nicht ihren dritten.
    expect(oeffentlicheSicht(tisch, 1)?.stichVerlauf).toEqual([
      { nummer: 1, sieger: 0, karten: [k('pik', 'A'), k('pik', 'K')] },
      { nummer: 2, sieger: 1, karten: [k('karo', 'K'), k('karo', 'A')] },
    ])
  })
})

describe('zaehleTischeVonTeilnehmer', () => {
  it('zählt nur Tische, die dieses Konto selbst eröffnet hat', () => {
    expect(zaehleTischeVonTeilnehmer('Anna')).toBe(0)
    erstelleTisch(spieler('Anna'), () => {})
    erstelleTisch(spieler('Anna'), () => {})
    const drittTisch = erstelleTisch(spieler('Bert'), () => {})
    tritteBei(drittTisch.code, spieler('Anna'), () => {}) // Beitreten zählt nicht als eigener Tisch.

    expect(zaehleTischeVonTeilnehmer('Anna')).toBe(2)
    expect(zaehleTischeVonTeilnehmer('Bert')).toBe(1)
  })
})

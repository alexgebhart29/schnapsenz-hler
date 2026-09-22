import { describe, expect, it } from 'vitest'
import type { Karte } from './karten.js'
import {
  bubeTauschen,
  gegner,
  gesamtAugen,
  kannBubeTauschen,
  kannMelden,
  kannZudrehen,
  legaleKarten,
  melden,
  spieleKarte,
  stichSieger,
  starteNeuePartie,
  zudrehen,
  type PartieZustand,
} from './spielRegeln.js'

const k = (farbe: Karte['farbe'], rang: Karte['rang']): Karte => ({ farbe, rang })

/** Baut einen Zustand mit frei wählbaren Händen/Talon für gezielte Szenarien. */
function zustand(teile: Partial<PartieZustand>): PartieZustand {
  return {
    haende: [[], []],
    talon: [],
    trumpfKarte: k('herz', 'A'),
    trumpf: 'herz',
    trumpfGenommen: true,
    amZug: 0,
    stichAugen: [0, 0],
    meldeAugen: [0, 0],
    anzahlStiche: [0, 0],
    gemeldet: new Set(),
    offenerStich: null,
    geschlossenVon: null,
    bubeTauschVerwendet: false,
    letzterStichGewinner: null,
    status: 'laufend',
    gewinner: null,
    spielpunkte: null,
    pflichtNachMeldung: null,
    stichVerlauf: [],
    ...teile,
  }
}

describe('starteNeuePartie', () => {
  it('teilt 5 Karten je Spieler aus und deckt eine Trumpfkarte auf', () => {
    const partie = starteNeuePartie(0, () => 0.5)
    expect(partie.haende[0]).toHaveLength(5)
    expect(partie.haende[1]).toHaveLength(5)
    expect(partie.talon).toHaveLength(9)
    expect(partie.trumpf).toBe(partie.trumpfKarte.farbe)
    expect(partie.amZug).toBe(0)
  })

  it('lässt den Nicht-Geber beginnen', () => {
    expect(starteNeuePartie(1, () => 0.5).amZug).toBe(1)
  })
})

describe('stichSieger', () => {
  it('Trumpf schlägt jede andere Farbe', () => {
    expect(stichSieger(k('pik', 'A'), k('herz', 'U'), 'herz')).toBe('antwort')
  })

  it('höhere Karte derselben Farbe gewinnt', () => {
    expect(stichSieger(k('pik', 'K'), k('pik', 'A'), 'herz')).toBe('antwort')
    expect(stichSieger(k('pik', 'A'), k('pik', 'K'), 'herz')).toBe('anspiel')
  })

  it('bei unterschiedlicher Farbe ohne Trumpf gewinnt das Anspiel', () => {
    expect(stichSieger(k('pik', 'U'), k('karo', 'A'), 'herz')).toBe('anspiel')
  })
})

describe('legaleKarten', () => {
  it('ohne Kartenzwang darf jede Karte gespielt werden', () => {
    const z = zustand({
      haende: [[k('pik', 'U'), k('karo', 'A')], []],
      talon: [k('kreuz', '10')],
      offenerStich: { karte: k('herz', 'K'), spieler: 1 },
      amZug: 0,
    })
    expect(legaleKarten(z, 0)).toHaveLength(2)
  })

  it('mit Kartenzwang: höher bedienen geht vor tiefer bedienen', () => {
    const z = zustand({
      haende: [[k('pik', 'U'), k('pik', 'A'), k('karo', '10')], []],
      talon: [],
      trumpfGenommen: true,
      offenerStich: { karte: k('pik', 'O'), spieler: 1 },
      amZug: 0,
    })
    expect(legaleKarten(z, 0)).toEqual([k('pik', 'A')])
  })

  it('ohne passende Farbe muss gestochen werden, wenn möglich', () => {
    const z = zustand({
      haende: [[k('herz', 'U'), k('karo', '10')], []],
      talon: [],
      trumpf: 'herz',
      offenerStich: { karte: k('pik', 'O'), spieler: 1 },
      amZug: 0,
    })
    expect(legaleKarten(z, 0)).toEqual([k('herz', 'U')])
  })

  it('ohne Farbe und ohne Trumpf darf beliebig abgeworfen werden', () => {
    const z = zustand({
      haende: [[k('karo', '10'), k('kreuz', 'A')], []],
      talon: [],
      trumpf: 'herz',
      offenerStich: { karte: k('pik', 'O'), spieler: 1 },
      amZug: 0,
    })
    expect(legaleKarten(z, 0)).toHaveLength(2)
  })
})

describe('spieleKarte', () => {
  it('eröffnet einen Stich und gibt den Zug an den Gegner weiter', () => {
    const z = zustand({ haende: [[k('pik', 'A')], [k('pik', 'K')]], amZug: 0 })
    const ergebnis = spieleKarte(z, 0, k('pik', 'A'))
    expect(ergebnis.ok).toBe(true)
    if (!ergebnis.ok) return
    expect(ergebnis.wert.offenerStich).toEqual({ karte: k('pik', 'A'), spieler: 0 })
    expect(ergebnis.wert.amZug).toBe(1)
  })

  it('lehnt Karten ab, die nicht auf der Hand liegen', () => {
    const z = zustand({ haende: [[k('pik', 'A')], []], amZug: 0 })
    const ergebnis = spieleKarte(z, 0, k('herz', 'A'))
    expect(ergebnis.ok).toBe(false)
  })

  it('wertet einen Stich aus, schreibt Augen gut und der Sieger zieht zuerst nach', () => {
    const z = zustand({
      haende: [[], [k('pik', 'K')]],
      talon: [k('kreuz', '10'), k('karo', '10')],
      trumpfGenommen: false,
      offenerStich: { karte: k('pik', 'A'), spieler: 0 },
      amZug: 1,
    })
    const ergebnis = spieleKarte(z, 1, k('pik', 'K'))
    expect(ergebnis.ok).toBe(true)
    if (!ergebnis.ok) return
    // Spieler 0 gewinnt (Ass schlägt König derselben Farbe): 11+4 = 15 Augen.
    expect(ergebnis.wert.stichAugen).toEqual([15, 0])
    expect(ergebnis.wert.anzahlStiche).toEqual([1, 0])
    expect(ergebnis.wert.amZug).toBe(0)
    // Sieger (0) zieht zuerst, bekommt die oberste Talon-Karte.
    expect(ergebnis.wert.haende[0]).toEqual([k('kreuz', '10')])
    expect(ergebnis.wert.haende[1]).toEqual([k('karo', '10')])
  })

  it('beendet die Partie automatisch bei 66+ Augen', () => {
    const z = zustand({
      haende: [[k('herz', 'A')], [k('herz', 'K')]], // Trumpf herz
      talon: [],
      trumpfGenommen: true,
      stichAugen: [55, 0],
      offenerStich: null,
      amZug: 0,
    })
    let ergebnis = spieleKarte(z, 0, k('herz', 'A'))
    expect(ergebnis.ok).toBe(true)
    if (!ergebnis.ok) return
    ergebnis = spieleKarte(ergebnis.wert, 1, k('herz', 'K'))
    expect(ergebnis.ok).toBe(true)
    if (!ergebnis.ok) return
    // 55 + 11 (Ass) + 4 (König) = 70 ≥ 66, Spieler 0 hat den Stich (Trumpf-Ass schlägt Trumpf-König).
    expect(ergebnis.wert.status).toBe('beendet')
    expect(ergebnis.wert.gewinner).toBe(0)
    // Gegner (1) hat 0 Augen und keinen Stich → schwarz → 3 Spielpunkte.
    expect(ergebnis.wert.spielpunkte).toBe(3)
  })

  it('vergibt 2 Spielpunkte, wenn der Verlierer ≤32 Augen mit Stich hat', () => {
    const z = zustand({
      haende: [[k('herz', 'A')], [k('pik', 'A')]],
      talon: [],
      trumpfGenommen: true,
      stichAugen: [55, 20],
      anzahlStiche: [3, 2],
      offenerStich: { karte: k('pik', 'A'), spieler: 1 },
      amZug: 0,
    })
    const ergebnis = spieleKarte(z, 0, k('herz', 'A'))
    expect(ergebnis.ok).toBe(true)
    if (!ergebnis.ok) return
    expect(ergebnis.wert.gewinner).toBe(0)
    expect(ergebnis.wert.spielpunkte).toBe(2)
  })

  it('letzter Stich entscheidet, wenn niemand 66 erreicht', () => {
    const z = zustand({
      haende: [[], [k('kreuz', 'U')]],
      talon: [],
      trumpfGenommen: true,
      stichAugen: [30, 30],
      anzahlStiche: [4, 4],
      offenerStich: { karte: k('karo', 'U'), spieler: 0 },
      amZug: 1,
    })
    const ergebnis = spieleKarte(z, 1, k('kreuz', 'U'))
    expect(ergebnis.ok).toBe(true)
    if (!ergebnis.ok) return
    // Unterschiedliche Farbe, kein Trumpf im Spiel: Anspiel (Spieler 0) gewinnt den letzten Stich.
    expect(ergebnis.wert.status).toBe('beendet')
    expect(ergebnis.wert.gewinner).toBe(0)
    expect(ergebnis.wert.spielpunkte).toBe(1)
  })
})

describe('Zudrehen', () => {
  it('ist nur im Anspiel mit verbleibendem Talon möglich', () => {
    const z = zustand({ talon: [k('pik', '10')], amZug: 0, offenerStich: null })
    expect(kannZudrehen(z, 0)).toBe(true)
    expect(kannZudrehen({ ...z, talon: [] }, 0)).toBe(false)
    expect(kannZudrehen({ ...z, offenerStich: { karte: k('pik', 'A'), spieler: 1 } }, 0)).toBe(false)
  })

  it('Zudreher gewinnt normal, wenn er die 66 doch noch erreicht', () => {
    let z = zustand({
      haende: [[k('herz', 'A')], [k('pik', 'K')]],
      talon: [k('kreuz', '10')],
      trumpfGenommen: false,
      stichAugen: [55, 0],
      amZug: 0,
    })
    const zu = zudrehen(z, 0)
    expect(zu.ok).toBe(true)
    if (!zu.ok) return
    z = zu.wert

    let ergebnis = spieleKarte(z, 0, k('herz', 'A'))
    if (!ergebnis.ok) throw new Error(ergebnis.fehler)
    ergebnis = spieleKarte(ergebnis.wert, 1, k('pik', 'K'))
    if (!ergebnis.ok) throw new Error(ergebnis.fehler)

    expect(ergebnis.wert.status).toBe('beendet')
    expect(ergebnis.wert.gewinner).toBe(0)
    // Kein Zudreh-Malus für den erfolgreichen Zudreher selbst.
    expect(ergebnis.wert.spielpunkte).toBe(3)
    // Nach dem Zudrehen wird nicht mehr nachgezogen.
    expect(ergebnis.wert.talon).toEqual([k('kreuz', '10')])
  })

  it('Gegner gewinnt mit mindestens 2 Punkten, wenn der Zudreher die 66 verfehlt', () => {
    let z = zustand({
      haende: [[k('pik', 'U')], [k('herz', 'A')]], // Trumpf herz
      talon: [k('kreuz', '10')],
      trumpfGenommen: false,
      stichAugen: [40, 55], // Zudreher (0) hätte ≥33 Augen -> normal nur 1 Punkt
      anzahlStiche: [2, 3],
      amZug: 0,
    })
    const zu = zudrehen(z, 0)
    if (!zu.ok) throw new Error(zu.fehler)
    z = zu.wert

    let ergebnis = spieleKarte(z, 0, k('pik', 'U'))
    if (!ergebnis.ok) throw new Error(ergebnis.fehler)
    ergebnis = spieleKarte(ergebnis.wert, 1, k('herz', 'A'))
    if (!ergebnis.ok) throw new Error(ergebnis.fehler)

    expect(ergebnis.wert.gewinner).toBe(1)
    // Ohne Zudrehen wäre der Verlierer (0) bei ≥33 Augen nur 1 Punkt wert.
    expect(ergebnis.wert.spielpunkte).toBe(2)
  })

  it('beendet die Partie auch, wenn beim Zudrehen noch ungenutzte Karten im Talon lagen', () => {
    // Wurde direkt nach dem Austeilen zugedreht (Talon noch nicht angerührt),
    // bleibt der Talon für den Rest der Partie unverändert gefüllt – die
    // Erkennung "alle Karten verbraucht" darf sich daher nicht auf den Talon
    // stützen, sondern muss wie istKartenzwang() den Zudreh-Fall einschließen.
    let z = zustand({
      haende: [[k('pik', 'U')], [k('karo', 'U')]],
      talon: [k('kreuz', '10')],
      trumpfGenommen: false,
      amZug: 0,
    })
    const zu = zudrehen(z, 0)
    if (!zu.ok) throw new Error(zu.fehler)
    z = zu.wert

    let ergebnis = spieleKarte(z, 0, k('pik', 'U'))
    if (!ergebnis.ok) throw new Error(ergebnis.fehler)
    ergebnis = spieleKarte(ergebnis.wert, 1, k('karo', 'U'))
    if (!ergebnis.ok) throw new Error(ergebnis.fehler)

    // Beide Hände sind jetzt leer, keiner hat 66 erreicht – der Zudreher (0)
    // hat sein Ziel verfehlt, Gegner (1) gewinnt mit mindestens 2 Punkten.
    expect(ergebnis.wert.status).toBe('beendet')
    expect(ergebnis.wert.gewinner).toBe(1)
    expect(ergebnis.wert.spielpunkte).toBe(2)
  })
})

describe('Bube tauschen', () => {
  it('tauscht den Trumpf-Buben gegen die aufgedeckte Trumpfkarte', () => {
    const z = zustand({
      haende: [[k('herz', 'U')], []],
      talon: [k('pik', '10')],
      trumpfKarte: k('herz', 'A'),
      trumpf: 'herz',
      trumpfGenommen: false,
      amZug: 0,
    })
    expect(kannBubeTauschen(z, 0)).toBe(true)
    const ergebnis = bubeTauschen(z, 0)
    expect(ergebnis.ok).toBe(true)
    if (!ergebnis.ok) return
    expect(ergebnis.wert.haende[0]).toEqual([k('herz', 'A')])
    expect(ergebnis.wert.trumpfKarte).toEqual(k('herz', 'U'))
    expect(ergebnis.wert.bubeTauschVerwendet).toBe(true)
  })

  it('ist ohne den Trumpf-Buben nicht möglich', () => {
    const z = zustand({ haende: [[k('pik', 'U')], []], talon: [k('pik', '10')], amZug: 0 })
    expect(kannBubeTauschen(z, 0)).toBe(false)
  })
})

describe('Melden', () => {
  it('40er für König+Dame in Trumpf, 20er für andere Farben', () => {
    const trumpf = zustand({
      haende: [[k('herz', 'K'), k('herz', 'O')], []],
      trumpf: 'herz',
      amZug: 0,
    })
    expect(kannMelden(trumpf, 0, 'herz')).toBe(true)
    const t = melden(trumpf, 0, 'herz')
    if (!t.ok) throw new Error(t.fehler)
    expect(t.wert.meldeAugen[0]).toBe(40)

    const farbe = zustand({
      haende: [[k('pik', 'K'), k('pik', 'O')], []],
      trumpf: 'herz',
      amZug: 0,
    })
    const f = melden(farbe, 0, 'pik')
    if (!f.ok) throw new Error(f.fehler)
    expect(f.wert.meldeAugen[0]).toBe(20)
  })

  it('dieselbe Ehe kann nicht zweimal gemeldet werden', () => {
    const z = zustand({ haende: [[k('pik', 'K'), k('pik', 'O')], []], amZug: 0 })
    const erste = melden(z, 0, 'pik')
    if (!erste.ok) throw new Error(erste.fehler)
    expect(kannMelden(erste.wert, 0, 'pik')).toBe(false)
  })

  it('eine Meldung kann die Partie sofort per 66+ beenden', () => {
    const z = zustand({
      haende: [[k('herz', 'K'), k('herz', 'O')], []],
      trumpf: 'herz',
      stichAugen: [30, 0],
      anzahlStiche: [2, 0],
      amZug: 0,
    })
    const ergebnis = melden(z, 0, 'herz')
    if (!ergebnis.ok) throw new Error(ergebnis.fehler)
    expect(gesamtAugen(ergebnis.wert, 0)).toBe(70)
    expect(ergebnis.wert.status).toBe('beendet')
    expect(ergebnis.wert.gewinner).toBe(0)
  })

  it('nach einer Meldung muss eine der beiden gemeldeten Karten ausgespielt werden', () => {
    const z = zustand({
      haende: [[k('pik', 'K'), k('pik', 'O'), k('karo', 'A')], []],
      amZug: 0,
    })
    const gemeldet = melden(z, 0, 'pik')
    if (!gemeldet.ok) throw new Error(gemeldet.fehler)
    expect(gemeldet.wert.pflichtNachMeldung).toBe('pik')

    // Nur König/Dame Pik sind jetzt erlaubt, nicht die dritte Karte auf der Hand.
    expect(legaleKarten(gemeldet.wert, 0)).toEqual([k('pik', 'K'), k('pik', 'O')])
    const verboten = spieleKarte(gemeldet.wert, 0, k('karo', 'A'))
    expect(verboten.ok).toBe(false)

    // Zudrehen/Bube tauschen/weiteres Melden sind währenddessen gesperrt.
    expect(kannZudrehen(gemeldet.wert, 0)).toBe(false)
    expect(kannBubeTauschen(gemeldet.wert, 0)).toBe(false)

    const erlaubt = spieleKarte(gemeldet.wert, 0, k('pik', 'O'))
    expect(erlaubt.ok).toBe(true)
    if (!erlaubt.ok) return
    expect(erlaubt.wert.pflichtNachMeldung).toBeNull()
    expect(erlaubt.wert.offenerStich).toEqual({ karte: k('pik', 'O'), spieler: 0 })
  })
})

describe('stichVerlauf', () => {
  it('protokolliert jeden Stich chronologisch mit Sieger und Karten', () => {
    const z = zustand({
      haende: [
        [k('pik', 'A'), k('karo', 'K')],
        [k('pik', 'K'), k('karo', 'A')],
      ],
      amZug: 0,
    })
    expect(z.stichVerlauf).toEqual([])

    // Stich 1: Spieler 0 gewinnt (Pik-Ass schlägt Pik-König).
    let ergebnis = spieleKarte(z, 0, k('pik', 'A'))
    if (!ergebnis.ok) throw new Error(ergebnis.fehler)
    ergebnis = spieleKarte(ergebnis.wert, 1, k('pik', 'K'))
    if (!ergebnis.ok) throw new Error(ergebnis.fehler)
    expect(ergebnis.wert.stichVerlauf).toEqual([
      { sieger: 0, karten: [k('pik', 'A'), k('pik', 'K')] },
    ])

    // Stich 2: Spieler 1 gewinnt (Karo-Ass schlägt Karo-König) – der Verlauf
    // wächst, der erste Eintrag bleibt unverändert.
    ergebnis = spieleKarte(ergebnis.wert, 0, k('karo', 'K'))
    if (!ergebnis.ok) throw new Error(ergebnis.fehler)
    ergebnis = spieleKarte(ergebnis.wert, 1, k('karo', 'A'))
    if (!ergebnis.ok) throw new Error(ergebnis.fehler)
    expect(ergebnis.wert.stichVerlauf).toEqual([
      { sieger: 0, karten: [k('pik', 'A'), k('pik', 'K')] },
      { sieger: 1, karten: [k('karo', 'K'), k('karo', 'A')] },
    ])
  })
})

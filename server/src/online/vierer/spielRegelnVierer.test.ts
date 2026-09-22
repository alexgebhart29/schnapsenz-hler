import { describe, expect, it } from 'vitest'
import type { Karte } from './karten4.js'
import {
  ansagen,
  gesamtAugenTeam,
  kannAnsagen,
  kannMelden4,
  legaleKarten4,
  melden,
  passen,
  spieleKarte4,
  spritzen,
  spritzenPassen,
  starteAusteilung,
  trumpfAufdecken,
  trumpfWaehlen,
  type PartieZustandVierer,
  type SitzIndex,
} from './spielRegelnVierer.js'

const k = (farbe: Karte['farbe'], rang: Karte['rang']): Karte => ({ farbe, rang })

/** Baut einen Zustand mit frei wählbaren Feldern für gezielte Szenarien (Standard: mitten im Spiel). */
function zustand(teile: Partial<PartieZustandVierer>): PartieZustandVierer {
  return {
    phase: 'spielt',
    haende: [[], [], [], []],
    restdeck: [],
    austeilPosition: 0,
    bettlerErlaubt: true,
    ansagePhase: { vorhand: 0, anDerReihe: 0, hoechste: null, gepasst: new Set() },
    ansageGewinner: null,
    aktiveAnsage: null,
    trumpf: 'herz',
    aufgedeckteTrumpfkarte: null,
    spritzenPhase: { stufe: 0, amZug: null },
    spritzenFaktor: 1,
    amZug: 0,
    offenerStich: [],
    stichAugenTeam: [0, 0],
    meldeAugenTeam: [0, 0],
    stichAnzahlSpieler: [0, 0, 0, 0],
    stichNummer: 0,
    gemeldet: new Set(),
    pflichtNachMeldung: null,
    letzterStichGewinner: null,
    gewinnerTeam: null,
    spielpunkte: null,
    ...teile,
  }
}

describe('Austeilung', () => {
  it('verteilt 2 Karten je Spieler, Rest bleibt im Restdeck', () => {
    const z = starteAusteilung(0, true)
    expect(z.haende.map((h) => h.length)).toEqual([2, 2, 2, 2])
    expect(z.restdeck).toHaveLength(20 - 8)
    expect(z.phase).toBe('ansage')
    expect(z.ansagePhase.anDerReihe).toBe(0)
  })
})

describe('Ansage-Auktion', () => {
  it('höheres überstimmt niedrigeres, Auktion endet sobald nur noch einer aktiv ist', () => {
    let z = starteAusteilung(0, true)

    let e = ansagen(z, 0, 'gang')
    if (!e.ok) throw new Error(e.fehler)
    z = e.wert
    expect(z.ansagePhase.anDerReihe).toBe(1)

    // Niedriger als die aktuell höchste Ansage (gang) ist nicht erlaubt.
    expect(kannAnsagen(z, 1, 'schnapser')).toBe(false)
    e = ansagen(z, 1, 'schnapser')
    expect(e.ok).toBe(false)

    // Überbieten ist erlaubt.
    e = ansagen(z, 1, 'bauernschnapser')
    if (!e.ok) throw new Error(e.fehler)
    z = e.wert
    expect(z.ansagePhase.anDerReihe).toBe(2)

    e = passen(z, 2)
    if (!e.ok) throw new Error(e.fehler)
    z = e.wert
    e = passen(z, 3)
    if (!e.ok) throw new Error(e.fehler)
    z = e.wert
    // Jetzt haben alle außer Spieler 1 gepasst -> Auktion endet automatisch.
    e = passen(z, 0)
    if (!e.ok) throw new Error(e.fehler)
    z = e.wert

    expect(z.phase).toBe('trumpfwahl')
    expect(z.ansageGewinner).toBe(1)
    expect(z.aktiveAnsage).toEqual({ ansage: 'bauernschnapser', spieler: 1, team: 1 })
  })

  it('passen alle 4, gibt es eine normale Runde ohne Ansage – Vorhand bestimmt den Trumpf', () => {
    let z = starteAusteilung(2, true)
    for (const spieler of [2, 3, 0, 1] as SitzIndex[]) {
      const e = passen(z, spieler)
      if (!e.ok) throw new Error(e.fehler)
      z = e.wert
    }
    expect(z.phase).toBe('trumpfwahl')
    expect(z.aktiveAnsage).toBeNull()
    expect(z.ansageGewinner).toBe(2)
  })

  it('Bettler ist nur ansagbar, wenn am Tisch aktiviert', () => {
    const z = starteAusteilung(0, false)
    expect(kannAnsagen(z, 0, 'bettler')).toBe(false)
    expect(ansagen(z, 0, 'bettler').ok).toBe(false)
  })
})

describe('Trumpfwahl', () => {
  it('bei direkter Wahl bekommen alle ihre restlichen Karten, Spritzen-Runde startet beim Nicht-Ansager-Team', () => {
    let z = starteAusteilung(0, true)
    let e = ansagen(z, 0, 'schnapser')
    if (!e.ok) throw new Error(e.fehler)
    z = e.wert
    for (const spieler of [1, 2, 3] as SitzIndex[]) {
      const p = passen(z, spieler)
      if (!p.ok) throw new Error(p.fehler)
      z = p.wert
    }
    expect(z.phase).toBe('trumpfwahl')

    const gewaehlt = trumpfWaehlen(z, 0, 'karo')
    if (!gewaehlt.ok) throw new Error(gewaehlt.fehler)
    z = gewaehlt.wert

    expect(z.trumpf).toBe('karo')
    expect(z.haende.map((h) => h.length)).toEqual([5, 5, 5, 5])
    expect(z.phase).toBe('spritzen')
    // Ansage-Team ist Team 0 (Spieler 0) -> das gegnerische Team 1 darf zuerst spritzen.
    expect(z.spritzenPhase).toEqual({ stufe: 0, amZug: 1 })
  })

  it('beim Aufdecken bestimmt die aufgedeckte Karte den Trumpf und landet in der Hand des Ansagers', () => {
    let z = starteAusteilung(0, true)
    const angesagt = ansagen(z, 0, 'gang')
    if (!angesagt.ok) throw new Error(angesagt.fehler)
    z = angesagt.wert
    for (const spieler of [1, 2, 3] as SitzIndex[]) {
      const p = passen(z, spieler)
      if (!p.ok) throw new Error(p.fehler)
      z = p.wert
    }
    expect(z.ansageGewinner).toBe(0)

    const aufgedeckt = trumpfAufdecken(z, 0)
    if (!aufgedeckt.ok) throw new Error(aufgedeckt.fehler)
    z = aufgedeckt.wert

    expect(z.aufgedeckteTrumpfkarte).not.toBeNull()
    expect(z.trumpf).toBe(z.aufgedeckteTrumpfkarte!.farbe)
    expect(z.haende[0]).toContainEqual(z.aufgedeckteTrumpfkarte)
    expect(z.haende.map((h) => h.length)).toEqual([5, 5, 5, 5])
    expect(z.phase).toBe('spritzen')
  })
})

describe('Spritzen', () => {
  it('verdoppelt bis zu zweimal (Kontra/Re), danach beginnt die Spielphase', () => {
    let z = zustand({ phase: 'spritzen', spritzenPhase: { stufe: 0, amZug: 1 }, spritzenFaktor: 1 })

    let e = spritzen(z, 1)
    if (!e.ok) throw new Error(e.fehler)
    z = e.wert
    expect(z.spritzenFaktor).toBe(2)
    expect(z.spritzenPhase).toEqual({ stufe: 1, amZug: 0 })
    expect(z.phase).toBe('spritzen')

    e = spritzen(z, 0)
    if (!e.ok) throw new Error(e.fehler)
    z = e.wert
    expect(z.spritzenFaktor).toBe(4)
    expect(z.phase).toBe('spielt')
  })

  it('ein Pass beendet die Spritzen-Runde sofort', () => {
    const z = zustand({ phase: 'spritzen', spritzenPhase: { stufe: 0, amZug: 1 }, spritzenFaktor: 1 })
    const e = spritzenPassen(z, 3) // Spieler 3 ist auch Team 1
    if (!e.ok) throw new Error(e.fehler)
    expect(e.wert.spritzenFaktor).toBe(1)
    expect(e.wert.phase).toBe('spielt')
  })
})

describe('Normale Runde (keine Ansage)', () => {
  it('Team, das 66 erreicht, gewinnt nach 1/2/3-Tarif', () => {
    const z = zustand({
      aktiveAnsage: null,
      trumpf: 'herz',
      amZug: 0,
      stichNummer: 4,
      stichAugenTeam: [43, 0],
      meldeAugenTeam: [0, 0],
      stichAnzahlSpieler: [4, 0, 0, 0], // Team 1 (Sitze 1,3) hatte bislang keinen Stich -> schwarz
      haende: [[k('herz', 'A')], [k('pik', 'K')], [k('kreuz', 'K')], [k('karo', 'K')]],
      offenerStich: [],
    })

    let e = spieleKarte4(z, 0, k('herz', 'A'))
    if (!e.ok) throw new Error(e.fehler)
    let n = e.wert
    e = spieleKarte4(n, 1, k('pik', 'K'))
    if (!e.ok) throw new Error(e.fehler)
    n = e.wert
    e = spieleKarte4(n, 2, k('kreuz', 'K'))
    if (!e.ok) throw new Error(e.fehler)
    n = e.wert
    e = spieleKarte4(n, 3, k('karo', 'K'))
    if (!e.ok) throw new Error(e.fehler)
    n = e.wert

    // 43 + (11+4+4+4) = 66, Team 0 gewinnt. Team 1 blieb bei 0 Augen und ganz ohne Stich -> 3 Punkte.
    expect(n.phase).toBe('beendet')
    expect(n.gewinnerTeam).toBe(0)
    expect(n.spielpunkte).toBe(3)
  })

  it('erreicht niemand 66, entscheidet der letzte Stich mit 1 Punkt', () => {
    const z = zustand({
      aktiveAnsage: null,
      trumpf: 'herz',
      amZug: 1,
      stichNummer: 4,
      stichAugenTeam: [20, 20],
      haende: [[k('pik', 'U')], [k('herz', 'K')], [k('kreuz', 'U')], [k('karo', 'U')]],
    })
    let e = spieleKarte4(z, 1, k('herz', 'K'))
    if (!e.ok) throw new Error(e.fehler)
    let n = e.wert
    e = spieleKarte4(n, 2, k('kreuz', 'U'))
    if (!e.ok) throw new Error(e.fehler)
    n = e.wert
    e = spieleKarte4(n, 3, k('karo', 'U'))
    if (!e.ok) throw new Error(e.fehler)
    n = e.wert
    e = spieleKarte4(n, 0, k('pik', 'U'))
    if (!e.ok) throw new Error(e.fehler)
    n = e.wert

    expect(n.phase).toBe('beendet')
    expect(n.gewinnerTeam).toBe(1) // Spieler 1 (Trumpf-König) gewinnt den letzten Stich.
    expect(n.spielpunkte).toBe(1)
  })
})

describe('Ansage: Schnapser', () => {
  it('gelingt, wenn das Team spätestens beim 3. Stich 66 erreicht', () => {
    const z = zustand({
      aktiveAnsage: { ansage: 'schnapser', spieler: 0, team: 0 },
      trumpf: 'herz',
      amZug: 0,
      stichNummer: 2,
      stichAugenTeam: [50, 0],
      haende: [[k('herz', 'A')], [k('pik', 'U')], [k('kreuz', 'U')], [k('karo', 'U')]],
    })
    let e = spieleKarte4(z, 0, k('herz', 'A'))
    if (!e.ok) throw new Error(e.fehler)
    let n = e.wert
    e = spieleKarte4(n, 1, k('pik', 'U'))
    if (!e.ok) throw new Error(e.fehler)
    n = e.wert
    e = spieleKarte4(n, 2, k('kreuz', 'U'))
    if (!e.ok) throw new Error(e.fehler)
    n = e.wert
    e = spieleKarte4(n, 3, k('karo', 'U'))
    if (!e.ok) throw new Error(e.fehler)
    n = e.wert

    expect(gesamtAugenTeam(n, 0)).toBeGreaterThanOrEqual(66)
    expect(n.phase).toBe('beendet')
    expect(n.gewinnerTeam).toBe(0)
    expect(n.spielpunkte).toBe(6)
  })

  it('scheitert, wenn die 66 bis zum 3. Stich nicht erreicht wird – Gegner bekommt dieselbe Punktzahl', () => {
    const z = zustand({
      aktiveAnsage: { ansage: 'schnapser', spieler: 0, team: 0 },
      trumpf: 'herz',
      amZug: 0,
      stichNummer: 2,
      stichAugenTeam: [10, 0],
      haende: [[k('pik', 'U')], [k('kreuz', 'U')], [k('karo', 'U')], [k('karo', 'O')]],
    })
    let e = spieleKarte4(z, 0, k('pik', 'U'))
    if (!e.ok) throw new Error(e.fehler)
    let n = e.wert
    e = spieleKarte4(n, 1, k('kreuz', 'U'))
    if (!e.ok) throw new Error(e.fehler)
    n = e.wert
    e = spieleKarte4(n, 2, k('karo', 'U'))
    if (!e.ok) throw new Error(e.fehler)
    n = e.wert
    e = spieleKarte4(n, 3, k('karo', 'O'))
    if (!e.ok) throw new Error(e.fehler)
    n = e.wert

    expect(n.phase).toBe('beendet')
    expect(n.gewinnerTeam).toBe(1)
    expect(n.spielpunkte).toBe(6)
  })
})

describe('Ansage: Bauernschnapser', () => {
  it('scheitert sofort, sobald das gegnerische Team irgendeinen Stich macht', () => {
    const z = zustand({
      aktiveAnsage: { ansage: 'bauernschnapser', spieler: 0, team: 0 },
      trumpf: 'herz',
      amZug: 0,
      haende: [[k('pik', 'U')], [k('herz', 'A')], [k('kreuz', 'U')], [k('karo', 'U')]],
    })
    let e = spieleKarte4(z, 0, k('pik', 'U'))
    if (!e.ok) throw new Error(e.fehler)
    let n = e.wert
    e = spieleKarte4(n, 1, k('herz', 'A'))
    if (!e.ok) throw new Error(e.fehler)
    n = e.wert
    e = spieleKarte4(n, 2, k('kreuz', 'U'))
    if (!e.ok) throw new Error(e.fehler)
    n = e.wert
    e = spieleKarte4(n, 3, k('karo', 'U'))
    if (!e.ok) throw new Error(e.fehler)
    n = e.wert

    expect(n.phase).toBe('beendet')
    expect(n.gewinnerTeam).toBe(1)
    expect(n.spielpunkte).toBe(12)
  })

  it('gelingt, wenn das Team nach 5 Stichen keinen einzigen an den Gegner verloren hat', () => {
    const z = zustand({
      aktiveAnsage: { ansage: 'bauernschnapser', spieler: 0, team: 0 },
      trumpf: 'herz',
      amZug: 2,
      stichNummer: 4,
      stichAnzahlSpieler: [2, 0, 2, 0],
      haende: [[k('pik', 'U')], [k('pik', 'O')], [k('herz', 'A')], [k('pik', 'K')]],
    })
    let e = spieleKarte4(z, 2, k('herz', 'A'))
    if (!e.ok) throw new Error(e.fehler)
    let n = e.wert
    e = spieleKarte4(n, 3, k('pik', 'K'))
    if (!e.ok) throw new Error(e.fehler)
    n = e.wert
    e = spieleKarte4(n, 0, k('pik', 'U'))
    if (!e.ok) throw new Error(e.fehler)
    n = e.wert
    e = spieleKarte4(n, 1, k('pik', 'O'))
    if (!e.ok) throw new Error(e.fehler)
    n = e.wert

    expect(n.phase).toBe('beendet')
    expect(n.gewinnerTeam).toBe(0)
    expect(n.spielpunkte).toBe(12)
  })
})

describe('Ansage: Gang', () => {
  it('scheitert, sobald irgendein anderer Spieler (auch der eigene Partner) einen Stich gewinnt', () => {
    const z = zustand({
      aktiveAnsage: { ansage: 'gang', spieler: 0, team: 0 },
      trumpf: 'herz',
      amZug: 0,
      haende: [[k('pik', 'U')], [k('pik', 'O')], [k('herz', 'A')], [k('pik', 'K')]],
    })
    let e = spieleKarte4(z, 0, k('pik', 'U'))
    if (!e.ok) throw new Error(e.fehler)
    let n = e.wert
    e = spieleKarte4(n, 1, k('pik', 'O'))
    if (!e.ok) throw new Error(e.fehler)
    n = e.wert
    e = spieleKarte4(n, 2, k('herz', 'A')) // Partner (Sitz 2, Team 0) macht den Stich statt Sitz 0.
    if (!e.ok) throw new Error(e.fehler)
    n = e.wert
    e = spieleKarte4(n, 3, k('pik', 'K'))
    if (!e.ok) throw new Error(e.fehler)
    n = e.wert

    expect(n.phase).toBe('beendet')
    expect(n.gewinnerTeam).toBe(1)
    expect(n.spielpunkte).toBe(9)
  })

  it('gelingt, wenn der Ansager persönlich alle 5 eigenen Stiche macht', () => {
    const z = zustand({
      aktiveAnsage: { ansage: 'gang', spieler: 0, team: 0 },
      trumpf: 'herz',
      amZug: 0,
      stichNummer: 4,
      stichAnzahlSpieler: [4, 0, 0, 0],
      haende: [[k('herz', 'A')], [k('pik', 'U')], [k('kreuz', 'U')], [k('karo', 'U')]],
    })
    let e = spieleKarte4(z, 0, k('herz', 'A'))
    if (!e.ok) throw new Error(e.fehler)
    let n = e.wert
    e = spieleKarte4(n, 1, k('pik', 'U'))
    if (!e.ok) throw new Error(e.fehler)
    n = e.wert
    e = spieleKarte4(n, 2, k('kreuz', 'U'))
    if (!e.ok) throw new Error(e.fehler)
    n = e.wert
    e = spieleKarte4(n, 3, k('karo', 'U'))
    if (!e.ok) throw new Error(e.fehler)
    n = e.wert

    expect(n.phase).toBe('beendet')
    expect(n.gewinnerTeam).toBe(0)
    expect(n.spielpunkte).toBe(9)
  })
})

describe('Ansage: 10er Gang (umgekehrte Kartenstärke)', () => {
  it('die 10 schlägt das Ass derselben Farbe (statt umgekehrt)', () => {
    const z = zustand({
      aktiveAnsage: { ansage: 'zehnerGang', spieler: 0, team: 0 },
      trumpf: 'herz',
      amZug: 0,
      haende: [[k('pik', '10')], [k('pik', 'A')], [k('kreuz', 'U')], [k('kreuz', 'O')]],
    })
    expect(legaleKarten4(z, 0)).toEqual([k('pik', '10')])

    let e = spieleKarte4(z, 0, k('pik', '10'))
    if (!e.ok) throw new Error(e.fehler)
    let n = e.wert
    // Spieler 1 muss bedienen (einzige Karte ist ohnehin Pik-Ass).
    e = spieleKarte4(n, 1, k('pik', 'A'))
    if (!e.ok) throw new Error(e.fehler)
    n = e.wert
    e = spieleKarte4(n, 2, k('kreuz', 'U'))
    if (!e.ok) throw new Error(e.fehler)
    n = e.wert
    e = spieleKarte4(n, 3, k('kreuz', 'O'))
    if (!e.ok) throw new Error(e.fehler)
    n = e.wert

    // Unter normaler Stärke hätte Pik-Ass gewonnen – beim 10er Gang gewinnt die 10.
    expect(n.letzterStichGewinner).toBe(0)
    expect(n.stichAnzahlSpieler[0]).toBe(1)
  })
})

describe('Ansage: Bettler', () => {
  it('scheitert, sobald der Ansager selbst einen Stich gewinnt', () => {
    const z = zustand({
      aktiveAnsage: { ansage: 'bettler', spieler: 0, team: 0 },
      trumpf: 'herz',
      amZug: 0,
      haende: [[k('herz', 'A')], [k('pik', 'U')], [k('kreuz', 'U')], [k('karo', 'U')]],
    })
    let e = spieleKarte4(z, 0, k('herz', 'A'))
    if (!e.ok) throw new Error(e.fehler)
    let n = e.wert
    e = spieleKarte4(n, 1, k('pik', 'U'))
    if (!e.ok) throw new Error(e.fehler)
    n = e.wert
    e = spieleKarte4(n, 2, k('kreuz', 'U'))
    if (!e.ok) throw new Error(e.fehler)
    n = e.wert
    e = spieleKarte4(n, 3, k('karo', 'U'))
    if (!e.ok) throw new Error(e.fehler)
    n = e.wert

    expect(n.phase).toBe('beendet')
    expect(n.gewinnerTeam).toBe(1)
    expect(n.spielpunkte).toBe(4)
  })

  it('gelingt, wenn der Ansager nach 5 Stichen keinen einzigen gemacht hat', () => {
    const z = zustand({
      aktiveAnsage: { ansage: 'bettler', spieler: 0, team: 0 },
      trumpf: 'herz',
      amZug: 1,
      stichNummer: 4,
      stichAnzahlSpieler: [0, 2, 2, 0],
      haende: [[k('pik', 'U')], [k('herz', 'A')], [k('kreuz', 'U')], [k('karo', 'U')]],
    })
    let e = spieleKarte4(z, 1, k('herz', 'A'))
    if (!e.ok) throw new Error(e.fehler)
    let n = e.wert
    e = spieleKarte4(n, 2, k('kreuz', 'U'))
    if (!e.ok) throw new Error(e.fehler)
    n = e.wert
    e = spieleKarte4(n, 3, k('karo', 'U'))
    if (!e.ok) throw new Error(e.fehler)
    n = e.wert
    e = spieleKarte4(n, 0, k('pik', 'U'))
    if (!e.ok) throw new Error(e.fehler)
    n = e.wert

    expect(n.phase).toBe('beendet')
    expect(n.gewinnerTeam).toBe(0)
    expect(n.spielpunkte).toBe(4)
  })
})

describe('Spritzen-Multiplikator wirkt sich auf das Endergebnis aus', () => {
  it('verdoppelt die Spielpunkte einer gewonnenen Ansage', () => {
    const z = zustand({
      aktiveAnsage: { ansage: 'schnapser', spieler: 0, team: 0 },
      spritzenFaktor: 2,
      trumpf: 'herz',
      amZug: 0,
      stichNummer: 2,
      stichAugenTeam: [55, 0],
      haende: [[k('herz', 'A')], [k('pik', 'U')], [k('kreuz', 'U')], [k('karo', 'U')]],
    })
    let e = spieleKarte4(z, 0, k('herz', 'A'))
    if (!e.ok) throw new Error(e.fehler)
    let n = e.wert
    e = spieleKarte4(n, 1, k('pik', 'U'))
    if (!e.ok) throw new Error(e.fehler)
    n = e.wert
    e = spieleKarte4(n, 2, k('kreuz', 'U'))
    if (!e.ok) throw new Error(e.fehler)
    n = e.wert
    e = spieleKarte4(n, 3, k('karo', 'U'))
    if (!e.ok) throw new Error(e.fehler)
    n = e.wert

    expect(n.spielpunkte).toBe(12) // 6 * Faktor 2
  })
})

describe('Melden', () => {
  it('bucht die Meldung aufs Team und erzwingt das Ausspielen einer der beiden Karten', () => {
    const z = zustand({
      aktiveAnsage: null,
      trumpf: 'herz',
      amZug: 0,
      offenerStich: [],
      haende: [[k('herz', 'K'), k('herz', 'O'), k('pik', 'U')], [], [], []],
    })
    expect(kannMelden4(z, 0, 'herz')).toBe(true)
    const e = melden(z, 0, 'herz')
    if (!e.ok) throw new Error(e.fehler)
    const n = e.wert

    expect(n.meldeAugenTeam[0]).toBe(40) // Trumpf-Ehe zählt 40.
    expect(n.pflichtNachMeldung).toBe('herz')
    expect(legaleKarten4(n, 0)).toEqual(
      expect.arrayContaining([k('herz', 'K'), k('herz', 'O')]),
    )
    expect(legaleKarten4(n, 0)).toHaveLength(2)
  })
})

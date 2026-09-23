import { beforeEach, describe, expect, it } from 'vitest'
import {
  _leereAlleTischeVierFuerTests,
  entferneVerbindungVierer,
  erstelleTischVierer,
  findeSitzVierer,
  listeOffeneTischeVierer,
  oeffentlicheSichtVierer,
  starteSpielVierer,
  tritteBeiVierer,
  wechsleSitzVierer,
  zaehleTischeVierVonTeilnehmer,
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

/** Füllt den Tisch auf 4 Plätze auf und startet danach wie üblich sofort das Spiel (Warteraum übersprungen). */
function fuelleAuf(tisch: TischVierer): void {
  tritteBeiVierer(tisch.code, spieler('Bert'), () => {})
  tritteBeiVierer(tisch.code, spieler('Clara'), () => {})
  tritteBeiVierer(tisch.code, spieler('Dora'), () => {})
  starteSpielVierer(tisch, 'Anna')
}

describe('erstelleTischVierer / tritteBeiVierer', () => {
  it('startet auch bei vollem Tisch nicht von selbst – erst der Gastgeber startet aus dem Warteraum heraus', () => {
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
    // Voll, aber noch nicht gestartet.
    expect(tisch.partie).toBeNull()

    const fehler = starteSpielVierer(tisch, 'Anna')
    expect(fehler).toBeNull()
    expect(tisch.partie).not.toBeNull()
    expect(tisch.partie!.haende.map((h) => h.length)).toEqual([2, 2, 2, 2])
  })
})

describe('Warteraum (Teamaufstellung vor dem Start)', () => {
  it('lässt Spieler vor dem Start frei die Plätze tauschen – Team ergibt sich aus dem Sitzplatz', () => {
    const tisch = erstelleTischVierer(spieler('Anna'), () => {}, true)
    tritteBeiVierer(tisch.code, spieler('Bert'), () => {})
    tritteBeiVierer(tisch.code, spieler('Clara'), () => {})
    tritteBeiVierer(tisch.code, spieler('Dora'), () => {})

    // Anna (Platz 0) tauscht mit Clara (Platz 2) – beide bleiben aber in Team 0 (0+2).
    let fehler = wechsleSitzVierer(tisch, 'Anna', 2)
    expect(fehler).toBeNull()
    expect(findeSitzVierer(tisch, 'Anna')).toBe(2)
    expect(findeSitzVierer(tisch, 'Clara')).toBe(0)

    // Bert (jetzt noch Platz 1) tauscht mit Dora (Platz 3) – wechselt aber nicht das Team.
    fehler = wechsleSitzVierer(tisch, 'Bert', 3)
    expect(fehler).toBeNull()
    expect(findeSitzVierer(tisch, 'Bert')).toBe(3)
    expect(findeSitzVierer(tisch, 'Dora')).toBe(1)
  })

  it('nur der Gastgeber (zuerst beigetreten) darf starten, und nur wenn alle 4 Plätze besetzt sind', () => {
    const tisch = erstelleTischVierer(spieler('Anna'), () => {}, true)
    tritteBeiVierer(tisch.code, spieler('Bert'), () => {})
    tritteBeiVierer(tisch.code, spieler('Clara'), () => {})

    expect(starteSpielVierer(tisch, 'Anna')).not.toBeNull() // noch nicht voll
    expect(tisch.partie).toBeNull()

    tritteBeiVierer(tisch.code, spieler('Dora'), () => {})
    expect(starteSpielVierer(tisch, 'Bert')).not.toBeNull() // Bert ist nicht der Gastgeber
    expect(tisch.partie).toBeNull()

    expect(starteSpielVierer(tisch, 'Anna')).toBeNull()
    expect(tisch.partie).not.toBeNull()
  })

  it('gibt die Gastgeber-Rolle automatisch an die/den nächste(n) noch Verbundene(n) weiter, wenn Anna offline geht', () => {
    const tisch = erstelleTischVierer(spieler('Anna'), () => {}, true)
    tritteBeiVierer(tisch.code, spieler('Bert'), () => {})
    tritteBeiVierer(tisch.code, spieler('Clara'), () => {})
    tritteBeiVierer(tisch.code, spieler('Dora'), () => {})

    expect(oeffentlicheSichtVierer(tisch, 0)).toBeNull() // Warteraum, noch keine Partie/Sicht
    entferneVerbindungVierer(tisch, findeSitzVierer(tisch, 'Anna')!)

    // Bert ist als Zweiter beigetreten -> übernimmt jetzt die Gastgeber-Rolle.
    expect(starteSpielVierer(tisch, 'Anna')).not.toBeNull() // nicht mehr Gastgeber (offline)
    expect(tisch.partie).toBeNull()
    expect(starteSpielVierer(tisch, 'Bert')).toBeNull()
    expect(tisch.partie).not.toBeNull()
  })

  it('Gastgeber-Rolle folgt der Person, nicht dem Sitzplatz, auch nach einem Tausch', () => {
    const tisch = erstelleTischVierer(spieler('Anna'), () => {}, true)
    tritteBeiVierer(tisch.code, spieler('Bert'), () => {})
    tritteBeiVierer(tisch.code, spieler('Clara'), () => {})
    tritteBeiVierer(tisch.code, spieler('Dora'), () => {})

    wechsleSitzVierer(tisch, 'Anna', 3) // Anna sitzt jetzt auf Platz 4, bleibt aber Gastgeberin.
    entferneVerbindungVierer(tisch, findeSitzVierer(tisch, 'Bert')!) // Bert (Platz 1) offline, ändert nichts an Anna als Gastgeberin.

    expect(starteSpielVierer(tisch, 'Anna')).toBeNull()
    expect(tisch.partie).not.toBeNull()
  })

  it('verbietet Sitzwechsel, sobald das Spiel läuft', () => {
    const tisch = erstelleTischVierer(spieler('Anna'), () => {}, true)
    tritteBeiVierer(tisch.code, spieler('Bert'), () => {})
    tritteBeiVierer(tisch.code, spieler('Clara'), () => {})
    tritteBeiVierer(tisch.code, spieler('Dora'), () => {})
    starteSpielVierer(tisch, 'Anna')

    expect(wechsleSitzVierer(tisch, 'Bert', 2)).not.toBeNull()
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

describe('zaehleTischeVierVonTeilnehmer', () => {
  it('zählt nur Vierer-Tische, die dieses Konto selbst eröffnet hat', () => {
    expect(zaehleTischeVierVonTeilnehmer('Anna')).toBe(0)
    erstelleTischVierer(spieler('Anna'), () => {}, true)
    erstelleTischVierer(spieler('Anna'), () => {}, true)
    const drittTisch = erstelleTischVierer(spieler('Bert'), () => {}, true)
    tritteBeiVierer(drittTisch.code, spieler('Anna'), () => {}) // Beitreten zählt nicht als eigener Tisch.

    expect(zaehleTischeVierVonTeilnehmer('Anna')).toBe(2)
    expect(zaehleTischeVierVonTeilnehmer('Bert')).toBe(1)
  })

  it('zählt auch bei einem fortgesetzten Spiel den Ersteller korrekt, egal auf welchem Platz er landet', () => {
    const erwarteteNamen: [string, string, string, string] = ['Anna', 'Bert', 'Clara', 'Dora']
    // Bert eröffnet, landet aber auf Platz 2 (seinem eigenen Namen entsprechend), nicht auf Platz 1.
    erstelleTischVierer(spieler('Bert'), () => {}, true, {
      erwarteteNamen,
      bummerlPunkte: [24, 24],
      bummerl: [0, 0],
    })
    expect(zaehleTischeVierVonTeilnehmer('Bert')).toBe(1)
    expect(zaehleTischeVierVonTeilnehmer('Anna')).toBe(0)
  })
})

describe('Fortsetzen eines analogen (oder online begonnenen) Vierer-Spiels', () => {
  const erwarteteNamen: [string, string, string, string] = ['Anna', 'Bert', 'Clara', 'Dora']

  it('übernimmt den mitgegebenen Stand und setzt die eröffnende Person auf ihren eigenen Platz', () => {
    // Clara eröffnet den Tisch, gehört laut erwarteteNamen aber auf Platz 3 (Team B).
    const tisch = erstelleTischVierer(spieler('Clara'), () => {}, true, {
      erwarteteNamen,
      bummerlPunkte: [10, 15],
      bummerl: [1, 2],
    })

    expect(tisch.bummerlPunkte).toEqual([10, 15])
    expect(tisch.bummerl).toEqual([1, 2])
    expect(findeSitzVierer(tisch, 'Clara')).toBe(2)
    expect(tisch.spieler[0]).toBeNull()
  })

  it('vergibt Plätze strikt nach Namen – falsche Konten werden abgelehnt, richtige landen automatisch richtig', () => {
    const tisch = erstelleTischVierer(spieler('Anna'), () => {}, true, {
      erwarteteNamen,
      bummerlPunkte: [24, 24],
      bummerl: [0, 0],
    })

    const fremder = tritteBeiVierer(tisch.code, spieler('Erik'), () => {})
    expect(fremder.ok).toBe(false)

    const bert = tritteBeiVierer(tisch.code, spieler('Bert'), () => {})
    expect(bert.ok).toBe(true)
    if (bert.ok) expect(bert.meinIndex).toBe(1)

    const dora = tritteBeiVierer(tisch.code, spieler('Dora'), () => {})
    expect(dora.ok).toBe(true)
    if (dora.ok) expect(dora.meinIndex).toBe(3)

    // Ein zweites Konto mit demselben Namen "Bert" (Platz ist schon besetzt, anderer Fehlertext als "gehört nicht dazu").
    const bertNochmal = tritteBeiVierer(tisch.code, { id: 'bert-2', name: 'Bert' }, () => {})
    expect(bertNochmal.ok).toBe(false)
    if (!bertNochmal.ok) expect(bertNochmal.fehler).toBe('Dieser Platz ist schon besetzt')
  })

  it('verbietet Sitzwechsel bei einem fortgesetzten Spiel', () => {
    const tisch = erstelleTischVierer(spieler('Anna'), () => {}, true, {
      erwarteteNamen,
      bummerlPunkte: [24, 24],
      bummerl: [0, 0],
    })
    expect(wechsleSitzVierer(tisch, 'Anna', 1)).not.toBeNull()
  })

  it('blendet einen fortgesetzten Tisch für Konten aus, die nicht zu den vier Namen gehören', () => {
    erstelleTischVierer(spieler('Anna'), () => {}, true, {
      erwarteteNamen,
      bummerlPunkte: [24, 24],
      bummerl: [0, 0],
    })

    expect(listeOffeneTischeVierer('Bert')).toHaveLength(1)
    expect(listeOffeneTischeVierer('Erik')).toHaveLength(0)
    expect(listeOffeneTischeVierer()).toHaveLength(1) // ohne Namen (z. B. interne Nutzung) weiterhin sichtbar
  })

  it('markiert die Sicht als Fortsetzung, damit der Client keinen zweiten Spiel-Datensatz anlegt', () => {
    const tisch = erstelleTischVierer(spieler('Anna'), () => {}, true, {
      erwarteteNamen,
      bummerlPunkte: [24, 24],
      bummerl: [0, 0],
    })
    tritteBeiVierer(tisch.code, spieler('Bert'), () => {})
    tritteBeiVierer(tisch.code, spieler('Clara'), () => {})
    tritteBeiVierer(tisch.code, spieler('Dora'), () => {})
    starteSpielVierer(tisch, 'Anna')

    expect(oeffentlicheSichtVierer(tisch, 0)?.istFortsetzung).toBe(true)

    const normalerTisch = erstelleTischVierer(spieler('Erik'), () => {})
    tritteBeiVierer(normalerTisch.code, spieler('Frida'), () => {})
    tritteBeiVierer(normalerTisch.code, spieler('Gustl'), () => {})
    tritteBeiVierer(normalerTisch.code, spieler('Hilde'), () => {})
    starteSpielVierer(normalerTisch, 'Erik')

    expect(oeffentlicheSichtVierer(normalerTisch, 0)?.istFortsetzung).toBe(false)
  })
})

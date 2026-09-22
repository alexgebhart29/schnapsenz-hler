/**
 * Regel-Engine für eine einzelne Partie Online-Schnapsen (2 Spieler). Rein
 * funktional (kein I/O, kein WebSocket) und dadurch isoliert testbar – die
 * Verkabelung mit Tisch/WebSocket passiert in tisch.ts.
 *
 * Regelquelle: https://schnopsn.com/schnapsen-regeln
 */
import { gleicheKarte, mische, staerke, vollesBlatt, type Farbe, type Karte } from './karten.js'

export type SpielerIndex = 0 | 1

export const gegner = (spieler: SpielerIndex): SpielerIndex => (spieler === 0 ? 1 : 0)

export type OffenerStich = { karte: Karte; spieler: SpielerIndex }

export type PartieZustand = {
  haende: [Karte[], Karte[]]
  /** Verbleibender Stock ohne die Trumpfkarte, [0] = als nächstes zu ziehen. */
  talon: Karte[]
  trumpfKarte: Karte
  trumpf: Farbe
  /** Wurde die aufgedeckte Trumpfkarte bereits aufgenommen (Tausch oder letztes Abheben)? */
  trumpfGenommen: boolean
  amZug: SpielerIndex
  /** Aus gewonnenen Stichen gesammelte Augen. */
  stichAugen: [number, number]
  /** Aus Meldungen (20er/40er) gutgeschriebene Augen. */
  meldeAugen: [number, number]
  anzahlStiche: [number, number]
  /** Schlüssel "spieler-farbe", um dieselbe Ehe nicht zweimal zu melden. */
  gemeldet: Set<string>
  offenerStich: OffenerStich | null
  geschlossenVon: SpielerIndex | null
  bubeTauschVerwendet: boolean
  letzterStichGewinner: SpielerIndex | null
  status: 'laufend' | 'beendet'
  gewinner: SpielerIndex | null
  spielpunkte: 1 | 2 | 3 | null
  /**
   * Direkt nach einer Meldung: der Spieler muss als Nächstes zwingend König
   * oder Dame dieser Farbe ausspielen ("… und spielt eine der beiden Karten
   * aus"). Wird nach dem Anspiel wieder gelöscht.
   */
  pflichtNachMeldung: Farbe | null
  /** Alle in dieser Partie abgeschlossenen Stiche, chronologisch. */
  stichVerlauf: StichEintrag[]
}

export type StichEintrag = { sieger: SpielerIndex; karten: [Karte, Karte] }

export type Ergebnis<T> = { ok: true; wert: T } | { ok: false; fehler: string }

const ok = <T>(wert: T): Ergebnis<T> => ({ ok: true, wert })
const fehler = <T>(text: string): Ergebnis<T> => ({ ok: false, fehler: text })

/** Baut eine neue Partie auf. `nichtGeber` beginnt (Regel: der Nicht-Geber spielt aus). */
export function starteNeuePartie(
  nichtGeber: SpielerIndex,
  zufall: () => number = Math.random,
): PartieZustand {
  const blatt = mische(vollesBlatt(), zufall)
  const hand0 = blatt.slice(0, 5)
  const hand1 = blatt.slice(5, 10)
  const trumpfKarte = blatt[10]!
  const talon = blatt.slice(11)

  return {
    haende: [hand0, hand1],
    talon,
    trumpfKarte,
    trumpf: trumpfKarte.farbe,
    trumpfGenommen: false,
    amZug: nichtGeber,
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
  }
}

export function gesamtAugen(zustand: PartieZustand, spieler: SpielerIndex): number {
  return zustand.stichAugen[spieler] + zustand.meldeAugen[spieler]
}

/** Talon leer und Trumpfkarte aufgenommen, oder zugedreht: ab jetzt Farb-/Stichzwang. */
export function istKartenzwang(zustand: PartieZustand): boolean {
  return zustand.geschlossenVon !== null || (zustand.talon.length === 0 && zustand.trumpfGenommen)
}

const punktwert = (rang: Karte['rang']): number =>
  ({ A: 11, '10': 10, K: 4, O: 3, U: 2 })[rang]

/** Welche Karte gewinnt einen Stich: Trumpf schlägt alles, sonst zählt die Anspielfarbe. */
export function stichSieger(anspiel: Karte, antwort: Karte, trumpf: Farbe): 'anspiel' | 'antwort' {
  const anspielIstTrumpf = anspiel.farbe === trumpf
  const antwortIstTrumpf = antwort.farbe === trumpf

  if (anspielIstTrumpf && antwortIstTrumpf) {
    return staerke(antwort.rang) > staerke(anspiel.rang) ? 'antwort' : 'anspiel'
  }
  if (antwortIstTrumpf) return 'antwort'
  if (anspielIstTrumpf) return 'anspiel'
  if (antwort.farbe !== anspiel.farbe) return 'anspiel' // nicht bedient, kein Trumpf: Anspiel gewinnt
  return staerke(antwort.rang) > staerke(anspiel.rang) ? 'antwort' : 'anspiel'
}

/**
 * Karten, die `spieler` gerade legal spielen darf. Ohne Kartenzwang ist jede
 * Handkarte erlaubt (auch als Antwort). Mit Kartenzwang gilt die Reihenfolge:
 * höher bedienen → tiefer bedienen → stechen → beliebig abwerfen.
 */
export function legaleKarten(zustand: PartieZustand, spieler: SpielerIndex): Karte[] {
  const hand = zustand.haende[spieler]
  const stich = zustand.offenerStich

  if (!stich || stich.spieler === spieler) {
    // Nach einer Meldung muss eine der beiden gemeldeten Karten ausgespielt werden.
    if (zustand.pflichtNachMeldung !== null) {
      const farbe = zustand.pflichtNachMeldung
      return hand.filter((k) => k.farbe === farbe && (k.rang === 'K' || k.rang === 'O'))
    }
    return hand // Anspiel: sonst keine Einschränkung
  }
  if (!istKartenzwang(zustand)) return hand

  const ansageFarbe = stich.karte.farbe
  const passend = hand.filter((k) => k.farbe === ansageFarbe)
  const hoeher = passend.filter((k) => staerke(k.rang) > staerke(stich.karte.rang))
  if (hoeher.length > 0) return hoeher
  if (passend.length > 0) return passend

  const trumpf = hand.filter((k) => k.farbe === zustand.trumpf)
  if (trumpf.length > 0) return trumpf

  return hand
}

function hatKarte(hand: Karte[], karte: Karte): boolean {
  return hand.some((k) => gleicheKarte(k, karte))
}

function entferneKarte(hand: Karte[], karte: Karte): Karte[] {
  const index = hand.findIndex((k) => gleicheKarte(k, karte))
  return index === -1 ? hand : [...hand.slice(0, index), ...hand.slice(index + 1)]
}

/** Zieht eine Karte für `spieler` vom Talon bzw. zuletzt die Trumpfkarte. */
function ziehe(zustand: PartieZustand, spieler: SpielerIndex): PartieZustand {
  if (zustand.talon.length > 0) {
    const [karte, ...rest] = zustand.talon
    const haende: [Karte[], Karte[]] = [...zustand.haende]
    haende[spieler] = [...haende[spieler], karte!]
    return { ...zustand, haende, talon: rest }
  }
  if (!zustand.trumpfGenommen) {
    const haende: [Karte[], Karte[]] = [...zustand.haende]
    haende[spieler] = [...haende[spieler], zustand.trumpfKarte]
    return { ...zustand, haende, trumpfGenommen: true }
  }
  return zustand
}

/** Bester erreichbarer Normal-Tarif für den Verlierer: 3 (schwarz) / 2 (≤32) / 1 (≥33). */
function normalTarif(verliererAugen: number, verliererHatteStich: boolean): 1 | 2 | 3 {
  if (!verliererHatteStich) return 3
  if (verliererAugen <= 32) return 2
  return 1
}

/** Schließt die Partie ab und trägt Sieger + Spielpunkte ein. */
function beende(
  zustand: PartieZustand,
  gewinner: SpielerIndex,
  spielpunkte: 1 | 2 | 3,
): PartieZustand {
  return { ...zustand, status: 'beendet', gewinner, spielpunkte, offenerStich: null }
}

/**
 * Prüft nach einem Stich (oder einer Meldung), ob die Partie endet – inklusive
 * der Zudrehen-Sonderregel: Erreicht der Zudreher die 66 nicht mehr, gewinnt
 * der Gegner mit mindestens 2 Spielpunkten, unabhängig vom Normal-Tarif.
 */
function pruefeSpielende(zustand: PartieZustand): PartieZustand {
  if (zustand.status === 'beendet') return zustand

  for (const spieler of [0, 1] as const) {
    if (gesamtAugen(zustand, spieler) < 66) continue
    const verlierer = gegner(spieler)
    const tarif = normalTarif(gesamtAugen(zustand, verlierer), zustand.anzahlStiche[verlierer] > 0)

    if (zustand.geschlossenVon !== null && zustand.geschlossenVon !== spieler) {
      // Der Zudreher hat sein eigenes Ziel (66) verfehlt, bevor die Karten
      // ausgingen – der Gegner gewinnt mit mindestens 2 Spielpunkten, auch
      // wenn der Zudreher selbst noch ≥33 Augen hätte (was sonst nur 1 wert wäre).
      return beende(zustand, spieler, Math.max(tarif, 2) as 1 | 2 | 3)
    }
    return beende(zustand, spieler, tarif)
  }

  // Talon und beide Hände leer, niemand hat 66 erreicht.
  const talonLeer = zustand.talon.length === 0 && zustand.trumpfGenommen
  const haendeLeer = zustand.haende[0].length === 0 && zustand.haende[1].length === 0
  if (talonLeer && haendeLeer) {
    if (zustand.geschlossenVon !== null) {
      // Zudreher hat die 66 nicht geschafft: Gegner gewinnt, mindestens 2 Punkte.
      const gewinner = gegner(zustand.geschlossenVon)
      const tarif = normalTarif(
        gesamtAugen(zustand, zustand.geschlossenVon),
        zustand.anzahlStiche[zustand.geschlossenVon] > 0,
      )
      return beende(zustand, gewinner, Math.max(tarif, 2) as 1 | 2 | 3)
    }
    if (zustand.letzterStichGewinner !== null) {
      return beende(zustand, zustand.letzterStichGewinner, 1)
    }
  }

  return zustand
}

/** Kann `spieler` gerade den Talon zudrehen? Nur im Anspiel, solange noch Karten liegen. */
export function kannZudrehen(zustand: PartieZustand, spieler: SpielerIndex): boolean {
  return (
    zustand.status === 'laufend' &&
    zustand.amZug === spieler &&
    zustand.offenerStich === null &&
    zustand.geschlossenVon === null &&
    zustand.pflichtNachMeldung === null &&
    zustand.talon.length > 0
  )
}

export function zudrehen(zustand: PartieZustand, spieler: SpielerIndex): Ergebnis<PartieZustand> {
  if (!kannZudrehen(zustand, spieler)) return fehler('Zudrehen gerade nicht möglich')
  return ok({ ...zustand, geschlossenVon: spieler })
}

/** Kann `spieler` den Trumpf-Buben gegen die aufgedeckte Trumpfkarte tauschen? */
export function kannBubeTauschen(zustand: PartieZustand, spieler: SpielerIndex): boolean {
  return (
    zustand.status === 'laufend' &&
    zustand.amZug === spieler &&
    zustand.offenerStich === null &&
    zustand.geschlossenVon === null &&
    zustand.pflichtNachMeldung === null &&
    !zustand.bubeTauschVerwendet &&
    zustand.talon.length > 0 &&
    hatKarte(zustand.haende[spieler], { farbe: zustand.trumpf, rang: 'U' })
  )
}

export function bubeTauschen(zustand: PartieZustand, spieler: SpielerIndex): Ergebnis<PartieZustand> {
  if (!kannBubeTauschen(zustand, spieler)) return fehler('Bube tauschen gerade nicht möglich')
  const bube: Karte = { farbe: zustand.trumpf, rang: 'U' }
  const haende: [Karte[], Karte[]] = [...zustand.haende]
  haende[spieler] = [...entferneKarte(haende[spieler], bube), zustand.trumpfKarte]
  return ok({ ...zustand, haende, trumpfKarte: bube, bubeTauschVerwendet: true })
}

/**
 * Kann `spieler` gerade Farbe `farbe` melden (König + Dame dieser Farbe auf
 * der Hand, noch nicht für diese Farbe gemeldet)? Nur im Anspiel möglich.
 */
export function kannMelden(zustand: PartieZustand, spieler: SpielerIndex, farbe: Farbe): boolean {
  if (
    zustand.status !== 'laufend' ||
    zustand.amZug !== spieler ||
    zustand.offenerStich !== null ||
    zustand.pflichtNachMeldung !== null ||
    zustand.gemeldet.has(`${spieler}-${farbe}`)
  ) {
    return false
  }
  const hand = zustand.haende[spieler]
  return hatKarte(hand, { farbe, rang: 'K' }) && hatKarte(hand, { farbe, rang: 'O' })
}

/**
 * Meldet König+Dame einer Farbe. Endet die Partie dadurch nicht sofort (66+),
 * muss unmittelbar danach eine der beiden gemeldeten Karten ausgespielt
 * werden – siehe `pflichtNachMeldung` und dessen Auswertung in `spieleKarte`.
 */
export function melden(
  zustand: PartieZustand,
  spieler: SpielerIndex,
  farbe: Farbe,
): Ergebnis<PartieZustand> {
  if (!kannMelden(zustand, spieler, farbe)) return fehler('Melden gerade nicht möglich')
  const punkte = farbe === zustand.trumpf ? 40 : 20
  const meldeAugen: [number, number] = [...zustand.meldeAugen]
  meldeAugen[spieler] += punkte
  const gemeldet = new Set(zustand.gemeldet)
  gemeldet.add(`${spieler}-${farbe}`)

  const ausgewertet = pruefeSpielende({ ...zustand, meldeAugen, gemeldet })
  if (ausgewertet.status === 'beendet') return ok(ausgewertet)
  return ok({ ...ausgewertet, pflichtNachMeldung: farbe })
}

/** Spielt eine Karte aus (Anspiel) oder beantwortet den offenen Stich. */
export function spieleKarte(
  zustand: PartieZustand,
  spieler: SpielerIndex,
  karte: Karte,
): Ergebnis<PartieZustand> {
  if (zustand.status !== 'laufend') return fehler('Partie ist bereits beendet')
  if (zustand.amZug !== spieler) return fehler('nicht am Zug')
  if (!hatKarte(zustand.haende[spieler], karte)) return fehler('Karte nicht auf der Hand')

  const legal = legaleKarten(zustand, spieler)
  if (!legal.some((k) => gleicheKarte(k, karte))) return fehler('Karte gerade nicht erlaubt')

  const haende: [Karte[], Karte[]] = [...zustand.haende]
  haende[spieler] = entferneKarte(haende[spieler], karte)

  if (!zustand.offenerStich) {
    // Anspiel: Stich eröffnen, Gegner ist am Zug. Eine eventuelle Pflicht aus
    // einer Meldung ist mit diesem Ausspielen erfüllt.
    return ok({
      ...zustand,
      haende,
      offenerStich: { karte, spieler },
      amZug: gegner(spieler),
      pflichtNachMeldung: null,
    })
  }

  // Antwort: Stich wird ausgewertet.
  const anspiel = zustand.offenerStich
  const sieger = stichSieger(anspiel.karte, karte, zustand.trumpf) === 'anspiel' ? anspiel.spieler : spieler
  const augen = punktwert(anspiel.karte.rang) + punktwert(karte.rang)

  const stichAugen: [number, number] = [...zustand.stichAugen]
  stichAugen[sieger] += augen
  const anzahlStiche: [number, number] = [...zustand.anzahlStiche]
  anzahlStiche[sieger] += 1

  const stichVerlauf: StichEintrag[] = [
    ...zustand.stichVerlauf,
    { sieger, karten: [anspiel.karte, karte] },
  ]

  let naechster: PartieZustand = {
    ...zustand,
    haende,
    stichAugen,
    anzahlStiche,
    offenerStich: null,
    letzterStichGewinner: sieger,
    amZug: sieger,
    stichVerlauf,
  }

  if (naechster.geschlossenVon === null) {
    naechster = ziehe(naechster, sieger)
    naechster = ziehe(naechster, gegner(sieger))
  }

  return ok(pruefeSpielende(naechster))
}

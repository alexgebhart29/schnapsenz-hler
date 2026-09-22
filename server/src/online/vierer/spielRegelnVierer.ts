/**
 * Regel-Engine für eine Partie Online-Vierer-Schnapsen (Bauernschnapsen,
 * 4 Spieler in 2 festen Teams). Rein funktional, isoliert testbar – die
 * Verkabelung mit Tisch/WebSocket passiert in tischVierer.ts.
 *
 * Ablauf einer Partie: Austeilen (2 Karten je Spieler) → Ansage-Auktion
 * (reihum ansagen/passen, höheres überstimmt) → Trumpfwahl (wählen oder
 * nächste Karte aufdecken) → Rest austeilen → Spritzen (Kontra/Re) →
 * Stiche spielen (kein Talon, sofortiger Kartenzwang, 5 Stiche gesamt).
 */
import { gleicheKarte, mische, staerke4, vollesBlatt, type Farbe, type Karte } from './karten4.js'

export type SitzIndex = 0 | 1 | 2 | 3
export type TeamIndex = 0 | 1

export const team = (sitz: SitzIndex): TeamIndex => (sitz % 2 === 0 ? 0 : 1)
export const gegnerTeam = (team: TeamIndex): TeamIndex => (team === 0 ? 1 : 0)
export const naechsterSitz = (sitz: SitzIndex): SitzIndex => (((sitz + 1) % 4) as SitzIndex)

export type Ansage = 'bettler' | 'schnapser' | 'gang' | 'zehnerGang' | 'bauernschnapser'

/** Aufsteigende Rangfolge der Auktion – jede höhere Ansage überstimmt jede niedrigere. */
const ANSAGE_RANGFOLGE: Ansage[] = ['bettler', 'schnapser', 'gang', 'zehnerGang', 'bauernschnapser']
const ansageRang = (ansage: Ansage): number => ANSAGE_RANGFOLGE.indexOf(ansage)

export const ANSAGE_PUNKTE: Record<Ansage, number> = {
  bettler: 4,
  schnapser: 6,
  gang: 9,
  zehnerGang: 10,
  bauernschnapser: 12,
}

const punktwert = (rang: Karte['rang']): number => ({ A: 11, '10': 10, K: 4, O: 3, U: 2 })[rang]

export type OffenerStichEintrag = { karte: Karte; spieler: SitzIndex }

export type AnsagePhase = {
  vorhand: SitzIndex
  anDerReihe: SitzIndex
  hoechste: { ansage: Ansage; spieler: SitzIndex } | null
  gepasst: Set<SitzIndex>
}

export type SpritzenPhase = {
  stufe: 0 | 1 | 2
  amZug: TeamIndex | null
}

export type PartieZustandVierer = {
  phase: 'ansage' | 'trumpfwahl' | 'spritzen' | 'spielt' | 'beendet'
  haende: [Karte[], Karte[], Karte[], Karte[]]
  /** Noch nicht verteilte Karten, für die gestaffelte Austeilung (2 Karten, dann Rest). */
  restdeck: Karte[]
  /** Wer als Nächstes eine Karte vom Restdeck bekommt (Austeil-Reihum). */
  austeilPosition: SitzIndex
  bettlerErlaubt: boolean
  ansagePhase: AnsagePhase
  /** Wer die Auktion gewonnen hat (bzw. Vorhand, wenn alle gepasst haben). */
  ansageGewinner: SitzIndex | null
  /** null = normale Runde ohne Sonderansage. */
  aktiveAnsage: { ansage: Ansage; spieler: SitzIndex; team: TeamIndex } | null
  trumpf: Farbe | null
  aufgedeckteTrumpfkarte: Karte | null
  spritzenPhase: SpritzenPhase
  spritzenFaktor: 1 | 2 | 4
  amZug: SitzIndex
  offenerStich: OffenerStichEintrag[]
  stichAugenTeam: [number, number]
  meldeAugenTeam: [number, number]
  /** Stiche pro einzelnem Spieler (für Gang/10er-Gang/Bettler, die personenbezogen sind). */
  stichAnzahlSpieler: [number, number, number, number]
  stichNummer: number
  gemeldet: Set<string>
  pflichtNachMeldung: Farbe | null
  letzterStichGewinner: SitzIndex | null
  gewinnerTeam: TeamIndex | null
  spielpunkte: number | null
}

export type Ergebnis<T> = { ok: true; wert: T } | { ok: false; fehler: string }
const ok = <T>(wert: T): Ergebnis<T> => ({ ok: true, wert })
const fehler = <T>(text: string): Ergebnis<T> => ({ ok: false, fehler: text })

function naechsterAktiverSitz(sitz: SitzIndex, gepasst: Set<SitzIndex>): SitzIndex {
  let naechster = naechsterSitz(sitz)
  while (gepasst.has(naechster)) naechster = naechsterSitz(naechster)
  return naechster
}

/** Baut eine neue Austeilung auf: 2 Karten je Spieler, Rest bleibt im Restdeck. */
export function starteAusteilung(
  vorhand: SitzIndex,
  bettlerErlaubt: boolean,
  zufall: () => number = Math.random,
): PartieZustandVierer {
  const blatt = mische(vollesBlatt(), zufall)
  const haende: [Karte[], Karte[], Karte[], Karte[]] = [[], [], [], []]

  let index = 0
  for (let runde = 0; runde < 2; runde++) {
    let sitz = vorhand
    for (let i = 0; i < 4; i++) {
      haende[sitz]!.push(blatt[index]!)
      index++
      sitz = naechsterSitz(sitz)
    }
  }

  return {
    phase: 'ansage',
    haende,
    restdeck: blatt.slice(index),
    austeilPosition: vorhand,
    bettlerErlaubt,
    ansagePhase: { vorhand, anDerReihe: vorhand, hoechste: null, gepasst: new Set() },
    ansageGewinner: null,
    aktiveAnsage: null,
    trumpf: null,
    aufgedeckteTrumpfkarte: null,
    spritzenPhase: { stufe: 0, amZug: null },
    spritzenFaktor: 1,
    amZug: vorhand,
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
  }
}

export function gesamtAugenTeam(zustand: PartieZustandVierer, teamIndex: TeamIndex): number {
  return zustand.stichAugenTeam[teamIndex] + zustand.meldeAugenTeam[teamIndex]
}

/** Kann `spieler` gerade `ansage` ansagen? Muss echt höher als die aktuell höchste sein. */
export function kannAnsagen(zustand: PartieZustandVierer, spieler: SitzIndex, ansage: Ansage): boolean {
  if (zustand.phase !== 'ansage' || zustand.ansagePhase.anDerReihe !== spieler) return false
  if (ansage === 'bettler' && !zustand.bettlerErlaubt) return false
  const hoechsteRang = zustand.ansagePhase.hoechste ? ansageRang(zustand.ansagePhase.hoechste.ansage) : -1
  return ansageRang(ansage) > hoechsteRang
}

/** Alle Ansagen, die `spieler` gerade machen dürfte – für die Auswahl-Buttons im Client. */
export function moeglicheAnsagen(zustand: PartieZustandVierer, spieler: SitzIndex): Ansage[] {
  return ANSAGE_RANGFOLGE.filter((ansage) => kannAnsagen(zustand, spieler, ansage))
}

export function kannPassen(zustand: PartieZustandVierer, spieler: SitzIndex): boolean {
  return zustand.phase === 'ansage' && zustand.ansagePhase.anDerReihe === spieler
}

function beendeAuktion(zustand: PartieZustandVierer): PartieZustandVierer {
  const hoechste = zustand.ansagePhase.hoechste
  const ansageGewinner = hoechste?.spieler ?? zustand.ansagePhase.vorhand
  return {
    ...zustand,
    phase: 'trumpfwahl',
    ansageGewinner,
    aktiveAnsage: hoechste ? { ansage: hoechste.ansage, spieler: hoechste.spieler, team: team(hoechste.spieler) } : null,
  }
}

export function ansagen(zustand: PartieZustandVierer, spieler: SitzIndex, ansage: Ansage): Ergebnis<PartieZustandVierer> {
  if (!kannAnsagen(zustand, spieler, ansage)) return fehler('Ansage gerade nicht möglich')

  const ansagePhase: AnsagePhase = { ...zustand.ansagePhase, hoechste: { ansage, spieler } }
  // Waren schon alle anderen 3 draußen, gewinnt diese Ansage sofort – niemand kann mehr überbieten.
  if (ansagePhase.gepasst.size === 3) return ok(beendeAuktion({ ...zustand, ansagePhase }))

  ansagePhase.anDerReihe = naechsterAktiverSitz(spieler, ansagePhase.gepasst)
  return ok({ ...zustand, ansagePhase })
}

export function passen(zustand: PartieZustandVierer, spieler: SitzIndex): Ergebnis<PartieZustandVierer> {
  if (!kannPassen(zustand, spieler)) return fehler('Passen gerade nicht möglich')

  const gepasst = new Set(zustand.ansagePhase.gepasst)
  gepasst.add(spieler)
  const ansagePhase: AnsagePhase = { ...zustand.ansagePhase, gepasst }

  if (gepasst.size === 4) return ok(beendeAuktion({ ...zustand, ansagePhase }))
  if (gepasst.size === 3 && ansagePhase.hoechste !== null) return ok(beendeAuktion({ ...zustand, ansagePhase }))

  ansagePhase.anDerReihe = naechsterAktiverSitz(spieler, gepasst)
  return ok({ ...zustand, ansagePhase })
}

/** Verteilt das restliche Restdeck reihum, bis alle 5 Karten haben. */
function verteileRest(zustand: PartieZustandVierer): PartieZustandVierer {
  const haende: [Karte[], Karte[], Karte[], Karte[]] = [
    [...zustand.haende[0]],
    [...zustand.haende[1]],
    [...zustand.haende[2]],
    [...zustand.haende[3]],
  ]
  const restdeck = [...zustand.restdeck]
  let position = zustand.austeilPosition
  while (restdeck.length > 0) {
    haende[position]!.push(restdeck.shift()!)
    position = naechsterSitz(position)
  }
  return { ...zustand, haende, restdeck, austeilPosition: position, phase: 'spritzen', spritzenPhase: starteSpritzenPhase(zustand) }
}

function starteSpritzenPhase(zustand: PartieZustandVierer): SpritzenPhase {
  const ansageTeam = zustand.aktiveAnsage ? zustand.aktiveAnsage.team : team(zustand.ansagePhase.vorhand)
  return { stufe: 0, amZug: gegnerTeam(ansageTeam) }
}

export function kannTrumpfBestimmen(zustand: PartieZustandVierer, spieler: SitzIndex): boolean {
  return zustand.phase === 'trumpfwahl' && zustand.ansageGewinner === spieler
}

export function trumpfWaehlen(
  zustand: PartieZustandVierer,
  spieler: SitzIndex,
  farbe: Farbe,
): Ergebnis<PartieZustandVierer> {
  if (!kannTrumpfBestimmen(zustand, spieler)) return fehler('Trumpfwahl gerade nicht möglich')
  return ok(verteileRest({ ...zustand, trumpf: farbe }))
}

/** Statt selbst zu wählen: die nächste eigene Karte wird für alle sichtbar aufgedeckt und bestimmt den Trumpf. */
export function trumpfAufdecken(zustand: PartieZustandVierer, spieler: SitzIndex): Ergebnis<PartieZustandVierer> {
  if (!kannTrumpfBestimmen(zustand, spieler)) return fehler('Trumpfwahl gerade nicht möglich')

  const haende: [Karte[], Karte[], Karte[], Karte[]] = [
    [...zustand.haende[0]],
    [...zustand.haende[1]],
    [...zustand.haende[2]],
    [...zustand.haende[3]],
  ]
  const restdeck = [...zustand.restdeck]
  let position = zustand.austeilPosition
  // Andere Spieler, die laut Austeil-Reihenfolge vorher dran wären, bekommen
  // ihre nächste Karte ganz normal verdeckt, bevor der Ansager seine aufdeckt.
  while (position !== spieler) {
    haende[position]!.push(restdeck.shift()!)
    position = naechsterSitz(position)
  }
  const aufgedeckt = restdeck.shift()!
  haende[spieler]!.push(aufgedeckt)
  position = naechsterSitz(position)

  return ok(
    verteileRest({
      ...zustand,
      haende,
      restdeck,
      austeilPosition: position,
      trumpf: aufgedeckt.farbe,
      aufgedeckteTrumpfkarte: aufgedeckt,
    }),
  )
}

export function kannSpritzen(zustand: PartieZustandVierer, spieler: SitzIndex): boolean {
  return zustand.phase === 'spritzen' && zustand.spritzenPhase.amZug === team(spieler)
}

export function spritzen(zustand: PartieZustandVierer, spieler: SitzIndex): Ergebnis<PartieZustandVierer> {
  if (!kannSpritzen(zustand, spieler)) return fehler('Spritzen gerade nicht möglich')
  const stufe = (zustand.spritzenPhase.stufe + 1) as 1 | 2
  const spritzenFaktor = (zustand.spritzenFaktor * 2) as 2 | 4
  if (stufe === 2) {
    return ok({ ...zustand, spritzenFaktor, spritzenPhase: { stufe, amZug: null }, phase: 'spielt' })
  }
  return ok({
    ...zustand,
    spritzenFaktor,
    spritzenPhase: { stufe, amZug: gegnerTeam(zustand.spritzenPhase.amZug!) },
  })
}

export function spritzenPassen(zustand: PartieZustandVierer, spieler: SitzIndex): Ergebnis<PartieZustandVierer> {
  if (!kannSpritzen(zustand, spieler)) return fehler('Spritzen gerade nicht möglich')
  return ok({ ...zustand, spritzenPhase: { ...zustand.spritzenPhase, amZug: null }, phase: 'spielt' })
}

function hatKarte(hand: Karte[], karte: Karte): boolean {
  return hand.some((k) => gleicheKarte(k, karte))
}

function entferneKarte(hand: Karte[], karte: Karte): Karte[] {
  const index = hand.findIndex((k) => gleicheKarte(k, karte))
  return index === -1 ? hand : [...hand.slice(0, index), ...hand.slice(index + 1)]
}

const istZehnerGang = (zustand: PartieZustandVierer): boolean => zustand.aktiveAnsage?.ansage === 'zehnerGang'

/** Vergleicht zwei Karten desselben Stichs: 'a' gewinnt gegen 'b' (oder umgekehrt). */
function vergleicheKarten(
  a: Karte,
  b: Karte,
  ansageFarbe: Farbe,
  trumpf: Farbe,
  zehnerGang: boolean,
): 'a' | 'b' {
  const aTrumpf = a.farbe === trumpf
  const bTrumpf = b.farbe === trumpf
  if (aTrumpf && bTrumpf) return staerke4(a.rang, zehnerGang) > staerke4(b.rang, zehnerGang) ? 'a' : 'b'
  if (aTrumpf) return 'a'
  if (bTrumpf) return 'b'
  const aPassend = a.farbe === ansageFarbe
  const bPassend = b.farbe === ansageFarbe
  if (aPassend && !bPassend) return 'a'
  if (bPassend && !aPassend) return 'b'
  if (!aPassend && !bPassend) return 'b' // beide bedienen nicht, keine von beiden kann gewinnen
  return staerke4(a.rang, zehnerGang) > staerke4(b.rang, zehnerGang) ? 'a' : 'b'
}

/** Wer führt gerade den (noch offenen oder bereits vollständigen) Stich an? */
function aktuellerFuehrer(stich: OffenerStichEintrag[], trumpf: Farbe, zehnerGang: boolean): OffenerStichEintrag {
  const ansageFarbe = stich[0]!.karte.farbe
  return stich.reduce((fuehrend, eintrag) =>
    vergleicheKarten(eintrag.karte, fuehrend.karte, ansageFarbe, trumpf, zehnerGang) === 'a' ? eintrag : fuehrend,
  )
}

/**
 * Karten, die `spieler` gerade legal spielen darf. Da es im Vierer keinen
 * Talon gibt, herrscht ab dem allerersten Stich Kartenzwang: höher bedienen
 * → tiefer bedienen → stechen → beliebig abwerfen – verglichen wird dabei
 * gegen die aktuell führende Karte des Stichs, nicht nur die Anspielkarte.
 */
export function legaleKarten4(zustand: PartieZustandVierer, spieler: SitzIndex): Karte[] {
  const hand = zustand.haende[spieler]
  const stich = zustand.offenerStich
  const trumpf = zustand.trumpf!
  const zehnerGang = istZehnerGang(zustand)

  if (stich.length === 0) {
    if (zustand.pflichtNachMeldung !== null) {
      const farbe = zustand.pflichtNachMeldung
      return hand.filter((k) => k.farbe === farbe && (k.rang === 'K' || k.rang === 'O'))
    }
    return hand
  }

  const ansageFarbe = stich[0]!.karte.farbe
  const fuehrend = aktuellerFuehrer(stich, trumpf, zehnerGang).karte
  const passend = hand.filter((k) => k.farbe === ansageFarbe)
  const hoeher = passend.filter((k) => vergleicheKarten(k, fuehrend, ansageFarbe, trumpf, zehnerGang) === 'a')
  if (hoeher.length > 0) return hoeher
  if (passend.length > 0) return passend

  const trumpfKarten = hand.filter((k) => k.farbe === trumpf)
  if (trumpfKarten.length > 0) return trumpfKarten

  return hand
}

function normalTarif(verliererAugen: number, verliererHatteStich: boolean): 1 | 2 | 3 {
  if (!verliererHatteStich) return 3
  if (verliererAugen <= 32) return 2
  return 1
}

function abschliessen(zustand: PartieZustandVierer, gewinnerTeam: TeamIndex, basisPunkte: number): PartieZustandVierer {
  return {
    ...zustand,
    phase: 'beendet',
    gewinnerTeam,
    spielpunkte: basisPunkte * zustand.spritzenFaktor,
    offenerStich: [],
  }
}

/** Prüft nach jedem Stich (und jeder Meldung), ob die Ansage erfüllt/verfehlt bzw. die normale Runde entschieden ist. */
function pruefeAnsageErgebnis(zustand: PartieZustandVierer): PartieZustandVierer {
  if (zustand.phase === 'beendet') return zustand
  const ansage = zustand.aktiveAnsage

  if (ansage === null) {
    for (const t of [0, 1] as const) {
      if (gesamtAugenTeam(zustand, t) < 66) continue
      const verlierer = gegnerTeam(t)
      const verliererHatteStich = zustand.stichAnzahlSpieler[verlierer] + zustand.stichAnzahlSpieler[(verlierer + 2) % 4] > 0
      return abschliessen(zustand, t, normalTarif(gesamtAugenTeam(zustand, verlierer), verliererHatteStich))
    }
    if (zustand.stichNummer === 5 && zustand.letzterStichGewinner !== null) {
      return abschliessen(zustand, team(zustand.letzterStichGewinner), 1)
    }
    return zustand
  }

  const { ansage: art, spieler: ansager, team: ansagerTeam } = ansage
  const basis = ANSAGE_PUNKTE[art]
  const gegner = gegnerTeam(ansagerTeam)

  if (art === 'schnapser') {
    if (gesamtAugenTeam(zustand, ansagerTeam) >= 66) return abschliessen(zustand, ansagerTeam, basis)
    if (zustand.stichNummer >= 3) return abschliessen(zustand, gegner, basis)
    return zustand
  }

  if (art === 'bauernschnapser') {
    const gegnerStiche = zustand.stichAnzahlSpieler[gegner] + zustand.stichAnzahlSpieler[(gegner + 2) % 4]
    if (gegnerStiche > 0) return abschliessen(zustand, gegner, basis)
    if (zustand.stichNummer === 5) return abschliessen(zustand, ansagerTeam, basis)
    return zustand
  }

  // gang / zehnerGang / bettler: rein personenbezogen auf den Ansager.
  const fremdeStiche = zustand.stichAnzahlSpieler.reduce(
    (summe, anzahl, sitz) => (sitz === ansager ? summe : summe + anzahl),
    0,
  )
  if (art === 'bettler') {
    if (zustand.stichAnzahlSpieler[ansager] > 0) return abschliessen(zustand, gegner, basis)
    if (zustand.stichNummer === 5) return abschliessen(zustand, ansagerTeam, basis)
    return zustand
  }
  // gang / zehnerGang
  if (fremdeStiche > 0) return abschliessen(zustand, gegner, basis)
  if (zustand.stichAnzahlSpieler[ansager] === 5) return abschliessen(zustand, ansagerTeam, basis)
  return zustand
}

export function spieleKarte4(
  zustand: PartieZustandVierer,
  spieler: SitzIndex,
  karte: Karte,
): Ergebnis<PartieZustandVierer> {
  if (zustand.phase !== 'spielt') return fehler('Partie ist gerade nicht in der Spielphase')
  if (zustand.amZug !== spieler) return fehler('nicht am Zug')
  if (!hatKarte(zustand.haende[spieler], karte)) return fehler('Karte nicht auf der Hand')

  const legal = legaleKarten4(zustand, spieler)
  if (!legal.some((k) => gleicheKarte(k, karte))) return fehler('Karte gerade nicht erlaubt')

  const haende: [Karte[], Karte[], Karte[], Karte[]] = [...zustand.haende]
  haende[spieler] = entferneKarte(haende[spieler], karte)
  const offenerStich = [...zustand.offenerStich, { karte, spieler }]

  if (offenerStich.length < 4) {
    return ok({
      ...zustand,
      haende,
      offenerStich,
      amZug: naechsterSitz(spieler),
      pflichtNachMeldung: null,
    })
  }

  const zehnerGang = istZehnerGang(zustand)
  const sieger = aktuellerFuehrer(offenerStich, zustand.trumpf!, zehnerGang).spieler
  const augen = offenerStich.reduce((summe, eintrag) => summe + punktwert(eintrag.karte.rang), 0)

  const stichAugenTeam: [number, number] = [...zustand.stichAugenTeam]
  stichAugenTeam[team(sieger)] += augen
  const stichAnzahlSpieler: [number, number, number, number] = [...zustand.stichAnzahlSpieler]
  stichAnzahlSpieler[sieger] += 1

  const naechster: PartieZustandVierer = {
    ...zustand,
    haende,
    stichAugenTeam,
    stichAnzahlSpieler,
    stichNummer: zustand.stichNummer + 1,
    offenerStich: [],
    letzterStichGewinner: sieger,
    amZug: sieger,
  }

  return ok(pruefeAnsageErgebnis(naechster))
}

export function kannMelden4(zustand: PartieZustandVierer, spieler: SitzIndex, farbe: Farbe): boolean {
  if (
    zustand.phase !== 'spielt' ||
    zustand.amZug !== spieler ||
    zustand.offenerStich.length !== 0 ||
    zustand.pflichtNachMeldung !== null ||
    zustand.gemeldet.has(`${spieler}-${farbe}`)
  ) {
    return false
  }
  const hand = zustand.haende[spieler]
  return hatKarte(hand, { farbe, rang: 'K' }) && hatKarte(hand, { farbe, rang: 'O' })
}

export function melden(zustand: PartieZustandVierer, spieler: SitzIndex, farbe: Farbe): Ergebnis<PartieZustandVierer> {
  if (!kannMelden4(zustand, spieler, farbe)) return fehler('Melden gerade nicht möglich')
  const punkte = farbe === zustand.trumpf ? 40 : 20
  const meldeAugenTeam: [number, number] = [...zustand.meldeAugenTeam]
  meldeAugenTeam[team(spieler)] += punkte
  const gemeldet = new Set(zustand.gemeldet)
  gemeldet.add(`${spieler}-${farbe}`)

  const ausgewertet = pruefeAnsageErgebnis({ ...zustand, meldeAugenTeam, gemeldet })
  if (ausgewertet.phase === 'beendet') return ok(ausgewertet)
  return ok({ ...ausgewertet, pflichtNachMeldung: farbe })
}

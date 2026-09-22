/**
 * Verwaltung der Online-Vierer-Tische (4 Spieler, 2 feste Teams). Rein
 * In-Memory, analog zu ../tisch.ts (2p) – siehe dort für die ausführlichere
 * Doku der grundsätzlichen Muster (Reconnect per Teilnehmer-Id, Timeouts,
 * öffentliche Sicht ohne fremde Handkarten).
 */
import { randomBytes } from 'node:crypto'
import type { Farbe, Karte } from './karten4.js'
import {
  ansagen,
  kannMelden4,
  kannSpritzen,
  kannTrumpfBestimmen,
  legaleKarten4,
  melden,
  moeglicheAnsagen,
  naechsterSitz,
  passen,
  spieleKarte4,
  spritzen,
  spritzenPassen,
  starteAusteilung,
  trumpfAufdecken,
  trumpfWaehlen,
  type Ansage,
  type Ergebnis,
  type PartieZustandVierer,
  type SitzIndex,
  type TeamIndex,
} from './spielRegelnVierer.js'

const TISCH_TIMEOUT_MS = 10 * 60 * 1000
const UNGENUTZTER_TISCH_TIMEOUT_MS = 2 * 60 * 1000

/** Vierer zählt traditionell von 24 herab (siehe DEFAULT_STARTWERT_VIERER im Client). */
const BUMMERL_STARTWERT = 24

export type Sender = (nachricht: unknown) => void
export type Teilnehmer = { id: string; name: string }
/** `beitrittsNummer` ist unabhängig vom Sitzplatz – bestimmt, wer bei Bedarf neuer Gastgeber wird. */
type Spielplatz = { teilnehmer: Teilnehmer; senden: Sender | null; beitrittsNummer: number }

export type TischVierer = {
  code: string
  spieler: [Spielplatz | null, Spielplatz | null, Spielplatz | null, Spielplatz | null]
  partie: PartieZustandVierer | null
  vorhand: SitzIndex
  bettlerErlaubt: boolean
  bummerlPunkte: [number, number]
  bummerl: [number, number]
  letzteAktivitaetAm: number
  naechsteBeitrittsNummer: number
}

const tische = new Map<string, TischVierer>()

function erzeugeCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  do {
    code = Array.from(randomBytes(5))
      .map((b) => alphabet[b % alphabet.length])
      .join('')
  } while (tische.has(code))
  return code
}

export function raeumeTischeVierAuf(jetzt: number = Date.now()): void {
  for (const [code, tisch] of tische) {
    const voll = tisch.spieler.every((platz) => platz !== null)
    const timeout = voll ? TISCH_TIMEOUT_MS : UNGENUTZTER_TISCH_TIMEOUT_MS
    if (jetzt - tisch.letzteAktivitaetAm > timeout) tische.delete(code)
  }
}

export function erstelleTischVierer(teilnehmer: Teilnehmer, senden: Sender, bettlerErlaubt: boolean): TischVierer {
  const code = erzeugeCode()
  const tisch: TischVierer = {
    code,
    spieler: [{ teilnehmer, senden, beitrittsNummer: 0 }, null, null, null],
    partie: null,
    vorhand: 0,
    bettlerErlaubt,
    bummerlPunkte: [BUMMERL_STARTWERT, BUMMERL_STARTWERT],
    bummerl: [0, 0],
    letzteAktivitaetAm: Date.now(),
    naechsteBeitrittsNummer: 1,
  }
  tische.set(code, tisch)
  return tisch
}

export type BeitrittErgebnisVierer =
  | { ok: true; tisch: TischVierer; meinIndex: SitzIndex }
  | { ok: false; fehler: string }

export function tritteBeiVierer(code: string, teilnehmer: Teilnehmer, senden: Sender): BeitrittErgebnisVierer {
  const tisch = tische.get(code.trim().toUpperCase())
  if (!tisch) return { ok: false, fehler: 'Tisch nicht gefunden' }

  tisch.letzteAktivitaetAm = Date.now()

  for (const index of [0, 1, 2, 3] as SitzIndex[]) {
    const platz = tisch.spieler[index]
    if (platz && platz.teilnehmer.id === teilnehmer.id) {
      platz.senden = senden
      return { ok: true, tisch, meinIndex: index }
    }
  }

  if (tisch.spieler.some((platz) => platz?.teilnehmer.id === teilnehmer.id)) {
    return { ok: false, fehler: 'Du kannst nicht gegen dich selbst spielen' }
  }

  const freierPlatz = tisch.spieler.findIndex((platz) => platz === null) as SitzIndex | -1
  if (freierPlatz === -1) return { ok: false, fehler: 'Tisch ist bereits voll' }

  tisch.spieler[freierPlatz] = { teilnehmer, senden, beitrittsNummer: tisch.naechsteBeitrittsNummer }
  tisch.naechsteBeitrittsNummer += 1
  return { ok: true, tisch, meinIndex: freierPlatz }
}

/** Ermittelt den aktuellen Sitzplatz eines Kontos – nötig, weil sich der Platz im Warteraum ändern kann. */
export function findeSitzVierer(tisch: TischVierer, teilnehmerId: string): SitzIndex | null {
  const index = tisch.spieler.findIndex((platz) => platz?.teilnehmer.id === teilnehmerId)
  return index === -1 ? null : (index as SitzIndex)
}

export function entferneVerbindungVierer(tisch: TischVierer, meinIndex: SitzIndex): void {
  const platz = tisch.spieler[meinIndex]
  if (platz) platz.senden = null
}

/**
 * Der Gastgeber ist nicht an einen Sitzplatz gebunden, sondern an die Person,
 * die am längsten dabei ist (kleinste Beitrittsnummer) und noch verbunden
 * ist. Geht der/die aktuelle Gastgeber:in offline, rückt automatisch die
 * nächste noch verbundene Person nach (z. B. wer als Zweites beigetreten
 * ist) – der Warteraum bleibt so nie hängen.
 */
function ermittleGastgeber(tisch: TischVierer): SitzIndex | null {
  let gastgeber: { index: SitzIndex; beitrittsNummer: number } | null = null
  for (const index of [0, 1, 2, 3] as SitzIndex[]) {
    const platz = tisch.spieler[index]
    if (!platz || platz.senden === null) continue
    if (gastgeber === null || platz.beitrittsNummer < gastgeber.beitrittsNummer) {
      gastgeber = { index, beitrittsNummer: platz.beitrittsNummer }
    }
  }
  return gastgeber?.index ?? null
}

/**
 * Warteraum vor dem eigentlichen Spiel: die 4 Beitretenden können sich frei
 * auf die 4 Plätze verteilen (Platz 1+3 = Team A, Platz 2+4 = Team B, siehe
 * spielRegelnVierer.ts → team()) – wie eine Team-Aufstellung, bevor der
 * Gastgeber das Spiel startet. Die Gastgeber-Rolle wandert mit der Person
 * mit (nicht mit dem Sitzplatz).
 */
export function wechsleSitzVierer(tisch: TischVierer, teilnehmerId: string, zielSitz: SitzIndex): string | null {
  if (tisch.partie) return 'Das Spiel läuft schon, der Sitzplatz kann nicht mehr gewechselt werden'
  const meinIndex = findeSitzVierer(tisch, teilnehmerId)
  if (meinIndex === null) return 'nicht an diesem Tisch'
  if (meinIndex === zielSitz) return null

  const mein = tisch.spieler[meinIndex]
  tisch.spieler[meinIndex] = tisch.spieler[zielSitz]
  tisch.spieler[zielSitz] = mein
  tisch.letzteAktivitaetAm = Date.now()
  return null
}

/** Nur der aktuelle Gastgeber (siehe ermittleGastgeber) darf aus dem Warteraum heraus starten. */
export function starteSpielVierer(tisch: TischVierer, teilnehmerId: string): string | null {
  if (tisch.partie) return 'Spiel läuft schon'
  const meinIndex = findeSitzVierer(tisch, teilnehmerId)
  if (meinIndex === null) return 'nicht an diesem Tisch'
  if (!tisch.spieler.every((platz) => platz !== null)) return 'Warte auf weitere Spieler'
  if (ermittleGastgeber(tisch) !== meinIndex) return 'Nur der Gastgeber kann das Spiel starten'

  tisch.partie = starteAusteilung(tisch.vorhand, tisch.bettlerErlaubt)
  tisch.letzteAktivitaetAm = Date.now()
  return null
}

/** Offene Tische für die Lobby-Liste: noch nicht volle Tische mit mindestens einer aktiven Verbindung. */
export function listeOffeneTischeVierer(): { id: string; plaetze: (string | null)[] }[] {
  return [...tische.values()]
    .filter((tisch) => tisch.spieler.some((platz) => platz !== null) && tisch.spieler[0]?.senden !== null)
    .filter((tisch) => !tisch.spieler.every((platz) => platz !== null))
    .map((tisch) => ({ id: tisch.code, plaetze: tisch.spieler.map((platz) => platz?.teilnehmer.name ?? null) }))
}

export type OeffentlicheSichtVierer = {
  meinIndex: SitzIndex
  spielerNamen: [string, string, string, string]
  meineHand: Karte[]
  kartenAnzahl: [number, number, number, number]
  phase: PartieZustandVierer['phase']
  amZug: SitzIndex
  offenerStich: { karte: Karte; spieler: SitzIndex }[]
  trumpf: Farbe | null
  aufgedeckteTrumpfkarte: Karte | null
  ansageAnDerReihe: SitzIndex
  ansageHoechste: { ansage: Ansage; spieler: SitzIndex } | null
  ansageGepasst: SitzIndex[]
  ansageGewinner: SitzIndex | null
  aktiveAnsage: { ansage: Ansage; spieler: SitzIndex; team: TeamIndex } | null
  spritzenStufe: 0 | 1 | 2
  spritzenAmZug: TeamIndex | null
  spritzenFaktor: 1 | 2 | 4
  moeglicheAnsagen: Ansage[]
  kannPassenAnsage: boolean
  kannTrumpfBestimmen: boolean
  kannSpritzen: boolean
  legaleKarten: Karte[] | null
  meldbareFarben: Farbe[]
  bettlerErlaubt: boolean
  bummerlPunkte: [number, number]
  bummerl: [number, number]
  gewinnerTeam: TeamIndex | null
  spielpunkte: number | null
}

const ALLE_FARBEN: Farbe[] = ['kreuz', 'pik', 'herz', 'karo']

export function oeffentlicheSichtVierer(tisch: TischVierer, meinIndex: SitzIndex): OeffentlicheSichtVierer | null {
  const partie = tisch.partie
  if (!partie) return null

  const namen = tisch.spieler.map((platz) => platz?.teilnehmer.name ?? '…') as [string, string, string, string]
  const amZugBinIch = partie.amZug === meinIndex

  return {
    meinIndex,
    spielerNamen: namen,
    meineHand: partie.haende[meinIndex],
    kartenAnzahl: partie.haende.map((hand) => hand.length) as [number, number, number, number],
    phase: partie.phase,
    amZug: partie.amZug,
    offenerStich: partie.offenerStich,
    trumpf: partie.trumpf,
    aufgedeckteTrumpfkarte: partie.aufgedeckteTrumpfkarte,
    ansageAnDerReihe: partie.ansagePhase.anDerReihe,
    ansageHoechste: partie.ansagePhase.hoechste,
    ansageGepasst: [...partie.ansagePhase.gepasst],
    ansageGewinner: partie.ansageGewinner,
    aktiveAnsage: partie.aktiveAnsage,
    spritzenStufe: partie.spritzenPhase.stufe,
    spritzenAmZug: partie.spritzenPhase.amZug,
    spritzenFaktor: partie.spritzenFaktor,
    moeglicheAnsagen: partie.phase === 'ansage' && partie.ansagePhase.anDerReihe === meinIndex ? moeglicheAnsagen(partie, meinIndex) : [],
    kannPassenAnsage: partie.phase === 'ansage' && partie.ansagePhase.anDerReihe === meinIndex,
    kannTrumpfBestimmen: kannTrumpfBestimmen(partie, meinIndex),
    kannSpritzen: kannSpritzen(partie, meinIndex),
    legaleKarten: amZugBinIch && partie.phase === 'spielt' ? legaleKarten4(partie, meinIndex) : null,
    meldbareFarben: ALLE_FARBEN.filter((farbe) => kannMelden4(partie, meinIndex, farbe)),
    bettlerErlaubt: tisch.bettlerErlaubt,
    bummerlPunkte: tisch.bummerlPunkte,
    bummerl: tisch.bummerl,
    gewinnerTeam: partie.gewinnerTeam,
    spielpunkte: partie.spielpunkte,
  }
}

export function sendeZustandAnAlleVierer(tisch: TischVierer): void {
  for (const index of [0, 1, 2, 3] as SitzIndex[]) {
    const platz = tisch.spieler[index]
    const sicht = oeffentlicheSichtVierer(tisch, index)
    if (platz?.senden && sicht) platz.senden({ typ: 'zustand4', sicht })
  }
}

export type WarteraumSichtVierer = {
  meinIndex: SitzIndex
  plaetze: (string | null)[]
  /** Wandert automatisch weiter, falls der/die aktuelle Gastgeber:in offline geht (siehe ermittleGastgeber). */
  binGastgeber: boolean
  kannStarten: boolean
}

function warteraumSichtVierer(tisch: TischVierer, meinIndex: SitzIndex): WarteraumSichtVierer {
  const binGastgeber = ermittleGastgeber(tisch) === meinIndex
  return {
    meinIndex,
    plaetze: tisch.spieler.map((platz) => platz?.teilnehmer.name ?? null),
    binGastgeber,
    kannStarten: binGastgeber && tisch.spieler.every((platz) => platz !== null),
  }
}

/** Solange die Partie noch nicht gestartet ist, sehen alle den Warteraum statt einer Spiel-Sicht. */
export function sendeAktuellenZustandAnAlleVierer(tisch: TischVierer): void {
  if (tisch.partie) {
    sendeZustandAnAlleVierer(tisch)
    return
  }
  for (const index of [0, 1, 2, 3] as SitzIndex[]) {
    const platz = tisch.spieler[index]
    if (platz?.senden) platz.senden({ typ: 'warteraum4', sicht: warteraumSichtVierer(tisch, index) })
  }
}

function sendeAllen(tisch: TischVierer, nachricht: unknown): void {
  for (const platz of tisch.spieler) platz?.senden?.(nachricht)
}

/**
 * Startet nach Ende einer Partie automatisch die nächste (Vorhand rotiert um
 * einen Sitzplatz). Die Spielpunkte werden vom Bummerl-Zähler des
 * Gewinner-Teams abgezogen – genau wie beim Zweier bzw. dem lokalen Zähler.
 */
function starteNaechstePartieFallsBeendet(tisch: TischVierer): void {
  const partie = tisch.partie
  if (!partie || partie.phase !== 'beendet') return

  const gewinnerTeam = partie.gewinnerTeam!
  const spielpunkte = partie.spielpunkte!
  sendeAllen(tisch, { typ: 'partie4_beendet', gewinnerTeam, spielpunkte })

  const bummerlPunkte: [number, number] = [...tisch.bummerlPunkte]
  bummerlPunkte[gewinnerTeam] = Math.max(0, bummerlPunkte[gewinnerTeam] - spielpunkte)

  if (bummerlPunkte[gewinnerTeam] === 0) {
    const bummerl: [number, number] = [...tisch.bummerl]
    bummerl[gewinnerTeam] += 1
    tisch.bummerl = bummerl
    tisch.bummerlPunkte = [BUMMERL_STARTWERT, BUMMERL_STARTWERT]
    sendeAllen(tisch, { typ: 'bummerl4_gewonnen', gewinnerTeam, bummerl })
  } else {
    tisch.bummerlPunkte = bummerlPunkte
  }

  tisch.vorhand = naechsterSitz(tisch.vorhand)
  tisch.partie = starteAusteilung(tisch.vorhand, tisch.bettlerErlaubt)
}

type Anwender = (partie: PartieZustandVierer, spieler: SitzIndex) => Ergebnis<PartieZustandVierer>

function fuehreZugAus(tisch: TischVierer, spieler: SitzIndex, anwender: Anwender): string | null {
  if (!tisch.partie) return 'Partie läuft nicht'
  if (!tisch.spieler.every((platz) => platz !== null)) return 'Warte auf weitere Spieler'

  const ergebnis = anwender(tisch.partie, spieler)
  if (!ergebnis.ok) return ergebnis.fehler

  tisch.partie = ergebnis.wert
  tisch.letzteAktivitaetAm = Date.now()
  starteNaechstePartieFallsBeendet(tisch)
  sendeZustandAnAlleVierer(tisch)
  return null
}

export function ziehAnsagen(tisch: TischVierer, spieler: SitzIndex, ansage: Ansage): string | null {
  return fuehreZugAus(tisch, spieler, (partie, s) => ansagen(partie, s, ansage))
}

export function ziehPassen(tisch: TischVierer, spieler: SitzIndex): string | null {
  return fuehreZugAus(tisch, spieler, passen)
}

export function ziehTrumpfWaehlen(tisch: TischVierer, spieler: SitzIndex, farbe: Farbe): string | null {
  return fuehreZugAus(tisch, spieler, (partie, s) => trumpfWaehlen(partie, s, farbe))
}

export function ziehTrumpfAufdecken(tisch: TischVierer, spieler: SitzIndex): string | null {
  return fuehreZugAus(tisch, spieler, trumpfAufdecken)
}

export function ziehSpritzen(tisch: TischVierer, spieler: SitzIndex): string | null {
  return fuehreZugAus(tisch, spieler, spritzen)
}

export function ziehSpritzenPassen(tisch: TischVierer, spieler: SitzIndex): string | null {
  return fuehreZugAus(tisch, spieler, spritzenPassen)
}

export function ziehKarteAusVierer(tisch: TischVierer, spieler: SitzIndex, karte: Karte): string | null {
  return fuehreZugAus(tisch, spieler, (partie, s) => spieleKarte4(partie, s, karte))
}

export function ziehMeldenVierer(tisch: TischVierer, spieler: SitzIndex, farbe: Farbe): string | null {
  return fuehreZugAus(tisch, spieler, (partie, s) => melden(partie, s, farbe))
}

/** Nur für Tests: Zustand zurücksetzen. */
export function _leereAlleTischeVierFuerTests(): void {
  tische.clear()
}

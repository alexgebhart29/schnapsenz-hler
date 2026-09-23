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
  /** Wer den Tisch eröffnet hat – unabhängig vom Sitzplatz (bei fortgesetzten Spielen nicht zwingend Platz 1). */
  erstellerId: string
  /**
   * Beim Fortsetzen eines bestehenden analogen Spiels: die 4 Namen, die
   * exakt auf die Plätze 1–4 gehören (Platz 1+3 = Team A, Platz 2+4 = Team
   * B). Ist das gesetzt, wird der Sitzplatz beim Beitreten strikt nach Namen
   * vergeben (kein freies Wählen/Tauschen mehr) – sonst würde der bereits
   * bestehende Punktestand der falschen Seite gutgeschrieben.
   */
  erwarteteNamen: [string, string, string, string] | null
}

/** Übernommener Stand beim Fortsetzen eines bestehenden analogen Vierer-Spiels. */
export type TischStartVierer = {
  erwarteteNamen: [string, string, string, string]
  bummerlPunkte: [number, number]
  bummerl: [number, number]
}

const clampBummerlPunkt = (wert: number): number =>
  Number.isFinite(wert) ? Math.min(40, Math.max(0, Math.round(wert))) : BUMMERL_STARTWERT
const clampBummerlAnzahl = (wert: number): number =>
  Number.isFinite(wert) ? Math.min(999, Math.max(0, Math.round(wert))) : 0

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

/** Wie viele Vierer-Tische ein Konto gerade selbst eröffnet hat – siehe zaehleTischeVonTeilnehmer (2p-Pendant). */
export function zaehleTischeVierVonTeilnehmer(teilnehmerId: string): number {
  return [...tische.values()].filter((tisch) => tisch.erstellerId === teilnehmerId).length
}

/**
 * `start.erwarteteNamen` erlaubt, ein bereits laufendes analoges (manuell
 * gezähltes) Vierer-Spiel online fortzusetzen: der Tisch startet dann nicht
 * bei 24:24/0:0, sondern mit dem übergebenen Stand, und die Plätze werden
 * strikt nach den vier hinterlegten Namen vergeben statt frei wählbar zu
 * sein. Die eröffnende Person landet auf dem Platz, der zu ihrem eigenen
 * Namen gehört – nicht zwingend Platz 1.
 */
export function erstelleTischVierer(
  teilnehmer: Teilnehmer,
  senden: Sender,
  bettlerErlaubt: boolean,
  start?: TischStartVierer,
): TischVierer {
  const code = erzeugeCode()
  const spieler: TischVierer['spieler'] = [null, null, null, null]
  const gefundenerSitz = start ? start.erwarteteNamen.indexOf(teilnehmer.name) : 0
  const eigenerSitz = (gefundenerSitz === -1 ? 0 : gefundenerSitz) as SitzIndex
  spieler[eigenerSitz] = { teilnehmer, senden, beitrittsNummer: 0 }

  const tisch: TischVierer = {
    code,
    spieler,
    partie: null,
    vorhand: 0,
    bettlerErlaubt,
    bummerlPunkte: start
      ? [clampBummerlPunkt(start.bummerlPunkte[0]), clampBummerlPunkt(start.bummerlPunkte[1])]
      : [BUMMERL_STARTWERT, BUMMERL_STARTWERT],
    bummerl: start
      ? [clampBummerlAnzahl(start.bummerl[0]), clampBummerlAnzahl(start.bummerl[1])]
      : [0, 0],
    letzteAktivitaetAm: Date.now(),
    naechsteBeitrittsNummer: 1,
    erstellerId: teilnehmer.id,
    erwarteteNamen: start?.erwarteteNamen ?? null,
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

  if (tisch.erwarteteNamen) {
    const zielPlatz = tisch.erwarteteNamen.findIndex(
      (name, index) => name === teilnehmer.name && tisch.spieler[index] === null,
    ) as SitzIndex | -1
    if (zielPlatz === -1) {
      const gehoertDazu = tisch.erwarteteNamen.includes(teilnehmer.name)
      return {
        ok: false,
        fehler: gehoertDazu
          ? 'Dieser Platz ist schon besetzt'
          : `Dieser Tisch ist nur für ${tisch.erwarteteNamen.join(', ')} vorgesehen`,
      }
    }
    tisch.spieler[zielPlatz] = { teilnehmer, senden, beitrittsNummer: tisch.naechsteBeitrittsNummer }
    tisch.naechsteBeitrittsNummer += 1
    return { ok: true, tisch, meinIndex: zielPlatz }
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
  if (tisch.erwarteteNamen) return 'Die Plätze sind für dieses fortgesetzte Spiel fest vergeben'
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

/**
 * Offene Tische für die Lobby-Liste: noch nicht volle Tische, deren
 * Ersteller:in noch verbunden ist. Ist `anfragenderName` angegeben, werden
 * Tische mit fest zugeteilten Plätzen (fortgesetzte Spiele) ausgeblendet,
 * wenn der anfragende Name gar nicht zu den vier vorgesehenen gehört – sonst
 * würde man einem Tisch angezeigt bekommen, dem man ohnehin nicht beitreten kann.
 */
export function listeOffeneTischeVierer(anfragenderName?: string): { id: string; plaetze: (string | null)[] }[] {
  return [...tische.values()]
    .filter((tisch) => tisch.spieler.some((platz) => platz !== null))
    .filter((tisch) => tisch.spieler.some((platz) => platz?.teilnehmer.id === tisch.erstellerId && platz.senden !== null))
    .filter((tisch) => !tisch.spieler.every((platz) => platz !== null))
    .filter((tisch) => !tisch.erwarteteNamen || !anfragenderName || tisch.erwarteteNamen.includes(anfragenderName))
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
  /** true bei einem fortgesetzten Spiel (analog oder online begonnen) – siehe erwarteteNamen. */
  istFortsetzung: boolean
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
    istFortsetzung: tisch.erwarteteNamen !== null,
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
  /** Gesetzt bei einem fortgesetzten Spiel: Plätze sind fest vergeben, kein Tauschen möglich. */
  erwarteteNamen: [string, string, string, string] | null
}

function warteraumSichtVierer(tisch: TischVierer, meinIndex: SitzIndex): WarteraumSichtVierer {
  const binGastgeber = ermittleGastgeber(tisch) === meinIndex
  return {
    meinIndex,
    plaetze: tisch.spieler.map((platz) => platz?.teilnehmer.name ?? null),
    binGastgeber,
    kannStarten: binGastgeber && tisch.spieler.every((platz) => platz !== null),
    erwarteteNamen: tisch.erwarteteNamen,
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

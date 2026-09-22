/**
 * Verwaltung der Online-Tische (2 Spieler). Rein In-Memory – ein Tisch ist
 * ein flüchtiger, laufender Zustand, kein Datenbank-Datensatz. Nur das
 * Ergebnis jeder Partie wird den Clients mitgeteilt, damit sie es über die
 * bestehende Bummerl-/Rangliste-Logik (clientseitig) selbst verbuchen.
 */
import { randomBytes } from 'node:crypto'
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
  starteNeuePartie,
  zudrehen,
  type Ergebnis,
  type PartieZustand,
  type SpielerIndex,
  type StichEintrag,
} from './spielRegeln.js'
import type { Farbe, Karte } from './karten.js'

/** Nach dieser Zeit ohne Verbindung eines Spielers wird der Tisch verworfen. */
const TISCH_TIMEOUT_MS = 10 * 60 * 1000

/**
 * Tische, die noch nie einen zweiten Spieler hatten, räumen deutlich
 * schneller auf – sonst sammeln sich in der öffentlichen Liste offener
 * Tische Karteileichen von abgebrochenen Versuchen an, die zu Verwechslungen
 * führen können (jemand tritt versehentlich einem alten statt dem gerade
 * gemeinten Tisch bei).
 */
const UNGENUTZTER_TISCH_TIMEOUT_MS = 2 * 60 * 1000

/**
 * Startwert des Bummerl-Zählers je Tisch (wie im lokalen Zähler, dort
 * Standard 7 im Zweier): "Wer zuerst 7 Spielpunkte erreicht hat gewonnen."
 * Über mehrere Partien hinweg werden die Spielpunkte jeder gewonnenen Partie
 * vom eigenen Zähler abgezogen; bei 0 ist das Bummerl entschieden.
 */
const BUMMERL_STARTWERT = 7

export type Sender = (nachricht: unknown) => void

/**
 * Ein Teilnehmer ist immer ein angemeldeter Benutzer: `id` dient dem
 * Reconnect, `name` (der Benutzername) der Anzeige und der Zählung – so
 * werden Ergebnisse stets demselben Konto zugeordnet.
 */
export type Teilnehmer = { id: string; name: string }

type Spielplatz = { teilnehmer: Teilnehmer; senden: Sender | null }

export type Tisch = {
  code: string
  spieler: [Spielplatz, Spielplatz | null]
  partie: PartieZustand | null
  /** Wer im nächsten Blatt Geber ist (der Nicht-Geber beginnt). */
  naechsterGeber: SpielerIndex
  /** Countdown-Zähler übers ganze Bummerl hinweg, wie beim lokalen Zähler. */
  bummerlPunkte: [number, number]
  /** Gewonnene Bummerl je Spieler (mehrere Partien pro Bummerl). */
  bummerl: [number, number]
  letzteAktivitaetAm: number
}

const tische = new Map<string, Tisch>()

function erzeugeCode(): string {
  // 5 Zeichen aus einem eindeutigen Alphabet ohne verwechselbare Zeichen (0/O, 1/I).
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  do {
    code = Array.from(randomBytes(5))
      .map((b) => alphabet[b % alphabet.length])
      .join('')
  } while (tische.has(code))
  return code
}

export function raeumeTischeAuf(jetzt: number = Date.now()): void {
  for (const [code, tisch] of tische) {
    const timeout = tisch.spieler[1] ? TISCH_TIMEOUT_MS : UNGENUTZTER_TISCH_TIMEOUT_MS
    if (jetzt - tisch.letzteAktivitaetAm > timeout) tische.delete(code)
  }
}

/**
 * Wie viele Tische ein Konto gerade selbst eröffnet hat – begrenzt, damit ein
 * einzelnes (kompromittiertes) Konto nicht beliebig viele Tische anlegen und
 * so den Server mit In-Memory-Zustand fluten kann.
 */
export function zaehleTischeVonTeilnehmer(teilnehmerId: string): number {
  return [...tische.values()].filter((tisch) => tisch.spieler[0]?.teilnehmer.id === teilnehmerId).length
}

/** Grenzen für einen übernommenen Bummerl-Stand – schützt vor kaputten/böswilligen Payloads. */
const clampBummerlPunkt = (wert: number): number =>
  Number.isFinite(wert) ? Math.min(40, Math.max(0, Math.round(wert))) : BUMMERL_STARTWERT
const clampBummerlAnzahl = (wert: number): number =>
  Number.isFinite(wert) ? Math.min(999, Math.max(0, Math.round(wert))) : 0

export type TischStart = { bummerlPunkte: [number, number]; bummerl: [number, number] }

/**
 * `start` erlaubt, ein bereits laufendes analoges (manuell gezähltes) Spiel
 * online fortzusetzen: der Tisch beginnt dann nicht bei 7:7/0:0, sondern mit
 * dem übergebenen Stand (siehe onlineAktionen.tischErstellenAusSpiel im Client).
 */
export function erstelleTisch(teilnehmer: Teilnehmer, senden: Sender, start?: TischStart): Tisch {
  const code = erzeugeCode()
  const tisch: Tisch = {
    code,
    spieler: [{ teilnehmer, senden }, null],
    partie: null,
    naechsterGeber: 0,
    bummerlPunkte: start
      ? [clampBummerlPunkt(start.bummerlPunkte[0]), clampBummerlPunkt(start.bummerlPunkte[1])]
      : [BUMMERL_STARTWERT, BUMMERL_STARTWERT],
    bummerl: start
      ? [clampBummerlAnzahl(start.bummerl[0]), clampBummerlAnzahl(start.bummerl[1])]
      : [0, 0],
    letzteAktivitaetAm: Date.now(),
  }
  tische.set(code, tisch)
  return tisch
}

export type BeitrittErgebnis =
  | { ok: true; tisch: Tisch; meinIndex: SpielerIndex }
  | { ok: false; fehler: string }

export function tritteBei(code: string, teilnehmer: Teilnehmer, senden: Sender): BeitrittErgebnis {
  const tisch = tische.get(code.trim().toUpperCase())
  if (!tisch) return { ok: false, fehler: 'Tisch nicht gefunden' }

  tisch.letzteAktivitaetAm = Date.now()

  // Bereits am Tisch (Reconnect nach Verbindungsabbruch)?
  for (const index of [0, 1] as const) {
    const platz = tisch.spieler[index]
    if (platz && platz.teilnehmer.id === teilnehmer.id) {
      platz.senden = senden
      return { ok: true, tisch, meinIndex: index }
    }
  }

  if (tisch.spieler[1]) return { ok: false, fehler: 'Tisch ist bereits voll' }
  if (tisch.spieler[0]!.teilnehmer.id === teilnehmer.id) {
    return { ok: false, fehler: 'Du kannst nicht gegen dich selbst spielen' }
  }

  tisch.spieler[1] = { teilnehmer, senden }
  // Der Beitretende beginnt die erste Partie (Nicht-Geber spielt aus).
  tisch.naechsterGeber = 0
  tisch.partie = starteNeuePartie(1)
  return { ok: true, tisch, meinIndex: 1 }
}

export function findeTisch(code: string): Tisch | undefined {
  return tische.get(code.trim().toUpperCase())
}

/**
 * Alle Tische, die noch auf einen zweiten Spieler warten – für die
 * öffentliche Lobby-Liste. Tische, deren Ersteller die Verbindung bereits
 * verloren hat, werden ausgeblendet – sonst könnte man einer toten
 * Verbindung beitreten und selbst nie ins Spiel kommen.
 */
export function listeOffeneTische(): { id: string; ersteller: string }[] {
  return [...tische.values()]
    .filter((tisch) => !tisch.spieler[1] && tisch.spieler[0]!.senden !== null)
    .map((tisch) => ({ id: tisch.code, ersteller: tisch.spieler[0]!.teilnehmer.name }))
}

export function entferneVerbindung(tisch: Tisch, meinIndex: SpielerIndex): void {
  const platz = tisch.spieler[meinIndex]
  if (platz) platz.senden = null
}

/** Öffentliche, auf `meinIndex` zugeschnittene Sicht einer laufenden Partie (keine fremden Handkarten). */
export type OeffentlicheSicht = {
  meinIndex: SpielerIndex
  spielerNamen: [string, string]
  meineHand: Karte[]
  gegnerAnzahlKarten: number
  talonAnzahl: number
  trumpf: Farbe
  /** Nur sichtbar, solange sie nicht aufgenommen wurde. */
  trumpfKarte: Karte | null
  amZug: SpielerIndex
  offenerStich: { karte: Karte; spieler: SpielerIndex } | null
  geschlossenVon: SpielerIndex | null
  /** Nur die eigenen Augen – die des Gegners bleiben absichtlich verborgen. */
  meineAugen: number
  anzahlStiche: [number, number]
  legaleKarten: Karte[] | null
  kannZudrehen: boolean
  kannBubeTauschen: boolean
  meldbareFarben: Farbe[]
  status: 'laufend' | 'beendet'
  /** Bummerl-Zähler über den ganzen Tisch hinweg (mehrere Partien pro Bummerl). */
  bummerlPunkte: [number, number]
  bummerl: [number, number]
  /** Erster Stich, den der Gegner gewonnen hat – nicht zwingend der allererste Stich der Partie. */
  ersterStichGegner: [Karte, Karte] | null
  /** Erster Stich, den ich selbst gewonnen habe. */
  ersterStichEigener: [Karte, Karte] | null
  /**
   * Für "Alle Stiche anzeigen": alle eigenen Stiche vollständig, vom Gegner
   * aber nur der erste – siehe `sichtbareStiche`. `nummer` ist die Position
   * in der tatsächlichen Reihenfolge der Partie (nicht lückenlos).
   */
  stichVerlauf: (StichEintrag & { nummer: number })[]
}

const ALLE_FARBEN: Farbe[] = ['kreuz', 'pik', 'herz', 'karo']

/** Eigene Stiche vollständig, vom Gegner nur der erste – der Rest bleibt verborgen. */
function sichtbareStiche(
  verlauf: StichEintrag[],
  meinIndex: SpielerIndex,
): (StichEintrag & { nummer: number })[] {
  const gegnerIndex = gegner(meinIndex)
  let ersterGegnerStichGesehen = false

  const ergebnis: (StichEintrag & { nummer: number })[] = []
  verlauf.forEach((eintrag, index) => {
    if (eintrag.sieger === meinIndex) {
      ergebnis.push({ ...eintrag, nummer: index + 1 })
    } else if (eintrag.sieger === gegnerIndex && !ersterGegnerStichGesehen) {
      ersterGegnerStichGesehen = true
      ergebnis.push({ ...eintrag, nummer: index + 1 })
    }
  })
  return ergebnis
}

export function oeffentlicheSicht(tisch: Tisch, meinIndex: SpielerIndex): OeffentlicheSicht | null {
  const partie = tisch.partie
  if (!partie) return null
  const gegnerIndex = gegner(meinIndex)

  return {
    meinIndex,
    spielerNamen: [tisch.spieler[0]!.teilnehmer.name, tisch.spieler[1]?.teilnehmer.name ?? '…'],
    meineHand: partie.haende[meinIndex],
    gegnerAnzahlKarten: partie.haende[gegnerIndex].length,
    talonAnzahl: partie.talon.length + (partie.trumpfGenommen ? 0 : 1),
    trumpf: partie.trumpf,
    trumpfKarte: partie.trumpfGenommen ? null : partie.trumpfKarte,
    amZug: partie.amZug,
    offenerStich: partie.offenerStich,
    geschlossenVon: partie.geschlossenVon,
    meineAugen: gesamtAugen(partie, meinIndex),
    anzahlStiche: partie.anzahlStiche,
    legaleKarten: partie.amZug === meinIndex ? legaleKarten(partie, meinIndex) : null,
    kannZudrehen: kannZudrehen(partie, meinIndex),
    kannBubeTauschen: kannBubeTauschen(partie, meinIndex),
    meldbareFarben: ALLE_FARBEN.filter((farbe) => kannMelden(partie, meinIndex, farbe)),
    status: partie.status,
    bummerlPunkte: tisch.bummerlPunkte,
    bummerl: tisch.bummerl,
    ersterStichGegner: partie.stichVerlauf.find((eintrag) => eintrag.sieger === gegnerIndex)?.karten ?? null,
    ersterStichEigener: partie.stichVerlauf.find((eintrag) => eintrag.sieger === meinIndex)?.karten ?? null,
    stichVerlauf: sichtbareStiche(partie.stichVerlauf, meinIndex),
  }
}

/** Sendet jedem verbundenen Spieler seine eigene Sicht auf den Tisch. */
export function sendeZustandAnAlle(tisch: Tisch): void {
  for (const index of [0, 1] as const) {
    const platz = tisch.spieler[index]
    const sicht = oeffentlicheSicht(tisch, index)
    if (platz?.senden && sicht) platz.senden({ typ: 'zustand', sicht })
  }
}

function sendeAllen(tisch: Tisch, nachricht: unknown): void {
  for (const platz of tisch.spieler) platz?.senden?.(nachricht)
}

/**
 * Startet nach Ende einer Partie automatisch die nächste (Geber wechselt).
 * Die Spielpunkte der beendeten Partie werden vom Bummerl-Zähler des
 * Gewinners abgezogen – genau wie beim lokalen Zähler. Erreicht er 0, ist
 * das Bummerl entschieden und der Zähler startet für beide wieder bei
 * BUMMERL_STARTWERT.
 */
function starteNaechstePartieFallsBeendet(tisch: Tisch): void {
  const partie = tisch.partie
  if (!partie || partie.status !== 'beendet') return

  const gewinner = partie.gewinner!
  const spielpunkte = partie.spielpunkte!
  sendeAllen(tisch, { typ: 'partie_beendet', gewinner, spielpunkte })

  const bummerlPunkte: [number, number] = [...tisch.bummerlPunkte]
  bummerlPunkte[gewinner] = Math.max(0, bummerlPunkte[gewinner] - spielpunkte)

  if (bummerlPunkte[gewinner] === 0) {
    const bummerl: [number, number] = [...tisch.bummerl]
    bummerl[gewinner] += 1
    tisch.bummerl = bummerl
    tisch.bummerlPunkte = [BUMMERL_STARTWERT, BUMMERL_STARTWERT]
    sendeAllen(tisch, { typ: 'bummerl_gewonnen', gewinner, bummerl })
  } else {
    tisch.bummerlPunkte = bummerlPunkte
  }

  tisch.naechsterGeber = gegner(tisch.naechsterGeber)
  tisch.partie = starteNeuePartie(gegner(tisch.naechsterGeber))
}

type Anwender = (partie: PartieZustand, spieler: SpielerIndex) => Ergebnis<PartieZustand>

/** Gemeinsame Klammer für alle Spielzüge: anwenden, Zustand ersetzen, ggf. nächste Partie starten. */
function fuehreZugAus(tisch: Tisch, spieler: SpielerIndex, anwender: Anwender): string | null {
  if (!tisch.partie) return 'Partie läuft nicht'
  if (!tisch.spieler[1]) return 'Warte auf zweiten Spieler'

  const ergebnis = anwender(tisch.partie, spieler)
  if (!ergebnis.ok) return ergebnis.fehler

  tisch.partie = ergebnis.wert
  tisch.letzteAktivitaetAm = Date.now()
  starteNaechstePartieFallsBeendet(tisch)
  sendeZustandAnAlle(tisch)
  return null
}

export function ziehKarteAus(tisch: Tisch, spieler: SpielerIndex, karte: Karte): string | null {
  return fuehreZugAus(tisch, spieler, (partie, s) => spieleKarte(partie, s, karte))
}

export function ziehZudrehen(tisch: Tisch, spieler: SpielerIndex): string | null {
  return fuehreZugAus(tisch, spieler, zudrehen)
}

export function ziehBubeTauschen(tisch: Tisch, spieler: SpielerIndex): string | null {
  return fuehreZugAus(tisch, spieler, bubeTauschen)
}

export function ziehMelden(tisch: Tisch, spieler: SpielerIndex, farbe: Farbe): string | null {
  return fuehreZugAus(tisch, spieler, (partie, s) => melden(partie, s, farbe))
}


/** Nur für Tests: Zustand zurücksetzen. */
export function _leereAlleTischeFuerTests(): void {
  tische.clear()
}

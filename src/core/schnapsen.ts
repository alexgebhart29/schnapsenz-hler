import type { BummerlEintrag, Modus, Spiel, SpielerIndex, UndoEintrag } from './types'

export const DEFAULT_STARTWERT = 7
/** Vierer-Schnapsen (2 gegen 2) zählt traditionell von 24 herab statt von 7. */
export const DEFAULT_STARTWERT_VIERER = 24
export const MIN_STARTWERT = 5
export const MAX_STARTWERT = 40

export function defaultStartwertFuerModus(modus: Modus): number {
  return modus === 'vierer' ? DEFAULT_STARTWERT_VIERER : DEFAULT_STARTWERT
}

/** Wie viele Schritte rückgängig gemacht werden können. */
export const MAX_UNDO = 50

/**
 * Punktewerte einer gewonnenen Partie nach Schnapsen-Regeln. Der Gewinner zieht
 * sich den Wert vom eigenen Countdown-Zähler ab.
 */
export const ABZUG_OPTIONEN: { punkte: number; beschreibung: string }[] = [
  { punkte: 1, beschreibung: 'Gegner hat 33 Augen oder mehr' },
  { punkte: 2, beschreibung: 'Gegner hat 1 bis 32 Augen' },
  { punkte: 3, beschreibung: 'Gegner hat keinen Stich (schwarz)' },
]

export function normalizeStartwert(wert: number): number {
  if (!Number.isFinite(wert)) return DEFAULT_STARTWERT
  const gerundet = Math.round(wert)
  return Math.min(MAX_STARTWERT, Math.max(MIN_STARTWERT, gerundet))
}

export function gegner(spieler: SpielerIndex): SpielerIndex {
  return spieler === 0 ? 1 : 0
}

export function createSpiel(options: {
  id: string
  spieler: [string, string]
  /** Nur im Vierer-Schnapsen: die Partner der beiden Parteien. */
  partner?: [string, string]
  modus?: Modus
  startwert?: number
  datum?: string
  geaendertAm?: number
}): Spiel {
  const modus: Modus = options.modus ?? (options.partner ? 'vierer' : 'zweier')
  const startwert = normalizeStartwert(options.startwert ?? defaultStartwertFuerModus(modus))

  const spiel: Spiel = {
    id: options.id,
    datum: options.datum ?? new Date().toISOString(),
    modus,
    spieler: [options.spieler[0], options.spieler[1]],
    startwert,
    bummerl: [0, 0],
    punkte: [startwert, startwert],
    status: 'laufend',
    bummerlLog: [],
    undoStack: [],
    geaendertAm: options.geaendertAm ?? Date.now(),
  }
  if (modus === 'vierer' && options.partner) {
    spiel.partner = [options.partner[0], options.partner[1]]
  }
  return spiel
}

/** Anzeigename einer Partei: im Vierer „Anna & Bert“, sonst der Spielername. */
export function parteiName(spiel: Spiel, partei: SpielerIndex): string {
  const erster = spiel.spieler[partei]
  const zweiter = spiel.partner?.[partei]
  return spiel.modus === 'vierer' && zweiter ? `${erster} & ${zweiter}` : erster
}

/** Alle beteiligten Spielernamen – zwei im Zweier, vier im Vierer. */
export function alleSpieler(spiel: Spiel): string[] {
  if (spiel.modus !== 'vierer' || !spiel.partner) return [...spiel.spieler]
  return [spiel.spieler[0], spiel.partner[0], spiel.spieler[1], spiel.partner[1]]
}

/** Die Namen einer Partei, im Vierer also beide Teammitglieder. */
export function parteiSpieler(spiel: Spiel, partei: SpielerIndex): string[] {
  const zweiter = spiel.partner?.[partei]
  return spiel.modus === 'vierer' && zweiter ? [spiel.spieler[partei], zweiter] : [spiel.spieler[partei]]
}

export const MODUS_LABEL: Record<Modus, string> = {
  zweier: 'Zweier',
  vierer: 'Vierer',
}

/**
 * Gibt den Spieler zurück, der das laufende Bummerl gewonnen hat (Zähler bei 0),
 * solange es noch nicht abgeschlossen ist – sonst null.
 */
export function entschieden(spiel: Spiel): SpielerIndex | null {
  if (spiel.status === 'beendet') return null
  if (spiel.punkte[0] <= 0) return 0
  if (spiel.punkte[1] <= 0) return 1
  return null
}

export function kannAbziehen(spiel: Spiel): boolean {
  return spiel.status === 'laufend' && entschieden(spiel) === null
}

export function kannUndo(spiel: Spiel): boolean {
  return spiel.undoStack.length > 0
}

export function letzterUndoLabel(spiel: Spiel): string | null {
  return spiel.undoStack.at(-1)?.label ?? null
}

function snapshot(spiel: Spiel, label: string): UndoEintrag {
  const eintrag: UndoEintrag = {
    label,
    punkte: [spiel.punkte[0], spiel.punkte[1]],
    bummerl: [spiel.bummerl[0], spiel.bummerl[1]],
    bummerlLog: spiel.bummerlLog,
    status: spiel.status,
  }
  if (spiel.beendetAm) eintrag.beendetAm = spiel.beendetAm
  return eintrag
}

function mitSnapshot(spiel: Spiel, label: string): UndoEintrag[] {
  const stack = [...spiel.undoStack, snapshot(spiel, label)]
  return stack.length > MAX_UNDO ? stack.slice(stack.length - MAX_UNDO) : stack
}

/** Der Gewinner einer Partie zieht sich die Punkte vom eigenen Zähler ab. */
export function punkteAbziehen(spiel: Spiel, gewinner: SpielerIndex, punkte: number): Spiel {
  if (!kannAbziehen(spiel)) return spiel
  const abzug = Math.round(punkte)
  if (!Number.isFinite(abzug) || abzug <= 0) return spiel

  const neu: [number, number] = [spiel.punkte[0], spiel.punkte[1]]
  neu[gewinner] = Math.max(0, neu[gewinner] - abzug)

  return {
    ...spiel,
    punkte: neu,
    undoStack: mitSnapshot(spiel, `${spiel.spieler[gewinner]} −${abzug}`),
  }
}

function bummerlEintrag(spiel: Spiel, gewinner: SpielerIndex, zeitpunkt: string): BummerlEintrag {
  return {
    nummer: spiel.bummerlLog.length + 1,
    gewinner,
    endstand: [spiel.punkte[0], spiel.punkte[1]],
    beendetAm: zeitpunkt,
  }
}

/**
 * Schließt das laufende Bummerl für den angegebenen Gewinner ab und setzt die
 * Zähler auf den Startwert zurück. Ohne Gewinner-Angabe wird der automatisch
 * erkannte Gewinner (Zähler bei 0) verwendet.
 */
export function bummerlAbschliessen(
  spiel: Spiel,
  gewinner?: SpielerIndex,
  zeitpunkt: string = new Date().toISOString(),
): Spiel {
  if (spiel.status === 'beendet') return spiel
  const sieger = gewinner ?? entschieden(spiel)
  if (sieger === null) return spiel

  const bummerl: [number, number] = [spiel.bummerl[0], spiel.bummerl[1]]
  bummerl[sieger] += 1

  return {
    ...spiel,
    bummerl,
    bummerlLog: [...spiel.bummerlLog, bummerlEintrag(spiel, sieger, zeitpunkt)],
    punkte: [spiel.startwert, spiel.startwert],
    undoStack: mitSnapshot(spiel, `Bummerl an ${spiel.spieler[sieger]}`),
  }
}

/**
 * Beendet das Spiel. Ein noch offenes, aber entschiedenes Bummerl wird vorher
 * gutgeschrieben.
 */
export function spielBeenden(spiel: Spiel, zeitpunkt: string = new Date().toISOString()): Spiel {
  if (spiel.status === 'beendet') return spiel

  const offen = entschieden(spiel)
  const basis = offen === null ? spiel : bummerlAbschliessen(spiel, offen, zeitpunkt)

  return {
    ...basis,
    status: 'beendet',
    beendetAm: zeitpunkt,
    undoStack: mitSnapshot(basis, 'Spiel beendet'),
  }
}

/**
 * Nimmt ein beendetes Spiel wieder auf. Bummerl-Stand und Verlauf bleiben
 * erhalten, gespielt wird im laufenden Bummerl weiter.
 */
export function spielFortsetzen(spiel: Spiel): Spiel {
  if (spiel.status === 'laufend') return spiel

  const { beendetAm: _beendetAm, ...ohneEnde } = spiel
  return {
    ...ohneEnde,
    status: 'laufend',
    undoStack: mitSnapshot(spiel, 'Spiel fortgesetzt'),
  }
}

export function undo(spiel: Spiel): Spiel {
  const letzter = spiel.undoStack.at(-1)
  if (!letzter) return spiel

  const { beendetAm: _beendetAm, ...rest } = spiel
  const wiederhergestellt: Spiel = {
    ...rest,
    punkte: [letzter.punkte[0], letzter.punkte[1]],
    bummerl: [letzter.bummerl[0], letzter.bummerl[1]],
    bummerlLog: letzter.bummerlLog,
    status: letzter.status,
    undoStack: spiel.undoStack.slice(0, -1),
  }
  if (letzter.beendetAm) wiederhergestellt.beendetAm = letzter.beendetAm
  return wiederhergestellt
}

/** Spieler mit den meisten Bummerl – null bei Gleichstand. */
export function spielSieger(spiel: Spiel): SpielerIndex | null {
  if (spiel.bummerl[0] === spiel.bummerl[1]) return null
  return spiel.bummerl[0] > spiel.bummerl[1] ? 0 : 1
}

export function endstandText(spiel: Spiel): string {
  return `${spiel.bummerl[0]} : ${spiel.bummerl[1]}`
}

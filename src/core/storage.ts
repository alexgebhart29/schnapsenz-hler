import {
  DEFAULT_STARTWERT,
  DEFAULT_STARTWERT_VIERER,
  MAX_UNDO,
  normalizeStartwert,
  standardKategorien,
} from './schnapsen'
import type {
  AppState,
  Ausstehend,
  BummerlEintrag,
  Grabsteine,
  Kategorie,
  Modus,
  NamensEintrag,
  Rank,
  Settings,
  Spiel,
  SpielerIndex,
  SpielStatus,
  Theme,
  UndoEintrag,
} from './types'

export const STORAGE_KEY = 'schnapsen-zaehler.v1'

/** Maximale Anzahl gemerkter Spielernamen bzw. protokollierter Spiele. */
export const MAX_NAMEN = 30
export const MAX_SPIELE = 200

export const namensSchluessel = (name: string): string => name.trim().toLowerCase()

export function leereGrabsteine(): Grabsteine {
  return { spiele: {}, ranks: {}, kategorien: {}, namen: {} }
}

export function leeresAusstehend(): Ausstehend {
  return { spiele: [], ranks: [], kategorien: [], namen: [], einstellungen: [] }
}

export function initialState(): AppState {
  return {
    version: 2,
    settings: {
      startwert: DEFAULT_STARTWERT,
      startwertVierer: DEFAULT_STARTWERT_VIERER,
      theme: 'system',
      bettlerAktiv: false,
    },
    einstellungenGeaendertAm: {},
    namen: [],
    ranks: [],
    kategorien: standardKategorien(1),
    spiele: [],
    aktivesSpielId: null,
    grabsteine: leereGrabsteine(),
    ausstehend: leeresAusstehend(),
    sync: { stand: 0, zuletztAm: null },
  }
}

const istObjekt = (wert: unknown): wert is Record<string, unknown> =>
  typeof wert === 'object' && wert !== null && !Array.isArray(wert)

const zahl = (wert: unknown, fallback: number): number =>
  typeof wert === 'number' && Number.isFinite(wert) ? wert : fallback

const text = (wert: unknown, fallback = ''): string => (typeof wert === 'string' ? wert : fallback)

const spielerIndex = (wert: unknown): SpielerIndex => (wert === 1 ? 1 : 0)

const paar = (wert: unknown, fallback: [number, number]): [number, number] => {
  if (!Array.isArray(wert)) return fallback
  return [zahl(wert[0], fallback[0]), zahl(wert[1], fallback[1])]
}

function parseSettings(wert: unknown): Settings {
  const roh = istObjekt(wert) ? wert : {}
  const theme = roh.theme
  return {
    startwert: normalizeStartwert(zahl(roh.startwert, DEFAULT_STARTWERT)),
    startwertVierer: normalizeStartwert(zahl(roh.startwertVierer, DEFAULT_STARTWERT_VIERER)),
    theme:
      theme === 'hell' || theme === 'dunkel' || theme === 'system' ? (theme as Theme) : 'system',
    bettlerAktiv: roh.bettlerAktiv === true,
  }
}

const parseModus = (wert: unknown): Modus => (wert === 'vierer' ? 'vierer' : 'zweier')

/** Einzelner Rank – auch für Daten vom Server verwendet. */
export function parseRank(wert: unknown, fallbackId = 'rank'): Rank | null {
  if (!istObjekt(wert)) return null
  return {
    id: text(wert.id) || fallbackId,
    name: text(wert.name),
    punkte: Math.round(zahl(wert.punkte, 0)),
    modus: parseModus(wert.modus),
    geaendertAm: zahl(wert.geaendertAm, 0),
  }
}

function parseRanks(wert: unknown): Rank[] {
  if (!Array.isArray(wert)) return []
  return wert
    .map((roh, index) => parseRank(roh, `rank-${index}`))
    .filter((rank): rank is Rank => rank !== null)
}

/** Einzelne Kategorie – auch für Daten vom Server verwendet. */
export function parseKategorie(wert: unknown, fallbackId = 'kategorie'): Kategorie | null {
  if (!istObjekt(wert)) return null
  return {
    id: text(wert.id) || fallbackId,
    name: text(wert.name),
    punkte: Math.round(zahl(wert.punkte, 0)),
    geaendertAm: zahl(wert.geaendertAm, 0),
  }
}

function parseKategorien(wert: unknown): Kategorie[] {
  if (!Array.isArray(wert)) return []
  return wert
    .map((roh, index) => parseKategorie(roh, `kategorie-${index}`))
    .filter((kategorie): kategorie is Kategorie => kategorie !== null)
}

function parseBummerlLog(wert: unknown): BummerlEintrag[] {
  if (!Array.isArray(wert)) return []
  return wert.filter(istObjekt).map((roh, index) => ({
    nummer: Math.round(zahl(roh.nummer, index + 1)),
    gewinner: spielerIndex(roh.gewinner),
    endstand: paar(roh.endstand, [0, 0]),
    beendetAm: text(roh.beendetAm, new Date(0).toISOString()),
  }))
}

function parseUndoStack(wert: unknown): UndoEintrag[] {
  if (!Array.isArray(wert)) return []
  return wert
    .filter(istObjekt)
    .map((roh) => {
      const eintrag: UndoEintrag = {
        label: text(roh.label, 'Letzte Aktion'),
        punkte: paar(roh.punkte, [0, 0]),
        bummerl: paar(roh.bummerl, [0, 0]),
        bummerlLog: parseBummerlLog(roh.bummerlLog),
        status: (roh.status === 'beendet' ? 'beendet' : 'laufend') as SpielStatus,
      }
      const beendetAm = text(roh.beendetAm)
      if (beendetAm) eintrag.beendetAm = beendetAm
      return eintrag
    })
    .slice(-MAX_UNDO)
}

/** Einzelnes Spiel – auch für Daten vom Server verwendet. */
export function parseSpiel(wert: unknown, fallbackId = 'spiel'): Spiel | null {
  if (!istObjekt(wert)) return null
  const spielerRoh = Array.isArray(wert.spieler) ? wert.spieler : []
  const partnerRoh = Array.isArray(wert.partner) ? wert.partner : []
  const startwert = normalizeStartwert(zahl(wert.startwert, DEFAULT_STARTWERT))
  const modus = parseModus(wert.modus)

  const spiel: Spiel = {
    id: text(wert.id) || fallbackId,
    datum: text(wert.datum, new Date(0).toISOString()),
    modus,
    spieler: [text(spielerRoh[0], 'Spieler 1'), text(spielerRoh[1], 'Spieler 2')],
    startwert,
    bummerl: paar(wert.bummerl, [0, 0]),
    punkte: paar(wert.punkte, [startwert, startwert]),
    status: wert.status === 'beendet' ? 'beendet' : 'laufend',
    bummerlLog: parseBummerlLog(wert.bummerlLog),
    undoStack: parseUndoStack(wert.undoStack),
    geaendertAm: zahl(wert.geaendertAm, 0),
  }
  if (modus === 'vierer') {
    spiel.partner = [text(partnerRoh[0], 'Spieler 3'), text(partnerRoh[1], 'Spieler 4')]
  }
  const beendetAm = text(wert.beendetAm)
  if (beendetAm) spiel.beendetAm = beendetAm
  return spiel
}

function parseNamen(wert: unknown): NamensEintrag[] {
  if (!Array.isArray(wert)) return []

  const eintraege: NamensEintrag[] = []
  for (const roh of wert) {
    // v1 speicherte reine Zeichenketten.
    if (typeof roh === 'string') {
      if (roh.trim()) eintraege.push({ name: roh.trim(), geaendertAm: 0 })
      continue
    }
    if (!istObjekt(roh)) continue
    const name = text(roh.name).trim()
    if (name) eintraege.push({ name, geaendertAm: zahl(roh.geaendertAm, 0) })
  }
  return eintraege.slice(0, MAX_NAMEN)
}

function parseZeitstempelKarte(wert: unknown): Record<string, number> {
  if (!istObjekt(wert)) return {}
  const karte: Record<string, number> = {}
  for (const [schluessel, roh] of Object.entries(wert)) {
    const zeit = zahl(roh, 0)
    if (zeit > 0) karte[schluessel] = zeit
  }
  return karte
}

function parseIdListe(wert: unknown): string[] {
  if (!Array.isArray(wert)) return []
  return [...new Set(wert.filter((id): id is string => typeof id === 'string' && id.length > 0))]
}

export function parseState(roh: unknown): AppState {
  const basis = initialState()
  if (!istObjekt(roh)) return basis

  const spiele = Array.isArray(roh.spiele)
    ? roh.spiele
        .map((eintrag, index) => parseSpiel(eintrag, `spiel-${index}`))
        .filter((spiel): spiel is Spiel => spiel !== null)
        .slice(0, MAX_SPIELE)
    : []

  const aktivesSpielId = text(roh.aktivesSpielId) || null
  const grabsteineRoh = istObjekt(roh.grabsteine) ? roh.grabsteine : {}
  const ausstehendRoh = istObjekt(roh.ausstehend) ? roh.ausstehend : {}
  const syncRoh = istObjekt(roh.sync) ? roh.sync : {}

  // Bestandsdaten kannten „kategorien“ noch nicht: einmalig mit den
  // mitgelieferten Standardkategorien befüllen und zum Abgleich vormerken.
  const kategorienNeu = roh.kategorien === undefined
  const kategorien = kategorienNeu ? standardKategorien(1) : parseKategorien(roh.kategorien)

  return {
    version: 2,
    settings: parseSettings(roh.settings),
    einstellungenGeaendertAm: parseZeitstempelKarte(roh.einstellungenGeaendertAm),
    namen: parseNamen(roh.namen),
    ranks: parseRanks(roh.ranks),
    kategorien,
    spiele,
    aktivesSpielId: spiele.some((s) => s.id === aktivesSpielId) ? aktivesSpielId : null,
    grabsteine: {
      spiele: parseZeitstempelKarte(grabsteineRoh.spiele),
      ranks: parseZeitstempelKarte(grabsteineRoh.ranks),
      kategorien: parseZeitstempelKarte(grabsteineRoh.kategorien),
      namen: parseZeitstempelKarte(grabsteineRoh.namen),
    },
    ausstehend: {
      spiele: parseIdListe(ausstehendRoh.spiele),
      ranks: parseIdListe(ausstehendRoh.ranks),
      kategorien: kategorienNeu
        ? kategorien.map((eintrag) => eintrag.id)
        : parseIdListe(ausstehendRoh.kategorien),
      namen: parseIdListe(ausstehendRoh.namen),
      einstellungen: parseIdListe(ausstehendRoh.einstellungen),
    },
    sync: {
      stand: Math.max(0, Math.floor(zahl(syncRoh.stand, 0))),
      zuletztAm: zahl(syncRoh.zuletztAm, 0) > 0 ? zahl(syncRoh.zuletztAm, 0) : null,
    },
  }
}

/**
 * Hebt einen Stand aus Version 1 auf Version 2: Damals gab es weder
 * Zeitstempel noch Grabsteine. Alle vorhandenen Daten gelten als lokale
 * Änderung, damit sie beim ersten Abgleich auf den Server wandern.
 */
function migriere(state: AppState, roh: Record<string, unknown>): AppState {
  if (zahl(roh.version, 1) >= 2) return state

  const jetzt = Date.now()
  const spiele = state.spiele.map((spiel, index) => ({
    ...spiel,
    geaendertAm: spiel.geaendertAm || jetzt - index,
  }))
  const ranks = state.ranks.map((rank) => ({ ...rank, geaendertAm: rank.geaendertAm || jetzt }))
  const namen = state.namen.map((eintrag, index) => ({
    ...eintrag,
    geaendertAm: eintrag.geaendertAm || jetzt - index,
  }))

  return {
    ...state,
    spiele,
    ranks,
    namen,
    einstellungenGeaendertAm: { startwert: jetzt },
    ausstehend: {
      spiele: spiele.map((s) => s.id),
      ranks: ranks.map((r) => r.id),
      kategorien: [],
      namen: namen.map((n) => namensSchluessel(n.name)),
      einstellungen: ['startwert'],
    },
  }
}

export function ladeState(): AppState {
  if (typeof localStorage === 'undefined') return initialState()
  try {
    const roh = localStorage.getItem(STORAGE_KEY)
    if (!roh) return initialState()
    const geparst: unknown = JSON.parse(roh)
    const state = parseState(geparst)
    return istObjekt(geparst) ? migriere(state, geparst) : state
  } catch {
    // Beschädigte Daten: lieber frisch starten als die App blockieren.
    return initialState()
  }
}

export function speichereState(state: AppState): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Speicher voll oder gesperrt (z. B. Privater Modus) – App läuft weiter.
  }
}

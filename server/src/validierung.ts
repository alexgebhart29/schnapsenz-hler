import { MAX_EINTRAEGE_PRO_ART } from './sync.js'
import {
  LEERES_PAKET,
  type EinstellungsEintrag,
  type NamensEintrag,
  type SyncAnfrage,
  type SyncEintrag,
  type SyncPaket,
} from './typen.js'

const istObjekt = (wert: unknown): wert is Record<string, unknown> =>
  typeof wert === 'object' && wert !== null && !Array.isArray(wert)

const MAX_ID_LAENGE = 200
const MAX_NAME_LAENGE = 100

/**
 * Ein einzelnes Spiel oder ein Rank ist immer nur wenige hundert Bytes groß.
 * Diese Grenze schützt vor einem angemeldeten, böswilligen Client, der über
 * viele Sync-Aufrufe hinweg gezielt sehr große Datensätze anhäuft und so die
 * Datenbank auf dem Server aufbläht (die 8-MB-Anfragegrenze allein verhindert
 * das nicht, da sie nur pro Aufruf gilt, nicht über die Zeit).
 */
const MAX_DATEN_BYTES = 100_000

function datenZuGross(daten: unknown): boolean {
  try {
    return Buffer.byteLength(JSON.stringify(daten) ?? '', 'utf8') > MAX_DATEN_BYTES
  } catch {
    return true
  }
}

type Ergebnis = { anfrage: SyncAnfrage } | { fehler: string }

function pruefeEintraege(wert: unknown, feld: string): SyncEintrag[] | string {
  if (wert === undefined) return []
  if (!Array.isArray(wert)) return `${feld} muss eine Liste sein`
  if (wert.length > MAX_EINTRAEGE_PRO_ART) return `${feld}: zu viele Einträge auf einmal`

  const eintraege: SyncEintrag[] = []
  for (const roh of wert) {
    if (!istObjekt(roh)) return `${feld}: ungültiger Eintrag`
    const id = roh.id
    if (typeof id !== 'string' || !id || id.length > MAX_ID_LAENGE) {
      return `${feld}: ungültige ID`
    }
    if (typeof roh.geaendertAm !== 'number' || !Number.isFinite(roh.geaendertAm)) {
      return `${feld}: ungültiger Zeitstempel`
    }

    const eintrag: SyncEintrag = { id, geaendertAm: roh.geaendertAm }
    if (roh.geloescht === true) {
      eintrag.geloescht = true
    } else {
      if (datenZuGross(roh.daten)) return `${feld}: Eintrag ist zu groß`
      eintrag.daten = roh.daten ?? null
    }
    eintraege.push(eintrag)
  }
  return eintraege
}

function pruefeNamen(wert: unknown): NamensEintrag[] | string {
  if (wert === undefined) return []
  if (!Array.isArray(wert)) return 'namen muss eine Liste sein'
  if (wert.length > MAX_EINTRAEGE_PRO_ART) return 'namen: zu viele Einträge auf einmal'

  const eintraege: NamensEintrag[] = []
  for (const roh of wert) {
    if (!istObjekt(roh)) return 'namen: ungültiger Eintrag'
    const name = roh.name
    if (typeof name !== 'string' || !name.trim() || name.length > MAX_NAME_LAENGE) {
      return 'namen: ungültiger Name'
    }
    if (typeof roh.geaendertAm !== 'number' || !Number.isFinite(roh.geaendertAm)) {
      return 'namen: ungültiger Zeitstempel'
    }

    const eintrag: NamensEintrag = { name, geaendertAm: roh.geaendertAm }
    if (roh.geloescht === true) eintrag.geloescht = true
    eintraege.push(eintrag)
  }
  return eintraege
}

/** Nur bekannte Einstellungen werden synchronisiert; das Theme bleibt lokal. */
const ERLAUBTE_EINSTELLUNGEN = new Set(['startwert', 'startwertVierer'])

function pruefeEinstellungen(wert: unknown): EinstellungsEintrag[] | string {
  if (wert === undefined) return []
  if (!Array.isArray(wert)) return 'einstellungen muss eine Liste sein'
  if (wert.length > 50) return 'einstellungen: zu viele Einträge'

  const eintraege: EinstellungsEintrag[] = []
  for (const roh of wert) {
    if (!istObjekt(roh)) return 'einstellungen: ungültiger Eintrag'
    const schluessel = roh.schluessel
    if (typeof schluessel !== 'string' || !ERLAUBTE_EINSTELLUNGEN.has(schluessel)) continue
    if (typeof roh.geaendertAm !== 'number' || !Number.isFinite(roh.geaendertAm)) {
      return 'einstellungen: ungültiger Zeitstempel'
    }
    eintraege.push({ schluessel, wert: roh.wert ?? null, geaendertAm: roh.geaendertAm })
  }
  return eintraege
}

export function pruefeSyncAnfrage(roh: unknown): Ergebnis {
  if (!istObjekt(roh)) return { fehler: 'ungültiger Aufbau' }

  const seit = typeof roh.seit === 'number' && Number.isFinite(roh.seit) ? roh.seit : 0
  const rohAenderungen = istObjekt(roh.aenderungen) ? roh.aenderungen : {}

  const spiele = pruefeEintraege(rohAenderungen.spiele, 'spiele')
  if (typeof spiele === 'string') return { fehler: spiele }

  const ranks = pruefeEintraege(rohAenderungen.ranks, 'ranks')
  if (typeof ranks === 'string') return { fehler: ranks }

  const namen = pruefeNamen(rohAenderungen.namen)
  if (typeof namen === 'string') return { fehler: namen }

  const einstellungen = pruefeEinstellungen(rohAenderungen.einstellungen)
  if (typeof einstellungen === 'string') return { fehler: einstellungen }

  const aenderungen: SyncPaket = { ...LEERES_PAKET(), spiele, ranks, namen, einstellungen }
  return { anfrage: { seit, aenderungen } }
}

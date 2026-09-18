import type { DatabaseSync } from 'node:sqlite'
import { db as standardDb } from './db.js'
import {
  LEERES_PAKET,
  type EinstellungsEintrag,
  type NamensEintrag,
  type SyncAnfrage,
  type SyncAntwort,
  type SyncEintrag,
  type SyncPaket,
} from './typen.js'

/** Obergrenzen, damit ein einzelner Aufruf den Server nicht überlastet. */
export const MAX_EINTRAEGE_PRO_ART = 2000

const namensSchluessel = (name: string): string => name.trim().toLowerCase()

function aktuelleFolge(db: DatabaseSync): number {
  const zeile = db.prepare("SELECT wert FROM meta WHERE schluessel = 'folge'").get() as
    | { wert: number }
    | undefined
  return zeile?.wert ?? 0
}

function naechsteFolge(db: DatabaseSync): number {
  db.prepare("UPDATE meta SET wert = wert + 1 WHERE schluessel = 'folge'").run()
  return aktuelleFolge(db)
}

function hatAenderungen(paket: SyncPaket): boolean {
  return (
    paket.spiele.length > 0 ||
    paket.ranks.length > 0 ||
    paket.namen.length > 0 ||
    paket.einstellungen.length > 0
  )
}

/**
 * Schreibt einen Datensatz, wenn er jünger ist als der gespeicherte.
 * Bei Gleichstand gewinnt der Server, damit der Abgleich stabil bleibt.
 */
function schreibeEintrag(
  db: DatabaseSync,
  tabelle: 'spiele' | 'ranks',
  eintrag: SyncEintrag,
  geaendertAm: number,
  folge: number,
): void {
  const vorhanden = db.prepare(`SELECT geaendert_am FROM ${tabelle} WHERE id = ?`).get(eintrag.id) as
    | { geaendert_am: number }
    | undefined

  if (vorhanden && vorhanden.geaendert_am >= geaendertAm) return

  const daten = eintrag.geloescht ? '' : JSON.stringify(eintrag.daten ?? null)
  db.prepare(
    `INSERT INTO ${tabelle} (id, geaendert_am, folge, geloescht, daten)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       geaendert_am = excluded.geaendert_am,
       folge = excluded.folge,
       geloescht = excluded.geloescht,
       daten = excluded.daten`,
  ).run(eintrag.id, geaendertAm, folge, eintrag.geloescht ? 1 : 0, daten)
}

function schreibeNamen(
  db: DatabaseSync,
  eintrag: NamensEintrag,
  geaendertAm: number,
  folge: number,
): void {
  const schluessel = namensSchluessel(eintrag.name)
  if (!schluessel) return

  const vorhanden = db.prepare('SELECT geaendert_am FROM namen WHERE schluessel = ?').get(schluessel) as
    | { geaendert_am: number }
    | undefined

  if (vorhanden && vorhanden.geaendert_am >= geaendertAm) return

  db.prepare(
    `INSERT INTO namen (schluessel, anzeige, geaendert_am, folge, geloescht)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(schluessel) DO UPDATE SET
       anzeige = excluded.anzeige,
       geaendert_am = excluded.geaendert_am,
       folge = excluded.folge,
       geloescht = excluded.geloescht`,
  ).run(schluessel, eintrag.name.trim(), geaendertAm, folge, eintrag.geloescht ? 1 : 0)
}

function schreibeEinstellung(
  db: DatabaseSync,
  eintrag: EinstellungsEintrag,
  geaendertAm: number,
  folge: number,
): void {
  const vorhanden = db
    .prepare('SELECT geaendert_am FROM einstellungen WHERE schluessel = ?')
    .get(eintrag.schluessel) as { geaendert_am: number } | undefined

  if (vorhanden && vorhanden.geaendert_am >= geaendertAm) return

  db.prepare(
    `INSERT INTO einstellungen (schluessel, wert, geaendert_am, folge)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(schluessel) DO UPDATE SET
       wert = excluded.wert,
       geaendert_am = excluded.geaendert_am,
       folge = excluded.folge`,
  ).run(eintrag.schluessel, JSON.stringify(eintrag.wert ?? null), geaendertAm, folge)
}

function leseAenderungen(db: DatabaseSync, seit: number): SyncPaket {
  const paket = LEERES_PAKET()

  for (const tabelle of ['spiele', 'ranks'] as const) {
    const zeilen = db
      .prepare(`SELECT id, geaendert_am, geloescht, daten FROM ${tabelle} WHERE folge > ?`)
      .all(seit) as { id: string; geaendert_am: number; geloescht: number; daten: string }[]

    paket[tabelle] = zeilen.map((zeile) => {
      const eintrag: SyncEintrag = { id: zeile.id, geaendertAm: zeile.geaendert_am }
      if (zeile.geloescht === 1) eintrag.geloescht = true
      else eintrag.daten = JSON.parse(zeile.daten)
      return eintrag
    })
  }

  const namensZeilen = db
    .prepare('SELECT anzeige, geaendert_am, geloescht FROM namen WHERE folge > ?')
    .all(seit) as { anzeige: string; geaendert_am: number; geloescht: number }[]

  paket.namen = namensZeilen.map((zeile) => {
    const eintrag: NamensEintrag = { name: zeile.anzeige, geaendertAm: zeile.geaendert_am }
    if (zeile.geloescht === 1) eintrag.geloescht = true
    return eintrag
  })

  const einstellungsZeilen = db
    .prepare('SELECT schluessel, wert, geaendert_am FROM einstellungen WHERE folge > ?')
    .all(seit) as { schluessel: string; wert: string; geaendert_am: number }[]

  paket.einstellungen = einstellungsZeilen.map((zeile) => ({
    schluessel: zeile.schluessel,
    wert: JSON.parse(zeile.wert),
    geaendertAm: zeile.geaendert_am,
  }))

  return paket
}

/**
 * Nimmt die Änderungen des Clients entgegen und liefert alles zurück, was das
 * Gerät seit seinem Stand noch nicht kennt.
 */
export function synchronisiere(
  anfrage: SyncAnfrage,
  datenbank: DatabaseSync = standardDb(),
  jetzt: number = Date.now(),
): SyncAntwort {
  const seit = Number.isFinite(anfrage.seit) && anfrage.seit > 0 ? Math.floor(anfrage.seit) : 0
  const eingehend = anfrage.aenderungen

  datenbank.exec('BEGIN IMMEDIATE')
  try {
    let stand = aktuelleFolge(datenbank)

    if (hatAenderungen(eingehend)) {
      const folge = naechsteFolge(datenbank)
      stand = folge

      // Zeitstempel aus der Zukunft kappen: eine vorgehende Geräteuhr würde
      // sonst dauerhaft jeden Konflikt gewinnen.
      const zeit = (wert: number) =>
        Number.isFinite(wert) ? Math.min(Math.max(0, Math.floor(wert)), jetzt) : jetzt

      for (const eintrag of eingehend.spiele) {
        schreibeEintrag(datenbank, 'spiele', eintrag, zeit(eintrag.geaendertAm), folge)
      }
      for (const eintrag of eingehend.ranks) {
        schreibeEintrag(datenbank, 'ranks', eintrag, zeit(eintrag.geaendertAm), folge)
      }
      for (const eintrag of eingehend.namen) {
        schreibeNamen(datenbank, eintrag, zeit(eintrag.geaendertAm), folge)
      }
      for (const eintrag of eingehend.einstellungen) {
        schreibeEinstellung(datenbank, eintrag, zeit(eintrag.geaendertAm), folge)
      }
    }

    const aenderungen = leseAenderungen(datenbank, seit)
    datenbank.exec('COMMIT')
    return { stand, serverZeit: jetzt, aenderungen }
  } catch (fehler) {
    datenbank.exec('ROLLBACK')
    throw fehler
  }
}

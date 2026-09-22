import { randomUUID } from 'node:crypto'
import { db } from './db.js'
import { hashePasswort, pruefePasswort } from './passwoerter.js'

export type Benutzer = {
  id: string
  benutzername: string
  istAdmin: boolean
  /** Nur dann gibt es ein Passwort und eine Anmeldung; sonst ist das Konto nur ein auswählbarer Spielername. */
  darfAnmelden: boolean
  erstelltAm: number
}

type BenutzerZeile = {
  id: string
  benutzername: string
  passwort_hash: string
  ist_admin: number
  darf_anmelden: number
  erstellt_am: number
  geaendert_am: number
}

const zuBenutzer = (zeile: BenutzerZeile): Benutzer => ({
  id: zeile.id,
  benutzername: zeile.benutzername,
  istAdmin: zeile.ist_admin === 1,
  darfAnmelden: zeile.darf_anmelden === 1,
  erstelltAm: zeile.erstellt_am,
})

export function anzahlBenutzer(): number {
  const zeile = db().prepare('SELECT COUNT(*) AS anzahl FROM benutzer').get() as { anzahl: number }
  return zeile.anzahl
}

export function alleBenutzer(): Benutzer[] {
  const zeilen = db()
    .prepare('SELECT * FROM benutzer ORDER BY ist_admin DESC, benutzername COLLATE NOCASE')
    .all() as BenutzerZeile[]
  return zeilen.map(zuBenutzer)
}

export function findeBenutzer(id: string): Benutzer | null {
  const zeile = db().prepare('SELECT * FROM benutzer WHERE id = ?').get(id) as
    | BenutzerZeile
    | undefined
  return zeile ? zuBenutzer(zeile) : null
}

export function findeBenutzerName(benutzername: string): BenutzerZeile | null {
  const zeile = db()
    .prepare('SELECT * FROM benutzer WHERE benutzername = ? COLLATE NOCASE')
    .get(benutzername.trim()) as BenutzerZeile | undefined
  return zeile ?? null
}

/**
 * Legt ein Konto an. Mit `darfAnmelden = false` entsteht ein reiner
 * Spielername: kein Passwort, keine Anmeldung, nie Administrator – er taucht
 * nur in der Spieler-Auswahl der anderen auf.
 */
export async function legeBenutzerAn(
  benutzername: string,
  passwort: string,
  istAdmin: boolean,
  darfAnmelden: boolean = true,
): Promise<Benutzer> {
  const name = benutzername.trim()
  const jetzt = Date.now()
  const benutzer: Benutzer = {
    id: randomUUID(),
    benutzername: name,
    istAdmin: darfAnmelden && istAdmin,
    darfAnmelden,
    erstelltAm: jetzt,
  }

  db()
    .prepare(
      `INSERT INTO benutzer (id, benutzername, passwort_hash, ist_admin, darf_anmelden, erstellt_am, geaendert_am)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      benutzer.id,
      name,
      darfAnmelden ? await hashePasswort(passwort) : '',
      benutzer.istAdmin ? 1 : 0,
      darfAnmelden ? 1 : 0,
      jetzt,
      jetzt,
    )

  return benutzer
}

export async function setzePasswort(id: string, passwort: string): Promise<void> {
  db()
    .prepare('UPDATE benutzer SET passwort_hash = ?, geaendert_am = ? WHERE id = ?')
    .run(await hashePasswort(passwort), Date.now(), id)
}

export function loescheBenutzer(id: string): void {
  db().prepare('DELETE FROM benutzer WHERE id = ?').run(id)
}

/** Prüft die Anmeldedaten; gibt null zurück, wenn sie nicht stimmen. */
export async function pruefeAnmeldung(
  benutzername: string,
  passwort: string,
): Promise<Benutzer | null> {
  const zeile = findeBenutzerName(benutzername)
  if (!zeile || zeile.darf_anmelden !== 1) {
    // Gleich viel Rechenzeit wie ein echter Versuch, damit Benutzernamen nicht
    // über die Antwortzeit erratbar werden.
    await pruefePasswort(passwort, `scrypt$${'a'.repeat(24)}$${'b'.repeat(88)}`)
    return null
  }
  return (await pruefePasswort(passwort, zeile.passwort_hash)) ? zuBenutzer(zeile) : null
}

export function anzahlAdmins(): number {
  const zeile = db()
    .prepare('SELECT COUNT(*) AS anzahl FROM benutzer WHERE ist_admin = 1')
    .get() as { anzahl: number }
  return zeile.anzahl
}

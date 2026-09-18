import { createHash, randomBytes } from 'node:crypto'
import { config } from './config.js'
import { db } from './db.js'
import { findeBenutzer, type Benutzer } from './benutzer.js'

const TAG_MS = 24 * 60 * 60 * 1000

/** Im Cookie steht der Token, in der Datenbank nur sein Hash. */
const hashe = (token: string): string => createHash('sha256').update(token).digest('hex')

export function erstelleSitzung(benutzerId: string): { token: string; laeuftAbAm: number } {
  const token = randomBytes(32).toString('base64url')
  const jetzt = Date.now()
  const laeuftAbAm = jetzt + config.sessionTage * TAG_MS

  db()
    .prepare(
      'INSERT INTO sitzungen (token_hash, benutzer_id, erstellt_am, laeuft_ab_am) VALUES (?, ?, ?, ?)',
    )
    .run(hashe(token), benutzerId, jetzt, laeuftAbAm)

  return { token, laeuftAbAm }
}

export function findeSitzungsBenutzer(token: string): Benutzer | null {
  const zeile = db()
    .prepare('SELECT benutzer_id, laeuft_ab_am FROM sitzungen WHERE token_hash = ?')
    .get(hashe(token)) as { benutzer_id: string; laeuft_ab_am: number } | undefined

  if (!zeile) return null
  if (zeile.laeuft_ab_am < Date.now()) {
    beendeSitzung(token)
    return null
  }
  return findeBenutzer(zeile.benutzer_id)
}

export function beendeSitzung(token: string): void {
  db().prepare('DELETE FROM sitzungen WHERE token_hash = ?').run(hashe(token))
}

export function beendeAlleSitzungen(benutzerId: string): void {
  db().prepare('DELETE FROM sitzungen WHERE benutzer_id = ?').run(benutzerId)
}

export function raeumeSitzungenAuf(): void {
  db().prepare('DELETE FROM sitzungen WHERE laeuft_ab_am < ?').run(Date.now())
}

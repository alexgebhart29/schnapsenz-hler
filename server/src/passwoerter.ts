import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt) as (
  passwort: string | Buffer,
  salt: Buffer,
  laenge: number,
) => Promise<Buffer>

const SALT_BYTES = 16
const KEY_BYTES = 64

/** Format: scrypt$<salt base64>$<key base64> */
export async function hashePasswort(passwort: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES)
  const key = await scryptAsync(passwort.normalize('NFKC'), salt, KEY_BYTES)
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function pruefePasswort(passwort: string, gespeichert: string): Promise<boolean> {
  const [verfahren, saltBase64, keyBase64] = gespeichert.split('$')
  if (verfahren !== 'scrypt' || !saltBase64 || !keyBase64) return false

  const salt = Buffer.from(saltBase64, 'base64')
  const erwartet = Buffer.from(keyBase64, 'base64')
  if (erwartet.length === 0) return false

  const key = await scryptAsync(passwort.normalize('NFKC'), salt, erwartet.length)
  return key.length === erwartet.length && timingSafeEqual(key, erwartet)
}

/** Zufälliges Passwort für die Erstanlage des Administrators. */
export function zufallsPasswort(laenge = 20): string {
  return randomBytes(laenge).toString('base64url').slice(0, laenge)
}

import { erstelleApp } from './app.js'
import { config } from './config.js'
import { anzahlBenutzer, legeBenutzerAn } from './benutzer.js'
import { db } from './db.js'
import { registriereOnlineWebsocket } from './online/ws.js'
import { zufallsPasswort } from './passwoerter.js'
import { raeumeSitzungenAuf } from './sitzungen.js'

const STUNDE_MS = 60 * 60 * 1000

/** Beim allerersten Start einen Administrator anlegen. */
async function legeAdminAn(): Promise<void> {
  if (anzahlBenutzer() > 0) return

  const name = config.adminBenutzer || 'admin'
  const passwort = config.adminPasswort || zufallsPasswort()
  await legeBenutzerAn(name, passwort, true)

  if (config.adminPasswort) {
    console.log(`[start] Administrator "${name}" angelegt (Passwort aus ADMIN_PASSWORD).`)
  } else {
    console.log('')
    console.log('='.repeat(66))
    console.log('  Administrator angelegt – dieses Passwort wird nur einmal gezeigt:')
    console.log(`    Benutzer:  ${name}`)
    console.log(`    Passwort:  ${passwort}`)
    console.log('  Bitte nach der ersten Anmeldung ändern.')
    console.log('='.repeat(66))
    console.log('')
  }
}

async function starte(): Promise<void> {
  db()
  await legeAdminAn()
  raeumeSitzungenAuf()
  setInterval(raeumeSitzungenAuf, 6 * STUNDE_MS).unref()

  const server = erstelleApp().listen(config.port, () => {
    console.log(`[start] Schnapsen-Server läuft auf Port ${config.port}`)
    console.log(`[start] Datenbank: ${config.dbDatei}`)
    console.log(`[start] Cookie secure: ${config.cookieSicher}`)
  })
  registriereOnlineWebsocket(server)
}

starte().catch((fehler) => {
  console.error('[start] Fehlgeschlagen:', fehler)
  process.exit(1)
})

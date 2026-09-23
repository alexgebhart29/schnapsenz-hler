import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { erstelleApp } from './app.js'
import { legeBenutzerAn } from './benutzer.js'
import { oeffneDatenbank, setzeDatenbank } from './db.js'
import { leseCookie } from './http.js'

let server: Server
let basis: string

beforeEach(async () => {
  setzeDatenbank(oeffneDatenbank(':memory:'))
  await legeBenutzerAn('admin', 'geheim-genug-123', true)
  await legeBenutzerAn('spieler', 'auch-geheim-456', false)

  server = erstelleApp().listen(0)
  await new Promise<void>((fertig) => server.once('listening', () => fertig()))
  basis = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterEach(async () => {
  await new Promise<void>((fertig) => server.close(() => fertig()))
  setzeDatenbank(null)
})

/** Kleiner Client, der das Session-Cookie mitführt. */
function client() {
  let cookie: string | null = null

  return {
    async anfrage(pfad: string, optionen: RequestInit = {}) {
      const kopfzeilen = new Headers(optionen.headers)
      if (optionen.body !== undefined) kopfzeilen.set('Content-Type', 'application/json')
      if (cookie) kopfzeilen.set('Cookie', `schnapsen_session=${cookie}`)

      const antwort = await fetch(`${basis}${pfad}`, { ...optionen, headers: kopfzeilen })

      const gesetzt = antwort.headers.get('set-cookie')
      if (gesetzt) {
        const wert = leseCookie(gesetzt.split(';')[0], 'schnapsen_session')
        cookie = wert && wert.length > 0 ? wert : null
      }
      return antwort
    },
    async json(pfad: string, optionen: RequestInit = {}) {
      const antwort = await this.anfrage(pfad, optionen)
      return { status: antwort.status, daten: await antwort.json().catch(() => null) }
    },
    async anmelden(benutzername: string, passwort: string) {
      return this.json('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ benutzername, passwort }),
      })
    },
  }
}

describe('Anmeldung', () => {
  it('lehnt falsche Zugangsdaten ab', async () => {
    const c = client()
    expect((await c.anmelden('admin', 'falsch')).status).toBe(401)
    expect((await c.anmelden('gibtsnicht', 'geheim-genug-123')).status).toBe(401)
  })

  it('meldet an und liefert das eigene Konto', async () => {
    const c = client()
    const anmeldung = await c.anmelden('admin', 'geheim-genug-123')
    expect(anmeldung.status).toBe(200)
    expect(anmeldung.daten.benutzer).toMatchObject({ benutzername: 'admin', istAdmin: true })

    const me = await c.json('/api/auth/me')
    expect(me.status).toBe(200)
    expect(me.daten.benutzer.benutzername).toBe('admin')
  })

  it('ignoriert Groß-/Kleinschreibung beim Benutzernamen', async () => {
    const c = client()
    expect((await c.anmelden('ADMIN', 'geheim-genug-123')).status).toBe(200)
  })

  it('meldet ab', async () => {
    const c = client()
    await c.anmelden('admin', 'geheim-genug-123')
    expect((await c.json('/api/auth/logout', { method: 'POST' })).status).toBe(200)
    expect((await c.json('/api/auth/me')).status).toBe(401)
  })

  it('setzt ein httpOnly-Cookie', async () => {
    const antwort = await fetch(`${basis}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ benutzername: 'admin', passwort: 'geheim-genug-123' }),
    })
    const cookie = antwort.headers.get('set-cookie') ?? ''
    expect(cookie.toLowerCase()).toContain('httponly')
    expect(cookie.toLowerCase()).toContain('samesite=lax')
  })
})

describe('Zugriffsschutz', () => {
  it('verweigert Sync ohne Anmeldung', async () => {
    const c = client()
    const antwort = await c.json('/api/sync', {
      method: 'POST',
      body: JSON.stringify({ seit: 0, aenderungen: {} }),
    })
    expect(antwort.status).toBe(401)
  })

  it('verweigert die Benutzerverwaltung für Nicht-Admins', async () => {
    const c = client()
    await c.anmelden('spieler', 'auch-geheim-456')
    expect((await c.json('/api/benutzer')).status).toBe(403)
    const anlegen = await c.json('/api/benutzer', {
      method: 'POST',
      body: JSON.stringify({ benutzername: 'neu', passwort: 'langgenug-123' }),
    })
    expect(anlegen.status).toBe(403)
  })

  it('weist Anfragen ohne JSON-Content-Type ab', async () => {
    // Schützt gegen Formular-Anfragen von fremden Seiten (CSRF).
    const antwort = await fetch(`${basis}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'benutzername=admin&passwort=geheim-genug-123',
    })
    expect(antwort.status).toBe(415)
  })

  it('liefert für unbekannte API-Pfade 404 statt der App', async () => {
    const antwort = await fetch(`${basis}/api/gibtsnicht`)
    expect(antwort.status).toBe(404)
    expect(antwort.headers.get('content-type')).toContain('application/json')
  })
})

describe('Benutzerverwaltung', () => {
  it('legt Benutzer an, listet und löscht sie', async () => {
    const c = client()
    await c.anmelden('admin', 'geheim-genug-123')

    const angelegt = await c.json('/api/benutzer', {
      method: 'POST',
      body: JSON.stringify({ benutzername: 'Bert', passwort: 'passwort-1234' }),
    })
    expect(angelegt.status).toBe(201)

    const liste = await c.json('/api/benutzer')
    expect(liste.daten.benutzer.map((b: { benutzername: string }) => b.benutzername)).toContain('Bert')

    // Der neue Benutzer kann sich anmelden.
    const bert = client()
    expect((await bert.anmelden('Bert', 'passwort-1234')).status).toBe(200)

    const geloescht = await c.json(`/api/benutzer/${angelegt.daten.benutzer.id}`, {
      method: 'DELETE',
    })
    expect(geloescht.status).toBe(200)
  })

  it('lehnt zu kurze Passwörter und doppelte Namen ab', async () => {
    const c = client()
    await c.anmelden('admin', 'geheim-genug-123')

    const kurz = await c.json('/api/benutzer', {
      method: 'POST',
      body: JSON.stringify({ benutzername: 'Kurz', passwort: 'abc' }),
    })
    expect(kurz.status).toBe(400)

    const doppelt = await c.json('/api/benutzer', {
      method: 'POST',
      body: JSON.stringify({ benutzername: 'SPIELER', passwort: 'passwort-1234' }),
    })
    expect(doppelt.status).toBe(409)
  })

  it('schützt den letzten Administrator und das eigene Konto', async () => {
    const c = client()
    const anmeldung = await c.anmelden('admin', 'geheim-genug-123')
    const eigeneId = anmeldung.daten.benutzer.id

    const selbst = await c.json(`/api/benutzer/${eigeneId}`, { method: 'DELETE' })
    expect(selbst.status).toBe(400)
  })

  it('legt einen reinen Spielernamen ohne Passwort an und lässt ihm nachträglich eines geben', async () => {
    const c = client()
    await c.anmelden('admin', 'geheim-genug-123')

    const angelegt = await c.json('/api/benutzer', {
      method: 'POST',
      body: JSON.stringify({ benutzername: 'Nurname', darfAnmelden: false }),
    })
    expect(angelegt.status).toBe(201)
    expect(angelegt.daten.benutzer.darfAnmelden).toBe(false)

    // Ohne Passwort keine Anmeldung möglich.
    const versuch = client()
    expect((await versuch.anmelden('Nurname', 'irgendwas-12345')).status).toBe(401)

    const passwortGesetzt = await c.json(`/api/benutzer/${angelegt.daten.benutzer.id}/passwort`, {
      method: 'POST',
      body: JSON.stringify({ passwort: 'frisches-passwort-1' }),
    })
    expect(passwortGesetzt.status).toBe(200)

    const liste = await c.json('/api/benutzer')
    const eintrag = liste.daten.benutzer.find((b: { benutzername: string }) => b.benutzername === 'Nurname')
    expect(eintrag.darfAnmelden).toBe(true)

    // Jetzt kann sich das Konto mit dem neu gesetzten Passwort anmelden.
    const angemeldet = client()
    expect((await angemeldet.anmelden('Nurname', 'frisches-passwort-1')).status).toBe(200)
  })

  it('lässt das eigene Passwort ändern', async () => {
    const c = client()
    await c.anmelden('spieler', 'auch-geheim-456')

    const falsch = await c.json('/api/auth/passwort', {
      method: 'POST',
      body: JSON.stringify({ altesPasswort: 'stimmt-nicht', neuesPasswort: 'neues-passwort-1' }),
    })
    expect(falsch.status).toBe(401)

    const richtig = await c.json('/api/auth/passwort', {
      method: 'POST',
      body: JSON.stringify({ altesPasswort: 'auch-geheim-456', neuesPasswort: 'neues-passwort-1' }),
    })
    expect(richtig.status).toBe(200)

    // Die eigene Sitzung bleibt gültig, das neue Passwort funktioniert.
    expect((await c.json('/api/auth/me')).status).toBe(200)
    const neu = client()
    expect((await neu.anmelden('spieler', 'neues-passwort-1')).status).toBe(200)
    expect((await neu.anmelden('spieler', 'auch-geheim-456')).status).toBe(401)
  })
})

describe('Synchronisation über die API', () => {
  it('teilt Daten zwischen zwei angemeldeten Geräten', async () => {
    const handy = client()
    const laptop = client()
    await handy.anmelden('admin', 'geheim-genug-123')
    await laptop.anmelden('spieler', 'auch-geheim-456')

    const hoch = await handy.json('/api/sync', {
      method: 'POST',
      body: JSON.stringify({
        seit: 0,
        aenderungen: {
          spiele: [{ id: 'spiel-1', geaendertAm: 1000, daten: { id: 'spiel-1', bummerl: [1, 0] } }],
          namen: [{ name: 'Anna', geaendertAm: 1000 }],
        },
      }),
    })
    expect(hoch.status).toBe(200)

    const runter = await laptop.json('/api/sync', {
      method: 'POST',
      body: JSON.stringify({ seit: 0, aenderungen: {} }),
    })
    expect(runter.status).toBe(200)
    expect(runter.daten.aenderungen.spiele).toHaveLength(1)
    expect(runter.daten.aenderungen.spiele[0].daten.bummerl).toEqual([1, 0])
    expect(runter.daten.aenderungen.namen[0].name).toBe('Anna')
  })

  it('lehnt unsinnige Pakete ab', async () => {
    const c = client()
    await c.anmelden('admin', 'geheim-genug-123')

    const kaputt = await c.json('/api/sync', {
      method: 'POST',
      body: JSON.stringify({ seit: 0, aenderungen: { spiele: [{ id: 42 }] } }),
    })
    expect(kaputt.status).toBe(400)
  })

  it('lehnt überdimensionierte Einträge ab', async () => {
    const c = client()
    await c.anmelden('admin', 'geheim-genug-123')

    const riesig = await c.json('/api/sync', {
      method: 'POST',
      body: JSON.stringify({
        seit: 0,
        aenderungen: {
          spiele: [{ id: 'x', geaendertAm: 1000, daten: { fuellstoff: 'a'.repeat(200_000) } }],
        },
      }),
    })
    expect(riesig.status).toBe(400)
  })
})

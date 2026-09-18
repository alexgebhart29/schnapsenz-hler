import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { erstelleApp } from './app.js'
import { legeBenutzerAn } from './benutzer.js'
import { oeffneDatenbank, setzeDatenbank } from './db.js'

let server: Server
let basis: string

beforeEach(async () => {
  setzeDatenbank(oeffneDatenbank(':memory:'))
  await legeBenutzerAn('admin', 'echtes-passwort-123', true)
  server = erstelleApp().listen(0)
  await new Promise<void>((f) => server.once('listening', () => f()))
  basis = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterEach(async () => {
  await new Promise<void>((f) => server.close(() => f()))
  setzeDatenbank(null)
})

const login = (headers: Record<string, string> = {}) =>
  fetch(`${basis}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ benutzername: 'admin', passwort: 'falsch' }),
  })

describe('Login-Bremse', () => {
  it('greift nach den konfigurierten Fehlversuchen', async () => {
    let letzterStatus = 0
    for (let i = 0; i < 15; i++) letzterStatus = (await login()).status
    expect(letzterStatus).toBe(429)
  })

  it('lässt sich ohne echten Proxy nicht per X-Forwarded-For umgehen', async () => {
    // TRUST_PROXY steht in den Tests nicht, Standard ist 0 – der Header darf
    // also keine Wirkung auf die ermittelte Client-IP haben.
    let sah429 = false
    for (let i = 0; i < 15; i++) {
      const antwort = await login({ 'X-Forwarded-For': `10.0.0.${i}` })
      if (antwort.status === 429) sah429 = true
    }
    expect(sah429).toBe(true)
  })
})

describe('Sicherheits-Header', () => {
  it('setzt CSP und weitere Schutz-Header', async () => {
    const antwort = await fetch(`${basis}/api/status`)
    expect(antwort.headers.get('content-security-policy')).toContain("default-src 'self'")
    expect(antwort.headers.get('x-content-type-options')).toBe('nosniff')
    expect(antwort.headers.get('x-frame-options')).toBe('DENY')
    expect(antwort.headers.get('referrer-policy')).toBe('no-referrer')
  })
})

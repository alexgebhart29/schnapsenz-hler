import type { Benutzer, SyncAntwort, SyncPaket } from './types'

export class ApiFehler extends Error {
  constructor(
    public readonly status: number,
    nachricht: string,
  ) {
    super(nachricht)
    this.name = 'ApiFehler'
  }

  /** Server erreichbar, aber niemand angemeldet. */
  get istAbgemeldet(): boolean {
    return this.status === 401
  }

  /** Server gar nicht erreichbar (offline oder reiner Client-Betrieb). */
  get istOffline(): boolean {
    return this.status === 0
  }
}

async function anfrage<T>(pfad: string, methode = 'GET', koerper?: unknown): Promise<T> {
  let antwort: Response
  try {
    antwort = await fetch(`/api${pfad}`, {
      method: methode,
      credentials: 'same-origin',
      headers: koerper === undefined ? {} : { 'Content-Type': 'application/json' },
      body: koerper === undefined ? undefined : JSON.stringify(koerper),
    })
  } catch {
    throw new ApiFehler(0, 'Server nicht erreichbar')
  }

  if (antwort.status === 204) return undefined as T

  const typ = antwort.headers.get('content-type') ?? ''
  if (!typ.includes('application/json')) {
    // Ohne Backend liefert der Dev-Server die App-Shell zurück.
    throw new ApiFehler(antwort.ok ? 0 : antwort.status, 'Keine API-Antwort erhalten')
  }

  const daten = (await antwort.json().catch(() => null)) as { fehler?: string } | null
  if (!antwort.ok) {
    throw new ApiFehler(antwort.status, daten?.fehler ?? `Fehler ${antwort.status}`)
  }
  return daten as T
}

export const api = {
  me: () => anfrage<{ benutzer: Benutzer }>('/auth/me'),

  login: (benutzername: string, passwort: string) =>
    anfrage<{ benutzer: Benutzer }>('/auth/login', 'POST', { benutzername, passwort }),

  logout: () => anfrage<{ ok: true }>('/auth/logout', 'POST', {}),

  passwortAendern: (altesPasswort: string, neuesPasswort: string) =>
    anfrage<{ ok: true }>('/auth/passwort', 'POST', { altesPasswort, neuesPasswort }),

  benutzerListe: () => anfrage<{ benutzer: Benutzer[] }>('/benutzer'),

  benutzerAnlegen: (benutzername: string, passwort: string, istAdmin: boolean, darfAnmelden: boolean) =>
    anfrage<{ benutzer: Benutzer }>('/benutzer', 'POST', {
      benutzername,
      passwort,
      istAdmin,
      darfAnmelden,
    }),

  /** Nur die Benutzernamen – für die Spieler-Dropdowns. */
  benutzerNamen: () => anfrage<{ namen: string[] }>('/benutzer/namen'),

  benutzerPasswort: (id: string, passwort: string) =>
    anfrage<{ ok: true }>(`/benutzer/${encodeURIComponent(id)}/passwort`, 'POST', { passwort }),

  benutzerLoeschen: (id: string) =>
    anfrage<{ ok: true }>(`/benutzer/${encodeURIComponent(id)}`, 'DELETE'),

  sync: (seit: number, aenderungen: SyncPaket) =>
    anfrage<SyncAntwort>('/sync', 'POST', { seit, aenderungen }),

  /** Offene Online-Tische (warten auf einen zweiten Spieler) – nur für angemeldete Nutzer. */
  offeneTische: () =>
    anfrage<{ tische: { id: string; ersteller: string }[] }>('/online/tische'),
}

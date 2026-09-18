import { useSyncExternalStore } from 'react'
import { api, ApiFehler } from './api'
import { ersetzeState, getState, subscribe as subscribeStore } from './store'
import { istPaketLeer, nachErfolg, sammleAenderungen, wendeAn } from './sync'
import type { Benutzer } from './types'

export type SitzungsStatus =
  /** Erster Kontaktversuch läuft. */
  | 'pruefe'
  /** Kein Server vorhanden – reiner Gerätebetrieb. */
  | 'lokal'
  /** Server da, aber niemand angemeldet. */
  | 'abgemeldet'
  | 'angemeldet'

export type SyncStatus = 'inaktiv' | 'laeuft' | 'ok' | 'fehler'

export type Sitzung = {
  status: SitzungsStatus
  benutzer: Benutzer | null
  syncStatus: SyncStatus
  fehler: string | null
}

let sitzung: Sitzung = {
  status: 'pruefe',
  benutzer: null,
  syncStatus: 'inaktiv',
  fehler: null,
}

const listeners = new Set<() => void>()

function setzeSitzung(patch: Partial<Sitzung>): void {
  sitzung = { ...sitzung, ...patch }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getSitzung(): Sitzung {
  return sitzung
}

export function useSitzung(): Sitzung {
  return useSyncExternalStore(subscribe, getSitzung, getSitzung)
}

// ---------- Anmeldung ----------

export async function pruefeAnmeldung(): Promise<void> {
  try {
    const { benutzer } = await api.me()
    setzeSitzung({ status: 'angemeldet', benutzer, fehler: null })
    void fuehreSyncAus()
  } catch (fehler) {
    if (fehler instanceof ApiFehler && fehler.istAbgemeldet) {
      setzeSitzung({ status: 'abgemeldet', benutzer: null, syncStatus: 'inaktiv' })
    } else {
      // Kein Backend erreichbar: Die App läuft weiterhin rein lokal.
      setzeSitzung({ status: 'lokal', benutzer: null, syncStatus: 'inaktiv' })
    }
  }
}

export async function anmelden(benutzername: string, passwort: string): Promise<void> {
  const { benutzer } = await api.login(benutzername, passwort)
  setzeSitzung({ status: 'angemeldet', benutzer, fehler: null })
  await fuehreSyncAus()
}

export async function abmelden(): Promise<void> {
  try {
    await api.logout()
  } catch {
    // Auch wenn der Server nicht antwortet: lokal abmelden.
  }
  setzeSitzung({ status: 'abgemeldet', benutzer: null, syncStatus: 'inaktiv', fehler: null })
}

// ---------- Abgleich ----------

let laeuft = false
/** Verhindert, dass der Abgleich sich über seine eigene Änderung selbst auslöst. */
let eigeneAenderung = false

export async function fuehreSyncAus(): Promise<void> {
  if (laeuft || sitzung.status !== 'angemeldet') return
  laeuft = true
  setzeSitzung({ syncStatus: 'laeuft' })

  try {
    const vorher = getState()
    const { paket, gesendet } = sammleAenderungen(vorher)
    const antwort = await api.sync(vorher.sync.stand, paket)

    // Zwischenzeitlich kann sich lokal etwas geändert haben.
    const aktuell = getState()
    const zusammengefuehrt = wendeAn(aktuell, antwort.aenderungen, antwort.stand)

    eigeneAenderung = true
    ersetzeState({
      ...zusammengefuehrt,
      ausstehend: nachErfolg(zusammengefuehrt, gesendet),
    })
    eigeneAenderung = false

    setzeSitzung({ syncStatus: 'ok', fehler: null })

    // Noch offene Änderungen sofort nachschieben.
    if (!istPaketLeer(sammleAenderungen(getState()).paket)) {
      laeuft = false
      void fuehreSyncAus()
      return
    }
  } catch (fehler) {
    eigeneAenderung = false
    if (fehler instanceof ApiFehler && fehler.istAbgemeldet) {
      setzeSitzung({
        status: 'abgemeldet',
        benutzer: null,
        syncStatus: 'inaktiv',
        fehler: null,
      })
    } else {
      const nachricht = fehler instanceof Error ? fehler.message : 'Abgleich fehlgeschlagen'
      setzeSitzung({ syncStatus: 'fehler', fehler: nachricht })
    }
  } finally {
    laeuft = false
  }
}

const SYNC_VERZOEGERUNG_MS = 1500
const SYNC_INTERVALL_MS = 60_000

let zeitgeber: ReturnType<typeof setTimeout> | null = null

function planeSync(verzoegerung = SYNC_VERZOEGERUNG_MS): void {
  if (zeitgeber) clearTimeout(zeitgeber)
  zeitgeber = setTimeout(() => {
    zeitgeber = null
    void fuehreSyncAus()
  }, verzoegerung)
}

let gestartet = false

/** Startet Anmeldeprüfung und regelmäßigen Abgleich. Wirkt nur beim ersten Aufruf. */
export function starteSynchronisation(): void {
  if (gestartet) return
  gestartet = true

  void pruefeAnmeldung()

  // Lokale Änderungen gebündelt hochladen.
  subscribeStore(() => {
    if (eigeneAenderung) return
    planeSync()
  })

  window.addEventListener('online', () => planeSync(200))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') planeSync(200)
  })
  setInterval(() => void fuehreSyncAus(), SYNC_INTERVALL_MS)
}

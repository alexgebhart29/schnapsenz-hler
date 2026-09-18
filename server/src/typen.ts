/** Austauschformat zwischen App und Server. Spiegelbild zu src/core/sync.ts im Client. */

export type SyncEintrag = {
  id: string
  geaendertAm: number
  geloescht?: boolean
  /** Vollständiger Datensatz als JSON; fehlt bei Löschungen. */
  daten?: unknown
}

export type NamensEintrag = {
  name: string
  geaendertAm: number
  geloescht?: boolean
}

export type EinstellungsEintrag = {
  schluessel: string
  wert: unknown
  geaendertAm: number
}

export type SyncPaket = {
  spiele: SyncEintrag[]
  ranks: SyncEintrag[]
  kategorien: SyncEintrag[]
  namen: NamensEintrag[]
  einstellungen: EinstellungsEintrag[]
}

export type SyncAnfrage = {
  /** Zuletzt vom Server erhaltener Stand (Sequenznummer). */
  seit: number
  aenderungen: SyncPaket
}

export type SyncAntwort = {
  /** Neuer Stand, den der Client beim nächsten Mal als `seit` schickt. */
  stand: number
  /** Serverzeit in ms – der Client kann damit Uhrabweichungen erkennen. */
  serverZeit: number
  aenderungen: SyncPaket
}

export const LEERES_PAKET = (): SyncPaket => ({
  spiele: [],
  ranks: [],
  kategorien: [],
  namen: [],
  einstellungen: [],
})

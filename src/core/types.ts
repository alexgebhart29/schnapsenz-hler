/** Index eines Spielers innerhalb eines Spiels. */
export type SpielerIndex = 0 | 1

export type Theme = 'system' | 'hell' | 'dunkel'

export type Settings = {
  /** Startwert des Countdown-Zählers im Zweier (Standard 7). Wird synchronisiert. */
  startwert: number
  /** Startwert im Vierer (Standard 24). Wird synchronisiert. */
  startwertVierer: number
  /** Bleibt geräteabhängig und wird nicht synchronisiert. */
  theme: Theme
}

/** Zweier-Schnapsen (1 gegen 1) oder Vierer-Schnapsen (2 gegen 2 in festen Teams). */
export type Modus = 'zweier' | 'vierer'

export type Rank = {
  id: string
  name: string
  punkte: number
  /** Jede Spielform hat ihre eigene Rangliste. */
  modus: Modus
  /** Zeitpunkt der letzten Änderung – entscheidet Konflikte beim Abgleich. */
  geaendertAm: number
}

/** Ein abgeschlossenes Bummerl innerhalb eines Spiels. */
export type BummerlEintrag = {
  /** 1-basierte Nummer des Bummerls innerhalb des Spiels. */
  nummer: number
  gewinner: SpielerIndex
  /** Punktestand beider Spieler bei Abschluss des Bummerls. */
  endstand: [number, number]
  beendetAm: string
}

/** Momentaufnahme für die Undo-Funktion. */
export type UndoEintrag = {
  label: string
  punkte: [number, number]
  bummerl: [number, number]
  bummerlLog: BummerlEintrag[]
  status: SpielStatus
  beendetAm?: string
}

export type SpielStatus = 'laufend' | 'beendet'

export type Spiel = {
  id: string
  /** ISO-Zeitstempel des Spielstarts. */
  datum: string
  modus: Modus
  /** Die beiden Parteien: im Zweier je ein Spieler, im Vierer der erste des Teams. */
  spieler: [string, string]
  /** Nur im Vierer: der Partner der jeweiligen Partei. */
  partner?: [string, string]
  startwert: number
  /** Gewonnene Bummerl je Spieler. */
  bummerl: [number, number]
  /** Aktueller Countdown-Stand je Spieler. */
  punkte: [number, number]
  status: SpielStatus
  bummerlLog: BummerlEintrag[]
  undoStack: UndoEintrag[]
  beendetAm?: string
  /** Zeitpunkt der letzten Änderung – entscheidet Konflikte beim Abgleich. */
  geaendertAm: number
}

/** Gemerkter Spielername. */
export type NamensEintrag = {
  name: string
  geaendertAm: number
}

/** Gelöschte Einträge, damit die Löschung auch andere Geräte erreicht. */
export type Grabsteine = {
  spiele: Record<string, number>
  ranks: Record<string, number>
  /** Schlüssel ist der Name in Kleinschreibung. */
  namen: Record<string, number>
}

/** Lokale Änderungen, die der Server noch nicht kennt. */
export type Ausstehend = {
  spiele: string[]
  ranks: string[]
  /** Schlüssel ist der Name in Kleinschreibung. */
  namen: string[]
  einstellungen: string[]
}

export type SyncZustand = {
  /** Wasserzeichen des Servers (Sequenznummer) vom letzten Abgleich. */
  stand: number
  /** Zeitpunkt des letzten erfolgreichen Abgleichs. */
  zuletztAm: number | null
}

export type AppState = {
  version: 2
  settings: Settings
  /** Zeitpunkte der letzten Änderung je synchronisierter Einstellung. */
  einstellungenGeaendertAm: Record<string, number>
  /** Zuletzt verwendete Spielernamen, neueste zuerst. */
  namen: NamensEintrag[]
  ranks: Rank[]
  /** Alle Spiele, neueste zuerst. */
  spiele: Spiel[]
  /** Das Spiel, das beim Öffnen fortgesetzt werden kann. Bleibt lokal. */
  aktivesSpielId: string | null
  grabsteine: Grabsteine
  ausstehend: Ausstehend
  sync: SyncZustand
}

// ---------- Austauschformat mit dem Server ----------

export type SyncEintrag = {
  id: string
  geaendertAm: number
  geloescht?: boolean
  daten?: unknown
}

export type SyncNamensEintrag = {
  name: string
  geaendertAm: number
  geloescht?: boolean
}

export type SyncEinstellung = {
  schluessel: string
  wert: unknown
  geaendertAm: number
}

export type SyncPaket = {
  spiele: SyncEintrag[]
  ranks: SyncEintrag[]
  namen: SyncNamensEintrag[]
  einstellungen: SyncEinstellung[]
}

export type SyncAntwort = {
  stand: number
  serverZeit: number
  aenderungen: SyncPaket
}

export type Benutzer = {
  id: string
  benutzername: string
  istAdmin: boolean
  erstelltAm: number
}

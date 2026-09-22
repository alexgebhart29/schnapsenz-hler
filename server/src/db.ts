import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { config } from './config.js'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS benutzer (
  id            TEXT PRIMARY KEY,
  benutzername  TEXT NOT NULL UNIQUE COLLATE NOCASE,
  passwort_hash TEXT NOT NULL,
  ist_admin     INTEGER NOT NULL DEFAULT 0,
  erstellt_am   INTEGER NOT NULL,
  geaendert_am  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sitzungen (
  token_hash   TEXT PRIMARY KEY,
  benutzer_id  TEXT NOT NULL REFERENCES benutzer(id) ON DELETE CASCADE,
  erstellt_am  INTEGER NOT NULL,
  laeuft_ab_am INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sitzungen_benutzer ON sitzungen(benutzer_id);

-- Fortlaufende Server-Sequenz als Wasserzeichen für die Synchronisation.
-- Unabhängig von den (womöglich falsch gehenden) Uhren der Geräte.
CREATE TABLE IF NOT EXISTS meta (
  schluessel TEXT PRIMARY KEY,
  wert       INTEGER NOT NULL
);
INSERT OR IGNORE INTO meta (schluessel, wert) VALUES ('folge', 0);

-- Synchronisierte Daten. Alle angemeldeten Benutzer teilen sich diesen Bestand.
-- geaendert_am entscheidet Konflikte (jüngere Änderung gewinnt),
-- folge steuert, was ein Gerät seit seinem letzten Abgleich noch nicht kennt.
CREATE TABLE IF NOT EXISTS spiele (
  id            TEXT PRIMARY KEY,
  geaendert_am  INTEGER NOT NULL,
  folge         INTEGER NOT NULL DEFAULT 0,
  geloescht     INTEGER NOT NULL DEFAULT 0,
  daten         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_spiele_folge ON spiele(folge);

CREATE TABLE IF NOT EXISTS ranks (
  id            TEXT PRIMARY KEY,
  geaendert_am  INTEGER NOT NULL,
  folge         INTEGER NOT NULL DEFAULT 0,
  geloescht     INTEGER NOT NULL DEFAULT 0,
  daten         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ranks_folge ON ranks(folge);

CREATE TABLE IF NOT EXISTS kategorien (
  id            TEXT PRIMARY KEY,
  geaendert_am  INTEGER NOT NULL,
  folge         INTEGER NOT NULL DEFAULT 0,
  geloescht     INTEGER NOT NULL DEFAULT 0,
  daten         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kategorien_folge ON kategorien(folge);

CREATE TABLE IF NOT EXISTS namen (
  schluessel    TEXT PRIMARY KEY,
  anzeige       TEXT NOT NULL,
  geaendert_am  INTEGER NOT NULL,
  folge         INTEGER NOT NULL DEFAULT 0,
  geloescht     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_namen_folge ON namen(folge);

CREATE TABLE IF NOT EXISTS einstellungen (
  schluessel    TEXT PRIMARY KEY,
  wert          TEXT NOT NULL,
  geaendert_am  INTEGER NOT NULL,
  folge         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_einstellungen_folge ON einstellungen(folge);
`

/** Ergänzt Spalten, die in älteren Datenbanken noch fehlen. */
function migriere(db: DatabaseSync): void {
  const spalten = db.prepare('PRAGMA table_info(benutzer)').all() as { name: string }[]
  if (!spalten.some((spalte) => spalte.name === 'darf_anmelden')) {
    // Bestehende Konten sind Anmelde-Konten; reine Spielernamen kommen neu dazu.
    db.exec('ALTER TABLE benutzer ADD COLUMN darf_anmelden INTEGER NOT NULL DEFAULT 1')
  }
}

export function oeffneDatenbank(datei: string = config.dbDatei): DatabaseSync {
  if (datei !== ':memory:') mkdirSync(dirname(datei), { recursive: true })

  const db = new DatabaseSync(datei)
  // WAL macht gleichzeitiges Lesen/Schreiben robuster, NORMAL reicht dafür aus.
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = NORMAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')
  db.exec(SCHEMA)
  migriere(db)
  return db
}

let instanz: DatabaseSync | null = null

export function db(): DatabaseSync {
  if (!instanz) instanz = oeffneDatenbank()
  return instanz
}

export function schliesseDatenbank(): void {
  instanz?.close()
  instanz = null
}

/** Nur für Tests: Datenbank durch eine andere ersetzen. */
export function setzeDatenbank(neu: DatabaseSync | null): void {
  instanz = neu
}

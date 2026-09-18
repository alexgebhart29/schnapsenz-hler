import { join, resolve } from 'node:path'

function zahl(wert: string | undefined, standard: number): number {
  const n = Number(wert)
  return Number.isFinite(n) && n > 0 ? n : standard
}

const datenVerzeichnis = resolve(process.env.DATA_DIR ?? './daten')

export const config = {
  port: zahl(process.env.PORT, 8080),
  /** Verzeichnis für die SQLite-Datei (im Docker-Setup ein Volume). */
  datenVerzeichnis,
  dbDatei: process.env.DB_FILE ?? join(datenVerzeichnis, 'schnapsen.sqlite'),
  /** Gebaute PWA (dist/). */
  statischesVerzeichnis: resolve(process.env.STATIC_DIR ?? './static'),

  /**
   * Hinter einem Reverse Proxy: Anzahl vertrauenswürdiger Proxys für
   * X-Forwarded-For. Standard 0 (nicht vertrauen) ist absichtlich sicher
   * voreingestellt: Läuft der Container ohne echten Proxy davor, könnte sonst
   * jeder Client per X-Forwarded-For eine beliebige "Absender-IP" behaupten
   * und damit die Login-Bremse (siehe http.ts) umgehen. Nur explizit auf die
   * tatsächliche Anzahl vorgeschalteter Proxys setzen.
   */
  vertrauteProxys: Number(process.env.TRUST_PROXY ?? 0),

  /** Secure-Flag am Session-Cookie. Nur für lokales HTTP auf false setzen. */
  cookieSicher: process.env.COOKIE_SECURE !== 'false',
  cookieName: 'schnapsen_session',
  sessionTage: zahl(process.env.SESSION_DAYS, 30),

  /** Erstanlage des Administrators beim ersten Start. */
  adminBenutzer: (process.env.ADMIN_USER ?? 'admin').trim(),
  adminPasswort: process.env.ADMIN_PASSWORD ?? '',

  /** Login-Versuche pro IP und Zeitfenster. */
  loginVersuche: zahl(process.env.LOGIN_ATTEMPTS, 10),
  loginFensterMinuten: zahl(process.env.LOGIN_WINDOW_MINUTES, 15),

  minPasswortLaenge: 8,
} as const

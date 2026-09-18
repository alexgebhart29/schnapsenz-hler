import type { NextFunction, Request, Response } from 'express'
import { config } from './config.js'
import { findeSitzungsBenutzer } from './sitzungen.js'
import type { Benutzer } from './benutzer.js'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      benutzer?: Benutzer
      sitzungsToken?: string
    }
  }
}

export function leseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null
  for (const teil of header.split(';')) {
    const index = teil.indexOf('=')
    if (index === -1) continue
    if (teil.slice(0, index).trim() === name) {
      return decodeURIComponent(teil.slice(index + 1).trim())
    }
  }
  return null
}

export function setzeSitzungsCookie(res: Response, token: string, laeuftAbAm: number): void {
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    secure: config.cookieSicher,
    sameSite: 'lax',
    path: '/',
    expires: new Date(laeuftAbAm),
  })
}

export function loescheSitzungsCookie(res: Response): void {
  res.clearCookie(config.cookieName, {
    httpOnly: true,
    secure: config.cookieSicher,
    sameSite: 'lax',
    path: '/',
  })
}

/** Hängt den angemeldeten Benutzer an die Anfrage, ohne sie abzulehnen. */
export function sitzung(req: Request, _res: Response, next: NextFunction): void {
  const token = leseCookie(req.headers.cookie, config.cookieName)
  if (token) {
    const benutzer = findeSitzungsBenutzer(token)
    if (benutzer) {
      req.benutzer = benutzer
      req.sitzungsToken = token
    }
  }
  next()
}

export function nurAngemeldet(req: Request, res: Response, next: NextFunction): void {
  if (!req.benutzer) {
    res.status(401).json({ fehler: 'nicht angemeldet' })
    return
  }
  next()
}

export function nurAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.benutzer) {
    res.status(401).json({ fehler: 'nicht angemeldet' })
    return
  }
  if (!req.benutzer.istAdmin) {
    res.status(403).json({ fehler: 'nur für Administratoren' })
    return
  }
  next()
}

/**
 * Schreibende Aufrufe müssen JSON sein. Zusammen mit SameSite=Lax verhindert
 * das Anfragen von fremden Seiten (CSRF), die nur Formulare abschicken können.
 */
export function nurJson(req: Request, res: Response, next: NextFunction): void {
  if (!req.is('application/json')) {
    res.status(415).json({ fehler: 'application/json erwartet' })
    return
  }
  next()
}

type Versuch = { anzahl: number; bisher: number }
const versuche = new Map<string, Versuch>()

/**
 * Verwirft abgelaufene Einträge. Ohne das würde die Map bei vielen
 * unterschiedlichen Absender-IPs (z. B. über IPv6 oder einen Bot-Schwarm)
 * unbegrenzt wachsen. Läuft nebenbei bei jeder Login-Anfrage mit; das ist bei
 * der hier zu erwartenden Größenordnung (Heimgebrauch) vernachlässigbar.
 */
function raeumeVersucheAuf(jetzt: number, fenster: number): void {
  for (const [schluessel, eintrag] of versuche) {
    if (jetzt - eintrag.bisher >= fenster) versuche.delete(schluessel)
  }
}

/** Einfache Bremse gegen Passwort-Raten, pro IP. */
export function loginBremse(req: Request, res: Response, next: NextFunction): void {
  const jetzt = Date.now()
  const fenster = config.loginFensterMinuten * 60_000
  const schluessel = req.ip ?? 'unbekannt'

  if (versuche.size > 10_000) raeumeVersucheAuf(jetzt, fenster)

  const eintrag = versuche.get(schluessel)
  if (eintrag && jetzt - eintrag.bisher < fenster) {
    if (eintrag.anzahl >= config.loginVersuche) {
      const sekunden = Math.ceil((fenster - (jetzt - eintrag.bisher)) / 1000)
      res.status(429).json({ fehler: `zu viele Versuche, bitte in ${sekunden} s erneut probieren` })
      return
    }
  } else {
    versuche.set(schluessel, { anzahl: 0, bisher: jetzt })
  }
  next()
}

export function zaehleFehlversuch(req: Request): void {
  const schluessel = req.ip ?? 'unbekannt'
  const eintrag = versuche.get(schluessel)
  if (eintrag) eintrag.anzahl += 1
  else versuche.set(schluessel, { anzahl: 1, bisher: Date.now() })
}

export function loescheFehlversuche(req: Request): void {
  versuche.delete(req.ip ?? 'unbekannt')
}

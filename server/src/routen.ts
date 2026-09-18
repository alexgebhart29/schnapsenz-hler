import { Router, type Request, type Response } from 'express'
import { config } from './config.js'
import {
  alleBenutzer,
  anzahlAdmins,
  findeBenutzer,
  findeBenutzerName,
  legeBenutzerAn,
  loescheBenutzer,
  pruefeAnmeldung,
  setzePasswort,
} from './benutzer.js'
import {
  beendeAlleSitzungen,
  beendeSitzung,
  erstelleSitzung,
} from './sitzungen.js'
import {
  loescheFehlversuche,
  loginBremse,
  nurAdmin,
  nurAngemeldet,
  nurJson,
  loescheSitzungsCookie,
  setzeSitzungsCookie,
  zaehleFehlversuch,
} from './http.js'
import { pruefeSyncAnfrage } from './validierung.js'
import { synchronisiere } from './sync.js'

export const routen = Router()

const text = (wert: unknown): string => (typeof wert === 'string' ? wert : '')

function passwortFehler(passwort: string): string | null {
  if (passwort.length < config.minPasswortLaenge) {
    return `Passwort muss mindestens ${config.minPasswortLaenge} Zeichen haben`
  }
  if (passwort.length > 200) return 'Passwort ist zu lang'
  return null
}

function benutzernameFehler(name: string): string | null {
  if (name.length < 2) return 'Benutzername muss mindestens 2 Zeichen haben'
  if (name.length > 40) return 'Benutzername ist zu lang'
  if (!/^[\p{L}\p{N} ._-]+$/u.test(name)) return 'Benutzername enthält unerlaubte Zeichen'
  return null
}

// ---------- Anmeldung ----------

routen.get('/auth/me', (req: Request, res: Response) => {
  if (!req.benutzer) {
    res.status(401).json({ fehler: 'nicht angemeldet' })
    return
  }
  res.json({ benutzer: req.benutzer })
})

routen.post('/auth/login', nurJson, loginBremse, async (req: Request, res: Response) => {
  const benutzername = text(req.body?.benutzername).trim()
  const passwort = text(req.body?.passwort)

  if (!benutzername || !passwort) {
    res.status(400).json({ fehler: 'Benutzername und Passwort nötig' })
    return
  }

  const benutzer = await pruefeAnmeldung(benutzername, passwort)
  if (!benutzer) {
    zaehleFehlversuch(req)
    res.status(401).json({ fehler: 'Benutzername oder Passwort stimmt nicht' })
    return
  }

  loescheFehlversuche(req)
  const { token, laeuftAbAm } = erstelleSitzung(benutzer.id)
  setzeSitzungsCookie(res, token, laeuftAbAm)
  res.json({ benutzer })
})

routen.post('/auth/logout', (req: Request, res: Response) => {
  if (req.sitzungsToken) beendeSitzung(req.sitzungsToken)
  loescheSitzungsCookie(res)
  res.json({ ok: true })
})

routen.post('/auth/passwort', nurJson, nurAngemeldet, async (req: Request, res: Response) => {
  const altes = text(req.body?.altesPasswort)
  const neues = text(req.body?.neuesPasswort)

  const fehler = passwortFehler(neues)
  if (fehler) {
    res.status(400).json({ fehler })
    return
  }

  const benutzer = req.benutzer!
  if (!(await pruefeAnmeldung(benutzer.benutzername, altes))) {
    res.status(401).json({ fehler: 'Aktuelles Passwort stimmt nicht' })
    return
  }

  await setzePasswort(benutzer.id, neues)
  // Andere Geräte abmelden, aber die eigene Sitzung behalten.
  beendeAlleSitzungen(benutzer.id)
  const { token, laeuftAbAm } = erstelleSitzung(benutzer.id)
  setzeSitzungsCookie(res, token, laeuftAbAm)
  res.json({ ok: true })
})

// ---------- Benutzerverwaltung (nur Admin) ----------

routen.get('/benutzer', nurAdmin, (_req: Request, res: Response) => {
  res.json({ benutzer: alleBenutzer() })
})

routen.post('/benutzer', nurJson, nurAdmin, async (req: Request, res: Response) => {
  const benutzername = text(req.body?.benutzername).trim()
  const passwort = text(req.body?.passwort)
  const istAdmin = req.body?.istAdmin === true

  const nameFehler = benutzernameFehler(benutzername)
  if (nameFehler) {
    res.status(400).json({ fehler: nameFehler })
    return
  }
  const pwFehler = passwortFehler(passwort)
  if (pwFehler) {
    res.status(400).json({ fehler: pwFehler })
    return
  }
  if (findeBenutzerName(benutzername)) {
    res.status(409).json({ fehler: 'Benutzername ist schon vergeben' })
    return
  }

  res.status(201).json({ benutzer: await legeBenutzerAn(benutzername, passwort, istAdmin) })
})

routen.post('/benutzer/:id/passwort', nurJson, nurAdmin, async (req: Request, res: Response) => {
  const passwort = text(req.body?.passwort)
  const fehler = passwortFehler(passwort)
  if (fehler) {
    res.status(400).json({ fehler })
    return
  }
  const benutzer = findeBenutzer(String(req.params.id))
  if (!benutzer) {
    res.status(404).json({ fehler: 'Benutzer nicht gefunden' })
    return
  }

  await setzePasswort(benutzer.id, passwort)
  beendeAlleSitzungen(benutzer.id)
  res.json({ ok: true })
})

routen.delete('/benutzer/:id', nurAdmin, (req: Request, res: Response) => {
  const benutzer = findeBenutzer(String(req.params.id))
  if (!benutzer) {
    res.status(404).json({ fehler: 'Benutzer nicht gefunden' })
    return
  }
  if (benutzer.id === req.benutzer!.id) {
    res.status(400).json({ fehler: 'Das eigene Konto kann nicht gelöscht werden' })
    return
  }
  if (benutzer.istAdmin && anzahlAdmins() <= 1) {
    res.status(400).json({ fehler: 'Der letzte Administrator kann nicht gelöscht werden' })
    return
  }

  loescheBenutzer(benutzer.id)
  res.json({ ok: true })
})

// ---------- Synchronisation ----------

routen.post('/sync', nurJson, nurAngemeldet, (req: Request, res: Response) => {
  const gepruft = pruefeSyncAnfrage(req.body)
  if ('fehler' in gepruft) {
    res.status(400).json({ fehler: gepruft.fehler })
    return
  }
  res.json(synchronisiere(gepruft.anfrage))
})

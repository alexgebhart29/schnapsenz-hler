/**
 * WebSocket-Server für den Online-Spielmodus. Hakt sich in das native
 * `upgrade`-Event des von Express zurückgegebenen `http.Server` ein –
 * Express selbst berührt Upgrades nicht, daher ist keine Bypass-Logik nötig.
 *
 * Authentifizierung: derselbe Session-Cookie-Mechanismus wie die REST-API
 * (siehe http.ts/sitzungen.ts) – Browser schicken das Cookie automatisch auch
 * bei der Upgrade-Anfrage mit. Teilnehmer sind damit immer angemeldete
 * Benutzer; ihr Benutzername ist der Name in Anzeige und Zählung.
 */
import type { IncomingMessage, Server } from 'node:http'
import type { Socket } from 'node:net'
import { WebSocketServer, type WebSocket } from 'ws'
import { config } from '../config.js'
import { leseCookie } from '../http.js'
import { findeSitzungsBenutzer } from '../sitzungen.js'
import type { Farbe, Karte } from './karten.js'
import {
  entferneVerbindung,
  erstelleTisch,
  raeumeTischeAuf,
  sendeZustandAnAlle,
  tritteBei,
  ziehBubeTauschen,
  ziehKarteAus,
  ziehMelden,
  ziehZudrehen,
  type Teilnehmer,
  type Tisch,
  type TischStart,
} from './tisch.js'
import type { SpielerIndex } from './spielRegeln.js'
import {
  entferneVerbindungVierer,
  erstelleTischVierer,
  findeSitzVierer,
  raeumeTischeVierAuf,
  sendeAktuellenZustandAnAlleVierer,
  starteSpielVierer,
  tritteBeiVierer,
  wechsleSitzVierer,
  ziehAnsagen,
  ziehKarteAusVierer,
  ziehMeldenVierer,
  ziehPassen,
  ziehSpritzen,
  ziehSpritzenPassen,
  ziehTrumpfAufdecken,
  ziehTrumpfWaehlen,
  type TischVierer,
} from './vierer/tischVierer.js'
import type { Ansage, SitzIndex } from './vierer/spielRegelnVierer.js'

function istKarte(wert: unknown): wert is Karte {
  return (
    typeof wert === 'object' &&
    wert !== null &&
    typeof (wert as Karte).farbe === 'string' &&
    typeof (wert as Karte).rang === 'string'
  )
}

const GUELTIGE_FARBEN: Farbe[] = ['kreuz', 'pik', 'herz', 'karo']
const istFarbe = (wert: unknown): wert is Farbe => GUELTIGE_FARBEN.includes(wert as Farbe)

const GUELTIGE_ANSAGEN: Ansage[] = ['bettler', 'schnapser', 'gang', 'zehnerGang', 'bauernschnapser']
const istAnsage = (wert: unknown): wert is Ansage => GUELTIGE_ANSAGEN.includes(wert as Ansage)

/** Zwei-Zahlen-Tupel für einen übernommenen Bummerl-Stand beim Fortsetzen eines analogen Spiels. */
function leseTischStart(wert: unknown): TischStart | undefined {
  if (typeof wert !== 'object' || wert === null) return undefined
  const { bummerlPunkte, bummerl } = wert as { bummerlPunkte?: unknown; bummerl?: unknown }
  const istPaar = (w: unknown): w is [number, number] =>
    Array.isArray(w) && w.length === 2 && w.every((n) => typeof n === 'number')
  if (!istPaar(bummerlPunkte) || !istPaar(bummerl)) return undefined
  return { bummerlPunkte, bummerl }
}

/**
 * Ein Verbindungszustand: welcher Tisch (Zweier oder Vierer) gehört zu
 * diesem Socket. Beim Vierer wird der Sitzplatz NICHT gecacht, sondern über
 * `findeSitzVierer` je Nachricht neu ermittelt – im Warteraum kann sich der
 * Platz durch Tauschen jederzeit ändern.
 */
type VerbindungsZustand =
  | { art: 'zweier'; tisch: Tisch; meinIndex: SpielerIndex }
  | { art: 'vierer'; tisch: TischVierer }
  | null

function authentifiziere(anfrage: IncomingMessage): Teilnehmer | null {
  const token = leseCookie(anfrage.headers.cookie, config.cookieName)
  if (!token) return null
  const benutzer = findeSitzungsBenutzer(token)
  return benutzer ? { id: benutzer.id, name: benutzer.benutzername } : null
}

function verarbeiteNachricht(
  ws: WebSocket,
  teilnehmer: Teilnehmer,
  zustand: { wert: VerbindungsZustand },
  roh: unknown,
): void {
  if (typeof roh !== 'object' || roh === null) return
  const nachricht = roh as { typ?: unknown; [schluessel: string]: unknown }
  const senden = (payload: unknown) => ws.send(JSON.stringify(payload))

  if (nachricht.typ === 'tisch_erstellen') {
    const tisch = erstelleTisch(teilnehmer, senden, leseTischStart(nachricht.start))
    zustand.wert = { art: 'zweier', tisch, meinIndex: 0 }
    senden({ typ: 'tisch_erstellt' })
    sendeZustandAnAlle(tisch)
    return
  }

  if (nachricht.typ === 'tisch_beitreten') {
    const kennung = typeof nachricht.tisch === 'string' ? nachricht.tisch : ''
    const ergebnis = tritteBei(kennung, teilnehmer, senden)
    if (!ergebnis.ok) {
      senden({ typ: 'fehler', text: ergebnis.fehler })
      return
    }
    zustand.wert = { art: 'zweier', tisch: ergebnis.tisch, meinIndex: ergebnis.meinIndex }
    sendeZustandAnAlle(ergebnis.tisch)
    return
  }

  if (nachricht.typ === 'tisch_erstellen_vierer') {
    const bettlerErlaubt = nachricht.bettlerErlaubt === true
    const tisch = erstelleTischVierer(teilnehmer, senden, bettlerErlaubt)
    zustand.wert = { art: 'vierer', tisch }
    senden({ typ: 'tisch_erstellt' })
    sendeAktuellenZustandAnAlleVierer(tisch)
    return
  }

  if (nachricht.typ === 'tisch_beitreten_vierer') {
    const kennung = typeof nachricht.tisch === 'string' ? nachricht.tisch : ''
    const ergebnis = tritteBeiVierer(kennung, teilnehmer, senden)
    if (!ergebnis.ok) {
      senden({ typ: 'fehler', text: ergebnis.fehler })
      return
    }
    zustand.wert = { art: 'vierer', tisch: ergebnis.tisch }
    sendeAktuellenZustandAnAlleVierer(ergebnis.tisch)
    return
  }

  const laufend = zustand.wert
  if (!laufend) {
    senden({ typ: 'fehler', text: 'noch keinem Tisch beigetreten' })
    return
  }

  let fehlerText: string | null = null

  if (laufend.art === 'zweier') {
    const { tisch, meinIndex } = laufend
    switch (nachricht.typ) {
      case 'karte_spielen':
        if (!istKarte(nachricht.karte)) {
          fehlerText = 'ungültige Karte'
          break
        }
        fehlerText = ziehKarteAus(tisch, meinIndex, nachricht.karte)
        break
      case 'stock_zudrehen':
        fehlerText = ziehZudrehen(tisch, meinIndex)
        break
      case 'bube_tauschen':
        fehlerText = ziehBubeTauschen(tisch, meinIndex)
        break
      case 'melden':
        if (!istFarbe(nachricht.farbe)) {
          fehlerText = 'ungültige Farbe'
          break
        }
        fehlerText = ziehMelden(tisch, meinIndex, nachricht.farbe)
        break
      default:
        fehlerText = 'unbekannter Nachrichtentyp'
    }
  } else {
    const { tisch } = laufend

    if (nachricht.typ === 'sitz_wechseln') {
      const zielSitz = nachricht.sitz
      if (typeof zielSitz !== 'number' || zielSitz < 0 || zielSitz > 3) {
        senden({ typ: 'fehler', text: 'ungültiger Sitzplatz' })
        return
      }
      const fehler = wechsleSitzVierer(tisch, teilnehmer.id, zielSitz as SitzIndex)
      if (fehler) {
        senden({ typ: 'fehler', text: fehler })
        return
      }
      sendeAktuellenZustandAnAlleVierer(tisch)
      return
    }

    if (nachricht.typ === 'spiel_starten') {
      const fehler = starteSpielVierer(tisch, teilnehmer.id)
      if (fehler) {
        senden({ typ: 'fehler', text: fehler })
        return
      }
      sendeAktuellenZustandAnAlleVierer(tisch)
      return
    }

    const meinIndex = findeSitzVierer(tisch, teilnehmer.id)
    if (meinIndex === null) {
      senden({ typ: 'fehler', text: 'nicht an diesem Tisch' })
      return
    }
    switch (nachricht.typ) {
      case 'ansage_machen':
        if (!istAnsage(nachricht.ansage)) {
          fehlerText = 'ungültige Ansage'
          break
        }
        fehlerText = ziehAnsagen(tisch, meinIndex, nachricht.ansage)
        break
      case 'ansage_passen':
        fehlerText = ziehPassen(tisch, meinIndex)
        break
      case 'trumpf_waehlen':
        if (!istFarbe(nachricht.farbe)) {
          fehlerText = 'ungültige Farbe'
          break
        }
        fehlerText = ziehTrumpfWaehlen(tisch, meinIndex, nachricht.farbe)
        break
      case 'trumpf_aufdecken':
        fehlerText = ziehTrumpfAufdecken(tisch, meinIndex)
        break
      case 'spritzen_machen':
        fehlerText = ziehSpritzen(tisch, meinIndex)
        break
      case 'spritzen_passen':
        fehlerText = ziehSpritzenPassen(tisch, meinIndex)
        break
      case 'karte_spielen_vierer':
        if (!istKarte(nachricht.karte)) {
          fehlerText = 'ungültige Karte'
          break
        }
        fehlerText = ziehKarteAusVierer(tisch, meinIndex, nachricht.karte)
        break
      case 'melden':
        if (!istFarbe(nachricht.farbe)) {
          fehlerText = 'ungültige Farbe'
          break
        }
        fehlerText = ziehMeldenVierer(tisch, meinIndex, nachricht.farbe)
        break
      default:
        fehlerText = 'unbekannter Nachrichtentyp'
    }
  }

  if (fehlerText) senden({ typ: 'fehler', text: fehlerText })
}

export function registriereOnlineWebsocket(server: Server): void {
  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (anfrage: IncomingMessage, socket: Socket, kopf: Buffer) => {
    if (anfrage.url?.split('?')[0] !== '/api/online/ws') {
      socket.destroy()
      return
    }
    const teilnehmer = authentifiziere(anfrage)
    if (!teilnehmer) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }
    wss.handleUpgrade(anfrage, socket, kopf, (ws) => {
      wss.emit('connection', ws, anfrage, teilnehmer)
    })
  })

  wss.on('connection', (ws: WebSocket, _anfrage: IncomingMessage, teilnehmer: Teilnehmer) => {
    const zustand: { wert: VerbindungsZustand } = { wert: null }

    ws.on('message', (daten) => {
      try {
        verarbeiteNachricht(ws, teilnehmer, zustand, JSON.parse(daten.toString()))
      } catch {
        ws.send(JSON.stringify({ typ: 'fehler', text: 'ungültige Nachricht' }))
      }
    })

    ws.on('close', () => {
      if (!zustand.wert) return
      if (zustand.wert.art === 'zweier') {
        entferneVerbindung(zustand.wert.tisch, zustand.wert.meinIndex)
        return
      }
      const meinIndex = findeSitzVierer(zustand.wert.tisch, teilnehmer.id)
      if (meinIndex === null) return
      entferneVerbindungVierer(zustand.wert.tisch, meinIndex)
      // Falls gerade der/die Gastgeber:in offline geht, sofort die neue
      // Gastgeber-Zuordnung an alle noch verbundenen Spieler durchreichen.
      if (!zustand.wert.tisch.partie) sendeAktuellenZustandAnAlleVierer(zustand.wert.tisch)
    })
  })

  // Häufiger als der (längere) Tisch-Timeout, damit auch der kurze Timeout
  // für nie beigetretene Tische (siehe UNGENUTZTER_TISCH_TIMEOUT_MS) zeitnah greift.
  const AUFRAEUM_INTERVALL_MS = 60 * 1000
  setInterval(() => {
    raeumeTischeAuf()
    raeumeTischeVierAuf()
  }, AUFRAEUM_INTERVALL_MS).unref()
}

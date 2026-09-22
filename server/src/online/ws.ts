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

/** Zwei-Zahlen-Tupel für einen übernommenen Bummerl-Stand beim Fortsetzen eines analogen Spiels. */
function leseTischStart(wert: unknown): TischStart | undefined {
  if (typeof wert !== 'object' || wert === null) return undefined
  const { bummerlPunkte, bummerl } = wert as { bummerlPunkte?: unknown; bummerl?: unknown }
  const istPaar = (w: unknown): w is [number, number] =>
    Array.isArray(w) && w.length === 2 && w.every((n) => typeof n === 'number')
  if (!istPaar(bummerlPunkte) || !istPaar(bummerl)) return undefined
  return { bummerlPunkte, bummerl }
}

/** Ein Verbindungszustand: welcher Tisch, welcher Platz (0/1) gehört zu diesem Socket. */
type VerbindungsZustand = { tisch: Tisch; meinIndex: SpielerIndex } | null

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
    zustand.wert = { tisch, meinIndex: 0 }
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
    zustand.wert = { tisch: ergebnis.tisch, meinIndex: ergebnis.meinIndex }
    sendeZustandAnAlle(ergebnis.tisch)
    return
  }

  const laufend = zustand.wert
  if (!laufend) {
    senden({ typ: 'fehler', text: 'noch keinem Tisch beigetreten' })
    return
  }
  const { tisch, meinIndex } = laufend

  let fehlerText: string | null = null
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
      if (zustand.wert) entferneVerbindung(zustand.wert.tisch, zustand.wert.meinIndex)
    })
  })

  // Häufiger als der (längere) Tisch-Timeout, damit auch der kurze Timeout
  // für nie beigetretene Tische (siehe UNGENUTZTER_TISCH_TIMEOUT_MS) zeitnah greift.
  const AUFRAEUM_INTERVALL_MS = 60 * 1000
  setInterval(() => raeumeTischeAuf(), AUFRAEUM_INTERVALL_MS).unref()
}

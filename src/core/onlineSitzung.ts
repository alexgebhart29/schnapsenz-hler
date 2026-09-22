import { useSyncExternalStore } from 'react'
import type { Farbe, Karte } from './karten'
import { bummerlAbschliessen, entschieden, gegner, punkteAbziehen } from './schnapsen'
import { actions, getState } from './store'
import type { Spiel } from './types'

export type OnlineStatus =
  | 'getrennt'
  | 'verbindet'
  | 'wartet-auf-gegner'
  | 'laufend'

/** Spiegelbild von server/src/online/tisch.ts → OeffentlicheSicht. */
export type OeffentlicheSicht = {
  meinIndex: 0 | 1
  spielerNamen: [string, string]
  meineHand: Karte[]
  gegnerAnzahlKarten: number
  talonAnzahl: number
  trumpf: Farbe
  trumpfKarte: Karte | null
  amZug: 0 | 1
  offenerStich: { karte: Karte; spieler: 0 | 1 } | null
  geschlossenVon: (0 | 1) | null
  /** Nur die eigenen Augen – die des Gegners bleiben absichtlich verborgen. */
  meineAugen: number
  anzahlStiche: [number, number]
  legaleKarten: Karte[] | null
  kannZudrehen: boolean
  kannBubeTauschen: boolean
  meldbareFarben: Farbe[]
  status: 'laufend' | 'beendet'
  /** Bummerl-Zähler über den ganzen Tisch hinweg (mehrere Partien pro Bummerl). */
  bummerlPunkte: [number, number]
  bummerl: [number, number]
  /** Erster Stich, den der Gegner gewonnen hat. */
  ersterStichGegner: [Karte, Karte] | null
  /** Erster Stich, den ich selbst gewonnen habe. */
  ersterStichEigener: [Karte, Karte] | null
  /**
   * Sichtbare Stiche dieser Partie, chronologisch: alle eigenen, vom Gegner
   * nur der erste. `nummer` ist die echte Position im Stichverlauf des
   * Matches (kann daher Lücken aufweisen).
   */
  stichVerlauf: { nummer: number; sieger: 0 | 1; karten: [Karte, Karte] }[]
}

export type PartieErgebnis = { gewinner: 0 | 1; spielpunkte: 1 | 2 | 3 }
export type BummerlErgebnis = { gewinner: 0 | 1; bummerl: [number, number] }

export type OnlineZustand = {
  status: OnlineStatus
  sicht: OeffentlicheSicht | null
  letztesErgebnis: PartieErgebnis | null
  bummerlErgebnis: BummerlErgebnis | null
  fehler: string | null
  /** Lokaler Spiel-Datensatz (Historie/Rangliste), an den dieses Match gekoppelt ist. */
  verknuepftesSpielId: string | null
  /** Welche Partei ich in diesem lokalen Spiel bin (0 oder 1). */
  meineParteiImSpiel: 0 | 1 | null
  /** true, wenn ein bereits laufendes analoges Spiel fortgesetzt wurde (statt neu angelegt). */
  fortgesetztesSpiel: boolean
}

let zustand: OnlineZustand = {
  status: 'getrennt',
  sicht: null,
  letztesErgebnis: null,
  bummerlErgebnis: null,
  fehler: null,
  verknuepftesSpielId: null,
  meineParteiImSpiel: null,
  fortgesetztesSpiel: false,
}

/**
 * Übersetzt den tisch-absoluten Sieger einer Partie (0/1, unabhängig vom
 * eigenen Blickwinkel) in die Partei des verknüpften lokalen Spiels: Hab ich
 * gewonnen, zählt es für `meineParteiImSpiel`, sonst für den Gegner darin.
 */
export function bestimmeLokalenGewinner(
  serverGewinner: 0 | 1,
  meinIndex: 0 | 1,
  meineParteiImSpiel: 0 | 1,
): 0 | 1 {
  return serverGewinner === meinIndex ? meineParteiImSpiel : gegner(meineParteiImSpiel)
}

const listeners = new Set<() => void>()
let socket: WebSocket | null = null

function setzeZustand(patch: Partial<OnlineZustand>): void {
  zustand = { ...zustand, ...patch }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getOnlineZustand(): OnlineZustand {
  return zustand
}

export function useOnlineZustand(): OnlineZustand {
  return useSyncExternalStore(subscribe, getOnlineZustand, getOnlineZustand)
}

function socketUrl(): string {
  const protokoll = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protokoll}://${window.location.host}/api/online/ws`
}

function sende(nachricht: unknown): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(nachricht))
}

/**
 * Startet immer eine frische Verbindung für einen neuen Tisch-Versuch
 * (erstellen/beitreten). Eine ggf. noch offene alte Verbindung (z. B. weil
 * der Nutzer den Tisch-Bildschirm über den Zurück-Pfeil statt "Abbrechen"
 * verlassen hat) wird zuerst geschlossen – sonst würde die neue Aktion über
 * den alten Tisch laufen und altes "Partie beendet"-Dialogzeug hängen bleiben.
 */
function stelleVerbindungHer(nachErfolg: () => void): void {
  socket?.close()
  socket = null

  setzeZustand({
    status: 'verbindet',
    sicht: null,
    letztesErgebnis: null,
    bummerlErgebnis: null,
    fehler: null,
    verknuepftesSpielId: null,
    meineParteiImSpiel: null,
    fortgesetztesSpiel: false,
  })
  const ws = new WebSocket(socketUrl())
  socket = ws

  ws.addEventListener('open', () => nachErfolg())

  ws.addEventListener('message', (event) => {
    let daten: unknown
    try {
      daten = JSON.parse(String(event.data))
    } catch {
      return
    }
    if (typeof daten !== 'object' || daten === null) return
    const nachricht = daten as { typ?: string; [schluessel: string]: unknown }

    if (nachricht.typ === 'tisch_erstellt') {
      setzeZustand({ status: 'wartet-auf-gegner' })
      return
    }
    if (nachricht.typ === 'zustand') {
      const sicht = nachricht.sicht as OeffentlicheSicht

      // Noch kein lokaler Spiel-Datensatz verknüpft (weder ein fortgesetztes
      // analoges Spiel noch von einer vorherigen Partie in diesem Match) –
      // jetzt einen frischen anlegen, damit das Match in Historie/Rangliste
      // auftaucht.
      // Nur der Ersteller (Tisch-Index 0) schreibt den Datensatz: Alle Konten
      // teilen sich denselben synchronisierten Bestand, ein zweiter Datensatz
      // des Beitretenden würde das Match in Rangliste/Statistik doppelt zählen.
      // Der Beitretende erhält ihn über den normalen Abgleich.
      if (sicht.meinIndex === 0 && zustand.verknuepftesSpielId === null) {
        const meinName = sicht.spielerNamen[sicht.meinIndex]
        const gegnerName = sicht.spielerNamen[1 - sicht.meinIndex]
        const spiel = actions.neuesSpiel([meinName, gegnerName], {
          modus: 'zweier',
          startwert: sicht.bummerlPunkte[sicht.meinIndex],
        })
        zustand = { ...zustand, verknuepftesSpielId: spiel.id, meineParteiImSpiel: 0 }
      }

      setzeZustand({
        status: sicht.spielerNamen[1] === '…' ? 'wartet-auf-gegner' : 'laufend',
        sicht,
        fehler: null,
      })
      return
    }
    if (nachricht.typ === 'partie_beendet') {
      const serverGewinner = nachricht.gewinner as 0 | 1
      const spielpunkte = nachricht.spielpunkte as 1 | 2 | 3
      setzeZustand({ letztesErgebnis: { gewinner: serverGewinner, spielpunkte } })

      const { verknuepftesSpielId, meineParteiImSpiel, sicht } = zustand
      if (verknuepftesSpielId !== null && meineParteiImSpiel !== null && sicht !== null) {
        const localGewinner = bestimmeLokalenGewinner(serverGewinner, sicht.meinIndex, meineParteiImSpiel)
        const schneiderAktiv = getState().settings.schneiderAktiv
        actions.updateSpiel(verknuepftesSpielId, (s) => {
          const nach = punkteAbziehen(s, localGewinner, spielpunkte)
          const sieger = entschieden(nach)
          return sieger === null ? nach : bummerlAbschliessen(nach, sieger, undefined, schneiderAktiv)
        })
      }
      return
    }
    if (nachricht.typ === 'bummerl_gewonnen') {
      setzeZustand({
        bummerlErgebnis: {
          gewinner: nachricht.gewinner as 0 | 1,
          bummerl: nachricht.bummerl as [number, number],
        },
      })
      return
    }
    if (nachricht.typ === 'fehler') {
      setzeZustand({ fehler: String(nachricht.text) })
    }
  })

  ws.addEventListener('close', () => {
    if (socket === ws) {
      socket = null
      setzeZustand({ status: 'getrennt' })
    }
  })

  ws.addEventListener('error', () => {
    setzeZustand({ fehler: 'Verbindung fehlgeschlagen' })
  })
}

export const onlineAktionen = {
  tischErstellen(): void {
    stelleVerbindungHer(() => sende({ typ: 'tisch_erstellen' }))
  },

  /**
   * Setzt ein bereits laufendes, analoges (manuell gezähltes) Spiel online
   * fort: der aktuelle Punkte-/Bummerl-Stand wird zum Startwert des Tisches,
   * und Ergebnisse fließen weiter in genau diesen bestehenden Datensatz statt
   * einen neuen anzulegen.
   */
  tischErstellenAusSpiel(spiel: Spiel, meineParteiImSpiel: 0 | 1): void {
    const gegnerPartei = gegner(meineParteiImSpiel)
    const start = {
      bummerlPunkte: [spiel.punkte[meineParteiImSpiel], spiel.punkte[gegnerPartei]] as [
        number,
        number,
      ],
      bummerl: [spiel.bummerl[meineParteiImSpiel], spiel.bummerl[gegnerPartei]] as [number, number],
    }
    stelleVerbindungHer(() => sende({ typ: 'tisch_erstellen', start }))
    zustand = {
      ...zustand,
      verknuepftesSpielId: spiel.id,
      meineParteiImSpiel,
      fortgesetztesSpiel: true,
    }
  },

  /** Tritt dem in der Liste offener Tische gewählten Tisch bei (interne Kennung, wird nie angezeigt). */
  tischBeitreten(tischId: string): void {
    stelleVerbindungHer(() => sende({ typ: 'tisch_beitreten', tisch: tischId }))
  },

  karteSpielen(karte: Karte): void {
    sende({ typ: 'karte_spielen', karte })
  },

  zudrehen(): void {
    sende({ typ: 'stock_zudrehen' })
  },

  bubeTauschen(): void {
    sende({ typ: 'bube_tauschen' })
  },

  melden(farbe: Farbe): void {
    sende({ typ: 'melden', farbe })
  },

  letztesErgebnisQuittieren(): void {
    setzeZustand({ letztesErgebnis: null, bummerlErgebnis: null })
  },

  trennen(): void {
    socket?.close()
    socket = null
    setzeZustand({
      status: 'getrennt',
      sicht: null,
      letztesErgebnis: null,
      bummerlErgebnis: null,
      fehler: null,
      verknuepftesSpielId: null,
      meineParteiImSpiel: null,
      fortgesetztesSpiel: false,
    })
  },
}

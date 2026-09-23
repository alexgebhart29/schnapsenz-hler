import { useSyncExternalStore } from 'react'
import type { Farbe, Karte } from './karten'
import { bummerlAbschliessen, entschieden, punkteAbziehen } from './schnapsen'
import { actions, getState } from './store'
import type { Spiel } from './types'

export type OnlineStatusVierer = 'getrennt' | 'verbindet' | 'warteraum' | 'laufend'

export type SitzIndex = 0 | 1 | 2 | 3
export type TeamIndex = 0 | 1
export type Ansage = 'bettler' | 'schnapser' | 'gang' | 'zehnerGang' | 'bauernschnapser'

/**
 * Warteraum vor dem eigentlichen Spiel: die 4 Beitretenden sehen hier, wer
 * schon auf welchem Platz sitzt (Platz 1+3 = Team A, Platz 2+4 = Team B) und
 * können frei tauschen, bis der/die Gastgeber:in startet – wie eine
 * Teamaufstellung. Spiegelbild von tischVierer.ts → WarteraumSichtVierer.
 */
export type WarteraumSichtVierer = {
  meinIndex: SitzIndex
  plaetze: (string | null)[]
  binGastgeber: boolean
  kannStarten: boolean
  /** Gesetzt bei einem fortgesetzten Spiel: Plätze sind fest vergeben, kein Tauschen möglich. */
  erwarteteNamen: [string, string, string, string] | null
}

export const ANSAGE_LABEL: Record<Ansage, string> = {
  bettler: 'Bettler',
  schnapser: 'Schnapser',
  gang: 'Gang',
  zehnerGang: '10er Gang',
  bauernschnapser: 'Bauernschnapser',
}

/** Spiegelbild von server/src/online/vierer/tischVierer.ts → OeffentlicheSichtVierer. */
export type OeffentlicheSichtVierer = {
  meinIndex: SitzIndex
  spielerNamen: [string, string, string, string]
  meineHand: Karte[]
  kartenAnzahl: [number, number, number, number]
  phase: 'ansage' | 'trumpfwahl' | 'spritzen' | 'spielt' | 'beendet'
  amZug: SitzIndex
  offenerStich: { karte: Karte; spieler: SitzIndex }[]
  trumpf: Farbe | null
  aufgedeckteTrumpfkarte: Karte | null
  ansageAnDerReihe: SitzIndex
  ansageHoechste: { ansage: Ansage; spieler: SitzIndex } | null
  ansageGepasst: SitzIndex[]
  ansageGewinner: SitzIndex | null
  aktiveAnsage: { ansage: Ansage; spieler: SitzIndex; team: TeamIndex } | null
  spritzenStufe: 0 | 1 | 2
  spritzenAmZug: TeamIndex | null
  spritzenFaktor: 1 | 2 | 4
  moeglicheAnsagen: Ansage[]
  kannPassenAnsage: boolean
  kannTrumpfBestimmen: boolean
  kannSpritzen: boolean
  legaleKarten: Karte[] | null
  meldbareFarben: Farbe[]
  bettlerErlaubt: boolean
  bummerlPunkte: [number, number]
  bummerl: [number, number]
  gewinnerTeam: TeamIndex | null
  spielpunkte: number | null
  istFortsetzung: boolean
}

export type PartieErgebnisVierer = { gewinnerTeam: TeamIndex; spielpunkte: number }
export type BummerlErgebnisVierer = { gewinnerTeam: TeamIndex; bummerl: [number, number] }

export type OnlineZustandVierer = {
  status: OnlineStatusVierer
  warteraumSicht: WarteraumSichtVierer | null
  sicht: OeffentlicheSichtVierer | null
  letztesErgebnis: PartieErgebnisVierer | null
  bummerlErgebnis: BummerlErgebnisVierer | null
  fehler: string | null
  /** Lokaler Spiel-Datensatz (Historie/Rangliste), an den dieses Match gekoppelt ist. */
  verknuepftesSpielId: string | null
  /** true, wenn ein bereits laufendes Spiel (analog oder online begonnen) fortgesetzt wurde. */
  fortgesetzt: boolean
}

let zustand: OnlineZustandVierer = {
  status: 'getrennt',
  warteraumSicht: null,
  sicht: null,
  letztesErgebnis: null,
  bummerlErgebnis: null,
  fehler: null,
  verknuepftesSpielId: null,
  fortgesetzt: false,
}

const listeners = new Set<() => void>()
let socket: WebSocket | null = null

function setzeZustand(patch: Partial<OnlineZustandVierer>): void {
  zustand = { ...zustand, ...patch }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getOnlineZustandVierer(): OnlineZustandVierer {
  return zustand
}

export function useOnlineZustandVierer(): OnlineZustandVierer {
  return useSyncExternalStore(subscribe, getOnlineZustandVierer, getOnlineZustandVierer)
}

function socketUrl(): string {
  const protokoll = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protokoll}://${window.location.host}/api/online/ws`
}

function sende(nachricht: unknown): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(nachricht))
}

/** Siehe onlineSitzung.ts (Zweier) für die Begründung: immer frisch verbinden statt eine alte Verbindung wiederzuverwenden. */
function stelleVerbindungHer(nachErfolg: () => void): void {
  socket?.close()
  socket = null

  setzeZustand({
    status: 'verbindet',
    warteraumSicht: null,
    sicht: null,
    letztesErgebnis: null,
    bummerlErgebnis: null,
    fehler: null,
    verknuepftesSpielId: null,
    fortgesetzt: false,
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
      setzeZustand({ status: 'warteraum' })
      return
    }
    if (nachricht.typ === 'warteraum4') {
      setzeZustand({ status: 'warteraum', warteraumSicht: nachricht.sicht as WarteraumSichtVierer, fehler: null })
      return
    }
    if (nachricht.typ === 'zustand4') {
      const sicht = nachricht.sicht as OeffentlicheSichtVierer

      // Nur Sitz 0 legt den lokalen Spiel-Datensatz an – alle Geräte teilen
      // sich denselben synchronisierten Bestand, ein zweiter Datensatz würde
      // das Match doppelt zählen (siehe onlineSitzung.ts, Zweier-Pendant).
      // Bei einer Fortsetzung nie automatisch anlegen: der Datensatz existiert
      // bereits, und die eröffnende Person hat verknuepftesSpielId längst
      // gesetzt (unabhängig davon, wer zufällig auf Sitz 0 landet).
      if (!sicht.istFortsetzung && sicht.meinIndex === 0 && zustand.verknuepftesSpielId === null) {
        const [name0, name1, name2, name3] = sicht.spielerNamen
        const spiel = actions.neuesSpiel([name0, name1], {
          modus: 'vierer',
          partner: [name2, name3],
          startwert: sicht.bummerlPunkte[0],
        })
        zustand = { ...zustand, verknuepftesSpielId: spiel.id }
      }

      setzeZustand({ status: 'laufend', warteraumSicht: null, sicht, fehler: null })
      return
    }
    if (nachricht.typ === 'partie4_beendet') {
      const gewinnerTeam = nachricht.gewinnerTeam as TeamIndex
      const spielpunkte = nachricht.spielpunkte as number
      setzeZustand({ letztesErgebnis: { gewinnerTeam, spielpunkte } })

      const { verknuepftesSpielId } = zustand
      if (verknuepftesSpielId !== null) {
        const schneiderAktiv = getState().settings.schneiderAktiv
        actions.updateSpiel(verknuepftesSpielId, (s) => {
          // Team-Index entspricht hier direkt dem lokalen Partei-Index (siehe
          // Anlage oben: Team 0 = spieler[0]+partner[0], Team 1 = spieler[1]+partner[1]).
          const nach = punkteAbziehen(s, gewinnerTeam, spielpunkte)
          const sieger = entschieden(nach)
          return sieger === null ? nach : bummerlAbschliessen(nach, sieger, undefined, schneiderAktiv)
        })
      }
      return
    }
    if (nachricht.typ === 'bummerl4_gewonnen') {
      setzeZustand({
        bummerlErgebnis: {
          gewinnerTeam: nachricht.gewinnerTeam as TeamIndex,
          bummerl: nachricht.bummerl as [number, number],
        },
      })
      return
    }
    if (nachricht.typ === 'fehler') {
      // Schlägt der Beitritt/das Erstellen selbst fehl (z. B. "Tisch schon
      // voll"), kommt nie ein warteraum4/zustand4 hinterher – ohne diesen
      // Reset bliebe der Status für immer bei 'verbindet' hängen und der
      // "Beitreten"-Button dauerhaft ausgegraut.
      const nochAmVerbinden = zustand.status === 'verbindet'
      if (nochAmVerbinden) {
        socket?.close()
        socket = null
      }
      setzeZustand({ fehler: String(nachricht.text), status: nochAmVerbinden ? 'getrennt' : zustand.status })
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

export const onlineAktionenVierer = {
  tischErstellen(bettlerErlaubt: boolean): void {
    stelleVerbindungHer(() => sende({ typ: 'tisch_erstellen_vierer', bettlerErlaubt }))
  },

  tischBeitreten(tischId: string): void {
    stelleVerbindungHer(() => sende({ typ: 'tisch_beitreten_vierer', tisch: tischId }))
  },

  /**
   * Setzt ein bereits laufendes Vierer-Spiel (analog gezählt oder online
   * begonnen) fort: der aktuelle Punkte-/Bummerl-Stand wird zum Startwert
   * des Tisches, die 4 Plätze sind fest an die im Spiel gespeicherten Namen
   * gebunden (kein freies Tauschen im Warteraum) – siehe wechsleSitzVierer
   * (Server). Team 0 = spieler[0]+partner[0] (Platz 1+3), Team 1 =
   * spieler[1]+partner[1] (Platz 2+4).
   */
  tischErstellenAusSpiel(spiel: Spiel, bettlerErlaubt: boolean): void {
    if (!spiel.partner) return
    const erwarteteNamen: [string, string, string, string] = [
      spiel.spieler[0],
      spiel.spieler[1],
      spiel.partner[0],
      spiel.partner[1],
    ]
    const start = {
      erwarteteNamen,
      bummerlPunkte: [...spiel.punkte] as [number, number],
      bummerl: [...spiel.bummerl] as [number, number],
    }
    stelleVerbindungHer(() => sende({ typ: 'tisch_erstellen_vierer', bettlerErlaubt, start }))
    zustand = { ...zustand, verknuepftesSpielId: spiel.id, fortgesetzt: true }
  },

  sitzWechseln(sitz: SitzIndex): void {
    sende({ typ: 'sitz_wechseln', sitz })
  },

  spielStarten(): void {
    sende({ typ: 'spiel_starten' })
  },

  ansageMachen(ansage: Ansage): void {
    sende({ typ: 'ansage_machen', ansage })
  },

  ansagePassen(): void {
    sende({ typ: 'ansage_passen' })
  },

  trumpfWaehlen(farbe: Farbe): void {
    sende({ typ: 'trumpf_waehlen', farbe })
  },

  trumpfAufdecken(): void {
    sende({ typ: 'trumpf_aufdecken' })
  },

  spritzenMachen(): void {
    sende({ typ: 'spritzen_machen' })
  },

  spritzenPassen(): void {
    sende({ typ: 'spritzen_passen' })
  },

  karteSpielen(karte: Karte): void {
    sende({ typ: 'karte_spielen_vierer', karte })
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
      warteraumSicht: null,
      sicht: null,
      letztesErgebnis: null,
      bummerlErgebnis: null,
      fehler: null,
      verknuepftesSpielId: null,
      fortgesetzt: false,
    })
  },
}

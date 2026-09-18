import { useSyncExternalStore } from 'react'
import { createId } from './ids'
import { alleSpieler, createSpiel, normalizeStartwert, spielFortsetzen } from './schnapsen'
import {
  initialState,
  ladeState,
  MAX_NAMEN,
  MAX_SPIELE,
  namensSchluessel,
  speichereState,
} from './storage'
import type { AppState, Ausstehend, Modus, NamensEintrag, Rank, Settings, Spiel } from './types'

let state: AppState = ladeState()
const listeners = new Set<() => void>()

function setState(next: AppState): void {
  state = next
  speichereState(state)
  for (const listener of listeners) listener()
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getState(): AppState {
  return state
}

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getState, getState)
}

/** Nur für den Abgleich: Zustand direkt ersetzen. */
export function ersetzeState(next: AppState): void {
  setState(next)
}

// ---------- Hilfen für Änderungsverfolgung ----------

function markiere(ausstehend: Ausstehend, art: keyof Ausstehend, ids: string[]): Ausstehend {
  if (ids.length === 0) return ausstehend
  return { ...ausstehend, [art]: [...new Set([...ausstehend[art], ...ids])] }
}

function grabstein(
  grabsteine: AppState['grabsteine'],
  art: keyof AppState['grabsteine'],
  ids: string[],
  jetzt: number,
): AppState['grabsteine'] {
  if (ids.length === 0) return grabsteine
  const karte = { ...grabsteine[art] }
  for (const id of ids) karte[id] = jetzt
  return { ...grabsteine, [art]: karte }
}

/** Namen nach vorne sortieren, Duplikate (unabhängig von Schreibweise) entfernen. */
function merkeNamen(vorhanden: NamensEintrag[], neue: string[], jetzt: number): NamensEintrag[] {
  const karte = new Map<string, NamensEintrag>()
  for (const eintrag of vorhanden) karte.set(namensSchluessel(eintrag.name), eintrag)
  for (const name of neue) {
    const sauber = name.trim()
    if (!sauber) continue
    karte.set(namensSchluessel(sauber), { name: sauber, geaendertAm: jetzt })
  }
  return [...karte.values()]
    .sort((a, b) => b.geaendertAm - a.geaendertAm || a.name.localeCompare(b.name, 'de'))
    .slice(0, MAX_NAMEN)
}

export const actions = {
  setSettings(patch: Partial<Settings>): void {
    const jetzt = Date.now()
    const settings: Settings = { ...state.settings, ...patch }
    let { einstellungenGeaendertAm, ausstehend } = state

    if (patch.startwert !== undefined) {
      settings.startwert = normalizeStartwert(patch.startwert)
      if (settings.startwert !== state.settings.startwert) {
        einstellungenGeaendertAm = { ...einstellungenGeaendertAm, startwert: jetzt }
        ausstehend = markiere(ausstehend, 'einstellungen', ['startwert'])
      }
    }

    if (patch.startwertVierer !== undefined) {
      settings.startwertVierer = normalizeStartwert(patch.startwertVierer)
      if (settings.startwertVierer !== state.settings.startwertVierer) {
        einstellungenGeaendertAm = { ...einstellungenGeaendertAm, startwertVierer: jetzt }
        ausstehend = markiere(ausstehend, 'einstellungen', ['startwertVierer'])
      }
    }

    setState({ ...state, settings, einstellungenGeaendertAm, ausstehend })
  },

  neuesSpiel(
    spieler: [string, string],
    optionen: { startwert?: number; partner?: [string, string]; modus?: Modus } = {},
  ): Spiel {
    const jetzt = Date.now()
    const spiel = createSpiel({
      id: createId('spiel'),
      spieler: [spieler[0].trim(), spieler[1].trim()],
      ...(optionen.partner
        ? { partner: [optionen.partner[0].trim(), optionen.partner[1].trim()] as [string, string] }
        : {}),
      ...(optionen.modus ? { modus: optionen.modus } : {}),
      startwert:
        optionen.startwert ??
        (optionen.modus === 'vierer' ? state.settings.startwertVierer : state.settings.startwert),
      geaendertAm: jetzt,
    })

    const beteiligte = alleSpieler(spiel)
    const namen = merkeNamen(state.namen, beteiligte, jetzt)
    let ausstehend = markiere(state.ausstehend, 'spiele', [spiel.id])
    ausstehend = markiere(ausstehend, 'namen', beteiligte.map(namensSchluessel))

    setState({
      ...state,
      spiele: [spiel, ...state.spiele].slice(0, MAX_SPIELE),
      namen,
      aktivesSpielId: spiel.id,
      ausstehend,
    })
    return spiel
  },

  updateSpiel(id: string, updater: (spiel: Spiel) => Spiel): void {
    const jetzt = Date.now()
    let geaendert = false

    const spiele = state.spiele.map((spiel) => {
      if (spiel.id !== id) return spiel
      const naechster = updater(spiel)
      if (naechster === spiel) return spiel
      geaendert = true
      return { ...naechster, geaendertAm: jetzt }
    })

    if (!geaendert) return
    setState({ ...state, spiele, ausstehend: markiere(state.ausstehend, 'spiele', [id]) })
  },

  /** Beendetes Spiel wieder aufnehmen und als laufendes Spiel setzen. */
  spielFortsetzen(id: string): void {
    const jetzt = Date.now()
    let geaendert = false

    const spiele = state.spiele.map((spiel) => {
      if (spiel.id !== id) return spiel
      const naechster = spielFortsetzen(spiel)
      if (naechster === spiel) return spiel
      geaendert = true
      return { ...naechster, geaendertAm: jetzt }
    })

    setState({
      ...state,
      spiele,
      aktivesSpielId: id,
      ausstehend: geaendert ? markiere(state.ausstehend, 'spiele', [id]) : state.ausstehend,
    })
  },

  spielLoeschen(id: string): void {
    if (!state.spiele.some((spiel) => spiel.id === id)) return
    const jetzt = Date.now()
    setState({
      ...state,
      spiele: state.spiele.filter((spiel) => spiel.id !== id),
      aktivesSpielId: state.aktivesSpielId === id ? null : state.aktivesSpielId,
      grabsteine: grabstein(state.grabsteine, 'spiele', [id], jetzt),
      ausstehend: markiere(state.ausstehend, 'spiele', [id]),
    })
  },

  setAktivesSpiel(id: string | null): void {
    if (state.aktivesSpielId === id) return
    setState({ ...state, aktivesSpielId: id })
  },

  historieLoeschen(): void {
    const jetzt = Date.now()
    const behalten = state.spiele.filter(
      (spiel) => spiel.status === 'laufend' && spiel.id === state.aktivesSpielId,
    )
    const entfernt = state.spiele
      .filter((spiel) => !behalten.includes(spiel))
      .map((spiel) => spiel.id)

    setState({
      ...state,
      spiele: behalten,
      grabsteine: grabstein(state.grabsteine, 'spiele', entfernt, jetzt),
      ausstehend: markiere(state.ausstehend, 'spiele', entfernt),
    })
  },

  namenLoeschen(): void {
    const jetzt = Date.now()
    const schluessel = state.namen.map((eintrag) => namensSchluessel(eintrag.name))
    setState({
      ...state,
      namen: [],
      grabsteine: grabstein(state.grabsteine, 'namen', schluessel, jetzt),
      ausstehend: markiere(state.ausstehend, 'namen', schluessel),
    })
  },

  nameEntfernen(name: string): void {
    const schluessel = namensSchluessel(name)
    if (!state.namen.some((eintrag) => namensSchluessel(eintrag.name) === schluessel)) return
    const jetzt = Date.now()

    setState({
      ...state,
      namen: state.namen.filter((eintrag) => namensSchluessel(eintrag.name) !== schluessel),
      grabsteine: grabstein(state.grabsteine, 'namen', [schluessel], jetzt),
      ausstehend: markiere(state.ausstehend, 'namen', [schluessel]),
    })
  },

  rankHinzufuegen(name: string, punkte: number, modus: Modus = 'zweier'): void {
    const rank: Rank = {
      id: createId('rank'),
      name: name.trim(),
      punkte: Math.round(punkte),
      modus,
      geaendertAm: Date.now(),
    }
    setState({
      ...state,
      ranks: [...state.ranks, rank],
      ausstehend: markiere(state.ausstehend, 'ranks', [rank.id]),
    })
  },

  rankAendern(id: string, patch: Partial<Omit<Rank, 'id' | 'geaendertAm'>>): void {
    if (!state.ranks.some((rank) => rank.id === id)) return
    const jetzt = Date.now()

    setState({
      ...state,
      ranks: state.ranks.map((rank) =>
        rank.id === id
          ? {
              ...rank,
              name: patch.name !== undefined ? patch.name.trim() : rank.name,
              punkte: patch.punkte !== undefined ? Math.round(patch.punkte) : rank.punkte,
              geaendertAm: jetzt,
            }
          : rank,
      ),
      ausstehend: markiere(state.ausstehend, 'ranks', [id]),
    })
  },

  rankLoeschen(id: string): void {
    if (!state.ranks.some((rank) => rank.id === id)) return
    const jetzt = Date.now()

    setState({
      ...state,
      ranks: state.ranks.filter((rank) => rank.id !== id),
      grabsteine: grabstein(state.grabsteine, 'ranks', [id], jetzt),
      ausstehend: markiere(state.ausstehend, 'ranks', [id]),
    })
  },

  /**
   * Löscht alle Spieldaten. Die Löschung wird als Grabstein vermerkt und
   * erreicht damit beim nächsten Abgleich auch die anderen Geräte.
   */
  alleDatenLoeschen(): void {
    const jetzt = Date.now()
    const spielIds = state.spiele.map((spiel) => spiel.id)
    const rankIds = state.ranks.map((rank) => rank.id)
    const namensIds = state.namen.map((eintrag) => namensSchluessel(eintrag.name))

    const frisch = initialState()
    setState({
      ...frisch,
      grabsteine: {
        spiele: { ...state.grabsteine.spiele, ...Object.fromEntries(spielIds.map((id) => [id, jetzt])) },
        ranks: { ...state.grabsteine.ranks, ...Object.fromEntries(rankIds.map((id) => [id, jetzt])) },
        namen: { ...state.grabsteine.namen, ...Object.fromEntries(namensIds.map((id) => [id, jetzt])) },
      },
      ausstehend: {
        spiele: spielIds,
        ranks: rankIds,
        namen: namensIds,
        einstellungen: [],
      },
      sync: state.sync,
    })
  },

  /** Setzt nur die lokale Kopie zurück; beim nächsten Abgleich kommt alles vom Server. */
  lokalZuruecksetzen(): void {
    setState({ ...initialState(), sync: { stand: 0, zuletztAm: null } })
  },
}

export function sortierteRanks(ranks: Rank[]): Rank[] {
  return [...ranks].sort((a, b) => b.punkte - a.punkte || a.name.localeCompare(b.name, 'de'))
}

/** Namen als einfache Liste, neueste zuerst. */
export function namensListe(namen: NamensEintrag[]): string[] {
  return namen.map((eintrag) => eintrag.name)
}

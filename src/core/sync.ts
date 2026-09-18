import { normalizeStartwert } from './schnapsen'
import { MAX_SPIELE, namensSchluessel, parseRank, parseSpiel } from './storage'
import type {
  AppState,
  Ausstehend,
  NamensEintrag,
  Rank,
  Settings,
  Spiel,
  SyncEintrag,
  SyncPaket,
} from './types'

/** Grabsteine älter als 90 Tage werden verworfen. */
export const GRABSTEIN_LEBENSDAUER_MS = 90 * 24 * 60 * 60 * 1000

/** Welche Einstellungen synchronisiert werden, und wie man sie liest/schreibt. */
const SYNC_EINSTELLUNGEN = {
  startwert: {
    lesen: (settings: Settings) => settings.startwert,
    schreiben: (settings: Settings, wert: number): Settings => ({
      ...settings,
      startwert: normalizeStartwert(wert),
    }),
  },
  startwertVierer: {
    lesen: (settings: Settings) => settings.startwertVierer,
    schreiben: (settings: Settings, wert: number): Settings => ({
      ...settings,
      startwertVierer: normalizeStartwert(wert),
    }),
  },
} as const

type SyncEinstellungsSchluessel = keyof typeof SYNC_EINSTELLUNGEN

/** Was in einem Abgleich verschickt wurde: ID → Zeitstempel. */
export type Gesendet = {
  spiele: Record<string, number>
  ranks: Record<string, number>
  namen: Record<string, number>
  einstellungen: Record<string, number>
}

const leeresPaket = (): SyncPaket => ({ spiele: [], ranks: [], namen: [], einstellungen: [] })

export function istPaketLeer(paket: SyncPaket): boolean {
  return (
    paket.spiele.length === 0 &&
    paket.ranks.length === 0 &&
    paket.namen.length === 0 &&
    paket.einstellungen.length === 0
  )
}

/**
 * Stellt aus den vorgemerkten IDs das Paket zusammen, das zum Server geht.
 * Gelöschte Einträge reisen als Grabstein mit.
 */
export function sammleAenderungen(state: AppState): { paket: SyncPaket; gesendet: Gesendet } {
  const paket = leeresPaket()
  const gesendet: Gesendet = { spiele: {}, ranks: {}, namen: {}, einstellungen: {} }

  for (const id of state.ausstehend.spiele) {
    const spiel = state.spiele.find((eintrag) => eintrag.id === id)
    if (spiel) {
      paket.spiele.push({ id, geaendertAm: spiel.geaendertAm, daten: spiel })
      gesendet.spiele[id] = spiel.geaendertAm
      continue
    }
    const geloeschtAm = state.grabsteine.spiele[id]
    if (geloeschtAm) {
      paket.spiele.push({ id, geaendertAm: geloeschtAm, geloescht: true })
      gesendet.spiele[id] = geloeschtAm
    }
  }

  for (const id of state.ausstehend.ranks) {
    const rank = state.ranks.find((eintrag) => eintrag.id === id)
    if (rank) {
      paket.ranks.push({ id, geaendertAm: rank.geaendertAm, daten: rank })
      gesendet.ranks[id] = rank.geaendertAm
      continue
    }
    const geloeschtAm = state.grabsteine.ranks[id]
    if (geloeschtAm) {
      paket.ranks.push({ id, geaendertAm: geloeschtAm, geloescht: true })
      gesendet.ranks[id] = geloeschtAm
    }
  }

  for (const schluessel of state.ausstehend.namen) {
    const eintrag = state.namen.find((name) => namensSchluessel(name.name) === schluessel)
    if (eintrag) {
      paket.namen.push({ name: eintrag.name, geaendertAm: eintrag.geaendertAm })
      gesendet.namen[schluessel] = eintrag.geaendertAm
      continue
    }
    const geloeschtAm = state.grabsteine.namen[schluessel]
    if (geloeschtAm) {
      paket.namen.push({ name: schluessel, geaendertAm: geloeschtAm, geloescht: true })
      gesendet.namen[schluessel] = geloeschtAm
    }
  }

  for (const schluessel of state.ausstehend.einstellungen) {
    const geaendertAm = state.einstellungenGeaendertAm[schluessel]
    if (!geaendertAm) continue
    const wert = SYNC_EINSTELLUNGEN[schluessel as SyncEinstellungsSchluessel]?.lesen(state.settings)
    if (wert === undefined) continue
    paket.einstellungen.push({ schluessel, wert, geaendertAm })
    gesendet.einstellungen[schluessel] = geaendertAm
  }

  return { paket, gesendet }
}

/** Aktueller Zeitstempel eines Eintrags – auch wenn er gelöscht wurde. */
function standVon(
  state: AppState,
  art: 'spiele' | 'ranks',
  id: string,
): number {
  const liste: { id: string; geaendertAm: number }[] = art === 'spiele' ? state.spiele : state.ranks
  const eintrag = liste.find((wert) => wert.id === id)
  if (eintrag) return eintrag.geaendertAm
  return state.grabsteine[art][id] ?? -1
}

/**
 * Entfernt die erfolgreich übertragenen IDs aus der Warteschlange. Einträge,
 * die sich während der Übertragung erneut geändert haben, bleiben drin.
 */
export function nachErfolg(state: AppState, gesendet: Gesendet): Ausstehend {
  const behalte = (art: keyof Ausstehend, aktuell: (id: string) => number): string[] =>
    state.ausstehend[art].filter((id) => {
      const versendet = gesendet[art][id]
      return versendet === undefined || aktuell(id) !== versendet
    })

  return {
    spiele: behalte('spiele', (id) => standVon(state, 'spiele', id)),
    ranks: behalte('ranks', (id) => standVon(state, 'ranks', id)),
    namen: behalte('namen', (schluessel) => {
      const eintrag = state.namen.find((name) => namensSchluessel(name.name) === schluessel)
      return eintrag ? eintrag.geaendertAm : (state.grabsteine.namen[schluessel] ?? -1)
    }),
    einstellungen: behalte(
      'einstellungen',
      (schluessel) => state.einstellungenGeaendertAm[schluessel] ?? -1,
    ),
  }
}

/**
 * Verwirft alte Grabsteine. Noch nicht übertragene Löschungen bleiben in jedem
 * Fall erhalten – sonst käme der gelöschte Eintrag beim nächsten Abgleich zurück.
 */
function raeumeGrabsteine(
  grabsteine: Record<string, number>,
  jetzt: number,
  nochOffen: string[],
): Record<string, number> {
  const offen = new Set(nochOffen)
  const gefiltert: Record<string, number> = {}
  for (const [id, zeit] of Object.entries(grabsteine)) {
    if (offen.has(id) || jetzt - zeit < GRABSTEIN_LEBENSDAUER_MS) gefiltert[id] = zeit
  }
  return gefiltert
}

/**
 * Führt die Änderungen vom Server mit dem lokalen Stand zusammen.
 * Bei Konflikten gewinnt die jüngere Änderung; bei Gleichstand bleibt es lokal.
 */
export function wendeAn(
  state: AppState,
  paket: SyncPaket,
  stand: number,
  jetzt: number = Date.now(),
): AppState {
  let spiele = state.spiele
  let ranks = state.ranks
  let namen = state.namen
  let settings = state.settings
  let einstellungenGeaendertAm = state.einstellungenGeaendertAm
  const grabsteine = {
    spiele: { ...state.grabsteine.spiele },
    ranks: { ...state.grabsteine.ranks },
    namen: { ...state.grabsteine.namen },
  }

  const verarbeite = <T extends { id: string; geaendertAm: number }>(
    liste: T[],
    art: 'spiele' | 'ranks',
    eintraege: SyncEintrag[],
    parse: (daten: unknown, id: string) => T | null,
  ): T[] => {
    let ergebnis = liste
    for (const eintrag of eintraege) {
      const lokal = ergebnis.find((wert) => wert.id === eintrag.id)
      const lokalerStand = lokal ? lokal.geaendertAm : (grabsteine[art][eintrag.id] ?? -1)
      if (eintrag.geaendertAm <= lokalerStand) continue

      if (eintrag.geloescht) {
        ergebnis = ergebnis.filter((wert) => wert.id !== eintrag.id)
        grabsteine[art][eintrag.id] = eintrag.geaendertAm
        continue
      }

      const geparst = parse(eintrag.daten, eintrag.id)
      if (!geparst) continue
      const neuerEintrag = { ...geparst, id: eintrag.id, geaendertAm: eintrag.geaendertAm }
      delete grabsteine[art][eintrag.id]
      ergebnis = lokal
        ? ergebnis.map((wert) => (wert.id === eintrag.id ? neuerEintrag : wert))
        : [...ergebnis, neuerEintrag]
    }
    return ergebnis
  }

  spiele = verarbeite<Spiel>(spiele, 'spiele', paket.spiele, (daten, id) => parseSpiel(daten, id))
  ranks = verarbeite<Rank>(ranks, 'ranks', paket.ranks, (daten, id) => parseRank(daten, id))

  for (const eintrag of paket.namen) {
    const schluessel = namensSchluessel(eintrag.name)
    if (!schluessel) continue
    const lokal = namen.find((wert) => namensSchluessel(wert.name) === schluessel)
    const lokalerStand = lokal ? lokal.geaendertAm : (grabsteine.namen[schluessel] ?? -1)
    if (eintrag.geaendertAm <= lokalerStand) continue

    if (eintrag.geloescht) {
      namen = namen.filter((wert) => namensSchluessel(wert.name) !== schluessel)
      grabsteine.namen[schluessel] = eintrag.geaendertAm
      continue
    }

    const neu: NamensEintrag = { name: eintrag.name.trim(), geaendertAm: eintrag.geaendertAm }
    delete grabsteine.namen[schluessel]
    namen = lokal
      ? namen.map((wert) => (namensSchluessel(wert.name) === schluessel ? neu : wert))
      : [...namen, neu]
  }

  for (const eintrag of paket.einstellungen) {
    const definition = SYNC_EINSTELLUNGEN[eintrag.schluessel as SyncEinstellungsSchluessel]
    if (!definition) continue
    const lokalerStand = einstellungenGeaendertAm[eintrag.schluessel] ?? -1
    if (eintrag.geaendertAm <= lokalerStand) continue
    if (typeof eintrag.wert !== 'number') continue

    settings = definition.schreiben(settings, eintrag.wert)
    einstellungenGeaendertAm = { ...einstellungenGeaendertAm, [eintrag.schluessel]: eintrag.geaendertAm }
  }

  // Neueste Spiele zuerst, Namen nach letzter Verwendung.
  spiele = [...spiele]
    .sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : 0))
    .slice(0, MAX_SPIELE)
  namen = [...namen].sort(
    (a, b) => b.geaendertAm - a.geaendertAm || a.name.localeCompare(b.name, 'de'),
  )

  return {
    ...state,
    spiele,
    ranks,
    namen,
    settings,
    einstellungenGeaendertAm,
    aktivesSpielId: spiele.some((spiel) => spiel.id === state.aktivesSpielId)
      ? state.aktivesSpielId
      : null,
    grabsteine: {
      spiele: raeumeGrabsteine(grabsteine.spiele, jetzt, state.ausstehend.spiele),
      ranks: raeumeGrabsteine(grabsteine.ranks, jetzt, state.ausstehend.ranks),
      namen: raeumeGrabsteine(grabsteine.namen, jetzt, state.ausstehend.namen),
    },
    sync: { stand, zuletztAm: jetzt },
  }
}

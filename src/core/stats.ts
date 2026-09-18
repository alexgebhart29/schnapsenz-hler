import { gegner, parteiName, parteiSpieler, spielSieger } from './schnapsen'
import type { Modus, Spiel, SpielerIndex } from './types'

export type SpielerStatistik = {
  /** Spielername (Zweier) oder Teamname „Anna & Bert“ (Vierer). */
  name: string
  spiele: number
  spieleGewonnen: number
  bummerlGewonnen: number
  bummerlVerloren: number
  /** Anteil gewonnener Bummerl (0–1), null wenn noch kein Bummerl gespielt. */
  siegquote: number | null
  haeufigsterGegner: string | null
}

const kleingeschrieben = (name: string) => name.trim().toLowerCase()

/**
 * Schlüssel einer Partei. Im Vierer zählt das Team als Einheit – unabhängig
 * davon, in welcher Reihenfolge die beiden Namen eingegeben wurden.
 */
export function parteiSchluessel(spiel: Spiel, partei: SpielerIndex): string {
  return parteiSpieler(spiel, partei).map(kleingeschrieben).sort().join(' & ')
}

/**
 * Berechnet die Statistik je Partei aus allen Spielen der gewählten Spielform.
 * Namen werden unabhängig von Groß-/Kleinschreibung zusammengefasst; angezeigt
 * wird die zuletzt verwendete Schreibweise.
 */
export function berechneStatistik(spiele: Spiel[], modus: Modus = 'zweier'): SpielerStatistik[] {
  type Akku = Omit<SpielerStatistik, 'siegquote' | 'haeufigsterGegner'> & {
    gegnerZaehler: Map<string, { name: string; anzahl: number }>
  }

  const akkus = new Map<string, Akku>()

  const hole = (schluessel: string, name: string): Akku => {
    let akku = akkus.get(schluessel)
    if (!akku) {
      akku = {
        name,
        spiele: 0,
        spieleGewonnen: 0,
        bummerlGewonnen: 0,
        bummerlVerloren: 0,
        gegnerZaehler: new Map(),
      }
      akkus.set(schluessel, akku)
    }
    return akku
  }

  const passend = spiele.filter((spiel) => spiel.modus === modus)

  // Älteste Spiele zuerst verarbeiten, damit die neueste Schreibweise gewinnt.
  for (const spiel of [...passend].reverse()) {
    if (spiel.bummerlLog.length === 0 && spiel.status === 'laufend') continue

    const sieger = spiel.status === 'beendet' ? spielSieger(spiel) : null

    for (const partei of [0, 1] as SpielerIndex[]) {
      const schluessel = parteiSchluessel(spiel, partei)
      if (!schluessel.replace(/[\s&]/g, '')) continue

      const name = parteiName(spiel, partei)
      const akku = hole(schluessel, name)
      akku.name = name
      akku.spiele += 1
      if (sieger === partei) akku.spieleGewonnen += 1
      akku.bummerlGewonnen += spiel.bummerl[partei]
      akku.bummerlVerloren += spiel.bummerl[gegner(partei)]

      const gegnerName = parteiName(spiel, gegner(partei))
      const gegnerKey = parteiSchluessel(spiel, gegner(partei))
      if (gegnerKey.replace(/[\s&]/g, '')) {
        const eintrag = akku.gegnerZaehler.get(gegnerKey)
        if (eintrag) {
          eintrag.anzahl += 1
          eintrag.name = gegnerName
        } else {
          akku.gegnerZaehler.set(gegnerKey, { name: gegnerName, anzahl: 1 })
        }
      }
    }
  }

  const ergebnis: SpielerStatistik[] = [...akkus.values()].map((akku) => {
    const gespielt = akku.bummerlGewonnen + akku.bummerlVerloren
    let haeufigsterGegner: string | null = null
    let maxAnzahl = 0
    for (const eintrag of akku.gegnerZaehler.values()) {
      if (eintrag.anzahl > maxAnzahl) {
        maxAnzahl = eintrag.anzahl
        haeufigsterGegner = eintrag.name
      }
    }
    const { gegnerZaehler: _gegnerZaehler, ...rest } = akku
    return {
      ...rest,
      siegquote: gespielt === 0 ? null : akku.bummerlGewonnen / gespielt,
      haeufigsterGegner,
    }
  })

  ergebnis.sort(
    (a, b) =>
      b.bummerlGewonnen - a.bummerlGewonnen ||
      (b.siegquote ?? 0) - (a.siegquote ?? 0) ||
      a.name.localeCompare(b.name, 'de'),
  )
  return ergebnis
}

import { beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { oeffneDatenbank } from './db.js'
import { synchronisiere } from './sync.js'
import { LEERES_PAKET, type SyncPaket } from './typen.js'

let db: DatabaseSync

beforeEach(() => {
  db = oeffneDatenbank(':memory:')
})

const paket = (teile: Partial<SyncPaket>): SyncPaket => ({ ...LEERES_PAKET(), ...teile })

const spiel = (id: string, geaendertAm: number, punkte: number) => ({
  id,
  geaendertAm,
  daten: { id, punkte },
})

describe('synchronisiere', () => {
  it('nimmt neue Einträge an und gibt sie zurück', () => {
    const antwort = synchronisiere(
      { seit: 0, aenderungen: paket({ spiele: [spiel('a', 1000, 7)] }) },
      db,
      5000,
    )

    expect(antwort.stand).toBe(1)
    expect(antwort.aenderungen.spiele).toHaveLength(1)
    expect(antwort.aenderungen.spiele[0]!.daten).toEqual({ id: 'a', punkte: 7 })
  })

  it('liefert einem zweiten Gerät die Änderungen des ersten', () => {
    const ersterStand = synchronisiere(
      { seit: 0, aenderungen: paket({ spiele: [spiel('a', 1000, 7)] }) },
      db,
      5000,
    ).stand

    // Gerät zwei kennt noch nichts.
    const zweites = synchronisiere({ seit: 0, aenderungen: LEERES_PAKET() }, db, 5100)
    expect(zweites.aenderungen.spiele).toHaveLength(1)
    expect(zweites.stand).toBe(ersterStand)

    // Und beim nächsten Mal nichts Neues mehr.
    const nochmal = synchronisiere({ seit: zweites.stand, aenderungen: LEERES_PAKET() }, db, 5200)
    expect(nochmal.aenderungen.spiele).toHaveLength(0)
  })

  it('lässt die jüngere Änderung gewinnen', () => {
    synchronisiere({ seit: 0, aenderungen: paket({ spiele: [spiel('a', 2000, 7)] }) }, db, 5000)
    synchronisiere({ seit: 0, aenderungen: paket({ spiele: [spiel('a', 1000, 3)] }) }, db, 5000)

    const antwort = synchronisiere({ seit: 0, aenderungen: LEERES_PAKET() }, db, 5000)
    expect(antwort.aenderungen.spiele[0]!.daten).toEqual({ id: 'a', punkte: 7 })
  })

  it('übernimmt eine neuere Änderung', () => {
    synchronisiere({ seit: 0, aenderungen: paket({ spiele: [spiel('a', 1000, 7)] }) }, db, 5000)
    synchronisiere({ seit: 0, aenderungen: paket({ spiele: [spiel('a', 3000, 2)] }) }, db, 5000)

    const antwort = synchronisiere({ seit: 0, aenderungen: LEERES_PAKET() }, db, 5000)
    expect(antwort.aenderungen.spiele[0]!.daten).toEqual({ id: 'a', punkte: 2 })
  })

  it('behält bei Gleichstand den Serverstand', () => {
    synchronisiere({ seit: 0, aenderungen: paket({ spiele: [spiel('a', 1000, 7)] }) }, db, 5000)
    synchronisiere({ seit: 0, aenderungen: paket({ spiele: [spiel('a', 1000, 9)] }) }, db, 5000)

    const antwort = synchronisiere({ seit: 0, aenderungen: LEERES_PAKET() }, db, 5000)
    expect(antwort.aenderungen.spiele[0]!.daten).toEqual({ id: 'a', punkte: 7 })
  })

  it('kappt Zeitstempel aus der Zukunft', () => {
    // Gerät mit vorgehender Uhr darf nicht dauerhaft jeden Konflikt gewinnen.
    synchronisiere(
      { seit: 0, aenderungen: paket({ spiele: [spiel('a', 9_999_999, 7)] }) },
      db,
      5000,
    )
    const antwort = synchronisiere({ seit: 0, aenderungen: LEERES_PAKET() }, db, 5000)
    expect(antwort.aenderungen.spiele[0]!.geaendertAm).toBe(5000)

    // Eine spätere, korrekt datierte Änderung setzt sich wieder durch.
    synchronisiere({ seit: 0, aenderungen: paket({ spiele: [spiel('a', 6000, 1)] }) }, db, 7000)
    const danach = synchronisiere({ seit: 0, aenderungen: LEERES_PAKET() }, db, 7000)
    expect(danach.aenderungen.spiele[0]!.daten).toEqual({ id: 'a', punkte: 1 })
  })

  it('überträgt Löschungen als Grabstein', () => {
    synchronisiere({ seit: 0, aenderungen: paket({ spiele: [spiel('a', 1000, 7)] }) }, db, 5000)
    synchronisiere(
      { seit: 0, aenderungen: paket({ spiele: [{ id: 'a', geaendertAm: 2000, geloescht: true }] }) },
      db,
      5000,
    )

    const antwort = synchronisiere({ seit: 0, aenderungen: LEERES_PAKET() }, db, 5000)
    expect(antwort.aenderungen.spiele[0]).toMatchObject({ id: 'a', geloescht: true })
    expect(antwort.aenderungen.spiele[0]!.daten).toBeUndefined()
  })

  it('fasst Namen unabhängig von Groß-/Kleinschreibung zusammen', () => {
    synchronisiere(
      { seit: 0, aenderungen: paket({ namen: [{ name: 'Anna', geaendertAm: 1000 }] }) },
      db,
      5000,
    )
    synchronisiere(
      { seit: 0, aenderungen: paket({ namen: [{ name: 'ANNA', geaendertAm: 2000 }] }) },
      db,
      5000,
    )

    const antwort = synchronisiere({ seit: 0, aenderungen: LEERES_PAKET() }, db, 5000)
    expect(antwort.aenderungen.namen).toHaveLength(1)
    expect(antwort.aenderungen.namen[0]!.name).toBe('ANNA')
  })

  it('synchronisiert Einstellungen', () => {
    synchronisiere(
      {
        seit: 0,
        aenderungen: paket({ einstellungen: [{ schluessel: 'startwert', wert: 9, geaendertAm: 1000 }] }),
      },
      db,
      5000,
    )
    const antwort = synchronisiere({ seit: 0, aenderungen: LEERES_PAKET() }, db, 5000)
    expect(antwort.aenderungen.einstellungen).toEqual([
      { schluessel: 'startwert', wert: 9, geaendertAm: 1000 },
    ])
  })

  it('erhöht den Stand nur bei echten Änderungen', () => {
    const erste = synchronisiere({ seit: 0, aenderungen: LEERES_PAKET() }, db, 5000)
    expect(erste.stand).toBe(0)

    const zweite = synchronisiere(
      { seit: 0, aenderungen: paket({ spiele: [spiel('a', 1000, 7)] }) },
      db,
      5000,
    )
    expect(zweite.stand).toBe(1)

    const dritte = synchronisiere({ seit: zweite.stand, aenderungen: LEERES_PAKET() }, db, 5000)
    expect(dritte.stand).toBe(1)
    expect(dritte.aenderungen.spiele).toHaveLength(0)
  })
})

/**
 * Kartenmodell fürs Vierer (Bauernschnapsen) – dasselbe 20er-Blatt wie im
 * Zweier, nur mit einer zweiten, umkehrbaren Stärketabelle für den
 * "10er Gang" (dort ist die 10 die stärkste, das Ass die schwächste Karte).
 */
import type { Rang } from '../karten.js'

export { FARBEN, PUNKTWERT, gleicheKarte, kartenId, mische, vollesBlatt } from '../karten.js'
export type { Farbe, Karte, Rang } from '../karten.js'

const STAERKE_NORMAL: Rang[] = ['U', 'O', 'K', '10', 'A']
/** Beim 10er Gang: Ass ist die schwächste, die 10 die stärkste Karte. */
const STAERKE_ZEHNER_GANG: Rang[] = ['U', 'O', 'K', 'A', '10']

export function staerke4(rang: Rang, zehnerGang: boolean): number {
  return (zehnerGang ? STAERKE_ZEHNER_GANG : STAERKE_NORMAL).indexOf(rang)
}

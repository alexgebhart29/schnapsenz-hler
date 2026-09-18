/**
 * Erzeugt die PWA-Icons (public/icon-*.png, apple-touch-icon.png) ohne externe
 * Abhängigkeiten: minimaler PNG-Encoder + prozedural gezeichnetes Herz-Symbol.
 *
 * Aufruf: npm run icons
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HIER = dirname(fileURLToPath(import.meta.url))
const PUBLIC = join(HIER, '..', 'public')

const HINTERGRUND = [0x12, 0x21, 0x1a] // Dunkelgrün wie der Spieltisch
const HERZ = [0xe2, 0x57, 0x4c] // Herz-Rot
const GLANZ = [0x1a, 0x32, 0x26] // Leichter Verlauf oben

// ---------- PNG-Encoder ----------

const crcTabelle = (() => {
  const tabelle = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    tabelle[n] = c >>> 0
  }
  return tabelle
})()

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = crcTabelle[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(typ, daten) {
  const laenge = Buffer.alloc(4)
  laenge.writeUInt32BE(daten.length, 0)
  const typBuffer = Buffer.from(typ, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typBuffer, daten])), 0)
  return Buffer.concat([laenge, typBuffer, daten, crc])
}

/** rgba: Uint8Array der Länge breite*hoehe*4 */
function encodePng(breite, hoehe, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(breite, 0)
  ihdr.writeUInt32BE(hoehe, 4)
  ihdr[8] = 8 // Bittiefe
  ihdr[9] = 6 // Farbtyp RGBA
  ihdr[10] = 0 // Kompression
  ihdr[11] = 0 // Filter
  ihdr[12] = 0 // Interlace

  // Jede Scanline mit Filtertyp 0 einleiten.
  const roh = Buffer.alloc(hoehe * (breite * 4 + 1))
  for (let y = 0; y < hoehe; y++) {
    const ziel = y * (breite * 4 + 1)
    roh[ziel] = 0
    Buffer.from(rgba.buffer, rgba.byteOffset + y * breite * 4, breite * 4).copy(roh, ziel + 1)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(roh, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------- Zeichnen ----------

/** Implizite Herzkurve: <= 0 liegt innerhalb. */
function herzFeld(x, y) {
  const q = x * x + y * y - 1
  return q * q * q - x * x * y * y * y
}

function abgerundetesRechteckInnen(px, py, groesse, radius) {
  const dx = Math.max(radius - px, px - (groesse - radius), 0)
  const dy = Math.max(radius - py, py - (groesse - radius), 0)
  return dx * dx + dy * dy <= radius * radius
}

function mischen(ziel, index, farbe, deckung) {
  for (let k = 0; k < 3; k++) {
    ziel[index + k] = Math.round(ziel[index + k] * (1 - deckung) + farbe[k] * deckung)
  }
}

function zeichneIcon(groesse, { maskable }) {
  const rgba = new Uint8Array(groesse * groesse * 4)
  const radius = maskable ? groesse / 2 : groesse * 0.225
  // Bei maskable-Icons muss das Motiv in den inneren 80 % liegen.
  const skala = maskable ? 0.62 : 0.78
  const proben = 3
  const schritt = 1 / (proben + 1)

  for (let py = 0; py < groesse; py++) {
    for (let px = 0; px < groesse; px++) {
      const index = (py * groesse + px) * 4

      let hintergrundDeckung = 0
      let herzDeckung = 0

      for (let sy = 1; sy <= proben; sy++) {
        for (let sx = 1; sx <= proben; sx++) {
          const x = px + sx * schritt
          const y = py + sy * schritt

          if (maskable || abgerundetesRechteckInnen(x, y, groesse, radius)) hintergrundDeckung++

          // Normierte Koordinaten mit Herz-Mittelpunkt.
          const nx = ((x / groesse - 0.5) * 2.55) / skala
          const ny = -((y / groesse - 0.52) * 2.75) / skala - 0.18
          if (herzFeld(nx, ny) <= 0) herzDeckung++
        }
      }

      const gesamt = proben * proben
      const alphaHintergrund = hintergrundDeckung / gesamt
      if (alphaHintergrund === 0) continue

      // Sanfter Verlauf von oben nach unten.
      const verlauf = 1 - py / groesse
      const basis = [
        Math.round(HINTERGRUND[0] * (1 - verlauf) + GLANZ[0] * verlauf),
        Math.round(HINTERGRUND[1] * (1 - verlauf) + GLANZ[1] * verlauf),
        Math.round(HINTERGRUND[2] * (1 - verlauf) + GLANZ[2] * verlauf),
      ]

      rgba[index] = basis[0]
      rgba[index + 1] = basis[1]
      rgba[index + 2] = basis[2]
      rgba[index + 3] = Math.round(alphaHintergrund * 255)

      const alphaHerz = (herzDeckung / gesamt) * alphaHintergrund
      if (alphaHerz > 0) mischen(rgba, index, HERZ, alphaHerz)
    }
  }

  return encodePng(groesse, groesse, rgba)
}

const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Schnapsen Zähler">
  <rect width="64" height="64" rx="14" fill="#12211a"/>
  <path d="M32 52C32 52 8 38.4 8 24.6 8 17.1 13.9 12 20.6 12c4.6 0 8.8 2.6 11.4 6.6C34.6 14.6 38.8 12 43.4 12 50.1 12 56 17.1 56 24.6 56 38.4 32 52 32 52Z" fill="#e2574c"/>
</svg>
`

mkdirSync(PUBLIC, { recursive: true })

const dateien = [
  ['icon-192.png', zeichneIcon(192, { maskable: false })],
  ['icon-512.png', zeichneIcon(512, { maskable: false })],
  ['icon-maskable-512.png', zeichneIcon(512, { maskable: true })],
  // iOS rundet das Icon selbst ab, deshalb randlos.
  ['apple-touch-icon.png', zeichneIcon(180, { maskable: true })],
]

for (const [name, daten] of dateien) {
  writeFileSync(join(PUBLIC, name), daten)
  console.log(`${name} – ${(daten.length / 1024).toFixed(1)} kB`)
}

writeFileSync(join(PUBLIC, 'favicon.svg'), FAVICON_SVG)
console.log('favicon.svg')

import express from 'express'
import { existsSync } from 'node:fs'
import { join, sep } from 'node:path'
import { config } from './config.js'
import { sitzung } from './http.js'
import { routen } from './routen.js'

/**
 * Grundschutz-Header für jede Antwort. Die App ist eine Single-Page-App ohne
 * Drittanbieter-Skripte, deshalb kann die CSP eng gefasst werden. style-src
 * braucht 'unsafe-inline', weil React inline style-Attribute setzt.
 */
function sicherheitsHeader(_req: express.Request, res: express.Response, next: express.NextFunction): void {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self'",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  )
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()')
  // Nur wenn die App ohnehin HTTPS erwartet (Cookie secure) – sonst würde ein
  // lokaler HTTP-Testaufruf sich selbst aussperren.
  if (config.cookieSicher) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains')
  }
  next()
}

/** Baut die Express-App. Der Start (Port, Admin-Anlage) passiert in index.ts. */
export function erstelleApp(): express.Express {
  const app = express()
  app.disable('x-powered-by')
  if (config.vertrauteProxys > 0) app.set('trust proxy', config.vertrauteProxys)

  app.use(sicherheitsHeader)
  app.use(express.json({ limit: '8mb' }))
  app.use(sitzung)

  app.get('/api/status', (_req, res) => {
    res.json({ ok: true, server: 'schnapsen', zeit: Date.now() })
  })
  app.use('/api', routen)

  // Unbekannte API-Pfade nicht auf die App umleiten.
  app.use('/api', (_req, res) => {
    res.status(404).json({ fehler: 'unbekannter Endpunkt' })
  })

  const indexDatei = join(config.statischesVerzeichnis, 'index.html')

  if (existsSync(indexDatei)) {
    app.use(
      express.static(config.statischesVerzeichnis, {
        index: false,
        setHeaders(res, pfad) {
          // Gehashte Assets dürfen dauerhaft gecacht werden, alles andere nicht.
          const istAsset = pfad.includes(`${sep}assets${sep}`)
          res.setHeader(
            'Cache-Control',
            istAsset ? 'public, max-age=31536000, immutable' : 'no-cache, must-revalidate',
          )
          if (pfad.endsWith('.webmanifest')) {
            res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8')
          }
        },
      }),
    )

    // Single-Page-App: alles Übrige auf die App-Shell.
    app.get(/.*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate')
      res.sendFile(indexDatei)
    })
  } else {
    console.warn(`[start] Keine gebaute App unter ${config.statischesVerzeichnis} gefunden.`)
  }

  app.use(
    (fehler: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error('[fehler]', fehler)
      if (!res.headersSent) res.status(500).json({ fehler: 'interner Fehler' })
    },
  )

  return app
}

import { useState } from 'react'
import { anmelden } from '../core/session'
import { navigiere } from '../navigation'

/** Anmeldung am eigenen Server. */
export function LoginScreen() {
  const [benutzername, setBenutzername] = useState('')
  const [passwort, setPasswort] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)

  const absenden = async () => {
    if (laeuft) return
    if (!benutzername.trim() || !passwort) {
      setFehler('Bitte Benutzername und Passwort eingeben.')
      return
    }

    setLaeuft(true)
    setFehler(null)
    try {
      await anmelden(benutzername.trim(), passwort)
      setPasswort('')
      navigiere({ name: 'start' })
    } catch (ausnahme) {
      setFehler(ausnahme instanceof Error ? ausnahme.message : 'Anmeldung fehlgeschlagen')
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <div className="screen">
      <div className="marke">
        <div className="marke__titel">Schnapsen Zähler</div>
        <div className="marke__untertitel">Anmelden, um auf allen Geräten zu zählen</div>
      </div>

      <section className="karte">
        <div className="feld">
          <label className="feld__label" htmlFor="benutzername">
            Benutzername
          </label>
          <input
            id="benutzername"
            className="eingabe"
            value={benutzername}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            enterKeyHint="next"
            onChange={(event) => setBenutzername(event.target.value)}
          />
        </div>

        <div className="feld">
          <label className="feld__label" htmlFor="passwort">
            Passwort
          </label>
          <input
            id="passwort"
            className="eingabe"
            type="password"
            value={passwort}
            autoComplete="current-password"
            enterKeyHint="go"
            onChange={(event) => setPasswort(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void absenden()
            }}
          />
        </div>

        {fehler && <p className="fehler">{fehler}</p>}

        <button
          type="button"
          className="btn btn--primaer btn--gross btn--block"
          onClick={() => void absenden()}
          disabled={laeuft}
        >
          {laeuft ? 'Anmelden …' : 'Anmelden'}
        </button>
      </section>
    </div>
  )
}

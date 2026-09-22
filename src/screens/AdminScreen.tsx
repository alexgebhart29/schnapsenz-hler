import { useEffect, useState } from 'react'
import { Dialog } from '../components/Dialog'
import { Screen } from '../components/Screen'
import { api } from '../core/api'
import { useSitzung } from '../core/session'
import { formatDatum } from '../format'
import type { Benutzer } from '../core/types'

/** Benutzerverwaltung – nur für Administratoren erreichbar. */
export function AdminScreen() {
  const sitzung = useSitzung()
  const [benutzer, setBenutzer] = useState<Benutzer[]>([])
  const [laden, setLaden] = useState(true)
  const [fehler, setFehler] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [passwort, setPasswort] = useState('')
  const [istAdmin, setIstAdmin] = useState(false)
  const [darfAnmelden, setDarfAnmelden] = useState(false)

  const [loeschen, setLoeschen] = useState<Benutzer | null>(null)
  const [zuruecksetzen, setZuruecksetzen] = useState<Benutzer | null>(null)
  const [neuesPasswort, setNeuesPasswort] = useState('')

  const laden_ = async () => {
    setLaden(true)
    try {
      const antwort = await api.benutzerListe()
      setBenutzer(antwort.benutzer)
      setFehler(null)
    } catch (ausnahme) {
      setFehler(ausnahme instanceof Error ? ausnahme.message : 'Laden fehlgeschlagen')
    } finally {
      setLaden(false)
    }
  }

  useEffect(() => {
    void laden_()
  }, [])

  if (!sitzung.benutzer?.istAdmin) {
    return (
      <Screen titel="Benutzer">
        <p className="leer">Dieser Bereich ist Administratoren vorbehalten.</p>
      </Screen>
    )
  }

  const anlegen = async () => {
    try {
      await api.benutzerAnlegen(name.trim(), passwort, istAdmin, darfAnmelden)
      setName('')
      setPasswort('')
      setIstAdmin(false)
      setDarfAnmelden(false)
      setFehler(null)
      await laden_()
    } catch (ausnahme) {
      setFehler(ausnahme instanceof Error ? ausnahme.message : 'Anlegen fehlgeschlagen')
    }
  }

  return (
    <Screen titel="Benutzer">
      {fehler && <p className="fehler">{fehler}</p>}

      <section className="stapel">
        <h2 className="karte__titel">Konten</h2>
        {laden ? (
          <p className="leer">Wird geladen …</p>
        ) : (
          <div className="liste">
            {benutzer.map((eintrag) => (
              <div className="eintrag" key={eintrag.id}>
                <div className="wachsen">
                  <div className="eintrag__titel">{eintrag.benutzername}</div>
                  <div className="eintrag__meta">
                    seit {formatDatum(new Date(eintrag.erstelltAm).toISOString())}
                  </div>
                </div>
                {eintrag.istAdmin && <span className="abzeichen abzeichen--rang">Admin</span>}
                {!eintrag.darfAnmelden && <span className="abzeichen">nur Spielername</span>}
                {eintrag.darfAnmelden && (
                  <button
                    type="button"
                    className="btn btn--geist btn--klein"
                    onClick={() => {
                      setNeuesPasswort('')
                      setZuruecksetzen(eintrag)
                    }}
                    aria-label={`Passwort von ${eintrag.benutzername} ändern`}
                  >
                    🔑
                  </button>
                )}
                {eintrag.id !== sitzung.benutzer?.id && (
                  <button
                    type="button"
                    className="btn btn--geist btn--klein"
                    onClick={() => setLoeschen(eintrag)}
                    aria-label={`${eintrag.benutzername} löschen`}
                  >
                    🗑
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="karte">
        <h2 className="karte__titel">Benutzer anlegen</h2>
        <div className="feld">
          <label className="feld__label" htmlFor="neuer-benutzer">
            Benutzername
          </label>
          <input
            id="neuer-benutzer"
            className="eingabe"
            value={name}
            autoCapitalize="none"
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <label className="reihe">
          <input
            type="checkbox"
            checked={darfAnmelden}
            onChange={(event) => {
              setDarfAnmelden(event.target.checked)
              if (!event.target.checked) setIstAdmin(false)
            }}
          />
          <span className="klein">Darf anmelden (eigenes Konto mit Passwort)</span>
        </label>
        {!darfAnmelden && (
          <p className="hinweis" style={{ margin: 0 }}>
            Ohne Häkchen ist das nur ein Spielername zur Auswahl – ohne Passwort, ohne Anmeldung.
          </p>
        )}
        {darfAnmelden && (
          <>
            <div className="feld">
              <label className="feld__label" htmlFor="neues-passwort">
                Passwort (mindestens 8 Zeichen)
              </label>
              <input
                id="neues-passwort"
                className="eingabe"
                type="password"
                value={passwort}
                autoComplete="new-password"
                onChange={(event) => setPasswort(event.target.value)}
              />
            </div>
            <label className="reihe">
              <input
                type="checkbox"
                checked={istAdmin}
                onChange={(event) => setIstAdmin(event.target.checked)}
              />
              <span className="klein">Darf Benutzer verwalten (Administrator)</span>
            </label>
          </>
        )}
        <button
          type="button"
          className="btn btn--primaer btn--block"
          onClick={() => void anlegen()}
          disabled={!name.trim() || (darfAnmelden && passwort.length < 8)}
        >
          Anlegen
        </button>
      </section>

      {loeschen && (
        <Dialog
          titel={`${loeschen.benutzername} löschen?`}
          text="Das Konto wird entfernt und alle Sitzungen beendet. Die Spieldaten bleiben erhalten."
          onAbbrechen={() => setLoeschen(null)}
          aktionen={
            <>
              <button
                type="button"
                className="btn btn--gefahr"
                onClick={async () => {
                  try {
                    await api.benutzerLoeschen(loeschen.id)
                    setLoeschen(null)
                    await laden_()
                  } catch (ausnahme) {
                    setFehler(ausnahme instanceof Error ? ausnahme.message : 'Löschen fehlgeschlagen')
                    setLoeschen(null)
                  }
                }}
              >
                Ja, löschen
              </button>
              <button type="button" className="btn btn--geist" onClick={() => setLoeschen(null)}>
                Abbrechen
              </button>
            </>
          }
        />
      )}

      {zuruecksetzen && (
        <Dialog
          titel={`Passwort für ${zuruecksetzen.benutzername}`}
          text="Der Benutzer wird auf allen Geräten abgemeldet."
          onAbbrechen={() => setZuruecksetzen(null)}
          aktionen={
            <>
              <button
                type="button"
                className="btn btn--primaer"
                disabled={neuesPasswort.length < 8}
                onClick={async () => {
                  try {
                    await api.benutzerPasswort(zuruecksetzen.id, neuesPasswort)
                    setZuruecksetzen(null)
                    setNeuesPasswort('')
                  } catch (ausnahme) {
                    setFehler(ausnahme instanceof Error ? ausnahme.message : 'Ändern fehlgeschlagen')
                    setZuruecksetzen(null)
                  }
                }}
              >
                Setzen
              </button>
              <button type="button" className="btn btn--geist" onClick={() => setZuruecksetzen(null)}>
                Abbrechen
              </button>
            </>
          }
        >
          <input
            className="eingabe"
            type="password"
            value={neuesPasswort}
            placeholder="Neues Passwort"
            autoComplete="new-password"
            onChange={(event) => setNeuesPasswort(event.target.value)}
            aria-label="Neues Passwort"
          />
        </Dialog>
      )}
    </Screen>
  )
}

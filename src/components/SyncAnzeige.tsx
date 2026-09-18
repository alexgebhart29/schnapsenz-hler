import { navigiere } from '../navigation'
import { abmelden, fuehreSyncAus, useSitzung } from '../core/session'
import { formatZeit } from '../format'
import { useAppState } from '../core/store'

/** Zeigt Anmelde- und Abgleichstatus; im reinen Gerätebetrieb unsichtbar. */
export function SyncAnzeige() {
  const sitzung = useSitzung()
  const state = useAppState()

  if (sitzung.status === 'pruefe' || sitzung.status === 'lokal') return null

  if (sitzung.status === 'abgemeldet') {
    return (
      <div className="sync-leiste">
        <span className="sync-punkt sync-punkt--aus" aria-hidden="true" />
        <span className="wachsen klein">Nicht angemeldet – Daten bleiben auf diesem Gerät.</span>
        <button
          type="button"
          className="btn btn--klein"
          onClick={() => navigiere({ name: 'anmelden' })}
        >
          Anmelden
        </button>
      </div>
    )
  }

  const offen =
    state.ausstehend.spiele.length +
    state.ausstehend.ranks.length +
    state.ausstehend.namen.length +
    state.ausstehend.einstellungen.length

  const text =
    sitzung.syncStatus === 'laeuft'
      ? 'Abgleich läuft …'
      : sitzung.syncStatus === 'fehler'
        ? `Abgleich fehlgeschlagen${offen > 0 ? ` – ${offen} offen` : ''}`
        : state.sync.zuletztAm
          ? `Abgeglichen um ${formatZeit(new Date(state.sync.zuletztAm).toISOString())}`
          : 'Bereit zum Abgleich'

  const punktKlasse =
    sitzung.syncStatus === 'fehler'
      ? 'sync-punkt--fehler'
      : sitzung.syncStatus === 'laeuft'
        ? 'sync-punkt--laeuft'
        : 'sync-punkt--ok'

  return (
    <div className="sync-leiste">
      <span className={`sync-punkt ${punktKlasse}`} aria-hidden="true" />
      <span className="wachsen klein muted">
        {sitzung.benutzer?.benutzername} · {text}
      </span>
      {sitzung.syncStatus === 'fehler' && (
        <button type="button" className="btn btn--klein" onClick={() => void fuehreSyncAus()}>
          Erneut
        </button>
      )}
      <button
        type="button"
        className="btn btn--geist btn--klein"
        onClick={() => {
          void abmelden()
          navigiere({ name: 'anmelden' })
        }}
      >
        Abmelden
      </button>
    </div>
  )
}

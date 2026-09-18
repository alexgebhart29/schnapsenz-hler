import type { ReactNode } from 'react'
import { zurueck } from '../navigation'

type Props = {
  titel: string
  children: ReactNode
  /** Zeigt links einen Zurück-Pfeil. */
  zurueckZeigen?: boolean
  aktion?: ReactNode
  breit?: boolean
}

export function Screen({ titel, children, zurueckZeigen = true, aktion, breit }: Props) {
  return (
    <div className={breit ? 'screen screen--breit' : 'screen'}>
      <header className="kopf">
        {zurueckZeigen && (
          <button
            type="button"
            className="btn btn--geist btn--icon kopf__aktion"
            onClick={zurueck}
            aria-label="Zurück"
          >
            ‹
          </button>
        )}
        <h1 className="kopf__titel">{titel}</h1>
        {aktion && <div className="kopf__aktion">{aktion}</div>}
      </header>
      {children}
    </div>
  )
}

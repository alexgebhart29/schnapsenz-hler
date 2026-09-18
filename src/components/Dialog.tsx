import { useEffect, type ReactNode } from 'react'

type Props = {
  titel: string
  text?: string
  children?: ReactNode
  /** Fußzeile mit den Aktionen. */
  aktionen: ReactNode
  /** Wird bei Escape bzw. Klick auf den Hintergrund aufgerufen; fehlt sie, ist der Dialog modal. */
  onAbbrechen?: () => void
  icon?: string
}

export function Dialog({ titel, text, children, aktionen, onAbbrechen, icon }: Props) {
  useEffect(() => {
    if (!onAbbrechen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onAbbrechen()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onAbbrechen])

  return (
    <div
      className="dialog-hintergrund"
      onClick={onAbbrechen ? () => onAbbrechen() : undefined}
      role="presentation"
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={titel}
        onClick={(event) => event.stopPropagation()}
      >
        {icon && <div className="pokal">{icon}</div>}
        <div className="stapel stapel--eng">
          <h2 className="dialog__titel">{titel}</h2>
          {text && <p className="dialog__text" style={{ margin: 0 }}>{text}</p>}
        </div>
        {children}
        <div className="stapel">{aktionen}</div>
      </div>
    </div>
  )
}

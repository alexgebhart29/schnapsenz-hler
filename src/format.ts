const datumZeit = new Intl.DateTimeFormat('de-AT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const nurZeit = new Intl.DateTimeFormat('de-AT', { hour: '2-digit', minute: '2-digit' })

function parse(iso: string): Date | null {
  const datum = new Date(iso)
  return Number.isNaN(datum.getTime()) ? null : datum
}

export function formatDatum(iso: string): string {
  const datum = parse(iso)
  return datum ? datumZeit.format(datum) : '–'
}

export function formatZeit(iso: string): string {
  const datum = parse(iso)
  return datum ? nurZeit.format(datum) : '–'
}

/** "Heute, 14:05" / "Gestern, 21:30" / "12.09.2026, 19:12" */
export function formatRelativ(iso: string): string {
  const datum = parse(iso)
  if (!datum) return '–'

  const heute = new Date()
  const tagDiff = Math.round(
    (new Date(heute.getFullYear(), heute.getMonth(), heute.getDate()).getTime() -
      new Date(datum.getFullYear(), datum.getMonth(), datum.getDate()).getTime()) /
      86_400_000,
  )

  if (tagDiff === 0) return `Heute, ${nurZeit.format(datum)}`
  if (tagDiff === 1) return `Gestern, ${nurZeit.format(datum)}`
  return datumZeit.format(datum)
}

export function formatProzent(anteil: number | null): string {
  if (anteil === null) return '–'
  return `${Math.round(anteil * 100)} %`
}

// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from './App'
import { actions, getState } from './core/store'

beforeAll(() => {
  // jsdom kennt matchMedia nicht.
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
  }
})

beforeEach(() => {
  localStorage.clear()
  actions.alleDatenLoeschen()
  window.location.hash = '#/'
})

afterEach(cleanup)

/** Startet ein Spiel zwischen Anna und Bert und liefert das User-Event-Objekt. */
async function spielStarten() {
  const user = userEvent.setup()
  render(<App />)

  // Beim Start prüft die App kurz, ob ein Server erreichbar ist.
  await screen.findByLabelText('Spieler 1')

  await user.type(screen.getByLabelText('Spieler 1'), 'Anna')
  await user.type(screen.getByLabelText('Spieler 2'), 'Bert')
  await user.click(screen.getByRole('button', { name: 'Spiel starten' }))

  expect(screen.getByRole('heading', { name: 'Anna vs. Bert' })).toBeTruthy()
  return user
}

/** Der Knopf, mit dem ein Spieler die Partie mit `punkte` Punkten gewinnt. */
function abzugKnopf(name: string, punkte: 1 | 2 | 3) {
  const beschreibung = {
    1: 'Gegner hat 33 Augen oder mehr',
    2: 'Gegner hat 1 bis 32 Augen',
    3: 'Gegner hat keinen Stich (schwarz)',
  }[punkte]
  return screen.getByTitle(`${name} gewinnt die Partie: ${beschreibung}`)
}

function punktestand(name: string): number {
  const label = screen.getByLabelText(new RegExp(`^${name} hat noch \\d+ Punkte$`))
  return Number(label.textContent)
}

describe('App', () => {
  it('zeigt den Startbildschirm', async () => {
    render(<App />)
    expect(await screen.findByText('Schnapsen Zähler')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Spiel starten' })).toBeTruthy()
  })

  it('verlangt zwei unterschiedliche Namen', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByLabelText('Spieler 1')

    await user.click(screen.getByRole('button', { name: 'Spiel starten' }))
    expect(screen.getByText('Bitte beide Spielernamen eingeben.')).toBeTruthy()

    await user.type(screen.getByLabelText('Spieler 1'), 'Anna')
    await user.type(screen.getByLabelText('Spieler 2'), 'anna')
    await user.click(screen.getByRole('button', { name: 'Spiel starten' }))
    expect(screen.getByText('Jeder Spieler darf nur einmal vorkommen.')).toBeTruthy()
  })

  it('spielt ein Vierer-Schnapsen mit zwei Teams', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByLabelText('Spieler 1')

    await user.click(screen.getByRole('button', { name: 'Vierer (2 gegen 2)' }))

    await user.type(screen.getByLabelText('Team 1 – Spieler 1'), 'Anna')
    await user.type(screen.getByLabelText('Team 1 – Spieler 2'), 'Bert')
    await user.type(screen.getByLabelText('Team 2 – Spieler 1'), 'Cilli')
    await user.type(screen.getByLabelText('Team 2 – Spieler 2'), 'Dori')
    await user.click(screen.getByRole('button', { name: 'Spiel starten' }))

    // Die Parteien heißen jetzt nach ihren Teams, Vierer zählt standardmäßig von 24.
    expect(screen.getByRole('heading', { name: 'Anna & Bert vs. Cilli & Dori' })).toBeTruthy()
    expect(punktestand('Anna & Bert')).toBe(24)

    await user.click(abzugKnopf('Anna & Bert', 3))
    expect(punktestand('Anna & Bert')).toBe(21)
  })

  it('führt für Zweier und Vierer getrennte Ranglisten', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByLabelText('Spieler 1')

    // Ein Vierer-Spiel mit einem gewonnenen Bummerl für Team 1.
    await user.click(screen.getByRole('button', { name: 'Vierer (2 gegen 2)' }))
    await user.type(screen.getByLabelText('Team 1 – Spieler 1'), 'Anna')
    await user.type(screen.getByLabelText('Team 1 – Spieler 2'), 'Bert')
    await user.type(screen.getByLabelText('Team 2 – Spieler 1'), 'Cilli')
    await user.type(screen.getByLabelText('Team 2 – Spieler 2'), 'Dori')
    await user.click(screen.getByRole('button', { name: 'Spiel starten' }))

    // Vierer zählt von 24 herab – mit der freien Punktzahl auf einen Schlag beenden.
    await user.type(screen.getByLabelText('Andere Punktzahl für Anna & Bert'), '24')
    await user.click(screen.getByRole('button', { name: 'Abziehen für Anna & Bert' }))
    await user.click(screen.getByRole('button', { name: 'Neues Bummerl' }))

    actions.rankHinzufuegen('Zweier-Gold', 1, 'zweier')
    actions.rankHinzufuegen('Vierer-Gold', 1, 'vierer')

    window.location.hash = '#/ranks'
    await screen.findByRole('heading', { name: 'Rangliste' })

    // Zweier ist voreingestellt und noch leer.
    expect(screen.getByText(/Noch keine Punkte im Zweier gesammelt/)).toBeTruthy()
    expect(screen.getByText('Zweier-Gold')).toBeTruthy()
    expect(screen.queryByText('Vierer-Gold')).toBeNull()

    // Im Vierer steht das Team mit seiner eigenen Stufe.
    await user.click(screen.getByRole('button', { name: 'Vierer' }))
    const team = within(screen.getByRole('article', { name: 'Anna & Bert' }))
    expect(team.getByText('Vierer-Gold')).toBeTruthy()
    expect(screen.queryByText('Zweier-Gold')).toBeNull()
  })

  it('zählt ein komplettes Bummerl herunter und schreibt es gut', async () => {
    const user = await spielStarten()

    expect(punktestand('Anna')).toBe(7)
    expect(punktestand('Bert')).toBe(7)

    await user.click(abzugKnopf('Anna', 3))
    expect(punktestand('Anna')).toBe(4)
    await user.click(abzugKnopf('Anna', 2))
    expect(punktestand('Anna')).toBe(2)
    await user.click(abzugKnopf('Anna', 3))

    const dialog = screen.getByRole('dialog')
    // Annas eigener Zähler erreicht 0 (Rangliste zählt das weiterhin für Anna),
    // aber in der Bummerl-Anzeige wird das Bummerl dem Gegner gutgeschrieben.
    expect(within(dialog).getByText('Bert gewinnt das Bummerl!')).toBeTruthy()

    await user.click(within(dialog).getByRole('button', { name: 'Neues Bummerl' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(punktestand('Anna')).toBe(7)
    expect(screen.getByText('1 Bummerl')).toBeTruthy()
  })

  it('macht den letzten Abzug per Undo rückgängig', async () => {
    const user = await spielStarten()

    await user.click(abzugKnopf('Bert', 2))
    expect(punktestand('Bert')).toBe(5)

    await user.click(screen.getByRole('button', { name: /Undo/ }))
    expect(punktestand('Bert')).toBe(7)
    expect(screen.getByRole('button', { name: /Undo/ })).toHaveProperty('disabled', true)
  })

  it('beendet ein Spiel und legt es in der Historie ab', async () => {
    const user = await spielStarten()

    await user.click(abzugKnopf('Anna', 1))
    await user.click(screen.getByRole('button', { name: 'Spiel beenden' }))
    await user.click(screen.getByRole('button', { name: 'Ja, beenden' }))

    expect(screen.getByRole('heading', { name: 'Spielverlauf' })).toBeTruthy()
    expect(screen.getByText('Anna')).toBeTruthy()
    expect(screen.getByText('Bert')).toBeTruthy()
  })

  it('merkt sich Spielernamen für das nächste Spiel', async () => {
    const user = await spielStarten()

    await user.click(screen.getByRole('button', { name: 'Spiel beenden' }))
    await user.click(screen.getByRole('button', { name: 'Ja, beenden' }))
    window.location.hash = '#/'

    expect(await screen.findByRole('button', { name: 'Spiel starten' })).toBeTruthy()
    const vorschlaege = screen.getAllByRole('button', { name: 'Anna' })
    expect(vorschlaege.length).toBeGreaterThan(0)
  })

  it('verwaltet Rang-Stufen in den Einstellungen', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /Einstellungen/ }))
    expect(await screen.findByRole('heading', { name: 'Einstellungen' })).toBeTruthy()

    await user.type(screen.getByLabelText('Name der Stufe'), 'Gold 1')
    await user.type(screen.getByLabelText('Punkteschwelle'), '5')
    await user.click(screen.getByRole('button', { name: 'Hinzufügen' }))

    expect(screen.getByText('Gold 1')).toBeTruthy()
    expect(screen.getByText('5')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Gold 1 löschen' }))
    expect(screen.queryByText('Gold 1')).toBeNull()
  })

  it('stuft Spieler anhand der gewonnenen Bummerl in eine Stufe ein', async () => {
    const user = await spielStarten()

    // Anna gewinnt ein Bummerl (7 → 0), danach steht es 1 : 0.
    await user.click(abzugKnopf('Anna', 3))
    await user.click(abzugKnopf('Anna', 3))
    await user.click(abzugKnopf('Anna', 1))
    await user.click(screen.getByRole('button', { name: 'Neues Bummerl' }))

    actions.rankHinzufuegen('Gold 1', 1)
    actions.rankHinzufuegen('Gold 2', 3)

    window.location.hash = '#/ranks'
    expect(await screen.findByRole('heading', { name: 'Rangliste' })).toBeTruthy()

    // Anna hat 1 Punkt → Gold 1, Bert hat 0 → noch keine Stufe.
    const anna = within(screen.getByRole('article', { name: 'Anna' }))
    expect(anna.getByText('Gold 1')).toBeTruthy()
    expect(anna.getByText(/noch 2 Punkte bis Gold 2/)).toBeTruthy()

    const bert = within(screen.getByRole('article', { name: 'Bert' }))
    expect(bert.getByText('kein Rang')).toBeTruthy()

    // Die Stufe listet Anna als Trägerin.
    expect(screen.getByText('noch niemand auf dieser Stufe')).toBeTruthy()
  })

  it('lässt ein beendetes Spiel aus der Historie weiterspielen', async () => {
    const user = await spielStarten()

    await user.click(abzugKnopf('Anna', 2))
    expect(punktestand('Anna')).toBe(5)

    await user.click(screen.getByRole('button', { name: 'Spiel beenden' }))
    await user.click(screen.getByRole('button', { name: 'Ja, beenden' }))

    // In der Historie das beendete Spiel aufklappen und weiterspielen.
    expect(screen.getByRole('heading', { name: 'Spielverlauf' })).toBeTruthy()
    await user.click(screen.getByRole('button', { expanded: false }))
    await user.click(screen.getByRole('button', { name: 'Weiterspielen' }))

    expect(screen.getByRole('heading', { name: 'Anna vs. Bert' })).toBeTruthy()
    expect(punktestand('Anna')).toBe(5)

    // Und es lässt sich normal weiterzählen.
    await user.click(abzugKnopf('Anna', 3))
    expect(punktestand('Anna')).toBe(2)
  })

  it('bietet im beendeten Spiel selbst einen Weiterspielen-Knopf', async () => {
    const user = await spielStarten()

    await user.click(abzugKnopf('Bert', 1))
    await user.click(screen.getByRole('button', { name: 'Spiel beenden' }))
    await user.click(screen.getByRole('button', { name: 'Ja, beenden' }))

    // Das beendete Spiel direkt öffnen – ohne es über die Historie aufzunehmen.
    window.location.hash = `#/spiel/${encodeURIComponent(getState().spiele[0]!.id)}`
    expect(await screen.findByText('Spiel beendet')).toBeTruthy()

    // Solange es beendet ist, kann nicht gezählt werden.
    expect(abzugKnopf('Bert', 1)).toHaveProperty('disabled', true)

    await user.click(screen.getByRole('button', { name: 'Weiterspielen' }))

    expect(screen.queryByText('Spiel beendet')).toBeNull()
    expect(punktestand('Bert')).toBe(6)
    expect(abzugKnopf('Bert', 1)).toHaveProperty('disabled', false)
  })

  it('führt vom Spielverlauf nach Bummerl-Sieg-Dialog per Zurück zurück zum Hauptmenü', async () => {
    const user = await spielStarten()

    // Bummerl gewinnen und direkt aus dem Sieg-Dialog heraus das Spiel beenden.
    await user.click(abzugKnopf('Anna', 3))
    await user.click(abzugKnopf('Anna', 3))
    await user.click(abzugKnopf('Anna', 1))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Spiel beenden' }))

    expect(await screen.findByRole('heading', { name: 'Spielverlauf' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Zurück' }))
    expect(await screen.findByRole('button', { name: 'Spiel starten' })).toBeTruthy()
  })

  it('führt der Zurück-Pfeil zur logischen Eltern-Route statt zum Browser-Verlauf', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByLabelText('Spieler 1')

    // Direkter Sprung mitten in die Hierarchie: Benutzer → eigentlich unter
    // Einstellungen eingehängt, nicht unter dem Start-Screen.
    window.location.hash = '#/benutzer'
    await screen.findByRole('heading', { name: 'Benutzer' })

    await user.click(screen.getByRole('button', { name: 'Zurück' }))
    expect(await screen.findByRole('heading', { name: 'Einstellungen' })).toBeTruthy()

    // Von dort geht es zurück zum Start – unabhängig davon, dass wir nie über
    // den Start-Screen hierher navigiert sind.
    await user.click(screen.getByRole('button', { name: 'Zurück' }))
    expect(await screen.findByRole('button', { name: 'Spiel starten' })).toBeTruthy()
  })

  it('übernimmt einen geänderten Startwert in neue Spiele', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /Einstellungen/ }))
    await user.click(await screen.findByRole('button', { name: 'Startwert Zweier erhöhen' }))
    await user.click(screen.getByRole('button', { name: 'Startwert Zweier erhöhen' }))

    window.location.hash = '#/'
    await screen.findByRole('button', { name: 'Spiel starten' })

    await user.type(screen.getByLabelText('Spieler 1'), 'Cilli')
    await user.type(screen.getByLabelText('Spieler 2'), 'Dori')
    await user.click(screen.getByRole('button', { name: 'Spiel starten' }))

    expect(punktestand('Cilli')).toBe(9)
  })

  it('zählt im Vierer standardmäßig von 24 herab und getrennt vom Zweier-Startwert', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByLabelText('Spieler 1')

    await user.click(screen.getByRole('button', { name: 'Vierer (2 gegen 2)' }))
    await user.type(screen.getByLabelText('Team 1 – Spieler 1'), 'Anna')
    await user.type(screen.getByLabelText('Team 1 – Spieler 2'), 'Bert')
    await user.type(screen.getByLabelText('Team 2 – Spieler 1'), 'Cilli')
    await user.type(screen.getByLabelText('Team 2 – Spieler 2'), 'Dori')
    await user.click(screen.getByRole('button', { name: 'Spiel starten' }))

    expect(punktestand('Anna & Bert')).toBe(24)
    expect(punktestand('Cilli & Dori')).toBe(24)
  })

  it('erlaubt im Vierer eine frei eingegebene Punktzahl über 3 hinaus', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByLabelText('Spieler 1')

    await user.click(screen.getByRole('button', { name: 'Vierer (2 gegen 2)' }))
    await user.type(screen.getByLabelText('Team 1 – Spieler 1'), 'Anna')
    await user.type(screen.getByLabelText('Team 1 – Spieler 2'), 'Bert')
    await user.type(screen.getByLabelText('Team 2 – Spieler 1'), 'Cilli')
    await user.type(screen.getByLabelText('Team 2 – Spieler 2'), 'Dori')
    await user.click(screen.getByRole('button', { name: 'Spiel starten' }))

    // Im Zweier gibt es dieses Feld nicht, im Vierer schon.
    const eingabe = screen.getByLabelText('Andere Punktzahl für Anna & Bert')
    await user.type(eingabe, '7')
    await user.click(screen.getByRole('button', { name: 'Abziehen für Anna & Bert' }))

    expect(punktestand('Anna & Bert')).toBe(17)
    // Nach dem Abziehen ist das Feld wieder leer.
    expect((eingabe as HTMLInputElement).value).toBe('')
  })

  it('zeigt das Feld für andere Punktzahl im Zweier nicht an', async () => {
    await spielStarten()
    expect(screen.queryByLabelText(/Andere Punktzahl/)).toBeNull()
  })
})

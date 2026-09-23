import { useEffect } from 'react'
import { Dialog } from '../components/Dialog'
import { Screen } from '../components/Screen'
import { SpielKarte } from '../components/SpielKarte'
import { navigiere } from '../navigation'
import {
  ANSAGE_LABEL,
  onlineAktionenVierer,
  useOnlineZustandVierer,
  type OeffentlicheSichtVierer,
  type SitzIndex,
  type WarteraumSichtVierer,
} from '../core/onlineSitzungVierer'
import { farbName, farbSymbol, gleicheKarte, kartenId, sortiereHand, type Farbe } from '../core/karten'
import { spielBeenden } from '../core/schnapsen'
import { actions } from '../core/store'
import type { AppState, Kartendesign } from '../core/types'

type Props = { state: AppState; kartendesign: Kartendesign }

const ALLE_FARBEN: Farbe[] = ['kreuz', 'pik', 'herz', 'karo']

const spielpunkteText = (punkte: number): string => `${punkte} Spielpunkt${punkte === 1 ? '' : 'e'}`

export function OnlineTischViererScreen({ state, kartendesign }: Props) {
  const zustand = useOnlineZustandVierer()

  useEffect(() => {
    if (zustand.status === 'getrennt') navigiere({ name: 'online-lobby' })
  }, [zustand.status])

  useEffect(() => {
    return () => onlineAktionenVierer.trennen()
  }, [])

  if (zustand.status === 'warteraum') {
    return zustand.warteraumSicht ? (
      <WarteraumAnsicht sicht={zustand.warteraumSicht} fehler={zustand.fehler} />
    ) : (
      <Screen titel="Online spielen (Vierer)">
        <section className="karte" style={{ textAlign: 'center' }}>
          <h2 className="karte__titel">Warte auf weitere Spieler …</h2>
          <p className="hinweis">
            Dein Tisch steht jetzt in der Liste offener Tische – sobald alle 4 Plätze besetzt sind, geht es los.
          </p>
        </section>
        <button type="button" className="btn btn--geist btn--block" onClick={() => onlineAktionenVierer.trennen()}>
          Abbrechen
        </button>
      </Screen>
    )
  }

  if (!zustand.sicht) {
    return (
      <Screen titel="Online spielen (Vierer)">
        <p className="hinweis" style={{ textAlign: 'center' }}>
          Verbinde …
        </p>
      </Screen>
    )
  }

  return (
    <TischAnsichtVierer
      sicht={zustand.sicht}
      kartendesign={kartendesign}
      letztesErgebnis={zustand.letztesErgebnis}
      bummerlErgebnis={zustand.bummerlErgebnis}
      fehler={zustand.fehler}
      verknuepftesSpielId={zustand.verknuepftesSpielId}
      schneiderAktiv={state.settings.schneiderAktiv}
    />
  )
}

/**
 * Warteraum: Teamaufstellung wie in FIFA – zwei Team-Spalten mit je 2
 * Plätzen, auf die man sich per Klick frei verteilen kann, bevor der/die
 * Gastgeber:in (automatisch die am längsten wartende, noch verbundene
 * Person) das Spiel startet.
 */
function WarteraumAnsicht({ sicht, fehler }: { sicht: WarteraumSichtVierer; fehler: string | null }) {
  const teamSitze: [SitzIndex[], SitzIndex[]] = [
    [0, 2],
    [1, 3],
  ]
  const festeNamen = sicht.erwarteteNamen

  const platzKlick = (sitz: SitzIndex) => {
    if (festeNamen || sitz === sicht.meinIndex) return
    onlineAktionenVierer.sitzWechseln(sitz)
  }

  return (
    <Screen titel="Teams aufstellen">
      <p className="hinweis" style={{ textAlign: 'center', margin: 0 }}>
        {festeNamen
          ? 'Fortgesetztes Spiel – die Plätze sind fest vergeben und werden beim Beitreten automatisch dem passenden Konto zugeteilt.'
          : 'Verteilt euch auf die Plätze – Platz 1+3 spielen als Team gegen Platz 2+4. Auf einen freien oder besetzten Platz klicken, um dorthin zu wechseln.'}
      </p>

      <div className="reihe reihe--verteilt" style={{ alignItems: 'stretch', gap: 16 }}>
        {teamSitze.map((sitze, teamIndex) => (
          <section className="karte wachsen" key={teamIndex} style={{ textAlign: 'center' }}>
            <h2 className="karte__titel">Team {teamIndex === 0 ? 'A' : 'B'}</h2>
            <div className="stapel stapel--eng">
              {sitze.map((sitz) => {
                const name = sicht.plaetze[sitz]
                const binIch = sitz === sicht.meinIndex
                const erwarteterName = festeNamen?.[sitz]
                if (festeNamen) {
                  return (
                    <div
                      key={sitz}
                      className="btn btn--geist btn--block"
                      style={{ cursor: 'default', opacity: name ? 1 : 0.6 }}
                    >
                      {erwarteterName}
                      {binIch ? ' (du)' : name ? ' ✓' : ' (wartet …)'}
                    </div>
                  )
                }
                return (
                  <button
                    type="button"
                    key={sitz}
                    className={`btn ${binIch ? 'btn--primaer' : 'btn--geist'} btn--block`}
                    disabled={binIch}
                    onClick={() => platzKlick(sitz)}
                  >
                    {name ?? 'Frei'}
                    {binIch ? ' (du)' : ''}
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>

      <section className="karte" style={{ textAlign: 'center' }}>
        {sicht.plaetze.some((name) => name === null) ? (
          <p className="hinweis" style={{ margin: 0 }}>
            Warte auf weitere Spieler … Der Tisch steht in der Liste offener Tische.
          </p>
        ) : sicht.binGastgeber ? (
          <p className="hinweis" style={{ margin: 0 }}>
            Alle 4 sind da – du kannst starten, sobald die Teams passen.
          </p>
        ) : (
          <p className="hinweis" style={{ margin: 0 }}>
            Alle 4 sind da – wartet, bis der Gastgeber startet.
          </p>
        )}
        <button
          type="button"
          className="btn btn--primaer btn--block"
          disabled={!sicht.kannStarten}
          onClick={() => onlineAktionenVierer.spielStarten()}
        >
          Spiel starten
        </button>
      </section>

      {fehler && <p className="fehler">{fehler}</p>}

      <button type="button" className="btn btn--geist btn--block" onClick={() => onlineAktionenVierer.trennen()}>
        Verlassen
      </button>
    </Screen>
  )
}

function TischAnsichtVierer({
  sicht,
  kartendesign,
  letztesErgebnis,
  bummerlErgebnis,
  fehler,
  verknuepftesSpielId,
  schneiderAktiv,
}: {
  sicht: OeffentlicheSichtVierer
  kartendesign: Kartendesign
  letztesErgebnis: { gewinnerTeam: 0 | 1; spielpunkte: number } | null
  bummerlErgebnis: { gewinnerTeam: 0 | 1; bummerl: [number, number] } | null
  fehler: string | null
  verknuepftesSpielId: string | null
  schneiderAktiv: boolean
}) {
  const meinTeam = (sicht.meinIndex % 2) as 0 | 1
  const gegnerTeam = meinTeam === 0 ? 1 : 0
  const teamName = (team: 0 | 1): string =>
    team === 0 ? `${sicht.spielerNamen[0]} & ${sicht.spielerNamen[2]}` : `${sicht.spielerNamen[1]} & ${sicht.spielerNamen[3]}`
  const andereSitze = ([1, 2, 3].map((i) => ((sicht.meinIndex + i) % 4) as SitzIndex))
  const ichBinAmZug = sicht.amZug === sicht.meinIndex

  const spielBeendenKlick = () => {
    if (verknuepftesSpielId) {
      actions.updateSpiel(verknuepftesSpielId, (s) => spielBeenden(s, undefined, schneiderAktiv))
    }
    onlineAktionenVierer.trennen()
    navigiere({ name: 'historie' })
  }

  return (
    <Screen
      titel={`${teamName(0)} vs. ${teamName(1)}`}
      aktion={
        <button type="button" className="btn btn--geist btn--klein" onClick={spielBeendenKlick}>
          Spiel beenden
        </button>
      }
    >
      {sicht.istFortsetzung && (
        <p className="hinweis" style={{ margin: 0, textAlign: 'center' }}>
          Setzt euer Spiel gegen {teamName(gegnerTeam)} fort.
        </p>
      )}
      <div className="bummerl-leiste">
        <span className="bummerl-leiste__name">{teamName(meinTeam)}</span>
        <span className="bummerl-leiste__wert mono-zahl">{sicht.bummerl[meinTeam]}</span>
        <span className="bummerl-leiste__label">Bummerl</span>
        <span className="bummerl-leiste__wert mono-zahl">{sicht.bummerl[gegnerTeam]}</span>
        <span className="bummerl-leiste__name">{teamName(gegnerTeam)}</span>
      </div>
      <div className="bummerl-leiste">
        <span className="bummerl-leiste__name">{teamName(meinTeam)}</span>
        <span className="bummerl-leiste__wert mono-zahl">{sicht.bummerlPunkte[meinTeam]}</span>
        <span className="bummerl-leiste__label">bis Bummerl</span>
        <span className="bummerl-leiste__wert mono-zahl">{sicht.bummerlPunkte[gegnerTeam]}</span>
        <span className="bummerl-leiste__name">{teamName(gegnerTeam)}</span>
      </div>

      <section className="karte karte--flach" style={{ textAlign: 'center' }}>
        <div className="reihe reihe--verteilt">
          {andereSitze.map((sitz) => (
            <span className="klein muted" key={sitz}>
              {sicht.spielerNamen[sitz]}: {sicht.kartenAnzahl[sitz]} Karten
            </span>
          ))}
        </div>
        {sicht.trumpf && (
          <p className="klein muted" style={{ margin: 0 }}>
            Trumpf {farbSymbol(sicht.trumpf, kartendesign)}
            {sicht.aktiveAnsage && ` · Ansage: ${ANSAGE_LABEL[sicht.aktiveAnsage.ansage]} (${sicht.spielerNamen[sicht.aktiveAnsage.spieler]})`}
            {sicht.spritzenFaktor > 1 && ` · gespritzt ×${sicht.spritzenFaktor}`}
          </p>
        )}

        {sicht.phase === 'ansage' && (
          <AnsageLeiste sicht={sicht} />
        )}
        {sicht.phase === 'trumpfwahl' && (
          <TrumpfwahlLeiste sicht={sicht} kartendesign={kartendesign} />
        )}
        {sicht.phase === 'spritzen' && (
          <SpritzenLeiste sicht={sicht} teamName={teamName} />
        )}

        {sicht.phase === 'spielt' && (
          <>
            <div className="reihe" style={{ justifyContent: 'center', minHeight: 90, gap: 12, flexWrap: 'wrap' }}>
              {sicht.offenerStich.map((eintrag, index) => (
                <SpielKarte
                  key={index}
                  karte={eintrag.karte}
                  design={kartendesign}
                  beschriftung={sicht.spielerNamen[eintrag.spieler]}
                />
              ))}
            </div>
            <p className="hinweis" style={{ margin: 0 }}>
              {ichBinAmZug ? 'Du bist am Zug' : `${sicht.spielerNamen[sicht.amZug]} ist am Zug`}
            </p>
          </>
        )}
      </section>

      {ichBinAmZug && sicht.phase === 'spielt' && sicht.offenerStich.length === 0 && sicht.meldbareFarben.length > 0 && (
        <div className="reihe reihe--umbruch">
          {sicht.meldbareFarben.map((farbe) => (
            <button
              type="button"
              key={farbe}
              className="btn btn--klein"
              onClick={() => onlineAktionenVierer.melden(farbe)}
            >
              Melden {farbName(farbe, kartendesign)} ({farbe === sicht.trumpf ? 40 : 20})
            </button>
          ))}
        </div>
      )}

      <section className="karte">
        <h2 className="karte__titel">Deine Hand</h2>
        <div className="reihe reihe--umbruch" style={{ justifyContent: 'center' }}>
          {sortiereHand(sicht.meineHand).map((karte) => {
            const erlaubt =
              ichBinAmZug &&
              sicht.phase === 'spielt' &&
              (sicht.legaleKarten === null || sicht.legaleKarten.some((k) => gleicheKarte(k, karte)))
            return (
              <SpielKarte
                key={kartenId(karte)}
                karte={karte}
                design={kartendesign}
                klickbar={erlaubt}
                onClick={erlaubt ? () => onlineAktionenVierer.karteSpielen(karte) : undefined}
              />
            )
          })}
        </div>
      </section>

      {fehler && <p className="fehler">{fehler}</p>}

      {bummerlErgebnis ? (
        <Dialog
          icon="🏆"
          titel={
            bummerlErgebnis.gewinnerTeam === meinTeam
              ? 'Dein Team gewinnt das Bummerl!'
              : `${teamName(bummerlErgebnis.gewinnerTeam)} gewinnt das Bummerl`
          }
          text={`${letztesErgebnis ? `Letzte Partie: ${spielpunkteText(letztesErgebnis.spielpunkte)}. ` : ''}Bummerl-Stand: ${bummerlErgebnis.bummerl[meinTeam]} : ${bummerlErgebnis.bummerl[gegnerTeam]}. Die nächste Partie wurde bereits ausgeteilt.`}
          aktionen={
            <button
              type="button"
              className="btn btn--primaer"
              onClick={() => onlineAktionenVierer.letztesErgebnisQuittieren()}
            >
              Weiter
            </button>
          }
        />
      ) : (
        letztesErgebnis && (
          <Dialog
            icon="🏆"
            titel={
              letztesErgebnis.gewinnerTeam === meinTeam
                ? `Dein Team gewinnt die Partie! (${spielpunkteText(letztesErgebnis.spielpunkte)})`
                : `${teamName(letztesErgebnis.gewinnerTeam)} gewinnt die Partie (${spielpunkteText(letztesErgebnis.spielpunkte)})`
            }
            text="Die nächste Partie wurde bereits ausgeteilt."
            aktionen={
              <button
                type="button"
                className="btn btn--primaer"
                onClick={() => onlineAktionenVierer.letztesErgebnisQuittieren()}
              >
                Weiter
              </button>
            }
          />
        )
      )}
    </Screen>
  )
}

function AnsageLeiste({ sicht }: { sicht: OeffentlicheSichtVierer }) {
  const ichBinDran = sicht.ansageAnDerReihe === sicht.meinIndex
  return (
    <div className="stapel stapel--eng">
      <p className="hinweis" style={{ margin: 0 }}>
        {sicht.ansageHoechste
          ? `Höchste Ansage: ${ANSAGE_LABEL[sicht.ansageHoechste.ansage]} (${sicht.spielerNamen[sicht.ansageHoechste.spieler]})`
          : 'Noch keine Ansage'}
        {' – '}
        {ichBinDran ? 'du bist dran' : `${sicht.spielerNamen[sicht.ansageAnDerReihe]} ist dran`}
      </p>
      {ichBinDran && (
        <div className="reihe reihe--umbruch" style={{ justifyContent: 'center' }}>
          {sicht.moeglicheAnsagen.map((ansage) => (
            <button
              type="button"
              key={ansage}
              className="btn btn--klein"
              onClick={() => onlineAktionenVierer.ansageMachen(ansage)}
            >
              {ANSAGE_LABEL[ansage]}
            </button>
          ))}
          <button type="button" className="btn btn--geist btn--klein" onClick={() => onlineAktionenVierer.ansagePassen()}>
            Passen
          </button>
        </div>
      )}
    </div>
  )
}

function TrumpfwahlLeiste({ sicht, kartendesign }: { sicht: OeffentlicheSichtVierer; kartendesign: Kartendesign }) {
  if (!sicht.kannTrumpfBestimmen) {
    return (
      <p className="hinweis" style={{ margin: 0 }}>
        {sicht.spielerNamen[sicht.ansageGewinner ?? sicht.meinIndex]} bestimmt den Trumpf …
      </p>
    )
  }
  return (
    <div className="stapel stapel--eng">
      <p className="hinweis" style={{ margin: 0 }}>Wähle den Trumpf oder decke die nächste Karte auf:</p>
      <div className="reihe reihe--umbruch" style={{ justifyContent: 'center' }}>
        {ALLE_FARBEN.map((farbe) => (
          <button
            type="button"
            key={farbe}
            className="btn btn--klein"
            onClick={() => onlineAktionenVierer.trumpfWaehlen(farbe)}
          >
            {farbSymbol(farbe, kartendesign)} {farbName(farbe, kartendesign)}
          </button>
        ))}
        <button
          type="button"
          className="btn btn--geist btn--klein"
          onClick={() => onlineAktionenVierer.trumpfAufdecken()}
        >
          Karte aufdecken
        </button>
      </div>
    </div>
  )
}

function SpritzenLeiste({
  sicht,
  teamName,
}: {
  sicht: OeffentlicheSichtVierer
  teamName: (team: 0 | 1) => string
}) {
  if (!sicht.kannSpritzen) {
    return (
      <p className="hinweis" style={{ margin: 0 }}>
        {sicht.spritzenAmZug !== null ? `${teamName(sicht.spritzenAmZug)} überlegt: spritzen?` : 'Spritzen-Runde läuft …'}
      </p>
    )
  }
  return (
    <div className="reihe reihe--umbruch" style={{ justifyContent: 'center' }}>
      <button type="button" className="btn btn--klein" onClick={() => onlineAktionenVierer.spritzenMachen()}>
        Spritzen (verdoppeln)
      </button>
      <button type="button" className="btn btn--geist btn--klein" onClick={() => onlineAktionenVierer.spritzenPassen()}>
        Passen
      </button>
    </div>
  )
}

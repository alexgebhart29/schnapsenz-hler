import { useEffect, useState } from 'react'
import { Dialog } from '../components/Dialog'
import { Screen } from '../components/Screen'
import { ErsterStichAnzeige, Kartenstoss, SpielKarte } from '../components/SpielKarte'
import { navigiere } from '../navigation'
import {
  onlineAktionen,
  useOnlineZustand,
  type OeffentlicheSicht,
} from '../core/onlineSitzung'
import { farbName, farbSymbol, gleicheKarte, kartenId, sortiereHand } from '../core/karten'
import { spielBeenden } from '../core/schnapsen'
import { actions } from '../core/store'
import type { AppState, Kartendesign } from '../core/types'

type Props = { state: AppState; kartendesign: Kartendesign }

export function OnlineTischScreen({ state, kartendesign }: Props) {
  const zustand = useOnlineZustand()

  // Verbindung verloren oder Tisch geschlossen: zurück zur Lobby.
  useEffect(() => {
    if (zustand.status === 'getrennt') navigiere({ name: 'online-lobby' })
  }, [zustand.status])

  // Verlässt der Nutzer diesen Bildschirm (z. B. über den Zurück-Pfeil statt
  // "Abbrechen"), die Verbindung sauber trennen – sonst hängt sie offen und
  // ein späterer neuer Versuch würde auf ihr aufsetzen.
  useEffect(() => {
    return () => onlineAktionen.trennen()
  }, [])

  if (zustand.status === 'wartet-auf-gegner') {
    return (
      <Screen titel="Online spielen">
        <section className="karte" style={{ textAlign: 'center' }}>
          <h2 className="karte__titel">Warte auf Gegner …</h2>
          <p className="hinweis">
            Dein Tisch steht jetzt in der Liste offener Tische – sobald jemand beitritt, geht es los.
          </p>
        </section>
        <button
          type="button"
          className="btn btn--geist btn--block"
          onClick={() => onlineAktionen.trennen()}
        >
          Abbrechen
        </button>
      </Screen>
    )
  }

  if (!zustand.sicht) {
    return (
      <Screen titel="Online spielen">
        <p className="hinweis" style={{ textAlign: 'center' }}>
          Verbinde …
        </p>
      </Screen>
    )
  }

  return (
    <TischAnsicht
      sicht={zustand.sicht}
      kartendesign={kartendesign}
      letztesErgebnis={zustand.letztesErgebnis}
      bummerlErgebnis={zustand.bummerlErgebnis}
      fehler={zustand.fehler}
      verknuepftesSpielId={zustand.verknuepftesSpielId}
      fortgesetztesSpiel={zustand.fortgesetztesSpiel}
      schneiderAktiv={state.settings.schneiderAktiv}
    />
  )
}

function TischAnsicht({
  sicht,
  kartendesign,
  letztesErgebnis,
  bummerlErgebnis,
  fehler,
  verknuepftesSpielId,
  fortgesetztesSpiel,
  schneiderAktiv,
}: {
  sicht: OeffentlicheSicht
  kartendesign: Kartendesign
  letztesErgebnis: { gewinner: 0 | 1; spielpunkte: 1 | 2 | 3 } | null
  bummerlErgebnis: { gewinner: 0 | 1; bummerl: [number, number] } | null
  fehler: string | null
  verknuepftesSpielId: string | null
  fortgesetztesSpiel: boolean
  schneiderAktiv: boolean
}) {
  const [zeigeVerlauf, setZeigeVerlauf] = useState(false)
  const ichBinAmZug = sicht.amZug === sicht.meinIndex
  const meinName = sicht.spielerNamen[sicht.meinIndex]
  const gegnerName = sicht.spielerNamen[1 - sicht.meinIndex]
  const eigeneStiche = sicht.stichVerlauf.filter((eintrag) => eintrag.sieger === sicht.meinIndex)
  const meineBummerl = sicht.bummerl[sicht.meinIndex]
  const gegnerBummerl = sicht.bummerl[1 - sicht.meinIndex]
  const meineBummerlPunkte = sicht.bummerlPunkte[sicht.meinIndex]
  const gegnerBummerlPunkte = sicht.bummerlPunkte[1 - sicht.meinIndex]

  const spielBeendenKlick = () => {
    if (verknuepftesSpielId) {
      actions.updateSpiel(verknuepftesSpielId, (s) => spielBeenden(s, undefined, schneiderAktiv))
    }
    onlineAktionen.trennen()
    navigiere({ name: 'historie' })
  }

  return (
    <Screen
      titel={`${meinName} vs. ${gegnerName}`}
      aktion={
        <button type="button" className="btn btn--geist btn--klein" onClick={spielBeendenKlick}>
          Spiel beenden
        </button>
      }
    >
      {fortgesetztesSpiel && (
        <p className="hinweis" style={{ margin: 0, textAlign: 'center' }}>
          Setzt dein Spiel gegen {gegnerName} fort.
        </p>
      )}
      <div className="bummerl-leiste">
        <span className="bummerl-leiste__name">{meinName}</span>
        <span className="bummerl-leiste__wert mono-zahl">{meineBummerl}</span>
        <span className="bummerl-leiste__label">Bummerl</span>
        <span className="bummerl-leiste__wert mono-zahl">{gegnerBummerl}</span>
        <span className="bummerl-leiste__name">{gegnerName}</span>
      </div>
      <div className="bummerl-leiste">
        <span className="bummerl-leiste__name">{meinName}</span>
        <span className="bummerl-leiste__wert mono-zahl">{meineBummerlPunkte}</span>
        <span className="bummerl-leiste__label">bis Bummerl</span>
        <span className="bummerl-leiste__wert mono-zahl">{gegnerBummerlPunkte}</span>
        <span className="bummerl-leiste__name">{gegnerName}</span>
      </div>

      <section className="karte karte--flach" style={{ textAlign: 'center' }}>
        <div className="reihe reihe--verteilt">
          <span className="klein muted">{gegnerName}: {sicht.gegnerAnzahlKarten} Karten</span>
          <span className="klein muted">
            Trumpf {farbSymbol(sicht.trumpf, kartendesign)}
            {sicht.geschlossenVon !== null ? ' · zugedreht' : ''}
          </span>
        </div>

        <div className="reihe reihe--verteilt" style={{ alignItems: 'flex-start' }}>
          <ErsterStichAnzeige
            stich={sicht.ersterStichGegner}
            design={kartendesign}
            beschriftung={`Erster Stich von ${gegnerName}`}
          />
          {eigeneStiche.length > 0 && (
            <button
              type="button"
              className="btn btn--geist btn--klein"
              onClick={() => setZeigeVerlauf(true)}
            >
              Alle Stiche ({eigeneStiche.length})
            </button>
          )}
        </div>

        <div className="reihe" style={{ justifyContent: 'center', minHeight: 90, gap: 18 }}>
          {sicht.offenerStich && (
            <SpielKarte
              karte={sicht.offenerStich.karte}
              design={kartendesign}
              beschriftung={sicht.offenerStich.spieler === sicht.meinIndex ? meinName : gegnerName}
            />
          )}
          <Kartenstoss anzahl={sicht.talonAnzahl} trumpfKarte={sicht.trumpfKarte} kartendesign={kartendesign} />
        </div>

        <p className="hinweis" style={{ margin: 0 }}>
          {ichBinAmZug ? 'Du bist am Zug' : `${gegnerName} ist am Zug`}
        </p>
      </section>

      {ichBinAmZug && !sicht.offenerStich && (sicht.kannZudrehen || sicht.kannBubeTauschen || sicht.meldbareFarben.length > 0) && (
        <div className="reihe reihe--umbruch">
          {sicht.kannZudrehen && (
            <button type="button" className="btn btn--klein" onClick={() => onlineAktionen.zudrehen()}>
              Zudrehen
            </button>
          )}
          {sicht.kannBubeTauschen && (
            <button
              type="button"
              className="btn btn--klein"
              onClick={() => onlineAktionen.bubeTauschen()}
            >
              Bube tauschen
            </button>
          )}
          {sicht.meldbareFarben.map((farbe) => (
            <button
              type="button"
              key={farbe}
              className="btn btn--klein"
              onClick={() => onlineAktionen.melden(farbe)}
            >
              Melden {farbName(farbe, kartendesign)} ({farbe === sicht.trumpf ? 40 : 20})
            </button>
          ))}
        </div>
      )}

      <section className="karte">
        <div className="reihe reihe--verteilt" style={{ alignItems: 'flex-end' }}>
          <ErsterStichAnzeige
            stich={sicht.ersterStichEigener}
            design={kartendesign}
            beschriftung="Dein erster Stich"
          />
          <div style={{ textAlign: 'center' }}>
            <div className="klein muted">Deine Punkte</div>
            <div className="mono-zahl" style={{ fontSize: '3.2rem', fontWeight: 800, lineHeight: 1 }}>
              {sicht.meineAugen}
            </div>
          </div>
        </div>
        <hr className="trenner" />
        <h2 className="karte__titel">Deine Hand</h2>
        <div className="reihe reihe--umbruch" style={{ justifyContent: 'center' }}>
          {sortiereHand(sicht.meineHand).map((karte) => {
            const erlaubt =
              ichBinAmZug &&
              (sicht.legaleKarten === null || sicht.legaleKarten.some((k) => gleicheKarte(k, karte)))
            return (
              <SpielKarte
                key={kartenId(karte)}
                karte={karte}
                design={kartendesign}
                klickbar={erlaubt}
                onClick={erlaubt ? () => onlineAktionen.karteSpielen(karte) : undefined}
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
            bummerlErgebnis.gewinner === sicht.meinIndex
              ? 'Du gewinnst das Bummerl!'
              : `${gegnerName} gewinnt das Bummerl`
          }
          text={`${letztesErgebnis ? `Letzte Partie: ${letztesErgebnis.spielpunkte} Spielpunkt${letztesErgebnis.spielpunkte === 1 ? '' : 'e'}. ` : ''}Bummerl-Stand: ${bummerlErgebnis.bummerl[sicht.meinIndex]} : ${bummerlErgebnis.bummerl[1 - sicht.meinIndex]}. Die nächste Partie wurde bereits ausgeteilt.`}
          aktionen={
            <button
              type="button"
              className="btn btn--primaer"
              onClick={() => onlineAktionen.letztesErgebnisQuittieren()}
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
              letztesErgebnis.gewinner === sicht.meinIndex
                ? `Du gewinnst die Partie! (${letztesErgebnis.spielpunkte} Spielpunkt${letztesErgebnis.spielpunkte === 1 ? '' : 'e'})`
                : `${gegnerName} gewinnt die Partie (${letztesErgebnis.spielpunkte} Spielpunkt${letztesErgebnis.spielpunkte === 1 ? '' : 'e'})`
            }
            text="Die nächste Partie wurde bereits ausgeteilt."
            aktionen={
              <button
                type="button"
                className="btn btn--primaer"
                onClick={() => onlineAktionen.letztesErgebnisQuittieren()}
              >
                Weiter
              </button>
            }
          />
        )
      )}

      {zeigeVerlauf && (
        <Dialog
          titel="Deine Stiche dieser Partie"
          onAbbrechen={() => setZeigeVerlauf(false)}
          aktionen={
            <button type="button" className="btn btn--primaer" onClick={() => setZeigeVerlauf(false)}>
              Schließen
            </button>
          }
        >
          <div className="stapel stapel--eng" style={{ maxHeight: '50vh', overflowY: 'auto' }}>
            {[...eigeneStiche].reverse().map((eintrag) => (
              <div className="reihe reihe--verteilt klein" key={eintrag.nummer}>
                <span className="muted">#{eintrag.nummer}</span>
                <div className="reihe" style={{ gap: 4 }}>
                  {eintrag.karten.map((karte, kartenIndex) => (
                    <SpielKarte key={kartenIndex} karte={karte} design={kartendesign} klein />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Dialog>
      )}
    </Screen>
  )
}

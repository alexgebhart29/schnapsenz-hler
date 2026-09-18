# Schnapsen Zähler App – Spezifikation

## Überblick
Eine App zum Zählen von **Bummerl** und **Punkten** beim Schnapsen. Kein Login nötig – Spielernamen werden pro Spiel frei eingegeben. Die App verwaltet mehrere Spiele/Runden und merkt sich Spielernamen für schnelle Wiederverwendung.

---

## Kernfunktionen

### 1. Punktezählung
- Countdown-Zähler pro Spieler, **Standardstart bei 7**
- Zähler läuft bei Punktabzug **herunter bis 0**
- Erreicht ein Spieler **0 oder weniger**, ist das Bummerl beendet
- Punkteabzug pro Stich/Runde manuell eingebbar (z. B. 1, 2, 3 Punkte je nach Spielausgang)
- Anzeige des aktuellen Punktestands beider Spieler während des Spiels
- Möglichkeit, den letzten Punkteabzug rückgängig zu machen (Undo)

### 2. Bummerl-Zählung
- Ein **Bummerl** = eine abgeschlossene Zählrunde (Startwert bis 0 runtergezählt)
- App zählt automatisch mit, wie viele Bummerl jeder Spieler/jedes Match bereits gespielt/gewonnen hat
- Nach Abschluss eines Bummerls: Option, direkt ein neues zu starten (gleiche Spieler, Zähler resettet auf Startwert)

### 3. Spieler & Spiele
- **Keine Useranmeldung erforderlich**
- Vor Spielstart: Eingabe von 2 Spielernamen (frei editierbar)
- Bereits verwendete Spielernamen werden lokal gespeichert und beim nächsten Spiel als Vorschlag angeboten
- Jedes gespielte Spiel wird protokolliert:
  - Datum/Uhrzeit
  - Spielername(n)
  - Anzahl gewonnener Bummerl je Spieler
  - Endstand

### 4. Menü / Einstellungen
- **Startwert des Countdown-Zählers einstellbar** (Standard: 7, frei wählbar, z. B. 5–15)
- **Rangliste (Ranks) konfigurierbar**:
  - Einträge bestehend aus **Name + Punkte**
  - Ranks frei hinzufügen, bearbeiten, löschen
  - Dient zur Einordnung/Bewertung der Spielstärke oder als Bestenliste
- Allgemeine App-Einstellungen (z. B. Design/Theme, Sprache – optional erweiterbar)

---

## Datenmodell (Vorschlag)

```
Spieler
- name: string

Spiel
- id: string
- datum: datetime
- spieler: [Spieler, Spieler]
- startwert: int (default 7)
- bummerlAnzahl: { spieler1: int, spieler2: int }
- aktuellePunkte: { spieler1: int, spieler2: int }
- status: "laufend" | "beendet"

Rank
- name: string
- punkte: int
```

---

## Bildschirme (Screens)

1. **Startbildschirm**
   - Neues Spiel starten (Spielernamen eingeben/auswählen)
   - Letzte Spiele anzeigen
   - Zugang zu Einstellungen und Rangliste

2. **Spiel-Screen**
   - Punktestand beider Spieler (groß, gut lesbar)
   - Buttons zum Punkteabzug
   - Bummerl-Anzeige (aktueller Stand)
   - Undo-Funktion
   - Button „Bummerl beenden“ / automatische Erkennung bei 0

3. **Einstellungen**
   - Startwert des Zählers
   - Ranks verwalten (Liste: Name, Punkte – hinzufügen/bearbeiten/löschen)

4. **Rangliste / Ranks**
   - Übersicht aller Ranks sortiert nach Punkten

5. **Spielverlauf / Historie**
   - Liste vergangener Spiele mit Spielernamen, Datum, Ergebnis

---

## Offene Punkte (zu klären)
- Wie genau werden Punkte pro Stich berechnet (Regelwerk-Details, z. B. 20/40, Bummerl-Sonderregeln)?
- Sollen Ranks automatisch aus Spielergebnissen berechnet werden oder rein manuell gepflegt werden?
- Soll es eine Statistik-Ansicht geben (Siegquote, Lieblingsgegner etc.)?
- Zielplattform (iOS/Android/Web)?

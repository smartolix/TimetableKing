# TimetableKing

Stundenplanprogramm für Schulen, das komplett im Browser läuft. (In der Oberfläche heißt es derzeit noch „Stundenwerk“.)

## Funktionen

- **Stammdaten:** Fächer, Lehrkräfte (mit Soll-Stunden), Klassen mit Stammraum, Räume, Zeitraster
- **Teilungen und Kopplungen:** Klassen in Gruppen teilen (z. B. Religion RK/EV, Werkgruppen G1/G2); gekoppelte Teile finden gleichzeitig statt
- **Teamteaching:** Zweitlehrkraft in allen oder einem Teil der Stunden; Lehrkraft-Pool, aus dem automatisch eingeteilt wird
- **Bedingungen mit Wichtigkeit** (Aus / Niedrig / Normal / Hoch / Muss): Höchst- und Mindeststunden, Hohlstunden, Arbeitstage, Mittagspause, Zeitwünsche (frei / unerwünscht / gesperrt), Beziehungen zwischen Fächern
- **Automatische Berechnung** im Browser auf mehreren Prozessorkernen (Web Worker), mit Prüfung der Daten vorab
- **Manuelle Bearbeitung:** Ziehen und Ablegen, Tauschen, Fixieren, Rückgängig
- **Vertretungsplanung:** Abwesenheiten, Vorschläge für Vertretungen, Statistik, druckbarer Vertretungsplan
- **Export:** Druckversion (HTML), CSV für Excel, Sicherung als JSON

## Benutzen

`index.html` im Browser öffnen. Sie enthält das komplette Programm in einer Datei.

## Aufbau

| Datei | Inhalt |
|---|---|
| `solver.js` | Rechenkern: Aufbau mit Verdrängung, danach Optimierung (Simulated Annealing) |
| `model.js` | Datenmodell, Umwandlung in das Rechenproblem, Beispielschule |
| `sample_placements.js` | Vorberechneter Plan für die Beispielschule |
| `src/core.js` | Zustand, Speichern, Analyse, Konfliktprüfung |
| `src/plan.js` | Stundenplanansicht, Ziehen und Ablegen, Berechnung, Dialoge |
| `src/lists.js` | Listen und Bearbeitungsdialoge |
| `src/rules.js` | Bereich „Bedingungen“ und Datenprüfung |
| `src/subs.js` | Vertretungsplanung |
| `src/misc.js` | Einstellungen, Exporte, Ereignisse |
| `app.css`, `shell.html` | Gestaltung und Grundgerüst |

## Bauen

Nach Änderungen an den Quelldateien:

```bash
./build.sh
```

Das Skript fügt alles zu `index.html` zusammen.

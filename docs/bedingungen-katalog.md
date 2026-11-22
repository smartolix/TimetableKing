# Bedingungs-Katalog

Zusammenstellung der Bedingungen, die aSc Stundenplan (EduPage) und Untis (WebUntis) anbieten, als Vorlage für TimetableKing.
Quellen: offizielle Online-Hilfen (Stand November 2026), Links am Ende.

Legende Spalte „TTK“: ✅ schon umgesetzt · ◐ teilweise · – fehlt

> Stand der Spalte „TTK“: vor Einführung des Bedingungs-Menüs. Inzwischen umgesetzt sind die 26 Arten in `backend/app/constraint_catalog.py` (siehe README).

## Wichtigkeit / Gewichtung

| Programm | Stufen |
|---|---|
| aSc | jede Bedingung und Kartenbeziehung hat eine „Importance“ und lässt sich aktivieren/deaktivieren. Bei der Generierung kann „Constraints relaxation“ einzelne Bedingungen verletzen, um einen vollständigen Plan zu finden; „strict“ erlaubt keine Verletzung. |
| Untis | 6 Stufen pro Gewichtungs-Regler: 0 unwichtig, 1 wenig wichtig, 2 eher wichtig, 3 wichtig, 4 sehr wichtig, 5 extrem wichtig. Bei einzelnen Lehrkräften lässt sich die Wichtigkeit für Hohlstunden, Mittagspause, Max. Stunden/Tag und Max. Stunden in Folge zusätzlich auf „sehr wichtig“ anheben. |

**Für TimetableKing:** Stufen Aus / Niedrig / Normal / Hoch / Muss („Muss“ = feste Regel), dazu ein Schalter „Bedingungen lockern“ wie bei aSc.

## Geltungsbereich („Apply to“, aSc)

Erweiterte Kartenbeziehungen in aSc können gelten:
global (ganze Schule) · je Lehrkraft · je Klasse · je Fach in ausgewählten Klassen · je Raum · je Schüler · je Jahrgang.
Mit einem Filter lässt sich das auf ausgewählte Objekte einschränken. Zusätzlich gibt es eine „Zeitkarte“ (time map), die eine Beziehung nur für bestimmte Tage/Stunden gelten lässt.

## Lehrkräfte

| Bedingung | aSc | Untis | TTK |
|---|---|---|---|
| Sperrzeiten / Zeitwünsche (frei, unerwünscht, gesperrt) | Time-off | Zeitwünsche, gewichtet | ◐ nur gesperrt |
| Max. Hohlstunden pro Woche | ✓ (global oder je Lehrkraft) | Min/Max Hohlstunden | ◐ nur gewichtet minimiert |
| Max. Hohlstunden pro Tag / höchstens 1 pro Tag | ✓ | – | – |
| Doppel-Hohlstunden vermeiden | „keine Lücke der Länge 2“ | ✓ eigener Regler | – |
| Min./Max. Stunden pro Tag | ✓ | ✓ | ◐ nur Max |
| Max. Stunden in Folge | ✓ | ✓ | – |
| Max. Arbeitstage pro Woche (egal welche) | ✓ | – | – |
| Freier Tag „entweder Mo oder Fr“ | über Kartenbeziehung | – | – |
| Max. Stunden auf markierten Positionen (z. B. nur eine 7. Stunde) | ✓ | „Stunden im letzten Vormittags-Slot“ | – |
| Mittagspause | ✓ | Min/Max Länge | – |
| Nur eine Stunde an einem Halbtag vermeiden | – | ✓ | – |
| Max. Anwesenheitsdauer pro Tag | – | ✓ | – |
| Pause am Tagesbeginn/-ende | – | ✓ | – |
| Gebäudewechsel pro Tag | ✓ | Wegzeiten zu Außenstellen | – |
| Klassenvorstand unterrichtet Klasse zu bestimmter Zeit / mind. 1× pro Tag | ✓ | ✓ | – |
| Max. N Stunden pro Tag in derselben Klasse | ✓ | – | – |
| Nicht in zwei verschiedenen Klassen am selben Tag | ✓ | – | – |
| Max. N Stunden in Folge in derselben Klasse | ✓ | – | – |
| Muss mit 1. oder 2. Stunde beginnen | ✓ | – | – |
| Nicht sowohl 6. als auch 7. Stunde | ✓ | – | – |
| Nicht vormittags und nachmittags am selben Tag | ✓ | – | – |
| Unterricht an aufeinanderfolgenden Tagen | ✓ | – | – |
| Zwei Lehrkräfte nicht gleichzeitig | ✓ | – | – |
| Mind. N freie Lehrkräfte pro Stunde (Supplierreserve) | ✓ | – | – |

## Klassen

| Bedingung | aSc | Untis | TTK |
|---|---|---|---|
| Keine Hohlstunden (Unterrichtsblock) | ✓ (Bildungsblock, Ausnahmen möglich) | ✓ | ✅ gewichtet |
| Max. Hohlstunden pro Tag | ✓ | – | – |
| Min./Max. Stunden pro Tag | ✓ | ✓ | – |
| Beginn ab 2. Stunde erlaubt (z. B. höchstens 1× pro Woche) | ✓ | – | – |
| Max. Stunden auf markierten Positionen (z. B. max. eine 7. Stunde) | ✓ | – | ◐ „späte Stunden“ gewichtet |
| Mittagspause (eine freie Stunde in einem Zeitfenster) | ✓ | Min/Max Länge | – |
| Max. Fächer mit Vorbereitung/Hausübung pro Tag | ✓ | Max. Hauptfächer pro Tag | – |
| Max. Hauptfächer in Folge | – | ✓ | – |
| Hauptfach mind. 1× bis Stunde X / max. 1× nach Stunde X | – | ✓ | – |
| Gruppen enden gleichzeitig | ✓ | – | – |
| Keine Einzelstunde nach der Mittagspause | ✓ | „nur eine Stunde am Halbtag“ | – |
| Spätestes Unterrichtsende (z. B. Bus) | ✓ | über Zeitwünsche | ◐ über Sperrzeiten |
| Max. verschiedene Fächer pro Tag | – | ✓ | – |
| Max. Klassen gleichzeitig in Mittagspause | – | ✓ (fest) | – |

## Fächer und Unterricht (Kartenbeziehungen)

| Bedingung | aSc | Untis | TTK |
|---|---|---|---|
| Max. 1× pro Tag | ✓ | ✓ | ◐ (Blöcke auf verschiedene Tage) |
| Verteilung über die Woche (z. B. 1+1+1+2) | ✓ | – | ◐ (Doppelstunden) |
| Nicht an aufeinanderfolgenden Tagen (auch Fr → Mo) | ✓ | 2-Stunden-Fächer nicht an Folgetagen | – |
| Mind. N freie Tage zwischen den Stunden | ✓ | – | – |
| Zweimal am Tag erlaubt, aber nicht hintereinander / nur hintereinander | ✓ | Doppelstunden-Fehler vermeiden | – |
| Doppelstunden nicht über Pausen | ✓ (pro Fach abschaltbar) | – | ✅ |
| Doppelstunden nicht am Montag / nur zu bestimmten Zeiten | ✓ | – | – |
| Doppelstunden nur auf ungeraden Stunden beginnen | ✓ | – | – |
| Doppelstunden vor Einzelstunden in der Woche | ✓ | – | – |
| Zwei Fächer nicht am selben Tag / nicht direkt nacheinander | ✓ | Fächerfolge | – |
| Fach B nicht am Tag nach Fach A | ✓ | – | – |
| Zwei Fächer am selben Tag / direkt hintereinander | ✓ | – | – |
| Mind. N Stunden Abstand zwischen zwei Fächern | ✓ | – | – |
| Gleiche Position in mehreren Klassen / gleichzeitig | ✓ | Kopplung | – |
| Fach jeden Tag in derselben Stunde | ✓ | – | – |
| Fach als erste oder letzte Stunde | ✓ | Randstunde (O/F) bzw. nie Randstunde (G) | – |
| Fach vormittags in manchen Klassen, nachmittags in anderen | ✓ | Zeitwünsche Fach | – |
| Max. N auf markierten Positionen (z. B. max. eine Geschichte in 6./7. Stunde) | ✓ | – | – |
| Fach darf über die Mittagspause | ✓ | – | – |
| Fach außerhalb des Unterrichtsblocks (Nachmittag) | ✓ | – | – |
| Max. Schülerzahl | ✓ | – | – |
| Max. N Stunden vor einer bestimmten Position | ✓ | – | – |
| Bestimmte Stunden nicht gleichzeitig | ✓ | – | – |
| Teamteaching nur in N von M Stunden | ✓ | – | – |

## Räume

| Bedingung | aSc | Untis | TTK |
|---|---|---|---|
| Sperrzeiten | ✓ | Zeitwünsche | ✅ |
| Raumgewicht (wie wichtig ist der Fachraum) | Prioritäten | ✓ (0–4) | – |
| Raumkapazität prüfen | ✓ | ✓ | – |
| Alle Stunden eines Unterrichts im selben Raum | ✓ | – | – |
| Mind. 1× pro Woche in bestimmtem Raum | ✓ | – | – |
| Max. 1× pro Woche in bestimmtem Raum | ✓ | – | – |
| Raum nur an N Tagen nutzen | ✓ | – | – |
| Raumnutzung bündeln / Raumwechsel für Schüler minimieren | ✓ | – | – |
| Max. verschiedene Gebäude pro Tag (#58) | ✓ | Außenstellen | – |

## Mehrwochen-Pläne / Perioden

| Bedingung | aSc | Untis | TTK |
|---|---|---|---|
| A/B-Wochen, Terms | ✓ | Jahresplanung | – |
| Fach in aufeinanderfolgenden Wochen | ✓ | – | – |
| Zwei Fächer in beiden Wochen zur selben Zeit | ✓ | – | – |
| Gleichmäßige Verteilung über die Wochen | ✓ | ✓ | – |

## Folgerung für TimetableKing

Die Bedingungen lassen sich auf wenige **Bausteine** zurückführen, die der Solver allgemein umsetzt:

1. **Zählregel:** Für eine Auswahl von Stunden (Filter: Lehrkraft/Klasse/Fach/Raum, optional Zeitkarte) pro Tag/Woche/Halbtag zählen → Min/Max. Damit lassen sich z. B. Max. Stunden pro Tag, Max. auf markierten Positionen, Max. 1× pro Tag oder Max. Arbeitstage abbilden.
2. **Folge-Regel:** Stunden in Folge bzw. Hohlstunden pro Tag/Woche → Max (Hohlstunden, Doppel-Hohlstunden, Max. in Folge, Mittagspause).
3. **Paar-Regel zwischen Fächern/Unterrichten:** gleicher Tag, nicht gleicher Tag, direkt danach, nicht direkt danach, Mindestabstand (Stunden/Tage), gleichzeitig, nicht gleichzeitig, Folgetag.
4. **Positions-Regel:** erste/letzte Stunde, gleiche Stunde jeden Tag, beginnt spätestens mit Stunde X, Ende spätestens Stunde X.
5. **Zeitwünsche** mit Stufen (gesperrt, unerwünscht, neutral, erwünscht).
6. **Raum-Regeln:** gleicher Raum, Kapazität, Raum-Tage, Gebäude.

Jede Regel bekommt Geltungsbereich (global, je Lehrkraft, je Klasse, je Fach in Klasse, je Raum, je Jahrgang) und Wichtigkeit.

## Quellen

- [aSc/EduPage Hilfe – Übersicht Constraints](https://help.edupage.org/?p=u1/u3/u57&lang_id=1)
- [aSc – Teacher's constraints](https://help.edupage.org/?p=lang_id=1&p=u1/u3/u55/u72/t480&lang_id=1)
- [aSc – Class constraints](https://help.edupage.org/?p=lang_id=1&p=u1/u3/u55/u71/t473&lang_id=1)
- [aSc – Subject constraints](https://help.edupage.org/?p=lang_id=1&p=u1/u3/u55/u70/u4293&lang_id=1)
- [aSc – Basic card relationships](https://help.edupage.org/?p=lang_id=1&p=u1/u3/u57/u5467&lang_id=1)
- [aSc – „Apply to“ in card relationships](https://help.edupage.org/?p=lang_id=1&p=u1/u3/u57/u84/t973&lang_id=1)
- [aSc – Windows (gaps) in teachers timetables](https://help.edupage.org/?p=lang_id=1&p=u1/u3/u57/u79/t168&lang_id=1)
- [aSc – Max different buildings per day (#58)](https://help.edupage.org/?p=lang_id=1&p=u1/u3/u55/u212/t1202&lang_id=1)
- [aSc – Constraints relaxation](https://help.edupage.org/?p=lang_id=1&p=u1/u3/u58/t113&lang_id=1)
- [Untis – Weighting](https://www.untis.at/HTML/WebHelp/uk/untis/opgewichtung.htm)
- [Untis – Weighting parameters](https://www.untis.at/HTML/WebHelp/uk/untis/opdie_gewichtungsparameter.htm), mit den Abschnitten [Teachers 1](https://www.untis.at/HTML/WebHelp/uk/untis/opkarteikarte_lehrer_1.htm), [Teachers 2](https://www.untis.at/HTML/WebHelp/uk/untis/opkarteikarte_lehrer_2.htm), [Classes](https://www.untis.at/HTML/WebHelp/uk/untis/opkarteikarte_klassen.htm), [Subjects](https://www.untis.at/HTML/WebHelp/uk/untis/opkarteikarte_faecher.htm), [Main Subjects](https://www.untis.at/HTML/WebHelp/uk/untis/opkarteikarte_hauptfaecher.htm), [Rooms](https://www.untis.at/HTML/WebHelp/uk/untis/opkarteikarte_raeume.htm), [Period Distribution](https://www.untis.at/HTML/WebHelp/uk/untis/opkarteikarte_stundenverteilung.htm), [Time Requests](https://www.untis.at/HTML/WebHelp/uk/untis/opkarteikarte_zeitwuensche.htm)

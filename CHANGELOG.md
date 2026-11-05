# Änderungen

## 1.3.6 – 05.11.2026
- Übersicht KPIs: Die Spalte „Vorperiode“ zeigt Online-, Einzelhandels- und Großabnehmer-Absatz sowie die Auslastung der Fertigungsmitarbeiter auch dann richtig, wenn der TOPSIM-Bericht sie umbrochen druckt. Fehlende Werte kommen aus der nachgerechneten Vorperiode.
- Import liest aus der Executive Summary jetzt auch Absatz je Kanal, die umbrochene Auslastung und die geplante Fertigungsmenge.
- Neue Erfolgswert-Schätzung als Standard: Konstante, Jahresüberschuss, Fremdkapitalquote, Produktqualität und Bekanntheit im Online-Markt. Die Bekanntheit wird aus der letzten Marktforschung vorbelegt. Selbst geänderte Gewichte bleiben erhalten.

## 1.3.5 – 05.11.2026
- Neu unter „Rahmendaten der Periode“: Block „Neue Daten dieser Periode“ mit genau den Werten aus dem TOPSIM-Fenster „Neue Daten“: Gehälter, Zinssätze und Zahlungsquote in Prozent, Produktivität und das Großabnehmer-Angebot. Ein Großabnehmer-Angebot oder ein Kreditzins schaltet das passende Eingabefeld in den Masken frei.
- In den Eingabemasken erinnert ein Knopf daran, solange die neuen Daten der Periode noch nicht eingetragen oder bestätigt sind.

## 1.3.4 – 05.11.2026
- Import repariert: Das Entscheidungsprotokoll im neuen PDF-Layout (Spalten „P 0 … P 3“, umbrochene Bezeichnungen) wurde nicht gelesen. Dadurch rechnete die App eine importierte Periode ohne Preis, Werbung und Fertigung nach. Gilt für Sammel- und Einzelberichte.
- Kundenbetreuer im Einzelhandel werden aus dem Protokoll übernommen.
- Beim Nachrechnen gelten die importierten Ist-Werte (Absatz, Kundenbetreuer) vor den Protokollwerten.
- Neuer Test für das Lesen des Entscheidungsprotokolls.

## 1.3.3 – 03.11.2026
- Updates kommen zuverlässig an: Eine neue Version übernimmt sofort, die App sucht beim Zurückkehren und alle 30 Minuten danach, und „Neu laden“ zeigt direkt die neue Version.
- Übergibt Android eine Sicherungsdatei leer (0 Bytes), erklärt die Meldung jetzt, wie man sie trotzdem auswählt.
- Eine Sicherung kann auch als Text ins Feld „Einlesen“ eingefügt werden.

## 1.3.2 – 03.11.2026
- Sicherung importieren ist toleranter: Byte-Order-Mark, Leerzeichen oder Text rund um die Daten stören nicht mehr.
- Klappt der Import nicht, nennt die Meldung jetzt den Grund (Dateiname, Größe, Dateianfang, Fehler). Ein fehlgeschlagener Import lässt die bisherigen Daten unverändert.

## 1.3.1 – 03.11.2026
- Sicherung importieren klappt jetzt auch auf Android: Die Dateiauswahl filtert nicht mehr nach Dateityp (Android erkennt .json oft nicht), geprüft wird stattdessen der Inhalt.
- Ältere Sicherungen werden beim Import automatisch auf den aktuellen Stand gebracht.

## 1.3.0 – 03.11.2026
- Leerer Start: Die öffentliche App enthält nur noch die für alle gleiche Ausgangslage Periode 0. Eigene Daten kommen per Import oder Sicherungsdatei dazu.
- Willkommenskarte mit den ersten Schritten.
- Öffentliche Tests ohne Teamdaten: Konsistenztest des Rechenkerns, Prognose-Kalibrierung an synthetischen Daten.

## 1.2.0 – 03.11.2026
- Veröffentlichung als Open Source (MIT) mit GitHub Pages.
- Sicherheitsrichtlinie (Content Security Policy): Die App darf nichts aus dem Internet laden oder dorthin senden.
- Eigenes Logo statt Staatswappen.
- Automatische Prüfungen: Virenscan, Bibliotheken gegen Originale, CodeQL, Rechentests.

## 1.1 – 03.11.2026
- Großabnehmer und kurzfristiger Kredit nur noch einblendbar, wenn TOPSIM sie anbietet.
- Rechnen erst beim Speichern (umschaltbar), geänderte Zeilen werden markiert, die Ergebnisleiste zeigt die Veränderung.
- Szenario-Menü: neu, umbenennen, löschen, Teamentscheidung markieren.
- Absatzprognose, Konkurrenz-Was-wäre-wenn, Lieferfähigkeits-Ampel, Hebel-Analyse, Optimierer, Vorschau bis Periode 6, Plan-Ist-Abgleich, Eingabe-Spickzettel.

## 1.0 – 02.11.2026
- Eingabemasken, Rechenkern (geprüft gegen TOPSIM P1–P3), alle Berichte, PDF/ZIP-Download, Import der Sammelberichte, Szenarien, Bayern-Design, Deutsch/Boarisch.

# Sicherheit

## Was die App darf und was nicht

| | |
|---|---|
| Daten ins Internet senden | **Nein.** Die Content Security Policy in `index.html` erlaubt nur Dateien aus dem eigenen Ordner (`default-src 'self'`, `connect-src 'self'`). |
| Dateien auf dem Rechner lesen | **Nur** Dateien, die man selbst auswählt oder hineinzieht (TOPSIM-PDFs, Sicherungsdatei). |
| Dateien auf dem Rechner schreiben | **Nur** Downloads, die man selbst anklickt (PDF, ZIP, Sicherung). Sie landen im normalen Download-Ordner. |
| Programme installieren oder starten | **Nein.** Es gibt keine ausführbaren Dateien. |
| Speichern | Im lokalen Browserspeicher (`localStorage`) dieses einen Browsers. Löschbar über „Daten & Import → Alles zurücksetzen“ oder die Browserdaten. |

## Automatische Prüfungen

Bei jedem Hochladen und jeden Montag laufen auf GitHub:

1. **Virenscan (ClamAV)** über alle Dateien des Repositorys mit tagesaktuellen Signaturen.
2. **Bibliotheken unverändert:** `scripts/verify-vendor.sh` lädt jsPDF, jsPDF-AutoTable, JSZip und PDF.js in der verwendeten Version aus dem offiziellen npm-Register und vergleicht sie byte-genau (SHA-256) mit `vendor/`. Die Prüfsummen stehen zusätzlich in `vendor/CHECKSUMS.sha256`.
3. **CodeQL:** statische Sicherheitsanalyse des eigenen JavaScript-Codes durch GitHub.
4. **Keine externen Adressen:** Der eigene Code enthält keine `http://`- oder `https://`-Adressen.
5. **Rechentests:** Konsistenz des Rechenkerns und Kalibrierung der Prognose.

Die Protokolle sind öffentlich unter [Actions](https://github.com/Vulnoa/Planrechner-Topsim/actions) einsehbar.

## Selbst prüfen

- **VirusTotal:** Auf GitHub „Code → Download ZIP“, dann die ZIP-Datei auf [virustotal.com](https://www.virustotal.com) hochladen. Sie wird dort von rund 70 Virenscannern gleichzeitig geprüft.
- **Netzwerk beobachten:** App öffnen, F12 drücken, Reiter „Netzwerk“. Es erscheinen nur Dateien der App selbst, keine Anfragen an fremde Adressen, auch nicht beim Rechnen oder beim PDF-Import.
- **Prüfsummen:** `cd vendor && sha256sum -c CHECKSUMS.sha256`

## Sicherheitslücke melden

Bitte über „Issues“ in diesem Repository melden oder, bei vertraulichen Hinweisen, über „Security → Report a vulnerability“.

// Sprachen: Deutsch (Quelle) und Boarisch. Fehlt eine Übersetzung, bleibt der deutsche Text stehen.
let lang = 'de';
export const setLang = (l) => { lang = l === 'bar' ? 'bar' : 'de'; };
export const getLang = () => lang;

const BAR = {
  'Periode': 'Periodn', 'Planperiode': 'Planperiodn', 'abgeschlossen': 'erledigt',
  'Vertrieb und Produktentwicklung': 'Vatrieb und Produktentwicklung', 'Einkauf und Fertigung': 'Eikauf und Fertigung',
  'Finanzen und Planwerte': 'Finanzn und Planwert', 'Zurücksetzen': 'Zruckstoin', 'Speichern': 'Obspeichan',
  'Nicht gespeichert': 'No ned gspeichert', 'Gespeichert': 'Gspeichert', 'Szenario': 'Szenario', 'Auswertung': 'Auswertung',
  'Simulieren · Übersicht KPIs': 'Durchrechna · Kennzahln', 'Berichtswesen': 'Berichtl', 'Szenarien & Vergleich': 'Szenarien & Vergleich',
  'Rahmendaten der Periode': 'Rahmendatn vo da Periodn', 'Verwaltung': 'Verwaltung', 'Daten & Import': 'Datn & Eiles',
  'Einstellungen': 'Eistellunga', 'Hilfe & Spielregeln': 'Huif & Spuiregln', 'Hilfe': 'Huif', 'Feld': 'Feid', 'eigenes Feld': 'eigns Feid',
  'Bearbeiten': 'Ändan', 'Löschen': 'Weg damit', 'Preis/Werbung': 'Preis/Werbung', 'Vertrieb': 'Vatrieb', 'Corporate Identity': 'Corporate Identity',
  'Produktentwicklung': 'Produktentwicklung', 'Großabnehmer': 'Großobnehma', 'Einkauf': 'Eikauf', 'Fertigung': 'Fertigung',
  'Fertigungsanlagen': 'Maschina', 'Desinvestitionen': 'Maschina vakaffa', 'Personal': 'Leit', 'Finanzen': 'Finanzn', 'Planwerte': 'Planwert',
  'Superbass': 'Superbass', 'Eingabe': 'Eingob', 'Online-Markt': 'Online-Markt', 'Einzelhandel': 'Einzlhandl', 'Typ A': 'Typ A', 'Typ B': 'Typ B',
  'Preis Online-Markt (EUR)': 'Preis im Online-Ladl (EUR)', 'Aktiv im Einzelhandel': 'Im Einzlhandl dabei',
  'Preis Einzelhandel (EUR)': 'Preis im Einzlhandl (EUR)', 'Werbung Online-Markt (TEUR)': 'Werbung online (TEUR)',
  'Werbung Einzelhandel (TEUR)': 'Werbung Einzlhandl (TEUR)', 'Kundenbetreuer (Anz. Personen)': 'Kundnbetreia (Leit)',
  'Corporate Identity (TEUR)': 'Corporate Identity (TEUR)', 'Zuwachs Produktqualität (Level)': 'Mehr Qualität (Level)',
  'Liefermenge Großabnehmer (Stück)': 'Liefermeng fürn Großobnehma (Stück)', 'Preis Großabnehmer (EUR)': 'Preis fürn Großobnehma (EUR)',
  'Einsatzstoffe/Teile (Einheit)': 'Eisatzstoff/Teil (Stück)', 'Fertigungsmenge (Stück)': 'Fertigungsmeng (Stück)',
  'Investition (Anz. neue Anlagen)': 'Neie Maschina (Anzahl)', 'Fertigungspersonal (Anz. Personen)': 'Leit in da Fertigung',
  'Kurzfristiger Kredit (TEUR)': 'Kurzer Kredit (TEUR)', 'Angenommener Absatz Superbass Online-Markt (Stück)': 'Gschätzter Absatz online (Stück)',
  'Angenommener Absatz Superbass Einzelhandel (Stück)': 'Gschätzter Absatz Einzlhandl (Stück)',
  'Entscheidung, ob Einzelhandel bedient werden soll.': 'Obs an Einzlhandl beliefat wern soi.',
  'Anlage Nr.': 'Maschin Nr.', 'Restlaufzeit (in Perioden)': 'Laaft no (Periodn)', 'Restbuchwert (TEUR)': 'Restwert (TEUR)', 'Desinvestieren?': 'Vakaffa?',
  'Plan-JÜ': 'Plan-Gwinn', 'Umsatz': 'Umsatz', 'Überziehung': 'Überziehung', 'Lager': 'Lager', 'HK': 'HK', 'SK': 'SK', 'Erfolgswert ≈': 'Erfolgswert ≈',
  'JÜ': 'Gwinn', 'Dispo': 'Dispo', 'Download: alle Berichte': 'Obalon: olle Berichtl', 'Einzelbericht': 'Oas Berichtl', 'Drucken': 'Drucka',
  'Planungsrechnung': 'Planungsrechnung', 'nachgerechnet, stimmt mit TOPSIM überein': 'nochgrechnet, passt mit TOPSIM zam',
  'Abweichung zu TOPSIM': 'Unterschied zu TOPSIM', 'Zum Berichtswesen': 'Zu de Berichtl',
  'Neues Szenario': 'Neis Szenario', 'Aktuelles duplizieren': 'Des do kopiern', 'Umbenennen': 'Umtaufa',
  'Als Teamentscheidung markieren': 'Des nehma ma', 'Alle Szenarien der Periode': 'Olle Szenarien vo da Periodn',
  'TOPSIM-Berichte einfügen': 'TOPSIM-Berichtl eiles', 'Dateien wählen': 'Dateien aussuacha', 'Einlesen': 'Eiles',
  'PDF-Dateien hierher ziehen oder': 'PDF-Dateien do eine ziagn oder', 'Stand der Perioden': 'Stand vo de Periodn', 'Endstand': 'Endstand',
  'Alle Berichte': 'Olle Berichtl', 'Endstand bearbeiten': 'Endstand ändan', 'Sicherung': 'Sicherung', 'Sicherung exportieren': 'Sicherung obalon',
  'Sicherung importieren': 'Sicherung eiles', 'Alles zurücksetzen': 'Ois auf Anfang', 'Erkannt': 'Gfundn', 'Berichte': 'Berichtl',
  'Übernehmen': 'Übanehma', 'Verwerfen': 'Wegschmeißn', 'übernommen': 'übanumma', 'Darstellung': 'Ausschaun', 'Hell': 'Hell', 'Dunkel': 'Dunkl',
  'Mitternacht': 'Mitternacht', 'Sprache': 'Sproch', 'Unternehmen': 'Firma', 'Marke': 'Mark', 'App installieren': 'App installiern',
  'Jetzt installieren': 'Glei installiern', 'Über': 'Über', 'Feld bearbeiten': 'Feid ändan', 'Neues Eingabefeld': 'Neis Eingobfeid',
  'Bezeichnung': 'Nam', 'Einheit': 'Einheit', 'Wirkung in der Rechnung': 'Wos des in da Rechnung macht', 'Standardwert': 'Standardwert',
  'Kostenstelle (bei fixen Kosten)': 'Kostnstoi (bei fixe Kostn)', 'Nachkommastellen': 'Stoin nachm Komma', 'Hinweis (optional)': 'Hinweis (wennst mogst)',
  'Abbrechen': 'Loss ma', 'Feld gespeichert': 'Feid gspeichert', 'Dieses Feld löschen?': 'Des Feid wegmacha?', 'Szenario löschen?': 'Szenario wegmacha?',
  'Ungespeicherte Änderungen verwerfen?': 'De ned gspeichertn Änderunga wegschmeißn?', 'Neuer Name': 'Neier Nam', 'Neues Feld': 'Neis Feid',
  'Neue Version verfügbar.': 'Es gibt a neie Version.', 'Neu laden': 'Nei lon', 'Sicherung importiert': 'Sicherung eiglesn',
  'Die Datei ist keine gültige Sicherung.': 'De Datei is koa gscheide Sicherung.', 'Mengenstaffel Einsatzstoffe': 'Mengenstaffl Eisatzstoff',
  'Staffel': 'Staffl', 'Nur Info (keine Rechenwirkung)': 'Bloß zur Info (rechnet ned mit)', 'Fixe Kosten (TEUR) in Kostenstelle': 'Fixe Kostn (TEUR) in da Kostnstoi',
  'Kosten je verkauftem Stück (EUR)': 'Kostn pro vakaftm Stück (EUR)', 'Kosten je gefertigtem Stück (EUR)': 'Kostn pro gmachtm Stück (EUR)',
  'Sonstiger Ertrag (TEUR)': 'Sonstiga Ertrag (TEUR)', 'Einzahlung ohne Ertrag (TEUR)': 'Geld kimmt eina, ohne Ertrag (TEUR)',
  'Auszahlung ohne Aufwand (TEUR)': 'Geld geht ausse, ohne Aufwand (TEUR)', 'So funktioniert der Planrechner': 'So geht da Planrechner',
  'Spielregeln (Teilnehmerhandbuch)': 'Spuiregln (Handbuach)', 'Fertig': 'Passt', 'Gesamt': 'Gsamt', 'Absatz': 'Absatz',
  'Erfolgswert (Schätzung)': 'Erfolgswert (gschätzt)', 'Periodenüberschuss/-fehlbetrag': 'Gwinn/Verlust vo da Periodn',
  'Absatz gesamt': 'Absatz gsamt', 'Preis Online': 'Preis online', 'Lagerendbestand': 'Lager am End', 'Herstellkosten': 'Herstellkostn',
  'Selbstkosten': 'Selbstkostn', 'Betriebsergebnis': 'Betriebsergebnis', 'Überziehungskredit': 'Überziehungskredit', 'Eigenkapital': 'Eignkapital',
  'Fremdkapitalquote': 'Fremdkapitalquote', 'Eigenkapitalrendite': 'Eigenkapitalrendite', 'Produktqualität': 'Qualität',
};
const BAR_SENTENCES = {
  'Rahmendaten für Periode': 'Rahmendatn für Periodn',
  'Neue Werte aus den Wirtschaftsnachrichten (z. B. Inflation, Staffelpreise, Gehälter) hier eintragen. Sie gelten für alle Szenarien dieser Periode.':
    'Neie Wert aus de Wirtschaftsnachrichtn (Inflation, Staffelpreis, Gehälter) do eitrogn. De geltn für olle Szenarien vo dera Periodn.',
  'Alle Daten liegen nur auf diesem Gerät (im Browser). Für ein anderes Gerät oder als Sicherung exportieren und dort importieren.':
    'De Datn liegn bloß auf dem Gerät (im Browser). Fürs andre Gerät oder zur Sicherheit obalon und drüben wieder eiles.',
  'Sammelbericht als PDF hochladen (auch mehrere Einzelberichte gleichzeitig) oder den Berichtstext kopieren und einfügen. Periode und Inhalte werden automatisch erkannt. Damit lassen sich auch vergangene Perioden nachtragen.':
    'Sammelbericht ois PDF auffelon (geht a mit mehrane Einzelberichtl) oder an Text kopiern und eifügn. Periodn und Inhalt findt er selba. So kannst a oide Periodn nochtrogn.',
  '… oder Text der Berichte hier einfügen (Strg+V)': '… oder an Text vo de Berichtl do eifügn (Strg+V)',
  'nebeneinander (wie „Übernehmen“ in TOPSIM). Grün = bester Wert. Gerechnet wird mit dem aktuellen Bearbeitungsstand.':
    'nebananda (wia „Übernehmen“ in TOPSIM). Grea = da beste Wert. Grechnet werd mim aktuelln Stand.',
  'Windows/Android: in Edge oder Chrome auf „App installieren“ tippen. iPhone/iPad: in Safari „Teilen“ → „Zum Home-Bildschirm“.':
    'Windows/Android: in Edge oder Chrome auf „App installieren“ drucka. iPhone/iPad: in Safari „Teilen“ → „Zum Home-Bildschirm“.',
  'Entscheidungen in den drei Masken eintragen – genau wie in TOPSIM. Das Ergebnis unten rechnet sofort mit.':
    'De Entscheidunga in de drei Masken eitrogn – genau wia in TOPSIM. Untn rechnet er glei mit.',
  '„Speichern“ übernimmt den Stand ins Szenario. Mehrere Szenarien lassen sich anlegen und vergleichen.':
    '„Obspeichan“ legt an Stand ins Szenario. Mehrane Szenarien kannst olegn und vergleicha.',
  'Unter „Berichtswesen“ stehen alle TOPSIM-Berichte, als ZIP mit Einzel-PDFs herunterladbar.':
    'Unter „Berichtl“ stengan olle TOPSIM-Berichte, ois ZIP mit einzelne PDFs zum Obalon.',
  'Nach jeder Periode den neuen Sammelbericht unter „Daten & Import“ einfügen. Dann beginnt die nächste Planperiode.':
    'No jeda Periodn an neien Sammelbericht unter „Datn & Eiles“ eifügn. Dann fangt de nächste Planperiodn o.',
  'Neue Eingabefelder (z. B. aus neuen TOPSIM-Masken) über „+ Feld“ in jeder Kategorie anlegen.':
    'Neie Eingobfeider (z. B. aus neie TOPSIM-Masken) über „+ Feid“ in jeda Kategorie olegn.',
  'Nur Kennzahlen und Bilanz vorhanden. Für alle Berichte den Sammelbericht unter „Daten & Import“ einfügen.':
    'Bloß Kennzahln und Bilanz do. Für olle Berichtl an Sammelbericht unter „Datn & Eiles“ eifügn.',
  'Wirklich alle Eingaben, Szenarien und importierten Daten löschen?': 'Wirklich ois wegmacha – Eingobn, Szenarien und eiglesne Datn?',
};
export function t(s) {
  if (lang !== 'bar' || !s) return s;
  return BAR[s] ?? BAR_SENTENCES[s] ?? s;
}

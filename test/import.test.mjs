// Entscheidungsprotokoll in beiden PDF-Layouts lesen (synthetische Zahlen, keine Teamdaten)
import { parseReports } from '../js/importer.js';

const neu = `TNB19:    Periode: 2
Entscheidungsprotokoll
Marketing-Mix
P 0    P 1    P 2
Preis Online-Markt    Superbass    EUR    150    155    158
Werbung Online-    Superbass    TEUR    300    320    340
Markt
Preis Einzelhandel    Superbass    EUR    0    0    158
Werbung    Superbass    TEUR    0    0    120
Einzelhandel
Kundenbetreuer    Online-Markt    Anzahl    8,0    9,0    9,0
Personalendbestand
Kundenbetreuer    Einzelhandel    Anzahl    0,0    0,0    2,0
Personalendbestand
Corporate Identity    TEUR    0    50    100
Produktentwicklung
P 0    P 1    P 2
Produktqualität    Superbass    Zuwachs    +0    +1    +2
Level
Einkauf und Fertigung
P 0    P 1    P 2
Einsatzstoffe/Teile    Superbass    Einheit    0    10.000    20.000
Fertigungsmenge    Superbass    Stück    41.000    42.000    43.000
Investition (Anz.    Typ A    1    0    1
neue Anlagen)
Investition (Anz.    Typ B    0    1    0
neue Anlagen)
Fertigungspersonal    Anzahl    23,0    22,0    25,0`;

const want = { preisOnline: 158, werbungOnline: 340, preisEH: 158, werbungEH: 120, kbOnline: 9, kbEH: 2, ci: 100, levelUp: 2,
  einkauf: 20000, fertigung: 43000, investA: 1, investB: 0, fertigungMA: 25 };
const got = parseReports(neu).decisions?.[2] || {};
let bad = 0;
for (const [k, v] of Object.entries(want)) { const ok = got[k] === v; if (!ok) bad++; console.log(`${ok ? 'OK ' : 'FEHLER'} ${k.padEnd(14)} erwartet ${v}  gelesen ${got[k]}`); }
const p1 = parseReports(neu).decisions?.[1] || {};
if (p1.investB !== 1 || p1.levelUp !== 1) { bad++; console.log('FEHLER Vorperiode', p1); }
if (bad) { console.log(`\n${bad} Abweichung(en)`); process.exit(1); }
console.log('\nEntscheidungsprotokoll wird korrekt gelesen.');

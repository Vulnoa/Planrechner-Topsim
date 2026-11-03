// Konsistenztest des Rechenkerns mit der für alle Unternehmen gleichen Ausgangslage (Periode 0).
// Prüft Buchhaltungsregeln, die immer gelten müssen. (Der Abgleich mit echten TOPSIM-Berichten
// läuft privat mit den Daten eines Teams und ist deshalb nicht Teil des Repositorys.)
import { simulate, r05, interp } from '../js/engine.js';
import * as d from '../js/defaults.js';

let fail = 0;
const chk = (name, ok, info = '') => { if (!ok) fail++; console.log(`${ok ? 'OK ' : 'XX '} ${name}${info ? '  (' + info + ')' : ''}`); };
const near = (a, b, tol = 0.011) => Math.abs(a - b) <= tol;

const S = d.stateP0(), P = d.paramsP1();
const faelle = {
  'Ausgangslage fortschreiben': { ...d.DEC_HIST[0], investA: 0 },
  'Überstunden + Just-in-Time': { ...d.DEC_HIST[0], investA: 0, fertigung: 54000, fertigungMA: 23, einkauf: 20000, absatzOnline: 50000, levelUp: 2 },
  'Einzelhandel + Investition': { ...d.DEC_HIST[0], investA: 0, investB: 1, ehAktiv: true, preisEH: 155, werbungEH: 100, kbEH: 1, absatzEH: 8000, fertigung: 48000, fertigungMA: 24, ci: 125 },
  'Lieferunfähig + Verlust': { ...d.DEC_HIST[0], investA: 0, preisOnline: 120, fertigung: 20000, fertigungMA: 10, absatzOnline: 60000, werbungOnline: 900 },
};
for (const [name, D] of Object.entries(faelle)) {
  console.log(`--- ${name}`);
  const R = simulate(S, P, D);
  chk('Bilanz: Aktiva = Passiva', near(R.bilanz.aktiva, R.bilanz.passiva), `${R.bilanz.aktiva.toFixed(2)} / ${R.bilanz.passiva.toFixed(2)}`);
  chk('Kasse mindestens Mindestbestand', R.bilanz.kasse >= P.minKasse - 1e-6);
  chk('Lager Fertigerzeugnisse geht auf', near(S.fe.qty + R.fertigung.ist - R.absatz.sold, R.lagerFE.ende.qty, 1e-6));
  chk('Verkauf höchstens verfügbar', R.absatz.sold <= S.fe.qty + R.fertigung.ist + 1e-6);
  chk('Fertigung ≤ Anlagen und Personal (+20 %)', R.fertigung.ist <= Math.min(R.fertigung.kapAnlagen, D.fertigungMA * P.prodMA * 1.2) + 1e-6);
  chk('Personal Einkauf nach Umsatztabelle', R.personal.einkauf.ende === r05(interp(P.einkaufTab, R.guv.umsatz / 1000)));
  chk('Personal Verwaltung nach Umsatztabelle', R.personal.verwaltung.ende === r05(interp(P.verwaltungTab, R.guv.umsatz / 1000)));
  chk('Forderungen = 20 % des Umsatzes', near(R.bilanz.ford, (R.absatz.umsOnline + R.absatz.umsEH) * (1 - P.zahlQuote)));
  chk('Cashflow erklärt Kassenveränderung', near(R.cf.dKasse, R.bilanz.kasse - S.bilanz.kasse, 0.02), `${R.cf.dKasse.toFixed(2)}`);
  chk('Eigenkapital = Vorjahr + Jahresüberschuss', near(R.bilanz.ek, S.bilanz.gez + S.bilanz.krl + S.bilanz.grl + S.bilanz.gvVortrag + R.guv.ju));
  chk('Steuern nur bei Gewinn', R.guv.gvst > 0 ? near(R.guv.steuer, R.guv.gvst * P.steuer) : R.guv.steuer === 0);
}
console.log(fail ? `\n${fail} Prüfungen fehlgeschlagen.` : '\nAlle Prüfungen bestanden.');
process.exit(fail ? 1 : 0);

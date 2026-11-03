// Startdaten: Endstände (aus den TOPSIM-Berichten), Parameter je Periode und Entscheidungen.
// Alles hier ist in der App änderbar; diese Werte dienen nur als Ausgangspunkt.

export const EINKAUF_TAB = [[2, 2], [4, 2.5], [6, 3], [8, 3.5], [10, 4], [12, 4.5], [14, 5], [18, 6], [22, 7]];
export const VERWALTUNG_TAB = [[2, 1], [4, 1.5], [6, 2], [8, 3], [10, 4], [12, 5.5], [14, 7], [18, 9.5], [22, 12]];
export const QUAL_KOSTEN = [16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40];

const machineA = (nr, beschPeriode, rlz, fix = 40) => ({ nr, typ: 'A', beschPeriode, wert: 1250, afaRate: 125,
  rbw: rlz * 125, rlz, fix, cap: 12000, rest: 25 });

// Basisparameter (Stand Periode 3, inkl. Inflation 5,5 %)
export function baseParams() {
  return {
    matStaffel: [[0, 41], [35000, 37], [45000, 35], [60000, 33], [80000, 31]],
    jitPreis: 50, betriebsstoff: 3, transOnline: 5, transEH: 4, lagerMat: 3, lagerFE: 5,
    gehalt: { einkauf: 37.2, verwaltung: 34, fertigung: 42.4, kb: 40.3 },
    nk: 0.30, einstellung: 15, entlassung: 10, prodMA: 2000, ueberMax: 0.20, ueberZuschlag: 0.25,
    sfix: { einkauf: 50, fertigung: 50, vertrieb: 110, verwaltung: 100 },
    gebaeudeAfa: 30, gebaeudeSchluessel: { einkauf: 10, fertigung: 60, vertrieb: 20, verwaltung: 10 },
    anlagen: {
      A: { preis: 1250, dauer: 10, cap: 12000, fix: 40, rest: 25 },
      B: { preis: 750, dauer: 10, cap: 6000, fix: 25, rest: 25 },
    },
    qualKosten: [...QUAL_KOSTEN], fueProLevel: 100, maxLevelUp: 2,
    zinsDispo: 0.06, zinsLang: 0.04, zinsKurz: 0.05, steuer: 0.35, zahlQuote: 0.80, minKasse: 10,
    einkaufTab: EINKAUF_TAB.map((r) => [...r]), verwaltungTab: VERWALTUNG_TAB.map((r) => [...r]),
    erfolgswert: { a: -33, ju: 0.36, ek: 0.071, level: 13.9 },
  };
}




export function emptyDecisions() {
  return {
    preisOnline: 0, ehAktiv: false, preisEH: 0, werbungOnline: 0, werbungEH: 0, kbOnline: 0, kbEH: 0, ci: 0, levelUp: 0,
    einkauf: 0, fertigung: 0, investA: 0, investB: 0, desinvest: [], fertigungMA: 0,
    absatzOnline: 0, absatzEH: 0, gaMenge: 0, gaPreis: 0, kurzKredit: 0, sonstErtrag: 0, kapErhoehung: 0,
  };
}



// Kennzahlen der Ausgangsperiode 0 (für alle Unternehmen gleich). Spätere Perioden kommen per Import dazu.
export const HISTORY = {
  0: { erfolgswert: 228.78, umsatz: 6000, ju: 207.66, absatz: 40000, absatzPlan: 40000, marktanteil: 16.67, fertPlan: 41000, fertIst: 41000,
    lager: 1000, auslMA: 89.13, auslAnlagen: 85.42, hkStk: 94.91, skStk: 139.47, db5Stk: 10.53, be: 421.01, ek: 2407.66, ekRendite: 9.44,
    umsatzRendite: 3.46, kasse: 10, dispo: 1192.25, finErg: -101.54, fkQuote: 44.65, preis: 150, level: 1 },
};

// Endstand Periode 0 laut TOPSIM-Sammelbericht
export function stateP0() {
  const q = 1000 / 41000;
  return {
    period: 0, level: 1, preisOnline: 150, preisEH: 0,
    fe: { qty: 1000, varMat: 1558 * q, fixMat: 204.5 * q, varFert: 1066 * q, fixFert: 1063 * q },
    mat: { qty: 0, value: 0, preis: 35 },
    machines: [machineA(1, -9, 0, 200), machineA(2, -4, 5), machineA(3, -2, 7), machineA(4, 0, 9)],
    staff: { einkauf: 3, verwaltung: 2, fertigung: 23, kb: 8, kbOnline: 8, kbEH: 0 },
    bilanz: { grund: 420, ford: 1200, kasse: 10, gez: 700, krl: 1400, grl: 100, gvVortrag: 207.66, lang: 750, kurz: 0, dispo: 1192.25 },
    verlustvortrag: 0,
  };
}

export function paramsP1() {
  const p = baseParams();
  p.matStaffel = [[0, 38]]; p.jitPreis = 35; p.transOnline = 3; p.transEH = 3;
  p.gehalt = { einkauf: 35, verwaltung: 32, fertigung: 40, kb: 38 };
  p.sfix = { einkauf: 50, fertigung: 50, vertrieb: 115, verwaltung: 100 };
  return p;
}


// Entscheidungen der Ausgangsperiode 0 (für alle Unternehmen gleich)
export const DEC_HIST = {
  0: { ...emptyDecisions(), preisOnline: 150, werbungOnline: 300, kbOnline: 8, fertigung: 41000, investA: 1, fertigungMA: 23, absatzOnline: 40000 },
};

// Marktforschungsbericht (TNB02) der Ausgangsperiode 0. Weitere Perioden kommen per Import dazu und kalibrieren die Absatzprognose.
const mrow = (l, u, v, f) => ({ l, u, v, f });
const markt = (p, L, W, K, pa, B, D, A, ums, ma) => ({ cols: ['U1', 'U2', 'U3', 'U4', 'U5', 'U6'], rows: [
  mrow('Preis', 'EUR', p, 0), mrow('Produktqualität', 'Level', L, 0), mrow('Werbung', 'TEUR', W, 0), mrow('Mitarbeiter Kundenbetreuung', 'Anzahl', K, 1),
  mrow('Preisänderung', '%', pa, 2), mrow('Bekanntheit', 'Index', B, 2), mrow('Potentieller Absatz', 'Stück', D, 0), mrow('Tatsächlicher Absatz', 'Stück', A, 0),
  mrow('Umsatz Markt', 'TEUR', ums, 2), mrow('Marktanteil', '%', ma, 2)] });
const six = (x) => Array(6).fill(x);
export const MARKT = {
  0: markt(six(150), six(1), six(300), six(8), six(0), six(35), six(40000), six(40000), six(6000), six(16.67)),
};

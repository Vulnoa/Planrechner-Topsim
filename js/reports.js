// Berichte im TOPSIM-Aufbau. Jede Funktion liefert {id, title, tables:[{title, cols, rows}]}.
// rows: {l: Bezeichnung, u: Einheit, v: [Werte], f: Nachkommastellen, b: fett, sec: Zwischenüberschrift}

export const nf = (v, d = 2) => (v === null || v === undefined || v === '' || Number.isNaN(v)) ? ''
  : typeof v === 'string' ? v
  : new Intl.NumberFormat('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }).format(Math.abs(v) < 0.005 && d === 2 ? 0 : v);

const row = (l, u, v, f = 2, extra = {}) => ({ l, u, v: Array.isArray(v) ? v : [v], f, ...extra });
const sec = (l, n) => ({ l, sec: true, v: Array(n).fill('') });

export const REPORT_LIST = [
  ['01', 'Übersicht KPIs'], ['01b', 'Executive Summary'], ['02', 'Marktforschungsbericht'], ['03', 'Fertigungsbericht'],
  ['04', 'Forschung & Entwicklung'], ['05', 'Lager'], ['06', 'Personal'], ['07', 'Kostenartenrechnung'],
  ['08', 'Kostenstellenrechnung'], ['09', 'Kostenträgerrechnung'], ['10', 'Deckungsbeitragsrechnung'],
  ['11', 'Gewinn- und Verlustrechnung'], ['12', 'Liquiditätsrechnung'], ['14', 'Cashflow Statement'], ['15', 'Bilanz'],
  ['16', 'Geschäftsbericht der Branche'], ['19', 'Entscheidungsprotokoll'], ['EW', 'Erfolgswert-Schätzung'],
];

function kpis(R, ctx) {
  // Vorperiode: TOPSIM-Kennzahlen; was dort fehlt, aus der nachgerechneten Vorperiode (stimmt exakt mit TOPSIM überein)
  const pk = ctx.prevKpi || {}, h0 = ctx.history[R.period - 1] || {};
  const h = { ...pk, ...Object.fromEntries(Object.entries(h0).filter(([, v]) => v !== undefined && v !== null)) };
  if (h0.absatzOnline === undefined && pk.absatzOnline !== undefined) { h.absatzOnline = pk.absatzOnline; h.absatzEH = pk.absatzEH; h.absatzGA = pk.absatzGA; }
  const r = (l, u, a, b, f = 2) => row(l, u, [a, b], f);
  return { id: '01', title: 'Übersicht KPIs', tables: [{ cols: ['Vorperiode', 'Aktuelle Periode'], rows: [
    r('Periodenüberschuss/-fehlbetrag', 'TEUR', h.ju, R.kpi.ju),
    r('Absatz Superbass Online-Markt', 'Stück', h.absatzOnline ?? h.absatz, R.absatz.online, 0),
    r('Absatz Superbass Einzelhandel', 'Stück', h.absatzEH ?? 0, R.absatz.eh, 0),
    ...(R.absatz.ga || h.absatzGA ? [r('Absatz Superbass Großabnehmer', 'Stück', h.absatzGA ?? 0, R.absatz.ga, 0)] : []),
    r('Herstellkosten Superbass', 'EUR/pro Stück', h.hkStk, R.kpi.hkStk),
    r('Selbstkosten Superbass', 'EUR/pro Stück', h.skStk, R.kpi.skStk),
    r('Auslastung Fertigungsmitarbeiter', '%', h.auslMA, R.kpi.auslMA),
    r('Auslastung Anlagen', '%', h.auslAnlagen, R.kpi.auslAnlagen),
    r('Kassenendbestand', 'TEUR', h.kasse, R.kpi.kasse),
    r('Überziehungskredit', 'TEUR', h.dispo, R.kpi.dispo),
    r('Eigenkapitalrendite', '%', h.ekRendite, R.kpi.ekRendite),
    { ...r(ctx.ist ? 'Erfolgswert (TOPSIM)' : 'Erfolgswert (Schätzung)', 'Index', h.erfolgswert, R.kpi.erfolgswert), b: true },
  ] }] };
}

export function execSummary(period, history, R) {
  const ps = []; for (let p = 0; p <= period; p++) ps.push(p);
  const val = (p, k) => (R && p === period) ? R.kpiHist[k] : history[p]?.[k];
  const cols = ps.map((p) => `Periode ${p}`);
  const r = (l, u, k, f = 2) => row(l, u, ps.map((p) => val(p, k)), f);
  return { id: '01b', title: 'Executive Summary', tables: [
    { title: 'Allgemein', cols, rows: [r('Erfolgswert', 'Index', 'erfolgswert'), r('Umsatz Gesamt', 'TEUR', 'umsatz'), r('Periodenüberschuss/-fehlbetrag', 'TEUR', 'ju')] },
    { title: 'Markt', cols, rows: [r('Absatz Gesamt Superbass', 'Stück', 'absatz', 0), r('Geplanter Absatz', 'Stück', 'absatzPlan', 0), r('Marktanteil', '%', 'marktanteil')] },
    { title: 'Fertigung', cols, rows: [r('Geplante Fertigungsmenge', 'Stück', 'fertPlan', 0), r('Tatsächliche Fertigungsmenge', 'Stück', 'fertIst', 0),
      r('Lagerendbestand Superbass', 'Stück', 'lager', 0), r('Auslastung Mitarbeiter', '%', 'auslMA'), r('Auslastung Anlagen', '%', 'auslAnlagen')] },
    { title: 'Kostenstruktur', cols, rows: [r('Herstellkosten Superbass', 'EUR/pro Stück', 'hkStk'), r('Selbstkosten Superbass', 'EUR/pro Stück', 'skStk'),
      r('Deckungsbeitrag V Superbass', 'EUR/pro Stück', 'db5Stk')] },
    { title: 'Erfolgskennzahlen', cols, rows: [r('Betriebsergebnis', 'TEUR', 'be'), r('Periodenüberschuss/-fehlbetrag', 'TEUR', 'ju'),
      r('Eigenkapital', 'TEUR', 'ek'), r('Eigenkapitalrendite', '%', 'ekRendite'), r('Umsatzrendite', '%', 'umsatzRendite'), r('Erfolgswert', 'Index', 'erfolgswert')] },
    { title: 'Finanzen', cols, rows: [r('Kassenendbestand', 'TEUR', 'kasse'), r('Überziehungskredit', 'TEUR', 'dispo'),
      r('Finanzergebnis', 'TEUR', 'finErg'), r('Fremdkapitalquote', '%', 'fkQuote')] },
  ] };
}

// Kennzahlen eines simulierten Ergebnisses im Format der Historie
export function kpiHistory(R, D) {
  return { erfolgswert: R.kpi.erfolgswert, umsatz: R.guv.umsatz, ju: R.guv.ju, absatz: R.absatz.sold,
    absatzOnline: R.absatz.online, absatzEH: R.absatz.eh, absatzGA: R.absatz.ga,
    absatzPlan: (Number(D.absatzOnline) || 0) + (D.ehAktiv ? Number(D.absatzEH) || 0 : 0), marktanteil: null,
    fertPlan: R.fertigung.plan, fertIst: R.fertigung.ist, lager: R.lagerFE.ende.qty, auslMA: R.kpi.auslMA, auslAnlagen: R.kpi.auslAnlagen,
    hkStk: R.kpi.hkStk, skStk: R.kpi.skStk, db5Stk: R.kpi.db5Stk, be: R.guv.be, ek: R.bilanz.ek, ekRendite: R.kpi.ekRendite,
    umsatzRendite: R.kpi.umsatzRendite, kasse: R.kpi.kasse, dispo: R.kpi.dispo, finErg: R.guv.finErg, fkQuote: R.kpi.fkQuote,
    preis: R.absatz.preisOnline, level: R.level.cur };
}

function markt(R, ctx) {
  const m = ctx.markt;
  if (m && m.rows) return { id: '02', title: 'Marktforschungsbericht', tables: [{ title: 'Superbass - Online-Markt', cols: m.cols, rows: m.rows.map((x) => row(x.l, x.u, x.v, x.f)) }] };
  const D = ctx.D;
  return { id: '02', title: 'Marktforschungsbericht', note: 'Planwerte des eigenen Unternehmens. Konkurrenzdaten liegen erst nach der Simulation durch die Spielleitung vor.',
    tables: [{ title: 'Superbass - Online-Markt (eigenes Unternehmen)', cols: [ctx.unternehmen], rows: [
      row('Preis', 'EUR', D.preisOnline, 0), row('Produktqualität', 'Level', R.level.cur, 0), row('Werbung', 'TEUR', D.werbungOnline, 0),
      row('Mitarbeiter Kundenbetreuung', 'Anzahl', D.kbOnline, 1),
      row('Preisänderung', '%', ctx.S.preisOnline ? (D.preisOnline / ctx.S.preisOnline - 1) * 100 : 0),
      row('Geplanter Absatz', 'Stück', R.absatz.onlinePlan, 0), row('Tatsächlicher Absatz (Plan)', 'Stück', R.absatz.online, 0),
      row('Nicht gedeckte Nachfrage', 'Stück', R.absatz.onlinePlan - R.absatz.online, 0), row('Umsatz', 'TEUR', R.absatz.umsOnline)] },
    ...(D.ehAktiv ? [{ title: 'Superbass - Einzelhandel (eigenes Unternehmen)', cols: [ctx.unternehmen], rows: [
      row('Preis', 'EUR', D.preisEH, 0), row('Werbung', 'TEUR', D.werbungEH, 0), row('Mitarbeiter Kundenbetreuung', 'Anzahl', D.kbEH, 1),
      row('Geplanter Absatz', 'Stück', R.absatz.ehPlan, 0), row('Tatsächlicher Absatz (Plan)', 'Stück', R.absatz.eh, 0), row('Umsatz', 'TEUR', R.absatz.umsEH)] }] : [])] };
}

function fertigung(R) {
  const F = R.fertigung, ms = R.machines;
  const name = (m) => `Typ ${m.typ} Anlage Nr. ${m.nr}`;
  return { id: '03', title: 'Fertigungsbericht', tables: [
    { title: 'Übersicht', cols: ['Superbass'], rows: [row('Geplante Fertigungsmenge', 'Stück', F.plan, 0), row('Tatsächliche Fertigungsmenge', 'Stück', F.ist, 0),
      row('Auslastung Anlagen', '%', F.auslAnlagen), row('Auslastung Mitarbeiter', '%', F.auslMA)] },
    { title: 'Fertigungsanlagen', cols: ['Beschaff.-Periode', 'Beschaffungswert TEUR', 'Restlaufzeit Perioden', 'Abschreibung TEUR/Periode', 'Restbuchwert TEUR', 'Sonstige fixe Kosten TEUR/Periode', 'Resterlös % vom Buchwert'], noUnit: true,
      rows: [...ms.map((m) => ({ l: name(m), v: [nf(m.beschPeriode, 0), m.wert, nf(m.rlz, 0), m.afa, m.rbw, m.fix, nf(m.rest, 1)], f: 2 })),
        { l: 'Summe', v: ['', ms.reduce((s, m) => s + m.wert, 0), '', ms.reduce((s, m) => s + m.afa, 0), ms.reduce((s, m) => s + m.rbw, 0), ms.reduce((s, m) => s + m.fix, 0), ''], f: 2, b: true }] },
    { title: 'Kapazität', cols: ['Normale Kapazität Stück', 'Instandhaltung TEUR', 'Faktor'], noUnit: true,
      rows: [...ms.map((m) => ({ l: name(m), v: [nf(m.cap, 0), 0, '1,00'], f: 2 })), { l: 'Summe', v: [nf(F.kapAnlagen, 0), 0, ''], f: 2, b: true }] },
    { title: 'Auslastung Fertigungsanlagen', cols: ['Superbass'], rows: [row('Geplante Fertigungsmenge', 'Stück', F.plan, 0),
      row('Kapazität der Anlagen', 'Stück', F.kapAnlagen, 0), row('Tatsächliche Fertigungsmenge', 'Stück', F.ist, 0),
      row('Benötigte Anlagenkapazität pro Fertigprodukt', 'Anzahl pro Produkt', 1), row('Benötigte Anlagenkapazität Gesamt', 'Stück', F.ist, 0),
      row('Auslastung Anlagen', '%', F.auslAnlagen, 2, { b: true })] },
    { title: 'Auslastung Mitarbeiter', cols: ['Superbass'], rows: [row('Einsetzbares Personal (ohne Überstunden)', 'Anzahl', F.fertMA, 1),
      row('Einsetzbares Personal (inklusive Überstunden)', 'Anzahl', F.maxPersMA, 1), row('Fertigungskapazität pro Mitarbeiter', 'Stück/Periode', 2000, 0),
      row('Geplante Fertigungsmenge', 'Stück', F.plan, 0), row('Tatsächliche Fertigungsmenge', 'Stück', F.ist, 0),
      row('Eingesetztes Personal (inklusive Überstunden)', 'Anzahl', F.eingesetzt, 1), row('Auslastung Mitarbeiter', '%', F.auslMA, 2, { b: true })] },
  ] };
}

function fue(R, P) {
  return { id: '04', title: 'Forschung & Entwicklung', tables: [{ title: 'Superbass', noUnit: true,
    cols: ['Stufe Vorperiode', 'Stufe Aktuelle Periode', 'Fixe Kosten TEUR', 'Variable Kosten EUR/Stück', 'Variable Kosten TEUR'],
    rows: [{ l: 'Produktqualität', v: [nf(R.level.prev, 0), nf(R.level.cur, 0), R.level.up * P.fueProLevel, P.qualKosten[R.level.cur - 1],
      R.einzel.fe - R.level.up * P.fueProLevel], f: 2 }] }] };
}

function lager(R) {
  const M = R.lagerMat, F = R.lagerFE;
  const pr = (w, q) => q ? w / q * 1000 : 0;
  const cols = ['Menge Stück', 'EUR/pro Stück', 'TEUR'];
  return { id: '05', title: 'Lager', tables: [
    { title: 'Übersicht Lagerbestand', cols: ['Superbass'], rows: [row('Lagerendbestand Einsatzstoffe', 'Stück', M.ende.qty, 0), row('Lagerendbestand Fertigerzeugnisse', 'Stück', F.ende.qty, 0)] },
    { title: 'Einsatzstoffe/Teile Superbass', cols, noUnit: true, rows: [
      { l: 'Lageranfangsbestand', v: [nf(M.anfang.qty, 0), M.anfang.preis, M.anfang.value] },
      { l: '+ Zugang von Lieferant', v: [nf(M.zugang, 0), M.zugangPreis, M.zugang * M.zugangPreis / 1000] },
      { l: '+ Nachlieferung', v: [nf(M.jit, 0), M.jitPreis, M.jit * M.jitPreis / 1000] },
      { l: '- Abgang an Fertigung', v: [nf(M.abgang, 0), M.avg, M.abgang * M.avg / 1000] },
      { l: '= Lagerendbestand', v: [nf(M.ende.qty, 0), M.avg, M.ende.value], b: true }] },
    { title: 'Fertigprodukte Superbass', cols, noUnit: true, rows: [
      { l: 'Lageranfangsbestand', v: [nf(F.anfang.qty, 0), pr(F.anfang.wert, F.anfang.qty), F.anfang.wert] },
      { l: '+ Zugang von Fertigung', v: [nf(F.zugang.qty, 0), pr(F.zugang.wert, F.zugang.qty), F.zugang.wert] },
      { l: '- Abgang an Vertrieb', v: [nf(F.abgang.qty, 0), pr(F.abgang.wert, F.abgang.qty), F.abgang.wert] },
      { l: '= Lagerendbestand', v: [nf(F.ende.qty, 0), pr(F.ende.wert, F.ende.qty) || pr(F.abgang.wert, F.abgang.qty), F.ende.wert], b: true }] },
    { title: 'Lagerkosten', cols: ['Alle Produkte'], rows: [row('Einsatzstoffe/Teile Superbass', 'TEUR', R.kst.einkauf.lager),
      row('Fertigerzeugnisse Superbass', 'TEUR', R.kst.vertrieb.lager), row('Gesamt', 'TEUR', R.kst.einkauf.lager + R.kst.vertrieb.lager, 2, { b: true })] },
  ] };
}

function personal(R, P) {
  const k = ['einkauf', 'verwaltung', 'fertigung', 'kb'], p = R.personal;
  const line = (l, u, fn, f, b) => row(l, u, [...k.map((x) => fn(p[x])), k.reduce((s, x) => s + fn(p[x]), 0)], f, { b });
  const cols = ['Einkauf', 'Verwaltung', 'Fertigung', 'Kundenbetreuer', 'Summe'];
  return { id: '06', title: 'Personal', tables: [
    { title: 'Personalbestand', cols, rows: [line('Personalanfangsbestand', 'Anzahl', (x) => x.anfang, 1), line('+ Einstellungen', 'Anzahl', (x) => x.ein, 1),
      line('- Entlassungen', 'Anzahl', (x) => x.ent, 1), line('- Fluktuation', 'Anzahl', () => 0, 1), line('= Personalendbestand', 'Anzahl', (x) => x.ende, 1, true)] },
    { title: 'Personalkosten', cols, rows: [line('Löhne/Gehälter (*)', 'TEUR', (x) => x.lohn, 2), line('Einstellungen/Entlassungen/Training', 'TEUR', (x) => x.einEnt, 2),
      line('Personalnebenkosten (*)', 'TEUR', (x) => x.nk, 2), line('Summe Personalkosten', 'TEUR', (x) => x.lohn + x.einEnt + x.nk, 2, true)],
      foot: '(*) ohne Kosten für Überstunden' + (p.ueberLohn ? ` – Überstunden inkl. Zuschlag: ${nf(p.ueberLohn)} TEUR zzgl. Nebenkosten` : '') },
    { cols: [''], rows: [row('Personalnebenkosten in % der Gehälter', '', P.nk * 100)] },
  ] };
}

function kostenarten(R) {
  const K = R.koa, r = (l, x, b) => ({ l, v: x, f: 2, b, i: !b });
  const rows = [sec('Materialkosten', 3), r('Einsatzstoffe/Teile', K.einsatz), r('Betriebsstoffe', K.betrieb),
    sec('Personalkosten', 3), r('Löhne/Gehälter (*)', K.lohn), r('Einstellungen/Entlassungen', K.einEnt), r('Personalnebenkosten', K.nk),
    sec('Abschreibungen', 3), r('Gebäude', K.geb), r('Fertigungsanlagen', K.anl), r('Fertigerzeugnisse', K.feAfa),
    sec('Sonstige Kosten', 3), r('Sonstige fixe Kosten', K.sfix), r('Lagerkosten', K.lager), r('Werbung/Corporate Identity', K.werbung),
    r('Sonstige Kosten F&E', K.fe), r('Transportkosten', K.trans)];
  if (K.eigen[0]) rows.push(r('Eigene variable Kosten', K.eigen));
  rows.push(r('Summe', K.summe, true));
  return { id: '07', title: 'Kostenartenrechnung (TEUR)', tables: [{ cols: ['Summe', 'Gemeinkosten', 'Einzelkosten Superbass'], noUnit: true, rows, foot: '(*) Mit Kosten für Überstunden' }] };
}

function kostenstellen(R) {
  const ks = ['einkauf', 'fertigung', 'fe', 'vertrieb', 'verwaltung'], K = R.kst;
  const r = (l, key) => { const v = ks.map((k) => K[k][key] || 0); return { l, v: [v.reduce((a, b) => a + b, 0), ...v], f: 2, i: true }; };
  const z = (l) => ({ l, v: [0, 0, 0, 0, 0, 0], f: 2, i: true });
  const tot = ks.map((k) => K[k].summe);
  return { id: '08', title: 'Kostenstellenrechnung (TEUR)', tables: [{ cols: ['Summe', 'Einkauf', 'Fertigung', 'F&E', 'Vertrieb', 'Verwaltung'], noUnit: true, rows: [
    sec('Materialkosten', 6), z('Einsatzstoffe/Teile'), z('Betriebsstoffe'),
    sec('Personalkosten', 6), r('Löhne/Gehälter (*)', 'lohn'), r('Einstellungen/Entlassungen', 'einEnt'), r('Personalnebenkosten', 'nk'),
    sec('Abschreibungen', 6), r('Gebäude', 'geb'), r('Fertigungsanlagen', 'anl'), z('Fertigerzeugnisse'),
    sec('Sonstige Kosten', 6), r('Sonstige fixe Kosten', 'sfix'), r('Lagerkosten', 'lager'), r('Werbung/Corporate Identity', 'werbung'),
    z('Sonstige Kosten F&E'), z('Transportkosten'),
    { l: 'Summe der Kosten', v: [tot.reduce((a, b) => a + b, 0), ...tot], f: 2, b: true }], foot: '(*) Mit Kosten für Überstunden' }] };
}

function kostentraeger(R) {
  const E = R.einzel, K = R.kst, H = R.hk, prod = R.fertigung.ist, sold = R.absatz.sold;
  const lines = [['+ Einkauf', 'Einzelkosten', E.einkauf, prod], ['+ Einkauf', 'Gemeinkosten', K.einkauf.summe, prod],
    ['+ Fertigung', 'Einzelkosten', E.fertigung, prod], ['+ Fertigung', 'Gemeinkosten', K.fertigung.summe, prod]];
  const after = [['+ F&E', 'Einzelkosten', E.fe], ['+ F&E', 'Gemeinkosten', K.fe.summe], ['+ Vertrieb', 'Einzelkosten', E.vertrieb],
    ['+ Vertrieb', 'Gemeinkosten', K.vertrieb.summe], ['+ Verwaltung', 'Einzelkosten', E.verwaltung], ['+ Verwaltung', 'Gemeinkosten', K.verwaltung.summe]];
  const stk = (v, q) => q ? v / q * 1000 : 0;
  return { id: '09', title: 'Kostenträgerrechnung', tables: [
    { title: 'Gesamt (TEUR)', cols: ['Summe', 'Superbass'], unitHead: 'Allokation', rows: [
      ...lines.map(([l, a, v]) => ({ l, u: a, v: [v, v] })), { l: '= Herstellkosten', v: [H.hk, H.hk], b: true },
      { l: '+/- Bestandveränderung Fertigprodukte', v: [-H.bestVer, -H.bestVer] }, { l: '= Herstellkosten des Umsatzes', v: [H.hkduSumme, H.hkduSumme], b: true },
      ...after.map(([l, a, v]) => ({ l, u: a, v: [v, v] })), { l: '= Selbstkosten', v: [R.ktr.selbstkosten, R.ktr.selbstkosten], b: true }].map((x) => ({ f: 2, ...x })) },
    { title: 'Pro Stück (EUR)', cols: ['Superbass'], unitHead: 'Allokation', rows: [
      ...lines.map(([l, a, v]) => ({ l, u: a, v: [stk(v, prod)] })), { l: '= Herstellkosten (*)', v: [R.ktr.hkStk], b: true },
      { l: '= Herstellkosten des Umsatzes (**)', v: [R.ktr.hkduStk], b: true },
      ...after.map(([l, a, v]) => ({ l, u: a, v: [stk(v, sold)] })), { l: '= Selbstkosten (**)', v: [R.ktr.skStk], b: true }].map((x) => ({ f: 2, ...x })),
      foot: '(*) Die Herstellkosten der Produktion werden in das Verhältnis zur produzierten Menge gesetzt. (**) Die Herstellkosten des Umsatzes sowie die Selbstkosten werden in das Verhältnis zur abgesetzten Menge gesetzt.' },
  ] };
}

function deckung(R) {
  const order = ['online', 'ga', 'aus', 'eh', 'sonder'], C = R.db.ch, D = R.db;
  const cols = ['Online-Markt', 'Großabnehmer', 'Ausschreibung', 'Einzelhandel', 'Sondermarkt'];
  const tot = (k) => order.reduce((s, c) => s + C[c][k], 0);
  const L = (l, k, b) => ({ l, v: [...order.map((c) => C[c][k]), tot(k)], f: 2, b });
  const S = (l, v, b) => ({ l, v: ['', '', '', '', '', v], f: 2, b });
  const sold = R.absatz.sold;
  const P = (l, k, b) => ({ l, v: [...order.map((c) => C[c].u ? C[c][k] / C[c].u * 1000 : 0), sold ? tot(k) / sold * 1000 : 0], f: 2, b });
  const SP = (l, v, b) => ({ l, v: ['', '', '', '', '', sold ? v / sold * 1000 : 0], f: 2, b });
  return { id: '10', title: 'Deckungsbeitragsrechnung', tables: [
    { title: 'Superbass - Deckungsbeitragsrechnung Gesamt (TEUR)', cols: [...cols, 'Summe'], noUnit: true, rows: [
      L('Umsatzerlöse', 'ums'), L('- Variable Materialkosten', 'varMat'), L('- Variable Fertigungskosten', 'varFert'), L('- Transportkosten', 'trans'),
      L('= Deckungsbeitrag I', 'db1', true), L('- Fixe Materialkosten', 'fixMat'), L('- Fixe Fertigungskosten', 'fixFert'), L('= Deckungsbeitrag II', 'db2', true),
      L('- Werbungskosten', 'werb'), L('= Deckungsbeitrag III', 'db3', true), L('- Entwicklungskosten', 'entw'), L('= Deckungsbeitrag IV', 'db4', true),
      S('- Forschungskosten', D.forschung), S('- Vertriebskosten', D.vertrieb), S('- Verwaltungskosten', D.verwaltung), S('= Deckungsbeitrag V', D.db5, true)] },
    { title: 'Superbass - Deckungsbeitragsrechnung pro Stück (EUR)', cols: [...cols, 'ø-Wert'], noUnit: true, rows: [
      P('Preis', 'ums'), P('- Variable Materialkosten', 'varMat'), P('- Variable Fertigungskosten', 'varFert'), P('- Transportkosten', 'trans'),
      P('= Deckungsbeitrag I', 'db1', true), P('- Fixe Materialkosten', 'fixMat'), P('- Fixe Fertigungskosten', 'fixFert'), P('= Deckungsbeitrag II', 'db2', true),
      P('- Werbungskosten', 'werb'), P('= Deckungsbeitrag III', 'db3', true), P('- Entwicklungskosten', 'entw'), P('= Deckungsbeitrag IV', 'db4', true),
      SP('- Forschungskosten', D.forschung), SP('- Vertriebskosten', D.vertrieb), SP('- Verwaltungskosten', D.verwaltung), SP('= Deckungsbeitrag V', D.db5, true)] },
  ] };
}

function guv(R) {
  const G = R.guv, U = G.umsatz, pc = (v) => U ? v / U * 100 : 0;
  const r2 = (l, v, b, i, noPc) => ({ l, v: [v, noPc ? '' : pc(v)], f: 2, b, i });
  return { id: '11', title: 'Gewinn- und Verlustrechnung', tables: [
    { title: 'Gesamtkostenverfahren', cols: ['TEUR', '% vom Umsatz'], noUnit: true, rows: [r2('Umsatzerlöse', U), r2('+ Sonstige Erträge', G.sonstErtrag),
      r2('+ Erhöhung/Verminderung des Bestandes an Fertigerzeugnissen', G.bestVer), r2('- Materialaufwand', G.matAufwand), r2('- Personalaufwand', G.personalAufwand),
      r2('- Löhne/Gehälter', G.lohn, false, true, true), r2('- Einstellungskosten/Entlassungskosten', G.einEnt, false, true, true),
      r2('- Sonstige Personalkosten', G.nk, false, true, true), r2('- Abschreibungen', G.abschreibungen), r2('- Sonstiger Aufwand', G.sonstAufwand),
      r2('= Betriebsergebnis', G.be, true)] },
    { title: 'Umsatzkostenverfahren', cols: ['TEUR'], noUnit: true, rows: [{ l: 'Umsatzerlöse', v: [U] }, { l: '+ Sonstige Erträge', v: [G.sonstErtrag] },
      { l: '- Herstellkosten des Umsatzes', v: [G.ukv.hkdu] }, { l: '- F&E', v: [G.ukv.fe] }, { l: '- Vertrieb', v: [G.ukv.vertrieb] },
      { l: '- Verwaltung', v: [G.ukv.verwaltung] }, { l: '= Betriebsergebnis', v: [G.be], b: true }].map((x) => ({ f: 2, ...x })) },
    { title: 'Periodenüberschuss/-fehlbetrag', cols: ['TEUR', '% vom Umsatz'], noUnit: true, rows: [r2('Betriebsergebnis', G.be), r2('- Finanzergebnis', G.finErg),
      r2('+ Erträge aus Wertpapieren', 0, false, true), r2('- Zinsen für kurz- und langfristige Kredite', G.zinsKurzLang, false, true),
      r2('- Zinsen für Überziehungskredit', G.zinsDispo, false, true), r2('= Gewinn vor Steuern', G.gvst, true),
      r2('- Steuern auf Einkommen und Ertrag', G.steuer), r2('= Periodenüberschuss/-fehlbetrag', G.ju, true)] },
    { title: 'Ergebnisverwendung', cols: ['TEUR'], noUnit: true, rows: [{ l: 'Gewinn-/Verlustvortrag der Vorperiode', v: [G.gvVortragVor] },
      { l: '+ Periodenüberschuss/-fehlbetrag', v: [G.ju] }, { l: '= Gewinn-/Verlustvortrag', v: [G.gvVortrag], b: true }].map((x) => ({ f: 2, ...x })) },
  ] };
}

function liquiditaet(R, P) {
  const L = R.liq, r = (l, v, b) => ({ l, v: [v], f: 2, b });
  return { id: '12', title: 'Liquiditätsrechnung', tables: [
    { cols: ['TEUR'], noUnit: true, rows: [r('Kassenanfangsbestand', L.kasseAnfang)] },
    { title: 'Einzahlungen', cols: ['TEUR'], noUnit: true, rows: [r('Einzahlungen aus Umsatz Aktuelle Periode', L.einUmsatzAkt), r('Einzahlungen aus Umsatz Vorperiode', L.einUmsatzVor),
      r('Zinserträge', 0), r('Sonstige Einzahlungen/Kapitalerhöhung', L.sonstEin), r('Desinvestitionen Fertigungsanlagen', L.desErloes),
      r('Aufnahme kurzfristige und langfristige Kredite', L.kreditAufnahme), r('Überziehungskredit', L.dispo), r('Summe Einzahlungen', L.summeEin, true)] },
    { title: 'Auszahlungen', cols: ['TEUR'], noUnit: true, rows: [r('Einsatzstoffe, Betriebsstoffe, Fertigerzeugnisse', L.matAus), r('Einkauf Vorperiode', 0),
      r('Personalkosten', L.personal), r('Sonstige Aufwendungen', L.sonstAus), r('Rückzahlung kurzfristige Kredite & Überziehungskredit', L.rueckzahlung),
      r('Zinsaufwand kurzfristige und langfristige Kredite', L.zinsKredite), r('Kauf von Fertigungsanlagen', L.invest), r('Sonstige Auszahlungen', L.sonstAuszahlung),
      r('Steuern auf Einkommen und Ertrag', L.steuer), r('Zinszahlung Überziehungskredit', L.zinsDispo), r('Summe Auszahlungen', L.summeAus, true)] },
    { cols: ['TEUR'], noUnit: true, rows: [r('Kassenendbestand', L.kasseEnde, true)] },
    { title: 'Zahlungskonditionen', cols: ['% in der aktuellen Periode'], noUnit: true, rows: [{ l: 'Kunden Online-Markt Einzelhandel (Einzahlungen)', v: [P.zahlQuote * 100], f: 1 },
      { l: 'Lieferant Einsatzstoffe Superbass (Auszahlungen)', v: [100], f: 1 }] },
  ] };
}

function cashflow(R) {
  const C = R.cf, r = (l, v, b) => ({ l, v: [v], f: 2, b });
  return { id: '14', title: 'Cashflow Statement', tables: [{ cols: ['TEUR'], noUnit: true, rows: [
    r('Periodenüberschuss/-fehlbetrag', C.ju), r('+ Abschreibung auf Anlagevermögen', C.afa), r('Traditioneller Cashflow', C.tradCF, true),
    r('+ Erhöhung(-) /Abbau(+) Vorräte an Materialien', C.dMat), r('+ Erhöhung(-) /Abbau(+) Vorräte an Fertige Erzeugnisse', C.dFE),
    r('+ Erhöhung(-) /Abbau(+) Forderungen aus Lieferungen und Leistungen', C.dFord), r('A. Operativer Cashflow', C.opCF, true),
    r('+ Investitionen in Anlagevermögen', C.invest), r('B. Cashflow aus Investitionstätigkeiten', C.invCF, true),
    r('+ Kapitalerhöhungen', C.kapErh), r('+ Zahlung Dividende aus Vorperiode', 0), r('+ Erhöhung(-) / Abbau(+) der Wertpapiere', 0),
    r('+ Erhöhung(+) / Abbau(-) der Bankverbindlichkeiten', C.dBank), r('C. Cashflow aus Finanzierungstätigkeit', C.finCF, true),
    r('D. Veränderung des Kassenbestandes (A+B+C)', C.dKasse, true), r('Free Cashflow (A+B)', C.fcf, true)] }] };
}

export function bilanzReport(B, V) {
  const v = V || {};
  const ekV = v.gez !== undefined ? v.gez + v.krl + v.grl + v.gvVortrag : undefined;
  const r = (l, a, b, bold, i) => ({ l, v: [a, b], f: 2, b: bold, i });
  const prevAV = v.grund !== undefined ? v.grund + (v.masch ?? 0) : undefined;
  return { id: '15', title: 'Bilanz', tables: [
    { title: 'Aktiva (TEUR)', cols: ['Aktuelle Periode', 'Vorperiode'], noUnit: true, rows: [
      r('Anlagevermögen', B.av, v.masch !== undefined ? prevAV : '', true), r('Grundstücke und Bauten', B.grund, v.grund, false, true),
      r('Maschinen und Betriebsausstattung', B.masch, v.masch, false, true),
      r('Umlaufvermögen', B.uv, v.uv, true), r('Materialien', B.mat, v.mat, false, true), r('Fertige Erzeugnisse', B.fe, v.fe, false, true),
      r('Forderungen aus Lieferungen & Leistungen', B.ford, v.ford, false, true), r('Wertpapiere', 0, v.ford !== undefined ? 0 : '', false, true),
      r('Kassenbestand', B.kasse, v.kasse, false, true), r('Bilanzsumme', B.aktiva, v.aktiva, true)] },
    { title: 'Passiva (TEUR)', cols: ['Aktuelle Periode', 'Vorperiode'], noUnit: true, rows: [
      r('Eigenkapital', B.ek, ekV, true), r('Gezeichnetes Kapital', B.gez, v.gez, false, true), r('Kapitalrücklage', B.krl, v.krl, false, true),
      r('Gewinnrücklage', B.grl, v.grl, false, true), r('Gewinn-/Verlustvortrag', B.gvVortragVor, v.gvVortragVor, false, true),
      r('Periodenüberschuss/-fehlbetrag', B.ju, v.ju, false, true),
      r('Verbindlichkeiten', B.fk, v.lang !== undefined ? v.lang + v.kurz + v.dispo : '', true), r('Restlaufzeit über 10 Perioden', B.lang, v.lang, false, true),
      r('Restlaufzeit unter 1 Periode', B.kurz, v.kurz, false, true), r('Überziehungskredit', B.dispo, v.dispo, false, true),
      r('Bilanzsumme', B.passiva, v.aktiva, true)] },
  ] };
}

function branche(ctx) {
  const b = ctx.branche;
  if (!b || !b.rows) return { id: '16', title: 'Geschäftsbericht der Branche', note: 'Liegt erst nach der Simulation vor. Für abgeschlossene Perioden über „Daten & Import“ einfügen.', tables: [] };
  return { id: '16', title: 'Geschäftsbericht der Branche', tables: [{ title: 'Umsatzkostenverfahren und Bilanz (TEUR)', cols: b.cols, noUnit: true, rows: b.rows.map((x) => ({ l: x.l, v: x.v, f: 2, b: x.b })) }] };
}

function protokoll(ctx) {
  const ps = Object.keys(ctx.decHist).map(Number).sort((a, b) => a - b);
  const cols = ps.map((p) => `P${p}`);
  const g = (k, f = 0, fn) => ({ v: ps.map((p) => { const d = ctx.decHist[p]; const x = fn ? fn(d) : d?.[k]; return x ?? ''; }), f });
  const r = (l, u, k, f, fn) => ({ l, u, ...g(k, f, fn) });
  return { id: '19', title: 'Entscheidungsprotokoll', tables: [
    { title: 'Marketing-Mix', cols, rows: [r('Preis Online-Markt', 'EUR', 'preisOnline'), r('Werbung Online-Markt', 'TEUR', 'werbungOnline'),
      r('Kundenbetreuer Online-Markt', 'Anzahl', 'kbOnline', 1), r('Aktiv im Einzelhandel', '', null, 0, (d) => d ? (d.ehAktiv ? 'Ja' : 'Nein') : ''),
      r('Preis Einzelhandel', 'EUR', null, 0, (d) => d?.ehAktiv ? d.preisEH : 0), r('Werbung Einzelhandel', 'TEUR', null, 0, (d) => d?.ehAktiv ? d.werbungEH : 0),
      r('Kundenbetreuer Einzelhandel', 'Anzahl', null, 1, (d) => d?.ehAktiv ? d.kbEH : 0), r('Corporate Identity', 'TEUR', 'ci')] },
    { title: 'Produktentwicklung', cols, rows: [r('Produktqualität Level Zuwachs', '', null, 0, (d) => d ? '+' + (d.levelUp || 0) : '')] },
    { title: 'Großabnehmer', cols, rows: [r('Großabnehmer', 'Stück', 'gaMenge')] },
    { title: 'Einkauf und Fertigung', cols, rows: [r('Einsatzstoffe/Teile', 'Einheit', 'einkauf'), r('Fertigungsmenge', 'Stück', 'fertigung')] },
    { title: 'Fertigungsanlagen', cols, rows: [r('Investition Typ A', 'Anzahl', 'investA'), r('Investition Typ B', 'Anzahl', 'investB'),
      r('Desinvestitionen', 'Anlage Nr.', null, 0, (d) => (d?.desinvest || []).join(', '))] },
    { title: 'Personal', cols, rows: [r('Fertigungspersonal', 'Anzahl', 'fertigungMA', 1)] },
    { title: 'Planwerte', cols, rows: [r('Angenommener Absatz Online-Markt', 'Stück', 'absatzOnline'), r('Angenommener Absatz Einzelhandel', 'Stück', 'absatzEH')] },
  ] };
}

function erfolgswert(R, P, ctx) {
  const E = P.erfolgswert, h = ctx.history;
  const prev = h[R.period - 1]?.erfolgswert;
  return { id: 'EW', title: 'Erfolgswert-Schätzung',
    note: 'TOPSIM veröffentlicht die Erfolgswert-Formel nicht. Die Schätzung ist eine Regression über die Ergebnisse aller Unternehmen aus P1 bis P3 (Kreuztest ca. ±13 Punkte). Gewichte und Bekanntheit lassen sich unter „Rahmendaten der Periode“ anpassen.',
    tables: [{ cols: ['Wert', 'Gewicht', 'Beitrag'], noUnit: true, rows: [
      { l: 'Konstante', v: ['', '', E.a], f: 2 },
      { l: 'Jahresüberschuss (TEUR)', v: [R.guv.ju, nf(E.ju, 3), E.ju * R.guv.ju], f: 2 },
      ...(E.ek ? [{ l: 'Eigenkapital (TEUR)', v: [R.bilanz.ek, nf(E.ek, 3), E.ek * R.bilanz.ek], f: 2 }] : []),
      ...(E.fkq ? [{ l: 'Fremdkapitalquote (%)', v: [R.kpi.fkQuote, nf(E.fkq, 3), E.fkq * R.kpi.fkQuote], f: 2 }] : []),
      { l: 'Produktqualität (Level)', v: [nf(R.level.cur, 0), nf(E.level, 3), E.level * R.level.cur], f: 2 },
      ...(E.bek ? [{ l: 'Bekanntheit Online-Markt (Index)', v: [P.bekanntheit ?? 0, nf(E.bek, 3), E.bek * (P.bekanntheit ?? 0)], f: 2 }] : []),
      { l: '= Geschätzter Erfolgswert', v: ['', '', R.kpi.erfolgswert], f: 2, b: true },
      { l: 'Erfolgswert Vorperiode (TOPSIM)', v: ['', '', prev ?? ''], f: 2 },
    ] }] };
}

export function buildReports(R, ctx) {
  const P = ctx.P;
  R.kpiHist = kpiHistory(R, ctx.D);
  const real = ctx.ist ? ctx.history[R.period] : null;
  if (real) {
    if (real.erfolgswert !== undefined) { R.kpi.erfolgswertSchaetzung = R.kpi.erfolgswert; R.kpi.erfolgswert = real.erfolgswert; R.kpiHist.erfolgswert = real.erfolgswert; }
    if (real.marktanteil !== undefined) R.kpiHist.marktanteil = real.marktanteil;
    if (real.absatzPlan !== undefined) R.kpiHist.absatzPlan = real.absatzPlan;
  }
  const hist = { ...ctx.history, [R.period]: R.kpiHist };
  return [kpis(R, ctx), execSummary(R.period, hist, R), markt(R, ctx), fertigung(R), fue(R, P), lager(R), personal(R, P),
    kostenarten(R), kostenstellen(R), kostentraeger(R), deckung(R), guv(R), liquiditaet(R, P), cashflow(R),
    bilanzReport(R.bilanz, { ...R.bilanzVor, masch: ctx.S.machines.reduce((s, m) => s + m.rbw, 0),
      mat: ctx.S.mat.value, fe: ['varMat', 'fixMat', 'varFert', 'fixFert'].reduce((s, c) => s + (ctx.S.fe[c] || 0), 0),
      ...(() => { const b = R.bilanzVor; const fe = ['varMat', 'fixMat', 'varFert', 'fixFert'].reduce((s, c) => s + (ctx.S.fe[c] || 0), 0);
        const masch = ctx.S.machines.reduce((s, m) => s + m.rbw, 0);
        const uv = ctx.S.mat.value + fe + b.ford + b.kasse; const gvPrev = ctx.history[R.period - 1]?.ju;
        return { uv, aktiva: b.grund + masch + uv, gvVortragVor: gvPrev !== undefined ? b.gvVortrag - gvPrev : '', ju: gvPrev ?? '' }; })() }),
    branche(ctx), protokoll({ ...ctx, decHist: { ...ctx.decHist, [R.period]: ctx.D } }), erfolgswert(R, P, ctx)];
}

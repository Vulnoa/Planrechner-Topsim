// TONWERK Planrechner – Oberfläche
import { simulate } from './engine.js';
import * as DEF from './defaults.js';
import { buildReports, execSummary, bilanzReport, REPORT_LIST, nf } from './reports.js';
import { parseReports, pdfToText, stateFromImport } from './importer.js';
import { downloadZip, downloadSingle, save, spickzettelPdf } from './pdf.js';
import { t, setLang, getLang } from './i18n.js';
import { calibrate, looCheck, forecast, firmsFromMarkt, defaultProgSettings, PRIOR } from './prognose.js';

const VERSION = '1.3.4';
const KEY = 'tonwerk-planrechner-v1';
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clone = (o) => JSON.parse(JSON.stringify(o));
const uid = () => Math.random().toString(36).slice(2, 9);
const parseNum = (s) => { if (typeof s === 'number') return s; const x = String(s).trim().replace(/\s/g, ''); if (!x) return 0;
  const v = Number(/,/.test(x) ? x.replace(/\./g, '').replace(',', '.') : (/^\d{1,3}(\.\d{3})+$/.test(x) ? x.replace(/\./g, '') : x)); return Number.isFinite(v) ? v : 0; };

// ---------------------------------------------------------------- Speicher
function initialStore() {
  // Leerer Start: Ausgangslage Periode 0 (für alle Unternehmen gleich), Planperiode 1.
  // Eigene Perioden kommen per Import der TOPSIM-Sammelberichte oder einer Sicherungsdatei dazu.
  const sc = { id: uid(), name: 'Szenario 1', team: true,
    saved: { decisions: { ...clone(DEF.DEC_HIST[0]), investA: 0, absatzAutoOnline: true, absatzAutoEH: true }, custom: {} } };
  sc.draft = clone(sc.saved);
  return {
    v: 1, lang: 'de', theme: 'light', firma: 'TONWERK', unternehmen: 'Unternehmen 1',
    states: { 0: DEF.stateP0() },
    history: clone(DEF.HISTORY), decHist: clone(DEF.DEC_HIST),
    istInputs: {},
    markt: clone(DEF.MARKT), branche: {},
    params: { 1: DEF.paramsP1() }, paramCustom: { 1: {} },
    scenarios: { 1: [sc] }, active: { 1: sc.id },
    customFields: [],
    v2: true, calcMode: 'save', module: {}, prog: {}, konk: {}, opt: {}, konkV: 2, welcome: true,
  };
}
// Ältere Speicherstände (v1.0) auf den neuen Stand bringen, ohne Eingaben zu verlieren
function migrate(s) {
  s.markt ||= {};
  for (const [p, m] of Object.entries(DEF.MARKT)) if (!s.markt[p]?.rows) s.markt[p] = clone(m);
  s.calcMode ||= 'save'; s.module ||= {}; s.prog ||= {}; s.konk ||= {}; s.opt ||= {};
  if (s.konkV !== 2) { s.konk = {}; s.konkV = 2; }   // Konkurrenz-Vorbelegung v1.1.3: Preise nicht mehr fortgeschrieben
  s.v2 = true;
  return s;
}
let store;
try { store = migrate(JSON.parse(localStorage.getItem(KEY)) || initialStore()); } catch { store = migrate(initialStore()); }
function persist() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* Speicher voll oder gesperrt */ } }

const ui = { route: 'vertrieb', repPeriod: null, repId: '01', menu: false, scOpen: false, delta: null };

const planPeriod = () => Math.max(...Object.keys(store.states).map(Number)) + 1;
function ensurePeriod(p) {
  if (!store.params[p]) store.params[p] = clone(store.params[p - 1] || DEF.baseParams());
  store.paramCustom[p] ||= {};
  if (!store.scenarios[p] || !store.scenarios[p].length) {
    const prev = (store.scenarios[p - 1] || []).find((s) => s.team) || (store.scenarios[p - 1] || [])[0];
    const dec = prev ? clone(prev.saved.decisions) : DEF.emptyDecisions();
    dec.desinvest = []; dec.levelUp = 0;
    const sc = { id: uid(), name: 'Szenario 1', team: true, saved: { decisions: dec, custom: {} } };
    sc.draft = clone(sc.saved); store.scenarios[p] = [sc]; store.active[p] = sc.id;
  }
}
const scen = () => { const p = planPeriod(); ensurePeriod(p); return store.scenarios[p].find((s) => s.id === store.active[p]) || store.scenarios[p][0]; };
const D = () => scen().draft.decisions;

// ---------------------------------------------------------------- Module (nur bei Bedarf eingeblendet)
function modOf(p = planPeriod()) {
  const m = (store.module[p] ||= {});
  m.ga ||= { aktiv: false, preis: 0, max: 0 }; m.kredit ||= { aktiv: false };
  return m;
}

// ---------------------------------------------------------------- Absatzprognose
const ownIdx = () => { const m = /(\d+)/.exec(store.unternehmen || ''); const i = m ? Number(m[1]) - 1 : 4; return i >= 0 && i < 6 ? i : 4; };
const progSet = (p = planPeriod()) => (store.prog[p] ||= defaultProgSettings());
function obsAll(upTo = Infinity, skip = null) {
  return Object.keys(store.markt).map(Number).filter((p) => p <= upTo && p !== skip).sort((a, b) => a - b)
    .map((p) => ({ period: p, firms: firmsFromMarkt(store.markt[p]) }))
    .filter((o) => o.firms && o.firms.length === 6 && new Set(o.firms.map((f) => f.D)).size > 1);   // Periode 0 (alle gleich) enthält keine Information
}
const calCache = new Map();
function modelFor(p = planPeriod()) {
  const s = progSet(p);
  if (!s.auto) return { coef: s.coef, manual: true };
  const obs = obsAll(p - 1);
  const key = JSON.stringify([obs.map((o) => o.firms.map((f) => f.D)), s.lambda]);
  if (!calCache.has(key)) calCache.set(key, calibrate(obs, s.lambda));
  return calCache.get(key);
}
function lastFirms(p) { for (let q = p - 1; q >= 0; q--) { const f = firmsFromMarkt(store.markt[q]); if (f?.length === 6) return { q, f }; } return null; }
function defaultKonk(p) {
  const last = lastFirms(p), prev = last ? firmsFromMarkt(store.markt[last.q - 1]) : null;
  const base = last ? last.f : Array.from({ length: 6 }, (_, i) => ({ name: `U${i + 1}`, p: 150, L: 1, W: 300, K: 8, B: 35 }));
  return base.map((f, i) => {
    const trend = prev ? Math.max(0, Math.min(2, f.L - prev[i].L)) : 0;
    const L = Math.min(13, f.L + trend);
    const pr = f.p;   // Preis wie zuletzt beobachtet (keine Annahme über Preiserhöhungen der Konkurrenz)
    return { name: f.name, p: pr, L, W: f.W, K: f.K, B: f.B, aktiv: true, pEH: pr, WEH: Math.round(f.W * 0.45), KEH: 1, ehAktiv: true };
  });
}
const konkFor = (p = planPeriod()) => (store.konk[p] ||= defaultKonk(p));
function progCtx(p, d, ahead = 0) {
  const s = progSet(Math.min(p, planPeriod())), own = ownIdx();
  const last = lastFirms(planPeriod());
  const M0 = s.marktManuell || (last ? last.f.reduce((a, f) => a + f.D, 0) : 240000);
  const markt = M0 * (1 + (s.wachstum || 0) / 100) ** (1 + ahead);
  let konk = konkFor(planPeriod());
  if (ahead > 0) konk = konk.map((f) => ({ ...f, L: Math.min(13, f.L + ahead * 1) }));
  const ownPrevBek = last ? last.f[own].B : 35;
  const prevCI = Number(d._prevCI ?? store.decHist[planPeriod() - 1]?.ci ?? 0);
  const ownBek = ownPrevBek + (s.ciKoef || 0) * Math.log(((Number(d.ci) || 0) + 25) / (prevCI + 25));
  return { own, konk, markt, ehAnteil: s.ehAnteil, ownBek };
}
function prognose(p, d, S, ahead = 0) {
  const P = store.params[Math.min(p, planPeriod())];
  const level = S.level + Math.min(Math.max(Number(d.levelUp) || 0, 0), P.maxLevelUp);
  return forecast(modelFor(planPeriod()).coef, progCtx(p, d, ahead), d, level);
}

// Entscheidungen, mit denen gerechnet wird: Module, automatischer Planabsatz
function effDec(d, p = planPeriod(), S = store.states[p - 1], ahead = 0) {
  const m = modOf(p), x = { ...d };
  if (!m.ga.aktiv) { x.gaMenge = 0; x.gaPreis = 0; } else { x.gaPreis = Number(m.ga.preis) || 0; x.gaMenge = Math.min(Number(x.gaMenge) || 0, Number(m.ga.max) || 0); }
  if (!m.kredit.aktiv) x.kurzKredit = 0;
  if (x.absatzAutoOnline || x.absatzAutoEH) {
    const f = prognose(p, x, S, ahead);
    if (x.absatzAutoOnline) x.absatzOnline = f.online;
    if (x.absatzAutoEH) x.absatzEH = x.ehAktiv ? f.eh : 0;
  }
  return x;
}
const calcSrc = (sc = scen()) => (store.calcMode === 'live' ? sc.draft : sc.saved);
function simWith(src, p = planPeriod()) {
  return simulate(store.states[p - 1], store.params[p], effDec(src.decisions, p),
    { fields: store.customFields, values: { ...store.paramCustom[p], ...src.custom } });
}
function runPlan(sc = scen()) { return simWith(calcSrc(sc)); }
const dirty = (sc = scen()) => JSON.stringify(sc.draft) !== JSON.stringify(sc.saved);

// Lieferfähigkeits-Ampel: verfügbare Menge gegen Prognose
function ampel(R, d, p = planPeriod()) {
  const S = store.states[p - 1];
  const f = prognose(p, d, S);
  const ga = R.absatz.ga || 0;
  const plan = (Number(d.absatzOnline) || 0) + (d.ehAktiv ? Number(d.absatzEH) || 0 : 0) + ga;
  const prog = f.online + (d.ehAktiv ? f.eh : 0) + ga;
  const verf = S.fe.qty + R.fertigung.ist;
  const puffer = verf - plan;
  const pr = ` Prognose: ${nf(prog, 0)} Stück.`;
  let c = 'gruen', txt = `Lieferfähig: ${nf(verf, 0)} Stück verfügbar (Lager + Fertigung), Planabsatz ${nf(plan, 0)} Stück, Puffer ${nf(puffer, 0)}.` + pr;
  if (puffer < 0) { c = 'rot'; txt = `Lieferunfähig: ${nf(-puffer, 0)} Stück fehlen zum Planabsatz (${nf(plan, 0)} Stück, verfügbar ${nf(verf, 0)}).` + pr; }
  else if (puffer < plan * 0.04) { c = 'gelb'; txt = `Knapp: nur ${nf(puffer, 0)} Stück Puffer zum Planabsatz (${nf(plan, 0)} Stück, verfügbar ${nf(verf, 0)}).` + pr; }
  else if (puffer > plan * 0.25) { c = 'gelb'; txt = `Hoher Lagerüberhang: ${nf(puffer, 0)} Stück mehr verfügbar als Planabsatz (${nf(plan, 0)} Stück).` + pr; }
  if (verf < prog && c === 'gruen') { c = 'gelb'; txt += ` Achtung: Die Prognose liegt ${nf(prog - verf, 0)} Stück über der verfügbaren Menge.`; }
  return { c, txt, nach: plan, verf, f };
}

// ---------------------------------------------------------------- Eingabemasken
const H = {
  preisOnline: 'Preis je Kopfhörer im Online-Shop. Höherer Preis = weniger Absatz (Handbuch-Tabelle: 150 € → 40.000 Stk, 160 € → ca. 28.500, 140 € → ca. 53.000, ohne Qualitätseffekte). Qualitätsbedingte Mehrkosten lassen sich ohne Absatzverlust weitergeben.',
  ehAktiv: 'Entscheidung, ob der Facheinzelhandel bedient werden soll. Lieferpriorität: 1. Großabnehmer, 2. Online-Shop, 3. Einzelhandel.',
  preisEH: 'Preis je Kopfhörer im Facheinzelhandel. Transportkosten Einzelhandel siehe Rahmendaten.',
  werbungOnline: 'Werbebudget Online-Markt in TEUR. Abnehmender Grenznutzen; wirkt über mehrere Perioden, am stärksten in der laufenden.',
  werbungEH: 'Werbebudget Einzelhandel in TEUR.',
  kb: 'Personalendbestand Kundenbetreuer. Einstellung 15 TEUR, Entlassung 10 TEUR je Person. Eingestellt wird nur, wenn die Summe Online + Einzelhandel über dem Vorbestand liegt.',
  ci: 'Corporate Identity in TEUR. Erhöht langfristig und marktübergreifend die Bekanntheit; angemessen laut Handbuch ca. 125 TEUR.',
  levelUp: 'Maximal +2 Level je Periode. Einmalig 100 TEUR je Level, dazu variable Kosten je verkauftem Stück nach Level (L1 16 € … L13 40 €, +2 € je Level).',
  ga: 'Nur ausfüllen, wenn ein Großabnehmer-Angebot vorliegt. Lieferung hat Vorrang, zahlt sofort zu 100 %, keine Transportkosten.',
  einkauf: 'Bestellmenge Einsatzstoffe. Der Staffelpreis gilt für die gesamte Menge. Fehlende Einsatzstoffe kommen automatisch per Just-in-Time zum höheren Preis. Lager 3 €/Einheit auf den Endbestand.',
  fertigung: 'Geplante Fertigungsmenge. Begrenzt durch Anlagenkapazität (keine Überstunden an Anlagen) und Personal: 2.000 Stk je MA, max. +20 % Überstunden mit 25 % Zuschlag.',
  invest: 'Neue Anlagen stehen sofort zur Verfügung. Lineare Abschreibung über 10 Perioden.',
  desinvest: 'Verkaufte Anlagen fehlen schon ab Periodenbeginn. Erlös = Resterlös-% vom Restbuchwert; die Differenz ist außerordentliche Abschreibung. Mindestens eine Anlage muss bleiben.',
  fertigungMA: 'Personalendbestand Fertigung. Nicht ausgelastete Mitarbeiter werden als Fertigungsgemeinkosten verbucht.',
  kurzKredit: 'Kurzfristiger Kredit (Laufzeit 1 Periode), nur wenn in TOPSIM freigeschaltet. Zins siehe Rahmendaten, Rückzahlung automatisch in der Folgeperiode.',
  absatz: 'Angenommener Absatz für die Planungsrechnung (wie in TOPSIM). Die Planungsqualität fließt in den Erfolgswert ein. „Prognose“ übernimmt den Wert aus der Absatzprognose und rechnet bei jeder Änderung mit; sobald du eine eigene Zahl einträgst, gilt deine Zahl.',
  gaPreis: 'Preis, den der Großabnehmer in seinem Angebot festlegt (Handbuch 3.1.6). Gilt für alle Szenarien dieser Periode.',
  gaMax: 'Höchstmenge laut Angebot. Ihr könnt weniger oder gar nichts liefern.',
  zins: 'Zinssatz aus den Wirtschaftsnachrichten der Periode, in der der Kredit freigeschaltet wird. Laut Handbuch 3.5.2 steigt dann auch der Zins für den Überziehungskredit. Gilt für alle Szenarien dieser Periode.',
};
const MODULE_INFO = {
  ga: { mask: 'vertrieb', l: 'Großabnehmer-Angebot', txt: 'Nur einblenden, wenn in TOPSIM ein Großabnehmer-Angebot vorliegt (bisher in keiner Periode).' },
  kredit: { mask: 'finanzen', l: 'Kurzfristiger Kredit', txt: 'Erst einblenden, wenn TOPSIM den kurzfristigen Kredit freischaltet (Wirtschaftsnachrichten).' },
};

const MASKS = {
  vertrieb: { title: 'Vertrieb und Produktentwicklung', sections: [
    { id: 'preis', h: 'Preis/Werbung', col: 'Superbass', fields: [
      { k: 'preisOnline', l: 'Preis Online-Markt (EUR)', d: 0, help: H.preisOnline },
      { k: 'ehAktiv', l: 'Aktiv im Einzelhandel', type: 'check', help: H.ehAktiv },
      { k: 'preisEH', l: 'Preis Einzelhandel (EUR)', d: 0, help: H.preisEH, eh: true },
      { k: 'werbungOnline', l: 'Werbung Online-Markt (TEUR)', d: 0, help: H.werbungOnline },
      { k: 'werbungEH', l: 'Werbung Einzelhandel (TEUR)', d: 0, help: H.werbungEH, eh: true }] },
    { id: 'vertrieb', h: 'Vertrieb', two: ['Online-Markt', 'Einzelhandel'], fields: [
      { k: ['kbOnline', 'kbEH'], l: 'Kundenbetreuer (Anz. Personen)', d: 1, help: H.kb }] },
    { id: 'ci', h: 'Corporate Identity', col: 'Eingabe', fields: [{ k: 'ci', l: 'Corporate Identity (TEUR)', d: 0, help: H.ci }] },
    { id: 'fue', h: 'Produktentwicklung', col: 'Superbass', fields: [
      { k: 'levelUp', l: 'Zuwachs Produktqualität (Level)', type: 'select', opts: [[0, '-'], [1, '+1'], [2, '+2']], help: H.levelUp }] },
    { id: 'ga', h: 'Großabnehmer', col: 'Superbass', module: 'ga', fields: [
      { p: 'ga.preis', l: 'Angebotspreis des Großabnehmers (EUR)', d: 2, help: H.gaPreis }, { p: 'ga.max', l: 'Maximale Liefermenge laut Angebot (Stück)', d: 0, help: H.gaMax },
      { k: 'gaMenge', l: 'Liefermenge Großabnehmer (Stück)', d: 0, help: H.ga }] },
  ] },
  einkauf: { title: 'Einkauf und Fertigung', sections: [
    { id: 'einkauf', h: 'Einkauf', col: 'Superbass', fields: [{ k: 'einkauf', l: 'Einsatzstoffe/Teile (Einheit)', d: 0, help: H.einkauf }] },
    { id: 'fertigung', h: 'Fertigung', col: 'Superbass', fields: [{ k: 'fertigung', l: 'Fertigungsmenge (Stück)', d: 0, help: H.fertigung }] },
    { id: 'anlagen', h: 'Fertigungsanlagen', two: ['Typ A', 'Typ B'], fields: [{ k: ['investA', 'investB'], l: 'Investition (Anz. neue Anlagen)', d: 0, help: H.invest }] },
    { id: 'desinvest', h: 'Desinvestitionen', special: 'desinvest' },
    { id: 'personal', h: 'Personal', col: 'Eingabe', fields: [{ k: 'fertigungMA', l: 'Fertigungspersonal (Anz. Personen)', d: 1, help: H.fertigungMA }] },
  ] },
  finanzen: { title: 'Finanzen und Planwerte', sections: [
    { id: 'finanzen', h: 'Finanzen', col: 'Eingabe', module: 'kredit', fields: [{ k: 'kurzKredit', l: 'Kurzfristiger Kredit (TEUR)', d: 0, help: H.kurzKredit },
      { pp: 'zinsKurz', l: 'Zins kurzfristiger Kredit (Anteil, 0,05 = 5 %)', d: 3, help: H.zins }, { pp: 'zinsDispo', l: 'Zins Überziehungskredit (Anteil)', d: 3, help: H.zins }] },
    { id: 'planwerte', h: 'Planwerte', col: 'Eingabe', fields: [
      { k: 'absatzOnline', l: 'Angenommener Absatz Superbass Online-Markt (Stück)', d: 0, help: H.absatz, auto: 'absatzAutoOnline' },
      { k: 'absatzEH', l: 'Angenommener Absatz Superbass Einzelhandel (Stück)', d: 0, help: H.absatz, eh: true, auto: 'absatzAutoEH' }] },
  ] },
};

const PARAMS = { title: 'Rahmendaten der Periode', sections: [
  { id: 'p-einkauf', h: 'Einkauf und Lager', fields: [
    { p: 'jitPreis', l: 'Just-in-Time-Nachlieferung (EUR/Einheit)', d: 2 }, { p: 'betriebsstoff', l: 'Betriebsstoffe (EUR/Stück gefertigt)', d: 2 },
    { p: 'lagerMat', l: 'Lagerkosten Einsatzstoffe (EUR/Einheit)', d: 2 }, { p: 'lagerFE', l: 'Lagerkosten Fertigerzeugnisse (EUR/Stück)', d: 2 }], special: 'staffel' },
  { id: 'p-vertrieb', h: 'Vertrieb', fields: [
    { p: 'transOnline', l: 'Transportkosten Online-Markt (EUR/Stück)', d: 2 }, { p: 'transEH', l: 'Transportkosten Einzelhandel (EUR/Stück)', d: 2 }] },
  { id: 'p-personal', h: 'Personal', fields: [
    { p: 'gehalt.einkauf', l: 'Gehalt Einkauf (TEUR je MA)', d: 2 }, { p: 'gehalt.verwaltung', l: 'Gehalt Verwaltung (TEUR je MA)', d: 2 },
    { p: 'gehalt.fertigung', l: 'Lohn Fertigung (TEUR je MA)', d: 2 }, { p: 'gehalt.kb', l: 'Gehalt Kundenbetreuer (TEUR je MA)', d: 2 },
    { p: 'nk', l: 'Personalnebenkosten (Anteil, 0,30 = 30 %)', d: 2 }, { p: 'einstellung', l: 'Einstellungskosten (TEUR je Person)', d: 2 },
    { p: 'entlassung', l: 'Entlassungskosten (TEUR je Person)', d: 2 }, { p: 'prodMA', l: 'Produktivität (Stück je Fertigungs-MA)', d: 0 },
    { p: 'ueberMax', l: 'Max. Überstunden (Anteil)', d: 2 }, { p: 'ueberZuschlag', l: 'Überstundenzuschlag (Anteil)', d: 2 }], special: 'perstab' },
  { id: 'p-fix', h: 'Sonstige fixe Kosten je Kostenstelle (TEUR, ohne Anlagen)', fields: [
    { p: 'sfix.einkauf', l: 'Einkauf', d: 2 }, { p: 'sfix.fertigung', l: 'Fertigung (ohne Fixkosten der Anlagen)', d: 2 },
    { p: 'sfix.vertrieb', l: 'Vertrieb (inkl. Planungsrechnungen/Marktforschung)', d: 2 }, { p: 'sfix.verwaltung', l: 'Verwaltung', d: 2 },
    { p: 'gebaeudeAfa', l: 'Abschreibung Gebäude (TEUR/Periode)', d: 2 }] },
  { id: 'p-anlagen', h: 'Neue Fertigungsanlagen', special: 'anlagen' },
  { id: 'p-fue', h: 'Forschung & Entwicklung', fields: [{ p: 'fueProLevel', l: 'Einmalige Kosten je Level (TEUR)', d: 2 }, { p: 'maxLevelUp', l: 'Max. Level-Zuwachs je Periode', d: 0 }], special: 'qual' },
  { id: 'p-finanzen', h: 'Finanzen', fields: [
    { p: 'zinsDispo', l: 'Zins Überziehungskredit (Anteil)', d: 3 }, { p: 'zinsLang', l: 'Zins langfristiger Kredit (Anteil)', d: 3 },
    { p: 'zinsKurz', l: 'Zins kurzfristiger Kredit (Anteil)', d: 3 }, { p: 'steuer', l: 'Steuersatz (Anteil)', d: 3 },
    { p: 'zahlQuote', l: 'Zahlungseingang in der Periode (Anteil)', d: 2 }, { p: 'minKasse', l: 'Mindest-Kassenbestand (TEUR)', d: 2 }] },
  { id: 'p-erfolg', h: 'Erfolgswert-Schätzung', fields: [
    { p: 'erfolgswert.a', l: 'Konstante', d: 2 }, { p: 'erfolgswert.ju', l: 'Gewicht Jahresüberschuss', d: 3 },
    { p: 'erfolgswert.ek', l: 'Gewicht Eigenkapital', d: 3 }, { p: 'erfolgswert.level', l: 'Gewicht Produktqualität (je Level)', d: 2 }] },
] };

const getPath = (o, p) => p.split('.').reduce((x, k) => x?.[k], o);
const setPath = (o, p, v) => { const ks = p.split('.'); const last = ks.pop(); ks.reduce((x, k) => (x[k] ||= {}), o)[last] = v; };

const EFFECTS = [['info', 'Nur Info (keine Rechenwirkung)'], ['fix', 'Fixe Kosten (TEUR) in Kostenstelle'], ['varSold', 'Kosten je verkauftem Stück (EUR)'],
  ['varProd', 'Kosten je gefertigtem Stück (EUR)'], ['ertrag', 'Sonstiger Ertrag (TEUR)'], ['einzahlung', 'Einzahlung ohne Ertrag (TEUR)'], ['auszahlung', 'Auszahlung ohne Aufwand (TEUR)']];

function hint(text) { return text ? `<button class="hint" type="button" data-tip="${esc(t(text))}" aria-label="${esc(t('Hilfe'))}">?</button>` : '<span></span>'; }
function numInput(key, val, d, extra = '') { return `<input type="text" inputmode="decimal" data-k="${key}" data-d="${d}" value="${esc(nf(Number(val) || 0, d))}" ${extra}>`; }

function customRows(cat, values, isParam, ch = new Set()) {
  return store.customFields.filter((f) => f.cat === cat).map((f) => {
    const eff = EFFECTS.find((e) => e[0] === f.effect)?.[1] || '';
    return `<div class="frow${!isParam && ch.has('c:' + f.id) ? ' changed' : ''}" data-row="c:${f.id}"><label>${esc(f.label)}${f.unit ? ` (${esc(f.unit)})` : ''}<span class="custom-tag">${esc(t('eigenes Feld'))}</span>
      <span class="fedit"><button data-editfield="${f.id}" title="${esc(t('Bearbeiten'))}">✎</button><button data-delfield="${f.id}" title="${esc(t('Löschen'))}">✕</button></span></label>
      ${numInput((isParam ? 'pc:' : 'c:') + f.id, values[f.id] ?? f.def ?? 0, f.dec ?? 2)}${hint(t(eff) + (f.effect === 'fix' ? ' – ' + f.kst : '') + (f.note ? '. ' + f.note : ''))}</div>`;
  }).join('');
}

function changedKeys(sc = scen()) {
  const a = sc.draft.decisions, b = sc.saved.decisions, out = new Set();
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.add(k);
  for (const k of new Set([...Object.keys(sc.draft.custom), ...Object.keys(sc.saved.custom)])) if (sc.draft.custom[k] !== sc.saved.custom[k]) out.add('c:' + k);
  return out;
}

function renderMask(id) {
  const M = MASKS[id], d = D(), sc = scen(), p = planPeriod(), S = store.states[p - 1], mod = modOf(p), ch = changedKeys(sc);
  const mark = (keys) => (keys.some((k) => ch.has(k)) ? ' changed' : '');
  let h = (store.welcome && Object.keys(store.states).length === 1) ? `<div class="card welcome"><h3>${t('Willkommen! So geht es los')}</h3><ol>
      <li>${t('Unter „Einstellungen“ euren Firmennamen und eure Unternehmensnummer eintragen (z. B. „Unternehmen 3“).')}</li>
      <li>${t('Die App startet mit der Ausgangslage Periode 0, die für alle Unternehmen gleich ist. Damit lässt sich Periode 1 sofort planen.')}</li>
      <li>${t('Nach jeder Periode den TOPSIM-Sammelbericht als PDF unter „Daten & Import“ hineinziehen. Hast du schon eine Sicherungsdatei, dort „Sicherung importieren“ wählen.')}</li>
      <li>${t('Alle Daten bleiben nur in diesem Browser auf diesem Gerät.')}</li></ol>
      <button class="btn ghost small" data-tool="welcomeoff">${t('Verstanden, ausblenden')}</button></div>` : '';
  h += `<div class="maskbar"><button class="btn ghost small" data-tool="spick" title="${esc(t('Alle gespeicherten Werte des Szenarios in der Reihenfolge der TOPSIM-Masken, zum Abtippen'))}">📄 ${t('Eingabe-Spickzettel (PDF)')}</button></div><div class="mask">`;
  const hidden = [];
  for (const s of M.sections) {
    if (s.module && !mod[s.module].aktiv) { hidden.push(s.module); continue; }
    h += `<h2>${esc(t(s.h))}${s.module ? `<button class="btn ghost small" data-modoff="${s.module}" title="${esc(t('Wieder ausblenden'))}">${t('ausblenden')}</button>` : ''}<button class="btn ghost small add" data-addfield="${s.id}">+ ${esc(t('Feld'))}</button></h2>`;
    if (s.special === 'desinvest') {
      h += `<table class="des"><tr><th></th><th>${t('Anlage Nr.')}</th><th>${t('Restlaufzeit (in Perioden)')}</th><th>${t('Restbuchwert (TEUR)')}</th><th>${t('Desinvestieren?')}</th><th></th></tr>`;
      for (const m of S.machines) {
        const was = (sc.saved.decisions.desinvest || []).includes(m.nr), is = (d.desinvest || []).includes(m.nr);
        h += `<tr class="${was !== is ? 'changed' : ''}"><td>Typ ${m.typ}</td><td>${m.nr}</td><td>${m.rlz}</td><td>${nf(m.rbw)}</td>
        <td><input type="checkbox" data-des="${m.nr}" ${is ? 'checked' : ''}></td><td>${hint(H.desinvest)}</td></tr>`;
      }
      h += `</table>`;
    } else if (s.two) {
      h += `<div class="colhead two"><span></span><span>${esc(t(s.two[0]))}</span><span></span><span>${esc(t(s.two[1]))}</span><span></span></div>`;
      for (const f of s.fields) h += `<div class="frow two${mark(f.k)}" data-row="${f.k.join(',')}"><label>${esc(t(f.l))}</label>${numInput(f.k[0], d[f.k[0]], f.d)}${hint(f.help)}
        ${numInput(f.k[1], d[f.k[1]], f.d, f.k[1] === 'kbEH' && !d.ehAktiv ? 'disabled' : '')}${hint(f.help)}</div>`;
    } else {
      h += `<div class="colhead"><span></span><span>${esc(t(s.col))}</span><span></span></div>`;
      for (const f of s.fields) {
        const dis = f.eh && !d.ehAktiv ? 'disabled' : '';
        let inp, keys = [f.k];
        if (f.p) { inp = numInput('m:' + f.p, getPath(mod, f.p), f.d); keys = []; }
        else if (f.pp) { inp = numInput('p:' + f.pp, store.params[p][f.pp], f.d); keys = []; }
        else if (f.type === 'check') inp = `<span><input type="checkbox" data-k="${f.k}" ${d[f.k] ? 'checked' : ''}></span>`;
        else if (f.type === 'select') inp = `<select data-k="${f.k}">${f.opts.map(([v, l]) => `<option value="${v}" ${Number(d[f.k]) === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
        else if (f.auto) {
          keys = [f.k, f.auto];
          const fc = prognose(p, sc.draft.decisions, S);
          const pv = f.k === 'absatzOnline' ? fc.online : fc.eh;
          const isAuto = !!d[f.auto];
          inp = `<div class="autofield">${numInput(f.k, isAuto ? pv : d[f.k], f.d, dis + (isAuto ? ' class="isauto"' : ''))}
            ${dis ? '' : isAuto ? `<span class="autotag" title="${esc(t('Wert kommt aus der Absatzprognose. Eigene Zahl eintippen, um ihn zu überschreiben.'))}">${t('Prognose')}</span>`
              : `<button class="btn ghost small" data-autoon="${f.auto}" title="${esc(t('Prognosewert übernehmen'))}">↺ ${t('Prognose')} ${nf(pv, 0)}</button>`}</div>`;
        }
        else inp = numInput(f.k, d[f.k], f.d, dis);
        h += `<div class="frow${mark(keys)}" data-row="${keys.join(',')}"><label>${esc(t(f.l))}</label>${inp}${hint(f.help)}</div>`;
        if (f.k === 'ehAktiv') h += `<div class="frow subrow"><span></span><div class="sub">${esc(t('Entscheidung, ob Einzelhandel bedient werden soll.'))}</div><span></span></div>`;
      }
    }
    h += customRows(s.id, sc.draft.custom, false, ch);
  }
  if (id === 'vertrieb' || id === 'einkauf' || id === 'finanzen') h += ampelHtml();
  if (hidden.length) h += `<div class="modrow">${hidden.map((m) => `<button class="linkbtn" data-modon="${m}" title="${esc(t(MODULE_INFO[m].txt))}">+ ${esc(t(MODULE_INFO[m].l))} ${t('einblenden')}</button>`).join(' ')}</div>`;
  return h + `</div>`;
}

function renderParams() {
  const p = planPeriod(), P = store.params[p], pc = store.paramCustom[p];
  let h = `<div class="note">${esc(t('Rahmendaten für Periode'))} ${p}. ${esc(t('Neue Werte aus den Wirtschaftsnachrichten (z. B. Inflation, Staffelpreise, Gehälter) hier eintragen. Sie gelten für alle Szenarien dieser Periode.'))}</div><div class="mask">`;
  for (const s of PARAMS.sections) {
    h += `<h2>${esc(t(s.h))}<button class="btn ghost small add" data-addfield="${s.id}">+ ${esc(t('Feld'))}</button></h2>`;
    for (const f of s.fields || []) h += `<div class="frow"><label>${esc(t(f.l))}</label>${numInput('p:' + f.p, getPath(P, f.p), f.d)}<span></span></div>`;
    if (s.special === 'staffel') {
      h += `<h2 style="font-size:13px">${esc(t('Mengenstaffel Einsatzstoffe'))}</h2><table class="des"><tr><th>${t('ab Menge (Einheiten)')}</th><th>${t('Preis (EUR/Einheit)')}</th><th></th></tr>`;
      P.matStaffel.forEach(([ab, pr], i) => { h += `<tr><td>${numInput(`st:${i}:0`, ab, 0, 'class="field"')}</td><td>${numInput(`st:${i}:1`, pr, 2, 'class="field"')}</td>
        <td><button class="btn ghost small" data-delstaffel="${i}">✕</button></td></tr>`; });
      h += `</table><button class="btn ghost small" data-addstaffel>+ ${esc(t('Staffel'))}</button>`;
    }
    if (s.special === 'perstab') {
      h += `<h2 style="font-size:13px">${esc(t('Personal Einkauf/Verwaltung nach Umsatz (automatisch, Handbuch 3.4.5)'))}</h2><table class="des"><tr><th>${t('Umsatz (Mio. EUR)')}</th><th>${t('MA Einkauf')}</th><th>${t('MA Verwaltung')}</th></tr>`;
      P.einkaufTab.forEach(([u, e], i) => { h += `<tr><td>${nf(u, 0)}</td><td>${numInput(`et:${i}`, e, 1, 'class="field"')}</td><td>${numInput(`vt:${i}`, P.verwaltungTab[i][1], 1, 'class="field"')}</td></tr>`; });
      h += `</table>`;
    }
    if (s.special === 'anlagen') {
      h += `<table class="des"><tr><th>${t('Typ')}</th><th>${t('Kaufpreis TEUR')}</th><th>${t('Nutzungsdauer')}</th><th>${t('Kapazität Stück')}</th><th>${t('Fixkosten TEUR')}</th><th>${t('Resterlös %')}</th></tr>`;
      for (const [typ, a] of Object.entries(P.anlagen)) h += `<tr><td>${typ}</td>${['preis', 'dauer', 'cap', 'fix', 'rest'].map((k) => `<td>${numInput(`an:${typ}:${k}`, a[k], k === 'preis' || k === 'fix' ? 2 : 0, 'class="field"')}</td>`).join('')}</tr>`;
      h += `</table>`;
    }
    if (s.special === 'qual') {
      h += `<table class="des"><tr><th>${t('Level')}</th>${P.qualKosten.map((_, i) => `<th>${i + 1}</th>`).join('')}</tr><tr><td>${t('EUR/Stück')}</td>${P.qualKosten.map((v, i) => `<td>${numInput(`qk:${i}`, v, 0, 'class="field" style="min-width:44px"')}</td>`).join('')}</tr></table>`;
    }
    h += customRows(s.id, pc, true);
  }
  return h + `</div>`;
}

// ---------------------------------------------------------------- Ergebnisleiste, Kopf
function eur(v, d = 2) { return nf(v, d); }
function renderBar(R) {
  const k = R.kpi, dl = ui.delta;
  const dv = (key, d = 2) => { if (!dl || Math.abs(dl[key]) < 0.005) return ''; const v = dl[key]; return ` <span class="delta ${v > 0 ? 'up' : 'down'}">${v > 0 ? '+' : ''}${nf(v, d)}</span>`; };
  const item = (l, v, u, neg, key, d) => `<span><span class="k">${esc(t(l))}</span> <span class="v ${neg ? 'neg' : ''}">${v}</span> <span class="k">${u}</span>${key ? dv(key, d) : ''}</span>`;
  const a = ampel(R, effDec(calcSrc().decisions));
  const pend = store.calcMode === 'save' && dirty();
  $('#bar').innerHTML = `<span class="ampeldot ${a.c}" title="${esc(t(a.txt))}"></span>`
    + item('Plan-JÜ', eur(k.ju), 'T€', k.ju < 0, 'ju') + item('Umsatz', eur(k.umsatz, 0), 'T€', false, 'umsatz', 0) + item('Überziehung', eur(k.dispo), 'T€', false, 'dispo')
    + item('Absatz', nf(R.absatz.sold, 0), 'Stk', false, 'absatz', 0) + item('Lager', nf(R.lagerFE.ende.qty, 0), 'Stk', false, 'lager', 0) + item('HK', eur(k.hkStk), '€/Stk')
    + item('Erfolgswert ≈', nf(k.erfolgswert, 1), '', false, 'ew', 1)
    + (pend ? `<span class="pending">${t('Geänderte Werte werden erst beim Speichern gerechnet.')}</span><button class="btn save small" id="save2">${t('Speichern')}</button>` : '')
    + (R.warnings.length ? `<div class="warn">⚠ ${R.warnings.map((w) => esc(t(w))).join(' · ')}</div>` : '');
  $('#chips').innerHTML = `<span class="chip">${t('JÜ')} <b>${eur(k.ju)}</b> T€</span><span class="chip">${t('Dispo')} <b>${eur(k.dispo, 0)}</b> T€</span><span class="chip ew">EW ≈ <b>${nf(k.erfolgswert, 1)}</b></span>`;
}
const kpiSnap = (R) => ({ ju: R.kpi.ju, umsatz: R.kpi.umsatz, dispo: R.kpi.dispo, absatz: R.absatz.sold, lager: R.lagerFE.ende.qty, ew: R.kpi.erfolgswert });

function renderSide() {
  const p = planPeriod(), sc = scen();
  const nav = [['vertrieb', 'Vertrieb und Produktentwicklung'], ['einkauf', 'Einkauf und Fertigung'], ['finanzen', 'Finanzen und Planwerte']];
  const st = dirty() ? `<small>${t('Nicht gespeichert')}</small>` : `<small class="ok">${t('Gespeichert')}</small>`;
  const isRep = ui.route === 'berichte';
  const periods = isRep ? Array.from({ length: p + 1 }, (_, i) => i) : [...Object.keys(store.states).map(Number).filter((x) => x > 0), p];
  const cur = isRep ? (ui.repPeriod ?? p) : p;
  $('#side').innerHTML = `<h3>${t('Periode')}</h3><div class="periods">${periods.map((x) => `<button data-per="${x}" class="${x === cur ? 'on' : ''} ${x === p ? 'plan' : ''}" title="${x === p ? t('Planperiode') : t('abgeschlossen')}">${x}</button>`).join('')}</div>
    <ul class="nav">${nav.map(([r, l]) => `<li><a data-route="${r}" class="${ui.route === r ? 'on' : ''}">${esc(t(l))}${st}</a></li>`).join('')}</ul>
    <div class="sidebtns"><button class="btn" id="reset">${t('Zurücksetzen')}</button><button class="btn save" id="save">${t('Speichern')}</button></div>
    <div class="scen">${t('Szenario')}<div class="scdd">
      <button class="scbtn" id="scopen" aria-expanded="${ui.scOpen ? 'true' : 'false'}"><span>${esc(sc.name)}${sc.team ? ' ★' : ''}</span><span>▾</span></button>
      ${ui.scOpen ? `<div class="scpanel">${store.scenarios[p].map((s) => `<div class="scitem ${s.id === sc.id ? 'on' : ''}">
          <button class="scpick" data-scpick="${s.id}">${esc(s.name)}${s.team ? ' ★' : ''}${dirty(s) ? ' <i>•</i>' : ''}</button>
          <button class="scico" data-scteam="${s.id}" title="${esc(t('Als Teamentscheidung markieren'))}">${s.team ? '★' : '☆'}</button>
          <button class="scico" data-scren="${s.id}" title="${esc(t('Umbenennen'))}">✎</button>
          <button class="scico" data-scdel="${s.id}" title="${esc(t('Löschen'))}" ${store.scenarios[p].length < 2 ? 'disabled' : ''}>🗑</button></div>`).join('')}
        <button class="scnew" id="scnew2">+ ${t('Neues Szenario')}</button></div>` : ''}</div></div>
    <ul class="nav"><li class="grp">${t('Auswertung')}</li>
      ${[['kpi', 'Simulieren · Übersicht KPIs'], ['berichte', 'Berichtswesen'], ['szenarien', 'Szenarien & Vergleich'], ['prognose', 'Absatzprognose & Konkurrenz'],
        ['optimierer', 'Hebel & Optimierer'], ['vorschau', 'Vorschau bis Periode 6'], ['planist', 'Plan-Ist-Abgleich'], ['parameter', 'Rahmendaten der Periode']]
        .map(([r, l]) => `<li><a data-route="${r}" class="${ui.route === r ? 'on' : ''}">${esc(t(l))}<small></small></a></li>`).join('')}
      <li class="grp">${t('Verwaltung')}</li>
      ${[['daten', 'Daten & Import'], ['einstellungen', 'Einstellungen'], ['hilfe', 'Hilfe & Spielregeln']]
        .map(([r, l]) => `<li><a data-route="${r}" class="${ui.route === r ? 'on' : ''}">${esc(t(l))}<small></small></a></li>`).join('')}</ul>`;
}

// ---------------------------------------------------------------- Berichte
function reportTable(tb, curCol) {
  const hasUnit = !tb.noUnit;
  let h = `${tb.title ? `<h4>${esc(tb.title)}</h4>` : ''}<div class="tbl"><table class="r"><thead><tr><th></th>${hasUnit ? `<th style="background:transparent;color:inherit">${esc(tb.unitHead || '')}</th>` : ''}${tb.cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>`;
  for (const r of tb.rows) {
    h += `<tr class="${r.b ? 'b' : ''} ${r.sec ? 'sec' : ''} ${r.i ? 'i' : ''}"><td>${esc(r.l)}</td>${hasUnit ? `<td class="u">${esc(r.u || '')}</td>` : ''}${r.v.map((v, i) => `<td class="${curCol === i ? 'cur' : ''}">${r.sec ? '' : esc(typeof v === 'number' ? nf(v, r.f ?? 2) : v)}</td>`).join('')}</tr>`;
  }
  return h + `</tbody></table></div>${tb.foot ? `<div class="foot">${esc(tb.foot)}</div>` : ''}`;
}
function reportHtml(rep) {
  let h = `<div class="report"><h1>${esc(rep.title)}</h1>${rep.note ? `<div class="note">${esc(rep.note)}</div>` : ''}`;
  for (const tb of rep.tables) h += reportTable(tb, rep.id === '01' ? 1 : undefined);
  return h + `</div>`;
}

function reportsFor(p) {
  const plan = planPeriod();
  const base = { history: store.history, decHist: store.decHist, unternehmen: store.unternehmen, markt: store.markt[p], branche: store.branche[p] };
  if (p === plan) {
    const R = runPlan();
    return { R, plan: true, reports: buildReports(R, { ...base, P: store.params[p], D: effDec(calcSrc().decisions), S: store.states[p - 1] }) };
  }
  const inp = store.istInputs[p];
  if (inp && store.states[p - 1]) {
    const R = simulate(store.states[p - 1], inp.P, inp.D);
    const decHist = { ...store.decHist }; delete decHist[p];
    const reps = buildReports(R, { ...base, decHist, P: inp.P, D: { ...(store.decHist[p] || {}), ...inp.D }, S: store.states[p - 1], ist: true });
    return { R, reports: reps, check: store.history[p] ? { ju: store.history[p].ju, sim: R.guv.ju } : null };
  }
  // nur Kennzahlen und Bilanz vorhanden
  const reps = [execSummary(p, store.history)];
  const s = store.states[p];
  if (s) {
    const fe = ['varMat', 'fixMat', 'varFert', 'fixFert'].reduce((a, c) => a + (s.fe[c] || 0), 0);
    const masch = s.machines.reduce((a, m) => a + m.rbw, 0), ju = store.history[p]?.ju ?? 0;
    const B = { ...s.bilanz, masch, av: s.bilanz.grund + masch, mat: s.mat.value, fe, wp: 0, ju, gvVortragVor: s.bilanz.gvVortrag - ju,
      ek: s.bilanz.gez + s.bilanz.krl + s.bilanz.grl + s.bilanz.gvVortrag, fk: s.bilanz.lang + s.bilanz.kurz + s.bilanz.dispo };
    B.uv = B.mat + B.fe + B.ford + B.kasse; B.aktiva = B.av + B.uv; B.passiva = B.ek + B.fk;
    reps.push(bilanzReport(B, null));
  }
  return { reports: reps, limited: true };
}

function renderBerichte() {
  const plan = planPeriod(), p = ui.repPeriod ?? plan;
  const res = reportsFor(p);
  const reps = res.reports;
  if (!reps.find((r) => r.id === ui.repId)) ui.repId = reps[0].id;
  const rep = reps.find((r) => r.id === ui.repId);
  let badge = '';
  if (res.plan) badge = `<span class="badge">${t('Planungsrechnung')} · ${esc(scen().name)}</span>`;
  else if (res.check) { const dv = res.check.sim - res.check.ju; badge = Math.abs(dv) < 0.05 ? `<span class="badge ok">✓ ${t('nachgerechnet, stimmt mit TOPSIM überein')}</span>` : `<span class="badge bad">${t('Abweichung zu TOPSIM')}: ${nf(dv)} T€ JÜ</span>`; }
  else if (res.limited) badge = `<span class="badge">${t('Nur Kennzahlen und Bilanz vorhanden. Für alle Berichte den Sammelbericht unter „Daten & Import“ einfügen.')}</span>`;
  return `<div class="rhead"><span class="lbl">${t('Download: alle Berichte')}</span><button class="btn small" id="dlzip">ZIP (PDF)</button>
      <span class="lbl" style="margin-left:12px">${t('Einzelbericht')}</span><button class="btn ghost small" id="dlone">PDF</button>
      <button class="btn ghost small" id="print">${t('Drucken')}</button> ${badge}</div>
    <div class="rtabs">${reps.map((r) => `<button data-rep="${r.id}" class="${r.id === ui.repId ? 'on' : ''}">${esc(r.title.replace(' (TEUR)', ''))}</button>`).join('')}</div>
    ${reportHtml(rep)}`;
}

function renderKpi() {
  const R = runPlan(), p = planPeriod();
  const reps = buildReports(R, { history: store.history, decHist: store.decHist, unternehmen: store.unternehmen, P: store.params[p], D: effDec(calcSrc().decisions), S: store.states[p - 1] });
  return `<div class="row"><span class="badge">${t('Szenario')}: ${esc(scen().name)}</span>${dirty() ? `<span class="badge bad">${t('Nicht gespeichert')}</span>` : ''}
    <button class="btn small" data-route="berichte">${t('Zum Berichtswesen')}</button></div>${reportHtml(reps[0])}
    ${R.warnings.length ? `<div class="note">⚠ ${R.warnings.map((w) => esc(t(w))).join('<br>⚠ ')}</div>` : ''}${reportHtml(reps.find((r) => r.id === 'EW'))}`;
}

// ---------------------------------------------------------------- Szenarien
function renderSzenarien() {
  const p = planPeriod(), list = store.scenarios[p];
  const res = list.map((s) => ({ s, R: runPlan(s) }));
  const rows = [['Periodenüberschuss/-fehlbetrag', 'TEUR', (R) => R.kpi.ju, 2, 1], ['Erfolgswert (Schätzung)', 'Index', (R) => R.kpi.erfolgswert, 1, 1],
    ['Umsatz', 'TEUR', (R) => R.kpi.umsatz, 2, 1], ['Absatz gesamt', 'Stück', (R) => R.absatz.sold, 0, 0], ['Preis Online', 'EUR', (R) => R.absatz.preisOnline, 0, 0],
    ['Fertigung', 'Stück', (R) => R.fertigung.ist, 0, 0], ['Lagerendbestand', 'Stück', (R) => R.lagerFE.ende.qty, 0, 0],
    ['Herstellkosten', 'EUR/Stück', (R) => R.kpi.hkStk, 2, -1], ['Selbstkosten', 'EUR/Stück', (R) => R.kpi.skStk, 2, -1],
    ['Betriebsergebnis', 'TEUR', (R) => R.guv.be, 2, 1], ['Überziehungskredit', 'TEUR', (R) => R.kpi.dispo, 2, -1], ['Eigenkapital', 'TEUR', (R) => R.kpi.ek, 2, 1],
    ['Fremdkapitalquote', '%', (R) => R.kpi.fkQuote, 2, -1], ['Eigenkapitalrendite', '%', (R) => R.kpi.ekRendite, 2, 1], ['Produktqualität', 'Level', (R) => R.level.cur, 0, 0]];
  let h = `<div class="row" style="margin-bottom:10px"><button class="btn small" id="scnew">+ ${t('Neues Szenario')}</button><button class="btn ghost small" id="scdup">${t('Aktuelles duplizieren')}</button>
    <button class="btn ghost small" id="screname">${t('Umbenennen')}</button><button class="btn ghost small" id="scteam">★ ${t('Als Teamentscheidung markieren')}</button>
    <button class="btn ghost small" id="scdel">${t('Löschen')}</button></div>
    <div class="note">${t('Alle Szenarien der Periode')} ${p} ${t('nebeneinander (wie „Übernehmen“ in TOPSIM). Grün = bester Wert.')} ${store.calcMode === 'live' ? t('Gerechnet wird mit dem aktuellen Bearbeitungsstand.') : t('Gerechnet wird mit dem zuletzt gespeicherten Stand.')}</div>
    <div class="tbl"><table class="r cmp"><thead><tr><th></th><th style="background:transparent;color:inherit"></th>${res.map(({ s }) => `<th>${esc(s.name)}${s.team ? ' ★' : ''}</th>`).join('')}</tr></thead><tbody>`;
  for (const [l, u, fn, d, dir] of rows) {
    const vals = res.map(({ R }) => fn(R));
    const best = new Set(vals.map((v) => v.toFixed(4))).size < 2 ? null : dir === 1 ? Math.max(...vals) : dir === -1 ? Math.min(...vals) : null;
    h += `<tr><td>${esc(t(l))}</td><td class="u">${u}</td>${vals.map((v) => `<td class="${res.length > 1 && best !== null && v === best ? 'best' : ''}">${nf(v, d)}</td>`).join('')}</tr>`;
  }
  return h + `</tbody></table></div>`;
}

// ---------------------------------------------------------------- Daten & Import
let pending = null;
function renderDaten() {
  const ist = Object.keys(store.states).map(Number).sort((a, b) => a - b);
  let h = `<div class="card"><h3>${t('TOPSIM-Berichte einfügen')}</h3>
    <p class="muted">${t('Sammelbericht als PDF hochladen (auch mehrere Einzelberichte gleichzeitig) oder den Berichtstext kopieren und einfügen. Periode und Inhalte werden automatisch erkannt. Damit lassen sich auch vergangene Perioden nachtragen.')}</p>
    <div class="drop" id="drop">${t('PDF-Dateien hierher ziehen oder')} <label class="btn small" style="display:inline-block">${t('Dateien wählen')}<input type="file" id="files" accept="application/pdf,.pdf,.txt" multiple hidden></label></div>
    <p><textarea class="paste" id="paste" placeholder="${esc(t('… oder Text der Berichte hier einfügen (Strg+V)'))}"></textarea></p>
    <div class="row"><button class="btn" id="parse">${t('Einlesen')}</button></div><div id="preview">${pending ? previewHtml(pending) : ''}</div></div>`;
  h += `<div class="card"><h3>${t('Stand der Perioden')}</h3><div class="tbl"><table class="r"><thead><tr><th></th><th>${t('Erfolgswert')}</th><th>JÜ T€</th><th>${t('Endstand')}</th><th>${t('Alle Berichte')}</th><th></th></tr></thead><tbody>
    ${ist.map((p) => `<tr><td>${t('Periode')} ${p}</td><td>${nf(store.history[p]?.erfolgswert)}</td><td>${nf(store.history[p]?.ju)}</td><td>${store.states[p] ? '✓' : '–'}</td>
      <td>${store.istInputs[p] && store.states[p - 1] ? '✓' : '–'}</td><td><button class="btn ghost small" data-editstate="${p}">${t('Endstand bearbeiten')}</button></td></tr>`).join('')}
    <tr><td>${t('Periode')} ${planPeriod()}</td><td colspan="5">${t('Planperiode')}</td></tr></tbody></table></div></div>`;
  h += `<div class="card"><h3>${t('Sicherung')}</h3><p class="muted">${t('Alle Daten liegen nur auf diesem Gerät (im Browser). Für ein anderes Gerät oder als Sicherung exportieren und dort importieren.')}</p>
    <div class="row"><button class="btn" id="exp">${t('Sicherung exportieren')}</button><label class="btn ghost">${t('Sicherung importieren')}<input type="file" id="imp" hidden></label>
    <button class="btn danger" id="wipe">${t('Alles zurücksetzen')}</button></div></div>`;
  return h;
}
function previewHtml(x) {
  const p = x.period;
  return `<div class="note"><b>${t('Erkannt')}:</b> ${t('Periode')} ${p ?? '?'} · ${x.unternehmen ? 'Unternehmen ' + x.unternehmen : ''} · ${x.found.length} ${t('Berichte')} (${x.found.map((f) => 'TNB' + f).join(', ')})<br>
    ${x.history?.[p] ? `${t('Erfolgswert')} ${nf(x.history[p].erfolgswert)} · JÜ ${nf(x.history[p].ju)} T€ · ${t('Absatz')} ${nf(x.history[p].absatz, 0)}` : ''}
    ${x.state ? '' : `<br>⚠ ${t('Für den Endstand fehlen Berichte (Bilanz, Lager, Personal, Fertigung). Bitte den vollständigen Sammelbericht verwenden.')}`}
    ${x.warnings.map((w) => '<br>⚠ ' + esc(t(w))).join('')}</div>
    <button class="btn save" id="apply" ${p === null ? 'disabled' : ''}>${t('Übernehmen')}</button> <button class="btn ghost" id="discard">${t('Verwerfen')}</button>`;
}

function applyImport(x) {
  const p = x.period;
  for (const [k, v] of Object.entries(x.history || {})) store.history[k] = { ...(store.history[k] || {}), ...v };
  for (const [k, v] of Object.entries(x.decisions || {})) store.decHist[k] = { ...DEF.emptyDecisions(), ...(store.decHist[k] || {}), ...v, ehAktiv: (v.preisEH || 0) > 0 || store.decHist[k]?.ehAktiv || false };
  if (x.markt) store.markt[p] = x.markt;
  if (x.branche) store.branche[p] = x.branche;
  if (x.state) store.states[p] = x.state;
  // Parameter und Ist-Entscheidungen zum Nachrechnen dieser Periode
  const P = clone(store.params[p] || store.istInputs[p]?.P || store.params[p + 1] || DEF.baseParams());
  if (x.gehalt) P.gehalt = Object.fromEntries(Object.entries(x.gehalt).map(([k, v]) => [k, Math.round(v * 100) / 100]));
  if (x.transOnline) P.transOnline = x.transOnline;
  if (x.transEH) P.transEH = x.transEH;
  if (x.jit?.preis) P.jitPreis = x.jit.preis;
  if (x.matKauf?.qty) P.matStaffel = [[0, x.matKauf.preis]];
  if (x.sfixKst && x.machines) P.sfix = { ...x.sfixKst, fertigung: x.sfixKst.fertigung - x.machines.reduce((s, m) => s + m.fix, 0) };
  if (x.level && x.qualKostenStk) P.qualKosten[x.level - 1] = x.qualKostenStk;
  const d = { ...DEF.emptyDecisions(), ...(store.decHist[p] || {}) };
  const pr = x.preisOnline || d.preisOnline;
  if (x.umsatzKanal) { d.absatzOnline = pr ? Math.round(x.umsatzKanal.online * 1000 / pr) : 0; d.absatzEH = x.preisEH ? Math.round(x.umsatzKanal.eh * 1000 / x.preisEH) : 0; d.ehAktiv = d.absatzEH > 0 || d.ehAktiv; }
  else if (x.history?.[p]) d.absatzOnline = x.history[p].absatz;
  if (d.ehAktiv) { d.kbEH = x.decisions?.[p]?.kbEH ?? store.states[p]?.staff?.kbEH ?? d.kbEH; d.kbOnline = (x.staff?.kb ?? 0) - d.kbEH; }
  d.sonstErtrag = x.sonstErtrag || 0;
  store.istInputs[p] = { P, D: d };
  ensurePeriod(planPeriod());
  persist();
}

function renderStateEditor(p) {
  const s = store.states[p];
  const f = (path, l, d = 2) => `<div class="frow"><label>${esc(t(l))}</label>${numInput('s:' + path, getPath(s, path), d)}<span></span></div>`;
  return `<div class="card"><h3>${t('Endstand Periode')} ${p} ${t('bearbeiten')}</h3><div class="mask">
    <h2>${t('Lager')}</h2>${f('fe.qty', 'Fertigerzeugnisse (Stück)', 0)}${f('fe.varMat', 'Lagerwert: variable Materialkosten (TEUR)')}${f('fe.fixMat', 'Lagerwert: fixe Materialkosten (TEUR)')}
    ${f('fe.varFert', 'Lagerwert: variable Fertigungskosten (TEUR)')}${f('fe.fixFert', 'Lagerwert: fixe Fertigungskosten (TEUR)')}${f('mat.qty', 'Einsatzstoffe (Einheiten)', 0)}${f('mat.value', 'Einsatzstoffe Lagerwert (TEUR)')}
    <h2>${t('Personal')}</h2>${f('staff.einkauf', 'Einkauf', 1)}${f('staff.verwaltung', 'Verwaltung', 1)}${f('staff.fertigung', 'Fertigung', 1)}${f('staff.kbOnline', 'Kundenbetreuer Online', 1)}${f('staff.kbEH', 'Kundenbetreuer Einzelhandel', 1)}
    <h2>${t('Produkt')}</h2>${f('level', 'Produktqualität (Level)', 0)}${f('preisOnline', 'Preis Online Vorperiode (EUR)', 0)}
    <h2>${t('Bilanz')}</h2>${f('bilanz.grund', 'Grundstücke und Bauten')}${f('bilanz.ford', 'Forderungen aus L&L')}${f('bilanz.kasse', 'Kassenbestand')}
    ${f('bilanz.gez', 'Gezeichnetes Kapital')}${f('bilanz.krl', 'Kapitalrücklage')}${f('bilanz.grl', 'Gewinnrücklage')}${f('bilanz.gvVortrag', 'Gewinnvortrag inkl. Periodenüberschuss')}
    ${f('bilanz.lang', 'Langfristige Verbindlichkeiten')}${f('bilanz.kurz', 'Kurzfristiger Kredit')}${f('bilanz.dispo', 'Überziehungskredit')}${f('verlustvortrag', 'Steuerlicher Verlustvortrag')}
    <h2>${t('Anlagen')}</h2><table class="des"><tr><th>Nr.</th><th>Typ</th><th>${t('Restlaufzeit')}</th><th>${t('Restbuchwert')}</th><th>${t('AfA/Periode')}</th><th>${t('Fixkosten')}</th><th>${t('Kapazität')}</th><th></th></tr>
    ${s.machines.map((m, i) => `<tr><td>${m.nr}</td><td>${m.typ}</td>${['rlz', 'rbw', 'afaRate', 'fix', 'cap'].map((k) => `<td>${numInput(`s:machines.${i}.${k}`, m[k], k === 'rlz' || k === 'cap' ? 0 : 2, 'class="field"')}</td>`).join('')}
      <td><button class="btn ghost small" data-delmach="${i}">✕</button></td></tr>`).join('')}</table>
    <div class="row" style="margin-top:8px"><button class="btn ghost small" data-addmach="A">+ ${t('Anlage Typ A')}</button><button class="btn ghost small" data-addmach="B">+ ${t('Anlage Typ B')}</button>
    <button class="btn" data-route="daten">${t('Fertig')}</button></div></div></div>`;
}

// ---------------------------------------------------------------- Einstellungen, Hilfe
let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; });
function renderSettings() {
  const th = [['light', 'Hell'], ['dark', 'Dunkel'], ['midnight', 'Mitternacht']];
  return `<div class="card"><h3>${t('Rechnen')}</h3><div class="seg">
      <label class="segopt ${store.calcMode !== 'live' ? 'on' : ''}"><input type="radio" name="cm" data-calcmode="1" value="save" ${store.calcMode !== 'live' ? 'checked' : ''}> ${t('Erst bei „Speichern“ (geänderte Zeilen markieren)')}</label>
      <label class="segopt ${store.calcMode === 'live' ? 'on' : ''}"><input type="radio" name="cm" data-calcmode="1" value="live" ${store.calcMode === 'live' ? 'checked' : ''}> ${t('Sofort bei jeder Änderung')}</label></div>
      <p class="muted">${t('Bei „Erst bei Speichern“ bleibt das Ergebnis unten stehen, bis du speicherst. Danach zeigt die Leiste, was sich verändert hat.')}</p></div>
    <div class="card"><h3>${t('Darstellung')}</h3><div class="seg">${th.map(([k, l]) => `<button data-theme="${k}" class="${store.theme === k ? 'on' : ''}">${t(l)}</button>`).join('')}</div></div>
    <div class="card"><h3>${t('Sprache')}</h3><div class="seg"><button data-lang="de" class="${getLang() === 'de' ? 'on' : ''}">Deutsch</button><button data-lang="bar" class="${getLang() === 'bar' ? 'on' : ''}">Boarisch</button></div></div>
    <div class="card"><h3>${t('Unternehmen')}</h3><div class="mask"><div class="frow"><label>${t('Marke')}</label><input type="text" id="firma" value="${esc(store.firma)}"><span></span></div>
      <div class="frow"><label>${t('Unternehmen')}</label><input type="text" id="untern" value="${esc(store.unternehmen)}"><span></span></div></div></div>
    <div class="card"><h3>${t('App installieren')}</h3><p class="muted">${t('Windows/Android: in Edge oder Chrome auf „App installieren“ tippen. iPhone/iPad: in Safari „Teilen“ → „Zum Home-Bildschirm“.')}</p>
      <button class="btn" id="install" ${installEvt ? '' : 'disabled'}>${t('Jetzt installieren')}</button></div>
    <div class="card"><h3>${t('Über')}</h3><p class="muted">TONWERK Planrechner ${VERSION} · ${t('Rechenkern geprüft gegen echte TOPSIM-Berichte (Abweichung 0,00 T€). Open Source unter MIT-Lizenz.')}</p></div>`;
}
function renderHilfe() {
  const rules = [
    ['Absatz und Lieferung', 'Planabsatz wie in TOPSIM als Annahme. Lieferreihenfolge: Großabnehmer, Online-Shop, Einzelhandel. Verkauft wird höchstens Lagerbestand + Fertigung.'],
    ['Zahlungen', '80 % des Umsatzes (Online + Einzelhandel) kommen sofort, 20 % in der Folgeperiode (Forderungen). Großabnehmer zahlen sofort. Einsatzstoffe werden sofort bezahlt.'],
    ['Fertigung', 'Kapazität = Summe der Anlagen. Personal: 2.000 Stück je MA, bis +20 % Überstunden mit 25 % Zuschlag. Nicht ausgelastete MA gehen in die Fertigungsgemeinkosten.'],
    ['Einsatzstoffe', 'Staffelpreis gilt für die gesamte Bestellmenge. Fehlmengen automatisch per Just-in-Time. Lagerbewertung zum Durchschnittspreis. Lager 3 €/Einheit, Fertigerzeugnisse 5 €/Stück auf den Endbestand.'],
    ['Personal Einkauf/Verwaltung', 'Wird automatisch nach dem Umsatz angepasst (Tabelle Handbuch 3.4.5, linear interpoliert, auf 0,5 gerundet). Einstellung 15 TEUR, Entlassung 10 TEUR, Nebenkosten 30 %.'],
    ['Lagerbewertung', 'Fertigerzeugnisse zu Herstellkosten, gewichteter Durchschnitt aus Anfangsbestand und Produktion, getrennt nach Material/Fertigung, variabel/fix.'],
    ['Qualität', 'Max. +2 Level je Periode, 100 TEUR je Level, variable Qualitätskosten je verkauftem Stück nach aktuellem Level.'],
    ['Finanzierung', 'Kasse mindestens 10 TEUR, sonst automatisch Überziehungskredit (Zins auf den Endbestand, Rückzahlung in der Folgeperiode). Langfristiger Kredit 750 TEUR zu 4 %.'],
    ['Steuern', '35 % auf den Gewinn vor Steuern, Verluste werden vorgetragen.'],
    ['Erfolgswert', 'Schätzung: −33 + 0,36 × JÜ + 0,071 × Eigenkapital + 13,9 × Level (anpassbar unter Rahmendaten).'],
  ];
  return `<div class="card"><h3>${t('So funktioniert der Planrechner')}</h3><ol>
    <li>${t('Entscheidungen in den drei Masken eintragen – genau wie in TOPSIM. Geänderte Zeilen werden markiert, gerechnet wird beim Speichern (umstellbar in den Einstellungen).')}</li>
    <li>${t('Großabnehmer und kurzfristiger Kredit sind ausgeblendet, bis TOPSIM sie anbietet. Einblenden unten in der jeweiligen Maske.')}</li>
    <li>${t('Die Absatzprognose schlägt den Planabsatz vor. „Hebel & Optimierer“ sucht die beste Kombination, „Vorschau“ rechnet bis Periode 6.')}</li>
    <li>${t('„Speichern“ übernimmt den Stand ins Szenario. Mehrere Szenarien lassen sich anlegen und vergleichen.')}</li>
    <li>${t('Unter „Berichtswesen“ stehen alle TOPSIM-Berichte, als ZIP mit Einzel-PDFs herunterladbar.')}</li>
    <li>${t('Nach jeder Periode den neuen Sammelbericht unter „Daten & Import“ einfügen. Dann beginnt die nächste Planperiode.')}</li>
    <li>${t('Neue Eingabefelder (z. B. aus neuen TOPSIM-Masken) über „+ Feld“ in jeder Kategorie anlegen.')}</li></ol></div>
    <div class="card"><h3>${t('Spielregeln (Teilnehmerhandbuch)')}</h3>${rules.map(([h, x]) => `<p><b>${esc(t(h))}:</b> ${esc(t(x))}</p>`).join('')}</div>`;
}

// ---------------------------------------------------------------- Felder anlegen
function fieldDialog(cat, field) {
  const dlg = $('#dlg');
  const f = field || { label: '', unit: '', effect: 'fix', kst: 'verwaltung', def: 0, dec: 2, note: '' };
  dlg.innerHTML = `<form method="dialog"><h3 style="margin-top:0">${field ? t('Feld bearbeiten') : t('Neues Eingabefeld')}</h3>
    <label>${t('Bezeichnung')}</label><input class="field" id="fl" value="${esc(f.label)}" required>
    <label>${t('Einheit')}</label><input class="field" id="fu" value="${esc(f.unit)}" placeholder="TEUR, EUR, Stück …">
    <label>${t('Wirkung in der Rechnung')}</label><select class="field" id="fe">${EFFECTS.map(([k, l]) => `<option value="${k}" ${f.effect === k ? 'selected' : ''}>${t(l)}</option>`).join('')}</select>
    <label>${t('Kostenstelle (bei fixen Kosten)')}</label><select class="field" id="fk">${['einkauf', 'fertigung', 'vertrieb', 'verwaltung'].map((k) => `<option ${f.kst === k ? 'selected' : ''}>${k}</option>`).join('')}</select>
    <label>${t('Standardwert')}</label><input class="field" id="fd" value="${esc(nf(f.def, f.dec))}">
    <label>${t('Nachkommastellen')}</label><input class="field" id="fdec" value="${f.dec}">
    <label>${t('Hinweis (optional)')}</label><input class="field" id="fn" value="${esc(f.note || '')}">
    <div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn ghost" value="cancel">${t('Abbrechen')}</button><button class="btn save" value="ok" id="fok">${t('Speichern')}</button></div></form>`;
  dlg.showModal();
  dlg.onclose = () => {
    if (dlg.returnValue !== 'ok') return;
    const nf2 = { id: field?.id || uid(), cat: field?.cat || cat, label: $('#fl', dlg).value.trim() || t('Neues Feld'), unit: $('#fu', dlg).value.trim(),
      effect: $('#fe', dlg).value, kst: $('#fk', dlg).value, def: parseNum($('#fd', dlg).value), dec: Math.max(0, Math.min(4, parseNum($('#fdec', dlg).value))), note: $('#fn', dlg).value.trim() };
    if (field) Object.assign(field, nf2); else store.customFields.push(nf2);
    persist(); render(); toast(t('Feld gespeichert'));
  };
}

// ---------------------------------------------------------------- Werkzeuge: Prognose, Hebel & Optimierer, Vorschau, Plan-Ist
const LEVERS = [
  { k: 'preisOnline', l: 'Preis Online-Markt', u: 'EUR', d: 0 }, { k: 'preisEH', l: 'Preis Einzelhandel', u: 'EUR', d: 0, eh: true },
  { k: 'werbungOnline', l: 'Werbung Online-Markt', u: 'TEUR', d: 0 }, { k: 'werbungEH', l: 'Werbung Einzelhandel', u: 'TEUR', d: 0, eh: true },
  { k: 'kbOnline', l: 'Kundenbetreuer Online', u: 'Pers.', d: 1 }, { k: 'kbEH', l: 'Kundenbetreuer Einzelhandel', u: 'Pers.', d: 1, eh: true },
  { k: 'ci', l: 'Corporate Identity', u: 'TEUR', d: 0 }, { k: 'levelUp', l: 'Zuwachs Produktqualität', u: 'Level', d: 0 },
  { k: 'einkauf', l: 'Einsatzstoffe', u: 'Einh.', d: 0 }, { k: 'fertigung', l: 'Fertigungsmenge', u: 'Stück', d: 0 },
  { k: 'fertigungMA', l: 'Fertigungspersonal', u: 'Pers.', d: 1 }, { k: 'investA', l: 'Neue Anlagen Typ A', u: 'Stück', d: 0 }, { k: 'investB', l: 'Neue Anlagen Typ B', u: 'Stück', d: 0 },
];
function defaultLever(k, d, S, P) {
  const v = Number(d[k]) || 0, cap = S.machines.reduce((a, m) => a + m.cap, 0);
  const r = {
    preisOnline: [v - 10, v + 10, 1], preisEH: [v - 10, v + 10, 1], werbungOnline: [Math.max(0, v - 150), v + 200, 25], werbungEH: [0, v + 140, 20],
    kbOnline: [v, v + 4, 1], kbEH: [v, v + 3, 1], ci: [Math.max(0, v - 100), v + 150, 25], levelUp: [0, P.maxLevelUp, 1],
    einkauf: [0, 100000, 5000], fertigung: [Math.max(0, v - 15000), Math.max(cap + 12000, v), 1000], fertigungMA: [S.staff.fertigung, S.staff.fertigung + 6, 1],
    investA: [0, 2, 1], investB: [0, 2, 1] }[k];
  return { lock: ['levelUp', 'investA', 'investB'].includes(k), min: r[0], max: r[1], step: r[2] };
}
function optSet(p = planPeriod()) {
  const o = (store.opt[p] ||= { levers: {}, cons: { maxDispo: 0, minLager: 0, maxLager: 0, lieferfaehig: false } });
  const d = calcSrc().decisions, S = store.states[p - 1], P = store.params[p];
  for (const L of LEVERS) o.levers[L.k] ||= defaultLever(L.k, d, S, P);
  return o;
}
// Bewertung einer Entscheidung: Planabsatz immer aus der Prognose
function evalDec(d, custom = calcSrc().custom) {
  const p = planPeriod();
  const x = effDec({ ...d, absatzAutoOnline: true, absatzAutoEH: true }, p);
  const R = simulate(store.states[p - 1], store.params[p], x, { fields: store.customFields, values: { ...store.paramCustom[p], ...custom } });
  return { R, x };
}
function score(R, x, cons) {
  let pen = 0;
  if (cons.maxDispo > 0 && R.kpi.dispo > cons.maxDispo) pen += 50 + (R.kpi.dispo - cons.maxDispo) / 10;
  if (cons.maxLager > 0 && R.lagerFE.ende.qty > cons.maxLager) pen += 50 + (R.lagerFE.ende.qty - cons.maxLager) / 100;
  const nach = x.absatzOnline + (x.ehAktiv ? x.absatzEH : 0);
  if (cons.lieferfaehig && R.absatz.online + R.absatz.eh < nach - 0.5) pen += 50 + (nach - R.absatz.online - R.absatz.eh) / 100;
  return R.kpi.erfolgswert - pen;
}
function gridOf(L) { const out = []; const st = Math.max(Number(L.step) || 1, 1e-9); for (let v = Number(L.min); v <= Number(L.max) + 1e-9 && out.length < 400; v += st) out.push(Math.round(v * 1000) / 1000); return out; }
function optimize() {
  const o = optSet(), base = clone(calcSrc().decisions);
  const free = LEVERS.filter((L) => !o.levers[L.k].lock && (!L.eh || base.ehAktiv));
  let best = { ...base };
  for (const L of free) { const g = gridOf(o.levers[L.k]); if (g.length) best[L.k] = g.reduce((a, v) => (Math.abs(v - best[L.k]) < Math.abs(a - best[L.k]) ? v : a), g[0]); }
  let { R, x } = evalDec(best); let bs = score(R, x, o.cons), evals = 1;
  for (let pass = 0; pass < 8; pass++) {
    let improved = false;
    for (const L of free) {
      for (const v of gridOf(o.levers[L.k])) {
        if (v === best[L.k]) continue;
        const cand = { ...best, [L.k]: v }; const e = evalDec(cand); evals++;
        const sc = score(e.R, e.x, o.cons);
        if (sc > bs + 1e-6) { bs = sc; best = cand; improved = true; }
      }
    }
    // Paare, die zusammengehören: Fertigung + Personal, Fertigung + Einsatzstoffe
    for (const [a, b] of [['fertigung', 'fertigungMA'], ['fertigung', 'einkauf']]) {
      if (!free.find((L) => L.k === a) || !free.find((L) => L.k === b)) continue;
      for (const va of gridOf(o.levers[a])) for (const vb of [best[b] - o.levers[b].step, best[b] + o.levers[b].step]) {
        if (vb < o.levers[b].min || vb > o.levers[b].max) continue;
        const cand = { ...best, [a]: va, [b]: vb }; const e = evalDec(cand); evals++;
        const sc = score(e.R, e.x, o.cons);
        if (sc > bs + 1e-6) { bs = sc; best = cand; improved = true; }
      }
    }
    if (!improved) break;
  }
  const e0 = evalDec(base), e1 = evalDec(best);
  return { base, best, R0: e0.R, R1: e1.R, x1: e1.x, evals, ok: score(e1.R, e1.x, o.cons) > e1.R.kpi.erfolgswert - 1, free: free.map((L) => L.k) };
}

function renderPrognose() {
  const p = planPeriod(), s = progSet(p), sc = scen(), d = calcSrc(sc).decisions, S = store.states[p - 1];
  const m = modelFor(p), f = prognose(p, d, S), ctx = progCtx(p, d), own = ctx.own, konk = konkFor(p);
  const shares = f.shares;
  let h = `<div class="card"><h3>${t('Absatzprognose Periode')} ${p} · ${esc(sc.name)}</h3><div class="kpis">
    <div><span>${t('Online-Markt')}</span><b>${nf(f.online, 0)}</b><small>${t('Stück')} · ${nf(f.shareOnline, 1)} % ${t('Marktanteil')}</small></div>
    <div><span>${t('Einzelhandel')}</span><b>${d.ehAktiv ? nf(f.eh, 0) : '–'}</b><small>${d.ehAktiv ? `${t('Stück')} · ${nf(f.shareEH, 1)} % ${t('Anteil')}` : t('nicht aktiv')}</small></div>
    <div><span>${t('Marktvolumen online')}</span><b>${nf(ctx.markt, 0)}</b><small>${t('Stück (alle 6 Firmen)')}</small></div>
    <div><span>${t('Eigene Bekanntheit (geschätzt)')}</span><b>${nf(ctx.ownBek, 1)}</b><small>${t('Index, inkl. CI-Wirkung')}</small></div></div>
    <p class="muted">${t('Planabsatz im Szenario')}: ${nf(effDec(d).absatzOnline, 0)} ${t('online')}${d.ehAktiv ? ` + ${nf(effDec(d).absatzEH, 0)} ${t('Einzelhandel')}` : ''}. ${t('Die Prognose ist ein Modell aus nur wenigen Datenpunkten und ersetzt kein Nachdenken über die Konkurrenz.')}</p></div>`;
  // Konkurrenz
  const cols = [['p', 'Preis', 0], ['L', 'Level', 0], ['W', 'Werbung', 0], ['K', 'KB', 1], ['B', 'Bekanntheit', 1], ['pEH', 'Preis EH', 0], ['WEH', 'Werbung EH', 0], ['KEH', 'KB EH', 1]];
  h += `<div class="card"><h3>${t('Konkurrenz-Annahmen für Periode')} ${p} (${t('Was wäre wenn')})</h3>
    <p class="muted">${t('Vorbelegt mit den Werten aus dem letzten Marktforschungsbericht. Preise bleiben wie zuletzt, das Level steigt im bisherigen Tempo. Jede Zahl ist änderbar, die Prognose rechnet sofort mit.')}</p>
    <div class="row" style="margin-bottom:8px"><button class="btn ghost small" data-tool="kpreis" data-v="-5">${t('Alle Konkurrenzpreise')} −5 €</button><button class="btn ghost small" data-tool="kpreis" data-v="5">+5 €</button>
      <button class="btn ghost small" data-tool="klevel" data-v="1">${t('Alle Konkurrenten Level')} +1</button><button class="btn ghost small" data-tool="kwerb" data-v="50">${t('Werbung aller Konkurrenten')} +50</button>
      <button class="btn ghost small" data-tool="kreset">${t('Auf Fortschreibung zurücksetzen')}</button></div>
    <div class="tbl"><table class="r edit"><thead><tr><th></th>${cols.map((c) => `<th>${t(c[1])}</th>`).join('')}<th>${t('Im EH')}</th><th>${t('Anteil online')}</th><th>${t('Absatz online')}</th></tr></thead><tbody>
    ${konk.map((k, i) => i === own
      ? `<tr class="own"><td>${esc(k.name)} · ${t('ihr')}</td><td>${nf(d.preisOnline, 0)}</td><td>${nf(f.firms[i].L, 0)}</td><td>${nf(d.werbungOnline, 0)}</td><td>${nf(d.kbOnline, 1)}</td><td>${nf(ctx.ownBek, 1)}</td>
          <td>${d.ehAktiv ? nf(d.preisEH, 0) : '–'}</td><td>${d.ehAktiv ? nf(d.werbungEH, 0) : '–'}</td><td>${d.ehAktiv ? nf(d.kbEH, 1) : '–'}</td><td>${d.ehAktiv ? '✓' : '–'}</td><td>${nf(shares[i] * 100, 1)} %</td><td><b>${nf(f.online, 0)}</b></td></tr>`
      : `<tr><td>${esc(k.name)}</td>${cols.map(([c, , dd]) => `<td>${numInput(`kk:${i}:${c}`, k[c], dd, 'class="field cell"')}</td>`).join('')}
          <td><input type="checkbox" data-konkakt="${i}" data-f="ehAktiv" ${k.ehAktiv !== false ? 'checked' : ''}></td><td>${nf(shares[i] * 100, 1)} %</td><td>${nf(ctx.markt * shares[i], 0)}</td></tr>`).join('')}
    </tbody></table></div></div>`;
  // Markt & Modell
  const last = lastFirms(p);
  h += `<div class="grid2"><div class="card"><h3>${t('Markt')}</h3><div class="mask">
    <div class="frow"><label>${t('Basis: potenzieller Absatz aller Firmen')} P${last?.q ?? '–'}</label><span>${nf(last ? last.f.reduce((a, x) => a + x.D, 0) : 240000, 0)} ${t('Stück')}</span><span></span></div>
    <div class="frow"><label>${t('Marktwachstum (%)')}</label>${numInput('ps:wachstum', s.wachstum, 1)}${hint('Veränderung des Gesamtmarkts gegenüber der Vorperiode. Hinweise dazu stehen in den Wirtschaftsnachrichten (z. B. „Markt stagniert“ = 0 %).')}</div>
    <div class="frow"><label>${t('Marktvolumen manuell (Stück, 0 = automatisch)')}</label>${numInput('ps:marktManuell', s.marktManuell, 0)}<span></span></div>
    <div class="frow"><label>${t('Einzelhandel: Größe in % des Online-Markts')}</label>${numInput('ps:ehAnteil', s.ehAnteil, 1)}${hint('Größe des Einzelhandels im Verhältnis zum Online-Markt, laut Wirtschaftsnachrichten der Periode, in der er freigeschaltet wird.')}</div>
    <div class="frow"><label>${t('CI-Wirkung auf Bekanntheit (Punkte je ln-Einheit)')}</label>${numInput('ps:ciKoef', s.ciKoef, 2)}${hint('Wie stark eigene CI-Ausgaben die Bekanntheit verändern. Startwert aus Beobachtungen im Spiel: 25 statt 150 TEUR CI kosteten etwa 9 Punkte.')}</div></div></div>
    <div class="card"><h3>${t('Modell')}</h3><div class="seg" style="margin-bottom:8px"><button data-tool="mauto" data-v="1" class="${s.auto ? 'on' : ''}">${t('Automatisch kalibriert')}</button><button data-tool="mauto" data-v="0" class="${!s.auto ? 'on' : ''}">${t('Eigene Werte')}</button></div>
    <div class="tbl"><table class="r"><thead><tr><th></th><th>${t('Handbuch')}</th><th>${t('verwendet')}</th></tr></thead><tbody>
    ${[['ep', 'Preiselastizität', 2], ['q', 'Qualitätsaufschlag je Level (EUR)', 2], ['ew', 'Werbewirkung', 3], ['ek', 'Wirkung Kundenbetreuer', 3], ['eb', 'Wirkung Bekanntheit', 3]].map(([k, l, dd]) =>
      `<tr><td>${t(l)}</td><td>${nf(PRIOR[k], dd)}</td><td>${s.auto ? nf(m.coef[k], dd) : numInput('ps:coef.' + k, s.coef[k], dd, 'class="field cell"')}</td></tr>`).join('')}</tbody></table></div>
    ${s.auto ? `<p class="muted">${t('Kalibriert an')} ${m.n} ${t('Datenpunkten (Marktforschung aller Firmen). Mittlere Abweichung')} ${nf(m.mape ?? 0, 1)} %. ${t('Nach jedem Berichtsimport lernt das Modell automatisch nach.')}</p>
      <div class="frow"><label>${t('Bindung an die Handbuchwerte')}</label>${numInput('ps:lambda', s.lambda, 2)}${hint('0 = nur die Daten zählen, 1 = stark an den Handbuchwerten. Mit wenigen Perioden ist 0,3 ein guter Kompromiss.')}</div>` : ''}
    </div></div>`;
  return h;
}

function renderOptimierer() {
  const p = planPeriod(), o = optSet(p), d = calcSrc().decisions, base = evalDec(d);
  // Hebel-Analyse
  let h = `<div class="card"><h3>${t('Hebel-Analyse')}</h3><p class="muted">${t('Was bringt ein Schritt nach oben oder unten, wenn alles andere gleich bleibt? Der Absatz kommt dabei immer aus der Prognose. Basis: Szenario')} „${esc(scen().name)}“, ${t('Erfolgswert')} ≈ ${nf(base.R.kpi.erfolgswert, 1)}.</p>
    <div class="tbl"><table class="r"><thead><tr><th>${t('Hebel')}</th><th>${t('aktuell')}</th><th>${t('Schritt')}</th><th>Δ ${t('Absatz')} −</th><th>Δ JÜ −</th><th>Δ EW −</th><th>Δ ${t('Absatz')} +</th><th>Δ JÜ +</th><th>Δ EW +</th><th style="min-width:120px">EW</th></tr></thead><tbody>`;
  const rows = [];
  for (const L of LEVERS) {
    if (L.eh && !d.ehAktiv) continue;
    const st = Number(o.levers[L.k].step) || 1, v = Number(d[L.k]) || 0;
    const eff = (nv) => { if (nv < 0) return null; const e = evalDec({ ...d, [L.k]: nv }); return { a: e.R.absatz.sold - base.R.absatz.sold, j: e.R.kpi.ju - base.R.kpi.ju, e: e.R.kpi.erfolgswert - base.R.kpi.erfolgswert }; };
    rows.push({ L, v, st, m: eff(v - st), pl: eff(v + st) });
  }
  const mx = Math.max(1, ...rows.flatMap((r) => [Math.abs(r.m?.e || 0), Math.abs(r.pl?.e || 0)]));
  const c = (x, dd) => (x === undefined || x === null ? '–' : `<span class="${x > 0.005 ? 'pos' : x < -0.005 ? 'negv' : ''}">${x > 0 ? '+' : ''}${nf(x, dd)}</span>`);
  for (const r of rows) {
    const bar = (x) => `<span class="hbar ${x >= 0 ? 'p' : 'n'}" style="width:${Math.abs(x) / mx * 50}%"></span>`;
    h += `<tr><td>${t(r.L.l)}</td><td>${nf(r.v, r.L.d)} ${r.L.u}</td><td>± ${nf(r.st, r.L.d)}</td><td>${c(r.m?.a, 0)}</td><td>${c(r.m?.j, 2)}</td><td>${c(r.m?.e, 1)}</td>
      <td>${c(r.pl?.a, 0)}</td><td>${c(r.pl?.j, 2)}</td><td>${c(r.pl?.e, 1)}</td><td class="bars"><span class="half l">${r.m ? bar(r.m.e) : ''}</span><span class="half r">${r.pl ? bar(r.pl.e) : ''}</span></td></tr>`;
  }
  h += `</tbody></table></div><p class="foot">${t('Linker Balken: Schritt nach unten, rechter Balken: Schritt nach oben. Grün = Erfolgswert steigt.')}</p></div>`;
  // Optimierer
  h += `<div class="card"><h3>${t('Platz-1-Optimierer')} · ${t('Periode')} ${p}</h3>
    <p class="muted">${t('Sucht die Kombination mit dem höchsten geschätzten Erfolgswert. Gesperrte Hebel bleiben auf dem Wert aus dem Szenario. Bereiche und Schrittweiten gelten für diese Periode und lassen sich jederzeit ändern. Ein Minimum unter dem aktuellen Personal bedeutet Entlassungen.')}</p>
    <div class="tbl"><table class="r edit"><thead><tr><th>${t('Hebel')}</th><th>${t('frei')}</th><th>${t('aktuell')}</th><th>${t('Min')}</th><th>${t('Max')}</th><th>${t('Schritt')}</th></tr></thead><tbody>
    ${LEVERS.map((L) => { const c2 = o.levers[L.k]; const na = L.eh && !d.ehAktiv;
      return `<tr class="${c2.lock || na ? 'locked' : ''}"><td>${c2.lock ? '🔒 ' : '🔓 '}${t(L.l)} <span class="muted">(${L.u})</span></td><td><input type="checkbox" data-lock="${L.k}" ${!c2.lock ? 'checked' : ''} ${na ? 'disabled' : ''}></td><td>${nf(d[L.k] || 0, L.d)}</td>
        ${['min', 'max', 'step'].map((f) => `<td>${numInput(`ol:${L.k}:${f}`, c2[f], L.d, 'class="field cell"')}</td>`).join('')}</tr>`; }).join('')}
    </tbody></table></div>
    <h4>${t('Grenzen')} <span class="muted">(${t('0 = keine Grenze')})</span></h4><div class="mask">
    <div class="frow"><label>${t('Überziehungskredit höchstens (TEUR)')}</label>${numInput('oc:maxDispo', o.cons.maxDispo, 0)}<span></span></div>
    <div class="frow"><label>${t('Lager Fertigerzeugnisse am Periodenende höchstens (Stück)')}</label>${numInput('oc:maxLager', o.cons.maxLager, 0)}<span></span></div>
    <div class="frow"><label>${t('Prognose muss voll lieferbar sein')}</label><span><input type="checkbox" data-tool-check="lieferfaehig" ${o.cons.lieferfaehig ? 'checked' : ''}></span><span></span></div></div>
    <div class="row" style="margin-top:10px"><button class="btn save" data-tool="optrun">${t('Optimieren')}</button><button class="btn ghost small" data-tool="optreset">${t('Bereiche neu aus dem Szenario vorbelegen')}</button></div>
    <div id="optres">${ui.optResult ? optResultHtml(ui.optResult) : ''}</div></div>`;
  return h;
}
function optResultHtml(r) {
  const ch = LEVERS.filter((L) => r.best[L.k] !== r.base[L.k]);
  const k = (R) => [R.kpi.erfolgswert, R.kpi.ju, R.absatz.sold, R.kpi.dispo, R.lagerFE.ende.qty, R.kpi.ek];
  const a = k(r.R0), b = k(r.R1), lab = [['Erfolgswert ≈', 1], ['JÜ (TEUR)', 2], ['Absatz (Stück)', 0], ['Überziehung (TEUR)', 2], ['Lager Ende (Stück)', 0], ['Eigenkapital (TEUR)', 2]];
  return `<div class="note">${t('Geprüfte Kombinationen')}: ${nf(r.evals, 0)}.${r.ok ? '' : ' ⚠ ' + t('Nicht alle Grenzen ließen sich einhalten.')}</div>
    <div class="grid2"><div class="tbl"><table class="r"><thead><tr><th>${t('Hebel')}</th><th>${t('aktuell')}</th><th>${t('Vorschlag')}</th></tr></thead><tbody>
    ${ch.length ? ch.map((L) => `<tr><td>${t(L.l)}</td><td>${nf(r.base[L.k] || 0, L.d)}</td><td><b>${nf(r.best[L.k], L.d)}</b></td></tr>`).join('') : `<tr><td colspan="3">${t('Keine bessere Kombination gefunden.')}</td></tr>`}
    <tr><td>${t('Planabsatz online (Prognose)')}</td><td>–</td><td>${nf(r.x1.absatzOnline, 0)}</td></tr>${r.x1.ehAktiv ? `<tr><td>${t('Planabsatz Einzelhandel (Prognose)')}</td><td>–</td><td>${nf(r.x1.absatzEH, 0)}</td></tr>` : ''}</tbody></table></div>
    <div class="tbl"><table class="r"><thead><tr><th></th><th>${t('aktuell')}</th><th>${t('Vorschlag')}</th><th>Δ</th></tr></thead><tbody>
    ${lab.map(([l, dd], i) => `<tr><td>${t(l)}</td><td>${nf(a[i], dd)}</td><td><b>${nf(b[i], dd)}</b></td><td>${b[i] - a[i] > 0 ? '+' : ''}${nf(b[i] - a[i], dd)}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="row" style="margin-top:10px"><button class="btn save" data-tool="optapply">${t('Als neues Szenario speichern')}</button></div>`;
}

function vorschauParams(P, k) {
  const f = (1 + (store.vorschauInfl ?? 3) / 100) ** k, x = clone(P);
  for (const g in x.gehalt) x.gehalt[g] = Math.round(x.gehalt[g] * f * 10) / 10;
  x.matStaffel = x.matStaffel.map(([a, pr]) => [a, Math.round(pr * f)]); x.jitPreis = Math.round(x.jitPreis * f);
  return x;
}
const VS_KEYS = ['preisOnline', 'preisEH', 'werbungOnline', 'werbungEH', 'kbOnline', 'kbEH', 'ci', 'levelUp', 'einkauf', 'fertigung', 'fertigungMA', 'investA', 'investB'];
function vorschauRun(sc = scen()) {
  const p = planPeriod(), last = 6, out = [];
  let S = store.states[p - 1], prev = calcSrc(sc).decisions;
  sc.vorschau ||= {};
  for (let k = p; k <= Math.max(p, last); k++) {
    const ahead = k - p;
    let d, P;
    if (k === p) { d = prev; P = store.params[p]; }
    else { d = { ...prev, levelUp: 0, investA: 0, investB: 0, desinvest: [], absatzAutoOnline: true, absatzAutoEH: true, _prevCI: prev.ci, ...(sc.vorschau[k] || {}) }; P = vorschauParams(store.params[p], ahead); }
    const x = effDec(d, k, S, ahead);
    const R = simulate(S, P, x, { fields: store.customFields, values: { ...store.paramCustom[p], ...(k === p ? calcSrc(sc).custom : {}) } });
    out.push({ k, d, x, R });
    S = R.endState; prev = d;
  }
  return out;
}
function renderVorschau() {
  const sc = scen(), runs = vorschauRun(sc), p = planPeriod();
  const lab = { preisOnline: 'Preis Online (EUR)', preisEH: 'Preis Einzelhandel (EUR)', werbungOnline: 'Werbung Online (TEUR)', werbungEH: 'Werbung EH (TEUR)', kbOnline: 'Kundenbetreuer Online',
    kbEH: 'Kundenbetreuer EH', ci: 'Corporate Identity (TEUR)', levelUp: 'Level-Zuwachs', einkauf: 'Einsatzstoffe (Einh.)', fertigung: 'Fertigungsmenge (Stück)', fertigungMA: 'Fertigungspersonal', investA: 'Neue Anlagen A', investB: 'Neue Anlagen B' };
  const dec = { preisOnline: 0, preisEH: 0, werbungOnline: 0, werbungEH: 0, kbOnline: 1, kbEH: 1, ci: 0, levelUp: 0, einkauf: 0, fertigung: 0, fertigungMA: 1, investA: 0, investB: 0 };
  let h = `<div class="note">${t('Rollierende Vorschau bis zum Spielende (Periode 6). Periode')} ${p} ${t('kommt aus dem Szenario')} „${esc(sc.name)}“. ${t('Spätere Perioden schreiben die Entscheidungen fort; jede Zelle ist änderbar (fett = selbst geändert). Absatz kommt aus der Prognose, Konkurrenten steigen +1 Level je Periode. Gehälter und Einkaufspreise steigen um die Inflation.')}</div>
    <div class="row" style="margin-bottom:8px"><span class="muted">${t('Inflation je Periode (%)')}</span> ${numInput('vs:infl', store.vorschauInfl ?? 3, 1, 'class="field" style="width:80px"')}
    <button class="btn ghost small" data-tool="vsreset">${t('Alle Änderungen der Vorschau zurücksetzen')}</button></div>
    <div class="tbl"><table class="r edit"><thead><tr><th></th>${runs.map((r) => `<th>P${r.k}${r.k === p ? ' (' + t('Plan') + ')' : ''}</th>`).join('')}</tr></thead><tbody>
    <tr class="sec"><td colspan="${runs.length + 1}">${t('Entscheidungen')}</td></tr>`;
  for (const key of VS_KEYS) {
    if ((key === 'preisEH' || key === 'werbungEH' || key === 'kbEH') && !runs[0].d.ehAktiv) continue;
    h += `<tr><td>${t(lab[key])}</td>${runs.map((r) => r.k === p ? `<td>${nf(r.d[key] || 0, dec[key])}</td>`
      : `<td>${numInput(`vs:${r.k}:${key}`, r.d[key] || 0, dec[key], `class="field cell ${sc.vorschau?.[r.k]?.[key] !== undefined ? 'own' : ''}"`)}</td>`).join('')}</tr>`;
  }
  const res = [['Absatz (Prognose, geliefert)', (r) => r.R.absatz.sold, 0], ['Umsatz (TEUR)', (r) => r.R.kpi.umsatz, 0], ['Jahresüberschuss (TEUR)', (r) => r.R.kpi.ju, 2],
    ['Eigenkapital (TEUR)', (r) => r.R.kpi.ek, 0], ['Überziehungskredit (TEUR)', (r) => r.R.kpi.dispo, 0], ['Lager Fertigerzeugnisse (Stück)', (r) => r.R.lagerFE.ende.qty, 0],
    ['Produktqualität (Level)', (r) => r.R.level.cur, 0], ['Erfolgswert ≈', (r) => r.R.kpi.erfolgswert, 1]];
  h += `<tr class="sec"><td colspan="${runs.length + 1}">${t('Ergebnisse')}</td></tr>`;
  for (const [l, fn, dd] of res) h += `<tr class="${l.startsWith('Erfolg') ? 'b' : ''}"><td>${t(l)}</td>${runs.map((r) => `<td>${nf(fn(r), dd)}</td>`).join('')}</tr>`;
  h += `</tbody></table></div>`;
  const warn = runs.filter((r) => r.R.warnings.length).map((r) => `P${r.k}: ${r.R.warnings.map((w) => esc(t(w))).join(' · ')}`);
  if (warn.length) h += `<div class="note">⚠ ${warn.join('<br>⚠ ')}</div>`;
  h += `<p class="muted">${t('Summe Jahresüberschuss')} P${p}–P${runs[runs.length - 1].k}: <b>${nf(runs.reduce((a, r) => a + r.R.kpi.ju, 0))} T€</b> · ${t('Erfolgswert am Spielende')} ≈ <b>${nf(runs[runs.length - 1].R.kpi.erfolgswert, 1)}</b></p>`;
  return h;
}

function renderPlanIst() {
  const closed = Object.keys(store.history).map(Number).filter((p) => p >= 1).sort((a, b) => a - b), own = ownIdx();
  const lam = progSet().lambda;
  let h = `<div class="note">${t('Vergleich eurer Planwerte mit dem tatsächlichen Ergebnis. Das Prognosemodell wird hier fair geprüft: Für jede Periode wird es ohne die Daten dieser Periode kalibriert und mit den echten Werten der Konkurrenz gerechnet. Nach jedem Berichtsimport kommt eine Periode dazu und das Modell lernt nach.')}</div>
    <div class="tbl"><table class="r"><thead><tr><th></th>${closed.map((p) => `<th>P${p}</th>`).join('')}</tr></thead><tbody>`;
  const rows = closed.map((p) => {
    const dh = store.decHist[p] || {}, his = store.history[p] || {};
    const planAbs = (Number(dh.absatzOnline) || 0) + (dh.ehAktiv ? Number(dh.absatzEH) || 0 : 0);
    const firms = firmsFromMarkt(store.markt[p]);
    let model = null, pot = null;
    if (firms?.length === 6) {
      const obs = obsAll(p - 1).filter((o) => o.period !== p);
      const c = calibrate(obs, lam).coef; const M = firms.reduce((a, f) => a + f.D, 0);
      const fc = forecast(c, { own, konk: firms, markt: M, ehAnteil: 0, ownBek: firms[own].B }, { preisOnline: firms[own].p, werbungOnline: firms[own].W, kbOnline: firms[own].K }, firms[own].L);
      model = fc.online; pot = firms[own].D;
    }
    let planJu = null;
    const inp = store.istInputs[p];
    if (inp && store.states[p - 1] && dh.preisOnline) planJu = simulate(store.states[p - 1], inp.P, { ...inp.D, absatzOnline: dh.absatzOnline, absatzEH: dh.absatzEH || 0 }).kpi.ju;
    const E = (store.params[planPeriod()] || DEF.baseParams()).erfolgswert;
    const ewSchatz = his.ju !== undefined ? E.a + E.ju * his.ju + E.ek * (his.ek || 0) + E.level * (his.level || 0) : null;
    return { p, planAbs, ist: his.absatz, pot, model, planJu, ju: his.ju, ew: his.erfolgswert, ewSchatz };
  });
  const pct = (a, b) => (a && b ? `${nf((a / b - 1) * 100, 1)} %` : '–');
  const line = (l, fn, dd, cls = '') => `<tr class="${cls}"><td>${t(l)}</td>${rows.map((r) => { const v = fn(r); return `<td>${v === null || v === undefined ? '–' : typeof v === 'string' ? v : nf(v, dd)}</td>`; }).join('')}</tr>`;
  h += `<tr class="sec"><td colspan="${rows.length + 1}">${t('Absatz')}</td></tr>`
    + line('Euer Planabsatz (Stück)', (r) => r.planAbs, 0) + line('Tatsächlicher Absatz (Stück)', (r) => r.ist, 0) + line('Potenzieller Absatz laut Marktforschung', (r) => r.pot, 0)
    + line('Abweichung Plan zu Nachfrage', (r) => pct(r.planAbs, r.pot), 0, 'b')
    + line('Modellprognose (ohne diese Periode kalibriert)', (r) => r.model, 0) + line('Abweichung Modell zu Nachfrage', (r) => pct(r.model, r.pot), 0, 'b')
    + `<tr class="sec"><td colspan="${rows.length + 1}">${t('Ergebnis')}</td></tr>`
    + line('Plan-JÜ mit eurem Planabsatz (TEUR)', (r) => r.planJu, 2) + line('Tatsächlicher JÜ (TEUR)', (r) => r.ju, 2) + line('Abweichung JÜ (TEUR)', (r) => (r.planJu !== null && r.ju !== undefined ? r.ju - r.planJu : null), 2, 'b')
    + line('Erfolgswert laut TOPSIM', (r) => r.ew, 2) + line('Erfolgswert laut Schätzformel', (r) => r.ewSchatz, 2);
  h += `</tbody></table></div>`;
  // Modellgüte über alle Firmen
  const loo = looCheck(obsAll(), lam).filter((x) => x.rows.some((r) => Math.abs(r.modell - r.ist) > 0.5));
  if (loo.length) {
    h += `<div class="card"><h3>${t('Modellgüte über alle sechs Unternehmen')}</h3><div class="tbl"><table class="r"><thead><tr><th></th>${loo[0].rows.map((r) => `<th>${esc(r.name)}</th>`).join('')}<th>Ø ${t('Abw.')}</th></tr></thead><tbody>
      ${loo.map((x) => `<tr><td>P${x.period} ${t('Nachfrage')}</td>${x.rows.map((r) => `<td>${nf(r.ist, 0)}</td>`).join('')}<td></td></tr>
        <tr><td>P${x.period} ${t('Modell')}</td>${x.rows.map((r) => `<td>${nf(r.modell, 0)}</td>`).join('')}<td>${nf(x.rows.reduce((a, r) => a + Math.abs(r.modell / r.ist - 1), 0) / x.rows.length * 100, 1)} %</td></tr>`).join('')}
      </tbody></table></div><p class="foot">${t('Je mehr Perioden importiert sind, desto genauer wird das Modell. Mit zwei Perioden ist eine Abweichung um 15 % normal.')}</p></div>`;
  }
  return h;
}

function toolInput(k, v, el) {
  const p = planPeriod(), parts = k.split(':');
  if (parts[0] === 'kk') konkFor(p)[Number(parts[1])][parts[2]] = v;
  else if (parts[0] === 'ps') setPath(progSet(p), parts[1], v);
  else if (parts[0] === 'ol') optSet(p).levers[parts[1]][parts[2]] = v;
  else if (parts[0] === 'oc') optSet(p).cons[parts[1]] = v;
  else if (parts[0] === 'vs') { if (parts[1] === 'infl') store.vorschauInfl = v; else { const sc = scen(); sc.vorschau ||= {}; (sc.vorschau[parts[1]] ||= {})[parts[2]] = v; } }
  persist();
}
const TOOL_KEY = /^(kk|ps|ol|oc|vs):/;
async function toolClick(ds, el) {
  const p = planPeriod();
  switch (ds.tool) {
    case 'kpreis': konkFor(p).forEach((k, i) => { if (i !== ownIdx()) { k.p += Number(ds.v); k.pEH = (k.pEH ?? k.p) + Number(ds.v); } }); break;
    case 'klevel': konkFor(p).forEach((k, i) => { if (i !== ownIdx()) { k.L = Math.min(13, k.L + 1); } }); break;
    case 'kwerb': konkFor(p).forEach((k, i) => { if (i !== ownIdx()) k.W += Number(ds.v); }); break;
    case 'kreset': store.konk[p] = defaultKonk(p); break;
    case 'mauto': { const s = progSet(p); s.auto = ds.v === '1'; if (!s.auto) s.coef = { ...modelFor(p).coef }; calCache.clear(); break; }
    case 'optreset': delete store.opt[p]; ui.optResult = null; break;
    case 'optrun': el.disabled = true; el.textContent = t('rechnet …'); await new Promise((r) => setTimeout(r, 30)); ui.optResult = optimize(); break;
    case 'optapply': { const r = ui.optResult; if (!r) break; const src = clone(calcSrc()); src.decisions = { ...r.best, absatzAutoOnline: true, absatzAutoEH: true };
      const n = { id: uid(), name: `${t('Optimiert')} ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`, team: false, saved: src, draft: clone(src) };
      store.scenarios[p].push(n); store.active[p] = n.id; ui.optResult = null; toast(t('Neues Szenario angelegt')); break; }
    case 'vsreset': scen().vorschau = {}; break;
    case 'welcomeoff': store.welcome = false; break;
    case 'spick': { const sc = scen(); spickzettelPdf(spickData(sc), { firma: store.firma, unternehmen: store.unternehmen, period: p, scenario: sc.name, saved: !dirty(sc) }); return; }
    default: return;
  }
  persist(); render();
}
document.addEventListener('change', (e) => { const el = e.target; if (el.dataset?.toolCheck) { optSet().cons[el.dataset.toolCheck] = el.checked; persist(); } });

// Eingabe-Spickzettel: alle Werte in der Reihenfolge der TOPSIM-Masken
function spickData(sc) {
  const d = sc.saved.decisions, p = planPeriod(), mod = modOf(p), S = store.states[p - 1];
  return Object.entries(MASKS).map(([id, M]) => ({ title: M.title, sections: M.sections.filter((s) => !s.module || mod[s.module].aktiv).map((s) => {
    let rows = [];
    if (s.special === 'desinvest') rows = S.machines.map((m) => [`Typ ${m.typ} Anlage Nr. ${m.nr}`, (d.desinvest || []).includes(m.nr) ? 'JA – desinvestieren' : 'nein']);
    else for (const f of s.fields) {
      if (f.pp || f.p) continue;
      if (s.two) { rows.push([`${f.l} – ${s.two[0]}`, nf(d[f.k[0]] || 0, f.d)]); if (!(f.k[1] === 'kbEH' && !d.ehAktiv)) rows.push([`${f.l} – ${s.two[1]}`, nf(d[f.k[1]] || 0, f.d)]); continue; }
      if (f.eh && !d.ehAktiv) continue;
      let v;
      if (f.type === 'check') v = d[f.k] ? 'ja (Haken setzen)' : 'nein';
      else if (f.type === 'select') v = f.opts.find(([x]) => x === Number(d[f.k]))?.[1] ?? '-';
      else if (f.auto) v = nf(effDec(d)[f.k] || 0, f.d);
      else v = nf(d[f.k] || 0, f.d);
      rows.push([f.l, v]);
    }
    for (const cf of store.customFields.filter((x) => x.cat === s.id)) rows.push([`${cf.label}${cf.unit ? ' (' + cf.unit + ')' : ''}`, nf(sc.saved.custom[cf.id] ?? cf.def ?? 0, cf.dec ?? 2)]);
    return { h: s.h, rows };
  }).filter((s) => s.rows.length) }));
}

// ---------------------------------------------------------------- Szenario anlegen / umbenennen
function scenarioDialog(mode, sc) {
  const dlg = $('#dlg'), p = planPeriod(), list = store.scenarios[p];
  const team = list.find((s) => s.team);
  const bases = [['cur', `${t('Kopie des aktuellen Stands')} („${scen().name}“)`], ...(team && team.id !== scen().id ? [['team', `${t('Kopie des ★ Team-Vorschlags')} („${team.name}“)`]] : []),
    ['prev', `${t('Entscheidungen der Vorperiode')} (P${p - 1})`]];
  dlg.innerHTML = `<form method="dialog"><h3 style="margin-top:0">${mode === 'new' ? t('Neues Szenario') : t('Szenario umbenennen')}</h3>
    <label>${t('Name')}</label><input class="field" id="scn" value="${esc(mode === 'new' ? `${t('Szenario')} ${list.length + 1}` : sc.name)}" required>
    ${mode === 'new' ? `<label>${t('Ausgangspunkt')}</label>${bases.map(([k, l], i) => `<label class="radio"><input type="radio" name="scb" value="${k}" ${i === 0 ? 'checked' : ''}> ${esc(l)}</label>`).join('')}` : ''}
    <div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn ghost" value="cancel">${t('Abbrechen')}</button><button class="btn save" value="ok">${mode === 'new' ? t('Anlegen') : t('Speichern')}</button></div></form>`;
  dlg.showModal(); setTimeout(() => $('#scn', dlg).select(), 0);
  dlg.onclose = () => {
    if (dlg.returnValue !== 'ok') return;
    const name = $('#scn', dlg).value.trim() || t('Szenario');
    if (mode === 'rename') { sc.name = name; persist(); render(); return; }
    const b = $('input[name=scb]:checked', dlg)?.value || 'cur';
    let src;
    if (b === 'cur') src = clone(scen().draft);
    else if (b === 'team') src = clone(team.saved);
    else src = { decisions: { ...DEF.emptyDecisions(), ...clone(store.decHist[p - 1] || {}), desinvest: [], levelUp: 0, absatzAutoOnline: true, absatzAutoEH: true }, custom: {} };
    const n = { id: uid(), name, team: false, saved: src, draft: clone(src) };
    list.push(n); store.active[p] = n.id; ui.delta = null; persist(); render(); toast(t('Szenario angelegt'));
  };
}

// ---------------------------------------------------------------- Rendern
function render() {
  document.documentElement.dataset.theme = store.theme;
  document.documentElement.lang = getLang() === 'bar' ? 'de-BY' : 'de';
  $('#brand-name').textContent = store.firma;
  $('#brand-sub').textContent = `${store.unternehmen} · TOPSIM Management Essentials · ${t('Planperiode')} ${planPeriod()}`;
  renderSide();
  const R = runPlan();
  renderBar(R);
  const c = $('#content');
  const r = ui.route;
  if (MASKS[r]) c.innerHTML = renderMask(r);
  else if (r === 'parameter') c.innerHTML = renderParams();
  else if (r === 'kpi') c.innerHTML = renderKpi();
  else if (r === 'berichte') c.innerHTML = renderBerichte();
  else if (r === 'szenarien') c.innerHTML = renderSzenarien();
  else if (r === 'prognose') c.innerHTML = renderPrognose();
  else if (r === 'optimierer') c.innerHTML = renderOptimierer();
  else if (r === 'vorschau') c.innerHTML = renderVorschau();
  else if (r === 'planist') c.innerHTML = renderPlanIst();
  else if (r === 'daten') c.innerHTML = renderDaten();
  else if (r.startsWith('state:')) c.innerHTML = renderStateEditor(Number(r.slice(6)));
  else if (r === 'einstellungen') c.innerHTML = renderSettings();
  else if (r === 'hilfe') c.innerHTML = renderHilfe();
  $('#side').classList.toggle('open', ui.menu);
}
let tmr;
function live() { clearTimeout(tmr); tmr = setTimeout(() => { persist(); renderBar(runPlan()); renderSide(); refreshHints(); if (ui.route === 'kpi' || ui.route === 'szenarien') render(); }, 120); }
function toast(msg) { const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg; document.body.appendChild(el); setTimeout(() => el.remove(), 2200); }

// ---------------------------------------------------------------- Eingaben
document.addEventListener('input', (e) => {
  const el = e.target, k = el.dataset.k;
  if (!k) return;
  const p = planPeriod();
  const v = el.type === 'checkbox' ? el.checked : el.tagName === 'SELECT' ? Number(el.value) : parseNum(el.value);
  if (k.startsWith('p:')) setPath(store.params[p], k.slice(2), v);
  else if (k.startsWith('pc:')) store.paramCustom[p][k.slice(3)] = v;
  else if (k.startsWith('c:')) scen().draft.custom[k.slice(2)] = v;
  else if (k.startsWith('st:')) { const [, i, j] = k.split(':'); store.params[p].matStaffel[i][j] = v; store.params[p].matStaffel.sort((a, b) => a[0] - b[0]); }
  else if (k.startsWith('et:')) store.params[p].einkaufTab[k.slice(3)][1] = v;
  else if (k.startsWith('vt:')) store.params[p].verwaltungTab[k.slice(3)][1] = v;
  else if (k.startsWith('an:')) { const [, typ, f] = k.split(':'); store.params[p].anlagen[typ][f] = v; }
  else if (k.startsWith('qk:')) store.params[p].qualKosten[k.slice(3)] = v;
  else if (k.startsWith('s:')) { const st = store.states[Number(ui.route.slice(6))]; setPath(st, k.slice(2), v); if (k === 's:staff.kbOnline' || k === 's:staff.kbEH') st.staff.kb = st.staff.kbOnline + st.staff.kbEH; }
  else if (k.startsWith('m:')) setPath(modOf(p), k.slice(2), v);
  else if (k.startsWith('kk:') || k.startsWith('ps:') || k.startsWith('ol:') || k.startsWith('oc:') || k.startsWith('vs:')) { toolInput(k, v, el); return; }
  else {
    D()[k] = v;
    if (k === 'absatzOnline') D().absatzAutoOnline = false;
    if (k === 'absatzEH') D().absatzAutoEH = false;
    if (k === 'ehAktiv') { persist(); render(); return; }
  }
  afterInput(el);
});
// Ampel und Prognose-Vorschläge rechnen immer mit dem aktuellen Eingabestand (auch vor dem Speichern)
function ampelHtml() {
  const sc = scen(), x = effDec(sc.draft.decisions), a = ampel(simWith({ decisions: sc.draft.decisions, custom: sc.draft.custom }), x);
  return `<div class="ampel ${a.c}"><span class="dot"></span>${esc(t(a.txt))}${dirty(sc) && store.calcMode !== 'live' ? ` <span class="muted">(${t('mit den noch nicht gespeicherten Werten')})</span>` : ''}</div>`;
}
function refreshHints() {
  const box = document.querySelector('.ampel');
  if (box) box.outerHTML = ampelHtml();
  const d = D(), fc = prognose(planPeriod(), d, store.states[planPeriod() - 1]);
  for (const [k, auto, v] of [['absatzOnline', 'absatzAutoOnline', fc.online], ['absatzEH', 'absatzAutoEH', fc.eh]]) {
    const inp = document.querySelector(`[data-k="${k}"]`);
    if (!inp || document.activeElement === inp) continue;
    if (d[auto]) inp.value = nf(v, 0);
    else { const b = inp.parentElement?.querySelector('[data-autoon]'); if (b) b.textContent = `↺ ${t('Prognose')} ${nf(v, 0)}`; }
  }
}
function afterInput(el) {
  el?.closest?.('.frow, tr')?.classList.add('changed');
  el?.classList?.remove('isauto'); el?.parentElement?.querySelector?.('.autotag')?.remove();
  if (store.calcMode === 'live') { live(); return; }
  persist(); renderSide(); renderBar(runPlan()); refreshHints();
}
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.des) { const d = D(); const n = Number(el.dataset.des); d.desinvest = el.checked ? [...new Set([...(d.desinvest || []), n])] : (d.desinvest || []).filter((x) => x !== n); afterInput(el); }
  if (el.dataset.lock !== undefined) { optSet().levers[el.dataset.lock].lock = !el.checked; persist(); render(); }
  if (el.dataset.konkakt !== undefined) { konkFor()[el.dataset.konkakt][el.dataset.f] = el.checked; persist(); render(); }
  if (el.dataset.calcmode) { store.calcMode = el.value; persist(); render(); }
  if (el.dataset.k && el.type === 'text') el.value = nf(parseNum(el.value), Number(el.dataset.d));
  if (el.dataset.k && TOOL_KEY.test(el.dataset.k) && !/^(ol|oc):/.test(el.dataset.k)) { const y = window.scrollY; render(); window.scrollTo(0, y); }
  if (el.id === 'firma') { store.firma = el.value || 'TONWERK'; persist(); render(); }
  if (el.id === 'untern') { store.unternehmen = el.value; persist(); render(); }
  if (el.id === 'files') readFiles(el.files);
  if (el.id === 'imp') importBackup(el.files[0]);
});
document.addEventListener('focusin', (e) => { if (e.target.dataset?.k && e.target.type === 'text') setTimeout(() => e.target.select(), 0); });

document.addEventListener('click', async (e) => {
  if (ui.scOpen && !e.target.closest('.scdd')) { ui.scOpen = false; renderSide(); }
  const el = e.target.closest('button, a, [data-route]');
  if (!el) return;
  const ds = el.dataset, p = planPeriod();
  if (ds.scpick) { store.active[p] = ds.scpick; ui.scOpen = false; ui.delta = null; persist(); render(); return; }
  if (ds.scteam) { store.scenarios[p].forEach((s) => (s.team = s.id === ds.scteam)); persist(); render(); return; }
  if (ds.scren) { scenarioDialog('rename', store.scenarios[p].find((s) => s.id === ds.scren)); return; }
  if (ds.scdel) { const sc = store.scenarios[p].find((s) => s.id === ds.scdel);
    if (store.scenarios[p].length > 1 && confirm(`${t('Szenario löschen?')}\n„${sc.name}“`)) { store.scenarios[p] = store.scenarios[p].filter((s) => s.id !== sc.id);
      if (!store.scenarios[p].some((s) => s.team)) store.scenarios[p][0].team = true;
      if (store.active[p] === sc.id) store.active[p] = store.scenarios[p][0].id; persist(); render(); } return; }
  if (ds.autoon) { D()[ds.autoon] = true; afterInput(); render(); return; }
  if (ds.modon) { modOf(p)[ds.modon].aktiv = true; persist(); render(); return; }
  if (ds.modoff) { modOf(p)[ds.modoff].aktiv = false; persist(); render(); return; }
  if (ds.tool) { await toolClick(ds, el); return; }
  if (ds.route) { ui.route = ds.route; ui.menu = false; if (ds.route === 'berichte') ui.repPeriod ??= p; render(); window.scrollTo(0, 0); return; }
  if (ds.per !== undefined) { const n = Number(ds.per); if (ui.route === 'berichte') ui.repPeriod = n; else if (n !== p) { ui.route = 'berichte'; ui.repPeriod = n; } render(); return; }
  if (ds.rep) { ui.repId = ds.rep; render(); return; }
  if (ds.theme) { store.theme = ds.theme; persist(); render(); return; }
  if (ds.lang) { setLang(ds.lang); store.lang = ds.lang; persist(); render(); return; }
  if (ds.addfield) { fieldDialog(ds.addfield); return; }
  if (ds.editfield) { fieldDialog(null, store.customFields.find((f) => f.id === ds.editfield)); return; }
  if (ds.delfield) { if (confirm(t('Dieses Feld löschen?'))) { store.customFields = store.customFields.filter((f) => f.id !== ds.delfield); persist(); render(); } return; }
  if (ds.addstaffel !== undefined) { const st = store.params[p].matStaffel; st.push([(st[st.length - 1]?.[0] || 0) + 10000, st[st.length - 1]?.[1] || 0]); persist(); render(); return; }
  if (ds.delstaffel) { const st = store.params[p].matStaffel; if (st.length > 1) st.splice(Number(ds.delstaffel), 1); persist(); render(); return; }
  if (ds.editstate) { ui.route = 'state:' + ds.editstate; render(); return; }
  if (ds.delmach) { const st = store.states[Number(ui.route.slice(6))]; st.machines.splice(Number(ds.delmach), 1); persist(); render(); return; }
  if (ds.addmach) { const st = store.states[Number(ui.route.slice(6))]; const a = store.params[p].anlagen[ds.addmach];
    st.machines.push({ nr: Math.max(0, ...st.machines.map((m) => m.nr)) + 1, typ: ds.addmach, beschPeriode: st.period, wert: a.preis, afaRate: a.preis / a.dauer, rbw: a.preis - a.preis / a.dauer, rlz: a.dauer - 1, fix: a.fix, cap: a.cap, rest: a.rest });
    persist(); render(); return; }
  if (ds.tip !== undefined) return;
  switch (el.id) {
    case 'save2': case 'save': { const sc = scen(); const before = kpiSnap(simWith(sc.saved)); sc.saved = clone(sc.draft); const after = kpiSnap(simWith(sc.saved));
      ui.delta = Object.fromEntries(Object.keys(after).map((k) => [k, after[k] - before[k]])); persist(); render(); toast(t('Gespeichert und neu gerechnet')); break; }
    case 'scopen': ui.scOpen = !ui.scOpen; renderSide(); break;
    case 'scnew2': ui.scOpen = false; scenarioDialog('new'); break;
    case 'reset': { const sc = scen(); if (dirty() && !confirm(t('Ungespeicherte Änderungen verwerfen?'))) break; sc.draft = clone(sc.saved); ui.delta = null; persist(); render(); break; }
    case 'menu': ui.menu = !ui.menu; render(); break;
    case 'theme': { const order = ['light', 'dark', 'midnight']; store.theme = order[(order.indexOf(store.theme) + 1) % 3]; persist(); render(); break; }
    case 'dlzip': case 'dlone': {
      const per = ui.repPeriod ?? p; const res = reportsFor(per);
      const meta = { firma: store.firma, unternehmen: store.unternehmen, period: per, plan: !!res.plan, scenario: res.plan ? scen().name : '' };
      if (el.id === 'dlzip') { el.disabled = true; el.textContent = '…'; await downloadZip(res.reports, meta); el.disabled = false; el.textContent = 'ZIP (PDF)'; }
      else downloadSingle(res.reports.find((r) => r.id === ui.repId), meta);
      break; }
    case 'print': window.print(); break;
    case 'scnew': scenarioDialog('new'); break;
    case 'scdup': { const cur = scen(); const sc = { id: uid(), name: cur.name + ' (Kopie)', team: false, saved: clone(cur.draft), draft: clone(cur.draft) };
      store.scenarios[p].push(sc); store.active[p] = sc.id; persist(); render(); break; }
    case 'screname': scenarioDialog('rename', scen()); break;
    case 'scteam': store.scenarios[p].forEach((s) => (s.team = s.id === scen().id)); persist(); render(); break;
    case 'scdel': if (store.scenarios[p].length > 1 && confirm(t('Szenario löschen?'))) { store.scenarios[p] = store.scenarios[p].filter((s) => s.id !== scen().id); store.active[p] = store.scenarios[p][0].id; persist(); render(); } break;
    case 'parse': { const txt = $('#paste').value; if (looksLikeBackup(txt)) importBackupText(txt, t('eingefügter Text')); else if (txt.trim()) { pending = analyse(txt); render(); } break; }
    case 'apply': if (pending) { applyImport(pending); const per = pending.period; pending = null; toast(`${t('Periode')} ${per} ${t('übernommen')}`); ui.route = 'berichte'; ui.repPeriod = per; render(); } break;
    case 'discard': pending = null; render(); break;
    case 'exp': save(new Blob([JSON.stringify(store, null, 1)], { type: 'application/json' }), `TONWERK_Planrechner_Sicherung_${new Date().toISOString().slice(0, 10)}.json`); break;
    case 'wipe': if (confirm(t('Wirklich alle Eingaben, Szenarien und importierten Daten löschen?'))) { store = initialStore(); persist(); render(); } break;
    case 'install': if (installEvt) { installEvt.prompt(); installEvt = null; } break;
    case 'upd': location.reload(); break;
    default: break;
  }
});

function analyse(text) {
  const x = parseReports(text);
  if (x.period !== null) x.state = stateFromImport(x, store.states[x.period - 1]);
  return x;
}
async function readFiles(files) {
  let txt = '';
  for (const f of files) txt += '\n' + (f.type === 'application/pdf' || /\.pdf$/i.test(f.name) ? await pdfToText(f) : await f.text());
  pending = analyse(txt); render();
}
const CODE_PREFIX = 'TONWERK-SICHERUNG:';
function looksLikeBackup(txt) { const x = txt.replace(/^\uFEFF/, '').trim(); return x.startsWith(CODE_PREFIX) || (x.startsWith('{') && /"states"\s*:/.test(x) && /"params"\s*:/.test(x)); }
async function gz(bytes, mode) {
  const st = new Blob([bytes]).stream().pipeThrough(mode === 'c' ? new CompressionStream('gzip') : new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(st).arrayBuffer());
}
async function importBackup(file) {
  if (!file) return;
  let txt = '';
  try { txt = await file.text(); } catch (e) { alert(t('Die Datei konnte nicht gelesen werden.') + `\n\n${file.name} · ${file.size} Bytes\n${e?.message || e}`); return; }
  if (!txt.trim()) { alert(t('Android hat der App die Datei leer übergeben (0 Bytes), obwohl sie auf dem Gerät vollständig ist. Das passiert bei Dateien, die eine andere App heruntergeladen hat. Abhilfe: In der Dateiauswahl über das Menü ☰ den Gerätespeicher › Download öffnen statt „Downloads“, oder die Datei in der Dateien-App einmal kopieren (z. B. nach „Dokumente“) und die Kopie wählen.') + `\n\n${file.name}`); return; }
  importBackupText(txt, `${file.name} · ${file.size} Bytes · ${file.type || '?'}`);
}
async function importBackupText(txt, label) {
  let raw = txt.replace(/^\uFEFF/, '').trim(), s;
  try {
    if (raw.startsWith(CODE_PREFIX)) {
      const bin = atob(raw.slice(CODE_PREFIX.length).replace(/\s+/g, ''));
      raw = new TextDecoder().decode(await gz(Uint8Array.from(bin, (c) => c.charCodeAt(0)), 'd'));
    } else {
      const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
      if (a > 0 || (b >= 0 && b < raw.length - 1)) raw = raw.slice(a, b + 1);
    }
    s = JSON.parse(raw);
  } catch (e) {
    alert(t('Die Datei ist keine gültige Sicherung.') + `\n\n${label}\n${t('Anfang')}: ${txt.slice(0, 60).replace(/\s+/g, ' ')}\n${e?.message || e}`); return;
  }
  if (!s || typeof s !== 'object' || !s.states || !s.params) { alert(t('Die Datei ist keine gültige Sicherung.') + `\n\n${label}: ${t('Perioden oder Rahmendaten fehlen.')}`); return; }
  const old = store;
  try { store = migrate(s); setLang(store.lang || 'de'); pending = null; render(); persist(); toast(t('Sicherung importiert')); }
  catch (e) { store = old; try { render(); } catch {} alert(t('Die Sicherung konnte nicht geladen werden.') + `\n\n${e?.message || e}`); }
}
document.addEventListener('dragover', (e) => { const d = e.target.closest?.('#drop'); if (d) { e.preventDefault(); d.classList.add('over'); } });
document.addEventListener('dragleave', (e) => { e.target.closest?.('#drop')?.classList.remove('over'); });
document.addEventListener('drop', (e) => { const d = e.target.closest?.('#drop'); if (d) { e.preventDefault(); readFiles(e.dataTransfer.files); } });

// Hilfe-Tooltips
let tipEl;
function showTip(el) { hideTip(); tipEl = document.createElement('div'); tipEl.className = 'tip'; tipEl.textContent = el.dataset.tip; document.body.appendChild(tipEl);
  const r = el.getBoundingClientRect(); const w = tipEl.offsetWidth; tipEl.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left - w + 20)) + 'px'; tipEl.style.top = (r.bottom + 6) + 'px'; }
function hideTip() { tipEl?.remove(); tipEl = null; }
document.addEventListener('mouseover', (e) => { const el = e.target.closest?.('[data-tip]'); if (el) showTip(el); });
document.addEventListener('mouseout', (e) => { if (e.target.closest?.('[data-tip]')) hideTip(); });
document.addEventListener('focusin', (e) => { const el = e.target.closest?.('[data-tip]'); if (el) showTip(el); });
document.addEventListener('focusout', hideTip);
document.addEventListener('touchstart', (e) => { const el = e.target.closest?.('[data-tip]'); if (el) showTip(el); else hideTip(); }, { passive: true });

// Service Worker (offline + Update-Hinweis)
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const banner = () => { if ($('#upd')) return; const b = document.createElement('div'); b.className = 'update'; b.innerHTML = `${t('Neue Version verfügbar.')} <button class="btn small" id="upd">${t('Neu laden')}</button>`; document.body.prepend(b); };
  // Neue Version übernimmt sofort (skipWaiting); Hinweis nur, wenn vorher schon eine Version aktiv war
  const hadCtrl = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadCtrl) banner(); });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
    if (reg.waiting) reg.waiting.postMessage('skip');
    // beim Zurückkehren in die App und alle 30 Minuten nach Updates schauen
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
  }).catch(() => {});
}

setLang(store.lang || 'de');
ensurePeriod(planPeriod());
render();
window.__planrechner = { store: () => store, runPlan };

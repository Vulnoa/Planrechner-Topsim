// Rechenkern des Planrechners: bildet die TOPSIM-Planungsrechnung (Management Essentials) nach.
// Alle Geldwerte in TEUR, Stückpreise in EUR. Regeln laut Teilnehmerhandbuch, kalibriert an den
// echten TOPSIM-Berichten (Perioden 1–3).

export const r05 = (v) => Math.round(v * 2) / 2;

export function interp(tab, x) {
  if (x <= tab[0][0]) return tab[0][1];
  for (let i = 0; i < tab.length - 1; i++) {
    const [x0, y0] = tab[i], [x1, y1] = tab[i + 1];
    if (x <= x1) return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  }
  return tab[tab.length - 1][1];
}

// Preis je Einsatzstoff nach Mengenstaffel (gilt für die gesamte Bestellmenge)
export function staffelPreis(staffel, menge) {
  let p = staffel[0][1];
  for (const [ab, preis] of staffel) if (menge >= ab) p = preis;
  return p;
}

export function qualKosten(P, level) {
  const t = P.qualKosten;
  return t[Math.min(Math.max(level, 1), t.length) - 1];
}

const sum = (a) => a.reduce((s, x) => s + x, 0);

// Wirkung eigener Felder (vom Nutzer angelegt) einsammeln
function customEffects(fields, values, ctx) {
  const e = { fix: { einkauf: 0, fertigung: 0, vertrieb: 0, verwaltung: 0 }, varSold: 0, varProd: 0,
    ertrag: 0, einzahlung: 0, auszahlung: 0, absatzOnline: 0, absatzEH: 0 };
  for (const f of fields || []) {
    const v = Number(values?.[f.id] ?? f.def ?? 0) || 0;
    if (!v) continue;
    switch (f.effect) {
      case 'fix': e.fix[f.kst || 'verwaltung'] += v; break;          // TEUR fixe Kosten in Kostenstelle
      case 'varSold': e.varSold += v * ctx.sold / 1000; break;          // EUR je verkauftem Stück (Vertrieb Einzel)
      case 'varProd': e.varProd += v * ctx.prod / 1000; break;          // EUR je gefertigtem Stück (Fertigung Einzel)
      case 'ertrag': e.ertrag += v; break;                              // TEUR sonstiger Ertrag (zahlungswirksam)
      case 'einzahlung': e.einzahlung += v; break;                      // TEUR Einzahlung ohne GuV-Wirkung
      case 'auszahlung': e.auszahlung += v; break;                      // TEUR Auszahlung ohne GuV-Wirkung
      default: break;                                                   // nur Info
    }
  }
  return e;
}

/**
 * Simuliert eine Periode.
 * @param S  Endstand der Vorperiode (siehe defaults.js)
 * @param P  Parameter der Periode
 * @param D  Entscheidungen + Planwerte der Periode
 * @param C  eigene Felder {fields:[], values:{}}
 */
export function simulate(S, P, D, C = { fields: [], values: {} }) {
  const R = { period: S.period + 1, warnings: [] };
  const n = (x) => Number(x) || 0;

  // ---------- F&E / Qualität ----------
  const levelUp = Math.min(Math.max(n(D.levelUp), 0), P.maxLevelUp);
  const level = S.level + levelUp;
  R.level = { prev: S.level, cur: level, up: levelUp };

  // ---------- Anlagen ----------
  const desinv = new Set(D.desinvest || []);
  let desErloes = 0, desVerlust = 0;
  const machines = [];
  for (const m of S.machines) {
    if (desinv.has(m.nr)) {
      const erl = m.rbw * m.rest / 100;
      desErloes += erl; desVerlust += m.rbw - erl;
      continue;
    }
    const afa = m.rlz > 0 ? m.afaRate : 0;
    machines.push({ ...m, afa, rbw: Math.max(0, m.rbw - afa), rlz: Math.max(0, m.rlz - 1) });
  }
  if (desinv.size && machines.length === 0) R.warnings.push('Mindestens eine Anlage muss im Bestand bleiben.');
  let nr = Math.max(0, ...S.machines.map((m) => m.nr));
  let investSumme = 0;
  for (const typ of Object.keys(P.anlagen)) {
    const cnt = Math.max(0, Math.floor(n(D['invest' + typ])));
    const a = P.anlagen[typ];
    for (let i = 0; i < cnt; i++) {
      const afaRate = a.preis / a.dauer;
      investSumme += a.preis;
      machines.push({ nr: ++nr, typ, beschPeriode: R.period, wert: a.preis, afaRate, afa: afaRate,
        rbw: a.preis - afaRate, rlz: a.dauer - 1, fix: a.fix, cap: a.cap, rest: a.rest });
    }
  }
  const kapAnlagen = sum(machines.map((m) => m.cap));
  const afaAnlagen = sum(machines.map((m) => m.afa)) + desVerlust;
  const fixAnlagen = sum(machines.map((m) => m.fix));
  R.machines = machines;
  R.desinvest = { erloes: desErloes, verlust: desVerlust };

  // ---------- Fertigung & Personal Fertigung ----------
  const fertMA = n(D.fertigungMA);
  const maxPers = fertMA * P.prodMA * (1 + P.ueberMax);
  const planProd = Math.max(0, n(D.fertigung));
  const prod = Math.min(planProd, kapAnlagen, maxPers);
  if (prod < planProd) R.warnings.push(`Fertigung auf ${Math.round(prod).toLocaleString('de-DE')} Stück begrenzt (${prod === kapAnlagen ? 'Anlagenkapazität' : 'Personal inkl. 20 % Überstunden'}).`);
  const eingesetzt = prod / P.prodMA;                     // eingesetztes Personal inkl. Überstunden
  const ueberMA = Math.max(0, eingesetzt - fertMA);
  const genutztMA = Math.min(eingesetzt, fertMA);
  const leerMA = Math.max(0, fertMA - eingesetzt);
  R.fertigung = { plan: planProd, ist: prod, kapAnlagen, fertMA, maxPersMA: fertMA * (1 + P.ueberMax), eingesetzt,
    ueberMA, auslAnlagen: kapAnlagen ? prod / kapAnlagen * 100 : 0, auslMA: fertMA ? prod / (fertMA * P.prodMA) * 100 : 0 };

  // ---------- Einkauf / Einsatzstoffe ----------
  const kauf = Math.max(0, n(D.einkauf));
  const kaufPreis = staffelPreis(P.matStaffel, kauf);
  const verf = S.mat.qty + kauf;
  const jit = Math.max(0, prod - verf);
  const matWertGes = S.mat.value + kauf * kaufPreis / 1000 + jit * P.jitPreis / 1000;
  const matMengeGes = verf + jit;
  const matAvg = matMengeGes ? matWertGes / matMengeGes * 1000 : kaufPreis;
  const matVerbrauch = prod * matAvg / 1000;
  const matEnd = { qty: matMengeGes - prod, value: matWertGes - matVerbrauch };
  if (jit > 0) R.warnings.push(`${Math.round(jit).toLocaleString('de-DE')} Einsatzstoffe fehlen und werden per Just-in-Time zu ${P.jitPreis} € nachgeliefert.`);
  const betriebsstoffe = prod * P.betriebsstoff / 1000;
  R.lagerMat = { anfang: { ...S.mat, preis: S.mat.qty ? S.mat.value / S.mat.qty * 1000 : S.mat.preis || kaufPreis },
    zugang: kauf, zugangPreis: kaufPreis, jit, jitPreis: P.jitPreis, abgang: prod, avg: matAvg, ende: { ...matEnd, preis: matAvg } };

  // ---------- Absatz ----------
  const feVerf = S.fe.qty + prod;
  const gaMenge = Math.min(Math.max(0, n(D.gaMenge)), feVerf);
  const onlinePlan = Math.max(0, n(D.absatzOnline));
  const online = Math.min(onlinePlan, feVerf - gaMenge);
  const ehPlan = D.ehAktiv ? Math.max(0, n(D.absatzEH)) : 0;
  const eh = Math.min(ehPlan, feVerf - gaMenge - online);
  const sold = gaMenge + online + eh;
  if (online + eh < onlinePlan + ehPlan) R.warnings.push(`Lieferunfähig: ${Math.round(onlinePlan + ehPlan - online - eh).toLocaleString('de-DE')} Stück Planabsatz können nicht geliefert werden.`);
  const preisOnline = n(D.preisOnline), preisEH = n(D.preisEH) || preisOnline, gaPreis = n(D.gaPreis);
  const umsOnline = online * preisOnline / 1000, umsEH = eh * preisEH / 1000, umsGA = gaMenge * gaPreis / 1000;
  const umsatz = umsOnline + umsEH + umsGA;
  R.absatz = { online, eh, ga: gaMenge, sold, onlinePlan, ehPlan, preisOnline, preisEH, gaPreis, umsOnline, umsEH, umsGA, umsatz };

  const cust = customEffects(C.fields, C.values, { sold, prod });

  // ---------- Personal ----------
  const ekSoll = r05(interp(P.einkaufTab, umsatz / 1000));
  const vwSoll = r05(interp(P.verwaltungTab, umsatz / 1000));
  const kbSoll = n(D.kbOnline) + (D.ehAktiv ? n(D.kbEH) : 0);
  const st0 = S.staff;
  const kb0 = st0.kb;
  const pers = {};
  const mk = (key, anfang, ende, gehalt) => {
    const ein = Math.max(0, ende - anfang), ent = Math.max(0, anfang - ende);
    pers[key] = { anfang, ein, ent, ende, gehalt, lohn: ende * gehalt, einEnt: ein * P.einstellung + ent * P.entlassung };
  };
  mk('einkauf', st0.einkauf, ekSoll, P.gehalt.einkauf);
  mk('verwaltung', st0.verwaltung, vwSoll, P.gehalt.verwaltung);
  mk('fertigung', st0.fertigung, fertMA, P.gehalt.fertigung);
  mk('kb', kb0, kbSoll, P.gehalt.kb);
  for (const k in pers) pers[k].nk = pers[k].lohn * P.nk;
  const ueberLohn = ueberMA * P.gehalt.fertigung * (1 + P.ueberZuschlag);
  R.personal = pers;
  R.personal.ueberLohn = ueberLohn;
  const lohnSumme = sum(Object.values(pers).filter((x) => x && x.lohn !== undefined).map((x) => x.lohn)) + ueberLohn;
  const einEntSumme = sum(['einkauf', 'verwaltung', 'fertigung', 'kb'].map((k) => pers[k].einEnt));
  const nkSumme = lohnSumme * P.nk;
  const personalAufwand = lohnSumme + einEntSumme + nkSumme;

  // ---------- Kosten ----------
  const fertLohnEinzel = genutztMA * P.gehalt.fertigung + ueberLohn;   // eingesetzte MA inkl. Überstunden
  const fertLohnLeer = leerMA * P.gehalt.fertigung;                    // nicht ausgelastete MA → Gemeinkosten
  const geb = P.gebaeudeAfa, gs = P.gebaeudeSchluessel;
  const lagerMatK = matEnd.qty * P.lagerMat / 1000;

  // Abgang Fertigerzeugnisse (Durchschnittsbewertung, je Kostenkomponente)
  const kst = {
    einkauf: { lohn: pers.einkauf.lohn, einEnt: pers.einkauf.einEnt, nk: pers.einkauf.lohn * P.nk, geb: geb * gs.einkauf / 100,
      anl: 0, sfix: P.sfix.einkauf + cust.fix.einkauf, lager: lagerMatK, werbung: 0 },
    fertigung: { lohn: fertLohnLeer, einEnt: pers.fertigung.einEnt, nk: fertLohnLeer * P.nk, geb: geb * gs.fertigung / 100,
      anl: afaAnlagen, sfix: P.sfix.fertigung + fixAnlagen + cust.fix.fertigung, lager: 0, werbung: 0 },
    fe: { lohn: 0, einEnt: 0, nk: 0, geb: 0, anl: 0, sfix: 0, lager: 0, werbung: 0 },
    vertrieb: { lohn: pers.kb.lohn, einEnt: pers.kb.einEnt, nk: pers.kb.lohn * P.nk, geb: geb * gs.vertrieb / 100,
      anl: 0, sfix: P.sfix.vertrieb + cust.fix.vertrieb, lager: 0, werbung: n(D.ci) },
    verwaltung: { lohn: pers.verwaltung.lohn, einEnt: pers.verwaltung.einEnt, nk: pers.verwaltung.lohn * P.nk, geb: geb * gs.verwaltung / 100,
      anl: 0, sfix: P.sfix.verwaltung + cust.fix.verwaltung, lager: 0, werbung: 0 },
  };
  for (const k in kst) kst[k].summe = sum(Object.values(kst[k]));

  const einzel = {
    einkauf: matVerbrauch + betriebsstoffe,
    fertigung: fertLohnEinzel * (1 + P.nk) + cust.varProd,
    fe: levelUp * P.fueProLevel + qualKosten(P, level) * sold / 1000,
    vertrieb: n(D.werbungOnline) + (D.ehAktiv ? n(D.werbungEH) : 0) + (online * P.transOnline + eh * P.transEH) / 1000 + cust.varSold,
    verwaltung: 0,
  };
  const transport = (online * P.transOnline + eh * P.transEH) / 1000;
  const werbung = n(D.werbungOnline) + (D.ehAktiv ? n(D.werbungEH) : 0);
  R.einzel = einzel; R.kst = kst;

  // Lagerkosten Fertigerzeugnisse hängen vom Endbestand ab
  const feEndQty = feVerf - sold;
  kst.vertrieb.lager = feEndQty * P.lagerFE / 1000;
  kst.vertrieb.summe = sum(['lohn', 'einEnt', 'nk', 'geb', 'anl', 'sfix', 'lager', 'werbung'].map((k) => kst.vertrieb[k]));

  // Herstellkosten der Produktion je Komponente
  const neu = { varMat: einzel.einkauf, fixMat: kst.einkauf.summe, varFert: einzel.fertigung, fixFert: kst.fertigung.summe };
  const hk = neu.varMat + neu.fixMat + neu.varFert + neu.fixFert;
  const comps = ['varMat', 'fixMat', 'varFert', 'fixFert'];
  const ges = {}; for (const c of comps) ges[c] = (S.fe[c] || 0) + neu[c];
  const anteil = feVerf > 0 ? sold / feVerf : 1;
  const hkdu = {}, feEnd = { qty: feEndQty };
  for (const c of comps) { hkdu[c] = ges[c] * anteil; feEnd[c] = ges[c] - hkdu[c]; }
  const feStartWert = comps.reduce((s, c) => s + (S.fe[c] || 0), 0);
  const feEndWert = comps.reduce((s, c) => s + feEnd[c], 0);
  const hkduSumme = comps.reduce((s, c) => s + hkdu[c], 0);
  const bestVer = feEndWert - feStartWert;
  R.lagerFE = { anfang: { qty: S.fe.qty, wert: feStartWert }, zugang: { qty: prod, wert: hk }, abgang: { qty: sold, wert: hkduSumme },
    ende: { qty: feEndQty, wert: feEndWert } };
  R.hk = { neu, hk, hkdu, hkduSumme, bestVer, feEnd };

  const selbstkosten = hkduSumme + einzel.fe + kst.fe.summe + einzel.vertrieb + kst.vertrieb.summe + kst.verwaltung.summe;
  R.ktr = { selbstkosten, hkStk: prod ? hk / prod * 1000 : 0, hkduStk: sold ? hkduSumme / sold * 1000 : 0, skStk: sold ? selbstkosten / sold * 1000 : 0 };

  // ---------- Deckungsbeitragsrechnung ----------
  const ch = { online: { u: online, ums: umsOnline, trans: online * P.transOnline / 1000, werb: n(D.werbungOnline) },
    ga: { u: gaMenge, ums: umsGA, trans: 0, werb: 0 },
    aus: { u: 0, ums: 0, trans: 0, werb: 0 },
    eh: { u: eh, ums: umsEH, trans: eh * P.transEH / 1000, werb: D.ehAktiv ? n(D.werbungEH) : 0 },
    sonder: { u: 0, ums: 0, trans: 0, werb: 0 } };
  for (const k in ch) {
    const c = ch[k], q = sold ? c.u / sold : 0;
    c.varMat = hkdu.varMat * q; c.varFert = hkdu.varFert * q; c.fixMat = hkdu.fixMat * q; c.fixFert = hkdu.fixFert * q;
    c.trans += cust.varSold * q;
    c.db1 = c.ums - c.varMat - c.varFert - c.trans;
    c.db2 = c.db1 - c.fixMat - c.fixFert;
    c.db3 = c.db2 - c.werb;
    c.entw = einzel.fe * q;
    c.db4 = c.db3 - c.entw;
  }
  const db4 = sum(Object.values(ch).map((c) => c.db4));
  R.db = { ch, db4, forschung: kst.fe.summe, vertrieb: kst.vertrieb.summe, verwaltung: kst.verwaltung.summe,
    db5: db4 - kst.fe.summe - kst.vertrieb.summe - kst.verwaltung.summe };

  // ---------- GuV ----------
  const sonstErtrag = n(D.sonstErtrag) + cust.ertrag;
  const matAufwand = matVerbrauch + betriebsstoffe;
  const abschreibungen = geb + afaAnlagen;
  const sfixGes = kst.einkauf.sfix + kst.fertigung.sfix + kst.vertrieb.sfix + kst.verwaltung.sfix;
  const lagerK = lagerMatK + kst.vertrieb.lager;
  const sonstAufwand = sfixGes + lagerK + werbung + n(D.ci) + einzel.fe + transport + cust.varSold + cust.varProd;
  const be = umsatz + sonstErtrag + bestVer - matAufwand - personalAufwand - abschreibungen - sonstAufwand;
  // Kostenartenrechnung [Summe, Gemeinkosten, Einzelkosten]
  const nkEinzel = fertLohnEinzel * P.nk;
  const cv = cust.varSold + cust.varProd;
  R.koa = {
    einsatz: [matVerbrauch, 0, matVerbrauch], betrieb: [betriebsstoffe, 0, betriebsstoffe],
    lohn: [lohnSumme, lohnSumme - fertLohnEinzel, fertLohnEinzel], einEnt: [einEntSumme, einEntSumme, 0],
    nk: [nkSumme, nkSumme - nkEinzel, nkEinzel], geb: [geb, geb, 0], anl: [afaAnlagen, afaAnlagen, 0], feAfa: [0, 0, 0],
    sfix: [sfixGes, sfixGes, 0], lager: [lagerK, lagerK, 0], werbung: [werbung + n(D.ci), n(D.ci), werbung],
    fe: [einzel.fe, 0, einzel.fe], trans: [transport, 0, transport], eigen: [cv, 0, cv],
  };
  R.koa.summe = [0, 1, 2].map((i) => sum(Object.values(R.koa).map((r) => r[i])));
  R.fertLohnEinzel = fertLohnEinzel;
  const zinsLang = S.bilanz.lang * P.zinsLang;
  const kurz = Math.max(0, n(D.kurzKredit));
  const zinsKurz = kurz * P.zinsKurz;

  // ---------- Liquidität (Überziehungskredit iterativ, da Zinsen und Steuern davon abhängen) ----------
  const einUmsatzAkt = (umsOnline + umsEH) * P.zahlQuote + umsGA;
  const einUmsatzVor = S.bilanz.ford;
  const matAus = kauf * kaufPreis / 1000 + jit * P.jitPreis / 1000 + betriebsstoffe;
  const rueckzahlung = S.bilanz.kurz + S.bilanz.dispo;
  let dispo = 0, zinsDispo = 0, steuer = 0, gvst = 0, verlustNeu = S.verlustvortrag, kasse = 0;
  for (let i = 0; i < 300; i++) {
    zinsDispo = dispo * P.zinsDispo;
    gvst = be - zinsLang - zinsKurz - zinsDispo;
    const basis = gvst - S.verlustvortrag;
    steuer = basis > 0 ? basis * P.steuer : 0;
    verlustNeu = gvst >= 0 ? Math.max(0, S.verlustvortrag - gvst) : S.verlustvortrag - gvst;
    const ohneDispo = S.bilanz.kasse + einUmsatzAkt + einUmsatzVor + sonstErtrag + cust.einzahlung + desErloes + kurz
      - matAus - personalAufwand - sonstAufwand - rueckzahlung - zinsLang - zinsKurz - investSumme - cust.auszahlung - steuer - zinsDispo;
    const need = Math.max(0, P.minKasse - ohneDispo);
    kasse = ohneDispo + need;
    if (Math.abs(need - dispo) < 1e-9) { dispo = need; break; }
    dispo = need;
  }
  const finErg = -(zinsLang + zinsKurz + zinsDispo);
  const ju = gvst - steuer;
  R.guv = { umsatz, sonstErtrag, bestVer, matAufwand, personalAufwand, lohn: lohnSumme, einEnt: einEntSumme, nk: nkSumme,
    abschreibungen, sonstAufwand, be, finErg, zinsKurzLang: zinsLang + zinsKurz, zinsDispo, gvst, steuer, ju,
    ukv: { hkdu: hkduSumme, fe: einzel.fe + kst.fe.summe, vertrieb: einzel.vertrieb + kst.vertrieb.summe, verwaltung: kst.verwaltung.summe },
    gvVortragVor: S.bilanz.gvVortrag, gvVortrag: S.bilanz.gvVortrag + ju };
  R.liq = { kasseAnfang: S.bilanz.kasse, einUmsatzAkt, einUmsatzVor, zinsErtrag: 0, sonstEin: sonstErtrag + cust.einzahlung, desErloes,
    kreditAufnahme: kurz, dispo, matAus, einkaufVor: 0, personal: personalAufwand, sonstAus: sonstAufwand, rueckzahlung,
    zinsKredite: zinsLang + zinsKurz, invest: investSumme, sonstAuszahlung: cust.auszahlung, steuer, zinsDispo, kasseEnde: kasse };
  R.liq.summeEin = R.liq.kasseAnfang * 0 + einUmsatzAkt + einUmsatzVor + R.liq.sonstEin + desErloes + kurz + dispo;
  R.liq.summeAus = matAus + personalAufwand + sonstAufwand + rueckzahlung + zinsLang + zinsKurz + investSumme + cust.auszahlung + steuer + zinsDispo;

  // ---------- Bilanz ----------
  const ford = (umsOnline + umsEH) * (1 - P.zahlQuote);
  const grund = Math.max(0, S.bilanz.grund - geb);
  const masch = sum(machines.map((m) => m.rbw));
  const ek = S.bilanz.gez + S.bilanz.krl + S.bilanz.grl + S.bilanz.gvVortrag + ju + n(D.kapErhoehung);
  const bil = { grund, masch, av: grund + masch, mat: matEnd.value, fe: feEndWert, ford, wp: 0, kasse,
    gez: S.bilanz.gez, krl: S.bilanz.krl + n(D.kapErhoehung), grl: S.bilanz.grl, gvVortragVor: S.bilanz.gvVortrag, ju, ek,
    lang: S.bilanz.lang, kurz, dispo };
  bil.uv = bil.mat + bil.fe + bil.ford + bil.wp + bil.kasse;
  bil.aktiva = bil.av + bil.uv;
  bil.fk = bil.lang + bil.kurz + bil.dispo;
  bil.passiva = bil.ek + bil.fk;
  R.bilanz = bil;
  R.bilanzVor = S.bilanz;

  // ---------- Cashflow ----------
  const dMat = S.mat.value - matEnd.value, dFE = feStartWert - feEndWert, dFord = S.bilanz.ford - ford;
  const tradCF = ju + abschreibungen;
  const opCF = tradCF + dMat + dFE + dFord;
  const invCF = -investSumme + desErloes;
  const finCF = (kurz + dispo) - (S.bilanz.kurz + S.bilanz.dispo) + n(D.kapErhoehung);
  R.cf = { ju, afa: abschreibungen, tradCF, dMat, dFE, dFord, opCF, invest: -investSumme + desErloes, invCF, kapErh: n(D.kapErhoehung),
    dBank: (kurz + dispo) - (S.bilanz.kurz + S.bilanz.dispo), finCF, dKasse: opCF + invCF + finCF, fcf: opCF + invCF };

  // ---------- Kennzahlen ----------
  const ekVor = S.bilanz.gez + S.bilanz.krl + S.bilanz.grl + S.bilanz.gvVortrag;
  R.kpi = {
    ju, absatzOnline: online, absatzEH: eh, absatzGA: gaMenge, umsatz, hkStk: R.ktr.hkStk, skStk: R.ktr.skStk,
    auslMA: R.fertigung.auslMA, auslAnlagen: R.fertigung.auslAnlagen, kasse, dispo, be,
    ekRendite: ekVor ? ju / ekVor * 100 : 0, umsatzRendite: umsatz ? ju / umsatz * 100 : 0,
    fkQuote: bil.passiva ? bil.fk / bil.passiva * 100 : 0, ek, db5Stk: sold ? R.db.db5 / sold * 1000 : 0,
  };
  const E = P.erfolgswert;
  R.kpi.erfolgswert = E.a + E.ju * ju + E.ek * ek + E.level * level;

  // ---------- Endstand für die Folgeperiode ----------
  R.endState = {
    period: R.period, level, preisOnline, preisEH,
    fe: feEnd, mat: { qty: matEnd.qty, value: matEnd.value, preis: matAvg },
    machines: machines.map(({ afa, ...m }) => m),
    staff: { einkauf: ekSoll, verwaltung: vwSoll, fertigung: fertMA, kb: kbSoll, kbOnline: n(D.kbOnline), kbEH: D.ehAktiv ? n(D.kbEH) : 0 },
    bilanz: { grund, ford, kasse, gez: bil.gez, krl: bil.krl, grl: bil.grl, gvVortrag: S.bilanz.gvVortrag + ju, lang: bil.lang, kurz, dispo },
    verlustvortrag: verlustNeu,
  };
  return R;
}

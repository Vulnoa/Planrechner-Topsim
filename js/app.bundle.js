(() => {
  // js/engine.js
  var r05 = (v) => Math.round(v * 2) / 2;
  function interp(tab, x) {
    if (x <= tab[0][0])
      return tab[0][1];
    for (let i = 0; i < tab.length - 1; i++) {
      const [x0, y0] = tab[i], [x1, y1] = tab[i + 1];
      if (x <= x1)
        return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
    }
    return tab[tab.length - 1][1];
  }
  function staffelPreis(staffel, menge) {
    let p = staffel[0][1];
    for (const [ab, preis] of staffel)
      if (menge >= ab)
        p = preis;
    return p;
  }
  function qualKosten(P, level) {
    const t2 = P.qualKosten;
    return t2[Math.min(Math.max(level, 1), t2.length) - 1];
  }
  var sum = (a) => a.reduce((s, x) => s + x, 0);
  function customEffects(fields, values, ctx) {
    const e = {
      fix: { einkauf: 0, fertigung: 0, vertrieb: 0, verwaltung: 0 },
      varSold: 0,
      varProd: 0,
      ertrag: 0,
      einzahlung: 0,
      auszahlung: 0,
      absatzOnline: 0,
      absatzEH: 0
    };
    for (const f of fields || []) {
      const v = Number(values?.[f.id] ?? f.def ?? 0) || 0;
      if (!v)
        continue;
      switch (f.effect) {
        case "fix":
          e.fix[f.kst || "verwaltung"] += v;
          break;
        case "varSold":
          e.varSold += v * ctx.sold / 1e3;
          break;
        case "varProd":
          e.varProd += v * ctx.prod / 1e3;
          break;
        case "ertrag":
          e.ertrag += v;
          break;
        case "einzahlung":
          e.einzahlung += v;
          break;
        case "auszahlung":
          e.auszahlung += v;
          break;
        default:
          break;
      }
    }
    return e;
  }
  function simulate(S, P, D2, C = { fields: [], values: {} }) {
    const R = { period: S.period + 1, warnings: [] };
    const n = (x) => Number(x) || 0;
    const levelUp = Math.min(Math.max(n(D2.levelUp), 0), P.maxLevelUp);
    const level = S.level + levelUp;
    R.level = { prev: S.level, cur: level, up: levelUp };
    const desinv = new Set(D2.desinvest || []);
    let desErloes = 0, desVerlust = 0;
    const machines = [];
    for (const m of S.machines) {
      if (desinv.has(m.nr)) {
        const erl = m.rbw * m.rest / 100;
        desErloes += erl;
        desVerlust += m.rbw - erl;
        continue;
      }
      const afa = m.rlz > 0 ? m.afaRate : 0;
      machines.push({ ...m, afa, rbw: Math.max(0, m.rbw - afa), rlz: Math.max(0, m.rlz - 1) });
    }
    if (desinv.size && machines.length === 0)
      R.warnings.push("Mindestens eine Anlage muss im Bestand bleiben.");
    let nr = Math.max(0, ...S.machines.map((m) => m.nr));
    let investSumme = 0;
    for (const typ of Object.keys(P.anlagen)) {
      const cnt = Math.max(0, Math.floor(n(D2["invest" + typ])));
      const a = P.anlagen[typ];
      for (let i = 0; i < cnt; i++) {
        const afaRate = a.preis / a.dauer;
        investSumme += a.preis;
        machines.push({
          nr: ++nr,
          typ,
          beschPeriode: R.period,
          wert: a.preis,
          afaRate,
          afa: afaRate,
          rbw: a.preis - afaRate,
          rlz: a.dauer - 1,
          fix: a.fix,
          cap: a.cap,
          rest: a.rest
        });
      }
    }
    const kapAnlagen = sum(machines.map((m) => m.cap));
    const afaAnlagen = sum(machines.map((m) => m.afa)) + desVerlust;
    const fixAnlagen = sum(machines.map((m) => m.fix));
    R.machines = machines;
    R.desinvest = { erloes: desErloes, verlust: desVerlust };
    const fertMA = n(D2.fertigungMA);
    const maxPers = fertMA * P.prodMA * (1 + P.ueberMax);
    const planProd = Math.max(0, n(D2.fertigung));
    const prod = Math.min(planProd, kapAnlagen, maxPers);
    if (prod < planProd)
      R.warnings.push(`Fertigung auf ${Math.round(prod).toLocaleString("de-DE")} St\xFCck begrenzt (${prod === kapAnlagen ? "Anlagenkapazit\xE4t" : "Personal inkl. 20 % \xDCberstunden"}).`);
    const eingesetzt = prod / P.prodMA;
    const ueberMA = Math.max(0, eingesetzt - fertMA);
    const genutztMA = Math.min(eingesetzt, fertMA);
    const leerMA = Math.max(0, fertMA - eingesetzt);
    R.fertigung = {
      plan: planProd,
      ist: prod,
      kapAnlagen,
      fertMA,
      maxPersMA: fertMA * (1 + P.ueberMax),
      eingesetzt,
      ueberMA,
      auslAnlagen: kapAnlagen ? prod / kapAnlagen * 100 : 0,
      auslMA: fertMA ? prod / (fertMA * P.prodMA) * 100 : 0
    };
    const kauf = Math.max(0, n(D2.einkauf));
    const kaufPreis = staffelPreis(P.matStaffel, kauf);
    const verf = S.mat.qty + kauf;
    const jit = Math.max(0, prod - verf);
    const matWertGes = S.mat.value + kauf * kaufPreis / 1e3 + jit * P.jitPreis / 1e3;
    const matMengeGes = verf + jit;
    const matAvg = matMengeGes ? matWertGes / matMengeGes * 1e3 : kaufPreis;
    const matVerbrauch = prod * matAvg / 1e3;
    const matEnd = { qty: matMengeGes - prod, value: matWertGes - matVerbrauch };
    if (jit > 0)
      R.warnings.push(`${Math.round(jit).toLocaleString("de-DE")} Einsatzstoffe fehlen und werden per Just-in-Time zu ${P.jitPreis} \u20AC nachgeliefert.`);
    const betriebsstoffe = prod * P.betriebsstoff / 1e3;
    R.lagerMat = {
      anfang: { ...S.mat, preis: S.mat.qty ? S.mat.value / S.mat.qty * 1e3 : S.mat.preis || kaufPreis },
      zugang: kauf,
      zugangPreis: kaufPreis,
      jit,
      jitPreis: P.jitPreis,
      abgang: prod,
      avg: matAvg,
      ende: { ...matEnd, preis: matAvg }
    };
    const feVerf = S.fe.qty + prod;
    const gaMenge = Math.min(Math.max(0, n(D2.gaMenge)), feVerf);
    const onlinePlan = Math.max(0, n(D2.absatzOnline));
    const online = Math.min(onlinePlan, feVerf - gaMenge);
    const ehPlan = D2.ehAktiv ? Math.max(0, n(D2.absatzEH)) : 0;
    const eh = Math.min(ehPlan, feVerf - gaMenge - online);
    const sold = gaMenge + online + eh;
    if (online + eh < onlinePlan + ehPlan)
      R.warnings.push(`Lieferunf\xE4hig: ${Math.round(onlinePlan + ehPlan - online - eh).toLocaleString("de-DE")} St\xFCck Planabsatz k\xF6nnen nicht geliefert werden.`);
    const preisOnline = n(D2.preisOnline), preisEH = n(D2.preisEH) || preisOnline, gaPreis = n(D2.gaPreis);
    const umsOnline = online * preisOnline / 1e3, umsEH = eh * preisEH / 1e3, umsGA = gaMenge * gaPreis / 1e3;
    const umsatz = umsOnline + umsEH + umsGA;
    R.absatz = { online, eh, ga: gaMenge, sold, onlinePlan, ehPlan, preisOnline, preisEH, gaPreis, umsOnline, umsEH, umsGA, umsatz };
    const cust = customEffects(C.fields, C.values, { sold, prod });
    const ekSoll = r05(interp(P.einkaufTab, umsatz / 1e3));
    const vwSoll = r05(interp(P.verwaltungTab, umsatz / 1e3));
    const kbSoll = n(D2.kbOnline) + (D2.ehAktiv ? n(D2.kbEH) : 0);
    const st0 = S.staff;
    const kb0 = st0.kb;
    const pers = {};
    const mk = (key, anfang, ende, gehalt) => {
      const ein = Math.max(0, ende - anfang), ent = Math.max(0, anfang - ende);
      pers[key] = { anfang, ein, ent, ende, gehalt, lohn: ende * gehalt, einEnt: ein * P.einstellung + ent * P.entlassung };
    };
    mk("einkauf", st0.einkauf, ekSoll, P.gehalt.einkauf);
    mk("verwaltung", st0.verwaltung, vwSoll, P.gehalt.verwaltung);
    mk("fertigung", st0.fertigung, fertMA, P.gehalt.fertigung);
    mk("kb", kb0, kbSoll, P.gehalt.kb);
    for (const k in pers)
      pers[k].nk = pers[k].lohn * P.nk;
    const ueberLohn = ueberMA * P.gehalt.fertigung * (1 + P.ueberZuschlag);
    R.personal = pers;
    R.personal.ueberLohn = ueberLohn;
    const lohnSumme = sum(Object.values(pers).filter((x) => x && x.lohn !== void 0).map((x) => x.lohn)) + ueberLohn;
    const einEntSumme = sum(["einkauf", "verwaltung", "fertigung", "kb"].map((k) => pers[k].einEnt));
    const nkSumme = lohnSumme * P.nk;
    const personalAufwand = lohnSumme + einEntSumme + nkSumme;
    const fertLohnEinzel = genutztMA * P.gehalt.fertigung + ueberLohn;
    const fertLohnLeer = leerMA * P.gehalt.fertigung;
    const geb = P.gebaeudeAfa, gs = P.gebaeudeSchluessel;
    const lagerMatK = matEnd.qty * P.lagerMat / 1e3;
    const kst = {
      einkauf: {
        lohn: pers.einkauf.lohn,
        einEnt: pers.einkauf.einEnt,
        nk: pers.einkauf.lohn * P.nk,
        geb: geb * gs.einkauf / 100,
        anl: 0,
        sfix: P.sfix.einkauf + cust.fix.einkauf,
        lager: lagerMatK,
        werbung: 0
      },
      fertigung: {
        lohn: fertLohnLeer,
        einEnt: pers.fertigung.einEnt,
        nk: fertLohnLeer * P.nk,
        geb: geb * gs.fertigung / 100,
        anl: afaAnlagen,
        sfix: P.sfix.fertigung + fixAnlagen + cust.fix.fertigung,
        lager: 0,
        werbung: 0
      },
      fe: { lohn: 0, einEnt: 0, nk: 0, geb: 0, anl: 0, sfix: 0, lager: 0, werbung: 0 },
      vertrieb: {
        lohn: pers.kb.lohn,
        einEnt: pers.kb.einEnt,
        nk: pers.kb.lohn * P.nk,
        geb: geb * gs.vertrieb / 100,
        anl: 0,
        sfix: P.sfix.vertrieb + cust.fix.vertrieb,
        lager: 0,
        werbung: n(D2.ci)
      },
      verwaltung: {
        lohn: pers.verwaltung.lohn,
        einEnt: pers.verwaltung.einEnt,
        nk: pers.verwaltung.lohn * P.nk,
        geb: geb * gs.verwaltung / 100,
        anl: 0,
        sfix: P.sfix.verwaltung + cust.fix.verwaltung,
        lager: 0,
        werbung: 0
      }
    };
    for (const k in kst)
      kst[k].summe = sum(Object.values(kst[k]));
    const einzel = {
      einkauf: matVerbrauch + betriebsstoffe,
      fertigung: fertLohnEinzel * (1 + P.nk) + cust.varProd,
      fe: levelUp * P.fueProLevel + qualKosten(P, level) * sold / 1e3,
      vertrieb: n(D2.werbungOnline) + (D2.ehAktiv ? n(D2.werbungEH) : 0) + (online * P.transOnline + eh * P.transEH) / 1e3 + cust.varSold,
      verwaltung: 0
    };
    const transport = (online * P.transOnline + eh * P.transEH) / 1e3;
    const werbung = n(D2.werbungOnline) + (D2.ehAktiv ? n(D2.werbungEH) : 0);
    R.einzel = einzel;
    R.kst = kst;
    const feEndQty = feVerf - sold;
    kst.vertrieb.lager = feEndQty * P.lagerFE / 1e3;
    kst.vertrieb.summe = sum(["lohn", "einEnt", "nk", "geb", "anl", "sfix", "lager", "werbung"].map((k) => kst.vertrieb[k]));
    const neu = { varMat: einzel.einkauf, fixMat: kst.einkauf.summe, varFert: einzel.fertigung, fixFert: kst.fertigung.summe };
    const hk = neu.varMat + neu.fixMat + neu.varFert + neu.fixFert;
    const comps = ["varMat", "fixMat", "varFert", "fixFert"];
    const ges = {};
    for (const c of comps)
      ges[c] = (S.fe[c] || 0) + neu[c];
    const anteil = feVerf > 0 ? sold / feVerf : 1;
    const hkdu = {}, feEnd = { qty: feEndQty };
    for (const c of comps) {
      hkdu[c] = ges[c] * anteil;
      feEnd[c] = ges[c] - hkdu[c];
    }
    const feStartWert = comps.reduce((s, c) => s + (S.fe[c] || 0), 0);
    const feEndWert = comps.reduce((s, c) => s + feEnd[c], 0);
    const hkduSumme = comps.reduce((s, c) => s + hkdu[c], 0);
    const bestVer = feEndWert - feStartWert;
    R.lagerFE = {
      anfang: { qty: S.fe.qty, wert: feStartWert },
      zugang: { qty: prod, wert: hk },
      abgang: { qty: sold, wert: hkduSumme },
      ende: { qty: feEndQty, wert: feEndWert }
    };
    R.hk = { neu, hk, hkdu, hkduSumme, bestVer, feEnd };
    const selbstkosten = hkduSumme + einzel.fe + kst.fe.summe + einzel.vertrieb + kst.vertrieb.summe + kst.verwaltung.summe;
    R.ktr = { selbstkosten, hkStk: prod ? hk / prod * 1e3 : 0, hkduStk: sold ? hkduSumme / sold * 1e3 : 0, skStk: sold ? selbstkosten / sold * 1e3 : 0 };
    const ch = {
      online: { u: online, ums: umsOnline, trans: online * P.transOnline / 1e3, werb: n(D2.werbungOnline) },
      ga: { u: gaMenge, ums: umsGA, trans: 0, werb: 0 },
      aus: { u: 0, ums: 0, trans: 0, werb: 0 },
      eh: { u: eh, ums: umsEH, trans: eh * P.transEH / 1e3, werb: D2.ehAktiv ? n(D2.werbungEH) : 0 },
      sonder: { u: 0, ums: 0, trans: 0, werb: 0 }
    };
    for (const k in ch) {
      const c = ch[k], q = sold ? c.u / sold : 0;
      c.varMat = hkdu.varMat * q;
      c.varFert = hkdu.varFert * q;
      c.fixMat = hkdu.fixMat * q;
      c.fixFert = hkdu.fixFert * q;
      c.trans += cust.varSold * q;
      c.db1 = c.ums - c.varMat - c.varFert - c.trans;
      c.db2 = c.db1 - c.fixMat - c.fixFert;
      c.db3 = c.db2 - c.werb;
      c.entw = einzel.fe * q;
      c.db4 = c.db3 - c.entw;
    }
    const db4 = sum(Object.values(ch).map((c) => c.db4));
    R.db = {
      ch,
      db4,
      forschung: kst.fe.summe,
      vertrieb: kst.vertrieb.summe,
      verwaltung: kst.verwaltung.summe,
      db5: db4 - kst.fe.summe - kst.vertrieb.summe - kst.verwaltung.summe
    };
    const sonstErtrag = n(D2.sonstErtrag) + cust.ertrag;
    const matAufwand = matVerbrauch + betriebsstoffe;
    const abschreibungen = geb + afaAnlagen;
    const sfixGes = kst.einkauf.sfix + kst.fertigung.sfix + kst.vertrieb.sfix + kst.verwaltung.sfix;
    const lagerK = lagerMatK + kst.vertrieb.lager;
    const sonstAufwand = sfixGes + lagerK + werbung + n(D2.ci) + einzel.fe + transport + cust.varSold + cust.varProd;
    const be = umsatz + sonstErtrag + bestVer - matAufwand - personalAufwand - abschreibungen - sonstAufwand;
    const nkEinzel = fertLohnEinzel * P.nk;
    const cv = cust.varSold + cust.varProd;
    R.koa = {
      einsatz: [matVerbrauch, 0, matVerbrauch],
      betrieb: [betriebsstoffe, 0, betriebsstoffe],
      lohn: [lohnSumme, lohnSumme - fertLohnEinzel, fertLohnEinzel],
      einEnt: [einEntSumme, einEntSumme, 0],
      nk: [nkSumme, nkSumme - nkEinzel, nkEinzel],
      geb: [geb, geb, 0],
      anl: [afaAnlagen, afaAnlagen, 0],
      feAfa: [0, 0, 0],
      sfix: [sfixGes, sfixGes, 0],
      lager: [lagerK, lagerK, 0],
      werbung: [werbung + n(D2.ci), n(D2.ci), werbung],
      fe: [einzel.fe, 0, einzel.fe],
      trans: [transport, 0, transport],
      eigen: [cv, 0, cv]
    };
    R.koa.summe = [0, 1, 2].map((i) => sum(Object.values(R.koa).map((r) => r[i])));
    R.fertLohnEinzel = fertLohnEinzel;
    const zinsLang = S.bilanz.lang * P.zinsLang;
    const kurz = Math.max(0, n(D2.kurzKredit));
    const zinsKurz = kurz * P.zinsKurz;
    const einUmsatzAkt = (umsOnline + umsEH) * P.zahlQuote + umsGA;
    const einUmsatzVor = S.bilanz.ford;
    const matAus = kauf * kaufPreis / 1e3 + jit * P.jitPreis / 1e3 + betriebsstoffe;
    const rueckzahlung = S.bilanz.kurz + S.bilanz.dispo;
    let dispo = 0, zinsDispo = 0, steuer = 0, gvst = 0, verlustNeu = S.verlustvortrag, kasse = 0;
    for (let i = 0; i < 300; i++) {
      zinsDispo = dispo * P.zinsDispo;
      gvst = be - zinsLang - zinsKurz - zinsDispo;
      const basis = gvst - S.verlustvortrag;
      steuer = basis > 0 ? basis * P.steuer : 0;
      verlustNeu = gvst >= 0 ? Math.max(0, S.verlustvortrag - gvst) : S.verlustvortrag - gvst;
      const ohneDispo = S.bilanz.kasse + einUmsatzAkt + einUmsatzVor + sonstErtrag + cust.einzahlung + desErloes + kurz - matAus - personalAufwand - sonstAufwand - rueckzahlung - zinsLang - zinsKurz - investSumme - cust.auszahlung - steuer - zinsDispo;
      const need = Math.max(0, P.minKasse - ohneDispo);
      kasse = ohneDispo + need;
      if (Math.abs(need - dispo) < 1e-9) {
        dispo = need;
        break;
      }
      dispo = need;
    }
    const finErg = -(zinsLang + zinsKurz + zinsDispo);
    const ju = gvst - steuer;
    R.guv = {
      umsatz,
      sonstErtrag,
      bestVer,
      matAufwand,
      personalAufwand,
      lohn: lohnSumme,
      einEnt: einEntSumme,
      nk: nkSumme,
      abschreibungen,
      sonstAufwand,
      be,
      finErg,
      zinsKurzLang: zinsLang + zinsKurz,
      zinsDispo,
      gvst,
      steuer,
      ju,
      ukv: { hkdu: hkduSumme, fe: einzel.fe + kst.fe.summe, vertrieb: einzel.vertrieb + kst.vertrieb.summe, verwaltung: kst.verwaltung.summe },
      gvVortragVor: S.bilanz.gvVortrag,
      gvVortrag: S.bilanz.gvVortrag + ju
    };
    R.liq = {
      kasseAnfang: S.bilanz.kasse,
      einUmsatzAkt,
      einUmsatzVor,
      zinsErtrag: 0,
      sonstEin: sonstErtrag + cust.einzahlung,
      desErloes,
      kreditAufnahme: kurz,
      dispo,
      matAus,
      einkaufVor: 0,
      personal: personalAufwand,
      sonstAus: sonstAufwand,
      rueckzahlung,
      zinsKredite: zinsLang + zinsKurz,
      invest: investSumme,
      sonstAuszahlung: cust.auszahlung,
      steuer,
      zinsDispo,
      kasseEnde: kasse
    };
    R.liq.summeEin = R.liq.kasseAnfang * 0 + einUmsatzAkt + einUmsatzVor + R.liq.sonstEin + desErloes + kurz + dispo;
    R.liq.summeAus = matAus + personalAufwand + sonstAufwand + rueckzahlung + zinsLang + zinsKurz + investSumme + cust.auszahlung + steuer + zinsDispo;
    const ford = (umsOnline + umsEH) * (1 - P.zahlQuote);
    const grund = Math.max(0, S.bilanz.grund - geb);
    const masch = sum(machines.map((m) => m.rbw));
    const ek = S.bilanz.gez + S.bilanz.krl + S.bilanz.grl + S.bilanz.gvVortrag + ju + n(D2.kapErhoehung);
    const bil = {
      grund,
      masch,
      av: grund + masch,
      mat: matEnd.value,
      fe: feEndWert,
      ford,
      wp: 0,
      kasse,
      gez: S.bilanz.gez,
      krl: S.bilanz.krl + n(D2.kapErhoehung),
      grl: S.bilanz.grl,
      gvVortragVor: S.bilanz.gvVortrag,
      ju,
      ek,
      lang: S.bilanz.lang,
      kurz,
      dispo
    };
    bil.uv = bil.mat + bil.fe + bil.ford + bil.wp + bil.kasse;
    bil.aktiva = bil.av + bil.uv;
    bil.fk = bil.lang + bil.kurz + bil.dispo;
    bil.passiva = bil.ek + bil.fk;
    R.bilanz = bil;
    R.bilanzVor = S.bilanz;
    const dMat = S.mat.value - matEnd.value, dFE = feStartWert - feEndWert, dFord = S.bilanz.ford - ford;
    const tradCF = ju + abschreibungen;
    const opCF = tradCF + dMat + dFE + dFord;
    const invCF = -investSumme + desErloes;
    const finCF = kurz + dispo - (S.bilanz.kurz + S.bilanz.dispo) + n(D2.kapErhoehung);
    R.cf = {
      ju,
      afa: abschreibungen,
      tradCF,
      dMat,
      dFE,
      dFord,
      opCF,
      invest: -investSumme + desErloes,
      invCF,
      kapErh: n(D2.kapErhoehung),
      dBank: kurz + dispo - (S.bilanz.kurz + S.bilanz.dispo),
      finCF,
      dKasse: opCF + invCF + finCF,
      fcf: opCF + invCF
    };
    const ekVor = S.bilanz.gez + S.bilanz.krl + S.bilanz.grl + S.bilanz.gvVortrag;
    R.kpi = {
      ju,
      absatzOnline: online,
      absatzEH: eh,
      absatzGA: gaMenge,
      umsatz,
      hkStk: R.ktr.hkStk,
      skStk: R.ktr.skStk,
      auslMA: R.fertigung.auslMA,
      auslAnlagen: R.fertigung.auslAnlagen,
      kasse,
      dispo,
      be,
      ekRendite: ekVor ? ju / ekVor * 100 : 0,
      umsatzRendite: umsatz ? ju / umsatz * 100 : 0,
      fkQuote: bil.passiva ? bil.fk / bil.passiva * 100 : 0,
      ek,
      db5Stk: sold ? R.db.db5 / sold * 1e3 : 0
    };
    const E = P.erfolgswert;
    R.kpi.erfolgswert = E.a + E.ju * ju + E.ek * ek + E.level * level;
    R.endState = {
      period: R.period,
      level,
      preisOnline,
      preisEH,
      fe: feEnd,
      mat: { qty: matEnd.qty, value: matEnd.value, preis: matAvg },
      machines: machines.map(({ afa, ...m }) => m),
      staff: { einkauf: ekSoll, verwaltung: vwSoll, fertigung: fertMA, kb: kbSoll, kbOnline: n(D2.kbOnline), kbEH: D2.ehAktiv ? n(D2.kbEH) : 0 },
      bilanz: { grund, ford, kasse, gez: bil.gez, krl: bil.krl, grl: bil.grl, gvVortrag: S.bilanz.gvVortrag + ju, lang: bil.lang, kurz, dispo },
      verlustvortrag: verlustNeu
    };
    return R;
  }

  // js/defaults.js
  var EINKAUF_TAB = [[2, 2], [4, 2.5], [6, 3], [8, 3.5], [10, 4], [12, 4.5], [14, 5], [18, 6], [22, 7]];
  var VERWALTUNG_TAB = [[2, 1], [4, 1.5], [6, 2], [8, 3], [10, 4], [12, 5.5], [14, 7], [18, 9.5], [22, 12]];
  var QUAL_KOSTEN = [16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40];
  var machineA = (nr, beschPeriode, rlz, fix = 40) => ({
    nr,
    typ: "A",
    beschPeriode,
    wert: 1250,
    afaRate: 125,
    rbw: rlz * 125,
    rlz,
    fix,
    cap: 12e3,
    rest: 25
  });
  function baseParams() {
    return {
      matStaffel: [[0, 41], [35e3, 37], [45e3, 35], [6e4, 33], [8e4, 31]],
      jitPreis: 50,
      betriebsstoff: 3,
      transOnline: 5,
      transEH: 4,
      lagerMat: 3,
      lagerFE: 5,
      gehalt: { einkauf: 37.2, verwaltung: 34, fertigung: 42.4, kb: 40.3 },
      nk: 0.3,
      einstellung: 15,
      entlassung: 10,
      prodMA: 2e3,
      ueberMax: 0.2,
      ueberZuschlag: 0.25,
      sfix: { einkauf: 50, fertigung: 50, vertrieb: 110, verwaltung: 100 },
      gebaeudeAfa: 30,
      gebaeudeSchluessel: { einkauf: 10, fertigung: 60, vertrieb: 20, verwaltung: 10 },
      anlagen: {
        A: { preis: 1250, dauer: 10, cap: 12e3, fix: 40, rest: 25 },
        B: { preis: 750, dauer: 10, cap: 6e3, fix: 25, rest: 25 }
      },
      qualKosten: [...QUAL_KOSTEN],
      fueProLevel: 100,
      maxLevelUp: 2,
      zinsDispo: 0.06,
      zinsLang: 0.04,
      zinsKurz: 0.05,
      steuer: 0.35,
      zahlQuote: 0.8,
      minKasse: 10,
      einkaufTab: EINKAUF_TAB.map((r) => [...r]),
      verwaltungTab: VERWALTUNG_TAB.map((r) => [...r]),
      erfolgswert: { a: -33, ju: 0.36, ek: 0.071, level: 13.9 }
    };
  }
  function emptyDecisions() {
    return {
      preisOnline: 0,
      ehAktiv: false,
      preisEH: 0,
      werbungOnline: 0,
      werbungEH: 0,
      kbOnline: 0,
      kbEH: 0,
      ci: 0,
      levelUp: 0,
      einkauf: 0,
      fertigung: 0,
      investA: 0,
      investB: 0,
      desinvest: [],
      fertigungMA: 0,
      absatzOnline: 0,
      absatzEH: 0,
      gaMenge: 0,
      gaPreis: 0,
      kurzKredit: 0,
      sonstErtrag: 0,
      kapErhoehung: 0
    };
  }
  var HISTORY = {
    0: {
      erfolgswert: 228.78,
      umsatz: 6e3,
      ju: 207.66,
      absatz: 4e4,
      absatzPlan: 4e4,
      marktanteil: 16.67,
      fertPlan: 41e3,
      fertIst: 41e3,
      lager: 1e3,
      auslMA: 89.13,
      auslAnlagen: 85.42,
      hkStk: 94.91,
      skStk: 139.47,
      db5Stk: 10.53,
      be: 421.01,
      ek: 2407.66,
      ekRendite: 9.44,
      umsatzRendite: 3.46,
      kasse: 10,
      dispo: 1192.25,
      finErg: -101.54,
      fkQuote: 44.65,
      preis: 150,
      level: 1
    }
  };
  function stateP0() {
    const q = 1e3 / 41e3;
    return {
      period: 0,
      level: 1,
      preisOnline: 150,
      preisEH: 0,
      fe: { qty: 1e3, varMat: 1558 * q, fixMat: 204.5 * q, varFert: 1066 * q, fixFert: 1063 * q },
      mat: { qty: 0, value: 0, preis: 35 },
      machines: [machineA(1, -9, 0, 200), machineA(2, -4, 5), machineA(3, -2, 7), machineA(4, 0, 9)],
      staff: { einkauf: 3, verwaltung: 2, fertigung: 23, kb: 8, kbOnline: 8, kbEH: 0 },
      bilanz: { grund: 420, ford: 1200, kasse: 10, gez: 700, krl: 1400, grl: 100, gvVortrag: 207.66, lang: 750, kurz: 0, dispo: 1192.25 },
      verlustvortrag: 0
    };
  }
  function paramsP1() {
    const p = baseParams();
    p.matStaffel = [[0, 38]];
    p.jitPreis = 35;
    p.transOnline = 3;
    p.transEH = 3;
    p.gehalt = { einkauf: 35, verwaltung: 32, fertigung: 40, kb: 38 };
    p.sfix = { einkauf: 50, fertigung: 50, vertrieb: 115, verwaltung: 100 };
    return p;
  }
  var DEC_HIST = {
    0: { ...emptyDecisions(), preisOnline: 150, werbungOnline: 300, kbOnline: 8, fertigung: 41e3, investA: 1, fertigungMA: 23, absatzOnline: 4e4 }
  };
  var mrow = (l, u, v, f) => ({ l, u, v, f });
  var markt = (p, L, W, K, pa, B, D2, A, ums, ma) => ({ cols: ["U1", "U2", "U3", "U4", "U5", "U6"], rows: [
    mrow("Preis", "EUR", p, 0),
    mrow("Produktqualit\xE4t", "Level", L, 0),
    mrow("Werbung", "TEUR", W, 0),
    mrow("Mitarbeiter Kundenbetreuung", "Anzahl", K, 1),
    mrow("Preis\xE4nderung", "%", pa, 2),
    mrow("Bekanntheit", "Index", B, 2),
    mrow("Potentieller Absatz", "St\xFCck", D2, 0),
    mrow("Tats\xE4chlicher Absatz", "St\xFCck", A, 0),
    mrow("Umsatz Markt", "TEUR", ums, 2),
    mrow("Marktanteil", "%", ma, 2)
  ] });
  var six = (x) => Array(6).fill(x);
  var MARKT = {
    0: markt(six(150), six(1), six(300), six(8), six(0), six(35), six(4e4), six(4e4), six(6e3), six(16.67))
  };

  // js/reports.js
  var nf = (v, d = 2) => v === null || v === void 0 || v === "" || Number.isNaN(v) ? "" : typeof v === "string" ? v : new Intl.NumberFormat("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d }).format(Math.abs(v) < 5e-3 && d === 2 ? 0 : v);
  var row = (l, u, v, f = 2, extra = {}) => ({ l, u, v: Array.isArray(v) ? v : [v], f, ...extra });
  var sec = (l, n) => ({ l, sec: true, v: Array(n).fill("") });
  function kpis(R, ctx) {
    const h = ctx.history[R.period - 1] || {};
    const r = (l, u, a, b, f = 2) => row(l, u, [a, b], f);
    return { id: "01", title: "\xDCbersicht KPIs", tables: [{ cols: ["Vorperiode", "Aktuelle Periode"], rows: [
      r("Perioden\xFCberschuss/-fehlbetrag", "TEUR", h.ju, R.kpi.ju),
      r("Absatz Superbass Online-Markt", "St\xFCck", h.absatzOnline ?? h.absatz, R.absatz.online, 0),
      r("Absatz Superbass Einzelhandel", "St\xFCck", h.absatzEH ?? 0, R.absatz.eh, 0),
      ...R.absatz.ga || h.absatzGA ? [r("Absatz Superbass Gro\xDFabnehmer", "St\xFCck", h.absatzGA ?? 0, R.absatz.ga, 0)] : [],
      r("Herstellkosten Superbass", "EUR/pro St\xFCck", h.hkStk, R.kpi.hkStk),
      r("Selbstkosten Superbass", "EUR/pro St\xFCck", h.skStk, R.kpi.skStk),
      r("Auslastung Fertigungsmitarbeiter", "%", h.auslMA, R.kpi.auslMA),
      r("Auslastung Anlagen", "%", h.auslAnlagen, R.kpi.auslAnlagen),
      r("Kassenendbestand", "TEUR", h.kasse, R.kpi.kasse),
      r("\xDCberziehungskredit", "TEUR", h.dispo, R.kpi.dispo),
      r("Eigenkapitalrendite", "%", h.ekRendite, R.kpi.ekRendite),
      { ...r(ctx.ist ? "Erfolgswert (TOPSIM)" : "Erfolgswert (Sch\xE4tzung)", "Index", h.erfolgswert, R.kpi.erfolgswert), b: true }
    ] }] };
  }
  function execSummary(period, history, R) {
    const ps = [];
    for (let p = 0; p <= period; p++)
      ps.push(p);
    const val = (p, k) => R && p === period ? R.kpiHist[k] : history[p]?.[k];
    const cols = ps.map((p) => `Periode ${p}`);
    const r = (l, u, k, f = 2) => row(l, u, ps.map((p) => val(p, k)), f);
    return { id: "01b", title: "Executive Summary", tables: [
      { title: "Allgemein", cols, rows: [r("Erfolgswert", "Index", "erfolgswert"), r("Umsatz Gesamt", "TEUR", "umsatz"), r("Perioden\xFCberschuss/-fehlbetrag", "TEUR", "ju")] },
      { title: "Markt", cols, rows: [r("Absatz Gesamt Superbass", "St\xFCck", "absatz", 0), r("Geplanter Absatz", "St\xFCck", "absatzPlan", 0), r("Marktanteil", "%", "marktanteil")] },
      { title: "Fertigung", cols, rows: [
        r("Geplante Fertigungsmenge", "St\xFCck", "fertPlan", 0),
        r("Tats\xE4chliche Fertigungsmenge", "St\xFCck", "fertIst", 0),
        r("Lagerendbestand Superbass", "St\xFCck", "lager", 0),
        r("Auslastung Mitarbeiter", "%", "auslMA"),
        r("Auslastung Anlagen", "%", "auslAnlagen")
      ] },
      { title: "Kostenstruktur", cols, rows: [
        r("Herstellkosten Superbass", "EUR/pro St\xFCck", "hkStk"),
        r("Selbstkosten Superbass", "EUR/pro St\xFCck", "skStk"),
        r("Deckungsbeitrag V Superbass", "EUR/pro St\xFCck", "db5Stk")
      ] },
      { title: "Erfolgskennzahlen", cols, rows: [
        r("Betriebsergebnis", "TEUR", "be"),
        r("Perioden\xFCberschuss/-fehlbetrag", "TEUR", "ju"),
        r("Eigenkapital", "TEUR", "ek"),
        r("Eigenkapitalrendite", "%", "ekRendite"),
        r("Umsatzrendite", "%", "umsatzRendite"),
        r("Erfolgswert", "Index", "erfolgswert")
      ] },
      { title: "Finanzen", cols, rows: [
        r("Kassenendbestand", "TEUR", "kasse"),
        r("\xDCberziehungskredit", "TEUR", "dispo"),
        r("Finanzergebnis", "TEUR", "finErg"),
        r("Fremdkapitalquote", "%", "fkQuote")
      ] }
    ] };
  }
  function kpiHistory(R, D2) {
    return {
      erfolgswert: R.kpi.erfolgswert,
      umsatz: R.guv.umsatz,
      ju: R.guv.ju,
      absatz: R.absatz.sold,
      absatzOnline: R.absatz.online,
      absatzEH: R.absatz.eh,
      absatzGA: R.absatz.ga,
      absatzPlan: (Number(D2.absatzOnline) || 0) + (D2.ehAktiv ? Number(D2.absatzEH) || 0 : 0),
      marktanteil: null,
      fertPlan: R.fertigung.plan,
      fertIst: R.fertigung.ist,
      lager: R.lagerFE.ende.qty,
      auslMA: R.kpi.auslMA,
      auslAnlagen: R.kpi.auslAnlagen,
      hkStk: R.kpi.hkStk,
      skStk: R.kpi.skStk,
      db5Stk: R.kpi.db5Stk,
      be: R.guv.be,
      ek: R.bilanz.ek,
      ekRendite: R.kpi.ekRendite,
      umsatzRendite: R.kpi.umsatzRendite,
      kasse: R.kpi.kasse,
      dispo: R.kpi.dispo,
      finErg: R.guv.finErg,
      fkQuote: R.kpi.fkQuote,
      preis: R.absatz.preisOnline,
      level: R.level.cur
    };
  }
  function markt2(R, ctx) {
    const m = ctx.markt;
    if (m && m.rows)
      return { id: "02", title: "Marktforschungsbericht", tables: [{ title: "Superbass - Online-Markt", cols: m.cols, rows: m.rows.map((x) => row(x.l, x.u, x.v, x.f)) }] };
    const D2 = ctx.D;
    return {
      id: "02",
      title: "Marktforschungsbericht",
      note: "Planwerte des eigenen Unternehmens. Konkurrenzdaten liegen erst nach der Simulation durch die Spielleitung vor.",
      tables: [
        { title: "Superbass - Online-Markt (eigenes Unternehmen)", cols: [ctx.unternehmen], rows: [
          row("Preis", "EUR", D2.preisOnline, 0),
          row("Produktqualit\xE4t", "Level", R.level.cur, 0),
          row("Werbung", "TEUR", D2.werbungOnline, 0),
          row("Mitarbeiter Kundenbetreuung", "Anzahl", D2.kbOnline, 1),
          row("Preis\xE4nderung", "%", ctx.S.preisOnline ? (D2.preisOnline / ctx.S.preisOnline - 1) * 100 : 0),
          row("Geplanter Absatz", "St\xFCck", R.absatz.onlinePlan, 0),
          row("Tats\xE4chlicher Absatz (Plan)", "St\xFCck", R.absatz.online, 0),
          row("Nicht gedeckte Nachfrage", "St\xFCck", R.absatz.onlinePlan - R.absatz.online, 0),
          row("Umsatz", "TEUR", R.absatz.umsOnline)
        ] },
        ...D2.ehAktiv ? [{ title: "Superbass - Einzelhandel (eigenes Unternehmen)", cols: [ctx.unternehmen], rows: [
          row("Preis", "EUR", D2.preisEH, 0),
          row("Werbung", "TEUR", D2.werbungEH, 0),
          row("Mitarbeiter Kundenbetreuung", "Anzahl", D2.kbEH, 1),
          row("Geplanter Absatz", "St\xFCck", R.absatz.ehPlan, 0),
          row("Tats\xE4chlicher Absatz (Plan)", "St\xFCck", R.absatz.eh, 0),
          row("Umsatz", "TEUR", R.absatz.umsEH)
        ] }] : []
      ]
    };
  }
  function fertigung(R) {
    const F = R.fertigung, ms = R.machines;
    const name = (m) => `Typ ${m.typ} Anlage Nr. ${m.nr}`;
    return { id: "03", title: "Fertigungsbericht", tables: [
      { title: "\xDCbersicht", cols: ["Superbass"], rows: [
        row("Geplante Fertigungsmenge", "St\xFCck", F.plan, 0),
        row("Tats\xE4chliche Fertigungsmenge", "St\xFCck", F.ist, 0),
        row("Auslastung Anlagen", "%", F.auslAnlagen),
        row("Auslastung Mitarbeiter", "%", F.auslMA)
      ] },
      {
        title: "Fertigungsanlagen",
        cols: ["Beschaff.-Periode", "Beschaffungswert TEUR", "Restlaufzeit Perioden", "Abschreibung TEUR/Periode", "Restbuchwert TEUR", "Sonstige fixe Kosten TEUR/Periode", "Resterl\xF6s % vom Buchwert"],
        noUnit: true,
        rows: [
          ...ms.map((m) => ({ l: name(m), v: [nf(m.beschPeriode, 0), m.wert, nf(m.rlz, 0), m.afa, m.rbw, m.fix, nf(m.rest, 1)], f: 2 })),
          { l: "Summe", v: ["", ms.reduce((s, m) => s + m.wert, 0), "", ms.reduce((s, m) => s + m.afa, 0), ms.reduce((s, m) => s + m.rbw, 0), ms.reduce((s, m) => s + m.fix, 0), ""], f: 2, b: true }
        ]
      },
      {
        title: "Kapazit\xE4t",
        cols: ["Normale Kapazit\xE4t St\xFCck", "Instandhaltung TEUR", "Faktor"],
        noUnit: true,
        rows: [...ms.map((m) => ({ l: name(m), v: [nf(m.cap, 0), 0, "1,00"], f: 2 })), { l: "Summe", v: [nf(F.kapAnlagen, 0), 0, ""], f: 2, b: true }]
      },
      { title: "Auslastung Fertigungsanlagen", cols: ["Superbass"], rows: [
        row("Geplante Fertigungsmenge", "St\xFCck", F.plan, 0),
        row("Kapazit\xE4t der Anlagen", "St\xFCck", F.kapAnlagen, 0),
        row("Tats\xE4chliche Fertigungsmenge", "St\xFCck", F.ist, 0),
        row("Ben\xF6tigte Anlagenkapazit\xE4t pro Fertigprodukt", "Anzahl pro Produkt", 1),
        row("Ben\xF6tigte Anlagenkapazit\xE4t Gesamt", "St\xFCck", F.ist, 0),
        row("Auslastung Anlagen", "%", F.auslAnlagen, 2, { b: true })
      ] },
      { title: "Auslastung Mitarbeiter", cols: ["Superbass"], rows: [
        row("Einsetzbares Personal (ohne \xDCberstunden)", "Anzahl", F.fertMA, 1),
        row("Einsetzbares Personal (inklusive \xDCberstunden)", "Anzahl", F.maxPersMA, 1),
        row("Fertigungskapazit\xE4t pro Mitarbeiter", "St\xFCck/Periode", 2e3, 0),
        row("Geplante Fertigungsmenge", "St\xFCck", F.plan, 0),
        row("Tats\xE4chliche Fertigungsmenge", "St\xFCck", F.ist, 0),
        row("Eingesetztes Personal (inklusive \xDCberstunden)", "Anzahl", F.eingesetzt, 1),
        row("Auslastung Mitarbeiter", "%", F.auslMA, 2, { b: true })
      ] }
    ] };
  }
  function fue(R, P) {
    return { id: "04", title: "Forschung & Entwicklung", tables: [{
      title: "Superbass",
      noUnit: true,
      cols: ["Stufe Vorperiode", "Stufe Aktuelle Periode", "Fixe Kosten TEUR", "Variable Kosten EUR/St\xFCck", "Variable Kosten TEUR"],
      rows: [{ l: "Produktqualit\xE4t", v: [
        nf(R.level.prev, 0),
        nf(R.level.cur, 0),
        R.level.up * P.fueProLevel,
        P.qualKosten[R.level.cur - 1],
        R.einzel.fe - R.level.up * P.fueProLevel
      ], f: 2 }]
    }] };
  }
  function lager(R) {
    const M = R.lagerMat, F = R.lagerFE;
    const pr = (w, q) => q ? w / q * 1e3 : 0;
    const cols = ["Menge St\xFCck", "EUR/pro St\xFCck", "TEUR"];
    return { id: "05", title: "Lager", tables: [
      { title: "\xDCbersicht Lagerbestand", cols: ["Superbass"], rows: [row("Lagerendbestand Einsatzstoffe", "St\xFCck", M.ende.qty, 0), row("Lagerendbestand Fertigerzeugnisse", "St\xFCck", F.ende.qty, 0)] },
      { title: "Einsatzstoffe/Teile Superbass", cols, noUnit: true, rows: [
        { l: "Lageranfangsbestand", v: [nf(M.anfang.qty, 0), M.anfang.preis, M.anfang.value] },
        { l: "+ Zugang von Lieferant", v: [nf(M.zugang, 0), M.zugangPreis, M.zugang * M.zugangPreis / 1e3] },
        { l: "+ Nachlieferung", v: [nf(M.jit, 0), M.jitPreis, M.jit * M.jitPreis / 1e3] },
        { l: "- Abgang an Fertigung", v: [nf(M.abgang, 0), M.avg, M.abgang * M.avg / 1e3] },
        { l: "= Lagerendbestand", v: [nf(M.ende.qty, 0), M.avg, M.ende.value], b: true }
      ] },
      { title: "Fertigprodukte Superbass", cols, noUnit: true, rows: [
        { l: "Lageranfangsbestand", v: [nf(F.anfang.qty, 0), pr(F.anfang.wert, F.anfang.qty), F.anfang.wert] },
        { l: "+ Zugang von Fertigung", v: [nf(F.zugang.qty, 0), pr(F.zugang.wert, F.zugang.qty), F.zugang.wert] },
        { l: "- Abgang an Vertrieb", v: [nf(F.abgang.qty, 0), pr(F.abgang.wert, F.abgang.qty), F.abgang.wert] },
        { l: "= Lagerendbestand", v: [nf(F.ende.qty, 0), pr(F.ende.wert, F.ende.qty) || pr(F.abgang.wert, F.abgang.qty), F.ende.wert], b: true }
      ] },
      { title: "Lagerkosten", cols: ["Alle Produkte"], rows: [
        row("Einsatzstoffe/Teile Superbass", "TEUR", R.kst.einkauf.lager),
        row("Fertigerzeugnisse Superbass", "TEUR", R.kst.vertrieb.lager),
        row("Gesamt", "TEUR", R.kst.einkauf.lager + R.kst.vertrieb.lager, 2, { b: true })
      ] }
    ] };
  }
  function personal(R, P) {
    const k = ["einkauf", "verwaltung", "fertigung", "kb"], p = R.personal;
    const line = (l, u, fn, f, b) => row(l, u, [...k.map((x) => fn(p[x])), k.reduce((s, x) => s + fn(p[x]), 0)], f, { b });
    const cols = ["Einkauf", "Verwaltung", "Fertigung", "Kundenbetreuer", "Summe"];
    return { id: "06", title: "Personal", tables: [
      { title: "Personalbestand", cols, rows: [
        line("Personalanfangsbestand", "Anzahl", (x) => x.anfang, 1),
        line("+ Einstellungen", "Anzahl", (x) => x.ein, 1),
        line("- Entlassungen", "Anzahl", (x) => x.ent, 1),
        line("- Fluktuation", "Anzahl", () => 0, 1),
        line("= Personalendbestand", "Anzahl", (x) => x.ende, 1, true)
      ] },
      {
        title: "Personalkosten",
        cols,
        rows: [
          line("L\xF6hne/Geh\xE4lter (*)", "TEUR", (x) => x.lohn, 2),
          line("Einstellungen/Entlassungen/Training", "TEUR", (x) => x.einEnt, 2),
          line("Personalnebenkosten (*)", "TEUR", (x) => x.nk, 2),
          line("Summe Personalkosten", "TEUR", (x) => x.lohn + x.einEnt + x.nk, 2, true)
        ],
        foot: "(*) ohne Kosten f\xFCr \xDCberstunden" + (p.ueberLohn ? ` \u2013 \xDCberstunden inkl. Zuschlag: ${nf(p.ueberLohn)} TEUR zzgl. Nebenkosten` : "")
      },
      { cols: [""], rows: [row("Personalnebenkosten in % der Geh\xE4lter", "", P.nk * 100)] }
    ] };
  }
  function kostenarten(R) {
    const K = R.koa, r = (l, x, b) => ({ l, v: x, f: 2, b, i: !b });
    const rows = [
      sec("Materialkosten", 3),
      r("Einsatzstoffe/Teile", K.einsatz),
      r("Betriebsstoffe", K.betrieb),
      sec("Personalkosten", 3),
      r("L\xF6hne/Geh\xE4lter (*)", K.lohn),
      r("Einstellungen/Entlassungen", K.einEnt),
      r("Personalnebenkosten", K.nk),
      sec("Abschreibungen", 3),
      r("Geb\xE4ude", K.geb),
      r("Fertigungsanlagen", K.anl),
      r("Fertigerzeugnisse", K.feAfa),
      sec("Sonstige Kosten", 3),
      r("Sonstige fixe Kosten", K.sfix),
      r("Lagerkosten", K.lager),
      r("Werbung/Corporate Identity", K.werbung),
      r("Sonstige Kosten F&E", K.fe),
      r("Transportkosten", K.trans)
    ];
    if (K.eigen[0])
      rows.push(r("Eigene variable Kosten", K.eigen));
    rows.push(r("Summe", K.summe, true));
    return { id: "07", title: "Kostenartenrechnung (TEUR)", tables: [{ cols: ["Summe", "Gemeinkosten", "Einzelkosten Superbass"], noUnit: true, rows, foot: "(*) Mit Kosten f\xFCr \xDCberstunden" }] };
  }
  function kostenstellen(R) {
    const ks = ["einkauf", "fertigung", "fe", "vertrieb", "verwaltung"], K = R.kst;
    const r = (l, key) => {
      const v = ks.map((k) => K[k][key] || 0);
      return { l, v: [v.reduce((a, b) => a + b, 0), ...v], f: 2, i: true };
    };
    const z = (l) => ({ l, v: [0, 0, 0, 0, 0, 0], f: 2, i: true });
    const tot = ks.map((k) => K[k].summe);
    return { id: "08", title: "Kostenstellenrechnung (TEUR)", tables: [{ cols: ["Summe", "Einkauf", "Fertigung", "F&E", "Vertrieb", "Verwaltung"], noUnit: true, rows: [
      sec("Materialkosten", 6),
      z("Einsatzstoffe/Teile"),
      z("Betriebsstoffe"),
      sec("Personalkosten", 6),
      r("L\xF6hne/Geh\xE4lter (*)", "lohn"),
      r("Einstellungen/Entlassungen", "einEnt"),
      r("Personalnebenkosten", "nk"),
      sec("Abschreibungen", 6),
      r("Geb\xE4ude", "geb"),
      r("Fertigungsanlagen", "anl"),
      z("Fertigerzeugnisse"),
      sec("Sonstige Kosten", 6),
      r("Sonstige fixe Kosten", "sfix"),
      r("Lagerkosten", "lager"),
      r("Werbung/Corporate Identity", "werbung"),
      z("Sonstige Kosten F&E"),
      z("Transportkosten"),
      { l: "Summe der Kosten", v: [tot.reduce((a, b) => a + b, 0), ...tot], f: 2, b: true }
    ], foot: "(*) Mit Kosten f\xFCr \xDCberstunden" }] };
  }
  function kostentraeger(R) {
    const E = R.einzel, K = R.kst, H2 = R.hk, prod = R.fertigung.ist, sold = R.absatz.sold;
    const lines2 = [
      ["+ Einkauf", "Einzelkosten", E.einkauf, prod],
      ["+ Einkauf", "Gemeinkosten", K.einkauf.summe, prod],
      ["+ Fertigung", "Einzelkosten", E.fertigung, prod],
      ["+ Fertigung", "Gemeinkosten", K.fertigung.summe, prod]
    ];
    const after = [
      ["+ F&E", "Einzelkosten", E.fe],
      ["+ F&E", "Gemeinkosten", K.fe.summe],
      ["+ Vertrieb", "Einzelkosten", E.vertrieb],
      ["+ Vertrieb", "Gemeinkosten", K.vertrieb.summe],
      ["+ Verwaltung", "Einzelkosten", E.verwaltung],
      ["+ Verwaltung", "Gemeinkosten", K.verwaltung.summe]
    ];
    const stk = (v, q) => q ? v / q * 1e3 : 0;
    return { id: "09", title: "Kostentr\xE4gerrechnung", tables: [
      { title: "Gesamt (TEUR)", cols: ["Summe", "Superbass"], unitHead: "Allokation", rows: [
        ...lines2.map(([l, a, v]) => ({ l, u: a, v: [v, v] })),
        { l: "= Herstellkosten", v: [H2.hk, H2.hk], b: true },
        { l: "+/- Bestandver\xE4nderung Fertigprodukte", v: [-H2.bestVer, -H2.bestVer] },
        { l: "= Herstellkosten des Umsatzes", v: [H2.hkduSumme, H2.hkduSumme], b: true },
        ...after.map(([l, a, v]) => ({ l, u: a, v: [v, v] })),
        { l: "= Selbstkosten", v: [R.ktr.selbstkosten, R.ktr.selbstkosten], b: true }
      ].map((x) => ({ f: 2, ...x })) },
      {
        title: "Pro St\xFCck (EUR)",
        cols: ["Superbass"],
        unitHead: "Allokation",
        rows: [
          ...lines2.map(([l, a, v]) => ({ l, u: a, v: [stk(v, prod)] })),
          { l: "= Herstellkosten (*)", v: [R.ktr.hkStk], b: true },
          { l: "= Herstellkosten des Umsatzes (**)", v: [R.ktr.hkduStk], b: true },
          ...after.map(([l, a, v]) => ({ l, u: a, v: [stk(v, sold)] })),
          { l: "= Selbstkosten (**)", v: [R.ktr.skStk], b: true }
        ].map((x) => ({ f: 2, ...x })),
        foot: "(*) Die Herstellkosten der Produktion werden in das Verh\xE4ltnis zur produzierten Menge gesetzt. (**) Die Herstellkosten des Umsatzes sowie die Selbstkosten werden in das Verh\xE4ltnis zur abgesetzten Menge gesetzt."
      }
    ] };
  }
  function deckung(R) {
    const order = ["online", "ga", "aus", "eh", "sonder"], C = R.db.ch, D2 = R.db;
    const cols = ["Online-Markt", "Gro\xDFabnehmer", "Ausschreibung", "Einzelhandel", "Sondermarkt"];
    const tot = (k) => order.reduce((s, c) => s + C[c][k], 0);
    const L = (l, k, b) => ({ l, v: [...order.map((c) => C[c][k]), tot(k)], f: 2, b });
    const S = (l, v, b) => ({ l, v: ["", "", "", "", "", v], f: 2, b });
    const sold = R.absatz.sold;
    const P = (l, k, b) => ({ l, v: [...order.map((c) => C[c].u ? C[c][k] / C[c].u * 1e3 : 0), sold ? tot(k) / sold * 1e3 : 0], f: 2, b });
    const SP = (l, v, b) => ({ l, v: ["", "", "", "", "", sold ? v / sold * 1e3 : 0], f: 2, b });
    return { id: "10", title: "Deckungsbeitragsrechnung", tables: [
      { title: "Superbass - Deckungsbeitragsrechnung Gesamt (TEUR)", cols: [...cols, "Summe"], noUnit: true, rows: [
        L("Umsatzerl\xF6se", "ums"),
        L("- Variable Materialkosten", "varMat"),
        L("- Variable Fertigungskosten", "varFert"),
        L("- Transportkosten", "trans"),
        L("= Deckungsbeitrag I", "db1", true),
        L("- Fixe Materialkosten", "fixMat"),
        L("- Fixe Fertigungskosten", "fixFert"),
        L("= Deckungsbeitrag II", "db2", true),
        L("- Werbungskosten", "werb"),
        L("= Deckungsbeitrag III", "db3", true),
        L("- Entwicklungskosten", "entw"),
        L("= Deckungsbeitrag IV", "db4", true),
        S("- Forschungskosten", D2.forschung),
        S("- Vertriebskosten", D2.vertrieb),
        S("- Verwaltungskosten", D2.verwaltung),
        S("= Deckungsbeitrag V", D2.db5, true)
      ] },
      { title: "Superbass - Deckungsbeitragsrechnung pro St\xFCck (EUR)", cols: [...cols, "\xF8-Wert"], noUnit: true, rows: [
        P("Preis", "ums"),
        P("- Variable Materialkosten", "varMat"),
        P("- Variable Fertigungskosten", "varFert"),
        P("- Transportkosten", "trans"),
        P("= Deckungsbeitrag I", "db1", true),
        P("- Fixe Materialkosten", "fixMat"),
        P("- Fixe Fertigungskosten", "fixFert"),
        P("= Deckungsbeitrag II", "db2", true),
        P("- Werbungskosten", "werb"),
        P("= Deckungsbeitrag III", "db3", true),
        P("- Entwicklungskosten", "entw"),
        P("= Deckungsbeitrag IV", "db4", true),
        SP("- Forschungskosten", D2.forschung),
        SP("- Vertriebskosten", D2.vertrieb),
        SP("- Verwaltungskosten", D2.verwaltung),
        SP("= Deckungsbeitrag V", D2.db5, true)
      ] }
    ] };
  }
  function guv(R) {
    const G = R.guv, U = G.umsatz, pc = (v) => U ? v / U * 100 : 0;
    const r2 = (l, v, b, i, noPc) => ({ l, v: [v, noPc ? "" : pc(v)], f: 2, b, i });
    return { id: "11", title: "Gewinn- und Verlustrechnung", tables: [
      { title: "Gesamtkostenverfahren", cols: ["TEUR", "% vom Umsatz"], noUnit: true, rows: [
        r2("Umsatzerl\xF6se", U),
        r2("+ Sonstige Ertr\xE4ge", G.sonstErtrag),
        r2("+ Erh\xF6hung/Verminderung des Bestandes an Fertigerzeugnissen", G.bestVer),
        r2("- Materialaufwand", G.matAufwand),
        r2("- Personalaufwand", G.personalAufwand),
        r2("- L\xF6hne/Geh\xE4lter", G.lohn, false, true, true),
        r2("- Einstellungskosten/Entlassungskosten", G.einEnt, false, true, true),
        r2("- Sonstige Personalkosten", G.nk, false, true, true),
        r2("- Abschreibungen", G.abschreibungen),
        r2("- Sonstiger Aufwand", G.sonstAufwand),
        r2("= Betriebsergebnis", G.be, true)
      ] },
      { title: "Umsatzkostenverfahren", cols: ["TEUR"], noUnit: true, rows: [
        { l: "Umsatzerl\xF6se", v: [U] },
        { l: "+ Sonstige Ertr\xE4ge", v: [G.sonstErtrag] },
        { l: "- Herstellkosten des Umsatzes", v: [G.ukv.hkdu] },
        { l: "- F&E", v: [G.ukv.fe] },
        { l: "- Vertrieb", v: [G.ukv.vertrieb] },
        { l: "- Verwaltung", v: [G.ukv.verwaltung] },
        { l: "= Betriebsergebnis", v: [G.be], b: true }
      ].map((x) => ({ f: 2, ...x })) },
      { title: "Perioden\xFCberschuss/-fehlbetrag", cols: ["TEUR", "% vom Umsatz"], noUnit: true, rows: [
        r2("Betriebsergebnis", G.be),
        r2("- Finanzergebnis", G.finErg),
        r2("+ Ertr\xE4ge aus Wertpapieren", 0, false, true),
        r2("- Zinsen f\xFCr kurz- und langfristige Kredite", G.zinsKurzLang, false, true),
        r2("- Zinsen f\xFCr \xDCberziehungskredit", G.zinsDispo, false, true),
        r2("= Gewinn vor Steuern", G.gvst, true),
        r2("- Steuern auf Einkommen und Ertrag", G.steuer),
        r2("= Perioden\xFCberschuss/-fehlbetrag", G.ju, true)
      ] },
      { title: "Ergebnisverwendung", cols: ["TEUR"], noUnit: true, rows: [
        { l: "Gewinn-/Verlustvortrag der Vorperiode", v: [G.gvVortragVor] },
        { l: "+ Perioden\xFCberschuss/-fehlbetrag", v: [G.ju] },
        { l: "= Gewinn-/Verlustvortrag", v: [G.gvVortrag], b: true }
      ].map((x) => ({ f: 2, ...x })) }
    ] };
  }
  function liquiditaet(R, P) {
    const L = R.liq, r = (l, v, b) => ({ l, v: [v], f: 2, b });
    return { id: "12", title: "Liquidit\xE4tsrechnung", tables: [
      { cols: ["TEUR"], noUnit: true, rows: [r("Kassenanfangsbestand", L.kasseAnfang)] },
      { title: "Einzahlungen", cols: ["TEUR"], noUnit: true, rows: [
        r("Einzahlungen aus Umsatz Aktuelle Periode", L.einUmsatzAkt),
        r("Einzahlungen aus Umsatz Vorperiode", L.einUmsatzVor),
        r("Zinsertr\xE4ge", 0),
        r("Sonstige Einzahlungen/Kapitalerh\xF6hung", L.sonstEin),
        r("Desinvestitionen Fertigungsanlagen", L.desErloes),
        r("Aufnahme kurzfristige und langfristige Kredite", L.kreditAufnahme),
        r("\xDCberziehungskredit", L.dispo),
        r("Summe Einzahlungen", L.summeEin, true)
      ] },
      { title: "Auszahlungen", cols: ["TEUR"], noUnit: true, rows: [
        r("Einsatzstoffe, Betriebsstoffe, Fertigerzeugnisse", L.matAus),
        r("Einkauf Vorperiode", 0),
        r("Personalkosten", L.personal),
        r("Sonstige Aufwendungen", L.sonstAus),
        r("R\xFCckzahlung kurzfristige Kredite & \xDCberziehungskredit", L.rueckzahlung),
        r("Zinsaufwand kurzfristige und langfristige Kredite", L.zinsKredite),
        r("Kauf von Fertigungsanlagen", L.invest),
        r("Sonstige Auszahlungen", L.sonstAuszahlung),
        r("Steuern auf Einkommen und Ertrag", L.steuer),
        r("Zinszahlung \xDCberziehungskredit", L.zinsDispo),
        r("Summe Auszahlungen", L.summeAus, true)
      ] },
      { cols: ["TEUR"], noUnit: true, rows: [r("Kassenendbestand", L.kasseEnde, true)] },
      { title: "Zahlungskonditionen", cols: ["% in der aktuellen Periode"], noUnit: true, rows: [
        { l: "Kunden Online-Markt Einzelhandel (Einzahlungen)", v: [P.zahlQuote * 100], f: 1 },
        { l: "Lieferant Einsatzstoffe Superbass (Auszahlungen)", v: [100], f: 1 }
      ] }
    ] };
  }
  function cashflow(R) {
    const C = R.cf, r = (l, v, b) => ({ l, v: [v], f: 2, b });
    return { id: "14", title: "Cashflow Statement", tables: [{ cols: ["TEUR"], noUnit: true, rows: [
      r("Perioden\xFCberschuss/-fehlbetrag", C.ju),
      r("+ Abschreibung auf Anlageverm\xF6gen", C.afa),
      r("Traditioneller Cashflow", C.tradCF, true),
      r("+ Erh\xF6hung(-) /Abbau(+) Vorr\xE4te an Materialien", C.dMat),
      r("+ Erh\xF6hung(-) /Abbau(+) Vorr\xE4te an Fertige Erzeugnisse", C.dFE),
      r("+ Erh\xF6hung(-) /Abbau(+) Forderungen aus Lieferungen und Leistungen", C.dFord),
      r("A. Operativer Cashflow", C.opCF, true),
      r("+ Investitionen in Anlageverm\xF6gen", C.invest),
      r("B. Cashflow aus Investitionst\xE4tigkeiten", C.invCF, true),
      r("+ Kapitalerh\xF6hungen", C.kapErh),
      r("+ Zahlung Dividende aus Vorperiode", 0),
      r("+ Erh\xF6hung(-) / Abbau(+) der Wertpapiere", 0),
      r("+ Erh\xF6hung(+) / Abbau(-) der Bankverbindlichkeiten", C.dBank),
      r("C. Cashflow aus Finanzierungst\xE4tigkeit", C.finCF, true),
      r("D. Ver\xE4nderung des Kassenbestandes (A+B+C)", C.dKasse, true),
      r("Free Cashflow (A+B)", C.fcf, true)
    ] }] };
  }
  function bilanzReport(B, V) {
    const v = V || {};
    const ekV = v.gez !== void 0 ? v.gez + v.krl + v.grl + v.gvVortrag : void 0;
    const r = (l, a, b, bold, i) => ({ l, v: [a, b], f: 2, b: bold, i });
    const prevAV = v.grund !== void 0 ? v.grund + (v.masch ?? 0) : void 0;
    return { id: "15", title: "Bilanz", tables: [
      { title: "Aktiva (TEUR)", cols: ["Aktuelle Periode", "Vorperiode"], noUnit: true, rows: [
        r("Anlageverm\xF6gen", B.av, v.masch !== void 0 ? prevAV : "", true),
        r("Grundst\xFCcke und Bauten", B.grund, v.grund, false, true),
        r("Maschinen und Betriebsausstattung", B.masch, v.masch, false, true),
        r("Umlaufverm\xF6gen", B.uv, v.uv, true),
        r("Materialien", B.mat, v.mat, false, true),
        r("Fertige Erzeugnisse", B.fe, v.fe, false, true),
        r("Forderungen aus Lieferungen & Leistungen", B.ford, v.ford, false, true),
        r("Wertpapiere", 0, v.ford !== void 0 ? 0 : "", false, true),
        r("Kassenbestand", B.kasse, v.kasse, false, true),
        r("Bilanzsumme", B.aktiva, v.aktiva, true)
      ] },
      { title: "Passiva (TEUR)", cols: ["Aktuelle Periode", "Vorperiode"], noUnit: true, rows: [
        r("Eigenkapital", B.ek, ekV, true),
        r("Gezeichnetes Kapital", B.gez, v.gez, false, true),
        r("Kapitalr\xFCcklage", B.krl, v.krl, false, true),
        r("Gewinnr\xFCcklage", B.grl, v.grl, false, true),
        r("Gewinn-/Verlustvortrag", B.gvVortragVor, v.gvVortragVor, false, true),
        r("Perioden\xFCberschuss/-fehlbetrag", B.ju, v.ju, false, true),
        r("Verbindlichkeiten", B.fk, v.lang !== void 0 ? v.lang + v.kurz + v.dispo : "", true),
        r("Restlaufzeit \xFCber 10 Perioden", B.lang, v.lang, false, true),
        r("Restlaufzeit unter 1 Periode", B.kurz, v.kurz, false, true),
        r("\xDCberziehungskredit", B.dispo, v.dispo, false, true),
        r("Bilanzsumme", B.passiva, v.aktiva, true)
      ] }
    ] };
  }
  function branche(ctx) {
    const b = ctx.branche;
    if (!b || !b.rows)
      return { id: "16", title: "Gesch\xE4ftsbericht der Branche", note: "Liegt erst nach der Simulation vor. F\xFCr abgeschlossene Perioden \xFCber \u201EDaten & Import\u201C einf\xFCgen.", tables: [] };
    return { id: "16", title: "Gesch\xE4ftsbericht der Branche", tables: [{ title: "Umsatzkostenverfahren und Bilanz (TEUR)", cols: b.cols, noUnit: true, rows: b.rows.map((x) => ({ l: x.l, v: x.v, f: 2, b: x.b })) }] };
  }
  function protokoll(ctx) {
    const ps = Object.keys(ctx.decHist).map(Number).sort((a, b) => a - b);
    const cols = ps.map((p) => `P${p}`);
    const g = (k, f = 0, fn) => ({ v: ps.map((p) => {
      const d = ctx.decHist[p];
      const x = fn ? fn(d) : d?.[k];
      return x ?? "";
    }), f });
    const r = (l, u, k, f, fn) => ({ l, u, ...g(k, f, fn) });
    return { id: "19", title: "Entscheidungsprotokoll", tables: [
      { title: "Marketing-Mix", cols, rows: [
        r("Preis Online-Markt", "EUR", "preisOnline"),
        r("Werbung Online-Markt", "TEUR", "werbungOnline"),
        r("Kundenbetreuer Online-Markt", "Anzahl", "kbOnline", 1),
        r("Aktiv im Einzelhandel", "", null, 0, (d) => d ? d.ehAktiv ? "Ja" : "Nein" : ""),
        r("Preis Einzelhandel", "EUR", null, 0, (d) => d?.ehAktiv ? d.preisEH : 0),
        r("Werbung Einzelhandel", "TEUR", null, 0, (d) => d?.ehAktiv ? d.werbungEH : 0),
        r("Kundenbetreuer Einzelhandel", "Anzahl", null, 1, (d) => d?.ehAktiv ? d.kbEH : 0),
        r("Corporate Identity", "TEUR", "ci")
      ] },
      { title: "Produktentwicklung", cols, rows: [r("Produktqualit\xE4t Level Zuwachs", "", null, 0, (d) => d ? "+" + (d.levelUp || 0) : "")] },
      { title: "Gro\xDFabnehmer", cols, rows: [r("Gro\xDFabnehmer", "St\xFCck", "gaMenge")] },
      { title: "Einkauf und Fertigung", cols, rows: [r("Einsatzstoffe/Teile", "Einheit", "einkauf"), r("Fertigungsmenge", "St\xFCck", "fertigung")] },
      { title: "Fertigungsanlagen", cols, rows: [
        r("Investition Typ A", "Anzahl", "investA"),
        r("Investition Typ B", "Anzahl", "investB"),
        r("Desinvestitionen", "Anlage Nr.", null, 0, (d) => (d?.desinvest || []).join(", "))
      ] },
      { title: "Personal", cols, rows: [r("Fertigungspersonal", "Anzahl", "fertigungMA", 1)] },
      { title: "Planwerte", cols, rows: [r("Angenommener Absatz Online-Markt", "St\xFCck", "absatzOnline"), r("Angenommener Absatz Einzelhandel", "St\xFCck", "absatzEH")] }
    ] };
  }
  function erfolgswert(R, P, ctx) {
    const E = P.erfolgswert, h = ctx.history;
    const prev = h[R.period - 1]?.erfolgswert;
    return {
      id: "EW",
      title: "Erfolgswert-Sch\xE4tzung",
      note: "TOPSIM ver\xF6ffentlicht die Erfolgswert-Formel nicht. Die Sch\xE4tzung ist eine Regression \xFCber die Ergebnisse aller Unternehmen aus P1 und P2 (Abweichung ca. \xB112 Punkte). Planungsqualit\xE4t, Bekanntheit und Fremdkapitalquote flie\xDFen nur indirekt ein. Die Koeffizienten lassen sich unter Einstellungen anpassen.",
      tables: [{ cols: ["Wert", "Gewicht", "Beitrag"], noUnit: true, rows: [
        { l: "Konstante", v: ["", "", E.a], f: 2 },
        { l: "Jahres\xFCberschuss (TEUR)", v: [R.guv.ju, nf(E.ju, 3), E.ju * R.guv.ju], f: 2 },
        { l: "Eigenkapital (TEUR)", v: [R.bilanz.ek, nf(E.ek, 3), E.ek * R.bilanz.ek], f: 2 },
        { l: "Produktqualit\xE4t (Level)", v: [nf(R.level.cur, 0), nf(E.level, 1), E.level * R.level.cur], f: 2 },
        { l: "= Gesch\xE4tzter Erfolgswert", v: ["", "", R.kpi.erfolgswert], f: 2, b: true },
        { l: "Erfolgswert Vorperiode (TOPSIM)", v: ["", "", prev ?? ""], f: 2 }
      ] }]
    };
  }
  function buildReports(R, ctx) {
    const P = ctx.P;
    R.kpiHist = kpiHistory(R, ctx.D);
    const real = ctx.ist ? ctx.history[R.period] : null;
    if (real) {
      if (real.erfolgswert !== void 0) {
        R.kpi.erfolgswertSchaetzung = R.kpi.erfolgswert;
        R.kpi.erfolgswert = real.erfolgswert;
        R.kpiHist.erfolgswert = real.erfolgswert;
      }
      if (real.marktanteil !== void 0)
        R.kpiHist.marktanteil = real.marktanteil;
      if (real.absatzPlan !== void 0)
        R.kpiHist.absatzPlan = real.absatzPlan;
    }
    const hist = { ...ctx.history, [R.period]: R.kpiHist };
    return [
      kpis(R, ctx),
      execSummary(R.period, hist, R),
      markt2(R, ctx),
      fertigung(R),
      fue(R, P),
      lager(R),
      personal(R, P),
      kostenarten(R),
      kostenstellen(R),
      kostentraeger(R),
      deckung(R),
      guv(R),
      liquiditaet(R, P),
      cashflow(R),
      bilanzReport(R.bilanz, {
        ...R.bilanzVor,
        masch: ctx.S.machines.reduce((s, m) => s + m.rbw, 0),
        mat: ctx.S.mat.value,
        fe: ["varMat", "fixMat", "varFert", "fixFert"].reduce((s, c) => s + (ctx.S.fe[c] || 0), 0),
        ...(() => {
          const b = R.bilanzVor;
          const fe = ["varMat", "fixMat", "varFert", "fixFert"].reduce((s, c) => s + (ctx.S.fe[c] || 0), 0);
          const masch = ctx.S.machines.reduce((s, m) => s + m.rbw, 0);
          const uv = ctx.S.mat.value + fe + b.ford + b.kasse;
          const gvPrev = ctx.history[R.period - 1]?.ju;
          return { uv, aktiva: b.grund + masch + uv, gvVortragVor: gvPrev !== void 0 ? b.gvVortrag - gvPrev : "", ju: gvPrev ?? "" };
        })()
      }),
      branche(ctx),
      protokoll({ ...ctx, decHist: { ...ctx.decHist, [R.period]: ctx.D } }),
      erfolgswert(R, P, ctx)
    ];
  }

  // js/importer.js
  var NUM = /-?\d{1,3}(?:\.\d{3})*(?:,\d+)?|-?\d+(?:,\d+)?/g;
  var toNum = (s) => Number(String(s).replace(/\./g, "").replace(",", "."));
  async function pdfToText(file) {
    const pdfjs = window.pdfjsLib;
    pdfjs.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const out = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const lines2 = [];
      for (const it of tc.items) {
        if (!it.str || !it.str.trim())
          continue;
        const y = it.transform[5], x = it.transform[4];
        let ln = lines2.find((l) => Math.abs(l.y - y) < 2.5);
        if (!ln) {
          ln = { y, items: [] };
          lines2.push(ln);
        }
        ln.items.push({ x, w: it.width, s: it.str });
      }
      lines2.sort((a, b) => b.y - a.y);
      for (const l of lines2) {
        l.items.sort((a, b) => a.x - b.x);
        let s = "", end = null;
        for (const it of l.items) {
          if (end !== null)
            s += it.x - end > 4 ? "    " : it.x - end > 0.8 ? " " : "";
          s += it.s;
          end = it.x + it.w;
        }
        out.push(s);
      }
    }
    return out.join("\n");
  }
  function blocks(text) {
    const res = {};
    const parts = text.split(/(?=TNB\d{2}\s*:)/);
    for (const part of parts) {
      const m = part.match(/^TNB(\d{2})/);
      if (!m)
        continue;
      res[m[1]] = (res[m[1]] || "") + "\n" + part;
    }
    return res;
  }
  var lines = (t2) => (t2 || "").split(/\r?\n/).map((l) => l.replace(/\t/g, "    ").replace(/ /g, " "));
  var norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
  function nums(t2, label, { contains = false, nth = 0 } = {}) {
    const L = lines(t2), want = norm(label);
    let hit = 0;
    for (const raw of L) {
      const l = norm(raw);
      const pos = contains ? l.indexOf(want) : l.startsWith(want) ? 0 : -1;
      if (pos < 0)
        continue;
      const found = (l.slice(pos + want.length).match(NUM) || []).map(toNum);
      if (!found.length)
        continue;
      if (hit++ < nth)
        continue;
      return found;
    }
    return null;
  }
  var last = (a) => a && a.length ? a[a.length - 1] : void 0;
  function parseReports(text) {
    const B = blocks(text);
    const out = { found: Object.keys(B).sort(), warnings: [] };
    const per = text.match(/Periode:\s*(\d+)/);
    out.period = per ? Number(per[1]) : null;
    const unt = text.match(/Unternehmen\s+(\d)/);
    out.unternehmen = unt ? Number(unt[1]) : null;
    if (B["01"]) {
      const t2 = B["01"];
      const hp = (t2.match(/Periode \d+/g) || []).map((s) => Number(s.split(" ")[1]));
      const ps = [...new Set(hp)].filter((p) => p !== out.period || true).sort((a, b) => a - b);
      const H2 = {};
      const take = (key, label, opt) => {
        let v = null;
        for (const lb of [].concat(label)) {
          v = nums(t2, lb, opt);
          if (v)
            break;
        }
        if (!v)
          return;
        const vv = v.slice(-ps.length);
        vv.forEach((x, i) => {
          var _a;
          (H2[_a = ps[ps.length - vv.length + i]] || (H2[_a] = {}))[key] = x;
        });
      };
      take("erfolgswert", "Erfolgswert");
      take("umsatz", "Umsatz Gesamt");
      take("ju", "Perioden\xFCberschuss/-");
      take("absatz", "Absatz Gesamt");
      take("absatzPlan", "Geplanter Absatz");
      take("marktanteil", "Marktanteil");
      take("fertPlan", "Geplante Fertigungsmenge");
      take("fertIst", ["Tats\xE4chliche Fertigungsmenge", "Tats\xE4chliche St\xFCck"]);
      take("lager", "Lagerendbestand");
      take("auslMA", "Auslastung Mitarbeiter");
      take("auslAnlagen", "Auslastung Anlagen");
      take("hkStk", "Herstellkosten");
      take("skStk", "Selbstkosten");
      take("db5Stk", "Deckungsbeitrag V");
      take("be", "Betriebsergebnis");
      take("ek", "Eigenkapital ");
      take("ekRendite", "Eigenkapitalrendite");
      take("umsatzRendite", "Umsatzrendite");
      take("kasse", "Kassenendbestand");
      take("dispo", "\xDCberziehungskredit");
      take("finErg", "Finanzergebnis");
      take("fkQuote", "Fremdkapitalquote");
      out.history = H2;
    }
    if (B["02"]) {
      const t2 = B["02"];
      const cols = ["U1", "U2", "U3", "U4", "U5", "U6"];
      const defs = [
        ["Preis", "EUR", "Preis ", 0],
        ["Produktqualit\xE4t", "Level", "Produktqualit\xE4t", 0],
        ["Werbung", "TEUR", "Werbung", 0],
        ["Mitarbeiter Kundenbetreuung", "Anzahl", "Mitarbeiter", 1],
        ["Preis\xE4nderung", "%", "Preis\xE4nderung", 2],
        ["Bekanntheit", "Index", "Bekanntheit", 2],
        ["Potentieller Absatz", "St\xFCck", "Potentieller", 0],
        ["Tats\xE4chlicher Absatz", "St\xFCck", "Tats\xE4chlicher", 0],
        ["Umsatz Markt", "TEUR", "Umsatz", 2],
        ["Marktanteil", "%", "Marktanteil", 2]
      ];
      const rows = [];
      for (const [l, u, lab, f] of defs) {
        const v = nums(t2, lab);
        if (v && v.length >= 6)
          rows.push({ l, u, v: v.slice(0, 6), f });
      }
      if (rows.length)
        out.markt = { cols, rows };
    }
    if (B["03"]) {
      const t2 = B["03"];
      const ms = [];
      let nr = 0;
      for (const raw of lines(t2)) {
        const m = raw.match(/Typ\s+([A-Z])\s+Anlage(?:\s+Nr\.\s*(\d+))?\s+(-?\d+)\s+([\d.,]+)\s+(\d+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/);
        if (!m)
          continue;
        nr = m[2] ? Number(m[2]) : nr + 1;
        ms.push({
          nr,
          typ: m[1],
          beschPeriode: Number(m[3]),
          wert: toNum(m[4]),
          rlz: Number(m[5]),
          afaRate: toNum(m[6]) || toNum(m[4]) / 10,
          rbw: toNum(m[7]),
          fix: toNum(m[8]),
          rest: toNum(m[9]),
          cap: m[1] === "B" ? 6e3 : 12e3
        });
      }
      for (const raw of lines(t2)) {
        const m = raw.match(/Typ\s+([A-Z])\s+Anlage\s+Nr\.\s*(\d+)\s+([\d.]+)\s+[\d,]+\s+[\d,]+\s*$/);
        if (m) {
          const x = ms.find((q) => q.nr === Number(m[2]));
          if (x)
            x.cap = toNum(m[3]);
        }
      }
      if (ms.length)
        out.machines = ms;
      const fp = nums(t2, "Einsetzbares Personal (ohne");
      if (fp)
        out.fertMA = last(fp);
    }
    if (B["04"]) {
      const v = nums(B["04"], "Produktqualit\xE4t");
      if (v && v.length >= 2) {
        out.levelPrev = v[0];
        out.level = v[1];
        out.qualKostenStk = v[3];
        out.fueFix = v[2];
      }
    }
    if (B["05"]) {
      const t2 = B["05"];
      const m0 = nums(t2, "= Lagerendbestand", { nth: 0 }), f0 = nums(t2, "= Lagerendbestand", { nth: 1 });
      const zug = nums(t2, "+ Zugang von Lieferant"), jit = nums(t2, "+ Nachlieferung");
      if (m0)
        out.mat = { qty: m0[0], preis: m0[1], value: m0[2] };
      if (f0)
        out.fe = { qty: f0[0], preis: f0[1], value: f0[2] };
      if (zug)
        out.matKauf = { qty: zug[0], preis: zug[1] };
      if (jit)
        out.jit = { qty: jit[0], preis: jit[1] };
    }
    if (B["06"]) {
      const t2 = B["06"];
      let end = null;
      for (const raw of lines(t2)) {
        const m = norm(raw).match(/^=\s*(personalendbestand)?\s*anzahl\s+(.*)$/);
        if (m) {
          end = (m[2].match(NUM) || []).map(toNum);
          break;
        }
      }
      if (!end) {
        const L = lines(t2);
        const i = L.findIndex((l) => /^\s*=\s+Anzahl/.test(l));
        if (i >= 0)
          end = (L[i].match(NUM) || []).map(toNum);
      }
      if (end && end.length >= 4)
        out.staff = { einkauf: end[0], verwaltung: end[1], fertigung: end[2], kb: end[3] };
      const lohn = nums(t2, "L\xF6hne/Geh\xE4lter");
      if (lohn && end)
        out.gehalt = { einkauf: lohn[0] / end[0], verwaltung: lohn[1] / end[1], fertigung: lohn[2] / end[2], kb: lohn[3] / end[3] };
    }
    if (B["08"]) {
      const v = nums(B["08"], "Sonstige fixe");
      if (v && v.length >= 6)
        out.sfixKst = { einkauf: v[1], fertigung: v[2], vertrieb: v[4], verwaltung: v[5] };
    }
    if (B["09"]) {
      const t2 = B["09"];
      const ek = nums(t2, "+ Einkauf", { nth: 0 }), eg = nums(t2, "+ Einkauf", { nth: 1 }), fk = nums(t2, "+ Fertigung", { nth: 0 }), fg = nums(t2, "+ Fertigung", { nth: 1 });
      if (ek && eg && fk && fg)
        out.hkComp = { varMat: ek[0], fixMat: eg[0], varFert: fk[0], fixFert: fg[0] };
    }
    if (B["10"]) {
      const t2 = B["10"];
      const tr = nums(t2, "- Transportkosten", { nth: 1 });
      if (tr && tr.length >= 4) {
        out.transOnline = tr[0];
        out.transEH = tr[3];
      }
      const pr = nums(t2, "Preis");
      if (pr && pr.length >= 4) {
        out.preisOnline = pr[0];
        out.preisEH = pr[3];
      }
      const ums = nums(t2, "Umsatzerl\xF6se");
      if (ums && ums.length >= 4)
        out.umsatzKanal = { online: ums[0], ga: ums[1], eh: ums[3] };
    }
    if (B["11"]) {
      const t2 = B["11"];
      const se = nums(t2, "+ Sonstige Ertr\xE4ge");
      if (se)
        out.sonstErtrag = se[0];
      const gv = nums(t2, "= Gewinn-/Verlustvortrag");
      if (gv)
        out.gvVortrag = gv[0];
      const ju = nums(t2, "= Perioden\xFCberschuss");
      if (ju)
        out.ju = ju[0];
    }
    if (B["15"]) {
      const t2 = B["15"];
      const a = (label, opt) => {
        const v = nums(t2, label, { contains: true, ...opt });
        return v ? v[0] : void 0;
      };
      out.bilanz = {
        grund: a("Grundst\xFCcke und"),
        ford: a("Forderungen aus"),
        kasse: a("Kassenbestand"),
        gez: a("Gezeichnetes Kapital"),
        krl: a("Kapitalr\xFCcklage"),
        grl: a("Gewinnr\xFCcklage"),
        lang: a("Restlaufzeit \xFCber 10"),
        kurz: a("Restlaufzeit unter 1"),
        dispo: a("\xDCberziehungskredit"),
        mat: a("Materialien"),
        fe: a("Fertige Erzeugnisse")
      };
    }
    if (B["16"]) {
      const t2 = B["16"];
      const defs = [
        "Umsatzerl\xF6se",
        "+ Sonstige",
        "- Herstellkosten",
        "- F&E",
        "- Vertrieb",
        "- Verwaltung",
        "Betriebsergebnis",
        "+ Finanzergebnis",
        "Gewinn vor",
        "- Steuern",
        "Perioden\xFCberschuss/-",
        "Anlageverm\xF6gen",
        "Umlaufverm\xF6gen",
        "Bilanzsumme",
        "Eigenkapital",
        "Verbindlichkeiten",
        "\xDCberziehungskredit"
      ];
      const rows = [];
      for (const d of defs) {
        const v = nums(t2, d, { contains: true });
        if (v && v.length >= 6)
          rows.push({ l: d.replace(/^[-+=]\s*/, ""), v: v.slice(-6), b: /ergebnis|überschuss|summe/i.test(d) });
      }
      if (rows.length)
        out.branche = { cols: ["U1", "U2", "U3", "U4", "U5", "U6"], rows };
    }
    if (B["19"]) {
      const t2 = B["19"];
      const hp = [...new Set((t2.match(/\bP\s?(\d+)\b/g) || []).map((s) => Number(s.replace(/\D/g, ""))))].sort((a, b) => a - b);
      const dec = {};
      const take = (key, labels, opt) => {
        for (const label of [].concat(labels)) {
          const v = nums(t2, label, opt);
          if (!v || !hp.length)
            continue;
          const vv = v.slice(-hp.length);
          vv.forEach((x, i) => {
            var _a;
            (dec[_a = hp[hp.length - vv.length + i]] || (dec[_a] = {}))[key] = x;
          });
          return;
        }
      };
      take("preisOnline", "Preis Online-Markt");
      take("werbungOnline", "Werbung Online-");
      take("kbOnline", "Kundenbetreuer", {});
      take("kbEH", "Kundenbetreuer", { nth: 1 });
      take("ci", "Corporate Identity");
      take("levelUp", ["Produktqualit\xE4t Level", "Produktqualit\xE4t"]);
      take("gaMenge", "Gro\xDFabnehmer ");
      take("einkauf", "Einsatzstoffe/Teile");
      take("fertigung", "Fertigungsmenge");
      take("investA", ["Investition (Anz. neue Anlagen) Typ A", "Investition (Anz. Typ A"]);
      take("investB", ["Investition (Anz. neue Anlagen) Typ B", "Investition (Anz. Typ B"]);
      if (dec[hp[0]]?.investA === void 0) {
        take("investA", "Investition (Anz. neue", { nth: 0 });
        take("investB", "Investition (Anz. neue", { nth: 1 });
      }
      take("fertigungMA", "Fertigungspersonal");
      take("preisEH", "Preis Einzelhandel");
      take("werbungEH", ["Werbung Einzelhandel", "Werbung Superbass"]);
      out.decisions = dec;
    }
    if (!out.found.length)
      out.warnings.push("Keine TOPSIM-Berichte erkannt. Bitte den Sammelbericht als PDF hochladen oder den Text vollst\xE4ndig einf\xFCgen.");
    return out;
  }
  function stateFromImport(x, prev) {
    if (!x.bilanz || !x.fe || !x.staff || !x.machines)
      return null;
    const comp = x.hkComp;
    const tot = comp ? comp.varMat + comp.fixMat + comp.varFert + comp.fixFert : 0;
    const share = (k) => tot ? x.fe.value * comp[k] / tot : k === "varMat" ? x.fe.value : 0;
    const kbEH = x.decisions?.[x.period]?.kbEH ?? prev?.staff?.kbEH ?? 0;
    return {
      period: x.period,
      level: x.level ?? prev?.level ?? 1,
      preisOnline: x.preisOnline ?? prev?.preisOnline ?? 0,
      preisEH: x.preisEH ?? 0,
      fe: { qty: x.fe.qty, varMat: share("varMat"), fixMat: share("fixMat"), varFert: share("varFert"), fixFert: share("fixFert") },
      mat: { qty: x.mat?.qty ?? 0, value: x.mat?.value ?? 0, preis: x.mat?.preis ?? 0 },
      machines: x.machines.map((m) => ({ ...m })),
      staff: { ...x.staff, kbOnline: x.staff.kb - kbEH, kbEH },
      bilanz: {
        grund: x.bilanz.grund,
        ford: x.bilanz.ford,
        kasse: x.bilanz.kasse,
        gez: x.bilanz.gez,
        krl: x.bilanz.krl,
        grl: x.bilanz.grl,
        gvVortrag: x.gvVortrag ?? 0,
        lang: x.bilanz.lang,
        kurz: x.bilanz.kurz || 0,
        dispo: x.bilanz.dispo || 0
      },
      verlustvortrag: Math.max(0, -(x.gvVortrag ?? 0))
    };
  }

  // js/pdf.js
  var BLUE = [31, 90, 166];
  function cell(v, f) {
    return typeof v === "number" ? nf(v, f ?? 2) : v ?? "";
  }
  function reportPdf(rep, meta, doc) {
    const { jsPDF } = window.jspdf;
    const own = !doc;
    doc = doc || new jsPDF({ orientation: rep.tables.some((t2) => t2.cols.length > 4) ? "landscape" : "portrait", unit: "mm", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const header = () => {
      doc.setFillColor(10, 125, 194);
      doc.rect(0, 0, W, 3, "F");
      doc.setFontSize(8.5);
      doc.setTextColor(90);
      doc.text(`${meta.firma} \u2013 ${meta.unternehmen}`, 12, 9);
      doc.text(`Periode: ${meta.period}${meta.plan ? " (Planungsrechnung)" : ""}`, W - 12, 9, { align: "right" });
      if (meta.scenario)
        doc.text(`Szenario: ${meta.scenario}`, W / 2, 9, { align: "center" });
    };
    header();
    doc.setFontSize(18);
    doc.setTextColor(20);
    doc.text(rep.title, 12, 20);
    let y = 26;
    if (rep.note) {
      doc.setFontSize(8.5);
      doc.setTextColor(80);
      const t2 = doc.splitTextToSize(rep.note, W - 24);
      doc.text(t2, 12, y);
      y += t2.length * 4 + 2;
    }
    for (const tb of rep.tables) {
      if (tb.title) {
        doc.setFontSize(11);
        doc.setTextColor(20);
        doc.text(tb.title, 12, y + 4);
        y += 6;
      }
      const hasUnit = !tb.noUnit;
      const head = [["", ...hasUnit ? [tb.unitHead || ""] : [], ...tb.cols]];
      const body = tb.rows.map((r) => [r.l, ...hasUnit ? [r.u || ""] : [], ...r.v.map((v) => r.sec ? "" : cell(v, r.f))]);
      doc.autoTable({
        head,
        body,
        startY: y,
        margin: { left: 12, right: 12, top: 14 },
        theme: "grid",
        styles: { fontSize: 8, cellPadding: 1.4, lineColor: [220, 228, 236], lineWidth: 0.1, textColor: 30 },
        headStyles: { fillColor: BLUE, textColor: 255, halign: "right", fontStyle: "bold" },
        columnStyles: { 0: { halign: "left", cellWidth: tb.cols.length > 5 ? 52 : "auto" }, ...hasUnit ? { 1: { halign: "right", fontStyle: "italic", textColor: 110 } } : {} },
        didParseCell: (d) => {
          if (d.section === "head" && d.column.index === 0)
            d.cell.styles.fillColor = [255, 255, 255];
          if (d.section !== "body")
            return;
          const r = tb.rows[d.row.index];
          if (d.column.index > 0 && !(hasUnit && d.column.index === 1))
            d.cell.styles.halign = "right";
          if (r.b)
            d.cell.styles.fontStyle = "bold";
          if (r.sec) {
            d.cell.styles.fillColor = [212, 218, 224];
            d.cell.styles.fontStyle = "bold";
          }
          if (r.i && d.column.index === 0)
            d.cell.styles.cellPadding = { left: 4, top: 1.4, bottom: 1.4, right: 1.4 };
        },
        didDrawPage: () => header()
      });
      y = doc.lastAutoTable.finalY + 3;
      if (tb.foot) {
        doc.setFontSize(7.5);
        doc.setTextColor(100);
        const t2 = doc.splitTextToSize(tb.foot, W - 24);
        doc.text(t2, 12, y + 2);
        y += t2.length * 3.5 + 2;
      }
      y += 4;
    }
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFontSize(7.5);
      doc.setTextColor(130);
      doc.text(`TONWERK Planrechner \xB7 erstellt ${(/* @__PURE__ */ new Date()).toLocaleString("de-DE")} \xB7 Seite ${i}/${pages}`, 12, doc.internal.pageSize.getHeight() - 6);
    }
    return own ? doc : doc;
  }
  var safe = (s) => s.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ß/g, "ss").replace(/[\\/:*?"<>|&]/g, "").trim().replace(/\s+/g, "_");
  async function downloadZip(reports, meta) {
    const zip = new window.JSZip();
    const folder = zip.folder(safe(`${meta.firma}_Periode_${meta.period}${meta.scenario ? "_" + meta.scenario : ""}`));
    reports.forEach((rep, i) => {
      if (!rep.tables.length && !rep.note)
        return;
      const doc = reportPdf(rep, meta);
      folder.file(`${String(i + 1).padStart(2, "0")}_${safe(rep.title.replace(/\(TEUR\)/, "").trim())}.pdf`, doc.output("arraybuffer"));
    });
    const blob = await zip.generateAsync({ type: "blob" });
    save(blob, safe(`${meta.firma}_Berichte_Periode_${meta.period}${meta.scenario ? "_" + meta.scenario : ""}.zip`));
  }
  function downloadSingle(rep, meta) {
    const doc = reportPdf(rep, meta);
    save(doc.output("blob"), safe(`${meta.firma}_P${meta.period}_${rep.title.replace(/\(TEUR\)/, "").trim()}.pdf`));
  }
  function save(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4e3);
  }
  function spickzettelPdf(masks, meta) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    doc.setFillColor(10, 125, 194);
    doc.rect(0, 0, W, 3, "F");
    doc.setFontSize(16);
    doc.setTextColor(20);
    doc.text(`Eingabe-Spickzettel Periode ${meta.period}`, 12, 14);
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text(`${meta.firma} \u2013 ${meta.unternehmen} \xB7 Szenario: ${meta.scenario}${meta.saved ? "" : " (Achtung: es gibt ungespeicherte \xC4nderungen, gedruckt wird der gespeicherte Stand)"}`, 12, 20);
    let y = 25;
    masks.forEach((m, mi) => {
      const body = [];
      m.sections.forEach((s) => {
        body.push([{ content: s.h.toUpperCase(), colSpan: 2, styles: { fillColor: [232, 240, 248], fontStyle: "bold", textColor: [31, 90, 166] } }]);
        s.rows.forEach((r) => body.push([r[0], r[1]]));
      });
      doc.autoTable({
        head: [[`${mi + 1}. ${m.title}`, "Eingabe"]],
        body,
        startY: y,
        margin: { left: 12, right: 12 },
        theme: "grid",
        styles: { fontSize: 9, cellPadding: 1.6, lineColor: [220, 228, 236], lineWidth: 0.1, textColor: 30 },
        headStyles: { fillColor: BLUE, textColor: 255, fontStyle: "bold" },
        columnStyles: { 0: { cellWidth: 125 }, 1: { halign: "right", fontStyle: "bold" } }
      });
      y = doc.lastAutoTable.finalY + 5;
    });
    doc.setFontSize(7.5);
    doc.setTextColor(130);
    doc.text(`TONWERK Planrechner \xB7 erstellt ${(/* @__PURE__ */ new Date()).toLocaleString("de-DE")} \xB7 Werte vor dem Absenden in TOPSIM mit \u201ESpeichern\u201C je Maske best\xE4tigen`, 12, doc.internal.pageSize.getHeight() - 6);
    save(doc.output("blob"), safe(`${meta.firma}_Spickzettel_P${meta.period}_${meta.scenario}.pdf`));
  }

  // js/i18n.js
  var lang = "de";
  var setLang = (l) => {
    lang = l === "bar" ? "bar" : "de";
  };
  var getLang = () => lang;
  var BAR = {
    "Periode": "Periodn",
    "Planperiode": "Planperiodn",
    "abgeschlossen": "erledigt",
    "Vertrieb und Produktentwicklung": "Vatrieb und Produktentwicklung",
    "Einkauf und Fertigung": "Eikauf und Fertigung",
    "Finanzen und Planwerte": "Finanzn und Planwert",
    "Zur\xFCcksetzen": "Zruckstoin",
    "Speichern": "Obspeichan",
    "Nicht gespeichert": "No ned gspeichert",
    "Gespeichert": "Gspeichert",
    "Szenario": "Szenario",
    "Auswertung": "Auswertung",
    "Simulieren \xB7 \xDCbersicht KPIs": "Durchrechna \xB7 Kennzahln",
    "Berichtswesen": "Berichtl",
    "Szenarien & Vergleich": "Szenarien & Vergleich",
    "Rahmendaten der Periode": "Rahmendatn vo da Periodn",
    "Verwaltung": "Verwaltung",
    "Daten & Import": "Datn & Eiles",
    "Einstellungen": "Eistellunga",
    "Hilfe & Spielregeln": "Huif & Spuiregln",
    "Hilfe": "Huif",
    "Feld": "Feid",
    "eigenes Feld": "eigns Feid",
    "Bearbeiten": "\xC4ndan",
    "L\xF6schen": "Weg damit",
    "Preis/Werbung": "Preis/Werbung",
    "Vertrieb": "Vatrieb",
    "Corporate Identity": "Corporate Identity",
    "Produktentwicklung": "Produktentwicklung",
    "Gro\xDFabnehmer": "Gro\xDFobnehma",
    "Einkauf": "Eikauf",
    "Fertigung": "Fertigung",
    "Fertigungsanlagen": "Maschina",
    "Desinvestitionen": "Maschina vakaffa",
    "Personal": "Leit",
    "Finanzen": "Finanzn",
    "Planwerte": "Planwert",
    "Superbass": "Superbass",
    "Eingabe": "Eingob",
    "Online-Markt": "Online-Markt",
    "Einzelhandel": "Einzlhandl",
    "Typ A": "Typ A",
    "Typ B": "Typ B",
    "Preis Online-Markt (EUR)": "Preis im Online-Ladl (EUR)",
    "Aktiv im Einzelhandel": "Im Einzlhandl dabei",
    "Preis Einzelhandel (EUR)": "Preis im Einzlhandl (EUR)",
    "Werbung Online-Markt (TEUR)": "Werbung online (TEUR)",
    "Werbung Einzelhandel (TEUR)": "Werbung Einzlhandl (TEUR)",
    "Kundenbetreuer (Anz. Personen)": "Kundnbetreia (Leit)",
    "Corporate Identity (TEUR)": "Corporate Identity (TEUR)",
    "Zuwachs Produktqualit\xE4t (Level)": "Mehr Qualit\xE4t (Level)",
    "Liefermenge Gro\xDFabnehmer (St\xFCck)": "Liefermeng f\xFCrn Gro\xDFobnehma (St\xFCck)",
    "Preis Gro\xDFabnehmer (EUR)": "Preis f\xFCrn Gro\xDFobnehma (EUR)",
    "Einsatzstoffe/Teile (Einheit)": "Eisatzstoff/Teil (St\xFCck)",
    "Fertigungsmenge (St\xFCck)": "Fertigungsmeng (St\xFCck)",
    "Investition (Anz. neue Anlagen)": "Neie Maschina (Anzahl)",
    "Fertigungspersonal (Anz. Personen)": "Leit in da Fertigung",
    "Kurzfristiger Kredit (TEUR)": "Kurzer Kredit (TEUR)",
    "Angenommener Absatz Superbass Online-Markt (St\xFCck)": "Gsch\xE4tzter Absatz online (St\xFCck)",
    "Angenommener Absatz Superbass Einzelhandel (St\xFCck)": "Gsch\xE4tzter Absatz Einzlhandl (St\xFCck)",
    "Entscheidung, ob Einzelhandel bedient werden soll.": "Obs an Einzlhandl beliefat wern soi.",
    "Anlage Nr.": "Maschin Nr.",
    "Restlaufzeit (in Perioden)": "Laaft no (Periodn)",
    "Restbuchwert (TEUR)": "Restwert (TEUR)",
    "Desinvestieren?": "Vakaffa?",
    "Plan-J\xDC": "Plan-Gwinn",
    "Umsatz": "Umsatz",
    "\xDCberziehung": "\xDCberziehung",
    "Lager": "Lager",
    "HK": "HK",
    "SK": "SK",
    "Erfolgswert \u2248": "Erfolgswert \u2248",
    "J\xDC": "Gwinn",
    "Dispo": "Dispo",
    "Download: alle Berichte": "Obalon: olle Berichtl",
    "Einzelbericht": "Oas Berichtl",
    "Drucken": "Drucka",
    "Planungsrechnung": "Planungsrechnung",
    "nachgerechnet, stimmt mit TOPSIM \xFCberein": "nochgrechnet, passt mit TOPSIM zam",
    "Abweichung zu TOPSIM": "Unterschied zu TOPSIM",
    "Zum Berichtswesen": "Zu de Berichtl",
    "Neues Szenario": "Neis Szenario",
    "Aktuelles duplizieren": "Des do kopiern",
    "Umbenennen": "Umtaufa",
    "Als Teamentscheidung markieren": "Des nehma ma",
    "Alle Szenarien der Periode": "Olle Szenarien vo da Periodn",
    "TOPSIM-Berichte einf\xFCgen": "TOPSIM-Berichtl eiles",
    "Dateien w\xE4hlen": "Dateien aussuacha",
    "Einlesen": "Eiles",
    "PDF-Dateien hierher ziehen oder": "PDF-Dateien do eine ziagn oder",
    "Stand der Perioden": "Stand vo de Periodn",
    "Endstand": "Endstand",
    "Alle Berichte": "Olle Berichtl",
    "Endstand bearbeiten": "Endstand \xE4ndan",
    "Sicherung": "Sicherung",
    "Sicherung exportieren": "Sicherung obalon",
    "Sicherung importieren": "Sicherung eiles",
    "Alles zur\xFCcksetzen": "Ois auf Anfang",
    "Erkannt": "Gfundn",
    "Berichte": "Berichtl",
    "\xDCbernehmen": "\xDCbanehma",
    "Verwerfen": "Wegschmei\xDFn",
    "\xFCbernommen": "\xFCbanumma",
    "Darstellung": "Ausschaun",
    "Hell": "Hell",
    "Dunkel": "Dunkl",
    "Mitternacht": "Mitternacht",
    "Sprache": "Sproch",
    "Unternehmen": "Firma",
    "Marke": "Mark",
    "App installieren": "App installiern",
    "Jetzt installieren": "Glei installiern",
    "\xDCber": "\xDCber",
    "Feld bearbeiten": "Feid \xE4ndan",
    "Neues Eingabefeld": "Neis Eingobfeid",
    "Bezeichnung": "Nam",
    "Einheit": "Einheit",
    "Wirkung in der Rechnung": "Wos des in da Rechnung macht",
    "Standardwert": "Standardwert",
    "Kostenstelle (bei fixen Kosten)": "Kostnstoi (bei fixe Kostn)",
    "Nachkommastellen": "Stoin nachm Komma",
    "Hinweis (optional)": "Hinweis (wennst mogst)",
    "Abbrechen": "Loss ma",
    "Feld gespeichert": "Feid gspeichert",
    "Dieses Feld l\xF6schen?": "Des Feid wegmacha?",
    "Szenario l\xF6schen?": "Szenario wegmacha?",
    "Ungespeicherte \xC4nderungen verwerfen?": "De ned gspeichertn \xC4nderunga wegschmei\xDFn?",
    "Neuer Name": "Neier Nam",
    "Neues Feld": "Neis Feid",
    "Neue Version verf\xFCgbar.": "Es gibt a neie Version.",
    "Neu laden": "Nei lon",
    "Sicherung importiert": "Sicherung eiglesn",
    "Die Datei ist keine g\xFCltige Sicherung.": "De Datei is koa gscheide Sicherung.",
    "Mengenstaffel Einsatzstoffe": "Mengenstaffl Eisatzstoff",
    "Staffel": "Staffl",
    "Nur Info (keine Rechenwirkung)": "Blo\xDF zur Info (rechnet ned mit)",
    "Fixe Kosten (TEUR) in Kostenstelle": "Fixe Kostn (TEUR) in da Kostnstoi",
    "Kosten je verkauftem St\xFCck (EUR)": "Kostn pro vakaftm St\xFCck (EUR)",
    "Kosten je gefertigtem St\xFCck (EUR)": "Kostn pro gmachtm St\xFCck (EUR)",
    "Sonstiger Ertrag (TEUR)": "Sonstiga Ertrag (TEUR)",
    "Einzahlung ohne Ertrag (TEUR)": "Geld kimmt eina, ohne Ertrag (TEUR)",
    "Auszahlung ohne Aufwand (TEUR)": "Geld geht ausse, ohne Aufwand (TEUR)",
    "So funktioniert der Planrechner": "So geht da Planrechner",
    "Spielregeln (Teilnehmerhandbuch)": "Spuiregln (Handbuach)",
    "Fertig": "Passt",
    "Gesamt": "Gsamt",
    "Absatz": "Absatz",
    "Erfolgswert (Sch\xE4tzung)": "Erfolgswert (gsch\xE4tzt)",
    "Perioden\xFCberschuss/-fehlbetrag": "Gwinn/Verlust vo da Periodn",
    "Absatz gesamt": "Absatz gsamt",
    "Preis Online": "Preis online",
    "Lagerendbestand": "Lager am End",
    "Herstellkosten": "Herstellkostn",
    "Selbstkosten": "Selbstkostn",
    "Betriebsergebnis": "Betriebsergebnis",
    "\xDCberziehungskredit": "\xDCberziehungskredit",
    "Eigenkapital": "Eignkapital",
    "Fremdkapitalquote": "Fremdkapitalquote",
    "Eigenkapitalrendite": "Eigenkapitalrendite",
    "Produktqualit\xE4t": "Qualit\xE4t"
  };
  var BAR_SENTENCES = {
    "Rahmendaten f\xFCr Periode": "Rahmendatn f\xFCr Periodn",
    "Neue Werte aus den Wirtschaftsnachrichten (z. B. Inflation, Staffelpreise, Geh\xE4lter) hier eintragen. Sie gelten f\xFCr alle Szenarien dieser Periode.": "Neie Wert aus de Wirtschaftsnachrichtn (Inflation, Staffelpreis, Geh\xE4lter) do eitrogn. De geltn f\xFCr olle Szenarien vo dera Periodn.",
    "Alle Daten liegen nur auf diesem Ger\xE4t (im Browser). F\xFCr ein anderes Ger\xE4t oder als Sicherung exportieren und dort importieren.": "De Datn liegn blo\xDF auf dem Ger\xE4t (im Browser). F\xFCrs andre Ger\xE4t oder zur Sicherheit obalon und dr\xFCben wieder eiles.",
    "Sammelbericht als PDF hochladen (auch mehrere Einzelberichte gleichzeitig) oder den Berichtstext kopieren und einf\xFCgen. Periode und Inhalte werden automatisch erkannt. Damit lassen sich auch vergangene Perioden nachtragen.": "Sammelbericht ois PDF auffelon (geht a mit mehrane Einzelberichtl) oder an Text kopiern und eif\xFCgn. Periodn und Inhalt findt er selba. So kannst a oide Periodn nochtrogn.",
    "\u2026 oder Text der Berichte hier einf\xFCgen (Strg+V)": "\u2026 oder an Text vo de Berichtl do eif\xFCgn (Strg+V)",
    "nebeneinander (wie \u201E\xDCbernehmen\u201C in TOPSIM). Gr\xFCn = bester Wert. Gerechnet wird mit dem aktuellen Bearbeitungsstand.": "nebananda (wia \u201E\xDCbernehmen\u201C in TOPSIM). Grea = da beste Wert. Grechnet werd mim aktuelln Stand.",
    "Windows/Android: in Edge oder Chrome auf \u201EApp installieren\u201C tippen. iPhone/iPad: in Safari \u201ETeilen\u201C \u2192 \u201EZum Home-Bildschirm\u201C.": "Windows/Android: in Edge oder Chrome auf \u201EApp installieren\u201C drucka. iPhone/iPad: in Safari \u201ETeilen\u201C \u2192 \u201EZum Home-Bildschirm\u201C.",
    "Entscheidungen in den drei Masken eintragen \u2013 genau wie in TOPSIM. Das Ergebnis unten rechnet sofort mit.": "De Entscheidunga in de drei Masken eitrogn \u2013 genau wia in TOPSIM. Untn rechnet er glei mit.",
    "\u201ESpeichern\u201C \xFCbernimmt den Stand ins Szenario. Mehrere Szenarien lassen sich anlegen und vergleichen.": "\u201EObspeichan\u201C legt an Stand ins Szenario. Mehrane Szenarien kannst olegn und vergleicha.",
    "Unter \u201EBerichtswesen\u201C stehen alle TOPSIM-Berichte, als ZIP mit Einzel-PDFs herunterladbar.": "Unter \u201EBerichtl\u201C stengan olle TOPSIM-Berichte, ois ZIP mit einzelne PDFs zum Obalon.",
    "Nach jeder Periode den neuen Sammelbericht unter \u201EDaten & Import\u201C einf\xFCgen. Dann beginnt die n\xE4chste Planperiode.": "No jeda Periodn an neien Sammelbericht unter \u201EDatn & Eiles\u201C eif\xFCgn. Dann fangt de n\xE4chste Planperiodn o.",
    "Neue Eingabefelder (z. B. aus neuen TOPSIM-Masken) \xFCber \u201E+ Feld\u201C in jeder Kategorie anlegen.": "Neie Eingobfeider (z. B. aus neie TOPSIM-Masken) \xFCber \u201E+ Feid\u201C in jeda Kategorie olegn.",
    "Nur Kennzahlen und Bilanz vorhanden. F\xFCr alle Berichte den Sammelbericht unter \u201EDaten & Import\u201C einf\xFCgen.": "Blo\xDF Kennzahln und Bilanz do. F\xFCr olle Berichtl an Sammelbericht unter \u201EDatn & Eiles\u201C eif\xFCgn.",
    "Wirklich alle Eingaben, Szenarien und importierten Daten l\xF6schen?": "Wirklich ois wegmacha \u2013 Eingobn, Szenarien und eiglesne Datn?"
  };
  function t(s) {
    if (lang !== "bar" || !s)
      return s;
    return BAR[s] ?? BAR_SENTENCES[s] ?? s;
  }

  // js/prognose.js
  var PRIOR = { ep: -6.3, q: 2, ew: 0.37, ek: 0.45, eb: 1 };
  var KEYS = ["ep", "q", "ew", "ek", "eb"];
  var SD = { ep: 2, q: 2, ew: 0.2, ek: 0.2, eb: 1 };
  function defaultProgSettings() {
    return { auto: true, coef: { ...PRIOR }, lambda: 0.3, wachstum: 0, ehAnteil: 25, ciKoef: 5.6, marktManuell: 0 };
  }
  var LAB = { p: "Preis", L: "Produktqualit\xE4t", W: "Werbung", K: "Mitarbeiter Kundenbetreuung", B: "Bekanntheit", D: "Potentieller Absatz", A: "Tats\xE4chlicher Absatz" };
  function firmsFromMarkt(m) {
    if (!m?.rows)
      return null;
    const get = (l) => m.rows.find((r) => r.l === l)?.v;
    const cols = {};
    for (const [k, l] of Object.entries(LAB))
      cols[k] = get(l);
    if (!cols.p || !cols.D)
      return null;
    return cols.p.map((_, i) => ({
      name: m.cols?.[i] || `U${i + 1}`,
      p: +cols.p[i],
      L: +(cols.L?.[i] ?? 1),
      W: +(cols.W?.[i] ?? 0),
      K: +(cols.K?.[i] ?? 1),
      B: +(cols.B?.[i] ?? 50),
      D: +cols.D[i],
      A: +(cols.A?.[i] ?? cols.D[i])
    }));
  }
  function attr(c, f) {
    const pe = Math.max(1, f.p - c.q * (f.L - 1));
    return Math.exp(c.ep * Math.log(pe) + c.ew * Math.log(Math.max(1, f.W)) + c.ek * Math.log(Math.max(0.25, f.K)) + c.eb * Math.log(Math.max(1, f.B)));
  }
  function shares(c, firms) {
    const a = firms.map((f) => f.aktiv === false ? 0 : attr(c, f));
    const s = a.reduce((x, y) => x + y, 0) || 1;
    return a.map((x) => x / s);
  }
  function calibrate(obs, lambda = 0.3, prior = PRIOR) {
    const pts = obs.filter((o) => o.firms?.length);
    if (!pts.length)
      return { coef: { ...prior }, n: 0, mape: null, fit: [] };
    const vec = (c) => KEYS.map((k) => c[k]);
    const obj = (x2) => Object.fromEntries(KEYS.map((k, i) => [k, x2[i]]));
    const resid = (x2) => {
      const c = obj(x2), r2 = [];
      for (const o of pts) {
        const M = o.firms.reduce((s, f) => s + f.D, 0), sh = shares(c, o.firms);
        o.firms.forEach((f, i) => r2.push(Math.log(Math.max(1, M * sh[i])) - Math.log(Math.max(1, f.D))));
      }
      KEYS.forEach((k, i) => r2.push(lambda * (x2[i] - prior[k]) / SD[k]));
      return r2;
    };
    let x = vec(prior), r = resid(x), cost = r.reduce((s, v) => s + v * v, 0), mu = 0.01;
    for (let it = 0; it < 80; it++) {
      const J = KEYS.map((_, j) => {
        const h = 1e-5 * Math.max(1, Math.abs(x[j]));
        const x2 = [...x];
        x2[j] += h;
        return resid(x2).map((v, i) => (v - r[i]) / h);
      });
      const n = KEYS.length, A = Array.from({ length: n }, () => Array(n).fill(0)), g = Array(n).fill(0);
      for (let a = 0; a < n; a++) {
        for (let b = 0; b < n; b++)
          for (let i = 0; i < r.length; i++)
            A[a][b] += J[a][i] * J[b][i];
        for (let i = 0; i < r.length; i++)
          g[a] += J[a][i] * r[i];
      }
      let improved = false;
      for (let tries = 0; tries < 10; tries++) {
        const M = A.map((row2, a) => row2.map((v, b) => v + (a === b ? mu * (A[a][a] || 1) : 0)));
        const step = solve(M, g.map((v) => -v));
        if (!step) {
          mu *= 10;
          continue;
        }
        const x2 = x.map((v, i) => v + step[i]);
        if (x2[1] < 0)
          x2[1] = 0;
        const r2 = resid(x2), c2 = r2.reduce((s, v) => s + v * v, 0);
        if (c2 < cost) {
          x = x2;
          r = r2;
          improved = cost - c2 > 1e-10;
          cost = c2;
          mu = Math.max(1e-6, mu / 3);
          break;
        }
        mu *= 10;
      }
      if (!improved)
        break;
    }
    const coef = obj(x);
    const fit = [];
    for (const o of pts) {
      const M = o.firms.reduce((s, f) => s + f.D, 0), sh = shares(coef, o.firms);
      o.firms.forEach((f, i) => fit.push({ period: o.period, name: f.name, ist: f.D, modell: M * sh[i] }));
    }
    const mape = fit.reduce((s, f) => s + Math.abs(f.modell / f.ist - 1), 0) / fit.length * 100;
    return { coef, n: fit.length, mape, fit };
  }
  function solve(A, b) {
    const n = b.length, M = A.map((r, i) => [...r, b[i]]);
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++)
        if (Math.abs(M[r][c]) > Math.abs(M[p][c]))
          p = r;
      if (Math.abs(M[p][c]) < 1e-12)
        return null;
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = 0; r < n; r++)
        if (r !== c) {
          const f = M[r][c] / M[c][c];
          for (let k = c; k <= n; k++)
            M[r][k] -= f * M[c][k];
        }
    }
    return M.map((r, i) => r[n] / r[i]);
  }
  function looCheck(obs, lambda) {
    const pts = obs.filter((o) => o.firms?.length);
    return pts.map((o) => {
      const rest = pts.filter((x) => x !== o);
      const { coef } = calibrate(rest, lambda);
      const M = o.firms.reduce((s, f) => s + f.D, 0), sh = shares(coef, o.firms);
      return { period: o.period, rows: o.firms.map((f, i) => ({ name: f.name, ist: f.D, modell: M * sh[i] })) };
    });
  }
  function forecast(coef, ctx, D2, level) {
    const firms = ctx.konk.map((f, i) => i === ctx.own ? { name: f.name, p: +D2.preisOnline || 1, L: level, W: +D2.werbungOnline || 0, K: +D2.kbOnline || 0, B: ctx.ownBek, aktiv: true } : { ...f });
    const sh = shares(coef, firms);
    const online = ctx.markt * sh[ctx.own];
    let eh = 0, shEH = 0;
    if (D2.ehAktiv) {
      const fe = ctx.konk.map((f, i) => i === ctx.own ? { p: +D2.preisEH || +D2.preisOnline || 1, L: level, W: +D2.werbungEH || 0, K: +D2.kbEH || 0, B: ctx.ownBek, aktiv: true } : { p: f.pEH ?? f.p, L: f.L, W: f.WEH ?? 0, K: f.KEH ?? 1, B: f.B, aktiv: f.ehAktiv !== false });
      const s2 = shares(coef, fe);
      shEH = s2[ctx.own];
      eh = ctx.markt * (ctx.ehAnteil / 100) * shEH;
    }
    return { online: Math.round(online), eh: Math.round(eh), shareOnline: sh[ctx.own] * 100, shareEH: shEH * 100, firms, shares: sh };
  }

  // js/app.js
  var VERSION = "1.3.4";
  var KEY = "tonwerk-planrechner-v1";
  var $ = (s, el = document) => el.querySelector(s);
  var esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  var clone = (o) => JSON.parse(JSON.stringify(o));
  var uid = () => Math.random().toString(36).slice(2, 9);
  var parseNum = (s) => {
    if (typeof s === "number")
      return s;
    const x = String(s).trim().replace(/\s/g, "");
    if (!x)
      return 0;
    const v = Number(/,/.test(x) ? x.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(x) ? x.replace(/\./g, "") : x);
    return Number.isFinite(v) ? v : 0;
  };
  function initialStore() {
    const sc = {
      id: uid(),
      name: "Szenario 1",
      team: true,
      saved: { decisions: { ...clone(DEC_HIST[0]), investA: 0, absatzAutoOnline: true, absatzAutoEH: true }, custom: {} }
    };
    sc.draft = clone(sc.saved);
    return {
      v: 1,
      lang: "de",
      theme: "light",
      firma: "TONWERK",
      unternehmen: "Unternehmen 1",
      states: { 0: stateP0() },
      history: clone(HISTORY),
      decHist: clone(DEC_HIST),
      istInputs: {},
      markt: clone(MARKT),
      branche: {},
      params: { 1: paramsP1() },
      paramCustom: { 1: {} },
      scenarios: { 1: [sc] },
      active: { 1: sc.id },
      customFields: [],
      v2: true,
      calcMode: "save",
      module: {},
      prog: {},
      konk: {},
      opt: {},
      konkV: 2,
      welcome: true
    };
  }
  function migrate(s) {
    s.markt || (s.markt = {});
    for (const [p, m] of Object.entries(MARKT))
      if (!s.markt[p]?.rows)
        s.markt[p] = clone(m);
    s.calcMode || (s.calcMode = "save");
    s.module || (s.module = {});
    s.prog || (s.prog = {});
    s.konk || (s.konk = {});
    s.opt || (s.opt = {});
    if (s.konkV !== 2) {
      s.konk = {};
      s.konkV = 2;
    }
    s.v2 = true;
    return s;
  }
  var store;
  try {
    store = migrate(JSON.parse(localStorage.getItem(KEY)) || initialStore());
  } catch {
    store = migrate(initialStore());
  }
  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(store));
    } catch {
    }
  }
  var ui = { route: "vertrieb", repPeriod: null, repId: "01", menu: false, scOpen: false, delta: null };
  var planPeriod = () => Math.max(...Object.keys(store.states).map(Number)) + 1;
  function ensurePeriod(p) {
    var _a;
    if (!store.params[p])
      store.params[p] = clone(store.params[p - 1] || baseParams());
    (_a = store.paramCustom)[p] || (_a[p] = {});
    if (!store.scenarios[p] || !store.scenarios[p].length) {
      const prev = (store.scenarios[p - 1] || []).find((s) => s.team) || (store.scenarios[p - 1] || [])[0];
      const dec = prev ? clone(prev.saved.decisions) : emptyDecisions();
      dec.desinvest = [];
      dec.levelUp = 0;
      const sc = { id: uid(), name: "Szenario 1", team: true, saved: { decisions: dec, custom: {} } };
      sc.draft = clone(sc.saved);
      store.scenarios[p] = [sc];
      store.active[p] = sc.id;
    }
  }
  var scen = () => {
    const p = planPeriod();
    ensurePeriod(p);
    return store.scenarios[p].find((s) => s.id === store.active[p]) || store.scenarios[p][0];
  };
  var D = () => scen().draft.decisions;
  function modOf(p = planPeriod()) {
    var _a;
    const m = (_a = store.module)[p] || (_a[p] = {});
    m.ga || (m.ga = { aktiv: false, preis: 0, max: 0 });
    m.kredit || (m.kredit = { aktiv: false });
    return m;
  }
  var ownIdx = () => {
    const m = /(\d+)/.exec(store.unternehmen || "");
    const i = m ? Number(m[1]) - 1 : 4;
    return i >= 0 && i < 6 ? i : 4;
  };
  var progSet = (p = planPeriod()) => {
    var _a;
    return (_a = store.prog)[p] || (_a[p] = defaultProgSettings());
  };
  function obsAll(upTo = Infinity, skip = null) {
    return Object.keys(store.markt).map(Number).filter((p) => p <= upTo && p !== skip).sort((a, b) => a - b).map((p) => ({ period: p, firms: firmsFromMarkt(store.markt[p]) })).filter((o) => o.firms && o.firms.length === 6 && new Set(o.firms.map((f) => f.D)).size > 1);
  }
  var calCache = /* @__PURE__ */ new Map();
  function modelFor(p = planPeriod()) {
    const s = progSet(p);
    if (!s.auto)
      return { coef: s.coef, manual: true };
    const obs = obsAll(p - 1);
    const key = JSON.stringify([obs.map((o) => o.firms.map((f) => f.D)), s.lambda]);
    if (!calCache.has(key))
      calCache.set(key, calibrate(obs, s.lambda));
    return calCache.get(key);
  }
  function lastFirms(p) {
    for (let q = p - 1; q >= 0; q--) {
      const f = firmsFromMarkt(store.markt[q]);
      if (f?.length === 6)
        return { q, f };
    }
    return null;
  }
  function defaultKonk(p) {
    const last2 = lastFirms(p), prev = last2 ? firmsFromMarkt(store.markt[last2.q - 1]) : null;
    const base = last2 ? last2.f : Array.from({ length: 6 }, (_, i) => ({ name: `U${i + 1}`, p: 150, L: 1, W: 300, K: 8, B: 35 }));
    return base.map((f, i) => {
      const trend = prev ? Math.max(0, Math.min(2, f.L - prev[i].L)) : 0;
      const L = Math.min(13, f.L + trend);
      const pr = f.p;
      return { name: f.name, p: pr, L, W: f.W, K: f.K, B: f.B, aktiv: true, pEH: pr, WEH: Math.round(f.W * 0.45), KEH: 1, ehAktiv: true };
    });
  }
  var konkFor = (p = planPeriod()) => {
    var _a;
    return (_a = store.konk)[p] || (_a[p] = defaultKonk(p));
  };
  function progCtx(p, d, ahead = 0) {
    const s = progSet(Math.min(p, planPeriod())), own = ownIdx();
    const last2 = lastFirms(planPeriod());
    const M0 = s.marktManuell || (last2 ? last2.f.reduce((a, f) => a + f.D, 0) : 24e4);
    const markt3 = M0 * (1 + (s.wachstum || 0) / 100) ** (1 + ahead);
    let konk = konkFor(planPeriod());
    if (ahead > 0)
      konk = konk.map((f) => ({ ...f, L: Math.min(13, f.L + ahead * 1) }));
    const ownPrevBek = last2 ? last2.f[own].B : 35;
    const prevCI = Number(d._prevCI ?? store.decHist[planPeriod() - 1]?.ci ?? 0);
    const ownBek = ownPrevBek + (s.ciKoef || 0) * Math.log(((Number(d.ci) || 0) + 25) / (prevCI + 25));
    return { own, konk, markt: markt3, ehAnteil: s.ehAnteil, ownBek };
  }
  function prognose(p, d, S, ahead = 0) {
    const P = store.params[Math.min(p, planPeriod())];
    const level = S.level + Math.min(Math.max(Number(d.levelUp) || 0, 0), P.maxLevelUp);
    return forecast(modelFor(planPeriod()).coef, progCtx(p, d, ahead), d, level);
  }
  function effDec(d, p = planPeriod(), S = store.states[p - 1], ahead = 0) {
    const m = modOf(p), x = { ...d };
    if (!m.ga.aktiv) {
      x.gaMenge = 0;
      x.gaPreis = 0;
    } else {
      x.gaPreis = Number(m.ga.preis) || 0;
      x.gaMenge = Math.min(Number(x.gaMenge) || 0, Number(m.ga.max) || 0);
    }
    if (!m.kredit.aktiv)
      x.kurzKredit = 0;
    if (x.absatzAutoOnline || x.absatzAutoEH) {
      const f = prognose(p, x, S, ahead);
      if (x.absatzAutoOnline)
        x.absatzOnline = f.online;
      if (x.absatzAutoEH)
        x.absatzEH = x.ehAktiv ? f.eh : 0;
    }
    return x;
  }
  var calcSrc = (sc = scen()) => store.calcMode === "live" ? sc.draft : sc.saved;
  function simWith(src, p = planPeriod()) {
    return simulate(
      store.states[p - 1],
      store.params[p],
      effDec(src.decisions, p),
      { fields: store.customFields, values: { ...store.paramCustom[p], ...src.custom } }
    );
  }
  function runPlan(sc = scen()) {
    return simWith(calcSrc(sc));
  }
  var dirty = (sc = scen()) => JSON.stringify(sc.draft) !== JSON.stringify(sc.saved);
  function ampel(R, d, p = planPeriod()) {
    const S = store.states[p - 1];
    const f = prognose(p, d, S);
    const ga = R.absatz.ga || 0;
    const plan = (Number(d.absatzOnline) || 0) + (d.ehAktiv ? Number(d.absatzEH) || 0 : 0) + ga;
    const prog = f.online + (d.ehAktiv ? f.eh : 0) + ga;
    const verf = S.fe.qty + R.fertigung.ist;
    const puffer = verf - plan;
    const pr = ` Prognose: ${nf(prog, 0)} St\xFCck.`;
    let c = "gruen", txt = `Lieferf\xE4hig: ${nf(verf, 0)} St\xFCck verf\xFCgbar (Lager + Fertigung), Planabsatz ${nf(plan, 0)} St\xFCck, Puffer ${nf(puffer, 0)}.` + pr;
    if (puffer < 0) {
      c = "rot";
      txt = `Lieferunf\xE4hig: ${nf(-puffer, 0)} St\xFCck fehlen zum Planabsatz (${nf(plan, 0)} St\xFCck, verf\xFCgbar ${nf(verf, 0)}).` + pr;
    } else if (puffer < plan * 0.04) {
      c = "gelb";
      txt = `Knapp: nur ${nf(puffer, 0)} St\xFCck Puffer zum Planabsatz (${nf(plan, 0)} St\xFCck, verf\xFCgbar ${nf(verf, 0)}).` + pr;
    } else if (puffer > plan * 0.25) {
      c = "gelb";
      txt = `Hoher Lager\xFCberhang: ${nf(puffer, 0)} St\xFCck mehr verf\xFCgbar als Planabsatz (${nf(plan, 0)} St\xFCck).` + pr;
    }
    if (verf < prog && c === "gruen") {
      c = "gelb";
      txt += ` Achtung: Die Prognose liegt ${nf(prog - verf, 0)} St\xFCck \xFCber der verf\xFCgbaren Menge.`;
    }
    return { c, txt, nach: plan, verf, f };
  }
  var H = {
    preisOnline: "Preis je Kopfh\xF6rer im Online-Shop. H\xF6herer Preis = weniger Absatz (Handbuch-Tabelle: 150 \u20AC \u2192 40.000 Stk, 160 \u20AC \u2192 ca. 28.500, 140 \u20AC \u2192 ca. 53.000, ohne Qualit\xE4tseffekte). Qualit\xE4tsbedingte Mehrkosten lassen sich ohne Absatzverlust weitergeben.",
    ehAktiv: "Entscheidung, ob der Facheinzelhandel bedient werden soll. Lieferpriorit\xE4t: 1. Gro\xDFabnehmer, 2. Online-Shop, 3. Einzelhandel.",
    preisEH: "Preis je Kopfh\xF6rer im Facheinzelhandel. Transportkosten Einzelhandel siehe Rahmendaten.",
    werbungOnline: "Werbebudget Online-Markt in TEUR. Abnehmender Grenznutzen; wirkt \xFCber mehrere Perioden, am st\xE4rksten in der laufenden.",
    werbungEH: "Werbebudget Einzelhandel in TEUR.",
    kb: "Personalendbestand Kundenbetreuer. Einstellung 15 TEUR, Entlassung 10 TEUR je Person. Eingestellt wird nur, wenn die Summe Online + Einzelhandel \xFCber dem Vorbestand liegt.",
    ci: "Corporate Identity in TEUR. Erh\xF6ht langfristig und markt\xFCbergreifend die Bekanntheit; angemessen laut Handbuch ca. 125 TEUR.",
    levelUp: "Maximal +2 Level je Periode. Einmalig 100 TEUR je Level, dazu variable Kosten je verkauftem St\xFCck nach Level (L1 16 \u20AC \u2026 L13 40 \u20AC, +2 \u20AC je Level).",
    ga: "Nur ausf\xFCllen, wenn ein Gro\xDFabnehmer-Angebot vorliegt. Lieferung hat Vorrang, zahlt sofort zu 100 %, keine Transportkosten.",
    einkauf: "Bestellmenge Einsatzstoffe. Der Staffelpreis gilt f\xFCr die gesamte Menge. Fehlende Einsatzstoffe kommen automatisch per Just-in-Time zum h\xF6heren Preis. Lager 3 \u20AC/Einheit auf den Endbestand.",
    fertigung: "Geplante Fertigungsmenge. Begrenzt durch Anlagenkapazit\xE4t (keine \xDCberstunden an Anlagen) und Personal: 2.000 Stk je MA, max. +20 % \xDCberstunden mit 25 % Zuschlag.",
    invest: "Neue Anlagen stehen sofort zur Verf\xFCgung. Lineare Abschreibung \xFCber 10 Perioden.",
    desinvest: "Verkaufte Anlagen fehlen schon ab Periodenbeginn. Erl\xF6s = Resterl\xF6s-% vom Restbuchwert; die Differenz ist au\xDFerordentliche Abschreibung. Mindestens eine Anlage muss bleiben.",
    fertigungMA: "Personalendbestand Fertigung. Nicht ausgelastete Mitarbeiter werden als Fertigungsgemeinkosten verbucht.",
    kurzKredit: "Kurzfristiger Kredit (Laufzeit 1 Periode), nur wenn in TOPSIM freigeschaltet. Zins siehe Rahmendaten, R\xFCckzahlung automatisch in der Folgeperiode.",
    absatz: "Angenommener Absatz f\xFCr die Planungsrechnung (wie in TOPSIM). Die Planungsqualit\xE4t flie\xDFt in den Erfolgswert ein. \u201EPrognose\u201C \xFCbernimmt den Wert aus der Absatzprognose und rechnet bei jeder \xC4nderung mit; sobald du eine eigene Zahl eintr\xE4gst, gilt deine Zahl.",
    gaPreis: "Preis, den der Gro\xDFabnehmer in seinem Angebot festlegt (Handbuch 3.1.6). Gilt f\xFCr alle Szenarien dieser Periode.",
    gaMax: "H\xF6chstmenge laut Angebot. Ihr k\xF6nnt weniger oder gar nichts liefern.",
    zins: "Zinssatz aus den Wirtschaftsnachrichten der Periode, in der der Kredit freigeschaltet wird. Laut Handbuch 3.5.2 steigt dann auch der Zins f\xFCr den \xDCberziehungskredit. Gilt f\xFCr alle Szenarien dieser Periode."
  };
  var MODULE_INFO = {
    ga: { mask: "vertrieb", l: "Gro\xDFabnehmer-Angebot", txt: "Nur einblenden, wenn in TOPSIM ein Gro\xDFabnehmer-Angebot vorliegt (bisher in keiner Periode)." },
    kredit: { mask: "finanzen", l: "Kurzfristiger Kredit", txt: "Erst einblenden, wenn TOPSIM den kurzfristigen Kredit freischaltet (Wirtschaftsnachrichten)." }
  };
  var MASKS = {
    vertrieb: { title: "Vertrieb und Produktentwicklung", sections: [
      { id: "preis", h: "Preis/Werbung", col: "Superbass", fields: [
        { k: "preisOnline", l: "Preis Online-Markt (EUR)", d: 0, help: H.preisOnline },
        { k: "ehAktiv", l: "Aktiv im Einzelhandel", type: "check", help: H.ehAktiv },
        { k: "preisEH", l: "Preis Einzelhandel (EUR)", d: 0, help: H.preisEH, eh: true },
        { k: "werbungOnline", l: "Werbung Online-Markt (TEUR)", d: 0, help: H.werbungOnline },
        { k: "werbungEH", l: "Werbung Einzelhandel (TEUR)", d: 0, help: H.werbungEH, eh: true }
      ] },
      { id: "vertrieb", h: "Vertrieb", two: ["Online-Markt", "Einzelhandel"], fields: [
        { k: ["kbOnline", "kbEH"], l: "Kundenbetreuer (Anz. Personen)", d: 1, help: H.kb }
      ] },
      { id: "ci", h: "Corporate Identity", col: "Eingabe", fields: [{ k: "ci", l: "Corporate Identity (TEUR)", d: 0, help: H.ci }] },
      { id: "fue", h: "Produktentwicklung", col: "Superbass", fields: [
        { k: "levelUp", l: "Zuwachs Produktqualit\xE4t (Level)", type: "select", opts: [[0, "-"], [1, "+1"], [2, "+2"]], help: H.levelUp }
      ] },
      { id: "ga", h: "Gro\xDFabnehmer", col: "Superbass", module: "ga", fields: [
        { p: "ga.preis", l: "Angebotspreis des Gro\xDFabnehmers (EUR)", d: 2, help: H.gaPreis },
        { p: "ga.max", l: "Maximale Liefermenge laut Angebot (St\xFCck)", d: 0, help: H.gaMax },
        { k: "gaMenge", l: "Liefermenge Gro\xDFabnehmer (St\xFCck)", d: 0, help: H.ga }
      ] }
    ] },
    einkauf: { title: "Einkauf und Fertigung", sections: [
      { id: "einkauf", h: "Einkauf", col: "Superbass", fields: [{ k: "einkauf", l: "Einsatzstoffe/Teile (Einheit)", d: 0, help: H.einkauf }] },
      { id: "fertigung", h: "Fertigung", col: "Superbass", fields: [{ k: "fertigung", l: "Fertigungsmenge (St\xFCck)", d: 0, help: H.fertigung }] },
      { id: "anlagen", h: "Fertigungsanlagen", two: ["Typ A", "Typ B"], fields: [{ k: ["investA", "investB"], l: "Investition (Anz. neue Anlagen)", d: 0, help: H.invest }] },
      { id: "desinvest", h: "Desinvestitionen", special: "desinvest" },
      { id: "personal", h: "Personal", col: "Eingabe", fields: [{ k: "fertigungMA", l: "Fertigungspersonal (Anz. Personen)", d: 1, help: H.fertigungMA }] }
    ] },
    finanzen: { title: "Finanzen und Planwerte", sections: [
      { id: "finanzen", h: "Finanzen", col: "Eingabe", module: "kredit", fields: [
        { k: "kurzKredit", l: "Kurzfristiger Kredit (TEUR)", d: 0, help: H.kurzKredit },
        { pp: "zinsKurz", l: "Zins kurzfristiger Kredit (Anteil, 0,05 = 5 %)", d: 3, help: H.zins },
        { pp: "zinsDispo", l: "Zins \xDCberziehungskredit (Anteil)", d: 3, help: H.zins }
      ] },
      { id: "planwerte", h: "Planwerte", col: "Eingabe", fields: [
        { k: "absatzOnline", l: "Angenommener Absatz Superbass Online-Markt (St\xFCck)", d: 0, help: H.absatz, auto: "absatzAutoOnline" },
        { k: "absatzEH", l: "Angenommener Absatz Superbass Einzelhandel (St\xFCck)", d: 0, help: H.absatz, eh: true, auto: "absatzAutoEH" }
      ] }
    ] }
  };
  var PARAMS = { title: "Rahmendaten der Periode", sections: [
    { id: "p-einkauf", h: "Einkauf und Lager", fields: [
      { p: "jitPreis", l: "Just-in-Time-Nachlieferung (EUR/Einheit)", d: 2 },
      { p: "betriebsstoff", l: "Betriebsstoffe (EUR/St\xFCck gefertigt)", d: 2 },
      { p: "lagerMat", l: "Lagerkosten Einsatzstoffe (EUR/Einheit)", d: 2 },
      { p: "lagerFE", l: "Lagerkosten Fertigerzeugnisse (EUR/St\xFCck)", d: 2 }
    ], special: "staffel" },
    { id: "p-vertrieb", h: "Vertrieb", fields: [
      { p: "transOnline", l: "Transportkosten Online-Markt (EUR/St\xFCck)", d: 2 },
      { p: "transEH", l: "Transportkosten Einzelhandel (EUR/St\xFCck)", d: 2 }
    ] },
    { id: "p-personal", h: "Personal", fields: [
      { p: "gehalt.einkauf", l: "Gehalt Einkauf (TEUR je MA)", d: 2 },
      { p: "gehalt.verwaltung", l: "Gehalt Verwaltung (TEUR je MA)", d: 2 },
      { p: "gehalt.fertigung", l: "Lohn Fertigung (TEUR je MA)", d: 2 },
      { p: "gehalt.kb", l: "Gehalt Kundenbetreuer (TEUR je MA)", d: 2 },
      { p: "nk", l: "Personalnebenkosten (Anteil, 0,30 = 30 %)", d: 2 },
      { p: "einstellung", l: "Einstellungskosten (TEUR je Person)", d: 2 },
      { p: "entlassung", l: "Entlassungskosten (TEUR je Person)", d: 2 },
      { p: "prodMA", l: "Produktivit\xE4t (St\xFCck je Fertigungs-MA)", d: 0 },
      { p: "ueberMax", l: "Max. \xDCberstunden (Anteil)", d: 2 },
      { p: "ueberZuschlag", l: "\xDCberstundenzuschlag (Anteil)", d: 2 }
    ], special: "perstab" },
    { id: "p-fix", h: "Sonstige fixe Kosten je Kostenstelle (TEUR, ohne Anlagen)", fields: [
      { p: "sfix.einkauf", l: "Einkauf", d: 2 },
      { p: "sfix.fertigung", l: "Fertigung (ohne Fixkosten der Anlagen)", d: 2 },
      { p: "sfix.vertrieb", l: "Vertrieb (inkl. Planungsrechnungen/Marktforschung)", d: 2 },
      { p: "sfix.verwaltung", l: "Verwaltung", d: 2 },
      { p: "gebaeudeAfa", l: "Abschreibung Geb\xE4ude (TEUR/Periode)", d: 2 }
    ] },
    { id: "p-anlagen", h: "Neue Fertigungsanlagen", special: "anlagen" },
    { id: "p-fue", h: "Forschung & Entwicklung", fields: [{ p: "fueProLevel", l: "Einmalige Kosten je Level (TEUR)", d: 2 }, { p: "maxLevelUp", l: "Max. Level-Zuwachs je Periode", d: 0 }], special: "qual" },
    { id: "p-finanzen", h: "Finanzen", fields: [
      { p: "zinsDispo", l: "Zins \xDCberziehungskredit (Anteil)", d: 3 },
      { p: "zinsLang", l: "Zins langfristiger Kredit (Anteil)", d: 3 },
      { p: "zinsKurz", l: "Zins kurzfristiger Kredit (Anteil)", d: 3 },
      { p: "steuer", l: "Steuersatz (Anteil)", d: 3 },
      { p: "zahlQuote", l: "Zahlungseingang in der Periode (Anteil)", d: 2 },
      { p: "minKasse", l: "Mindest-Kassenbestand (TEUR)", d: 2 }
    ] },
    { id: "p-erfolg", h: "Erfolgswert-Sch\xE4tzung", fields: [
      { p: "erfolgswert.a", l: "Konstante", d: 2 },
      { p: "erfolgswert.ju", l: "Gewicht Jahres\xFCberschuss", d: 3 },
      { p: "erfolgswert.ek", l: "Gewicht Eigenkapital", d: 3 },
      { p: "erfolgswert.level", l: "Gewicht Produktqualit\xE4t (je Level)", d: 2 }
    ] }
  ] };
  var getPath = (o, p) => p.split(".").reduce((x, k) => x?.[k], o);
  var setPath = (o, p, v) => {
    const ks = p.split(".");
    const last2 = ks.pop();
    ks.reduce((x, k) => x[k] || (x[k] = {}), o)[last2] = v;
  };
  var EFFECTS = [
    ["info", "Nur Info (keine Rechenwirkung)"],
    ["fix", "Fixe Kosten (TEUR) in Kostenstelle"],
    ["varSold", "Kosten je verkauftem St\xFCck (EUR)"],
    ["varProd", "Kosten je gefertigtem St\xFCck (EUR)"],
    ["ertrag", "Sonstiger Ertrag (TEUR)"],
    ["einzahlung", "Einzahlung ohne Ertrag (TEUR)"],
    ["auszahlung", "Auszahlung ohne Aufwand (TEUR)"]
  ];
  function hint(text) {
    return text ? `<button class="hint" type="button" data-tip="${esc(t(text))}" aria-label="${esc(t("Hilfe"))}">?</button>` : "<span></span>";
  }
  function numInput(key, val, d, extra = "") {
    return `<input type="text" inputmode="decimal" data-k="${key}" data-d="${d}" value="${esc(nf(Number(val) || 0, d))}" ${extra}>`;
  }
  function customRows(cat, values, isParam, ch = /* @__PURE__ */ new Set()) {
    return store.customFields.filter((f) => f.cat === cat).map((f) => {
      const eff = EFFECTS.find((e) => e[0] === f.effect)?.[1] || "";
      return `<div class="frow${!isParam && ch.has("c:" + f.id) ? " changed" : ""}" data-row="c:${f.id}"><label>${esc(f.label)}${f.unit ? ` (${esc(f.unit)})` : ""}<span class="custom-tag">${esc(t("eigenes Feld"))}</span>
      <span class="fedit"><button data-editfield="${f.id}" title="${esc(t("Bearbeiten"))}">\u270E</button><button data-delfield="${f.id}" title="${esc(t("L\xF6schen"))}">\u2715</button></span></label>
      ${numInput((isParam ? "pc:" : "c:") + f.id, values[f.id] ?? f.def ?? 0, f.dec ?? 2)}${hint(t(eff) + (f.effect === "fix" ? " \u2013 " + f.kst : "") + (f.note ? ". " + f.note : ""))}</div>`;
    }).join("");
  }
  function changedKeys(sc = scen()) {
    const a = sc.draft.decisions, b = sc.saved.decisions, out = /* @__PURE__ */ new Set();
    for (const k of /* @__PURE__ */ new Set([...Object.keys(a), ...Object.keys(b)]))
      if (JSON.stringify(a[k]) !== JSON.stringify(b[k]))
        out.add(k);
    for (const k of /* @__PURE__ */ new Set([...Object.keys(sc.draft.custom), ...Object.keys(sc.saved.custom)]))
      if (sc.draft.custom[k] !== sc.saved.custom[k])
        out.add("c:" + k);
    return out;
  }
  function renderMask(id) {
    const M = MASKS[id], d = D(), sc = scen(), p = planPeriod(), S = store.states[p - 1], mod = modOf(p), ch = changedKeys(sc);
    const mark = (keys) => keys.some((k) => ch.has(k)) ? " changed" : "";
    let h = store.welcome && Object.keys(store.states).length === 1 ? `<div class="card welcome"><h3>${t("Willkommen! So geht es los")}</h3><ol>
      <li>${t("Unter \u201EEinstellungen\u201C euren Firmennamen und eure Unternehmensnummer eintragen (z. B. \u201EUnternehmen 3\u201C).")}</li>
      <li>${t("Die App startet mit der Ausgangslage Periode 0, die f\xFCr alle Unternehmen gleich ist. Damit l\xE4sst sich Periode 1 sofort planen.")}</li>
      <li>${t("Nach jeder Periode den TOPSIM-Sammelbericht als PDF unter \u201EDaten & Import\u201C hineinziehen. Hast du schon eine Sicherungsdatei, dort \u201ESicherung importieren\u201C w\xE4hlen.")}</li>
      <li>${t("Alle Daten bleiben nur in diesem Browser auf diesem Ger\xE4t.")}</li></ol>
      <button class="btn ghost small" data-tool="welcomeoff">${t("Verstanden, ausblenden")}</button></div>` : "";
    h += `<div class="maskbar"><button class="btn ghost small" data-tool="spick" title="${esc(t("Alle gespeicherten Werte des Szenarios in der Reihenfolge der TOPSIM-Masken, zum Abtippen"))}">\u{1F4C4} ${t("Eingabe-Spickzettel (PDF)")}</button></div><div class="mask">`;
    const hidden = [];
    for (const s of M.sections) {
      if (s.module && !mod[s.module].aktiv) {
        hidden.push(s.module);
        continue;
      }
      h += `<h2>${esc(t(s.h))}${s.module ? `<button class="btn ghost small" data-modoff="${s.module}" title="${esc(t("Wieder ausblenden"))}">${t("ausblenden")}</button>` : ""}<button class="btn ghost small add" data-addfield="${s.id}">+ ${esc(t("Feld"))}</button></h2>`;
      if (s.special === "desinvest") {
        h += `<table class="des"><tr><th></th><th>${t("Anlage Nr.")}</th><th>${t("Restlaufzeit (in Perioden)")}</th><th>${t("Restbuchwert (TEUR)")}</th><th>${t("Desinvestieren?")}</th><th></th></tr>`;
        for (const m of S.machines) {
          const was = (sc.saved.decisions.desinvest || []).includes(m.nr), is = (d.desinvest || []).includes(m.nr);
          h += `<tr class="${was !== is ? "changed" : ""}"><td>Typ ${m.typ}</td><td>${m.nr}</td><td>${m.rlz}</td><td>${nf(m.rbw)}</td>
        <td><input type="checkbox" data-des="${m.nr}" ${is ? "checked" : ""}></td><td>${hint(H.desinvest)}</td></tr>`;
        }
        h += `</table>`;
      } else if (s.two) {
        h += `<div class="colhead two"><span></span><span>${esc(t(s.two[0]))}</span><span></span><span>${esc(t(s.two[1]))}</span><span></span></div>`;
        for (const f of s.fields)
          h += `<div class="frow two${mark(f.k)}" data-row="${f.k.join(",")}"><label>${esc(t(f.l))}</label>${numInput(f.k[0], d[f.k[0]], f.d)}${hint(f.help)}
        ${numInput(f.k[1], d[f.k[1]], f.d, f.k[1] === "kbEH" && !d.ehAktiv ? "disabled" : "")}${hint(f.help)}</div>`;
      } else {
        h += `<div class="colhead"><span></span><span>${esc(t(s.col))}</span><span></span></div>`;
        for (const f of s.fields) {
          const dis = f.eh && !d.ehAktiv ? "disabled" : "";
          let inp, keys = [f.k];
          if (f.p) {
            inp = numInput("m:" + f.p, getPath(mod, f.p), f.d);
            keys = [];
          } else if (f.pp) {
            inp = numInput("p:" + f.pp, store.params[p][f.pp], f.d);
            keys = [];
          } else if (f.type === "check")
            inp = `<span><input type="checkbox" data-k="${f.k}" ${d[f.k] ? "checked" : ""}></span>`;
          else if (f.type === "select")
            inp = `<select data-k="${f.k}">${f.opts.map(([v, l]) => `<option value="${v}" ${Number(d[f.k]) === v ? "selected" : ""}>${l}</option>`).join("")}</select>`;
          else if (f.auto) {
            keys = [f.k, f.auto];
            const fc = prognose(p, sc.draft.decisions, S);
            const pv = f.k === "absatzOnline" ? fc.online : fc.eh;
            const isAuto = !!d[f.auto];
            inp = `<div class="autofield">${numInput(f.k, isAuto ? pv : d[f.k], f.d, dis + (isAuto ? ' class="isauto"' : ""))}
            ${dis ? "" : isAuto ? `<span class="autotag" title="${esc(t("Wert kommt aus der Absatzprognose. Eigene Zahl eintippen, um ihn zu \xFCberschreiben."))}">${t("Prognose")}</span>` : `<button class="btn ghost small" data-autoon="${f.auto}" title="${esc(t("Prognosewert \xFCbernehmen"))}">\u21BA ${t("Prognose")} ${nf(pv, 0)}</button>`}</div>`;
          } else
            inp = numInput(f.k, d[f.k], f.d, dis);
          h += `<div class="frow${mark(keys)}" data-row="${keys.join(",")}"><label>${esc(t(f.l))}</label>${inp}${hint(f.help)}</div>`;
          if (f.k === "ehAktiv")
            h += `<div class="frow subrow"><span></span><div class="sub">${esc(t("Entscheidung, ob Einzelhandel bedient werden soll."))}</div><span></span></div>`;
        }
      }
      h += customRows(s.id, sc.draft.custom, false, ch);
    }
    if (id === "vertrieb" || id === "einkauf" || id === "finanzen")
      h += ampelHtml();
    if (hidden.length)
      h += `<div class="modrow">${hidden.map((m) => `<button class="linkbtn" data-modon="${m}" title="${esc(t(MODULE_INFO[m].txt))}">+ ${esc(t(MODULE_INFO[m].l))} ${t("einblenden")}</button>`).join(" ")}</div>`;
    return h + `</div>`;
  }
  function renderParams() {
    const p = planPeriod(), P = store.params[p], pc = store.paramCustom[p];
    let h = `<div class="note">${esc(t("Rahmendaten f\xFCr Periode"))} ${p}. ${esc(t("Neue Werte aus den Wirtschaftsnachrichten (z. B. Inflation, Staffelpreise, Geh\xE4lter) hier eintragen. Sie gelten f\xFCr alle Szenarien dieser Periode."))}</div><div class="mask">`;
    for (const s of PARAMS.sections) {
      h += `<h2>${esc(t(s.h))}<button class="btn ghost small add" data-addfield="${s.id}">+ ${esc(t("Feld"))}</button></h2>`;
      for (const f of s.fields || [])
        h += `<div class="frow"><label>${esc(t(f.l))}</label>${numInput("p:" + f.p, getPath(P, f.p), f.d)}<span></span></div>`;
      if (s.special === "staffel") {
        h += `<h2 style="font-size:13px">${esc(t("Mengenstaffel Einsatzstoffe"))}</h2><table class="des"><tr><th>${t("ab Menge (Einheiten)")}</th><th>${t("Preis (EUR/Einheit)")}</th><th></th></tr>`;
        P.matStaffel.forEach(([ab, pr], i) => {
          h += `<tr><td>${numInput(`st:${i}:0`, ab, 0, 'class="field"')}</td><td>${numInput(`st:${i}:1`, pr, 2, 'class="field"')}</td>
        <td><button class="btn ghost small" data-delstaffel="${i}">\u2715</button></td></tr>`;
        });
        h += `</table><button class="btn ghost small" data-addstaffel>+ ${esc(t("Staffel"))}</button>`;
      }
      if (s.special === "perstab") {
        h += `<h2 style="font-size:13px">${esc(t("Personal Einkauf/Verwaltung nach Umsatz (automatisch, Handbuch 3.4.5)"))}</h2><table class="des"><tr><th>${t("Umsatz (Mio. EUR)")}</th><th>${t("MA Einkauf")}</th><th>${t("MA Verwaltung")}</th></tr>`;
        P.einkaufTab.forEach(([u, e], i) => {
          h += `<tr><td>${nf(u, 0)}</td><td>${numInput(`et:${i}`, e, 1, 'class="field"')}</td><td>${numInput(`vt:${i}`, P.verwaltungTab[i][1], 1, 'class="field"')}</td></tr>`;
        });
        h += `</table>`;
      }
      if (s.special === "anlagen") {
        h += `<table class="des"><tr><th>${t("Typ")}</th><th>${t("Kaufpreis TEUR")}</th><th>${t("Nutzungsdauer")}</th><th>${t("Kapazit\xE4t St\xFCck")}</th><th>${t("Fixkosten TEUR")}</th><th>${t("Resterl\xF6s %")}</th></tr>`;
        for (const [typ, a] of Object.entries(P.anlagen))
          h += `<tr><td>${typ}</td>${["preis", "dauer", "cap", "fix", "rest"].map((k) => `<td>${numInput(`an:${typ}:${k}`, a[k], k === "preis" || k === "fix" ? 2 : 0, 'class="field"')}</td>`).join("")}</tr>`;
        h += `</table>`;
      }
      if (s.special === "qual") {
        h += `<table class="des"><tr><th>${t("Level")}</th>${P.qualKosten.map((_, i) => `<th>${i + 1}</th>`).join("")}</tr><tr><td>${t("EUR/St\xFCck")}</td>${P.qualKosten.map((v, i) => `<td>${numInput(`qk:${i}`, v, 0, 'class="field" style="min-width:44px"')}</td>`).join("")}</tr></table>`;
      }
      h += customRows(s.id, pc, true);
    }
    return h + `</div>`;
  }
  function eur(v, d = 2) {
    return nf(v, d);
  }
  function renderBar(R) {
    const k = R.kpi, dl = ui.delta;
    const dv = (key, d = 2) => {
      if (!dl || Math.abs(dl[key]) < 5e-3)
        return "";
      const v = dl[key];
      return ` <span class="delta ${v > 0 ? "up" : "down"}">${v > 0 ? "+" : ""}${nf(v, d)}</span>`;
    };
    const item = (l, v, u, neg, key, d) => `<span><span class="k">${esc(t(l))}</span> <span class="v ${neg ? "neg" : ""}">${v}</span> <span class="k">${u}</span>${key ? dv(key, d) : ""}</span>`;
    const a = ampel(R, effDec(calcSrc().decisions));
    const pend = store.calcMode === "save" && dirty();
    $("#bar").innerHTML = `<span class="ampeldot ${a.c}" title="${esc(t(a.txt))}"></span>` + item("Plan-J\xDC", eur(k.ju), "T\u20AC", k.ju < 0, "ju") + item("Umsatz", eur(k.umsatz, 0), "T\u20AC", false, "umsatz", 0) + item("\xDCberziehung", eur(k.dispo), "T\u20AC", false, "dispo") + item("Absatz", nf(R.absatz.sold, 0), "Stk", false, "absatz", 0) + item("Lager", nf(R.lagerFE.ende.qty, 0), "Stk", false, "lager", 0) + item("HK", eur(k.hkStk), "\u20AC/Stk") + item("Erfolgswert \u2248", nf(k.erfolgswert, 1), "", false, "ew", 1) + (pend ? `<span class="pending">${t("Ge\xE4nderte Werte werden erst beim Speichern gerechnet.")}</span><button class="btn save small" id="save2">${t("Speichern")}</button>` : "") + (R.warnings.length ? `<div class="warn">\u26A0 ${R.warnings.map((w) => esc(t(w))).join(" \xB7 ")}</div>` : "");
    $("#chips").innerHTML = `<span class="chip">${t("J\xDC")} <b>${eur(k.ju)}</b> T\u20AC</span><span class="chip">${t("Dispo")} <b>${eur(k.dispo, 0)}</b> T\u20AC</span><span class="chip ew">EW \u2248 <b>${nf(k.erfolgswert, 1)}</b></span>`;
  }
  var kpiSnap = (R) => ({ ju: R.kpi.ju, umsatz: R.kpi.umsatz, dispo: R.kpi.dispo, absatz: R.absatz.sold, lager: R.lagerFE.ende.qty, ew: R.kpi.erfolgswert });
  function renderSide() {
    const p = planPeriod(), sc = scen();
    const nav = [["vertrieb", "Vertrieb und Produktentwicklung"], ["einkauf", "Einkauf und Fertigung"], ["finanzen", "Finanzen und Planwerte"]];
    const st = dirty() ? `<small>${t("Nicht gespeichert")}</small>` : `<small class="ok">${t("Gespeichert")}</small>`;
    const isRep = ui.route === "berichte";
    const periods = isRep ? Array.from({ length: p + 1 }, (_, i) => i) : [...Object.keys(store.states).map(Number).filter((x) => x > 0), p];
    const cur = isRep ? ui.repPeriod ?? p : p;
    $("#side").innerHTML = `<h3>${t("Periode")}</h3><div class="periods">${periods.map((x) => `<button data-per="${x}" class="${x === cur ? "on" : ""} ${x === p ? "plan" : ""}" title="${x === p ? t("Planperiode") : t("abgeschlossen")}">${x}</button>`).join("")}</div>
    <ul class="nav">${nav.map(([r, l]) => `<li><a data-route="${r}" class="${ui.route === r ? "on" : ""}">${esc(t(l))}${st}</a></li>`).join("")}</ul>
    <div class="sidebtns"><button class="btn" id="reset">${t("Zur\xFCcksetzen")}</button><button class="btn save" id="save">${t("Speichern")}</button></div>
    <div class="scen">${t("Szenario")}<div class="scdd">
      <button class="scbtn" id="scopen" aria-expanded="${ui.scOpen ? "true" : "false"}"><span>${esc(sc.name)}${sc.team ? " \u2605" : ""}</span><span>\u25BE</span></button>
      ${ui.scOpen ? `<div class="scpanel">${store.scenarios[p].map((s) => `<div class="scitem ${s.id === sc.id ? "on" : ""}">
          <button class="scpick" data-scpick="${s.id}">${esc(s.name)}${s.team ? " \u2605" : ""}${dirty(s) ? " <i>\u2022</i>" : ""}</button>
          <button class="scico" data-scteam="${s.id}" title="${esc(t("Als Teamentscheidung markieren"))}">${s.team ? "\u2605" : "\u2606"}</button>
          <button class="scico" data-scren="${s.id}" title="${esc(t("Umbenennen"))}">\u270E</button>
          <button class="scico" data-scdel="${s.id}" title="${esc(t("L\xF6schen"))}" ${store.scenarios[p].length < 2 ? "disabled" : ""}>\u{1F5D1}</button></div>`).join("")}
        <button class="scnew" id="scnew2">+ ${t("Neues Szenario")}</button></div>` : ""}</div></div>
    <ul class="nav"><li class="grp">${t("Auswertung")}</li>
      ${[
      ["kpi", "Simulieren \xB7 \xDCbersicht KPIs"],
      ["berichte", "Berichtswesen"],
      ["szenarien", "Szenarien & Vergleich"],
      ["prognose", "Absatzprognose & Konkurrenz"],
      ["optimierer", "Hebel & Optimierer"],
      ["vorschau", "Vorschau bis Periode 6"],
      ["planist", "Plan-Ist-Abgleich"],
      ["parameter", "Rahmendaten der Periode"]
    ].map(([r, l]) => `<li><a data-route="${r}" class="${ui.route === r ? "on" : ""}">${esc(t(l))}<small></small></a></li>`).join("")}
      <li class="grp">${t("Verwaltung")}</li>
      ${[["daten", "Daten & Import"], ["einstellungen", "Einstellungen"], ["hilfe", "Hilfe & Spielregeln"]].map(([r, l]) => `<li><a data-route="${r}" class="${ui.route === r ? "on" : ""}">${esc(t(l))}<small></small></a></li>`).join("")}</ul>`;
  }
  function reportTable(tb, curCol) {
    const hasUnit = !tb.noUnit;
    let h = `${tb.title ? `<h4>${esc(tb.title)}</h4>` : ""}<div class="tbl"><table class="r"><thead><tr><th></th>${hasUnit ? `<th style="background:transparent;color:inherit">${esc(tb.unitHead || "")}</th>` : ""}${tb.cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>`;
    for (const r of tb.rows) {
      h += `<tr class="${r.b ? "b" : ""} ${r.sec ? "sec" : ""} ${r.i ? "i" : ""}"><td>${esc(r.l)}</td>${hasUnit ? `<td class="u">${esc(r.u || "")}</td>` : ""}${r.v.map((v, i) => `<td class="${curCol === i ? "cur" : ""}">${r.sec ? "" : esc(typeof v === "number" ? nf(v, r.f ?? 2) : v)}</td>`).join("")}</tr>`;
    }
    return h + `</tbody></table></div>${tb.foot ? `<div class="foot">${esc(tb.foot)}</div>` : ""}`;
  }
  function reportHtml(rep) {
    let h = `<div class="report"><h1>${esc(rep.title)}</h1>${rep.note ? `<div class="note">${esc(rep.note)}</div>` : ""}`;
    for (const tb of rep.tables)
      h += reportTable(tb, rep.id === "01" ? 1 : void 0);
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
      const decHist = { ...store.decHist };
      delete decHist[p];
      const reps2 = buildReports(R, { ...base, decHist, P: inp.P, D: { ...store.decHist[p] || {}, ...inp.D }, S: store.states[p - 1], ist: true });
      return { R, reports: reps2, check: store.history[p] ? { ju: store.history[p].ju, sim: R.guv.ju } : null };
    }
    const reps = [execSummary(p, store.history)];
    const s = store.states[p];
    if (s) {
      const fe = ["varMat", "fixMat", "varFert", "fixFert"].reduce((a, c) => a + (s.fe[c] || 0), 0);
      const masch = s.machines.reduce((a, m) => a + m.rbw, 0), ju = store.history[p]?.ju ?? 0;
      const B = {
        ...s.bilanz,
        masch,
        av: s.bilanz.grund + masch,
        mat: s.mat.value,
        fe,
        wp: 0,
        ju,
        gvVortragVor: s.bilanz.gvVortrag - ju,
        ek: s.bilanz.gez + s.bilanz.krl + s.bilanz.grl + s.bilanz.gvVortrag,
        fk: s.bilanz.lang + s.bilanz.kurz + s.bilanz.dispo
      };
      B.uv = B.mat + B.fe + B.ford + B.kasse;
      B.aktiva = B.av + B.uv;
      B.passiva = B.ek + B.fk;
      reps.push(bilanzReport(B, null));
    }
    return { reports: reps, limited: true };
  }
  function renderBerichte() {
    const plan = planPeriod(), p = ui.repPeriod ?? plan;
    const res = reportsFor(p);
    const reps = res.reports;
    if (!reps.find((r) => r.id === ui.repId))
      ui.repId = reps[0].id;
    const rep = reps.find((r) => r.id === ui.repId);
    let badge = "";
    if (res.plan)
      badge = `<span class="badge">${t("Planungsrechnung")} \xB7 ${esc(scen().name)}</span>`;
    else if (res.check) {
      const dv = res.check.sim - res.check.ju;
      badge = Math.abs(dv) < 0.05 ? `<span class="badge ok">\u2713 ${t("nachgerechnet, stimmt mit TOPSIM \xFCberein")}</span>` : `<span class="badge bad">${t("Abweichung zu TOPSIM")}: ${nf(dv)} T\u20AC J\xDC</span>`;
    } else if (res.limited)
      badge = `<span class="badge">${t("Nur Kennzahlen und Bilanz vorhanden. F\xFCr alle Berichte den Sammelbericht unter \u201EDaten & Import\u201C einf\xFCgen.")}</span>`;
    return `<div class="rhead"><span class="lbl">${t("Download: alle Berichte")}</span><button class="btn small" id="dlzip">ZIP (PDF)</button>
      <span class="lbl" style="margin-left:12px">${t("Einzelbericht")}</span><button class="btn ghost small" id="dlone">PDF</button>
      <button class="btn ghost small" id="print">${t("Drucken")}</button> ${badge}</div>
    <div class="rtabs">${reps.map((r) => `<button data-rep="${r.id}" class="${r.id === ui.repId ? "on" : ""}">${esc(r.title.replace(" (TEUR)", ""))}</button>`).join("")}</div>
    ${reportHtml(rep)}`;
  }
  function renderKpi() {
    const R = runPlan(), p = planPeriod();
    const reps = buildReports(R, { history: store.history, decHist: store.decHist, unternehmen: store.unternehmen, P: store.params[p], D: effDec(calcSrc().decisions), S: store.states[p - 1] });
    return `<div class="row"><span class="badge">${t("Szenario")}: ${esc(scen().name)}</span>${dirty() ? `<span class="badge bad">${t("Nicht gespeichert")}</span>` : ""}
    <button class="btn small" data-route="berichte">${t("Zum Berichtswesen")}</button></div>${reportHtml(reps[0])}
    ${R.warnings.length ? `<div class="note">\u26A0 ${R.warnings.map((w) => esc(t(w))).join("<br>\u26A0 ")}</div>` : ""}${reportHtml(reps.find((r) => r.id === "EW"))}`;
  }
  function renderSzenarien() {
    const p = planPeriod(), list = store.scenarios[p];
    const res = list.map((s) => ({ s, R: runPlan(s) }));
    const rows = [
      ["Perioden\xFCberschuss/-fehlbetrag", "TEUR", (R) => R.kpi.ju, 2, 1],
      ["Erfolgswert (Sch\xE4tzung)", "Index", (R) => R.kpi.erfolgswert, 1, 1],
      ["Umsatz", "TEUR", (R) => R.kpi.umsatz, 2, 1],
      ["Absatz gesamt", "St\xFCck", (R) => R.absatz.sold, 0, 0],
      ["Preis Online", "EUR", (R) => R.absatz.preisOnline, 0, 0],
      ["Fertigung", "St\xFCck", (R) => R.fertigung.ist, 0, 0],
      ["Lagerendbestand", "St\xFCck", (R) => R.lagerFE.ende.qty, 0, 0],
      ["Herstellkosten", "EUR/St\xFCck", (R) => R.kpi.hkStk, 2, -1],
      ["Selbstkosten", "EUR/St\xFCck", (R) => R.kpi.skStk, 2, -1],
      ["Betriebsergebnis", "TEUR", (R) => R.guv.be, 2, 1],
      ["\xDCberziehungskredit", "TEUR", (R) => R.kpi.dispo, 2, -1],
      ["Eigenkapital", "TEUR", (R) => R.kpi.ek, 2, 1],
      ["Fremdkapitalquote", "%", (R) => R.kpi.fkQuote, 2, -1],
      ["Eigenkapitalrendite", "%", (R) => R.kpi.ekRendite, 2, 1],
      ["Produktqualit\xE4t", "Level", (R) => R.level.cur, 0, 0]
    ];
    let h = `<div class="row" style="margin-bottom:10px"><button class="btn small" id="scnew">+ ${t("Neues Szenario")}</button><button class="btn ghost small" id="scdup">${t("Aktuelles duplizieren")}</button>
    <button class="btn ghost small" id="screname">${t("Umbenennen")}</button><button class="btn ghost small" id="scteam">\u2605 ${t("Als Teamentscheidung markieren")}</button>
    <button class="btn ghost small" id="scdel">${t("L\xF6schen")}</button></div>
    <div class="note">${t("Alle Szenarien der Periode")} ${p} ${t("nebeneinander (wie \u201E\xDCbernehmen\u201C in TOPSIM). Gr\xFCn = bester Wert.")} ${store.calcMode === "live" ? t("Gerechnet wird mit dem aktuellen Bearbeitungsstand.") : t("Gerechnet wird mit dem zuletzt gespeicherten Stand.")}</div>
    <div class="tbl"><table class="r cmp"><thead><tr><th></th><th style="background:transparent;color:inherit"></th>${res.map(({ s }) => `<th>${esc(s.name)}${s.team ? " \u2605" : ""}</th>`).join("")}</tr></thead><tbody>`;
    for (const [l, u, fn, d, dir] of rows) {
      const vals = res.map(({ R }) => fn(R));
      const best = new Set(vals.map((v) => v.toFixed(4))).size < 2 ? null : dir === 1 ? Math.max(...vals) : dir === -1 ? Math.min(...vals) : null;
      h += `<tr><td>${esc(t(l))}</td><td class="u">${u}</td>${vals.map((v) => `<td class="${res.length > 1 && best !== null && v === best ? "best" : ""}">${nf(v, d)}</td>`).join("")}</tr>`;
    }
    return h + `</tbody></table></div>`;
  }
  var pending = null;
  function renderDaten() {
    const ist = Object.keys(store.states).map(Number).sort((a, b) => a - b);
    let h = `<div class="card"><h3>${t("TOPSIM-Berichte einf\xFCgen")}</h3>
    <p class="muted">${t("Sammelbericht als PDF hochladen (auch mehrere Einzelberichte gleichzeitig) oder den Berichtstext kopieren und einf\xFCgen. Periode und Inhalte werden automatisch erkannt. Damit lassen sich auch vergangene Perioden nachtragen.")}</p>
    <div class="drop" id="drop">${t("PDF-Dateien hierher ziehen oder")} <label class="btn small" style="display:inline-block">${t("Dateien w\xE4hlen")}<input type="file" id="files" accept="application/pdf,.pdf,.txt" multiple hidden></label></div>
    <p><textarea class="paste" id="paste" placeholder="${esc(t("\u2026 oder Text der Berichte hier einf\xFCgen (Strg+V)"))}"></textarea></p>
    <div class="row"><button class="btn" id="parse">${t("Einlesen")}</button></div><div id="preview">${pending ? previewHtml(pending) : ""}</div></div>`;
    h += `<div class="card"><h3>${t("Stand der Perioden")}</h3><div class="tbl"><table class="r"><thead><tr><th></th><th>${t("Erfolgswert")}</th><th>J\xDC T\u20AC</th><th>${t("Endstand")}</th><th>${t("Alle Berichte")}</th><th></th></tr></thead><tbody>
    ${ist.map((p) => `<tr><td>${t("Periode")} ${p}</td><td>${nf(store.history[p]?.erfolgswert)}</td><td>${nf(store.history[p]?.ju)}</td><td>${store.states[p] ? "\u2713" : "\u2013"}</td>
      <td>${store.istInputs[p] && store.states[p - 1] ? "\u2713" : "\u2013"}</td><td><button class="btn ghost small" data-editstate="${p}">${t("Endstand bearbeiten")}</button></td></tr>`).join("")}
    <tr><td>${t("Periode")} ${planPeriod()}</td><td colspan="5">${t("Planperiode")}</td></tr></tbody></table></div></div>`;
    h += `<div class="card"><h3>${t("Sicherung")}</h3><p class="muted">${t("Alle Daten liegen nur auf diesem Ger\xE4t (im Browser). F\xFCr ein anderes Ger\xE4t oder als Sicherung exportieren und dort importieren.")}</p>
    <div class="row"><button class="btn" id="exp">${t("Sicherung exportieren")}</button><label class="btn ghost">${t("Sicherung importieren")}<input type="file" id="imp" hidden></label>
    <button class="btn danger" id="wipe">${t("Alles zur\xFCcksetzen")}</button></div></div>`;
    return h;
  }
  function previewHtml(x) {
    const p = x.period;
    return `<div class="note"><b>${t("Erkannt")}:</b> ${t("Periode")} ${p ?? "?"} \xB7 ${x.unternehmen ? "Unternehmen " + x.unternehmen : ""} \xB7 ${x.found.length} ${t("Berichte")} (${x.found.map((f) => "TNB" + f).join(", ")})<br>
    ${x.history?.[p] ? `${t("Erfolgswert")} ${nf(x.history[p].erfolgswert)} \xB7 J\xDC ${nf(x.history[p].ju)} T\u20AC \xB7 ${t("Absatz")} ${nf(x.history[p].absatz, 0)}` : ""}
    ${x.state ? "" : `<br>\u26A0 ${t("F\xFCr den Endstand fehlen Berichte (Bilanz, Lager, Personal, Fertigung). Bitte den vollst\xE4ndigen Sammelbericht verwenden.")}`}
    ${x.warnings.map((w) => "<br>\u26A0 " + esc(t(w))).join("")}</div>
    <button class="btn save" id="apply" ${p === null ? "disabled" : ""}>${t("\xDCbernehmen")}</button> <button class="btn ghost" id="discard">${t("Verwerfen")}</button>`;
  }
  function applyImport(x) {
    const p = x.period;
    for (const [k, v] of Object.entries(x.history || {}))
      store.history[k] = { ...store.history[k] || {}, ...v };
    for (const [k, v] of Object.entries(x.decisions || {}))
      store.decHist[k] = { ...emptyDecisions(), ...store.decHist[k] || {}, ...v, ehAktiv: (v.preisEH || 0) > 0 || store.decHist[k]?.ehAktiv || false };
    if (x.markt)
      store.markt[p] = x.markt;
    if (x.branche)
      store.branche[p] = x.branche;
    if (x.state)
      store.states[p] = x.state;
    const P = clone(store.params[p] || store.istInputs[p]?.P || store.params[p + 1] || baseParams());
    if (x.gehalt)
      P.gehalt = Object.fromEntries(Object.entries(x.gehalt).map(([k, v]) => [k, Math.round(v * 100) / 100]));
    if (x.transOnline)
      P.transOnline = x.transOnline;
    if (x.transEH)
      P.transEH = x.transEH;
    if (x.jit?.preis)
      P.jitPreis = x.jit.preis;
    if (x.matKauf?.qty)
      P.matStaffel = [[0, x.matKauf.preis]];
    if (x.sfixKst && x.machines)
      P.sfix = { ...x.sfixKst, fertigung: x.sfixKst.fertigung - x.machines.reduce((s, m) => s + m.fix, 0) };
    if (x.level && x.qualKostenStk)
      P.qualKosten[x.level - 1] = x.qualKostenStk;
    const d = { ...emptyDecisions(), ...store.decHist[p] || {} };
    const pr = x.preisOnline || d.preisOnline;
    if (x.umsatzKanal) {
      d.absatzOnline = pr ? Math.round(x.umsatzKanal.online * 1e3 / pr) : 0;
      d.absatzEH = x.preisEH ? Math.round(x.umsatzKanal.eh * 1e3 / x.preisEH) : 0;
      d.ehAktiv = d.absatzEH > 0 || d.ehAktiv;
    } else if (x.history?.[p])
      d.absatzOnline = x.history[p].absatz;
    if (d.ehAktiv) {
      d.kbEH = x.decisions?.[p]?.kbEH ?? store.states[p]?.staff?.kbEH ?? d.kbEH;
      d.kbOnline = (x.staff?.kb ?? 0) - d.kbEH;
    }
    d.sonstErtrag = x.sonstErtrag || 0;
    store.istInputs[p] = { P, D: d };
    ensurePeriod(planPeriod());
    persist();
  }
  function renderStateEditor(p) {
    const s = store.states[p];
    const f = (path, l, d = 2) => `<div class="frow"><label>${esc(t(l))}</label>${numInput("s:" + path, getPath(s, path), d)}<span></span></div>`;
    return `<div class="card"><h3>${t("Endstand Periode")} ${p} ${t("bearbeiten")}</h3><div class="mask">
    <h2>${t("Lager")}</h2>${f("fe.qty", "Fertigerzeugnisse (St\xFCck)", 0)}${f("fe.varMat", "Lagerwert: variable Materialkosten (TEUR)")}${f("fe.fixMat", "Lagerwert: fixe Materialkosten (TEUR)")}
    ${f("fe.varFert", "Lagerwert: variable Fertigungskosten (TEUR)")}${f("fe.fixFert", "Lagerwert: fixe Fertigungskosten (TEUR)")}${f("mat.qty", "Einsatzstoffe (Einheiten)", 0)}${f("mat.value", "Einsatzstoffe Lagerwert (TEUR)")}
    <h2>${t("Personal")}</h2>${f("staff.einkauf", "Einkauf", 1)}${f("staff.verwaltung", "Verwaltung", 1)}${f("staff.fertigung", "Fertigung", 1)}${f("staff.kbOnline", "Kundenbetreuer Online", 1)}${f("staff.kbEH", "Kundenbetreuer Einzelhandel", 1)}
    <h2>${t("Produkt")}</h2>${f("level", "Produktqualit\xE4t (Level)", 0)}${f("preisOnline", "Preis Online Vorperiode (EUR)", 0)}
    <h2>${t("Bilanz")}</h2>${f("bilanz.grund", "Grundst\xFCcke und Bauten")}${f("bilanz.ford", "Forderungen aus L&L")}${f("bilanz.kasse", "Kassenbestand")}
    ${f("bilanz.gez", "Gezeichnetes Kapital")}${f("bilanz.krl", "Kapitalr\xFCcklage")}${f("bilanz.grl", "Gewinnr\xFCcklage")}${f("bilanz.gvVortrag", "Gewinnvortrag inkl. Perioden\xFCberschuss")}
    ${f("bilanz.lang", "Langfristige Verbindlichkeiten")}${f("bilanz.kurz", "Kurzfristiger Kredit")}${f("bilanz.dispo", "\xDCberziehungskredit")}${f("verlustvortrag", "Steuerlicher Verlustvortrag")}
    <h2>${t("Anlagen")}</h2><table class="des"><tr><th>Nr.</th><th>Typ</th><th>${t("Restlaufzeit")}</th><th>${t("Restbuchwert")}</th><th>${t("AfA/Periode")}</th><th>${t("Fixkosten")}</th><th>${t("Kapazit\xE4t")}</th><th></th></tr>
    ${s.machines.map((m, i) => `<tr><td>${m.nr}</td><td>${m.typ}</td>${["rlz", "rbw", "afaRate", "fix", "cap"].map((k) => `<td>${numInput(`s:machines.${i}.${k}`, m[k], k === "rlz" || k === "cap" ? 0 : 2, 'class="field"')}</td>`).join("")}
      <td><button class="btn ghost small" data-delmach="${i}">\u2715</button></td></tr>`).join("")}</table>
    <div class="row" style="margin-top:8px"><button class="btn ghost small" data-addmach="A">+ ${t("Anlage Typ A")}</button><button class="btn ghost small" data-addmach="B">+ ${t("Anlage Typ B")}</button>
    <button class="btn" data-route="daten">${t("Fertig")}</button></div></div></div>`;
  }
  var installEvt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installEvt = e;
  });
  function renderSettings() {
    const th = [["light", "Hell"], ["dark", "Dunkel"], ["midnight", "Mitternacht"]];
    return `<div class="card"><h3>${t("Rechnen")}</h3><div class="seg">
      <label class="segopt ${store.calcMode !== "live" ? "on" : ""}"><input type="radio" name="cm" data-calcmode="1" value="save" ${store.calcMode !== "live" ? "checked" : ""}> ${t("Erst bei \u201ESpeichern\u201C (ge\xE4nderte Zeilen markieren)")}</label>
      <label class="segopt ${store.calcMode === "live" ? "on" : ""}"><input type="radio" name="cm" data-calcmode="1" value="live" ${store.calcMode === "live" ? "checked" : ""}> ${t("Sofort bei jeder \xC4nderung")}</label></div>
      <p class="muted">${t("Bei \u201EErst bei Speichern\u201C bleibt das Ergebnis unten stehen, bis du speicherst. Danach zeigt die Leiste, was sich ver\xE4ndert hat.")}</p></div>
    <div class="card"><h3>${t("Darstellung")}</h3><div class="seg">${th.map(([k, l]) => `<button data-theme="${k}" class="${store.theme === k ? "on" : ""}">${t(l)}</button>`).join("")}</div></div>
    <div class="card"><h3>${t("Sprache")}</h3><div class="seg"><button data-lang="de" class="${getLang() === "de" ? "on" : ""}">Deutsch</button><button data-lang="bar" class="${getLang() === "bar" ? "on" : ""}">Boarisch</button></div></div>
    <div class="card"><h3>${t("Unternehmen")}</h3><div class="mask"><div class="frow"><label>${t("Marke")}</label><input type="text" id="firma" value="${esc(store.firma)}"><span></span></div>
      <div class="frow"><label>${t("Unternehmen")}</label><input type="text" id="untern" value="${esc(store.unternehmen)}"><span></span></div></div></div>
    <div class="card"><h3>${t("App installieren")}</h3><p class="muted">${t("Windows/Android: in Edge oder Chrome auf \u201EApp installieren\u201C tippen. iPhone/iPad: in Safari \u201ETeilen\u201C \u2192 \u201EZum Home-Bildschirm\u201C.")}</p>
      <button class="btn" id="install" ${installEvt ? "" : "disabled"}>${t("Jetzt installieren")}</button></div>
    <div class="card"><h3>${t("\xDCber")}</h3><p class="muted">TONWERK Planrechner ${VERSION} \xB7 ${t("Rechenkern gepr\xFCft gegen echte TOPSIM-Berichte (Abweichung 0,00 T\u20AC). Open Source unter MIT-Lizenz.")}</p></div>`;
  }
  function renderHilfe() {
    const rules = [
      ["Absatz und Lieferung", "Planabsatz wie in TOPSIM als Annahme. Lieferreihenfolge: Gro\xDFabnehmer, Online-Shop, Einzelhandel. Verkauft wird h\xF6chstens Lagerbestand + Fertigung."],
      ["Zahlungen", "80 % des Umsatzes (Online + Einzelhandel) kommen sofort, 20 % in der Folgeperiode (Forderungen). Gro\xDFabnehmer zahlen sofort. Einsatzstoffe werden sofort bezahlt."],
      ["Fertigung", "Kapazit\xE4t = Summe der Anlagen. Personal: 2.000 St\xFCck je MA, bis +20 % \xDCberstunden mit 25 % Zuschlag. Nicht ausgelastete MA gehen in die Fertigungsgemeinkosten."],
      ["Einsatzstoffe", "Staffelpreis gilt f\xFCr die gesamte Bestellmenge. Fehlmengen automatisch per Just-in-Time. Lagerbewertung zum Durchschnittspreis. Lager 3 \u20AC/Einheit, Fertigerzeugnisse 5 \u20AC/St\xFCck auf den Endbestand."],
      ["Personal Einkauf/Verwaltung", "Wird automatisch nach dem Umsatz angepasst (Tabelle Handbuch 3.4.5, linear interpoliert, auf 0,5 gerundet). Einstellung 15 TEUR, Entlassung 10 TEUR, Nebenkosten 30 %."],
      ["Lagerbewertung", "Fertigerzeugnisse zu Herstellkosten, gewichteter Durchschnitt aus Anfangsbestand und Produktion, getrennt nach Material/Fertigung, variabel/fix."],
      ["Qualit\xE4t", "Max. +2 Level je Periode, 100 TEUR je Level, variable Qualit\xE4tskosten je verkauftem St\xFCck nach aktuellem Level."],
      ["Finanzierung", "Kasse mindestens 10 TEUR, sonst automatisch \xDCberziehungskredit (Zins auf den Endbestand, R\xFCckzahlung in der Folgeperiode). Langfristiger Kredit 750 TEUR zu 4 %."],
      ["Steuern", "35 % auf den Gewinn vor Steuern, Verluste werden vorgetragen."],
      ["Erfolgswert", "Sch\xE4tzung: \u221233 + 0,36 \xD7 J\xDC + 0,071 \xD7 Eigenkapital + 13,9 \xD7 Level (anpassbar unter Rahmendaten)."]
    ];
    return `<div class="card"><h3>${t("So funktioniert der Planrechner")}</h3><ol>
    <li>${t("Entscheidungen in den drei Masken eintragen \u2013 genau wie in TOPSIM. Ge\xE4nderte Zeilen werden markiert, gerechnet wird beim Speichern (umstellbar in den Einstellungen).")}</li>
    <li>${t("Gro\xDFabnehmer und kurzfristiger Kredit sind ausgeblendet, bis TOPSIM sie anbietet. Einblenden unten in der jeweiligen Maske.")}</li>
    <li>${t("Die Absatzprognose schl\xE4gt den Planabsatz vor. \u201EHebel & Optimierer\u201C sucht die beste Kombination, \u201EVorschau\u201C rechnet bis Periode 6.")}</li>
    <li>${t("\u201ESpeichern\u201C \xFCbernimmt den Stand ins Szenario. Mehrere Szenarien lassen sich anlegen und vergleichen.")}</li>
    <li>${t("Unter \u201EBerichtswesen\u201C stehen alle TOPSIM-Berichte, als ZIP mit Einzel-PDFs herunterladbar.")}</li>
    <li>${t("Nach jeder Periode den neuen Sammelbericht unter \u201EDaten & Import\u201C einf\xFCgen. Dann beginnt die n\xE4chste Planperiode.")}</li>
    <li>${t("Neue Eingabefelder (z. B. aus neuen TOPSIM-Masken) \xFCber \u201E+ Feld\u201C in jeder Kategorie anlegen.")}</li></ol></div>
    <div class="card"><h3>${t("Spielregeln (Teilnehmerhandbuch)")}</h3>${rules.map(([h, x]) => `<p><b>${esc(t(h))}:</b> ${esc(t(x))}</p>`).join("")}</div>`;
  }
  function fieldDialog(cat, field) {
    const dlg = $("#dlg");
    const f = field || { label: "", unit: "", effect: "fix", kst: "verwaltung", def: 0, dec: 2, note: "" };
    dlg.innerHTML = `<form method="dialog"><h3 style="margin-top:0">${field ? t("Feld bearbeiten") : t("Neues Eingabefeld")}</h3>
    <label>${t("Bezeichnung")}</label><input class="field" id="fl" value="${esc(f.label)}" required>
    <label>${t("Einheit")}</label><input class="field" id="fu" value="${esc(f.unit)}" placeholder="TEUR, EUR, St\xFCck \u2026">
    <label>${t("Wirkung in der Rechnung")}</label><select class="field" id="fe">${EFFECTS.map(([k, l]) => `<option value="${k}" ${f.effect === k ? "selected" : ""}>${t(l)}</option>`).join("")}</select>
    <label>${t("Kostenstelle (bei fixen Kosten)")}</label><select class="field" id="fk">${["einkauf", "fertigung", "vertrieb", "verwaltung"].map((k) => `<option ${f.kst === k ? "selected" : ""}>${k}</option>`).join("")}</select>
    <label>${t("Standardwert")}</label><input class="field" id="fd" value="${esc(nf(f.def, f.dec))}">
    <label>${t("Nachkommastellen")}</label><input class="field" id="fdec" value="${f.dec}">
    <label>${t("Hinweis (optional)")}</label><input class="field" id="fn" value="${esc(f.note || "")}">
    <div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn ghost" value="cancel">${t("Abbrechen")}</button><button class="btn save" value="ok" id="fok">${t("Speichern")}</button></div></form>`;
    dlg.showModal();
    dlg.onclose = () => {
      if (dlg.returnValue !== "ok")
        return;
      const nf2 = {
        id: field?.id || uid(),
        cat: field?.cat || cat,
        label: $("#fl", dlg).value.trim() || t("Neues Feld"),
        unit: $("#fu", dlg).value.trim(),
        effect: $("#fe", dlg).value,
        kst: $("#fk", dlg).value,
        def: parseNum($("#fd", dlg).value),
        dec: Math.max(0, Math.min(4, parseNum($("#fdec", dlg).value))),
        note: $("#fn", dlg).value.trim()
      };
      if (field)
        Object.assign(field, nf2);
      else
        store.customFields.push(nf2);
      persist();
      render();
      toast(t("Feld gespeichert"));
    };
  }
  var LEVERS = [
    { k: "preisOnline", l: "Preis Online-Markt", u: "EUR", d: 0 },
    { k: "preisEH", l: "Preis Einzelhandel", u: "EUR", d: 0, eh: true },
    { k: "werbungOnline", l: "Werbung Online-Markt", u: "TEUR", d: 0 },
    { k: "werbungEH", l: "Werbung Einzelhandel", u: "TEUR", d: 0, eh: true },
    { k: "kbOnline", l: "Kundenbetreuer Online", u: "Pers.", d: 1 },
    { k: "kbEH", l: "Kundenbetreuer Einzelhandel", u: "Pers.", d: 1, eh: true },
    { k: "ci", l: "Corporate Identity", u: "TEUR", d: 0 },
    { k: "levelUp", l: "Zuwachs Produktqualit\xE4t", u: "Level", d: 0 },
    { k: "einkauf", l: "Einsatzstoffe", u: "Einh.", d: 0 },
    { k: "fertigung", l: "Fertigungsmenge", u: "St\xFCck", d: 0 },
    { k: "fertigungMA", l: "Fertigungspersonal", u: "Pers.", d: 1 },
    { k: "investA", l: "Neue Anlagen Typ A", u: "St\xFCck", d: 0 },
    { k: "investB", l: "Neue Anlagen Typ B", u: "St\xFCck", d: 0 }
  ];
  function defaultLever(k, d, S, P) {
    const v = Number(d[k]) || 0, cap = S.machines.reduce((a, m) => a + m.cap, 0);
    const r = {
      preisOnline: [v - 10, v + 10, 1],
      preisEH: [v - 10, v + 10, 1],
      werbungOnline: [Math.max(0, v - 150), v + 200, 25],
      werbungEH: [0, v + 140, 20],
      kbOnline: [v, v + 4, 1],
      kbEH: [v, v + 3, 1],
      ci: [Math.max(0, v - 100), v + 150, 25],
      levelUp: [0, P.maxLevelUp, 1],
      einkauf: [0, 1e5, 5e3],
      fertigung: [Math.max(0, v - 15e3), Math.max(cap + 12e3, v), 1e3],
      fertigungMA: [S.staff.fertigung, S.staff.fertigung + 6, 1],
      investA: [0, 2, 1],
      investB: [0, 2, 1]
    }[k];
    return { lock: ["levelUp", "investA", "investB"].includes(k), min: r[0], max: r[1], step: r[2] };
  }
  function optSet(p = planPeriod()) {
    var _a, _b, _c;
    const o = (_a = store.opt)[p] || (_a[p] = { levers: {}, cons: { maxDispo: 0, minLager: 0, maxLager: 0, lieferfaehig: false } });
    const d = calcSrc().decisions, S = store.states[p - 1], P = store.params[p];
    for (const L of LEVERS)
      (_b = o.levers)[_c = L.k] || (_b[_c] = defaultLever(L.k, d, S, P));
    return o;
  }
  function evalDec(d, custom = calcSrc().custom) {
    const p = planPeriod();
    const x = effDec({ ...d, absatzAutoOnline: true, absatzAutoEH: true }, p);
    const R = simulate(store.states[p - 1], store.params[p], x, { fields: store.customFields, values: { ...store.paramCustom[p], ...custom } });
    return { R, x };
  }
  function score(R, x, cons) {
    let pen = 0;
    if (cons.maxDispo > 0 && R.kpi.dispo > cons.maxDispo)
      pen += 50 + (R.kpi.dispo - cons.maxDispo) / 10;
    if (cons.maxLager > 0 && R.lagerFE.ende.qty > cons.maxLager)
      pen += 50 + (R.lagerFE.ende.qty - cons.maxLager) / 100;
    const nach = x.absatzOnline + (x.ehAktiv ? x.absatzEH : 0);
    if (cons.lieferfaehig && R.absatz.online + R.absatz.eh < nach - 0.5)
      pen += 50 + (nach - R.absatz.online - R.absatz.eh) / 100;
    return R.kpi.erfolgswert - pen;
  }
  function gridOf(L) {
    const out = [];
    const st = Math.max(Number(L.step) || 1, 1e-9);
    for (let v = Number(L.min); v <= Number(L.max) + 1e-9 && out.length < 400; v += st)
      out.push(Math.round(v * 1e3) / 1e3);
    return out;
  }
  function optimize() {
    const o = optSet(), base = clone(calcSrc().decisions);
    const free = LEVERS.filter((L) => !o.levers[L.k].lock && (!L.eh || base.ehAktiv));
    let best = { ...base };
    for (const L of free) {
      const g = gridOf(o.levers[L.k]);
      if (g.length)
        best[L.k] = g.reduce((a, v) => Math.abs(v - best[L.k]) < Math.abs(a - best[L.k]) ? v : a, g[0]);
    }
    let { R, x } = evalDec(best);
    let bs = score(R, x, o.cons), evals = 1;
    for (let pass = 0; pass < 8; pass++) {
      let improved = false;
      for (const L of free) {
        for (const v of gridOf(o.levers[L.k])) {
          if (v === best[L.k])
            continue;
          const cand = { ...best, [L.k]: v };
          const e = evalDec(cand);
          evals++;
          const sc = score(e.R, e.x, o.cons);
          if (sc > bs + 1e-6) {
            bs = sc;
            best = cand;
            improved = true;
          }
        }
      }
      for (const [a, b] of [["fertigung", "fertigungMA"], ["fertigung", "einkauf"]]) {
        if (!free.find((L) => L.k === a) || !free.find((L) => L.k === b))
          continue;
        for (const va of gridOf(o.levers[a]))
          for (const vb of [best[b] - o.levers[b].step, best[b] + o.levers[b].step]) {
            if (vb < o.levers[b].min || vb > o.levers[b].max)
              continue;
            const cand = { ...best, [a]: va, [b]: vb };
            const e = evalDec(cand);
            evals++;
            const sc = score(e.R, e.x, o.cons);
            if (sc > bs + 1e-6) {
              bs = sc;
              best = cand;
              improved = true;
            }
          }
      }
      if (!improved)
        break;
    }
    const e0 = evalDec(base), e1 = evalDec(best);
    return { base, best, R0: e0.R, R1: e1.R, x1: e1.x, evals, ok: score(e1.R, e1.x, o.cons) > e1.R.kpi.erfolgswert - 1, free: free.map((L) => L.k) };
  }
  function renderPrognose() {
    const p = planPeriod(), s = progSet(p), sc = scen(), d = calcSrc(sc).decisions, S = store.states[p - 1];
    const m = modelFor(p), f = prognose(p, d, S), ctx = progCtx(p, d), own = ctx.own, konk = konkFor(p);
    const shares2 = f.shares;
    let h = `<div class="card"><h3>${t("Absatzprognose Periode")} ${p} \xB7 ${esc(sc.name)}</h3><div class="kpis">
    <div><span>${t("Online-Markt")}</span><b>${nf(f.online, 0)}</b><small>${t("St\xFCck")} \xB7 ${nf(f.shareOnline, 1)} % ${t("Marktanteil")}</small></div>
    <div><span>${t("Einzelhandel")}</span><b>${d.ehAktiv ? nf(f.eh, 0) : "\u2013"}</b><small>${d.ehAktiv ? `${t("St\xFCck")} \xB7 ${nf(f.shareEH, 1)} % ${t("Anteil")}` : t("nicht aktiv")}</small></div>
    <div><span>${t("Marktvolumen online")}</span><b>${nf(ctx.markt, 0)}</b><small>${t("St\xFCck (alle 6 Firmen)")}</small></div>
    <div><span>${t("Eigene Bekanntheit (gesch\xE4tzt)")}</span><b>${nf(ctx.ownBek, 1)}</b><small>${t("Index, inkl. CI-Wirkung")}</small></div></div>
    <p class="muted">${t("Planabsatz im Szenario")}: ${nf(effDec(d).absatzOnline, 0)} ${t("online")}${d.ehAktiv ? ` + ${nf(effDec(d).absatzEH, 0)} ${t("Einzelhandel")}` : ""}. ${t("Die Prognose ist ein Modell aus nur wenigen Datenpunkten und ersetzt kein Nachdenken \xFCber die Konkurrenz.")}</p></div>`;
    const cols = [["p", "Preis", 0], ["L", "Level", 0], ["W", "Werbung", 0], ["K", "KB", 1], ["B", "Bekanntheit", 1], ["pEH", "Preis EH", 0], ["WEH", "Werbung EH", 0], ["KEH", "KB EH", 1]];
    h += `<div class="card"><h3>${t("Konkurrenz-Annahmen f\xFCr Periode")} ${p} (${t("Was w\xE4re wenn")})</h3>
    <p class="muted">${t("Vorbelegt mit den Werten aus dem letzten Marktforschungsbericht. Preise bleiben wie zuletzt, das Level steigt im bisherigen Tempo. Jede Zahl ist \xE4nderbar, die Prognose rechnet sofort mit.")}</p>
    <div class="row" style="margin-bottom:8px"><button class="btn ghost small" data-tool="kpreis" data-v="-5">${t("Alle Konkurrenzpreise")} \u22125 \u20AC</button><button class="btn ghost small" data-tool="kpreis" data-v="5">+5 \u20AC</button>
      <button class="btn ghost small" data-tool="klevel" data-v="1">${t("Alle Konkurrenten Level")} +1</button><button class="btn ghost small" data-tool="kwerb" data-v="50">${t("Werbung aller Konkurrenten")} +50</button>
      <button class="btn ghost small" data-tool="kreset">${t("Auf Fortschreibung zur\xFCcksetzen")}</button></div>
    <div class="tbl"><table class="r edit"><thead><tr><th></th>${cols.map((c) => `<th>${t(c[1])}</th>`).join("")}<th>${t("Im EH")}</th><th>${t("Anteil online")}</th><th>${t("Absatz online")}</th></tr></thead><tbody>
    ${konk.map((k, i) => i === own ? `<tr class="own"><td>${esc(k.name)} \xB7 ${t("ihr")}</td><td>${nf(d.preisOnline, 0)}</td><td>${nf(f.firms[i].L, 0)}</td><td>${nf(d.werbungOnline, 0)}</td><td>${nf(d.kbOnline, 1)}</td><td>${nf(ctx.ownBek, 1)}</td>
          <td>${d.ehAktiv ? nf(d.preisEH, 0) : "\u2013"}</td><td>${d.ehAktiv ? nf(d.werbungEH, 0) : "\u2013"}</td><td>${d.ehAktiv ? nf(d.kbEH, 1) : "\u2013"}</td><td>${d.ehAktiv ? "\u2713" : "\u2013"}</td><td>${nf(shares2[i] * 100, 1)} %</td><td><b>${nf(f.online, 0)}</b></td></tr>` : `<tr><td>${esc(k.name)}</td>${cols.map(([c, , dd]) => `<td>${numInput(`kk:${i}:${c}`, k[c], dd, 'class="field cell"')}</td>`).join("")}
          <td><input type="checkbox" data-konkakt="${i}" data-f="ehAktiv" ${k.ehAktiv !== false ? "checked" : ""}></td><td>${nf(shares2[i] * 100, 1)} %</td><td>${nf(ctx.markt * shares2[i], 0)}</td></tr>`).join("")}
    </tbody></table></div></div>`;
    const last2 = lastFirms(p);
    h += `<div class="grid2"><div class="card"><h3>${t("Markt")}</h3><div class="mask">
    <div class="frow"><label>${t("Basis: potenzieller Absatz aller Firmen")} P${last2?.q ?? "\u2013"}</label><span>${nf(last2 ? last2.f.reduce((a, x) => a + x.D, 0) : 24e4, 0)} ${t("St\xFCck")}</span><span></span></div>
    <div class="frow"><label>${t("Marktwachstum (%)")}</label>${numInput("ps:wachstum", s.wachstum, 1)}${hint("Ver\xE4nderung des Gesamtmarkts gegen\xFCber der Vorperiode. Hinweise dazu stehen in den Wirtschaftsnachrichten (z. B. \u201EMarkt stagniert\u201C = 0 %).")}</div>
    <div class="frow"><label>${t("Marktvolumen manuell (St\xFCck, 0 = automatisch)")}</label>${numInput("ps:marktManuell", s.marktManuell, 0)}<span></span></div>
    <div class="frow"><label>${t("Einzelhandel: Gr\xF6\xDFe in % des Online-Markts")}</label>${numInput("ps:ehAnteil", s.ehAnteil, 1)}${hint("Gr\xF6\xDFe des Einzelhandels im Verh\xE4ltnis zum Online-Markt, laut Wirtschaftsnachrichten der Periode, in der er freigeschaltet wird.")}</div>
    <div class="frow"><label>${t("CI-Wirkung auf Bekanntheit (Punkte je ln-Einheit)")}</label>${numInput("ps:ciKoef", s.ciKoef, 2)}${hint("Wie stark eigene CI-Ausgaben die Bekanntheit ver\xE4ndern. Startwert aus Beobachtungen im Spiel: 25 statt 150 TEUR CI kosteten etwa 9 Punkte.")}</div></div></div>
    <div class="card"><h3>${t("Modell")}</h3><div class="seg" style="margin-bottom:8px"><button data-tool="mauto" data-v="1" class="${s.auto ? "on" : ""}">${t("Automatisch kalibriert")}</button><button data-tool="mauto" data-v="0" class="${!s.auto ? "on" : ""}">${t("Eigene Werte")}</button></div>
    <div class="tbl"><table class="r"><thead><tr><th></th><th>${t("Handbuch")}</th><th>${t("verwendet")}</th></tr></thead><tbody>
    ${[["ep", "Preiselastizit\xE4t", 2], ["q", "Qualit\xE4tsaufschlag je Level (EUR)", 2], ["ew", "Werbewirkung", 3], ["ek", "Wirkung Kundenbetreuer", 3], ["eb", "Wirkung Bekanntheit", 3]].map(([k, l, dd]) => `<tr><td>${t(l)}</td><td>${nf(PRIOR[k], dd)}</td><td>${s.auto ? nf(m.coef[k], dd) : numInput("ps:coef." + k, s.coef[k], dd, 'class="field cell"')}</td></tr>`).join("")}</tbody></table></div>
    ${s.auto ? `<p class="muted">${t("Kalibriert an")} ${m.n} ${t("Datenpunkten (Marktforschung aller Firmen). Mittlere Abweichung")} ${nf(m.mape ?? 0, 1)} %. ${t("Nach jedem Berichtsimport lernt das Modell automatisch nach.")}</p>
      <div class="frow"><label>${t("Bindung an die Handbuchwerte")}</label>${numInput("ps:lambda", s.lambda, 2)}${hint("0 = nur die Daten z\xE4hlen, 1 = stark an den Handbuchwerten. Mit wenigen Perioden ist 0,3 ein guter Kompromiss.")}</div>` : ""}
    </div></div>`;
    return h;
  }
  function renderOptimierer() {
    const p = planPeriod(), o = optSet(p), d = calcSrc().decisions, base = evalDec(d);
    let h = `<div class="card"><h3>${t("Hebel-Analyse")}</h3><p class="muted">${t("Was bringt ein Schritt nach oben oder unten, wenn alles andere gleich bleibt? Der Absatz kommt dabei immer aus der Prognose. Basis: Szenario")} \u201E${esc(scen().name)}\u201C, ${t("Erfolgswert")} \u2248 ${nf(base.R.kpi.erfolgswert, 1)}.</p>
    <div class="tbl"><table class="r"><thead><tr><th>${t("Hebel")}</th><th>${t("aktuell")}</th><th>${t("Schritt")}</th><th>\u0394 ${t("Absatz")} \u2212</th><th>\u0394 J\xDC \u2212</th><th>\u0394 EW \u2212</th><th>\u0394 ${t("Absatz")} +</th><th>\u0394 J\xDC +</th><th>\u0394 EW +</th><th style="min-width:120px">EW</th></tr></thead><tbody>`;
    const rows = [];
    for (const L of LEVERS) {
      if (L.eh && !d.ehAktiv)
        continue;
      const st = Number(o.levers[L.k].step) || 1, v = Number(d[L.k]) || 0;
      const eff = (nv) => {
        if (nv < 0)
          return null;
        const e = evalDec({ ...d, [L.k]: nv });
        return { a: e.R.absatz.sold - base.R.absatz.sold, j: e.R.kpi.ju - base.R.kpi.ju, e: e.R.kpi.erfolgswert - base.R.kpi.erfolgswert };
      };
      rows.push({ L, v, st, m: eff(v - st), pl: eff(v + st) });
    }
    const mx = Math.max(1, ...rows.flatMap((r) => [Math.abs(r.m?.e || 0), Math.abs(r.pl?.e || 0)]));
    const c = (x, dd) => x === void 0 || x === null ? "\u2013" : `<span class="${x > 5e-3 ? "pos" : x < -5e-3 ? "negv" : ""}">${x > 0 ? "+" : ""}${nf(x, dd)}</span>`;
    for (const r of rows) {
      const bar = (x) => `<span class="hbar ${x >= 0 ? "p" : "n"}" style="width:${Math.abs(x) / mx * 50}%"></span>`;
      h += `<tr><td>${t(r.L.l)}</td><td>${nf(r.v, r.L.d)} ${r.L.u}</td><td>\xB1 ${nf(r.st, r.L.d)}</td><td>${c(r.m?.a, 0)}</td><td>${c(r.m?.j, 2)}</td><td>${c(r.m?.e, 1)}</td>
      <td>${c(r.pl?.a, 0)}</td><td>${c(r.pl?.j, 2)}</td><td>${c(r.pl?.e, 1)}</td><td class="bars"><span class="half l">${r.m ? bar(r.m.e) : ""}</span><span class="half r">${r.pl ? bar(r.pl.e) : ""}</span></td></tr>`;
    }
    h += `</tbody></table></div><p class="foot">${t("Linker Balken: Schritt nach unten, rechter Balken: Schritt nach oben. Gr\xFCn = Erfolgswert steigt.")}</p></div>`;
    h += `<div class="card"><h3>${t("Platz-1-Optimierer")} \xB7 ${t("Periode")} ${p}</h3>
    <p class="muted">${t("Sucht die Kombination mit dem h\xF6chsten gesch\xE4tzten Erfolgswert. Gesperrte Hebel bleiben auf dem Wert aus dem Szenario. Bereiche und Schrittweiten gelten f\xFCr diese Periode und lassen sich jederzeit \xE4ndern. Ein Minimum unter dem aktuellen Personal bedeutet Entlassungen.")}</p>
    <div class="tbl"><table class="r edit"><thead><tr><th>${t("Hebel")}</th><th>${t("frei")}</th><th>${t("aktuell")}</th><th>${t("Min")}</th><th>${t("Max")}</th><th>${t("Schritt")}</th></tr></thead><tbody>
    ${LEVERS.map((L) => {
      const c2 = o.levers[L.k];
      const na = L.eh && !d.ehAktiv;
      return `<tr class="${c2.lock || na ? "locked" : ""}"><td>${c2.lock ? "\u{1F512} " : "\u{1F513} "}${t(L.l)} <span class="muted">(${L.u})</span></td><td><input type="checkbox" data-lock="${L.k}" ${!c2.lock ? "checked" : ""} ${na ? "disabled" : ""}></td><td>${nf(d[L.k] || 0, L.d)}</td>
        ${["min", "max", "step"].map((f) => `<td>${numInput(`ol:${L.k}:${f}`, c2[f], L.d, 'class="field cell"')}</td>`).join("")}</tr>`;
    }).join("")}
    </tbody></table></div>
    <h4>${t("Grenzen")} <span class="muted">(${t("0 = keine Grenze")})</span></h4><div class="mask">
    <div class="frow"><label>${t("\xDCberziehungskredit h\xF6chstens (TEUR)")}</label>${numInput("oc:maxDispo", o.cons.maxDispo, 0)}<span></span></div>
    <div class="frow"><label>${t("Lager Fertigerzeugnisse am Periodenende h\xF6chstens (St\xFCck)")}</label>${numInput("oc:maxLager", o.cons.maxLager, 0)}<span></span></div>
    <div class="frow"><label>${t("Prognose muss voll lieferbar sein")}</label><span><input type="checkbox" data-tool-check="lieferfaehig" ${o.cons.lieferfaehig ? "checked" : ""}></span><span></span></div></div>
    <div class="row" style="margin-top:10px"><button class="btn save" data-tool="optrun">${t("Optimieren")}</button><button class="btn ghost small" data-tool="optreset">${t("Bereiche neu aus dem Szenario vorbelegen")}</button></div>
    <div id="optres">${ui.optResult ? optResultHtml(ui.optResult) : ""}</div></div>`;
    return h;
  }
  function optResultHtml(r) {
    const ch = LEVERS.filter((L) => r.best[L.k] !== r.base[L.k]);
    const k = (R) => [R.kpi.erfolgswert, R.kpi.ju, R.absatz.sold, R.kpi.dispo, R.lagerFE.ende.qty, R.kpi.ek];
    const a = k(r.R0), b = k(r.R1), lab = [["Erfolgswert \u2248", 1], ["J\xDC (TEUR)", 2], ["Absatz (St\xFCck)", 0], ["\xDCberziehung (TEUR)", 2], ["Lager Ende (St\xFCck)", 0], ["Eigenkapital (TEUR)", 2]];
    return `<div class="note">${t("Gepr\xFCfte Kombinationen")}: ${nf(r.evals, 0)}.${r.ok ? "" : " \u26A0 " + t("Nicht alle Grenzen lie\xDFen sich einhalten.")}</div>
    <div class="grid2"><div class="tbl"><table class="r"><thead><tr><th>${t("Hebel")}</th><th>${t("aktuell")}</th><th>${t("Vorschlag")}</th></tr></thead><tbody>
    ${ch.length ? ch.map((L) => `<tr><td>${t(L.l)}</td><td>${nf(r.base[L.k] || 0, L.d)}</td><td><b>${nf(r.best[L.k], L.d)}</b></td></tr>`).join("") : `<tr><td colspan="3">${t("Keine bessere Kombination gefunden.")}</td></tr>`}
    <tr><td>${t("Planabsatz online (Prognose)")}</td><td>\u2013</td><td>${nf(r.x1.absatzOnline, 0)}</td></tr>${r.x1.ehAktiv ? `<tr><td>${t("Planabsatz Einzelhandel (Prognose)")}</td><td>\u2013</td><td>${nf(r.x1.absatzEH, 0)}</td></tr>` : ""}</tbody></table></div>
    <div class="tbl"><table class="r"><thead><tr><th></th><th>${t("aktuell")}</th><th>${t("Vorschlag")}</th><th>\u0394</th></tr></thead><tbody>
    ${lab.map(([l, dd], i) => `<tr><td>${t(l)}</td><td>${nf(a[i], dd)}</td><td><b>${nf(b[i], dd)}</b></td><td>${b[i] - a[i] > 0 ? "+" : ""}${nf(b[i] - a[i], dd)}</td></tr>`).join("")}</tbody></table></div></div>
    <div class="row" style="margin-top:10px"><button class="btn save" data-tool="optapply">${t("Als neues Szenario speichern")}</button></div>`;
  }
  function vorschauParams(P, k) {
    const f = (1 + (store.vorschauInfl ?? 3) / 100) ** k, x = clone(P);
    for (const g in x.gehalt)
      x.gehalt[g] = Math.round(x.gehalt[g] * f * 10) / 10;
    x.matStaffel = x.matStaffel.map(([a, pr]) => [a, Math.round(pr * f)]);
    x.jitPreis = Math.round(x.jitPreis * f);
    return x;
  }
  var VS_KEYS = ["preisOnline", "preisEH", "werbungOnline", "werbungEH", "kbOnline", "kbEH", "ci", "levelUp", "einkauf", "fertigung", "fertigungMA", "investA", "investB"];
  function vorschauRun(sc = scen()) {
    const p = planPeriod(), last2 = 6, out = [];
    let S = store.states[p - 1], prev = calcSrc(sc).decisions;
    sc.vorschau || (sc.vorschau = {});
    for (let k = p; k <= Math.max(p, last2); k++) {
      const ahead = k - p;
      let d, P;
      if (k === p) {
        d = prev;
        P = store.params[p];
      } else {
        d = { ...prev, levelUp: 0, investA: 0, investB: 0, desinvest: [], absatzAutoOnline: true, absatzAutoEH: true, _prevCI: prev.ci, ...sc.vorschau[k] || {} };
        P = vorschauParams(store.params[p], ahead);
      }
      const x = effDec(d, k, S, ahead);
      const R = simulate(S, P, x, { fields: store.customFields, values: { ...store.paramCustom[p], ...k === p ? calcSrc(sc).custom : {} } });
      out.push({ k, d, x, R });
      S = R.endState;
      prev = d;
    }
    return out;
  }
  function renderVorschau() {
    const sc = scen(), runs = vorschauRun(sc), p = planPeriod();
    const lab = {
      preisOnline: "Preis Online (EUR)",
      preisEH: "Preis Einzelhandel (EUR)",
      werbungOnline: "Werbung Online (TEUR)",
      werbungEH: "Werbung EH (TEUR)",
      kbOnline: "Kundenbetreuer Online",
      kbEH: "Kundenbetreuer EH",
      ci: "Corporate Identity (TEUR)",
      levelUp: "Level-Zuwachs",
      einkauf: "Einsatzstoffe (Einh.)",
      fertigung: "Fertigungsmenge (St\xFCck)",
      fertigungMA: "Fertigungspersonal",
      investA: "Neue Anlagen A",
      investB: "Neue Anlagen B"
    };
    const dec = { preisOnline: 0, preisEH: 0, werbungOnline: 0, werbungEH: 0, kbOnline: 1, kbEH: 1, ci: 0, levelUp: 0, einkauf: 0, fertigung: 0, fertigungMA: 1, investA: 0, investB: 0 };
    let h = `<div class="note">${t("Rollierende Vorschau bis zum Spielende (Periode 6). Periode")} ${p} ${t("kommt aus dem Szenario")} \u201E${esc(sc.name)}\u201C. ${t("Sp\xE4tere Perioden schreiben die Entscheidungen fort; jede Zelle ist \xE4nderbar (fett = selbst ge\xE4ndert). Absatz kommt aus der Prognose, Konkurrenten steigen +1 Level je Periode. Geh\xE4lter und Einkaufspreise steigen um die Inflation.")}</div>
    <div class="row" style="margin-bottom:8px"><span class="muted">${t("Inflation je Periode (%)")}</span> ${numInput("vs:infl", store.vorschauInfl ?? 3, 1, 'class="field" style="width:80px"')}
    <button class="btn ghost small" data-tool="vsreset">${t("Alle \xC4nderungen der Vorschau zur\xFCcksetzen")}</button></div>
    <div class="tbl"><table class="r edit"><thead><tr><th></th>${runs.map((r) => `<th>P${r.k}${r.k === p ? " (" + t("Plan") + ")" : ""}</th>`).join("")}</tr></thead><tbody>
    <tr class="sec"><td colspan="${runs.length + 1}">${t("Entscheidungen")}</td></tr>`;
    for (const key of VS_KEYS) {
      if ((key === "preisEH" || key === "werbungEH" || key === "kbEH") && !runs[0].d.ehAktiv)
        continue;
      h += `<tr><td>${t(lab[key])}</td>${runs.map((r) => r.k === p ? `<td>${nf(r.d[key] || 0, dec[key])}</td>` : `<td>${numInput(`vs:${r.k}:${key}`, r.d[key] || 0, dec[key], `class="field cell ${sc.vorschau?.[r.k]?.[key] !== void 0 ? "own" : ""}"`)}</td>`).join("")}</tr>`;
    }
    const res = [
      ["Absatz (Prognose, geliefert)", (r) => r.R.absatz.sold, 0],
      ["Umsatz (TEUR)", (r) => r.R.kpi.umsatz, 0],
      ["Jahres\xFCberschuss (TEUR)", (r) => r.R.kpi.ju, 2],
      ["Eigenkapital (TEUR)", (r) => r.R.kpi.ek, 0],
      ["\xDCberziehungskredit (TEUR)", (r) => r.R.kpi.dispo, 0],
      ["Lager Fertigerzeugnisse (St\xFCck)", (r) => r.R.lagerFE.ende.qty, 0],
      ["Produktqualit\xE4t (Level)", (r) => r.R.level.cur, 0],
      ["Erfolgswert \u2248", (r) => r.R.kpi.erfolgswert, 1]
    ];
    h += `<tr class="sec"><td colspan="${runs.length + 1}">${t("Ergebnisse")}</td></tr>`;
    for (const [l, fn, dd] of res)
      h += `<tr class="${l.startsWith("Erfolg") ? "b" : ""}"><td>${t(l)}</td>${runs.map((r) => `<td>${nf(fn(r), dd)}</td>`).join("")}</tr>`;
    h += `</tbody></table></div>`;
    const warn = runs.filter((r) => r.R.warnings.length).map((r) => `P${r.k}: ${r.R.warnings.map((w) => esc(t(w))).join(" \xB7 ")}`);
    if (warn.length)
      h += `<div class="note">\u26A0 ${warn.join("<br>\u26A0 ")}</div>`;
    h += `<p class="muted">${t("Summe Jahres\xFCberschuss")} P${p}\u2013P${runs[runs.length - 1].k}: <b>${nf(runs.reduce((a, r) => a + r.R.kpi.ju, 0))} T\u20AC</b> \xB7 ${t("Erfolgswert am Spielende")} \u2248 <b>${nf(runs[runs.length - 1].R.kpi.erfolgswert, 1)}</b></p>`;
    return h;
  }
  function renderPlanIst() {
    const closed = Object.keys(store.history).map(Number).filter((p) => p >= 1).sort((a, b) => a - b), own = ownIdx();
    const lam = progSet().lambda;
    let h = `<div class="note">${t("Vergleich eurer Planwerte mit dem tats\xE4chlichen Ergebnis. Das Prognosemodell wird hier fair gepr\xFCft: F\xFCr jede Periode wird es ohne die Daten dieser Periode kalibriert und mit den echten Werten der Konkurrenz gerechnet. Nach jedem Berichtsimport kommt eine Periode dazu und das Modell lernt nach.")}</div>
    <div class="tbl"><table class="r"><thead><tr><th></th>${closed.map((p) => `<th>P${p}</th>`).join("")}</tr></thead><tbody>`;
    const rows = closed.map((p) => {
      const dh = store.decHist[p] || {}, his = store.history[p] || {};
      const planAbs = (Number(dh.absatzOnline) || 0) + (dh.ehAktiv ? Number(dh.absatzEH) || 0 : 0);
      const firms = firmsFromMarkt(store.markt[p]);
      let model = null, pot = null;
      if (firms?.length === 6) {
        const obs = obsAll(p - 1).filter((o) => o.period !== p);
        const c = calibrate(obs, lam).coef;
        const M = firms.reduce((a, f) => a + f.D, 0);
        const fc = forecast(c, { own, konk: firms, markt: M, ehAnteil: 0, ownBek: firms[own].B }, { preisOnline: firms[own].p, werbungOnline: firms[own].W, kbOnline: firms[own].K }, firms[own].L);
        model = fc.online;
        pot = firms[own].D;
      }
      let planJu = null;
      const inp = store.istInputs[p];
      if (inp && store.states[p - 1] && dh.preisOnline)
        planJu = simulate(store.states[p - 1], inp.P, { ...inp.D, absatzOnline: dh.absatzOnline, absatzEH: dh.absatzEH || 0 }).kpi.ju;
      const E = (store.params[planPeriod()] || baseParams()).erfolgswert;
      const ewSchatz = his.ju !== void 0 ? E.a + E.ju * his.ju + E.ek * (his.ek || 0) + E.level * (his.level || 0) : null;
      return { p, planAbs, ist: his.absatz, pot, model, planJu, ju: his.ju, ew: his.erfolgswert, ewSchatz };
    });
    const pct = (a, b) => a && b ? `${nf((a / b - 1) * 100, 1)} %` : "\u2013";
    const line = (l, fn, dd, cls = "") => `<tr class="${cls}"><td>${t(l)}</td>${rows.map((r) => {
      const v = fn(r);
      return `<td>${v === null || v === void 0 ? "\u2013" : typeof v === "string" ? v : nf(v, dd)}</td>`;
    }).join("")}</tr>`;
    h += `<tr class="sec"><td colspan="${rows.length + 1}">${t("Absatz")}</td></tr>` + line("Euer Planabsatz (St\xFCck)", (r) => r.planAbs, 0) + line("Tats\xE4chlicher Absatz (St\xFCck)", (r) => r.ist, 0) + line("Potenzieller Absatz laut Marktforschung", (r) => r.pot, 0) + line("Abweichung Plan zu Nachfrage", (r) => pct(r.planAbs, r.pot), 0, "b") + line("Modellprognose (ohne diese Periode kalibriert)", (r) => r.model, 0) + line("Abweichung Modell zu Nachfrage", (r) => pct(r.model, r.pot), 0, "b") + `<tr class="sec"><td colspan="${rows.length + 1}">${t("Ergebnis")}</td></tr>` + line("Plan-J\xDC mit eurem Planabsatz (TEUR)", (r) => r.planJu, 2) + line("Tats\xE4chlicher J\xDC (TEUR)", (r) => r.ju, 2) + line("Abweichung J\xDC (TEUR)", (r) => r.planJu !== null && r.ju !== void 0 ? r.ju - r.planJu : null, 2, "b") + line("Erfolgswert laut TOPSIM", (r) => r.ew, 2) + line("Erfolgswert laut Sch\xE4tzformel", (r) => r.ewSchatz, 2);
    h += `</tbody></table></div>`;
    const loo = looCheck(obsAll(), lam).filter((x) => x.rows.some((r) => Math.abs(r.modell - r.ist) > 0.5));
    if (loo.length) {
      h += `<div class="card"><h3>${t("Modellg\xFCte \xFCber alle sechs Unternehmen")}</h3><div class="tbl"><table class="r"><thead><tr><th></th>${loo[0].rows.map((r) => `<th>${esc(r.name)}</th>`).join("")}<th>\xD8 ${t("Abw.")}</th></tr></thead><tbody>
      ${loo.map((x) => `<tr><td>P${x.period} ${t("Nachfrage")}</td>${x.rows.map((r) => `<td>${nf(r.ist, 0)}</td>`).join("")}<td></td></tr>
        <tr><td>P${x.period} ${t("Modell")}</td>${x.rows.map((r) => `<td>${nf(r.modell, 0)}</td>`).join("")}<td>${nf(x.rows.reduce((a, r) => a + Math.abs(r.modell / r.ist - 1), 0) / x.rows.length * 100, 1)} %</td></tr>`).join("")}
      </tbody></table></div><p class="foot">${t("Je mehr Perioden importiert sind, desto genauer wird das Modell. Mit zwei Perioden ist eine Abweichung um 15 % normal.")}</p></div>`;
    }
    return h;
  }
  function toolInput(k, v, el) {
    var _a, _b;
    const p = planPeriod(), parts = k.split(":");
    if (parts[0] === "kk")
      konkFor(p)[Number(parts[1])][parts[2]] = v;
    else if (parts[0] === "ps")
      setPath(progSet(p), parts[1], v);
    else if (parts[0] === "ol")
      optSet(p).levers[parts[1]][parts[2]] = v;
    else if (parts[0] === "oc")
      optSet(p).cons[parts[1]] = v;
    else if (parts[0] === "vs") {
      if (parts[1] === "infl")
        store.vorschauInfl = v;
      else {
        const sc = scen();
        sc.vorschau || (sc.vorschau = {});
        ((_a = sc.vorschau)[_b = parts[1]] || (_a[_b] = {}))[parts[2]] = v;
      }
    }
    persist();
  }
  var TOOL_KEY = /^(kk|ps|ol|oc|vs):/;
  async function toolClick(ds, el) {
    const p = planPeriod();
    switch (ds.tool) {
      case "kpreis":
        konkFor(p).forEach((k, i) => {
          if (i !== ownIdx()) {
            k.p += Number(ds.v);
            k.pEH = (k.pEH ?? k.p) + Number(ds.v);
          }
        });
        break;
      case "klevel":
        konkFor(p).forEach((k, i) => {
          if (i !== ownIdx()) {
            k.L = Math.min(13, k.L + 1);
          }
        });
        break;
      case "kwerb":
        konkFor(p).forEach((k, i) => {
          if (i !== ownIdx())
            k.W += Number(ds.v);
        });
        break;
      case "kreset":
        store.konk[p] = defaultKonk(p);
        break;
      case "mauto": {
        const s = progSet(p);
        s.auto = ds.v === "1";
        if (!s.auto)
          s.coef = { ...modelFor(p).coef };
        calCache.clear();
        break;
      }
      case "optreset":
        delete store.opt[p];
        ui.optResult = null;
        break;
      case "optrun":
        el.disabled = true;
        el.textContent = t("rechnet \u2026");
        await new Promise((r) => setTimeout(r, 30));
        ui.optResult = optimize();
        break;
      case "optapply": {
        const r = ui.optResult;
        if (!r)
          break;
        const src = clone(calcSrc());
        src.decisions = { ...r.best, absatzAutoOnline: true, absatzAutoEH: true };
        const n = { id: uid(), name: `${t("Optimiert")} ${(/* @__PURE__ */ new Date()).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`, team: false, saved: src, draft: clone(src) };
        store.scenarios[p].push(n);
        store.active[p] = n.id;
        ui.optResult = null;
        toast(t("Neues Szenario angelegt"));
        break;
      }
      case "vsreset":
        scen().vorschau = {};
        break;
      case "welcomeoff":
        store.welcome = false;
        break;
      case "spick": {
        const sc = scen();
        spickzettelPdf(spickData(sc), { firma: store.firma, unternehmen: store.unternehmen, period: p, scenario: sc.name, saved: !dirty(sc) });
        return;
      }
      default:
        return;
    }
    persist();
    render();
  }
  document.addEventListener("change", (e) => {
    const el = e.target;
    if (el.dataset?.toolCheck) {
      optSet().cons[el.dataset.toolCheck] = el.checked;
      persist();
    }
  });
  function spickData(sc) {
    const d = sc.saved.decisions, p = planPeriod(), mod = modOf(p), S = store.states[p - 1];
    return Object.entries(MASKS).map(([id, M]) => ({ title: M.title, sections: M.sections.filter((s) => !s.module || mod[s.module].aktiv).map((s) => {
      let rows = [];
      if (s.special === "desinvest")
        rows = S.machines.map((m) => [`Typ ${m.typ} Anlage Nr. ${m.nr}`, (d.desinvest || []).includes(m.nr) ? "JA \u2013 desinvestieren" : "nein"]);
      else
        for (const f of s.fields) {
          if (f.pp || f.p)
            continue;
          if (s.two) {
            rows.push([`${f.l} \u2013 ${s.two[0]}`, nf(d[f.k[0]] || 0, f.d)]);
            if (!(f.k[1] === "kbEH" && !d.ehAktiv))
              rows.push([`${f.l} \u2013 ${s.two[1]}`, nf(d[f.k[1]] || 0, f.d)]);
            continue;
          }
          if (f.eh && !d.ehAktiv)
            continue;
          let v;
          if (f.type === "check")
            v = d[f.k] ? "ja (Haken setzen)" : "nein";
          else if (f.type === "select")
            v = f.opts.find(([x]) => x === Number(d[f.k]))?.[1] ?? "-";
          else if (f.auto)
            v = nf(effDec(d)[f.k] || 0, f.d);
          else
            v = nf(d[f.k] || 0, f.d);
          rows.push([f.l, v]);
        }
      for (const cf of store.customFields.filter((x) => x.cat === s.id))
        rows.push([`${cf.label}${cf.unit ? " (" + cf.unit + ")" : ""}`, nf(sc.saved.custom[cf.id] ?? cf.def ?? 0, cf.dec ?? 2)]);
      return { h: s.h, rows };
    }).filter((s) => s.rows.length) }));
  }
  function scenarioDialog(mode, sc) {
    const dlg = $("#dlg"), p = planPeriod(), list = store.scenarios[p];
    const team = list.find((s) => s.team);
    const bases = [
      ["cur", `${t("Kopie des aktuellen Stands")} (\u201E${scen().name}\u201C)`],
      ...team && team.id !== scen().id ? [["team", `${t("Kopie des \u2605 Team-Vorschlags")} (\u201E${team.name}\u201C)`]] : [],
      ["prev", `${t("Entscheidungen der Vorperiode")} (P${p - 1})`]
    ];
    dlg.innerHTML = `<form method="dialog"><h3 style="margin-top:0">${mode === "new" ? t("Neues Szenario") : t("Szenario umbenennen")}</h3>
    <label>${t("Name")}</label><input class="field" id="scn" value="${esc(mode === "new" ? `${t("Szenario")} ${list.length + 1}` : sc.name)}" required>
    ${mode === "new" ? `<label>${t("Ausgangspunkt")}</label>${bases.map(([k, l], i) => `<label class="radio"><input type="radio" name="scb" value="${k}" ${i === 0 ? "checked" : ""}> ${esc(l)}</label>`).join("")}` : ""}
    <div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn ghost" value="cancel">${t("Abbrechen")}</button><button class="btn save" value="ok">${mode === "new" ? t("Anlegen") : t("Speichern")}</button></div></form>`;
    dlg.showModal();
    setTimeout(() => $("#scn", dlg).select(), 0);
    dlg.onclose = () => {
      if (dlg.returnValue !== "ok")
        return;
      const name = $("#scn", dlg).value.trim() || t("Szenario");
      if (mode === "rename") {
        sc.name = name;
        persist();
        render();
        return;
      }
      const b = $("input[name=scb]:checked", dlg)?.value || "cur";
      let src;
      if (b === "cur")
        src = clone(scen().draft);
      else if (b === "team")
        src = clone(team.saved);
      else
        src = { decisions: { ...emptyDecisions(), ...clone(store.decHist[p - 1] || {}), desinvest: [], levelUp: 0, absatzAutoOnline: true, absatzAutoEH: true }, custom: {} };
      const n = { id: uid(), name, team: false, saved: src, draft: clone(src) };
      list.push(n);
      store.active[p] = n.id;
      ui.delta = null;
      persist();
      render();
      toast(t("Szenario angelegt"));
    };
  }
  function render() {
    document.documentElement.dataset.theme = store.theme;
    document.documentElement.lang = getLang() === "bar" ? "de-BY" : "de";
    $("#brand-name").textContent = store.firma;
    $("#brand-sub").textContent = `${store.unternehmen} \xB7 TOPSIM Management Essentials \xB7 ${t("Planperiode")} ${planPeriod()}`;
    renderSide();
    const R = runPlan();
    renderBar(R);
    const c = $("#content");
    const r = ui.route;
    if (MASKS[r])
      c.innerHTML = renderMask(r);
    else if (r === "parameter")
      c.innerHTML = renderParams();
    else if (r === "kpi")
      c.innerHTML = renderKpi();
    else if (r === "berichte")
      c.innerHTML = renderBerichte();
    else if (r === "szenarien")
      c.innerHTML = renderSzenarien();
    else if (r === "prognose")
      c.innerHTML = renderPrognose();
    else if (r === "optimierer")
      c.innerHTML = renderOptimierer();
    else if (r === "vorschau")
      c.innerHTML = renderVorschau();
    else if (r === "planist")
      c.innerHTML = renderPlanIst();
    else if (r === "daten")
      c.innerHTML = renderDaten();
    else if (r.startsWith("state:"))
      c.innerHTML = renderStateEditor(Number(r.slice(6)));
    else if (r === "einstellungen")
      c.innerHTML = renderSettings();
    else if (r === "hilfe")
      c.innerHTML = renderHilfe();
    $("#side").classList.toggle("open", ui.menu);
  }
  var tmr;
  function live() {
    clearTimeout(tmr);
    tmr = setTimeout(() => {
      persist();
      renderBar(runPlan());
      renderSide();
      refreshHints();
      if (ui.route === "kpi" || ui.route === "szenarien")
        render();
    }, 120);
  }
  function toast(msg) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }
  document.addEventListener("input", (e) => {
    const el = e.target, k = el.dataset.k;
    if (!k)
      return;
    const p = planPeriod();
    const v = el.type === "checkbox" ? el.checked : el.tagName === "SELECT" ? Number(el.value) : parseNum(el.value);
    if (k.startsWith("p:"))
      setPath(store.params[p], k.slice(2), v);
    else if (k.startsWith("pc:"))
      store.paramCustom[p][k.slice(3)] = v;
    else if (k.startsWith("c:"))
      scen().draft.custom[k.slice(2)] = v;
    else if (k.startsWith("st:")) {
      const [, i, j] = k.split(":");
      store.params[p].matStaffel[i][j] = v;
      store.params[p].matStaffel.sort((a, b) => a[0] - b[0]);
    } else if (k.startsWith("et:"))
      store.params[p].einkaufTab[k.slice(3)][1] = v;
    else if (k.startsWith("vt:"))
      store.params[p].verwaltungTab[k.slice(3)][1] = v;
    else if (k.startsWith("an:")) {
      const [, typ, f] = k.split(":");
      store.params[p].anlagen[typ][f] = v;
    } else if (k.startsWith("qk:"))
      store.params[p].qualKosten[k.slice(3)] = v;
    else if (k.startsWith("s:")) {
      const st = store.states[Number(ui.route.slice(6))];
      setPath(st, k.slice(2), v);
      if (k === "s:staff.kbOnline" || k === "s:staff.kbEH")
        st.staff.kb = st.staff.kbOnline + st.staff.kbEH;
    } else if (k.startsWith("m:"))
      setPath(modOf(p), k.slice(2), v);
    else if (k.startsWith("kk:") || k.startsWith("ps:") || k.startsWith("ol:") || k.startsWith("oc:") || k.startsWith("vs:")) {
      toolInput(k, v, el);
      return;
    } else {
      D()[k] = v;
      if (k === "absatzOnline")
        D().absatzAutoOnline = false;
      if (k === "absatzEH")
        D().absatzAutoEH = false;
      if (k === "ehAktiv") {
        persist();
        render();
        return;
      }
    }
    afterInput(el);
  });
  function ampelHtml() {
    const sc = scen(), x = effDec(sc.draft.decisions), a = ampel(simWith({ decisions: sc.draft.decisions, custom: sc.draft.custom }), x);
    return `<div class="ampel ${a.c}"><span class="dot"></span>${esc(t(a.txt))}${dirty(sc) && store.calcMode !== "live" ? ` <span class="muted">(${t("mit den noch nicht gespeicherten Werten")})</span>` : ""}</div>`;
  }
  function refreshHints() {
    const box = document.querySelector(".ampel");
    if (box)
      box.outerHTML = ampelHtml();
    const d = D(), fc = prognose(planPeriod(), d, store.states[planPeriod() - 1]);
    for (const [k, auto, v] of [["absatzOnline", "absatzAutoOnline", fc.online], ["absatzEH", "absatzAutoEH", fc.eh]]) {
      const inp = document.querySelector(`[data-k="${k}"]`);
      if (!inp || document.activeElement === inp)
        continue;
      if (d[auto])
        inp.value = nf(v, 0);
      else {
        const b = inp.parentElement?.querySelector("[data-autoon]");
        if (b)
          b.textContent = `\u21BA ${t("Prognose")} ${nf(v, 0)}`;
      }
    }
  }
  function afterInput(el) {
    el?.closest?.(".frow, tr")?.classList.add("changed");
    el?.classList?.remove("isauto");
    el?.parentElement?.querySelector?.(".autotag")?.remove();
    if (store.calcMode === "live") {
      live();
      return;
    }
    persist();
    renderSide();
    renderBar(runPlan());
    refreshHints();
  }
  document.addEventListener("change", (e) => {
    const el = e.target;
    if (el.dataset.des) {
      const d = D();
      const n = Number(el.dataset.des);
      d.desinvest = el.checked ? [.../* @__PURE__ */ new Set([...d.desinvest || [], n])] : (d.desinvest || []).filter((x) => x !== n);
      afterInput(el);
    }
    if (el.dataset.lock !== void 0) {
      optSet().levers[el.dataset.lock].lock = !el.checked;
      persist();
      render();
    }
    if (el.dataset.konkakt !== void 0) {
      konkFor()[el.dataset.konkakt][el.dataset.f] = el.checked;
      persist();
      render();
    }
    if (el.dataset.calcmode) {
      store.calcMode = el.value;
      persist();
      render();
    }
    if (el.dataset.k && el.type === "text")
      el.value = nf(parseNum(el.value), Number(el.dataset.d));
    if (el.dataset.k && TOOL_KEY.test(el.dataset.k) && !/^(ol|oc):/.test(el.dataset.k)) {
      const y = window.scrollY;
      render();
      window.scrollTo(0, y);
    }
    if (el.id === "firma") {
      store.firma = el.value || "TONWERK";
      persist();
      render();
    }
    if (el.id === "untern") {
      store.unternehmen = el.value;
      persist();
      render();
    }
    if (el.id === "files")
      readFiles(el.files);
    if (el.id === "imp")
      importBackup(el.files[0]);
  });
  document.addEventListener("focusin", (e) => {
    if (e.target.dataset?.k && e.target.type === "text")
      setTimeout(() => e.target.select(), 0);
  });
  document.addEventListener("click", async (e) => {
    if (ui.scOpen && !e.target.closest(".scdd")) {
      ui.scOpen = false;
      renderSide();
    }
    const el = e.target.closest("button, a, [data-route]");
    if (!el)
      return;
    const ds = el.dataset, p = planPeriod();
    if (ds.scpick) {
      store.active[p] = ds.scpick;
      ui.scOpen = false;
      ui.delta = null;
      persist();
      render();
      return;
    }
    if (ds.scteam) {
      store.scenarios[p].forEach((s) => s.team = s.id === ds.scteam);
      persist();
      render();
      return;
    }
    if (ds.scren) {
      scenarioDialog("rename", store.scenarios[p].find((s) => s.id === ds.scren));
      return;
    }
    if (ds.scdel) {
      const sc = store.scenarios[p].find((s) => s.id === ds.scdel);
      if (store.scenarios[p].length > 1 && confirm(`${t("Szenario l\xF6schen?")}
\u201E${sc.name}\u201C`)) {
        store.scenarios[p] = store.scenarios[p].filter((s) => s.id !== sc.id);
        if (!store.scenarios[p].some((s) => s.team))
          store.scenarios[p][0].team = true;
        if (store.active[p] === sc.id)
          store.active[p] = store.scenarios[p][0].id;
        persist();
        render();
      }
      return;
    }
    if (ds.autoon) {
      D()[ds.autoon] = true;
      afterInput();
      render();
      return;
    }
    if (ds.modon) {
      modOf(p)[ds.modon].aktiv = true;
      persist();
      render();
      return;
    }
    if (ds.modoff) {
      modOf(p)[ds.modoff].aktiv = false;
      persist();
      render();
      return;
    }
    if (ds.tool) {
      await toolClick(ds, el);
      return;
    }
    if (ds.route) {
      ui.route = ds.route;
      ui.menu = false;
      if (ds.route === "berichte")
        ui.repPeriod ?? (ui.repPeriod = p);
      render();
      window.scrollTo(0, 0);
      return;
    }
    if (ds.per !== void 0) {
      const n = Number(ds.per);
      if (ui.route === "berichte")
        ui.repPeriod = n;
      else if (n !== p) {
        ui.route = "berichte";
        ui.repPeriod = n;
      }
      render();
      return;
    }
    if (ds.rep) {
      ui.repId = ds.rep;
      render();
      return;
    }
    if (ds.theme) {
      store.theme = ds.theme;
      persist();
      render();
      return;
    }
    if (ds.lang) {
      setLang(ds.lang);
      store.lang = ds.lang;
      persist();
      render();
      return;
    }
    if (ds.addfield) {
      fieldDialog(ds.addfield);
      return;
    }
    if (ds.editfield) {
      fieldDialog(null, store.customFields.find((f) => f.id === ds.editfield));
      return;
    }
    if (ds.delfield) {
      if (confirm(t("Dieses Feld l\xF6schen?"))) {
        store.customFields = store.customFields.filter((f) => f.id !== ds.delfield);
        persist();
        render();
      }
      return;
    }
    if (ds.addstaffel !== void 0) {
      const st = store.params[p].matStaffel;
      st.push([(st[st.length - 1]?.[0] || 0) + 1e4, st[st.length - 1]?.[1] || 0]);
      persist();
      render();
      return;
    }
    if (ds.delstaffel) {
      const st = store.params[p].matStaffel;
      if (st.length > 1)
        st.splice(Number(ds.delstaffel), 1);
      persist();
      render();
      return;
    }
    if (ds.editstate) {
      ui.route = "state:" + ds.editstate;
      render();
      return;
    }
    if (ds.delmach) {
      const st = store.states[Number(ui.route.slice(6))];
      st.machines.splice(Number(ds.delmach), 1);
      persist();
      render();
      return;
    }
    if (ds.addmach) {
      const st = store.states[Number(ui.route.slice(6))];
      const a = store.params[p].anlagen[ds.addmach];
      st.machines.push({ nr: Math.max(0, ...st.machines.map((m) => m.nr)) + 1, typ: ds.addmach, beschPeriode: st.period, wert: a.preis, afaRate: a.preis / a.dauer, rbw: a.preis - a.preis / a.dauer, rlz: a.dauer - 1, fix: a.fix, cap: a.cap, rest: a.rest });
      persist();
      render();
      return;
    }
    if (ds.tip !== void 0)
      return;
    switch (el.id) {
      case "save2":
      case "save": {
        const sc = scen();
        const before = kpiSnap(simWith(sc.saved));
        sc.saved = clone(sc.draft);
        const after = kpiSnap(simWith(sc.saved));
        ui.delta = Object.fromEntries(Object.keys(after).map((k) => [k, after[k] - before[k]]));
        persist();
        render();
        toast(t("Gespeichert und neu gerechnet"));
        break;
      }
      case "scopen":
        ui.scOpen = !ui.scOpen;
        renderSide();
        break;
      case "scnew2":
        ui.scOpen = false;
        scenarioDialog("new");
        break;
      case "reset": {
        const sc = scen();
        if (dirty() && !confirm(t("Ungespeicherte \xC4nderungen verwerfen?")))
          break;
        sc.draft = clone(sc.saved);
        ui.delta = null;
        persist();
        render();
        break;
      }
      case "menu":
        ui.menu = !ui.menu;
        render();
        break;
      case "theme": {
        const order = ["light", "dark", "midnight"];
        store.theme = order[(order.indexOf(store.theme) + 1) % 3];
        persist();
        render();
        break;
      }
      case "dlzip":
      case "dlone": {
        const per = ui.repPeriod ?? p;
        const res = reportsFor(per);
        const meta = { firma: store.firma, unternehmen: store.unternehmen, period: per, plan: !!res.plan, scenario: res.plan ? scen().name : "" };
        if (el.id === "dlzip") {
          el.disabled = true;
          el.textContent = "\u2026";
          await downloadZip(res.reports, meta);
          el.disabled = false;
          el.textContent = "ZIP (PDF)";
        } else
          downloadSingle(res.reports.find((r) => r.id === ui.repId), meta);
        break;
      }
      case "print":
        window.print();
        break;
      case "scnew":
        scenarioDialog("new");
        break;
      case "scdup": {
        const cur = scen();
        const sc = { id: uid(), name: cur.name + " (Kopie)", team: false, saved: clone(cur.draft), draft: clone(cur.draft) };
        store.scenarios[p].push(sc);
        store.active[p] = sc.id;
        persist();
        render();
        break;
      }
      case "screname":
        scenarioDialog("rename", scen());
        break;
      case "scteam":
        store.scenarios[p].forEach((s) => s.team = s.id === scen().id);
        persist();
        render();
        break;
      case "scdel":
        if (store.scenarios[p].length > 1 && confirm(t("Szenario l\xF6schen?"))) {
          store.scenarios[p] = store.scenarios[p].filter((s) => s.id !== scen().id);
          store.active[p] = store.scenarios[p][0].id;
          persist();
          render();
        }
        break;
      case "parse": {
        const txt = $("#paste").value;
        if (looksLikeBackup(txt))
          importBackupText(txt, t("eingef\xFCgter Text"));
        else if (txt.trim()) {
          pending = analyse(txt);
          render();
        }
        break;
      }
      case "apply":
        if (pending) {
          applyImport(pending);
          const per = pending.period;
          pending = null;
          toast(`${t("Periode")} ${per} ${t("\xFCbernommen")}`);
          ui.route = "berichte";
          ui.repPeriod = per;
          render();
        }
        break;
      case "discard":
        pending = null;
        render();
        break;
      case "exp":
        save(new Blob([JSON.stringify(store, null, 1)], { type: "application/json" }), `TONWERK_Planrechner_Sicherung_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`);
        break;
      case "wipe":
        if (confirm(t("Wirklich alle Eingaben, Szenarien und importierten Daten l\xF6schen?"))) {
          store = initialStore();
          persist();
          render();
        }
        break;
      case "install":
        if (installEvt) {
          installEvt.prompt();
          installEvt = null;
        }
        break;
      case "upd":
        location.reload();
        break;
      default:
        break;
    }
  });
  function analyse(text) {
    const x = parseReports(text);
    if (x.period !== null)
      x.state = stateFromImport(x, store.states[x.period - 1]);
    return x;
  }
  async function readFiles(files) {
    let txt = "";
    for (const f of files)
      txt += "\n" + (f.type === "application/pdf" || /\.pdf$/i.test(f.name) ? await pdfToText(f) : await f.text());
    pending = analyse(txt);
    render();
  }
  var CODE_PREFIX = "TONWERK-SICHERUNG:";
  function looksLikeBackup(txt) {
    const x = txt.replace(/^\uFEFF/, "").trim();
    return x.startsWith(CODE_PREFIX) || x.startsWith("{") && /"states"\s*:/.test(x) && /"params"\s*:/.test(x);
  }
  async function gz(bytes, mode) {
    const st = new Blob([bytes]).stream().pipeThrough(mode === "c" ? new CompressionStream("gzip") : new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(st).arrayBuffer());
  }
  async function importBackup(file) {
    if (!file)
      return;
    let txt = "";
    try {
      txt = await file.text();
    } catch (e) {
      alert(t("Die Datei konnte nicht gelesen werden.") + `

${file.name} \xB7 ${file.size} Bytes
${e?.message || e}`);
      return;
    }
    if (!txt.trim()) {
      alert(t("Android hat der App die Datei leer \xFCbergeben (0 Bytes), obwohl sie auf dem Ger\xE4t vollst\xE4ndig ist. Das passiert bei Dateien, die eine andere App heruntergeladen hat. Abhilfe: In der Dateiauswahl \xFCber das Men\xFC \u2630 den Ger\xE4tespeicher \u203A Download \xF6ffnen statt \u201EDownloads\u201C, oder die Datei in der Dateien-App einmal kopieren (z. B. nach \u201EDokumente\u201C) und die Kopie w\xE4hlen.") + `

${file.name}`);
      return;
    }
    importBackupText(txt, `${file.name} \xB7 ${file.size} Bytes \xB7 ${file.type || "?"}`);
  }
  async function importBackupText(txt, label) {
    let raw = txt.replace(/^\uFEFF/, "").trim(), s;
    try {
      if (raw.startsWith(CODE_PREFIX)) {
        const bin = atob(raw.slice(CODE_PREFIX.length).replace(/\s+/g, ""));
        raw = new TextDecoder().decode(await gz(Uint8Array.from(bin, (c) => c.charCodeAt(0)), "d"));
      } else {
        const a = raw.indexOf("{"), b = raw.lastIndexOf("}");
        if (a > 0 || b >= 0 && b < raw.length - 1)
          raw = raw.slice(a, b + 1);
      }
      s = JSON.parse(raw);
    } catch (e) {
      alert(t("Die Datei ist keine g\xFCltige Sicherung.") + `

${label}
${t("Anfang")}: ${txt.slice(0, 60).replace(/\s+/g, " ")}
${e?.message || e}`);
      return;
    }
    if (!s || typeof s !== "object" || !s.states || !s.params) {
      alert(t("Die Datei ist keine g\xFCltige Sicherung.") + `

${label}: ${t("Perioden oder Rahmendaten fehlen.")}`);
      return;
    }
    const old = store;
    try {
      store = migrate(s);
      setLang(store.lang || "de");
      pending = null;
      render();
      persist();
      toast(t("Sicherung importiert"));
    } catch (e) {
      store = old;
      try {
        render();
      } catch {
      }
      alert(t("Die Sicherung konnte nicht geladen werden.") + `

${e?.message || e}`);
    }
  }
  document.addEventListener("dragover", (e) => {
    const d = e.target.closest?.("#drop");
    if (d) {
      e.preventDefault();
      d.classList.add("over");
    }
  });
  document.addEventListener("dragleave", (e) => {
    e.target.closest?.("#drop")?.classList.remove("over");
  });
  document.addEventListener("drop", (e) => {
    const d = e.target.closest?.("#drop");
    if (d) {
      e.preventDefault();
      readFiles(e.dataTransfer.files);
    }
  });
  var tipEl;
  function showTip(el) {
    hideTip();
    tipEl = document.createElement("div");
    tipEl.className = "tip";
    tipEl.textContent = el.dataset.tip;
    document.body.appendChild(tipEl);
    const r = el.getBoundingClientRect();
    const w = tipEl.offsetWidth;
    tipEl.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left - w + 20)) + "px";
    tipEl.style.top = r.bottom + 6 + "px";
  }
  function hideTip() {
    tipEl?.remove();
    tipEl = null;
  }
  document.addEventListener("mouseover", (e) => {
    const el = e.target.closest?.("[data-tip]");
    if (el)
      showTip(el);
  });
  document.addEventListener("mouseout", (e) => {
    if (e.target.closest?.("[data-tip]"))
      hideTip();
  });
  document.addEventListener("focusin", (e) => {
    const el = e.target.closest?.("[data-tip]");
    if (el)
      showTip(el);
  });
  document.addEventListener("focusout", hideTip);
  document.addEventListener("touchstart", (e) => {
    const el = e.target.closest?.("[data-tip]");
    if (el)
      showTip(el);
    else
      hideTip();
  }, { passive: true });
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    const banner = () => {
      if ($("#upd"))
        return;
      const b = document.createElement("div");
      b.className = "update";
      b.innerHTML = `${t("Neue Version verf\xFCgbar.")} <button class="btn small" id="upd">${t("Neu laden")}</button>`;
      document.body.prepend(b);
    };
    const hadCtrl = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (hadCtrl)
        banner();
    });
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((reg) => {
      if (reg.waiting)
        reg.waiting.postMessage("skip");
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible")
          reg.update().catch(() => {
          });
      });
      setInterval(() => reg.update().catch(() => {
      }), 30 * 60 * 1e3);
    }).catch(() => {
    });
  }
  setLang(store.lang || "de");
  ensurePeriod(planPeriod());
  render();
  window.__planrechner = { store: () => store, runPlan };
})();

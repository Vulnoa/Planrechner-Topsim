// Liest TOPSIM-Berichte (Sammelbericht oder Einzelberichte) als PDF oder eingefügten Text
// und macht daraus: Kennzahlen-Historie, Endstand, Entscheidungen, Parameter, Markt- und Branchendaten.

const NUM = /-?\d{1,3}(?:\.\d{3})*(?:,\d+)?|-?\d+(?:,\d+)?/g;
export const toNum = (s) => Number(String(s).replace(/\./g, '').replace(',', '.'));

// PDF → Textzeilen (Text-Elemente nach y gruppiert, nach x sortiert, Lücken als Mehrfach-Leerzeichen)
export async function pdfToText(file) {
  const pdfjs = window.pdfjsLib;
  pdfjs.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const out = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const lines = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const y = it.transform[5], x = it.transform[4];
      let ln = lines.find((l) => Math.abs(l.y - y) < 2.5);
      if (!ln) { ln = { y, items: [] }; lines.push(ln); }
      ln.items.push({ x, w: it.width, s: it.str });
    }
    lines.sort((a, b) => b.y - a.y);
    for (const l of lines) {
      l.items.sort((a, b) => a.x - b.x);
      let s = '', end = null;
      for (const it of l.items) {
        if (end !== null) s += (it.x - end > 4) ? '    ' : (it.x - end > 0.8 ? ' ' : '');
        s += it.s; end = it.x + it.w;
      }
      out.push(s);
    }
  }
  return out.join('\n');
}

function blocks(text) {
  const res = {};
  const parts = text.split(/(?=TNB\d{2}\s*:)/);
  for (const part of parts) {
    const m = part.match(/^TNB(\d{2})/);
    if (!m) continue;
    res[m[1]] = (res[m[1]] || '') + '\n' + part;
  }
  return res;
}

const lines = (t) => (t || '').split(/\r?\n/).map((l) => l.replace(/\t/g, '    ').replace(/ /g, ' '));
const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();

// Zahlen hinter der Bezeichnung (erste passende Zeile, die mit der Bezeichnung beginnt)
function nums(t, label, { contains = false, nth = 0 } = {}) {
  const L = lines(t), want = norm(label);
  let hit = 0;
  for (const raw of L) {
    const l = norm(raw);
    const pos = contains ? l.indexOf(want) : (l.startsWith(want) ? 0 : -1);
    if (pos < 0) continue;
    const found = (l.slice(pos + want.length).match(NUM) || []).map(toNum);
    if (!found.length) continue;
    if (hit++ < nth) continue;
    return found;
  }
  return null;
}
const last = (a) => (a && a.length ? a[a.length - 1] : undefined);

export function parseReports(text) {
  const B = blocks(text);
  const out = { found: Object.keys(B).sort(), warnings: [] };
  const per = text.match(/Periode:\s*(\d+)/);
  out.period = per ? Number(per[1]) : null;
  const unt = text.match(/Unternehmen\s+(\d)/);
  out.unternehmen = unt ? Number(unt[1]) : null;

  // ---------- Executive Summary → Historie aller Perioden ----------
  if (B['01']) {
    const t = B['01'];
    const hp = (t.match(/Periode \d+/g) || []).map((s) => Number(s.split(' ')[1]));
    const ps = [...new Set(hp)].filter((p) => p !== out.period || true).sort((a, b) => a - b);
    const H = {};
    const take = (key, label, opt) => {
      let v = null; for (const lb of [].concat(label)) { v = nums(t, lb, opt); if (v) break; }
      if (!v) return; const vv = v.slice(-ps.length); vv.forEach((x, i) => { (H[ps[ps.length - vv.length + i]] ||= {})[key] = x; });
    };
    take('erfolgswert', 'Erfolgswert'); take('umsatz', 'Umsatz Gesamt'); take('ju', 'Periodenüberschuss/-');
    take('absatz', 'Absatz Gesamt'); take('absatzPlan', 'Geplanter Absatz'); take('marktanteil', 'Marktanteil');
    take('fertPlan', 'Geplante Fertigungsmenge'); take('fertIst', ['Tatsächliche Fertigungsmenge', 'Tatsächliche Stück']); take('lager', 'Lagerendbestand');
    take('auslMA', 'Auslastung Mitarbeiter'); take('auslAnlagen', 'Auslastung Anlagen'); take('hkStk', 'Herstellkosten');
    take('skStk', 'Selbstkosten'); take('db5Stk', 'Deckungsbeitrag V'); take('be', 'Betriebsergebnis'); take('ek', 'Eigenkapital ');
    take('ekRendite', 'Eigenkapitalrendite'); take('umsatzRendite', 'Umsatzrendite'); take('kasse', 'Kassenendbestand');
    take('dispo', 'Überziehungskredit'); take('finErg', 'Finanzergebnis'); take('fkQuote', 'Fremdkapitalquote');
    out.history = H;
  }

  // ---------- Marktforschung ----------
  if (B['02']) {
    const t = B['02'];
    const cols = ['U1', 'U2', 'U3', 'U4', 'U5', 'U6'];
    const defs = [['Preis', 'EUR', 'Preis ', 0], ['Produktqualität', 'Level', 'Produktqualität', 0], ['Werbung', 'TEUR', 'Werbung', 0],
      ['Mitarbeiter Kundenbetreuung', 'Anzahl', 'Mitarbeiter', 1], ['Preisänderung', '%', 'Preisänderung', 2], ['Bekanntheit', 'Index', 'Bekanntheit', 2],
      ['Potentieller Absatz', 'Stück', 'Potentieller', 0], ['Tatsächlicher Absatz', 'Stück', 'Tatsächlicher', 0], ['Umsatz Markt', 'TEUR', 'Umsatz', 2],
      ['Marktanteil', '%', 'Marktanteil', 2]];
    const rows = [];
    for (const [l, u, lab, f] of defs) {
      const v = nums(t, lab);
      if (v && v.length >= 6) rows.push({ l, u, v: v.slice(0, 6), f });
    }
    if (rows.length) out.markt = { cols, rows };
  }

  // ---------- Fertigung: Anlagen ----------
  if (B['03']) {
    const t = B['03'];
    const ms = [];
    let nr = 0;
    for (const raw of lines(t)) {
      const m = raw.match(/Typ\s+([A-Z])\s+Anlage(?:\s+Nr\.\s*(\d+))?\s+(-?\d+)\s+([\d.,]+)\s+(\d+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/);
      if (!m) continue;
      nr = m[2] ? Number(m[2]) : nr + 1;
      ms.push({ nr, typ: m[1], beschPeriode: Number(m[3]), wert: toNum(m[4]), rlz: Number(m[5]), afaRate: toNum(m[6]) || toNum(m[4]) / 10,
        rbw: toNum(m[7]), fix: toNum(m[8]), rest: toNum(m[9]), cap: m[1] === 'B' ? 6000 : 12000 });
    }
    // Kapazitäten
    for (const raw of lines(t)) {
      const m = raw.match(/Typ\s+([A-Z])\s+Anlage\s+Nr\.\s*(\d+)\s+([\d.]+)\s+[\d,]+\s+[\d,]+\s*$/);
      if (m) { const x = ms.find((q) => q.nr === Number(m[2])); if (x) x.cap = toNum(m[3]); }
    }
    if (ms.length) out.machines = ms;
    const fp = nums(t, 'Einsetzbares Personal (ohne');
    if (fp) out.fertMA = last(fp);
  }

  // ---------- F&E ----------
  if (B['04']) {
    const v = nums(B['04'], 'Produktqualität');
    if (v && v.length >= 2) { out.levelPrev = v[0]; out.level = v[1]; out.qualKostenStk = v[3]; out.fueFix = v[2]; }
  }

  // ---------- Lager ----------
  if (B['05']) {
    const t = B['05'];
    const m0 = nums(t, '= Lagerendbestand', { nth: 0 }), f0 = nums(t, '= Lagerendbestand', { nth: 1 });
    const zug = nums(t, '+ Zugang von Lieferant'), jit = nums(t, '+ Nachlieferung');
    if (m0) out.mat = { qty: m0[0], preis: m0[1], value: m0[2] };
    if (f0) out.fe = { qty: f0[0], preis: f0[1], value: f0[2] };
    if (zug) out.matKauf = { qty: zug[0], preis: zug[1] };
    if (jit) out.jit = { qty: jit[0], preis: jit[1] };
  }

  // ---------- Personal ----------
  if (B['06']) {
    const t = B['06'];
    let end = null;
    for (const raw of lines(t)) { const m = norm(raw).match(/^=\s*(personalendbestand)?\s*anzahl\s+(.*)$/); if (m) { end = (m[2].match(NUM) || []).map(toNum); break; } }
    if (!end) { const L = lines(t); const i = L.findIndex((l) => /^\s*=\s+Anzahl/.test(l)); if (i >= 0) end = (L[i].match(NUM) || []).map(toNum); }
    if (end && end.length >= 4) out.staff = { einkauf: end[0], verwaltung: end[1], fertigung: end[2], kb: end[3] };
    const lohn = nums(t, 'Löhne/Gehälter');
    if (lohn && end) out.gehalt = { einkauf: lohn[0] / end[0], verwaltung: lohn[1] / end[1], fertigung: lohn[2] / end[2], kb: lohn[3] / end[3] };
  }

  // ---------- Kostenstellen: sonstige fixe Kosten ----------
  if (B['08']) {
    const v = nums(B['08'], 'Sonstige fixe');
    if (v && v.length >= 6) out.sfixKst = { einkauf: v[1], fertigung: v[2], vertrieb: v[4], verwaltung: v[5] };
  }

  // ---------- Kostenträger: Kostenkomponenten der Produktion ----------
  if (B['09']) {
    const t = B['09'];
    const ek = nums(t, '+ Einkauf', { nth: 0 }), eg = nums(t, '+ Einkauf', { nth: 1 }), fk = nums(t, '+ Fertigung', { nth: 0 }), fg = nums(t, '+ Fertigung', { nth: 1 });
    if (ek && eg && fk && fg) out.hkComp = { varMat: ek[0], fixMat: eg[0], varFert: fk[0], fixFert: fg[0] };
  }

  // ---------- Deckungsbeitrag: Transportkosten je Stück ----------
  if (B['10']) {
    const t = B['10'];
    const tr = nums(t, '- Transportkosten', { nth: 1 });
    if (tr && tr.length >= 4) { out.transOnline = tr[0]; out.transEH = tr[3]; }
    const pr = nums(t, 'Preis');
    if (pr && pr.length >= 4) { out.preisOnline = pr[0]; out.preisEH = pr[3]; }
    const ums = nums(t, 'Umsatzerlöse');
    if (ums && ums.length >= 4) out.umsatzKanal = { online: ums[0], ga: ums[1], eh: ums[3] };
  }

  // ---------- GuV ----------
  if (B['11']) {
    const t = B['11'];
    const se = nums(t, '+ Sonstige Erträge'); if (se) out.sonstErtrag = se[0];
    const gv = nums(t, '= Gewinn-/Verlustvortrag'); if (gv) out.gvVortrag = gv[0];
    const ju = nums(t, '= Periodenüberschuss'); if (ju) out.ju = ju[0];
  }

  // ---------- Bilanz ----------
  if (B['15']) {
    const t = B['15'];
    const a = (label, opt) => { const v = nums(t, label, { contains: true, ...opt }); return v ? v[0] : undefined; };
    out.bilanz = { grund: a('Grundstücke und'), ford: a('Forderungen aus'), kasse: a('Kassenbestand'), gez: a('Gezeichnetes Kapital'),
      krl: a('Kapitalrücklage'), grl: a('Gewinnrücklage'), lang: a('Restlaufzeit über 10'), kurz: a('Restlaufzeit unter 1'),
      dispo: a('Überziehungskredit'), mat: a('Materialien'), fe: a('Fertige Erzeugnisse') };
  }

  // ---------- Geschäftsbericht der Branche ----------
  if (B['16']) {
    const t = B['16'];
    const defs = ['Umsatzerlöse', '+ Sonstige', '- Herstellkosten', '- F&E', '- Vertrieb', '- Verwaltung', 'Betriebsergebnis', '+ Finanzergebnis',
      'Gewinn vor', '- Steuern', 'Periodenüberschuss/-', 'Anlagevermögen', 'Umlaufvermögen', 'Bilanzsumme', 'Eigenkapital', 'Verbindlichkeiten', 'Überziehungskredit'];
    const rows = [];
    for (const d of defs) { const v = nums(t, d, { contains: true }); if (v && v.length >= 6) rows.push({ l: d.replace(/^[-+=]\s*/, ''), v: v.slice(-6), b: /ergebnis|überschuss|summe/i.test(d) }); }
    if (rows.length) out.branche = { cols: ['U1', 'U2', 'U3', 'U4', 'U5', 'U6'], rows };
  }

  // ---------- Entscheidungsprotokoll → Entscheidungen je Periode ----------
  if (B['19']) {
    const t = B['19'];
    const hp = [...new Set((t.match(/\bP(\d+)\b/g) || []).map((s) => Number(s.slice(1))))].sort((a, b) => a - b);
    const dec = {};
    const take = (key, label, opt) => { const v = nums(t, label, opt); if (!v) return; const vv = v.slice(-hp.length); vv.forEach((x, i) => { (dec[hp[hp.length - vv.length + i]] ||= {})[key] = x; }); };
    take('preisOnline', 'Preis Online-Markt'); take('werbungOnline', 'Werbung Online-'); take('kbOnline', 'Kundenbetreuer', {});
    take('ci', 'Corporate Identity'); take('levelUp', 'Produktqualität Level'); take('gaMenge', 'Großabnehmer ');
    take('einkauf', 'Einsatzstoffe/Teile'); take('fertigung', 'Fertigungsmenge'); take('investA', 'Investition (Anz. neue', { nth: 0 });
    take('investB', 'Investition (Anz. neue', { nth: 1 }); take('fertigungMA', 'Fertigungspersonal');
    take('preisEH', 'Preis Einzelhandel'); take('werbungEH', 'Werbung Einzelhandel');
    out.decisions = dec;
  }
  if (!out.found.length) out.warnings.push('Keine TOPSIM-Berichte erkannt. Bitte den Sammelbericht als PDF hochladen oder den Text vollständig einfügen.');
  return out;
}

// Endstand für die Planung der Folgeperiode aus den gelesenen Daten
export function stateFromImport(x, prev) {
  if (!x.bilanz || !x.fe || !x.staff || !x.machines) return null;
  const comp = x.hkComp; const tot = comp ? comp.varMat + comp.fixMat + comp.varFert + comp.fixFert : 0;
  const share = (k) => tot ? x.fe.value * comp[k] / tot : (k === 'varMat' ? x.fe.value : 0);
  const kbEH = prev?.staff?.kbEH ?? 0;
  return {
    period: x.period, level: x.level ?? prev?.level ?? 1, preisOnline: x.preisOnline ?? prev?.preisOnline ?? 0, preisEH: x.preisEH ?? 0,
    fe: { qty: x.fe.qty, varMat: share('varMat'), fixMat: share('fixMat'), varFert: share('varFert'), fixFert: share('fixFert') },
    mat: { qty: x.mat?.qty ?? 0, value: x.mat?.value ?? 0, preis: x.mat?.preis ?? 0 },
    machines: x.machines.map((m) => ({ ...m })),
    staff: { ...x.staff, kbOnline: x.staff.kb - kbEH, kbEH },
    bilanz: { grund: x.bilanz.grund, ford: x.bilanz.ford, kasse: x.bilanz.kasse, gez: x.bilanz.gez, krl: x.bilanz.krl, grl: x.bilanz.grl,
      gvVortrag: x.gvVortrag ?? 0, lang: x.bilanz.lang, kurz: x.bilanz.kurz || 0, dispo: x.bilanz.dispo || 0 },
    verlustvortrag: Math.max(0, -(x.gvVortrag ?? 0)),
  };
}

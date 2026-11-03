// Absatzprognose: Attraktionsmodell (Marktanteil je Firma) für den Online-Markt, kalibriert an den
// Marktforschungsberichten aller sechs Unternehmen. Einzelhandel: gleiches Modell mit eigener Marktgröße.
//
//   Attraktivität A_i = (Preis_i − q·(Level_i − 1))^ep · Werbung_i^ew · KB_i^ek · Bekanntheit_i^eb
//   Nachfrage_i       = Marktvolumen · A_i / Σ A
//
// Startwerte (Prior) aus dem Teilnehmerhandbuch: Preis-Absatz-Tabelle (150 € → 40.000, 160 € → 28.500,
// 140 € → 53.000), Werbung 300 → 330 TEUR ≈ +1.200 Stück, ein Kundenbetreuer mehr ≈ +4,5 %,
// Qualitätskosten (+2 €/Level) lassen sich ohne Absatzverlust weitergeben.

export const PRIOR = { ep: -6.3, q: 2.0, ew: 0.37, ek: 0.45, eb: 1.0 };
const KEYS = ['ep', 'q', 'ew', 'ek', 'eb'];
const SD = { ep: 2, q: 2, ew: 0.2, ek: 0.2, eb: 1 };

export function defaultProgSettings() {
  return { auto: true, coef: { ...PRIOR }, lambda: 0.3, wachstum: 0, ehAnteil: 25, ciKoef: 5.6, marktManuell: 0 };
}

// Marktforschungsbericht (Tabelle aus dem Import) → Firmenwerte
const LAB = { p: 'Preis', L: 'Produktqualität', W: 'Werbung', K: 'Mitarbeiter Kundenbetreuung', B: 'Bekanntheit', D: 'Potentieller Absatz', A: 'Tatsächlicher Absatz' };
export function firmsFromMarkt(m) {
  if (!m?.rows) return null;
  const get = (l) => m.rows.find((r) => r.l === l)?.v;
  const cols = {};
  for (const [k, l] of Object.entries(LAB)) cols[k] = get(l);
  if (!cols.p || !cols.D) return null;
  return cols.p.map((_, i) => ({ name: m.cols?.[i] || `U${i + 1}`, p: +cols.p[i], L: +(cols.L?.[i] ?? 1), W: +(cols.W?.[i] ?? 0), K: +(cols.K?.[i] ?? 1),
    B: +(cols.B?.[i] ?? 50), D: +cols.D[i], A: +(cols.A?.[i] ?? cols.D[i]) }));
}

function attr(c, f) {
  const pe = Math.max(1, f.p - c.q * (f.L - 1));
  return Math.exp(c.ep * Math.log(pe) + c.ew * Math.log(Math.max(1, f.W)) + c.ek * Math.log(Math.max(0.25, f.K)) + c.eb * Math.log(Math.max(1, f.B)));
}
export function shares(c, firms) {
  const a = firms.map((f) => (f.aktiv === false ? 0 : attr(c, f)));
  const s = a.reduce((x, y) => x + y, 0) || 1;
  return a.map((x) => x / s);
}

// Kalibrierung: gedämpfte Gauss-Newton-Iteration (Levenberg-Marquardt) auf log-Fehler, gezogen zum Prior
export function calibrate(obs, lambda = 0.3, prior = PRIOR) {
  const pts = obs.filter((o) => o.firms?.length);
  if (!pts.length) return { coef: { ...prior }, n: 0, mape: null, fit: [] };
  const vec = (c) => KEYS.map((k) => c[k]);
  const obj = (x) => Object.fromEntries(KEYS.map((k, i) => [k, x[i]]));
  const resid = (x) => {
    const c = obj(x), r = [];
    for (const o of pts) {
      const M = o.firms.reduce((s, f) => s + f.D, 0), sh = shares(c, o.firms);
      o.firms.forEach((f, i) => r.push(Math.log(Math.max(1, M * sh[i])) - Math.log(Math.max(1, f.D))));
    }
    KEYS.forEach((k, i) => r.push(lambda * (x[i] - prior[k]) / SD[k]));
    return r;
  };
  let x = vec(prior), r = resid(x), cost = r.reduce((s, v) => s + v * v, 0), mu = 1e-2;
  for (let it = 0; it < 80; it++) {
    const J = KEYS.map((_, j) => { const h = 1e-5 * Math.max(1, Math.abs(x[j])); const x2 = [...x]; x2[j] += h; return resid(x2).map((v, i) => (v - r[i]) / h); });
    const n = KEYS.length, A = Array.from({ length: n }, () => Array(n).fill(0)), g = Array(n).fill(0);
    for (let a = 0; a < n; a++) { for (let b = 0; b < n; b++) for (let i = 0; i < r.length; i++) A[a][b] += J[a][i] * J[b][i]; for (let i = 0; i < r.length; i++) g[a] += J[a][i] * r[i]; }
    let improved = false;
    for (let tries = 0; tries < 10; tries++) {
      const M = A.map((row, a) => row.map((v, b) => v + (a === b ? mu * (A[a][a] || 1) : 0)));
      const step = solve(M, g.map((v) => -v));
      if (!step) { mu *= 10; continue; }
      const x2 = x.map((v, i) => v + step[i]);
      if (x2[1] < 0) x2[1] = 0;
      const r2 = resid(x2), c2 = r2.reduce((s, v) => s + v * v, 0);
      if (c2 < cost) { x = x2; r = r2; improved = cost - c2 > 1e-10; cost = c2; mu = Math.max(1e-6, mu / 3); break; }
      mu *= 10;
    }
    if (!improved) break;
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
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}

// Leave-one-out je Periode: wie gut hätte das Modell die Periode ohne ihre eigenen Daten getroffen?
export function looCheck(obs, lambda) {
  const pts = obs.filter((o) => o.firms?.length);
  return pts.map((o) => {
    const rest = pts.filter((x) => x !== o);
    const { coef } = calibrate(rest, lambda);
    const M = o.firms.reduce((s, f) => s + f.D, 0), sh = shares(coef, o.firms);
    return { period: o.period, rows: o.firms.map((f, i) => ({ name: f.name, ist: f.D, modell: M * sh[i] })) };
  });
}

/**
 * Prognose für das eigene Unternehmen.
 * @param coef   Modellkoeffizienten
 * @param ctx    { own: Index eigenes Unternehmen, konk: Konkurrenzannahmen [{name,p,L,W,K,B,aktiv, pEH, WEH, KEH, ehAktiv}],
 *                 markt: Marktvolumen online, ehAnteil %, ownBek: Bekanntheit eigenes Unternehmen }
 * @param D      eigene Entscheidungen, level: eigenes Level nach F&E
 */
export function forecast(coef, ctx, D, level) {
  const firms = ctx.konk.map((f, i) => (i === ctx.own ? { name: f.name, p: +D.preisOnline || 1, L: level, W: +D.werbungOnline || 0, K: +D.kbOnline || 0, B: ctx.ownBek, aktiv: true } : { ...f }));
  const sh = shares(coef, firms);
  const online = ctx.markt * sh[ctx.own];
  let eh = 0, shEH = 0;
  if (D.ehAktiv) {
    const fe = ctx.konk.map((f, i) => (i === ctx.own ? { p: +D.preisEH || +D.preisOnline || 1, L: level, W: +D.werbungEH || 0, K: +D.kbEH || 0, B: ctx.ownBek, aktiv: true }
      : { p: f.pEH ?? f.p, L: f.L, W: f.WEH ?? 0, K: f.KEH ?? 1, B: f.B, aktiv: f.ehAktiv !== false }));
    const s2 = shares(coef, fe);
    shEH = s2[ctx.own];
    eh = ctx.markt * (ctx.ehAnteil / 100) * shEH;
  }
  return { online: Math.round(online), eh: Math.round(eh), shareOnline: sh[ctx.own] * 100, shareEH: shEH * 100, firms, shares: sh };
}

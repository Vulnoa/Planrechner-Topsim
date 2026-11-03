// Prüft die Kalibrierung der Absatzprognose: Aus Marktdaten, die mit bekannten Koeffizienten
// erzeugt wurden, muss das Verfahren diese Koeffizienten wiederfinden.
import { calibrate, shares, PRIOR } from '../js/prognose.js';

const wahr = { ep: -5.5, q: 3.0, ew: 0.30, ek: 0.50, eb: 0.80 };
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const obs = [];
for (let p = 1; p <= 4; p++) {
  const firms = Array.from({ length: 6 }, (_, i) => ({ name: `U${i + 1}`, p: 140 + rnd() * 40, L: 1 + Math.floor(rnd() * 6), W: 250 + rnd() * 250, K: 8 + Math.floor(rnd() * 4), B: 35 + rnd() * 20 }));
  const sh = shares(wahr, firms);
  firms.forEach((f, i) => (f.D = 240000 * sh[i]));
  obs.push({ period: p, firms });
}
const c = calibrate(obs, 0).coef;
let ok = true;
for (const k of Object.keys(wahr)) {
  const good = Math.abs(c[k] - wahr[k]) < 0.05 * Math.max(1, Math.abs(wahr[k]));
  ok &&= good;
  console.log(`${good ? 'OK ' : 'XX '} ${k.padEnd(3)} wahr ${wahr[k].toFixed(3)}  gefunden ${c[k].toFixed(3)}`);
}
const c0 = calibrate([], 0.3);
const prior = Object.keys(PRIOR).every((k) => c0.coef[k] === PRIOR[k]);
console.log(`${prior ? 'OK ' : 'XX '} ohne Daten werden die Handbuchwerte verwendet`);
ok &&= prior;
console.log(ok ? '\nPrognose-Kalibrierung in Ordnung.' : '\nPrognose-Kalibrierung fehlerhaft.');
process.exit(ok ? 0 : 1);

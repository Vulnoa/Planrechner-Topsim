// PDF-Ausgabe der Berichte (jsPDF + autotable) und ZIP aller Einzelberichte (JSZip)
import { nf } from './reports.js';

const BLUE = [31, 90, 166];

function cell(v, f) { return typeof v === 'number' ? nf(v, f ?? 2) : (v ?? ''); }

export function reportPdf(rep, meta, doc) {
  const { jsPDF } = window.jspdf;
  const own = !doc;
  doc = doc || new jsPDF({ orientation: rep.tables.some((t) => t.cols.length > 4) ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const header = () => {
    doc.setFillColor(10, 125, 194); doc.rect(0, 0, W, 3, 'F');
    doc.setFontSize(8.5); doc.setTextColor(90);
    doc.text(`${meta.firma} – ${meta.unternehmen}`, 12, 9);
    doc.text(`Periode: ${meta.period}${meta.plan ? ' (Planungsrechnung)' : ''}`, W - 12, 9, { align: 'right' });
    if (meta.scenario) doc.text(`Szenario: ${meta.scenario}`, W / 2, 9, { align: 'center' });
  };
  header();
  doc.setFontSize(18); doc.setTextColor(20); doc.text(rep.title, 12, 20);
  let y = 26;
  if (rep.note) { doc.setFontSize(8.5); doc.setTextColor(80); const t = doc.splitTextToSize(rep.note, W - 24); doc.text(t, 12, y); y += t.length * 4 + 2; }
  for (const tb of rep.tables) {
    if (tb.title) { doc.setFontSize(11); doc.setTextColor(20); doc.text(tb.title, 12, y + 4); y += 6; }
    const hasUnit = !tb.noUnit;
    const head = [['', ...(hasUnit ? [tb.unitHead || ''] : []), ...tb.cols]];
    const body = tb.rows.map((r) => [r.l, ...(hasUnit ? [r.u || ''] : []), ...r.v.map((v) => r.sec ? '' : cell(v, r.f))]);
    doc.autoTable({
      head, body, startY: y, margin: { left: 12, right: 12, top: 14 }, theme: 'grid',
      styles: { fontSize: 8, cellPadding: 1.4, lineColor: [220, 228, 236], lineWidth: 0.1, textColor: 30 },
      headStyles: { fillColor: BLUE, textColor: 255, halign: 'right', fontStyle: 'bold' },
      columnStyles: { 0: { halign: 'left', cellWidth: tb.cols.length > 5 ? 52 : 'auto' }, ...(hasUnit ? { 1: { halign: 'right', fontStyle: 'italic', textColor: 110 } } : {}) },
      didParseCell: (d) => {
        if (d.section === 'head' && d.column.index === 0) d.cell.styles.fillColor = [255, 255, 255];
        if (d.section !== 'body') return;
        const r = tb.rows[d.row.index];
        if (d.column.index > 0 && !(hasUnit && d.column.index === 1)) d.cell.styles.halign = 'right';
        if (r.b) d.cell.styles.fontStyle = 'bold';
        if (r.sec) { d.cell.styles.fillColor = [212, 218, 224]; d.cell.styles.fontStyle = 'bold'; }
        if (r.i && d.column.index === 0) d.cell.styles.cellPadding = { left: 4, top: 1.4, bottom: 1.4, right: 1.4 };
      },
      didDrawPage: () => header(),
    });
    y = doc.lastAutoTable.finalY + 3;
    if (tb.foot) { doc.setFontSize(7.5); doc.setTextColor(100); const t = doc.splitTextToSize(tb.foot, W - 24); doc.text(t, 12, y + 2); y += t.length * 3.5 + 2; }
    y += 4;
  }
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(130);
    doc.text(`TONWERK Planrechner · erstellt ${new Date().toLocaleString('de-DE')} · Seite ${i}/${pages}`, 12, doc.internal.pageSize.getHeight() - 6);
  }
  return own ? doc : doc;
}

const safe = (s) => s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss')
  .replace(/[\\/:*?"<>|&]/g, '').trim().replace(/\s+/g, '_');

export async function downloadZip(reports, meta) {
  const zip = new window.JSZip();
  const folder = zip.folder(safe(`${meta.firma}_Periode_${meta.period}${meta.scenario ? '_' + meta.scenario : ''}`));
  reports.forEach((rep, i) => {
    if (!rep.tables.length && !rep.note) return;
    const doc = reportPdf(rep, meta);
    folder.file(`${String(i + 1).padStart(2, '0')}_${safe(rep.title.replace(/\(TEUR\)/, '').trim())}.pdf`, doc.output('arraybuffer'));
  });
  const blob = await zip.generateAsync({ type: 'blob' });
  save(blob, safe(`${meta.firma}_Berichte_Periode_${meta.period}${meta.scenario ? '_' + meta.scenario : ''}.zip`));
}

export function downloadSingle(rep, meta) {
  const doc = reportPdf(rep, meta);
  save(doc.output('blob'), safe(`${meta.firma}_P${meta.period}_${rep.title.replace(/\(TEUR\)/, '').trim()}.pdf`));
}

export function save(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// Eingabe-Spickzettel: eine Seite mit allen Werten in der Reihenfolge der TOPSIM-Masken
export function spickzettelPdf(masks, meta) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(10, 125, 194); doc.rect(0, 0, W, 3, 'F');
  doc.setFontSize(16); doc.setTextColor(20); doc.text(`Eingabe-Spickzettel Periode ${meta.period}`, 12, 14);
  doc.setFontSize(9); doc.setTextColor(90);
  doc.text(`${meta.firma} – ${meta.unternehmen} · Szenario: ${meta.scenario}${meta.saved ? '' : ' (Achtung: es gibt ungespeicherte Änderungen, gedruckt wird der gespeicherte Stand)'}`, 12, 20);
  let y = 25;
  masks.forEach((m, mi) => {
    const body = [];
    m.sections.forEach((s) => { body.push([{ content: s.h.toUpperCase(), colSpan: 2, styles: { fillColor: [232, 240, 248], fontStyle: 'bold', textColor: [31, 90, 166] } }]); s.rows.forEach((r) => body.push([r[0], r[1]])); });
    doc.autoTable({
      head: [[`${mi + 1}. ${m.title}`, 'Eingabe']], body, startY: y, margin: { left: 12, right: 12 }, theme: 'grid',
      styles: { fontSize: 9, cellPadding: 1.6, lineColor: [220, 228, 236], lineWidth: 0.1, textColor: 30 },
      headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 125 }, 1: { halign: 'right', fontStyle: 'bold' } },
    });
    y = doc.lastAutoTable.finalY + 5;
  });
  doc.setFontSize(7.5); doc.setTextColor(130);
  doc.text(`TONWERK Planrechner · erstellt ${new Date().toLocaleString('de-DE')} · Werte vor dem Absenden in TOPSIM mit „Speichern“ je Maske bestätigen`, 12, doc.internal.pageSize.getHeight() - 6);
  save(doc.output('blob'), safe(`${meta.firma}_Spickzettel_P${meta.period}_${meta.scenario}.pdf`));
}

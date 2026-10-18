// Einfache Diagramme für die Auswertung. Die Farbe kommt aus der Karte (--farbe), alles andere aus CSS.
import { esc } from './hilfen.js';

const formate = new Map();
/** Zahl mit Komma, `stellen` Nachkommastellen; „–" für fehlende Werte. */
export function zahl(x, stellen = 1) {
  if (x === null || x === undefined || Number.isNaN(x)) return '–';
  if (!formate.has(stellen)) formate.set(stellen, new Intl.NumberFormat('de-AT', { minimumFractionDigits: stellen, maximumFractionDigits: stellen }));
  return formate.get(stellen).format(x);
}
export const prozent = (x) => (x === null || x === undefined ? '–' : `${Math.round(x * 100)} %`);

const W = 320;

/** Deckkraft einer Stufe: zart für die erste, voll für die letzte. */
export const stufenDeckkraft = (i, n) => (n > 1 ? 0.3 + (0.7 * i) / (n - 1) : 1).toFixed(2);

/**
 * Linie über Abschnitte [{ titel, wert }], Lücken bei fehlenden Werten.
 * marken: Indizes, unter denen ein kleiner Punkt sitzt (z. B. Termine).
 */
export function linie(punkte, { min, max, beschriftung, hoehe = 132, format = (v) => zahl(v, 0), marken = [], achse = true }) {
  const vorhanden = punkte.filter((p) => p.wert !== null).length;
  if (vorhanden < 2) return '<p class="fussnote links">Noch zu wenige Werte für einen Verlauf.</p>';
  const L = achse ? 24 : 3;
  const R = 6;
  const O = 8;
  const U = achse ? 20 : 4;
  const iw = W - L - R;
  const ih = hoehe - O - U;
  const n = punkte.length;
  const X = (i) => L + (n === 1 ? iw / 2 : (i * iw) / (n - 1));
  const Y = (v) => O + ih - ((Math.min(max, Math.max(min, v)) - min) / (max - min || 1)) * ih;

  let pfad = '';
  let flaeche = '';
  let stueck = [];
  const stueckAbschliessen = () => {
    if (stueck.length > 1) {
      pfad += stueck.map((i, j) => `${j ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(punkte[i].wert).toFixed(1)}`).join('');
      flaeche += `${stueck.map((i, j) => `${j ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(punkte[i].wert).toFixed(1)}`).join('')}L${X(stueck.at(-1)).toFixed(1)} ${O + ih}L${X(stueck[0]).toFixed(1)} ${O + ih}Z`;
    }
    stueck = [];
  };
  const einzeln = [];
  punkte.forEach((p, i) => {
    if (p.wert === null) { if (stueck.length === 1) einzeln.push(stueck[0]); stueckAbschliessen(); return; }
    stueck.push(i);
  });
  if (stueck.length === 1) einzeln.push(stueck[0]);
  stueckAbschliessen();

  const letzter = punkte.map((p, i) => (p.wert !== null ? i : -1)).filter((i) => i >= 0).at(-1);
  const gitter = achse ? [min, (min + max) / 2, max].map((v) => `
    <line class="gitter" x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/>
    <text class="achse" x="${L - 5}" y="${(Y(v) + 3.5).toFixed(1)}" text-anchor="end">${esc(format(v))}</text>`).join('') : '';
  const schritt = Math.max(1, Math.ceil(n / 5));
  const xBeschriftung = achse ? punkte.map((p, i) => {
    if (i % schritt && i !== n - 1) return '';
    if (i !== n - 1 && n - 1 - i < schritt * 0.6) return '';
    const anker = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
    return `<text class="achse" x="${X(i).toFixed(1)}" y="${hoehe - 4}" text-anchor="${anker}">${esc(p.titel)}</text>`;
  }).join('') : '';
  const markenSvg = marken.map((i) => `<circle class="marke-punkt" cx="${X(i).toFixed(1)}" cy="${O + ih + (achse ? 2 : 0)}" r="3"/>`).join('');

  return `
    <svg class="diagramm" viewBox="0 0 ${W} ${hoehe}" role="img" aria-label="${esc(beschriftung)}">
      ${gitter}
      <path class="flaeche" d="${flaeche}"/>
      <path class="linie" d="${pfad}"/>
      ${einzeln.map((i) => `<circle class="punkt-linie" cx="${X(i).toFixed(1)}" cy="${Y(punkte[i].wert).toFixed(1)}" r="2.5"/>`).join('')}
      <circle class="punkt-letzter" cx="${X(letzter).toFixed(1)}" cy="${Y(punkte[letzter].wert).toFixed(1)}" r="4"/>
      ${markenSvg}
      ${xBeschriftung}
    </svg>`;
}

/**
 * Waagrechte Balken. zeilen: [{ titel, anzahl, text?, zeichen?, teile? }], teile sind Anteile 0–1
 * je Stufe (gestapelt, von zart nach kräftig).
 */
export function balken(zeilen, { max } = {}) {
  const hoechst = max ?? Math.max(1, ...zeilen.map((z) => z.anzahl));
  return `<div class="balken-liste">${zeilen.map((z) => {
    const breite = Math.max(z.anzahl ? 2 : 0, Math.round((z.anzahl / hoechst) * 100));
    const innen = z.teile
      ? z.teile.map((t, i) => `<i style="width:${(t * 100).toFixed(1)}%;opacity:${stufenDeckkraft(i, z.teile.length)}"></i>`).join('')
      : '<i></i>';
    return `
      <div class="balken-zeile">
        <span class="balken-titel">${z.zeichen ? `<b>${esc(z.zeichen)}</b>` : ''}${esc(z.titel)}</span>
        <span class="balken-spur"><span style="width:${breite}%">${innen}</span></span>
        <span class="balken-zahl">${esc(z.text ?? z.anzahl)}</span>
      </div>`;
  }).join('')}</div>`;
}

/** Raster: zeilen [{ titel, werte }], spalten [Titel]. Je dunkler, desto häufiger. */
export function raster(zeilen, spalten) {
  const hoechst = Math.max(1, ...zeilen.flatMap((z) => z.werte));
  return `<div class="raster-tabelle" style="--spalten:${spalten.length}">
    <span></span>${spalten.map((s) => `<span class="raster-kopf">${esc(s)}</span>`).join('')}
    ${zeilen.map((z) => `<span class="raster-titel">${esc(z.titel)}</span>${z.werte.map((v) => {
      const anteil = v / hoechst;
      return `<span class="raster-zelle${anteil > 0.55 ? ' kraeftig' : ''}" style="--anteil:${Math.max(v ? 10 : 0, Math.round(anteil * 100))}%">${v || ''}</span>`;
    }).join('')}`).join('')}
  </div>`;
}

/**
 * Vergleich „mit / ohne" als zwei Balken übereinander.
 * zeilen: [{ titel, unter, a, b, aText, bText, ton }], a und b auf derselben Skala (0–max).
 */
export function vergleich(zeilen, { max }) {
  return `<div class="vergleich-liste">${zeilen.map((z) => `
    <div class="vergleich-zeile">
      <span class="vergleich-titel">${esc(z.titel)}<small>${esc(z.unter)}</small></span>
      <span class="vergleich-spuren">
        <span class="spur"><i style="width:${Math.round(((z.a ?? 0) / max) * 100)}%"></i></span>
        <span class="spur ohne"><i style="width:${Math.round(((z.b ?? 0) / max) * 100)}%"></i></span>
      </span>
      <span class="vergleich-zahlen${z.ton ? ` ton-${z.ton}` : ''}"><strong>${esc(z.aText)}</strong><small>${esc(z.bText)}</small></span>
    </div>`).join('')}</div>`;
}

// Monatskalender: Punkte je Bereich zeigen, an welchen Tagen etwas eingetragen ist.
import { symbol } from './symbole.js';
import { alle, eintraegeZwischen, SPEICHER } from './db.js';
import { BEREICHE } from './konfiguration.js';
import { esc, datumText } from './hilfen.js';
import { tagAdresse } from './uebersicht.js';

const fmtMonat = new Intl.DateTimeFormat('de-AT', { month: 'long', year: 'numeric' });
const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const zwei = (n) => String(n).padStart(2, '0');

function monatVerschieben(monat, schritt) {
  const [j, m] = monat.split('-').map(Number);
  const d = new Date(j, m - 1 + schritt, 1);
  return `${d.getFullYear()}-${zwei(d.getMonth() + 1)}`;
}

/** monat als „JJJJ-MM", ausgewaehlt als „JJJJ-MM-TT" (der Tag, von dem man kam). */
export async function kalender(monat, ausgewaehlt) {
  const heute = datumText();
  const [j, m] = monat.split('-').map(Number);
  const tageImMonat = new Date(j, m, 0).getDate();
  const versatz = (new Date(j, m - 1, 1).getDay() + 6) % 7; // Montag zuerst

  const [eintraege, bereiche] = await Promise.all([
    eintraegeZwischen(`${monat}-01T00:00`, `${monat}-${zwei(tageImMonat)}T23:59`),
    alle(SPEICHER.config),
  ]);
  const reihenfolge = bereiche
    .filter((b) => BEREICHE[b.id] && !b.ausgeblendet)
    .sort((a, b) => (a.reihenfolge ?? 99) - (b.reihenfolge ?? 99));
  const proTag = new Map();
  for (const e of eintraege) {
    const tag = e.zeitpunkt.slice(0, 10);
    if (!proTag.has(tag)) proTag.set(tag, new Set());
    proTag.get(tag).add(e.bereich);
  }

  const zellen = [];
  for (let i = 0; i < versatz; i += 1) zellen.push('<span class="kal-leer"></span>');
  for (let t = 1; t <= tageImMonat; t += 1) {
    const tag = `${monat}-${zwei(t)}`;
    const vorhanden = proTag.get(tag) ?? new Set();
    const punkte = reihenfolge.filter((b) => vorhanden.has(b.id))
      .map((b) => `<span class="punkt" style="background: var(${BEREICHE[b.id].farbe})"></span>`).join('');
    const klassen = ['kal-tag', tag === heute ? 'heute' : '', tag === ausgewaehlt ? 'gewaehlt' : ''].join(' ');
    const beschriftung = `${t}. ${fmtMonat.format(new Date(j, m - 1, 1))}${vorhanden.size ? `, ${vorhanden.size} Bereiche eingetragen` : ''}`;
    zellen.push(tag > heute
      ? `<span class="${klassen} zukunft" aria-disabled="true"><span class="kal-zahl">${t}</span></span>`
      : `<a class="${klassen}" href="${tagAdresse(tag)}" aria-label="${esc(beschriftung)}"><span class="kal-zahl">${t}</span><span class="punkte">${punkte}</span></a>`);
  }

  const legende = reihenfolge.map((b) => `<span><span class="punkt" style="background: var(${BEREICHE[b.id].farbe})"></span>${esc(b.kurztitel ?? b.titel)}</span>`).join('');
  const naechster = monatVerschieben(monat, 1);
  const zurueckZu = ausgewaehlt ?? heute;

  return `
    <a class="zurueck-link" href="${tagAdresse(zurueckZu)}">${symbol('zurueck', 20)}Übersicht</a>
    <header class="kal-kopf">
      <h1>${esc(fmtMonat.format(new Date(j, m - 1, 1)))}</h1>
      <nav class="tag-wechsel" aria-label="Monat wechseln">
        <a class="rund-knopf" href="#/kalender/${monatVerschieben(monat, -1)}" aria-label="Vorheriger Monat">${symbol('zurueck', 20)}</a>
        ${naechster <= heute.slice(0, 7)
          ? `<a class="rund-knopf" href="#/kalender/${naechster}" aria-label="Nächster Monat">${symbol('weiter', 20)}</a>`
          : '<span class="rund-knopf aus" aria-hidden="true"></span>'}
      </nav>
    </header>
    <section class="karte kalender">
      <div class="kal-raster kal-wochentage">${WOCHENTAGE.map((w) => `<span>${w}</span>`).join('')}</div>
      <div class="kal-raster">${zellen.join('')}</div>
    </section>
    ${legende ? `<div class="legende">${legende}</div>` : ''}
    <a class="knopf" href="#/uebersicht">Zum aktuellen Tag</a>`;
}

// Übersicht eines Tages: Schnelleinträge, Tageskarten, Einträge des Tages, Erinnerung an die Sicherung.
import { symbol } from './symbole.js';
import { alle, anzahl, eintraegeZwischen, metaHolen, SPEICHER } from './db.js';
import { BEREICHE } from './konfiguration.js';
import { esc, datumText, tageVerschieben, alsDatum } from './hilfen.js';
import { zusammenfassen } from './zusammenfassung.js';

const datumLang = new Intl.DateTimeFormat('de-AT', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtUhr = new Intl.DateTimeFormat('de-AT', { hour: '2-digit', minute: '2-digit' });

const ERINNERUNG_TAGE = 7;

export function kopf(titel, tag) {
  const heute = datumText();
  const anzeigeTag = tag ?? heute;
  const navigation = tag
    ? `<nav class="tag-wechsel" aria-label="Tag wechseln">
        <a href="${tagAdresse(tageVerschieben(tag, -1))}" class="rund-knopf" aria-label="Vorheriger Tag">${symbol('zurueck', 20)}</a>
        ${tag < heute ? `<a href="${tagAdresse(tageVerschieben(tag, 1))}" class="rund-knopf" aria-label="Nächster Tag">${symbol('weiter', 20)}</a>` : ''}
      </nav>`
    : '';
  return `
    <header class="kopf">
      <div class="kopf-zeile">
        <div class="datum">${datumLang.format(alsDatum(anzeigeTag))}</div>
        ${tag && tag !== heute ? `<a class="zu-heute" href="#/uebersicht">Zum aktuellen Tag</a>` : ''}
      </div>
      <div class="kopf-zeile">
        <h1>${esc(titel)}</h1>
        ${navigation}
      </div>
    </header>`;
}

export function tagAdresse(tag) {
  return tag === datumText() ? '#/uebersicht' : `#/uebersicht/${tag}`;
}

function neuAdresse(bereichId, tag) {
  return tag === datumText() ? `#/eintrag/${bereichId}` : `#/eintrag/${bereichId}/neu/${tag}`;
}

async function sicherungsBanner() {
  if ((await anzahl(SPEICHER.eintraege)) === 0) return '';
  const letzte = await metaHolen('letzteSicherung');
  const tage = letzte ? Math.floor((Date.now() - new Date(letzte).getTime()) / 86400000) : null;
  if (tage !== null && tage < ERINNERUNG_TAGE) return '';
  const text = tage === null
    ? 'Noch keine Sicherung. Sichere deine Daten regelmäßig in iCloud Drive.'
    : `Letzte Sicherung vor ${tage} Tagen. Zeit für eine neue.`;
  return `<a class="banner" href="#/daten" style="--farbe: var(--magen)">${symbol('sichern', 22)}<span>${text}</span></a>`;
}

function leer(speicherHinweis) {
  return `
    ${kopf('Bauchgefühl')}
    <section class="karte leer" style="--farbe: var(--schlaf)">
      <span class="symbol-gross">${symbol('wiederherstellen', 28)}</span>
      <h2>Noch nichts eingerichtet</h2>
      <p>Spiel deine Startdatei oder eine Sicherung ein, dann erscheinen hier deine Bereiche.</p>
      <a class="knopf haupt" href="#/daten">Wiederherstellen</a>
      <a class="textlink" href="#/eintrag/beispiel">Beispiel-Eingabe ansehen</a>
    </section>
    ${speicherHinweis}`;
}

export async function uebersicht(tag, speicherHinweis = '') {
  const bereiche = (await alle(SPEICHER.config))
    .filter((b) => BEREICHE[b.id] && !b.ausgeblendet && b.felder?.length)
    .sort((a, b) => (a.reihenfolge ?? 99) - (b.reihenfolge ?? 99));
  if (!bereiche.length) return leer(speicherHinweis);

  const [eintraege, personen] = await Promise.all([
    eintraegeZwischen(`${tag}T00:00`, `${tag}T23:59`),
    alle(SPEICHER.personen),
  ]);
  const farbe = (b) => `var(${BEREICHE[b.id].farbe})`;
  const name = (b) => b.kurztitel ?? b.titel ?? BEREICHE[b.id].titel;
  const sym = (b) => symbol(b.symbol ?? BEREICHE[b.id].symbol, 22);

  const schnell = bereiche.filter((b) => b.zeitart !== 'tag');
  const tagesweise = bereiche.filter((b) => b.zeitart === 'tag');

  const kacheln = schnell.map((b) => `
    <a class="schnell" href="${neuAdresse(b.id, tag)}" style="--farbe: ${farbe(b)}">
      <span class="schnell-symbol">${sym(b)}</span>
      <span>${esc(name(b))}</span>
    </a>`).join('');

  const karten = tagesweise.map((b) => {
    const e = eintraege.find((x) => x.bereich === b.id);
    const ziel = e ? `#/eintrag/${b.id}/${e.id}` : neuAdresse(b.id, tag);
    const text = e ? zusammenfassen(b, e, personen) || 'Eingetragen' : (b.untertitel ?? 'Noch offen');
    return `
      <a class="tageskarte" href="${ziel}" style="--farbe: ${farbe(b)}">
        <span class="tageskarte-kopf">
          <span class="symbol-klein">${sym(b)}</span>
          <span class="status ${e ? 'erledigt' : ''}">${e ? 'Erledigt' : 'Offen'}</span>
        </span>
        <span class="tageskarte-text"><strong>${esc(name(b))}</strong><span>${esc(text)}</span></span>
      </a>`;
  }).join('');

  const liste = eintraege
    .filter((e) => schnell.some((b) => b.id === e.bereich))
    .sort((a, b) => a.zeitpunkt.localeCompare(b.zeitpunkt))
    .map((e) => {
      const b = schnell.find((x) => x.id === e.bereich);
      return `
        <a class="eintrag-zeile" href="#/eintrag/${b.id}/${e.id}" style="--farbe: ${farbe(b)}">
          <span class="symbol-klein">${sym(b)}</span>
          <span class="eintrag-text">
            <span class="eintrag-titel"><strong>${esc(name(b))}</strong><span>${fmtUhr.format(alsDatum(e.zeitpunkt))}</span></span>
            <span class="eintrag-inhalt">${esc(zusammenfassen(b, e, personen) || 'Ohne Angaben')}</span>
          </span>
          ${symbol('weiter', 18)}
        </a>`;
    }).join('');

  return `
    ${kopf('Bauchgefühl', tag)}
    ${await sicherungsBanner()}
    ${kacheln ? `<div class="schnell-raster" style="--spalten: ${Math.min(schnell.length, 3)}">${kacheln}</div>` : ''}
    ${karten ? `<div class="tageskarten">${karten}</div>` : ''}
    <section class="abschnitt">
      <h2>Einträge</h2>
      ${liste ? `<div class="karte eintraege">${liste}</div>` : '<p class="fussnote links">An diesem Tag noch nichts eingetragen.</p>'}
    </section>
    ${speicherHinweis}`;
}

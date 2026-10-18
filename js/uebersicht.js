// Übersicht eines Tages: Schnelleinträge, Tageskarten, Einträge des Tages, Erinnerung an die Sicherung.
import { symbol } from './symbole.js';
import { alle, anzahl, eintraegeZwischen, metaHolen, SPEICHER } from './db.js';
import { BEREICHE } from './konfiguration.js';
import { esc, datumText, tageVerschieben, alsDatum } from './hilfen.js';
import { zusammenfassen } from './zusammenfassung.js';
import { uebungenFuerTag } from './genesung.js';
import { genesungKontext } from './genesung-daten.js';

const datumLang = new Intl.DateTimeFormat('de-AT', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtUhr = new Intl.DateTimeFormat('de-AT', { hour: '2-digit', minute: '2-digit' });
const fmtWochentag = new Intl.DateTimeFormat('de-AT', { weekday: 'short' });

const ERINNERUNG_STANDARD = 7;

/**
 * Kopf mit Datum und Titel. Mit `tag` (Übersicht) öffnet die Datumszeile den Kalender,
 * und oben rechts führt das Zahnrad zu den Einstellungen.
 */
export function kopf(titel, tag) {
  const heute = datumText();
  const anzeigeTag = tag ?? heute;
  const datum = datumLang.format(alsDatum(anzeigeTag));
  return `
    <header class="kopf">
      <div class="kopf-zeile">
        ${tag
          ? `<a class="datum datum-link" href="#/kalender/${anzeigeTag.slice(0, 7)}/${anzeigeTag}" aria-label="${esc(datum)}, Kalender öffnen">${symbol('kalender', 15, 2.2)}${esc(datum)}</a>`
          : `<div class="datum">${esc(datum)}</div>`}
        ${tag && tag !== heute ? '<a class="zu-heute" href="#/uebersicht">Zum aktuellen Tag</a>' : ''}
      </div>
      <div class="kopf-zeile">
        <h1>${esc(titel)}</h1>
        ${tag ? `<a class="rund-knopf glas" href="#/einstellungen" aria-label="Einstellungen">${symbol('zahnrad', 22)}</a>` : ''}
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
  if (tage !== null && tage < ((await metaHolen('erinnerungTage')) ?? ERINNERUNG_STANDARD)) return '';
  const text = tage === null
    ? 'Noch keine Sicherung. Sichere deine Daten regelmäßig in iCloud Drive.'
    : `Letzte Sicherung vor ${tage} Tagen. Zeit für eine neue.`;
  return `<a class="banner" href="#/einstellungen" style="--farbe: var(--magen)">${symbol('sichern', 22)}<span>${text}</span></a>`;
}

function leer(speicherHinweis) {
  return `
    ${kopf('Bauchgefühl')}
    <section class="karte leer" style="--farbe: var(--schlaf)">
      <span class="symbol-gross">${symbol('wiederherstellen', 28)}</span>
      <h2>Noch nichts eingerichtet</h2>
      <p>Spiel deine Startdatei oder eine Sicherung ein, dann erscheinen hier deine Bereiche.</p>
      <a class="knopf haupt" href="#/einstellungen">Wiederherstellen</a>
      <a class="textlink" href="#/eintrag/beispiel">Beispiel-Eingabe ansehen</a>
    </section>
    ${speicherHinweis}`;
}

/** Leiste mit den sieben Tagen der Woche (Montag bis Sonntag), Punkt bei Tagen mit Einträgen. */
async function wochenleiste(tag) {
  const montag = tageVerschieben(tag, -((alsDatum(tag).getDay() + 6) % 7));
  const sonntag = tageVerschieben(montag, 6);
  const heute = datumText();
  const nurImport = new Set((await alle(SPEICHER.config)).filter((b) => b.ohneEingabe).map((b) => b.id));
  const mitEintrag = new Set((await eintraegeZwischen(`${montag}T00:00`, `${sonntag}T23:59`))
    .filter((e) => !nurImport.has(e.bereich))
    .map((e) => e.zeitpunkt.slice(0, 10)));
  const tage = Array.from({ length: 7 }, (_, i) => tageVerschieben(montag, i)).map((t) => {
    const name = fmtWochentag.format(alsDatum(t)).replace('.', '');
    const inhalt = `${esc(name)}<b>${alsDatum(t).getDate()}</b><i${mitEintrag.has(t) ? '' : ' class="ohne"'}></i>`;
    const klassen = ['woche-tag', t === tag ? 'gewaehlt' : '', t === heute ? 'heute' : ''].join(' ');
    return t > heute
      ? `<span class="${klassen} zukunft" aria-disabled="true">${inhalt}</span>`
      : `<a class="${klassen}" href="${tagAdresse(t)}" ${t === tag ? 'aria-current="date"' : ''}>${inhalt}</a>`;
  });
  return `<nav class="woche" aria-label="Woche">${tage.join('')}</nav>`;
}

export async function uebersicht(tag, speicherHinweis = '') {
  const bereiche = (await alle(SPEICHER.config))
    .filter((b) => BEREICHE[b.id] && !b.ausgeblendet && !b.ohneEingabe && b.felder?.length)
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

  const kacheln = schnell.map((b) => {
    const n = eintraege.filter((e) => e.bereich === b.id).length;
    const text = n === 0 ? 'Neuer Eintrag' : n === 1 ? '1 Eintrag' : `${n} Einträge`;
    return `
    <a class="tageskarte" href="${neuAdresse(b.id, tag)}" style="--farbe: ${farbe(b)}">
      <span class="tageskarte-kopf">
        <span class="symbol-voll">${sym(b)}</span>
        <span class="marke" aria-hidden="true">${symbol('plus', 16, 2.6)}</span>
      </span>
      <span class="tageskarte-text"><strong>${esc(name(b))}</strong><span>${text}</span></span>
    </a>`;
  }).join('');

  const karten = tagesweise.map((b) => {
    const e = eintraege.find((x) => x.bereich === b.id);
    const ziel = e ? `#/eintrag/${b.id}/${e.id}` : neuAdresse(b.id, tag);
    const text = e ? zusammenfassen(b, e, personen) || 'Eingetragen' : (b.untertitel ?? 'Noch offen');
    return `
      <a class="tageskarte" href="${ziel}" style="--farbe: ${farbe(b)}">
        <span class="tageskarte-kopf">
          <span class="symbol-voll">${sym(b)}</span>
          <span class="marke ${e ? 'erledigt' : ''}" role="img" aria-label="${e ? 'Erledigt' : 'Offen'}">${symbol(e ? 'haken' : 'plus', 16, 2.6)}</span>
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
    ${await wochenleiste(tag)}
    ${await sicherungsBanner()}
    ${kacheln || karten ? `<div class="tageskarten">${kacheln}${karten}</div>` : ''}
    ${uebungenFuerTag(tag, await genesungKontext())}
    <section class="abschnitt">
      <h2>Einträge</h2>
      ${liste ? `<div class="karte eintraege">${liste}</div>` : '<p class="fussnote links">An diesem Tag noch nichts eingetragen.</p>'}
    </section>
    ${speicherHinweis}`;
}

// Listen und Optionen bearbeiten: umbenennen, ausblenden, eigene anlegen.
// Änderungen werden als „bearbeitet" markiert und überstehen das erneute Einspielen der Startdatei.
import { symbol } from './symbole.js';
import { alle, holen, speichern, SPEICHER } from './db.js';
import { BEREICHE } from './konfiguration.js';
import { feldFinden } from './felder.js';
import { esc, idsZaehlen } from './hilfen.js';

const zahl = new Intl.NumberFormat('de-AT');

/** Symbole zur Auswahl für eigene Optionen. */
const SYMBOL_AUSWAHL = ['stern', 'herz', 'buch', 'bildschirm', 'telefon', 'musik', 'weg', 'koffer', 'arzt', 'haus', 'gabel',
  'person', 'uhr', 'feuer', 'tropfen', 'wolke', 'blitz', 'welle', 'aktivitaet', 'schlaf', 'tag', 'ernaehrung', 'kalender', 'haken'];

/** Alle Felder mit Optionen, mit lesbarem Pfad („Option › Feld") für Zusatzfragen. */
function listenFelder(felder, vorne = '') {
  const ergebnis = [];
  for (const f of felder ?? []) {
    if (f.typ === 'einfach' || f.typ === 'mehrfach') ergebnis.push({ feld: f, name: `${vorne}${f.titel}` });
    for (const o of f.optionen ?? []) ergebnis.push(...listenFelder(o.zusatz, `${vorne}${o.titel} › `));
    ergebnis.push(...listenFelder(f.jeOption, `${vorne}${f.titel} › `));
  }
  return ergebnis;
}

function optionSymbol(o) {
  if (o.pfad) return `<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${esc(o.pfad)}"/></svg>`;
  if (o.symbol) return symbol(o.symbol, 20);
  if (o.farbe) return `<span class="tupfer" style="background:${esc(o.farbe)}"></span>`;
  return '';
}

/** Übersicht aller Listen, nach Bereich. */
export async function listenUebersicht(ziel) {
  const bereiche = (await alle(SPEICHER.config))
    .filter((b) => BEREICHE[b.id])
    .sort((a, b) => (a.reihenfolge ?? 99) - (b.reihenfolge ?? 99));
  ziel.innerHTML = `
    <a class="zurueck-link" href="#/einstellungen">${symbol('zurueck', 20)}Einstellungen</a>
    <header class="kopf"><h1>Listen und Optionen</h1></header>
    ${bereiche.map((b) => {
      const listen = listenFelder(b.felder);
      if (!listen.length) return '';
      return `<section class="abschnitt" style="--farbe: var(${BEREICHE[b.id].farbe})">
        <h2>${esc(b.kurztitel ?? b.titel)}</h2>
        <div class="karte liste-links">
          ${listen.map(({ feld, name }) => {
            const sichtbar = (feld.optionen ?? []).filter((o) => !o.ausgeblendet).length;
            const versteckt = (feld.optionen ?? []).length - sichtbar;
            return `<a href="#/einstellungen/listen/${esc(b.id)}/${esc(feld.id)}">
              <span><strong>${esc(name)}</strong><span>${zahl.format(sichtbar)} Optionen${versteckt ? `, ${zahl.format(versteckt)} ausgeblendet` : ''}</span></span>
              ${symbol('weiter', 18)}</a>`;
          }).join('')}
        </div>
      </section>`;
    }).join('') || '<section class="karte leer"><p>Noch keine Konfiguration eingespielt.</p></section>'}`;
}

/** Optionen einer Liste bearbeiten. */
export async function listeBearbeiten(ziel, bereichId, feldId, { meldung, zustand = {} }) {
  const [bereich, eintraege] = await Promise.all([holen(SPEICHER.config, bereichId), alle(SPEICHER.eintraege)]);
  const feld = bereich && feldFinden(bereich.felder, feldId);
  if (!feld) {
    ziel.innerHTML = `<a class="zurueck-link" href="#/einstellungen/listen">${symbol('zurueck', 20)}Listen</a>
      <section class="karte leer"><h2>Liste nicht gefunden</h2></section>`;
    return;
  }
  const nutzung = idsZaehlen(eintraege.filter((e) => e.bereich === bereichId));
  const farbe = `var(${BEREICHE[bereichId].farbe})`;
  const mitSymbol = feld.darstellung !== 'suche' && feld.darstellung !== 'farben' && feld.darstellung !== 'liste';
  const fuerJedeOption = !!feld.jeOption?.length; // z. B. Aktivitäten: dort lässt sich „Mit wem" ergänzen
  const neuladen = (z = {}) => listeBearbeiten(ziel, bereichId, feldId, { meldung, zustand: z });

  const zeile = (o) => {
    const n = nutzung.get(o.id) ?? 0;
    if (zustand.bearbeiten === o.id) {
      return `<form class="option-zeile bearbeiten" data-umbenennen="${esc(o.id)}">
        <input class="eingabe-feld rand" name="titel" value="${esc(o.titel)}" autocomplete="off" aria-label="Neuer Name">
        <button type="submit" class="wahl stufe" aria-pressed="true">Sichern</button>
      </form>`;
    }
    return `<div class="option-zeile ${o.ausgeblendet ? 'aus' : ''}">
      <span class="option-symbol">${optionSymbol(o)}</span>
      <span class="option-text"><strong>${esc(o.titel)}</strong><span>${n === 1 ? '1 Eintrag' : `${zahl.format(n)} Einträge`}${o.ausImport ? ' · aus Altdaten' : ''}</span></span>
      <button type="button" class="rund-knopf klein" data-stift="${esc(o.id)}" aria-label="${esc(o.titel)} umbenennen">${symbol('stift', 18)}</button>
      <button type="button" class="rund-knopf klein" data-auge="${esc(o.id)}" aria-label="${esc(o.titel)} ${o.ausgeblendet ? 'einblenden' : 'ausblenden'}">${symbol(o.ausgeblendet ? 'auge' : 'augeZu', 18)}</button>
    </div>`;
  };

  const optionen = feld.optionen ?? [];
  const sichtbar = optionen.filter((o) => !o.ausgeblendet);
  const versteckt = optionen.filter((o) => o.ausgeblendet);

  // Eigener Container: verschwindet beim Neuzeichnen mitsamt seinen Klick-Empfängern.
  const wurzel = document.createElement('div');
  wurzel.className = 'inhalt';
  ziel.replaceChildren(wurzel);
  wurzel.innerHTML = `
    <a class="zurueck-link" href="#/einstellungen/listen">${symbol('zurueck', 20)}Listen</a>
    <header class="kopf"><div class="datum">${esc(bereich.kurztitel ?? bereich.titel)}</div><h1>${esc(feld.titel)}</h1></header>
    <section class="abschnitt" style="--farbe: ${farbe}">
      <div class="karte optionen-liste">${sichtbar.map(zeile).join('') || '<p class="fussnote">Noch keine Optionen.</p>'}</div>
    </section>

    <section class="abschnitt" style="--farbe: ${farbe}">
      <h2>Neue Option</h2>
      <form class="karte daten-karte" data-neu>
        <input class="eingabe-feld rand" name="titel" placeholder="Name" autocomplete="off" aria-label="Name der neuen Option" required>
        ${mitSymbol ? `<div class="symbol-wahl" role="radiogroup" aria-label="Symbol">
          ${SYMBOL_AUSWAHL.map((s, i) => `<label><input type="radio" name="symbol" value="${s}" ${i === 0 ? 'checked' : ''}><span>${symbol(s, 20)}</span></label>`).join('')}
        </div>` : ''}
        ${fuerJedeOption ? `<label class="haken-zeile"><input type="checkbox" name="mitWem"> Auch fragen: Mit wem?</label>` : ''}
        <button type="submit" class="knopf haupt">${symbol('plus', 20)}Hinzufügen</button>
      </form>
    </section>

    ${versteckt.length ? `<section class="abschnitt" style="--farbe: ${farbe}">
      <h2>Ausgeblendet</h2>
      <p class="fussnote links">Erscheinen nicht mehr bei der Eingabe. Alte Einträge behalten den Wert.</p>
      <div class="karte optionen-liste">${versteckt.map(zeile).join('')}</div>
    </section>` : ''}`;

  const sichern = async (text) => { await speichern(SPEICHER.config, bereich); meldung(text); };

  wurzel.addEventListener('click', async (e) => {
    const stift = e.target.closest('[data-stift]');
    const auge = e.target.closest('[data-auge]');
    if (!stift && !auge) return;
    if (stift) { await neuladen({ bearbeiten: stift.dataset.stift }); ziel.querySelector('[data-umbenennen] input')?.focus(); return; }
    const o = optionen.find((x) => x.id === auge.dataset.auge);
    o.ausgeblendet = !o.ausgeblendet;
    o.bearbeitet = true;
    await sichern(o.ausgeblendet ? `„${o.titel}" ausgeblendet` : `„${o.titel}" eingeblendet`);
    await neuladen();
  });

  wurzel.querySelector('[data-umbenennen]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const o = optionen.find((x) => x.id === e.target.dataset.umbenennen);
    const titel = e.target.elements.titel.value.trim();
    if (titel && titel !== o.titel) {
      // Der CSV-Name bleibt der alte, damit Export und erneuter Import zu den bisherigen Daten passen.
      if (!o.csv) o.csv = o.titel;
      o.titel = titel;
      o.bearbeitet = true;
      await sichern('Umbenannt');
    }
    await neuladen();
  });

  wurzel.querySelector('[data-neu]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const titel = form.elements.titel.value.trim();
    if (!titel) return;
    if (optionen.some((o) => o.titel.toLocaleLowerCase('de') === titel.toLocaleLowerCase('de'))) {
      meldung(`„${titel}" gibt es schon`);
      return;
    }
    const basis = `eigen_${titel.toLocaleLowerCase('de').replace(/[^a-z0-9äöüß]+/g, '_').replace(/^_|_$/g, '') || 'option'}`;
    let id = basis;
    for (let i = 2; optionen.some((o) => o.id === id); i += 1) id = `${basis}_${i}`;
    const neu = { id, titel, bearbeitet: true };
    if (mitSymbol) neu.symbol = form.elements.symbol?.value;
    if (fuerJedeOption && form.elements.mitWem?.checked) {
      neu.zusatz = [{ id: `${id}_mit`, titel: 'Mit wem', typ: 'person', rolle: 'person' }];
    }
    feld.optionen = [...optionen, neu];
    await sichern(`„${titel}" hinzugefügt`);
    await neuladen();
  });
}

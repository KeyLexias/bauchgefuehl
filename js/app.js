import { symbol } from './symbole.js';
import { alle, SPEICHER, dauerhaftAnfragen } from './db.js';

const TABS = [
  { pfad: 'uebersicht', titel: 'Übersicht', symbol: 'uebersicht' },
  { pfad: 'genesung', titel: 'Genesung', symbol: 'genesung' },
  { pfad: 'auswertung', titel: 'Auswertung', symbol: 'auswertung' },
];

const ansicht = document.getElementById('ansicht');
const tabs = document.getElementById('tabs');

const datumLang = new Intl.DateTimeFormat('de-AT', { weekday: 'long', day: 'numeric', month: 'long' });

let dauerhaft = null;

function aktuellerPfad() {
  const pfad = location.hash.replace(/^#\/?/, '');
  return TABS.some((t) => t.pfad === pfad) ? pfad : 'uebersicht';
}

function tabsZeichnen(aktiv) {
  tabs.innerHTML = TABS.map((t) => `
    <a href="#/${t.pfad}" ${t.pfad === aktiv ? 'aria-current="page"' : ''}>
      ${symbol(t.symbol)}${t.titel}
    </a>`).join('');
}

function kopf(titel) {
  return `
    <header class="kopf">
      <div class="datum">${datumLang.format(new Date())}</div>
      <h1>${titel}</h1>
    </header>`;
}

function speicherHinweis() {
  if (dauerhaft === null) return '';
  const text = dauerhaft
    ? 'Daten liegen nur auf diesem Gerät und sind vor automatischem Löschen geschützt.'
    : 'Daten liegen nur auf diesem Gerät. Der Browser hat dauerhaften Speicher nicht bestätigt, regelmäßig sichern.';
  return `<p class="fussnote">${text}</p>`;
}

async function uebersicht() {
  const config = await alle(SPEICHER.config);
  if (config.length === 0) {
    return `
      ${kopf('Bauchgefühl')}
      <section class="karte leer" style="--farbe: var(--schlaf)">
        <span class="symbol-gross">${symbol('wiederherstellen', 28)}</span>
        <h2>Noch nichts eingerichtet</h2>
        <p>Spiel deine Startdatei oder eine Sicherung ein, dann erscheinen hier deine Bereiche.</p>
        <button class="knopf haupt" type="button" disabled>Wiederherstellen</button>
        <p class="fussnote">Wiederherstellen folgt im nächsten Ausbauschritt.</p>
      </section>
      ${speicherHinweis()}`;
  }
  return `${kopf('Bauchgefühl')}${speicherHinweis()}`;
}

function spaeter(titel, farbe, sym) {
  return `
    ${kopf(titel)}
    <section class="karte leer" style="--farbe: var(${farbe})">
      <span class="symbol-gross">${symbol(sym, 28)}</span>
      <h2>${titel}</h2>
      <p>Kommt in einer späteren Version.</p>
    </section>`;
}

const ANSICHTEN = {
  uebersicht,
  genesung: () => spaeter('Genesung', '--genesung', 'genesung'),
  auswertung: () => spaeter('Auswertung', '--schlaf', 'auswertung'),
};

async function zeichnen() {
  const pfad = aktuellerPfad();
  tabsZeichnen(pfad);
  try {
    ansicht.innerHTML = await ANSICHTEN[pfad]();
  } catch (fehler) {
    console.error(fehler);
    ansicht.innerHTML = `
      <section class="karte leer">
        <h2>Etwas ist schiefgelaufen</h2>
        <p>${String(fehler.message ?? fehler)}</p>
      </section>`;
  }
  window.scrollTo(0, 0);
}

function serviceWorkerStarten() {
  if (!('serviceWorker' in navigator)) return;
  // Nur neu laden, wenn eine neue Version eine bereits laufende ablöst.
  const hatteSteuerung = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hatteSteuerung) location.reload();
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch((fehler) => {
    console.warn('Offline-Modus nicht verfügbar:', fehler);
  });
}

window.addEventListener('hashchange', zeichnen);

serviceWorkerStarten();
zeichnen();
dauerhaftAnfragen()
  .then((ok) => { dauerhaft = ok; if (aktuellerPfad() === 'uebersicht') zeichnen(); })
  .catch(() => { dauerhaft = false; });

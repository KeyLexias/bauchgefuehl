import { symbol } from './symbole.js';
import { alle, holen, speichern, loeschen, SPEICHER, dauerhaftAnfragen, neueId } from './db.js';
import { BEISPIEL, BEREICHE } from './konfiguration.js';
import { formularAnzeigen } from './formular.js';
import { esc } from './hilfen.js';

const TABS = [
  { pfad: 'uebersicht', titel: 'Übersicht', symbol: 'uebersicht' },
  { pfad: 'genesung', titel: 'Genesung', symbol: 'genesung' },
  { pfad: 'auswertung', titel: 'Auswertung', symbol: 'auswertung' },
];

const ansicht = document.getElementById('ansicht');
const tabs = document.getElementById('tabs');

const datumLang = new Intl.DateTimeFormat('de-AT', { weekday: 'long', day: 'numeric', month: 'long' });

let dauerhaft = null;
let updateWartet = false;

function adresse() {
  return location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
}

function aktuellerPfad() {
  const [pfad] = adresse();
  return TABS.some((t) => t.pfad === pfad) || pfad === 'eintrag' ? pfad : 'uebersicht';
}

/** Kurze Meldung unten am Bildschirm. */
export function meldung(text) {
  const el = document.createElement('div');
  el.className = 'meldung';
  el.setAttribute('role', 'status');
  el.textContent = text;
  document.body.append(el);
  setTimeout(() => el.remove(), 2600);
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
        <a class="knopf" href="#/eintrag/beispiel">Beispiel-Eingabe ansehen</a>
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

/** Eingabe für einen Bereich, neu oder zum Bearbeiten (#/eintrag/bereich/id). */
async function eingabe(ziel) {
  const [, bereichId, eintragId] = adresse();
  const bereich = bereichId === 'beispiel' ? BEISPIEL : await holen(SPEICHER.config, bereichId);
  if (!bereich || !BEREICHE[bereichId]) {
    ziel.innerHTML = `<section class="karte leer"><h2>Bereich nicht gefunden</h2>
      <p>„${esc(bereichId)}" ist nicht eingerichtet.</p><a class="knopf" href="#/uebersicht">Zur Übersicht</a></section>`;
    return;
  }
  const eintrag = eintragId ? await holen(SPEICHER.eintraege, eintragId) : undefined;
  const zurueck = () => { location.hash = '#/uebersicht'; };
  formularAnzeigen(ziel, {
    bereich,
    eintrag,
    personen: await alle(SPEICHER.personen),
    personAnlegen: async (name) => {
      const person = { id: neueId(), name };
      if (bereich.id !== 'beispiel') await speichern(SPEICHER.personen, person);
      return person;
    },
    abbrechen: zurueck,
    sichern: async (neu) => {
      if (bereich.id === 'beispiel') {
        beispielErgebnis(ziel, neu);
        return;
      }
      await speichern(SPEICHER.eintraege, neu);
      meldung('Gesichert');
      zurueck();
    },
    loeschen: async (alt) => {
      if (!confirm('Diesen Eintrag löschen?')) return;
      await loeschen(SPEICHER.eintraege, alt.id);
      meldung('Gelöscht');
      zurueck();
    },
  });
}

// Das Beispiel speichert nichts, es zeigt nur, was gespeichert würde.
function beispielErgebnis(ziel, eintrag) {
  ziel.querySelector('.beispiel-ergebnis')?.remove();
  const karte = document.createElement('section');
  karte.className = 'karte beispiel-ergebnis';
  karte.innerHTML = `<h2>So würde der Eintrag gespeichert</h2><pre>${esc(JSON.stringify(eintrag, null, 2))}</pre>`;
  ziel.querySelector('.eingabe').append(karte);
  karte.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const ANSICHTEN = {
  uebersicht,
  genesung: () => spaeter('Genesung', '--genesung', 'genesung'),
  auswertung: () => spaeter('Auswertung', '--schlaf', 'auswertung'),
};

async function zeichnen() {
  const pfad = aktuellerPfad();
  const istEingabe = pfad === 'eintrag';
  if (updateWartet && !istEingabe) { location.reload(); return; }
  document.body.classList.toggle('ohne-tabs', istEingabe);
  tabsZeichnen(pfad);
  try {
    if (istEingabe) await eingabe(ansicht);
    else ansicht.innerHTML = await ANSICHTEN[pfad]();
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
  // Nur neu laden, wenn eine neue Version eine bereits laufende ablöst,
  // und nie mitten in einer Eingabe, sonst ginge sie verloren.
  const hatteSteuerung = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hatteSteuerung) return;
    if (aktuellerPfad() === 'eintrag') updateWartet = true;
    else location.reload();
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
    // Am iPhone bleibt die App oft im Hintergrund offen: beim Zurückholen nach Updates sehen.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch((fehler) => {
    console.warn('Offline-Modus nicht verfügbar:', fehler);
  });
}

window.addEventListener('hashchange', zeichnen);

serviceWorkerStarten();
zeichnen();
dauerhaftAnfragen()
  .then((ok) => { dauerhaft = ok; if (aktuellerPfad() === 'uebersicht') zeichnen(); })
  .catch(() => { dauerhaft = false; });

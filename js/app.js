import { symbol } from './symbole.js';
import { seiteEinblenden } from './bewegung.js';
import { alle, holen, speichern, loeschen, eintraegeVon, eintraegeZwischen, SPEICHER, dauerhaftAnfragen, neueId } from './db.js';
import { BEISPIEL, BEREICHE } from './konfiguration.js';
import { formularAnzeigen } from './formular.js';
import { esc, datumText, idsZaehlen } from './hilfen.js';
import { uebersicht, tagAdresse } from './uebersicht.js';
import { einstellungenAnzeigen } from './einstellungen.js';
import { personenListe, personBearbeiten } from './personen.js';
import { listenUebersicht, listeBearbeiten } from './listen.js';
import { kalender } from './kalender.js';
import { anwenden as darstellungAnwenden } from './darstellung.js';
import { genesungAnzeigen, istFormular, schnellEintrag } from './genesung.js';
import { genesungLaden, mitSchmerzfragen } from './genesung-daten.js';
import { auswertungAnzeigen } from './auswertung.js';

const TABS = [
  { pfad: 'uebersicht', titel: 'Übersicht', symbol: 'uebersicht' },
  { pfad: 'genesung', titel: 'Genesung', symbol: 'genesung' },
  { pfad: 'auswertung', titel: 'Auswertung', symbol: 'auswertung' },
];

const ansicht = document.getElementById('ansicht');
const tabs = document.getElementById('tabs');

let dauerhaft = null;
let updateWartet = false;

function adresse() {
  return location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
}

// Seiten ohne eigenen Tab; sie gehören zur Übersicht.
const UNTERSEITEN = ['eintrag', 'einstellungen', 'kalender'];

function aktuellerPfad() {
  const [pfad] = adresse();
  if (pfad === 'daten') return 'einstellungen'; // alte Adresse
  return TABS.some((t) => t.pfad === pfad) || UNTERSEITEN.includes(pfad) ? pfad : 'uebersicht';
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

// Die Leiste wird einmal gebaut; danach wandert nur die Kapsel zum aktiven Tab.
function tabsZeichnen(aktiv) {
  if (!tabs.childElementCount) {
    tabs.innerHTML = `<span class="tabs-kapsel" aria-hidden="true"></span>${TABS.map((t) => `
      <a href="#/${t.pfad}" data-tab="${t.pfad}">${symbol(t.symbol)}${t.titel}</a>`).join('')}`;
  }
  const index = TABS.findIndex((t) => t.pfad === aktiv);
  for (const a of tabs.querySelectorAll('a')) {
    if (a.dataset.tab === aktiv) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  tabs.style.setProperty('--tab-index', Math.max(index, 0));
}

// Eingaben und Formulare: ohne Tab-Leiste, und ein Update wartet, bis sie verlassen werden.
function inEingabe() {
  const teile = adresse();
  return aktuellerPfad() === 'eintrag' || (teile[0] === 'genesung' && istFormular(teile.slice(1)));
}

// Wie tief eine Adresse liegt, für die Richtung des Seitenwechsels.
function tiefe(teile) {
  const [pfad] = teile;
  if (pfad === 'eintrag') return 3;
  if (pfad === 'genesung') return teile.length === 1 ? 0 : istFormular(teile.slice(1)) ? 3 : 2;
  if (pfad === 'einstellungen') return Math.min(teile.length, 3);
  return pfad === 'kalender' ? 1 : 0;
}

let letzteAdresse = null;

function richtung() {
  const alt = letzteAdresse;
  const neu = adresse();
  letzteAdresse = neu;
  if (!alt || alt.join('/') === neu.join('/')) return alt ? undefined : 'tab';
  const [ta, tn] = [tiefe(alt), tiefe(neu)];
  if (tn !== ta) return tn > ta ? 'vor' : 'zurueck';
  // Andere Tage der Übersicht: neuerer Tag kommt von rechts
  if (alt[0] === 'uebersicht' && neu[0] === 'uebersicht') {
    return (neu[1] ?? datumText()) > (alt[1] ?? datumText()) ? 'vor' : 'zurueck';
  }
  return 'tab';
}

function speicherHinweis() {
  if (dauerhaft === null) return '';
  const text = dauerhaft
    ? 'Daten liegen nur auf diesem Gerät und sind vor automatischem Löschen geschützt.'
    : 'Daten liegen nur auf diesem Gerät. Der Browser hat dauerhaften Speicher nicht bestätigt, regelmäßig sichern.';
  return `<p class="fussnote">${text}</p>`;
}

/** Eingabe für einen Bereich, neu oder zum Bearbeiten (#/eintrag/bereich/id). */
const GUELTIGER_TAG = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Adressen: #/eintrag/bereich (neu, heute), #/eintrag/bereich/neu/JJJJ-MM-TT (neu an einem Tag),
 * #/eintrag/bereich/id (bearbeiten).
 */
async function eingabe(ziel) {
  const [, bereichId, teil, tagTeil] = adresse();
  const vorgabeTag = teil === 'neu' && GUELTIGER_TAG.test(tagTeil ?? '') ? tagTeil : undefined;
  let eintragId = teil === 'neu' ? undefined : teil;
  const gespeichert = bereichId === 'beispiel' ? BEISPIEL : await holen(SPEICHER.config, bereichId);
  if (!gespeichert || !BEREICHE[bereichId] || !gespeichert.felder) {
    ziel.innerHTML = `<section class="karte leer"><h2>Bereich nicht gefunden</h2>
      <p>„${esc(bereichId)}" ist nicht eingerichtet.</p><a class="knopf" href="#/uebersicht">Zur Übersicht</a></section>`;
    return;
  }
  const tagesweise = gespeichert.zeitart === 'tag';
  // Tagesweise Bereiche haben höchstens einen Eintrag pro Tag: vorhandenen öffnen statt neu anlegen.
  if (!eintragId && tagesweise) eintragId = (await eintragAmTag(gespeichert.id, vorgabeTag ?? datumText()))?.id;
  const eintrag = eintragId ? await holen(SPEICHER.eintraege, eintragId) : undefined;
  // Je aktiver Beschwerde eine Schmerzfrage; neue Optionen werden aber in der gespeicherten Konfiguration abgelegt.
  const bereich = gespeichert === BEISPIEL ? BEISPIEL : mitSchmerzfragen(gespeichert, await genesungLaden(), eintrag);
  if (eintragId && !eintrag) {
    ziel.innerHTML = `<section class="karte leer"><h2>Eintrag nicht gefunden</h2>
      <p>Er wurde vielleicht gelöscht.</p><a class="knopf" href="#/uebersicht">Zur Übersicht</a></section>`;
    return;
  }
  const herkunftsTag = (eintrag?.zeitpunkt ?? vorgabeTag ?? datumText()).slice(0, 10);
  const zurueck = (tag = herkunftsTag) => { location.hash = tagAdresse(tag); };
  // Wie oft jede Option vorkam, nur für die Reihenfolge der Suchtreffer. Erst nach dem Einblenden zählen:
  // Tausende Einträge zu lesen ließe die Seite am iPhone ruckeln.
  const nutzung = new Map();
  const hier = location.hash;
  setTimeout(async () => {
    if (location.hash !== hier || bereichId === 'beispiel') return;
    for (const [id, n] of idsZaehlen(await eintraegeVon(gespeichert.id))) nutzung.set(id, n);
  }, 450);
  formularAnzeigen(ziel, {
    bereich,
    eintrag,
    vorgabeTag,
    nutzung,
    // Im Suchfeld neu angelegte Einträge werden Teil der Konfiguration und damit der Sicherung.
    optionAnlegen: async (feld, titel) => {
      const basis = `eigen_${titel.toLocaleLowerCase('de').replace(/[^a-z0-9äöüß]+/g, '_').replace(/^_|_$/g, '') || 'eintrag'}`;
      let id = basis;
      for (let i = 2; (feld.optionen ?? []).some((o) => o.id === id); i += 1) id = `${basis}_${i}`;
      const option = { id, titel: titel.trim() };
      feld.optionen = [...(feld.optionen ?? []), option];
      if (bereich.id !== 'beispiel') await speichern(SPEICHER.config, gespeichert);
      return option;
    },
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
      if (tagesweise) {
        const vorhanden = await eintragAmTag(bereich.id, neu.zeitpunkt.slice(0, 10));
        if (vorhanden && vorhanden.id !== neu.id) {
          meldung('Für diesen Tag gibt es schon einen Eintrag.');
          return;
        }
      }
      await speichern(SPEICHER.eintraege, neu);
      meldung('Gesichert');
      zurueck(neu.zeitpunkt.slice(0, 10));
    },
    loeschen: async (alt) => {
      if (!confirm('Diesen Eintrag löschen?')) return;
      await loeschen(SPEICHER.eintraege, alt.id);
      meldung('Gelöscht');
      zurueck();
    },
  });
}

async function eintragAmTag(bereichId, tag) {
  const liste = await eintraegeZwischen(`${tag}T00:00`, `${tag}T23:59`);
  return liste.find((e) => e.bereich === bereichId);
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

const GUELTIGER_MONAT = /^\d{4}-\d{2}$/;

/** Seiten, die nur HTML liefern. */
const ANSICHTEN = {
  uebersicht: () => {
    const [, tag] = adresse();
    const gueltig = GUELTIGER_TAG.test(tag ?? '') && tag <= datumText() ? tag : datumText();
    return uebersicht(gueltig, speicherHinweis());
  },
  // #/kalender/JJJJ-MM/JJJJ-MM-TT: Monat und der Tag, von dem man kam
  kalender: () => {
    const [, monat, tag] = adresse();
    return kalender(GUELTIGER_MONAT.test(monat ?? '') ? monat : datumText().slice(0, 7), GUELTIGER_TAG.test(tag ?? '') ? tag : undefined);
  },
};

/** Seiten mit eigener Bedienung: #/einstellungen, …/personen[/id], …/listen[/bereich/feld] */
async function einstellungen(ziel) {
  const [, teil, a, b] = adresse();
  if (teil === 'personen' && a) return personBearbeiten(ziel, decodeURIComponent(a), { meldung });
  if (teil === 'personen') return personenListe(ziel);
  if (teil === 'listen' && a && b) return listeBearbeiten(ziel, a, b, { meldung });
  if (teil === 'listen') return listenUebersicht(ziel);
  return einstellungenAnzeigen(ziel, { meldung, dauerhaft });
}

const umgebung = { meldung, neuZeichnen: () => zeichnen() };

async function zeichnen() {
  const pfad = aktuellerPfad();
  const ohneTabs = inEingabe();
  if (updateWartet && !ohneTabs) { location.reload(); return; }
  document.body.classList.toggle('ohne-tabs', ohneTabs);
  tabsZeichnen(UNTERSEITEN.includes(pfad) ? 'uebersicht' : pfad);
  ansicht.onclick = null; // Seiten mit eigener Bedienung setzen ihn neu
  try {
    if (pfad === 'eintrag') await eingabe(ansicht);
    else if (pfad === 'genesung') await genesungAnzeigen(ansicht, adresse().slice(1), umgebung);
    else if (pfad === 'einstellungen') await einstellungen(ansicht);
    else if (pfad === 'auswertung') await auswertungAnzeigen(ansicht, adresse().slice(1));
    else ansicht.innerHTML = await ANSICHTEN[pfad]();
  } catch (fehler) {
    console.error(fehler);
    ansicht.innerHTML = `
      <section class="karte leer">
        <h2>Etwas ist schiefgelaufen</h2>
        <p>${esc(fehler.message ?? fehler)}</p>
      </section>`;
  }
  const r = richtung();
  if (r) window.scrollTo(0, 0);
  seiteEinblenden(ansicht, r);
}

function serviceWorkerStarten() {
  if (!('serviceWorker' in navigator)) return;
  // Nur neu laden, wenn eine neue Version eine bereits laufende ablöst,
  // und nie mitten in einer Eingabe, sonst ginge sie verloren.
  const hatteSteuerung = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hatteSteuerung) return;
    if (inEingabe()) updateWartet = true;
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
// Schnelleintrag einer Übung von der Übersicht
ansicht.addEventListener('click', (e) => {
  const k = e.target.closest('[data-schnell]');
  if (k) schnellEintrag(k.dataset.schnell, k.dataset.tag, umgebung);
});
// Wechselt das iPhone zwischen hell und dunkel, passt sich die Statusleiste an.
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => darstellungAnwenden());
darstellungAnwenden();

serviceWorkerStarten();
zeichnen();
dauerhaftAnfragen()
  .then((ok) => { dauerhaft = ok; if (aktuellerPfad() === 'uebersicht') zeichnen(); })
  .catch(() => { dauerhaft = false; });

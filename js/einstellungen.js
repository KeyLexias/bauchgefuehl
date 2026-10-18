// Einstellungen: Darstellung, Daten, Verwaltung von Personen und Listen, Infos zur App.
import { symbol } from './symbole.js';
import { anzahl, metaHolen, metaSetzen, SPEICHER } from './db.js';
import { esc } from './hilfen.js';
import { DARSTELLUNGEN, darstellungLesen, darstellungSetzen } from './darstellung.js';
import { datenAnzeigen } from './daten.js';

export const ERINNERUNG_STANDARD = 7;
const ERINNERUNG_STUFEN = [3, 7, 14, 30];
const zahl = new Intl.NumberFormat('de-AT');

export async function erinnerungTage() {
  return (await metaHolen('erinnerungTage')) ?? ERINNERUNG_STANDARD;
}

async function appInfo(dauerhaft) {
  let version = 'ohne Offline-Speicher';
  try {
    const name = (await caches.keys()).find((n) => n.startsWith('bauchgefuehl-'));
    if (name) version = name.replace('bauchgefuehl-', '');
  } catch { /* kein Offline-Speicher */ }
  let platz = '';
  try {
    const s = await navigator.storage?.estimate?.();
    if (s?.usage) platz = `${zahl.format(Math.round(s.usage / 1e5) / 10)} MB`;
  } catch { /* nicht verfügbar */ }
  return [
    ['Version', version],
    ['Speicher', dauerhaft === true ? 'vor automatischem Löschen geschützt' : dauerhaft === false ? 'nicht dauerhaft bestätigt, regelmäßig sichern' : 'wird geprüft'],
    platz ? ['Belegt', platz] : null,
  ].filter(Boolean);
}

/** Zeichnet die Einstellungen in `ziel`. */
export async function einstellungenAnzeigen(ziel, { meldung, dauerhaft }) {
  const darstellung = darstellungLesen();
  const tage = await erinnerungTage();
  const [personen, info] = await Promise.all([anzahl(SPEICHER.personen), appInfo(dauerhaft)]);

  ziel.innerHTML = `
    <a class="zurueck-link" href="#/uebersicht">${symbol('zurueck', 20)}Übersicht</a>
    <header class="kopf"><h1>Einstellungen</h1></header>

    <section class="abschnitt">
      <h2>Darstellung</h2>
      <div class="karte daten-karte" style="--farbe: var(--schlaf)">
        <div class="stufen segment" style="--spalten:3" role="radiogroup" aria-label="Darstellung">
          ${DARSTELLUNGEN.map((d) => `<button type="button" class="wahl stufe" role="radio" data-darstellung="${d.id}"
            aria-pressed="${d.id === darstellung}" aria-checked="${d.id === darstellung}">${d.titel}</button>`).join('')}
        </div>
        <p class="fussnote links">Automatisch folgt der Einstellung des iPhones. Gilt nur für dieses Gerät.</p>
      </div>
    </section>

    <div data-daten></div>

    <section class="abschnitt">
      <h2>Erinnerung ans Sichern</h2>
      <div class="karte daten-karte" style="--farbe: var(--schlaf)">
        <div class="stufen segment" style="--spalten:${ERINNERUNG_STUFEN.length}" role="radiogroup" aria-label="Erinnerung nach Tagen">
          ${ERINNERUNG_STUFEN.map((t) => `<button type="button" class="wahl stufe" role="radio" data-erinnerung="${t}"
            aria-pressed="${t === tage}" aria-checked="${t === tage}">${t} Tage</button>`).join('')}
        </div>
        <p class="fussnote links">So lange nach der letzten Sicherung erscheint der Hinweis auf der Übersicht.</p>
      </div>
    </section>

    <section class="abschnitt">
      <h2>Verwalten</h2>
      <div class="karte liste-links">
        <a href="#/einstellungen/personen" style="--farbe: var(--aktivitaet)">
          <span class="symbol-klein">${symbol('person', 20)}</span>
          <span><strong>Personen</strong><span>${zahl.format(personen)} · umbenennen, zusammenführen, ausblenden</span></span>
          ${symbol('weiter', 18)}
        </a>
        <a href="#/einstellungen/listen" style="--farbe: var(--magen)">
          <span class="symbol-klein">${symbol('stift', 20)}</span>
          <span><strong>Listen und Optionen</strong><span>umbenennen, ausblenden, eigene anlegen</span></span>
          ${symbol('weiter', 18)}
        </a>
      </div>
    </section>

    <section class="abschnitt">
      <h2>Über die App</h2>
      <div class="karte info">
        ${info.map(([k, v]) => `<div><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('')}
        <div><span>Daten</span><span>nur auf diesem Gerät, keine Übertragung</span></div>
      </div>
      <a class="textlink" href="#/eintrag/beispiel">Beispiel-Eingabe ansehen</a>
    </section>`;

  await datenAnzeigen(ziel.querySelector('[data-daten]'), { meldung, eingebettet: true });

  ziel.querySelector('[aria-label="Darstellung"]').addEventListener('click', (e) => {
    const knopf = e.target.closest('[data-darstellung]');
    if (!knopf) return;
    darstellungSetzen(knopf.dataset.darstellung);
    for (const b of ziel.querySelectorAll('[data-darstellung]')) {
      const an = b === knopf;
      b.setAttribute('aria-pressed', an);
      b.setAttribute('aria-checked', an);
    }
  });

  ziel.querySelector('[aria-label="Erinnerung nach Tagen"]').addEventListener('click', async (e) => {
    const knopf = e.target.closest('[data-erinnerung]');
    if (!knopf) return;
    await metaSetzen('erinnerungTage', Number(knopf.dataset.erinnerung));
    for (const b of ziel.querySelectorAll('[data-erinnerung]')) {
      const an = b === knopf;
      b.setAttribute('aria-pressed', an);
      b.setAttribute('aria-checked', an);
    }
    meldung(`Erinnerung nach ${knopf.dataset.erinnerung} Tagen`);
  });
}

// Personen verwalten: umbenennen, ausblenden, zusammenführen, unbenutzte löschen.
import { symbol } from './symbole.js';
import { alle, holen, speichern, loeschen, vieleSpeichern, SPEICHER } from './db.js';
import { esc, initialen, farbeVon, idsZaehlen } from './hilfen.js';

const zahl = new Intl.NumberFormat('de-AT');
const norm = (t) => String(t ?? '').trim().toLocaleLowerCase('de');

function avatar(p, klein = false) {
  return `<span class="avatar ${klein ? 'klein' : ''}" style="background:${esc(p.farbe ?? farbeVon(p.name))}">${esc(initialen(p.name))}</span>`;
}

function eintraegeText(n) {
  return n === 1 ? '1 Eintrag' : `${zahl.format(n)} Einträge`;
}

/** Ersetzt in allen Personenlisten der Einträge eine Id durch eine andere. Liefert die geänderten Einträge. */
function idErsetzen(eintraege, von, nach) {
  const geaendert = [];
  const ersetzen = (wert) => {
    if (Array.isArray(wert)) {
      if (!wert.includes(von)) return { wert, anders: false };
      return { wert: [...new Set(wert.map((x) => (x === von ? nach : x)))], anders: true };
    }
    if (wert && typeof wert === 'object') {
      let anders = false;
      const neu = {};
      for (const [k, v] of Object.entries(wert)) {
        const r = ersetzen(v);
        neu[k] = r.wert;
        anders ||= r.anders;
      }
      return { wert: neu, anders };
    }
    return { wert, anders: false };
  };
  for (const e of eintraege) {
    const r = ersetzen(e.werte);
    if (r.anders) geaendert.push({ ...e, werte: r.wert, geaendert: new Date().toISOString() });
  }
  return geaendert;
}

/** Liste aller Personen mit Suche. */
export async function personenListe(ziel) {
  const [personen, eintraege] = await Promise.all([alle(SPEICHER.personen), alle(SPEICHER.eintraege)]);
  const nutzung = idsZaehlen(eintraege);
  personen.sort((a, b) => a.name.localeCompare(b.name, 'de'));

  const zeile = (p) => `
    <a class="person-zeile" href="#/einstellungen/personen/${esc(p.id)}" data-name="${esc(norm(p.name))}">
      ${avatar(p)}
      <span><strong>${esc(p.name)}</strong><span>${eintraegeText(nutzung.get(p.id) ?? 0)}${p.ausgeblendet ? ' · ausgeblendet' : ''}</span></span>
      ${symbol('weiter', 18)}
    </a>`;

  ziel.innerHTML = `
    <a class="zurueck-link" href="#/einstellungen">${symbol('zurueck', 20)}Einstellungen</a>
    <header class="kopf"><h1>Personen</h1></header>
    <p class="fussnote links">Ausgeblendete Personen erscheinen nicht mehr in der Suche, alte Einträge bleiben.
      Zusammenführen hilft bei doppelten Namen.</p>
    <label class="suche-eingabe" style="--farbe: var(--aktivitaet)">${symbol('suche', 18)}
      <input type="search" placeholder="${zahl.format(personen.length)} Personen durchsuchen" data-filter autocomplete="off" aria-label="Personen durchsuchen">
    </label>
    <div class="karte personen-liste" style="--farbe: var(--aktivitaet)">
      ${personen.map(zeile).join('') || '<p class="fussnote">Noch keine Personen.</p>'}
    </div>`;

  ziel.querySelector('[data-filter]').addEventListener('input', (e) => {
    const q = norm(e.target.value);
    for (const z of ziel.querySelectorAll('.person-zeile')) z.hidden = q && !z.dataset.name.includes(q);
  });
}

/** Einzelne Person bearbeiten. */
export async function personBearbeiten(ziel, id, { meldung }) {
  const [person, personen, eintraege] = await Promise.all([holen(SPEICHER.personen, id), alle(SPEICHER.personen), alle(SPEICHER.eintraege)]);
  if (!person) {
    ziel.innerHTML = `<a class="zurueck-link" href="#/einstellungen/personen">${symbol('zurueck', 20)}Personen</a>
      <section class="karte leer"><h2>Person nicht gefunden</h2></section>`;
    return;
  }
  const nutzung = idsZaehlen(eintraege);
  const anzahl = nutzung.get(person.id) ?? 0;
  const andere = personen.filter((p) => p.id !== person.id).sort((a, b) => a.name.localeCompare(b.name, 'de'));

  ziel.innerHTML = `
    <a class="zurueck-link" href="#/einstellungen/personen">${symbol('zurueck', 20)}Personen</a>
    <header class="person-kopf" style="--farbe: var(--aktivitaet)">
      ${avatar(person)}
      <div><h1>${esc(person.name)}</h1><p>${eintraegeText(anzahl)}</p></div>
    </header>

    <section class="abschnitt" style="--farbe: var(--aktivitaet)">
      <h2>Name</h2>
      <form class="karte daten-karte" data-umbenennen>
        <input class="eingabe-feld rand" name="name" value="${esc(person.name)}" autocomplete="off" aria-label="Name">
        <button type="submit" class="knopf">Umbenennen</button>
      </form>
    </section>

    <section class="abschnitt" style="--farbe: var(--aktivitaet)">
      <h2>In der Suche</h2>
      <div class="karte daten-karte">
        <div class="stufen segment" style="--spalten:2">
          <button type="button" class="wahl stufe" data-sichtbar="ja" aria-pressed="${!person.ausgeblendet}">Anbieten</button>
          <button type="button" class="wahl stufe" data-sichtbar="nein" aria-pressed="${!!person.ausgeblendet}">Ausblenden</button>
        </div>
      </div>
    </section>

    <section class="abschnitt" style="--farbe: var(--aktivitaet)">
      <h2>Zusammenführen</h2>
      <div class="karte daten-karte">
        <p class="fussnote links">Wähle die Person, in die ${esc(person.name)} aufgehen soll. Alle Einträge zeigen danach diese Person,
          ${esc(person.name)} wird gelöscht.</p>
        <label class="suche-eingabe rand">${symbol('suche', 18)}
          <input type="search" data-ziel-suche placeholder="Ziel-Person suchen" autocomplete="off" aria-label="Ziel-Person suchen">
        </label>
        <div class="suche-treffer" data-ziel-treffer></div>
      </div>
    </section>

    ${anzahl === 0 ? `
    <section class="abschnitt">
      <button type="button" class="knopf gefahr breit" data-loeschen>${symbol('muell', 20)}Person löschen</button>
      <p class="fussnote links">Nur möglich, weil kein Eintrag diese Person verwendet.</p>
    </section>` : ''}`;

  ziel.querySelector('[data-umbenennen]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = e.target.elements.name.value.trim();
    if (!name || name === person.name) return;
    const doppelt = andere.find((p) => norm(p.name) === norm(name));
    if (doppelt && !confirm(`„${doppelt.name}" gibt es schon. Trotzdem umbenennen? Zum Vereinen „Zusammenführen" nutzen.`)) return;
    await speichern(SPEICHER.personen, { ...person, name });
    meldung('Umbenannt');
    await personBearbeiten(ziel, id, { meldung });
  });

  ziel.querySelectorAll('[data-sichtbar]').forEach((b) => b.addEventListener('click', async () => {
    const ausgeblendet = b.dataset.sichtbar === 'nein';
    await speichern(SPEICHER.personen, { ...person, ausgeblendet });
    meldung(ausgeblendet ? 'Ausgeblendet' : 'Wird wieder angeboten');
    await personBearbeiten(ziel, id, { meldung });
  }));

  const treffer = ziel.querySelector('[data-ziel-treffer]');
  ziel.querySelector('[data-ziel-suche]').addEventListener('input', (e) => {
    const q = norm(e.target.value);
    treffer.innerHTML = q ? andere.filter((p) => norm(p.name).includes(q))
      .sort((a, b) => (nutzung.get(b.id) ?? 0) - (nutzung.get(a.id) ?? 0))
      .slice(0, 8)
      .map((p) => `<button type="button" class="treffer" data-ziel="${esc(p.id)}">${avatar(p, true)}<span>${esc(p.name)}</span>
        <span class="treffer-zahl">${eintraegeText(nutzung.get(p.id) ?? 0)}</span></button>`).join('') : '';
  });
  treffer.addEventListener('click', async (e) => {
    const knopf = e.target.closest('[data-ziel]');
    if (!knopf) return;
    const zielPerson = andere.find((p) => p.id === knopf.dataset.ziel);
    if (!confirm(`„${person.name}" in „${zielPerson.name}" zusammenführen? ${eintraegeText(anzahl)} zeigen danach „${zielPerson.name}". „${person.name}" wird gelöscht.`)) return;
    const geaendert = idErsetzen(eintraege, person.id, zielPerson.id);
    await vieleSpeichern({ eintraege: geaendert });
    await loeschen(SPEICHER.personen, person.id);
    meldung('Zusammengeführt');
    location.hash = `#/einstellungen/personen/${zielPerson.id}`;
  });

  ziel.querySelector('[data-loeschen]')?.addEventListener('click', async () => {
    if (!confirm(`„${person.name}" löschen?`)) return;
    await loeschen(SPEICHER.personen, person.id);
    meldung('Gelöscht');
    location.hash = '#/einstellungen/personen';
  });
}

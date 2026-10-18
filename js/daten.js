// Daten-Seite: Sichern, Wiederherstellen, CSV-Export und -Import.
import { symbol } from './symbole.js';
import { alle, anzahl, metaHolen, SPEICHER } from './db.js';
import { esc } from './hilfen.js';
import { kopf } from './uebersicht.js';
import {
  SICHERUNG_DATEI, sicherungErstellen, csvDateienErstellen, teilen, sicherungVermerken,
  dateiPruefen, einspielen, csvImportieren,
} from './sicherung.js';

const fmtDatum = new Intl.DateTimeFormat('de-AT', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const zahl = new Intl.NumberFormat('de-AT');

function letzteSicherungText(iso) {
  if (!iso) return 'Noch keine Sicherung';
  const tage = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  const wann = tage <= 0 ? 'heute' : tage === 1 ? 'gestern' : `vor ${tage} Tagen`;
  return `Letzte Sicherung ${wann} (${fmtDatum.format(new Date(iso))})`;
}

function berichtHtml(b) {
  const zeilen = b.dateien.map((d) => {
    if (d.uebersprungen) return `<li><strong>${esc(d.name)}</strong>: übersprungen, ${esc(d.uebersprungen)}</li>`;
    const teile = [`${zahl.format(d.neu)} neu`];
    if (d.doppelt) teile.push(`${zahl.format(d.doppelt)} schon vorhanden`);
    if (d.zusammengefuehrt) teile.push(`${zahl.format(d.zusammengefuehrt)} mit vorhandenem Tag zusammengeführt`);
    if (d.fehler.length) teile.push(`${d.fehler.length} Zeilen nicht lesbar`);
    const fehler = d.fehler.length ? `<br><span class="klein">${esc(d.fehler.slice(0, 3).join(' · '))}${d.fehler.length > 3 ? ' …' : ''}</span>` : '';
    return `<li><strong>${esc(d.name)}</strong> → ${esc(d.bereich)}: ${teile.join(', ')}${fehler}</li>`;
  }).join('');
  const kurz = (liste, n = 12) => `${liste.slice(0, n).join(', ')}${liste.length > n ? ` und ${zahl.format(liste.length - n)} weitere` : ''}`;
  const personen = b.neuePersonen.length ? `<p>${zahl.format(b.neuePersonen.length)} neue Personen: ${esc(kurz(b.neuePersonen))}</p>` : '';
  const optionen = b.neueOptionen.length
    ? `<p>${zahl.format(b.neueOptionen.length)} unbekannte Werte als ausgeblendete Optionen übernommen: ${esc(kurz(b.neueOptionen, 20))}</p>`
    : '';
  return `<ul>${zeilen}</ul>${personen}${optionen}`;
}

/** Zeichnet die Daten-Seite in `ziel` und hängt die Bedienung an. */
export async function datenAnzeigen(ziel, { meldung, speicherHinweis = '' }) {
  const [eintraege, personen, bereiche, letzte] = await Promise.all([
    anzahl(SPEICHER.eintraege), anzahl(SPEICHER.personen), alle(SPEICHER.config), metaHolen('letzteSicherung'),
  ]);
  const eingerichtet = bereiche.length > 0;

  ziel.innerHTML = `
    <a class="zurueck-link" href="#/uebersicht">${symbol('zurueck', 20)}Übersicht</a>
    ${kopf('Daten')}

    <section class="abschnitt">
      <h2>Sicherung</h2>
      <div class="karte daten-karte" style="--farbe: var(--schlaf)">
        <p class="daten-stand"><strong>${esc(letzteSicherungText(letzte))}</strong><br>
          ${zahl.format(eintraege)} Einträge, ${zahl.format(personen)} Personen</p>
        <button type="button" class="knopf haupt" data-aktion="sichern" ${eingerichtet ? '' : 'disabled'}>${symbol('sichern', 20)}Alles sichern</button>
        <p class="fussnote links">Erzeugt <code>${SICHERUNG_DATEI}</code>. Im Teilen-Dialog „In Dateien sichern" wählen,
          in iCloud Drive den Ordner Bauchgefuehl öffnen und die alte Datei ersetzen.</p>
      </div>
    </section>

    <section class="abschnitt">
      <h2>Wiederherstellen</h2>
      <div class="karte daten-karte" style="--farbe: var(--schlaf)">
        <label class="knopf ${eingerichtet ? '' : 'haupt'}">
          ${symbol('wiederherstellen', 20)}Datei wählen
          <input type="file" accept=".json,application/json" data-aktion="wiederherstellen" hidden>
        </label>
        <p class="fussnote links">Eine Sicherung ersetzt alle Daten auf diesem Gerät. Eine Startdatei ersetzt nur Fragen
          und Auswahllisten, Einträge bleiben.</p>
      </div>
    </section>

    <section class="abschnitt">
      <h2>CSV</h2>
      <div class="karte daten-karte" style="--farbe: var(--aktivitaet)">
        <button type="button" class="knopf" data-aktion="csv-export" ${eintraege ? '' : 'disabled'}>${symbol('sichern', 20)}CSV exportieren</button>
        <label class="knopf ${eingerichtet ? '' : 'gesperrt'}">
          ${symbol('wiederherstellen', 20)}CSV importieren
          <input type="file" accept=".csv,text/csv,text/plain" multiple data-aktion="csv-import" hidden ${eingerichtet ? '' : 'disabled'}>
        </label>
        <p class="fussnote links">Eine Datei je Bereich, für Numbers und Auswertungen. Beim Import mehrere Dateien auf einmal
          wählen, auch Altdaten aus dem Ordner Import. Schon vorhandene Zeilen werden übersprungen.</p>
        ${eingerichtet ? '' : '<p class="fussnote links">Zuerst die Startdatei einspielen, dann CSV importieren.</p>'}
      </div>
      <div class="karte bericht" data-bericht hidden aria-live="polite"></div>
    </section>
    ${speicherHinweis}`;

  // Dateien vorbereiten, damit der Teilen-Dialog direkt aus dem Tipp heraus öffnen kann.
  const sicherung = eingerichtet ? await sicherungErstellen() : null;
  const csvDateien = eintraege ? await csvDateienErstellen() : [];

  const neuLaden = () => datenAnzeigen(ziel, { meldung, speicherHinweis });
  const bericht = ziel.querySelector('[data-bericht]');

  ziel.querySelector('[data-aktion="sichern"]')?.addEventListener('click', async (e) => {
    if (!sicherung) return;
    const knopf = e.currentTarget;
    knopf.disabled = true;
    try {
      const ergebnis = await teilen([sicherung.datei]);
      if (ergebnis !== 'abgebrochen') {
        await sicherungVermerken(sicherung.daten.erstellt);
        meldung(ergebnis === 'geteilt' ? 'Sicherung erstellt' : 'Sicherung heruntergeladen');
        await neuLaden();
      }
    } catch (fehler) {
      meldung(`Sichern fehlgeschlagen: ${fehler.message}`);
    } finally {
      knopf.disabled = false;
    }
  });

  ziel.querySelector('[data-aktion="csv-export"]')?.addEventListener('click', async () => {
    try {
      const ergebnis = await teilen(csvDateien);
      if (ergebnis !== 'abgebrochen') meldung(`${csvDateien.length} CSV-Dateien ${ergebnis === 'geteilt' ? 'erstellt' : 'heruntergeladen'}`);
    } catch (fehler) {
      meldung(`Export fehlgeschlagen: ${fehler.message}`);
    }
  });

  ziel.querySelector('[data-aktion="wiederherstellen"]').addEventListener('change', async (e) => {
    const datei = e.target.files?.[0];
    e.target.value = '';
    if (!datei) return;
    try {
      const geprueft = await dateiPruefen(datei);
      const { daten, nurKonfiguration } = geprueft;
      const frage = nurKonfiguration
        ? `Startdatei mit ${daten.config.length} Bereichen einspielen? Fragen und Auswahllisten werden ersetzt, deine ${zahl.format(eintraege)} Einträge bleiben.`
        : `Sicherung vom ${fmtDatum.format(new Date(daten.erstellt ?? Date.now()))} mit ${zahl.format(daten.eintraege.length)} Einträgen einspielen? `
          + `Alle Daten auf diesem Gerät (${zahl.format(eintraege)} Einträge) werden dadurch ersetzt.`;
      if (!confirm(frage)) return;
      await einspielen(geprueft);
      meldung(nurKonfiguration ? 'Startdatei eingespielt' : 'Sicherung eingespielt');
      await neuLaden();
    } catch (fehler) {
      meldung(fehler.message);
    }
  });

  ziel.querySelector('[data-aktion="csv-import"]').addEventListener('change', async (e) => {
    const dateien = [...(e.target.files ?? [])];
    e.target.value = '';
    if (!dateien.length) return;
    bericht.hidden = false;
    bericht.innerHTML = '<p>Importiere …</p>';
    try {
      const ergebnis = await csvImportieren(dateien);
      await neuLaden();
      const neu = ziel.querySelector('[data-bericht]');
      neu.hidden = false;
      neu.innerHTML = `<h3>Import abgeschlossen</h3>${berichtHtml(ergebnis)}`;
      neu.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (fehler) {
      bericht.innerHTML = `<h3>Import fehlgeschlagen</h3><p>${esc(fehler.message)}</p><p>Es wurde nichts gespeichert.</p>`;
    }
  });
}

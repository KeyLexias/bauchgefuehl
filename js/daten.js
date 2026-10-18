// Daten-Seite: Sichern, Wiederherstellen, CSV-Export und -Import.
import { symbol } from './symbole.js';
import { alle, anzahl, metaHolen, SPEICHER } from './db.js';
import { esc } from './hilfen.js';
import { kopf } from './uebersicht.js';
import {
  SICHERUNG_DATEI, sicherungErstellen, csvDateienErstellen, teilen, sicherungVermerken,
  dateiPruefen, einspielen, csvImportieren,
} from './sicherung.js';
import { healthLesen, healthSpeichern } from './health-import.js';

const fmtDatum = new Intl.DateTimeFormat('de-AT', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const zahl = new Intl.NumberFormat('de-AT');
const fmtTag = new Intl.DateTimeFormat('de-AT', { day: 'numeric', month: 'short', year: 'numeric' });
const tagText = (t) => (t ? fmtTag.format(new Date(`${t}T12:00`)) : '–');

function healthStandText(b) {
  if (!b) return 'Noch kein Health-Import';
  return `Letzter Import ${fmtDatum.format(new Date(b.zeitpunkt))}${b.exportDatum ? `, Export vom ${tagText(b.exportDatum.slice(0, 10))}` : ''}`;
}

function healthBerichtHtml(b, sekunden) {
  const zeilen = [
    `${zahl.format(b.tage)} Tage von ${tagText(b.von)} bis ${tagText(b.bis)}`,
    `${zahl.format(b.naechte)} Nächte mit Schlafdaten`,
    `${zahl.format(b.ernaehrung)} Tage mit Ernährung, ${zahl.format(b.mahlzeiten)} Mahlzeiten mit Lebensmitteln`,
    `${zahl.format(b.trainings)} Trainings`,
  ];
  return `<h3>Health-Import abgeschlossen</h3><ul>${zeilen.map((z) => `<li>${esc(z)}</li>`).join('')}</ul>
    ${b.ohneErnaehrung ? '<p>Lebensmittel nicht übernommen: Der Bereich Ernährung fehlt. Zuerst die Startdatei einspielen.</p>' : ''}
    <p>Health-Daten dieser Tage wurden ersetzt${sekunden ? `, Dauer ${zahl.format(sekunden)} s` : ''}. Zu sehen in der Auswertung.</p>`;
}

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
export async function datenAnzeigen(ziel, { meldung, speicherHinweis = '', eingebettet = false }) {
  const [eintraege, personen, bereiche, letzte, healthTage, healthImport] = await Promise.all([
    anzahl(SPEICHER.eintraege), anzahl(SPEICHER.personen), alle(SPEICHER.config), metaHolen('letzteSicherung'),
    anzahl(SPEICHER.health), metaHolen('letzterHealthImport'),
  ]);
  const eingerichtet = bereiche.length > 0;

  ziel.innerHTML = `
    ${eingebettet ? '' : `<a class="zurueck-link" href="#/uebersicht">${symbol('zurueck', 20)}Übersicht</a>${kopf('Daten')}`}

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
        <p class="fussnote links">Eine Sicherung ersetzt alle Daten auf diesem Gerät. Eine Startdatei erneuert nur Fragen
          und Auswahllisten, Einträge und selbst angelegte Einträge in Listen bleiben.</p>
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

    <section class="abschnitt">
      <h2>Apple Health</h2>
      <div class="karte daten-karte" style="--farbe: var(--ernaehrung)">
        <p class="daten-stand"><strong>${esc(healthStandText(healthImport))}</strong><br>
          ${zahl.format(healthTage)} Tage mit Health-Daten</p>
        <label class="knopf" data-health-knopf>
          ${symbol('wiederherstellen', 20)}Health-Export wählen
          <input type="file" accept=".zip,application/zip" data-aktion="health-import" hidden>
        </label>
        <div class="fortschritt" data-health-fortschritt hidden>
          <div class="fortschritt-spur"><i></i></div>
          <span aria-live="polite">Lese …</span>
        </div>
        <p class="fussnote links">In der Health-App aufs Profilbild tippen, „Alle Gesundheitsdaten exportieren", die Datei
          <code>export.zip</code> in Dateien sichern und hier wählen. Übernommen werden nur Tageswerte: Ernährung mit
          Lebensmitteln, Schlaf, Herz- und Nachtwerte, Bewegung und Trainings. Jeder Import ersetzt die Health-Daten der
          enthaltenen Tage.</p>
      </div>
      <div class="karte bericht" data-health-bericht hidden aria-live="polite"></div>
    </section>
    ${speicherHinweis}`;

  // Dateien vorbereiten, damit der Teilen-Dialog direkt aus dem Tipp heraus öffnen kann.
  const sicherung = eingerichtet ? await sicherungErstellen() : null;
  const csvDateien = eintraege ? await csvDateienErstellen() : [];

  const neuLaden = () => datenAnzeigen(ziel, { meldung, speicherHinweis, eingebettet });
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
        ? `Startdatei mit ${daten.config.length} Bereichen einspielen? Fragen und Auswahllisten werden erneuert, deine ${zahl.format(eintraege)} Einträge bleiben.`
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

  ziel.querySelector('[data-aktion="health-import"]').addEventListener('change', async (e) => {
    const datei = e.target.files?.[0];
    e.target.value = '';
    if (!datei) return;
    const knopf = ziel.querySelector('[data-health-knopf]');
    const anzeige = ziel.querySelector('[data-health-fortschritt]');
    const healthBericht = ziel.querySelector('[data-health-bericht]');
    const balken = anzeige.querySelector('i');
    const text = anzeige.querySelector('span');
    knopf.classList.add('gesperrt');
    anzeige.hidden = false;
    healthBericht.hidden = true;
    const beginn = performance.now();
    try {
      const gelesen = await healthLesen(datei, {
        fortschritt: (anteil) => {
          balken.style.width = `${Math.round(anteil * 100)}%`;
          text.textContent = `Lese Export … ${Math.round(anteil * 100)} %`;
        },
      });
      text.textContent = 'Speichere …';
      const ergebnis = await healthSpeichern(gelesen);
      await neuLaden();
      const neu = ziel.querySelector('[data-health-bericht]');
      neu.hidden = false;
      neu.innerHTML = healthBerichtHtml(ergebnis, Math.round((performance.now() - beginn) / 1000));
      neu.scrollIntoView({ behavior: 'smooth', block: 'start' });
      meldung('Health-Daten übernommen');
    } catch (fehler) {
      anzeige.hidden = true;
      knopf.classList.remove('gesperrt');
      healthBericht.hidden = false;
      healthBericht.innerHTML = `<h3>Health-Import fehlgeschlagen</h3><p>${esc(fehler.message)}</p><p>Es wurde nichts gespeichert.</p>`;
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

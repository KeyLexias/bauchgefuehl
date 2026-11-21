// Auswertung: Zeitraum wählen, Verläufe und Häufigkeiten je Bereich, Zusammenhänge als Hinweise, Arztbericht.
// Die Ansichten kennen Bereiche und Rollen, nie konkrete Fragen oder Optionen.
import { symbol } from './symbole.js';
import { BEREICHE, alleFelder } from './konfiguration.js';
import { esc, alsDatum, tageVerschieben, datumText } from './hilfen.js';
import { metaSetzen, neueId } from './db.js';
import { sheetOeffnen } from './uebung-eingabe.js';
import { kopf } from './uebersicht.js';
import { linie, balken, raster, vergleich, zahl, prozent, stufenDeckkraft } from './diagramme.js';
import {
  ZEITRAEUME, VERLAUF_ROLLEN, MINDEST_TAGE, auswertungLaden, zeitraum, eintraegeIm, verlauf, kennzahl, messreihen, schmerzReihen,
  bereichStatistik, optionsZeilen, warnzeichen, symptomFelder, ergebnisse, sondertagPruefer, essensMerkmale, wortMerkmal,
  tagesMerkmale, anteilVergleich, wertVergleich, tagesWert, tageszeitEintrag, zaehlt, erfassteTage, TAGESZEIT_SPALTEN, titelVon, feldTitel, abschnitte,
  HEALTH_WERTE, healthWertAm, healthHat, healthIm, uhrMinuten, uhrText, schnitt, beschwerdefrei,
} from './auswertung-daten.js';
import { trainingsName, QUELLE as HEALTH_QUELLE } from './health-import.js';
import { uebungsEintraege, termine, umrechnen, wertAnzeige, STATUS, erfuellung, spanneText } from './genesung-daten.js';
import { arztbericht } from './arztbericht.js';

// Weitere Ansichten, unten eingeklappt. Die Seite selbst zeigt oben die Abschnitte in fester Reihenfolge.
export const ANSICHTEN = [
  { id: 'ueberblick', titel: 'Zeitstrahl und besondere Tage', sym: 'auswertung' },
  { id: 'ausloeser', titel: 'Auslöser', sym: 'magen' },
  { id: 'ernaehrung', titel: 'Ernährung', sym: 'ernaehrung' },
  { id: 'schlaf', titel: 'Schlaf im Detail', bereiche: ['schlaf'], sym: 'schlaf' },
  { id: 'tag', titel: 'Tag und Leute', bereiche: ['aktivitaeten'], sym: 'aktivitaet' },
];
const BAUCH = { id: 'bauch', titel: 'Bauch & Verdauung', bereiche: ['magen', 'stuhlgang'], sym: 'magen' };

// Bleibt beim Wechsel zwischen Tabs erhalten. offen: aufgeklappte Abschnitte.
const zustand = { zeitraum: '90', versatz: 0, sondertage: true, ziel: null, wort: '', offen: new Set() };

const fmtLang = new Intl.DateTimeFormat('de-AT', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtKurz = new Intl.DateTimeFormat('de-AT', { day: 'numeric', month: 'numeric' });
const tagLang = (t) => fmtLang.format(alsDatum(t));
const tagKurz = (t) => fmtKurz.format(alsDatum(t));
const farbeVon = (bereichId) => `var(${BEREICHE[bereichId]?.farbe ?? '--schlaf'})`;
const tageText = (n) => (n === 1 ? '1 Tag' : `${zahl(n, 0)} Tage`);
const tagen = (n) => (n === 1 ? '1 Tag' : `${zahl(n, 0)} Tagen`); // nach „an“, „von“

function karte(farbe, titel, inhalt, { unter = '', sym, klasse = '' } = {}) {
  return `
    <section class="karte auswertung-karte ${klasse}" style="--farbe: ${farbe}">
      <div class="karte-kopf">${sym ? `<span class="symbol-klein">${symbol(sym, 18)}</span>` : ''}<h2>${esc(titel)}</h2></div>
      ${unter ? `<p class="karte-unter">${unter}</p>` : ''}
      ${inhalt}
    </section>`;
}

const leerKarte = (text) => `<section class="karte leer"><p>${esc(text)}</p></section>`;

const abschnitt = (titel, inhalt, unter = '') => (inhalt ? `
  <section class="abschnitt auswertung-abschnitt">
    <h2>${esc(titel)}</h2>${unter ? `<p class="abschnitt-unter">${unter}</p>` : ''}
    ${inhalt}
  </section>` : '');

/** Eingeklappter Abschnitt; der Inhalt wird erst beim Aufklappen berechnet. */
function klappe(a, k, z) {
  const offen = zustand.offen.has(a.id);
  return `
    <details class="klappe karte" data-teil="${a.id}" ${offen ? 'open' : ''}>
      <summary><span class="symbol-klein">${symbol(a.sym, 18)}</span><strong>${esc(a.titel)}</strong><span class="anzeigen"></span></summary>
      <div class="klappe-inhalt">${offen ? teilInhalt(a.id, k, z) : ''}</div>
    </details>`;
}

function teilInhalt(id, k, z) {
  const a = ANSICHTEN.find((x) => x.id === id) ?? (id === BAUCH.id ? BAUCH : null);
  if (!a) return '';
  if (id === 'bauch') return bauchTeil(k, z);
  return ({ ueberblick, schlaf: bereichsAnsicht, tag: bereichsAnsicht, ausloeser, ernaehrung })[id](k, z, a);
}

/** Zeichnet die Auswertung. teile: [ansicht, zeitraum] aus der Adresse (ansicht öffnet den passenden Abschnitt). */
export async function auswertungAnzeigen(ziel, teile) {
  const [ansicht, zr] = teile;
  if (ANSICHTEN.some((a) => a.id === ansicht) || ansicht === BAUCH.id) zustand.offen.add(ansicht);
  if (ZEITRAEUME.some((z) => z.id === zr)) zustand.zeitraum = zr;
  const k = await auswertungLaden();

  if (!k.eintraege.length) {
    ziel.innerHTML = `${kopf('Auswertung')}
      <section class="karte leer" style="--farbe: var(--schlaf)">
        <span class="symbol-gross">${symbol('auswertung', 28)}</span>
        <h2>Noch keine Einträge</h2>
        <p>Sobald du etwas einträgst oder eine Sicherung einspielst, erscheinen hier Verläufe und Zusammenhänge.</p>
      </section>`;
    return;
  }

  ziel.innerHTML = `
    <div class="auswertung" data-auswertung>
      ${kopf('Auswertung')}
      <div data-oben></div>
      <div class="zeitraum-wahl" role="group" aria-label="Zeitraum">
        ${ZEITRAEUME.map((z) => `<button type="button" data-zeitraum="${z.id}">${esc(z.titel)}</button>`).join('')}
      </div>
      <p class="zeitraum-text" data-zeitraum-text></p>
      <div class="auswertung-inhalt" data-inhalt></div>
    </div>`;
  const wurzel = ziel.querySelector('[data-auswertung]');
  const inhalt = wurzel.querySelector('[data-inhalt]');

  // Wochenbilanz und Experimente haben feste Zeiträume und stehen über der Zeitraum-Wahl.
  const obenZeichnen = () => {
    wurzel.querySelector('[data-oben]').innerHTML = wochenbilanz(k);
  };

  const zeichnen = () => {
    history.replaceState(null, '', `#/auswertung/seite/${zustand.zeitraum}`);
    for (const b of wurzel.querySelectorAll('[data-zeitraum]')) b.setAttribute('aria-pressed', String(b.dataset.zeitraum === zustand.zeitraum));
    const z = zeitraum(k, zustand.zeitraum);
    wurzel.querySelector('[data-zeitraum-text]').textContent = `${tagLang(z.von)} bis ${tagLang(z.bis)} · ${tageText(z.tage)} · gilt für alles darunter`;
    inhalt.innerHTML = [
      abschnitt('Genesung', genesung(k, z)),
      abschnitt('Was hängt zusammen?', zusammenhaenge(k, z)),
      abschnitt('Experimente', experimente(k), 'Je 14 Tage vor und ab dem Start, unabhängig vom Zeitraum oben.'),
      abschnitt('Schlaf', schlafTeil(k, z)),
      `<section class="abschnitt auswertung-abschnitt">${klappe(BAUCH, k, z)}</section>`,
      `<section class="abschnitt auswertung-abschnitt">
        <button type="button" class="knopf haupt breit" data-bericht style="--farbe: var(--magen)">${symbol('arzt', 20)}Zusammenfassung für Arzttermin</button>
      </section>`,
      `<section class="abschnitt auswertung-abschnitt"><h2>Mehr Details</h2>${ANSICHTEN.map((a) => klappe(a, k, z)).join('')}</section>`,
    ].join('');
  };

  // Aufklappen: Inhalt nachladen; Zuklappen merkt sich den Zustand.
  wurzel.addEventListener('toggle', (e) => {
    const d = e.target;
    if (!d.matches?.('details[data-teil]')) return;
    if (d.open) {
      zustand.offen.add(d.dataset.teil);
      const platz = d.querySelector('.klappe-inhalt');
      if (!platz.innerHTML.trim()) platz.innerHTML = teilInhalt(d.dataset.teil, k, zeitraum(k, zustand.zeitraum));
    } else zustand.offen.delete(d.dataset.teil);
  }, true);

  let wortZeit;
  wurzel.addEventListener('click', async (e) => {
    const knopf = e.target.closest('button');
    if (!knopf) return;
    if (knopf.dataset.zeitraum) { zustand.zeitraum = knopf.dataset.zeitraum; zeichnen(); }
    else if (knopf.dataset.ansicht) {
      // Kennzahl im Zeitstrahl: passenden Abschnitt aufklappen
      zustand.offen.add(knopf.dataset.ansicht);
      zeichnen();
      wurzel.querySelector(`[data-teil="${CSS.escape(knopf.dataset.ansicht)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (knopf.dataset.versatz !== undefined) { zustand.versatz = Number(knopf.dataset.versatz); zeichnen(); }
    else if (knopf.dataset.bericht !== undefined) berichtSheet(k);
    else if (knopf.dataset.experimentNeu !== undefined) experimentSheet(k, undefined, zeichnen);
    else if (knopf.dataset.experiment) experimentSheet(k, k.experimente.find((x) => x.id === knopf.dataset.experiment), zeichnen);
  });
  wurzel.addEventListener('change', (e) => {
    if (e.target.matches('[data-ziel]')) { zustand.ziel = e.target.value; zeichnen(); }
    if (e.target.matches('[data-sondertage]')) { zustand.sondertage = e.target.checked; zeichnen(); }
  });
  wurzel.addEventListener('input', (e) => {
    if (!e.target.matches('[data-wort]')) return;
    zustand.wort = e.target.value;
    clearTimeout(wortZeit);
    wortZeit = setTimeout(() => {
      const platz = wurzel.querySelector('[data-wort-ergebnis]');
      if (platz) platz.innerHTML = wortErgebnis(k, zeitraum(k, zustand.zeitraum));
    }, 250);
  });

  obenZeichnen();
  zeichnen();
}

// ---------- Wochenbilanz ----------

/**
 * Werte für Bilanz und Experimente: je Wert { id, titel, einheit, stellen, besser ('hoch' | 'tief'), messen(von, bis) },
 * messen liefert { wert, anzahl, text? }. Nur Werte, die es in den Daten gibt.
 */
function bilanzWerte(k) {
  const liste = [];
  const skala = (rolle) => {
    for (const b of k.bereiche) {
      const f = (b.felder ?? []).find((x) => x.typ === 'skala' && x.rolle === rolle && !x.ausgeblendet);
      if (f) return { b, f, wertAm: (t) => tagesWert(k.tage.get(t), `${b.id}.${f.id}`) };
    }
    return null;
  };
  // Schlaf: Dauer laut Uhr, wenn es Health-Werte gibt, sonst die Befinden-Skala des Schlafbereichs.
  const schlafB = k.bereiche.find((b) => b.id === 'schlaf');
  const schlafF = (schlafB?.felder ?? []).find((f) => f.typ === 'skala' && f.rolle === 'befinden');
  const dauerAm = healthWertAm(k, 'schlaf');
  if (healthHat(k, 'schlaf') || schlafF) {
    liste.push({
      id: 'schlaf', titel: 'Schlaf', besser: 'hoch', farbe: '--schlaf',
      messen: (von, bis) => {
        const dauer = kennzahl(von, bis, dauerAm);
        if (dauer.anzahl) return { ...dauer, einheit: 'h', stellen: 1 };
        if (!schlafF) return { wert: null, anzahl: 0, einheit: 'h' };
        return { ...kennzahl(von, bis, (t) => tagesWert(k.tage.get(t), `${schlafB.id}.${schlafF.id}`)), einheit: `von ${schlafF.max ?? 5}`, stellen: 1 };
      },
    });
  }
  for (const [rolle, titel, besser, farbe] of [['energie', 'Energie', 'hoch', '--aktivitaet'], ['stress', 'Stress', 'tief', '--aktivitaet']]) {
    const s = skala(rolle);
    if (s) liste.push({ id: rolle, titel: feldTitel(s.f) || titel, besser, farbe, messen: (von, bis) => ({ ...kennzahl(von, bis, s.wertAm), einheit: `von ${s.f.max ?? 5}`, stellen: 1 }) });
  }
  for (const r of schmerzReihen(k).filter((x) => (x.beschwerde.status ?? 'aktiv') === 'aktiv')) {
    liste.push({ id: r.id, titel: r.beschwerde.titel, besser: 'tief', farbe: '--genesung', messen: (von, bis) => ({ ...kennzahl(von, bis, r.wertAm), einheit: 'von 10', stellen: 1 }) });
  }
  for (const b of k.bereiche.filter((x) => x.ohneEintragNormal)) {
    liste.push({
      id: `frei.${b.id}`, titel: `${b.titel ?? titelVon(b)} ohne Beschwerden`, besser: 'hoch', farbe: BEREICHE[b.id].farbe, anteil: true,
      messen: (von, bis) => {
        let frei = 0;
        let erfasst = 0;
        for (let t = von; t <= bis; t = tageVerschieben(t, 1)) {
          const v = beschwerdefrei(b, k.tage.get(t));
          if (v === null) continue;
          erfasst += 1;
          if (v) frei += 1;
        }
        return { wert: erfasst ? frei : null, anzahl: erfasst, anteil: erfasst ? frei / erfasst : null, einheit: `von ${erfasst}`, stellen: 0 };
      },
    });
  }
  return liste;
}

/** Pfeil und Ton für einen Vergleich: gleich, besser oder schlechter. */
function richtungVon(w, jetzt, vorher, schwelle) {
  if (jetzt === null || vorher === null || jetzt === undefined || vorher === undefined) return { pfeil: '', ton: '' };
  const d = jetzt - vorher;
  if (Math.abs(d) < schwelle) return { pfeil: '→', ton: '' };
  const besser = w.besser === 'hoch' ? d > 0 : d < 0;
  return { pfeil: d > 0 ? '↑' : '↓', ton: besser ? 'gut' : 'schlecht' };
}

function wochenbilanz(k) {
  const heute = datumText();
  const von = tageVerschieben(heute, -6);
  const vorVon = tageVerschieben(heute, -13);
  const vorBis = tageVerschieben(heute, -7);
  const kacheln = bilanzWerte(k).map((w) => {
    const j = w.messen(von, heute);
    const v = w.messen(vorVon, vorBis);
    // Beschwerdefreie Tage über den Anteil vergleichen, weil nicht jede Woche gleich viele Tage erfasst sind.
    const r = w.anteil ? richtungVon(w, j.anteil, v.anteil, 0.05) : richtungVon(w, j.wert, v.wert, 0.15);
    const vorText = v.anzahl ? `Vorwoche ${zahl(v.wert, v.stellen ?? 1)}${w.anteil ? ` von ${v.anzahl}` : ''}` : 'Vorwoche ohne Werte';
    return `
      <div class="kennzahl bilanz" style="--farbe: var(${w.farbe})">
        <span class="kennzahl-titel">${esc(w.titel)}</span>
        <span class="kennzahl-wert"><strong>${j.anzahl ? zahl(j.wert, j.stellen ?? 1) : '–'}</strong> ${esc(j.anzahl ? j.einheit : '')}
          ${r.pfeil ? `<b class="pfeil ${r.ton ? `ton-${r.ton}` : ''}" aria-hidden="true">${r.pfeil}</b>` : ''}</span>
        <span class="kennzahl-unter">${esc(vorText)}</span>
      </div>`;
  }).join('');
  if (!kacheln) return '';
  return `
    <section class="abschnitt auswertung-abschnitt">
      <h2>Wochenbilanz</h2>
      <p class="abschnitt-unter">Letzte 7 Tage (${esc(tagKurz(von))}–${esc(tagKurz(heute))}) gegenüber den 7 Tagen davor.</p>
      <div class="kennzahlen">${kacheln}</div>
      ${healthHat(k, 'schlaf') ? '<p class="fussnote links">Schlaf in Stunden laut Uhr, aus dem letzten Health-Import. Fehlen sie, zählt der Morgen-Check.</p>' : ''}
    </section>`;
}

// ---------- Was hängt zusammen? ----------

const MAX_ERKENNTNISSE = 3;

/** Die deutlichsten Unterschiede als Sätze: Symptome nach Essen und Tag, Schlaf nach dem Tag davor. */
function zusammenhaenge(k, z) {
  const sondertage = zustand.sondertage ? sondertagPruefer(k) : null;
  const kandidaten = [];
  const haupt = ergebnisse(k).filter((e) => e.haupt);
  const merkmale = [...essensMerkmale(k), ...tagesMerkmale(k)];
  for (const e of haupt) {
    for (const m of merkmale) {
      for (const versatz of [0, 1]) {
        const r = anteilVergleich(k, z, m, e, { versatz, sondertage });
        if (!r.genug || Math.abs(r.a - r.b) < 0.12) continue;
        const mehr = r.a > r.b;
        kandidaten.push({
          merkmal: m.id,
          gewicht: Math.abs(r.a - r.b) * Math.sqrt(Math.min(r.mit, r.ohne)),
          satz: `An Tagen mit <strong>${esc(m.titel)}</strong> hattest du ${versatz ? 'am Folgetag ' : ''}${mehr ? 'öfter' : 'seltener'} <strong>${esc(e.titel)}</strong>: an ${prozent(r.a)} der Tage, sonst an ${prozent(r.b)}.`,
          basis: `${tageText(r.mit)} mit, ${tageText(r.ohne)} ohne`,
          ton: mehr ? 'schlecht' : 'gut',
        });
      }
    }
  }
  const schlaf = k.bereiche.find((b) => b.id === 'schlaf');
  const f = (schlaf?.felder ?? []).find((x) => x.typ === 'skala' && x.rolle === 'befinden');
  if (f) {
    const wertAm = (t) => tagesWert(k.tage.get(t), `${schlaf.id}.${f.id}`);
    for (const m of tagesMerkmale(k)) {
      const r = wertVergleich(k, z, m, wertAm, { versatz: 1, sondertage });
      if (!r.genug || Math.abs(r.a - r.b) < 0.3) continue;
      const besser = r.a > r.b;
      kandidaten.push({
        merkmal: m.id,
        gewicht: (Math.abs(r.a - r.b) / ((f.max ?? 5) - (f.min ?? 1))) * Math.sqrt(Math.min(r.mit, r.ohne)),
        satz: `Nach Tagen mit <strong>${esc(m.titel)}</strong> war „${esc(feldTitel(f))}“ in der Nacht danach ${besser ? 'besser' : 'schlechter'}: im Schnitt ${zahl(r.a, 1)} statt ${zahl(r.b, 1)} von ${f.max ?? 5}.`,
        basis: `${tageText(r.mit)} mit, ${tageText(r.ohne)} ohne`,
        ton: besser ? 'gut' : 'schlecht',
      });
    }
  }
  const gewaehlt = [];
  for (const x of kandidaten.sort((a, b) => b.gewicht - a.gewicht)) {
    if (gewaehlt.some((g) => g.merkmal === x.merkmal)) continue;
    gewaehlt.push(x);
    if (gewaehlt.length === MAX_ERKENNTNISSE) break;
  }
  if (!gewaehlt.length) {
    return karte('var(--akzent)', 'Noch nichts Deutliches', `<p class="fussnote links">Im gewählten Zeitraum gibt es keinen klaren Unterschied mit genug Tagen (mindestens ${MINDEST_TAGE} mit und ${MINDEST_TAGE} ohne). Ein längerer Zeitraum hilft.</p>`, { sym: 'auswertung' });
  }
  return `
    <section class="karte auswertung-karte erkenntnisse" style="--farbe: var(--akzent)">
      <ul class="erkenntnis-liste">${gewaehlt.map((x) => `<li class="ton-${x.ton}"><p>${x.satz}</p><span>${esc(x.basis)}</span></li>`).join('')}</ul>
      ${hinweisText(sondertagPruefer(k))}
      <p class="fussnote links">Mehr unter „Mehr Details“ → Auslöser.</p>
    </section>`;
}

// ---------- Experimente ----------

const EXPERIMENT_TAGE = 14;

function experimente(k) {
  const heute = datumText();
  const werte = bilanzWerte(k);
  const liste = [...k.experimente].sort((a, b) => b.datum.localeCompare(a.datum));
  const karten = liste.map((x) => {
    const vorVon = tageVerschieben(x.datum, -EXPERIMENT_TAGE);
    const vorBis = tageVerschieben(x.datum, -1);
    const ende = tageVerschieben(x.datum, EXPERIMENT_TAGE - 1);
    const bis = ende < heute ? ende : heute;
    const laeuft = x.datum > heute ? 'beginnt' : ende >= heute ? 'laeuft' : 'fertig';
    const tag = Math.round((alsDatum(bis) - alsDatum(x.datum)) / 864e5) + 1;
    const status = laeuft === 'beginnt' ? `Beginnt am ${tagLang(x.datum)}` : laeuft === 'laeuft' ? `Läuft · Tag ${tag} von ${EXPERIMENT_TAGE}` : `Abgeschlossen am ${tagLang(ende)}`;
    const zeilen = laeuft === 'beginnt' ? '' : werte.map((w) => {
      const v = w.messen(vorVon, vorBis);
      const n = w.messen(x.datum, bis);
      if (!v.anzahl && !n.anzahl) return '';
      const r = w.anteil ? richtungVon(w, n.anteil, v.anteil, 0.05) : richtungVon(w, n.wert, v.wert, 0.15);
      const text = (m) => (m.anzahl ? (w.anteil ? `${prozent(m.anteil)}` : zahl(m.wert, m.stellen ?? 1)) : '–');
      return `<tr><th>${esc(w.titel)}</th><td>${text(v)}</td><td class="${r.ton ? `ton-${r.ton}` : ''}">${text(n)} ${r.pfeil}</td></tr>`;
    }).join('');
    return `
      <section class="karte auswertung-karte experiment" style="--farbe: var(--akzent)">
        <div class="karte-kopf"><span class="symbol-klein">${symbol('stern', 18)}</span><h2>${esc(x.titel)}</h2>
          <button type="button" class="textknopf" data-experiment="${esc(x.id)}" aria-label="${esc(x.titel)} bearbeiten">${symbol('stift', 16)}</button></div>
        <p class="karte-unter">${esc(status)}${x.notiz ? ` · ${esc(x.notiz)}` : ''}</p>
        ${zeilen ? `<table class="experiment-tabelle"><thead><tr><th></th><th>14 Tage davor</th><th>${laeuft === 'laeuft' ? 'bisher' : '14 Tage ab Start'}</th></tr></thead><tbody>${zeilen}</tbody></table>` : ''}
        ${laeuft === 'laeuft' ? '<p class="fussnote links">Noch nicht abgeschlossen, die Werte ändern sich noch.</p>' : ''}
      </section>`;
  }).join('');
  return `${karten}
    <button type="button" class="knopf breit" data-experiment-neu>${symbol('plus', 20)}Experiment starten</button>
    ${liste.length ? '<p class="fussnote links">Vergleich, kein Beleg: Auch anderes kann sich in der Zeit geändert haben. „Ohne Beschwerden“ als Anteil der erfassten Tage.</p>' : '<p class="fussnote links">Setz einen Marker, wenn du etwas änderst, etwa beim Essen oder einer Gewohnheit. Die App vergleicht dann 14 Tage davor mit 14 Tagen danach.</p>'}`;
}

/** Experiment anlegen oder bearbeiten, gespeichert unter meta „experimente“ (Teil der Sicherung). */
function experimentSheet(k, x, fertig) {
  sheetOeffnen(x ? 'Experiment' : 'Experiment starten', (koerper, schliessen) => {
    koerper.innerHTML = `
      <form class="experiment-form" novalidate>
        <label class="feld"><span class="feld-titel">Was änderst du?</span>
          <input class="eingabe-feld" name="titel" value="${esc(x?.titel ?? '')}" placeholder="z. B. eine neue Gewohnheit" autocomplete="off" autocapitalize="sentences" required></label>
        <label class="feld"><span class="feld-titel">Ab</span>
          <input class="eingabe-feld" type="date" name="datum" value="${esc(x?.datum ?? datumText())}" required></label>
        <label class="feld"><span class="feld-titel">Notiz<span class="optional"> · optional</span></span>
          <input class="eingabe-feld" name="notiz" value="${esc(x?.notiz ?? '')}" autocomplete="off"></label>
        <button type="submit" class="knopf haupt breit">Sichern</button>
        ${x ? '<button type="button" class="knopf gefahr breit" data-loeschen>Löschen</button>' : ''}
      </form>`;
    const form = koerper.querySelector('form');
    const sichern = async (liste) => {
      k.experimente = liste;
      await metaSetzen('experimente', liste);
      schliessen();
      fertig();
    };
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const titel = form.elements.titel.value.trim();
      const datum = form.elements.datum.value;
      if (!titel) { form.elements.titel.focus(); return; }
      if (!datum) { form.elements.datum.focus(); return; }
      const neu = { id: x?.id ?? neueId(), titel, datum, notiz: form.elements.notiz.value.trim() || undefined };
      await sichern([...k.experimente.filter((y) => y.id !== neu.id), neu]);
    });
    form.querySelector('[data-loeschen]')?.addEventListener('click', async () => {
      if (!confirm(`„${x.titel}“ löschen? Deine Einträge bleiben, nur der Marker verschwindet.`)) return;
      await sichern(k.experimente.filter((y) => y.id !== x.id));
    });
  }, { untertitel: 'Vergleich 14 Tage davor und danach', farbe: '--akzent' });
}

// ---------- Schlaf ----------

/**
 * Optionen mit `beobachten` eines Bereichs: wie oft, und Anteil pro Woche im Verlauf. Gezählt wird erst ab dem
 * ersten Eintrag mit der Option, weil ältere Daten (etwa Importe) die Frage oft noch nicht kannten.
 */
function beobachtenTeile(k, z, b) {
  const teile = [];
  const tagesweise = b.zeitart === 'tag';
  const alleEintraege = k.eintraege.filter((e) => e.bereich === b.id);
  for (const f of alleFelder(b.felder).filter((x) => x.typ === 'mehrfach' || x.typ === 'einfach')) {
    for (const o of (f.optionen ?? []).filter((x) => x.beobachten)) {
      const hat = (e) => (f.typ === 'mehrfach' ? !!e.werte?.[f.id]?.[o.id] : e.werte?.[f.id] === o.id);
      const erster = alleEintraege.filter(hat).reduce((m, e) => (!m || e.zeitpunkt < m ? e.zeitpunkt : m), null)?.slice(0, 10);
      if (!erster || erster > z.bis) continue;
      const ab = erster > z.von ? erster : z.von;
      const eintraege = eintraegeIm(k, b.id, ab, z.bis);
      const mit = eintraege.filter(hat).length;
      const vorher = z.vorher && z.vorher.bis >= erster ? eintraegeIm(k, b.id, erster > z.vorher.von ? erster : z.vorher.von, z.vorher.bis) : [];
      const einheit = tagesweise ? (b.id === 'schlaf' ? 'Nächten' : 'Tagen') : 'Einträgen';
      const proWoche = new Map();
      for (const e of eintraege) {
        const t = e.zeitpunkt.slice(0, 10);
        const w = proWoche.get(t) ?? { n: 0, mit: 0 };
        w.n += 1;
        if (hat(e)) w.mit += 1;
        proWoche.set(t, w);
      }
      const woche = { ...z, von: ab, art: z.tage > 400 ? 'monat' : 'woche' };
      const punkte = abschnitte(woche).map((a) => {
        let n = 0;
        let m = 0;
        for (let t = a.von; t <= a.bis; t = tageVerschieben(t, 1)) { const w = proWoche.get(t); if (w) { n += w.n; m += w.mit; } }
        return { ...a, wert: n ? (m / n) * 100 : null, anzahl: n };
      });
      teile.push(`<div class="teil">
        <h3>${esc(o.titel)}</h3>
        <p class="karte-unter">In <strong>${zahl(mit, 0)}</strong> von ${zahl(eintraege.length, 0)} ${einheit} (${prozent(eintraege.length ? mit / eintraege.length : null)}${ab > z.von ? `, gezählt ab dem ersten Vorkommen am ${esc(tagKurz(ab))}` : ''})${vorher.length ? `, davor ${prozent(vorher.filter(hat).length / vorher.length)}` : ''}. Verlauf: Anteil je ${woche.art === 'monat' ? 'Monat' : 'Woche'} in %.</p>
        ${punkte.filter((x) => x.wert !== null).length >= 2 ? linie(punkte, { min: 0, max: 100, beschriftung: `Anteil ${o.titel} im Verlauf`, format: (v) => `${zahl(v, 0)} %` }) : ''}
      </div>`);
    }
  }
  return teile.join('');
}

function schlafTeil(k, z) {
  const b = k.bereiche.find((x) => x.id === 'schlaf');
  const naechte = healthIm(k, z.von, z.bis).filter((d) => d.schlaf?.dauer);
  const teile = [];
  if (naechte.length) {
    const einschlafenAm = (t) => uhrMinuten(k.health.get(t)?.schlaf?.einschlafen ?? null);
    const punkte = verlauf(z, einschlafenAm);
    const werte = punkte.map((p) => p.wert).filter((v) => v !== null);
    const dauer = schnitt(naechte.map((d) => d.schlaf.dauer));
    const vorher = z.vorher ? healthIm(k, z.vorher.von, z.vorher.bis).filter((d) => d.schlaf?.dauer) : [];
    const dauerText = (min) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} min`;
    const einschlafen = schnitt(naechte.map((d) => uhrMinuten(d.schlaf.einschlafen)).filter((v) => v !== null));
    teile.push(`
      <div class="info-zeilen">
        <div><span>Ø Dauer</span><strong>${dauerText(dauer)}</strong></div>
        ${vorher.length ? `<div><span>Davor</span><strong>${dauerText(schnitt(vorher.map((d) => d.schlaf.dauer)))}</strong></div>` : ''}
        <div><span>Ø Eingeschlafen</span><strong>${uhrText(einschlafen)}</strong></div>
      </div>
      ${werte.length >= 2 ? `<h3 class="teil-titel">Einschlafzeit im Verlauf</h3>
        ${linie(punkte, { min: Math.floor(Math.min(...werte) / 60) * 60, max: Math.ceil(Math.max(...werte) / 60) * 60, beschriftung: 'Einschlafzeit im Verlauf', format: (v) => uhrText(v) })}
        <p class="fussnote links">Höher heißt später eingeschlafen.</p>` : ''}`);
  }
  const beob = b ? beobachtenTeile(k, z, b) : '';
  if (!teile.length && !beob) return '';
  return `<section class="karte auswertung-karte" style="--farbe: ${farbeVon('schlaf')}">${teile.join('')}${beob}
    ${!naechte.length ? '<p class="fussnote links">Dauer und Einschlafzeit kommen aus dem Health-Import (Einstellungen → Apple Health). Im Zeitraum gibt es keine Nächte.</p>' : `<p class="fussnote links">Dauer und Einschlafzeit laut Uhr an ${tagen(naechte.length)}.</p>`}</section>`;
}

// ---------- Bauch & Verdauung ----------

function bauchTeil(k, z) {
  const teil = bereichsAnsicht(k, z, BAUCH);
  const beob = BAUCH.bereiche.map((id) => k.bereiche.find((b) => b.id === id)).filter(Boolean)
    .map((b) => {
      const inhalt = beobachtenTeile(k, z, b);
      return inhalt ? karte(farbeVon(b.id), `${titelVon(b)}: wie oft`, inhalt, { sym: BEREICHE[b.id].symbol }) : '';
    }).join('');
  return beob + teil;
}

// ---------- Arztbericht ----------

function berichtSheet(k) {
  let zr = zustand.zeitraum;
  sheetOeffnen('Zusammenfassung für Arzttermin', (koerper) => {
    const zeichnenBericht = () => {
      const z = zeitraum(k, zr);
      koerper.innerHTML = `
        <div class="zeitraum-wahl" role="group" aria-label="Zeitraum des Berichts">
          ${ZEITRAEUME.map((x) => `<button type="button" data-bericht-zeitraum="${x.id}" aria-pressed="${x.id === zr}">${esc(x.titel)}</button>`).join('')}
        </div>
        <p class="zeitraum-text">${esc(tagLang(z.von))} bis ${esc(tagLang(z.bis))}</p>
        <textarea class="bericht-text" data-bericht-text readonly rows="14" aria-label="Zusammenfassung">${esc(arztbericht(k, z))}</textarea>
        <button type="button" class="knopf haupt breit" data-kopieren>Text kopieren</button>
        <p class="fussnote links">Nach Verdauung, Schlaf und körperlichen Beschwerden. Ohne Notizen, Aktivitäten und Personen.</p>`;
    };
    koerper.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.berichtZeitraum) { zr = b.dataset.berichtZeitraum; zeichnenBericht(); return; }
      if (b.dataset.kopieren === undefined) return;
      const feld = koerper.querySelector('[data-bericht-text]');
      try {
        await navigator.clipboard.writeText(feld.value);
        b.textContent = 'Kopiert';
      } catch {
        feld.focus();
        feld.select();
        b.textContent = 'Markiert, jetzt kopieren';
      }
      setTimeout(() => { b.textContent = 'Text kopieren'; }, 2400);
    });
    zeichnenBericht();
  }, { untertitel: 'Zeitraum wählen, dann kopieren', farbe: '--magen' });
}

// ---------- Überblick ----------

function ueberblick(k, z) {
  const reihen = messreihen(k);
  const kacheln = reihen.map((r) => {
    const jetzt = kennzahl(z.von, z.bis, r.wertAm);
    const vorher = z.vorher ? kennzahl(z.vorher.von, z.vorher.bis, r.wertAm) : null;
    const einheit = r.einheit ?? (r.anzahl ? 'pro Tag' : `von ${r.max}`);
    const stellen = r.stellen ?? 1;
    const vergleichText = vorher?.anzahl ? `davor ${zahl(vorher.wert, stellen)}` : jetzt.anzahl ? tageText(jetzt.anzahl) : 'keine Werte';
    return `
      <button type="button" class="kennzahl" data-ansicht="${r.ansicht}" style="--farbe: var(${r.farbe})">
        <span class="kennzahl-titel">${esc(r.titel)}</span>
        <span class="kennzahl-wert"><strong>${zahl(jetzt.wert, stellen)}</strong> ${esc(einheit)}</span>
        <span class="kennzahl-unter">${esc(vergleichText)}</span>
      </button>`;
  }).join('');

  const ab = abschnitte(z);
  const zeilen = reihen.map((r) => {
    const punkte = verlauf(z, r.wertAm);
    if (punkte.filter((p) => p.wert !== null).length < 2) return '';
    return `
      <div class="zeitstrahl-zeile" style="--farbe: var(${r.farbe})">
        <span class="zeitstrahl-titel">${esc(r.titel)}<small>${esc(r.einheit ?? (r.anzahl ? 'pro Tag' : `${r.min}–${r.max}`))}</small></span>
        ${linie(punkte, { ...grenzen(r, punkte), beschriftung: `${r.titel} im Verlauf`, hoehe: 46, achse: false })}
      </div>`;
  }).join('');
  const einheit = { tag: 'Tag', woche: 'Woche', monat: 'Monat' }[z.art];

  // Besondere Tage im Zeitraum
  const besondere = [];
  for (const b of k.bereiche) {
    const stat = bereichStatistik(b, eintraegeIm(k, b.id, z.von, z.bis)).filter((s) => s.feld.rolle === 'besonderheit');
    for (const s of stat) besondere.push(...optionsZeilen(s));
  }
  const sondertage = sondertagPruefer(k);
  const termineIm = (k.genesung?.beschwerden ?? []).flatMap((b) => termine(k.eintraege, b.id, k)
    .filter((e) => e.zeitpunkt.slice(0, 10) >= z.von && e.zeitpunkt.slice(0, 10) <= z.bis).map((e) => ({ e, b })));

  return `
    <div class="kennzahlen">${kacheln}</div>
    <p class="fussnote links">Schnitt im Zeitraum${z.vorher ? ', darunter der gleich lange Zeitraum davor' : ''}. Antippen öffnet den Bereich.</p>
    ${zeilen ? karte('var(--akzent)', 'Zeitstrahl', `
      <div class="zeitstrahl">${zeilen}</div>
      <div class="zeitstrahl-achse"><span>${esc(ab[0]?.titel ?? '')}</span><span>Schnitt je ${einheit}</span><span>${esc(ab.at(-1)?.titel ?? '')}</span></div>`,
    { sym: 'auswertung', unter: 'Alle Verläufe auf derselben Zeitachse. Höhere Linie heißt höherer Wert.' }) : ''}
    ${besondere.length || termineIm.length ? karte('var(--aktivitaet)', 'Besondere Tage', `
      ${besondere.length ? balken(besondere.map((x) => ({ ...x, text: tageText(x.anzahl) }))) : ''}
      ${termineIm.length ? `<ul class="termin-liste">${termineIm.map(({ e, b }) => `<li><strong>${esc(tagKurz(e.zeitpunkt))}</strong> ${esc(e.werte.titel || 'Termin')} · ${esc(b.titel)}</li>`).join('')}</ul>` : ''}`,
    { sym: 'kalender', unter: sondertage.vorhanden ? `Tage mit ${esc(sondertage.titel.join(', '))} zählen bei Zusammenhängen standardmäßig nicht mit.` : '' }) : ''}`;
}

/** Achse einer Zeitstrahl-Zeile: feste Skalen von min bis max, frei skalierte (Health) über den Wertebereich. */
function grenzen(r, punkte) {
  const werte = punkte.map((p) => p.wert).filter((v) => v !== null);
  if (r.frei) return { min: Math.min(...werte) * 0.85, max: Math.max(...werte, 1) };
  return { min: r.min, max: r.anzahl ? Math.max(r.max, ...werte) : r.max };
}

// ---------- Bereiche (Bauch, Schlaf, Tag) ----------

function bereichsAnsicht(k, z, ansicht) {
  const bereiche = ansicht.bereiche.map((id) => k.bereiche.find((b) => b.id === id)).filter(Boolean);
  if (!bereiche.length) return leerKarte('Dieser Bereich ist nicht eingerichtet.');
  // Erster Bereich, dann die Tageszeit über alle Bereiche, dann die übrigen
  const [erster, ...rest] = bereiche;
  return [
    bereichKarten(k, z, erster),
    ansicht.id === 'bauch' ? tageszeitKarte(k, z, bereiche) : '',
    ...rest.map((b) => bereichKarten(k, z, b)),
    ansicht.id === 'schlaf' ? vortagKarte(k, z, erster) : '',
    ansicht.id === 'schlaf' ? uhrSchlafKarten(k, z) : '',
    ansicht.id === 'tag' ? bewegungKarten(k, z) : '',
  ].join('');
}

// ---------- Health-Daten ----------

/** Kacheln mit Schnitt im Zeitraum und davor, je Health-Wert mit Daten. */
function healthKacheln(k, z, ids) {
  const kacheln = ids.filter((id) => healthHat(k, id)).map((id) => {
    const art = HEALTH_WERTE[id];
    const wertAm = healthWertAm(k, id);
    const jetzt = kennzahl(z.von, z.bis, wertAm);
    const vorher = z.vorher ? kennzahl(z.vorher.von, z.vorher.bis, wertAm) : null;
    const unter = jetzt.anzahl ? `${vorher?.anzahl ? `davor ${zahl(vorher.wert, art.stellen)} · ` : ''}${tageText(jetzt.anzahl)}` : 'keine Werte';
    return `
      <div class="kennzahl">
        <span class="kennzahl-titel">${esc(art.titel)}</span>
        <span class="kennzahl-wert"><strong>${zahl(jetzt.wert, art.stellen)}</strong> ${esc(art.einheit)}</span>
        <span class="kennzahl-unter">${esc(unter)}</span>
      </div>`;
  });
  return kacheln.length ? `<div class="kennzahlen">${kacheln.join('')}</div>` : '';
}

/** Linie eines Health-Werts über den Zeitraum, Achse von 0 (oder knapp unter dem kleinsten Wert) bis zum größten. */
function healthLinie(k, z, id, { abNull = true } = {}) {
  const art = HEALTH_WERTE[id];
  const punkte = verlauf(z, healthWertAm(k, id));
  const werte = punkte.map((p) => p.wert).filter((v) => v !== null);
  const min = abNull ? 0 : Math.floor(Math.min(...werte) * 0.97);
  return linie(punkte, { min, max: rundeGrenze(Math.max(...werte, 1)), beschriftung: `${art.titel} im Verlauf`, format: (v) => zahl(v, Number.isInteger(v) ? 0 : 1) });
}

/** Nächste runde Obergrenze für eine Achse: 8,4 → 10 (Mitte 5), 3.720 → 4.000, 58 → 60. */
function rundeGrenze(x) {
  const schritt = 10 ** Math.floor(Math.log10(x));
  const g = Math.ceil(x / schritt) * schritt;
  return g % 2 && g / schritt < 10 ? g + schritt : g;
}

/** Schlaf laut Uhr: Dauer, Uhrzeiten, Phasen; dazu die Nachtwerte. */
function uhrSchlafKarten(k, z) {
  if (!healthHat(k, 'schlaf')) return '';
  const naechte = healthIm(k, z.von, z.bis).filter((d) => d.schlaf?.dauer);
  if (!naechte.length) return karte(farbeVon('schlaf'), 'Schlaf laut Uhr', '<p class="fussnote links">Keine Nächte im Zeitraum.</p>', { sym: 'schlaf' });
  const einschlafen = schnitt(naechte.map((d) => uhrMinuten(d.schlaf.einschlafen)).filter((v) => v !== null));
  const aufwachen = schnitt(naechte.map((d) => uhrMinuten(d.schlaf.aufwachen, 18)).filter((v) => v !== null));
  const mitPhasen = naechte.filter((d) => d.schlaf.tief !== undefined);
  const phasen = [['tief', 'Tiefschlaf'], ['kern', 'Kernschlaf'], ['rem', 'REM'], ['wach', 'Wach']];
  const phasenSchnitt = phasen.map(([id, titel]) => ({ id, titel, minuten: schnitt(mitPhasen.map((d) => d.schlaf[id] ?? 0)) ?? 0 }));
  const summe = phasenSchnitt.reduce((n, p) => n + p.minuten, 0) || 1;
  const dauerText = (min) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} min`;
  const schlafDauer = schnitt(naechte.map((d) => d.schlaf.dauer));
  return `
    ${karte(farbeVon('schlaf'), 'Schlaf laut Uhr', `
      ${healthLinie(k, z, 'schlaf')}
      <div class="info-zeilen">
        <div><span>Eingeschlafen</span><strong>${uhrText(einschlafen)}</strong></div>
        <div><span>Aufgewacht</span><strong>${uhrText(aufwachen)}</strong></div>
      </div>
      ${mitPhasen.length ? `<h3 class="teil-titel">Schlafphasen im Schnitt</h3>${balken(phasenSchnitt.map((p) => ({ titel: p.titel, anzahl: p.minuten, text: `${zahl(p.minuten, 0)} min · ${prozent(p.minuten / summe)}` })))}` : ''}`,
    { sym: 'schlaf', unter: `Schnitt <strong>${dauerText(schlafDauer)}</strong> Schlaf an ${tagen(naechte.length)}. Gemessen von der Uhr, ohne Wachphasen.` })}
    ${karte(farbeVon('schlaf'), 'Nachtwerte und Herz', healthKacheln(k, z, ['ruhepuls', 'hrv', 'atemfrequenz', 'sauerstoff', 'temperatur']),
    { sym: 'herz', unter: 'Schnitt im Zeitraum, darunter der Zeitraum davor. Atemfrequenz und Temperatur gelten für die Nacht davor.' })}`;
}

/** Bewegung und Trainings aus Health. */
function bewegungKarten(k, z) {
  const teile = [];
  if (['schritte', 'aktivEnergie', 'tageslicht', 'achtsamkeit'].some((id) => healthHat(k, id))) {
    teile.push(karte('var(--aktivitaet)', 'Bewegung', `
      ${healthKacheln(k, z, ['schritte', 'aktivEnergie', 'tageslicht', 'achtsamkeit'])}
      ${healthHat(k, 'schritte') ? `<h3 class="teil-titel">Schritte</h3>${healthLinie(k, z, 'schritte')}` : ''}`,
    { sym: 'aktivitaet', unter: 'Schnitt pro Tag mit Werten. Tageslicht und Achtsamkeit nur an Tagen, an denen etwas gemessen wurde.' }));
  }
  if (healthHat(k, 'training')) {
    const tage = healthIm(k, z.von, z.bis);
    const trainings = tage.flatMap((d) => (d.training ?? []).map((t) => ({ ...t, tag: d.tag })));
    const jeArt = new Map();
    for (const t of trainings) {
      const name = trainingsName(t.art);
      const x = jeArt.get(name) ?? { titel: name, tage: new Set(), minuten: 0, anzahl: 0 };
      x.tage.add(t.tag);
      x.minuten += t.minuten;
      x.anzahl += 1;
      jeArt.set(name, x);
    }
    const zeilen = [...jeArt.values()].sort((a, b) => b.minuten - a.minuten);
    const mitTraining = new Set(trainings.map((t) => t.tag)).size;
    const minuten = trainings.reduce((n, t) => n + t.minuten, 0);
    teile.push(karte('var(--aktivitaet)', 'Training', `
      ${zeilen.length ? `${healthLinie(k, z, 'training')}${balken(zeilen.map((x) => ({ titel: x.titel, anzahl: x.minuten, text: `${x.anzahl}× · ${zahl(x.minuten, 0)} min` })))}` : '<p class="fussnote links">Keine Trainings im Zeitraum.</p>'}`,
    { sym: 'aktivitaet', unter: `Trainings an <strong>${tagen(mitTraining)}</strong>, zusammen ${zahl(minuten / 60, 1)} h. Verlauf in Minuten pro Tag.` }));
  }
  return teile.join('');
}

// ---------- Ernährung ----------

const NAEHRWERTE = ['kcal', 'eiweiss', 'kohlenhydrate', 'fett', 'zucker', 'ballaststoffe', 'wasser'];

function ernaehrung(k, z) {
  const essenBereich = k.bereiche.find((b) => b.id === 'ernaehrung');
  const tage = healthIm(k, z.von, z.bis).filter((d) => d.ernaehrung);
  const eintraege = essenBereich ? eintraegeIm(k, essenBereich.id, z.von, z.bis) : [];
  if (!healthHat(k, 'kcal') && !eintraege.length) {
    return leerKarte('Noch keine Ernährungsdaten. Unter Einstellungen → Apple Health den Export aus der Health-App einlesen.');
  }
  const farbe = farbeVon('ernaehrung');
  const karten = [];

  if (healthHat(k, 'kcal')) {
    karten.push(karte(farbe, 'Nährwerte pro Tag', healthKacheln(k, z, NAEHRWERTE),
      { sym: 'ernaehrung', unter: `Schnitt über die Tage mit Einträgen in der Ernährungs-App${z.vorher ? ', darunter der Zeitraum davor' : ''}.` }));
    if (tage.length) {
      const g = (id) => schnitt(tage.map((d) => d.ernaehrung[id] ?? 0)) ?? 0;
      const anteile = [['eiweiss', 'Eiweiß', 4], ['kohlenhydrate', 'Kohlenhydrate', 4], ['fett', 'Fett', 9]].map(([id, titel, kcal]) => ({ titel, kcal: g(id) * kcal }));
      const summe = anteile.reduce((n, x) => n + x.kcal, 0) || 1;
      karten.push(karte(farbe, 'Energie', `
        ${healthLinie(k, z, 'kcal')}
        <h3 class="teil-titel">Woher die Energie kommt</h3>
        ${balken(anteile.map((x) => ({ titel: x.titel, anzahl: x.kcal / summe, text: prozent(x.kcal / summe) })), { max: 1 })}`,
      { sym: 'ernaehrung', unter: `Eingetragen an ${tagen(tage.length)}. Anteile aus Eiweiß, Kohlenhydraten und Fett, gerechnet mit 4, 4 und 9 kcal je Gramm.` }));
    } else {
      karten.push(karte(farbe, 'Energie', '<p class="fussnote links">Keine Einträge aus der Ernährungs-App im Zeitraum.</p>', { sym: 'ernaehrung' }));
    }
  }

  // Mahlzeiten aus der Ernährungs-App: Uhrzeiten und häufigste Lebensmittel
  const ausApp = eintraege.filter((e) => e.quelle === HEALTH_QUELLE);
  if (ausApp.length) {
    const proTag = new Map();
    for (const e of ausApp) {
      const t = e.zeitpunkt.slice(0, 10);
      const zeit = e.zeitpunkt.slice(11, 16);
      const x = proTag.get(t) ?? { erste: zeit, letzte: zeit, anzahl: 0 };
      if (zeit < x.erste) x.erste = zeit;
      if (zeit > x.letzte) x.letzte = zeit;
      x.anzahl += 1;
      proTag.set(t, x);
    }
    const werte = [...proTag.values()];
    const erste = schnitt(werte.map((x) => uhrMinuten(x.erste, 4)));
    const letzte = schnitt(werte.map((x) => uhrMinuten(x.letzte, 4)));
    const lebensmittel = new Map();
    for (const e of ausApp) {
      for (const name of e.lebensmittel ?? []) {
        const x = lebensmittel.get(name) ?? { titel: name, tage: new Set() };
        x.tage.add(e.zeitpunkt.slice(0, 10));
        lebensmittel.set(name, x);
      }
    }
    const liste = [...lebensmittel.values()].map((x) => ({ titel: x.titel, anzahl: x.tage.size })).sort((a, b) => b.anzahl - a.anzahl || a.titel.localeCompare(b.titel, 'de'));
    karten.push(karte(farbe, 'Mahlzeiten', `
      <div class="info-zeilen">
        <div><span>Erste Mahlzeit</span><strong>${uhrText(erste)}</strong></div>
        <div><span>Letzte Mahlzeit</span><strong>${uhrText(letzte)}</strong></div>
        <div><span>Einträge pro Tag</span><strong>${zahl(ausApp.length / proTag.size, 1)}</strong></div>
      </div>
      <h3 class="teil-titel">Häufigste Lebensmittel</h3>
      ${balken(liste.slice(0, 15).map((x) => ({ ...x, text: tageText(x.anzahl) })))}
      ${liste.length > 15 ? `<p class="fussnote links">und ${liste.length - 15} weitere</p>` : ''}`,
    { sym: 'uhr', unter: `Schnitt über ${tageText(proTag.size)} mit Einträgen. Uhrzeit, zu der die Mahlzeit eingetragen ist.` }));
  }

  // Gruppen aus der Konfiguration, über alle Essens-Einträge (auch alte Notizen)
  const gruppen = essensMerkmale(k);
  const essTage = [];
  for (let t = z.von; t <= z.bis; t = tageVerschieben(t, 1)) if (k.tage.get(t)?.bereiche.has('ernaehrung')) essTage.push(k.tage.get(t));
  if (gruppen.length && essTage.length) {
    const zeilen = gruppen.map((g) => ({ titel: g.titel, anzahl: essTage.filter((t) => g.hat(t)).length })).filter((x) => x.anzahl).sort((a, b) => b.anzahl - a.anzahl);
    if (zeilen.length) {
      karten.push(karte(farbe, 'Gruppen', balken(zeilen.map((x) => ({ ...x, text: `${x.anzahl} · ${prozent(x.anzahl / essTage.length)}` }))),
        { sym: 'ernaehrung', unter: `Tage, an denen etwas aus der Gruppe vorkommt, von ${tagen(essTage.length)} mit Essens-Einträgen. Gesucht wird nach Wörtern, ohne Menge.` }));
    }
  }

  if (healthHat(k, 'gewicht') && kennzahl(z.von, z.bis, healthWertAm(k, 'gewicht')).anzahl >= 2) {
    karten.push(karte(farbe, 'Gewicht', healthLinie(k, z, 'gewicht', { abNull: false }), { sym: 'ernaehrung', unter: 'Eingetragene Werte, je Tag der letzte.' }));
  }
  karten.push('<p class="fussnote links">Vitamine und Mineralstoffe (etwa Kalzium) zeigt die App nicht: Die Ernährungs-App liefert sie nur für wenige Lebensmittel.</p>');
  return karten.join('');
}

/** Karten eines Bereichs, Reihenfolge wie in der Konfiguration. */
function bereichKarten(k, z, b) {
  const eintraege = eintraegeIm(k, b.id, z.von, z.bis);
  const farbe = farbeVon(b.id);
  const name = titelVon(b);
  if (!eintraege.length) return karte(farbe, BEREICHE[b.id].titel, '<p class="fussnote links">Keine Einträge im Zeitraum.</p>', { sym: BEREICHE[b.id].symbol });
  const tageMit = erfassteTage(k, b.id, z.von, z.bis);
  const tagesweise = b.zeitart === 'tag';
  const karten = [];

  // Häufigkeit bei Bereichen ohne eigene Skala, z. B. Einträge pro Tag
  const skalen = (b.felder ?? []).filter((f) => f.typ === 'skala' && VERLAUF_ROLLEN.includes(f.rolle));
  if (!skalen.length && !tagesweise) {
    const reihe = messreihen(k).find((r) => r.id === `${b.id}.anzahl`);
    const punkte = verlauf(z, reihe.wertAm);
    karten.push(karte(farbe, `${name} pro Tag`, linie(punkte, { min: 0, max: Math.max(2, ...punkte.map((p) => Math.ceil(p.wert ?? 0))), beschriftung: `${name} pro Tag`, format: (v) => zahl(v, 0) }),
      { sym: BEREICHE[b.id].symbol, unter: `${zahl(eintraege.length, 0)} Einträge an ${tagen(new Set(eintraege.map((e) => e.zeitpunkt.slice(0, 10))).size)}, im Schnitt <strong>${zahl(eintraege.length / z.tage, 1)}</strong> pro Tag.` }));
  }

  const warn = warnzeichen(b, eintraege);
  if (warn.length) {
    const hinweis = warn[0].option.hinweis;
    karten.push(`<div class="banner warnung" style="--farbe: var(--ton-schlecht)">${symbol('hinweis', 22)}<span><strong>${warn.map((w) => `${esc(w.option.titel)} an ${tagen(new Set(w.tage).size)}`).join(', ')}</strong><br>${esc(hinweis)}</span></div>`);
  }

  for (const s of bereichStatistik(b, eintraege)) {
    const f = s.feld;
    const titel = s.ueber ? `${s.ueber.titel} · ${feldTitel(f)}` : feldTitel(f);
    if (f.typ === 'skala' && VERLAUF_ROLLEN.includes(f.rolle)) {
      const schluessel = `${b.id}.${f.id}`;
      const wertAm = (t) => tagesWert(k.tage.get(t), schluessel);
      const jetzt = kennzahl(z.von, z.bis, wertAm);
      const vorher = z.vorher ? kennzahl(z.vorher.von, z.vorher.bis, wertAm) : null;
      const enden = f.links && f.rechts ? ` ${f.min ?? 1} = ${esc(f.links)}, ${f.max ?? 5} = ${esc(f.rechts)}.` : '';
      karten.push(karte(farbe, titel,
        linie(verlauf(z, wertAm), { min: f.min ?? 1, max: f.max ?? 5, beschriftung: `${titel} im Verlauf` }),
        { sym: BEREICHE[b.id].symbol, unter: `Schnitt <strong>${zahl(jetzt.wert, 1)}</strong> an ${tagen(jetzt.anzahl)}${vorher?.anzahl ? `, davor ${zahl(vorher.wert, 1)}` : ''}.${enden}` }));
    } else if (f.typ === 'mehrfach' || f.typ === 'person') {
      const zeilen = optionsZeilen(s, { personen: k.personen });
      if (!zeilen.length) continue;
      const stufen = f.stufen ?? [];
      const daten = zeilen.slice(0, 15).map((x) => ({
        ...x,
        text: `${x.anzahl} · ${prozent(x.anzahl / tageMit)}`,
        teile: stufen.length ? stufenAnteile(x, stufen) : undefined,
      }));
      const legende = stufen.length ? `<div class="legende stufen-legende">${stufen.map((st, i) => `<span><i class="legende-mit" style="opacity:${stufenDeckkraft(i, stufen.length)}"></i>${esc(st.titel)}</span>`).join('')}</div>` : '';
      const mehr = zeilen.length > 15 ? `<p class="fussnote links">und ${zeilen.length - 15} weitere</p>` : '';
      karten.push(karte(farbe, titel, balken(daten) + legende + mehr,
        { unter: `Anzahl Tage mit Angabe und Anteil an ${tagen(tageMit)}${b.ohneEintragNormal ? ' (Tage ohne Eintrag zählen als beschwerdefrei)' : ' mit Eintrag'}.` }));
    } else if (f.typ === 'einfach') {
      const zeilen = optionsZeilen(s);
      if (!zeilen.length) continue;
      const summe = zeilen.reduce((x, y) => x + y.anzahl, 0);
      karten.push(karte(farbe, titel, balken(zeilen.map((x) => ({ ...x, text: prozent(x.anzahl / summe) }))),
        { unter: `Verteilung über ${zahl(summe, 0)} Angaben.` }));
    } else if (f.typ === 'janein') {
      const n = s.zaehler.get('ja')?.tage.size ?? 0;
      if (n) karten.push(karte(farbe, titel, '', { unter: `Ja an <strong>${tagen(n)}</strong> von ${tagen(tageMit)} mit Eintrag.` }));
    }
  }
  return karten.join('');
}

/** Anteile der Stufen einer Option (leicht → stark), bezogen auf die Einträge der Option. */
function stufenAnteile(zeile, stufen) {
  const summe = stufen.reduce((x, st) => x + (zeile.stufen.get(st.id) ?? 0), 0);
  if (!summe) return undefined;
  return stufen.map((st) => (zeile.stufen.get(st.id) ?? 0) / summe);
}

/** Einträge je Tageszeit: Symptome einzeln, Bereiche ohne Symptomfeld als eine Zeile. */
function tageszeitKarte(k, z, bereiche) {
  const zeilen = [];
  for (const b of bereiche.filter((x) => x.zeitart !== 'tag')) {
    const eintraege = eintraegeIm(k, b.id, z.von, z.bis);
    const [f] = symptomFelder(b).filter((x) => x.stufen);
    if (f) {
      const proOption = new Map();
      for (const e of eintraege) {
        const tz = tageszeitEintrag(b, e);
        for (const id of Object.keys(e.werte?.[f.id] ?? {})) {
          if (!proOption.has(id)) proOption.set(id, Object.fromEntries(TAGESZEIT_SPALTEN.map((s) => [s.id, 0])));
          if (tz in proOption.get(id)) proOption.get(id)[tz] += 1;
        }
      }
      const sortiert = [...proOption.entries()].map(([id, w]) => ({ id, w, n: Object.values(w).reduce((x, y) => x + y, 0) }))
        .sort((x, y) => y.n - x.n).slice(0, 6);
      for (const { id, w } of sortiert) {
        const o = (f.optionen ?? []).find((x) => x.id === id);
        if (!zaehlt(f, o)) continue;
        zeilen.push({ titel: titelVon(o) || id, werte: TAGESZEIT_SPALTEN.map((s) => w[s.id]) });
      }
    } else if (eintraege.length) {
      const w = Object.fromEntries(TAGESZEIT_SPALTEN.map((s) => [s.id, 0]));
      for (const e of eintraege) { const tz = tageszeitEintrag(b, e); if (tz in w) w[tz] += 1; }
      zeilen.push({ titel: titelVon(b), werte: TAGESZEIT_SPALTEN.map((s) => w[s.id]) });
    }
  }
  if (!zeilen.some((x) => x.werte.some(Boolean))) return '';
  return karte('var(--magen)', 'Tageszeit', raster(zeilen, TAGESZEIT_SPALTEN.map((s) => s.titel)),
    { sym: 'uhr', unter: 'Einträge je Tageszeit. Je kräftiger, desto häufiger.' });
}

/** Schlaf nach Tagen mit einer Aktivität gegenüber Tagen ohne. */
function vortagKarte(k, z, schlaf) {
  const f = (schlaf.felder ?? []).find((x) => x.typ === 'skala' && x.rolle === 'befinden');
  if (!f) return '';
  const schluessel = `${schlaf.id}.${f.id}`;
  const wertAm = (t) => tagesWert(k.tage.get(t), schluessel);
  const sondertage = sondertagPruefer(k);
  const ergebnisse = tagesMerkmale(k).map((m) => wertVergleich(k, z, m, wertAm, { versatz: 1, sondertage }));
  const genug = ergebnisse.filter((r) => r.genug).sort((x, y) => (y.a - y.b) - (x.a - x.b));
  const zuWenig = ergebnisse.length - genug.length;
  const zeilen = genug.map((r) => {
    const d = r.a - r.b;
    return {
      titel: r.merkmal.titel, unter: `${tageText(r.mit)} mit, ${tageText(r.ohne)} ohne`, a: r.a - (f.min ?? 1), b: r.b - (f.min ?? 1),
      aText: zahl(r.a, 1), bText: `ohne ${zahl(r.b, 1)}`, ton: Math.abs(d) < 0.15 ? '' : d > 0 ? 'gut' : 'schlecht',
    };
  });
  return karte(farbeVon(schlaf.id), 'Was der Tag davor bewirkt', `
    ${zeilen.length ? `${legendeMitOhne('nach Tagen mit', 'ohne')}${vergleich(zeilen, { max: (f.max ?? 5) - (f.min ?? 1) })}` : '<p class="fussnote links">Dafür braucht es Tages-Check und Morgen-Check an aufeinanderfolgenden Tagen.</p>'}
    ${zuWenig ? `<p class="fussnote links">${zuWenig} weitere mit weniger als ${MINDEST_TAGE} Tagen auf einer Seite.</p>` : ''}
    ${hinweisText(sondertage)}`,
  { sym: 'aktivitaet', unter: `${esc(feldTitel(f))}: Schnitt in der Nacht nach einem Tag mit der Aktivität, gegenüber Nächten ohne.` });
}

const legendeMitOhne = (mit, ohne) => `<div class="legende"><span><i class="legende-mit"></i>${esc(mit)}</span><span><i class="legende-ohne"></i>${esc(ohne)}</span></div>`;

function hinweisText(sondertage) {
  const ohne = sondertage.vorhanden && zustand.sondertage ? ` Tage mit ${sondertage.titel.join(', ')} sind herausgerechnet.` : '';
  return `<p class="fussnote links">Hinweise, keine Belege: Es wird nur gezählt, nicht nach Ursachen gefragt.${ohne}</p>`;
}

// ---------- Auslöser ----------

function ausloeser(k, z) {
  const ziele = ergebnisse(k);
  if (!ziele.length) return leerKarte('Es gibt noch kein Symptom-Feld, gegen das verglichen werden kann.');
  // Standard: das häufigste Symptom im Zeitraum
  const anzahl = (e) => {
    let n = 0;
    for (let t = z.von; t <= z.bis; t = tageVerschieben(t, 1)) if (k.tage.get(t) && e.hat(k.tage.get(t))) n += 1;
    return n;
  };
  if (!ziele.some((e) => e.id === zustand.ziel)) {
    const kandidaten = ziele.some((e) => e.haupt) ? ziele.filter((e) => e.haupt) : ziele;
    zustand.ziel = kandidaten.map((e) => ({ e, n: anzahl(e) })).sort((x, y) => y.n - x.n)[0].e.id;
  }
  const ergebnis = ziele.find((e) => e.id === zustand.ziel);
  const sondertage = sondertagPruefer(k);
  const optionen = { versatz: zustand.versatz, sondertage: zustand.sondertage ? sondertage : null };

  const gruppen = [...new Set(ziele.map((e) => e.gruppe))];
  const auswahl = `
    <label class="auswahl-feld"><span>Symptom</span>
      <select data-ziel>${gruppen.map((g) => `<optgroup label="${esc(g)}">${ziele.filter((e) => e.gruppe === g)
        .map((e) => `<option value="${esc(e.id)}"${e.id === ergebnis.id ? ' selected' : ''}>${esc(e.titel)}</option>`).join('')}</optgroup>`).join('')}</select>
    </label>
    <div class="zeitraum-wahl klein" role="group" aria-label="Wann zählt das Symptom">
      <button type="button" data-versatz="0" aria-pressed="${zustand.versatz === 0}">Gleicher Tag</button>
      <button type="button" data-versatz="1" aria-pressed="${zustand.versatz === 1}">Folgetag</button>
    </div>
    ${sondertage.vorhanden ? `<label class="schalter-zeile"><span>Besondere Tage herausrechnen<small>${esc(sondertage.titel.join(', '))}</small></span>
      <input type="checkbox" class="kippschalter" data-sondertage ${zustand.sondertage ? 'checked' : ''}></label>` : ''}`;

  const essen = essensMerkmale(k).map((m) => anteilVergleich(k, z, m, ergebnis, optionen));
  const tag = tagesMerkmale(k).map((m) => anteilVergleich(k, z, m, ergebnis, optionen));
  const basis = basisAnteil(k, z, ergebnis, optionen);
  const essenQuelle = k.bereiche.find((b) => (b.felder ?? []).some((f) => f.rolle === 'essen'));

  return `
    ${karte(farbeVon(ergebnis.bereich), 'Was löst Beschwerden aus?', auswahl, {
    sym: 'magen',
    unter: `${esc(ergebnis.titel)} ${zustand.versatz ? 'am Folgetag' : 'am selben Tag'}: im Schnitt an <strong>${prozent(basis.anteil)}</strong> von ${tagen(basis.tage)}.`,
  })}
    ${essenQuelle ? karte(farbeVon(essenQuelle.id), 'Essen', `
      ${vergleichsListe(essen, ergebnis)}
      <label class="suche-eingabe rand wort-suche">${symbol('suche', 18)}<input type="search" data-wort placeholder="Eigenes Stichwort prüfen" value="${esc(zustand.wort)}" autocomplete="off"></label>
      <div data-wort-ergebnis>${wortErgebnis(k, z)}</div>`,
    { sym: 'ernaehrung', unter: 'Anteil der Tage mit dem Symptom, wenn du das gegessen hast, gegenüber Tagen ohne. Gezählt wird, ob das Wort im Essen vorkommt, ohne Menge.' }) : ''}
    ${tag.length ? karte('var(--aktivitaet)', 'Tag', vergleichsListe(tag, ergebnis), { sym: 'aktivitaet', unter: 'Dasselbe für Aktivitäten im Tages-Check.' }) : ''}
    ${hinweisText(sondertage)}`;
}

function basisAnteil(k, z, ergebnis, { versatz, sondertage }) {
  let tage = 0;
  let mit = 0;
  for (let t = z.von; t <= z.bis; t = tageVerschieben(t, 1)) {
    const ziel = k.tage.get(versatz ? tageVerschieben(t, versatz) : t);
    if (!ziel?.bereiche.has(ergebnis.bereich)) continue;
    if (sondertage && (sondertage.ist(k.tage.get(t)) || sondertage.ist(ziel))) continue;
    tage += 1;
    if (ergebnis.hat(ziel)) mit += 1;
  }
  return { tage, anteil: tage ? mit / tage : null };
}

function vergleichsZeile(r) {
  const d = r.a - r.b;
  return {
    titel: r.merkmal.titel, unter: `${tageText(r.mit)} mit, ${tageText(r.ohne)} ohne`, a: r.a, b: r.b,
    aText: prozent(r.a), bText: `ohne ${prozent(r.b)}`, ton: Math.abs(d) < 0.08 ? '' : d > 0 ? 'schlecht' : 'gut',
  };
}

function vergleichsListe(ergebnisse, ziel) {
  const genug = ergebnisse.filter((r) => r.genug).sort((x, y) => (y.a - y.b) - (x.a - x.b));
  const zuWenig = ergebnisse.length - genug.length;
  if (!genug.length) return `<p class="fussnote links">Noch zu wenige Tage für einen Vergleich (mindestens ${MINDEST_TAGE} mit und ${MINDEST_TAGE} ohne).</p>`;
  const max = Math.max(0.05, ...genug.flatMap((r) => [r.a, r.b]));
  return `${legendeMitOhne(`mit ${ziel.titel}`, 'ohne')}${vergleich(genug.map(vergleichsZeile), { max })}
    ${zuWenig ? `<p class="fussnote links">${zuWenig} weitere mit weniger als ${MINDEST_TAGE} Tagen auf einer Seite.</p>` : ''}`;
}

function wortErgebnis(k, z) {
  const m = zustand.wort.trim().length >= 3 ? wortMerkmal(k, zustand.wort) : null;
  if (!m) return '';
  const ziel = ergebnisse(k).find((e) => e.id === zustand.ziel);
  const r = anteilVergleich(k, z, m, ziel, { versatz: zustand.versatz, sondertage: zustand.sondertage ? sondertagPruefer(k) : null });
  if (!r.mit) return `<p class="fussnote links">„${esc(zustand.wort.trim())}“ kommt im Zeitraum nicht vor.</p>`;
  if (!r.genug) return `<p class="fussnote links">„${esc(zustand.wort.trim())}“ an ${tagen(r.mit)}, zu wenig für einen Vergleich.</p>`;
  return vergleich([vergleichsZeile(r)], { max: Math.max(0.05, r.a, r.b) });
}

// ---------- Genesung ----------

function genesung(k, z) {
  const beschwerden = (k.genesung?.beschwerden ?? []);
  if (!beschwerden.length) return leerKarte('Noch keine Beschwerden angelegt.');
  const schmerz = new Map(schmerzReihen(k).map((r) => [r.beschwerde.id, r]));
  const karten = beschwerden.map((b) => {
    const reihe = schmerz.get(b.id);
    const liste = termine(k.eintraege, b.id, k).filter((e) => e.zeitpunkt.slice(0, 10) >= z.von && e.zeitpunkt.slice(0, 10) <= z.bis).reverse();
    const uebungen = (b.uebungen ?? []).map((u) => ({ u, liste: uebungsEintraege(k.eintraege, b.id, u.id) }))
      .filter(({ u, liste: l }) => !u.beendet || l.some((e) => e.zeitpunkt.slice(0, 10) >= z.von));
    const hatDaten = (reihe && kennzahl(z.von, z.bis, reihe.wertAm).anzahl) || liste.length || uebungen.some(({ liste: l }) => l.length);
    if (b.status === 'geheilt' && !hatDaten) return '';
    let inhalt = '';
    if (reihe) {
      const jetzt = kennzahl(z.von, z.bis, reihe.wertAm);
      const vorher = z.vorher ? kennzahl(z.vorher.von, z.vorher.bis, reihe.wertAm) : null;
      const ab = abschnitte(z);
      const marken = ab.map((a, i) => (liste.some((e) => e.zeitpunkt.slice(0, 10) >= a.von && e.zeitpunkt.slice(0, 10) <= a.bis) ? i : -1)).filter((i) => i >= 0);
      inhalt += `<div class="teil"><h3>Schmerz 0–10</h3>
        <p class="karte-unter">Schnitt <strong>${zahl(jetzt.wert, 1)}</strong> an ${tagen(jetzt.anzahl)}${vorher?.anzahl ? `, davor ${zahl(vorher.wert, 1)}` : ''}. Niedriger heißt weniger Schmerz.</p>
        ${linie(verlauf(z, reihe.wertAm), { min: 0, max: 10, beschriftung: `Schmerz ${b.titel} im Verlauf`, marken })}
        ${marken.length ? '<div class="legende"><span><i class="legende-termin"></i>Termin</span></div>' : ''}</div>`;
    }
    for (const { u, liste: alle } of uebungen) inhalt += uebungTeil(z, u, alle);
    if (liste.length) {
      inhalt += `<div class="teil"><h3>Termine</h3><ul class="termin-liste">${liste.map((e) => `<li><strong>${esc(tagKurz(e.zeitpunkt))}</strong> ${esc(e.werte.titel || 'Termin')}${e.werte.notiz ? `<br><span>${esc(e.werte.notiz)}</span>` : ''}</li>`).join('')}</ul></div>`;
    }
    if (!inhalt) inhalt = '<p class="fussnote links">Keine Werte im Zeitraum.</p>';
    return karte('var(--genesung)', b.titel, inhalt, { sym: 'genesung', unter: [b.beschreibung, STATUS[b.status]?.titel].filter(Boolean).map(esc).join(' · ') });
  }).join('');
  return karten || leerKarte('Keine Werte im Zeitraum.');
}

function uebungTeil(z, u, alle) {
  const erster = alle.length ? alle.at(-1).zeitpunkt.slice(0, 10) : null;
  if (!erster) return `<div class="teil"><h3>${esc(u.titel)}</h3><p class="karte-unter">Noch nicht eingetragen.</p></div>`;
  const im = alle.filter((e) => e.zeitpunkt.slice(0, 10) >= z.von && e.zeitpunkt.slice(0, 10) <= z.bis);
  const e = erfuellung(u, alle, z.von, z.bis);
  let text;
  if (!e) text = 'Im Zeitraum nicht eingetragen.';
  else {
    const seit = e.start > z.von ? ` (seit ${esc(tagKurz(e.start))})` : '';
    text = e.wochen
      ? `Wochenziel in <strong>${e.wochen.erfuellt}/${e.wochen.moeglich}</strong> Wochen erfüllt${seit}. Pflicht erfüllt an ${e.pflicht}/${e.tage} Tagen.`
      : `Pflicht erfüllt an <strong>${e.pflicht}/${e.tage}</strong> Tagen${seit}.`;
    text += ` Ø ${zahl(e.schnitt, 1)} Einheiten pro Tag (${esc(spanneText(u))}).`;
  }
  let diagramm = '';
  const einheit = u.einheit ?? 'min';
  const zahlen = im.filter((e) => typeof e.werte.wert === 'number');
  if (zahlen.length) {
    const wertIn = (e) => umrechnen(e.werte.wert, e.werte.einheit ?? einheit, einheit);
    const bester = Math.max(...zahlen.map(wertIn));
    text += ` Bestwert ${esc(wertAnzeige(bester, einheit))}.`;
    const proTag = new Map();
    for (const e of zahlen) {
      const t = e.zeitpunkt.slice(0, 10);
      proTag.set(t, Math.max(proTag.get(t) ?? 0, wertIn(e)));
    }
    const punkte = verlauf(z, (t) => proTag.get(t) ?? null);
    diagramm = linie(punkte, { min: 0, max: Math.max(1, ...punkte.map((p) => p.wert ?? 0)) * 1.1, beschriftung: `${u.titel} im Verlauf`, format: (v) => wertAnzeige(Math.round(v), einheit) });
  }
  return `<div class="teil"><h3>${esc(u.titel)}</h3><p class="karte-unter">${text}</p>${diagramm}</div>`;
}

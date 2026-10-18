// Sicherung als JSON, Wiederherstellen, Teilen-Dialog und CSV-Import.
import { allesLesen, allesErsetzen, alle, metaSetzen, vieleSpeichern, SPEICHER } from './db.js';
import { pruefen, BEREICHE, alleFelder } from './konfiguration.js';
import { feldFinden } from './felder.js';
import { bereichAlsCsv, bereichFuerDatei, eintragAlsZeile, importKontext, zeileLesen } from './csv.js';
import { neueId } from './db.js';
import { GENESUNG, GENESUNG_CSV, genesungAlsCsv, genesungZusammenfuehren } from './genesung-daten.js';

export const SICHERUNG_DATEI = 'bauchgefuehl-backup.json';
const APP = 'bauchgefuehl';
const FORMAT = 1;

/** Gesamter Inhalt als Datei im Sicherungsformat. `inhalt`: schon gelesen (allesLesen), sonst wird gelesen. */
export async function sicherungErstellen(inhalt) {
  inhalt ??= await allesLesen();
  const daten = { app: APP, format: FORMAT, art: 'sicherung', erstellt: new Date().toISOString(), ...inhalt };
  const text = JSON.stringify(daten);
  return { datei: new File([text], SICHERUNG_DATEI, { type: 'application/json' }), daten };
}

/** CSV-Dateien aller Bereiche mit CSV-Zuordnung. `inhalt` wie bei sicherungErstellen. */
export async function csvDateienErstellen(inhalt) {
  const { config, eintraege, personen } = inhalt ?? await allesLesen();
  const dateien = config
    .filter((b) => b.csv?.datei && BEREICHE[b.id])
    .map((b) => new File([bereichAlsCsv(b, eintraege, personen)], b.csv.datei, { type: 'text/csv' }));
  const genesung = config.find((b) => b.id === GENESUNG);
  const text = genesung ? genesungAlsCsv(genesung, config, eintraege) : '';
  if (text) dateien.push(new File([text], GENESUNG_CSV, { type: 'text/csv' }));
  return dateien;
}

/**
 * Öffnet den Teilen-Dialog (am iPhone: „In Dateien sichern"). Wo das nicht geht, z. B. am Mac im Browser,
 * werden die Dateien heruntergeladen. Muss direkt aus einem Tipp heraus aufgerufen werden.
 */
export async function teilen(dateien) {
  if (navigator.canShare?.({ files: dateien })) {
    try {
      await navigator.share({ files: dateien });
      return 'geteilt';
    } catch (fehler) {
      if (fehler.name === 'AbortError') return 'abgebrochen';
      throw fehler;
    }
  }
  for (const d of dateien) {
    const url = URL.createObjectURL(d);
    const a = Object.assign(document.createElement('a'), { href: url, download: d.name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  return 'geladen';
}

export async function sicherungVermerken(zeitpunkt = new Date().toISOString()) {
  await metaSetzen('letzteSicherung', zeitpunkt);
}

/**
 * Liest eine Sicherung oder Startdatei und prüft sie. Liefert eine Beschreibung für die Rückfrage.
 * Startdateien enthalten nur Konfiguration (oder sind eine reine Liste von Bereichen).
 */
export async function dateiPruefen(datei) {
  let daten;
  try {
    daten = JSON.parse((await datei.text()).replace(/^﻿/, ''));
  } catch {
    throw new Error('Die Datei ist kein gültiges JSON.');
  }
  if (Array.isArray(daten)) daten = { app: APP, format: FORMAT, art: 'startkonfiguration', config: daten };
  if (daten?.app !== APP) throw new Error('Das ist keine Bauchgefühl-Datei.');
  if (daten.format > FORMAT) throw new Error('Die Datei stammt von einer neueren App-Version. Bitte App aktualisieren.');
  if (!Array.isArray(daten.config)) throw new Error('In der Datei fehlt die Konfiguration.');
  const fehler = daten.config.flatMap(pruefen);
  if (fehler.length) throw new Error(`Konfiguration fehlerhaft: ${fehler.slice(0, 3).join(' ')}`);
  const nurKonfiguration = daten.art === 'startkonfiguration' || !Array.isArray(daten.eintraege);
  if (!nurKonfiguration && daten.eintraege.some((e) => !e?.id || !e.bereich || !e.zeitpunkt)) {
    throw new Error('Einige Einträge in der Datei sind unvollständig.');
  }
  return { daten, nurKonfiguration };
}

/**
 * Neue Konfiguration übernehmen, ohne Optionen zu verlieren, die nur in der bisherigen stehen
 * (aus dem CSV-Import oder in der App angelegt) oder in der App bearbeitet wurden.
 * Bereiche, die in der neuen fehlen, bleiben.
 */
export function konfigurationZusammenfuehren(alt, neu) {
  const ergebnis = neu.map((b) => {
    const vorher = alt.find((x) => x.id === b.id);
    if (!vorher) return b;
    if (b.id === GENESUNG) return genesungZusammenfuehren(vorher, b);
    const kopie = structuredClone(b);
    for (const f of alleFelder(kopie.felder)) {
      const altFeld = feldFinden(vorher.felder, f.id);
      if (!altFeld?.optionen?.length) continue;
      // In der App bearbeitete Optionen (umbenannt, ausgeblendet) behalten ihren Stand.
      f.optionen = (f.optionen ?? []).map((o) => altFeld.optionen.find((x) => x.id === o.id && x.bearbeitet) ?? o);
      const ids = new Set(f.optionen.map((o) => o.id));
      const fehlend = altFeld.optionen.filter((o) => !ids.has(o.id));
      if (fehlend.length) f.optionen = [...f.optionen, ...fehlend];
    }
    return kopie;
  });
  return [...ergebnis, ...alt.filter((a) => !neu.some((b) => b.id === a.id))];
}

/** Spielt eine geprüfte Datei ein. Sicherung: alles ersetzen. Startdatei: nur Konfiguration erneuern. */
export async function einspielen({ daten, nurKonfiguration }) {
  if (nurKonfiguration) {
    const jetzt = await allesLesen();
    await allesErsetzen({ ...jetzt, config: konfigurationZusammenfuehren(jetzt.config, daten.config) });
    return;
  }
  const meta = (daten.meta ?? []).filter((m) => m.schluessel !== 'letzteSicherung');
  // Die eingespielte Datei ist selbst eine Sicherung, ihr Zeitpunkt zählt als letzte Sicherung.
  if (daten.erstellt) meta.push({ schluessel: 'letzteSicherung', wert: daten.erstellt });
  // Ältere Sicherungen ohne Health-Daten lassen die vorhandenen Health-Daten stehen.
  const health = Array.isArray(daten.health) ? daten.health : await alle(SPEICHER.health);
  await allesErsetzen({ config: daten.config, eintraege: daten.eintraege, personen: daten.personen ?? [], meta, health });
}

// ---------- CSV-Import ----------

/**
 * Werte zweier Einträge desselben Tages zusammenführen: Listen vereinigen, Notizen anhängen,
 * Ja gewinnt gegen Nein, sonst bleibt der vorhandene Wert.
 */
function zusammenfuehren(bereich, alt, neu) {
  const werte = structuredClone(alt.werte ?? {});
  for (const [id, v] of Object.entries(neu.werte)) {
    const f = (bereich.felder ?? []).find((x) => x.id === id);
    const a = werte[id];
    if (a === undefined) werte[id] = v;
    else if (f?.typ === 'text') werte[id] = String(a).includes(v) ? a : `${a} · ${v}`;
    else if (typeof v === 'boolean') werte[id] = a === true || v;
    else if (v && typeof v === 'object' && !Array.isArray(v) && typeof a === 'object') {
      for (const [k, inhalt] of Object.entries(v)) werte[id][k] = { ...inhalt, ...(a[k] ?? {}) };
    } else if (Array.isArray(v) && Array.isArray(a)) werte[id] = [...new Set([...a, ...v])];
    // Sonst bleibt der vorhandene Wert, damit ein erneuter Import nichts mehr ändert.
  }
  return { ...alt, werte, geaendert: new Date().toISOString() };
}

/**
 * Importiert CSV-Dateien. Gleiche Zeilen, die schon vorhanden sind, werden übersprungen,
 * so kann dieselbe Datei gefahrlos mehrfach importiert werden.
 */
export async function csvImportieren(dateien) {
  const [bereiche, vorhandene, personen] = await Promise.all([alle(SPEICHER.config), alle(SPEICHER.eintraege), alle(SPEICHER.personen)]);
  const kontext = importKontext(personen);
  const bericht = { dateien: [], neuePersonen: [], neueOptionen: [] };
  const neueEintraege = new Map(); // id → Eintrag (neu oder zusammengeführt)

  for (const datei of dateien) {
    const bereich = bereichFuerDatei(datei.name, bereiche);
    const zeile = { name: datei.name, bereich: bereich?.kurztitel ?? bereich?.titel, neu: 0, doppelt: 0, zusammengefuehrt: 0, fehler: [] };
    bericht.dateien.push(zeile);
    if (!bereich) { zeile.uebersprungen = 'Keine Zuordnung für diese Datei'; continue; }

    const tagesweise = bereich.zeitart === 'tag';
    const eigene = [...vorhandene, ...neueEintraege.values()].filter((e) => e.bereich === bereich.id);
    // Vorhandene Zeilen zählen, damit echte Wiederholungen (z. B. zweimal um 10:00) erhalten bleiben.
    const bekannt = new Map();
    for (const e of eigene) {
      const z = eintragAlsZeile(bereich, e, kontext.personen);
      bekannt.set(z, (bekannt.get(z) ?? 0) + 1);
    }
    const proTag = new Map(tagesweise ? eigene.map((e) => [e.zeitpunkt.slice(0, 10), e]) : []);

    const text = (await datei.text()).replace(/^﻿/, '');
    text.split(/\r?\n/).forEach((roh, i) => {
      if (!roh.trim()) return;
      let gelesen;
      try {
        gelesen = zeileLesen(bereich, roh, kontext);
      } catch (fehler) {
        zeile.fehler.push(`Zeile ${i + 1}: ${fehler.message}`);
        return;
      }
      const jetzt = new Date().toISOString();
      const eintrag = { id: neueId(), ...gelesen, quelle: 'csv', erstellt: jetzt, geaendert: jetzt };
      const z = eintragAlsZeile(bereich, eintrag, kontext.personen);
      if (bekannt.get(z) > 0) {
        bekannt.set(z, bekannt.get(z) - 1);
        zeile.doppelt += 1;
        return;
      }
      if (tagesweise && proTag.has(eintrag.zeitpunkt.slice(0, 10))) {
        const alt = proTag.get(eintrag.zeitpunkt.slice(0, 10));
        const gemischt = zusammenfuehren(bereich, alt, eintrag);
        // Ändert das Zusammenführen nichts, war die Zeile schon enthalten.
        if (eintragAlsZeile(bereich, gemischt, kontext.personen) === eintragAlsZeile(bereich, alt, kontext.personen)) {
          zeile.doppelt += 1;
          return;
        }
        proTag.set(eintrag.zeitpunkt.slice(0, 10), gemischt);
        neueEintraege.set(gemischt.id, gemischt);
        zeile.zusammengefuehrt += 1;
        return;
      }
      if (tagesweise) proTag.set(eintrag.zeitpunkt.slice(0, 10), eintrag);
      neueEintraege.set(eintrag.id, eintrag);
      zeile.neu += 1;
    });
  }

  await vieleSpeichern({
    eintraege: [...neueEintraege.values()],
    personen: kontext.neuePersonen,
    config: bereiche.filter((b) => kontext.configGeaendert.has(b.id)),
  });
  bericht.neuePersonen = kontext.neuePersonen.map((p) => p.name);
  bericht.neueOptionen = kontext.neueOptionen;
  return bericht;
}

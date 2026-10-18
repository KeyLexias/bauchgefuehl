// Rechenteil der Auswertung. Arbeitet nur über Bereiche, Feldtypen und Rollen, nie über konkrete Inhalte.
import { alle, SPEICHER } from './db.js';
import { BEREICHE, TAGESZEITEN } from './konfiguration.js';
import { alsDatum, datumText, tageVerschieben, tageszeitVon } from './hilfen.js';
import { GENESUNG, schmerzWerte } from './genesung-daten.js';

export const ZEITRAEUME = [
  { id: '30', titel: '30 Tage', tage: 30 },
  { id: '90', titel: '90 Tage', tage: 90 },
  { id: '365', titel: '1 Jahr', tage: 365 },
  { id: 'alles', titel: 'Alles' },
];

// Rollen, die in der Auswertung nie erscheinen: privat oder Freitext.
const VERBORGEN = new Set(['partner', 'geschuetzt', 'notiz', 'beschreibung']);
// Skalen, die als Verlauf gezeigt werden. Schmerz kommt über die Genesung.
export const VERLAUF_ROLLEN = ['befinden', 'stimmung', 'energie', 'stress'];
// Mindestanzahl Tage je Seite, damit ein Vergleich angezeigt wird.
export const MINDEST_TAGE = 5;

export const schnitt = (zahlen) => (zahlen.length ? zahlen.reduce((s, x) => s + x, 0) / zahlen.length : null);
export const titelVon = (x) => x?.kurztitel ?? x?.titel ?? '';
export const feldTitel = (f) => f.kurz ?? f.titel;
/** Zählt eine Option in der Auswertung? Nicht bei „nichts" (exklusiv) und nicht, wenn das Feld sie per Muster ausnimmt. */
export function zaehlt(f, o) {
  if (o?.exklusiv) return false;
  if (!f?.auswertungOhne) return true;
  try { return !new RegExp(f.auswertungOhne, 'i').test(o?.titel ?? ''); } catch { return true; }
}
const optionen = (f) => (f?.optionen ?? []).filter((o) => zaehlt(f, o));

/** Alle Werte eines Eintrags mit Feld, auch aus Zusatzfragen; `ueber` ist die Option, zu der sie gehören. */
export function werteVon(felder, werte, ueber) {
  const aus = [];
  for (const f of felder ?? []) {
    if (VERBORGEN.has(f.rolle)) continue;
    const v = werte?.[f.id];
    if (v === undefined || v === null || v === '') continue;
    aus.push({ feld: f, wert: v, ueber });
    if (f.typ === 'einfach') {
      const o = (f.optionen ?? []).find((x) => x.id === v);
      if (o?.zusatz) aus.push(...werteVon(o.zusatz, werte, ueber));
    } else if (f.typ === 'person' && f.zusatz) {
      aus.push(...werteVon(f.zusatz, werte, ueber));
    } else if (f.typ === 'mehrfach' && typeof v === 'object') {
      for (const [id, inhalt] of Object.entries(v)) {
        const o = (f.optionen ?? []).find((x) => x.id === id) ?? { id, titel: id };
        const zusatz = [...(o.zusatz ?? []), ...(o.ohneJeOption ? [] : f.jeOption ?? [])];
        if (zusatz.length) aus.push(...werteVon(zusatz, inhalt, o));
      }
    }
  }
  return aus;
}

/** Felder eines Bereichs in Reihenfolge, mit der Option, unter der sie stehen. */
export function felderVon(felder, ueber) {
  const aus = [];
  for (const f of felder ?? []) {
    if (VERBORGEN.has(f.rolle)) continue;
    aus.push({ feld: f, ueber });
    for (const o of f.optionen ?? []) {
      if (o.zusatz) aus.push(...felderVon(o.zusatz, f.typ === 'mehrfach' ? o : ueber));
    }
    if (f.typ === 'person' && f.zusatz) aus.push(...felderVon(f.zusatz, ueber));
  }
  return aus;
}

/** Tageszeit eines Eintrags: aus dem Feld, sonst aus der Uhrzeit. */
export function tageszeitEintrag(bereich, e) {
  const f = (bereich.felder ?? []).find((x) => x.typ === 'tageszeit');
  const v = f ? e.werte?.[f.id] : undefined;
  return v && v !== 'jetzt' ? v : tageszeitVon(e.zeitpunkt);
}
export const TAGESZEIT_SPALTEN = TAGESZEITEN.filter((t) => t.uhrzeit);

// ---------- Tage ----------

/**
 * Ein Tag mit allem, was die Vergleiche brauchen:
 * bereiche (Ids mit Eintrag), wahl (Schlüssel „bereich.feld=option"), zahlen (Schlüssel → Werte), texte (Freitext mit Rolle essen).
 */
function neuerTag(tag) {
  return { tag, bereiche: new Set(), wahl: new Set(), zahlen: new Map(), texte: [] };
}

export function tageBauen(bereiche, eintraege) {
  const nachId = new Map(bereiche.map((b) => [b.id, b]));
  const tage = new Map();
  for (const e of eintraege) {
    const b = nachId.get(e.bereich);
    if (!b) continue;
    const tag = e.zeitpunkt.slice(0, 10);
    if (!tage.has(tag)) tage.set(tag, neuerTag(tag));
    const t = tage.get(tag);
    t.bereiche.add(b.id);
    for (const { feld: f, wert: v } of werteVon(b.felder, e.werte)) {
      const k = `${b.id}.${f.id}`;
      if (f.typ === 'skala' || f.typ === 'zahl') {
        if (typeof v === 'number') t.zahlen.set(k, [...(t.zahlen.get(k) ?? []), v]);
      } else if (f.typ === 'einfach') t.wahl.add(`${k}=${v}`);
      else if (f.typ === 'mehrfach') for (const id of Object.keys(v)) t.wahl.add(`${k}=${id}`);
      else if (f.typ === 'person') for (const id of v) t.wahl.add(`${k}=${id}`);
      else if (f.typ === 'janein' && v === true) t.wahl.add(`${k}=ja`);
      else if (f.typ === 'text' && f.rolle === 'essen') t.texte.push(String(v).toLocaleLowerCase('de'));
    }
  }
  // Bereiche, in denen nur Abweichungen eingetragen werden: Ein erfasster Tag ohne Eintrag dort gilt als Normalfall,
  // also bester Wert auf den Befinden-Skalen und keine Auswahl.
  const erfasst = new Set(bereiche.filter((b) => !b.ohneEingabe).map((b) => b.id));
  for (const b of bereiche.filter((x) => x.ohneEintragNormal)) {
    const skalen = (b.felder ?? []).filter((f) => f.typ === 'skala' && f.rolle === 'befinden');
    for (const t of tage.values()) {
      if (t.bereiche.has(b.id) || ![...t.bereiche].some((id) => erfasst.has(id))) continue;
      t.bereiche.add(b.id);
      for (const f of skalen) t.zahlen.set(`${b.id}.${f.id}`, [f.max ?? 5]);
    }
  }
  return tage;
}

/** Erfasste Tage eines Bereichs im Zeitraum, mit Normaltagen ohne Eintrag (siehe ohneEintragNormal). */
export function erfassteTage(k, bereichId, von, bis) {
  let n = 0;
  for (let t = von; t <= bis; t = tageVerschieben(t, 1)) if (k.tage.get(t)?.bereiche.has(bereichId)) n += 1;
  return n;
}

/** Tageswert einer Zahl: Schnitt der Einträge des Tages. */
export const tagesWert = (t, schluessel) => schnitt(t?.zahlen.get(schluessel) ?? []);

// ---------- Laden und Zeitraum ----------

export async function auswertungLaden() {
  const [configs, eintraege, personen, healthTage] = await Promise.all([
    alle(SPEICHER.config), alle(SPEICHER.eintraege), alle(SPEICHER.personen), alle(SPEICHER.health),
  ]);
  const bereiche = configs
    .filter((b) => BEREICHE[b.id] && b.id !== GENESUNG && b.felder?.length && !b.ausgeblendet)
    .sort((a, b) => (a.reihenfolge ?? 99) - (b.reihenfolge ?? 99));
  const genesung = configs.find((b) => b.id === GENESUNG);
  const tage = tageBauen(bereiche, eintraege);
  const erster = eintraege.reduce((m, e) => (e.zeitpunkt < m ? e.zeitpunkt : m), datumText()).slice(0, 10);
  const ersterJe = {};
  for (const e of eintraege) {
    const t = e.zeitpunkt.slice(0, 10);
    if (!ersterJe[e.bereich] || t < ersterJe[e.bereich]) ersterJe[e.bereich] = t;
  }
  const health = new Map(healthTage.map((d) => [d.tag, d]));
  return { configs, bereiche, genesung, eintraege, personen, tage, erster, ersterJe, health };
}

export const bereich = (k, id) => k.bereiche.find((b) => b.id === id);

/** Zeitraum bis heute; `vorher` ist der gleich lange Abschnitt davor (nicht bei „Alles"). */
export function zeitraum(k, id) {
  const z = ZEITRAEUME.find((x) => x.id === id) ?? ZEITRAEUME[1];
  const bis = datumText();
  const von = z.tage ? tageVerschieben(bis, -(z.tage - 1)) : k.erster;
  const tage = Math.round((alsDatum(bis) - alsDatum(von)) / 864e5) + 1;
  const vorher = z.tage ? { von: tageVerschieben(von, -z.tage), bis: tageVerschieben(von, -1) } : null;
  const art = tage <= 45 ? 'tag' : tage <= 400 ? 'woche' : 'monat';
  return { id: z.id, von, bis, tage, vorher, art };
}

export const imZeitraum = (z, tag) => tag >= z.von && tag <= z.bis;

export function eintraegeIm(k, bereichId, von, bis) {
  return k.eintraege.filter((e) => e.bereich === bereichId && e.zeitpunkt.slice(0, 10) >= von && e.zeitpunkt.slice(0, 10) <= bis);
}

const fmtTagMonat = new Intl.DateTimeFormat('de-AT', { day: 'numeric', month: 'numeric' });
const MONATE = ['Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

/** Abschnitte für Verläufe: Tage, Wochen (ab Beginn) oder Kalendermonate. */
export function abschnitte(z) {
  const liste = [];
  if (z.art === 'monat') {
    let [j, m] = z.von.split('-').map(Number);
    for (;;) {
      const von = `${j}-${String(m).padStart(2, '0')}-01`;
      if (von > z.bis) break;
      const ende = datumText(new Date(j, m, 0));
      liste.push({ von: von < z.von ? z.von : von, bis: ende > z.bis ? z.bis : ende, titel: `${MONATE[m - 1]}${m === 1 || !liste.length ? ` ${String(j).slice(2)}` : ''}` });
      m += 1;
      if (m > 12) { m = 1; j += 1; }
    }
    return liste;
  }
  const schritt = z.art === 'woche' ? 7 : 1;
  for (let von = z.von; von <= z.bis; von = tageVerschieben(von, schritt)) {
    const bis = tageVerschieben(von, schritt - 1);
    liste.push({ von, bis: bis > z.bis ? z.bis : bis, titel: fmtTagMonat.format(alsDatum(von)) });
  }
  return liste;
}

/** Werte je Abschnitt aus einer Funktion tag → Zahl oder null (Schnitt der Tage mit Wert). */
export function verlauf(z, wertAm) {
  return abschnitte(z).map((a) => {
    const werte = [];
    for (let t = a.von; t <= a.bis; t = tageVerschieben(t, 1)) {
      const v = wertAm(t);
      if (v !== null && v !== undefined) werte.push(v);
    }
    return { ...a, wert: schnitt(werte), anzahl: werte.length };
  });
}

/** Schnitt und Anzahl Tage einer Tagesfunktion in einem Abschnitt. */
export function kennzahl(von, bis, wertAm) {
  const werte = [];
  for (let t = von; t <= bis; t = tageVerschieben(t, 1)) {
    const v = wertAm(t);
    if (v !== null && v !== undefined) werte.push(v);
  }
  return { wert: schnitt(werte), anzahl: werte.length };
}

// ---------- Messreihen für den Überblick ----------

/**
 * Alle Verläufe: Skalen mit Verlaufs-Rolle, Schmerz je Beschwerde und Einträge pro Tag
 * bei Bereichen ohne eigene Skala. Jede Reihe: { id, titel, farbe, min, max, ansicht, wertAm(tag) }.
 */
export function messreihen(k) {
  const reihen = [];
  const ansichtVon = (b) => ({ magen: 'bauch', stuhlgang: 'bauch', schlaf: 'schlaf', aktivitaeten: 'tag' })[b.id] ?? 'ueberblick';
  for (const b of k.bereiche) {
    if (b.ohneEingabe) continue;
    const skalen = (b.felder ?? []).filter((f) => f.typ === 'skala' && VERLAUF_ROLLEN.includes(f.rolle) && !f.ausgeblendet);
    for (const f of skalen) {
      const s = `${b.id}.${f.id}`;
      reihen.push({
        id: s, titel: feldTitel(f), farbe: BEREICHE[b.id].farbe,
        min: f.min ?? 1, max: f.max ?? 5, ansicht: ansichtVon(b), wertAm: (t) => tagesWert(k.tage.get(t), s),
        enden: [f.links, f.rechts],
      });
    }
    if (!skalen.length && b.zeitart !== 'tag') {
      const proTag = new Map();
      for (const e of k.eintraege) if (e.bereich === b.id) proTag.set(e.zeitpunkt.slice(0, 10), (proTag.get(e.zeitpunkt.slice(0, 10)) ?? 0) + 1);
      reihen.push({
        id: `${b.id}.anzahl`, titel: `${titelVon(b)} pro Tag`, farbe: BEREICHE[b.id].farbe, min: 0, max: 4, ansicht: ansichtVon(b),
        // Tage ohne Eintrag zählen als 0, aber erst ab dem ersten Eintrag des Bereichs.
        wertAm: (t) => proTag.get(t) ?? (t >= (k.ersterJe[b.id] ?? k.erster) ? 0 : null), anzahl: true,
      });
    }
  }
  for (const s of schmerzReihen(k)) reihen.push(s);
  for (const r of healthReihen(k)) reihen.push(r);
  return reihen;
}

// ---------- Health-Daten ----------

const minutenSumme = (liste) => (liste ?? []).reduce((n, x) => n + (x.minuten ?? 0), 0);

/** Tageswerte aus dem Health-Import. Jede Art: { id, titel, einheit, stellen, wert(tag) }, Tage ohne Wert liefern null. */
export const HEALTH_WERTE = {
  schlaf: { titel: 'Schlafdauer', einheit: 'h', stellen: 1, wert: (d) => (d.schlaf?.dauer ? d.schlaf.dauer / 60 : null) },
  training: { titel: 'Training', einheit: 'min', stellen: 0, wert: (d) => minutenSumme(d.training), abErstem: true },
  kcal: { titel: 'Gegessen', einheit: 'kcal', stellen: 0, wert: (d) => d.ernaehrung?.kcal ?? null },
  eiweiss: { titel: 'Eiweiß', einheit: 'g', stellen: 0, wert: (d) => d.ernaehrung?.eiweiss ?? null },
  kohlenhydrate: { titel: 'Kohlenhydrate', einheit: 'g', stellen: 0, wert: (d) => d.ernaehrung?.kohlenhydrate ?? null },
  fett: { titel: 'Fett', einheit: 'g', stellen: 0, wert: (d) => d.ernaehrung?.fett ?? null },
  zucker: { titel: 'Zucker', einheit: 'g', stellen: 0, wert: (d) => d.ernaehrung?.zucker ?? null },
  ballaststoffe: { titel: 'Ballaststoffe', einheit: 'g', stellen: 1, wert: (d) => d.ernaehrung?.ballaststoffe ?? null },
  wasser: { titel: 'Wasser', einheit: 'ml', stellen: 0, wert: (d) => d.ernaehrung?.wasser ?? null },
  ruhepuls: { titel: 'Ruhepuls', einheit: 'Schläge/min', stellen: 0, wert: (d) => d.ruhepuls ?? null },
  hrv: { titel: 'HRV', einheit: 'ms', stellen: 0, wert: (d) => d.hrv ?? null },
  atemfrequenz: { titel: 'Atemfrequenz', einheit: 'Atemzüge/min', stellen: 1, wert: (d) => d.atemfrequenz ?? null },
  sauerstoff: { titel: 'Blutsauerstoff', einheit: '%', stellen: 1, wert: (d) => d.sauerstoff ?? null },
  temperatur: { titel: 'Handgelenk-Temperatur', einheit: '°C', stellen: 2, wert: (d) => d.temperatur ?? null },
  gewicht: { titel: 'Gewicht', einheit: 'kg', stellen: 1, wert: (d) => d.gewicht ?? null },
  schritte: { titel: 'Schritte', einheit: '', stellen: 0, wert: (d) => d.schritte ?? null },
  aktivEnergie: { titel: 'Aktive Energie', einheit: 'kcal', stellen: 0, wert: (d) => d.aktivEnergie ?? null },
  tageslicht: { titel: 'Tageslicht', einheit: 'min', stellen: 0, wert: (d) => d.tageslicht ?? null },
  achtsamkeit: { titel: 'Achtsamkeit', einheit: 'min', stellen: 0, wert: (d) => d.achtsamkeit ?? null },
};

/**
 * Tagesfunktion für einen Health-Wert. Bei Arten mit abErstem (z. B. Training) zählt ein Tag mit Health-Daten,
 * aber ohne Wert als 0, erst ab dem ersten Tag mit Wert.
 */
export function healthWertAm(k, id) {
  const art = HEALTH_WERTE[id];
  if (!art) return () => null;
  let erster = null;
  if (art.abErstem) {
    for (const d of k.health.values()) if (art.wert(d) && (!erster || d.tag < erster)) erster = d.tag;
  }
  return (t) => {
    const d = k.health.get(t);
    if (!d) return null;
    if (art.abErstem) return erster && t >= erster ? art.wert(d) : null;
    const v = art.wert(d);
    return v === null || v === undefined ? null : v;
  };
}

/** Hat irgendein Tag einen Wert dieser Art? */
export const healthHat = (k, id) => [...k.health.values()].some((d) => { const v = HEALTH_WERTE[id]?.wert(d); return v !== null && v !== undefined && v !== 0; });

/** Verläufe aus Health für Überblick und Zeitstrahl: Schlafdauer, Training, Gegessen. */
export function healthReihen(k) {
  const auswahl = [
    { id: 'schlaf', farbe: '--schlaf', ansicht: 'schlaf' },
    { id: 'training', farbe: '--aktivitaet', ansicht: 'tag', einheit: 'min/Tag' },
    { id: 'kcal', farbe: '--ernaehrung', ansicht: 'ernaehrung' },
  ];
  return auswahl.filter((r) => healthHat(k, r.id)).map((r) => {
    const art = HEALTH_WERTE[r.id];
    return {
      id: `health.${r.id}`, titel: art.titel, farbe: r.farbe, ansicht: r.ansicht, einheit: r.einheit ?? art.einheit,
      stellen: art.stellen, min: 0, frei: true, wertAm: healthWertAm(k, r.id),
    };
  });
}

/** Health-Tage im Zeitraum, aufsteigend. */
export function healthIm(k, von, bis) {
  const liste = [];
  for (let t = von; t <= bis; t = tageVerschieben(t, 1)) if (k.health.has(t)) liste.push(k.health.get(t));
  return liste;
}

/** „HH:MM" als Minuten; Zeiten vor `wende` Uhr zählen zum Folgetag, damit Mitternacht nicht den Schnitt verzerrt. */
export function uhrMinuten(text, wende = 12) {
  if (!text) return null;
  const [h, m] = text.split(':').map(Number);
  return (h < wende ? h + 24 : h) * 60 + m;
}
export function uhrText(minuten) {
  if (minuten === null || minuten === undefined) return '–';
  const m = Math.round(minuten) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Schmerz 0–10 je Beschwerde, die schon Werte hat. */
export function schmerzReihen(k) {
  return (k.genesung?.beschwerden ?? []).map((b) => {
    const werte = schmerzWerte(b, k.configs, k.eintraege);
    return {
      id: `schmerz.${b.id}`, titel: `Schmerz ${b.titel}`, beschwerde: b, farbe: BEREICHE.genesung.farbe, min: 0, max: 10,
      ansicht: 'genesung', wertAm: (t) => werte.get(t) ?? null, werte,
    };
  }).filter((r) => r.werte.size);
}

// ---------- Statistik eines Bereichs ----------

/**
 * Zählt je Feld eines Bereichs: Skalen (Werte), Einfachauswahl (Einträge je Option),
 * Mehrfachauswahl und Personen (Tage je Option, Stufen), Ja/Nein (Tage mit Ja).
 * Liefert eine Liste { feld, ueber, typ, werte?, zaehler: Map(id → { tage:Set, eintraege, stufen:Map }), eintraege }.
 */
export function bereichStatistik(b, eintraege) {
  const stat = new Map();
  for (const { feld, ueber } of felderVon(b.felder)) {
    if (['text', 'datumzeit', 'tageszeit'].includes(feld.typ) || feld.ausgeblendet) continue;
    stat.set(`${ueber?.id ?? ''}/${feld.id}`, { feld, ueber, werte: [], zaehler: new Map(), eintraege: 0, tage: new Set() });
  }
  const zaehlen = (s, id, tag, stufe) => {
    if (!s.zaehler.has(id)) s.zaehler.set(id, { tage: new Set(), eintraege: 0, stufen: new Map() });
    const z = s.zaehler.get(id);
    z.tage.add(tag);
    z.eintraege += 1;
    if (stufe) z.stufen.set(stufe, (z.stufen.get(stufe) ?? 0) + 1);
  };
  for (const e of eintraege) {
    const tag = e.zeitpunkt.slice(0, 10);
    for (const { feld: f, wert: v, ueber } of werteVon(b.felder, e.werte)) {
      const s = stat.get(`${ueber?.id ?? ''}/${f.id}`);
      if (!s) continue;
      s.eintraege += 1;
      s.tage.add(tag);
      if (f.typ === 'skala' || f.typ === 'zahl') { if (typeof v === 'number') s.werte.push(v); }
      else if (f.typ === 'einfach') { if (zaehlt(f, (f.optionen ?? []).find((o) => o.id === v))) zaehlen(s, v, tag); }
      else if (f.typ === 'mehrfach') {
        for (const [id, inhalt] of Object.entries(v)) {
          if (!zaehlt(f, (f.optionen ?? []).find((o) => o.id === id))) continue;
          zaehlen(s, id, tag, inhalt?.stufe);
        }
      } else if (f.typ === 'person') for (const id of v) zaehlen(s, id, tag);
      else if (f.typ === 'janein' && v === true) zaehlen(s, 'ja', tag);
      else if (f.typ === 'dauer') zaehlen(s, String(v), tag);
    }
  }
  return [...stat.values()];
}

/** Optionen eines Felds als Zeilen mit Anzahl, in Konfigurations-Reihenfolge oder nach Häufigkeit. */
export function optionsZeilen(s, { personen = [], sortieren = s.feld.typ !== 'einfach', nachTagen = s.feld.typ !== 'einfach' } = {}) {
  const f = s.feld;
  const titel = (id) => {
    if (f.typ === 'person') return personen.find((p) => p.id === id)?.name ?? '?';
    if (f.typ === 'janein') return feldTitel(f);
    if (f.typ === 'dauer') return titelVon((f.stufen ?? []).find((x) => x.id === id)) || `${id} min`;
    return (f.optionen ?? []).find((o) => o.id === id)?.titel ?? id;
  };
  const reihenfolge = f.typ === 'einfach' || f.typ === 'mehrfach'
    ? [...optionen(f).map((o) => o.id), ...[...s.zaehler.keys()].filter((id) => !optionen(f).some((o) => o.id === id))]
    : [...s.zaehler.keys()];
  const zeilen = reihenfolge.filter((id) => s.zaehler.has(id)).map((id) => {
    const z = s.zaehler.get(id);
    const o = (f.optionen ?? []).find((x) => x.id === id);
    return { id, titel: titel(id), zeichen: o?.zeichen, anzahl: nachTagen ? z.tage.size : z.eintraege, stufen: z.stufen, hinweis: o?.hinweis, ton: o?.kurzTon };
  });
  return sortieren ? zeilen.sort((a, b) => b.anzahl - a.anzahl) : zeilen;
}

/** Angaben mit Hinweis (z. B. „ärztlich abklären"), je Option mit Anzahl und Tagen. */
export function warnzeichen(b, eintraege) {
  const treffer = new Map();
  for (const e of eintraege) {
    for (const { feld: f, wert: v } of werteVon(b.felder, e.werte)) {
      const ids = f.typ === 'einfach' ? [v] : f.typ === 'mehrfach' ? Object.keys(v) : [];
      for (const id of ids) {
        const o = (f.optionen ?? []).find((x) => x.id === id);
        if (!o?.hinweis) continue;
        const t = treffer.get(o.id) ?? { option: o, feld: f, tage: [] };
        t.tage.push(e.zeitpunkt.slice(0, 10));
        treffer.set(o.id, t);
      }
    }
  }
  return [...treffer.values()];
}

// ---------- Merkmale und Vergleiche ----------

/** Hauptfeld für Symptome: Mehrfachauswahl mit Rolle symptom (mit Stärke-Stufen bevorzugt). */
export function symptomFelder(b) {
  return (b.felder ?? []).filter((f) => f.typ === 'mehrfach' && f.rolle === 'symptom' && !f.ausgeblendet)
    .sort((x, y) => Number(!!y.stufen) - Number(!!x.stufen));
}

/** Ergebnisse, gegen die verglichen werden kann: jede Symptom-Option jedes Bereichs. */
export function ergebnisse(k) {
  const liste = [];
  for (const b of k.bereiche) {
    for (const f of symptomFelder(b)) {
      for (const o of optionen(f)) {
        const s = `${b.id}.${f.id}=${o.id}`;
        liste.push({ id: s, titel: o.titel, gruppe: titelVon(b), bereich: b.id, haupt: !!f.stufen, hat: (t) => t.wahl.has(s) });
      }
    }
  }
  // Symptome mit Stärke (Hauptfeld) zuerst
  return liste.sort((x, y) => Number(y.haupt) - Number(x.haupt));
}

/** Tage, die wegen Besonderheiten (Option mit sondertag) bei Vergleichen nicht mitzählen. */
export function sondertagPruefer(k) {
  const schluessel = [];
  for (const b of k.bereiche) {
    for (const f of (b.felder ?? []).filter((x) => x.rolle === 'besonderheit' && x.typ === 'mehrfach')) {
      const markiert = optionen(f).filter((o) => o.sondertag);
      for (const o of markiert.length ? markiert : optionen(f)) schluessel.push({ s: `${b.id}.${f.id}=${o.id}`, titel: o.titel });
    }
  }
  return { titel: schluessel.map((x) => x.titel), ist: (t) => !!t && schluessel.some((x) => t.wahl.has(x.s)), vorhanden: schluessel.length > 0 };
}

/** Merkmale aus Essen: je Gruppe der Konfiguration ein Suchmuster über die Freitexte. */
export function essensMerkmale(k) {
  const liste = [];
  for (const b of k.bereiche) {
    for (const g of b.gruppen ?? []) {
      let muster;
      try { muster = new RegExp(g.muster, 'i'); } catch { continue; }
      liste.push({ id: `${b.id}:${g.id}`, titel: g.titel, quelle: b.id, hat: (t) => t.texte.some((x) => muster.test(x)) });
    }
  }
  return liste;
}

/** Merkmal für ein frei eingegebenes Wort im Essen. */
export function wortMerkmal(k, wort) {
  const w = wort.trim().toLocaleLowerCase('de');
  const quelle = k.bereiche.find((b) => (b.felder ?? []).some((f) => f.rolle === 'essen'))?.id;
  if (!w || !quelle) return null;
  return { id: `wort:${w}`, titel: `„${wort.trim()}“`, quelle, hat: (t) => t.texte.some((x) => x.includes(w)) };
}

/** Merkmale eines Tages-Bereichs: Aktivitäten (Optionen) und „spät" (alle Ja/Nein mit Rolle spaet zusammen). */
export function tagesMerkmale(k) {
  const liste = [];
  for (const b of k.bereiche) {
    for (const f of (b.felder ?? []).filter((x) => x.typ === 'mehrfach' && x.rolle === 'aktivitaet' && !x.ausgeblendet)) {
      for (const o of optionen(f)) {
        const s = `${b.id}.${f.id}=${o.id}`;
        liste.push({ id: s, titel: o.titel, quelle: b.id, hat: (t) => t.wahl.has(s) });
      }
    }
    const spaet = felderVon(b.felder).filter(({ feld }) => feld.typ === 'janein' && feld.rolle === 'spaet');
    if (spaet.length) {
      const oben = spaet.find((x) => !x.ueber)?.feld ?? spaet[0].feld;
      const schluessel = spaet.map(({ feld }) => `${b.id}.${feld.id}=ja`);
      liste.push({ id: `${b.id}:spaet`, titel: feldTitel(oben), quelle: b.id, hat: (t) => schluessel.some((s) => t.wahl.has(s)) });
    }
  }
  return liste;
}

/**
 * Anteil der Tage mit Ergebnis, an Tagen mit Merkmal gegenüber Tagen ohne.
 * versatz 1: Ergebnis am Folgetag. Gezählt werden nur Tage, an denen beide Bereiche Einträge haben.
 */
export function anteilVergleich(k, z, merkmal, ergebnis, { versatz = 0, sondertage = null } = {}) {
  const mit = [];
  const ohne = [];
  for (let t = z.von; t <= z.bis; t = tageVerschieben(t, 1)) {
    const heute = k.tage.get(t);
    const ziel = k.tage.get(versatz ? tageVerschieben(t, versatz) : t);
    if (!heute?.bereiche.has(merkmal.quelle) || !ziel?.bereiche.has(ergebnis.bereich)) continue;
    if (sondertage && (sondertage.ist(heute) || sondertage.ist(ziel))) continue;
    (merkmal.hat(heute) ? mit : ohne).push(ergebnis.hat(ziel));
  }
  const anteil = (l) => (l.length ? l.filter(Boolean).length / l.length : null);
  return { merkmal, mit: mit.length, ohne: ohne.length, a: anteil(mit), b: anteil(ohne), genug: mit.length >= MINDEST_TAGE && ohne.length >= MINDEST_TAGE };
}

/** Schnitt einer Zahl am Folgetag (z. B. Schlaf), nach Tagen mit Merkmal gegenüber Tagen ohne. */
export function wertVergleich(k, z, merkmal, wertAm, { versatz = 1, sondertage = null } = {}) {
  const mit = [];
  const ohne = [];
  for (let t = z.von; t <= z.bis; t = tageVerschieben(t, 1)) {
    const heute = k.tage.get(t);
    const folge = tageVerschieben(t, versatz);
    const v = wertAm(folge);
    if (!heute?.bereiche.has(merkmal.quelle) || v === null || v === undefined) continue;
    if (sondertage && (sondertage.ist(heute) || sondertage.ist(k.tage.get(folge)))) continue;
    (merkmal.hat(heute) ? mit : ohne).push(v);
  }
  return { merkmal, mit: mit.length, ohne: ohne.length, a: schnitt(mit), b: schnitt(ohne), genug: mit.length >= MINDEST_TAGE && ohne.length >= MINDEST_TAGE };
}

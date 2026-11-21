// Genesung: Aufbau der Konfiguration, Berechnungen und CSV. Der Code kennt keine konkreten Beschwerden.
//
// Konfiguration (ein Dokument „genesung" im Speicher „config"):
//   beschwerden  Liste von Beschwerden
//
// Beschwerde:
//   id, titel, beschreibung (z. B. betroffene Stelle), seit ('JJJJ-MM'), symbol oder pfad
//   status       'aktiv' | 'pausiert' | 'geheilt', statusSeit ('JJJJ-MM-TT')
//   schmerzFeld  optional, Id eines bestehenden Felds für die tägliche Schmerzfrage (sonst wird eines ergänzt)
//   anordnung    optional { von, datum, text }, gilt bis ein Termin eine neue Anordnung bringt
//   uebungen     Liste von Übungen
//
// Übung:
//   id, titel, hinweis, symbol oder pfad
//   messart      'abhaken' | 'dauer' | 'bestwert'
//   einheit      's' | 'min' (bei dauer und bestwert)
//   ziel         optional, Zahl in der Einheit (bei abhaken in Minuten, nur zur Anzeige)
//   rhythmus     'taeglich' oder Zahl = so oft pro Woche
//   proTag       Pflicht: so viele Einträge pro Tag, damit der Tag als erledigt gilt (Standard 1)
//   wunsch       optional, Wunsch pro Tag (größer als proTag); alles über der Pflicht ist Bonus
//   angeordnet   optional { von, datum }
//   ab           ab diesem Tag gelten die aktuellen Einstellungen
//   verlauf      frühere Einstellungen [{ ab, bis, messart, einheit, ziel, rhythmus, proTag }]
//   beendet      optional 'JJJJ-MM-TT', dann nicht mehr angeboten
//
// Einträge (Speicher „eintraege", bereich 'genesung'), werte:
//   { art: 'uebung', beschwerde, uebung, wert, messart, einheit }   wert: Zahl, bei abhaken true
//   { art: 'termin', beschwerde, titel, notiz, anordnung }           anordnung true: Notiz gilt als Anordnung
//   { art: 'termin', beschwerde?, wer, terminArt, notiz, anordnung }  aus dem Termin-Fenster (siehe terminQuellen),
//                                                                     Beschwerde optional, mehrere pro Tag möglich
//   { art: 'status', beschwerde, status }
// Die Schmerzwerte stehen im Eintrag des Bereichs mit der Schmerzfrage (siehe mitSchmerzfragen).
import { alle, eintraegeVon, holen, speichern, SPEICHER } from './db.js';
import { alsDatum, datumText, tageVerschieben, zeitpunktText } from './hilfen.js';

export const GENESUNG = 'genesung';

export const MESSARTEN = {
  abhaken: { titel: 'Abhaken', eintragen: 'Abhaken', symbol: 'haken' },
  dauer: { titel: 'Dauer', eintragen: 'Dauer eintragen', symbol: 'uhr' },
  bestwert: { titel: 'Bestwert', eintragen: 'Bestwert eintragen', symbol: 'stern' },
};

export const EINHEITEN = { s: 'Sekunden', min: 'Minuten' };

export const STATUS = {
  aktiv: { titel: 'Aktiv', text: 'Tägliche Schmerzfrage im Tages-Check, Übungen auf der Übersicht.' },
  pausiert: { titel: 'Pausiert', text: 'Keine tägliche Frage, Übungen ruhen. Alle Werte bleiben.' },
  geheilt: { titel: 'Geheilt', text: 'Wird eingeklappt und lässt sich jederzeit reaktivieren.' },
};

export async function genesungLaden() {
  const config = await holen(SPEICHER.config, GENESUNG);
  if (!config) return undefined;
  config.beschwerden ??= [];
  return config;
}

/** Leere Konfiguration, wenn noch keine Startdatei eine mitgebracht hat. */
export function genesungNeu() {
  return { id: GENESUNG, titel: 'Genesung', beschwerden: [] };
}

export async function genesungSichern(config) {
  await speichern(SPEICHER.config, config);
}

export const beschwerdeFinden = (config, id) => config?.beschwerden.find((b) => b.id === id);
export const uebungFinden = (beschwerde, id) => beschwerde?.uebungen?.find((u) => u.id === id);
export const aktiveUebungen = (beschwerde) => (beschwerde.uebungen ?? []).filter((u) => !u.beendet);

/** Lesbare Id aus einem Namen, eindeutig gegenüber `vorhandene`. */
export function idAus(titel, vorhandene = []) {
  const basis = String(titel).toLocaleLowerCase('de').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'eintrag';
  let id = basis;
  for (let i = 2; vorhandene.includes(id); i += 1) id = `${basis}_${i}`;
  return id;
}

// ---------- Werte und Einheiten ----------

export function inSekunden(wert, einheit) {
  return einheit === 'min' ? wert * 60 : wert;
}

export function umrechnen(wert, von, nach) {
  if (von === nach || typeof wert !== 'number') return wert;
  return nach === 'min' ? Math.round(wert / 60) : wert * 60;
}

const zahlFmt = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 1 });

/** 58 s → „0:58", 15 min → „15 min", abgehakt → „erledigt". */
export function wertAnzeige(wert, einheit) {
  if (wert === true) return 'erledigt';
  if (typeof wert !== 'number') return '–';
  if (einheit === 's') return `${Math.floor(wert / 60)}:${String(Math.round(wert % 60)).padStart(2, '0')}`;
  return `${zahlFmt.format(wert)} ${einheit ?? ''}`.trim();
}

/** „1:12" oder „72" (Sekunden), „15" (Minuten) lesen. */
export function wertEinlesen(text, einheit) {
  const t = String(text ?? '').trim().replace(',', '.');
  if (!t) return undefined;
  if (einheit === 's' && t.includes(':')) {
    const [m, s] = t.split(':').map(Number);
    return Number.isFinite(m) && Number.isFinite(s) ? m * 60 + s : undefined;
  }
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Wunsch pro Tag, nur wenn er über der Pflicht liegt. */
export const wunschVon = (u) => (u.wunsch && u.wunsch > (u.proTag ?? 1) ? u.wunsch : undefined);

export function rhythmusText(u) {
  const proTag = u.proTag ?? 1;
  const wunsch = wunschVon(u);
  const spanne = wunsch ? `${proTag}–${wunsch}-mal` : `${proTag}-mal`;
  if (u.rhythmus === 'taeglich' || !u.rhythmus) return wunsch || proTag > 1 ? `${spanne} täglich` : 'Täglich';
  return `${u.rhythmus}-mal pro Woche${wunsch || proTag > 1 ? `, je ${spanne}` : ''}`;
}

/** „Pflicht 1, Wunsch 4" für Eckdaten und Auswertung. */
export function spanneText(u) {
  const wunsch = wunschVon(u);
  return wunsch ? `Pflicht ${u.proTag ?? 1}, Wunsch ${wunsch} pro Tag` : `${u.proTag ?? 1} pro Tag`;
}

export function zielText(u) {
  if (!u.ziel) return '';
  return wertAnzeige(u.ziel, u.messart === 'abhaken' ? 'min' : u.einheit);
}

/** Kurzbeschreibung einer Einstellung, z. B. für den Verlauf. */
export function einstellungText(u) {
  return [MESSARTEN[u.messart]?.titel, zielText(u) && `Ziel ${zielText(u)}`, rhythmusText(u)].filter(Boolean).join(', ');
}

/** Felder, die eine Übung vergleichbar machen. Ändert sich eines, beginnt ein neuer Abschnitt im Verlauf. */
export const EINSTELLUNGEN = ['messart', 'einheit', 'ziel', 'rhythmus', 'proTag', 'wunsch'];

// ---------- Einträge ----------

export const genesungsEintraege = (eintraege) => eintraege.filter((e) => e.bereich === GENESUNG);

export function uebungsEintraege(eintraege, beschwerdeId, uebungId) {
  return eintraege
    .filter((e) => e.bereich === GENESUNG && e.werte?.art === 'uebung' && e.werte.beschwerde === beschwerdeId && e.werte.uebung === uebungId)
    .sort((a, b) => b.zeitpunkt.localeCompare(a.zeitpunkt));
}

/**
 * Wo die Konfiguration Termine führt: Option einer Mehrfachauswahl mit `terminFelder` (Fragen des Termin-Fensters).
 * Rollen dort: 'behandler' (Person), 'terminart' (Einfachauswahl), 'beschwerde' (optionenAus 'beschwerden'),
 * 'ergebnis' (Text), 'anordnung' (Ja/Nein). Jeder Termin ist ein eigener Eintrag der Genesung, mehrere pro Tag möglich.
 */
export function terminQuellen(configs) {
  const liste = [];
  for (const b of configs ?? []) {
    for (const f of b.felder ?? []) {
      if (f.typ !== 'mehrfach') continue;
      for (const o of f.optionen ?? []) {
        if (!o.terminFelder?.length) continue;
        const rolle = (r) => o.terminFelder.find((x) => x.rolle === r);
        liste.push({
          bereich: b.id, bereichTitel: b.kurztitel ?? b.titel, feld: f.id, option: o.id, optionTitel: o.titel,
          felder: o.terminFelder, beschwerde: rolle('beschwerde')?.id, wer: rolle('behandler'), art: rolle('terminart'),
        });
      }
    }
  }
  return liste;
}

// Werte eines Termins liegen unter festen Schlüsseln; die Fragen des Fensters werden über ihre Rolle zugeordnet.
const TERMIN_SCHLUESSEL = { behandler: 'wer', terminart: 'terminArt', beschwerde: 'beschwerde', ergebnis: 'notiz', anordnung: 'anordnung' };

/** Werte aus dem Termin-Fenster (nach Feld-Id) → Werte des Eintrags (feste Schlüssel). */
export function terminWerte(q, werte) {
  const aus = { art: 'termin' };
  for (const f of q.felder) {
    const v = werte[f.id];
    if (v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)) aus[TERMIN_SCHLUESSEL[f.rolle] ?? f.id] = v;
  }
  return aus;
}

/** Werte des Eintrags → Werte für das Termin-Fenster. */
export function formWerte(q, werte) {
  const aus = {};
  for (const f of q.felder) {
    const v = werte?.[TERMIN_SCHLUESSEL[f.rolle] ?? f.id];
    if (v !== undefined) aus[f.id] = v;
  }
  return aus;
}

/** Termin zur Anzeige: Titel aus Personen und Art (ältere Termine haben einen eigenen Titel). */
export function terminAnzeige(e, { configs, personen } = {}) {
  const w = e.werte ?? {};
  if (w.titel) return e;
  const q = terminQuellen(configs)[0];
  const namen = (w.wer ?? []).map((id) => personen?.find((p) => p.id === id)?.name).filter(Boolean);
  const art = (q?.art?.optionen ?? []).find((o) => o.id === w.terminArt)?.titel;
  return { ...e, werte: { ...w, titel: [namen.join(', '), art].filter(Boolean).join(' · ') } };
}

const istTermin = (e) => e.bereich === GENESUNG && e.werte?.art === 'termin';

/** Termine einer Beschwerde, neueste zuerst. `kontext` { configs, personen } liefert die Namen für den Titel. */
export function termine(eintraege, beschwerdeId, kontext) {
  return eintraege.filter((e) => istTermin(e) && e.werte.beschwerde === beschwerdeId)
    .map((e) => terminAnzeige(e, kontext))
    .sort((a, b) => b.zeitpunkt.localeCompare(a.zeitpunkt));
}

/** Alle Termine eines Tages (mit oder ohne Beschwerde), nach Uhrzeit. */
export function termineAm(eintraege, tag, kontext) {
  return eintraege.filter((e) => istTermin(e) && e.zeitpunkt.slice(0, 10) === tag)
    .map((e) => terminAnzeige(e, kontext))
    .sort((a, b) => a.zeitpunkt.localeCompare(b.zeitpunkt));
}

/**
 * Bereich für die Eingabe, in dem Fragen mit `optionenAus: 'beschwerden'` die Beschwerden der Genesung als Optionen
 * bekommen (geheilte ausgeblendet). Nur die betroffenen Objekte werden kopiert, alles andere bleibt dasselbe Objekt,
 * damit neu angelegte Optionen in Suchfeldern weiter in der gespeicherten Konfiguration landen.
 */
export function mitBeschwerden(bereich, genesung) {
  const optionen = (genesung?.beschwerden ?? []).map((b) => ({
    id: b.id, titel: b.titel, ...(b.pfad ? { pfad: b.pfad } : { symbol: b.symbol ?? 'genesung' }),
    ...(b.status === 'geheilt' ? { ausgeblendet: true } : {}),
  }));
  const ersetzen = (felder) => {
    let anders = false;
    const neu = (felder ?? []).map((f) => {
      let g = f.optionenAus === 'beschwerden' ? { ...f, optionen } : f;
      if (g.optionen?.some((o) => o.zusatz)) {
        const opts = g.optionen.map((o) => {
          if (!o.zusatz) return o;
          const z = ersetzen(o.zusatz);
          return z === o.zusatz ? o : { ...o, zusatz: z };
        });
        if (opts.some((o, i) => o !== g.optionen[i])) g = { ...g, optionen: opts };
      }
      if (g !== f) anders = true;
      return g;
    });
    return anders ? neu : felder;
  };
  const felder = ersetzen(bereich?.felder);
  return felder === bereich?.felder ? bereich : { ...bereich, felder };
}

/** Aktuelle Anordnung: letzter vergangener Termin mit Anordnung, sonst die aus der Konfiguration. */
export function anordnung(beschwerde, eintraege, kontext) {
  const jetzt = `${datumText()}T23:59`;
  const t = termine(eintraege, beschwerde.id, kontext).find((e) => e.werte.anordnung && e.werte.notiz && e.zeitpunkt <= jetzt);
  if (t) return { von: t.werte.titel, datum: t.zeitpunkt.slice(0, 10), text: t.werte.notiz };
  return beschwerde.anordnung?.text ? beschwerde.anordnung : undefined;
}

export function naechsterTermin(beschwerde, eintraege, kontext) {
  const jetzt = zeitpunktText();
  return termine(eintraege, beschwerde.id, kontext).filter((e) => e.zeitpunkt > jetzt).at(-1);
}

const anzahlAm = (liste, tag) => liste.filter((e) => e.zeitpunkt.slice(0, 10) === tag).length;

function montagVon(tag) {
  return tageVerschieben(tag, -((alsDatum(tag).getDay() + 6) % 7));
}

/**
 * Stand einer Übung an einem Tag.
 * anzahl/soll: Einträge an dem Tag, erledigt: Tagessoll erreicht,
 * woche: bei x-mal pro Woche die Tage dieser Woche mit Einträgen, offen: heute noch etwas zu tun.
 */
export function tagesStand(u, liste, tag) {
  const soll = u.proTag ?? 1;
  const wunsch = wunschVon(u);
  const anzahl = anzahlAm(liste, tag);
  const erledigt = anzahl >= soll;
  if (u.rhythmus === 'taeglich' || !u.rhythmus) return { anzahl, soll, wunsch, erledigt, offen: !erledigt };
  const montag = montagVon(tag);
  const tage = Array.from({ length: 7 }, (_, i) => tageVerschieben(montag, i)).filter((t) => anzahlAm(liste, t) >= soll).length;
  const woche = { anzahl: tage, soll: u.rhythmus };
  return { anzahl, soll, wunsch, erledigt, woche, offen: !erledigt && tage < u.rhythmus };
}

/**
 * Erfüllung einer Übung von `von` bis `bis` (nur Tage ab dem ersten Eintrag bzw. ab Beginn der Übung):
 * tage (möglich), pflicht (Tage mit erfüllter Pflicht), einheiten (Einträge), schnitt (Einträge pro Tag),
 * bei x-mal pro Woche zusätzlich wochen { moeglich, erfuellt }.
 */
export function erfuellung(u, liste, von, bis) {
  const erster = liste.length ? liste.at(-1).zeitpunkt.slice(0, 10) : null;
  const start = [von, erster].sort().at(-1);
  if (!erster || start > bis) return null;
  const soll = u.proTag ?? 1;
  const proTag = new Map();
  for (const e of liste) {
    const t = e.zeitpunkt.slice(0, 10);
    if (t >= start && t <= bis) proTag.set(t, (proTag.get(t) ?? 0) + 1);
  }
  const tage = Math.round((alsDatum(bis) - alsDatum(start)) / 864e5) + 1;
  const pflicht = [...proTag.values()].filter((n) => n >= soll).length;
  const einheiten = [...proTag.values()].reduce((s, n) => s + n, 0);
  const aus = { start, tage, pflicht, einheiten, schnitt: einheiten / tage, soll, wunsch: wunschVon(u) };
  if (typeof u.rhythmus === 'number') {
    let moeglich = 0;
    let erfuellt = 0;
    for (let m = montagVon(start); m <= bis; m = tageVerschieben(m, 7)) {
      moeglich += 1;
      let n = 0;
      for (let i = 0; i < 7; i += 1) if ((proTag.get(tageVerschieben(m, i)) ?? 0) >= soll) n += 1;
      if (n >= u.rhythmus) erfuellt += 1;
    }
    aus.wochen = { moeglich, erfuellt };
  }
  return aus;
}

/** Die letzten `n` Tage bis `bis`, je Tag Anzahl der Einträge und bester Wert (in Sekunden verglichen). */
export function tageVerlauf(liste, n = 7, bis = datumText()) {
  return Array.from({ length: n }, (_, i) => tageVerschieben(bis, i - n + 1)).map((tag) => {
    const am = liste.filter((e) => e.zeitpunkt.slice(0, 10) === tag);
    const zahlen = am.filter((e) => typeof e.werte.wert === 'number');
    const bester = zahlen.reduce((b, e) => (!b || inSekunden(e.werte.wert, e.werte.einheit) > inSekunden(b.werte.wert, b.werte.einheit) ? e : b), undefined);
    return { tag, anzahl: am.length, bester };
  });
}

export function bestwert(liste) {
  return liste.filter((e) => typeof e.werte.wert === 'number')
    .reduce((b, e) => (!b || inSekunden(e.werte.wert, e.werte.einheit) > inSekunden(b.werte.wert, b.werte.einheit) ? e : b), undefined);
}

// ---------- Schmerzfrage ----------

/** Bereiche, die die tägliche Schmerzfrage tragen: markiert oder mit einem Feld, das zu einer Beschwerde gehört. */
function istSchmerzBereich(bereich) {
  return bereich?.genesungSchmerz === true || (bereich?.felder ?? []).some((f) => f.genesung);
}

const ergaenzteId = (beschwerde) => `schmerz_${beschwerde.id}`;

/** Wo der Schmerzwert einer Beschwerde steht: { bereich, feld } (Ids). */
export function schmerzQuelle(beschwerde, configs) {
  const bereiche = configs.filter(istSchmerzBereich);
  for (const b of bereiche) {
    const f = (b.felder ?? []).find((x) => x.id === beschwerde.schmerzFeld || x.genesung === beschwerde.id);
    if (f) return { bereich: b.id, feld: f.id };
  }
  return bereiche[0] ? { bereich: bereiche[0].id, feld: ergaenzteId(beschwerde) } : undefined;
}

/** Schmerzwerte je Tag: Map 'JJJJ-MM-TT' → Zahl. */
export function schmerzWerte(beschwerde, configs, eintraege) {
  const q = schmerzQuelle(beschwerde, configs);
  const werte = new Map();
  if (!q) return werte;
  for (const e of eintraege) {
    if (e.bereich !== q.bereich) continue;
    const v = e.werte?.[q.feld];
    if (typeof v === 'number') werte.set(e.zeitpunkt.slice(0, 10), v);
  }
  return werte;
}

/**
 * Bereich für die Eingabe mit einer Schmerzfrage je Beschwerde. Aktive Beschwerden werden gefragt,
 * andere bleiben verborgen, außer der Eintrag hat schon einen Wert. Die Konfiguration selbst bleibt unverändert.
 */
export function mitSchmerzfragen(bereich, genesung, eintrag) {
  if (!genesung?.beschwerden?.length || !istSchmerzBereich(bereich)) return bereich;
  const felder = [...(bereich.felder ?? [])];
  let einfuegen = felder.reduce((pos, f, i) => (f.genesung || f.rolle === 'schmerz' ? i + 1 : pos), -1);
  if (einfuegen < 0) einfuegen = felder.findIndex((f) => f.typ === 'text');
  if (einfuegen < 0) einfuegen = felder.length;
  const neu = [];
  for (const b of genesung.beschwerden) {
    const index = felder.findIndex((f) => f.id === b.schmerzFeld || f.genesung === b.id);
    const id = index >= 0 ? felder[index].id : ergaenzteId(b);
    const sichtbar = b.status === 'aktiv' || typeof eintrag?.werte?.[id] === 'number';
    if (index >= 0) {
      felder[index] = { ...felder[index], ausgeblendet: !sichtbar };
    } else {
      neu.push({
        id, titel: `${b.titel}: Schmerz heute`, kurz: b.titel, typ: 'skala', min: 0, max: 10,
        links: 'kein Schmerz', rechts: 'sehr stark', rolle: 'schmerz', farbe: 'genesung', genesung: b.id, ausgeblendet: !sichtbar,
      });
    }
  }
  felder.splice(einfuegen, 0, ...neu);
  return { ...bereich, felder };
}

// ---------- Startdatei ----------

/** Startdatei einspielen, ohne in der App Angelegtes zu verlieren: Vorhandenes bleibt, Fehlendes kommt dazu. */
export function genesungZusammenfuehren(alt, neu) {
  if (!alt) return neu;
  const ergebnis = structuredClone(alt);
  ergebnis.beschwerden ??= [];
  for (const b of neu.beschwerden ?? []) {
    const vorhanden = ergebnis.beschwerden.find((x) => x.id === b.id);
    if (!vorhanden) { ergebnis.beschwerden.push(structuredClone(b)); continue; }
    vorhanden.uebungen ??= [];
    for (const u of b.uebungen ?? []) {
      if (!vorhanden.uebungen.some((x) => x.id === u.id)) vorhanden.uebungen.push(structuredClone(u));
    }
    if (!vorhanden.schmerzFeld && b.schmerzFeld) vorhanden.schmerzFeld = b.schmerzFeld;
  }
  return ergebnis;
}

// ---------- CSV ----------

export const GENESUNG_CSV = 'genesung.csv';

const zelle = (t) => String(t ?? '').replace(/\r?\n|\r/g, ' ').replace(/;/g, ',').trim();

/**
 * Eine Zeile je Übungswert, Termin, Statuswechsel und Schmerzwert:
 * Zeitpunkt; Beschwerde; Art; Name; Wert; Einheit; Notiz
 */
export function genesungAlsCsv(genesung, configs, eintraege, personen = []) {
  const zeilen = [];
  const name = (id) => beschwerdeFinden(genesung, id)?.titel ?? id;
  for (const e of genesungsEintraege(eintraege)) {
    const w = e.werte ?? {};
    const zeit = e.zeitpunkt.replace('T', ' ');
    if (w.art === 'uebung') {
      const u = uebungFinden(beschwerdeFinden(genesung, w.beschwerde), w.uebung);
      const wert = w.wert === true ? 'erledigt' : String(w.wert ?? '').replace('.', ',');
      zeilen.push([zeit, name(w.beschwerde), 'Übung', u?.titel ?? w.uebung, wert, w.wert === true ? '' : w.einheit, '']);
    } else if (w.art === 'termin') {
      const t = terminAnzeige(e, { configs, personen }).werte;
      zeilen.push([zeit, w.beschwerde ? name(w.beschwerde) : '', 'Termin', t.titel, w.anordnung ? 'Anordnung' : '', '', w.notiz]);
    } else if (w.art === 'status') {
      zeilen.push([zeit, name(w.beschwerde), 'Status', STATUS[w.status]?.titel ?? w.status, '', '', '']);
    }
  }
  for (const b of genesung.beschwerden) {
    for (const [tag, wert] of schmerzWerte(b, configs, eintraege)) zeilen.push([tag, b.titel, 'Schmerz', '', String(wert), '0–10', '']);
  }
  return zeilen
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map((z) => `${z.map(zelle).join(';')}\n`)
    .join('');
}

/**
 * Alles, was die Genesungs-Ansichten brauchen, in einem Zug. Gelesen werden nur die Einträge der Genesung und der
 * Bereiche mit Schmerzfragen, nicht alle. Ohne `mitSchmerz` (Übersicht) nur die der Genesung.
 */
export async function genesungKontext({ mitSchmerz = true } = {}) {
  const [genesung, configs, personen] = await Promise.all([genesungLaden(), alle(SPEICHER.config), alle(SPEICHER.personen)]);
  const bereiche = new Set([GENESUNG, ...(mitSchmerz ? configs.filter(istSchmerzBereich).map((b) => b.id) : [])]);
  const eintraege = (await Promise.all([...bereiche].map(eintraegeVon))).flat();
  return { genesung: genesung ?? genesungNeu(), configs, personen, eintraege };
}

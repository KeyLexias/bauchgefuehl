// CSV-Export und -Import. Die Zuordnung der Spalten steht in der Konfiguration (bereich.csv),
// der Code kennt nur allgemeine Regeln je Feldtyp.
//
// bereich.csv = { datei: 'name.csv', spalten: [Spalte] }
// Spalte:
//   { art: 'zeitpunkt' }                 „JJJJ-MM-TT HH:MM", bei tagesweisen Bereichen „JJJJ-MM-TT"
//   { feld: 'id' } oder { pfad: [...] }  Wert eines Felds; pfad für Felder in Zusatzfragen
//     leer       Text, wenn eine Mehrfachauswahl leer ist (Standard: leer)
//     leerWerte  Texte, die beim Import „nichts gewählt" bedeuten
//     klammer    Id eines jeOption-Felds, dessen Wert in Klammern hinter der Option steht
//     rest       letzte Spalte: Semikolons im Text bleiben beim Import erhalten
//   { art: 'irgendein', pfade, ablage, ja, nein }
//     „ja", wenn an einem der Pfade true steht (* passt auf jede Option); beim Import nach ablage
//
// Option.csv: Text in der CSV, Standard ist der Titel. Platzhalter {feldId} setzen den Wert einer
// Zusatzfrage ein, z. B. „Name {art}". Unbekannte Werte legt der Import als ausgeblendete Option an.
import { feldFinden, wertLesen, wertSetzen } from './felder.js';
import { TAGESZEITEN, alleFelder } from './konfiguration.js';
import { tageszeitVon } from './hilfen.js';
import { neueId } from './db.js';

const TRENNER = ';';
const LISTE = ', ';

const norm = (t) => String(t ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de');

/** Text für eine CSV-Zelle: keine Semikolons und Zeilenumbrüche. */
function sauber(text) {
  return String(text ?? '').replace(/\r?\n|\r/g, ' ').replace(/;/g, ',').trim();
}

const optionen = (f) => f?.optionen ?? [];
const stufeText = (s) => s?.csv ?? s?.titel ?? '';

/** CSV-Text einer Option, Platzhalter mit den Werten ihrer Zusatzfragen gefüllt. */
function optionText(o, werte) {
  const vorlage = o.csv ?? o.titel;
  return vorlage.replace(/\{([\w-]+)\}/g, (_, id) => {
    const z = (o.zusatz ?? []).find((x) => x.id === id);
    const wahl = optionen(z).find((x) => x.id === werte?.[id]);
    return wahl ? (wahl.csv ?? wahl.titel) : '';
  }).replace(/\s+/g, ' ').trim();
}

/** Alle Schreibweisen einer Option mit den Zusatzwerten, die sie bedeuten. */
function optionVarianten(o) {
  const platzhalter = [...(o.csv ?? o.titel).matchAll(/\{([\w-]+)\}/g)].map((m) => m[1]);
  let varianten = [{}];
  for (const id of platzhalter) {
    const z = (o.zusatz ?? []).find((x) => x.id === id);
    varianten = varianten.flatMap((v) => [v, ...optionen(z).map((w) => ({ ...v, [id]: w.id }))]);
  }
  const texte = varianten.map((v) => ({ text: norm(optionText(o, v)), werte: v }));
  texte.push({ text: norm(o.titel), werte: {} });
  return texte;
}

function optionFinden(f, text) {
  const n = norm(text);
  for (const o of optionen(f)) {
    const treffer = optionVarianten(o).find((v) => v.text === n);
    if (treffer) return { option: o, werte: treffer.werte };
  }
  return undefined;
}

function stufeFinden(stufen, text) {
  const n = norm(text);
  return (stufen ?? []).find((s) => norm(s.csv) === n || norm(s.titel) === n);
}

// ---------- Export ----------

function feldText(f, v, spalte, umgebung, personen) {
  const leerText = f?.typ === 'mehrfach' ? (spalte.leer ?? '') : '';
  if (!f || v === undefined || v === null || v === '') return leerText;
  switch (f.typ) {
    case 'skala':
      return f.csvWerte?.[v] ?? String(v);
    case 'einfach': {
      const o = optionen(f).find((x) => x.id === v);
      return sauber(o ? optionText(o, umgebung) : v);
    }
    case 'mehrfach': {
      const reihenfolge = [...optionen(f).map((o) => o.id), ...Object.keys(v).filter((id) => !optionen(f).some((o) => o.id === id))];
      const teile = reihenfolge.filter((id) => v[id]).map((id) => {
        const o = optionen(f).find((x) => x.id === id) ?? { id, titel: id };
        const inhalt = v[id] ?? {};
        let t = optionText(o, inhalt);
        if (inhalt.stufe) t += `: ${stufeText((f.stufen ?? []).find((s) => s.id === inhalt.stufe)) || inhalt.stufe}`;
        if (spalte.klammer && !o.ohneJeOption && inhalt[spalte.klammer] !== undefined) {
          const kf = (f.jeOption ?? []).find((x) => x.id === spalte.klammer);
          t += ` (${feldText(kf, inhalt[spalte.klammer], {}, inhalt, personen)})`;
        }
        return sauber(t);
      });
      return teile.length ? teile.join(LISTE) : leerText;
    }
    case 'person':
      return v.map((id) => sauber(personen.find((p) => p.id === id)?.name ?? '')).filter(Boolean).join(LISTE);
    case 'zahl':
      return String(v).replace('.', ',');
    case 'dauer':
      return f.stufen ? stufeText(f.stufen.find((s) => s.id === v)) || String(v) : String(v);
    case 'janein':
      return v ? (f.csvJa ?? 'Ja') : (f.csvNein ?? 'Nein');
    case 'tageszeit':
      return TAGESZEITEN.find((t) => t.id === v)?.titel ?? String(v);
    case 'datumzeit':
      return String(v).replace('T', ' ');
    default:
      return sauber(v);
  }
}

/** Werte an einem Pfad, „*" steht für jede Option. */
function werteAn(werte, pfad) {
  if (!pfad.length) return [werte];
  const [kopf, ...rest] = pfad;
  if (werte == null || typeof werte !== 'object') return [];
  if (kopf === '*') return Object.values(werte).flatMap((w) => werteAn(w, rest));
  return werteAn(werte[kopf], rest);
}

function zelle(bereich, spalte, e, personen) {
  if (spalte.art === 'zeitpunkt') {
    return bereich.zeitart === 'tag' ? e.zeitpunkt.slice(0, 10) : e.zeitpunkt.replace('T', ' ');
  }
  if (spalte.art === 'irgendein') {
    const werte = spalte.pfade.flatMap((p) => werteAn(e.werte, p));
    if (werte.includes(true)) return spalte.ja ?? 'Ja';
    // Alte importierte Tage ohne Antwort bleiben leer, in der App erfasste Tage sind „nein".
    if (werte.includes(false) || e.quelle !== 'csv') return spalte.nein ?? 'Nein';
    return '';
  }
  const pfad = spalte.pfad ?? [spalte.feld];
  const f = feldFinden(bereich.felder, pfad[pfad.length - 1]);
  const umgebung = wertLesen(e.werte, pfad.slice(0, -1)) ?? {};
  return feldText(f, wertLesen(e.werte, pfad), spalte, umgebung, personen);
}

export function eintragAlsZeile(bereich, e, personen = []) {
  return bereich.csv.spalten.map((s) => zelle(bereich, s, e, personen)).join(TRENNER);
}

/** Ganze CSV-Datei eines Bereichs, nach Zeitpunkt sortiert, ohne Kopfzeile. */
export function bereichAlsCsv(bereich, eintraege, personen = []) {
  return eintraege
    .filter((e) => e.bereich === bereich.id)
    .sort((a, b) => a.zeitpunkt.localeCompare(b.zeitpunkt))
    .map((e) => `${eintragAlsZeile(bereich, e, personen)}\n`)
    .join('');
}

// ---------- Import ----------

/** Welcher Bereich gehört zu einer Datei? „tag.csv" und „tag_import.csv" passen beide. */
export function bereichFuerDatei(dateiname, bereiche) {
  const stamm = (n) => String(n).toLowerCase().replace(/\.csv$/, '').replace(/_import$/, '').replace(/[ (\d)]+$/, '');
  return bereiche.find((b) => b.csv?.datei && stamm(b.csv.datei) === stamm(dateiname));
}

/** Hilfsdaten für einen Import-Lauf: Personen werden nach Namen gefunden oder angelegt. */
export function importKontext(personen) {
  return { personen: [...personen], neuePersonen: [], neueOptionen: [], configGeaendert: new Set() };
}

function personIds(text, kontext) {
  return String(text).split(',').map((t) => t.trim()).filter(Boolean).map((name) => {
    let p = kontext.personen.find((x) => norm(x.name) === norm(name));
    if (!p) {
      p = { id: neueId(), name };
      kontext.personen.push(p);
      kontext.neuePersonen.push(p);
    }
    return p.id;
  });
}

function unbekannteOption(bereich, f, text, kontext) {
  const basis = `csv_${norm(text).replace(/[^a-z0-9äöüß]+/g, '_').replace(/^_|_$/g, '') || 'wert'}`;
  let id = basis;
  for (let i = 2; optionen(f).some((o) => o.id === id); i += 1) id = `${basis}_${i}`;
  const o = { id, titel: text.trim(), csv: text.trim(), ausgeblendet: true, ausImport: true };
  f.optionen = [...optionen(f), o];
  kontext.neueOptionen.push(`${f.titel}: ${o.titel}`);
  kontext.configGeaendert.add(bereich.id);
  return o;
}

function feldLesen(bereich, f, text, spalte, kontext) {
  const t = String(text ?? '').trim();
  if (!t) return undefined;
  if ((spalte.leerWerte ?? []).some((l) => norm(l) === norm(t))) return undefined;
  switch (f.typ) {
    case 'skala': {
      const m = t.match(/^-?\d+/);
      return m ? Number(m[0]) : undefined;
    }
    case 'zahl': {
      const n = Number(t.replace(',', '.'));
      return Number.isFinite(n) ? n : undefined;
    }
    case 'einfach': {
      const treffer = optionFinden(f, t);
      if (treffer) return { wert: treffer.option.id, daneben: treffer.werte };
      return { wert: unbekannteOption(bereich, f, t, kontext).id, daneben: {} };
    }
    case 'mehrfach': {
      const aus = {};
      for (const teil of t.split(',').map((x) => x.trim()).filter(Boolean)) {
        let name = teil;
        const inhalt = {};
        // „Name (Dauer)": nur wenn die Klammer wirklich eine bekannte Stufe ist.
        const kf = spalte.klammer ? (f.jeOption ?? []).find((x) => x.id === spalte.klammer) : undefined;
        const k = name.match(/^(.*\S)\s+\(([^()]*)\)$/);
        if (kf && k) {
          const wert = feldLesen(bereich, kf, k[2], {}, kontext);
          if (wert !== undefined) { name = k[1]; inhalt[kf.id] = wert; }
        }
        // „Name: Stufe"
        const doppelpunkt = name.lastIndexOf(': ');
        if (f.stufen && doppelpunkt > 0) {
          const s = stufeFinden(f.stufen, name.slice(doppelpunkt + 2));
          if (s) { inhalt.stufe = s.id; name = name.slice(0, doppelpunkt); }
        }
        const treffer = optionFinden(f, name);
        const o = treffer?.option ?? unbekannteOption(bereich, f, name, kontext);
        aus[o.id] = { ...(aus[o.id] ?? {}), ...(treffer?.werte ?? {}), ...inhalt };
      }
      return Object.keys(aus).length ? aus : undefined;
    }
    case 'person': {
      const ids = personIds(t, kontext);
      return ids.length ? ids : undefined;
    }
    case 'dauer': {
      if (f.stufen) return stufeFinden(f.stufen, t)?.id;
      const n = Number(t.replace(',', '.'));
      return Number.isFinite(n) ? n : undefined;
    }
    case 'janein': {
      if (norm(t) === norm(f.csvJa ?? 'Ja')) return true;
      if (norm(t) === norm(f.csvNein ?? 'Nein')) return false;
      return undefined;
    }
    case 'tageszeit':
      return TAGESZEITEN.find((x) => norm(x.titel) === norm(t))?.id;
    case 'datumzeit':
      return /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/.test(t) ? t.replace(' ', 'T') : undefined;
    default:
      return t;
  }
}

/**
 * Eine CSV-Zeile in einen Eintrag übersetzen. Wirft einen Fehler mit lesbarer Meldung,
 * wenn der Zeitpunkt fehlt oder ungültig ist.
 */
export function zeileLesen(bereich, zeile, kontext) {
  const spalten = bereich.csv.spalten;
  let zellen = zeile.split(TRENNER);
  const restIndex = spalten.findIndex((s) => s.rest);
  if (restIndex >= 0 && zellen.length > spalten.length) {
    zellen = [...zellen.slice(0, restIndex), zellen.slice(restIndex).join(TRENNER)];
  }
  const tagesweise = bereich.zeitart === 'tag';
  const werte = {};
  let zeitpunkt;
  let ohneUhrzeit = false;

  spalten.forEach((spalte, i) => {
    const text = (zellen[i] ?? '').trim();
    if (spalte.art === 'zeitpunkt') {
      const m = text.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/);
      if (!m) return;
      zeitpunkt = tagesweise ? `${m[1]}T00:00` : `${m[1]}T${m[2] ?? '12:00'}`;
      ohneUhrzeit = !m[2];
      return;
    }
    if (spalte.art === 'irgendein') {
      if (norm(text) === norm(spalte.ja ?? 'Ja')) wertSetzen(werte, spalte.ablage, true);
      else if (norm(text) === norm(spalte.nein ?? 'Nein')) wertSetzen(werte, spalte.ablage, false);
      return;
    }
    const pfad = spalte.pfad ?? [spalte.feld];
    const f = feldFinden(bereich.felder, pfad[pfad.length - 1]);
    if (!f) return;
    const gelesen = feldLesen(bereich, f, text, spalte, kontext);
    if (gelesen === undefined) return;
    if (f.typ === 'einfach') {
      wertSetzen(werte, pfad, gelesen.wert);
      for (const [id, w] of Object.entries(gelesen.daneben)) wertSetzen(werte, [...pfad.slice(0, -1), id], w);
    } else {
      // Mehrfachwerte zusammenführen, falls derselbe Pfad schon Inhalte hat (z. B. Zusatzfragen).
      const vorher = wertLesen(werte, pfad);
      wertSetzen(werte, pfad, f.typ === 'mehrfach' && vorher ? mischen(vorher, gelesen) : gelesen);
    }
  });

  if (!zeitpunkt || Number.isNaN(Date.parse(zeitpunkt))) throw new Error('Datum fehlt oder ist ungültig');

  // Steht nur ein Datum in der Datei, gibt die Tageszeit die Uhrzeit vor.
  if (!tagesweise && ohneUhrzeit) {
    const f = (bereich.felder ?? []).find((x) => x.typ === 'tageszeit' && werte[x.id] !== undefined);
    const uhrzeit = TAGESZEITEN.find((t) => t.id === werte[f?.id])?.uhrzeit;
    if (uhrzeit) zeitpunkt = `${zeitpunkt.slice(0, 10)}T${uhrzeit}`;
  }
  // Tageszeit, die nicht in der CSV steht, aus der Uhrzeit ableiten.
  if (!tagesweise) {
    for (const f of bereich.felder ?? []) {
      if (f.typ === 'tageszeit' && werte[f.id] === undefined) werte[f.id] = tageszeitVon(zeitpunkt);
    }
  }
  return { bereich: bereich.id, zeitpunkt, werte };
}

function mischen(a, b) {
  const aus = { ...a };
  for (const [k, v] of Object.entries(b)) aus[k] = { ...(aus[k] ?? {}), ...v };
  return aus;
}

/** Felder, deren Wert die CSV abbildet, zur Kontrolle der Konfiguration. */
export function csvFelder(bereich) {
  const ids = new Set(alleFelder(bereich.felder).map((f) => f.id));
  return (bereich.csv?.spalten ?? []).filter((s) => s.feld || s.pfad).map((s) => {
    const id = s.feld ?? s.pfad[s.pfad.length - 1];
    return { id, vorhanden: ids.has(id) };
  });
}

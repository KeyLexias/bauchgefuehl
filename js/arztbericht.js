// Arztbericht als kopierbarer Text: Verdauung, Schlaf, körperliche Beschwerden, Allgemeinbefinden.
// Ohne Notizen, Aktivitäten, Personen und private Rollen.
import { BEREICHE } from './konfiguration.js';
import { alsDatum } from './hilfen.js';
import { zahl, prozent } from './diagramme.js';
import {
  VERLAUF_ROLLEN, eintraegeIm, kennzahl, schmerzReihen, bereichStatistik, optionsZeilen, warnzeichen, tageszeitEintrag,
  TAGESZEIT_SPALTEN, feldTitel, tagesWert, erfassteTage,
} from './auswertung-daten.js';
import { termine, uebungsEintraege, umrechnen, wertAnzeige, STATUS } from './genesung-daten.js';

// Welche Bereiche in welchen Abschnitt gehören (Bereiche sind fest im Code, Inhalte nicht).
const ABSCHNITTE = [
  { titel: 'Verdauung', bereiche: ['magen', 'stuhlgang'] },
  { titel: 'Schlaf', bereiche: ['schlaf'] },
];
// Rollen, die im Bericht keine Rolle spielen.
const OHNE = new Set(['aktivitaet', 'detail', 'person', 'spaet', 'dauer', 'schmerz']);

const fmtLang = new Intl.DateTimeFormat('de-AT', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtKurz = new Intl.DateTimeFormat('de-AT', { day: 'numeric', month: 'numeric' });
const tagLang = (t) => fmtLang.format(alsDatum(t));
const tagKurz = (t) => fmtKurz.format(alsDatum(t));
const ohneFrage = (t) => String(t).replace(/\?$/, '');
const tage = (n) => (n === 1 ? '1 Tag' : `${n} Tagen`);

function liste(zeilen, format) {
  return zeilen.map(format).join(', ');
}

/** Text für einen Bereich aus seiner Statistik. `mitName`: Bereich nennen, wenn der Abschnitt mehrere hat. */
function bereichText(k, z, b, mitName) {
  const eintraege = eintraegeIm(k, b.id, z.von, z.bis);
  const name = mitName ? `${BEREICHE[b.id].titel}: ` : '';
  if (!eintraege.length) return [`${name}keine Einträge im Zeitraum.`];
  const tageMit = erfassteTage(k, b.id, z.von, z.bis);
  const L = [];
  const mitSkala = (b.felder ?? []).some((f) => f.typ === 'skala' && VERLAUF_ROLLEN.includes(f.rolle));
  // Bei Bereichen ohne eigene Skala ist die Häufigkeit selbst die Aussage
  L.push(mitSkala || b.zeitart === 'tag'
    ? `${name ? `${name}erfasst` : 'Erfasst'} an ${tage(tageMit)}.`
    : `${name}${eintraege.length} Einträge an ${tage(new Set(eintraege.map((e) => e.zeitpunkt.slice(0, 10))).size)}, im Schnitt ${zahl(eintraege.length / z.tage, 1)} pro Tag.`);

  for (const s of bereichStatistik(b, eintraege)) {
    const f = s.feld;
    if (OHNE.has(f.rolle)) continue;
    const titel = s.ueber ? `${s.ueber.titel}, ${ohneFrage(feldTitel(f))}` : ohneFrage(feldTitel(f));
    if (f.typ === 'skala' && VERLAUF_ROLLEN.includes(f.rolle)) {
      const schluessel = `${b.id}.${f.id}`;
      const w = kennzahl(z.von, z.bis, (t) => tagesWert(k.tage.get(t), schluessel));
      const enden = f.links && f.rechts ? ` (${f.min ?? 1} = ${f.links}, ${f.max ?? 5} = ${f.rechts})` : '';
      L.push(`${titel}: im Schnitt ${zahl(w.wert, 1)} von ${f.max ?? 5}${enden}.`);
    } else if (f.typ === 'mehrfach') {
      const zeilen = optionsZeilen(s);
      if (!zeilen.length) continue;
      if (f.rolle === 'symptom' && f.stufen) {
        const mit = new Set(zeilen.flatMap((x) => [...s.zaehler.get(x.id).tage])).size;
        L.push(`Beschwerden an ${mit} von ${tage(tageMit)} (${prozent(mit / tageMit)}).`);
        L.push(`Häufigste: ${liste(zeilen.slice(0, 6), (x) => {
          const stufe = [...x.stufen.entries()].sort((a, c) => c[1] - a[1])[0];
          const stufeTitel = stufe ? (f.stufen.find((st) => st.id === stufe[0])?.titel ?? '') : '';
          const zeit = haeufigsteTageszeit(b, eintraege, f, x.id);
          const zusatz = [stufeTitel && `meist ${stufeTitel}`, zeit && `vor allem ${zeit}`].filter(Boolean).join(', ');
          return `${x.titel} an ${tage(x.anzahl)}${zusatz ? ` (${zusatz})` : ''}`;
        })}.`);
      } else {
        L.push(`${titel}: ${liste(zeilen.slice(0, 8), (x) => `${x.titel} an ${tage(x.anzahl)}`)}.`);
      }
    } else if (f.typ === 'einfach') {
      const zeilen = optionsZeilen(s);
      const summe = zeilen.reduce((x, y) => x + y.anzahl, 0);
      if (!summe) continue;
      const angaben = summe < tageMit ? ` (${summe} Angaben)` : '';
      L.push(`${titel}${angaben}: ${liste(zeilen.filter((x) => x.anzahl), (x) => `${x.zeichen ? `${x.zeichen} ` : ''}${x.titel} ${prozent(x.anzahl / summe)}`)}.`);
    }
  }

  const hatWarnOptionen = (b.felder ?? []).some((f) => (f.optionen ?? []).some((o) => o.hinweis));
  if (hatWarnOptionen) {
    const warn = warnzeichen(b, eintraege);
    L.push(warn.length
      ? `Warnzeichen: ${liste(warn, (w) => `${w.option.titel} an ${tage(new Set(w.tage).size)} (${[...new Set(w.tage)].slice(0, 5).map(tagKurz).join(', ')})`)}.`
      : 'Warnzeichen: keine erfasst.');
  }
  return L;
}

function haeufigsteTageszeit(b, eintraege, f, optionId) {
  const zaehler = new Map();
  for (const e of eintraege) {
    if (!e.werte?.[f.id]?.[optionId]) continue;
    const tz = tageszeitEintrag(b, e);
    zaehler.set(tz, (zaehler.get(tz) ?? 0) + 1);
  }
  const [beste] = [...zaehler.entries()].sort((x, y) => y[1] - x[1]);
  if (!beste) return '';
  const summe = [...zaehler.values()].reduce((x, y) => x + y, 0);
  // Nur nennen, wenn eine Tageszeit deutlich überwiegt
  if (beste[1] / summe < 0.45) return '';
  // „Abend" → „abends", „Nacht" → „nachts"
  const titel = TAGESZEIT_SPALTEN.find((t) => t.id === beste[0])?.titel;
  return titel ? `${titel.toLowerCase()}s` : '';
}

function genesungText(k, z) {
  const L = [];
  const schmerz = new Map(schmerzReihen(k).map((r) => [r.beschwerde.id, r]));
  for (const b of k.genesung?.beschwerden ?? []) {
    const reihe = schmerz.get(b.id);
    const w = reihe ? kennzahl(z.von, z.bis, reihe.wertAm) : { anzahl: 0 };
    const terminListe = termine(k.eintraege, b.id).filter((e) => e.zeitpunkt.slice(0, 10) >= z.von && e.zeitpunkt.slice(0, 10) <= z.bis).reverse();
    const uebungen = (b.uebungen ?? []).map((u) => ({ u, im: uebungsEintraege(k.eintraege, b.id, u.id).filter((e) => e.zeitpunkt.slice(0, 10) >= z.von && e.zeitpunkt.slice(0, 10) <= z.bis) }))
      .filter((x) => x.im.length);
    if (!w.anzahl && !terminListe.length && !uebungen.length) continue;
    const kopf = [`${b.titel}${b.beschreibung ? ` (${b.beschreibung})` : ''}`, b.seit && `seit ${b.seit.split('-').reverse().join('/')}`, STATUS[b.status]?.titel.toLowerCase()].filter(Boolean).join(', ');
    L.push(`${kopf}:`);
    if (w.anzahl) {
      // Anfang und Ende des Zeitraums vergleichen: je die ersten und letzten 14 erfassten Tage
      const werte = [...reihe.werte.entries()].filter(([t]) => t >= z.von && t <= z.bis).sort((x, y) => x[0].localeCompare(y[0])).map(([, v]) => v);
      const n = Math.min(14, Math.floor(werte.length / 2));
      const anfang = n >= 3 ? werte.slice(0, n) : [];
      const ende = n >= 3 ? werte.slice(-n) : [];
      const s = (l) => zahl(l.reduce((x, y) => x + y, 0) / l.length, 1);
      L.push(`- Schmerz im Schnitt ${zahl(w.wert, 1)} von 10 (an ${tage(w.anzahl)} erfasst)${anfang.length ? `, zu Beginn ${s(anfang)}, zuletzt ${s(ende)}` : ''}.`);
    }
    for (const { u, im } of uebungen) {
      const anzahlTage = new Set(im.map((e) => e.zeitpunkt.slice(0, 10))).size;
      const zahlen = im.filter((e) => typeof e.werte.wert === 'number');
      const einheit = u.einheit ?? 'min';
      const best = zahlen.length ? Math.max(...zahlen.map((e) => umrechnen(e.werte.wert, e.werte.einheit ?? einheit, einheit))) : null;
      L.push(`- Übung ${u.titel}: an ${tage(anzahlTage)} gemacht${best !== null ? `, Bestwert ${wertAnzeige(best, einheit)}` : ''}.`);
    }
    for (const e of terminListe) {
      L.push(`- Termin ${tagKurz(e.zeitpunkt)}${e.werte.titel ? ` ${e.werte.titel}` : ''}${e.werte.notiz ? `: ${String(e.werte.notiz).replace(/\s+/g, ' ')}` : ''}`);
    }
  }
  return L;
}

function allgemeinText(k, z) {
  const L = [];
  for (const b of k.bereiche.filter((x) => !ABSCHNITTE.some((a) => a.bereiche.includes(x.id)) && !x.ohneEingabe)) {
    const eintraege = eintraegeIm(k, b.id, z.von, z.bis);
    if (!eintraege.length) continue;
    const skalen = [];
    for (const s of bereichStatistik(b, eintraege)) {
      const f = s.feld;
      if (f.typ === 'skala' && VERLAUF_ROLLEN.includes(f.rolle) && s.werte.length) {
        const schluessel = `${b.id}.${f.id}`;
        const w = kennzahl(z.von, z.bis, (t) => tagesWert(k.tage.get(t), schluessel));
        skalen.push(`${ohneFrage(feldTitel(f))} ${zahl(w.wert, 1)} von ${f.max ?? 5}${f.links && f.rechts ? ` (${f.min ?? 1} = ${f.links})` : ''}`);
      }
      if (f.rolle === 'besonderheit') {
        const zeilen = optionsZeilen(s);
        if (zeilen.length) L.push(`Besondere Tage: ${liste(zeilen, (x) => `${x.titel} an ${tage(x.anzahl)}`)}.`);
      }
    }
    if (skalen.length) L.unshift(`Im Schnitt: ${skalen.join(', ')}.`);
  }
  return L;
}

/** Ganzer Bericht für den Zeitraum. */
export function arztbericht(k, z) {
  const L = [];
  L.push('Selbst erfasste Beschwerden');
  L.push(`Zeitraum: ${tagLang(z.von)} bis ${tagLang(z.bis)} (${z.tage} Tage)`);
  for (const a of ABSCHNITTE) {
    const bereiche = a.bereiche.map((id) => k.bereiche.find((b) => b.id === id)).filter(Boolean);
    if (!bereiche.length) continue;
    L.push('', a.titel.toUpperCase());
    for (const b of bereiche) L.push(...bereichText(k, z, b, bereiche.length > 1));
  }
  const genesung = genesungText(k, z);
  if (genesung.length) L.push('', 'KÖRPERLICHE BESCHWERDEN', ...genesung);
  const allgemein = allgemeinText(k, z);
  if (allgemein.length) L.push('', 'ALLGEMEINBEFINDEN', ...allgemein);
  L.push('', `Täglich selbst erfasst, Werte gerundet. Erstellt am ${tagLang(z.bis)}.`);
  return L.join('\n');
}

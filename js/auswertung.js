// Auswertung: Zeitraum wählen, Verläufe und Häufigkeiten je Bereich, Zusammenhänge als Hinweise, Arztbericht.
// Die Ansichten kennen Bereiche und Rollen, nie konkrete Fragen oder Optionen.
import { symbol } from './symbole.js';
import { BEREICHE } from './konfiguration.js';
import { esc, alsDatum, tageVerschieben } from './hilfen.js';
import { kopf } from './uebersicht.js';
import { linie, balken, raster, vergleich, zahl, prozent, stufenDeckkraft } from './diagramme.js';
import {
  ZEITRAEUME, VERLAUF_ROLLEN, MINDEST_TAGE, auswertungLaden, zeitraum, eintraegeIm, verlauf, kennzahl, messreihen, schmerzReihen,
  bereichStatistik, optionsZeilen, warnzeichen, symptomFelder, ergebnisse, sondertagPruefer, essensMerkmale, wortMerkmal,
  tagesMerkmale, anteilVergleich, wertVergleich, tagesWert, tageszeitEintrag, zaehlt, erfassteTage, TAGESZEIT_SPALTEN, titelVon, feldTitel, abschnitte,
} from './auswertung-daten.js';
import { uebungsEintraege, termine, umrechnen, wertAnzeige, STATUS } from './genesung-daten.js';
import { arztbericht } from './arztbericht.js';

export const ANSICHTEN = [
  { id: 'ueberblick', titel: 'Überblick' },
  { id: 'bauch', titel: 'Bauch', bereiche: ['magen', 'stuhlgang'] },
  { id: 'ausloeser', titel: 'Auslöser' },
  { id: 'schlaf', titel: 'Schlaf', bereiche: ['schlaf'] },
  { id: 'tag', titel: 'Tag', bereiche: ['aktivitaeten'] },
  { id: 'genesung', titel: 'Genesung' },
  { id: 'bericht', titel: 'Arztbericht' },
];

// Bleibt beim Wechsel zwischen Tabs erhalten.
const zustand = { ansicht: 'ueberblick', zeitraum: '90', versatz: 0, sondertage: true, ziel: null, wort: '' };

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

/** Zeichnet die Auswertung. teile: [ansicht, zeitraum] aus der Adresse. */
export async function auswertungAnzeigen(ziel, teile) {
  const [ansicht, zr] = teile;
  if (ANSICHTEN.some((a) => a.id === ansicht)) zustand.ansicht = ansicht;
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
      <div class="zeitraum-wahl" role="group" aria-label="Zeitraum">
        ${ZEITRAEUME.map((z) => `<button type="button" data-zeitraum="${z.id}">${esc(z.titel)}</button>`).join('')}
      </div>
      <nav class="ansicht-wahl" aria-label="Bereich der Auswertung">
        ${ANSICHTEN.map((a) => `<button type="button" data-ansicht="${a.id}">${esc(a.titel)}</button>`).join('')}
      </nav>
      <p class="zeitraum-text" data-zeitraum-text></p>
      <div class="auswertung-inhalt" data-inhalt></div>
    </div>`;
  const wurzel = ziel.querySelector('[data-auswertung]');
  const inhalt = wurzel.querySelector('[data-inhalt]');

  const zeichnen = ({ scrollen = false } = {}) => {
    history.replaceState(null, '', `#/auswertung/${zustand.ansicht}/${zustand.zeitraum}`);
    for (const b of wurzel.querySelectorAll('[data-zeitraum]')) b.setAttribute('aria-pressed', String(b.dataset.zeitraum === zustand.zeitraum));
    for (const b of wurzel.querySelectorAll('[data-ansicht]')) b.setAttribute('aria-pressed', String(b.dataset.ansicht === zustand.ansicht));
    const z = zeitraum(k, zustand.zeitraum);
    wurzel.querySelector('[data-zeitraum-text]').textContent = `${tagLang(z.von)} bis ${tagLang(z.bis)} · ${tageText(z.tage)}`;
    const ansicht = { ueberblick, bauch: bereichsAnsicht, schlaf: bereichsAnsicht, tag: bereichsAnsicht, ausloeser, genesung, bericht }[zustand.ansicht];
    inhalt.innerHTML = ansicht(k, z, ANSICHTEN.find((a) => a.id === zustand.ansicht));
    const gewaehlt = wurzel.querySelector('[data-ansicht][aria-pressed="true"]');
    gewaehlt?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: scrollen ? 'smooth' : 'auto' });
  };

  let wortZeit;
  wurzel.addEventListener('click', async (e) => {
    const knopf = e.target.closest('button, [data-ansicht]');
    if (!knopf) return;
    if (knopf.dataset.zeitraum) { zustand.zeitraum = knopf.dataset.zeitraum; zeichnen(); }
    else if (knopf.dataset.ansicht) {
      zustand.ansicht = knopf.dataset.ansicht;
      zeichnen({ scrollen: true });
      if (knopf.closest('[data-inhalt]')) window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (knopf.dataset.versatz !== undefined) { zustand.versatz = Number(knopf.dataset.versatz); zeichnen(); }
    else if (knopf.dataset.kopieren !== undefined) {
      const feld = wurzel.querySelector('[data-bericht-text]');
      try {
        await navigator.clipboard.writeText(feld.value);
        knopf.textContent = 'Kopiert';
      } catch {
        feld.focus();
        feld.select();
        knopf.textContent = 'Markiert, jetzt kopieren';
      }
      setTimeout(() => { knopf.textContent = 'Text kopieren'; }, 2400);
    }
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

  zeichnen();
}

// ---------- Überblick ----------

function ueberblick(k, z) {
  const reihen = messreihen(k);
  const kacheln = reihen.map((r) => {
    const jetzt = kennzahl(z.von, z.bis, r.wertAm);
    const vorher = z.vorher ? kennzahl(z.vorher.von, z.vorher.bis, r.wertAm) : null;
    const einheit = r.anzahl ? 'pro Tag' : `von ${r.max}`;
    const vergleichText = vorher?.anzahl ? `davor ${zahl(vorher.wert, 1)}` : jetzt.anzahl ? tageText(jetzt.anzahl) : 'keine Werte';
    return `
      <button type="button" class="kennzahl" data-ansicht="${r.ansicht}" style="--farbe: var(${r.farbe})">
        <span class="kennzahl-titel">${esc(r.titel)}</span>
        <span class="kennzahl-wert"><strong>${zahl(jetzt.wert, 1)}</strong> ${esc(einheit)}</span>
        <span class="kennzahl-unter">${esc(vergleichText)}</span>
      </button>`;
  }).join('');

  const ab = abschnitte(z);
  const zeilen = reihen.map((r) => {
    const punkte = verlauf(z, r.wertAm);
    if (punkte.filter((p) => p.wert !== null).length < 2) return '';
    return `
      <div class="zeitstrahl-zeile" style="--farbe: var(${r.farbe})">
        <span class="zeitstrahl-titel">${esc(r.titel)}<small>${r.anzahl ? 'pro Tag' : `${r.min}–${r.max}`}</small></span>
        ${linie(punkte, { min: r.min, max: r.anzahl ? Math.max(r.max, ...punkte.map((p) => p.wert ?? 0)) : r.max, beschriftung: `${r.titel} im Verlauf`, hoehe: 46, achse: false })}
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
  const termineIm = (k.genesung?.beschwerden ?? []).flatMap((b) => termine(k.eintraege, b.id)
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
  ].join('');
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
    const liste = termine(k.eintraege, b.id).filter((e) => e.zeitpunkt.slice(0, 10) >= z.von && e.zeitpunkt.slice(0, 10) <= z.bis).reverse();
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
  const im = alle.filter((e) => e.zeitpunkt.slice(0, 10) >= z.von && e.zeitpunkt.slice(0, 10) <= z.bis);
  const erster = alle.length ? alle.at(-1).zeitpunkt.slice(0, 10) : null;
  if (!erster) return `<div class="teil"><h3>${esc(u.titel)}</h3><p class="karte-unter">Noch nicht eingetragen.</p></div>`;
  const ab = erster > z.von ? erster : z.von;
  const moeglich = Math.round((alsDatum(z.bis) - alsDatum(ab)) / 864e5) + 1;
  const tage = new Set(im.map((e) => e.zeitpunkt.slice(0, 10)));
  let text = `An <strong>${tagen(tage.size)}</strong> von ${tagen(moeglich)} gemacht${erster > z.von ? ` (seit ${esc(tagKurz(erster))})` : ''}.`;
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

// ---------- Arztbericht ----------

function bericht(k, z) {
  const text = arztbericht(k, z);
  return `
    ${karte('var(--magen)', 'Arztbericht', `
      <textarea class="bericht-text" data-bericht-text readonly rows="16" aria-label="Arztbericht">${esc(text)}</textarea>
      <button type="button" class="knopf haupt breit" data-kopieren>Text kopieren</button>`,
    { sym: 'arzt', unter: 'Zusammenfassung für den gewählten Zeitraum, nach Verdauung, Schlaf und körperlichen Beschwerden. Kopieren und in eine Notiz oder Mail einfügen.' })}
    <p class="fussnote links">Ohne Notizen, Aktivitäten und Personen.</p>`;
}

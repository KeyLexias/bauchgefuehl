// Genesungs-Tab: Beschwerden mit Schmerzverlauf, Übungen, Terminen und Status.
// Adressen: #/genesung, …/neu, …/<beschwerde>/bearbeiten, …/<beschwerde>/uebung/<übung>[/bearbeiten],
//           …/<beschwerde>/uebung/neu, …/<beschwerde>/termine, …/<beschwerde>/termin/<neu|eintrag>
import { symbol } from './symbole.js';
import { speichern, loeschen, neueId, SPEICHER } from './db.js';
import { esc, datumText, tageVerschieben, alsDatum, zeitpunktText, tagVoll } from './hilfen.js';
import {
  GENESUNG, MESSARTEN, EINHEITEN, STATUS, EINSTELLUNGEN, genesungKontext, genesungSichern, beschwerdeFinden, uebungFinden,
  aktiveUebungen, idAus, uebungsEintraege, termine, anordnung, naechsterTermin, tagesStand, tageVerlauf, bestwert,
  schmerzWerte, rhythmusText, zielText, einstellungText, wertAnzeige, inSekunden,
} from './genesung-daten.js';
import { uebungEingabe, sheetOeffnen } from './uebung-eingabe.js';

const fmtTagKurz = new Intl.DateTimeFormat('de-AT', { day: 'numeric', month: 'short' });
const fmtMonat = new Intl.DateTimeFormat('de-AT', { month: 'short', year: 'numeric' });
const fmtMonatLang = new Intl.DateTimeFormat('de-AT', { month: 'long', year: 'numeric' });
const fmtTermin = new Intl.DateTimeFormat('de-AT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const fmtWochentag = new Intl.DateTimeFormat('de-AT', { weekday: 'short' });
const komma = new Intl.NumberFormat('de-AT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const tagKurz = (t) => fmtTagKurz.format(alsDatum(t));
const monatText = (jm) => (jm ? fmtMonat.format(alsDatum(`${jm}-01`)) : '');

// Symbole für Beschwerden zur Auswahl im Formular.
const SYMBOL_AUSWAHL = ['genesung', 'herz', 'person', 'blitz', 'feuer', 'tropfen', 'stern', 'arzt', 'aktivitaet', 'welle', 'magen', 'schlaf'];

/** SVG aus einem Symbolnamen oder einem eigenen Pfad der Konfiguration. */
function bild(objekt, ersatz, groesse = 22) {
  if (objekt?.pfad) {
    return `<svg aria-hidden="true" width="${groesse}" height="${groesse}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="${esc(objekt.pfad)}"/></svg>`;
  }
  return symbol(objekt?.symbol ?? ersatz, groesse);
}

const uebungsBild = (u, groesse) => bild(u, MESSARTEN[u.messart]?.symbol ?? 'haken', groesse);

const marke = (status) => `<span class="status-marke ${esc(status)}">${esc(STATUS[status]?.titel ?? status)}</span>`;

const adresse = (...teile) => `#/genesung/${teile.map(encodeURIComponent).join('/')}`;

/** Formularseiten zeigen keine Tab-Leiste. */
export function istFormular(teile) {
  const [a, b, c, d] = teile;
  return a === 'neu' || b === 'bearbeiten' || b === 'termin' || (b === 'uebung' && (c === 'neu' || d === 'bearbeiten'));
}

export async function genesungAnzeigen(ziel, teile, umgebung) {
  const [a, b, c, d] = teile.map(decodeURIComponent);
  const k = await genesungKontext();
  if (!a) return tab(ziel, k, umgebung);
  if (a === 'neu') return beschwerdeFormular(ziel, k, undefined, umgebung);
  const beschwerde = beschwerdeFinden(k.genesung, a);
  if (!beschwerde) return nichtGefunden(ziel, 'Beschwerde nicht gefunden');
  if (b === 'bearbeiten') return beschwerdeFormular(ziel, k, beschwerde, umgebung);
  if (b === 'termine') return termineSeite(ziel, k, beschwerde);
  if (b === 'termin') return terminFormular(ziel, k, beschwerde, c === 'neu' ? undefined : c, umgebung);
  if (b === 'uebung' && c === 'neu') return uebungFormular(ziel, k, beschwerde, undefined, umgebung);
  const uebung = uebungFinden(beschwerde, c);
  if (b === 'uebung' && uebung && d === 'bearbeiten') return uebungFormular(ziel, k, beschwerde, uebung, umgebung);
  if (b === 'uebung' && uebung) return uebungSeite(ziel, k, beschwerde, uebung, umgebung);
  return nichtGefunden(ziel, 'Übung nicht gefunden');
}

function nichtGefunden(ziel, titel) {
  ziel.innerHTML = `<section class="karte leer" style="--farbe: var(--genesung)"><h2>${esc(titel)}</h2>
    <p>Vielleicht wurde sie gelöscht.</p><a class="knopf" href="#/genesung">Zur Genesung</a></section>`;
}

// ---------- Tab ----------

async function tab(ziel, k, umgebung) {
  const { genesung } = k;
  const nach = (s) => genesung.beschwerden.filter((b) => (b.status ?? 'aktiv') === s);
  const aktiv = nach('aktiv');
  const pausiert = nach('pausiert');
  const geheilt = nach('geheilt');

  const kopf = `
    <header class="kopf"><div class="kopf-zeile">
      <h1>Genesung</h1>
      <a class="rund-knopf voll" href="#/genesung/neu" aria-label="Neue Beschwerde anlegen" style="--farbe: var(--genesung)">${symbol('plus', 22, 2.4)}</a>
    </div></header>`;

  if (!genesung.beschwerden.length) {
    ziel.innerHTML = `${kopf}
      <section class="karte leer" style="--farbe: var(--genesung)">
        <span class="symbol-gross">${symbol('genesung', 28)}</span>
        <h2>Noch keine Beschwerde</h2>
        <p>Lege eine Beschwerde an, etwa nach einer Verletzung. Übungen, Termine und die tägliche Schmerzfrage hängen daran.</p>
        <a class="knopf haupt" href="#/genesung/neu">${symbol('plus', 20)}Beschwerde anlegen</a>
      </section>`;
    return;
  }

  ziel.innerHTML = `${kopf}
    ${aktiv.map((b) => aktivKarte(b, k)).join('')}
    ${pausiert.length ? `<div class="abschnitt">${pausiert.map((b) => kompaktZeile(b, k)).join('')}</div>` : ''}
    ${geheilt.length ? `<details class="geheilt abschnitt">
      <summary>${symbol('haken', 18, 2.2)}Geheilt (${geheilt.length})<span class="anzeigen"></span></summary>
      ${geheilt.map((b) => `<div class="karte geheilt-zeile">
        <a href="${adresse(b.id, 'bearbeiten')}"><strong>${esc(b.titel)}</strong>
          <span>${b.statusSeit ? `Geheilt im ${esc(fmtMonatLang.format(alsDatum(b.statusSeit)))}` : 'Geheilt'}</span></a>
        <button type="button" class="textknopf" data-reaktivieren="${esc(b.id)}">Reaktivieren</button>
      </div>`).join('')}
    </details>` : ''}`;

  ziel.onclick = async (e) => {
    const s = e.target.closest('[data-status]');
    if (s) { statusSheet(beschwerdeFinden(k.genesung, s.dataset.status), umgebung); return; }
    const r = e.target.closest('[data-reaktivieren]');
    if (r) {
      await statusSetzen(k.genesung, beschwerdeFinden(k.genesung, r.dataset.reaktivieren), 'aktiv');
      umgebung.meldung('Wieder aktiv');
      umgebung.neuZeichnen();
    }
  };
}

function aktivKarte(b, k) {
  const werte = schmerzWerte(b, k.configs, k.eintraege);
  const liste = termine(k.eintraege, b.id);
  const ord = anordnung(b, k.eintraege);
  const naechster = naechsterTermin(b, k.eintraege);
  const uebungen = aktiveUebungen(b);
  const untertitel = [b.beschreibung, b.seit && `seit ${monatText(b.seit)}`].filter(Boolean).join(' · ');
  return `
    <section class="karte beschwerde" style="--farbe: var(--genesung)">
      <a class="beschwerde-kopf" href="${adresse(b.id, 'bearbeiten')}" aria-label="${esc(b.titel)} bearbeiten">
        <span class="symbol-voll gross">${bild(b, 'genesung', 24)}</span>
        <span class="beschwerde-titel"><strong>${esc(b.titel)}</strong>${untertitel ? `<span>${esc(untertitel)}</span>` : ''}</span>
        ${marke('aktiv')}
      </a>
      ${schmerzVerlauf(werte, new Set(liste.map((t) => t.zeitpunkt.slice(0, 10))))}
      <div class="beschwerde-teil">
        <h3>Übungen</h3>
        ${uebungen.map((u) => uebungZeile(b, u, k)).join('') || '<p class="fussnote links">Noch keine Übung.</p>'}
        <a class="textlink klein" href="${adresse(b.id, 'uebung', 'neu')}" style="--farbe: var(--uebung)">${symbol('plus', 16, 2.4)}Übung hinzufügen</a>
      </div>
      ${ord || naechster ? `<a class="anordnung" href="${adresse(b.id, 'termine')}">
        ${symbol('kalender', 20)}
        <span>
          ${ord ? `<strong>${esc([ord.von, ord.datum && tagKurz(ord.datum)].filter(Boolean).join(' · ') || 'Anordnung')}</strong>
            <span>${esc(ord.text)}</span>` : ''}
          ${naechster ? `<span class="naechster">Nächster Termin: ${esc(fmtTermin.format(alsDatum(naechster.zeitpunkt)))}${naechster.werte.titel ? ` · ${esc(naechster.werte.titel)}` : ''}</span>` : ''}
        </span>
      </a>` : ''}
      <div class="beschwerde-knoepfe">
        <a class="knopf zart" href="${adresse(b.id, 'termin', 'neu')}">Termin eintragen</a>
        <button type="button" class="knopf" data-status="${esc(b.id)}">Status ändern</button>
      </div>
      ${liste.length ? `<a class="textlink klein mitte" href="${adresse(b.id, 'termine')}">Alle Termine (${liste.length})</a>` : ''}
    </section>`;
}

const schnitt = (zahlen) => (zahlen.length ? zahlen.reduce((s, x) => s + x, 0) / zahlen.length : undefined);

/** Balken der letzten 14 Tage, Schnitt der letzten 7 Tage gegen die 7 davor. */
function schmerzVerlauf(werte, terminTage) {
  const heute = datumText();
  const tage = Array.from({ length: 14 }, (_, i) => tageVerschieben(heute, i - 13));
  const vorne = schnitt(tage.slice(7).map((t) => werte.get(t)).filter((v) => v !== undefined));
  const davor = schnitt(tage.slice(0, 7).map((t) => werte.get(t)).filter((v) => v !== undefined));
  let vergleich = '';
  if (vorne !== undefined) {
    const ton = davor === undefined || Math.abs(vorne - davor) < 0.05 ? '' : vorne < davor ? 'gut' : 'schlecht';
    vergleich = `<span class="vergleich ${ton ? `ton-${ton}` : ''}">Ø ${komma.format(vorne)}${davor !== undefined ? ` · Vorwoche ${komma.format(davor)}` : ''}</span>`;
  }
  const mitTermin = tage.some((t) => terminTage.has(t));
  const balken = tage.map((t) => {
    const v = werte.get(t);
    const klasse = [v === undefined ? 'ohne' : '', terminTage.has(t) ? 'termin' : '', t === heute ? 'heute' : ''].join(' ');
    const hoehe = v === undefined ? 3 : Math.max(4, Math.round((v / 10) * 72));
    return `<span class="${klasse}" style="height:${hoehe}px" title="${esc(tagKurz(t))}: ${v ?? 'kein Wert'}"></span>`;
  }).join('');
  const leer = ![...werte.keys()].length;
  return `
    <div class="beschwerde-teil">
      <div class="teil-kopf"><h3>Schmerz, letzte 14 Tage</h3>${vergleich}</div>
      ${leer ? '<p class="fussnote links">Noch keine Werte. Die Frage steht täglich im Tages-Check.</p>' : `
      <div class="schmerz-balken" role="img" aria-label="Schmerzwerte der letzten 14 Tage auf einer Skala von 0 bis 10">${balken}</div>
      <div class="balken-achse"><span>${esc(tagKurz(tage[0]))}</span>${mitTermin ? '<span><i class="termin-punkt"></i>Termin</span>' : ''}<span>Heute</span></div>`}
    </div>`;
}

function uebungZeile(b, u, k) {
  const liste = uebungsEintraege(k.eintraege, b.id, u.id);
  const verlauf = tageVerlauf(liste, 7);
  const soll = u.proTag ?? 1;
  const stand = tagesStand(u, liste, datumText());
  const gemacht = verlauf.filter((t) => t.anzahl >= soll).length;
  const text = stand.woche
    ? `${rhythmusText(u)} · diese Woche ${stand.woche.anzahl} von ${stand.woche.soll}`
    : `${[zielText(u), rhythmusText(u)].filter(Boolean).join(' · ')} · ${gemacht} von 7`;
  return `
    <a class="ue-zeile" href="${adresse(b.id, 'uebung', u.id)}" style="--farbe: var(--uebung)">
      <span class="symbol-klein">${uebungsBild(u, 20)}</span>
      <span class="ue-text"><strong>${esc(u.titel)}</strong><span>${esc(text)}</span></span>
      <span class="ue-tage" aria-label="Letzte 7 Tage: ${gemacht} gemacht">
        ${verlauf.map((t) => `<i class="${t.anzahl >= soll ? 'an' : t.anzahl ? 'halb' : ''}"></i>`).join('')}
      </span>
    </a>`;
}

function kompaktZeile(b, k) {
  const werte = schmerzWerte(b, k.configs, k.eintraege);
  const letzter = [...werte.entries()].sort((x, y) => y[0].localeCompare(x[0]))[0];
  return `
    <button type="button" class="karte beschwerde-kompakt" data-status="${esc(b.id)}" style="--farbe: var(--genesung)">
      <span class="symbol-klein grau">${bild(b, 'genesung', 22)}</span>
      <span class="beschwerde-titel"><strong>${esc(b.titel)}</strong>
        <span>Keine tägliche Abfrage${letzter ? ` · letzter Wert ${letzter[1]}` : ''}</span></span>
      ${marke(b.status)}
    </button>`;
}

// ---------- Status ----------

async function statusSetzen(genesung, b, status) {
  if (b.status === status) return;
  const heute = datumText();
  b.status = status;
  b.statusSeit = heute;
  await genesungSichern(genesung);
  const jetzt = new Date().toISOString();
  await speichern(SPEICHER.eintraege, {
    id: neueId(), bereich: GENESUNG, zeitpunkt: zeitpunktText(),
    werte: { art: 'status', beschwerde: b.id, status }, erstellt: jetzt, geaendert: jetzt,
  });
}

function statusSheet(b, umgebung) {
  sheetOeffnen(`Status: ${b.titel}`, (koerper, schliessen) => {
    koerper.innerHTML = `
      <div class="status-wahl">
        ${Object.entries(STATUS).map(([id, s]) => `
          <button type="button" class="wahl status-option" data-wert="${id}" aria-pressed="${(b.status ?? 'aktiv') === id}">
            <strong>${esc(s.titel)}</strong><span>${esc(s.text)}</span>
          </button>`).join('')}
      </div>
      <a class="textlink mitte" href="${adresse(b.id, 'bearbeiten')}">Beschwerde bearbeiten</a>`;
    koerper.querySelector('a').addEventListener('click', schliessen);
    koerper.querySelectorAll('[data-wert]').forEach((k) => k.addEventListener('click', async () => {
      const { genesung } = await genesungKontext();
      await statusSetzen(genesung, beschwerdeFinden(genesung, b.id), k.dataset.wert);
      schliessen();
      umgebung.meldung(STATUS[k.dataset.wert].titel);
      umgebung.neuZeichnen();
    }));
  });
}

// ---------- Übungsseite ----------

function uebungSeite(ziel, k, b, u, umgebung) {
  const liste = uebungsEintraege(k.eintraege, b.id, u.id);
  const heute = datumText();
  const verlauf = tageVerlauf(liste, 7);
  const soll = u.proTag ?? 1;
  const gemacht = verlauf.filter((t) => t.anzahl >= soll).length;
  const abhaken = u.messart === 'abhaken';
  const max = Math.max(1, ...verlauf.map((t) => (t.bester ? inSekunden(t.bester.werte.wert, t.bester.werte.einheit) : 0)));
  const best = bestwert(liste);

  const balken = verlauf.map((t) => {
    const name = fmtWochentag.format(alsDatum(t.tag)).replace('.', '');
    if (abhaken || !t.bester) {
      return `<div class="woche-balken"><span>${t.anzahl ? (abhaken ? '✓' : t.anzahl) : '–'}</span>
        <i class="${t.anzahl >= soll ? 'an' : t.anzahl ? 'halb' : ''}" style="height:${t.anzahl ? 64 : 3}px"></i><span>${esc(name)}</span></div>`;
    }
    const sek = inSekunden(t.bester.werte.wert, t.bester.werte.einheit);
    const istBest = sek === max; // bester Tag der sieben
    return `<div class="woche-balken"><span>${esc(wertAnzeige(t.bester.werte.wert, t.bester.werte.einheit))}</span>
      <i class="${istBest ? 'best' : 'an'}" style="height:${Math.max(4, Math.round((sek / max) * 64))}px"></i><span>${esc(name)}</span></div>`;
  }).join('');

  const eckdaten = [
    ['Messart', `${MESSARTEN[u.messart]?.titel}${u.einheit && !abhaken ? ` in ${EINHEITEN[u.einheit]}` : ''}`, MESSARTEN[u.messart]?.symbol],
    ['Rhythmus', rhythmusText(u), 'wiederholen'],
    u.ziel ? ['Ziel', zielText(u), 'stern'] : null,
    best && !abhaken ? ['Bestwert', `${wertAnzeige(best.werte.wert, best.werte.einheit)} am ${tagKurz(best.zeitpunkt.slice(0, 10))}`, 'stern'] : null,
    u.angeordnet?.von || u.angeordnet?.datum
      ? ['Angeordnet', [u.angeordnet.von, u.angeordnet.datum && tagKurz(u.angeordnet.datum)].filter(Boolean).join(', '), 'arzt'] : null,
    u.ab && u.verlauf?.length ? ['So seit', tagVoll(u.ab), 'kalender'] : null,
  ].filter(Boolean);

  const unterzeile = [MESSARTEN[u.messart]?.eintragen, u.hinweis].filter(Boolean).join(' · ');
  ziel.innerHTML = `
    <div class="seiten-leiste">
      <a class="zurueck-link" href="#/genesung" style="color: var(--genesung)">${symbol('zurueck', 20)}${esc(b.titel)}</a>
      <a class="textknopf" href="${adresse(b.id, 'uebung', u.id, 'bearbeiten')}" style="--farbe: var(--uebung)">Bearbeiten</a>
    </div>
    <header class="eingabe-kopf" style="--farbe: var(--uebung)">
      <span class="symbol-voll gross">${uebungsBild(u, 28)}</span>
      <div><h1>${esc(u.titel)}</h1><p>${esc(unterzeile)}</p></div>
    </header>
    ${u.beendet ? `<p class="hinweis-zart">Beendet am ${esc(tagVoll(u.beendet))}. Unter „Bearbeiten" wieder aufnehmen.</p>` : ''}
    <section class="karte ue-karte" data-eingabe></section>
    ${liste.some((e) => e.zeitpunkt.slice(0, 10) === heute) ? `<section class="abschnitt"><h2>Heute</h2>
      <div class="karte eintraege">${liste.filter((e) => e.zeitpunkt.slice(0, 10) === heute).map(eintragZeile).join('')}</div></section>` : ''}
    <section class="karte ue-woche" style="--farbe: var(--uebung)">
      <div class="teil-kopf"><h2>Letzte 7 Tage</h2><span class="vergleich ton-gut">${gemacht} von 7 gemacht</span></div>
      <div class="woche-diagramm" role="img" aria-label="Letzte sieben Tage">${balken}</div>
    </section>
    <section class="karte eckdaten" style="--farbe: var(--uebung)">
      ${eckdaten.map(([l, v, s]) => `<div>${symbol(s, 20)}<span>${esc(l)}</span><span>${esc(v)}</span></div>`).join('')}
    </section>
    ${u.verlauf?.length ? `<section class="abschnitt"><h2>Frühere Einstellungen</h2>
      <div class="karte info">${[...u.verlauf].reverse().map((v) => `<div><span>${v.ab ? `${esc(tagKurz(v.ab))} – ` : 'bis '}${esc(tagKurz(v.bis))}</span>
        <span>${esc(einstellungText(v))}</span></div>`).join('')}</div>
      <p class="fussnote links">Frühere Werte bleiben, jeder Eintrag merkt sich Messart und Einheit.</p></section>` : ''}
    ${liste.length ? `<section class="abschnitt"><h2>Einträge</h2>
      <div class="karte eintraege">${liste.slice(0, 30).map(eintragZeile).join('')}</div>
      ${liste.length > 30 ? `<p class="fussnote links">Die letzten 30 von ${liste.length}. Alle stehen in der CSV.</p>` : ''}</section>` : ''}`;

  const neu = () => uebungEingabe(ziel.querySelector('[data-eingabe]'), {
    beschwerde: b, uebung: u, liste,
    gesichert: () => { umgebung.meldung('Gesichert'); umgebung.neuZeichnen(); },
  });
  neu();

  ziel.onclick = (e) => {
    const z = e.target.closest('[data-eintrag]');
    if (!z) return;
    const eintrag = liste.find((x) => x.id === z.dataset.eintrag);
    sheetOeffnen(u.titel, (koerper, schliessen) => uebungEingabe(koerper, {
      beschwerde: b, uebung: u, liste, eintrag, abbrechen: schliessen,
      gesichert: () => { schliessen(); umgebung.meldung('Gesichert'); umgebung.neuZeichnen(); },
      geloescht: () => { schliessen(); umgebung.meldung('Gelöscht'); umgebung.neuZeichnen(); },
    }), { untertitel: 'Eintrag ändern', farbe: '--uebung' });
  };
}

function eintragZeile(e) {
  return `<button type="button" class="eintrag-zeile" data-eintrag="${esc(e.id)}" style="--farbe: var(--uebung)">
      <span class="symbol-klein">${symbol(e.werte.wert === true ? 'haken' : 'uhr', 18)}</span>
      <span class="eintrag-text"><span class="eintrag-titel"><strong>${esc(wertAnzeige(e.werte.wert, e.werte.einheit))}</strong>
        <span>${esc(tagVoll(e.zeitpunkt))}, ${esc(e.zeitpunkt.slice(11, 16))}</span></span></span>
      ${symbol('stift', 16)}
    </button>`;
}

// ---------- Übersicht: Übungen des Tages ----------

/** Abschnitt „Übungen" für die Übersicht. Leer, wenn keine aktive Beschwerde Übungen hat. */
export function uebungenFuerTag(tag, k) {
  const zeilen = [];
  for (const b of k.genesung.beschwerden.filter((x) => (x.status ?? 'aktiv') === 'aktiv')) {
    for (const u of aktiveUebungen(b)) {
      const liste = uebungsEintraege(k.eintraege, b.id, u.id);
      zeilen.push({ b, u, stand: tagesStand(u, liste, tag) });
    }
  }
  if (!zeilen.length) return '';
  const heute = tag === datumText();
  const offen = zeilen.filter((z) => z.stand.offen).length;
  const zeile = ({ b, u, stand }) => {
    let text;
    if (stand.erledigt) text = stand.soll > 1 ? `${stand.anzahl} von ${stand.soll}, erledigt` : 'Erledigt';
    else if (stand.woche && !stand.offen) text = `Wochenziel erreicht (${stand.woche.anzahl} von ${stand.woche.soll})`;
    else if (stand.anzahl) text = `${stand.anzahl} von ${stand.soll}`;
    else text = heute ? 'Noch offen' : 'Nicht eingetragen';
    if (stand.woche && stand.offen) text += ` · diese Woche ${stand.woche.anzahl} von ${stand.woche.soll}`;
    const fertig = stand.erledigt || (stand.woche && !stand.offen);
    return `
      <button type="button" class="eintrag-zeile ue-schnell" data-schnell="${esc(b.id)}/${esc(u.id)}" data-tag="${esc(tag)}" style="--farbe: var(--uebung)">
        <span class="symbol-klein">${uebungsBild(u, 20)}</span>
        <span class="eintrag-text">
          <span class="eintrag-titel"><strong>${esc(u.titel)}</strong><span>${esc(b.titel)}</span></span>
          <span class="eintrag-inhalt ${stand.offen && heute ? 'offen' : ''}">${esc(text)}</span>
        </span>
        <span class="marke ${fertig ? 'erledigt' : ''}" role="img" aria-label="${fertig ? 'Erledigt' : 'Offen'}">${symbol(fertig ? 'haken' : 'plus', 16, 2.6)}</span>
      </button>`;
  };
  return `
    <section class="abschnitt">
      <div class="teil-kopf"><h2>Übungen</h2>${heute && offen ? `<span class="offen-zahl">${offen} offen</span>` : ''}</div>
      <div class="karte eintraege">${zeilen.map(zeile).join('')}</div>
    </section>`;
}

/** Schnelleintrag von der Übersicht als Sheet. */
export async function schnellEintrag(schluessel, tag, umgebung) {
  const [bid, uid] = schluessel.split('/');
  const k = await genesungKontext();
  const b = beschwerdeFinden(k.genesung, bid);
  const u = uebungFinden(b, uid);
  if (!u) return;
  const liste = uebungsEintraege(k.eintraege, b.id, u.id);
  sheetOeffnen(u.titel, (koerper, schliessen) => {
    uebungEingabe(koerper, {
      beschwerde: b, uebung: u, liste, tag, abbrechen: schliessen,
      gesichert: () => { schliessen(); umgebung.meldung('Gesichert'); umgebung.neuZeichnen(); },
    });
    koerper.insertAdjacentHTML('beforeend',
      `<a class="textlink mitte" href="${adresse(b.id, 'uebung', u.id)}" style="--farbe: var(--uebung)">Übung ansehen</a>`);
    koerper.querySelector('a.textlink').addEventListener('click', schliessen);
  }, { untertitel: [b.titel, MESSARTEN[u.messart]?.eintragen].join(' · '), farbe: '--uebung' });
}

// ---------- Termine ----------

function termineSeite(ziel, k, b) {
  const liste = termine(k.eintraege, b.id);
  const jetzt = zeitpunktText();
  const kommend = liste.filter((e) => e.zeitpunkt > jetzt).reverse();
  const vergangen = liste.filter((e) => e.zeitpunkt <= jetzt);
  const zeile = (e) => `
    <a class="eintrag-zeile termin-zeile" href="${adresse(b.id, 'termin', e.id)}" style="--farbe: var(--genesung)">
      <span class="symbol-klein">${symbol('kalender', 18)}</span>
      <span class="eintrag-text">
        <span class="eintrag-titel"><strong>${esc(e.werte.titel || 'Termin')}</strong><span>${esc(fmtTermin.format(alsDatum(e.zeitpunkt)))}</span></span>
        ${e.werte.notiz ? `<span class="termin-notiz">${e.werte.anordnung ? '<b>Anordnung</b> ' : ''}${esc(e.werte.notiz)}</span>` : ''}
      </span>
      ${symbol('weiter', 18)}
    </a>`;
  ziel.innerHTML = `
    <a class="zurueck-link" href="#/genesung" style="color: var(--genesung)">${symbol('zurueck', 20)}Genesung</a>
    <header class="kopf"><h1>Termine</h1><p class="kopf-unter">${esc(b.titel)}</p></header>
    <a class="knopf haupt" href="${adresse(b.id, 'termin', 'neu')}" style="--farbe: var(--genesung)">${symbol('plus', 20)}Termin eintragen</a>
    ${kommend.length ? `<section class="abschnitt"><h2>Kommend</h2><div class="karte eintraege">${kommend.map(zeile).join('')}</div></section>` : ''}
    ${vergangen.length ? `<section class="abschnitt"><h2>Vergangen</h2><div class="karte eintraege">${vergangen.map(zeile).join('')}</div></section>` : ''}
    ${!liste.length ? '<p class="fussnote">Noch keine Termine.</p>' : ''}
    ${b.anordnung?.text ? `<section class="abschnitt"><h2>Anordnung aus der Startdatei</h2>
      <div class="karte"><p class="termin-notiz">${esc(b.anordnung.text)}</p></div>
      <p class="fussnote links">Gilt, bis ein Termin mit Anordnung eingetragen ist.</p></section>` : ''}`;
}

function terminFormular(ziel, k, b, eintragId, umgebung) {
  const alt = eintragId ? k.eintraege.find((e) => e.id === eintragId && e.bereich === GENESUNG) : undefined;
  if (eintragId && !alt) { nichtGefunden(ziel, 'Termin nicht gefunden'); return; }
  const w = alt?.werte ?? {};
  // Bisher verwendete Bezeichnungen als Vorschläge, häufigste zuerst.
  const zaehler = new Map();
  for (const e of k.eintraege) {
    if (e.bereich === GENESUNG && e.werte?.art === 'termin' && e.werte.titel) zaehler.set(e.werte.titel, (zaehler.get(e.werte.titel) ?? 0) + 1);
  }
  const vorschlaege = [...zaehler.entries()].sort((x, y) => y[1] - x[1]).map(([t]) => t).slice(0, 6);

  ziel.innerHTML = `
    <form class="eingabe formular" style="--farbe: var(--genesung)" novalidate>
      <div class="eingabe-leiste">
        <button type="button" class="textknopf" data-abbrechen>${symbol('zurueck', 20)}Abbrechen</button>
      </div>
      <header class="eingabe-kopf">
        <span class="symbol-voll">${symbol('kalender', 26)}</span>
        <div><h1>${alt ? 'Termin' : 'Termin eintragen'}</h1><p>${esc(b.titel)}</p></div>
      </header>
      <section class="feld">
        <h2 class="feld-titel">Wann</h2>
        <input class="eingabe-feld" type="datetime-local" name="zeitpunkt" value="${esc(alt?.zeitpunkt ?? zeitpunktText())}" required>
      </section>
      <section class="feld">
        <h2 class="feld-titel">Was</h2>
        <input class="eingabe-feld" name="titel" value="${esc(w.titel ?? '')}" placeholder="Art des Termins" autocomplete="off" autocapitalize="sentences">
        ${vorschlaege.length ? `<div class="pillen">${vorschlaege.map((t) => `<button type="button" class="wahl pille" data-vorschlag="${esc(t)}">${esc(t)}</button>`).join('')}</div>` : ''}
      </section>
      <section class="feld">
        <h2 class="feld-titel">Was kam heraus<span class="optional"> · optional</span></h2>
        <textarea class="eingabe-feld" name="notiz" rows="4" placeholder="Ergebnis, neue Übungen, nächste Schritte">${esc(w.notiz ?? '')}</textarea>
        <label class="haken-zeile"><input type="checkbox" name="anordnung" ${w.anordnung ? 'checked' : ''}> Gilt ab jetzt als Anordnung</label>
        <p class="feld-hilfe">Die Notiz erscheint dann auf der Karte der Beschwerde. Übungen passt du unter „Übungen" an.</p>
      </section>
      <div class="sichern-leiste">
        ${alt ? `<button type="button" class="knopf gefahr" data-loeschen>Löschen</button>` : ''}
        <button type="submit" class="knopf haupt">Sichern</button>
      </div>
    </form>`;

  const form = ziel.querySelector('form');
  const zurueck = () => { location.hash = adresse(b.id, 'termine'); };
  form.querySelector('[data-abbrechen]').addEventListener('click', () => history.length > 1 ? history.back() : zurueck());
  form.querySelectorAll('[data-vorschlag]').forEach((p) => p.addEventListener('click', () => { form.elements.titel.value = p.dataset.vorschlag; }));
  form.querySelector('[data-loeschen]')?.addEventListener('click', async () => {
    if (!confirm('Diesen Termin löschen?')) return;
    await loeschen(SPEICHER.eintraege, alt.id);
    umgebung.meldung('Gelöscht');
    zurueck();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = form.elements;
    if (!f.zeitpunkt.value) { f.zeitpunkt.focus(); return; }
    const jetzt = new Date().toISOString();
    await speichern(SPEICHER.eintraege, {
      id: alt?.id ?? neueId(), bereich: GENESUNG, zeitpunkt: f.zeitpunkt.value,
      werte: {
        art: 'termin', beschwerde: b.id, titel: f.titel.value.trim(), notiz: f.notiz.value.trim(),
        ...(f.anordnung.checked ? { anordnung: true } : {}),
      },
      erstellt: alt?.erstellt ?? jetzt, geaendert: jetzt,
    });
    umgebung.meldung('Gesichert');
    location.hash = '#/genesung';
  });
}

// ---------- Formulare für Beschwerde und Übung ----------

/** Auswahl als Segment aus Radioknöpfen. */
function segment(name, optionen, wert) {
  return `<div class="segment-wahl" role="radiogroup" style="--spalten:${optionen.length}">
    ${optionen.map(([id, titel]) => `<label><input type="radio" name="${name}" value="${esc(id)}" ${String(wert) === String(id) ? 'checked' : ''}><span>${esc(titel)}</span></label>`).join('')}
  </div>`;
}

function formularRahmen({ titel, untertitel, sym, farbe, inhalt, loeschbar, loeschHinweis }) {
  return `
    <form class="eingabe formular" style="--farbe: var(${farbe})" novalidate>
      <div class="eingabe-leiste">
        <button type="button" class="textknopf" data-abbrechen>${symbol('zurueck', 20)}Abbrechen</button>
      </div>
      <header class="eingabe-kopf">
        <span class="symbol-voll">${sym}</span>
        <div><h1>${esc(titel)}</h1>${untertitel ? `<p>${esc(untertitel)}</p>` : ''}</div>
      </header>
      ${inhalt}
      <div class="sichern-leiste"><button type="submit" class="knopf haupt">Sichern</button></div>
      ${loeschbar ? `<button type="button" class="knopf gefahr breit" data-loeschen>${symbol('muell', 20)}Löschen</button>
        <p class="fussnote links">${esc(loeschHinweis)}</p>` : ''}
    </form>`;
}

function beschwerdeFormular(ziel, k, b, umgebung) {
  const { genesung } = k;
  const verwendet = b && k.eintraege.some((e) => e.bereich === GENESUNG && e.werte?.beschwerde === b.id && e.werte.art !== 'status');
  const uebungen = b?.uebungen ?? [];
  const aktuellSymbol = b?.pfad ? 'eigen' : (b?.symbol ?? 'genesung');

  ziel.innerHTML = formularRahmen({
    titel: b ? b.titel : 'Neue Beschwerde',
    untertitel: b ? 'Bearbeiten' : 'Übungen und Termine kommen danach',
    sym: bild(b, 'genesung', 26),
    farbe: '--genesung',
    loeschbar: b && !verwendet,
    loeschHinweis: 'Nur möglich, solange keine Übungswerte oder Termine daran hängen. Sonst besser „Geheilt" wählen.',
    inhalt: `
      <section class="feld">
        <h2 class="feld-titel">Name</h2>
        <input class="eingabe-feld" name="titel" value="${esc(b?.titel ?? '')}" placeholder="z. B. Körperstelle" autocomplete="off" autocapitalize="sentences" required>
      </section>
      <section class="feld">
        <h2 class="feld-titel">Beschreibung<span class="optional"> · optional</span></h2>
        <input class="eingabe-feld" name="beschreibung" value="${esc(b?.beschreibung ?? '')}" placeholder="Genauer: wo, was" autocomplete="off">
      </section>
      <section class="feld">
        <h2 class="feld-titel">Seit<span class="optional"> · optional</span></h2>
        <input class="eingabe-feld" type="month" name="seit" value="${esc(b?.seit ?? '')}">
      </section>
      <section class="feld">
        <h2 class="feld-titel">Status</h2>
        ${segment('status', Object.entries(STATUS).map(([id, s]) => [id, s.titel]), b?.status ?? 'aktiv')}
        <p class="feld-hilfe">Aktiv: tägliche Schmerzfrage 0–10 im Tages-Check und Übungen auf der Übersicht.</p>
      </section>
      <section class="feld">
        <h2 class="feld-titel">Symbol</h2>
        <div class="symbol-wahl" role="radiogroup" aria-label="Symbol">
          ${b?.pfad ? `<label><input type="radio" name="symbol" value="eigen" checked><span>${bild(b, 'genesung', 20)}</span></label>` : ''}
          ${SYMBOL_AUSWAHL.map((s) => `<label><input type="radio" name="symbol" value="${s}" ${aktuellSymbol === s ? 'checked' : ''}><span>${symbol(s, 20)}</span></label>`).join('')}
        </div>
      </section>
      ${b ? `<section class="feld">
        <h2 class="feld-titel">Übungen</h2>
        <div class="karte liste-links" style="--farbe: var(--uebung)">
          ${uebungen.map((u) => `<a href="${adresse(b.id, 'uebung', u.id, 'bearbeiten')}">
            <span class="symbol-klein">${uebungsBild(u, 20)}</span>
            <span><strong>${esc(u.titel)}</strong><span>${esc(u.beendet ? `beendet am ${tagVoll(u.beendet)}` : einstellungText(u))}</span></span>
            ${symbol('weiter', 18)}</a>`).join('')}
          <a href="${adresse(b.id, 'uebung', 'neu')}"><span class="symbol-klein">${symbol('plus', 20)}</span><span><strong>Übung hinzufügen</strong></span>${symbol('weiter', 18)}</a>
        </div>
      </section>` : ''}`,
  });

  const form = ziel.querySelector('form');
  form.querySelector('[data-abbrechen]').addEventListener('click', () => { location.hash = '#/genesung'; });
  form.querySelector('[data-loeschen]')?.addEventListener('click', async () => {
    if (!confirm(`„${b.titel}" löschen?`)) return;
    genesung.beschwerden = genesung.beschwerden.filter((x) => x.id !== b.id);
    await genesungSichern(genesung);
    umgebung.meldung('Gelöscht');
    location.hash = '#/genesung';
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = form.elements;
    const titel = f.titel.value.trim();
    if (!titel) { f.titel.focus(); return; }
    const status = f.status.value || 'aktiv';
    const eintrag = b ?? { id: idAus(titel, genesung.beschwerden.map((x) => x.id)), uebungen: [], status };
    const statusAlt = b?.status;
    Object.assign(eintrag, { titel, beschreibung: f.beschreibung.value.trim() || undefined, seit: f.seit.value || undefined });
    if (f.symbol.value !== 'eigen') { eintrag.symbol = f.symbol.value; delete eintrag.pfad; }
    if (!b) { eintrag.statusSeit = datumText(); genesung.beschwerden.push(eintrag); }
    await genesungSichern(genesung);
    if (b && status !== statusAlt) await statusSetzen(genesung, eintrag, status);
    umgebung.meldung('Gesichert');
    location.hash = '#/genesung';
  });
}

function uebungFormular(ziel, k, b, u, umgebung) {
  const { genesung } = k;
  const liste = u ? uebungsEintraege(k.eintraege, b.id, u.id) : [];
  const rhythmus = u?.rhythmus ?? 'taeglich';
  const proWoche = typeof rhythmus === 'number' ? rhythmus : 3;

  ziel.innerHTML = formularRahmen({
    titel: u ? u.titel : 'Neue Übung',
    untertitel: b.titel,
    sym: u ? uebungsBild(u, 26) : symbol('plus', 26),
    farbe: '--uebung',
    loeschbar: u && !liste.length,
    loeschHinweis: 'Nur möglich, solange es keine Einträge gibt. Sonst „Übung beenden".',
    inhalt: `
      <section class="feld">
        <h2 class="feld-titel">Name</h2>
        <input class="eingabe-feld" name="titel" value="${esc(u?.titel ?? '')}" placeholder="Name der Übung" autocomplete="off" autocapitalize="sentences" required>
      </section>
      <section class="feld">
        <h2 class="feld-titel">Hinweis<span class="optional"> · optional</span></h2>
        <input class="eingabe-feld" name="hinweis" value="${esc(u?.hinweis ?? '')}" placeholder="Wie ausführen" autocomplete="off">
      </section>
      <section class="feld">
        <h2 class="feld-titel">Messart</h2>
        ${segment('messart', Object.entries(MESSARTEN).map(([id, m]) => [id, m.titel]), u?.messart ?? 'abhaken')}
        <p class="feld-hilfe" data-messart-hilfe></p>
      </section>
      <section class="feld" data-nur-zahl>
        <h2 class="feld-titel">Einheit</h2>
        ${segment('einheit', Object.entries(EINHEITEN), u?.einheit ?? 's')}
      </section>
      <section class="feld">
        <h2 class="feld-titel">Ziel<span class="optional"> · optional</span></h2>
        <label class="zahl-feld rand"><input type="number" inputmode="numeric" min="0" name="ziel" value="${esc(u?.ziel ?? '')}" placeholder="–"><span data-ziel-einheit></span></label>
      </section>
      <section class="feld">
        <h2 class="feld-titel">Rhythmus</h2>
        ${segment('rhythmus', [['taeglich', 'Täglich'], ['woche', 'Pro Woche']], typeof rhythmus === 'number' ? 'woche' : 'taeglich')}
        <label class="zahl-zeile" data-nur-woche><span>So oft pro Woche</span>
          <input class="eingabe-feld" type="number" inputmode="numeric" min="1" max="7" name="proWoche" value="${proWoche}"></label>
        <label class="zahl-zeile"><span>Einträge pro Tag</span>
          <input class="eingabe-feld" type="number" inputmode="numeric" min="1" max="10" name="proTag" value="${u?.proTag ?? 1}"></label>
        <p class="feld-hilfe">Bei mehr als einem Eintrag pro Tag zeigt die App „1 von 2" und bietet weitere an.</p>
      </section>
      <section class="feld">
        <h2 class="feld-titel">Angeordnet<span class="optional"> · optional</span></h2>
        <input class="eingabe-feld" name="von" value="${esc(u?.angeordnet?.von ?? '')}" placeholder="Von wem" autocomplete="off">
        <input class="eingabe-feld" type="date" name="datum" value="${esc(u?.angeordnet?.datum ?? '')}" aria-label="Angeordnet am">
      </section>
      ${u && liste.length ? '<p class="fussnote links">Ändern sich Messart, Einheit, Ziel oder Rhythmus, gilt das ab heute. Frühere Werte bleiben und sind weiter vergleichbar.</p>' : ''}
      ${u ? `<button type="button" class="knopf breit" data-beenden>${u.beendet ? 'Übung wieder aufnehmen' : 'Übung beenden'}</button>` : ''}`,
  });

  const form = ziel.querySelector('form');
  const f = form.elements;
  const anpassen = () => {
    const m = f.messart.value;
    form.querySelector('[data-nur-zahl]').hidden = m === 'abhaken';
    form.querySelector('[data-nur-woche]').hidden = f.rhythmus.value !== 'woche';
    form.querySelector('[data-ziel-einheit]').textContent = m === 'abhaken' || f.einheit.value === 'min' ? 'min' : 's';
    form.querySelector('[data-messart-hilfe]').textContent = {
      abhaken: 'Nur „gemacht" eintragen. Ein Ziel in Minuten wird angezeigt.',
      dauer: 'Wie lange, vorbelegt mit dem letzten Wert, −5 und +5.',
      bestwert: 'Bester Wert, z. B. so lange wie möglich. Die App zeigt den Bestwert.',
    }[m];
  };
  form.addEventListener('change', anpassen);
  anpassen();

  const zurueck = () => { location.hash = u ? adresse(b.id, 'uebung', u.id) : '#/genesung'; };
  form.querySelector('[data-abbrechen]').addEventListener('click', zurueck);

  form.querySelector('[data-beenden]')?.addEventListener('click', async () => {
    const gb = beschwerdeFinden(genesung, b.id);
    const gu = uebungFinden(gb, u.id);
    if (gu.beendet) delete gu.beendet;
    else {
      if (!confirm(`„${u.titel}" beenden? Sie erscheint nicht mehr auf der Übersicht, alle Werte bleiben.`)) return;
      gu.beendet = datumText();
    }
    await genesungSichern(genesung);
    umgebung.meldung(gu.beendet ? 'Beendet' : 'Wieder aufgenommen');
    location.hash = adresse(b.id, 'uebung', u.id);
  });

  form.querySelector('[data-loeschen]')?.addEventListener('click', async () => {
    if (!confirm(`„${u.titel}" löschen?`)) return;
    const gb = beschwerdeFinden(genesung, b.id);
    gb.uebungen = gb.uebungen.filter((x) => x.id !== u.id);
    await genesungSichern(genesung);
    umgebung.meldung('Gelöscht');
    location.hash = '#/genesung';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const titel = f.titel.value.trim();
    if (!titel) { f.titel.focus(); return; }
    const messart = f.messart.value || 'abhaken';
    const zahl = (name, min, max) => {
      const n = Math.round(Number(f[name].value));
      return Number.isFinite(n) && n >= min ? Math.min(n, max) : undefined;
    };
    const neu = {
      messart,
      einheit: messart === 'abhaken' ? undefined : (f.einheit.value || 's'),
      ziel: zahl('ziel', 1, 100000),
      rhythmus: f.rhythmus.value === 'woche' ? (zahl('proWoche', 1, 7) ?? 3) : 'taeglich',
      proTag: zahl('proTag', 1, 10) ?? 1,
    };
    const gb = beschwerdeFinden(genesung, b.id);
    gb.uebungen ??= [];
    let gu = u && uebungFinden(gb, u.id);
    const heute = datumText();
    if (!gu) {
      gu = { id: idAus(titel, gb.uebungen.map((x) => x.id)), ab: heute };
      gb.uebungen.push(gu);
    } else if (liste.length && EINSTELLUNGEN.some((s) => (gu[s] ?? undefined) !== (neu[s] ?? undefined)) && gu.ab !== heute) {
      // Alte Einstellung in den Verlauf, damit frühere Werte richtig gelesen und verglichen werden.
      const erster = liste.at(-1).zeitpunkt.slice(0, 10);
      const alt = Object.fromEntries(EINSTELLUNGEN.filter((s) => gu[s] !== undefined).map((s) => [s, gu[s]]));
      gu.verlauf = [...(gu.verlauf ?? []), { ab: gu.ab ?? erster, bis: tageVerschieben(heute, -1), ...alt }];
      gu.ab = heute;
    }
    Object.assign(gu, { titel, hinweis: f.hinweis.value.trim() || undefined }, neu);
    for (const s of EINSTELLUNGEN) if (gu[s] === undefined) delete gu[s];
    const von = f.von.value.trim();
    gu.angeordnet = von || f.datum.value ? { von: von || undefined, datum: f.datum.value || undefined } : undefined;
    if (!gu.angeordnet) delete gu.angeordnet;
    if (!gu.hinweis) delete gu.hinweis;
    await genesungSichern(genesung);
    umgebung.meldung('Gesichert');
    location.hash = adresse(b.id, 'uebung', gu.id);
  });
}


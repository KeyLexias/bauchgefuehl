// Zeichnet Felder aus der Konfiguration. Jeder Knopf trägt seinen Pfad in die Werte (data-pfad)
// und eine Aktion (data-aktion); formular.js wertet Klicks und Eingaben aus.
import { symbol } from './symbole.js';
import { esc, initialen, farbeVon } from './hilfen.js';
import { TAGESZEITEN } from './konfiguration.js';

const pfadAttr = (pfad) => `data-pfad="${esc(JSON.stringify(pfad))}"`;

export function wertLesen(werte, pfad) {
  return pfad.reduce((o, k) => (o == null ? undefined : o[k]), werte);
}

export function wertSetzen(werte, pfad, wert) {
  let o = werte;
  for (const k of pfad.slice(0, -1)) {
    if (o[k] == null || typeof o[k] !== 'object') o[k] = {};
    o = o[k];
  }
  const letzter = pfad[pfad.length - 1];
  if (wert === undefined || wert === '' || wert === null) delete o[letzter];
  else o[letzter] = wert;
}

const sichtbar = (liste) => (liste ?? []).filter((x) => !x.ausgeblendet);
// Ausgeblendete Optionen erscheinen trotzdem, solange sie im Eintrag gewählt sind.
const sichtbareOptionen = (f, gewaehlt) => (f.optionen ?? []).filter((o) => !o.ausgeblendet || gewaehlt(o.id));

function optionSymbol(o, groesse = 20) {
  if (o.bild) {
    return `<svg aria-hidden="true" class="form" viewBox="${esc(o.bild.viewBox ?? '0 0 24 24')}" fill="currentColor"><path d="${esc(o.bild.d)}"/></svg>`;
  }
  if (o.pfad) {
    return `<svg aria-hidden="true" width="${groesse}" height="${groesse}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${esc(o.pfad)}"/></svg>`;
  }
  return o.symbol ? symbol(o.symbol, groesse) : '';
}

function knopf({ pfad, aktion, wert, an, klasse, inhalt, label, zahl }) {
  return `<button type="button" class="wahl ${klasse}" data-aktion="${aktion}" ${pfadAttr(pfad)}
    ${wert !== undefined ? `data-wert="${esc(wert)}"` : ''} ${zahl ? 'data-zahl' : ''}
    aria-pressed="${an ? 'true' : 'false'}" ${label ? `aria-label="${esc(label)}"` : ''}>${inhalt}</button>`;
}

function raster(spalten, inhalt, klasse = '') {
  return `<div class="raster ${klasse}" style="--spalten:${spalten}">${inhalt}</div>`;
}

function hinweisBox(text) {
  return `<div class="hinweis" role="note">${symbol('hinweis', 18)}<span>${esc(text)}</span></div>`;
}

// ---------- einzelne Feldtypen ----------

function einfachZeichnen(f, ctx, basis) {
  const pfad = [...basis, f.id];
  const gewaehlt = wertLesen(ctx.werte, pfad);
  const optionen = sichtbareOptionen(f, (id) => id === gewaehlt);
  const darst = f.darstellung ?? 'kacheln';
  const k = (o, klasse, inhalt) => knopf({ pfad, aktion: 'waehlen', wert: o.id, an: gewaehlt === o.id, klasse, inhalt });

  let html;
  if (darst === 'suche') {
    html = sucheZeichnen(f, ctx, pfad);
  } else if (darst === 'pillen') {
    html = `<div class="pillen">${optionen.map((o) => k(o, 'pille', `${optionSymbol(o, 18)}${esc(o.titel)}`)).join('')}</div>`;
  } else if (darst === 'liste') {
    const mitZeichen = optionen.some((o) => o.zeichen);
    html = `<div class="liste">${optionen.map((o) => k(o, `zeile ${mitZeichen ? 'mit-zeichen' : ''}`,
      `${mitZeichen ? `<span class="zeichen">${esc(o.zeichen ?? '')}</span>` : ''}<span class="zeile-bild">${optionSymbol(o, 22)}</span><span class="zeile-titel">${esc(o.titel)}</span>${o.kurz ? `<span class="etikett ${o.kurzTon ? `ton-${esc(o.kurzTon)}` : ''}">${esc(o.kurz)}</span>` : ''}`)).join('')}</div>`;
  } else if (darst === 'farben') {
    html = raster(f.spalten ?? 3, optionen.map((o) => k(o, 'farbe',
      `<span class="tupfer" style="background:${esc(o.farbe ?? 'transparent')}"></span>${esc(o.titel)}`)).join(''));
  } else {
    html = raster(f.spalten ?? Math.min(optionen.length, 3), optionen.map((o) => k(o, 'kachel', `${optionSymbol(o)}<span>${esc(o.titel)}</span>`)).join(''));
  }

  const opt = (f.optionen ?? []).find((o) => o.id === gewaehlt);
  if (opt?.hinweis) html += hinweisBox(opt.hinweis);
  if (opt && sichtbar(opt.zusatz).length) {
    // Zusatzfragen einer Einfachauswahl liegen flach neben dem Feld.
    html += `<div class="zusatz">${sichtbar(opt.zusatz).map((z) => feldZeichnen(z, ctx, basis, true)).join('')}</div>`;
  }
  return html;
}

function mehrfachZeichnen(f, ctx, basis) {
  const pfad = [...basis, f.id];
  const auswahl = wertLesen(ctx.werte, pfad) ?? {};
  const optionen = sichtbareOptionen(f, (id) => !!auswahl[id]);
  const darst = f.darstellung ?? (f.stufen ? 'liste' : 'pillen');
  const unterFelder = (o) => [...sichtbar(o.zusatz), ...(o.ohneJeOption ? [] : sichtbar(f.jeOption))];
  const hinweise = [];

  // Fragen je gewählter Option. Schalter rücken in die Kopfzeile, der Rest darunter.
  const optionsFragen = (o, mitKopf) => {
    const felder = unterFelder(o);
    if (!felder.length) return '';
    const opfad = [...pfad, o.id];
    const schalter = felder.filter((z) => z.typ === 'janein' && z.darstellung === 'schalter');
    const rest = felder.filter((z) => !schalter.includes(z));
    const kopf = mitKopf || schalter.length
      ? `<div class="zusatz-kopf">${mitKopf ? `${optionSymbol(o, 18)}<span>${esc(o.titel)}</span>` : ''}
          ${schalter.map((z) => schalterZeichnen(z, ctx, opfad)).join('')}</div>`
      : '';
    return `<div class="zusatz">${kopf}${rest.map((z) => feldZeichnen(z, ctx, opfad, true)).join('')}</div>`;
  };

  let html;
  if (f.stufen) {
    const stufen = sichtbar(f.stufen);
    const zeile = (o) => {
      const gew = auswahl[o.id];
      if (gew && o.hinweis) hinweise.push(o.hinweis);
      const knoepfe = stufen.map((s) => knopf({
        pfad: [...pfad, o.id], aktion: 'stufe', wert: s.id, an: gew?.stufe === s.id, klasse: 'stufe',
        inhalt: esc(s.titel), label: `${o.titel}: ${s.titel}`,
      })).join('');
      return `<div class="stufen-zeile ${gew ? 'an' : ''}">
          <span class="zeile-symbol">${optionSymbol(o, 18)}</span>
          <span class="zeile-titel">${esc(o.titel)}</span>
          <div class="stufen" style="--spalten:${stufen.length}">${knoepfe}</div>
        </div>${gew ? optionsFragen(o, false) : ''}`;
    };
    // Optionen mit gleicher „gruppe" stehen in einer eigenen Liste mit Zwischentitel.
    const gruppen = [];
    for (const o of optionen) {
      const g = gruppen.find((x) => x.name === (o.gruppe ?? ''));
      if (g) g.optionen.push(o); else gruppen.push({ name: o.gruppe ?? '', optionen: [o] });
    }
    html = gruppen.map((g) => `${g.name ? `<h3 class="gruppe">${esc(g.name)}</h3>` : ''}
      <div class="liste">${g.optionen.map(zeile).join('')}</div>`).join('');
  } else {
    const k = (o, klasse, inhalt) => knopf({ pfad: [...pfad, o.id], aktion: 'umschalten', an: !!auswahl[o.id], klasse, inhalt });
    if (darst === 'suche') {
      html = sucheZeichnen(f, ctx, pfad);
    } else if (darst === 'kacheln') {
      html = raster(f.spalten ?? 4, optionen.map((o) => k(o, 'kachel gross',
        `<span class="kachel-symbol">${optionSymbol(o, 22)}</span><span>${esc(o.titel)}</span>`)).join(''));
    } else {
      html = `<div class="pillen">${optionen.map((o) => k(o, 'pille', `${optionSymbol(o, 18)}${esc(o.titel)}`)).join('')}</div>`;
    }
    for (const o of optionen) {
      if (!auswahl[o.id]) continue;
      if (o.hinweis) hinweise.push(o.hinweis);
      html += optionsFragen(o, true);
    }
  }
  return html + hinweise.map(hinweisBox).join('');
}

function skalaZeichnen(f, ctx, basis) {
  const pfad = [...basis, f.id];
  const wert = wertLesen(ctx.werte, pfad);
  const min = f.min ?? 1;
  const max = f.max ?? 5;
  const zahlen = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  let html;
  if (f.darstellung === 'sterne') {
    html = `<div class="sterne">${zahlen.map((n) => knopf({
      pfad, aktion: 'waehlen', wert: n, zahl: true, an: wert != null && n <= wert, klasse: 'stern',
      inhalt: symbol('stern', 30, 1.8), label: `${n} von ${max}`,
    })).join('')}</div>`;
  } else {
    const spalten = zahlen.length <= 6 ? zahlen.length : Math.ceil(zahlen.length / 2);
    html = raster(spalten, zahlen.map((n) => knopf({
      pfad, aktion: 'waehlen', wert: n, zahl: true, an: wert === n, klasse: 'zahl', inhalt: String(n),
    })).join(''));
  }
  if (f.links || f.rechts) {
    html += `<div class="enden"><span>${esc(f.links ?? '')}</span><span>${esc(f.rechts ?? '')}</span></div>`;
  }
  return html;
}

function tageszeitZeichnen(f, ctx, basis) {
  const pfad = [...basis, f.id];
  const wert = wertLesen(ctx.werte, pfad);
  return raster(5, TAGESZEITEN.map((t) => knopf({
    pfad, aktion: 'waehlen', wert: t.id, an: wert === t.id, klasse: 'kachel klein',
    inhalt: `${symbol(t.symbol, 20)}<span>${t.titel}</span>`,
  })).join(''));
}

// ---------- Suchfeld für Personen und lange Auswahllisten ----------

const sucheNorm = (t) => String(t ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de');

/** Gewählte Ids eines Suchfelds, egal ob Person, Mehrfach- oder Einfachauswahl. */
function sucheGewaehlt(f, wert) {
  if (f.typ === 'person') return wert ?? [];
  if (f.typ === 'mehrfach') return Object.keys(wert ?? {});
  return wert ? [wert] : [];
}

function sucheKandidaten(f, ctx) {
  if (f.typ === 'person') return ctx.personen.filter((p) => !p.ausgeblendet).map((p) => ({ id: p.id, titel: p.name, person: p }));
  return (f.optionen ?? []).filter((o) => !o.ausgeblendet).map((o) => ({ id: o.id, titel: o.titel, option: o }));
}

function sucheMarke(k) {
  if (k.person) return `<span class="avatar klein" style="background:${esc(k.person.farbe ?? farbeVon(k.person.name))}">${esc(initialen(k.person.name))}</span>`;
  return optionSymbol(k.option, 18);
}

/** Trefferliste zum eingegebenen Text: beste Treffer zuerst, häufig Genutztes vor Seltenem. */
export function sucheTreffer(f, text, ctx, pfad) {
  const q = sucheNorm(text);
  if (!q) return '';
  const gewaehlt = sucheGewaehlt(f, wertLesen(ctx.werte, pfad));
  const kandidaten = sucheKandidaten(f, ctx);
  const nutzung = (id) => ctx.nutzung?.get(id) ?? 0;
  const treffer = kandidaten
    .filter((k) => !gewaehlt.includes(k.id) && sucheNorm(k.titel).includes(q))
    .sort((a, b) => Number(sucheNorm(b.titel).startsWith(q)) - Number(sucheNorm(a.titel).startsWith(q))
      || nutzung(b.id) - nutzung(a.id) || a.titel.localeCompare(b.titel, 'de'))
    .slice(0, 8);
  const gibtEs = kandidaten.some((k) => sucheNorm(k.titel) === q);
  const art = f.typ === 'person' ? 'person' : 'option';
  const zeilen = treffer.map((k) => `<button type="button" class="treffer" data-aktion="${art}-waehlen" data-wert="${esc(k.id)}" ${pfadAttr(pfad)}>
      ${sucheMarke(k)}<span>${esc(k.titel)}</span></button>`).join('');
  const neu = gibtEs ? '' : `<button type="button" class="treffer neu" data-aktion="${art}-neu" data-name="${esc(String(text).trim())}" ${pfadAttr(pfad)}>
      ${symbol('plus', 18)}<span>„${esc(String(text).trim())}" hinzufügen</span></button>`;
  return zeilen + neu;
}

/** Gewählte Einträge als Pillen mit ×, darunter ein Suchfeld. */
function sucheZeichnen(f, ctx, pfad) {
  const gewaehlt = sucheGewaehlt(f, wertLesen(ctx.werte, pfad));
  const alleKandidaten = f.typ === 'person'
    ? ctx.personen.map((p) => ({ id: p.id, titel: p.name, person: p }))
    : (f.optionen ?? []).map((o) => ({ id: o.id, titel: o.titel, option: o }));
  const pillen = gewaehlt.map((id) => {
    const k = alleKandidaten.find((x) => x.id === id) ?? { id, titel: id, option: {} };
    const aktion = f.typ === 'person' ? 'person' : f.typ === 'mehrfach' ? 'umschalten' : 'waehlen';
    const kpfad = f.typ === 'mehrfach' ? [...pfad, id] : pfad;
    return knopf({
      pfad: kpfad, aktion, wert: f.typ === 'mehrfach' ? undefined : id, an: true, klasse: 'pille gewaehlt',
      inhalt: `${sucheMarke(k)}${esc(k.titel)}${symbol('schliessen', 14, 2.4)}`, label: `${k.titel} entfernen`,
    });
  }).join('');
  const platzhalter = f.platzhalter ?? (f.typ === 'person' ? 'Name suchen oder neu eingeben' : 'Suchen oder neu eingeben');
  const einzelnVoll = f.typ === 'einfach' && gewaehlt.length > 0;
  return `<div class="suche">
      ${pillen ? `<div class="pillen">${pillen}</div>` : ''}
      ${einzelnVoll ? '' : `<label class="suche-eingabe">${symbol('suche', 18)}
        <input type="search" data-suche="${esc(JSON.stringify(pfad))}" placeholder="${esc(platzhalter)}"
          autocomplete="off" autocorrect="off" autocapitalize="words" enterkeyhint="done" aria-label="${esc(f.titel)}: ${esc(platzhalter)}">
      </label>
      <div class="suche-treffer" role="listbox"></div>`}
    </div>`;
}

function personZeichnen(f, ctx, basis) {
  const pfad = [...basis, f.id];
  const gewaehlt = wertLesen(ctx.werte, pfad) ?? [];
  let html = sucheZeichnen(f, ctx, pfad);
  // Zusatzfragen erscheinen, sobald mindestens eine Person gewählt ist.
  if (gewaehlt.length && sichtbar(f.zusatz).length) {
    html += `<div class="zusatz">${sichtbar(f.zusatz).map((z) => feldZeichnen(z, ctx, basis, true)).join('')}</div>`;
  }
  return html;
}

function zahlZeichnen(f, ctx, basis) {
  const pfad = [...basis, f.id];
  const wert = wertLesen(ctx.werte, pfad);
  const schritt = f.schritt ?? 1;
  const grenzen = `data-min="${f.min ?? ''}" data-max="${f.max ?? ''}"`;
  return `<div class="zahl-eingabe">
      <button type="button" class="wahl schritt" data-aktion="schritt" data-delta="${-schritt}" ${grenzen} ${pfadAttr(pfad)} aria-label="${schritt} weniger">−${schritt}</button>
      <label class="zahl-feld">
        <input type="number" inputmode="decimal" step="any" ${pfadAttr(pfad)} value="${wert ?? ''}" placeholder="–" aria-label="${esc(f.titel)}">
        ${f.einheit ? `<span>${esc(f.einheit)}</span>` : ''}
      </label>
      <button type="button" class="wahl schritt" data-aktion="schritt" data-delta="${schritt}" ${grenzen} ${pfadAttr(pfad)} aria-label="${schritt} mehr">+${schritt}</button>
    </div>`;
}

function dauerZeichnen(f, ctx, basis) {
  if (!f.stufen) return zahlZeichnen({ ...f, einheit: f.einheit ?? 'min', schritt: f.schritt ?? 15, min: 0 }, ctx, basis);
  const pfad = [...basis, f.id];
  const wert = wertLesen(ctx.werte, pfad);
  const stufen = sichtbar(f.stufen);
  return `<div class="stufen" style="--spalten:${stufen.length}">${stufen.map((s) => knopf({
    pfad, aktion: 'waehlen', wert: s.id, an: wert === s.id, klasse: 'stufe', inhalt: esc(s.titel),
  })).join('')}</div>`;
}

function schalterZeichnen(f, ctx, basis) {
  const pfad = [...basis, f.id];
  const an = wertLesen(ctx.werte, pfad) === true;
  return knopf({ pfad, aktion: 'schalter', an, klasse: 'schalter', inhalt: `${f.symbol ? symbol(f.symbol, 14, 2.2) : ''}${esc(f.titel)}` });
}

function janeinZeichnen(f, ctx, basis) {
  if (f.darstellung === 'schalter') return `<div class="pillen">${schalterZeichnen(f, ctx, basis)}</div>`;
  const pfad = [...basis, f.id];
  const wert = wertLesen(ctx.werte, pfad);
  return `<div class="stufen" style="--spalten:2">
      ${knopf({ pfad, aktion: 'janein', wert: 'ja', an: wert === true, klasse: 'stufe', inhalt: 'Ja' })}
      ${knopf({ pfad, aktion: 'janein', wert: 'nein', an: wert === false, klasse: 'stufe', inhalt: 'Nein' })}
    </div>`;
}

function datumzeitZeichnen(f, ctx, basis) {
  const pfad = [...basis, f.id];
  return `<input class="eingabe-feld" type="datetime-local" ${pfadAttr(pfad)} value="${esc(wertLesen(ctx.werte, pfad) ?? '')}" aria-label="${esc(f.titel)}">`;
}

function textZeichnen(f, ctx, basis) {
  const pfad = [...basis, f.id];
  return `<textarea class="eingabe-feld" rows="3" ${pfadAttr(pfad)} placeholder="${esc(f.platzhalter ?? '')}" aria-label="${esc(f.titel)}">${esc(wertLesen(ctx.werte, pfad) ?? '')}</textarea>`;
}

const ZEICHNER = {
  einfach: einfachZeichnen,
  mehrfach: mehrfachZeichnen,
  skala: skalaZeichnen,
  tageszeit: tageszeitZeichnen,
  person: personZeichnen,
  zahl: zahlZeichnen,
  dauer: dauerZeichnen,
  janein: janeinZeichnen,
  datumzeit: datumzeitZeichnen,
  text: textZeichnen,
};

/** Ein Feld mit Überschrift. `basis` ist der Pfad des umgebenden Werts. */
export function feldZeichnen(f, ctx, basis = [], verschachtelt = false) {
  if (f.ausgeblendet) return '';
  const zeichner = ZEICHNER[f.typ];
  const inhalt = zeichner ? zeichner(f, ctx, basis) : `<p class="fussnote">Unbekannter Feldtyp „${esc(f.typ)}".</p>`;
  const wurzel = verschachtelt ? '' : `data-wurzel="${esc(f.id)}"`;
  const farbe = f.farbe && /^[a-z]+$/.test(f.farbe) ? ` style="--farbe: var(--${f.farbe})"` : '';
  return `<section class="feld ${verschachtelt ? 'verschachtelt' : ''} ${farbe ? 'eigene-farbe' : ''}" ${wurzel}${farbe}>
      <h2 class="feld-titel">${esc(f.titel)}${f.optional ? '<span class="optional"> · optional</span>' : ''}</h2>
      ${inhalt}
      ${f.hilfe ? `<p class="feld-hilfe">${esc(f.hilfe)}</p>` : ''}
    </section>`;
}

/**
 * Behält nur Werte von Feldern, die gerade sichtbar sind, z. B. fallen Zusatzfragen weg,
 * wenn ihre Option wieder abgewählt wurde. Ausgeblendete Felder behalten ihren alten Wert.
 */
export function bereinigen(felder, quelle, ziel = {}) {
  for (const f of felder ?? []) {
    const v = quelle?.[f.id];
    if (v === undefined || v === null || v === '') continue;
    if (f.typ === 'einfach') {
      ziel[f.id] = v;
      const opt = (f.optionen ?? []).find((o) => o.id === v);
      if (opt?.zusatz) bereinigen(opt.zusatz, quelle, ziel);
    } else if (f.typ === 'mehrfach') {
      const aus = {};
      for (const [oid, inhalt] of Object.entries(v)) {
        const opt = (f.optionen ?? []).find((o) => o.id === oid);
        if (!opt) { aus[oid] = inhalt; continue; } // Option nicht mehr in der Konfiguration: Wert behalten
        const neu = inhalt?.stufe ? { stufe: inhalt.stufe } : {};
        bereinigen([...(opt.zusatz ?? []), ...(opt.ohneJeOption ? [] : (f.jeOption ?? []))], inhalt, neu);
        aus[oid] = neu;
      }
      if (Object.keys(aus).length) ziel[f.id] = aus;
    } else if (f.typ === 'person') {
      if (v.length) {
        ziel[f.id] = v;
        if (f.zusatz) bereinigen(f.zusatz, quelle, ziel);
      }
    } else {
      ziel[f.id] = v;
    }
  }
  return ziel;
}

/** Sucht ein Feld anhand seiner Id, auch in Zusatzfragen. */
export function feldFinden(felder, id) {
  for (const f of felder ?? []) {
    if (f.id === id) return f;
    for (const o of f.optionen ?? []) {
      const z = feldFinden(o.zusatz, id);
      if (z) return z;
    }
    const j = feldFinden(f.jeOption, id) ?? feldFinden(f.zusatz, id);
    if (j) return j;
  }
  return undefined;
}

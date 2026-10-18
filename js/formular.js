// Eingabe-Bildschirm: Kopf mit Datum und Uhrzeit, Felder aus der Konfiguration, Sichern.
import { symbol } from './symbole.js';
import { esc, zeitpunktText, datumText, zeitpunktLesbar, tagLesbar, tagVoll, tageszeitVon } from './hilfen.js';
import { BEREICHE, alleFelder } from './konfiguration.js';
import { feldZeichnen, wertLesen, wertSetzen, bereinigen, feldFinden, sucheTreffer } from './felder.js';
import { neueId } from './db.js';

/**
 * Zeigt die Eingabe in `ziel` an.
 * optionen: bereich (Konfiguration), eintrag (zum Bearbeiten, optional), personen,
 *           nutzung (Map Id → Anzahl, für die Reihenfolge der Suchtreffer),
 *           personAnlegen(name) → Person, optionAnlegen(feld, titel) → Option,
 *           sichern(eintrag), abbrechen()
 */
export function formularAnzeigen(ziel, optionen) {
  const { bereich } = optionen;
  const art = BEREICHE[bereich.id] ?? {};
  const tagesweise = bereich.zeitart === 'tag';
  const alt = optionen.eintrag;

  const zustand = {
    werte: structuredClone(alt?.werte ?? {}),
    zeitpunkt: alt?.zeitpunkt ?? vorgabeZeitpunkt(tagesweise, optionen.vorgabeTag),
    personen: [...(optionen.personen ?? [])],
    ui: {},
  };

  // Tageszeit steht anfangs auf „Jetzt".
  if (!alt) {
    for (const f of alleFelder(bereich.felder)) {
      if (f.typ === 'tageszeit' && zustand.werte[f.id] === undefined) zustand.werte[f.id] = 'jetzt';
    }
  }

  const ctx = () => ({ werte: zustand.werte, personen: zustand.personen, ui: zustand.ui, nutzung: optionen.nutzung });

  const zeitAnzeige = () => {
    if (!tagesweise) return zeitpunktLesbar(zustand.zeitpunkt);
    // „Nacht auf Heute" liest sich schlecht, mit Beschriftung daher immer das volle Datum.
    return bereich.zeitTitel ? `${bereich.zeitTitel} ${tagVoll(zustand.zeitpunkt)}` : tagLesbar(zustand.zeitpunkt);
  };

  const wurzel = document.createElement('div');
  wurzel.className = `eingabe ${bereich.titelStil === 'frage' ? 'fragen' : ''}`;
  wurzel.style.setProperty('--farbe', `var(${art.farbe ?? '--schlaf'})`);
  wurzel.innerHTML = `
    <div class="eingabe-leiste">
      <button type="button" class="textknopf" data-aktion="abbrechen">${symbol('zurueck', 20)}Abbrechen</button>
      <label class="zeit-pille">
        ${symbol(tagesweise ? 'kalender' : 'uhr', 16, 2.2)}<span data-zeit>${esc(zeitAnzeige())}</span>
        <input type="${tagesweise ? 'date' : 'datetime-local'}" data-zeitpunkt
          value="${esc(tagesweise ? zustand.zeitpunkt.slice(0, 10) : zustand.zeitpunkt)}"
          aria-label="${tagesweise ? 'Datum ändern' : 'Datum und Uhrzeit ändern'}">
      </label>
    </div>
    <header class="eingabe-kopf">
      <span class="symbol-voll">${symbol(bereich.symbol ?? art.symbol, 26)}</span>
      <div>
        <h1>${esc(bereich.titel ?? art.titel)}</h1>
        ${bereich.untertitel ? `<p>${esc(bereich.untertitel)}</p>` : ''}
      </div>
    </header>
    <div class="eingabe-felder">${(bereich.felder ?? []).map((f) => feldZeichnen(f, ctx())).join('')}</div>
    <div class="sichern-leiste">
      ${alt && optionen.loeschen ? `<button type="button" class="knopf gefahr" data-aktion="loeschen">Löschen</button>` : ''}
      <button type="button" class="knopf haupt" data-aktion="sichern">Sichern</button>
    </div>`;
  ziel.replaceChildren(wurzel);

  // Einen Feldblock (oberste Ebene) neu zeichnen, damit Zusatzfragen auf- und zuklappen.
  const neuZeichnen = (element) => {
    const block = element.closest('[data-wurzel]');
    if (!block) return undefined;
    const f = (bereich.felder ?? []).find((x) => x.id === block.dataset.wurzel);
    const vorlage = document.createElement('template');
    vorlage.innerHTML = feldZeichnen(f, ctx()).trim();
    const neu = vorlage.content.firstElementChild;
    block.replaceWith(neu);
    return neu;
  };

  // Nach einer Auswahl im Suchfeld gleich weitersuchen können.
  const sucheFokussieren = (block, pfad) => {
    const schluessel = JSON.stringify(pfad);
    [...(block?.querySelectorAll('[data-suche]') ?? [])].find((i) => i.dataset.suche === schluessel)?.focus();
  };

  const pfadVon = (el) => JSON.parse(el.dataset.pfad);

  wurzel.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-aktion]');
    if (!el || el.tagName === 'FORM') return;
    const aktion = el.dataset.aktion;

    if (aktion === 'abbrechen') { optionen.abbrechen(); return; }
    if (aktion === 'sichern') { await sichern(el); return; }
    if (aktion === 'loeschen') { await optionen.loeschen(alt); return; }

    const pfad = pfadVon(el);
    const aktuell = wertLesen(zustand.werte, pfad);
    const w = el.dataset.wert;

    switch (aktion) {
      case 'waehlen': {
        const neu = 'zahl' in el.dataset ? Number(w) : w;
        // Nochmal antippen hebt die Auswahl auf.
        wertSetzen(zustand.werte, pfad, aktuell === neu ? undefined : neu);
        break;
      }
      case 'umschalten': {
        wertSetzen(zustand.werte, pfad, aktuell ? undefined : {});
        // Exklusive Optionen (z. B. „nichts") schließen alle anderen aus und umgekehrt.
        const feld = feldFinden(bereich.felder, pfad[pfad.length - 2]);
        const auswahl = wertLesen(zustand.werte, pfad.slice(0, -1));
        if (!aktuell && feld && auswahl) {
          const gewaehlt = (feld.optionen ?? []).find((o) => o.id === pfad[pfad.length - 1]);
          for (const o of feld.optionen ?? []) {
            if (o.id !== gewaehlt?.id && (gewaehlt?.exklusiv || o.exklusiv)) delete auswahl[o.id];
          }
        }
        break;
      }
      case 'stufe':
        wertSetzen(zustand.werte, pfad, aktuell?.stufe === w ? undefined : { ...(aktuell ?? {}), stufe: w });
        break;
      case 'schalter':
        wertSetzen(zustand.werte, pfad, aktuell === true ? undefined : true);
        break;
      case 'janein': {
        const neu = w === 'ja';
        wertSetzen(zustand.werte, pfad, aktuell === neu ? undefined : neu);
        break;
      }
      case 'schritt': {
        const feld = feldFinden(bereich.felder, pfad[pfad.length - 1]);
        const basiswert = aktuell ?? feld?.start ?? (el.dataset.min !== '' ? Number(el.dataset.min) : 0);
        let neu = basiswert + Number(el.dataset.delta);
        if (el.dataset.min !== '') neu = Math.max(Number(el.dataset.min), neu);
        if (el.dataset.max !== '') neu = Math.min(Number(el.dataset.max), neu);
        wertSetzen(zustand.werte, pfad, Math.round(neu * 1000) / 1000);
        break;
      }
      case 'person': {
        const liste = aktuell ?? [];
        wertSetzen(zustand.werte, pfad, liste.includes(w) ? liste.filter((x) => x !== w) : [...liste, w]);
        break;
      }
      case 'person-waehlen':
        wertSetzen(zustand.werte, pfad, [...new Set([...(aktuell ?? []), w])]);
        sucheFokussieren(neuZeichnen(el), pfad);
        return;
      case 'person-neu': {
        const person = await optionen.personAnlegen(el.dataset.name);
        zustand.personen.push(person);
        wertSetzen(zustand.werte, pfad, [...(wertLesen(zustand.werte, pfad) ?? []), person.id]);
        sucheFokussieren(neuZeichnen(el), pfad);
        return;
      }
      case 'option-waehlen':
      case 'option-neu': {
        const feld = feldFinden(bereich.felder, pfad[pfad.length - 1]);
        if (!feld) return;
        const id = aktion === 'option-neu' ? (await optionen.optionAnlegen(feld, el.dataset.name)).id : w;
        if (feld.typ === 'mehrfach') wertSetzen(zustand.werte, [...pfad, id], {});
        else wertSetzen(zustand.werte, pfad, id);
        sucheFokussieren(neuZeichnen(el), pfad);
        return;
      }
      default:
        return;
    }
    neuZeichnen(el);
  });

  wurzel.addEventListener('input', (e) => {
    const el = e.target;
    if (el.matches('[data-zeitpunkt]')) {
      if (!el.value) return;
      zustand.zeitpunkt = tagesweise ? `${el.value}T00:00` : el.value;
      wurzel.querySelector('[data-zeit]').textContent = zeitAnzeige();
      return;
    }
    if (el.matches('[data-suche]')) {
      const pfad = JSON.parse(el.dataset.suche);
      const feld = feldFinden(bereich.felder, pfad[pfad.length - 1]);
      const liste = el.closest('.suche')?.querySelector('.suche-treffer');
      if (feld && liste) liste.innerHTML = sucheTreffer(feld, el.value, ctx(), pfad);
      return;
    }
    if (!el.dataset.pfad) return;
    const wert = el.type === 'number' ? (el.value === '' ? undefined : Number(el.value)) : el.value;
    wertSetzen(zustand.werte, pfadVon(el), wert);
  });

  // Eingabetaste im Suchfeld nimmt den ersten Treffer (oder legt neu an).
  wurzel.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.matches('[data-suche]')) return;
    e.preventDefault();
    e.target.closest('.suche')?.querySelector('.suche-treffer .treffer')?.click();
  });

  // Am Mac öffnet ein Klick die Auswahl nicht von selbst.
  wurzel.querySelector('[data-zeitpunkt]').addEventListener('click', (e) => {
    try { e.target.showPicker?.(); } catch { /* Safari öffnet von selbst */ }
  });

  async function sichern(knopfEl) {
    const werte = bereinigen(bereich.felder, zustand.werte);
    // „Jetzt" bei der Tageszeit in die echte Tageszeit des Eintrags übersetzen.
    for (const f of alleFelder(bereich.felder)) {
      if (f.typ === 'tageszeit' && werte[f.id] === 'jetzt') werte[f.id] = tageszeitVon(zustand.zeitpunkt);
    }
    const jetzt = new Date().toISOString();
    const eintrag = {
      id: alt?.id ?? neueId(),
      bereich: bereich.id,
      zeitpunkt: zustand.zeitpunkt,
      werte,
      erstellt: alt?.erstellt ?? jetzt,
      geaendert: jetzt,
    };
    knopfEl.disabled = true;
    try {
      await optionen.sichern(eintrag);
    } finally {
      knopfEl.disabled = false;
    }
  }
}

/** Neuer Eintrag: heute jetzt, an einem anderen Tag dieselbe Uhrzeit an jenem Tag. */
function vorgabeZeitpunkt(tagesweise, tag) {
  const heute = datumText();
  if (tagesweise) return `${tag ?? heute}T00:00`;
  if (!tag || tag === heute) return zeitpunktText();
  return `${tag}T${zeitpunktText().slice(11)}`;
}

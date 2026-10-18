// Eintrag zu einer Übung: auf der Übungsseite direkt, von der Übersicht als Sheet von unten.
import { symbol } from './symbole.js';
import { speichern, loeschen, neueId, SPEICHER } from './db.js';
import { esc, zeitpunktText, zeitpunktLesbar, datumText } from './hilfen.js';
import { GENESUNG, wertAnzeige, wertEinlesen, umrechnen, bestwert, inSekunden, tagesStand, zielText } from './genesung-daten.js';

const SCHRITT = 5;

/** Neuer Eintrag: jetzt, an einem anderen Tag dieselbe Uhrzeit an jenem Tag. */
function vorgabeZeitpunkt(tag) {
  if (!tag || tag === datumText()) return zeitpunktText();
  return `${tag}T${zeitpunktText().slice(11)}`;
}

/** Vorbelegung: letzter Wert in der aktuellen Einheit, sonst das Ziel, sonst 0. */
function vorbelegung(uebung, liste) {
  const letzter = liste.find((e) => typeof e.werte.wert === 'number');
  if (letzter) return umrechnen(letzter.werte.wert, letzter.werte.einheit, uebung.einheit);
  return uebung.ziel ?? 0;
}

/**
 * Zeichnet die Eingabe in `ziel`.
 * optionen: beschwerde, uebung, liste (Einträge dieser Übung, neueste zuerst), eintrag (zum Bearbeiten),
 *           tag (Vorgabe für neue Einträge), gesichert(eintrag), geloescht(), abbrechen() (nur im Sheet)
 */
export function uebungEingabe(ziel, optionen) {
  const { beschwerde, uebung, liste, eintrag } = optionen;
  const messart = eintrag?.werte.messart ?? uebung.messart;
  const einheit = eintrag?.werte.einheit ?? uebung.einheit;
  const abhaken = messart === 'abhaken';
  const andere = liste.filter((e) => e.id !== eintrag?.id);
  const zustand = {
    zeitpunkt: eintrag?.zeitpunkt ?? vorgabeZeitpunkt(optionen.tag),
    wert: eintrag ? eintrag.werte.wert : vorbelegung(uebung, liste),
  };
  const best = bestwert(andere);

  const hinweis = () => {
    if (abhaken) return { text: zielText(uebung) ? `Ziel ${zielText(uebung)}` : '', ton: '' };
    if (messart === 'bestwert') {
      if (!best) return { text: 'Erster Eintrag', ton: '' };
      const neu = inSekunden(zustand.wert ?? 0, einheit) > inSekunden(best.werte.wert, best.werte.einheit);
      return neu ? { text: 'Neuer Bestwert', ton: 'gut' } : { text: `Bestwert ${wertAnzeige(best.werte.wert, best.werte.einheit)}`, ton: '' };
    }
    if (uebung.ziel) return { text: `Ziel ${zielText(uebung)}`, ton: '' };
    const letzter = andere.find((e) => typeof e.werte.wert === 'number');
    return { text: letzter ? `Zuletzt ${wertAnzeige(letzter.werte.wert, letzter.werte.einheit)}` : '', ton: '' };
  };

  // „Heute 1 von 2", wenn mehrere Einträge am Tag vorgesehen sind.
  const standText = () => {
    if (eintrag) return '';
    const s = tagesStand(uebung, liste, zustand.zeitpunkt.slice(0, 10));
    const wann = zustand.zeitpunkt.slice(0, 10) === datumText() ? 'Heute' : 'An diesem Tag';
    if (s.soll > 1) return `${wann} ${s.anzahl} von ${s.soll}`;
    return s.anzahl ? `${wann} schon eingetragen` : '';
  };

  const h = hinweis();
  const einheitName = einheit === 's' ? 'Sekunden' : 'Minuten';
  ziel.innerHTML = `
    <div class="ue-eingabe" style="--farbe: var(--uebung)">
      <label class="zeit-pille">
        ${symbol('uhr', 16, 2.2)}<span data-zeit>${esc(zeitpunktLesbar(zustand.zeitpunkt))}</span>
        <input type="datetime-local" data-zeitpunkt value="${esc(zustand.zeitpunkt)}" aria-label="Datum und Uhrzeit ändern">
      </label>
      ${abhaken
        ? `<div class="ue-abhaken"><span class="ue-haken">${symbol('haken', 40, 2.6)}</span>
            <span data-hinweis class="ue-hinweis">${esc(h.text)}</span></div>`
        : `<div class="ue-zahl">
            <button type="button" class="wahl schritt" data-delta="${-SCHRITT}" aria-label="${SCHRITT} ${einheitName} weniger">−${SCHRITT}</button>
            <div class="ue-wert">
              <input data-wert inputmode="numeric" autocomplete="off" value="${esc(wertAnzeige(zustand.wert, einheit).replace(/ min$/, ''))}"
                aria-label="Wert in ${einheitName}">
              <span class="ue-einheit">${einheit === 's' ? 'Minuten:Sekunden' : 'Minuten'}</span>
              <span data-hinweis class="ue-hinweis ${h.ton ? `ton-${h.ton}` : ''}">${esc(h.text)}</span>
            </div>
            <button type="button" class="wahl schritt" data-delta="${SCHRITT}" aria-label="${SCHRITT} ${einheitName} mehr">+${SCHRITT}</button>
          </div>`}
      <p class="ue-stand" data-stand>${esc(standText())}</p>
      <div class="sichern-leiste">
        ${optionen.abbrechen ? '<button type="button" class="knopf" data-abbrechen>Abbrechen</button>' : ''}
        ${eintrag ? `<button type="button" class="knopf gefahr" data-loeschen aria-label="Eintrag löschen">${symbol('muell', 20)}</button>` : ''}
        <button type="button" class="knopf haupt" data-sichern>${abhaken && !eintrag ? `${symbol('haken', 20, 2.4)}Erledigt` : 'Sichern'}</button>
      </div>
    </div>`;

  const feld = ziel.querySelector('[data-wert]');
  const hinweisEl = ziel.querySelector('[data-hinweis]');
  const auffrischen = () => {
    const neu = hinweis();
    hinweisEl.textContent = neu.text;
    hinweisEl.className = `ue-hinweis ${neu.ton ? `ton-${neu.ton}` : ''}`;
    ziel.querySelector('[data-stand]').textContent = standText();
  };
  const anzeigen = () => { if (feld) feld.value = wertAnzeige(zustand.wert, einheit).replace(/ min$/, ''); };

  ziel.querySelectorAll('[data-delta]').forEach((k) => k.addEventListener('click', () => {
    zustand.wert = Math.max(0, (zustand.wert ?? 0) + Number(k.dataset.delta));
    anzeigen();
    auffrischen();
  }));

  // Beim Tippen in Sekunden oder Minuten als Zahl, angezeigt wird danach wieder „m:ss".
  feld?.addEventListener('focus', () => { feld.value = zustand.wert ?? ''; feld.select(); });
  feld?.addEventListener('input', () => {
    const w = wertEinlesen(feld.value, einheit);
    if (w !== undefined) { zustand.wert = w; auffrischen(); }
  });
  feld?.addEventListener('blur', anzeigen);
  feld?.addEventListener('keydown', (e) => { if (e.key === 'Enter') feld.blur(); });

  const zeitEl = ziel.querySelector('[data-zeitpunkt]');
  zeitEl.addEventListener('input', () => {
    if (!zeitEl.value) return;
    zustand.zeitpunkt = zeitEl.value;
    ziel.querySelector('[data-zeit]').textContent = zeitpunktLesbar(zustand.zeitpunkt);
    auffrischen();
  });
  zeitEl.addEventListener('click', () => { try { zeitEl.showPicker?.(); } catch { /* Safari öffnet von selbst */ } });

  ziel.querySelector('[data-abbrechen]')?.addEventListener('click', () => optionen.abbrechen());

  ziel.querySelector('[data-loeschen]')?.addEventListener('click', async () => {
    if (!confirm('Diesen Eintrag löschen?')) return;
    await loeschen(SPEICHER.eintraege, eintrag.id);
    optionen.geloescht?.();
  });

  ziel.querySelector('[data-sichern]').addEventListener('click', async (e) => {
    if (!abhaken && !(zustand.wert > 0)) {
      feld?.focus();
      return;
    }
    const knopf = e.currentTarget;
    knopf.disabled = true;
    const jetzt = new Date().toISOString();
    const neu = {
      id: eintrag?.id ?? neueId(),
      bereich: GENESUNG,
      zeitpunkt: zustand.zeitpunkt,
      werte: {
        art: 'uebung', beschwerde: beschwerde.id, uebung: uebung.id,
        wert: abhaken ? true : zustand.wert, messart, ...(abhaken ? {} : { einheit }),
      },
      erstellt: eintrag?.erstellt ?? jetzt,
      geaendert: jetzt,
    };
    try {
      await speichern(SPEICHER.eintraege, neu);
      optionen.gesichert?.(neu);
    } finally {
      knopf.disabled = false;
    }
  });
}

/**
 * Öffnet ein Sheet von unten. `fuellen(koerper, schliessen)` zeichnet den Inhalt.
 * Tippen auf den abgedunkelten Rand oder Wischen nach unten (Escape) schließt es.
 */
export function sheetOeffnen(titel, fuellen, { untertitel = '', farbe = '--genesung' } = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'sheet';
  dialog.style.setProperty('--farbe', `var(${farbe})`);
  dialog.setAttribute('aria-label', titel);
  dialog.innerHTML = `
    <div class="sheet-griff" aria-hidden="true"></div>
    <header class="sheet-kopf">
      <div><h2>${esc(titel)}</h2>${untertitel ? `<p>${esc(untertitel)}</p>` : ''}</div>
      <button type="button" class="rund-knopf klein" data-schliessen aria-label="Schließen">${symbol('schliessen', 18, 2.4)}</button>
    </header>
    <div class="sheet-inhalt"></div>`;
  document.body.append(dialog);
  const schliessen = () => {
    if (!dialog.open) return;
    dialog.classList.add('zu');
    const weg = () => { dialog.close(); dialog.remove(); };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) weg();
    else setTimeout(weg, 220);
  };
  dialog.addEventListener('click', (e) => { if (e.target === dialog) schliessen(); });
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); schliessen(); });
  dialog.querySelector('[data-schliessen]').addEventListener('click', schliessen);
  fuellen(dialog.querySelector('.sheet-inhalt'), schliessen);
  dialog.showModal();
  // Nicht gleich die Tastatur öffnen: den Fokus auf das Sheet selbst legen.
  dialog.querySelector('[data-schliessen]').blur();
  return schliessen;
}

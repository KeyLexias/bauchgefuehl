// Kurze Bewegungen für Seitenwechsel und aufklappende Zusatzfragen.
// Bei „Bewegung reduzieren" in den iPhone-Einstellungen bleibt alles still.

const SANFT = 'cubic-bezier(0.22, 1, 0.36, 1)';

export function ruhig() {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const EINGANG = {
  vor: [{ opacity: 0, transform: 'translateX(28px)' }, { opacity: 1, transform: 'none' }],
  zurueck: [{ opacity: 0, transform: 'translateX(-28px)' }, { opacity: 1, transform: 'none' }],
  tab: [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
};

/**
 * Neue Seite einblenden. `richtung`: vor (tiefer hinein), zurueck, tab (anderer Tab).
 * Beim Tab-Wechsel tauchen Karten zusätzlich nacheinander auf (CSS, data-eingang).
 */
export function seiteEinblenden(el, richtung) {
  // Ohne Richtung (dieselbe Seite neu gezeichnet) bleibt der Zustand, sonst bräche das Auftauchen ab.
  if (!richtung) return;
  delete el.dataset.eingang;
  if (ruhig()) return;
  if (richtung === 'tab') {
    void el.offsetWidth; // damit die CSS-Animation auch beim zweiten Mal startet
    el.dataset.eingang = 'gestaffelt';
  }
  el.animate(EINGANG[richtung], { duration: richtung === 'tab' ? 320 : 380, easing: SANFT });
}

// Schlüssel, an dem man dieselbe Zusatzfrage oder denselben Hinweis nach dem Neuzeichnen wiedererkennt.
const schluessel = (el) => el.querySelector('[data-pfad]')?.dataset.pfad ?? el.textContent.trim();

/** Merkt sich, was in einem Feldblock offen ist, bevor er neu gezeichnet wird. */
export function zustandMerken(block) {
  return new Set([...block.querySelectorAll('.zusatz, .hinweis')].map(schluessel));
}

/** Neu erschienene Zusatzfragen und Hinweise aufklappen, die angetippte Wahl kurz federn lassen. */
export function aufklappen(neu, vorher, angetippt) {
  if (ruhig() || !neu) return;
  for (const el of neu.querySelectorAll('.zusatz, .hinweis')) {
    if (vorher.has(schluessel(el))) continue;
    el.animate(
      [{ opacity: 0, transform: 'translateY(-6px) scale(0.98)' }, { opacity: 1, transform: 'none' }],
      { duration: 280, easing: SANFT },
    );
  }
  if (!angetippt) return;
  const passt = [...neu.querySelectorAll('[data-aktion]')].find((el) =>
    el.dataset.aktion === angetippt.aktion && el.dataset.pfad === angetippt.pfad && el.dataset.wert === angetippt.wert
    && el.dataset.delta === angetippt.delta);
  passt?.animate(
    [{ transform: 'scale(0.94)' }, { transform: 'scale(1.03)' }, { transform: 'none' }],
    { duration: 300, easing: 'ease-out' },
  );
}

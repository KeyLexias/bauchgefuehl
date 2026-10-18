// Darstellung: automatisch (wie das Gerät), hell oder dunkel. Gilt nur für dieses Gerät.
const SCHLUESSEL = 'bauchgefuehl-darstellung';

export const DARSTELLUNGEN = [
  { id: 'auto', titel: 'Automatisch' },
  { id: 'hell', titel: 'Hell' },
  { id: 'dunkel', titel: 'Dunkel' },
];

export function darstellungLesen() {
  try {
    const d = localStorage.getItem(SCHLUESSEL);
    return d === 'hell' || d === 'dunkel' ? d : 'auto';
  } catch {
    return 'auto';
  }
}

export function darstellungSetzen(d) {
  try {
    if (d === 'auto') localStorage.removeItem(SCHLUESSEL);
    else localStorage.setItem(SCHLUESSEL, d);
  } catch { /* nur für diese Sitzung */ }
  anwenden(d);
}

/** Setzt das Attribut am Dokument und die Farbe der Statusleiste. */
export function anwenden(d = darstellungLesen()) {
  const wurzel = document.documentElement;
  if (d === 'auto') delete wurzel.dataset.darstellung;
  else wurzel.dataset.darstellung = d;
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    if (!meta.dataset.medium) meta.dataset.medium = meta.getAttribute('media') ?? '';
    if (d === 'auto') meta.setAttribute('media', meta.dataset.medium);
    else meta.setAttribute('media', meta.dataset.medium.includes(d === 'dunkel' ? 'dark' : 'light') ? 'all' : 'not all');
  }
}

// Kleine Helfer für Text, Datum und Zeit.

const ERSATZ = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Text sicher in HTML einsetzen. Inhalte kommen aus Dateien des Nutzers. */
export function esc(text) {
  return String(text ?? '').replace(/[&<>"']/g, (z) => ERSATZ[z]);
}

const zwei = (n) => String(n).padStart(2, '0');

/** Lokale Zeit als „JJJJ-MM-TTTHH:MM", so wie es datetime-local liefert. */
export function zeitpunktText(d = new Date()) {
  return `${datumText(d)}T${zwei(d.getHours())}:${zwei(d.getMinutes())}`;
}

/** Lokales Datum als „JJJJ-MM-TT". */
export function datumText(d = new Date()) {
  return `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`;
}

/** „JJJJ-MM-TT" oder „JJJJ-MM-TTTHH:MM" als lokales Datum lesen. */
export function alsDatum(text) {
  const [d, t = '00:00'] = String(text).split('T');
  const [j, m, tag] = d.split('-').map(Number);
  const [h, min] = t.split(':').map(Number);
  return new Date(j, m - 1, tag, h, min);
}

export function tageVerschieben(text, tage) {
  const d = alsDatum(text);
  d.setDate(d.getDate() + tage);
  return datumText(d);
}

const fmtTag = new Intl.DateTimeFormat('de-AT', { weekday: 'long', day: 'numeric', month: 'short' });
const fmtUhr = new Intl.DateTimeFormat('de-AT', { hour: '2-digit', minute: '2-digit' });

/** „Heute", „Gestern" oder „Montag, 12. Okt." */
export function tagLesbar(text) {
  const heute = datumText();
  const tag = String(text).slice(0, 10);
  if (tag === heute) return 'Heute';
  if (tag === tageVerschieben(heute, -1)) return 'Gestern';
  return fmtTag.format(alsDatum(tag));
}

const fmtVoll = new Intl.DateTimeFormat('de-AT', { weekday: 'short', day: 'numeric', month: 'short' });

/** „So., 18. Okt." */
export function tagVoll(text) {
  return fmtVoll.format(alsDatum(String(text).slice(0, 10)));
}

export function zeitpunktLesbar(text) {
  return `${tagLesbar(text)}, ${fmtUhr.format(alsDatum(text))}`;
}

/** Tageszeit aus der Uhrzeit ableiten. */
export function tageszeitVon(text) {
  const h = alsDatum(text).getHours();
  if (h >= 5 && h < 12) return 'vormittag';
  if (h >= 12 && h < 18) return 'nachmittag';
  if (h >= 18 && h < 22) return 'abend';
  return 'nacht';
}

export function initialen(name) {
  const teile = String(name).trim().split(/\s+/).filter(Boolean);
  return ((teile[0]?.[0] ?? '') + (teile[1]?.[0] ?? '')).toUpperCase() || '?';
}

/** Gleichbleibende Farbe je Name, für Personen ohne eigene Farbe. */
export function farbeVon(text) {
  const farben = ['#0F766E', '#4338CA', '#BE185D', '#A16207', '#4D7C0F', '#C2410C', '#7C3AED', '#0369A1'];
  let h = 0;
  for (const z of String(text)) h = (h * 31 + z.codePointAt(0)) >>> 0;
  return farben[h % farben.length];
}

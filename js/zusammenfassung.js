// Kurztexte für Einträge, nur aus Konfiguration und Werten abgeleitet.
import { TAGESZEITEN } from './konfiguration.js';

const titelVon = (o) => o?.kurztitel ?? o?.titel ?? '';

/** Ein Wert als kurzer Text, leerer Text wenn nichts Sinnvolles da ist. */
export function wertText(f, v, personen = []) {
  if (v === undefined || v === null || v === '') return '';
  switch (f.typ) {
    case 'skala': {
      const max = f.max ?? 5;
      if (f.darstellung === 'sterne') return '★'.repeat(v) + '☆'.repeat(Math.max(0, max - v));
      return `${f.kurz ?? f.titel} ${v}${max > 5 ? ` von ${max}` : ''}`;
    }
    case 'einfach':
      return titelVon((f.optionen ?? []).find((o) => o.id === v)) || String(v);
    case 'mehrfach': {
      const teile = Object.entries(v).map(([id, inhalt]) => {
        const o = (f.optionen ?? []).find((x) => x.id === id);
        const stufe = (f.stufen ?? []).find((s) => s.id === inhalt?.stufe);
        return `${titelVon(o) || id}${stufe ? ` (${stufe.titel})` : ''}`;
      });
      return teile.length > 3 ? `${teile.slice(0, 3).join(', ')} +${teile.length - 3}` : teile.join(', ');
    }
    case 'person':
      return v.map((id) => personen.find((p) => p.id === id)?.name ?? '?').join(', ');
    case 'zahl':
      return `${String(v).replace('.', ',')}${f.einheit ? ` ${f.einheit}` : ''}`;
    case 'dauer':
      return f.stufen ? titelVon(f.stufen.find((s) => s.id === v)) : `${v} min`;
    case 'janein':
      return v === true ? (f.kurz ?? f.titel) : '';
    case 'tageszeit':
      return TAGESZEITEN.find((t) => t.id === v)?.titel ?? '';
    case 'text': {
      const t = String(v).trim().replace(/\s+/g, ' ');
      return t.length > 40 ? `${t.slice(0, 39)}…` : t;
    }
    default:
      return '';
  }
}

/** Kurztext eines Eintrags aus den Feldern in bereich.zusammenfassung, sonst aus den ersten Werten. */
export function zusammenfassen(bereich, eintrag, personen = []) {
  const felder = bereich.felder ?? [];
  const auswahl = bereich.zusammenfassung?.length
    ? bereich.zusammenfassung.map((id) => felder.find((f) => f.id === id)).filter(Boolean)
    : felder.filter((f) => f.typ !== 'tageszeit');
  const teile = [];
  for (const f of auswahl) {
    const t = wertText(f, eintrag.werte?.[f.id], personen);
    if (t) teile.push(t);
    if (!bereich.zusammenfassung && teile.length >= 2) break;
  }
  return teile.join(' · ');
}

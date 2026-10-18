// Allgemeine Symbole als SVG-Pfade (24 × 24, Strich).
// Optionen in der Konfiguration verweisen per Name auf diese Liste.
export const SYMBOLE = {
  uebersicht: 'M4 11l8-7 8 7v9h-5v-6H9v6H4z',
  genesung: 'M5 19c0-8 6-14 15-14 0 9-6 15-14 15M5 19l7-7',
  auswertung: 'M5 20V11M12 20V5M19 20v-6',
  stuhlgang: 'M7 4h10v7a5 5 0 0 1-10 0zM5 11h14M9 16l-1 4h8l-1-4',
  magen: 'M9 3v4c0 2-4 2-4 7a6 6 0 0 0 12 0c0-3-2-4-4-4h-1V3',
  aktivitaet: 'M3 12h4l2-6 4 12 2-6h6',
  schlaf: 'M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z',
  tag: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2',
  ernaehrung: 'M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 0-3 3-3 6s1 4 3 4v8',
  haken: 'M5 12l5 5 9-10',
  hinweis: 'M12 3l10 18H2zM12 10v5M12 18v.01',
  sichern: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  wiederherstellen: 'M12 21V9M7 14l5-5 5 5M5 3h14',
  plus: 'M12 5v14M5 12h14',
  zurueck: 'M15 5l-7 7 7 7',
  stern: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  uhr: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
};

export function symbol(name, groesse = 24, strich = 2) {
  const d = SYMBOLE[name] ?? SYMBOLE.hinweis;
  return `<svg aria-hidden="true" width="${groesse}" height="${groesse}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strich}" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
}

// Aufbau der Konfiguration. Der Code kennt nur diese Bausteine, nie konkrete Inhalte.
//
// Bereich (ein Dokument je Bereich im Speicher „config"):
//   id         fester Bereichsname aus BEREICHE
//   titel      Überschrift der Eingabe
//   untertitel optional, kleine Zeile unter der Überschrift
//   zeitart    'zeitpunkt' (Datum und Uhrzeit) oder 'tag' (nur Datum)
//   zeitTitel  optional, Beschriftung vor dem Datum, z. B. „Nacht auf"
//   felder     Liste von Feldern
//
// Feld:
//   id        eindeutig innerhalb des Bereichs
//   titel     Frage oder Überschrift
//   typ       einer aus FELDTYPEN
//   rolle     Bedeutung für die Auswertung, z. B. 'befinden', 'symptom', 'staerke'
//   optional  true zeigt „optional" neben dem Titel
//   ausgeblendet  true blendet das Feld aus, alte Werte bleiben erhalten
//   hilfe     optional, kleiner Text unter dem Feld
//
//   skala:    min, max, links, rechts (Beschriftung der Enden), darstellung 'zahlen' | 'sterne'
//   einfach, mehrfach:
//             optionen (Liste von Optionen), darstellung 'kacheln' | 'pillen' | 'liste' | 'farben',
//             spalten (bei kacheln und farben)
//   mehrfach: stufen optional, z. B. [{ id, titel }], dann je gewählter Option eine Stufe
//             jeOption optional, Felder, die für jede gewählte Option gefragt werden
//   zahl:     einheit, schritt, min, max, nachkomma
//   dauer:    stufen [{ id, titel, minuten }] oder ohne stufen freie Eingabe in Minuten
//   janein:   darstellung 'knoepfe' | 'schalter'
//   person, tageszeit, datumzeit, text: keine weiteren Angaben
//
// Option:
//   id, titel, symbol (Name aus symbole.js), farbe (#RRGGBB),
//   bild { d, viewBox } für eigene Formen, kurz (kleines Etikett rechts in der Liste),
//   hinweis (Text, der erscheint, sobald die Option gewählt ist),
//   zusatz (Felder, die direkt darunter aufklappen, wenn die Option gewählt ist),
//   ausgeblendet
//
// Werte eines Eintrags (eintrag.werte):
//   skala, zahl, dauer (Minuten oder Stufen-Id), janein, tageszeit, datumzeit, text: einfacher Wert
//   einfach:  Options-Id; Zusatzfragen dieser Option stehen daneben unter ihrer eigenen Id
//   mehrfach: { optionsId: { stufe?, …Werte der Zusatzfragen und jeOption-Felder } }
//   person:   Liste von Personen-Ids

export const BEREICHE = {
  stuhlgang: { titel: 'Stuhlgang', symbol: 'stuhlgang', farbe: '--stuhlgang' },
  magen: { titel: 'Magen und Darm', symbol: 'magen', farbe: '--magen' },
  schlaf: { titel: 'Schlaf', symbol: 'schlaf', farbe: '--schlaf' },
  aktivitaeten: { titel: 'Aktivitäten', symbol: 'aktivitaet', farbe: '--aktivitaet' },
  genesung: { titel: 'Genesung', symbol: 'genesung', farbe: '--genesung' },
  auswertung: { titel: 'Auswertung', symbol: 'auswertung', farbe: '--schlaf' },
  beispiel: { titel: 'Beispiel', symbol: 'stern', farbe: '--aktivitaet' },
};

export const FELDTYPEN = ['datumzeit', 'tageszeit', 'skala', 'einfach', 'mehrfach', 'person', 'zahl', 'dauer', 'janein', 'text'];

export const TAGESZEITEN = [
  { id: 'jetzt', titel: 'Jetzt', symbol: 'uhr' },
  { id: 'vormittag', titel: 'Vormittag', symbol: 'sonne-auf' },
  { id: 'nachmittag', titel: 'Nachmittag', symbol: 'tag' },
  { id: 'abend', titel: 'Abend', symbol: 'sonne-unter' },
  { id: 'nacht', titel: 'Nacht', symbol: 'schlaf' },
];

/** Alle Felder eines Bereichs inklusive Zusatzfragen, z. B. für Prüfungen und Export. */
export function alleFelder(felder) {
  const liste = [];
  for (const f of felder ?? []) {
    liste.push(f);
    for (const o of f.optionen ?? []) liste.push(...alleFelder(o.zusatz));
    liste.push(...alleFelder(f.jeOption));
  }
  return liste;
}

/** Findet offensichtliche Fehler in einer Konfiguration. Leere Liste heißt: in Ordnung. */
export function pruefen(bereich) {
  const fehler = [];
  if (!BEREICHE[bereich?.id]) fehler.push(`Unbekannter Bereich „${bereich?.id}".`);
  const ids = new Set();
  for (const f of alleFelder(bereich?.felder)) {
    if (!f.id) fehler.push(`Feld „${f.titel}" hat keine Id.`);
    if (ids.has(f.id)) fehler.push(`Feld-Id „${f.id}" kommt doppelt vor.`);
    ids.add(f.id);
    if (!FELDTYPEN.includes(f.typ)) fehler.push(`Feld „${f.id}" hat unbekannten Typ „${f.typ}".`);
    if ((f.typ === 'einfach' || f.typ === 'mehrfach') && !f.optionen?.length) {
      fehler.push(`Feld „${f.id}" hat keine Optionen.`);
    }
  }
  return fehler;
}

/** Neutrales Beispiel mit allen Feldtypen, nur zum Ausprobieren. */
export const BEISPIEL = {
  id: 'beispiel',
  titel: 'Beispiel-Eintrag',
  untertitel: 'Zum Ausprobieren, wird nicht gespeichert',
  zeitart: 'zeitpunkt',
  felder: [
    { id: 'b_tageszeit', titel: 'Wann', typ: 'tageszeit' },
    { id: 'b_skala', titel: 'Beispiel-Skala', typ: 'skala', rolle: 'befinden', min: 1, max: 5, links: 'wenig', rechts: 'viel' },
    { id: 'b_sterne', titel: 'Beispiel-Sterne', typ: 'skala', rolle: 'befinden', min: 1, max: 5, darstellung: 'sterne' },
    {
      id: 'b_liste', titel: 'Beispiel-Liste', typ: 'einfach', darstellung: 'liste',
      optionen: [
        { id: 'l1', titel: 'Erste Form', kurz: 'klein', bild: { viewBox: '0 0 40 24', d: 'M8 12a4 4 0 1 0 0 .01M20 12a4 4 0 1 0 0 .01M32 12a4 4 0 1 0 0 .01' } },
        { id: 'l2', titel: 'Zweite Form', kurz: 'normal', bild: { viewBox: '0 0 40 24', d: 'M6 8h28a4 4 0 0 1 0 8H6a4 4 0 0 1 0-8z' } },
        { id: 'l3', titel: 'Dritte Form', kurz: 'groß', bild: { viewBox: '0 0 40 24', d: 'M4 6h32v12H4z' } },
      ],
    },
    {
      id: 'b_kacheln', titel: 'Beispiel-Einfachauswahl', typ: 'einfach', darstellung: 'kacheln', spalten: 3,
      optionen: [
        { id: 'a', titel: 'Option A', symbol: 'haken' },
        {
          id: 'b', titel: 'Option B', symbol: 'stern',
          zusatz: [{ id: 'b_zusatz', titel: 'Zusatzfrage zu B', typ: 'einfach', darstellung: 'kacheln', spalten: 3,
            optionen: [{ id: 'x', titel: 'eins' }, { id: 'y', titel: 'zwei' }, { id: 'z', titel: 'drei' }] }],
        },
        { id: 'c', titel: 'Option C', symbol: 'hinweis', hinweis: 'Beispiel-Hinweis: Bei dieser Option erscheint ein Hinweis.' },
      ],
    },
    {
      id: 'b_farben', titel: 'Beispiel-Farben', typ: 'einfach', darstellung: 'farben', spalten: 3, optional: true,
      optionen: [
        { id: 'f1', titel: 'Grau', farbe: '#8E8E93' },
        { id: 'f2', titel: 'Blau', farbe: '#2563EB' },
        { id: 'f3', titel: 'Grün', farbe: '#16A34A', hinweis: 'Beispiel-Hinweis zur Farbe.' },
      ],
    },
    {
      id: 'b_stufen', titel: 'Beispiel-Mehrfachauswahl mit Stufen', typ: 'mehrfach', darstellung: 'liste', rolle: 'symptom',
      stufen: [{ id: 'leicht', titel: 'leicht' }, { id: 'mittel', titel: 'mittel' }, { id: 'stark', titel: 'stark' }],
      optionen: [
        { id: 's1', titel: 'Eintrag eins', symbol: 'magen' },
        {
          id: 's2', titel: 'Eintrag zwei', symbol: 'stern',
          zusatz: [
            { id: 's2_wie', titel: 'Wie oft', typ: 'einfach', darstellung: 'kacheln', spalten: 3,
              optionen: [{ id: 'selten', titel: 'selten' }, { id: 'oft', titel: 'oft' }, { id: 'immer', titel: 'immer' }] },
          ],
        },
        { id: 's3', titel: 'Eintrag drei', symbol: 'tag' },
      ],
    },
    {
      id: 'b_pillen', titel: 'Beispiel-Mehrfachauswahl', typ: 'mehrfach', darstellung: 'pillen', optional: true,
      optionen: [
        { id: 'p1', titel: 'Erstens', symbol: 'uhr' },
        { id: 'p2', titel: 'Zweitens', symbol: 'schlaf' },
        { id: 'p3', titel: 'Drittens', symbol: 'person' },
      ],
    },
    {
      id: 'b_aktiv', titel: 'Beispiel-Kacheln mit Fragen je Kachel', typ: 'mehrfach', darstellung: 'kacheln', spalten: 4,
      jeOption: [
        { id: 'b_aktiv_dauer', titel: 'Wie lange', typ: 'dauer',
          stufen: [{ id: 'kurz', titel: '< 30 min', minuten: 20 }, { id: '1h', titel: '1 h', minuten: 60 }, { id: '2h', titel: '2 h', minuten: 120 }, { id: '3h', titel: '3 h +', minuten: 180 }] },
        { id: 'b_aktiv_spaet', titel: 'Spät', typ: 'janein', darstellung: 'schalter', symbol: 'schlaf' },
      ],
      optionen: [
        { id: 'k1', titel: 'Kachel 1', symbol: 'aktivitaet' },
        { id: 'k2', titel: 'Kachel 2', symbol: 'ernaehrung' },
        { id: 'k3', titel: 'Kachel 3', symbol: 'person', zusatz: [{ id: 'k3_wer', titel: 'Mit wem', typ: 'person' }] },
      ],
    },
    { id: 'b_person', titel: 'Beispiel-Personen', typ: 'person', rolle: 'person', optional: true },
    { id: 'b_schmerz', titel: 'Beispiel 0 bis 10', typ: 'skala', rolle: 'schmerz', min: 0, max: 10, links: 'keiner', rechts: 'stark' },
    { id: 'b_zahl', titel: 'Beispiel-Zahl', typ: 'zahl', einheit: 's', schritt: 5, min: 0 },
    { id: 'b_dauer', titel: 'Beispiel-Dauer', typ: 'dauer', rolle: 'dauer' },
    { id: 'b_janein', titel: 'Beispiel Ja oder Nein', typ: 'janein' },
    { id: 'b_datum', titel: 'Beispiel-Datum', typ: 'datumzeit', optional: true },
    { id: 'b_text', titel: 'Notiz', typ: 'text', optional: true },
  ],
};

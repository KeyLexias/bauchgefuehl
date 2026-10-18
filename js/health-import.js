// Health-Import: liest export.zip der Health-App stückweise und verdichtet sie zu Tageswerten.
// export.xml ist entpackt rund 200 MB groß. Darum wird sie nie ganz in den Speicher geladen, sondern
// direkt aus der ZIP-Datei entpackt (DecompressionStream) und Tag für Tag durchgesehen.
import { tageVerschieben, tageszeitVon } from './hilfen.js';
import { alle, aendern, metaSetzen, SPEICHER } from './db.js';

// ---------- ZIP ----------

const SIG_ENDE = 0x06054b50;
const SIG_ENDE64_ZEIGER = 0x07064b50;
const SIG_VERZEICHNIS = 0x02014b50;
const VOLL = 0xffffffff;

async function bytes(datei, von, bis) {
  return new DataView(await datei.slice(von, bis).arrayBuffer());
}

/** Sucht im Inhaltsverzeichnis am Ende der ZIP-Datei den ersten Eintrag, dessen Name passt. */
async function zipEintrag(datei, passt) {
  const hinten = Math.min(datei.size, 65557);
  const ende = await bytes(datei, datei.size - hinten, datei.size);
  let p = -1;
  for (let i = ende.byteLength - 22; i >= 0; i -= 1) if (ende.getUint32(i, true) === SIG_ENDE) { p = i; break; }
  if (p < 0) throw new Error('Die Datei ist keine ZIP-Datei. Bitte die export.zip aus der Health-App wählen.');
  let groesse = ende.getUint32(p + 12, true);
  let start = ende.getUint32(p + 16, true);
  if (start === VOLL || groesse === VOLL) {
    // ZIP64: Zeiger steht 20 Bytes vor dem Ende-Eintrag
    if (p < 20 || ende.getUint32(p - 20, true) !== SIG_ENDE64_ZEIGER) throw new Error('Das ZIP-Format wird nicht unterstützt.');
    const lage = Number(ende.getBigUint64(p - 12, true));
    const e64 = await bytes(datei, lage, lage + 56);
    groesse = Number(e64.getBigUint64(40, true));
    start = Number(e64.getBigUint64(48, true));
  }
  const vz = await bytes(datei, start, start + groesse);
  const dekoder = new TextDecoder();
  for (let i = 0; i + 46 <= vz.byteLength && vz.getUint32(i, true) === SIG_VERZEICHNIS;) {
    const methode = vz.getUint16(i + 10, true);
    let gepackt = vz.getUint32(i + 20, true);
    let entpackt = vz.getUint32(i + 24, true);
    const nLaenge = vz.getUint16(i + 28, true);
    const xLaenge = vz.getUint16(i + 30, true);
    const kLaenge = vz.getUint16(i + 32, true);
    let lokal = vz.getUint32(i + 42, true);
    const name = dekoder.decode(new Uint8Array(vz.buffer, vz.byteOffset + i + 46, nLaenge));
    // ZIP64-Zusatz: nur die Größen, die im Kopf auf „voll" stehen, in fester Reihenfolge
    for (let x = i + 46 + nLaenge; x + 4 <= i + 46 + nLaenge + xLaenge;) {
      const id = vz.getUint16(x, true);
      const n = vz.getUint16(x + 2, true);
      if (id === 1) {
        let q = x + 4;
        if (entpackt === VOLL) { entpackt = Number(vz.getBigUint64(q, true)); q += 8; }
        if (gepackt === VOLL) { gepackt = Number(vz.getBigUint64(q, true)); q += 8; }
        if (lokal === VOLL) lokal = Number(vz.getBigUint64(q, true));
      }
      x += 4 + n;
    }
    if (passt(name)) {
      const kopf = await bytes(datei, lokal, lokal + 30);
      const daten = lokal + 30 + kopf.getUint16(26, true) + kopf.getUint16(28, true);
      return { name, methode, von: daten, bis: daten + gepackt, entpackt };
    }
    i += 46 + nLaenge + xLaenge + kLaenge;
  }
  return null;
}

/** Entpackter Inhalt eines Eintrags als Textstrom; meldet den Anteil der gelesenen Bytes. */
function textStrom(datei, eintrag, gelesen) {
  let n = 0;
  const gesamt = eintrag.bis - eintrag.von || 1;
  let strom = datei.slice(eintrag.von, eintrag.bis).stream().pipeThrough(new TransformStream({
    transform(stueck, ctrl) { n += stueck.byteLength; gelesen(n / gesamt); ctrl.enqueue(stueck); },
  }));
  if (eintrag.methode === 8) strom = strom.pipeThrough(new DecompressionStream('deflate-raw'));
  else if (eintrag.methode !== 0) throw new Error('Die ZIP-Datei ist mit einem unbekannten Verfahren gepackt.');
  return strom.pipeThrough(new TextDecoderStream());
}

// ---------- XML ----------

const ENTITAETEN = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
const entschluesseln = (t) => (t.includes('&')
  ? t.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#'
    ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
    : ENTITAETEN[e] ?? m))
  : t);

const ATTRIBUT = /([\w:]+)="([^"]*)"/g;
function attribute(tag) {
  const a = {};
  for (const m of tag.matchAll(ATTRIBUT)) a[m[1]] = m[2];
  return a;
}

/**
 * Geht den Text Stück für Stück durch und ruft für jedes Element-Tag `beiTag(tag, name, schliessend, leer)` auf.
 * Text zwischen den Tags wird nicht gebraucht. Kommentare und die DOCTYPE-Erklärung werden übersprungen.
 */
function zerleger(beiTag) {
  let rest = '';
  return (text) => {
    const s = rest + text;
    let pos = 0;
    for (;;) {
      const lt = s.indexOf('<', pos);
      if (lt < 0) { pos = s.length; break; }
      const zeichen = s.charCodeAt(lt + 1);
      if (zeichen === 33) { // <!
        if (s.startsWith('<!--', lt)) {
          const e = s.indexOf('-->', lt + 4);
          if (e < 0) { pos = lt; break; }
          pos = e + 3;
          continue;
        }
        const gt = s.indexOf('>', lt);
        if (gt < 0) { pos = lt; break; }
        const klammer = s.indexOf('[', lt);
        if (klammer >= 0 && klammer < gt) {
          const e = s.indexOf(']>', klammer);
          if (e < 0) { pos = lt; break; }
          pos = e + 2;
        } else pos = gt + 1;
        continue;
      }
      const gt = s.indexOf('>', lt);
      if (gt < 0) { pos = lt; break; }
      pos = gt + 1;
      if (zeichen === 63) continue; // <?xml … ?>
      if (zeichen === 47) beiTag(s, lt + 2, true, false, gt);
      else beiTag(s, lt + 1, false, s.charCodeAt(gt - 1) === 47, gt);
    }
    rest = s.slice(pos);
  };
}

// ---------- Tageswerte ----------

const Q = 'HKQuantityTypeIdentifier';
const K = 'HKCategoryTypeIdentifier';

const NAEHRWERTE = {
  [`${Q}DietaryEnergyConsumed`]: 'kcal',
  [`${Q}DietaryProtein`]: 'eiweiss',
  [`${Q}DietaryCarbohydrates`]: 'kohlenhydrate',
  [`${Q}DietaryFatTotal`]: 'fett',
  [`${Q}DietarySugar`]: 'zucker',
  [`${Q}DietaryFiber`]: 'ballaststoffe',
  [`${Q}DietaryWater`]: 'wasser',
};
// Summen über den Tag, Quellen überlappen: je Stunde zählt die Quelle mit dem höchsten Wert.
const STUNDEN_SUMMEN = { [`${Q}StepCount`]: 'schritte', [`${Q}ActiveEnergyBurned`]: 'aktivEnergie' };
const SUMMEN = { [`${Q}TimeInDaylight`]: 'tageslicht' };
// Schnitt je Tag; nachts gemessene Werte gehören zum Morgen danach.
const SCHNITTE = {
  [`${Q}RestingHeartRate`]: { feld: 'ruhepuls' },
  [`${Q}HeartRateVariabilitySDNN`]: { feld: 'hrv' },
  [`${Q}OxygenSaturation`]: { feld: 'sauerstoff', prozent: true },
  [`${Q}RespiratoryRate`]: { feld: 'atemfrequenz', nacht: true },
  [`${Q}AppleSleepingWristTemperature`]: { feld: 'temperatur', nacht: true },
};
const GEWICHT = `${Q}BodyMass`;
const SCHLAF = `${K}SleepAnalysis`;
const ACHTSAMKEIT = `${K}MindfulSession`;

/** „2026-10-12 07:44:43 +0200" → Millisekunden */
const ms = (t) => Date.parse(`${t.slice(0, 10)}T${t.slice(11, 19)}${t.slice(20, 23)}:${t.slice(23, 25)}`);
/** Nacht, zu der eine Zeit gehört: Ende vor 16 Uhr zählt zum selben Morgen, später zum nächsten. */
const nachtVon = (ende) => (Number(ende.slice(11, 13)) < 16 ? ende.slice(0, 10) : tageVerschieben(ende.slice(0, 10), 1));

function einheitUmrechnen(feld, wert, einheit) {
  if (feld === 'kcal') return einheit === 'kJ' ? wert / 4.184 : wert;
  if (feld === 'wasser') return einheit === 'L' ? wert * 1000 : einheit === 'fl_oz_us' ? wert * 29.5735 : wert;
  if (einheit === 'mg') return wert / 1000;
  if (einheit === 'kg') return wert * 1000;
  return wert;
}

const rund = (x, stellen = 1) => Math.round(x * 10 ** stellen) / 10 ** stellen;

/**
 * Liest export.zip und liefert Tageswerte und Mahlzeiten.
 * fortschritt(anteil 0–1) wird während des Lesens aufgerufen.
 */
export async function healthLesen(datei, { fortschritt = () => {} } = {}) {
  if (typeof DecompressionStream === 'undefined' || typeof TextDecoderStream === 'undefined') {
    throw new Error('Dieser Browser kann ZIP-Dateien nicht entpacken. Bitte iOS aktualisieren.');
  }
  const eintrag = await zipEintrag(datei, (name) => /(^|\/)export\.xml$/.test(name));
  if (!eintrag) throw new Error('In der ZIP-Datei fehlt export.xml. Bitte den Export aus der Health-App wählen.');

  const tage = new Map(); // tag → Sammler
  const tag = (t) => {
    if (!tage.has(t)) tage.set(t, { summen: {}, schnitte: {}, training: [], stunden: {}, naehr: {}, gewicht: null });
    return tage.get(t);
  };
  const naechte = new Map(); // nacht → quelle → Abschnitte
  const mahlzeiten = new Map(); // „JJJJ-MM-TTTHH:MM" → Set(Namen)
  const quellenTypen = new Map(); // quelle → Set der Arten, die sie schreibt
  let exportDatum = null;
  let tiefe = 0; // innerhalb von Correlation: Einzelwerte dort sind doppelt
  let essen = null; // offener Nährwert-Record, sammelt den Lebensmittelnamen
  const stundenWerte = []; // [art, tag, stunde, quelle, wert], erst am Ende verrechnet

  const beiTag = (s, a, schliessend, leer, gt) => {
    if (schliessend) {
      if (s.startsWith('Correlation', a)) tiefe -= 1;
      else if (s.startsWith('Record', a)) essen = null;
      return;
    }
    if (s.startsWith('Record type="', a)) {
      if (tiefe > 0) return;
      const typEnde = s.indexOf('"', a + 13);
      const typ = s.slice(a + 13, typEnde);
      essen = null;
      const naehr = NAEHRWERTE[typ];
      if (!naehr && !STUNDEN_SUMMEN[typ] && !SUMMEN[typ] && !SCHNITTE[typ] && typ !== GEWICHT && typ !== SCHLAF && typ !== ACHTSAMKEIT) return;
      const x = attribute(s.slice(a, gt));
      const start = x.startDate ?? '';
      const t = start.slice(0, 10);
      if (t.length !== 10) return;
      const quelle = entschluesseln(x.sourceName ?? '');
      const wert = Number(x.value);
      if (naehr) {
        if (!quellenTypen.has(quelle)) quellenTypen.set(quelle, new Set());
        quellenTypen.get(quelle).add('ernaehrung');
        if (Number.isFinite(wert)) {
          const n = tag(t).naehr;
          n[naehr] = (n[naehr] ?? 0) + einheitUmrechnen(naehr, wert, x.unit);
        }
        if (!leer) essen = `${t}T${start.slice(11, 16)}`;
      } else if (STUNDEN_SUMMEN[typ]) {
        if (Number.isFinite(wert)) stundenWerte.push([STUNDEN_SUMMEN[typ], t, start.slice(11, 13), quelle, wert]);
        tag(t);
      } else if (SUMMEN[typ]) {
        if (Number.isFinite(wert)) { const z = tag(t).summen; z[SUMMEN[typ]] = (z[SUMMEN[typ]] ?? 0) + wert; }
      } else if (SCHNITTE[typ]) {
        const art = SCHNITTE[typ];
        if (!Number.isFinite(wert)) return;
        const ziel = art.nacht ? nachtVon(x.endDate ?? start) : t;
        const w = art.prozent && x.unit === '%' && wert <= 1 ? wert * 100 : wert;
        const z = tag(ziel).schnitte;
        (z[art.feld] ??= []).push(w);
      } else if (typ === GEWICHT) {
        if (!Number.isFinite(wert)) return;
        const kg = x.unit === 'lb' ? wert * 0.45359237 : x.unit === 'g' ? wert / 1000 : wert;
        const z = tag(t);
        if (!z.gewicht || start >= z.gewicht.zeit) z.gewicht = { zeit: start, kg };
      } else if (typ === SCHLAF) {
        const ende = x.endDate ?? start;
        const n = nachtVon(ende);
        if (!naechte.has(n)) naechte.set(n, new Map());
        const proQuelle = naechte.get(n);
        if (!proQuelle.has(quelle)) proQuelle.set(quelle, []);
        proQuelle.get(quelle).push({ start, ende, minuten: (ms(ende) - ms(start)) / 60000, wert: (x.value ?? '').replace('HKCategoryValueSleepAnalysis', '') });
        tag(n);
      } else if (typ === ACHTSAMKEIT) {
        const minuten = (ms(x.endDate ?? start) - ms(start)) / 60000;
        if (Number.isFinite(minuten) && minuten > 0) { const z = tag(t).summen; z.achtsamkeit = (z.achtsamkeit ?? 0) + minuten; }
      }
      return;
    }
    if (s.startsWith('MetadataEntry key="HKFoodType"', a)) {
      if (!essen || tiefe > 0) return;
      const name = entschluesseln(attribute(s.slice(a, gt)).value ?? '').trim();
      if (!name) return;
      if (!mahlzeiten.has(essen)) mahlzeiten.set(essen, new Set());
      mahlzeiten.get(essen).add(name);
      return;
    }
    if (s.startsWith('Correlation ', a) || s.startsWith('Correlation>', a)) { if (!leer) tiefe += 1; return; }
    if (s.startsWith('Workout ', a)) {
      const x = attribute(s.slice(a, gt));
      const start = x.startDate ?? '';
      if (start.length < 16) return;
      let minuten = Number(x.duration);
      if (x.durationUnit === 'sec' || x.durationUnit === 's') minuten /= 60;
      else if (x.durationUnit === 'hr' || x.durationUnit === 'h') minuten *= 60;
      if (!Number.isFinite(minuten) && x.endDate) minuten = (ms(x.endDate) - ms(start)) / 60000;
      tag(start.slice(0, 10)).training.push({
        art: (x.workoutActivityType ?? '').replace('HKWorkoutActivityType', '') || 'Other',
        minuten: Math.round(minuten || 0),
        beginn: start.slice(11, 16),
        quelle: entschluesseln(x.sourceName ?? ''),
      });
      return;
    }
    if (s.startsWith('ExportDate ', a)) exportDatum = attribute(s.slice(a, gt)).value?.slice(0, 16) ?? null;
  };

  const lesen = zerleger(beiTag);
  let zuletzt = 0;
  const leser = textStrom(datei, eintrag, (anteil) => {
    if (anteil - zuletzt >= 0.01 || anteil === 1) { zuletzt = anteil; fortschritt(anteil); }
  }).getReader();
  for (;;) {
    const { value, done } = await leser.read();
    if (done) break;
    lesen(value);
  }
  fortschritt(1);

  // Stundenwerte: je Stunde die Quelle mit dem höchsten Wert, so zählen Uhr und iPhone nicht doppelt.
  const stunden = new Map();
  for (const [art, t, h, quelle, wert] of stundenWerte) {
    // Ernährungs-Apps schreiben aktive Energie nur geschätzt, die zählt nicht mit.
    if (art === 'aktivEnergie' && quellenTypen.get(quelle)?.has('ernaehrung')) continue;
    const k = `${art}|${t}|${h}|${quelle}`;
    stunden.set(k, (stunden.get(k) ?? 0) + wert);
  }
  const besteStunde = new Map();
  for (const [k, wert] of stunden) {
    const ohneQuelle = k.slice(0, k.lastIndexOf('|'));
    if (wert > (besteStunde.get(ohneQuelle) ?? 0)) besteStunde.set(ohneQuelle, wert);
  }
  for (const [k, wert] of besteStunde) {
    const [art, t] = k.split('|');
    const z = tag(t).summen;
    z[art] = (z[art] ?? 0) + wert;
  }

  const ergebnis = new Map();
  for (const [t, z] of [...tage.entries()].sort(([x], [y]) => (x < y ? -1 : 1))) {
    const d = { tag: t };
    if (z.summen.schritte) d.schritte = Math.round(z.summen.schritte);
    if (z.summen.aktivEnergie) d.aktivEnergie = Math.round(z.summen.aktivEnergie);
    if (z.summen.tageslicht) d.tageslicht = Math.round(z.summen.tageslicht);
    if (z.summen.achtsamkeit) d.achtsamkeit = Math.round(z.summen.achtsamkeit);
    for (const [feld, werte] of Object.entries(z.schnitte)) d[feld] = rund(werte.reduce((x, y) => x + y, 0) / werte.length, feld === 'temperatur' ? 2 : 1);
    if (z.gewicht) d.gewicht = rund(z.gewicht.kg, 1);
    if (z.training.length) d.training = z.training.sort((x, y) => (x.beginn < y.beginn ? -1 : 1));
    if (Object.keys(z.naehr).length) d.ernaehrung = Object.fromEntries(Object.entries(z.naehr).map(([k, v]) => [k, rund(v, k === 'kcal' || k === 'wasser' ? 0 : 1)]));
    const schlaf = schlafVon(naechte.get(t));
    if (schlaf) d.schlaf = schlaf;
    ergebnis.set(t, d);
  }
  const essenListe = [...mahlzeiten.entries()].sort(([x], [y]) => (x < y ? -1 : 1)).map(([zeitpunkt, namen]) => ({ zeitpunkt, namen: [...namen] }));
  return { tage: ergebnis, mahlzeiten: essenListe, exportDatum };
}

/** Schlaf einer Nacht: bevorzugt die Quelle mit Schlafphasen, sonst die mit dem meisten Schlaf. */
function schlafVon(proQuelle) {
  if (!proQuelle) return null;
  const auswerten = (quelle, abschnitte) => {
    const s = { quelle, dauer: 0, tief: 0, kern: 0, rem: 0, wach: 0, imBett: 0, phasen: false };
    let erster = null;
    let letzter = null;
    for (const a of abschnitte) {
      if (!Number.isFinite(a.minuten) || a.minuten <= 0) continue;
      if (a.wert.startsWith('Asleep')) {
        s.dauer += a.minuten;
        if (a.wert === 'AsleepDeep') { s.tief += a.minuten; s.phasen = true; }
        else if (a.wert === 'AsleepCore') { s.kern += a.minuten; s.phasen = true; }
        else if (a.wert === 'AsleepREM') { s.rem += a.minuten; s.phasen = true; }
        if (!erster || a.start < erster) erster = a.start;
        if (!letzter || a.ende > letzter) letzter = a.ende;
      } else if (a.wert === 'Awake') s.wach += a.minuten;
      else if (a.wert === 'InBed') s.imBett += a.minuten;
    }
    if (erster) { s.einschlafen = erster.slice(11, 16); s.aufwachen = letzter.slice(11, 16); }
    return s;
  };
  const alle = [...proQuelle.entries()].map(([q, a]) => auswerten(q, a));
  const mitSchlaf = alle.filter((s) => s.dauer > 0);
  const imBett = Math.max(0, ...alle.map((s) => s.imBett));
  if (!mitSchlaf.length) return imBett ? { imBett: Math.round(imBett) } : null;
  const gewaehlt = mitSchlaf.find((s) => s.phasen) ?? mitSchlaf.sort((x, y) => y.dauer - x.dauer)[0];
  const aus = { dauer: Math.round(gewaehlt.dauer), einschlafen: gewaehlt.einschlafen, aufwachen: gewaehlt.aufwachen, quelle: gewaehlt.quelle };
  if (gewaehlt.phasen) Object.assign(aus, { tief: Math.round(gewaehlt.tief), kern: Math.round(gewaehlt.kern), rem: Math.round(gewaehlt.rem), wach: Math.round(gewaehlt.wach) });
  if (imBett) aus.imBett = Math.round(imBett);
  return aus;
}

// ---------- Speichern ----------

export const QUELLE = 'health';

/**
 * Übernimmt das Gelesene. Jeder Export enthält alles, darum ersetzt er die Health-Daten aller Tage,
 * die er enthält: Tageswerte und die Mahlzeiten im Bereich Ernährung (nur die aus Health, eigene Einträge bleiben).
 */
export async function healthSpeichern({ tage, mahlzeiten, exportDatum }) {
  const [configs, eintraege] = await Promise.all([alle(SPEICHER.config), alle(SPEICHER.eintraege)]);
  const bereich = configs.find((b) => b.id === 'ernaehrung');
  const essenFeld = (bereich?.felder ?? []).find((f) => f.typ === 'text' && f.rolle === 'essen');
  const zeitFeld = (bereich?.felder ?? []).find((f) => f.typ === 'tageszeit');
  const betroffen = new Set(tage.keys());
  for (const m of mahlzeiten) betroffen.add(m.zeitpunkt.slice(0, 10));

  const jetzt = new Date().toISOString();
  const neu = essenFeld ? mahlzeiten.map((m) => ({
    id: `${QUELLE}-${m.zeitpunkt}`,
    bereich: bereich.id,
    zeitpunkt: m.zeitpunkt,
    werte: { ...(zeitFeld ? { [zeitFeld.id]: tageszeitVon(m.zeitpunkt) } : {}), [essenFeld.id]: m.namen.join(', ') },
    lebensmittel: m.namen, // einzeln, weil Namen selbst Kommas enthalten können
    quelle: QUELLE,
    erstellt: jetzt,
    geaendert: jetzt,
  })) : [];
  const weg = essenFeld
    ? eintraege.filter((e) => e.quelle === QUELLE && e.bereich === bereich.id && betroffen.has(e.zeitpunkt.slice(0, 10))).map((e) => e.id)
    : [];
  const vorhandeneTage = (await alle(SPEICHER.health)).filter((d) => betroffen.has(d.tag) && !tage.has(d.tag)).map((d) => d.tag);

  await aendern({
    loeschen: { [SPEICHER.eintraege]: weg, [SPEICHER.health]: vorhandeneTage },
    speichern: { [SPEICHER.health]: [...tage.values()], [SPEICHER.eintraege]: neu },
  });
  const liste = [...tage.values()];
  const bericht = {
    exportDatum,
    tage: liste.length,
    von: liste[0]?.tag,
    bis: liste.at(-1)?.tag,
    naechte: liste.filter((d) => d.schlaf?.dauer).length,
    ernaehrung: liste.filter((d) => d.ernaehrung).length,
    trainings: liste.reduce((n, d) => n + (d.training?.length ?? 0), 0),
    mahlzeiten: neu.length,
    ohneErnaehrung: !essenFeld && mahlzeiten.length > 0,
    zeitpunkt: jetzt,
  };
  await metaSetzen('letzterHealthImport', bericht);
  return bericht;
}

// ---------- Anzeige-Namen ----------

const TRAININGS = {
  TraditionalStrengthTraining: 'Krafttraining', FunctionalStrengthTraining: 'Funktionelles Krafttraining',
  Walking: 'Gehen', Running: 'Laufen', Cycling: 'Radfahren', Swimming: 'Schwimmen', Hiking: 'Wandern',
  Yoga: 'Yoga', Pilates: 'Pilates', HighIntensityIntervalTraining: 'HIIT', CoreTraining: 'Core-Training',
  Flexibility: 'Beweglichkeit', Cooldown: 'Abwärmen', MixedCardio: 'Cardio', Elliptical: 'Crosstrainer',
  Rowing: 'Rudern', StairClimbing: 'Stiegensteigen', Dance: 'Tanzen', SocialDance: 'Tanzen', CardioDance: 'Tanzen',
  MindAndBody: 'Körper und Geist', Climbing: 'Klettern', Boxing: 'Boxen', Kickboxing: 'Kickboxen', MartialArts: 'Kampfsport',
  Tennis: 'Tennis', TableTennis: 'Tischtennis', Badminton: 'Badminton', Soccer: 'Fußball', Basketball: 'Basketball',
  Volleyball: 'Volleyball', DownhillSkiing: 'Skifahren', CrossCountrySkiing: 'Langlaufen', Snowboarding: 'Snowboarden',
  WaterSports: 'Wassersport', Golf: 'Golf', JumpRope: 'Seilspringen', Barre: 'Barre', PreparationAndRecovery: 'Vorbereitung und Erholung',
  Other: 'Sonstiges',
};

/** Deutscher Name einer Trainingsart; unbekannte Arten werden lesbar getrennt. */
export function trainingsName(art) {
  return TRAININGS[art] ?? String(art).replace(/([a-z])([A-Z])/g, '$1 $2');
}

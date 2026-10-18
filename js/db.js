// Speicher in IndexedDB. Jede Änderung wird sofort geschrieben.
const NAME = 'bauchgefuehl';
const VERSION = 1;

export const SPEICHER = {
  config: 'config',       // Konfiguration der Bereiche, Fragen und Optionen
  eintraege: 'eintraege', // alle Einträge, je mit Bereich und Zeitpunkt
  personen: 'personen',   // in der App gepflegte Personenliste
  meta: 'meta',           // z. B. Zeitpunkt der letzten Sicherung
};

let verbindung;

function oeffnen() {
  if (verbindung) return verbindung;
  verbindung = new Promise((ok, fehler) => {
    const anfrage = indexedDB.open(NAME, VERSION);
    anfrage.onupgradeneeded = () => {
      const db = anfrage.result;
      if (!db.objectStoreNames.contains(SPEICHER.config)) {
        db.createObjectStore(SPEICHER.config, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SPEICHER.eintraege)) {
        const s = db.createObjectStore(SPEICHER.eintraege, { keyPath: 'id' });
        s.createIndex('bereich', 'bereich');
        s.createIndex('zeitpunkt', 'zeitpunkt');
      }
      if (!db.objectStoreNames.contains(SPEICHER.personen)) {
        db.createObjectStore(SPEICHER.personen, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SPEICHER.meta)) {
        db.createObjectStore(SPEICHER.meta, { keyPath: 'schluessel' });
      }
    };
    anfrage.onsuccess = () => {
      const db = anfrage.result;
      // Andere Tabs mit neuerer Version sollen nicht blockiert werden.
      db.onversionchange = () => { db.close(); verbindung = undefined; };
      ok(db);
    };
    anfrage.onerror = () => fehler(anfrage.error);
    anfrage.onblocked = () => fehler(new Error('Datenbank ist in einem anderen Fenster blockiert.'));
  });
  return verbindung;
}

function alsPromise(anfrage) {
  return new Promise((ok, fehler) => {
    anfrage.onsuccess = () => ok(anfrage.result);
    anfrage.onerror = () => fehler(anfrage.error);
  });
}

function fertig(tx) {
  return new Promise((ok, fehler) => {
    tx.oncomplete = () => ok();
    tx.onerror = () => fehler(tx.error);
    tx.onabort = () => fehler(tx.error ?? new Error('Speichern abgebrochen.'));
  });
}

export async function holen(speicher, id) {
  const db = await oeffnen();
  return alsPromise(db.transaction(speicher).objectStore(speicher).get(id));
}

export async function alle(speicher) {
  const db = await oeffnen();
  return alsPromise(db.transaction(speicher).objectStore(speicher).getAll());
}

/** Einträge eines Zeitraums, Zeitpunkt als ISO-Text „JJJJ-MM-TTTHH:MM". */
export async function eintraegeZwischen(von, bis) {
  const db = await oeffnen();
  const index = db.transaction(SPEICHER.eintraege).objectStore(SPEICHER.eintraege).index('zeitpunkt');
  return alsPromise(index.getAll(IDBKeyRange.bound(von, bis)));
}

export async function speichern(speicher, objekt) {
  const db = await oeffnen();
  const tx = db.transaction(speicher, 'readwrite');
  tx.objectStore(speicher).put(objekt);
  await fertig(tx);
  return objekt;
}

export async function loeschen(speicher, id) {
  const db = await oeffnen();
  const tx = db.transaction(speicher, 'readwrite');
  tx.objectStore(speicher).delete(id);
  await fertig(tx);
}

/** Ersetzt den gesamten Inhalt in einer Transaktion: entweder alles oder nichts. */
export async function allesErsetzen(inhalt) {
  const db = await oeffnen();
  const namen = Object.values(SPEICHER);
  const tx = db.transaction(namen, 'readwrite');
  for (const name of namen) {
    const s = tx.objectStore(name);
    s.clear();
    for (const objekt of inhalt[name] ?? []) s.put(objekt);
  }
  await fertig(tx);
}

/** Gesamter Inhalt aller Speicher, Grundlage für die Sicherung. */
export async function allesLesen() {
  const ergebnis = {};
  for (const name of Object.values(SPEICHER)) ergebnis[name] = await alle(name);
  return ergebnis;
}

export async function metaHolen(schluessel) {
  return (await holen(SPEICHER.meta, schluessel))?.wert;
}

export async function metaSetzen(schluessel, wert) {
  await speichern(SPEICHER.meta, { schluessel, wert });
}

/** Bittet den Browser, die Daten nicht automatisch zu löschen. */
export async function dauerhaftAnfragen() {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

export function neueId() {
  return crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

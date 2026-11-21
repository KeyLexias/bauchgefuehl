// Termin-Fenster: ein Termin ist ein eigener Eintrag der Genesung, mehrere pro Tag möglich.
// Die Fragen kommen aus der Konfiguration (Option mit `terminFelder`, siehe terminQuellen).
import { alle, speichern, loeschen, neueId, SPEICHER } from './db.js';
import { formularAnzeigen } from './formular.js';
import { sheetOeffnen } from './uebung-eingabe.js';
import { GENESUNG, genesungLaden, mitBeschwerden, terminQuellen, terminWerte, formWerte } from './genesung-daten.js';

/** Gibt es in der Konfiguration ein Termin-Fenster? */
export async function terminFensterVorhanden() {
  return terminQuellen(await alle(SPEICHER.config)).length > 0;
}

/**
 * Öffnet das Termin-Fenster. eintrag: bestehender Termin zum Ändern; tag: Vorgabe für neue Termine;
 * beschwerde: vorgewählte Beschwerde. Liefert den gesicherten Eintrag, 'geloescht' oder null (abgebrochen).
 */
export async function terminFenster({ eintrag, tag, beschwerde, meldung } = {}) {
  const [configs, genesung, personen] = await Promise.all([alle(SPEICHER.config), genesungLaden(), alle(SPEICHER.personen)]);
  const q = terminQuellen(configs)[0];
  if (!q) return null;
  const bereich = mitBeschwerden({ id: GENESUNG, titel: 'Termin', zeitart: 'zeitpunkt', felder: q.felder }, genesung);
  const vorgabe = !eintrag && beschwerde && q.beschwerde ? { pfad: [q.beschwerde], wert: beschwerde } : undefined;

  return new Promise((fertig) => {
    let ergebnis = null;
    sheetOeffnen(eintrag ? 'Termin' : 'Termin eintragen', (koerper, schliessen) => {
      const zu = (wert) => { ergebnis = wert; schliessen(); fertig(wert); };
      formularAnzeigen(koerper, {
        bereich,
        eintrag: eintrag ? { ...eintrag, werte: formWerte(q, eintrag.werte) } : undefined,
        vorgabeTag: tag,
        vorgabe,
        nutzung: new Map(),
        personen,
        personAnlegen: async (name, feld) => {
          const person = { id: neueId(), name, ...(feld?.liste ? { liste: feld.liste } : {}) };
          await speichern(SPEICHER.personen, person);
          return person;
        },
        optionAnlegen: async (feld, titel) => ({ id: neueId(), titel }),
        abbrechen: () => zu(null),
        sichern: async (neu) => {
          // Ältere Angaben (z. B. ein eigener Titel) bleiben, die Fragen des Fensters überschreiben.
          const behalten = Object.fromEntries(Object.entries(eintrag?.werte ?? {})
            .filter(([k]) => !['wer', 'terminArt', 'beschwerde', 'notiz', 'anordnung'].includes(k)));
          const gesichert = { ...neu, bereich: GENESUNG, werte: { ...behalten, ...terminWerte(q, neu.werte) } };
          await speichern(SPEICHER.eintraege, gesichert);
          meldung?.('Termin gesichert');
          zu(gesichert);
        },
        loeschen: eintrag ? async () => {
          if (!confirm('Diesen Termin löschen?')) return;
          await loeschen(SPEICHER.eintraege, eintrag.id);
          meldung?.('Termin gelöscht');
          zu('geloescht');
        } : undefined,
      });
    }, { untertitel: 'Datum und Uhrzeit oben änderbar', farbe: '--genesung' });
    // Schließen über das X oder den Rand zählt als Abbrechen.
    const dialog = document.querySelector('dialog.sheet:last-of-type');
    dialog?.addEventListener('close', () => { if (ergebnis === null) fertig(null); });
  });
}

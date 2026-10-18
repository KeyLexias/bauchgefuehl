# Bauchgefühl

Persönliche Tracking-Web-App für ein iPhone. Ein einziger Nutzer, Sprache Deutsch (Österreich).

**Dieses Repository ist öffentlich.** Alle konkreten Inhalte (Fragen, Auswahllisten, Aktivitäten,
Symptome, Genesungen, Personen, Datenformate) stehen in `CLAUDE.local.md` und in der privaten
Startkonfiguration. Nichts davon in Code, Commits, Kommentare, Testdaten oder Commit-Messages schreiben.

## Architektur (entschieden, nicht ändern ohne Rückfrage)

- **Statische Web-App (PWA)**, nur HTML, CSS und JavaScript. Kein Backend, kein Python im Betrieb,
  keine externen Dienste, keine Analytics, kein Tracking.
- **Hosting:** GitHub Pages aus diesem öffentlichen Repository. Der Code ist öffentlich, Daten nie.
- **Installation:** Safari → Teilen → „Zum Home-Bildschirm". Manifest, App-Icon, Vollbild.
- **Offline:** Service Worker cacht alle App-Dateien. Nach dem ersten Laden funktioniert alles ohne Netz.
  Updates kommen beim nächsten Öffnen mit Internet.
- **Speicher:** IndexedDB im Browser des iPhones. Jeder Eintrag wird beim Sichern sofort geschrieben.
  `navigator.storage.persist()` anfragen.
- **Sicherung:** Button „Alles sichern" erzeugt eine JSON-Datei und öffnet per `navigator.share({files})`
  den Teilen-Dialog → „In Dateien sichern" → iCloud Drive. Immer derselbe Dateiname
  `bauchgefuehl-backup.json`, er wird überschrieben (vom Nutzer so gewünscht).
- **Wiederherstellen:** Datei auswählen, vollständiger Import.
- **Erinnerung:** Banner in der App, wenn die letzte Sicherung älter als 7 Tage ist.
- **CSV-Export:** zusätzlich je Bereich eine CSV im Format unten, für Numbers und für Analysen mit Claude.
- **Kein Apple-Health-Zugriff** (im Browser technisch unmöglich). Health-Daten kommen über den
  monatlichen Health-Export, siehe unten.
- **Nie committen:** Daten-Dateien (CSV, JSON, ZIP), `CLAUDE.local.md`, den Ordner `vorlagen/`. Siehe `.gitignore`.

## Baukasten-Prinzip (wichtigste Regel)

Der Code kennt nur Bereiche und allgemeine Bausteine, keine Inhalte.

- **Bereiche (fest im Code):** Schlaf, Stuhlgang, Aktivitäten, Magen und Darm, Ernährung (nur Import), Genesung, Auswertung.
- **Feldtypen (fest im Code):** Datum und Uhrzeit, Tageszeit, Skala mit frei wählbarem Bereich und
  Beschriftung der Enden, Einfachauswahl, Mehrfachauswahl, Kontakt oder Person, Zahl mit Einheit,
  Dauer, Ja/Nein, Freitext. Jede Option kann ein Symbol und eine Farbe haben.
- **Bedingte Zusatzfragen:** Eine Frage erscheint nur, wenn eine bestimmte Option gewählt wurde,
  direkt darunter aufgeklappt.
- **Bedeutung für die Auswertung:** Jedes Feld trägt eine Rolle, etwa `befinden`, `symptom`,
  `staerke`, `person`, `dauer`, `ausloeser`, `schmerz`, `uebung`. Die Auswertung arbeitet nur über diese
  Rollen, nie über konkrete Namen.
- **Konfiguration:** liegt in IndexedDB, ist Teil der Sicherung und in der App bearbeitbar
  (Fragen und Optionen hinzufügen, umbenennen, ausblenden). Beim ersten Start ist die App leer und
  bietet „Wiederherstellen" an. Die echte Startkonfiguration bringt der Nutzer über seine private
  Startdatei mit.
- **Demo-Inhalte im Code** nur neutral und offensichtlich als Beispiel (etwa „Beispiel-Aktivität").
- **Gesundheitsbezogene Formulierungen im Code** allgemein halten: „Eintrag", „Frage", „Skala",
  nicht konkrete Symptome oder Aktivitäten.

## Warum keine native App

Geprüft und verworfen: Eine Swift-App mit HealthKit bräuchte entweder den dauerhaft aktiven
Entwicklermodus am iPhone (vom Nutzer abgelehnt) oder das Apple-Entwicklerkonto für rund 99 € im Jahr
(abgelehnt). Kurzbefehle funktionieren, sind aber in Design und Bedienung zu eingeschränkt.

## Inhalte und Datenformate

Siehe `CLAUDE.local.md`. Design-Vorlagen in `vorlagen/` (lokal, nicht im Repository).

## Arbeitsweise

- Vor jeder Übergabe im Browser in iPhone-Größe (390 × 844) testen, hell und dunkel, und Fehler in der
  Konsole prüfen.
- Nutzer ist Business Analyst, kein Entwickler: Schritte am Mac konkret erklären, Fachbegriffe kurz übersetzen.
- Ehrlich sagen, was nicht geht oder was nicht getestet ist.

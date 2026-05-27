# Komplizen Protokolle – Quelldokument für Nutzerhandbuch

## Was ist Komplizen Protokolle?

Komplizen Protokolle ist ein digitales Werkzeug für Besprechungsprotokolle und Projektdokumentation, entwickelt für das Büro Komplizen Industrieplanung und Architektur. Die App läuft auf einem eigenen Server im Büronetzwerk unter der Adresse http://192.168.178.154:3000 und ist für alle Mitarbeiter über den Browser erreichbar. Es gibt keine Abhängigkeit von externen Cloud-Diensten. Alle Daten werden lokal gespeichert.

---

## Anmeldung

### Erster Aufruf
Die App wird im Browser (Chrome oder Edge empfohlen) über die Adresse http://192.168.178.154:3000 geöffnet. Es erscheint ein Anmeldebildschirm mit den Feldern Benutzername und Passwort.

### Benutzername und Passwort
Jeder Nutzer erhält vom Administrator einen Benutzernamen und ein temporäres Passwort per E-Mail-Einladung. Nach der ersten Anmeldung sollte das Passwort geändert werden. Das Passwort kann über das Augensymbol sichtbar gemacht werden.

### Passwort vergessen
Auf dem Anmeldebildschirm gibt es den Link „Passwort zurücksetzen". Dort kann der Nutzername eingegeben werden. Der Administrator erhält dann eine Benachrichtigung und setzt ein neues Passwort.

### Passwort ändern
Nach der Anmeldung kann das Passwort über das Zahnrad-Symbol (oben rechts) → Tab „Passwort" geändert werden.

### Als App installieren (PWA)
Die App kann wie eine Desktop-App installiert werden:
1. http://192.168.178.154:3000 in Chrome oder Edge öffnen
2. In der Adressleiste erscheint ein Installieren-Symbol (⊕)
3. Auf „Installieren" klicken
4. Die App erscheint im Startmenü und auf dem Desktop mit dem Komplizen-Logo
5. Die App öffnet sich dann ohne Browser-Rahmen wie eine normale Windows-Anwendung

---

## Startseite – Projektübersicht

Nach der Anmeldung erscheint die Startseite mit allen Projekten.

### Projekte
- Jedes Projekt wird als Karte angezeigt mit Name, Anzahl der Protokolle und letztem Datum
- Klick auf ein Projekt öffnet die Protokollliste des Projekts
- Projekte können über den Button „Neues Projekt" angelegt werden
- Projektnamen können durch Klick auf den Stift-Icon bearbeitet werden
- Projekte können gelöscht werden (nur wenn keine Protokolle vorhanden sind)

### Favoriten
Jeder Nutzer kann Projekte als Favorit markieren (Stern-Symbol). Favoriten erscheinen oben in der Liste. Diese Einstellung ist pro Nutzer individuell und wird auf dem Server gespeichert.

### Suche
Über das Suchfeld können Projekte nach Namen gefiltert werden.

### Maßnahmen-Dashboard
Der Button „Dashboard" öffnet eine projektübergreifende Übersicht aller offenen Maßnahmen aus allen Protokollen.

### Passwortschutz für Projekte
Projekte können mit einem Passwort geschützt werden. Geschützte Projekte sind mit einem Schloss-Symbol gekennzeichnet. Beim Öffnen wird das Passwort abgefragt. Der Inhalt wird verschlüsselt gespeichert.

---

## Protokollliste

Nach dem Klick auf ein Projekt erscheint die Liste aller Protokolle dieses Projekts.

### Protokolle in der Liste
Jedes Protokoll zeigt:
- Datum der Besprechung
- Besprechungsart (z.B. Baubesprechung, Jour Fixe)
- Protokollnummer (automatisch generiert aus Projektname, Datum und Position in der Kette)
- Ort der Besprechung
- Anzahl der Teilnehmer
- Anzahl offener Maßnahmen
- Wer das Protokoll zuletzt bearbeitet hat
- Ob das Protokoll abgeschlossen ist (Schloss-Symbol)

### Neues Protokoll
Der Button „Neues Protokoll" erstellt ein leeres Protokoll für das aktuelle Projekt.

### Aktionen pro Protokoll
- **Öffnen**: Klick auf das Protokoll öffnet den Editor
- **Duplizieren**: Kopie des Protokolls erstellen (Kopiersymbol)
- **Löschen**: Protokoll unwiderruflich löschen (Papierkorb-Symbol, mit Bestätigung)

### Suche und Filter
- Protokolle können nach Stichwort durchsucht werden
- Bei mehreren Besprechungsarten erscheint ein Filter zum Einschränken

### Import
Protokolle können als JSON-Datei importiert werden (für Datenmigration).

---

## Protokoll-Editor

Der Editor ist das Herzstück der App. Er besteht aus mehreren Abschnitten.

### Kopfzeile (Metadaten)
- **Projektname**: Wird automatisch aus dem Projekt übernommen, kann angepasst werden
- **Besprechungsart**: z.B. Baubesprechung, Team-Besprechung, Projektbesprechung, Jour Fixe (frei wählbar)
- **Datum**: Datum der Besprechung
- **Uhrzeit**: Beginn der Besprechung
- **Ort**: Besprechungsort
- **Nächste Besprechung**: Datum und Uhrzeit des Folgetreffen
- **Erstellt von**: Name des Protokollführers
- **Vorgänger-Protokoll**: Verknüpfung mit einem vorherigen Protokoll derselben Reihe (Protokollkette)

### Protokollnummer
Die Protokollnummer wird automatisch generiert, z.B. „2 - BB-MeinProjekt_29.04.2026". Sie setzt sich zusammen aus:
- Position in der Protokollkette (1, 2, 3, ...)
- Kürzel der Besprechungsart
- Projektname
- Datum

### Teilnehmerliste
- Teilnehmer können manuell eingegeben oder aus den Projektkontakten übernommen werden
- Pro Teilnehmer: Name, Firma, Funktion
- Anwesenheit kann mit einem Haken markiert werden (anwesend / entschuldigt / nicht erschienen)
- Die Liste kann gedruckt werden

### Tagesordnungs-Entwurf (Agenda)
- Vor der Besprechung kann eine Tagesordnung vorbereitet werden
- Punkte können hinzugefügt, bearbeitet und sortiert werden
- Die Agenda kann per E-Mail an die Teilnehmer verschickt werden (Button „Agenda senden")
- Beim Abschließen des Protokolls werden Agenda-Punkte automatisch als Protokollpunkte übernommen

### Protokollpunkte
Der Hauptbereich des Protokolls enthält die Protokollpunkte.

**Struktur eines Protokollpunkts:**
- **Nummer**: Automatische oder manuelle Nummerierung (hierarchisch: 1, 1.1, 1.1.1)
- **Thema**: Überschrift des Punkts
- **Besprechungsinhalt**: Freitext mit Formatierung (Fett, Kursiv, Unterstrichen, Listen)
- **Ergebnis**: Zusammenfassung des Beschlusses oder Ergebnisses
- **Status**: Offen oder Erledigt
- **Zuständig**: Name der verantwortlichen Person
- **Ebene**: Hauptpunkt (1), Unterpunkt (2), Unter-Unterpunkt (3)
- **Anhang**: Eine Datei kann pro Punkt angehängt werden (z.B. Pläne, Fotos, Dokumente)

**Aktionen bei Protokollpunkten:**
- Neue Punkte hinzufügen (am Ende oder zwischen bestehenden Punkten)
- Punkte per Drag & Drop verschieben
- Punkte löschen (mit Bestätigung)
- Status von „Offen" auf „Erledigt" setzen
- Anhänge hochladen und herunterladen

**Übernahme aus Vorgänger-Protokoll:**
Wenn ein Vorgänger-Protokoll verknüpft ist, werden beim Öffnen automatisch alle offenen Punkte aus dem Vorgänger übernommen (Carryover). Erledigte Punkte erscheinen grau und werden ebenfalls zur Dokumentation übernommen.

### Maßnahmen (Action Items)
Unterhalb der Protokollpunkte gibt es eine Maßnahmenliste.

**Felder einer Maßnahme:**
- **Nummer**: Automatisch vergeben
- **Beschreibung**: Was ist zu tun?
- **Verantwortlich**: Wer führt die Maßnahme aus?
- **Frist**: Bis wann?
- **Status**: Offen / In Arbeit / Erledigt / Verschoben
- **Priorität**: Hoch / Mittel / Niedrig
- **Bemerkungen**: Zusätzliche Hinweise

Maßnahmen können aus Vorgänger-Protokollen übernommen werden (offene Maßnahmen werden automatisch weitergezogen).

### Allgemeine Bemerkungen
Ein freier Textbereich am Ende des Protokolls für sonstige Notizen.

### Rich-Text Formatierung
In den Textfeldern (Besprechungsinhalt, Ergebnis, Bemerkungen) steht ein Texteditor zur Verfügung:
- **Fett** (Strg+B)
- **Kursiv** (Strg+I)
- **Unterstrichen** (Strg+U)
- **Durchgestrichen**
- **Aufzählungsliste**: Automatisch beim Tippen von „- " (Bindestrich + Leerzeichen)
- **Nummerierte Liste**: Automatisch beim Tippen von „1. "

---

## Protokoll abschließen

### Abschließen
Mit dem Button „Protokoll abschließen" wird das Protokoll gesperrt. Danach kann es nicht mehr bearbeitet werden. Beim Abschließen werden automatisch:
- Alle noch nicht verlinkten Agenda-Punkte als Protokollpunkte übernommen
- Das Protokoll als „Abgeschlossen" markiert (Schloss-Symbol in der Liste)

### Wieder öffnen
Ein abgeschlossenes Protokoll kann durch den Administrator wieder geöffnet werden.

---

## Protokollketten

### Was ist eine Protokollkette?
Protokolle derselben Besprechungsreihe (z.B. wöchentliche Baubesprechung) können als Kette verknüpft werden. Das neue Protokoll verweist dabei auf das vorherige als „Vorgänger".

### Vorteile der Protokollkette
- Automatische Nummerierung (1. Besprechung, 2. Besprechung, ...)
- Offene Punkte werden automatisch übernommen
- Das Gesamtprotokoll kann die gesamte Reihe anzeigen

### Gesamtprotokoll
Der Button „Gesamtprotokoll" (nur sichtbar wenn das Protokoll Teil einer Kette ist) öffnet eine Druckansicht der gesamten Protokollreihe – alle Besprechungen von Beginn an auf einen Blick.

---

## Drucken und Exportieren

### PDF-Druck
Der Button „Drucken" (Drucker-Symbol) öffnet den Browser-Druckdialog. Das Protokoll wird als A4-Seite formatiert mit:
- Kopfzeile mit Logo und Protokolldaten
- Teilnehmerliste
- Protokollpunkte
- Maßnahmen
- Seitennummern

### Word-Export
Der Button „Word" exportiert das Protokoll als .docx-Datei, die in Microsoft Word geöffnet werden kann.

### Gesamtprotokoll drucken
Über den Button „Gesamtprotokoll" kann die gesamte Protokollreihe als PDF gedruckt werden.

---

## Projektkontakte

### Was sind Projektkontakte?
Jedes Projekt kann eine Liste von Beteiligten haben: Auftraggeber, Planer, Fachplaner, Firmen etc.

### Kontakte verwalten
Der Button „Kontakte" in der Protokollliste öffnet die Kontaktverwaltung.

**Felder pro Kontakt:**
- Name
- Firma
- Gewerk (z.B. Tragwerksplanung, HLS, Elektro)
- Funktion (z.B. Bauleiter, Projektleiter)
- E-Mail
- Telefon

### Funktionen
- Kontakte hinzufügen, bearbeiten, löschen
- Sortierung nach Name, Firma oder Gewerk
- Drag & Drop zum manuellen Sortieren (wenn kein Sortierfeld aktiv)
- CSV-Export (für Excel, UTF-8 mit Semikolon-Trennung)
- CSV-Import (erkennt automatisch Semikolon oder Komma als Trennzeichen)

### Beteiligtenliste
Der Button „Beteiligte" in der Kontaktverwaltung öffnet eine druckbare und exportierbare Beteiligtenliste:
- Drucken als PDF
- Export als Word-Dokument (7 Spalten: Nr, Name, Firma, Gewerk, Funktion, E-Mail, Telefon)

### Kontakte im Protokoll nutzen
Beim Hinzufügen von Teilnehmern im Protokoll können Projektkontakte direkt ausgewählt werden.

---

## Maßnahmen-Dashboard

Das Dashboard zeigt alle offenen und laufenden Maßnahmen aus allen Projekten und Protokollen auf einen Blick.

**Ansicht:**
- Filterung nach Projekt, Protokoll, Status und Priorität
- Sortierung nach Frist, Priorität oder Status
- Klick auf eine Maßnahme öffnet das zugehörige Protokoll

---

## Server-Einstellungen (Admin)

Das Zahnrad-Symbol oben rechts öffnet die Server-Einstellungen. Diese sind in vier Tabs aufgeteilt.

### Tab: Benutzer (nur Admins)

**Nutzerverwaltung:**
- Alle Nutzer werden mit Name, Benutzername und Rolle (Admin / Nutzer) angezeigt
- Nutzer anlegen: Name, Benutzername, Rolle, Passwort festlegen
- Nutzer löschen (mit Bestätigung)
- Passwort eines Nutzers direkt zurücksetzen (Admin kann neues Passwort eingeben)

**Nutzer einladen:**
- E-Mail-Adresse hinterlegen (Stift-Symbol)
- Kontakt aus Projekten importieren (Personen-Symbol öffnet Auswahlliste)
- Einladungsmail senden (Pfeil-Symbol): Der Nutzer erhält eine E-Mail mit Zugangsdaten, Installationsanleitung und dem Komplizen-Logo

**Passwort-Rücksetzanfragen:**
- Wenn ein Nutzer über den Login-Bildschirm eine Rücksetzanfrage stellt, erscheint sie hier
- Admin kann das Passwort direkt setzen und die Anfrage schließen

**Nutzerliste exportieren:**
- PDF-Druck der Nutzerliste
- CSV-Export

### Tab: E-Mail
Zeigt den Status der SMTP-Konfiguration. Der E-Mail-Versand wird über Umgebungsvariablen beim Containerstart konfiguriert (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM). Der Button „Verbindung testen" prüft ob die SMTP-Verbindung funktioniert.

### Tab: Backup
- **Automatische Backups**: Beim Serverstart und alle 6 Stunden wird automatisch ein Backup erstellt
- **Backup erstellen**: Manuell ein Backup auf Knopfdruck erstellen
- **Backups herunterladen**: Alle vorhandenen Backups als .db-Datei herunterladen
- **Backup wiederherstellen**: Eine Backup-Datei hochladen und die Datenbank damit wiederherstellen

### Tab: Passwort
Eigenes Passwort ändern.

---

## Agenda per E-Mail versenden

Im Protokoll-Editor kann vor der Besprechung eine Tagesordnung per E-Mail an die Teilnehmer gesendet werden.

**Vorgehen:**
1. Tagesordnungs-Entwurf ausfüllen (Abschnitt „Tagesordnung")
2. Button „Agenda senden" klicken
3. Im Dialog: Empfänger auswählen (aus Teilnehmerliste oder Projektkontakten), Begrüßungstext anpassen
4. Senden

Die gesendete Agenda wird im Protokoll mit Datum gespeichert.

---

## Technische Hinweise

### Datenspeicherung
- Alle Protokolle, Projekte und Nutzer werden in einer SQLite-Datenbank auf dem Server gespeichert
- Anhänge (Bilder, PDFs etc.) werden separat gespeichert und über eine ID referenziert
- Favoriten und Benutzereinstellungen werden pro Nutzer auf dem Server gespeichert

### Backup
- Backups liegen im Verzeichnis /logs auf dem Server
- Das Format ist eine SQLite-.db-Datei mit Zeitstempel im Dateinamen
- Backups können im Admin-Panel heruntergeladen und wiederhergestellt werden

### Browser-Kompatibilität
- Empfohlen: Chrome oder Edge (aktuell)
- Firefox: funktioniert, PWA-Installation nicht unterstützt
- Safari: eingeschränkt, nicht empfohlen

### PWA (Progressive Web App)
Die App kann als Desktop-App installiert werden. Nach der Installation:
- Öffnet sich ohne Browser-Rahmen als eigenes Fenster
- Erscheint im Windows-Startmenü unter „Komplizen Protokolle"
- Hat das Komplizen-(K)-Logo als App-Icon
- Startet direkt auf der Anmeldung

---

## Typische Arbeitsabläufe

### Neues Projekt anlegen
1. Startseite → „Neues Projekt"
2. Projektname eingeben
3. Optional: Kontakte hinzufügen (Button „Kontakte")
4. Projekt als Favorit markieren (Stern) für schnellen Zugriff

### Besprechung protokollieren
1. Projekt öffnen → „Neues Protokoll"
2. Besprechungsart und Datum eintragen
3. Vorgänger-Protokoll verknüpfen (falls Reihe)
4. Teilnehmer hinzufügen und Anwesenheit markieren
5. Protokollpunkte erfassen
6. Maßnahmen eintragen
7. Protokoll abschließen

### Folgebesprechung
1. In der Protokollliste: „Neues Protokoll"
2. Als Vorgänger das letzte Protokoll auswählen
3. Offene Punkte werden automatisch übernommen
4. Neue Punkte hinzufügen
5. Übernahme-Punkte bei Bedarf abschließen

### Agenda vorbereiten und versenden
1. Protokoll öffnen (kann auch schon vor der Besprechung angelegt werden)
2. Im Abschnitt „Tagesordnung" die Punkte eintragen
3. „Agenda senden" klicken
4. Empfänger auswählen → Senden
5. In der Besprechung: Protokoll-Editor öffnen, Punkte ausfüllen
6. Beim Abschließen werden Agenda-Punkte automatisch als Protokollpunkte übernommen

---

## Häufige Fragen

**Kann ich ein abgeschlossenes Protokoll noch ändern?**
Nein, abgeschlossene Protokolle sind schreibgeschützt. Ein Administrator kann das Protokoll wieder öffnen.

**Was passiert mit Anhängen beim Löschen eines Protokollpunkts?**
Die Anhangsdatei wird ebenfalls gelöscht.

**Kann ich Protokolle von mehreren Projekten in einem Gesamtprotokoll sehen?**
Nein, das Gesamtprotokoll zeigt nur die Protokollkette eines Projekts.

**Wie viele Nutzer kann die App gleichzeitig verwenden?**
Es gibt keine technische Begrenzung. Die App ist für typische Bürogrößen (5–20 gleichzeitige Nutzer) ausgelegt.

**Was passiert wenn der Server neugestartet wird?**
Alle Daten bleiben erhalten (SQLite-Datei auf der Festplatte). Nach dem Neustart ist die App sofort wieder verfügbar.

**Kann ich die App von außerhalb des Büros nutzen?**
Nur wenn eine VPN-Verbindung zum Büronetzwerk besteht. Die App ist nicht über das Internet erreichbar.

**Wie sichere ich die Daten?**
Backups können im Admin-Panel manuell erstellt oder automatisch alle 6 Stunden gespeichert werden. Die Backup-Dateien können heruntergeladen und extern gesichert werden.

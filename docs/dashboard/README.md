# Büro-Audio im Komplizen-Dashboard

Stand 16.11.2026 · Grundlage: `DASHBOARD-ANTWORT-AUDIO.md` (Bestandsaufnahme im
Dashboard-Repo, mit Fundstellen).

| Datei | Zweck |
|---|---|
| `DASHBOARD-ANFRAGE-AUDIO.md` | Fragen an das Dashboard-Projekt |
| `DASHBOARD-ANTWORT-AUDIO.md` | Antwort daraus (Schema, Waben, Einbettung, Anmeldung, Einspielen) |
| `037_buero_audio.sql` | **fertige Migration für Stufe 1** |

---

## Stufe 1 – Kachel mit Link (jetzt)

1. `037_buero_audio.sql` nach
   `C:\Komplizen Software\komplizen-dashboard\migrations\` kopieren
   (Repo hat kein Remote – lokal committen).
2. Dashboard wie gewohnt deployen: `.\deploy-nas.ps1` im Dashboard-Ordner
   (kopiert `migrations/` auf die NAS).
3. Migration **von Hand** ausführen – Postgres führt den Ordner nur beim
   allerersten Anlegen der Datenbank aus:

   ```powershell
   ssh Deploy@192.168.178.250 "sudo /usr/local/bin/docker exec komplizen-dashboard-db psql -U dashboard -d dashboard -v ON_ERROR_STOP=1 -f /docker-entrypoint-initdb.d/037_buero_audio.sql"
   ```

4. Prüfen: Kachel „Büro-Audio" in der Rubrik Büro, Klick öffnet
   `https://192.168.178.250:18098/audio/` im neuen Tab, Sprechblase „Robin spielt im Büro".
   Auf dem Gelände setzt die Karte die Wabe selbst (Ringsuche neben der vollen
   Büro-Terrasse).

**Entscheidung in der Datei:** `fuer_alle: true` – alle sehen eine benutzbare
Kachel; wer steuern darf, regelt die Audio-App. Enger: `fuer_alle` entfernen und
Freigaben nach Muster `036_vgv_komplize.sql`.

---

## Stufe 2 – eingebettet (später, beides muss erledigt sein)

**Dashboard-Repo** (Auftrag dort):
- [ ] Modul: `embed_mode = 'iframe'`, `url = '/m/buero-audio'`,
      `meta.embed_src = 'https://192.168.178.250:18098/audio/'`
      (steht `url` auf der echten Adresse, verlässt der Gelände-Klick das Dashboard)
- [ ] `templates/embed.html:23`: `allow-forms` in den Sandkasten – sonst geht kein
      Formular, auch keine Anmeldung
- [ ] `allow="autoplay"` am iframe ergänzen (gibt es heute gar nicht)
- [ ] `templates/embed.html:13`: Rücklink zeigt fest „Planung" – nach Rubrik setzen

**Audio-App `kom-audio`** (Auftrag an Sven):
- [ ] Kein `X-Frame-Options: DENY`; stattdessen
      `Content-Security-Policy: frame-ancestors http://192.168.178.250:5050`
      (der VgV-Komplize auf 18096 sendet DENY – auf 18098 prüfen)
- [ ] Sitzungs-Cookie mit `SameSite=None; Secure`
- [ ] CA des Zertifikats auf Port 18098 auf **jedem** Arbeitsplatz vertraut –
      im iframe gibt es keine Warnseite zum Wegklicken, nur einen leeren Rahmen

---

## Nicht geplant

- **Statusanzeige über `/api/health`:** Das Dashboard hat dafür keinen
  Mechanismus. Wenn gewünscht, nach Vorbild „Knoten prüfen" (`/ki-farm`) –
  Prüfung auf Knopfdruck. Dafür müsste die CA ins Dashboard-Abbild
  (sonst `CERTIFICATE_VERIFY_FAILED`, gemessen am VgV-Komplizen).
- **Weitergabe der Anmeldung:** Das Dashboard reicht keine Identität an Module
  weiter; die Audio-App meldet selbst an.

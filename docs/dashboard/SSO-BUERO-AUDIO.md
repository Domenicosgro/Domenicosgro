# Anmeldung in Büro-Audio über das Dashboard (SSO)

> Auftrag an zwei Projekte, Stand 16.11.2026. Entscheidung Domenico:
> **Die Audio-App bleibt ein eigener Tab** (keine Einbettung). Wer im Dashboard
> angemeldet ist, soll in Büro-Audio **nicht noch einmal** nach dem Konto gefragt
> werden.
>
> - **Teil A** → Agent im Repo `komplizen-dashboard`
> - **Teil B** → Sven / Codex im Repo `kom-audio`
> - **Der Vertrag (§1) gilt für beide und wird nur gemeinsam geändert.**
>
> Vor dem Bauen: Bestand prüfen und Abweichungen zurückmelden, nicht raten.

---

## 0. Ablauf

```
1. Klick auf Kachel „Büro-Audio"  →  neuer Tab: http://192.168.178.250:5050/sso/buero-audio
2. Dashboard: angemeldet? Freigabe für buero-audio?        (sonst Anmeldung bzw. 403)
3. Dashboard erzeugt Einmal-Token (60 s gültig, signiert)  →  302 Weiterleitung
4. https://192.168.178.250:18098/audio/sso?t=<token>
5. Audio prüft Signatur, Ablauf, Zielgruppe, Einmaligkeit  →  eigene Sitzung  →  302 /audio/
```

Warum so: Im eigenen Tab gibt es keine Probleme mit Cookies über zwei Adressen,
Sandkasten oder Zertifikat im Rahmen. Beide Anwendungen behalten ihre Sitzungen;
das Dashboard bürgt nur einmal beim Übergang.

---

## 1. Vertrag (für beide verbindlich)

**Gemeinsames Geheimnis:** Umgebungsvariable `AUDIO_SSO_SECRET` in beiden
Containern, mindestens 32 zufällige Bytes. **Nur** in der jeweiligen
`docker-compose.yml`/`.env` auf der NAS, nie im Repo, nie im Chat. Erzeugen:

```powershell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])
```

**Token:** `<payload>.<signatur>`

- `payload` = base64url (ohne `=`) eines UTF-8-JSON:

  ```json
  {"aud":"buero-audio","sub":"ds","name":"Domenico S.","iat":1763300000,"exp":1763300060,"nonce":"<22 Zeichen zufällig>"}
  ```

- `signatur` = base64url (ohne `=`) von `HMAC-SHA256(AUDIO_SSO_SECRET, payload)` –
  signiert wird die **base64url-Zeichenkette** des Payloads, nicht das JSON.

| Feld | Regel |
|---|---|
| `aud` | immer `"buero-audio"` – Audio lehnt alles andere ab |
| `sub` | Anmeldename **ohne Domäne, kleingeschrieben** (`ds`, nicht `GEHBAUER\ds`) |
| `name` | Anzeigename, nur zur Anzeige |
| `iat`, `exp` | Unix-Sekunden; `exp = iat + 60` |
| `nonce` | zufällig; Audio akzeptiert jede Nonce **nur einmal** |

**Übergabe:** `GET https://192.168.178.250:18098/audio/sso?t=<token>`

**Prüfung in Audio, in dieser Reihenfolge:** Format → Signatur (zeitkonstanter
Vergleich) → `aud` → `exp` (Toleranz 30 s) → Nonce unbenutzt → Benutzer.
Jeder Fehlschlag: **gleiche** neutrale Fehlerseite mit Link zur normalen
Anmeldung, Grund nur ins Log.

---

## Teil A – Dashboard (`komplizen-dashboard`)

1. **Neue Route `GET /sso/buero-audio`** (Flask):
   - nicht angemeldet → zur Dashboard-Anmeldung, danach zurück hierher
   - Zugriff auf Modul `buero-audio` nach der normalen Auflösung
     (`app/auth.py`, deny → fuer_alle → Admin → allow → min_role) – ohne Zugriff 403
   - Token nach §1 bauen, `302` auf `…/audio/sso?t=…`
   - Antwort mit `Cache-Control: no-store` und `Referrer-Policy: no-referrer`
2. **`AUDIO_SSO_SECRET`** in `docker-compose.nas.yml` als Variable ergänzen
   (Wert nur auf der NAS); fehlt sie, liefert die Route 503 mit klarer Meldung.
3. **Zieladresse** konfigurierbar: `AUDIO_URL` (Vorgabe
   `https://192.168.178.250:18098/audio/`).
4. **Migration `038_buero_audio_sso.sql`** (nach Hausregel mit `BEGIN`/Schloss/`COMMIT`):
   `url = '/sso/buero-audio'`, `embed_mode` bleibt `'link'`.
   Prüfen, dass `shell.html` und `gelaende.js` relative URLs bei `link` korrekt
   im neuen Tab öffnen.
5. **Prüfung** in `pruefungen/`: Token-Aufbau gegen den Vertrag (feste Testwerte,
   erwartete Signatur), 403 ohne Freigabe, 503 ohne Geheimnis.
6. **Klären und zurückmelden:** Wie liegt der Anmeldename nach dem AD-Login vor
   (`ds`, `GEHBAUER\ds`, `ds@…`)? Normalisierung so, dass `sub` dem Vertrag entspricht.

## Teil B – Audio (`kom-audio`)

1. **Neue Route `GET /audio/sso`**: Prüfung nach §1, danach dieselbe Sitzung
   anlegen wie nach einer normalen Anmeldung, `302` auf `/audio/`.
2. **Nonce-Speicher**: benutzte Nonces bis `exp + 30 s` merken (Speicher genügt;
   nach Neustart sind alte Tokens ohnehin abgelaufen).
3. **Benutzer**: `sub` auf die bestehende Benutzerzuordnung abbilden
   (Einrichter `sb`, `ds` …). **Klären:** Was darf ein angemeldeter Benutzer, der
   in Audio noch nicht bekannt ist – nur hören/bedienen, oder abweisen?
4. **Die bisherige Anmeldung bleibt** als Notzugang (Dashboard aus, Geheimnis falsch).
5. **`AUDIO_SSO_SECRET`** in der Audio-`docker-compose.yml`/`.env`; fehlt es,
   ist `/audio/sso` abgeschaltet (404), die normale Anmeldung geht weiter.
6. **Prüfung**: gültiges Token → Sitzung; falsche Signatur, falsches `aud`,
   abgelaufen, zweimal dieselbe Nonce → jeweils abgewiesen.
7. **Zertifikat:** Im eigenen Tab kann der Browser eine Warnung zeigen; sauber
   ist es erst, wenn die CA auf den Arbeitsplätzen vertraut ist (wie bisher).

---

## 2. Reihenfolge

1. Migration `037` (Kachel mit Link) kann **jetzt** eingespielt werden.
2. Teil B bauen und auf der NAS einspielen (Route ist ohne Geheimnis aus – stört nichts).
3. Teil A bauen und einspielen.
4. Gemeinsames Geheimnis erzeugen, in **beide** Container eintragen,
   **Container löschen und neu erstellen** (Starten allein übernimmt keine Variablen).
5. Migration `038` ausführen → Kachel geht über `/sso/buero-audio`.
6. Test: im Dashboard angemeldet → Kachel → Audio ohne Anmeldemaske.

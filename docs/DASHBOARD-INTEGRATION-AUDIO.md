# Büro-Audio im Komplizen-Dashboard

> Entwurf, 16.11.2026. Gleiches Muster wie die Personalplanung
> (`docs/DASHBOARD-INTEGRATION-PERSONALPLANUNG.md`): Das Dashboard hostet die
> Anwendung nicht, es bekommt **eine Registry-Zeile**. Die Audio-App bleibt, wo sie
> läuft: `https://192.168.178.250:18098/audio/` (Code: `kom-audio`, NAS).

---

## 1. Stufe 1 – Kachel mit Link (sofort möglich, keine Änderung an der Audio-App)

Migration im Dashboard-Repo, z. B. `migrations/0xx_buero_audio.sql`:

```sql
-- KOMPLIZEN Büro-Audio als verlinktes Modul
INSERT INTO core_modules (key, rubrik, title, description, status, embed_mode,
                          url, sort_order, min_role, active, meta)
VALUES (
  'buero-audio', 'buero', 'Büro-Audio',
  'Lautsprecher im Büro: Radio, Lautstärke, später Spotify und Raumgruppen.',
  'ok', 'link', 'https://192.168.178.250:18098/audio/', 40, NULL, true,
  '{"hex": {"q": 1, "r": 2},
    "agent_says": ["Robin spielt im Büro", "Klick: Audio öffnen"]}'::jsonb
)
ON CONFLICT (key) DO UPDATE SET
  title = EXCLUDED.title, description = EXCLUDED.description,
  status = EXCLUDED.status, embed_mode = EXCLUDED.embed_mode,
  url = EXCLUDED.url, active = EXCLUDED.active, meta = EXCLUDED.meta;
```

**Vor dem Einspielen prüfen:** `rubrik`, `sort_order` und die Wabe `hex` frei
wählen – sie dürfen nicht mit bestehenden Modulen kollidieren.

---

## 2. Stufe 2 – eingebettet (iframe), wenn die Audio-App dafür vorbereitet ist

`embed_mode = 'iframe'`, `url = '/m/buero-audio'`,
`meta.embed_src = 'https://192.168.178.250:18098/audio/'`.

Damit das funktioniert, muss die **Audio-App** Folgendes erfüllen (Aufgabe im
Repo `kom-audio`):

| Punkt | Warum |
|---|---|
| Einbettung erlauben: `Content-Security-Policy: frame-ancestors 'self' http://192.168.178.250:5050` (und kein `X-Frame-Options: DENY`) | sonst bleibt das iframe leer |
| Zertifikat auf 18098, dem der Browser vertraut | ein selbst signiertes Zertifikat lässt sich im iframe nicht bestätigen – die Seite bleibt leer |
| Anmeldung im iframe | Dashboard (`http`) und Audio (`https`) gelten für den Browser als verschiedene Sites → Sitzungs-Cookies brauchen `SameSite=None; Secure`, sonst Anmeldeschleife |
| `GET /api/health` | Statusanzeige der Kachel (Dashboard-Prinzip) |

Alternative, die alle drei Probleme löst: Audio-App und Dashboard **hinter
denselben Reverse Proxy** unter dieselbe Adresse (z. B. `…/audio/` neben dem
Dashboard) – dann ist es eine Site, ein Zertifikat, keine Cookie-Sonderregeln.

---

## 3. Offen

| Frage | Wer |
|---|---|
| Liegt das Dashboard-Repo auf GitHub oder auf der NAS? Wer spielt die Migration ein? | Sven / Domenico |
| Welche `rubrik` und welche Wabe? | Domenico |
| Hat die Audio-App schon `/api/health`, und lässt sie Einbettung zu? | Sven |
| Welches Zertifikat nutzt Port 18098? | Sven |

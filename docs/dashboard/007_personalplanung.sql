-- ---------------------------------------------------------------------------
-- Registry-Eintraege fuer die Personalplanung des Protokolltools
--
-- Gehoert ins Dashboard-Repo als migrations/007_personalplanung.sql.
-- Idempotent (ON CONFLICT ... DO UPDATE), darf mehrfach laufen.
--
-- VOR dem Einspielen: TOKEN_HIER ersetzen. Das Token ist der veroeffentlichte
-- Team-Link der Personalplanung (dort "Veroeffentlichen" -> Link kopieren, der
-- Teil hinter /plan/ ist das Token). Widerruf im Tool macht auch die
-- Einbettung sofort ungueltig.
--
-- Einspielen (NAS, per SSH, laufende Datenbank):
--   docker compose exec -T db psql -U dashboard -d dashboard \
--     < migrations/007_personalplanung.sql
-- ---------------------------------------------------------------------------

-- 1) Arbeiten: eigenstaendige Oberflaeche, oeffnet in neuem Tab (Weg A).
--    Anmeldung uebernimmt das Protokolltool (DSM), Zugriff nur fuer Admins.
INSERT INTO core_modules (key, rubrik, title, description, status, embed_mode,
                          url, sort_order, min_role, active, meta)
VALUES (
  'personalplanung',
  'buero',
  'Personalplanung',
  'Wochenplanung des Bueros: Mitarbeitende, Projektteams, Auslastung.',
  'ok',
  'link',
  'http://192.168.178.250:3000/personalplanung',
  30,
  NULL,
  true,
  '{"hex": {"q": 0, "r": 2},
    "agent_says": ["Wochenraster je Mitarbeiter",
                   "Auslastung und Projektteams",
                   "Klick: oeffnet im neuen Tab"]}'::jsonb
)
ON CONFLICT (key) DO UPDATE SET
  rubrik      = EXCLUDED.rubrik,
  title       = EXCLUDED.title,
  description = EXCLUDED.description,
  status      = EXCLUDED.status,
  embed_mode  = EXCLUDED.embed_mode,
  url         = EXCLUDED.url,
  sort_order  = EXCLUDED.sort_order,
  active      = EXCLUDED.active,
  meta        = EXCLUDED.meta;

-- 2) Schauen: Gelaende-Ansicht der Planung, eingebettet (Weg B).
--    Login-frei ueber das Team-Link-Token, nur lesend.
--    Voraussetzung im Protokolltool: EMBED_FRAME_ANCESTORS nennt das Dashboard
--    (docker-compose.yml), sonst bleibt das iframe leer.
INSERT INTO core_modules (key, rubrik, title, description, status, embed_mode,
                          url, sort_order, min_role, active, meta)
VALUES (
  'personalplanung-gelaende',
  'buero',
  'Personalplanung · Gelände',
  'Wer steht diese Woche auf welchem Projekt - als begehbare Plattform.',
  'ok',
  'iframe',
  '/m/personalplanung-gelaende',
  31,
  NULL,
  true,
  '{"embed_src": "http://192.168.178.250:3000/gelaende?token=TOKEN_HIER",
    "hex": {"q": 1, "r": 2},
    "agent_says": ["Figuren sind Mitarbeitende",
                   "Wochenregler unten links",
                   "Rohbau mit Kran = in Bearbeitung"]}'::jsonb
)
ON CONFLICT (key) DO UPDATE SET
  rubrik      = EXCLUDED.rubrik,
  title       = EXCLUDED.title,
  description = EXCLUDED.description,
  status      = EXCLUDED.status,
  embed_mode  = EXCLUDED.embed_mode,
  url         = EXCLUDED.url,
  sort_order  = EXCLUDED.sort_order,
  active      = EXCLUDED.active,
  meta        = EXCLUDED.meta;

-- Kontrolle:
--   SELECT key, embed_mode, url, meta->>'embed_src' FROM core_modules
--   WHERE key LIKE 'personalplanung%';

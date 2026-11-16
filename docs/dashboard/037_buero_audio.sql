-- 037_buero_audio.sql
-- KOMPLIZEN Büro-Audio als externes Modul (Stufe 1: Kachel öffnet die App im neuen Tab).
-- Grundlage: DASHBOARD-ANTWORT-AUDIO.md (16.11.2026), Vorlagen 015_planserver.sql / 035 / 036.
--
-- Bewusst so:
--   status 'ext'        Hauskonvention für eigenständige Dienste per Link; agent_says bleibt sichtbar
--   sort_order 60       40 ist belegt (buero-formulare); frei waren 15, 60, 70
--   kein meta.hex       Büro-Terrasse ist voll, eine fremde Zelle würde still verworfen
--   fuer_alle true      Kachel für alle benutzbar. Wer die Lautsprecher wirklich steuern darf,
--                       entscheidet die Audio-App selbst (eigene Anmeldung mit dem Domänenkonto).
--                       Soll es enger sein: fuer_alle entfernen und Freigaben nach Muster 036 anlegen.
--   meta per ||         ergänzt statt überschreibt (Muster 015)

BEGIN;

SELECT pg_advisory_xact_lock(8112037);

INSERT INTO core_modules (key, rubrik, title, description, status, embed_mode,
                          url, sort_order, min_role, active, meta)
VALUES (
  'buero-audio', 'buero', 'Büro-Audio',
  'Lautsprecher im Büro: Radio, Lautstärke, später Spotify und Raumgruppen.',
  'ext', 'link', 'https://192.168.178.250:18098/audio/', 60, NULL, true,
  '{"fuer_alle": true,
    "agent_says": ["Robin spielt im Büro", "Klick: Audio öffnen"]}'::jsonb
)
ON CONFLICT (key) DO UPDATE SET
  rubrik      = EXCLUDED.rubrik,
  title       = EXCLUDED.title,
  description = EXCLUDED.description,
  status      = EXCLUDED.status,
  embed_mode  = EXCLUDED.embed_mode,
  url         = EXCLUDED.url,
  sort_order  = EXCLUDED.sort_order,
  meta        = COALESCE(core_modules.meta, '{}'::jsonb) || EXCLUDED.meta,
  active      = TRUE;

COMMIT;

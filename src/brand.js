/**
 * Name und Kürzel des Betreibers für die Oberfläche.
 *
 * Im Server-Betrieb speist der Server diese Werte beim Ausliefern der Seite
 * als `window.__BRAND__` ein (siehe server/betreiber.js und sendHtml). Läuft
 * die Anwendung ohne Server — lokal im Browser oder als Electron-App —, gibt
 * es kein `window.__BRAND__`; dann greifen die Vorgaben hier.
 *
 * Die Vorgaben sind die von Komplizen, damit sich am laufenden Betrieb
 * nichts ändert. Ein anderes Büro setzt die Umgebungsvariablen am Server und
 * muss keine Datei anfassen.
 */

const vomServer = (typeof window !== 'undefined' && window.__BRAND__) || {}

const wert = (key, vorgabe) => {
  const v = vomServer[key]
  return typeof v === 'string' && v.trim() ? v.trim() : vorgabe
}

export const brand = {
  // Name der Anwendung – Anmeldeseite, Kopfzeile, Dokument-Eigenschaften
  appName:  wert('appName',  'Komplizen Protokolle'),
  appShort: wert('appShort', 'Komplizen'),
  // Kürzel des Betreibers – Grußzeile unter E-Mails, die der Browser öffnet
  name:     wert('name',     'KOMPLIZEN'),
  nameLong: wert('nameLong', 'Komplizen Industrieplanung und Architektur'),
  // Die eigenständigen Oberflächen neben dem Protokolltool
  appNameStaff: wert('appNameStaff', 'Komplizen Mitarbeiter'),
  appNameCheck: wert('appNameCheck', 'Komplizen Prüfstation'),
  appNameSite:  wert('appNameSite',  'Komplizen Baustelle'),
}

export default brand

/**
 * Betreiberangaben – alles, was beim Wechsel auf ein anderes Büro anders ist.
 *
 * Der Name des Betreibers stand einmal an rund fünfzig Stellen im Code: in
 * jeder System-E-Mail, in jeder Systemseite, im Fenstertitel, auf der
 * Anmeldeseite. Wer die Anwendung weitergibt, müsste sie alle suchen.
 * Deshalb stehen sie jetzt hier und kommen aus Umgebungsvariablen.
 *
 * Wie gut das taugt, hat sich im November 2026 gezeigt: aus GHBA wurde
 * Komplizen, auch offiziell. Zu ändern waren zwei Vorgaben in dieser Datei
 * und zwei in src/brand.js – nicht fünfzig Stellen im Code.
 *
 * Die Voreinstellungen sind die von Komplizen. Ein anderes Büro trägt seine
 * Werte in die docker-compose.yml ein und muss keine Datei anfassen.
 *
 * Gesetzt wird das in der Umgebung des Containers:
 *   APP_NAME            Name der Anwendung       (Standard: Komplizen Protokolle)
 *   APP_SHORT           Kurzname für Ableitungen (Standard: Komplizen)
 *   APP_NAME_STAFF      Name der Mitarbeiter-App (Standard: <APP_SHORT> Mitarbeiter)
 *   APP_NAME_CHECK      Name der Prüfstation     (Standard: <APP_SHORT> Prüfstation)
 *   BRAND_NAME          Kürzel des Betreibers    (Standard: KOMPLIZEN)
 *   BRAND_LONG          Vollständiger Name       (Standard: Komplizen Industrieplanung …)
 *   OFFICE_NAME         Büroname für den Assistenten (Standard: Komplizen Industrie…)
 *   BRAND_LOGO          Logodatei in dist/       (Standard: Logo_Komplizen_sky1.png)
 *   BRAND_COLOR_DARK    Kopfband der E-Mails     (Standard: #000040)
 *   BRAND_COLOR_ACCENT  Schrift auf dem Kopfband (Standard: #8FBEFF)
 *   BRAND_COLOR_LIGHT   Überschrift im Kopfband  (Standard: #FBFFE6)
 *   BRAND_COLOR_PAGE    Seitenhintergrund        (Standard: #F0F0F0)
 */

'use strict'

const env = (key, fallback) => {
  const v = process.env[key]
  return v && String(v).trim() ? String(v).trim() : fallback
}

const brand = {
  // Name der Anwendung – Fenstertitel, Anmeldeseite, Kopfzeile, Verknüpfung
  appName:  env('APP_NAME',  'Komplizen Protokolle'),
  appShort: env('APP_SHORT', 'Komplizen'),

  // Kürzel des Betreibers – Kopfband und Fußzeile der System-E-Mails
  name:     env('BRAND_NAME', 'KOMPLIZEN'),
  nameLong: env('BRAND_LONG', 'Komplizen Industrieplanung und Architektur'),

  // Wie der Assistent das Büro nennt, für das er arbeitet. Kann vom Kürzel
  // abweichen, wenn Gesellschaft und Marke verschiedene Namen tragen – bei
  // Komplizen ist das seit der Umbenennung dasselbe.
  officeName: env('OFFICE_NAME', 'Komplizen Industrieplanung und Architektur'),

  // Logo der System-E-Mails. Die Datei liegt im ausgelieferten dist/-Verzeichnis;
  // fehlt sie, setzen die Mails statt des Bildes das Kürzel als Überschrift.
  logoFile: env('BRAND_LOGO', 'Logo_Komplizen_sky1.png'),

  // Farben der System-E-Mails und der Systemseiten (Freimeldung, Freigaben).
  // Die Oberfläche selbst nimmt ihre Farben aus Tailwind – das hier gilt für
  // alles, was den Browser als fertiges HTML per Mail verlässt.
  colors: {
    dark:   env('BRAND_COLOR_DARK',   '#000040'),
    accent: env('BRAND_COLOR_ACCENT', '#8FBEFF'),
    light:  env('BRAND_COLOR_LIGHT',  '#FBFFE6'),
    page:   env('BRAND_COLOR_PAGE',   '#F0F0F0'),
  },
}

// Die Nebenanwendungen heißen wie der Kurzname, sofern nichts anderes gesetzt ist
brand.appNameStaff = env('APP_NAME_STAFF', `${brand.appShort} Mitarbeiter`)
brand.appNameCheck = env('APP_NAME_CHECK', `${brand.appShort} Prüfstation`)
brand.appNameSite  = env('APP_NAME_SITE',  `${brand.appShort} Baustelle`)

// Absender der letzten Instanz. Im Betrieb greift immer SMTP_FROM oder
// GRAPH_SENDER – das hier fängt nur den Fall ab, dass keine der beiden
// gesetzt ist. Aus dem Kürzel wird eine zulässige Adresse gebaut: nur
// Buchstaben und Zahlen, klein geschrieben (KOMPLIZEN wird noreply@komplizen).
const kuerzelFuerMail = brand.name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'protokolltool'
brand.mailFrom = env('MAIL_FALLBACK_FROM', `noreply@${kuerzelFuerMail}`)

// Was der Browser bekommt: in die ausgelieferte Seite als window.__BRAND__
// eingespeist. Farben sind nicht dabei – die Oberfläche hat ihre eigenen.
brand.forClient = () => ({
  appName:      brand.appName,
  appShort:     brand.appShort,
  name:         brand.name,
  nameLong:     brand.nameLong,
  appNameStaff: brand.appNameStaff,
  appNameCheck: brand.appNameCheck,
  appNameSite:  brand.appNameSite,
})

module.exports = brand

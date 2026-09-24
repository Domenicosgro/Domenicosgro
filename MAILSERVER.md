# Mailversand über `Protokoll@ghbarchitekten.de`

Wie das Protokolltool an das Postfach angebunden ist – und wie ein **zweiter
Server (Planserver auf der Synology)** denselben Absender für System-E-Mails
(Passwortzuweisung, Einladungen, Benachrichtigungen) nutzen kann.

Stand: 2026-09-24

---

## 1. Warum Microsoft Graph und nicht SMTP

Bei aktiven Microsoft-365-Sicherheitsstandards ist **Basic-Auth-SMTP gesperrt**
(MFA erzwungen, App-Kennwörter nicht verfügbar). Ein Dienst kann sich also nicht
mehr mit Benutzername und Passwort am Postfach anmelden.

Der Weg ist stattdessen der **OAuth2-Client-Credentials-Flow gegen Microsoft
Graph**: Eine in Entra registrierte Anwendung holt sich mit Client-ID und
Client-Secret ein Token und sendet damit **im Namen eines festen Postfachs** –
ohne Passwort, ohne MFA, ohne Benutzerinteraktion.

Der SMTP-Weg ist im Code weiterhin vorhanden (`SMTP_HOST` …) und greift nur,
wenn keine `GRAPH_*`-Variablen gesetzt sind. Er ist als Rückfallebene gedacht,
funktioniert mit den Sicherheitsstandards aber **nicht**.

Umgesetzt in `server/mailer.js`.

---

## 2. Bestehende Einrichtung (Protokolltool)

| Element | Wert |
|---|---|
| Absender-Postfach | `Protokoll@ghbarchitekten.de` |
| Verfahren | Graph, Client Credentials (Anwendung, kein Benutzer) |
| Anwendungsberechtigungen | `Mail.Send`, `Mail.ReadWrite` |
| Konfiguration | Umgebungsvariablen im Container (`docker-compose.yml` auf der NAS) |

### Umgebungsvariablen

```yaml
GRAPH_TENANT_ID:     "…"   # Verzeichnis-(Mandanten-)ID aus Entra
GRAPH_CLIENT_ID:     "…"   # Anwendungs-(Client-)ID der registrierten App
GRAPH_CLIENT_SECRET: "…"   # Geheimer Clientschlüssel – der WERT, nicht die ID
GRAPH_SENDER:        "Protokoll@ghbarchitekten.de"
```

`GRAPH_CLIENT_SECRET` gehört **nicht ins Git**. Auf der NAS liegt es in der
`docker-compose.yml` bzw. `.env.local`, die vom Deploy nicht überschrieben wird.

### Warum zwei Berechtigungen

- **`Mail.Send`** – der normale Versand über `sendMail`. Deckt alles ab, solange
  die Anhänge zusammen **unter 3 MB** bleiben.
- **`Mail.ReadWrite`** – Microsoft begrenzt direkt eingebettete Anhänge auf rund
  3 MB. Größere Dateien (Baudokumentation mit Fotos, Protokolle mit Bildanlagen)
  gehen deshalb über **Entwurf anlegen → Upload-Session in Blöcken → Entwurf
  senden**. Dieser Weg läuft über die Postfach-API und verlangt `Mail.ReadWrite`.

Fehlt die zweite Berechtigung, antwortet Graph bei großen Anhängen mit
**403 „Access is denied"**. Die App nennt in dem Fall im Fehlertext die
Anhangsgröße, die Grenze und die fehlende Berechtigung.

---

## 3. Zweiten Server anbinden (Planserver)

Ziel: Der Planserver verschickt System-E-Mails **mit demselben Absender**
`Protokoll@ghbarchitekten.de`.

### Empfehlung: eigene App-Registrierung, gleiches Postfach

Nicht das Secret des Protokolltools weiterreichen, sondern eine zweite
Registrierung anlegen. Gründe:

- Das Secret lässt sich **einzeln widerrufen**, ohne den Protokollversand zu
  unterbrechen.
- Im Audit-Log ist erkennbar, **welche Anwendung** gesendet hat.
- Die Berechtigungen können knapper ausfallen (siehe unten).

### Schritte in Entra (einmalig, Administrator)

1. **App-Registrierung** anlegen, z. B. Name „Planserver".
2. Unter *Zertifikate & Geheimnisse* einen **Clientschlüssel** erzeugen,
   Gültigkeit notieren (läuft ab – Erinnerung setzen).
3. Unter *API-Berechtigungen* → Microsoft Graph → **Anwendungsberechtigungen**
   (nicht „Delegiert"):
   - `Mail.Send` – reicht für System-E-Mails ohne große Anhänge.
   - `Mail.ReadWrite` **nur**, falls der Planserver Pläne oder andere Dateien
     über 3 MB versenden soll.
4. **Administratorzustimmung erteilen.** Ohne diesen Schritt bleibt jeder Aufruf
   bei 403.
5. Tenant-ID, Client-ID und Secret in die Umgebungsvariablen des
   Planserver-Containers eintragen, `GRAPH_SENDER` auf
   `Protokoll@ghbarchitekten.de` setzen.

Die Berechtigung greift beim nächsten Token; in der Praxis sofort, spätestens
nach einer Stunde.

---

## 4. Zugriff auf das eine Postfach begrenzen

**Wichtig, unabhängig von der Anzahl der Anwendungen:** Eine App mit der
Anwendungsberechtigung `Mail.Send` darf im Standard im Namen **jedes Postfachs
im Tenant** senden – nicht nur aus `Protokoll@`.

Einschränken über eine **ApplicationAccessPolicy** in Exchange Online
(PowerShell, je App-Registrierung):

```powershell
Connect-ExchangeOnline

New-ApplicationAccessPolicy `
  -AppId <Client-ID der App> `
  -PolicyScopeGroupId Protokoll@ghbarchitekten.de `
  -AccessRight RestrictAccess `
  -Description "Nur Versand aus dem Protokoll-Postfach"

# Prüfen
Test-ApplicationAccessPolicy -Identity Protokoll@ghbarchitekten.de -AppId <Client-ID>
```

Nach dem Setzen kann die Anwendung ausschließlich aus dem benannten Postfach
senden. Sinnvoll für **beide** Registrierungen (Protokolltool und Planserver).

---

## 5. Prüfen und Fehler einordnen

### Prüfen

- `GET /api/admin/smtp-status` – meldet, ob ein Versandweg konfiguriert ist,
  welcher (`graph` / `smtp`) und welcher Absender hinterlegt ist.
- `POST /api/admin/smtp-test` – holt bei Graph ein Token (prüft also Tenant-ID,
  Client-ID und Secret) bzw. verifiziert bei SMTP die Verbindung.

Beides nur für Administratoren.

### Typische Fehlerbilder

| Meldung | Ursache | Abhilfe |
|---|---|---|
| `Graph-Token fehlgeschlagen (401)` | Client-ID oder Secret falsch, Secret abgelaufen | Secret in Entra prüfen / neu erzeugen |
| `Graph-Versand fehlgeschlagen (403): Access is denied` bei großen Anhängen | `Mail.ReadWrite` fehlt | Berechtigung ergänzen + Admin-Zustimmung |
| `403` bei allen Mails | Admin-Zustimmung fehlt, oder ApplicationAccessPolicy schließt das Postfach aus | Zustimmung erteilen; Policy mit `Test-ApplicationAccessPolicy` prüfen |
| `E-Mail-Versand nicht konfiguriert` | keine `GRAPH_*`- und keine `SMTP_HOST`-Variable gesetzt | Umgebungsvariablen nachtragen, Container neu erstellen |

---

## 6. Was zu beachten bleibt

- **Secret-Ablauf**: Clientschlüssel haben ein Ablaufdatum. Läuft es ab, bricht
  der Versand ohne Vorwarnung mit 401 ab. Ablaufdatum je Registrierung notieren.
- **Ein Postfach, mehrere Absender**: Alle Anwendungen senden als
  `Protokoll@ghbarchitekten.de`. Der Anzeigename lässt sich je Nachricht setzen,
  die Adresse bleibt das authentifizierte Postfach.
- **Antworten**: Das Protokolltool setzt `Reply-To` auf die Adresse des
  angemeldeten Benutzers. Für den Planserver ist das bei System-E-Mails meist
  nicht gewünscht – dort besser eine betreute Adresse oder gar kein `Reply-To`.
- **Postfachgrenzen der Empfänger**: Graph nimmt Anhänge bis 150 MB an, viele
  Empfängerpostfächer aber nur 10–25 MB. Das Protokolltool verkleinert Fotos
  für den Versand automatisch.

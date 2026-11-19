# Feature-Konzept: Fotos von der Baustelle in die Baudokumentation

**Stand:** 19. November 2026 · nichts davon ist gebaut

> **Entschieden am 19.11.2026:** Die Fotos machen unsere eigenen Bauleiter.
> Damit gilt **Weg A** (Abschnitt 4): VPN auf die Diensthandys, kein
> Entwicklungsaufwand für die Erreichbarkeit. Zu bauen ist Abschnitt 5 —
> die Ablage im Projektordner. Weg B und C sind damit zurückgestellt;
> sie stehen hier nur, falls später doch Fremdfirmen liefern sollen.

---

## 1. Was gefragt ist

Zwei Dinge, die zusammenhängen:

1. Fotos, die **nicht am Bürorechner entstehen**, sollen einem Tagesbericht der
   Baudokumentation zugewiesen werden können — am besten über eine eigene
   Anwendung auf dem Handy.
2. Durch diese Zuweisung sollen die Bilder **auf dem G-Laufwerk im Projektordner
   landen**, in Originalauflösung.

Der zweite Punkt ist der kleinere. Der erste entscheidet sich nicht an der
Oberfläche, sondern an einer Frage, die bisher offen ist: **wie das Tool von der
Baustelle aus erreichbar sein soll.**

---

## 2. Was heute schon da ist

Mehr als man denkt. Nichts davon muss neu gebaut werden.

| Baustein | Stand | Fundort |
|---|---|---|
| Fotos im Tagesbericht | Aufnehmen oder Datei wählen, eigene Bildunterschrift, nummerierter Fotoanhang im Ausdruck und im PDF | `BautagebuchView.jsx`, `photoUtils.js` |
| Verkleinerung | Im Browser auf 1200 px / ~120 KB, damit ein PDF mit 25 Fotos unter der 3-MB-Grenze des Mailversands bleibt | `photoUtils.js` |
| Ablage der Fotos | Anhang-Ordner des Containers (`data/attachments/`), **nicht** auf dem G-Laufwerk | `server/attachments.js` |
| Schreibzugriff auf die NAS | Fertig und produktiv: Ordner anlegen, Datei hochladen, Namen bereinigen, freien Namen finden. Die Prüfstation benutzt das täglich | `server/fileStation.js`, `server/pruefstation.js` |
| Projektordner je Projekt | `project.fsPath`, in der Dateiablage hinterlegbar | `DateiablageView.jsx` |
| Dateiablage im Tool | Liest nur — Auflisten und Herunterladen | `server/index.js:1911 ff.` |
| Weg für Externe ohne Konto | Vorhanden: Freimeldung über Token-Link, Fremdfirmen hängen dort schon heute Dateien an | `release_tokens`, `server/index.js:3086 ff.` |
| PWA aufs Handy | Manifest, Service Worker, QR-Installationsdialog — die App lässt sich als eigene Anwendung auf den Home-Bildschirm legen | `public/manifest.json`, `QrInstallModal.jsx` |
| Mail-Empfang | **Nicht vorhanden.** Versand über Microsoft Graph ja, Abruf nein | `server/mailer.js` |

Die Handy-Anwendung, die du dir wünschst, existiert technisch also schon: die
PWA. Sie hat Vollbild, Kamerazugriff und ein eigenes Symbol auf dem
Home-Bildschirm. Was fehlt, ist nicht die App — es ist der Weg zu ihr.

---

## 3. Die eigentliche Hürde: Erreichbarkeit

Im Handbuch steht der Satz, um den es geht:

> Kann ich die App von außerhalb des Büros nutzen?
> Nur wenn eine VPN-Verbindung zum Büronetzwerk besteht. Die App ist nicht über
> das Internet erreichbar.

Das ist kein Versehen, das war eine vernünftige Entscheidung. In der Datenbank
liegen nicht Fotos, sondern die vollständige Projektkorrespondenz: Protokolle,
Mängel, Maßnahmen mit Verantwortlichen, Nachtrags- und Rechnungsprüfungen,
Kontaktdaten, Freimeldungen. Wer die App ins Internet stellt, stellt das alles
ins Internet und hat als einzige Schranke die Anmeldung.

Deshalb ist die Frage nicht „wie kommt das Foto ins Tool", sondern **„wie weit
öffnen wir das Büronetz, und für wen".** Davon hängt ab, ob das ein Nachmittag
Arbeit ist oder sechs Wochen.

---

## 4. Drei Wege, mit Empfehlung

### Weg A — VPN auf die Diensthandys *(gewählt)*

Auf die Handys der Bauleiter kommt ein VPN-Zugang (WireGuard über DSM, oder
Tailscale). Danach ist die PWA von der Baustelle aus da, als eigene Anwendung,
mit Kamera.

- **Entwicklungsaufwand: keiner.** Die App kann das heute.
- Zu tun bleibt nur Punkt 5 dieses Papiers: die Ablage auf dem G-Laufwerk.
- Das Büronetz bleibt zu. Kein eingehender Port, keine neue Angriffsfläche.
- **Nicht geeignet für Fremdfirmen.** Niemand gibt dem Rohbauunternehmer einen
  VPN-Zugang ins Büronetz, und niemand dort würde ihn einrichten.

Wenn die Fotos von euren eigenen Leuten kommen, ist hier Schluss. Dann brauchst
du von allem Folgenden nichts.

### Weg B — Einwurfseite auf komplizen.tech, die NAS holt ab *(zurückgestellt)*

Auf einer Subdomain (`fotos.komplizen.tech`) liegt eine kleine, eigenständige
Seite — selbst als Anwendung installierbar. Sie kann genau eines: Fotos
annehmen. Wer sie öffnet, braucht einen Link mit Kennung, so wie heute bei der
Freimeldung. Die Bilder liegen beim Hoster, bis die NAS sie abholt und dort
löscht.

```
Baustellen-Handy ──▶ fotos.komplizen.tech ──▶ (NAS fragt alle 2 Min:
   (Link mit Kennung)   (Zwischenlager)        „liegt etwas für mich?")
                                                        │
                                                        ▼
                                          Eingangskorb am Projekt
                                                        │
                                            Zuweisung im Tagesbericht
                                                        │
                                                        ▼
                                          Original aufs G-Laufwerk
```

- **Das Büronetz bleibt zu.** Die NAS holt, nichts klopft an. Kein eingehender
  Port, keine Portfreigabe, kein DynDNS.
- Was im Internet steht, ist eine Seite, auf der nichts liegt außer Fotos, die
  in Minuten wieder weg sind. Kein Protokoll, kein Mangel, kein Kontakt.
- Funktioniert für Fremdfirmen, Bauherrn, Sachverständige — jeder mit einem
  Link, ohne Konto, ohne Installation.
- **Aufwand:** Einwurfseite beim Hoster, Abrufschleife in der NAS, Eingangskorb
  und Zuweisung im Tool. Realistisch die größte Position dieses Papiers.
- **Zu klären:** Baustellenfotos mit Projektbezug liegen kurzzeitig auf fremdem
  Webspace. Das braucht einen Auftragsverarbeitungsvertrag mit dem Hoster. Die
  Kennung im Link sollte den Projektnamen nicht enthalten, nur eine Nummer, und
  die Bilder müssen nach dem Abholen tatsächlich gelöscht werden — nicht nur aus
  der Übersicht.

**Befund zu komplizen.tech** (am 19.11.2026 von außen nachgesehen, ohne
Anmeldung — die Anmeldeseite, die Antwort-Header und das öffentliche
`login.js`):

| | |
|---|---|
| Hoster | IONOS, `217.160.0.223`, Apache, Standard-Webspace mit Rate-Limit-Headern (`X-WS-RateLimit-Limit: 1000`) |
| Was dort läuft | Eine private Familien-Lernplattform. „Nur für eingeladene Personen", Anmeldung über einen Familiencode der Eltern, Kinderkonten mit Lernständen. Zuletzt deployt 17.11.2026, 22:21, Commit `b673bb1` |
| Technisch | Serverseitige Anwendung mit Sitzungen (`vary: Cookie`), API-Routen über Rewrite (`/api/account`, `/api/family`, `/api/recovery`), Deploy mit Commit-Stand im Fußtext. Ob PHP oder Node lässt sich von außen nicht sagen — die Kennung ist bewusst nicht gesetzt |
| Sicherheitslage | Sorgfältig: CSP, HSTS, `noindex`, `nosniff`, `frame-ancestors none`, `referrer-policy: no-referrer`. `permissions-policy: camera=(self)` — Kamerazugriff ist dort schon freigegeben |
| Subdomains | `lern.`, `app.`, `fotos.`, `protokoll.` existieren alle nicht. Die Anwendung liegt direkt auf `www` |

Technisch würde das Paket eine Einwurfschleuse also tragen. Es gibt aber einen
Einwand, der nichts mit Technik zu tun hat: auf demselben Hosting-Paket lägen
dann **Lernstände von Kindern und Projektdaten des Büros**. Das sind zwei
verschiedene Verantwortlichkeiten — privat und geschäftlich — auf einem
Vertrag, einer Domain, einem Datenbestand. Fällt die Schleuse auf, hängt das
Private mit dran; fragt umgekehrt ein Auftraggeber nach dem Hosting der
Projektdaten, steht die Antwort schlecht da. Falls Weg B je gebraucht wird,
gehört er auf einen eigenen Vertrag und eine Bürodomain, nicht hierher.

### Weg C — Subdomain zeigt auf die NAS *(möglich, aber nicht meine Empfehlung)*

`protokoll.komplizen.tech` wird per DNS auf die Büro-IP gelegt, Port 443
freigegeben, der Synology-Reverse-Proxy nimmt es an, Let's Encrypt liefert das
Zertifikat.

- **Entwicklungsaufwand: keiner.** Reine Konfiguration in DSM.
- Danach ist die App von überall erreichbar, auf jedem Handy, ohne VPN.
- Und zwar die **ganze** App. Die Anmeldung läuft unter anderem über
  Synology-DSM-Konten — die sind damit aus dem Internet erreichbar. Wer sie
  durchbricht, hat nicht ein Foto, sondern alles.
- Wenn überhaupt, dann nur mit: Zwei-Faktor-Pflicht für alle Konten, DSM-Sperre
  nach Fehlversuchen, Abschalten der DSM-Anmeldung von außen, regelmäßiger
  Blick in die Zugriffsprotokolle. Das ist laufende Arbeit, nicht ein
  Häkchen.

**Entscheidung:** Weg A. Die Bauleiter fotografieren, und für sie ist VPN der
kürzeste und sicherste Weg — er kostet keine Zeile Code. Weg B bleibt liegen,
bis Fremdfirmen wirklich liefern sollen, und wandert dann auf einen eigenen
Vertrag. Weg C nur, wenn A und B beide ausfallen, und dann mit den Maßnahmen
oben, nicht ohne.

---

## 5. Was in der Baudokumentation dazukommt

Das ist der Teil, der unabhängig vom Weg gebaut werden muss, und der Teil, der
dir das G-Laufwerk bringt.

### 5.1 Ablage im Projektordner

Beim Speichern eines Tagesberichts wandert jedes Foto in Originalauflösung in
den Projektordner:

```
{project.fsPath}/Baudokumentation/2026-11-19/
    2026-11-19 Foto 01 Bewehrung Achse C.jpg
    2026-11-19 Foto 02.jpg
```

Die laufende Nummer ist dieselbe, mit der der Bericht auf das Foto verweist —
wer im Bericht „Foto 2" liest, findet auf dem Laufwerk dieselbe Zahl. Die
Bildunterschrift hängt im Dateinamen, wenn es eine gibt.

Der Unterordner `Baudokumentation` ist eine Annahme von mir. Wenn es im Büro
schon eine Ordnung für Baustellenfotos gibt, nenne mir den Pfad, dann bauen wir
den nach statt einen zweiten daneben.

**Wichtig für die Umsetzung:** Die Ablage darf den Eintrag nicht blockieren.
Erst wird der Bericht gespeichert, dann abgelegt — mit Statusanzeige am Foto und
einer Schaltfläche zum Wiederholen. Wenn das Service-Konto kein Schreibrecht
hat, die NAS voll ist oder der Projektordner fehlt, soll der Tagesbericht
trotzdem stehen. Die Fehlermeldungen aus `fileStation.js` sind dafür schon
brauchbar formuliert.

### 5.2 Zwei Fassungen je Foto

Mit der Entscheidung für Originalauflösung hat jedes Foto ab jetzt zwei Orte,
und das ist richtig so:

| Fassung | Wo | Wofür |
|---|---|---|
| Original, 3–8 MB | G-Laufwerk, Projektordner | Archiv und Beweismittel. Man kann hineinzoomen, Risse und Beschriftungen bleiben lesbar |
| 1200 px, ~120 KB | Anhang-Ordner wie heute | Bericht, PDF, Mailversand. Bleibt unter der 3-MB-Grenze |

Der Eintrag merkt sich beide. Der Datensatz wächst um Felder, alte Einträge
bleiben lesbar:

```js
photos: [{
  id, name, caption,          // wie heute
  fsPath,                     // Ablageort auf der NAS
  fsStatus,                   // 'ok' | 'offen' | 'fehler: …'
  originalSize, takenAt,      // aus den Bilddaten
  source,                     // 'buero' | 'handy' | 'extern'
}]
```

### 5.3 Zwei Punkte, die in der Praxis beißen

**Der Upload-Weg trägt keine Originale.** Fotos gehen heute als base64 durch
JSON (`POST /api/attachments`). Base64 bläht um ein Drittel, und bei 20 Fotos à
6 MB sind das 160 MB in einem JSON-Körper. Das muss auf Roh-Upload umgestellt
werden — das Muster steht in `pruefstation.js:433` und hält 500 MB.

**Auf der Baustelle ist kein WLAN.** Ein 6-MB-Foto über schlechtes Mobilfunknetz
dauert, zwanzig davon dauern lange. Die Handy-Anwendung braucht deshalb eine
Warteschlange, die im Hintergrund weiterlädt und einen Abbruch übersteht, und
die Wahl: die kleine Fassung jetzt, das Original später im Büro-WLAN. Sonst
steht der Bauleiter im Regen und wartet auf einen Fortschrittsbalken.

### 5.4 Nebenbei: Aufnahmezeit und Standort

Originalfotos tragen EXIF-Daten. Die Aufnahmezeit ist nützlich — danach lässt
sich sortieren, und sie belegt, wann das Bild entstand. Der GPS-Standort ist die
andere Seite: er gehört ins Archiv, aber nicht in Bilder, die an Dritte gehen.
Das trifft sich günstig — die kleine Fassung entsteht durch Neuzeichnen im
Browser und hat deshalb ohnehin kein EXIF mehr. Was per Mail rausgeht, ist
sauber, ohne dass wir etwas tun müssen.

---

## 6. Reihenfolge

Jede Stufe ist für sich nutzbar. Nach Stufe 1 hast du schon, was du beschrieben
hast — nur noch nicht für Fremdfirmen.

| Stufe | Inhalt | Nutzen danach |
|---|---|---|
| **1** | Ablage im Projektordner (5.1–5.3), VPN auf die Diensthandys (Weg A) | Eigene Leute fotografieren von der Baustelle, die Originale liegen im Projektordner |
| **2** | Eingangskorb am Projekt: Fotos, die noch keinem Tag zugewiesen sind, mit Zuweisung per Klick | Fotos müssen nicht im Moment der Aufnahme einem Bericht zugeordnet werden |
| **3** | Fotos aus dem Projektordner im Tool auswählen und anhängen | Bilder, die jemand von Hand aufs Laufwerk gelegt hat, kommen in den Bericht |
| ~~4~~ | ~~Einwurfseite plus Abrufschleife (Weg B)~~ | *Zurückgestellt — nur nötig, wenn Fremdfirmen liefern sollen* |

Stufe 1 ist überschaubar — der Schreibzugriff auf die NAS ist fertig, es geht um
die Anbindung im Bautagebuch und den Upload-Weg. Stufe 4 ist die große.

---

## 7. Was ich nicht entscheiden kann

*Die Frage, wer fotografiert, ist beantwortet: die eigenen Bauleiter. Die Frage
nach komplizen.tech ebenfalls — siehe Befund in Abschnitt 4.*

**Gibt es auf dem G-Laufwerk schon eine Ordnung für Baustellenfotos?** Wenn ja,
den Pfad darin — dann legen wir die Bilder genau dort ab.

**Steht das VPN schon?** Auf der Synology gibt es das Paket „VPN Server"
(WireGuard oder OpenVPN); eine Alternative ist Tailscale, das ohne Portfreigabe
auskommt. Wenn noch keines läuft, ist das der erste Schritt — und er gehört
nicht in diese Anwendung, sondern in die NAS-Verwaltung.

**Dienst- oder Privathandys?** Auf einem Diensthandy ist ein VPN-Profil
unproblematisch. Auf dem privaten Handy eines Mitarbeiters ist es eine
Vereinbarung, nicht eine Einstellung: das Gerät bekommt damit Zugang ins
Büronetz. Bei privaten Geräten lieber nur die Protokoll-App über einen
beschränkten Zugang erreichbar machen als das ganze Netz.

**Hat die NAS Platz?** Ein Projekt mit zwei Jahren Bauzeit, zwei Begehungen pro
Woche, zehn Fotos je Begehung, 6 MB je Foto: rund 12 GB für ein Projekt. Das ist
keine Hürde, aber es sollte vorher jemand ausgerechnet haben.

---

## 8. Was dieses Konzept nicht löst

- **Keine Mängelzuordnung.** Fotos hängen am Tagesbericht, nicht am Mangel. Ob
  die Mängelverwaltung denselben Weg bekommen soll, ist eine eigene Frage.
- **Kein Zeichnen im Bild.** Pfeile und Markierungen auf dem Foto sind in den
  Branchenplattformen Standard. Hier nicht, und das ist zunächst in Ordnung.
- **Keine Gesichtserkennung oder Unkenntlichmachung.** Wer Arbeiter auf dem Bild
  hat und das Foto weitergibt, muss das selbst beurteilen.
- **Keine Aussage zur Beweiskraft.** Ein Foto mit Zeitstempel aus unserem System
  ist kein beglaubigtes Dokument. Was vor Gericht trägt, entscheidet nicht die
  Software.

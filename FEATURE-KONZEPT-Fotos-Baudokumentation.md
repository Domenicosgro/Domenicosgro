# Feature-Konzept: Fotos von der Baustelle in die Baudokumentation

**Stand:** 26. November 2026 · Gebaut sind **Abschnitt 5** (Ablage im
Projektordner), die **schlanke Handy-Oberfläche** samt eigener Schnittstelle
(Abschnitt 9) und die **Mängel** darin: erfassen, verorten auf dem Plan,
Zustand setzen — mit dem Rückkanal von der Maßnahme zum Mangel (Abschnitt 10).
Dazu die Mängelliste als Dokument für die Abnahme (Abschnitt 10.6). Offen
bleibt Abschnitt 4, Weg A: das VPN auf die Handys. Das liegt bei der
Netzbetreuung, nicht in dieser Anwendung.

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
- **Korrektur vom 26.11.2026:** Hier stand „kein eingehender Port". Das gilt
  nur für Tailscale — dort verbinden sich die Geräte nach außen, nichts klopft
  an. **WireGuard über DSM braucht eine UDP-Freigabe.** Allerdings eine, die
  auf Pakete ohne gültigen Schlüssel überhaupt nicht antwortet: kein
  Anmeldeformular, kein TLS, nichts zum Durchprobieren. Gegenüber Weg C ist
  das ein Unterschied in der Größenordnung — aber es ist nicht „nichts".
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
| Hoster | IONOS, Apache, Standard-Webspace mit Rate-Limit-Headern (`X-WS-RateLimit-Limit: 1000`) |
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

**Das G-Laufwerk ist die NAS.** Nachgesehen am 20.11.2026: `G:` ist eine
Freigabe genau derselben Synology, auf die auch der Deploy geht (die Adressen
stehen in `deploy-nas.config.ps1`, nicht hier). Die Ablage braucht also keinen
Umweg — der vorhandene Schreibzugriff über die File Station trifft genau dieses
Laufwerk.

**Es gibt schon eine Ordnung, und sie ist durchgezogen.** In `G:\01 Projekte`
liegen 152 Projekte. 52 davon sind in der Objektüberwachung, und **alle 52**
haben denselben Ordner, alle gefüllt:

```
01 Projekte\{Projekt}\02 Planung\02 LP 8\02 Baustellenfotos_Bautagebuch\
```

Darin liegen die Fotos nach Tagen, im Format, das wir brauchen — teils mit
einem Zusatz hinter dem Datum:

```
2012-11-01\
2012-12-17 Kinderspatenstich\
2013-01-14\
```

**Die Ebene darunter ist uneinheitlich benannt.** Der Fotoordner heißt je
Projekt anders, weil die Nummer mitgewachsen ist: `04 Baustellenfotos` (13×),
`03 Baustellenfotos` (13×), `1 Baustellenfotos` (8×), `02 Baustellenfotos`
(5×), `2 Baustellenfotos` (2×). Daneben steht meist ein Bautagebuch-Ordner,
auch der mit wechselnder Nummer (`02 Bautagebuch` 8×, `01 Bautagebuch` 4×).

**Deshalb darf die Anwendung die Nummer nicht erraten.** Der Entwurf:

1. Je Projekt wird der Fotoordner **einmal hinterlegt**, so wie heute schon der
   Projektordner — ein zweites Feld `project.fsFotoPath`, relativ zum
   Projektordner.
2. Beim ersten Mal **schlägt die Anwendung vor**, was sie findet: sie sieht in
   `02 Planung\02 LP 8\02 Baustellenfotos_Bautagebuch` nach einem Unterordner,
   dessen Name auf „Baustellenfotos" endet, und bietet ihn zur Bestätigung an.
   Findet sie keinen, bietet sie an, einen anzulegen.
3. Darunter je Berichtstag ein Ordner `2026-11-20`, wie in der vorhandenen
   Ordnung. Ein Zusatz hinter dem Datum bleibt möglich.

Die Dateinamen tragen die laufende Nummer, mit der der Bericht auf das Foto
verweist — wer im Bericht „Foto 2" liest, findet auf dem Laufwerk dieselbe
Zahl. Die Bildunterschrift hängt im Namen, wenn es eine gibt:

```
2026-11-20 Foto 01 Bewehrung Achse C.jpg
2026-11-20 Foto 02.jpg
```

Offen bleibt, ob auch das **PDF der Baudokumentation** in den
Bautagebuch-Ordner daneben soll. Technisch derselbe Griff, und es würde die
Papierablage ersetzen — aber das ist eine eigene Entscheidung.

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
| **1** ✓ | Ablage im Projektordner (5.1–5.3), VPN auf die Diensthandys (Weg A) | Eigene Leute fotografieren von der Baustelle, die Originale liegen im Projektordner |
| **1b** ✓ | Schlanke Handy-Oberfläche mit eigener Schnittstelle (Abschnitt 9) | Auf der Baustelle wird nicht das ganze Tool geladen, und die Fläche nach außen wäre klein |
| **1c** ✓ | Mängel am Handy, Pin auf dem Plan, Rückkanal zur Maßnahme (Abschnitt 10) | Die Mängelliste läuft bis zur Abnahme mit, ohne doppelte Pflege |
| **2** | Eingangskorb am Projekt: Fotos, die noch keinem Tag zugewiesen sind, mit Zuweisung per Klick | Fotos müssen nicht im Moment der Aufnahme einem Bericht zugeordnet werden |
| **3** | Fotos aus dem Projektordner im Tool auswählen und anhängen | Bilder, die jemand von Hand aufs Laufwerk gelegt hat, kommen in den Bericht |
| ~~4~~ | ~~Einwurfseite plus Abrufschleife (Weg B)~~ | *Zurückgestellt — nur nötig, wenn Fremdfirmen liefern sollen* |

Stufe 1 ist überschaubar — der Schreibzugriff auf die NAS ist fertig, es geht um
die Anbindung im Bautagebuch und den Upload-Weg. Stufe 4 ist die große.

---

## 7. Was ich nicht entscheiden kann

*Die Frage, wer fotografiert, ist beantwortet: die eigenen Bauleiter. Die Frage
nach komplizen.tech ebenfalls — siehe Befund in Abschnitt 4.*

*Die Ordnung auf dem G-Laufwerk ist gefunden und in Abschnitt 5.1
beschrieben — sie wird nachgebaut, nicht ersetzt.*

**Wo läuft das VPN?** Auf der NAS offenbar nicht. Nachgesehen am 20.11.2026,
von diesem Rechner aus, nur lesend:

| Prüfung | Ergebnis |
|---|---|
| DSM erreichbar | Ja, die Verwaltungsoberfläche antwortet |
| VPN-Server-Paket | **Nicht sichtbar.** Die API-Liste führt nur `SYNO.Core.Network.VPN.*` — das ist DSM als VPN-*Client* (ausgehende Profile), nicht der VPN-*Server* |
| OpenVPN über TCP, PPTP | beide zu |
| OpenVPN/UDP, WireGuard | **nicht prüfbar** von hier aus — UDP antwortet nicht |
| SSH als Deploy-Konto | Schlüssel ist dort nicht autorisiert; das Deploy-Skript fragt nach dem Passwort. Ein Passwort gebe ich nicht ein, also kein Blick in `/var/packages` |

Das Handbuch sagt, von außen gehe es nur per VPN — irgendein Weg existiert also.
Nach diesem Befund liegt er **nicht auf der NAS**, sondern in der
Netzinfrastruktur des Büros. Wo genau, lässt sich ohne Portscan im Firmennetz
nicht sagen, und den mache ich nicht ungefragt. Wer das Netz betreut, weiß es
in einem Satz.

**Das ist jetzt der erste Schritt** — und er gehört nicht in diese Anwendung,
sondern in die Netz- und NAS-Verwaltung: entweder das vorhandene VPN auf die
Handys bringen, oder auf der NAS das Paket „VPN Server" einrichten (WireGuard
braucht eine Portfreigabe), oder Tailscale, das ohne Freigabe auskommt.

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

---

## 9. Die Handy-Oberfläche (gebaut am 25.11.2026)

Nachtrag zu Abschnitt 2, wo noch steht: „Die Handy-Anwendung, die du dir
wünschst, existiert technisch schon: die PWA." Das stimmt, aber es ist die
ganze PWA — 5,4 MB Bündel und eine Oberfläche, die für einen Bürobildschirm
gebaut ist. Dazu gibt es jetzt **eine eigene, schlanke Oberfläche**: `/baustelle`.

Sie deckt bewusst nicht das Spektrum des Tools ab, sondern das, worum es auf
der Baustelle geht — **die Projektdatenbank und die Baudokumentation**:

- Projekt wählen (Name, Nummer, Ort, letzter Bericht)
- Tagesbericht anlegen: Tag, Tageshälfte, Wetter (automatisch), Firmen vor Ort,
  ausgeführte Arbeiten, Bemerkungen, Besonderes, Baufortschritt
- fotografieren — kleine Fassung in den Bericht, Original in den Projektordner
- die letzten 14 Tage ansehen, eigene Berichte nachbearbeiten
- ohne Netz weiterarbeiten: der Bericht wird auf dem Gerät gespeichert und
  geht von selbst hinaus, sobald Verbindung besteht

Nicht dabei: Protokolle, Mängel, Kontakte, Freimeldungen, Nachtrags- und
Rechnungsprüfung, Dateiablage, BIM.

### 9.1 Warum das mehr ist als eine schlankere Maske

Eine schlanke Maske vor den vorhandenen Routen spart Ladezeit, aber nichts an
Zugriff: wer angemeldet ist, holt sich mit zwei Zeilen das Protokollarchiv.
Deshalb hat die Oberfläche eine **eigene Schnittstelle** mit acht Routen
(`/api/baustelle/*`, `server/baustelle.js`) statt der rund 125 des Tools.

Das ändert die Lage in Abschnitt 3: Die Frage war „wie weit öffnen wir das
Büronetz, und für wen". Bisher hieß jede Antwort darauf *alles oder nichts* —
Weg C hätte die ganze Anwendung ins Internet gestellt, Anmeldung über
DSM-Konten inbegriffen. Jetzt gibt es eine dritte Möglichkeit: **diese eine
Fläche** nach außen legen und den Rest zulassen. Das ist kein neuer Weg,
sondern ein kleinerer Weg C — und er bleibt eine eigene Entscheidung.

**Offen und nicht entschieden:** Ob die Fassade je nach außen geht. Der Port
ist zu, das VPN bleibt der Weg. Was dafür noch zu klären wäre, wenn es
irgendwann ansteht: Zwei-Faktor-Pflicht für die Konten, die sie benutzen
dürfen, eine eigene Anmeldung getrennt von DSM, und ein Blick in die
Zugriffsprotokolle als laufende Arbeit.

### 9.2 Was die Fassade schützt

Nicht nur, was sie *nicht* herausgibt, sondern auch, was sie nicht kaputt
machen kann:

- **Datensparsamkeit:** Die Projektliste nennt Name, Nummer, Ort und ob der
  Fotoordner hinterlegt ist. Kein Bauherr, keine Kontakte, kein Vertrag, kein
  Team. Berichte gehen als Fließtext hinaus, Behinderungen und Abnahmen gar
  nicht.
- **Feld-Weißliste:** Was das Handy nicht kennt, bleibt beim Ändern unberührt.
  Eine schlanke Oberfläche darf nie leeren, was sie nicht anzeigt.
- **Der Ablagevermerk des Originals bleibt stehen**, auch wenn das Handy eine
  ältere Fotoliste schickt.
- **Nur eigene, frische, unformatierte Berichte** sind vom Handy aus änderbar.
  Ein im Büro formatierter Bericht ist gesperrt, statt die Formatierung still
  zu verlieren.
- **Doppelt gesendet heißt nicht doppelt im Büro:** jeder Bericht trägt eine
  eigene Kennung.

Nachprüfbar ohne NAS und ohne Browser: `npm run pruefe:baustelle`
(53 Prüfungen, darunter „die Fassade hat keine weiteren Routen").

### 9.3 Mängel sind dazugekommen

Stand 25.11. hieß es hier: „Bewusst nicht in dieser Runde." Am 26.11. ist es
gebaut — siehe Abschnitt 10.

---

## 10. Mängel: erfassen, verorten, bis zur Abnahme führen (26.11.2026)

Die Frage war: Mängel am Handy aufnehmen, auf dem Plan verorten, daraus eine
Mängelliste mit Aufgaben und Fristen machen, die im Protokolltool weiterläuft
und zur Abnahme beigelegt wird. Was davon schon da war, was gefehlt hat und
was jetzt gebaut ist:

### 10.1 Der Befund: zwei Drittel waren da, eine Stelle war kaputt

| | Stand vor dem 26.11. |
|---|---|
| Mangel mit Nummer, Ort, Zuständigem, Frist, Dringlichkeit, Zustand, Fotos | **da** (`MaengelView.jsx`, Tabelle `defects`) |
| Mangel → Maßnahme im Protokoll, mit Freimeldung und Mahnwesen | **da** (`handleAddDefectToProtocol`) |
| Pläne je Projekt, Pins mit Anteilskoordinaten | **da**, aber an der *Planprüfung* (`plan_reviews`), nicht am Mangel |
| Pin auf einem PDF | **nein** — im Planviewer stand `canPin = !isPdf`, und Pläne sind PDF |
| Mängel am Handy | **nein** |
| Rückweg Maßnahme → Mangel | **kaputt**: die Maßnahme trug `defectId`, gelesen hat es niemand |

Der letzte Punkt war der wichtigste. Meldete die Firma die Maßnahme frei, blieb
der Mangel auf „offen" — die Liste, die bis zur Abnahme geführt wird, lief
auseinander, und zwar unbemerkt, weil beide Seiten für sich richtig aussahen.

### 10.2 Eine Entscheidung: ein Mangel, nicht zwei Sorten

`planId`, `planSeite` und `position` sind jetzt **Felder am Mangel**, kein
eigener Datentyp. Ob ein Mangel auf dem Plan verortet ist oder nur „EG, Achse
C/4" im Textfeld trägt, ist damit eine Eigenschaft — und die Mängelliste ist
immer vollständig. Das ist die Bedingung dafür, dass sie bis zur Abnahme trägt.

Die **Planprüfung** bleibt daneben bestehen: dort wird der *Plan* geprüft, beim
Mangel ein Fehler am *Bauwerk* dokumentiert, der auf dem Plan nur verortet
wird. Gleiche Technik, zwei Vorgänge.

### 10.3 PDF-Pläne: einmal aufbereiten statt jedes Mal rendern

Pins brauchen ein Bild. Statt einen PDF-Renderer auf den Server zu holen
(Poppler im Abbild — eine Abhängigkeit, die bei jedem Umzug Arbeit macht) oder
aufs Handy (400 kB über Mobilfunk, nur um einen Punkt zu setzen), wird **jede
Planseite einmal im Büro in ein PNG gewandelt** und abgelegt. Danach braucht
niemand mehr pdfjs:

```
Hochladen (Büro)      pdfjs im Browser → PNG je Seite → Server
Pin setzen (überall)  nur noch das PNG
```

pdfjs wird dabei nachgeladen, nicht mitgebaut — das Bündel der
Baustellen-Oberfläche bleibt bei rund 295 kB.

**Offener Punkt, der keine Technik lösen kann:** Wird eine Plandatei durch
einen neuen Stand ersetzt, bleiben die Pins an ihrem Anteil stehen. Hat der
neue Plan einen anderen Zuschnitt, sitzen sie daneben. Der Hinweis steht in der
Oberfläche und im Handbuch — erkennen lässt es sich nicht.

### 10.4 Der Rückkanal

```
Maßnahme „erledigt"   → Mangel „behoben"
Maßnahme „in Arbeit"  → Mangel „in Arbeit"
Maßnahme „offen"      → Mangel „offen"     (abgelehnte Freimeldung = nachbessern)
Maßnahme „verschoben" → keine Änderung
```

Zwei Dinge laufen ausdrücklich **nicht** mit:

- **„Abgenommen".** Behoben meldet die Baustelle oder die Firma, abgenommen
  erklärt das Büro. Das ist eine Erklärung mit Rechtsfolgen und keine
  Schaltfläche für unterwegs — am Handy gibt es diesen Zustand gar nicht.
- **Die Frist.** Sie steht am Mangel und an der Maßnahme und bleibt an beiden
  Stellen von Hand änderbar. Liefe sie mit, würde die alte Frist der Maßnahme
  die neue am Mangel überschreiben.

Hängen mehrere Maßnahmen an einem Mangel, gilt die am wenigsten
fortgeschrittene: behoben ist er erst, wenn alle erledigt sind.

### 10.5 Was am Handy wem erlaubt ist

Mängel sind gemeinsames Arbeitsmaterial — anders als der Tagesbericht, der
einem gehört. Deshalb:

- **eigener Mangel:** alles änderbar
- **fremder Mangel:** Zustand setzen und Fotos dazulegen; kein Text, keine
  Frist, kein Foto weniger
- **abgenommener Mangel:** nichts

### 10.6 Stufe 4: die Mängelliste als Dokument (gebaut)

Gebaut am 26.11.2026, `src/maengelliste.js`. Die Anlage zum Abnahmeprotokoll:

- **Welche Mängel** – alle, nur die nicht abgenommenen, nur die offenen
- **Gliederung** – nach Firma (Abnahme je Gewerk) oder nach Plan (Begehung)
- **Abnahmedatum** – gesetzt, trägt das Blatt „Anlage zur Abnahme vom …"
- **Planübersicht** je Plan und Seite: der ganze Plan mit allen Pins, jeder mit
  der Nummer des Mangels und in der Farbe seines Standes
- Fotos, Unterschriftenzeilen je an oder aus

Die Spalte „Zur Abnahme" ist **abgeleitet**, nicht bewertet: abgenommen →
abgenommen, behoben → behoben und noch nicht abgenommen, offen und in Arbeit →
vorbehalten. Was ein wesentlicher Mangel ist und was ein Vorbehalt bedeutet,
gehört ins Abnahmeprotokoll und nicht in dieses Programm. Der Hinweis dazu
steht im Dokument.

Offen bleibt damit aus diesem Papier nur noch Weg A selbst: das VPN auf die
Handys.

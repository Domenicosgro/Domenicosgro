# Audio-Anwendung – Infos für die Zusammenarbeit

> **Zum Ausfüllen durch Sven** (bzw. Domenico).
> Ziel: Domenico, Sven und Codex/Claude können gemeinsam an der bestehenden
> Anwendung `https://192.168.178.250:18098/audio/` weiterarbeiten. Später soll sie
> eine Anwendung im Synology-Dashboard werden.
>
> **Keine Passwörter, Tokens oder Schlüssel hier eintragen.** Nur notieren, *wo*
> sie liegen (z. B. „in `.env` auf der NAS").

Ausgefüllt von: ________ · Datum: ________

---

## 1. Was läuft unter `:18098/audio/`?

| Frage | Antwort |
|---|---|
| Name der Anwendung / des Dienstes | |
| Selbst gebaut oder fertiges Programm? (welches, Version) | |
| Was kann sie heute? (kurz) | |
| Was soll als Nächstes dazukommen? | |
| Wer nutzt sie heute? | |

---

## 2. Code und Repository

| Frage | Antwort |
|---|---|
| Gibt es ein Git-Repository? URL (GitHub/Gitea/…) | |
| Wem gehört es? Ist es privat? | |
| Haupt-Branch (`main`/`master`/…) | |
| Wenn kein Repo: wo liegt der Code? (Pfad auf NAS/PC) | |
| Programmiersprache / Framework | |
| Gibt es eine README oder Doku? Wo? | |
| Gibt es Tests? Wie startet man sie? | |
| Wie startet man die Anwendung lokal zum Entwickeln? | |

---

## 3. Betrieb auf der NAS

| Frage | Antwort |
|---|---|
| Läuft sie als Docker-Container? Container-Name(n) | |
| Image-Name / wo wird es gebaut? | |
| Ordner auf der NAS (z. B. `/volume1/docker/…`) | |
| Wo liegt die `docker-compose.yml`? | |
| Wo liegen die Daten (Volumes)? | |
| Wo liegen die Logs? | |
| Interner Port / Außenport | |
| Wer stellt `https` und den Pfad `/audio/` bereit? (DSM-Reverse-Proxy, nginx, App selbst) | |
| Welches Zertifikat? (selbst signiert, Let's Encrypt, …) | |
| Wie wird eine neue Version eingespielt? (Befehle/Skript) | |
| Gibt es einen Health-Endpunkt? (`/api/health` o. ä.) | |
| Gibt es ein Backup? Wie/wo? | |

---

## 4. Anmeldung und Zugänge

| Frage | Antwort |
|---|---|
| Wie meldet man sich an der Anwendung an? (gar nicht, eigenes Konto, DSM, Home Assistant) | |
| Welche Benutzer gibt es? | |
| Wo liegen Secrets/Tokens? (Datei, ENV, DSM) | |
| Hat Domenico Admin-Zugang zur Anwendung? | |
| SSH auf die NAS: welcher Benutzer wird für Deploys genutzt? | |
| Fernzugriff von außen? (VPN, QuickConnect, Portfreigabe) | |

---

## 5. Verbindungen zu anderen Diensten

| Dienst | Genutzt? | Adresse / Port | Wie angebunden? (Integration, API, Token) |
|---|---|---|---|
| Home Assistant | | | |
| Music Assistant | | | |
| Spotify (welches Konto, Premium?) | | | |
| Bose-Lautsprecher | | | |
| Weitere | | | |

### Lautsprecher

| Raum | Bose-Modell | IP-Adresse (fest?) | Anbindung (SoundTouch/AirPlay/Chromecast/…) | Funktioniert? |
|---|---|---|---|---|
| | | | | |
| | | | | |
| | | | | |

### Home Assistant

| Frage | Antwort |
|---|---|
| Installationsart (Container / HA OS in VM / …) | |
| Adresse | |
| Version | |
| Wo liegt die Konfiguration? Ist sie in Git? | |
| Relevante Integrationen / Automationen | |

---

## 6. Zusammenarbeit

| Frage | Antwort |
|---|---|
| Wie wollen wir Änderungen austauschen? (Pull Requests, direkt auf `main`, …) | |
| Wer darf auf die NAS deployen? | |
| Darf Codex/Claude Pull Requests öffnen? Wer gibt frei? | |
| Bevorzugter Kanal für Absprachen (Issues, Chat, …) | |
| Bekannte Probleme / Baustellen | |
| Was soll auf keinen Fall angefasst werden? | |

> Hinweis für die Agenten: Codex und Claude laufen in der Cloud und erreichen die
> NAS (`192.168.178.x`) **nicht**. Sie arbeiten nur im Repository; testen im Haus
> müssen Sven oder Domenico.

---

## 7. Später: Anwendung im Dashboard

| Frage | Antwort |
|---|---|
| Soll Port 18098 / Pfad `/audio/` so bleiben? | |
| Anmeldung künftig über DSM (wie die anderen Dashboard-Apps)? | |
| Was soll die Dashboard-Kachel anzeigen? (Status, aktueller Titel, …) | |

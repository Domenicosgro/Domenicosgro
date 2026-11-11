# Neuigkeiten

Was hier steht, zeigt (K)ompl(I)ze den Mitarbeitern als Sprechblase, sobald
sie sich anmelden — einmal je Person, danach nie wieder.

**Diese Datei ist der einzige Ort, an dem Neuigkeiten entstehen.** Der
Assistent erfindet keine; er erklärt nur, was hier steht. Wer eine
Verbesserung baut, schreibt sie im selben Commit hier hinein — dann ist sie
versioniert, nachlesbar und von jemandem gegengelesen worden.

## So wird eine Neuigkeit geschrieben

Jeder Eintrag beginnt mit einer Überschrift aus **Kennung** und **Titel**,
getrennt durch `|`:

```markdown
## 2026-11-11-pruefstation | Neu: die Prüfstation für Nachträge und Abschlagsrechnungen

Im Projekt-Dashboard gibt es die Kachel **Prüfstation**. Dort legst du einen
Nachtrag oder eine Abschlagsrechnung als Prüfvorgang an, ziehst das Original
und die Anlagen (Einigungen, E-Mail-Verläufe, Stellungnahmen) hinein — alles
landet direkt im Projektordner auf der NAS.

Für jeden Vorgang wird automatisch ein Ordner angelegt, z. B. „Nachtrag 011"
unter dem Prüfordner des Projekts. Den Prüfordner legt ein Projekt-Admin
einmal fest; einzelne Vorgänge lassen sich jederzeit mit einem anderen Ordner
verknüpfen.

Ist es eingeschaltet, prüft **Claude** den Vorgang nach unseren Regeln
(Nachtragsprüfung bzw. Rechnungsprüfung LBIH) — ohne eigenen Claude-Zugang,
über den Schlüssel des Büros. Rückfragen beantwortest du direkt dort. Die
Ergebnisse sind zuerst ein Entwurf; in den Projektordner kommen sie erst, wenn
ein Projekt-Admin sie freigibt. Anders als (K)ompl(I)ze läuft diese Prüfung
**nicht** im Haus: Die Unterlagen gehen dafür an die Claude API von Anthropic.

---

## 2026-11-04-komplize | (K)ompl(I)ze beantwortet jetzt Projektfragen
```

Die **Kennung** beginnt mit dem Datum (`JJJJ-MM-TT`) und merkt sich, wer den
Eintrag schon gesehen hat. Sie darf sich nie ändern — sonst erscheint die
Neuigkeit bei allen erneut. Der **Titel** darf sich ändern, so oft man will.

Darunter steht der Text: ein, zwei Sätze für die Sprechblase, danach so viel
Erklärung, wie es braucht. Wer nachfragt, bekommt sie vom Assistenten
ausführlicher — er bekommt diesen Text und das Handbuch als Material.

Ein Bild ist möglich und liegt als Datei daneben:

```markdown
![Der Weg eines Protokolls](neuigkeiten/protokollweg.svg)
```

SVG ist dafür das richtige Format: Es ist Text, also vor dem Ausliefern
nachlesbar, es skaliert, und es lässt sich in den Hausfarben halten. Ein
echtes Bildschirmfoto ist trotzdem besser, wenn die Frage „wo ist der neue
Knopf" lautet — dann gehört ein PNG daneben.

Neuestes zuerst.

---

## 2026-11-04-komplize | (K)ompl(I)ze beantwortet jetzt Fragen zu deinen Projekten

Unten rechts sitzt neuerdings **(K)ompl(I)ze**. Du kannst ihn fragen, was in
einem Projekt noch offen ist, wie der Stand bei einem Thema war oder wie
etwas im Programm funktioniert.

Er liest dafür die Protokolle, Aufgaben und Notizen der Projekte, **die für
dich freigegeben sind** — nicht mehr und nicht weniger als das, was du auch
selbst öffnen kannst. Über jeder Antwort steht, worauf sie sich stützt. Steht
dort „Keine Fundstellen", hat er nichts gefunden und redet allgemein; das ist
die wichtigste Zeile auf dem Schirm.

Was er nicht kann: etwas ändern. Kein Protokoll anlegen, keine Aufgabe
speichern, keine E-Mail senden. Dafür sagt er dir, wo es in der Oberfläche
geht.

Er läuft auf den Grafikkarten im Büro. Es verlässt nichts das Haus.

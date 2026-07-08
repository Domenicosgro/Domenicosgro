# Design-Briefing: Komplizen-CI für „Komplizen Protokolle"

> Zweck: Umsetzbare Anleitung, um das aktuelle Design (generisches Blau + striktes
> Flat/0-Radius) auf die **Komplizen-Corporate-Identity** umzustellen.
> Adressat: Claude Code im lokalen Repo. Ziel: professioneller wirken, bessere
> Lesbarkeit/Übersicht, moderner (weg vom strengen Flat) – ohne die Funktion anzutasten.

---

## 0. Leitprinzip

Die App heißt „Komplizen Protokolle", nutzt aber farblich ein beliebiges Blau (`#2f4da8`)
und 0px-Radius überall. Das wirkt generisch. Mit der echten Marken-CI (Night-Blau, Sky,
Light, Yellix-Schrift, großzügiger Weißraum) wird die App sofort hochwertig und markeneigen.

**Vorgehen:** Erst die Design-Tokens zentral ändern (Tailwind + index.css). Weil Farben über
`brand`-Tokens und Komponentenklassen (`.btn-primary`, `.card`, `.badge-*`) laufen, schlägt
das automatisch auf fast alle Komponenten durch. Danach gezielt Feinschliff.

---

## 1. Verbindliche Marken-Werte (Komplizen-CI)

| Token | Hex | Einsatz |
|---|---|---|
| **Night** | `#000040` | Primärfarbe – überall wo bisher „Blau/Schwarz": Headlines, Primär-Buttons, dunkle Flächen, Text |
| **Sky** | `#8FBEFF` | Akzent – aktive Zustände, Fokus-Ringe, Randstreifen, Highlights |
| **Light** | `#FBFFE6` | warmer Cremeweiß-Seitenhintergrund (statt kühlem `gray-100`) |
| **Concrete** | `#F0F0F0` | neutrale helle Fläche, dezente Trenner |
| **White** | `#FFFFFF` | Karten |
| Black | `#000000` | sehr sparsam – sonst Night verwenden |

**Wichtig:** Night `#000040` ist **kein** Schwarz, sondern sehr dunkles Blau. Es ist die
prägende Farbe und steht überall, wo man intuitiv Schwarz setzen würde.

**Lebendige Kombinationen:** Night auf Light · Night auf Sky · Light auf Night.

**Schrift:** Hausschrift **Yellix**. Aktuell liegt nur **Yellix-Black** vor → Headlines in
Yellix, Fließtext vorerst Fallback **Arial/Segoe UI**, bis weitere Schnitte (Regular/Medium/
Bold) ergänzt sind. Yellix ist lizenziert und darf eingebettet/selbst gehostet werden.

---

## 2. Schritt 1 — Design-Tokens in `tailwind.config.mjs`

Ziel: `brand`-Palette durch die Komplizen-Farben ersetzen, Marken-Tokens ergänzen und den
strikten 0-Radius lockern (moderner, lesbarer – aber dezent, nicht verspielt).

```js
// tailwind.config.mjs
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    // VORHER: borderRadius komplett auf 0. JETZT: dezente Rundungen zulassen.
    // (Den globalen 0-Override entfernen, damit Tailwind-Defaults greifen, ODER
    //  bewusst kleine Werte setzen:)
    borderRadius: {
      none: '0',
      sm: '2px',
      DEFAULT: '4px',
      md: '6px',
      lg: '8px',
      xl: '10px',
      '2xl': '14px',
      full: '9999px',
    },
    extend: {
      colors: {
        // brand = Night-Skala (ein dunkles, leicht aufgehelltes Blauspektrum um #000040)
        brand: {
          50:  '#EAEAF5',
          100: '#C9C9E6',
          200: '#9A9ACC',
          300: '#6A6AB3',
          400: '#3A3A80',   // mittlere UI-Akzente
          500: '#1A1A60',
          600: '#000040',   // ← Primärfarbe (Buttons, Headlines)
          700: '#000033',
          800: '#000026',
          900: '#00001A',
        },
        sky:      '#8FBEFF',  // Akzent
        light:    '#FBFFE6',  // Seitenhintergrund
        concrete: '#F0F0F0',  // neutrale Fläche
        night:    '#000040',  // Alias für Klarheit im Markup
      },
      fontFamily: {
        // Yellix für Headlines; Fallback-Kette für Fließtext
        sans:     ['Yellix', 'Segoe UI', 'Arial', 'system-ui', 'sans-serif'],
        headline: ['Yellix', 'Segoe UI', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
```

> Falls der bisherige globale 0-Radius bewusst für die **Druckansicht** gebraucht wird:
> Den Radius nur im Screen-Layout zulassen und im `@media print` weiterhin auf 0 setzen
> (siehe Schritt 4) – Druck bleibt damit unverändert eckig/sachlich.

---

## 3. Schritt 2 — Komponentenklassen in `src/index.css`

Die `@layer components`-Klassen anpassen. Beispielwerte (Tailwind-`@apply`):

```css
@layer components {
  .btn {
    @apply px-3 py-1.5 text-sm font-medium transition-colors
           focus:outline-none focus:ring-2 focus:ring-sky focus:ring-offset-1;
  }
  .btn-primary   { @apply bg-brand-600 text-light hover:bg-brand-700; } /* Night auf Light-Text */
  .btn-secondary { @apply bg-white text-brand-700 border border-concrete hover:bg-concrete; }
  .btn-ghost     { @apply bg-transparent text-brand-700 hover:bg-concrete; }
  .btn-danger    { @apply bg-red-50 text-red-700 hover:bg-red-100; }

  .input {
    @apply border border-concrete bg-white px-2 py-1.5 text-sm text-night
           focus:border-sky focus:ring-2 focus:ring-sky;
  }

  /* Karten: jetzt dezente Rundung + sehr leichter Schatten für „weg vom Flat" */
  .card {
    @apply bg-white border border-concrete rounded-lg shadow-sm;
  }

  .badge       { @apply px-2 py-0.5 text-xs font-medium rounded; }
  .badge-blue  { @apply bg-sky/30 text-brand-800; }
  .badge-green { @apply bg-green-100 text-green-800; }
  .badge-yellow{ @apply bg-amber-100 text-amber-800; }
  .badge-red   { @apply bg-red-100 text-red-800; }
  .badge-gray  { @apply bg-concrete text-gray-700; }
}
```

**Seitenhintergrund** (war `bg-gray-100`): auf **Light** umstellen. Entweder im Body
(`body { @apply bg-light; }`) oder dort, wo aktuell `bg-gray-100` gesetzt ist.

---

## 4. Schritt 3 — Schrift Yellix einbinden

1. `Yellix-Black.otf` (und später weitere Schnitte) nach `public/fonts/` legen.
2. In `src/index.css` `@font-face` ergänzen:

```css
@font-face {
  font-family: 'Yellix';
  src: url('/fonts/Yellix-Black.otf') format('opentype');
  font-weight: 800;
  font-display: swap;
}
/* Sobald vorhanden: weitere @font-face für Regular/Medium/Bold ergänzen. */
```

3. Headlines (`h1`, Seitentitel, Logo-Text) auf `font-headline` setzen; Fließtext bleibt auf
   der `font-sans`-Fallback-Kette, bis Yellix-Textschnitte vorliegen.

---

## 5. Schritt 4 — Wasserzeichen & Druck

- **Wasserzeichen (`body::after`):** Der bestehende `filter`-Hack färbt das Logo ins
  Sky-Blau. Beibehalten, aber sicherstellen, dass die Farbe dem echten Sky `#8FBEFF`
  entspricht. Alternativ ein bereits sky-farbenes Logo-Asset nutzen und auf den Filter
  verzichten (sauberer).
- **Druck bleibt sachlich:** Im `@media print` weiterhin `border-radius: 0`, keine Schatten,
  Wasserzeichen aus. Die neue CI zeigt sich im Druck über Farbe (Night) und Schrift, nicht
  über Rundungen. So bleiben die erzeugten PDFs/Word-Dokumente formal.

---

## 6. Schritt 5 — Feinschliff (lohnende, kleine Eingriffe)

- **Login-Screen** (`LoginScreen.jsx`): Night-Hintergrund (`bg-night`), Light-Text, das
  `(K)`-Submark groß/zentral als Markenelement. Erster echter Marken-Touchpoint.
- **Kopfzeile / Nutzeranzeige:** Night-Leiste mit Light-Text statt heller Standardleiste.
- **Randstreifen der Protokollpunkte** (Level 1–3): von Blau-Tönen auf Night→Sky abstufen
  (Level 1 = Night kräftig, Level 2 = Sky, Level 3 = Concrete).
- **Aktive/Fokus-Zustände:** durchgängig Sky als Akzent (Ring, aktive Tabs, Hover).
- **Leerzustände/Weißraum:** mehr Abstand (`gap`, `p-`) – Großzügigkeit ist Teil der CI.

---

## 7. Reihenfolge & Sicherheit

1. Branch/Commit vor Beginn (Design-Änderungen sind weitreichend, aber gut umkehrbar).
2. `tailwind.config.mjs` → `index.css` Tokens/Klassen → Yellix → Druck-Check → Feinschliff.
3. **Nach jedem Schritt visuell prüfen:** `npm run dev` und einmal durch Startseite,
   Editor, Druckvorschau und Login klicken.
4. **Druck/Export gegenchecken:** Eine Protokoll-PDF und ein Word-Export müssen weiterhin
   sauber/sachlich aussehen (keine Rundungen/Schatten, korrekte Farben).
5. Funktion darf sich nicht ändern – nur Optik.

---

## 8. Fertiger Prompt für Claude Code

> Kopiere den folgenden Block in Claude Code, sobald du im Projektordner bist:

```
Stelle das Design der App von generischem Blau + striktem 0-Radius auf die
Komplizen-Corporate-Identity um. Werte:
- Night #000040 (Primär, statt #2f4da8), Sky #8FBEFF (Akzent),
  Light #FBFFE6 (Seitenhintergrund statt gray-100), Concrete #F0F0F0 (neutrale Fläche).
- Night ist dunkles Blau, KEIN Schwarz – überall dort, wo intuitiv Schwarz stünde.
- Schrift Yellix für Headlines (Yellix-Black.otf nach public/fonts/, @font-face in
  index.css), Fließtext vorerst Fallback Segoe UI/Arial.
- borderRadius nicht mehr global 0, sondern dezente Rundungen (sm 2px … lg 8px); .card
  bekommt rounded-lg + shadow-sm (weg vom Flat). Im @media print weiterhin radius 0,
  keine Schatten, Wasserzeichen aus.

Gehe so vor:
1. tailwind.config.mjs: brand-Palette auf eine Night-Skala mit 600=#000040 setzen;
   sky/light/concrete/night als Farben ergänzen; fontFamily.sans + .headline mit Yellix;
   borderRadius lockern.
2. src/index.css: .btn-primary/.btn-secondary/.btn-ghost/.input/.card/.badge-* auf die
   neuen Tokens; body-Hintergrund auf Light; @font-face Yellix; Druck-CSS sachlich lassen.
3. Login-Screen, Kopfzeile und Protokollpunkt-Randstreifen auf Night/Sky umstellen.

Ändere nur die Optik, nicht die Funktion. Prüfe nach jedem Schritt mit npm run dev und
kontrolliere Startseite, Editor, Login und die Druckvorschau. Halte dich exakt an die
Hex-Werte oben.
```

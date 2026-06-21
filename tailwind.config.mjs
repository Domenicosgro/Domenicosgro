/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    // Flat Design – keine Rundungen außer full (für kreisförmige Elemente)
    borderRadius: {
      none:    '0',
      sm:      '0',
      DEFAULT: '0',
      md:      '0',
      lg:      '0',
      xl:      '0',
      '2xl':   '0',
      full:    '9999px',
    },
    extend: {
      colors: {
        // brand = Night-Skala (dunkles Blau um #000040)
        brand: {
          50:  '#EAEAF5',
          100: '#C9C9E6',
          200: '#9A9ACC',
          300: '#6A6AB3',
          400: '#3A3A80',
          500: '#1A1A60',
          600: '#000040',   // ← Primärfarbe (Buttons, Headlines)
          700: '#000033',
          800: '#000026',
          900: '#00001A',
        },
        sky:      '#8FBEFF',  // Akzent – Fokus, Highlights, Randstreifen
        light:    '#FBFFE6',  // Seitenhintergrund (warmes Cremeweiß)
        concrete: '#F0F0F0',  // neutrale Fläche, Trenner
        night:    '#000040',  // Alias für Markup-Klarheit
      },
      fontFamily: {
        sans:     ['Yellix', 'Segoe UI', 'Arial', 'system-ui', 'sans-serif'],
        headline: ['Yellix', 'Segoe UI', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

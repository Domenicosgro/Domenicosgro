import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Eindeutige Build-Kennung pro Build – wird ins Bundle eingebacken (__BUILD_ID__)
// UND als dist/version.json ausgeliefert. Der laufende Client vergleicht beide
// und blendet bei Abweichung einen "Neue Version verfügbar"-Banner ein.
const BUILD_ID = process.env.BUILD_ID || String(Date.now())

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'emit-version-json',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ buildId: BUILD_ID }),
        })
      },
    },
  ],
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  // Required for Electron: assets use relative paths (file:// protocol)
  base: './',
  // Drei Einstiege, ein Bundle-Verzeichnis, gemeinsame Chunks, ein Deploy:
  //   index.html           Protokolltool
  //   personalplanung.html eigenständige Personalplanung (/personalplanung)
  //   gelaende.html        einbettbare Gelände-Seite fürs Dashboard (/gelaende)
  build: {
    rollupOptions: {
      input: {
        main:            resolve(__dirname, 'index.html'),
        personalplanung: resolve(__dirname, 'personalplanung.html'),
        gelaende:        resolve(__dirname, 'gelaende.html'),
      },
    },
  },
  optimizeDeps: {
    exclude: ['web-ifc'],
  },
  assetsInclude: ['**/*.wasm'],
})

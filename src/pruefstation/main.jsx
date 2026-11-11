import React from 'react'
import ReactDOM from 'react-dom/client'
import PruefstationApp from './PruefstationApp.jsx'
import '../index.css'

// Eigenständige Anwendung „Prüfstation" – eigener Einstieg, eigene URL
// (/pruefstation), aber derselbe Server, dieselbe Anmeldung und dieselben
// Projekte wie das Protokolltool. Die Dateien liegen im NAS-Ordner, der je
// Prüfvorgang verknüpft wird (server/pruefstation.js).
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PruefstationApp />
  </React.StrictMode>,
)

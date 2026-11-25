import React from 'react'
import ReactDOM from 'react-dom/client'
import BaustelleApp from './BaustelleApp.jsx'
import '../index.css'

// Eigenständige Anwendung „Baustelle" – eigener Einstieg, eigene URL
// (/baustelle), aber derselbe Server, dieselbe Anmeldung und dieselben
// Projekte wie das Protokolltool.
//
// Sie deckt bewusst nicht das ganze Tool ab, sondern das, was auf der
// Baustelle gebraucht wird: Projekt wählen, Tagesbericht der Baudokumentation
// schreiben, fotografieren. Alles andere bleibt am Rechner.
//
// Die Schnittstelle dazu ist schmal gehalten (server/baustelle.js) – nicht aus
// Bequemlichkeit, sondern damit diese Fläche eines Tages nach außen gelegt
// werden kann, ohne das ganze Tool mitzunehmen.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BaustelleApp />
  </React.StrictMode>,
)

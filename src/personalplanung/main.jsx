import React from 'react'
import ReactDOM from 'react-dom/client'
import PersonalplanungApp from './PersonalplanungApp.jsx'
import '../index.css'

// Eigenständige Anwendung „Personalplanung“ – eigener Einstieg, eigene URL
// (/personalplanung), aber derselbe Server und dieselbe Datenbank wie das
// Protokolltool. Projektdaten sind damit ohne Abgleich synchron.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PersonalplanungApp />
  </React.StrictMode>,
)

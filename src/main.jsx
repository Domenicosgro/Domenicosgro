import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { ContactUsageProvider } from './contactUsage.jsx'
import './index.css'

// Tag <body> with the current platform so CSS can target macOS / Windows
if (typeof window !== 'undefined' && window.electronAPI?.platform) {
  document.body.classList.add(`platform-${window.electronAPI.platform}`)
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ContactUsageProvider>
      <App />
    </ContactUsageProvider>
  </React.StrictMode>,
)

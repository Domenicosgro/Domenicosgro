'use strict'

// Server-seitiges PDF-Rendering via System-Chromium (puppeteer-core).
// Läuft NUR im Container, wo Chromium installiert ist (siehe Dockerfile).
// Eine gemeinsame Browser-Instanz wird wiederverwendet; Rendering wird
// serialisiert, damit nie mehrere Chromium-Seiten gleichzeitig den Speicher
// belasten.

const puppeteer = require('puppeteer-core')

const CHROME_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser'
const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',   // /dev/shm im Container oft zu klein
  '--disable-gpu',
  '--no-first-run',
  '--no-zygote',
]

let browserPromise = null
async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: LAUNCH_ARGS,
    }).catch(err => { browserPromise = null; throw err })
  }
  const browser = await browserPromise
  if (!browser.connected) {           // abgestürzt/geschlossen → neu starten
    browserPromise = null
    return getBrowser()
  }
  return browser
}

const A4_MARGIN = { top: '12mm', right: '12mm', bottom: '20mm', left: '12mm' }

// Rendering serialisieren (eine Seite nach der anderen)
let queue = Promise.resolve()
function serialize(task) {
  const run = queue.then(task, task)
  queue = run.catch(() => {})
  return run
}

async function withPage(fn) {
  return serialize(async () => {
    const browser = await getBrowser()
    const page = await browser.newPage()
    try { return await fn(page) }
    finally { try { await page.close() } catch {} }
  })
}

// Rendert einen fertigen HTML-String zu einem PDF-Buffer.
// Externe Netzwerkzugriffe werden blockiert (nur data:/about:) → SSRF-sicher und
// schnell; das Druck-HTML ist ohnehin self-contained (inline-CSS, data:-Bilder).
async function renderHtmlToPdf(html, pdfOpts = {}) {
  return withPage(async (page) => {
    await page.setRequestInterception(true)
    page.on('request', (req) => {
      const u = req.url()
      if (u.startsWith('data:') || u.startsWith('about:') || u.startsWith('blob:')) req.continue()
      else req.abort()
    })
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 })
    return page.pdf({ format: 'A4', printBackground: true, margin: A4_MARGIN, preferCSSPageSize: true, ...pdfOpts })
  })
}

// Rendert eine URL (z. B. die interne Druck-Route der SPA) zu einem PDF-Buffer.
async function renderUrlToPdf(url, pdfOpts = {}) {
  return withPage(async (page) => {
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 45000 })
    // Optionales Ready-Signal der Druckseite abwarten (max. 15 s)
    try {
      await page.waitForFunction('window.__PRINT_READY__ === true', { timeout: 15000 })
    } catch {}
    return page.pdf({ format: 'A4', printBackground: true, margin: A4_MARGIN, ...pdfOpts })
  })
}

module.exports = { getBrowser, renderHtmlToPdf, renderUrlToPdf }

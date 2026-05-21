// Microsoft Graph API calls — Electron main-process only

const https = require('https')

function graphRequest(token, method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const req  = https.request({
      hostname: 'graph.microsoft.com',
      path:     `/v1.0${apiPath}`,
      method,
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, res => {
      let raw = ''
      res.on('data', c => raw += c)
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(raw ? JSON.parse(raw) : {}) } catch { resolve({}) }
        } else {
          let msg = `Graph-Fehler: HTTP ${res.statusCode}`
          try { msg = JSON.parse(raw)?.error?.message || msg } catch {}
          reject(new Error(msg))
        }
      })
    })
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

// Send a mail via /me/sendMail
// attachments: [{ name, contentType, contentBytes (base64) }]
async function sendMail(token, { to, subject, bodyHtml, attachments = [] }) {
  await graphRequest(token, 'POST', '/me/sendMail', {
    message: {
      subject,
      body:         { contentType: 'HTML', content: bodyHtml },
      toRecipients: to.map(a => ({ emailAddress: { address: a } })),
      attachments:  attachments.map(a => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name:           a.name,
        contentType:    a.contentType || 'application/octet-stream',
        contentBytes:   a.contentBytes,
      })),
    },
    saveToSentItems: true,
  })
}

// Create a calendar event via /me/events
// Returns the created event object (includes webLink)
async function createCalendarEvent(token, { subject, startDateTime, endDateTime, location, bodyText, attendees = [] }) {
  return graphRequest(token, 'POST', '/me/events', {
    subject,
    start:     { dateTime: startDateTime, timeZone: 'Europe/Berlin' },
    end:       { dateTime: endDateTime,   timeZone: 'Europe/Berlin' },
    ...(location ? { location: { displayName: location } }               : {}),
    ...(bodyText ? { body: { contentType: 'Text', content: bodyText } }  : {}),
    attendees: attendees.map(a => ({ emailAddress: { address: a }, type: 'required' })),
  })
}

module.exports = { sendMail, createCalendarEvent }

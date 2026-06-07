import { createSign } from 'crypto'

async function getAccessToken() {
  const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
  const now = Math.floor(Date.now() / 1000)

  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/calendar',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  })).toString('base64url')

  const sign = createSign('RSA-SHA256')
  sign.update(`${header}.${payload}`)
  const signature = sign.sign(serviceAccount.private_key, 'base64url')
  const jwt = `${header}.${payload}.${signature}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`Google token error: ${JSON.stringify(data)}`)
  return data.access_token
}

export async function createGoogleCalendarEvent({ booking, client, meetLink }) {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON || !process.env.GOOGLE_CALENDAR_ID) return

  const token = await getAccessToken()

  const [y, mo, d] = booking.date.split('-').map(Number)
  const [h, mi] = booking.start_time.split(':').map(Number)
  const start = new Date(y, mo - 1, d, h, mi)
  const end = new Date(start.getTime() + booking.duration_mins * 60000)

  const fmt = dt => dt.toISOString().replace('Z', '+10:00').slice(0, 19) + '+10:00'

  const event = {
    summary: `${client.name} — ${booking.session_type_name}`,
    description: `Client: ${client.name} (${client.email})\nSession: ${booking.session_type_name}\n\nJoin: ${meetLink}`,
    location: meetLink,
    start: { dateTime: fmt(start), timeZone: 'Australia/Sydney' },
    end: { dateTime: fmt(end), timeZone: 'Australia/Sydney' },
    attendees: [{ email: client.email, displayName: client.name }],
    reminders: { useDefault: true }
  }

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(process.env.GOOGLE_CALENDAR_ID)}/events`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(event)
    }
  )

  if (!res.ok) {
    const err = await res.json()
    console.error('Google Calendar error:', err)
  }
}

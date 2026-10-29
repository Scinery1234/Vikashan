import { supabase } from './supabase.js'
import { createSign } from 'crypto'

// ── Google Calendar free/busy ───────────────────────────────────

async function getGoogleToken() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) return null
  const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600
  })).toString('base64url')
  const sign = createSign('RSA-SHA256')
  sign.update(`${header}.${payload}`)
  const sig = sign.sign(sa.private_key, 'base64url')
  const jwt = `${header}.${payload}.${sig}`
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt })
  })
  const data = await res.json()
  return data.access_token || null
}

async function getGoogleBusyTimes(timeMin, timeMax) {
  const token = await getGoogleToken()
  if (!token || !process.env.GOOGLE_CALENDAR_ID) return []

  const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      timeMin, timeMax,
      timeZone: 'Australia/Sydney',
      items: [{ id: process.env.GOOGLE_CALENDAR_ID }]
    })
  })
  const data = await res.json()
  return data.calendars?.[process.env.GOOGLE_CALENDAR_ID]?.busy || []
}

// ── Outlook calendar busy times ─────────────────────────────────

async function getOutlookToken() {
  if (!process.env.MICROSOFT_CLIENT_ID) return null
  const url = `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.MICROSOFT_CLIENT_ID,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default'
    })
  })
  const data = await res.json()
  return data.access_token || null
}

async function getOutlookBusyTimes(timeMin, timeMax) {
  const token = await getOutlookToken()
  if (!token || !process.env.ADMIN_EMAIL) return []

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${process.env.ADMIN_EMAIL}/calendarView?startDateTime=${timeMin}&endDateTime=${timeMax}&$select=start,end,showAs&$top=100`,
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  )
  const data = await res.json()
  return (data.value || [])
    .filter(e => e.showAs !== 'free' && e.showAs !== 'workingElsewhere')
    .map(e => ({ start: e.start.dateTime + 'Z', end: e.end.dateTime + 'Z' }))
}

// The date and clock time in Sydney. Slots, bookings and blocked times are all
// Sydney local time, and the server (Vercel) runs in UTC.
export function sydneyParts(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(x => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }
}

// ── Main sync function ──────────────────────────────────────────

export async function syncCalendarAvailability() {
  const now = new Date()
  const timeMin = now.toISOString()
  const timeMax = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()

  const [googleBusy, outlookBusy] = await Promise.all([
    getGoogleBusyTimes(timeMin, timeMax).catch(() => []),
    getOutlookBusyTimes(timeMin, timeMax).catch(() => [])
  ])

  // Merge and deduplicate busy windows
  const allBusy = [
    ...googleBusy.map(b => ({ ...b, source: 'google' })),
    ...outlookBusy.map(b => ({ ...b, source: 'outlook' }))
  ]

  if (!allBusy.length) return { synced: 0 }

  // Delete previous calendar-synced blocks for this window
  await supabase
    .from('blocked_times')
    .delete()
    .in('source', ['google', 'outlook', 'both'])
    .gte('date', now.toISOString().slice(0, 10))

  // Insert new blocks
  const rows = allBusy.map(b => {
    const start = sydneyParts(new Date(b.start))
    const end = sydneyParts(new Date(b.end))
    return {
      date: start.date,
      start_time: start.time,
      // an event that runs past midnight blocks the rest of that day
      end_time: end.date === start.date ? end.time : '23:59',
      reason: `Synced from ${b.source}`,
      source: b.source
    }
  })

  const { error } = await supabase.from('blocked_times').insert(rows)
  return { synced: rows.length, error: error?.message }
}

// Small helpers shared by the app and its tools. Text only: nothing here
// builds HTML from user data.
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue
    if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v)
    else if (k === 'style' && typeof v === 'object') for (const [p, val] of Object.entries(v)) el.style.setProperty(p, val)
    else el.setAttribute(k, v === true ? '' : v)
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)))
  }
  return el
}

const pad = n => String(n).padStart(2, '0')
export const todayStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); const x = new Date(y, m - 1, d + n); return todayStr(x) }
export const fmtDay = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }) }
export const addMinutes = (t, mins) => { const [a, b] = t.split(':').map(Number); const x = Math.min(a * 60 + b + mins, 23 * 60 + 59); return `${pad(Math.floor(x / 60))}:${pad(x % 60)}` }
export const words = s => String(s || '').split(/\s+/).filter(Boolean).length

export function download(name, data, type) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.append(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function copyText(text, btn) {
  const old = btn.textContent
  try { await navigator.clipboard.writeText(text); btn.textContent = 'Copied' } catch { btn.textContent = 'Couldn’t copy' }
  setTimeout(() => { btn.textContent = old }, 1600)
}

// ── Calendar ──
const icsEsc = s => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, m => '\\' + m)
const stamp = (date, time) => date.replace(/-/g, '') + 'T' + (time || '09:00').replace(':', '') + '00'

// Every scheduled task (it has a date) as an all-day or timed event.
export function ics(tasks) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Vikashan//New Page//EN', 'CALSCALE:GREGORIAN']
  const now = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'
  for (const t of tasks) {
    if (!t.due) continue
    lines.push('BEGIN:VEVENT', `UID:${t.id}@newpage.vikashan.com.au`, `DTSTAMP:${now}`)
    if (t.start) lines.push(`DTSTART:${stamp(t.due, t.start)}`, `DTEND:${stamp(t.due, addMinutes(t.start, t.mins || 30))}`)
    else lines.push(`DTSTART;VALUE=DATE:${t.due.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${addDays(t.due, 1).replace(/-/g, '')}`)
    lines.push(`SUMMARY:${icsEsc('New Page: ' + t.title)}`, 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:New Page', 'TRIGGER:-PT15M', 'END:VALARM', 'END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

export function gcalUrl(t) {
  const text = encodeURIComponent('New Page: ' + t.title)
  const dates = t.start
    ? `${stamp(t.due, t.start)}/${stamp(t.due, addMinutes(t.start, t.mins || 30))}`
    : `${t.due.replace(/-/g, '')}/${addDays(t.due, 1).replace(/-/g, '')}`
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dates}`
}

// Membership rules for New Page: how long access lasts, how many 1:1 sessions
// are included, and when a session can be booked. Kept apart from the
// handlers so it can be tested without a database.
export const DAY = 24 * 60 * 60 * 1000
export const ACCESS = { '4w': 28 * DAY, '1m': 30 * DAY, '3m': 91 * DAY }
export const MIN_NOTICE_HOURS = 24
export const MAX_DAYS_AHEAD = 60

// A renewal adds a month to whatever is left, or to today if access had already ended.
export function renewedUntil(current, now = Date.now()) {
  const from = current ? Math.max(new Date(current).getTime(), now) : now
  return new Date(from + 30 * DAY).toISOString()
}

export const isExpired = (member, now = Date.now()) => !!member.access_until && new Date(member.access_until).getTime() < now

// Sessions that count against the member's included sessions: anything not cancelled.
export function sessionState(included, bookings) {
  const counted = bookings.filter(b => b.status !== 'cancelled')
  const used = counted.length
  const today = new Date().toISOString().slice(0, 10)
  return {
    included: included ?? 1,
    used,
    remaining: Math.max(0, (included ?? 1) - used),
    upcoming: counted.filter(b => b.date >= today && b.status !== 'completed').map(b => ({ id: b.id, date: b.date, time: String(b.start_time).slice(0, 5), status: b.status })).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  }
}

// The real instant of a Sydney wall-clock time (handles daylight saving).
export function sydneyInstant(date, hour) {
  const [y, m, d] = date.split('-').map(Number)
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Australia/Sydney', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
  const offsetAt = ms => {
    const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map(x => [x.type, Number(x.value)]))
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - ms
  }
  const guess = Date.UTC(y, m - 1, d, hour)
  let t = guess - offsetAt(guess)
  t = guess - offsetAt(t)
  return t
}

// null when fine, otherwise a message the member can read.
export function bookingProblem(date, hour, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || !Number.isInteger(hour) || hour < 0 || hour > 23) return 'Choose a date and time.'
  const start = sydneyInstant(date, hour)
  if (Number.isNaN(start)) return 'Choose a date and time.'
  if (start < now + MIN_NOTICE_HOURS * 60 * 60 * 1000) return `Sessions need at least ${MIN_NOTICE_HOURS} hours’ notice. Please pick a later time.`
  if (start > now + MAX_DAYS_AHEAD * DAY) return `You can book up to ${MAX_DAYS_AHEAD} days ahead.`
  return null
}

export const pad2 = n => String(n).padStart(2, '0')

// Server-side checks for the public booking page. The page decides what to show,
// but the server decides what is allowed: a price, a date or a number of
// sessions sent from a browser is never trusted on its own.
import { getAvailableSlots } from './availability.js'

// Hourly rates in dollars (the same ranges the booking page offers), scaled by session length.
export const TIERS = { full_rate: { min: 150, max: 250 }, accessible: { min: 65, max: 150 }, concession: { min: 25, max: 65 } }
export const UPFRONT_DISCOUNT = 0.10
export const MAX_SESSIONS = 12
// The concession rate is for people Vik has approved. Set to false to let anyone use it.
export const REQUIRE_CONCESSION_APPROVAL = true

export const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))
export const isTime = s => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(s)

// The Sydney date right now.
export const sydneyToday = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(now)

// Lowest and highest price per session, in cents, for a tier and session length.
export function priceRange(tier, durationMins, { upfront = false } = {}) {
  const t = TIERS[tier]
  if (!t) return null
  const factor = (durationMins || 60) / 60
  const lo = Math.round(t.min * factor), hi = Math.round(t.max * factor)
  return { min: (upfront ? Math.round(lo * (1 - UPFRONT_DISCOUNT)) : lo) * 100, max: hi * 100 }
}

// Returns an error message, or null if the booking is acceptable.
//   client: the existing clients row for this email, if any
export function pricingProblem({ sessionType, tier, amountCentsPerSession, sessionsTotal, upfront = false, client = null }) {
  if (sessionType.is_free) return amountCentsPerSession ? 'That session is free.' : null
  if (!Number.isInteger(sessionsTotal) || sessionsTotal < 1 || sessionsTotal > MAX_SESSIONS) return `Choose between 1 and ${MAX_SESSIONS} sessions.`
  const range = priceRange(tier, sessionType.duration_mins, { upfront })
  if (!range) return 'Choose a rate.'
  if (tier === 'concession' && REQUIRE_CONCESSION_APPROVAL && !(client && (client.status === 'concession' || client.concession_rate_cents))) return 'The concession rate is for people Vik has approved. Please choose another rate, or get in touch.'
  if (!Number.isInteger(amountCentsPerSession) || amountCentsPerSession < range.min || amountCentsPerSession > range.max) return 'That price isn’t one of the available rates. Please refresh the page and try again.'
  return null
}

// A date, a time and (unless it's an extra recurring date) a slot that is really open.
export async function slotProblem(date, time, { checkOpen = true, now = new Date() } = {}) {
  if (!isDate(date) || !isTime(time)) return 'That date or time isn’t valid.'
  if (date < sydneyToday(now)) return 'That date has passed.'
  if (!checkOpen) return null
  const { slots } = await getAvailableSlots(date)
  return slots.some(s => s.hour === Number(time.slice(0, 2))) ? null : 'Sorry, that time was just taken or isn’t available. Please pick another.'
}

export function recurProblem(recurDates, sessionsTotal) {
  if (recurDates == null) return null
  if (!Array.isArray(recurDates) || recurDates.length > sessionsTotal || recurDates.some(d => !isDate(d))) return 'Those repeat dates aren’t valid.'
  return null
}

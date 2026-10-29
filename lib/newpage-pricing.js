// All New Page prices live here, on the server. The browser never sends a price.
export const PRICE = { programCents: 50000, hourCents: 25000, renewCents: 50000, maxHours: 8 }

// 0 to 8 whole hours, or null if the input isn't one.
export function cleanHours(v) {
  if (v === undefined || v === null || v === '') return 0
  const n = Number(v)
  return Number.isInteger(n) && n >= 0 && n <= PRICE.maxHours ? n : null
}

export const joinTotalCents = hours => PRICE.programCents + hours * PRICE.hourCents
export const hoursTotalCents = hours => hours * PRICE.hourCents

// Scholarship codes look like NP-1A2B-3C4D-5E6F. People type them in all sorts of ways.
export function normaliseCode(v) {
  const c = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  return /^NP[0-9A-F]{12}$/.test(c) ? `NP-${c.slice(2, 6)}-${c.slice(6, 10)}-${c.slice(10, 14)}` : null
}

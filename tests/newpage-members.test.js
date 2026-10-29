import test from 'node:test'
import assert from 'node:assert/strict'
import { renewedUntil, isExpired, sessionState, sydneyInstant, bookingProblem, ACCESS, DAY } from '../lib/newpage-members.js'

const NOW = Date.UTC(2026, 9, 27, 0, 0) // 27 Oct 2026, 11am Sydney (daylight saving)

test('a renewal adds a month to what is left, or to today if access already ended', () => {
  const future = new Date(NOW + 10 * DAY).toISOString()
  assert.equal(renewedUntil(future, NOW), new Date(NOW + 40 * DAY).toISOString())
  const past = new Date(NOW - 20 * DAY).toISOString()
  assert.equal(renewedUntil(past, NOW), new Date(NOW + 30 * DAY).toISOString())
  assert.equal(renewedUntil(null, NOW), new Date(NOW + 30 * DAY).toISOString())
})

test('access options and expiry', () => {
  assert.equal(ACCESS['4w'], 28 * DAY)
  assert.equal(isExpired({ access_until: null }, NOW), false)
  assert.equal(isExpired({ access_until: new Date(NOW + 1000).toISOString() }, NOW), false)
  assert.equal(isExpired({ access_until: new Date(NOW - 1000).toISOString() }, NOW), true)
})

test('cancelled sessions give the included session back', () => {
  const b = [{ id: 'a', date: '2999-01-01', start_time: '10:00:00', status: 'confirmed' }, { id: 'b', date: '2999-01-02', start_time: '09:00:00', status: 'cancelled' }]
  const s = sessionState(1, b)
  assert.equal(s.used, 1); assert.equal(s.remaining, 0); assert.equal(s.upcoming.length, 1); assert.equal(s.upcoming[0].time, '10:00')
  assert.equal(sessionState(1, [b[1]]).remaining, 1)
  assert.equal(sessionState(3, b).remaining, 2)
  assert.equal(sessionState(undefined, []).remaining, 1)
})

test('Sydney times are right on both sides of daylight saving', () => {
  assert.equal(new Date(sydneyInstant('2026-12-01', 10)).toISOString(), '2026-11-30T23:00:00.000Z') // +11
  assert.equal(new Date(sydneyInstant('2026-07-01', 10)).toISOString(), '2026-07-01T00:00:00.000Z') // +10
})

test('sessions need 24 hours’ notice and cannot be booked far ahead or with junk input', () => {
  assert.match(bookingProblem('2026-10-27', 15, NOW), /24 hours/)
  assert.match(bookingProblem('2026-10-28', 9, NOW), /24 hours/)
  assert.equal(bookingProblem('2026-10-28', 12, NOW), null)
  assert.match(bookingProblem('2027-06-01', 10, NOW), /60 days/)
  assert.match(bookingProblem('tomorrow', 10, NOW), /Choose/)
  assert.match(bookingProblem('2026-11-05', 'x', NOW), /Choose/)
  assert.match(bookingProblem('2026-11-05', 25, NOW), /Choose/)
})

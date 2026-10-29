import test from 'node:test'
import assert from 'node:assert/strict'
process.env.SUPABASE_URL ||= 'http://supabase.test'
process.env.SUPABASE_SERVICE_KEY ||= 'k'
process.env.SUPABASE_ANON_KEY ||= 'k'
const { sydneyParts } = await import('../lib/calendar-sync.js')

test('calendar events are stored in Sydney time, not the server’s UTC', () => {
  // 10:00 am on 3 March 2027 in Sydney (AEDT, UTC+11) is 23:00 on 2 March in UTC
  assert.deepEqual(sydneyParts(new Date('2027-03-02T23:00:00Z')), { date: '2027-03-03', time: '10:00' })
  // in winter (AEST, UTC+10)
  assert.deepEqual(sydneyParts(new Date('2027-07-14T00:30:00Z')), { date: '2027-07-14', time: '10:30' })
  // the day clocks go back (4 April 2027): 2:00 am happens twice
  assert.deepEqual(sydneyParts(new Date('2027-04-03T15:00:00Z')), { date: '2027-04-04', time: '02:00' })
  assert.deepEqual(sydneyParts(new Date('2027-04-03T16:30:00Z')), { date: '2027-04-04', time: '02:30' })
})

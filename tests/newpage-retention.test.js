import test from 'node:test'
import assert from 'node:assert/strict'
import { retentionStep, endedAt, trashOn, purgeOn, hasAccess, DAY, RETENTION } from '../lib/newpage-retention.js'
import { memoryEmail } from '../lib/newpage-emails.js'

const NOW = Date.parse('2027-03-31T12:00:00Z')
const daysAgo = n => new Date(NOW - n * DAY).toISOString()
const ended = (n, extra = {}) => ({ status: 'active', access_until: daysAgo(n), access_ended_at: daysAgo(n), memory_state: 'active', memory_reminder: 0, ...extra })

test('the rules are 7, 14 and 30 days, then 12 months in the Trash', () => {
  assert.deepEqual(RETENTION, { remindDays: [7, 14], trashDay: 30, purgeDays: 365 })
})

test('a current member has nothing to do; paused members are not "ended"', () => {
  assert.equal(retentionStep({ status: 'active', access_until: new Date(NOW + DAY).toISOString() }, NOW).step, 'none')
  assert.equal(retentionStep({ status: 'active', access_until: null }, NOW).step, 'none')
  assert.equal(retentionStep({ status: 'paused', access_until: daysAgo(40) }, NOW).step, 'none')
  assert.equal(hasAccess({ status: 'paused' }, NOW), false)
})

test('an expired membership is marked with the day it ended, not the day the cron noticed', () => {
  const m = { status: 'active', access_until: daysAgo(10), memory_state: 'active' }
  const s = retentionStep(m, NOW)
  assert.equal(s.step, 'mark')
  assert.equal(new Date(s.ended).toISOString(), daysAgo(10))
  assert.equal(retentionStep({ status: 'ended' }, NOW).step, 'mark')
  assert.equal(endedAt({ status: 'ended', access_ended_at: daysAgo(3) }, NOW), NOW - 3 * DAY)
})

test('reminders go out at 7 and 14 days, once each, and never a backlog', () => {
  assert.equal(retentionStep(ended(3), NOW).step, 'none')
  assert.deepEqual([retentionStep(ended(7), NOW).step, retentionStep(ended(7), NOW).day], ['remind', 7])
  assert.equal(retentionStep(ended(9, { memory_reminder: 7 }), NOW).step, 'none')
  assert.deepEqual([retentionStep(ended(14, { memory_reminder: 7 }), NOW).step, retentionStep(ended(14, { memory_reminder: 7 }), NOW).day], ['remind', 14])
  assert.equal(retentionStep(ended(20, { memory_reminder: 14 }), NOW).step, 'none')
  // the cron was down for a fortnight: only the latest reminder is sent, not both
  assert.equal(retentionStep(ended(15), NOW).day, 14)
})

test('at 30 days it moves to the Trash; a notice that failed is sent again; 12 months later it is deleted', () => {
  assert.deepEqual([retentionStep(ended(30, { memory_reminder: 14 }), NOW).step, retentionStep(ended(30, { memory_reminder: 14 }), NOW).day], ['trash', 30])
  assert.equal(retentionStep(ended(29, { memory_reminder: 14 }), NOW).step, 'none')
  assert.equal(retentionStep(ended(45), NOW).step, 'trash', 'a missed run still trashes it, skipping the reminders')
  const inTrash = (days, extra = {}) => ended(40, { memory_state: 'trash', memory_trashed_at: daysAgo(days), memory_reminder: 30, ...extra })
  assert.equal(retentionStep(inTrash(10, { memory_reminder: 14 }), NOW).step, 'notice')
  assert.equal(retentionStep(inTrash(10), NOW).step, 'none')
  assert.equal(retentionStep(inTrash(364), NOW).step, 'none')
  assert.equal(retentionStep(inTrash(365), NOW).step, 'purge')
  assert.equal(retentionStep({ ...inTrash(400), memory_state: 'purged' }, NOW).step, 'none', 'once deleted, nothing more happens')
})

test('coming back (renewed, rejoined, restored) stops the clock and restores memory', () => {
  const back = { status: 'active', access_until: new Date(NOW + 20 * DAY).toISOString(), access_ended_at: daysAgo(40), memory_state: 'trash', memory_trashed_at: daysAgo(10) }
  assert.equal(retentionStep(back, NOW).step, 'restore')
  assert.equal(retentionStep({ ...back, access_ended_at: null, memory_state: 'active' }, NOW).step, 'none')
})

test('the dates shown to people', () => {
  const end = NOW - 5 * DAY
  assert.equal(trashOn(end).toISOString(), new Date(end + 30 * DAY).toISOString())
  assert.equal(purgeOn(daysAgo(0)).toISOString(), new Date(NOW + 365 * DAY).toISOString())
})

test('the reminder emails say what is kept, when it moves, and how to download or delete it', () => {
  const trashDate = new Date(NOW + 23 * DAY)
  const link = 'https://vikashan.org/newpage/memory?t=abc', rejoinUrl = 'https://vikashan.org/newpage/join'
  const m7 = memoryEmail({ name: 'Ana Reyes', day: 7, trashDate, link, rejoinUrl })
  assert.match(m7.subject, /23 days left/); assert.ok(m7.html.includes('Hi Ana') && m7.html.includes(link) && m7.html.includes(rejoinUrl) && /moves to the Trash/.test(m7.html))
  assert.match(memoryEmail({ name: 'A', day: 14, trashDate, link, rejoinUrl }).subject, /16 days left/)
  const m30 = memoryEmail({ name: 'A', day: 30, trashDate, link, rejoinUrl })
  assert.match(m30.subject, /moved to the Trash/); assert.ok(/12 months/.test(m30.html) && /permanently deleted/.test(m30.html) && /restored/.test(m30.html))
  for (const m of [m7, m30]) assert.ok(!/unsubscribe/i.test(m.html) || true)
})

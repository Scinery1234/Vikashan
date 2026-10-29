import test from 'node:test'
import assert from 'node:assert/strict'
import { dueProgramEmail, buildProgramEmail, receiptEmail, PROGRAM_MAILS, RULES } from '../lib/newpage-program-mail.js'
import { applyRows, resetContentForTests } from '../lib/newpage-content.js'

const DAY = 864e5
const START = Date.parse('2027-02-01T00:00:00Z')
const at = n => START + n * DAY + 3600e3 // n days after the start, 1am
const member = (extra = {}) => ({ status: 'active', source: 'purchase', quadrant: 'launch', name: 'Jo Park', plan_started_at: new Date(START).toISOString(), access_until: new Date(START + 28 * DAY).toISOString(), last_login_at: new Date(START).toISOString(), program_emails: true, ...extra })
const due = (n, extra = {}, opts = {}) => dueProgramEmail({ member: member(extra), now: at(n), sessionsRemaining: 1, hasUpcoming: false, sent: [], ...opts })
const row = (kind, n) => ({ kind, sent_at: new Date(at(n)).toISOString() })
// someone who keeps logging in, so the "quiet" rule stays out of the way
const active = n => ({ last_login_at: new Date(at(n)).toISOString() })

test('weekly nudges go out at the start of weeks 2, 3 and 4, once each', () => {
  assert.equal(due(1, active(1)), null, 'nothing in week 1: the welcome email covers it')
  assert.deepEqual([due(7, active(7))?.kind, due(7, active(7))?.week], ['week', 2])
  assert.equal(due(7, active(7), { sent: [row('week-2', 6)] }), null, 'never twice')
  assert.equal(due(14, active(14), { sent: [row('week-2', 7), row('book', 9)] })?.week, 3)
  assert.equal(due(21, active(21), { sent: [row('week-2', 7), row('week-3', 14), row('book', 9)] })?.week, 4)
  assert.equal(due(12, active(12), { sent: [row('week-2', 7), row('book', 9)] }), null, 'mid-week: nothing')
})

test('a missed day does not cause a stale nudge, and weeks are not sent as a backlog', () => {
  assert.equal(due(12, active(12), { sent: [row('book', 9)] }), null, 'week 2 email is not sent on day 12')
  assert.equal(due(22, active(22), { sent: [row('week-2', 7), row('book', 9)] })?.week, 4, 'on day 22 only week 4 is due, not the missed week 3')
})

test('no plan, no week nudges; paused, ended, expired or opted-out members get nothing', () => {
  assert.equal(due(7, { quadrant: null, ...active(7) }), null)
  for (const extra of [{ status: 'paused' }, { status: 'ended' }, { program_emails: false }, { access_until: new Date(at(6)).toISOString() }]) assert.equal(due(7, { ...active(7), ...extra }), null, JSON.stringify(extra))
})

test('book-your-session: from day 9, only if they have a session left and have not booked', () => {
  assert.equal(due(8, active(8), { sent: [row('week-2', 7)] }), null, 'not before day 9')
  assert.equal(due(9, active(9), { sent: [row('week-2', 7)] })?.kind, 'book')
  assert.equal(due(9, active(9), { sent: [row('week-2', 7)], sessionsRemaining: 0 }), null, 'no session left')
  assert.equal(due(9, active(9), { sent: [row('week-2', 7)], hasUpcoming: true }), null, 'already booked')
  assert.equal(due(10, active(10), { sent: [row('week-2', 7), row('book', 9)] }), null, 'once only')
  assert.equal(due(26, { ...active(26), access_until: null }, { sent: [row('week-2', 7), row('week-3', 14), row('week-4', 21)] }), null, 'but not at the very end')
})

test('renewal email two days before access ends; scholarship members get the no-price version', () => {
  const sent = [row('week-2', 7), row('week-3', 14), row('week-4', 21), row('book', 9)]
  assert.equal(due(25, active(25), { sent }), null, 'three days left is too early')
  assert.deepEqual([due(26, active(26), { sent })?.kind, due(26, active(26), { sent })?.daysLeft], ['renew', 2])
  assert.equal(due(26, { ...active(26), source: 'scholarship' }, { sent })?.kind, 'renewScholarship')
  assert.equal(due(27, active(27), { sent: [...sent, row('renew', 26)] }), null, 'once only')
  assert.equal(due(26, { ...active(26), access_until: null }, { sent }), null, 'members with no end date are not asked to renew')
})

test('"gone quiet": after five days without signing in, up to three times, ten days apart, never two emails in two days', () => {
  const stale = { last_login_at: new Date(START).toISOString() }
  assert.equal(due(4, stale), null, 'four days is not quiet yet')
  assert.deepEqual([due(5, stale)?.kind, due(5, stale)?.key], ['quiet', 'quiet-1'])
  assert.equal(due(6, stale, { sent: [row('quiet-1', 5)] }), null, 'not again straight away')
  assert.equal(due(12, stale, { sent: [row('quiet-1', 5), row('week-2', 7), row('book', 9)] }), null, 'a gap of ten days between check-ins')
  assert.equal(due(16, stale, { sent: [row('quiet-1', 5), row('week-2', 7), row('book', 9), row('week-3', 14)] })?.key, 'quiet-2')
  assert.equal(due(20, stale, { sent: [row('quiet-1', 5), row('quiet-2', 16), row('week-2', 7), row('book', 9), row('week-3', 14)] }), null, 'quiet-2 was only four days ago')
  assert.equal(due(18, stale, { sent: [row('week-2', 7), row('week-3', 14), row('book', 9), row('quiet-1', 5), row('quiet-2', 12), row('quiet-3', 15)] }), null, 'three is the most')
  assert.equal(due(2, stale), null, 'not in the first days')
})

test('one email a day at most: two emails are never sent within two days of each other', () => {
  assert.equal(due(7, active(7), { sent: [row('quiet-1', 6)] }), null)
  assert.equal(due(8, active(8), { sent: [row('quiet-1', 7)] }), null)
  assert.equal(due(9, active(9), { sent: [row('week-2', 7)] })?.kind, 'book', 'two days after the last one is fine')
})

test('the emails are built from the member, their week, and wording that can be edited', () => {
  resetContentForTests()
  const m = member()
  const wk = buildProgramEmail({ kind: 'week', key: 'week-2', week: 2 }, { member: m, optOutUrl: 'https://x.test/optout?t=1' })
  assert.match(wk.subject, /^Week 2: /)
  assert.ok(wk.html.includes('Hi Jo') && wk.html.includes('Open this week') && wk.html.includes('https://x.test/optout?t=1') && /Week 2 of New Page starts today/.test(wk.html))
  assert.ok(!wk.html.includes('{week_goal}') && !wk.html.includes('{first_task}'), 'all placeholders are filled')
  const renew = buildProgramEmail({ kind: 'renew', key: 'renew', daysLeft: 2 }, { member: m })
  assert.ok(renew.html.includes('$500') && renew.html.includes('2 days') && /next month is on me/.test(renew.html) && renew.html.includes('30 days'))
  const sch = buildProgramEmail({ kind: 'renewScholarship', key: 'renew', daysLeft: 2 }, { member: member({ source: 'scholarship' }) })
  assert.ok(!sch.html.includes('$500') && /decide together/.test(sch.html))
  assert.ok(/book/i.test(buildProgramEmail({ kind: 'book', key: 'book' }, { member: m }).html))
  assert.ok(/haven’t opened New Page/.test(buildProgramEmail({ kind: 'quiet', key: 'quiet-1' }, { member: m }).html))
  // Vik edits the wording; the next email uses it
  applyRows([{ key: 'pm/quiet', value: { subject: 'Hello again {first}', paras: ['Edited words for {first}.'], button: 'Come back' } }])
  const edited = buildProgramEmail({ kind: 'quiet', key: 'quiet-1' }, { member: m })
  assert.equal(edited.subject, 'Hello again Jo'); assert.ok(edited.html.includes('Edited words for Jo.') && edited.html.includes('Come back'))
  resetContentForTests()
  assert.equal(PROGRAM_MAILS.quiet.subject, 'Checking in')
  // member text is escaped
  const nasty = buildProgramEmail({ kind: 'quiet', key: 'quiet-1' }, { member: member({ name: '<script>x</script> Bob' }) })
  assert.ok(!nasty.html.includes('<script>'))
})

test('the receipt says what was paid and for what, and nothing about tax', () => {
  const r = receiptEmail({ name: 'Jo Park', what: 'New Page: four weeks', amountCents: 50000, date: '2027-02-01T00:00:00Z', ref: 'cs_test_abc', accessUntil: '2027-03-01T00:00:00Z' })
  assert.equal(r.subject, 'Your New Page receipt')
  assert.ok(r.html.includes('$500.00 AUD') && r.html.includes('cs_test_abc') && r.html.includes('Access until') && r.html.includes('New Page: four weeks'))
  assert.ok(!/GST|tax/i.test(r.html))
  assert.equal(RULES.quietMax, 3)
})

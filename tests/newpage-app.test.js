import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.JWT_SECRET = 'test-secret'
process.env.SUPABASE_URL = 'http://supabase.test'
process.env.SUPABASE_SERVICE_KEY = 'k'
process.env.SUPABASE_ANON_KEY = 'k'

const { signMagic, signSession, readToken } = await import('../lib/newpage-auth.js')
const { verifyToken, signToken } = await import('../lib/auth.js')
const { programPosition, cleanCheckin, detectCrisis, planFor, buildMe, CRISIS_REPLY } = await import('../lib/newpage-app.js')
const { coachSystem, toApiMessages, COACH_TOOLS } = await import('../lib/newpage-coach.js')
const { QUADRANTS } = await import('../newpage/quiz-logic.js')

const DAY = 24 * 60 * 60 * 1000
const answers = { s1: 4, s3: 4, s5: 3, s7: 3, s2: 2, s4: 3, s6: 2, s8: 2, sit: 'employed', sat: 2, feel: 2 }
const member = { id: 'm1', email: 'a@b.co', name: 'Sam Lee', quadrant: 'unstick', answers, personal: { block: 'time' }, plan_started_at: new Date(Date.UTC(2026, 9, 1)).toISOString(), source: 'purchase', session_booked: false }

test('a member token is never accepted as an admin token, or the other way round', () => {
  const session = signSession('m1')
  assert.equal(verifyToken(session), null, 'admin check (JWT_SECRET) rejects a member session')
  assert.equal(verifyToken(signMagic('a@b.co')), null, 'admin check rejects a sign-in link')
  const adminToken = signToken({ email: 'vik@x.co', role: 'admin' })
  assert.equal(readToken(adminToken, 'session'), null, 'member check rejects an admin token')
})

test('sign-in link and session are not interchangeable', () => {
  assert.equal(readToken(signMagic('a@b.co'), 'session'), null)
  assert.equal(readToken(signSession('m1'), 'magic'), null)
  assert.equal(readToken(signMagic('a@b.co'), 'magic').email, 'a@b.co')
  assert.equal(readToken(signSession('m1'), 'session').sub, 'm1')
  assert.equal(readToken('garbage', 'session'), null)
})

test('program week follows the start date and stops at week 4', () => {
  const start = Date.UTC(2026, 9, 1)
  assert.deepEqual([programPosition(start, start).day, programPosition(start, start).week], [1, 1])
  assert.equal(programPosition(start, start + 6 * DAY).week, 1)
  assert.equal(programPosition(start, start + 7 * DAY).week, 2)
  assert.equal(programPosition(start, start + 20 * DAY).week, 3)
  assert.equal(programPosition(start, start + 27 * DAY).week, 4)
  assert.equal(programPosition(start, start + 27 * DAY).complete, false)
  const done = programPosition(start, start + 28 * DAY)
  assert.deepEqual([done.week, done.complete, done.daysLeft], [4, true, 0])
  assert.equal(programPosition(start, start - 3 * DAY).week, 1, 'a start date in the future is week 1')
})

test('check-in needs all eight statements and fills in sensible defaults', () => {
  const eight = { s1: 1, s2: 2, s3: 3, s4: 4, s5: 1, s6: 2, s7: 3, s8: 4 }
  const ok = cleanCheckin(eight)
  assert.equal(ok.sit, 'other'); assert.equal(ok.feel, 3)
  assert.equal(cleanCheckin({ ...eight, s8: undefined }), null)
  assert.equal(cleanCheckin({ ...eight, s1: 5 }), null)
  assert.equal(cleanCheckin({ ...eight, sneaky: 'x' }).sneaky, undefined)
  assert.equal(cleanCheckin({ ...eight, feel: 5 }).feel, 5)
  assert.equal(cleanCheckin({ ...eight, feel: 9 }).feel, 3)
  assert.equal(cleanCheckin(null), null)
})

test('crisis words are caught whatever the punctuation', () => {
  assert.ok(detectCrisis('I want to die'))
  assert.ok(detectCrisis("I don’t want to live like this"))
  assert.ok(detectCrisis("I dont want to live"))
  assert.ok(detectCrisis('thinking about SELF-HARM'))
  assert.ok(!detectCrisis('I need a new job and a plan'))
  assert.match(CRISIS_REPLY, /13 11 14/)
})

test('plan for a member has four weeks, tips, and no sales notes in the steps', () => {
  const plan = planFor(member)
  assert.equal(plan.name, 'Unstick'); assert.equal(plan.weeks.length, 4)
  assert.ok(plan.tweaks.some(t => /evenings and weekends/.test(t)))
  assert.equal(planFor({ ...member, quadrant: null }), null)
})

test('me payload: current week, step progress, session window, and dot position', () => {
  const now = Date.UTC(2026, 9, 10) // day 10, week 2
  const me = buildMe({ member, progress: [{ week: 2, step: 0 }, { week: 1, step: 1 }], tasks: [], checkins: [], memory: [], messages: [], now, coachOn: true })
  assert.equal(me.program.week, 2)
  assert.equal(me.program.doneThisWeek, 1)
  assert.equal(me.program.totalThisWeek, QUADRANTS.unstick.weeks[1].steps.length)
  assert.equal(me.program.sessionWindow, true)
  assert.ok(me.progress.includes('2-0') && me.progress.includes('1-1'))
  assert.deepEqual(me.position, { x: 33, y: 83 }, 'no check-in yet: position comes from the quiz result')
  const later = buildMe({ member, progress: [], tasks: [], checkins: [{ clarity: 16, capacity: 16, quadrant: 'launch', created_at: 'x' }], memory: [], messages: [], now })
  assert.deepEqual(later.position, { x: 100, y: 100 })
  assert.equal(buildMe({ member: { ...member, quadrant: null, answers: null }, progress: [], tasks: [], checkins: [], memory: [], messages: [], now }).plan, null)
  assert.equal(buildMe({ member, progress: [], tasks: [], checkins: [], memory: [], messages: [], now: Date.UTC(2026, 9, 3) }).program.sessionWindow, false)
})

test('coach prompt carries the plan, week, tasks and notes, and the safety rules', () => {
  const sys = coachSystem({
    member, now: Date.UTC(2026, 9, 10),
    tasks: [{ title: 'Update resume', due: '2026-10-12', done: false }, { title: 'Old thing', done: true }],
    memory: [{ note: 'Wants a policy role.' }]
  })
  assert.match(sys, /Unstick/); assert.match(sys, /week 2/); assert.match(sys, /Find your reason/); assert.match(sys, /featured tool is the Compass/)
  assert.match(sys, /Update resume \(due 2026-10-12\)/); assert.ok(!/Old thing/.test(sys))
  assert.match(sys, /Wants a policy role/)
  assert.match(sys, /13 11 14/); assert.match(sys, /You are an AI/); assert.match(sys, /not therapy/)
  assert.deepEqual(COACH_TOOLS.map(t => t.name), ['save_memory', 'add_task'])
})

test('conversation history is sent as alternating turns starting with the member', () => {
  const msgs = toApiMessages([
    { role: 'assistant', content: 'old greeting' },
    { role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' },
    { role: 'user', content: 'one' }, { role: 'user', content: 'two' }
  ], 'three')
  assert.equal(msgs[0].role, 'user')
  assert.deepEqual(msgs.map(m => m.role), ['user', 'assistant', 'user'])
  assert.equal(msgs[2].content, 'one\n\ntwo\n\nthree')
  assert.equal(toApiMessages([], 'hello').length, 1)
})

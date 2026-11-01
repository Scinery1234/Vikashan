import test from 'node:test'
import assert from 'node:assert/strict'
process.env.SUPABASE_URL ||= 'http://supabase.test'
process.env.SUPABASE_SERVICE_KEY ||= 'k'
process.env.SUPABASE_ANON_KEY ||= 'k'
const { toolsSessionParams } = await import('../lib/newpage-stripe.js')
const { PRICE } = await import('../lib/newpage-pricing.js')
const { TOOLS_CAPS, monthKey, isTools } = await import('../lib/newpage-usage.js')
const { coachSystem } = await import('../lib/newpage-coach.js')
const { toolsWelcomeEmail } = await import('../lib/newpage-emails.js')
const { buildMe } = await import('../lib/newpage-app.js')

test('the tools membership is a $25 monthly Stripe subscription, priced on the server', () => {
  const p = toolsSessionParams({ email: 'a@b.co', name: 'Ana' })
  assert.equal(p.mode, 'subscription')
  assert.equal(p.line_items[0].price_data.unit_amount, 2500)
  assert.equal(PRICE.toolsCents, 2500)
  assert.deepEqual(p.line_items[0].price_data.recurring, { interval: 'month' })
  assert.equal(p.metadata.kind, 'newpage_tools')
  assert.equal(p.subscription_data.metadata.kind, 'newpage_tools', 'the subscription carries the kind, so later invoices can be matched')
  assert.match(p.success_url, /join\?done=1&sid=/)
})

test('fair-use limits: 300 messages, 3 resumes, 150 tailored, 100 cover letters a month, Sydney months', () => {
  assert.deepEqual(TOOLS_CAPS, { messages: 300, resumes: 3, tailored: 150, covers: 100 })
  assert.equal(monthKey(new Date('2027-03-31T14:30:00Z')), '2027-04', 'half past midnight on 1 April in Sydney is April')
  assert.equal(monthKey(new Date('2027-03-31T12:00:00Z')), '2027-03')
  assert.ok(isTools({ source: 'tools' }) && !isTools({ source: 'purchase' }) && !isTools(null))
})

test('Sky knows a tools member has no program weeks or 1:1, and points to a human coach', () => {
  const sys = coachSystem({ member: { name: 'Ana', source: 'tools', quadrant: 'launch', plan_started_at: new Date().toISOString() }, tasks: [], memory: [], coach: 'career' })
  assert.ok(/Sky and the tools member/.test(sys) && /no program weeks/.test(sys) && /human coach/.test(sys))
  assert.ok(!/week 1 of 4/.test(sys) && !/This week's tasks/.test(sys))
  const prog = coachSystem({ member: { name: 'Jo', source: 'purchase', quadrant: 'launch', plan_started_at: new Date().toISOString() }, tasks: [], memory: [], coach: 'career' })
  assert.ok(/week 1 of 4/.test(prog))
})

test('the app payload marks the plan, hides buying, and the welcome email does not sell a 1:1 by name', () => {
  const base = { progress: [], tasks: [], goals: [], checkins: [], memory: [], messages: [] }
  const t = buildMe({ member: { id: 'x', email: 'a@b.co', source: 'tools', cancel_at: '2027-02-01T00:00:00Z', plan_started_at: new Date().toISOString() }, ...base })
  assert.equal(t.member.plan, 'tools'); assert.equal(t.member.canBuy, false); assert.equal(t.member.cancelAt, '2027-02-01T00:00:00Z')
  const p = buildMe({ member: { id: 'y', email: 'b@b.co', source: 'purchase', plan_started_at: new Date().toISOString() }, ...base })
  assert.equal(p.member.plan, 'program'); assert.equal(p.member.canBuy, true)
  const mail = toolsWelcomeEmail({ name: 'Ana Reyes', link: 'https://x/app?t=1' })
  assert.match(mail.subject, /Sky and the tools/)
  assert.ok(mail.html.includes('300 messages') && mail.html.includes('3 resumes') && mail.html.includes('100 cover letters') && mail.html.includes('150 resumes tailored') && /human coach/.test(mail.html))
  assert.ok(!/Vik/.test(mail.html), 'the tools welcome email does not name Vik')
})

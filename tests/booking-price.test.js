import test from 'node:test'
import assert from 'node:assert/strict'
process.env.SUPABASE_URL ||= 'http://supabase.test'
process.env.SUPABASE_SERVICE_KEY ||= 'k'
process.env.SUPABASE_ANON_KEY ||= 'k'
const { priceRange, pricingProblem, slotProblem, recurProblem, isDate, isTime, sydneyToday, MAX_SESSIONS } = await import('../lib/booking-price.js')

const paid = { is_free: false, duration_mins: 60 }
const ok = (over = {}) => pricingProblem({ sessionType: paid, tier: 'full_rate', amountCentsPerSession: 20000, sessionsTotal: 3, upfront: false, client: null, ...over })

test('rates match what the booking page offers, scaled by session length', () => {
  assert.deepEqual(priceRange('full_rate', 60), { min: 15000, max: 25000 })
  assert.deepEqual(priceRange('accessible', 90), { min: 9800, max: 22500 })
  assert.deepEqual(priceRange('concession', 60), { min: 2500, max: 6500 })
  assert.deepEqual(priceRange('full_rate', 60, { upfront: true }), { min: 13500, max: 25000 }, 'upfront payers get 10% off the bottom of the range')
  assert.equal(priceRange('mystery', 60), null)
})

test('a price sent from the browser is only accepted inside the allowed range', () => {
  assert.equal(ok(), null)
  assert.match(ok({ amountCentsPerSession: 100 }), /isn’t one of the available rates/)
  assert.match(ok({ amountCentsPerSession: 0 }), /isn’t one of the available rates/)
  assert.match(ok({ amountCentsPerSession: 99999999 }), /isn’t one of the available rates/)
  assert.match(ok({ amountCentsPerSession: 14999 }), /isn’t one of the available rates/)
  assert.match(ok({ amountCentsPerSession: 20000.5 }), /isn’t one of the available rates/)
  assert.match(ok({ amountCentsPerSession: '20000' }), /isn’t one of the available rates/)
  assert.match(ok({ amountCentsPerSession: -20000 }), /isn’t one of the available rates/)
  assert.equal(ok({ amountCentsPerSession: 13500, upfront: true }), null, 'the upfront discount is allowed when paying upfront')
  assert.match(ok({ amountCentsPerSession: 13500, upfront: false }), /available rates/, 'but not on a payment plan')
  assert.match(ok({ tier: 'made-up' }), /Choose a rate/)
})

test('the number of sessions is limited', () => {
  for (const n of [0, -1, 1.5, MAX_SESSIONS + 1, '3', null]) assert.match(ok({ sessionsTotal: n }), /Choose between 1 and/)
  assert.equal(ok({ sessionsTotal: MAX_SESSIONS }), null)
})

test('the concession rate is only for approved clients', () => {
  const asked = { tier: 'concession', amountCentsPerSession: 3000 }
  assert.match(ok(asked), /approved/)
  assert.match(ok({ ...asked, client: { status: 'lead' } }), /approved/)
  assert.equal(ok({ ...asked, client: { status: 'concession' } }), null)
  assert.equal(ok({ ...asked, client: { status: 'active', concession_rate_cents: 3000 } }), null)
  assert.match(ok({ ...asked, amountCentsPerSession: 1000, client: { status: 'concession' } }), /available rates/, 'and still within the concession range')
})

test('a free session is free, and a paid one cannot be booked as free', () => {
  const free = { is_free: true, duration_mins: 20 }
  assert.equal(pricingProblem({ sessionType: free, tier: 'free', amountCentsPerSession: 0, sessionsTotal: 1 }), null)
  assert.match(pricingProblem({ sessionType: free, tier: 'free', amountCentsPerSession: 5000, sessionsTotal: 1 }), /free/)
})

test('dates, times and repeat dates are checked', async () => {
  assert.ok(isDate('2027-03-02') && !isDate('2027-3-2') && !isDate('x') && !isDate(20270302) && !isDate('2027-13-45'))
  assert.ok(isTime('10:00') && isTime('09:30:00') && !isTime('25:00') && !isTime('10') && !isTime(null))
  assert.match(await slotProblem('nope', '10:00'), /isn’t valid/)
  assert.match(await slotProblem('2027-03-02', '99:99'), /isn’t valid/)
  assert.match(await slotProblem('2020-01-01', '10:00'), /has passed/)
  assert.equal(sydneyToday(new Date('2027-03-02T23:30:00Z')), '2027-03-03', 'today is the Sydney date')
  assert.equal(await slotProblem('2020-01-01', '10:00', { checkOpen: false, now: new Date('2019-01-01') }), null)
  assert.equal(recurProblem(null, 3), null)
  assert.equal(recurProblem(['2027-03-02', '2027-03-09'], 3), null)
  assert.match(recurProblem(['2027-03-02', 'bad'], 3), /aren’t valid/)
  assert.match(recurProblem(['2027-03-02', '2027-03-09', '2027-03-16', '2027-03-23'], 3), /aren’t valid/)
  assert.match(recurProblem('x', 3), /aren’t valid/)
})

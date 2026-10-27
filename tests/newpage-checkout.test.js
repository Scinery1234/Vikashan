import test from 'node:test'
import assert from 'node:assert/strict'
process.env.NEXT_PUBLIC_URL = 'https://example.org'
process.env.STRIPE_SECRET_KEY = 'sk_test_x'
const { PRICE, cleanHours, joinTotalCents, normaliseCode } = await import('../lib/newpage-pricing.js')
const { joinSessionParams, renewSessionParams, hoursSessionParams } = await import('../lib/newpage-stripe.js')

test('prices are fixed on the server', () => {
  assert.deepEqual(PRICE, { programCents: 50000, hourCents: 25000, renewCents: 50000, maxHours: 8 })
  assert.equal(joinTotalCents(0), 50000)
  assert.equal(joinTotalCents(3), 125000)
  assert.equal(joinTotalCents(8), 250000)
})

test('extra hours must be a whole number from 0 to 8', () => {
  for (const ok of [0, 1, 8, '3', undefined, '', null]) assert.notEqual(cleanHours(ok), null, String(ok))
  for (const bad of [-1, 9, 1.5, 'abc', NaN, '100', {}]) assert.equal(cleanHours(bad), null, String(bad))
  assert.equal(cleanHours(undefined), 0)
  assert.equal(cleanHours('3'), 3)
})

test('scholarship codes are accepted however they are typed', () => {
  assert.equal(normaliseCode('np-1a2b-3c4d-5e6f'), 'NP-1A2B-3C4D-5E6F')
  assert.equal(normaliseCode('  NP1A2B3C4D5E6F '), 'NP-1A2B-3C4D-5E6F')
  for (const bad of ['', null, 'NP-1234', 'XX-1A2B-3C4D-5E6F', 'NP-1A2B-3C4D-5E6G', "NP-1A2B-3C4D-5E6F'; drop"]) assert.equal(normaliseCode(bad), null, String(bad))
})

test('the join checkout charges $500 plus $250 an hour, in AUD, with the details Stripe sends back', () => {
  const p = joinSessionParams({ email: 'a@b.co', name: 'Sam', hours: 2 })
  assert.equal(p.mode, 'payment')
  assert.equal(p.customer_email, 'a@b.co')
  assert.deepEqual(p.line_items.map(l => [l.price_data.unit_amount, l.quantity, l.price_data.currency]), [[50000, 1, 'aud'], [25000, 2, 'aud']])
  assert.equal(p.metadata.kind, 'newpage_join')
  assert.equal(p.metadata.hours, '2')
  assert.equal(p.payment_intent_data.metadata.kind, 'newpage_join')
  assert.equal(p.success_url, 'https://example.org/newpage/join?done=1&sid={CHECKOUT_SESSION_ID}')
  assert.equal(joinSessionParams({ email: 'a@b.co', name: '', hours: 0 }).line_items.length, 1)
})

test('renewal and extra hours checkouts', () => {
  const r = renewSessionParams({ member: { id: 'm1', email: 'a@b.co' } })
  assert.equal(r.line_items[0].price_data.unit_amount, 50000)
  assert.equal(r.metadata.memberId, 'm1')
  const h = hoursSessionParams({ member: { id: 'm1', email: 'a@b.co' }, hours: 3 })
  assert.deepEqual([h.line_items[0].price_data.unit_amount, h.line_items[0].quantity], [25000, 3])
  assert.equal(h.metadata.hours, '3')
})

test('the welcome email has a one-click sign-in link and explains the first steps', async () => {
  process.env.JWT_SECRET = 'x'
  const { memberWelcomeEmail } = await import('../lib/newpage-emails.js')
  const withPlan = memberWelcomeEmail({ name: 'Sam <b>', link: 'https://example.org/newpage/app?t=abc', hasPlan: true })
  assert.ok(withPlan.html.includes('href="https://example.org/newpage/app?t=abc"'))
  assert.ok(withPlan.html.includes('Your first 15 minutes') && withPlan.html.includes('1:1 session') && withPlan.html.includes('13 11 14') && withPlan.html.includes('full refund'))
  assert.ok(withPlan.html.includes('plan is already there') && !withPlan.html.includes('2-minute check-in. It places'))
  assert.ok(!withPlan.html.includes('Sam <b>') && withPlan.html.includes('Sam'))
  assert.ok(memberWelcomeEmail({ name: 'Sam' }).html.includes('2-minute check-in'))
})

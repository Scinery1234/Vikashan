// Career Reading service and API on Vercel: the cast, submitting, payment,
// writing in batches across function runs, retries, and the handler's guards.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

process.env.SUPABASE_URL = 'http://supabase.test'
process.env.SUPABASE_SERVICE_KEY = 'k'
process.env.SUPABASE_ANON_KEY = 'k'
process.env.CRON_SECRET = 'cron-secret'

const { createReadingService, ReadingError } = await import('../lib/reading/service.js')
const { memoryStore } = await import('../lib/reading/store.js')
const { default: handler } = await import('../api/reading.js')

const sample = JSON.parse(fs.readFileSync(new URL('./fixtures/reading-input.json', import.meta.url)))
const submission = (extra = {}) => ({ person: sample.person, answers: sample.answers, question: sample.question.text, email: 'jordan@example.com', ...extra })

// A value that satisfies a step's JSON schema (arrays of seven, so every card gets one).
const fill = (s, tag) => s.type === 'object' ? Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, fill(v, tag + '.' + k)]))
  : s.type === 'array' ? Array.from({ length: 7 }, () => fill(s.items, tag)) : s.type === 'integer' ? 1 : 'OUT<' + tag + '>'

function setup({ env = {}, runner, stripe = null } = {}) {
  const store = memoryStore(), kicks = [], mails = [], calls = []
  const svc = createReadingService({
    store, stripe, env, log: { error() {}, log() {} },
    runner: runner || (async st => { calls.push(st); return fill(st.schema, 's') }),
    mail: async m => { mails.push(m) },
    getSeed: async () => ({ seed: 2093188945 }),
    siteUrl: 'https://reading.vikashan.org',
    kick: async id => { kicks.push(id) }
  })
  return { svc, store, kicks, mails, calls }
}
async function writeAll(svc, id, opts = { budgetMs: 600000, stepMs: 0 }) {
  for (let i = 0; i < 50; i++) { const r = await svc.work(id, opts); if (r !== 'more') return r }
  return 'stuck'
}

test('free mode: cast, submit, write the whole reading, email the link', async () => {
  const { svc, store, kicks, mails, calls } = setup({ env: { READING_FREE: '1' } })
  const { id } = await svc.cast()
  assert.deepEqual(Object.keys(await svc.status(id)).sort(), ['castAt', 'id', 'status'], 'nothing about the draw before the question')

  await assert.rejects(svc.submit(id, submission({ question: 'short' })), e => e.code === 'question_too_short')
  await assert.rejects(svc.submit(id, submission({ email: 'nope' })), e => e.code === 'invalid_email')
  await assert.rejects(svc.submit(id, submission({ answers: { ...sample.answers, statements: [1] } })), e => e.status === 400)

  const sub = await svc.submit(id, submission())
  assert.equal(sub.status, 'queued')
  assert.deepEqual(kicks, [id], 'the first batch is started straight away')
  await assert.rejects(svc.submit(id, submission()), e => e.code === 'already_submitted')

  assert.equal(await writeAll(svc, id), 'done')
  const st = await svc.status(id)
  assert.equal(st.status, 'done')
  assert.equal(st.progress.done, st.progress.total)
  assert.match(st.report, /## 14\. Your tailored 4-week plan: Unstick/)
  assert.match(st.report, /OUT<s\.short>/)
  assert.doesNotMatch(st.report, /couldn't be written|Not generated yet/)
  assert.ok(!calls.some(c => (c.system + c.user).includes('Elise')), 'the birth name never reaches the AI')
  assert.equal(mails[0].to, 'jordan@example.com')
  assert.match(mails[0].text, new RegExp('https://reading.vikashan.org/r/' + id))
  assert.equal((await store.get(id)).lease_until, null, 'the lease is released')
  assert.equal(await svc.report(id), st.report)
})

test('writing is split into batches that each stop before their time runs out', async () => {
  const slow = async st => { await new Promise(r => setTimeout(r, 40)); return fill(st.schema, 's') }
  const { svc, store } = setup({ env: { READING_FREE: '1', READING_CONCURRENCY: '2' }, runner: slow })
  const { id } = await svc.cast()
  await svc.submit(id, submission())
  const first = await svc.work(id, { budgetMs: 2500, stepMs: 0 })   // the charts take about a second; then ~2 steps every 40 ms
  assert.equal(first, 'more')
  const mid = await store.get(id)
  assert.ok(mid.progress.done > 0 && mid.progress.done < mid.progress.total, `partly written: ${mid.progress.done}/${mid.progress.total}`)
  assert.equal(mid.status, 'running')
  assert.deepEqual(await store.stalled(), [id], 'a reading between batches is picked up by the sweep')

  // A second batch can't start while one holds the lease.
  await store.update(id, { lease_until: new Date(Date.now() + 60000).toISOString() })
  assert.equal(await svc.work(id, { budgetMs: 60, stepMs: 0 }), 'busy')
  await store.update(id, { lease_until: null })
  assert.equal(await writeAll(svc, id), 'done')
})

test('a step that keeps failing is retried, then left out; many failures stop the reading, and retry() resumes it', async () => {
  let n = 0
  const flaky = async st => { if (st.id === 'answer') throw new Error('boom'); n++; return fill(st.schema, 's') }
  const one = setup({ env: { READING_FREE: '1' }, runner: flaky })
  const a = await one.svc.cast()
  await one.svc.submit(a.id, submission())
  assert.equal(await writeAll(one.svc, a.id), 'done')
  const ra = await one.store.get(a.id)
  assert.equal(ra.outputs.answer.attempts, 3)
  assert.match(ra.report, /This part couldn't be written this time\./)

  let broken = true
  const down = async st => { if (broken && st.stage === 'C') throw new Error('down'); return fill(st.schema, 's') }
  const two = setup({ env: { READING_FREE: '1' }, runner: down })
  const b = await two.svc.cast()
  await two.svc.submit(b.id, submission())
  assert.equal(await writeAll(two.svc, b.id), 'failed')
  assert.equal((await two.svc.status(b.id)).error, 'generation_failed')
  broken = false
  two.kicks.length = 0
  assert.equal((await two.svc.retry(b.id)).status, 'queued')
  assert.deepEqual(two.kicks, [b.id])
  assert.equal(await writeAll(two.svc, b.id), 'done')
  await assert.rejects(two.svc.retry(b.id), e => e.code === 'not_failed')
})

test('paid mode: one-off Stripe checkout without an account; the webhook queues the reading once', async () => {
  const sessions = []
  const stripe = { checkout: { sessions: { create: async s => { sessions.push(s); return { id: 'cs_' + sessions.length, url: 'https://checkout.stripe.test/' + sessions.length } } } } }
  const { svc, store, kicks } = setup({ stripe, env: { READING_PRICE_CENTS: '5900' } })
  assert.deepEqual(svc.price(), { amount: 5900, currency: 'aud' })
  const { id } = await svc.cast()
  const sub = await svc.submit(id, submission())
  assert.equal(sub.status, 'awaiting_payment')
  assert.equal(sub.checkoutUrl, 'https://checkout.stripe.test/1')
  const s = sessions[0]
  assert.equal(s.mode, 'payment')
  assert.equal(s.line_items[0].price_data.unit_amount, 5900)
  assert.equal(s.metadata.reading_id, id)
  assert.equal(s.payment_intent_data.metadata.kind, 'career_reading', 'the payment intent is marked too, so the booking webhook leaves it alone')
  assert.equal(s.customer_email, 'jordan@example.com')
  assert.equal(s.success_url, `https://reading.vikashan.org/r/${id}?checkout=success`)
  assert.equal(await svc.checkout(id), 'https://checkout.stripe.test/2')
  assert.equal((await store.get(id)).stripe_session, 'cs_2')
  assert.equal(kicks.length, 0, 'nothing is written before payment')

  assert.equal(await svc.paid(id, {}), 'career_reading_started')
  assert.deepEqual(kicks, [id])
  assert.equal(await svc.paid(id, {}), 'career_reading_already')
  assert.equal(await svc.paid('not-an-id', {}), 'career_reading_unknown')
  await assert.rejects(svc.checkout(id), e => e.code === 'not_awaiting_payment')

  const off = setup()
  const c = await off.svc.cast()
  await assert.rejects(off.svc.submit(c.id, submission()), e => e.code === 'payments_off')
})

// ── The handler ──
function fakeRes() {
  const r = { code: 200, headers: {}, body: undefined }
  r.status = c => { r.code = c; return r }
  r.json = b => { r.body = b; return r }
  r.send = b => { r.body = b; return r }
  r.end = () => r
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v }
  return r
}
const req = (method, query, extra = {}) => ({ method, query, headers: { 'x-forwarded-for': '10.0.0.' + Math.floor(Math.random() * 250), ...(extra.headers || {}) }, body: extra.body })

test('handler: public routes, the internal batch route and the cron sweep', async () => {
  const { svc } = setup({ env: { READING_FREE: '1' } })
  const run = async (method, query, extra) => { const res = fakeRes(); await handler(req(method, query, extra), res, svc); return res }

  assert.deepEqual((await run('GET', { op: 'config' })).body, { price: null, free: true })
  assert.equal((await run('GET', { op: 'places', q: 'springfield mo' })).body[0].label, 'Springfield, Missouri, United States')
  assert.equal((await run('GET', { op: 'status', id: 'nope' })).code, 404)
  assert.equal((await run('GET', { op: 'cast' })).code, 405)
  const cast = await run('POST', { op: 'cast' })
  const id = cast.body.id
  assert.equal((await run('POST', { op: 'submit', id }, { body: submission() })).body.status, 'queued')

  assert.equal((await run('POST', { op: 'work', id })).code, 401, 'only the site itself can start a batch')
  const unswept = await run('GET', {})
  assert.equal(unswept.code, 405, 'no sweep without the cron secret')
  assert.equal(unswept.body.swept, undefined)
  const auth = { headers: { authorization: 'Bearer cron-secret' } }
  assert.deepEqual((await run('GET', {}, auth)).body, { swept: 1 })
  assert.equal((await run('POST', { op: 'work', id }, auth)).body.result, 'done')

  const md = await run('GET', { op: 'report', id })
  assert.equal(md.headers['content-type'], 'text/markdown; charset=utf-8')
  assert.match(md.headers['content-disposition'], /attachment/)
  assert.match(md.body, /^# Your Career Reading/)
  assert.ok(ReadingError)
})

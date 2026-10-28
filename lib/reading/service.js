// Career Readings from cast to finished report, built for Vercel functions.
//
//   cast()    the draw is cast on the server and sealed; a reading record is made.
//   submit()  answers, birth details and question arrive after the cast and are
//             validated by preparing the reading once. Then Stripe checkout, or
//             (READING_FREE=1) straight to the queue.
//   paid()    the Stripe webhook confirms payment and queues the reading.
//   work()    writes one batch of the reading's steps within a time budget and
//             saves them. If steps are left, the caller starts the next batch;
//             a per-minute cron (sweep) restarts anything that stalls.
//
// Each step is one fresh prompt built from calculated data (see pipeline.js):
// never from another step's text.
import { prepare, buildSteps, ReadingInputError } from './pipeline.js'
import { renderMarkdown } from './render.js'
import { QuizError } from '../../reading/shared/quiz.js'
import { ChartInputError } from './astro.js'

export class ReadingError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code }
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/
const ID_RE = /^[0-9a-f-]{36}$/i
const clip = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '')
const MAX_ATTEMPTS = 3

// deps: store, runner (step → JSON), mail({to, subject, html, text}) or null,
// stripe (or null), getSeed, siteUrl, kick(id) to start a batch, env, log
export function createReadingService({ store, runner, mail, stripe, getSeed, siteUrl, kick, env = process.env, log = console }) {
  const free = env.READING_FREE === '1'
  const keepDays = Number(env.READING_KEEP_DAYS) || 90
  const concurrency = Number(env.READING_CONCURRENCY) || 8
  const price = { amount: Number(env.READING_PRICE_CENTS) || 4900, currency: (env.READING_CURRENCY || 'aud').toLowerCase() }
  const link = id => siteUrl.replace(/\/+$/, '') + '/r/' + id

  // Only what the person should see at each stage: nothing about the draw before the question.
  function view(r) {
    const v = { id: r.id, status: r.status, castAt: r.cast_at }
    if (r.status === 'cast') return v
    Object.assign(v, { askedAt: r.asked_at, progress: r.progress || null, email: !!r.email })
    if (r.status === 'done') v.report = r.report
    if (r.status === 'failed') v.error = 'generation_failed'
    return v
  }

  async function get(id) {
    if (!ID_RE.test(String(id || ''))) throw new ReadingError(404, 'not_found')
    const r = await store.get(id)
    if (!r) throw new ReadingError(404, 'not_found')
    return r
  }

  function cleanPerson(p = {}) {
    const out = {
      birthName: clip(p.birthName, 100), name: clip(p.name, 60), date: clip(p.date, 10), time: clip(p.time, 5) || '12:00',
      tz: clip(p.tz, 60), place: clip(p.place, 120), timeUnknown: !!p.timeUnknown
    }
    if (p.lat != null && p.lon != null) { out.lat = Number(p.lat); out.lon = Number(p.lon) }
    return out
  }

  async function checkoutUrl(r) {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ quantity: 1, price_data: { currency: price.currency, unit_amount: price.amount, product_data: { name: 'Career Reading', description: 'Your work style, a draw cast before your question, five birth charts read for your career, the next 30 days and a tailored 4-week plan.' } } }],
      metadata: { kind: 'career_reading', reading_id: r.id },
      payment_intent_data: { metadata: { kind: 'career_reading', reading_id: r.id } },
      ...(r.email ? { customer_email: r.email } : {}),
      allow_promotion_codes: true,
      success_url: link(r.id) + '?checkout=success',
      cancel_url: link(r.id) + '?checkout=cancelled'
    })
    await store.update(r.id, { stripe_session: session.id })
    return session.url
  }

  async function sendReady(r) {
    if (!r.email || !mail) return
    const url = link(r.id)
    try {
      await mail({
        to: r.email, subject: 'Your Career Reading is ready',
        text: `Your Career Reading is ready:\n${url}\n\nKeep this link private: anyone with it can open your reading. It's kept for ${keepDays} days.\n\nCoaching, not therapy. In crisis? Call Lifeline on 13 11 14, any time.`,
        html: `<p>Your Career Reading is ready.</p><p><a href="${url}">Open your reading</a></p><p>Keep this link private: anyone with it can open your reading. It's kept for ${keepDays} days.</p><p style="color:#56607A;font-size:13px">Coaching, not therapy. In crisis? Call Lifeline on 13 11 14, any time.</p>`
      })
    } catch (err) { log.error('Career Reading email failed:', err.message || err) }
  }

  // One batch: run steps until the time budget is nearly spent, then save.
  async function work(id, { budgetMs, stepMs = 90000 }) {
    const started = Date.now()
    const r = await store.claim(id, budgetMs + 60000)
    if (!r) return 'busy'
    const ctx = prepare({ ...r.input, draw: { seed: r.seed, castAt: r.cast_at }, question: { text: r.input.question.text, askedAt: r.asked_at } })
    const steps = buildSteps(ctx)
    const outputs = { ...(r.outputs || {}) }
    const done = s => outputs[s.id] && !outputs[s.id].error
    const spent = s => outputs[s.id] && outputs[s.id].error && (outputs[s.id].attempts || 0) >= MAX_ATTEMPTS
    const total = steps.length
    const count = () => steps.filter(done).length
    const queue = steps.filter(s => !done(s) && !spent(s))
    const stopAt = started + budgetMs - stepMs
    let lastSave = Date.now()
    const save = async (force, extra = {}) => {
      if (!force && Date.now() - lastSave < 4000) return
      lastSave = Date.now()
      await store.update(id, { outputs, progress: { done: count(), total }, ...extra })
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (queue.length && Date.now() < stopAt) {
        const st = queue.shift()
        try { outputs[st.id] = await runner(st) }
        catch (err) {
          const attempts = ((outputs[st.id] && outputs[st.id].attempts) || 0) + 1
          outputs[st.id] = { error: String(err.message || err).slice(0, 300), attempts }
          if (attempts < MAX_ATTEMPTS) queue.push(st)
        }
        await save(false)
      }
    }))
    const left = steps.filter(s => !done(s) && !spent(s))
    if (left.length) { await save(true, { lease_until: null }); return 'more' }
    const failed = steps.filter(s => !done(s))
    if (failed.length > Math.max(3, total * 0.05)) {
      log.error(`Career Reading ${id}: ${failed.length} of ${total} steps failed`, failed.slice(0, 5).map(s => s.id + ': ' + outputs[s.id].error))
      await save(true, { status: 'failed', error: `${failed.length} steps failed`, lease_until: null })
      return 'failed'
    }
    const report = renderMarkdown(ctx, outputs, { missing: "This part couldn't be written this time." })
    await store.update(id, { status: 'done', outputs, progress: { done: total, total }, report, lease_until: null })
    await sendReady(r)
    return 'done'
  }

  return {
    price: () => price,
    free,

    async cast() {
      store.cleanup(new Date(Date.now() - keepDays * 864e5).toISOString()).catch(() => {})
      const { seed } = await getSeed()
      const r = await store.create({ seed, cast_at: new Date().toISOString(), preview: free })
      return { id: r.id, castAt: r.cast_at }
    },

    async submit(id, body = {}) {
      const r = await get(id)
      if (r.status !== 'cast') throw new ReadingError(409, 'already_submitted')
      const text = clip(body.question, 1200)
      if (text.length < 10) throw new ReadingError(400, 'question_too_short')
      const email = clip(body.email, 254).toLowerCase()
      if (email && !EMAIL_RE.test(email)) throw new ReadingError(400, 'invalid_email')
      const askedAt = new Date(Math.max(Date.now(), Date.parse(r.cast_at) + 1)).toISOString()   // always after the cast
      const input = { person: cleanPerson(body.person), answers: body.answers, question: { text } }
      try { prepare({ ...input, draw: { seed: r.seed, castAt: r.cast_at }, question: { text, askedAt } }) }
      catch (err) {
        if (err instanceof ReadingInputError || err instanceof QuizError || err instanceof ChartInputError) throw new ReadingError(400, err.message)
        throw err
      }
      if (!free && !stripe) throw new ReadingError(503, 'payments_off')
      const updated = await store.update(id, { status: free ? 'queued' : 'awaiting_payment', input, asked_at: askedAt, email: email || null, preview: free }, 'cast')
      if (!updated) throw new ReadingError(409, 'already_submitted')
      if (free) { await kick(id); return view(updated) }
      return { ...view(updated), checkoutUrl: await checkoutUrl(updated) }
    },

    async checkout(id) {
      const r = await get(id)
      if (r.status !== 'awaiting_payment') throw new ReadingError(409, 'not_awaiting_payment')
      if (!stripe) throw new ReadingError(503, 'payments_off')
      return checkoutUrl(r)
    },

    // From the Stripe webhook. Returns what it did.
    async paid(id, session = {}) {
      if (!ID_RE.test(String(id || ''))) return 'career_reading_unknown'
      const r = await store.get(id)
      if (!r) return 'career_reading_unknown'
      const email = session.customer_details && session.customer_details.email
      const updated = await store.update(id, { status: 'queued', paid: true, ...(r.email || !email ? {} : { email: String(email).slice(0, 254).toLowerCase() }) }, 'awaiting_payment')
      if (!updated) return 'career_reading_already'
      await kick(id)
      return 'career_reading_started'
    },

    async status(id) { return view(await get(id)) },

    async report(id) {
      const r = await get(id)
      if (r.status !== 'done') throw new ReadingError(409, 'not_ready')
      return r.report
    },

    // A failed reading can be tried again; the steps that worked are kept.
    async retry(id) {
      const r = await get(id)
      const outputs = Object.fromEntries(Object.entries(r.outputs || {}).filter(([, v]) => !v.error))
      const updated = await store.update(id, { status: 'queued', error: null, outputs }, 'failed')
      if (!updated) throw new ReadingError(409, 'not_failed')
      await kick(id)
      return view(updated)
    },

    work,
    kick,

    // Cron: start a batch for anything queued or stalled.
    async sweep() {
      const ids = await store.stalled(10)
      await Promise.all(ids.map(id => kick(id)))
      return ids.length
    }
  }
}

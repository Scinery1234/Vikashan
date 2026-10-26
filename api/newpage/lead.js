import crypto from 'node:crypto'
import { Resend } from 'resend'
import { supabase } from '../../lib/supabase.js'
import { rateLimit, isBot } from '../../lib/security.js'
import { planEmail } from '../../lib/newpage-emails.js'
import { validateAnswers, score, offersIntroCall, TIMEFRAMES, BLOCKERS, COACH } from '../../newpage/quiz-logic.js'

const resend = new Resend(process.env.RESEND_API_KEY)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const pickEnum = (v, list) => (list.some(o => o.v === v) ? v : null)
const clip = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : null)

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()
  if (!rateLimit(req, res, { max: 10, windowMs: 60 * 60 * 1000, key: 'np-lead' })) return
  if (isBot(req.body || {})) return res.json({ ok: true }) // silent reject

  const body = req.body || {}
  const answers = validateAnswers(body.answers)
  if (!answers) return res.status(400).json({ error: 'Some quiz answers are missing. Please retake the quiz.' })

  const email = clip(body.email, 200)?.toLowerCase()
  if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'Add your email so we can send your plan.' })

  const name = clip(body.name, 80) || ''
  const personal = {
    time: pickEnum(body.personal?.time, TIMEFRAMES),
    block: pickEnum(body.personal?.block, BLOCKERS),
    coach: pickEnum(body.personal?.coach, COACH)
  }
  const intent = body.intent === 'waitlist' ? 'waitlist' : 'plan'
  const optIn = body.optIn === true
  const result = score(answers)
  const introCall = offersIntroCall(personal, result)

  // "Join the waitlist" from the confirmation screen: they already have
  // their plan, so just flag the latest lead.
  if (body.resend === false) {
    await supabase.from('newpage_leads').update({ wants_program: true })
      .eq('email', email).eq('superseded', false)
    return res.json({ ok: true, introCall })
  }

  const s = body.source || {}
  const source = {
    utm_source: clip(s.utm_source, 100), utm_medium: clip(s.utm_medium, 100),
    utm_campaign: clip(s.utm_campaign, 100), ref: clip(s.ref, 200)
  }
  const token = crypto.randomBytes(16).toString('hex')

  // A retake replaces earlier leads for the same email, so only the latest
  // result gets follow-up emails.
  await supabase.from('newpage_leads').update({ superseded: true }).eq('email', email).eq('superseded', false)

  const { data: lead, error } = await supabase.from('newpage_leads').insert({
    email, name: name || null, answers, personal,
    quadrant: result.quadrant, clarity: result.clarity, capacity: result.capacity,
    burnout: result.burnout, low_mood: result.lowMood, struggling: result.struggling,
    intro_call_offered: introCall, intent, wants_program: intent === 'waitlist',
    opt_in: optIn && !result.struggling, source, session_id: clip(body.sessionId, 64),
    unsubscribe_token: token
  }).select('id').single()
  if (error) {
    console.error('New Page lead insert failed:', error)
    return res.status(500).json({ error: 'We couldn’t save your result. Please try again.' })
  }

  await upsertClient({ email, name, quadrant: result.quadrant, optIn }).catch(err => console.error('Client upsert failed:', err))
  if (optIn) {
    await supabase.from('subscribers').upsert(
      { email, name: name || null, source: 'quiz' },
      { onConflict: 'email', ignoreDuplicates: true }
    )
  }

  try {
    const mail = planEmail({ name, quadrant: result.quadrant, answers, personal, introCall, token })
    await resend.emails.send({
      from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
      to: email,
      reply_to: process.env.ADMIN_EMAIL,
      subject: mail.subject,
      html: mail.html,
      attachments: [{ filename: 'new-page-first-step.ics', content: Buffer.from(mail.ics).toString('base64'), type: 'text/calendar' }]
    })
    await supabase.from('newpage_leads').update({ plan_sent_at: new Date().toISOString() }).eq('id', lead.id)
  } catch (err) {
    console.error('New Page plan email failed:', err)
    return res.status(502).json({ error: 'Your result is saved, but the email didn’t send. Please try again in a minute.' })
  }

  res.json({ ok: true, introCall })
}

// Add the person to the client list as a lead, tagged with their quadrant.
// Existing clients keep their status; tags are merged.
async function upsertClient({ email, name, quadrant, optIn }) {
  const tags = ['newpage-quiz', `quadrant-${quadrant}`]
  const { data: existing } = await supabase.from('clients').select('id, tags, mailing_opt_in').eq('email', email).maybeSingle()
  if (existing) {
    const merged = [...new Set([...(existing.tags || []).filter(t => !t.startsWith('quadrant-')), ...tags])]
    await supabase.from('clients').update({
      tags: merged, mailing_opt_in: existing.mailing_opt_in || optIn, updated_at: new Date().toISOString()
    }).eq('id', existing.id)
  } else {
    await supabase.from('clients').insert({
      name: name || email.split('@')[0], email, status: 'lead', primary_service: 'New Page', tags, mailing_opt_in: optIn
    })
  }
}

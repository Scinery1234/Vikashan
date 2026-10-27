import { Resend } from 'resend'
import { supabase } from '../../lib/supabase.js'
import { requireAdmin } from '../../lib/auth.js'
import { memberWelcomeEmail } from '../../lib/newpage-emails.js'
import { ACCESS, renewedUntil } from '../../lib/newpage-members.js'

const resend = new Resend(process.env.RESEND_API_KEY)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SOURCES = ['purchase', 'scholarship', 'manual']
const STATUSES = ['active', 'paused', 'ended']

// Admin only. Gives someone access to the New Page app (later, the New Page
// checkout will do the same thing), and lists and updates members.
//   GET                                     list members
//   POST { email, name?, source?, welcome?, access? } grant access ('4w' default, '1m', '3m', 'none')
//   POST { id, status? }                    pause, end or restore a member
//   POST { id, renew: true }                a paid renewal: 1 more month and 1 more session
//   POST { id, accessUntil: 'YYYY-MM-DD'|null, sessionsIncluded? }
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (!requireAdmin(req, res)) return

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('newpage_members')
      .select('id, email, name, status, source, quadrant, plan_started_at, last_login_at, session_booked, access_until, sessions_included')
      .order('created_at', { ascending: false }).limit(200)
    if (error) return res.status(500).json({ error: error.message })
    const { data: used } = await supabase.from('bookings').select('newpage_member_id, status').not('newpage_member_id', 'is', null).neq('status', 'cancelled')
    const count = {}
    for (const b of used || []) count[b.newpage_member_id] = (count[b.newpage_member_id] || 0) + 1
    return res.json({ members: data.map(m => ({ ...m, sessions_used: count[m.id] || 0 })) })
  }
  if (req.method !== 'POST') return res.status(405).end()
  const b = req.body || {}

  if (b.id) {
    if (!/^[0-9a-f-]{36}$/i.test(String(b.id))) return res.status(400).json({ error: 'Unknown member.' })
    const patch = {}
    if (b.status !== undefined) {
      if (!STATUSES.includes(b.status)) return res.status(400).json({ error: 'Unknown status.' })
      patch.status = b.status
    }
    if (b.renew) {
      const { data: m } = await supabase.from('newpage_members').select('access_until, sessions_included').eq('id', b.id).maybeSingle()
      if (!m) return res.status(404).json({ error: 'Unknown member.' })
      patch.access_until = renewedUntil(m.access_until)
      patch.sessions_included = (m.sessions_included ?? 1) + 1
      patch.status = 'active'
    }
    if (b.accessUntil !== undefined) {
      if (b.accessUntil !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(b.accessUntil))) return res.status(400).json({ error: 'Use a date like 2026-12-31.' })
      patch.access_until = b.accessUntil ? new Date(`${b.accessUntil}T23:59:59+11:00`).toISOString() : null
    }
    if (b.sessionsIncluded !== undefined) {
      const n = Number(b.sessionsIncluded)
      if (!Number.isInteger(n) || n < 0 || n > 50) return res.status(400).json({ error: 'Sessions must be a whole number from 0 to 50.' })
      patch.sessions_included = n
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to change.' })
    const { error } = await supabase.from('newpage_members').update(patch).eq('id', b.id)
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ ok: true, ...(patch.access_until !== undefined ? { accessUntil: patch.access_until } : {}) })
  }

  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase().slice(0, 200) : ''
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email.' })
  const name = typeof b.name === 'string' ? b.name.trim().slice(0, 80) : ''
  const source = SOURCES.includes(b.source) ? b.source : 'manual'

  // Start from their quiz result if they took the quiz.
  const { data: lead } = await supabase.from('newpage_leads')
    .select('id, name, quadrant, answers, personal').eq('email', email).eq('superseded', false)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()

  const row = {
    email, name: name || lead?.name || null, source, status: 'active',
    quadrant: lead?.quadrant || null, answers: lead?.answers || null, personal: lead?.personal || {}, lead_id: lead?.id || null,
    plan_started_at: new Date().toISOString(),
    access_until: ACCESS[b.access || '4w'] ? new Date(Date.now() + ACCESS[b.access || '4w']).toISOString() : null,
    sessions_included: 1
  }
  const { data: existing } = await supabase.from('newpage_members').select('id').eq('email', email).maybeSingle()
  let error
  if (existing) {
    // Re-granting restores access without wiping their progress.
    ;({ error } = await supabase.from('newpage_members').update({ status: 'active', source, name: row.name, access_until: row.access_until }).eq('id', existing.id))
  } else {
    ;({ error } = await supabase.from('newpage_members').insert(row))
  }
  if (error) { console.error('Grant failed:', error); return res.status(500).json({ error: 'Could not save the member.' }) }
  if (lead) await supabase.from('newpage_leads').update({ converted_at: new Date().toISOString() }).eq('id', lead.id)
  await supabase.from('clients').update({ status: 'active', updated_at: new Date().toISOString() }).eq('email', email)

  if (b.welcome !== false) {
    const mail = memberWelcomeEmail({ name: row.name })
    try {
      await resend.emails.send({ from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`, to: email, reply_to: process.env.ADMIN_EMAIL, subject: mail.subject, html: mail.html })
    } catch (err) {
      console.error('Welcome email failed:', err)
      return res.json({ ok: true, welcomeSent: false, quadrant: row.quadrant })
    }
  }
  res.json({ ok: true, welcomeSent: b.welcome !== false, quadrant: row.quadrant, restored: !!existing })
}

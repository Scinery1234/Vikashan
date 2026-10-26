import { Resend } from 'resend'
import { supabase } from '../../lib/supabase.js'
import { requireAdmin } from '../../lib/auth.js'
import { memberWelcomeEmail } from '../../lib/newpage-emails.js'

const resend = new Resend(process.env.RESEND_API_KEY)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SOURCES = ['purchase', 'scholarship', 'manual']
const STATUSES = ['active', 'paused', 'ended']

// Admin only. Gives someone access to the New Page app (later, the New Page
// checkout will do the same thing), and lists and updates members.
//   GET                                     list members
//   POST { email, name?, source?, welcome? } grant access
//   POST { id, status }                     pause, end or restore a member
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (!requireAdmin(req, res)) return

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('newpage_members')
      .select('id, email, name, status, source, quadrant, plan_started_at, last_login_at, session_booked')
      .order('created_at', { ascending: false }).limit(200)
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ members: data })
  }
  if (req.method !== 'POST') return res.status(405).end()
  const b = req.body || {}

  if (b.id) {
    if (!STATUSES.includes(b.status) || !/^[0-9a-f-]{36}$/i.test(String(b.id))) return res.status(400).json({ error: 'Unknown member or status.' })
    const { error } = await supabase.from('newpage_members').update({ status: b.status }).eq('id', b.id)
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ ok: true })
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
    plan_started_at: new Date().toISOString()
  }
  const { data: existing } = await supabase.from('newpage_members').select('id').eq('email', email).maybeSingle()
  let error
  if (existing) {
    // Re-granting restores access without wiping their progress.
    ;({ error } = await supabase.from('newpage_members').update({ status: 'active', source, name: row.name }).eq('id', existing.id))
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

import { supabase } from '../../lib/supabase.js'
import { sendMail, fromAddress } from '../../lib/newpage-mail.js'
import { signOptOut } from '../../lib/newpage-auth.js'
import { sessionState } from '../../lib/newpage-members.js'
import { refreshContent } from '../../lib/newpage-content.js'
import { dueProgramEmail, buildProgramEmail } from '../../lib/newpage-program-mail.js'

const BASE = () => process.env.NEXT_PUBLIC_URL || 'https://vikashan.org'

// Daily cron (vercel.json). Sends the emails Vik sends during the four weeks:
// the start-of-week nudges, "book your session", the renewal email and the
// "gone quiet" note. At most one per member per run, and each is sent once.
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'Unauthorized' })
  await refreshContent()

  const { data: members, error } = await supabase.from('newpage_members')
    .select('id, email, name, status, source, quadrant, plan_started_at, last_login_at, access_until, sessions_included, program_emails').eq('status', 'active')
  if (error) return res.status(500).json({ error: error.message })
  const { data: bookings } = await supabase.from('bookings').select('newpage_member_id, date, start_time, status').not('newpage_member_id', 'is', null)
  const { data: sentRows } = await supabase.from('newpage_member_emails').select('member_id, kind, sent_at')

  const out = { sent: 0, skipped: 0, failed: 0 }
  for (const m of members || []) {
    const sessions = sessionState(m.sessions_included, (bookings || []).filter(b => b.newpage_member_id === m.id))
    const sent = (sentRows || []).filter(r => r.member_id === m.id)
    const due = dueProgramEmail({ member: m, sent, sessionsRemaining: sessions.remaining, hasUpcoming: sessions.upcoming.length > 0 })
    if (!due) { out.skipped++; continue }
    try {
      const mail = buildProgramEmail(due, { member: m, sessionsRemaining: sessions.remaining, optOutUrl: `${BASE()}/api/newpage/optout?t=${encodeURIComponent(signOptOut(m.id))}` })
      await sendMail({ from: fromAddress(), to: m.email, reply_to: process.env.ADMIN_EMAIL, subject: mail.subject, html: mail.html })
      await supabase.from('newpage_member_emails').upsert({ member_id: m.id, kind: due.key, sent_at: new Date().toISOString() }, { onConflict: 'member_id,kind', ignoreDuplicates: true })
      out.sent++
    } catch (err) {
      console.error('Program email failed for', m.id, due.key, err.message)
      out.failed++
    }
  }
  res.json({ ok: true, ...out })
}

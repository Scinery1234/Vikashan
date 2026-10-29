import { sendMail } from '../../lib/newpage-mail.js'
import { supabase } from '../../lib/supabase.js'
import { reminderEmail } from '../../lib/newpage-emails.js'

const sydneyDate = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(now)

// Daily cron (vercel.json), around 7am in Sydney. Emails each active member
// who has reminders on and something due today (or overdue and still open).
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'Unauthorized' })

  const today = sydneyDate()
  const { data: tasks, error } = await supabase.from('newpage_tasks')
    .select('member_id, title, due, block_start').eq('done', false).lte('due', today).limit(2000)
  if (error) return res.status(500).json({ error: error.message })

  const byMember = new Map()
  for (const t of tasks || []) {
    if (!byMember.has(t.member_id)) byMember.set(t.member_id, [])
    byMember.get(t.member_id).push({ title: t.title, start: t.block_start ? String(t.block_start).slice(0, 5) : null, overdue: t.due < today })
  }

  const sent = { total: 0, skipped: 0, failed: 0 }
  for (const [memberId, items] of byMember) {
    const { data: m } = await supabase.from('newpage_members').select('id, email, name, status, reminders, last_reminder_on').eq('id', memberId).maybeSingle()
    if (!m || m.status !== 'active' || m.reminders === false || m.last_reminder_on === today) { sent.skipped++; continue }
    items.sort((a, b) => Number(a.overdue) - Number(b.overdue) || (a.start || '99').localeCompare(b.start || '99'))
    const mail = reminderEmail({ name: m.name, items: items.slice(0, 8) })
    try {
      await sendMail({ from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`, to: m.email, reply_to: process.env.ADMIN_EMAIL, subject: mail.subject, html: mail.html })
      await supabase.from('newpage_members').update({ last_reminder_on: today }).eq('id', m.id)
      sent.total++
    } catch (err) {
      console.error('New Page reminder failed:', m.id, err)
      sent.failed++
    }
  }
  res.json({ ok: true, ...sent })
}

import { Resend } from 'resend'
import { supabase } from '../../lib/supabase.js'
import { followupEmail, dueDay } from '../../lib/newpage-emails.js'

const resend = new Resend(process.env.RESEND_API_KEY)
const DAY = 24 * 60 * 60 * 1000

// Daily cron (vercel.json). Sends the quiz follow-up series.
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const now = Date.now()
  const { data: leads, error } = await supabase.from('newpage_leads')
    .select('id, email, name, quadrant, personal, created_at, last_followup_day, unsubscribe_token')
    .eq('superseded', false).eq('opt_in', true).eq('struggling', false)
    .is('unsubscribed_at', null).is('converted_at', null)
    .gte('created_at', new Date(now - 43 * DAY).toISOString())
    .limit(500)
  if (error) return res.status(500).json({ error: error.message })

  const sent = { total: 0, skipped: 0, failed: 0 }
  for (const lead of leads || []) {
    const days = Math.floor((now - new Date(lead.created_at).getTime()) / DAY)
    const day = dueDay(days, lead.last_followup_day)
    if (!day) continue
    const base = process.env.NEXT_PUBLIC_URL || 'https://vikashan.com.au'
    const mail = followupEmail({
      day, quadrant: lead.quadrant, name: lead.name, token: lead.unsubscribe_token, personal: lead.personal || {},
      stayUrl: `${base}/api/newpage/unsubscribe?t=${lead.unsubscribe_token}&stay=1`
    })
    if (mail) {
      try {
        await resend.emails.send({
          from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
          to: lead.email, reply_to: process.env.ADMIN_EMAIL,
          subject: mail.subject, html: mail.html,
          headers: { 'List-Unsubscribe': `<${base}/api/newpage/unsubscribe?t=${lead.unsubscribe_token}>` }
        })
        sent.total++
      } catch (err) {
        console.error('New Page follow-up failed:', lead.id, err)
        sent.failed++
        continue
      }
    } else {
      sent.skipped++ // e.g. day 21 with no client story yet
    }
    await supabase.from('newpage_leads').update({ last_followup_day: day }).eq('id', lead.id)
  }
  res.json({ ok: true, ...sent })
}

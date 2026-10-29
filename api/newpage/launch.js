import { sendMail } from '../../lib/newpage-mail.js'
import { supabase } from '../../lib/supabase.js'
import { requireAdmin } from '../../lib/auth.js'
import { launchEmail } from '../../lib/newpage-emails.js'

const BATCH = 50 // per request, to stay inside the function time limit

// The "New Page is open" email, sent from newpage/admin (admin login only).
//   GET                        how many people are waiting
//   POST { mode: 'test' }      send one copy to ADMIN_EMAIL
//   POST { mode: 'send' }      send the next batch; call again while remaining > 0
// Recipients: quiz takers who tapped "Tell me when it opens" plus the
// program page's waitlist, once per email, skipping anyone unsubscribed.
async function pending() {
  const [{ data: leads, error: e1 }, { data: wl, error: e2 }] = await Promise.all([
    supabase.from('newpage_leads').select('email, name, unsubscribe_token, created_at')
      .eq('wants_program', true).is('unsubscribed_at', null).is('launch_notified_at', null)
      .order('created_at', { ascending: false }),
    supabase.from('newpage_waitlist').select('email, name, unsubscribe_token, created_at')
      .is('unsubscribed_at', null).is('launch_notified_at', null)
  ])
  if (e1 || e2) throw new Error((e1 || e2).message)
  const byEmail = new Map()
  for (const r of [...(leads || []), ...(wl || [])]) if (!byEmail.has(r.email)) byEmail.set(r.email, r)
  return [...byEmail.values()]
}

const validUrl = u => {
  if (!u) return null
  try { const x = new URL(u); return x.protocol === 'https:' ? x.toString() : null } catch { return null }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (!requireAdmin(req, res)) return

  let people
  try { people = await pending() } catch (err) { return res.status(500).json({ error: err.message }) }

  if (req.method === 'GET') return res.json({ waiting: people.length })
  if (req.method !== 'POST') return res.status(405).end()

  const { mode, checkoutUrl } = req.body || {}
  if (checkoutUrl && !validUrl(checkoutUrl)) return res.status(400).json({ error: 'The checkout link must start with https://' })
  const url = validUrl(checkoutUrl)
  const from = `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`

  if (mode === 'test') {
    const mail = launchEmail({ name: 'Vik', checkoutUrl: url })
    try {
      await sendMail({ from, to: process.env.ADMIN_EMAIL, subject: `[Test] ${mail.subject}`, html: mail.html })
    } catch (err) {
      console.error('Launch test email failed:', err)
      return res.status(502).json({ error: `The test email didn’t send: ${err.message}` })
    }
    return res.json({ ok: true, test: true, waiting: people.length })
  }
  if (mode !== 'send') return res.status(400).json({ error: 'Unknown mode' })

  let sent = 0, failed = 0
  for (const p of people.slice(0, BATCH)) {
    const mail = launchEmail({ name: p.name, checkoutUrl: url, token: p.unsubscribe_token })
    try {
      await sendMail({ from, to: p.email, reply_to: process.env.ADMIN_EMAIL, subject: mail.subject, html: mail.html })
      sent++
    } catch (err) {
      console.error('Launch email failed:', p.email, err)
      failed++
      continue
    }
    const now = new Date().toISOString()
    await supabase.from('newpage_leads').update({ launch_notified_at: now }).eq('email', p.email).is('launch_notified_at', null)
    await supabase.from('newpage_waitlist').update({ launch_notified_at: now }).eq('email', p.email).is('launch_notified_at', null)
  }
  res.json({ ok: true, sent, failed, remaining: Math.max(0, people.length - sent - failed) })
}

import { sendMail } from '../../lib/newpage-mail.js'
import { supabase } from '../../lib/supabase.js'
import { rateLimit } from '../../lib/security.js'
import { signMagic, signSession, readToken } from '../../lib/newpage-auth.js'
import { memberLoginEmail, APP_URL } from '../../lib/newpage-emails.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// POST { action: 'request', email }  sends a sign-in link to a member's email.
// POST { action: 'verify', token }   swaps that link's token for a session.
// The response to 'request' is the same whether or not the email belongs to a
// member, so it can't be used to find out who is one.
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()
  const b = req.body || {}

  if (b.action === 'request') {
    if (!rateLimit(req, res, { max: 8, windowMs: 60 * 60 * 1000, key: 'np-signin' })) return
    const email = typeof b.email === 'string' ? b.email.trim().toLowerCase().slice(0, 200) : ''
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter the email you used for New Page.' })
    const { data: member } = await supabase.from('newpage_members').select('id, name, status').eq('email', email).maybeSingle()
    if (member && member.status === 'active') {
      const link = `${APP_URL()}?t=${encodeURIComponent(signMagic(email))}`
      const mail = memberLoginEmail({ name: member.name, link })
      try {
        await sendMail({ from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`, to: email, reply_to: process.env.ADMIN_EMAIL, subject: mail.subject, html: mail.html })
      } catch (err) {
        console.error('Sign-in email failed:', err)
        return res.status(502).json({ error: 'We couldn’t send the email. Please try again in a minute.' })
      }
    }
    return res.json({ ok: true })
  }

  if (b.action === 'verify') {
    if (!rateLimit(req, res, { max: 30, windowMs: 60 * 60 * 1000, key: 'np-verify' })) return
    const payload = readToken(b.token, 'magic')
    if (!payload) return res.status(401).json({ error: 'That link has expired. Enter your email to get a new one.', code: 'expired' })
    const { data: member } = await supabase.from('newpage_members').select('id, status').eq('email', payload.email).maybeSingle()
    if (!member || member.status !== 'active') return res.status(403).json({ error: 'This email doesn’t have access to New Page right now.', code: 'no_access' })
    await supabase.from('newpage_members').update({ last_login_at: new Date().toISOString() }).eq('id', member.id)
    return res.json({ ok: true, session: signSession(member.id) })
  }

  res.status(400).json({ error: 'Unknown action' })
}

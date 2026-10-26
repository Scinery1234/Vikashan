import crypto from 'node:crypto'
import { supabase } from '../../lib/supabase.js'
import { rateLimit, isBot } from '../../lib/security.js'

// "Tell me when it opens" from the program page, for people who haven't taken
// the quiz. (Quiz takers are flagged on their lead instead.)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const clip = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : null)

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()
  if (!rateLimit(req, res, { max: 10, windowMs: 60 * 60 * 1000, key: 'np-waitlist' })) return
  const b = req.body || {}
  if (isBot(b)) return res.json({ ok: true })

  const email = clip(b.email, 200)?.toLowerCase()
  if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'Add your email so we can let you know.' })
  const s = b.source || {}

  const { error } = await supabase.from('newpage_waitlist').upsert({
    email,
    name: clip(b.name, 80) || null,
    source: { utm_source: clip(s.utm_source, 100), utm_medium: clip(s.utm_medium, 100), utm_campaign: clip(s.utm_campaign, 100), ref: clip(s.ref, 200) },
    unsubscribe_token: crypto.randomBytes(16).toString('hex')
  }, { onConflict: 'email', ignoreDuplicates: true })
  if (error) {
    console.error('Waitlist insert failed:', error)
    return res.status(500).json({ error: 'We couldn’t save your email. Please try again.' })
  }
  res.json({ ok: true })
}

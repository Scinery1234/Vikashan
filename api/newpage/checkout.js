import { supabase } from '../../lib/supabase.js'
import { rateLimit, isBot } from '../../lib/security.js'
import { PRICE, cleanHours, joinTotalCents, normaliseCode } from '../../lib/newpage-pricing.js'
import { stripe, joinSessionParams } from '../../lib/newpage-stripe.js'
import { grantMember } from '../../lib/newpage-grant.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const clip = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '')

// Public. Joining New Page, by card or with a scholarship code.
//   POST { action: 'quote', hours, code? }              -> what it would cost
//   POST { action: 'start', name, email, hours, code? } -> { url } to pay, or { joined: true } for a scholarship
// Prices are decided here. Nothing the browser sends changes them.
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()
  if (!rateLimit(req, res, { max: 20, windowMs: 60 * 60 * 1000, key: 'np-checkout' })) return
  const b = req.body || {}
  if (isBot(b)) return res.json({ ok: true })

  const hours = cleanHours(b.hours)
  if (hours === null) return res.status(400).json({ error: `Choose between 0 and ${PRICE.maxHours} extra hours.` })

  let code = null
  if (b.code) {
    code = normaliseCode(b.code)
    if (!code) return res.status(400).json({ error: 'That code doesn’t look right. It starts with NP and has three groups of four characters.', code: 'bad_code' })
    const { data: row } = await supabase.from('newpage_codes').select('code, used_at').eq('code', code).maybeSingle()
    if (!row) return res.status(400).json({ error: 'We don’t recognise that code.', code: 'bad_code' })
    if (row.used_at) return res.status(400).json({ error: 'That code has already been used.', code: 'used_code' })
    if (hours > 0) return res.status(400).json({ error: 'Scholarships cover the four weeks and your session with Vik. Extra hours can’t be added to a scholarship.', code: 'hours_with_code' })
  }

  if (b.action === 'quote') {
    return res.json({ totalCents: code ? 0 : joinTotalCents(hours), scholarship: !!code, programCents: code ? 0 : PRICE.programCents, hours, hourCents: PRICE.hourCents })
  }
  if (b.action !== 'start') return res.status(400).json({ error: 'Unknown action' })

  const email = clip(b.email, 200).toLowerCase()
  const name = clip(b.name, 80)
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Add the email you want to use for New Page.' })
  if (!name) return res.status(400).json({ error: 'Add your name.' })

  if (code) {
    // Claim the code first, so two people can't use it at once.
    const { data: claimed } = await supabase.from('newpage_codes').update({ used_at: new Date().toISOString(), used_by_email: email }).eq('code', code).is('used_at', null).select('code')
    if (!claimed || !claimed.length) return res.status(400).json({ error: 'That code has already been used.', code: 'used_code' })
    const r = await grantMember({ email, name, source: 'scholarship', access: '4w', sessionsIncluded: 1, welcome: true })
    if (r.error) {
      await supabase.from('newpage_codes').update({ used_at: null, used_by_email: null }).eq('code', code)
      return res.status(500).json({ error: 'Something went wrong. Your code hasn’t been used. Please try again.' })
    }
    return res.json({ joined: true })
  }

  try {
    const session = await stripe().checkout.sessions.create(joinSessionParams({ email, name, hours }))
    return res.json({ url: session.url })
  } catch (err) {
    console.error('Checkout failed:', err)
    return res.status(502).json({ error: 'We couldn’t start the payment. Please try again in a minute.' })
  }
}

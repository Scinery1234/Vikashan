import { sendMail } from '../../lib/newpage-mail.js'
import { supabase } from '../../lib/supabase.js'
import { rateLimit, isBot } from '../../lib/security.js'
import { esc } from '../../lib/newpage-emails.js'

const MONTHLY_PLACES = 5
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const QUADS = new Set(['recharge', 'explore', 'unstick', 'launch'])
const clip = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '')

// Start of this month and next month in Sydney time, as ISO strings.
function monthBounds(now = new Date()) {
  const [y, m] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit' })
    .format(now).split('-').map(Number)
  const ny = m === 12 ? y + 1 : y
  const nm = m === 12 ? 1 : m + 1
  const pad = n => String(n).padStart(2, '0')
  // Sydney is UTC+10 or +11; +10 is close enough for a monthly cap.
  return {
    start: `${y}-${pad(m)}-01T00:00:00+10:00`,
    next: `${ny}-${pad(nm)}-01T00:00:00+10:00`,
    reopens: new Date(Date.UTC(ny, nm - 1, 1)).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', timeZone: 'UTC' })
  }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()
  if (!rateLimit(req, res, { max: 3, windowMs: 60 * 60 * 1000, key: 'np-scholarship' })) return
  if (isBot(req.body || {})) return res.json({ ok: true })

  const b = req.body || {}
  const name = clip(b.name, 120)
  const email = clip(b.email, 200).toLowerCase()
  const about = clip(b.about, 1500)
  const situation = clip(b.situation, 1500)
  if (!name || !EMAIL_RE.test(email) || !about || !situation) {
    return res.status(400).json({ error: 'Please fill in all four fields.' })
  }

  // Places are counted when Vik approves an application, so the form closes
  // once five have been approved this month.
  const { start, next, reopens } = monthBounds()
  const { count } = await supabase.from('newpage_scholarships')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'approved').gte('decided_at', start).lt('decided_at', next)
  if ((count || 0) >= MONTHLY_PLACES) return res.json({ full: true, reopens })

  const { error } = await supabase.from('newpage_scholarships').insert({
    name, email, about, situation, quadrant: QUADS.has(b.quadrant) ? b.quadrant : null, status: 'pending'
  })
  if (error) {
    console.error('Scholarship insert failed:', error)
    return res.status(500).json({ error: 'We couldn’t save your application. Please try again.' })
  }

  const from = `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`
  try {
    await sendMail({
      from, to: process.env.ADMIN_EMAIL, reply_to: email,
      subject: `New Page scholarship application: ${name}`,
      html: `<p><b>${esc(name)}</b> (${esc(email)}) applied for a New Page scholarship.</p>
        <p><b>Quiz result:</b> ${esc(b.quadrant || 'not taken')}</p>
        <p><b>About them:</b><br>${esc(about).replace(/\n/g, '<br>')}</p>
        <p><b>Their situation:</b><br>${esc(situation).replace(/\n/g, '<br>')}</p>
        <p>Approved this month so far: ${count || 0} of ${MONTHLY_PLACES}. Set the status to "approved" or "declined" in the newpage_scholarships table.</p>`
    })
    await sendMail({
      from, to: email, reply_to: process.env.ADMIN_EMAIL,
      subject: 'We’ve received your New Page scholarship application',
      html: `<p>Hi ${esc(name.split(' ')[0])},</p><p>Thanks for applying for a New Page scholarship. Vik reads every application personally and will reply by email.</p><p>Vik</p>`
    })
  } catch (err) {
    console.error('Scholarship emails failed:', err)
  }
  res.json({ ok: true })
}

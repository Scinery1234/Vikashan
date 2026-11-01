import { supabase } from '../../lib/supabase.js'
import { rateLimit, isBot } from '../../lib/security.js'
import { requireAdmin } from '../../lib/auth.js'
import { readToken } from '../../lib/newpage-auth.js'
import { createDemoMember, DEMO, sweepDemos } from '../../lib/newpage-demo.js'
import { openVault } from '../../lib/newpage-vault.js'

const clip = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '')
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// The public demo.
//   POST { action: 'info' }                         does the demo need a code? what are the limits?
//   POST { action: 'start', code? }                 a 24-hour demo member -> { session }
//   POST { action: 'feedback', token, screen, rating?, comment, email? }
//   GET  (admin)                                    feedback and demo numbers
//   POST { action: 'code', code, label?, maxUses? } (admin) add an invite code; { action: 'code_off', code } to stop one
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method === 'GET') {
    if (!requireAdmin(req, res)) return
    const since = new Date(Date.now() - 30 * 864e5).toISOString()
    const [fb, live, codes, all] = await Promise.all([
      supabase.from('newpage_feedback').select('id, demo_id, screen, rating, comment, email, code, created_at').order('created_at', { ascending: false }).limit(200),
      supabase.from('newpage_members').select('id, created_at, demo_messages, demo_docs, last_login_at, demo_code').eq('source', 'demo').gte('created_at', since),
      supabase.from('newpage_demo_codes').select('*').order('created_at', { ascending: false }),
      supabase.from('newpage_feedback').select('demo_id', { count: 'exact', head: true })
    ])
    const visitors = live.data || []
    return res.json({
      feedback: fb.data || [], codes: codes.data || [], caps: DEMO.caps, dailyCap: DEMO.dailyCap,
      stats: { visitors30d: visitors.length, messages30d: visitors.reduce((t, v) => t + (v.demo_messages || 0), 0), docs30d: visitors.reduce((t, v) => t + (v.demo_docs || 0), 0), feedbackTotal: all.count || 0 }
    })
  }
  if (req.method !== 'POST') return res.status(405).end()
  const b = req.body || {}

  if (b.action === 'code' || b.action === 'code_off') {
    if (!requireAdmin(req, res)) return
    const code = clip(b.code, 40).toUpperCase().replace(/[^A-Z0-9-]/g, '')
    if (code.length < 4) return res.status(400).json({ error: 'A code needs at least 4 letters or numbers.' })
    if (b.action === 'code_off') { await supabase.from('newpage_demo_codes').update({ active: false }).eq('code', code); return res.json({ ok: true }) }
    const maxUses = Number.isInteger(Number(b.maxUses)) && Number(b.maxUses) > 0 ? Number(b.maxUses) : null
    const { error } = await supabase.from('newpage_demo_codes').upsert({ code, label: clip(b.label, 80) || null, max_uses: maxUses, active: true }, { onConflict: 'code' })
    if (error) return res.status(500).json({ error: 'Could not save the code.' })
    return res.json({ ok: true, code })
  }

  if (!rateLimit(req, res, { max: 30, windowMs: 60 * 60 * 1000, key: 'np-demo' })) return
  if (isBot(b)) return res.json({ ok: true })

  const { data: activeCodes } = await supabase.from('newpage_demo_codes').select('code, uses, max_uses').eq('active', true)
  const needsCode = (activeCodes || []).length > 0

  if (b.action === 'info') return res.json({ needsCode, caps: DEMO.caps, hours: DEMO.hours, quadrant: DEMO.quadrant })

  if (b.action === 'start') {
    if (!rateLimit(req, res, { max: 5, windowMs: 60 * 60 * 1000, key: 'np-demo-start' })) return
    let code = null
    if (needsCode) {
      code = clip(b.code, 40).toUpperCase().replace(/[^A-Z0-9-]/g, '')
      const row = (activeCodes || []).find(c => c.code === code)
      if (!row) return res.status(403).json({ error: 'That code isn’t right. The demo needs an invite code at the moment.', code: 'code' })
      if (row.max_uses && row.uses >= row.max_uses) return res.status(403).json({ error: 'That code has been used up.', code: 'code' })
      await supabase.from('newpage_demo_codes').update({ uses: row.uses + 1 }).eq('code', code)
    }
    try {
      // Sample notes and the sample chat are encrypted like a real member's, when encryption is on.
      const made = await createDemoMember({ code, seal: null })
      const { data: m } = await supabase.from('newpage_members').select('*').eq('id', made.id).maybeSingle()
      const vault = m ? await openVault(m, { create: true }) : null
      if (vault) {
        const { data: notes } = await supabase.from('newpage_memory').select('id, note').eq('member_id', made.id)
        for (const n of notes || []) await supabase.from('newpage_memory').update({ note: vault.text('mem', n.note) }).eq('id', n.id)
        const { data: msgs } = await supabase.from('newpage_messages').select('id, content').eq('member_id', made.id)
        for (const x of msgs || []) await supabase.from('newpage_messages').update({ content: vault.text('msg', x.content) }).eq('id', x.id)
      }
      return res.json({ session: made.session, hours: DEMO.hours, caps: DEMO.caps })
    } catch (err) {
      console.error('Demo start failed:', err)
      return res.status(500).json({ error: 'The demo couldn’t start just now. Please try again in a minute.' })
    }
  }

  if (b.action === 'feedback') {
    const p = readToken(b.token, 'session')
    const comment = clip(b.comment, 2000)
    if (comment.length < 2) return res.status(400).json({ error: 'Write a few words first.' })
    const email = clip(b.email, 200).toLowerCase()
    if (email && !EMAIL_RE.test(email)) return res.status(400).json({ error: 'That email doesn’t look right.' })
    const rating = Number.isInteger(Number(b.rating)) && Number(b.rating) >= 1 && Number(b.rating) <= 5 ? Number(b.rating) : null
    let code = null
    if (p?.sub) { const { data: m } = await supabase.from('newpage_members').select('demo_code, source').eq('id', p.sub).maybeSingle(); code = m?.source === 'demo' ? m.demo_code : null }
    const { error } = await supabase.from('newpage_feedback').insert({ demo_id: p?.sub || null, screen: clip(b.screen, 60) || null, rating, comment, email: email || null, code })
    if (error) { console.error('Feedback save failed:', error); return res.status(500).json({ error: 'We couldn’t save that. Please try again.' }) }
    return res.json({ ok: true })
  }

  if (b.action === 'sweep') {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'Unauthorized' })
    return res.json({ ok: true, removed: await sweepDemos() })
  }
  res.status(400).json({ error: 'Unknown action.' })
}

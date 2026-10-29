import { supabase } from '../../lib/supabase.js'
import { requireAdmin } from '../../lib/auth.js'
import { signSession } from '../../lib/newpage-auth.js'
import { cryptoReady } from '../../lib/newpage-crypto.js'
import { COACH_MODEL } from '../../lib/newpage-coach.js'

// Admin only. "Check the system": runs each thing New Page depends on and says,
// in plain words, what is working and what isn't. Nothing is sent or changed.
const TABLES = ['newpage_members', 'newpage_notes', 'newpage_content', 'newpage_shares', 'newpage_access_log', 'newpage_codes', 'newpage_docs']

const check = async (name, fn) => {
  const t = Date.now()
  try { const r = await fn(); return { name, ok: r.ok !== false, detail: r.detail || '', ms: Date.now() - t } } catch (e) { return { name, ok: false, detail: String(e.message || e).slice(0, 300), ms: Date.now() - t } }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (!requireAdmin(req, res)) return
  if (req.method !== 'POST') return res.status(405).end()

  const host = req.headers['x-forwarded-host'] || req.headers.host
  const proto = req.headers['x-forwarded-proto'] || (/^(localhost|127\.)/.test(String(host)) ? 'http' : 'https')
  const origin = `${proto}://${host}`

  const results = await Promise.all([
    check('Database', async () => {
      const missing = []
      for (const t of TABLES) { const { error } = await supabase.from(t).select('*', { head: true, count: 'exact' }).limit(1); if (error) missing.push(t) }
      return missing.length ? { ok: false, detail: `These tables are missing or unreadable: ${missing.join(', ')}. Run the New Page SQL in Supabase.` } : { detail: 'All New Page tables are there.' }
    }),
    check('AI (Sky, writers, Compass)', async () => {
      if (!process.env.ANTHROPIC_API_KEY) return { ok: false, detail: 'ANTHROPIC_API_KEY is not set in Vercel.' }
      const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: COACH_MODEL(), max_tokens: 16, messages: [{ role: 'user', content: 'Say OK.' }] }) })
      if (!r.ok) { const j = await r.json().catch(() => ({})); return { ok: false, detail: `The AI service refused the test (HTTP ${r.status}): ${j?.error?.message || 'no reason given'}. Model: ${COACH_MODEL()}.` } }
      return { detail: `Answered using ${COACH_MODEL()}.` }
    }),
    check('Word-file builder (resume and cover letter)', async () => {
      const r = await fetch(`${origin}/api/newpage/docx`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'resume', token: signSession('00000000-0000-0000-0000-000000000000'), data: { name: 'Test Person', summary: 'A test.', contact: {}, experience: [], education: [], key_skills: ['Testing'] } }) })
      const text = await r.text()
      if (!r.ok) return { ok: false, detail: `The builder answered HTTP ${r.status}: ${text.slice(0, 160).replace(/\s+/g, ' ')}. If this is a 404 or 500, check the deploy log for api/newpage/docx.py.` }
      let j; try { j = JSON.parse(text) } catch { return { ok: false, detail: `The builder answered, but not in the expected form: ${text.slice(0, 120)}` } }
      return j.docx ? { detail: `Built a test document (${Math.round(j.docx.length * 0.75 / 1024)} KB).` } : { ok: false, detail: 'It answered but returned no document.' }
    }),
    check('Email (Resend)', async () => {
      const miss = ['RESEND_API_KEY', 'FROM_EMAIL', 'ADMIN_EMAIL'].filter(k => !process.env[k])
      return miss.length ? { ok: false, detail: `Not set in Vercel: ${miss.join(', ')}.` } : { detail: `Settings are present, sending from ${process.env.FROM_EMAIL}. (A test email isn’t sent here. Use “Send a test to me” below.)` }
    }),
    check('Private storage (encryption key)', async () => (cryptoReady() ? { detail: 'NEWPAGE_MEMORY_KEY is set.' } : { ok: false, detail: 'NEWPAGE_MEMORY_KEY is not set (or isn’t 32 bytes in base64). Sky can’t keep notes until it is.' })),
    check('Payments (Stripe)', async () => {
      const miss = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'].filter(k => !process.env[k])
      return miss.length ? { ok: false, detail: `Not set in Vercel: ${miss.join(', ')}.` } : { detail: 'Keys are present.' }
    }),
    check('Web address', async () => (process.env.NEXT_PUBLIC_URL === 'https://vikashan.org' ? { detail: 'NEXT_PUBLIC_URL is https://vikashan.org.' } : { ok: false, detail: `NEXT_PUBLIC_URL is “${process.env.NEXT_PUBLIC_URL || 'not set'}”. Email links use it, so it should be https://vikashan.org.` })),
    check('Daily jobs', async () => (process.env.CRON_SECRET ? { detail: 'CRON_SECRET is set.' } : { ok: false, detail: 'CRON_SECRET is not set, so the daily reminder and memory jobs can’t run.' }))
  ])
  res.json({ ok: results.every(r => r.ok), results })
}

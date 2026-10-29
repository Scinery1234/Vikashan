import crypto from 'node:crypto'
import { supabase } from '../../lib/supabase.js'
import { requireAdmin } from '../../lib/auth.js'

// Admin only. Scholarship codes: each works once and covers the whole program.
//   GET                       list every code and who used it
//   POST { action: 'more' }   make 5 more
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (!requireAdmin(req, res)) return

  if (req.method === 'POST' && (req.body || {}).action === 'more') {
    const rows = Array.from({ length: 5 }, () => {
      const h = crypto.randomBytes(6).toString('hex').toUpperCase()
      return { code: `NP-${h.slice(0, 4)}-${h.slice(4, 8)}-${h.slice(8, 12)}` }
    })
    const { error } = await supabase.from('newpage_codes').insert(rows)
    if (error) return res.status(500).json({ error: error.message })
  } else if (req.method !== 'GET') return res.status(405).end()

  const { data, error } = await supabase.from('newpage_codes').select('code, note, used_at, used_by_email, created_at').order('created_at', { ascending: true }).limit(500)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ codes: data })
}

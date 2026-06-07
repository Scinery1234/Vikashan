import { supabase } from '../lib/supabase.js'
import { requireAdmin } from '../lib/auth.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('site_content')
      .select('key, value')
    if (error) {
      console.error('site_content GET error:', error.message)
      return res.json({ content: {} }) // return empty rather than 500 so page still loads
    }
    const content = {}
    for (const row of (data || [])) content[row.key] = row.value
    return res.json({ content })
  }

  if (req.method === 'PUT') {
    if (!requireAdmin(req, res)) return
    const { content } = req.body
    if (!content || typeof content !== 'object') {
      return res.status(400).json({ error: 'content object required' })
    }
    const rows = Object.entries(content).map(([key, value]) => ({ key, value }))
    const { error } = await supabase
      .from('site_content')
      .upsert(rows, { onConflict: 'key' })
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ success: true })
  }

  res.status(405).end()
}

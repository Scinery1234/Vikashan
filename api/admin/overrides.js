import { supabase } from '../../lib/supabase.js'
import { requireAdmin } from '../../lib/auth.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (!requireAdmin(req, res)) return

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('available_overrides')
      .select('*')
      .gte('date', new Date().toISOString().slice(0, 10))
      .order('date')
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ overrides: data })
  }

  if (req.method === 'POST') {
    const { date, hours } = req.body
    if (!date || !hours?.length) return res.status(400).json({ error: 'date and hours required' })
    const rows = hours.map(h => ({ date, hour: h }))
    const { error } = await supabase
      .from('available_overrides')
      .upsert(rows, { onConflict: 'date,hour' })
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ success: true })
  }

  if (req.method === 'DELETE') {
    const { date } = req.body
    if (!date) return res.status(400).json({ error: 'date required' })
    const { error } = await supabase
      .from('available_overrides')
      .delete()
      .eq('date', date)
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ success: true })
  }

  res.status(405).end()
}

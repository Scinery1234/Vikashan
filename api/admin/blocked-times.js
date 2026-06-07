import { supabase } from '../../lib/supabase.js'
import { requireAdmin } from '../../lib/auth.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (!requireAdmin(req, res)) return

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('blocked_times')
      .select('*')
      .gte('date', new Date().toISOString().slice(0, 10))
      .order('date')
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ blockedTimes: data })
  }

  if (req.method === 'POST') {
    const { date, start_time, end_time, reason } = req.body
    if (!date) return res.status(400).json({ error: 'date required' })
    const { error } = await supabase.from('blocked_times').insert({
      date,
      start_time: start_time || null,
      end_time: end_time || null,
      reason: reason || null,
      source: 'manual'
    })
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ success: true })
  }

  if (req.method === 'DELETE') {
    const id = req.query.id
    if (!id) return res.status(400).json({ error: 'id required' })
    const { error } = await supabase
      .from('blocked_times')
      .delete()
      .eq('id', id)
      .eq('source', 'manual')
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ success: true })
  }

  res.status(405).end()
}

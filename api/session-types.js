import { supabase } from '../lib/supabase.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).end()

  const { data, error } = await supabase
    .from('session_types')
    .select('id, name, description, duration_mins, price_min_cents, price_max_cents, is_free')
    .eq('is_active', true)
    .or('members_only.is.null,members_only.eq.false')
    .order('is_free', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  res.json({ sessionTypes: data })
}

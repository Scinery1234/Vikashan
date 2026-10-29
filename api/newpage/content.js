import { supabase } from '../../lib/supabase.js'
import { requireAdmin } from '../../lib/auth.js'
import { refreshContent, listItems, prepareEdit, hasItem } from '../../lib/newpage-content.js'

// Admin only. The content editor at /newpage/admin/content.
//   GET                          every editable item: live text, original text, edited or not
//   POST { key, values }         save an edit (only fields that differ from the original are kept)
//   POST { key, reset: true }    back to the original
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (!requireAdmin(req, res)) return

  if (req.method === 'GET') {
    await refreshContent({ force: true })
    return res.json({ items: listItems() })
  }
  if (req.method !== 'POST') return res.status(405).end()

  const b = req.body || {}
  const key = typeof b.key === 'string' ? b.key : ''
  if (!hasItem(key)) return res.status(400).json({ error: 'Unknown item.' })

  let keep = {}
  if (!b.reset) {
    try { keep = prepareEdit(key, b.values) } catch (err) { return res.status(400).json({ error: err.message }) }
  }
  const q = Object.keys(keep).length
    ? supabase.from('newpage_content').upsert({ key, value: keep, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    : supabase.from('newpage_content').delete().eq('key', key)
  const { error } = await q
  if (error) { console.error('Content save failed:', error); return res.status(500).json({ error: 'We couldn’t save that. Please try again.' }) }
  await refreshContent({ force: true })
  res.json({ ok: true, item: listItems().find(i => i.key === key) })
}

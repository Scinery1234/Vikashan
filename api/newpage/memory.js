import { supabase } from '../../lib/supabase.js'
import { rateLimit } from '../../lib/security.js'
import { readToken } from '../../lib/newpage-auth.js'
import { exportMemory, eraseMemory } from '../../lib/newpage-memory-store.js'
import { RETENTION, DAY, endedAt, trashOn, purgeOn } from '../../lib/newpage-retention.js'

// The memory page, for someone whose membership has ended and who can't sign in.
// The link in the reminder emails carries a signed token that works only for
// this: see what is held, download it, or delete it for good.
//   POST { token, action: 'status' | 'export' | 'delete' }
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()
  if (!rateLimit(req, res, { max: 30, windowMs: 60 * 60 * 1000, key: 'np-memory-page' })) return
  const b = req.body || {}
  const p = readToken(b.token, 'memory')
  if (!p) return res.status(401).json({ error: 'That link has expired. Reply to any email from Vik and we’ll sort it out.', code: 'expired' })
  const { data: m } = await supabase.from('newpage_members').select('*').eq('id', p.sub).maybeSingle()
  if (!m) return res.status(404).json({ error: 'We couldn’t find that membership.' })

  const state = m.memory_state || 'active'
  if (b.action === 'status') {
    const ended = endedAt(m)
    return res.json({
      name: (m.name || '').split(' ')[0], state, hasAccess: m.status === 'active' && (!m.access_until || new Date(m.access_until).getTime() >= Date.now()),
      endedOn: ended ? new Date(ended).toISOString() : null,
      trashOn: ended && state === 'active' ? trashOn(ended).toISOString() : null,
      deletedOn: state === 'trash' && m.memory_trashed_at ? purgeOn(m.memory_trashed_at).toISOString() : null,
      rules: { remindDays: RETENTION.remindDays, trashDay: RETENTION.trashDay, purgeMonths: 12 }
    })
  }
  if (state === 'purged') return res.status(410).json({ error: 'That memory has already been deleted.', code: 'purged' })
  if (b.action === 'export') {
    // Even from the Trash, so they can take a copy before it's gone.
    return res.json({ export: await exportMemory(m, { inTrash: true }) })
  }
  if (b.action === 'delete') {
    if (b.confirm !== true) return res.status(400).json({ error: 'Please confirm.' })
    await eraseMemory(m.id, { state: 'purged' })
    return res.json({ ok: true })
  }
  res.status(400).json({ error: 'Unknown action.' })
}

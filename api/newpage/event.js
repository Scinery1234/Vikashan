import { supabase } from '../../lib/supabase.js'
import { rateLimit } from '../../lib/security.js'

// Funnel and drop-off tracking for the New Page quiz. No personal details:
// a random per-tab session id, the step, and the traffic source.
const EVENTS = new Set([
  'view', 'start', 'answer', 'result', 'safety_shown', 'personalise_open',
  'waitlist_click', 'buy_click', 'call_click', 'scholarship_open', 'personal_saved'
])
const QUADS = new Set(['recharge', 'explore', 'unstick', 'launch'])
const clip = (v, n) => (typeof v === 'string' ? v.slice(0, n) : null)

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()
  if (!rateLimit(req, res, { max: 300, windowMs: 60 * 60 * 1000, key: 'np-event' })) return

  let body = req.body
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = {} } }
  body = body || {}
  if (!EVENTS.has(body.event)) return res.status(400).json({ error: 'Unknown event' })

  const s = body.source || {}
  const { error } = await supabase.from('newpage_events').insert({
    session_id: clip(body.sessionId, 64),
    event: body.event,
    question: clip(body.question, 8),
    idx: Number.isInteger(body.index) ? body.index : null,
    quadrant: QUADS.has(body.quadrant) ? body.quadrant : null,
    place: clip(body.where, 20),
    utm_source: clip(s.utm_source, 100),
    utm_medium: clip(s.utm_medium, 100),
    utm_campaign: clip(s.utm_campaign, 100),
    ref: clip(s.ref, 200)
  })
  if (error) console.error('New Page event insert failed:', error.message)
  res.status(204).end()
}

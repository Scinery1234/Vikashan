// Sign-in for the New Page member app: an emailed link (valid 15 minutes)
// that swaps for a 30-day session token.
//
// Member tokens are signed with a secret derived from JWT_SECRET, never
// JWT_SECRET itself. The admin check (lib/auth.js requireAdmin) accepts any
// token signed with JWT_SECRET, so a member token signed with it would open
// the admin area.
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { supabase } from './supabase.js'
import { restoreMemoryAccess } from './newpage-memory-store.js'

const secret = () => crypto.createHmac('sha256', process.env.JWT_SECRET || '').update('newpage-member-v1').digest('hex')

export function signMagic(email, ttl = '15m') {
  return jwt.sign({ typ: 'magic', email }, secret(), { expiresIn: ttl })
}

// A link to the memory page for someone whose membership has ended (they can't sign in).
export function signMemory(memberId, ttl = '60d') {
  return jwt.sign({ typ: 'memory', sub: memberId }, secret(), { expiresIn: ttl })
}

// One-click "stop these emails" link in program emails.
export function signOptOut(memberId) {
  return jwt.sign({ typ: 'optout', sub: memberId }, secret(), { expiresIn: '400d' })
}

export function signSession(memberId) {
  return jwt.sign({ typ: 'session', sub: memberId }, secret(), { expiresIn: '30d' })
}

export function readToken(token, typ) {
  try {
    const p = jwt.verify(token, secret())
    return p.typ === typ ? p : null
  } catch {
    return null
  }
}

// Loads the signed-in member, or sends the right error and returns null.
export async function requireMember(req, res) {
  const auth = req.headers.authorization
  const payload = auth?.startsWith('Bearer ') ? readToken(auth.slice(7), 'session') : null
  if (!payload) { res.status(401).json({ error: 'Please sign in again.', code: 'signed_out' }); return null }
  const { data: member } = await supabase.from('newpage_members').select('*').eq('id', payload.sub).maybeSingle()
  if (!member) { res.status(401).json({ error: 'Please sign in again.', code: 'signed_out' }); return null }
  if (member.status !== 'active') {
    res.status(403).json({ error: member.status === 'paused' ? 'Your access is paused. Reply to any email from Vik to sort it out.' : 'Your New Page program has ended.', code: member.status })
    return null
  }
  if (member.access_until && new Date(member.access_until).getTime() < Date.now()) {
    res.status(403).json({ error: 'Your New Page access has ended. Reply to any email from Vik to renew.', code: 'expired' })
    return null
  }
  // Back after a gap (renewed, rejoined, or restored by Vik): Sky's memory comes back with them.
  if (member.access_ended_at || (member.memory_state && member.memory_state !== 'active')) {
    const { restored } = await restoreMemoryAccess(member)
    member.memoryRestored = restored
  }
  return member
}

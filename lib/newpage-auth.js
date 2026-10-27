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

const secret = () => crypto.createHmac('sha256', process.env.JWT_SECRET || '').update('newpage-member-v1').digest('hex')

export function signMagic(email) {
  return jwt.sign({ typ: 'magic', email }, secret(), { expiresIn: '15m' })
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
  return member
}

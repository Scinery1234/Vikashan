import { supabase } from './supabase.js'
import { grantMember } from './newpage-grant.js'
import { renewedUntil } from './newpage-members.js'
import { cleanHours } from './newpage-pricing.js'

const KINDS = { newpage_join: 'join', newpage_renew: 'renew', newpage_hours: 'hours' }

// Acts on a paid Stripe Checkout session: gives access, adds a month, or adds hours.
// Stripe may send the same event more than once; each session is acted on once.
// Throws if it fails, so Stripe tries again.
export async function applyCheckout(session) {
  const m = session.metadata || {}
  const kind = KINDS[m.kind]
  if (!kind || session.payment_status !== 'paid') return { ignored: true }

  const hours = cleanHours(m.hours) || 0
  const { data: claimed } = await supabase.from('newpage_payments')
    .upsert({ stripe_session_id: session.id, kind, email: (m.email || session.customer_email || '').toLowerCase() || null, amount_cents: session.amount_total ?? null, hours }, { onConflict: 'stripe_session_id', ignoreDuplicates: true })
    .select('id')
  if (!claimed || !claimed.length) return { duplicate: true }

  try {
    if (kind === 'join') {
      const email = (m.email || session.customer_email || '').toLowerCase()
      if (!email) throw new Error('No email on the payment')
      const r = await grantMember({ email, name: m.name || '', source: 'purchase', access: '4w', sessionsIncluded: 1 + hours, welcome: true })
      if (r.error) throw new Error(r.error)
      return { granted: email }
    }
    const { data: member } = await supabase.from('newpage_members').select('id, access_until, sessions_included').eq('id', m.memberId).maybeSingle()
    if (!member) throw new Error('Unknown member on the payment')
    const patch = kind === 'renew'
      ? { access_until: renewedUntil(member.access_until), sessions_included: (member.sessions_included ?? 1) + 1, status: 'active', access_ended_at: null, memory_reminder: 0, memory_state: 'active', memory_trashed_at: null }
      : { sessions_included: (member.sessions_included ?? 1) + hours }
    const { error } = await supabase.from('newpage_members').update(patch).eq('id', member.id)
    if (error) throw error
    await supabase.from('newpage_payments').update({ member_id: member.id }).eq('stripe_session_id', session.id)
    return { updated: member.id, kind }
  } catch (err) {
    await supabase.from('newpage_payments').delete().eq('stripe_session_id', session.id)
    throw err
  }
}

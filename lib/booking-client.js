import { supabase } from './supabase.js'

// Finds or creates the client for a booking. An existing client keeps their
// status (active, concession and so on): booking again must not turn them back
// into a "lead".
export async function ensureClient({ name, email, phone = null, mailingOptIn = false }) {
  const { data: existing } = await supabase.from('clients').select('*').eq('email', email).maybeSingle()
  if (existing) {
    const patch = { updated_at: new Date().toISOString() }
    if (name && !existing.name) patch.name = name
    if (phone && !existing.phone) patch.phone = phone
    if (mailingOptIn && !existing.mailing_opt_in) patch.mailing_opt_in = true
    const { data } = await supabase.from('clients').update(patch).eq('id', existing.id).select().single()
    return { client: { ...existing, ...(data || {}) }, existed: true }
  }
  const { data, error } = await supabase.from('clients').insert({ name, email, phone: phone || null, mailing_opt_in: !!mailingOptIn, status: 'lead' }).select().single()
  return { client: data, error, existed: false }
}

export const lookupClient = async email => (await supabase.from('clients').select('id, status, concession_rate_cents').eq('email', email).maybeSingle()).data || null

import { sendMail } from './newpage-mail.js'
import { supabase } from './supabase.js'
import { memberWelcomeEmail, APP_URL } from './newpage-emails.js'
import { signMagic } from './newpage-auth.js'
import { ACCESS } from './newpage-members.js'


// Gives someone access to New Page. Used by the admin page, by a scholarship
// code, and by a paid checkout. Safe to call twice for the same person.
//   sessionsIncluded: how many 1:1 sessions come with this grant
//   addToExisting: for someone already a member, add those sessions (false = leave their sessions alone)
// Returns { ok, quadrant, restored, welcomeSent } or { error }.
export async function grantMember({ email, name = '', source = 'manual', access = '4w', sessionsIncluded = 1, addToExisting = true, welcome = true }) {
  const { data: lead } = await supabase.from('newpage_leads')
    .select('id, name, quadrant, answers, personal').eq('email', email).eq('superseded', false)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()

  const until = ACCESS[access] ? new Date(Date.now() + ACCESS[access]).toISOString() : null
  const { data: existing } = await supabase.from('newpage_members').select('id, sessions_included').eq('email', email).maybeSingle()
  let error
  if (existing) {
    // Re-joining restores access without wiping their progress, and adds to their sessions.
    ;({ error } = await supabase.from('newpage_members').update({ status: 'active', source, name: name || lead?.name || null, access_until: until, sessions_included: addToExisting ? (existing.sessions_included ?? 0) + sessionsIncluded : (existing.sessions_included ?? 1) }).eq('id', existing.id))
  } else {
    ;({ error } = await supabase.from('newpage_members').insert({
      email, name: name || lead?.name || null, source, status: 'active',
      quadrant: lead?.quadrant || null, answers: lead?.answers || null, personal: lead?.personal || {}, lead_id: lead?.id || null,
      plan_started_at: new Date().toISOString(), access_until: until, sessions_included: sessionsIncluded
    }))
  }
  if (error) { console.error('Grant failed:', error); return { error: 'Could not save the member.' } }
  if (lead) await supabase.from('newpage_leads').update({ converted_at: new Date().toISOString() }).eq('id', lead.id)
  await supabase.from('clients').update({ status: 'active', updated_at: new Date().toISOString() }).eq('email', email)

  let welcomeSent = false
  if (welcome) {
    const link = `${APP_URL()}?t=${encodeURIComponent(signMagic(email, '7d'))}`
    const mail = memberWelcomeEmail({ name: name || lead?.name, link, hasPlan: !!lead?.quadrant })
    try {
      await sendMail({ from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`, to: email, reply_to: process.env.ADMIN_EMAIL, subject: mail.subject, html: mail.html })
      welcomeSent = true
    } catch (err) { console.error('Welcome email failed:', err) }
  }
  return { ok: true, quadrant: lead?.quadrant || null, restored: !!existing, created: !existing, welcomeSent }
}

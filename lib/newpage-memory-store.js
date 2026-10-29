// Export and erase everything Sky holds for a member: their chats, the notes
// Sky keeps, their resume, "about me" answers, private notes, shares, and the
// log of when Vik looked. The Compass, documents, tasks and progress are
// program records, not Sky's memory, and are left alone.
import { supabase } from './supabase.js'
import { openVault, openText, openJson } from './newpage-vault.js'
import { cleanAbout } from './newpage-context.js'

export async function exportMemory(member, { inTrash = false } = {}) {
  const v = await openVault(member, { inTrash })
  const mine = t => supabase.from(t).select('*').eq('member_id', member.id)
  const [msgs, mem, notes, shares, log, about, profile] = await Promise.all([
    mine('newpage_messages').order('id', { ascending: true }).limit(5000),
    mine('newpage_memory').order('created_at', { ascending: true }).limit(500),
    mine('newpage_notes').order('updated_at', { ascending: false }).limit(500),
    mine('newpage_shares').order('created_at', { ascending: false }).limit(200),
    mine('newpage_access_log').order('created_at', { ascending: false }).limit(200),
    mine('newpage_tools').eq('tool', 'about').maybeSingle(),
    mine('newpage_tools').eq('tool', 'profile').maybeSingle()
  ])
  const share = r => { try { return JSON.parse(openText(v, 'share', r.content)) } catch { return null } }
  return {
    generatedAt: new Date().toISOString(),
    about_this_file: 'Everything Sky holds about you, decrypted. Your Compass, documents, tasks and progress are separate and stay in your account.',
    member: { name: member.name || '', email: member.email },
    privacy: member.privacy || null,
    sky_learns: member.learn !== false,
    about_you: cleanAbout(openJson(v, 'tool:about', about.data?.data)),
    resume: openJson(v, 'tool:profile', profile.data?.data)?.text || '',
    notes_sky_keeps: (mem.data || []).map(m => ({ note: openText(v, 'mem', m.note), saved: m.created_at })),
    chats: (msgs.data || []).map(m => ({ focus: m.coach, role: m.role, said: openText(v, 'msg', m.content), at: m.created_at })),
    my_notes: (notes.data || []).map(n => ({ title: openText(v, 'note:title', n.title), body: openText(v, 'note:body', n.body), updated: n.updated_at })),
    shared_with_vik: (shares.data || []).map(s => ({ kind: s.kind, shared: s.created_at, content: share(s) })),
    times_vik_looked: (log.data || []).map(l => ({ what: l.what, at: l.created_at }))
  }
}

// Deletes the rows and the member's data key, which also makes any copy of
// those rows (in a backup, say) permanently unreadable.
//   state 'active': they keep using New Page and start fresh with a new key
//   state 'purged': membership ended and the 12 months in the trash are up
export async function eraseMemory(memberId, { state = 'active' } = {}) {
  for (const t of ['newpage_messages', 'newpage_memory', 'newpage_notes', 'newpage_shares', 'newpage_access_log']) {
    await supabase.from(t).delete().eq('member_id', memberId)
  }
  await supabase.from('newpage_tools').delete().eq('member_id', memberId).eq('tool', 'profile')
  await supabase.from('newpage_tools').delete().eq('member_id', memberId).eq('tool', 'about')
  const patch = { data_key: null }
  if (state === 'purged') Object.assign(patch, { privacy: null, memory_state: 'purged', memory_purged_at: new Date().toISOString() })
  await supabase.from('newpage_members').update(patch).eq('id', memberId)
}

// A member whose access is back: clear the clock, and bring their memory out of
// the Trash. If it was already deleted for good, they start fresh.
export async function restoreMemoryAccess(member) {
  const wasTrash = member.memory_state === 'trash'
  await supabase.from('newpage_members').update({ access_ended_at: null, memory_reminder: 0, memory_state: 'active', memory_trashed_at: null, memory_purged_at: null }).eq('id', member.id)
  Object.assign(member, { access_ended_at: null, memory_reminder: 0, memory_state: 'active', memory_trashed_at: null })
  return { restored: wasTrash }
}

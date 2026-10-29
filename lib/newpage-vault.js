// Opens a member's vault (see newpage-crypto.js): loads or creates their
// wrapped data key. Returns null when encryption isn't set up, or when the
// member's memory is in the trash or purged, so nothing can read it.
import { supabase } from './supabase.js'
import { cryptoReady, newWrappedKey, unwrapKey, makeVault, isEncrypted, UNREADABLE } from './newpage-crypto.js'

export { UNREADABLE }

export const memoryUsable = member => !member.memory_state || member.memory_state === 'active'

// `inTrash`: also open a vault for memory in the Trash, only so the member can download it.
export async function openVault(member, { create = false, inTrash = false } = {}) {
  if (!cryptoReady() || !(memoryUsable(member) || (inTrash && member.memory_state === 'trash'))) return null
  if (member._vault) return member._vault
  let wrapped = member.data_key
  if (!wrapped && create) {
    const fresh = newWrappedKey(member.id)
    await supabase.from('newpage_members').update({ data_key: fresh }).eq('id', member.id).is('data_key', null)
    // Another request may have won the race: read back whichever key was kept.
    const { data } = await supabase.from('newpage_members').select('data_key').eq('id', member.id).maybeSingle()
    wrapped = data?.data_key || fresh
    member.data_key = wrapped
  }
  if (!wrapped) return null
  try {
    member._vault = makeVault(member.id, unwrapKey(wrapped, member.id))
  } catch (err) {
    console.error('Could not unlock a member data key:', member.id, err.message)
    return null
  }
  return member._vault
}

// Helpers that fall back to plain text when there is no vault (encryption not
// switched on yet), and show UNREADABLE for anything that can't be opened.
export const sealText = (vault, field, s) => (vault ? vault.text(field, s) : s)
export function openText(vault, field, s) {
  if (typeof s !== 'string') return s
  try { return vault ? vault.read(field, s) : isEncrypted(s) ? UNREADABLE : s } catch { return UNREADABLE }
}
export const sealJson = (vault, field, o) => (vault ? vault.json(field, o) : o)
export function openJson(vault, field, v) {
  try { return vault ? vault.readJson(field, v) : v && typeof v === 'object' && v.enc ? null : v } catch { return null }
}

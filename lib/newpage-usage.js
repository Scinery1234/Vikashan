// Fair-use limits for the $25-a-month Sky and tools membership. Program
// members ($500) have no limits. Counted per calendar month, Sydney time.
import { supabase } from './supabase.js'

export const TOOLS_CAPS = { messages: 300, resumes: 3, covers: 10 }
export const isTools = member => member?.source === 'tools'

export const monthKey = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit' }).format(now).slice(0, 7)

const WHY = {
  messages: `Your membership includes ${TOOLS_CAPS.messages} messages to Sky a month, and you’ve used them all. They reset on the 1st. Reply to any email from us if you need more.`,
  resumes: `Your membership includes ${TOOLS_CAPS.resumes} resumes a month, and you’ve used them. They reset on the 1st.`,
  covers: `Your membership includes ${TOOLS_CAPS.covers} cover letters a month, and you’ve used them. They reset on the 1st.`
}

export async function usageFor(memberId, now = new Date()) {
  const { data } = await supabase.from('newpage_usage').select('kind, count').eq('member_id', memberId).eq('month', monthKey(now))
  const out = { messages: 0, resumes: 0, covers: 0 }
  for (const r of data || []) if (r.kind in out) out[r.kind] = r.count
  return out
}

// { ok, used, cap, why } for a tools member about to use `kind`.
export async function usageAllowance(member, kind, now = new Date()) {
  if (!isTools(member)) return { ok: true, unlimited: true }
  const used = (await usageFor(member.id, now))[kind] || 0
  const cap = TOOLS_CAPS[kind]
  return used >= cap ? { ok: false, used, cap, why: WHY[kind] } : { ok: true, used, cap }
}

export async function usageSpend(member, kind, now = new Date()) {
  if (!isTools(member)) return
  const month = monthKey(now)
  const { data } = await supabase.from('newpage_usage').select('count').eq('member_id', member.id).eq('month', month).eq('kind', kind).maybeSingle()
  await supabase.from('newpage_usage').upsert({ member_id: member.id, month, kind, count: (data?.count || 0) + 1 }, { onConflict: 'member_id,month,kind' })
}

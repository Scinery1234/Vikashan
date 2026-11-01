// The public demo of New Page. Anyone with the link gets a throwaway member
// for 24 hours, loaded with sample Launch content a couple of days in, so the
// screens aren't bare. No sign-in, no payments, no booking, no emails. What
// they type into the feedback box is the only thing kept.
import { supabase } from './supabase.js'
import { signSession } from './newpage-auth.js'

export const DEMO = {
  hours: 24,
  quadrant: 'launch',
  dayOffset: 1,                 // the demo starts on day 2
  caps: { messages: 10, docs: 2 }, // per demo visitor
  dailyCap: { messages: 400, docs: 60 }, // across all demo visitors, per day
  domain: 'demo.newpage.invalid'
}

export const isDemo = member => member?.source === 'demo'

// The sample answers of a Launch member: clear direction, plenty of energy.
export const DEMO_ANSWERS = { s1: 4, s3: 4, s5: 4, s7: 3, s2: 4, s4: 4, s6: 3, s8: 4, sit: 'employed', sat: 2, feel: 2 }

export const SAMPLE = {
  name: 'Sam',
  compass: {
    step: 4,
    values: ['Making a difference', 'Learning', 'Family', 'Fairness', 'Stability'],
    iAm: ['I am someone people come to when things are tangled', 'I am a steady pair of hands', 'I am curious about how systems work'],
    north: 'Work that untangles problems for people who don’t have time to fight the system, close enough to home that I’m there for dinner.',
    needs: { pay: '85000', hours: '38', stress: 'Moderate', mode: 'Mostly from home', location: 'Western Sydney', other: '' },
    strengths: { know: ['How government forms really work', 'Community services'], do: ['Explain hard things simply', 'Run a calm meeting', 'Write a clear email'], love: ['Helping someone get unstuck', 'Learning a new system'], other: [] },
    ideas: [], first: '', second: '', plan: { now: '', building: '', move: '', longer: '' }, actions: [], done: false
  },
  tasks: [
    { title: 'Write my target role in one line', due: 0, done: true },
    { title: 'Find three real job ads for policy officer roles', due: 1 },
    { title: 'Ask Priya what her week really looks like', due: 3 }
  ],
  goals: [{ title: 'Apply for a policy role by the end of the month', target: 28 }],
  notes: ['Wants a policy or program role in state government.', 'Family dinner at 6pm is a hard line; prefers mostly working from home.', 'Strong at explaining complex rules simply.'],
  chat: [
    { role: 'user', content: 'I think I want to move into policy work but I’m not sure my background counts.' },
    { role: 'assistant', content: 'It counts for more than you think. You’ve spent years explaining hard rules to people who were stressed, and that’s most of policy work. What’s the one part of your current job that already feels like policy?' }
  ],
  progress: [{ week: 1, step: 1 }]
}

const dayStr = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10)

// Makes a fresh demo member with the sample content, and returns a session token for it.
export async function createDemoMember({ code = null, seal = null } = {}) {
  const id = cryptoId()
  const start = new Date(Date.now() - DEMO.dayOffset * 864e5)
  const { data: m, error } = await supabase.from('newpage_members').insert({
    email: `${id}@${DEMO.domain}`, name: SAMPLE.name, source: 'demo', status: 'active',
    quadrant: DEMO.quadrant, answers: DEMO_ANSWERS, personal: {}, plan_started_at: start.toISOString(),
    access_until: new Date(Date.now() + DEMO.hours * 3600e3).toISOString(), sessions_included: 1,
    privacy: 'private', learn: true, program_emails: false, reminders: false, demo_code: code
  }).select('id').single()
  if (error || !m) throw new Error(error?.message || 'Could not create the demo')
  const mid = m.id
  const sealed = (field, text) => (seal ? seal(field, text) : text)
  await Promise.all([
    supabase.from('newpage_tools').insert({ member_id: mid, tool: 'compass', data: SAMPLE.compass }),
    supabase.from('newpage_tasks').insert(SAMPLE.tasks.map(t => ({ member_id: mid, title: t.title, due: dayStr(t.due), done: !!t.done, source: 'you' }))),
    supabase.from('newpage_goals').insert(SAMPLE.goals.map(g => ({ member_id: mid, title: g.title, target: dayStr(g.target) }))),
    supabase.from('newpage_memory').insert(SAMPLE.notes.map(n => ({ member_id: mid, note: sealed('mem', n) }))),
    supabase.from('newpage_messages').insert(SAMPLE.chat.map(c => ({ member_id: mid, coach: 'career', role: c.role, content: sealed('msg', c.content) }))),
    supabase.from('newpage_progress').insert(SAMPLE.progress.map(p => ({ member_id: mid, ...p })))
  ])
  return { id: mid, session: signSession(mid) }
}

function cryptoId() {
  return 'demo-' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6)
}

// How much of the AI a demo visitor has used, and whether they may use more.
export async function demoAllowance(memberId, kind) {
  const col = kind === 'docs' ? 'demo_docs' : 'demo_messages'
  const { data: m } = await supabase.from('newpage_members').select('demo_messages, demo_docs').eq('id', memberId).maybeSingle()
  const used = m?.[col] || 0
  const cap = DEMO.caps[kind]
  if (used >= cap) return { ok: false, used, cap, why: kind === 'docs' ? `The demo lets you make ${cap} documents. Join New Page for unlimited.` : `The demo lets you send Sky ${cap} messages. Join New Page to keep talking.` }
  const since = new Date(Date.now() - 864e5).toISOString()
  const { data: all } = await supabase.from('newpage_members').select('demo_messages, demo_docs').eq('source', 'demo').gte('created_at', since)
  const total = (all || []).reduce((t, r) => t + (r[col] || 0), 0)
  if (total >= DEMO.dailyCap[kind]) return { ok: false, used, cap, why: 'The demo is busy today. Please try again tomorrow, or join New Page.' }
  return { ok: true, used, cap }
}

export async function demoSpend(memberId, kind) {
  const col = kind === 'docs' ? 'demo_docs' : 'demo_messages'
  const { data: m } = await supabase.from('newpage_members').select(col).eq('id', memberId).maybeSingle()
  await supabase.from('newpage_members').update({ [col]: (m?.[col] || 0) + 1 }).eq('id', memberId)
}

// Removes demo members whose 24 hours are up. Everything they made goes with
// them (the tables cascade on delete). Feedback is kept.
export async function sweepDemos() {
  const { data } = await supabase.from('newpage_members').select('id').eq('source', 'demo').lt('access_until', new Date().toISOString())
  const ids = (data || []).map(r => r.id)
  if (ids.length) await supabase.from('newpage_members').delete().in('id', ids)
  return ids.length
}

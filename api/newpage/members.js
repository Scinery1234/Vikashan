import { supabase } from '../../lib/supabase.js'
import { requireAdmin } from '../../lib/auth.js'
import { grantMember } from '../../lib/newpage-grant.js'
import { renewedUntil } from '../../lib/newpage-members.js'
import { programPosition } from '../../lib/newpage-app.js'
import { cryptoReady } from '../../lib/newpage-crypto.js'
import { openVault, openText, openJson } from '../../lib/newpage-vault.js'
import { eraseMemory } from '../../lib/newpage-memory-store.js'
import { cleanAbout } from '../../lib/newpage-context.js'
import { endedAt, trashOn, purgeOn } from '../../lib/newpage-retention.js'
import { vikTaskEmail } from '../../lib/newpage-emails.js'
import { sendMail, fromAddress } from '../../lib/newpage-mail.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SOURCES = ['purchase', 'scholarship', 'manual']
const STATUSES = ['active', 'paused', 'ended']
const ID_RE = /^[0-9a-f-]{36}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

// What Vik may see of a member's chats and what Sky has learned, decided by the
// member's own privacy choice. Reading it is logged where the member can see it.
async function memberPrivacyView(row) {
  const level = row.privacy || null
  const state = row.memory_state || 'active'
  const ended = endedAt(row)
  const out = {
    level, learn: row.learn !== false, encryption: cryptoReady(), memoryState: state,
    endedOn: ended && row.status !== 'active' ? new Date(ended).toISOString() : null,
    trashOn: row.access_ended_at && state === 'active' ? trashOn(new Date(row.access_ended_at).getTime()).toISOString() : null,
    deleteOn: state === 'trash' && row.memory_trashed_at ? purgeOn(row.memory_trashed_at).toISOString() : null,
    shares: [], chats: null
  }
  if (state !== 'active') return out
  const v = await openVault(row)
  const dec = (f, s) => openText(v, f, s)
  const { data: shares } = await supabase.from('newpage_shares').select('id, kind, content, created_at').eq('member_id', row.id).order('created_at', { ascending: false }).limit(30)
  out.shares = !['share', 'all'].includes(level) ? [] : (shares || []).map(s => { let content = null; try { content = JSON.parse(dec('share', s.content)) } catch { /* unreadable */ } return { id: s.id, kind: s.kind, at: s.created_at, content } }).filter(s => s.content)
  if (level === 'all') {
    const [msgs, notes, about, profile] = await Promise.all([
      supabase.from('newpage_messages').select('coach, role, content, created_at').eq('member_id', row.id).order('id', { ascending: false }).limit(200),
      supabase.from('newpage_memory').select('note').eq('member_id', row.id).order('created_at', { ascending: true }).limit(100),
      supabase.from('newpage_tools').select('data').eq('member_id', row.id).eq('tool', 'about').maybeSingle(),
      supabase.from('newpage_tools').select('data').eq('member_id', row.id).eq('tool', 'profile').maybeSingle()
    ])
    out.chats = {
      messages: (msgs.data || []).reverse().map(m => ({ focus: m.coach, role: m.role, content: dec('msg', m.content), at: m.created_at })),
      notes: (notes.data || []).map(n => dec('mem', n.note)),
      about: cleanAbout(openJson(v, 'tool:about', about.data?.data)),
      resume: (openJson(v, 'tool:profile', profile.data?.data)?.text || '').slice(0, 12000)
    }
  }
  const what = out.chats ? 'chats and what Sky has learned' : out.shares.length ? 'what you shared' : null
  if (what) {
    // One line in the member's log per ten minutes, however often the panel is refreshed.
    const { data: last } = await supabase.from('newpage_access_log').select('what, created_at').eq('member_id', row.id).order('created_at', { ascending: false }).limit(1)
    if (!last?.[0] || last[0].what !== what || Date.now() - new Date(last[0].created_at).getTime() > 10 * 60 * 1000) await supabase.from('newpage_access_log').insert({ member_id: row.id, what })
  }
  return out
}

// Admin only. Gives someone access to the New Page app (later, the New Page
// checkout will do the same thing), and lists and updates members.
//   GET                                     list members
//   POST { email, name?, source?, welcome?, access? } grant access ('4w' default, '1m', '3m', 'none')
//   POST { id, status? }                    pause, end or restore a member
//   POST { id, renew: true }                a paid renewal: 1 more month and 1 more session
//   POST { id, accessUntil: 'YYYY-MM-DD'|null, sessionsIncluded? }
//   GET  ?detail=<id>                       one member: plan position, tasks, check-ins, coach notes
//   POST { id, addTask: { title, due?, start?, mins?, notify? } }   a task from Vik, optionally scheduled
//   POST { id, deleteTask: <task id> }      remove a task Vik added
//   POST { id, coachNotes: '...' }          Vik's private notes (never shown to the member)
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (!requireAdmin(req, res)) return

  if (req.method === 'GET' && req.query?.brief) {
    const id = String(req.query.brief)
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Unknown member.' })
    const { data: m } = await supabase.from('newpage_members').select('name, email').eq('id', id).maybeSingle()
    const { data: docs } = await supabase.from('newpage_docs').select('title, content, created_at').eq('member_id', id).eq('kind', 'brief').order('created_at', { ascending: false }).limit(1)
    return res.json({ member: m || null, brief: docs?.[0] || null })
  }
  if (req.method === 'GET' && req.query?.detail) {
    const id = String(req.query.detail)
    if (!ID_RE.test(id)) return res.status(400).json({ error: 'Unknown member.' })
    const { data: row } = await supabase.from('newpage_members').select('*').eq('id', id).maybeSingle()
    if (!row) return res.status(404).json({ error: 'Unknown member.' })
    const m = { id: row.id, email: row.email, name: row.name, status: row.status, source: row.source, quadrant: row.quadrant, plan_started_at: row.plan_started_at, last_login_at: row.last_login_at, access_until: row.access_until, sessions_included: row.sessions_included, coach_notes: row.coach_notes }
    const [tasks, checkins, progress, goals] = await Promise.all([
      supabase.from('newpage_tasks').select('id, title, due, done, source, block_start, block_mins, created_at').eq('member_id', id).order('created_at', { ascending: false }).limit(60),
      supabase.from('newpage_checkins').select('clarity, capacity, quadrant, created_at').eq('member_id', id).order('created_at', { ascending: false }).limit(5),
      supabase.from('newpage_progress').select('week, step').eq('member_id', id),
      supabase.from('newpage_goals').select('title, target, done').eq('member_id', id).order('created_at', { ascending: true }).limit(20)
    ])
    const privacy = await memberPrivacyView(row)
    const pos = programPosition(m.plan_started_at, Date.now())
    return res.json({ member: m, position: { week: pos.week, day: pos.day, complete: !!pos.complete }, stepsDone: (progress.data || []).length, tasks: tasks.data || [], checkins: checkins.data || [], goals: goals.data || [], privacy })
  }
  if (req.method === 'GET') {
    const { data, error } = await supabase.from('newpage_members')
      .select('id, email, name, status, source, quadrant, plan_started_at, last_login_at, session_booked, access_until, sessions_included, privacy, memory_state')
      .order('created_at', { ascending: false }).limit(200)
    if (error) return res.status(500).json({ error: error.message })
    const { data: used } = await supabase.from('bookings').select('newpage_member_id, status').not('newpage_member_id', 'is', null).neq('status', 'cancelled')
    const count = {}
    for (const b of used || []) count[b.newpage_member_id] = (count[b.newpage_member_id] || 0) + 1
    const { data: briefs } = await supabase.from('newpage_docs').select('member_id').eq('kind', 'brief')
    const hasBrief = new Set((briefs || []).map(b => b.member_id))
    return res.json({ encryption: cryptoReady(), members: data.map(m => ({ ...m, sessions_used: count[m.id] || 0, has_brief: hasBrief.has(m.id) })) })
  }
  if (req.method !== 'POST') return res.status(405).end()
  const b = req.body || {}

  if (b.id && (b.addTask || b.deleteTask || b.coachNotes !== undefined)) {
    if (!ID_RE.test(String(b.id))) return res.status(400).json({ error: 'Unknown member.' })
    const { data: m } = await supabase.from('newpage_members').select('id, email, name').eq('id', b.id).maybeSingle()
    if (!m) return res.status(404).json({ error: 'Unknown member.' })
    if (b.coachNotes !== undefined) {
      await supabase.from('newpage_members').update({ coach_notes: String(b.coachNotes || '').slice(0, 10000) }).eq('id', m.id)
      return res.json({ ok: true })
    }
    if (b.deleteTask) {
      if (!ID_RE.test(String(b.deleteTask))) return res.status(400).json({ error: 'Unknown task.' })
      await supabase.from('newpage_tasks').delete().eq('id', b.deleteTask).eq('member_id', m.id).eq('source', 'vik')
      return res.json({ ok: true })
    }
    const t = b.addTask && typeof b.addTask === 'object' ? b.addTask : {}
    const title = typeof t.title === 'string' ? t.title.trim().slice(0, 200) : ''
    if (!title) return res.status(400).json({ error: 'Write the task first.' })
    const due = DATE_RE.test(String(t.due)) ? t.due : null
    const start = due && TIME_RE.test(String(t.start)) ? t.start : null
    const mins = start && Number.isInteger(Number(t.mins)) && Number(t.mins) >= 5 && Number(t.mins) <= 600 ? Number(t.mins) : null
    const { data: task, error } = await supabase.from('newpage_tasks').insert({ member_id: m.id, title, due, block_start: start, block_mins: start ? mins || 30 : null, source: 'vik' }).select('id, title, due, done, source, block_start, block_mins, created_at').single()
    if (error) return res.status(500).json({ error: 'We couldn’t save that task.' })
    let emailed = false, emailError = null
    if (t.notify) {
      const mail = vikTaskEmail({ name: m.name, title, due, start, mins: start ? mins || 30 : null, note: typeof t.note === 'string' ? t.note.trim().slice(0, 500) : '' })
      try { await sendMail({ from: fromAddress(), to: m.email, reply_to: process.env.ADMIN_EMAIL, subject: mail.subject, html: mail.html }); emailed = true } catch (err) { console.error('Task email failed:', err); emailError = err.message }
    }
    return res.json({ ok: true, task, emailed, emailError })
  }

  if (b.id) {
    if (!ID_RE.test(String(b.id))) return res.status(400).json({ error: 'Unknown member.' })
    const patch = {}
    const RESTORE = { access_ended_at: null, memory_reminder: 0, memory_state: 'active', memory_trashed_at: null }
    if (b.eraseMemory === true) {
      await eraseMemory(b.id, { state: 'purged' })
      return res.json({ ok: true })
    }
    if (b.status !== undefined) {
      if (!STATUSES.includes(b.status)) return res.status(400).json({ error: 'Unknown status.' })
      patch.status = b.status
      // Ending someone starts the clock on their memory; bringing them back stops it.
      if (b.status === 'ended') Object.assign(patch, { access_ended_at: new Date().toISOString(), memory_reminder: 0 })
      if (b.status === 'active') Object.assign(patch, RESTORE)
    }
    if (b.renew) {
      const { data: m } = await supabase.from('newpage_members').select('access_until, sessions_included').eq('id', b.id).maybeSingle()
      if (!m) return res.status(404).json({ error: 'Unknown member.' })
      patch.access_until = renewedUntil(m.access_until)
      patch.sessions_included = (m.sessions_included ?? 1) + 1
      patch.status = 'active'
      Object.assign(patch, RESTORE)
    }
    if (b.accessUntil !== undefined) {
      if (b.accessUntil !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(b.accessUntil))) return res.status(400).json({ error: 'Use a date like 2026-12-31.' })
      patch.access_until = b.accessUntil ? new Date(`${b.accessUntil}T23:59:59+11:00`).toISOString() : null
    }
    if (b.sessionsIncluded !== undefined) {
      const n = Number(b.sessionsIncluded)
      if (!Number.isInteger(n) || n < 0 || n > 50) return res.status(400).json({ error: 'Sessions must be a whole number from 0 to 50.' })
      patch.sessions_included = n
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to change.' })
    const { error } = await supabase.from('newpage_members').update(patch).eq('id', b.id)
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ ok: true, ...(patch.access_until !== undefined ? { accessUntil: patch.access_until } : {}) })
  }

  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase().slice(0, 200) : ''
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email.' })
  const name = typeof b.name === 'string' ? b.name.trim().slice(0, 80) : ''
  const source = SOURCES.includes(b.source) ? b.source : 'manual'
  const r = await grantMember({ email, name, source, access: b.access || '4w', sessionsIncluded: 1, addToExisting: false, welcome: b.welcome !== false })
  if (r.error) return res.status(500).json({ error: r.error })
  res.json({ ok: true, welcomeSent: b.welcome !== false ? r.welcomeSent : false, quadrant: r.quadrant, restored: r.restored })
}

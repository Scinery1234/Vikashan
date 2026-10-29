import { supabase } from '../../lib/supabase.js'
import { requireAdmin } from '../../lib/auth.js'
import { grantMember } from '../../lib/newpage-grant.js'
import { renewedUntil } from '../../lib/newpage-members.js'
import { programPosition } from '../../lib/newpage-app.js'
import { vikTaskEmail } from '../../lib/newpage-emails.js'
import { sendMail, fromAddress } from '../../lib/newpage-mail.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SOURCES = ['purchase', 'scholarship', 'manual']
const STATUSES = ['active', 'paused', 'ended']
const ID_RE = /^[0-9a-f-]{36}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

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
    const { data: m } = await supabase.from('newpage_members').select('id, email, name, status, source, quadrant, plan_started_at, last_login_at, access_until, sessions_included, coach_notes').eq('id', id).maybeSingle()
    if (!m) return res.status(404).json({ error: 'Unknown member.' })
    const [tasks, checkins, progress, goals] = await Promise.all([
      supabase.from('newpage_tasks').select('id, title, due, done, source, block_start, block_mins, created_at').eq('member_id', id).order('created_at', { ascending: false }).limit(60),
      supabase.from('newpage_checkins').select('clarity, capacity, quadrant, created_at').eq('member_id', id).order('created_at', { ascending: false }).limit(5),
      supabase.from('newpage_progress').select('week, step').eq('member_id', id),
      supabase.from('newpage_goals').select('title, target, done').eq('member_id', id).order('created_at', { ascending: true }).limit(20)
    ])
    const pos = programPosition(m.plan_started_at, Date.now())
    return res.json({ member: m, position: { week: pos.week, day: pos.day, complete: !!pos.complete }, stepsDone: (progress.data || []).length, tasks: tasks.data || [], checkins: checkins.data || [], goals: goals.data || [] })
  }
  if (req.method === 'GET') {
    const { data, error } = await supabase.from('newpage_members')
      .select('id, email, name, status, source, quadrant, plan_started_at, last_login_at, session_booked, access_until, sessions_included')
      .order('created_at', { ascending: false }).limit(200)
    if (error) return res.status(500).json({ error: error.message })
    const { data: used } = await supabase.from('bookings').select('newpage_member_id, status').not('newpage_member_id', 'is', null).neq('status', 'cancelled')
    const count = {}
    for (const b of used || []) count[b.newpage_member_id] = (count[b.newpage_member_id] || 0) + 1
    const { data: briefs } = await supabase.from('newpage_docs').select('member_id').eq('kind', 'brief')
    const hasBrief = new Set((briefs || []).map(b => b.member_id))
    return res.json({ members: data.map(m => ({ ...m, sessions_used: count[m.id] || 0, has_brief: hasBrief.has(m.id) })) })
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
    if (b.status !== undefined) {
      if (!STATUSES.includes(b.status)) return res.status(400).json({ error: 'Unknown status.' })
      patch.status = b.status
    }
    if (b.renew) {
      const { data: m } = await supabase.from('newpage_members').select('access_until, sessions_included').eq('id', b.id).maybeSingle()
      if (!m) return res.status(404).json({ error: 'Unknown member.' })
      patch.access_until = renewedUntil(m.access_until)
      patch.sessions_included = (m.sessions_included ?? 1) + 1
      patch.status = 'active'
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
